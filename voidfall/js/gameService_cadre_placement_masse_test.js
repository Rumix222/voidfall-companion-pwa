// Test fumée node --test pour GameService.appliquerCadrePlacementEnMasse/
// previsualiserCadrePlacementEnMasse (chantier "Cadres placement en
// masse", 14/09/2026) — cadres "placement" à zone GALAXIE ENTIÈRE (ex.
// Événement J Cycle 2 "Placez un Gardien sur chaque Faille."), distincts
// des cadres "placement"/zone "secteur_neant_adjacent" déjà couverts par
// gameService_cadre_placement_choix_test.js. Charge les VRAIS
// secteurService.js + gameService.js, mock DB minimal en mémoire (vm,
// pas de dépendance npm), même principe que ce dernier fichier.
//
// ⚠️ Comparaisons de tableaux/objets créés en vm : JSON.stringify plutôt
// qu'assert.deepStrictEqual (voir secteurService_actions_test.js).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerCadreMasse_(zone, elements) {
  return {
    ordre: 1, obligatoire: true, resolution: null,
    texte: 'Placez un Gardien sur chaque Faille.',
    effet: { type: 'placement', zone: zone, elements: elements }
  };
}

function creerSandbox_() {
  var stores = {
    parties: {}, plateauMaison: {}, secteursPartie: {},
    scenarioSecteurs: {}, typesSecteur: {}, scenarioAdjacences: {}, historique: {}
  };
  var prochainIdHistorique = 1;
  function cleDe_(nom, valeur) {
    if (nom === 'parties' || nom === 'plateauMaison') return valeur.partieId || valeur.id;
    if (nom === 'secteursPartie') return valeur.partieId + '|' + valeur.numero;
    if (nom === 'scenarioSecteurs') return valeur.scenarioId + '|' + valeur.numero;
    if (nom === 'typesSecteur') return valeur.id;
    if (nom === 'scenarioAdjacences') return valeur.scenarioId + '|' + valeur.numeroA + '|' + valeur.numeroB;
    if (nom === 'historique') return prochainIdHistorique++;
    return valeur.id;
  }
  var DB = {
    get: function (nom, cle) {
      if (nom === 'plateauMaison' || nom === 'parties') return Promise.resolve(stores[nom][cle] || null);
      var cleStr = Array.isArray(cle) ? cle.join('|') : cle;
      return Promise.resolve(stores[nom][cleStr] || null);
    },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) { stores[nom][cleDe_(nom, valeur)] = valeur; return Promise.resolve(valeur); }
  };

  var sandbox = { console: console, DB: DB, Promise: Promise, Object: Object, Number: Number, Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/secteurService.js', 'utf8'), sandbox, { filename: 'secteurService.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });

  return { sandbox: sandbox, stores: stores };
}

function secteurDeBase_(extra) {
  return Object.assign({
    partieId: PARTIE_ID, maisonAssociee: null, corrompu: false, nombreGardien: 0,
    guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
    installationChantierNaval: 0, installationDefenseSecteur: 0, installationBaseStellaire: 0,
    pnNeant: 0, pnCorvette: 0, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0,
    jetonPrime: 0, jetonGloire: 0, jetonLiberation: 0
  }, extra || {});
}

// Fixture : secteur 1 (Faille), secteur 2 (standard, non éligible).
function fixtureBase_(cadre) {
  var ctx = creerSandbox_();
  ctx.stores.parties[PARTIE_ID] = { id: PARTIE_ID, scenarioId: 'scn1' };
  ctx.stores.scenarioSecteurs['scn1|1'] = { scenarioId: 'scn1', numero: 1, type: 'faille' };
  ctx.stores.scenarioSecteurs['scn1|2'] = { scenarioId: 'scn1', numero: 2, type: 'standard' };
  ctx.stores.secteursPartie[PARTIE_ID + '|1'] = secteurDeBase_({ numero: 1, population: 0, pnNeant: 3 });
  ctx.stores.secteursPartie[PARTIE_ID + '|2'] = secteurDeBase_({ numero: 2, population: 3, pnCorvette: 1 });

  var evenementCycle1 = { code: 'J', cycle: 2, cadres: [cadre], cadresAppliques: {} };
  ctx.stores.parties[PARTIE_ID].etatJson = { evenements: { cycle1: evenementCycle1, cycle2: null, cycle3: null } };
  ctx.stores.plateauMaison[PARTIE_ID] = {
    partieId: PARTIE_ID, ressourceNourriture: 0, ressourceEnergie: 0, ressourceMateriel: 0,
    ressourceCredit: 0, ressourceScience: 0, influence: 0, cubeActif: 0, jetonPrime: 0, jetonLiberation: 0,
    jetonCommerce: [], gloire: [], civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false,
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}
  };
  return ctx;
}

