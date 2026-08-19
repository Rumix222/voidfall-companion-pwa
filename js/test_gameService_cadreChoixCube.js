// Test fumée node --test pour GameService.appliquerCadreChoixCube (Cadre 3
// générique, Événement B Cycle 1 — "activer 1 cube / déployer 1 cube sur le
// Secteur-Mère") — mock DB minimal en mémoire (vm, pas de dépendance npm),
// même principe que test_secteurService_placement.js. Charge le VRAI
// focusEngine.js (moteur pur, aucune dépendance à DB) : c'est lui qui fait
// foi pour le débit de cubeActif, gameService.js ne doit rien recalculer.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerFixtureBase() {
  var evenementCycle1 = {
    code: 'B', cycle: 1, cadres: [
      {
        ordre: 3, obligatoire: false, resolution: 'par_joueur',
        texte: "Chaque joueur peut soit activer 1 cube, soit déployer 1 cube sur son Secteur-Mère.",
        effet: {
          type: 'choix', mode: 'exclusif',
          options: [
            { cle: 'activer_cube', valeur: 1 },
            { cle: 'deployer_cube', valeur: 1, cible: 'secteur_mere' }
          ]
        }
      }
    ],
    cadresAppliques: {}
  };

  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-08-18', archivee: false, scenarioId: 'scn1',
    cycleNum: 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: evenementCycle1, cycle2: null, cycle3: null } }
  };
  var lignePlateauMaison = {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}
  };
  return { lignePartie: lignePartie, lignePlateauMaison: lignePlateauMaison };
}

function creerSandbox(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;
  var historique = [];

  var DB = {
    get: function (table, cle) {
      if (table === 'parties') return Promise.resolve(parties[cle]);
      if (table === 'plateauMaison') return Promise.resolve(plateauMaison[cle]);
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'parties') parties[ligne.id] = ligne;
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = ligne;
      if (table === 'historique') historique.push(ligne);
      return Promise.resolve(ligne);
    },
    getAll: function () { return Promise.resolve([]); }
  };

  var sandbox = {
    DB: DB, console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);

  var codeFocusEngine = fs.readFileSync(__dirname + '/focusEngine.js', 'utf8');
  vm.runInContext(codeFocusEngine, sandbox, { filename: 'focusEngine.js' });

  var codeGameService = fs.readFileSync(__dirname + '/gameService.js', 'utf8');
  vm.runInContext(codeGameService, sandbox, { filename: 'gameService.js' });

  return { sandbox: sandbox, plateauMaison: plateauMaison, parties: parties };
}

test('Cadre 3 — activer 1 cube (pas de popup imbriquée)', function () {
  var ctx = creerSandbox(creerFixtureBase());
  var GameService = ctx.sandbox.GameService;

  var demanderChoixFactice = function () { throw new Error('demanderChoix ne devrait pas être appelé pour activer_cube'); };

  return GameService.appliquerCadreChoixCube(PARTIE_ID, 1, 3, 0, demanderChoixFactice)
    .then(function (partieMaj) {
      assert.strictEqual(partieMaj.plateauMaison.cubeActif, 4, 'cubeActif doit passer de 3 à 4');
      assert.ok(partieMaj.evenements.cycle1.cadresAppliques[3], 'le cadre doit être marqué appliqué');
      assert.ok(/cube/i.test(partieMaj.evenements.cycle1.cadresAppliques[3].resume), 'le résumé doit mentionner le cube');
      // Deuxième appel => doit échouer (déjà appliqué)
      return GameService.appliquerCadreChoixCube(PARTIE_ID, 1, 3, 0, demanderChoixFactice).then(
        function () { throw new Error('aurait dû rejeter (déjà appliqué)'); },
        function (erreur) { assert.ok(/déjà été appliqué/.test(erreur.message)); }
      );
    });
});

test('Cadre 3 — déployer 1 cube sur le Secteur-Mère (popup imbriquée annulée => {annule:true}, pas d\'erreur)', function () {
  var ctx = creerSandbox(creerFixtureBase());
  var GameService = ctx.sandbox.GameService;

  var demanderChoixAnnule = function (contexte) {
    assert.strictEqual(contexte.type, 'deployer_cube');
    assert.strictEqual(contexte.mode, 'secteur_mere');
    assert.strictEqual(contexte.quantiteDemandee, 1);
    return Promise.resolve({ annule: true });
  };

  return GameService.appliquerCadreChoixCube(PARTIE_ID, 1, 3, 1, demanderChoixAnnule)
    .then(function (resultat) {
      assert.strictEqual(resultat.annule, true);
      // Le cadre ne doit PAS être marqué appliqué après une annulation
      return ctx.sandbox.DB.get('parties', PARTIE_ID);
    })
    .then(function (lignePartie) {
      assert.strictEqual(lignePartie.etatJson.evenements.cycle1.cadresAppliques[3], undefined);
    });
});

test('Cadre 3 — déployer 1 cube sur le Secteur-Mère (validé => cubeActif débité, coût ressource si applicable)', function () {
  var ctx = creerSandbox(creerFixtureBase());
  var GameService = ctx.sandbox.GameService;

  var demanderChoixValide = function (contexte) {
    assert.strictEqual(contexte.mode, 'secteur_mere');
    return Promise.resolve({ totalCubes: 1, coutParRessource: {}, detail: '1× Corvette → Secteur 7', mouvements: [] });
  };

  return GameService.appliquerCadreChoixCube(PARTIE_ID, 1, 3, 1, demanderChoixValide)
    .then(function (partieMaj) {
      assert.strictEqual(partieMaj.plateauMaison.cubeActif, 2, 'cubeActif doit passer de 3 à 2 (1 cube déployé)');
      assert.ok(partieMaj.evenements.cycle1.cadresAppliques[3]);
    });
});

test('cleFocusEnginePourOptionCadre_ (indirect, via appliquerCadreChoixCube) — option inconnue rejetée', function () {
  var fixture = creerFixtureBase();
  fixture.lignePartie.etatJson.evenements.cycle1.cadres[0].effet.options.push({ cle: 'autre_chose', valeur: 1 });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixCube(PARTIE_ID, 1, 3, 2, function () { return Promise.resolve({}); }).then(
    function () { throw new Error('aurait dû rejeter (option non reconnue)'); },
    function (erreur) { assert.ok(/Option de cube introuvable/.test(erreur.message)); }
  );
});
