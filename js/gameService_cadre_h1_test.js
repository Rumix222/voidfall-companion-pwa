// Test fumée node --test — GameService.appliquerCadreChoixCorruptionGloire /
// appliquerCadreChoixRappelCube (Événement H, Cycle 1, Cadre 1 "Droit en
// enfer" — options { gain: { corruption:1, gloire:1 } } et
// { recall: { cube:1 } }, vocabulaire inédit dans le reste du catalogue).
// Mock DB minimal en mémoire (vm), même principe que
// gameService_cadre_gain_corruption_test.js — demanderChoix est ici un
// simple mock qui ne persiste rien lui-même (la vraie persistance
// secteur/piste/techno/rappel vit dans strategieService.js, hors
// périmètre de ce test comme pour 'gagner_corruption').
//
// ⚠️ Comparaisons de tableaux renvoyés par le code chargé en vm :
// JSON.stringify plutôt qu'assert.deepStrictEqual (voir
// secteurService_actions.test.js pour l'explication du "realm" vm).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

var OPTION_CORRUPTION_GLOIRE = { gain: { corruption: 1, gloire: 1 } };
var OPTION_RECALL_CUBE = { recall: { cube: 1 } };

function creerFixture_(options, gloireDepart) {
  var evenementCycle1 = {
    code: 'H', cycle: 1, cadres: [
      {
        ordre: 1, obligatoire: true, resolution: 'par_joueur',
        texte: 'Gagnez une Corruption pour gagner un jeton Gloire de valeur 1 ou rappeler 1 cube.',
        effet: { type: 'choix', mode: 'exclusif', options: options }
      }
    ],
    cadresAppliques: {}
  };

  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-08-23', archivee: false, scenarioId: 'scn1',
    cycleNum: 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: evenementCycle1, cycle2: null, cycle3: null } }
  };
  var lignePlateauMaison = {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [],
    gloire: gloireDepart || [null, null, null, null, null],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}, civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false
  };
  return { lignePartie: lignePartie, lignePlateauMaison: lignePlateauMaison };
}

function creerSandbox_(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;

  var DB = {
    get: function (table, cle) {
      if (table === 'parties') return Promise.resolve(parties[cle]);
      if (table === 'plateauMaison') return Promise.resolve(plateauMaison[cle]);
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'parties') parties[ligne.id] = ligne;
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = ligne;
      return Promise.resolve(ligne);
    },
    getAll: function () { return Promise.resolve([]); }
  };

  var sandbox = {
    DB: DB, console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });
  return { sandbox: sandbox, parties: parties, plateauMaison: plateauMaison };
}

// ---------------------------------------------------------------
// appliquerCadreChoixCorruptionGloire
// ---------------------------------------------------------------

test('appliquerCadreChoixCorruptionGloire : succès — Corruption placée (popup) + Gloire au 1er emplacement libre', function () {
  var ctx = creerSandbox_(creerFixture_([OPTION_CORRUPTION_GLOIRE, OPTION_RECALL_CUBE]));
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_corruption');
    assert.strictEqual(contexte.partieId, PARTIE_ID);
    assert.strictEqual(JSON.stringify(contexte.ciblesAutorisees), JSON.stringify(['secteur', 'piste', 'programme', 'techno']));
    return { detail: 'Corruption placée sur le Secteur 3.' };
  };

  return GameService.appliquerCadreChoixCorruptionGloire(PARTIE_ID, 1, 1, 0, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
    assert.strictEqual(
      partieMaj.evenements.cycle1.cadresAppliques[1].resume,
      'Corruption placée sur le Secteur 3. Jeton Gloire (valeur 1) gagné.'
    );
    assert.strictEqual(JSON.stringify(partieMaj.plateauMaison.gloire), JSON.stringify([1, null, null, null, null]));

    return GameService.appliquerCadreChoixCorruptionGloire(PARTIE_ID, 1, 1, 0, demanderChoix).then(
      function () { throw new Error('aurait dû rejeter (déjà appliqué)'); },
      function (erreur) { assert.ok(/déjà été appliqué/.test(erreur.message)); }
    );
  });
});

