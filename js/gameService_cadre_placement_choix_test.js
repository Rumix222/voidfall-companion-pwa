// Test fumée node --test pour GameService.appliquerCadreChoixPlacement
// (Événement F, Cycle 1, Cadre 1 — "Placez une Guilde et 1 cube du Néant
// dans le secteur du Néant adjacent avec la Population la plus basse OU
// placez un jeton Gloire de valeur 2 et une Défense de Secteur dans le
// secteur du Néant adjacent avec la Population la plus élevée.") —
// charge les VRAIS secteurService.js + gameService.js (ce dernier
// délègue à SecteurService.resoudrePlacementMultipleNeantAdjacent/
// placerElementsNeantAdjacent pour la revalidation et l'écriture), mock
// DB minimal en mémoire (vm, pas de dépendance npm), même principe que
// secteurService_actions_test.js/gameService_cadre_ecriture_imbriquee_test.js.
//
// ⚠️ Comparaisons de tableaux/objets créés en vm : JSON.stringify plutôt
// qu'assert.deepStrictEqual (voir secteurService_actions_test.js).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerCadre_() {
  return {
    ordre: 1, obligatoire: true, resolution: 'par_joueur',
    texte: 'Placez une Guilde et 1 cube du Néant dans le secteur du Néant adjacent avec la Population la plus basse OU placez un jeton Gloire de valeur 2 et une Défense de Secteur dans le secteur du Néant adjacent avec la Population la plus élevée.',
    effet: {
      type: 'choix', mode: 'exclusif',
      options: [
        { type: 'placement', critere: 'population_min', elements: { guilde: 1, cube_neant: 1 } },
        { type: 'placement', critere: 'population_max', elements: { gloire: 2, defense_secteur: 1 } }
      ]
    }
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

// Fixture commune : secteur 1 possédé (population non pertinente ici),
// secteur 2 du Néant (population 3, la plus BASSE), secteur 3 du Néant
// (population 5, la plus ÉLEVÉE), tous deux adjacents au secteur 1 —
// aucune égalité, un seul candidat par critère.
function fixtureBase_() {
  var ctx = creerSandbox_();
  ctx.stores.parties[PARTIE_ID] = { id: PARTIE_ID, scenarioId: 'scn1' };
  ctx.stores.scenarioSecteurs['scn1|1'] = { scenarioId: 'scn1', numero: 1, type: 't1' };
  ctx.stores.scenarioSecteurs['scn1|2'] = { scenarioId: 'scn1', numero: 2, type: 't1' };
  ctx.stores.scenarioSecteurs['scn1|3'] = { scenarioId: 'scn1', numero: 3, type: 't1' };
  ctx.stores.typesSecteur['t1'] = { id: 't1', nombreInstallationMax: 1, nombreGuildeMax: 1 };
  ctx.stores.scenarioAdjacences['scn1|1|2'] = { scenarioId: 'scn1', numeroA: 1, numeroB: 2 };
  ctx.stores.scenarioAdjacences['scn1|1|3'] = { scenarioId: 'scn1', numeroA: 1, numeroB: 3 };
  ctx.stores.secteursPartie[PARTIE_ID + '|1'] = secteurDeBase_({ numero: 1, population: 4, pnCorvette: 1 });
  ctx.stores.secteursPartie[PARTIE_ID + '|2'] = secteurDeBase_({ numero: 2, population: 3, pnNeant: 1 });
  ctx.stores.secteursPartie[PARTIE_ID + '|3'] = secteurDeBase_({ numero: 3, population: 5, pnNeant: 1 });

  var evenementCycle1 = { code: 'F', cycle: 1, cadres: [creerCadre_()], cadresAppliques: {} };
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

test('appliquerCadreChoixPlacement : option "population_min" (Guilde + cube du Néant) -> secteur 2 (le moins peuplé)', function () {
  var ctx = fixtureBase_();
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixPlacement(PARTIE_ID, 1, 1, 0, 2, 'fermiers').then(function (partieMaj) {
    var secteur2 = ctx.stores.secteursPartie[PARTIE_ID + '|2'];
    assert.strictEqual(secteur2.guildeFermiers, 1);
    assert.strictEqual(secteur2.pnNeant, 2, '1 (initial) + 1 (cube_neant posé)');
    var secteur3 = ctx.stores.secteursPartie[PARTIE_ID + '|3'];
    assert.strictEqual(secteur3.pnNeant, 1, 'secteur 3 non touché');

    var applique = partieMaj.evenements.cycle1.cadresAppliques[1];
    assert.ok(applique);
    assert.ok(applique.resume.indexOf('Guilde Fermiers') !== -1);
    assert.ok(applique.resume.indexOf('Secteur 2') !== -1);
  });
});

test('appliquerCadreChoixPlacement : option "population_max" (jeton Gloire + Défense de Secteur) -> secteur 3 (le plus peuplé)', function () {
  var ctx = fixtureBase_();
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixPlacement(PARTIE_ID, 1, 1, 1, 3, undefined).then(function (partieMaj) {
    var secteur3 = ctx.stores.secteursPartie[PARTIE_ID + '|3'];
    assert.strictEqual(secteur3.jetonGloire, 2);
    assert.strictEqual(secteur3.installationDefenseSecteur, 1);
    var secteur2 = ctx.stores.secteursPartie[PARTIE_ID + '|2'];
    assert.strictEqual(secteur2.jetonGloire, 0, 'secteur 2 non touché');

    var applique = partieMaj.evenements.cycle1.cadresAppliques[1];
    assert.ok(applique.resume.indexOf('jeton Gloire 2') !== -1);
    assert.ok(applique.resume.indexOf('Défense de Secteur') !== -1);
    assert.ok(applique.resume.indexOf('Secteur 3') !== -1);
  });
});

test('appliquerCadreChoixPlacement : secteur ne correspondant PAS au critère -> rejeté (revalidation serveur, jamais confiance à l\u2019appelant)', function () {
  var ctx = fixtureBase_();
  var GameService = ctx.sandbox.GameService;

  // Option 0 = population_min -> le secteur 2 est le seul candidat ;
  // tenter de placer sur le secteur 3 (population la plus ÉLEVÉE) doit
  // échouer, même si le secteur 3 est par ailleurs un secteur du Néant
  // adjacent valide.
  return GameService.appliquerCadreChoixPlacement(PARTIE_ID, 1, 1, 0, 3, 'fermiers')
    .then(function () { throw new Error('aurait dû échouer'); })
    .catch(function (erreur) {
      assert.ok(erreur.message.indexOf('non éligible') !== -1, erreur.message);
      var secteur3 = ctx.stores.secteursPartie[PARTIE_ID + '|3'];
      assert.strictEqual(secteur3.guildeFermiers, 0, 'rien ne doit avoir été écrit');
    });
});

test('appliquerCadreChoixPlacement : type de Guilde manquant pour la clé générique "guilde" -> rejeté', function () {
  var ctx = fixtureBase_();
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixPlacement(PARTIE_ID, 1, 1, 0, 2, undefined)
    .then(function () { throw new Error('aurait dû échouer'); })
    .catch(function (erreur) {
      assert.ok(erreur.message.indexOf('Type de Guilde') !== -1, erreur.message);
    });
});

test('appliquerCadreChoixPlacement : double application -> rejetée (garde-fou déjà appliqué)', function () {
  var ctx = fixtureBase_();
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreChoixPlacement(PARTIE_ID, 1, 1, 0, 2, 'fermiers')
    .then(function () {
      return GameService.appliquerCadreChoixPlacement(PARTIE_ID, 1, 1, 1, 3, undefined);
    })
    .then(function () { throw new Error('aurait dû échouer'); })
    .catch(function (erreur) {
      assert.ok(erreur.message.indexOf('déjà été appliqué') !== -1, erreur.message);
    });
});