test('ZONES_PLACEMENT_MASSE : contient les 5 zones connues du catalogue', function () {
  var ctx = creerSandbox_();
  var GameService = ctx.sandbox.GameService;
  assert.strictEqual(GameService.ZONES_PLACEMENT_MASSE.indexOf('chaque_faille') !== -1, true);
  assert.strictEqual(GameService.ZONES_PLACEMENT_MASSE.length, 5);
});

test('previsualiserCadrePlacementEnMasse : liste les secteurs sans écrire', function () {
  var ctx = fixtureBase_(creerCadreMasse_('chaque_faille', { gardien: 1 }));
  var GameService = ctx.sandbox.GameService;

  return GameService.previsualiserCadrePlacementEnMasse(PARTIE_ID, ctx.stores.parties[PARTIE_ID].etatJson.evenements.cycle1.cadres[0]).then(function (numeros) {
    assert.strictEqual(JSON.stringify(numeros), JSON.stringify([1]));
    assert.strictEqual(ctx.stores.secteursPartie[PARTIE_ID + '|1'].nombreGardien, 0, 'lecture seule, rien persisté');
  });
});

test('appliquerCadrePlacementEnMasse : pose les éléments sur chaque secteur éligible, marque cadresAppliques', function () {
  var ctx = fixtureBase_(creerCadreMasse_('chaque_faille', { gardien: 1 }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadrePlacementEnMasse(PARTIE_ID, 1, 1).then(function (partieMaj) {
    assert.strictEqual(ctx.stores.secteursPartie[PARTIE_ID + '|1'].nombreGardien, 1);
    assert.strictEqual(ctx.stores.secteursPartie[PARTIE_ID + '|2'].nombreGardien, 0, 'secteur non éligible jamais touché');

    var applique = partieMaj.evenements.cycle1.cadresAppliques[1];
    assert.ok(applique);
    assert.strictEqual(JSON.stringify(applique.secteurs), JSON.stringify([1]));
  });
});

test('appliquerCadrePlacementEnMasse : aucun secteur éligible -> succès avec secteurs:[] (pas une erreur)', function () {
  var ctx = fixtureBase_(creerCadreMasse_('chaque_secteur_neant_cube_neant_max_2', { defense_secteur: 1 }));
  // Le seul secteur du Néant (1) a 3 cubes du Néant -> dépasse le seuil "max 2".
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadrePlacementEnMasse(PARTIE_ID, 1, 1).then(function (partieMaj) {
    var applique = partieMaj.evenements.cycle1.cadresAppliques[1];
    assert.ok(applique);
    assert.strictEqual(applique.secteurs.length, 0);
    assert.strictEqual(ctx.stores.secteursPartie[PARTIE_ID + '|1'].installationDefenseSecteur, 0);
  });
});

test('appliquerCadrePlacementEnMasse : mauvais type/zone de cadre -> rejette', function () {
  var cadreChoix = { ordre: 1, obligatoire: true, resolution: null, texte: 'x', effet: { type: 'gain', elements: {} } };
  var ctx = fixtureBase_(cadreChoix);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadrePlacementEnMasse(PARTIE_ID, 1, 1).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('introuvable') !== -1); }
  );
});

test('appliquerCadrePlacementEnMasse : déjà appliqué -> rejette', function () {
  var ctx = fixtureBase_(creerCadreMasse_('chaque_faille', { gardien: 1 }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadrePlacementEnMasse(PARTIE_ID, 1, 1).then(function () {
    return GameService.appliquerCadrePlacementEnMasse(PARTIE_ID, 1, 1).then(
      function () { assert.fail('aurait dû rejeter (déjà appliqué)'); },
      function (erreur) { assert.ok(erreur.message.indexOf('déjà été appliqué') !== -1); }
    );
  });
});
