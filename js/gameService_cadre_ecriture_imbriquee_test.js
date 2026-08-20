// Test fumée node --test — régression pour le correctif "retour
// utilisateur, EVOLUTION 7 KO : je ne vois pas l'effet de l'avancement
// de la piste civilisation dans l'onglet plateau maison". Reproduit le
// bug identifié : GameService.appliquerCadreChoixFocusEngine capturait
// une ligne `plateauMaison` AVANT FocusEngine.resoudreEffet, puis la
// réécrivait telle quelle (DB.put) à la fin — écrasant toute écriture
// DIRECTE faite sur plateauMaison PENDANT la résolution par une popup
// imbriquée (avancer_civilisation — EVOLUTION 7 ; retirer_corruption,
// option Technologie — EVOLUTION 5 ; toutes deux persistent elles-mêmes
// via GameService.majPlateauMaison/majCivilisation, lecture-fusion-
// écriture). Ce test simule directement une telle écriture imbriquée
// (sans charger civilisationService.js, hors périmètre ici) via un
// `demanderChoix` factice qui écrit sur plateauMaison avant de résoudre,
// exactement comme le ferait la vraie popup (strategieService.js).
// Même mock DB minimal en mémoire (vm, pas de dépendance npm) que
// test_gameService_cadreChoixCube.js.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerFixture_(optionsCadre) {
  var evenementCycle1 = {
    code: 'E', cycle: 1, cadres: [
      {
        ordre: 2, obligatoire: false, resolution: 'par_joueur',
        texte: 'Avancez sur une piste de Civilisation.',
        effet: { type: 'choix', mode: 'unique', options: optionsCadre }
      }
    ],
    cadresAppliques: {}
  };

  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-08-20', archivee: false, scenarioId: 'scn1',
    cycleNum: 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: evenementCycle1, cycle2: null, cycle3: null } }
  };
  var lignePlateauMaison = {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false,
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}
  };
  return { lignePartie: lignePartie, lignePlateauMaison: lignePlateauMaison };
}

function creerSandbox_(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;

  var DB = {
    get: function (table, cle) {
      // Clone à chaque lecture — reproduit fidèlement le comportement
      // d'IndexedDB (structured clone), indispensable ici : SANS ce
      // clone, deux DB.get() successifs renverraient la MÊME référence
      // d'objet et masqueraient artificiellement le bug (une mutation
      // faite via l'un serait "vue" par l'autre alors qu'en réalité,
      // dans l'app réelle, il s'agit de 2 lectures indépendantes).
      if (table === 'parties') return Promise.resolve(parties[cle] ? JSON.parse(JSON.stringify(parties[cle])) : parties[cle]);
      if (table === 'plateauMaison') return Promise.resolve(plateauMaison[cle] ? JSON.parse(JSON.stringify(plateauMaison[cle])) : plateauMaison[cle]);
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'parties') parties[ligne.id] = JSON.parse(JSON.stringify(ligne));
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = JSON.parse(JSON.stringify(ligne));
      return Promise.resolve(ligne);
    },
    getAll: function () { return Promise.resolve([]); }
  };

  var sandbox = {
    DB: DB, console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/focusEngine.js', 'utf8'), sandbox, { filename: 'focusEngine.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });

  return { sandbox: sandbox, plateauMaison: plateauMaison, parties: parties };
}

test('appliquerCadreChoixFocusEngine (avancer_civilisation) : une écriture DIRECTE sur plateauMaison faite par la popup imbriquée n\u2019est PAS écrasée par l\u2019écriture finale du cadre', function () {
  var ctx = creerSandbox_(creerFixture_([{ cle: 'avancer_civilisation', valeur: 1 }]));
  var GameService = ctx.sandbox.GameService;

  // Simule exactement ce que fait la vraie popup 'avancer_civilisation'
  // (strategieService.js -> CivilisationService.avancerPiste) : elle
  // écrit DIRECTEMENT sur plateauMaison (lecture-fusion-écriture) AVANT
  // de résoudre la Promise de demanderChoix.
  var demanderChoixAvancerCivilisation = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    return ctx.sandbox.DB.get('plateauMaison', PARTIE_ID).then(function (ligne) {
      ligne.civGouvernement = 1;
      ligne.cubeActif = ligne.cubeActif + 1;
      ligne.ressourceCredit = ligne.ressourceCredit + 1;
      ligne.ressourceScience = ligne.ressourceScience + 1;
      return ctx.sandbox.DB.put('plateauMaison', ligne);
    }).then(function () {
      return { detail: 'Piste Gouvernement : niveau 0 \u2192 1 \u2014 Activez 1 cube, gagnez 1 Crédit et 1 Science.' };
    });
  };

  return GameService.appliquerCadreChoixFocusEngine(PARTIE_ID, 1, 2, 0, demanderChoixAvancerCivilisation)
    .then(function (partieMaj) {
      assert.strictEqual(partieMaj.civilisation.gouvernement, 1, 'niveau de piste écrit par la popup imbriquée : ne doit pas être écrasé (bug initial)');
      assert.strictEqual(partieMaj.plateauMaison.cubeActif, 4, '3 (initial) + 1 (popup imbriquée)');
      assert.strictEqual(partieMaj.plateauMaison.ressources.credit, 6, '5 (initial) + 1 (popup imbriquée)');
      assert.strictEqual(partieMaj.plateauMaison.ressources.science, 6, '5 (initial) + 1 (popup imbriquée)');
      assert.ok(partieMaj.evenements.cycle1.cadresAppliques[2]);
    });
});

test('appliquerCadreChoixFocusEngine : cadre AVEC coût (mutations non vides) — écriture finale toujours correcte (lecture-fusion-écriture, pas de régression)', function () {
  var ctx = creerSandbox_(creerFixture_([{ cle: 'activer_cube', valeur: 1 }]));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixFocusEngine(PARTIE_ID, 1, 2, 0, function () {
    throw new Error('demanderChoix ne devrait pas être appelé pour activer_cube');
  }).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.cubeActif, 4, 'cubeActif doit passer de 3 à 4');
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[2]);
  });
});