test('appliquerCadreChoixCorruptionGloire : 5 emplacements Gloire déjà occupés — Corruption placée quand même, jeton Gloire signalé manquant', function () {
  var ctx = creerSandbox_(creerFixture_([OPTION_CORRUPTION_GLOIRE], [1, 2, 3, 4, 5]));
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function () { return { detail: 'Corruption placée sur la piste Société.' }; };

  return GameService.appliquerCadreChoixCorruptionGloire(PARTIE_ID, 1, 1, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(
      partieMaj.evenements.cycle1.cadresAppliques[1].resume,
      'Corruption placée sur la piste Société. Aucun emplacement Gloire libre — jeton Gloire à ajouter manuellement.'
    );
    assert.strictEqual(JSON.stringify(partieMaj.plateauMaison.gloire), JSON.stringify([1, 2, 3, 4, 5]));
  });
});

test('appliquerCadreChoixCorruptionGloire : Annuler la popup — {annule:true}, cadre PAS marqué appliqué', function () {
  var ctx = creerSandbox_(creerFixture_([OPTION_CORRUPTION_GLOIRE]));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixCorruptionGloire(PARTIE_ID, 1, 1, 0, function () { return { annule: true }; })
    .then(function (resultat) {
      assert.strictEqual(resultat.annule, true);
      return ctx.sandbox.DB.get('parties', PARTIE_ID);
    })
    .then(function (lignePartie) {
      assert.strictEqual(lignePartie.etatJson.evenements.cycle1.cadresAppliques[1], undefined);
    });
});

test('appliquerCadreChoixCorruptionGloire : option qui ne correspond pas EXACTEMENT au gabarit — rejette', function () {
  var ctx = creerSandbox_(creerFixture_([{ gain: { corruption: 2, gloire: 1 } }]));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixCorruptionGloire(PARTIE_ID, 1, 1, 0, function () {
    throw new Error('demanderChoix ne devrait pas être appelé');
  }).then(
    function () { throw new Error('aurait dû rejeter (gabarit non reconnu)'); },
    function (erreur) { assert.ok(/non automatisable/.test(erreur.message)); }
  );
});

// ---------------------------------------------------------------
// appliquerCadreChoixRappelCube
// ---------------------------------------------------------------

test('appliquerCadreChoixRappelCube : succès — cadre marqué appliqué avec le résumé de la popup', function () {
  var ctx = creerSandbox_(creerFixture_([OPTION_CORRUPTION_GLOIRE, OPTION_RECALL_CUBE]));
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'rappeler_cube');
    assert.strictEqual(contexte.partieId, PARTIE_ID);
    return { detail: 'Cube de Corvette rappelé depuis le Secteur 2.' };
  };

  return GameService.appliquerCadreChoixRappelCube(PARTIE_ID, 1, 1, 1, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
    assert.strictEqual(partieMaj.evenements.cycle1.cadresAppliques[1].resume, 'Cube de Corvette rappelé depuis le Secteur 2.');

    return GameService.appliquerCadreChoixRappelCube(PARTIE_ID, 1, 1, 1, demanderChoix).then(
      function () { throw new Error('aurait dû rejeter (déjà appliqué)'); },
      function (erreur) { assert.ok(/déjà été appliqué/.test(erreur.message)); }
    );
  });
});

test('appliquerCadreChoixRappelCube : Annuler la popup — {annule:true}, cadre PAS marqué appliqué', function () {
  var ctx = creerSandbox_(creerFixture_([OPTION_RECALL_CUBE]));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixRappelCube(PARTIE_ID, 1, 1, 0, function () { return { annule: true }; })
    .then(function (resultat) {
      assert.strictEqual(resultat.annule, true);
      return ctx.sandbox.DB.get('parties', PARTIE_ID);
    })
    .then(function (lignePartie) {
      assert.strictEqual(lignePartie.etatJson.evenements.cycle1.cadresAppliques[1], undefined);
    });
});

test('appliquerCadreChoixRappelCube : option qui ne correspond pas EXACTEMENT au gabarit — rejette', function () {
  var ctx = creerSandbox_(creerFixture_([{ recall: { cube: 2 } }]));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixRappelCube(PARTIE_ID, 1, 1, 0, function () {
    throw new Error('demanderChoix ne devrait pas être appelé');
  }).then(
    function () { throw new Error('aurait dû rejeter (gabarit non reconnu)'); },
    function (erreur) { assert.ok(/non automatisable/.test(erreur.message)); }
  );
});
