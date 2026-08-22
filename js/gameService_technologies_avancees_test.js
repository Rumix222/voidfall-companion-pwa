/**
 * Test fumée — gameService.js (choisirTechnologieAvancee /
 * obtenirTechnologiesAvanceesGroupes)
 * Exécution : node --test gameService_technologies_avancees_test.js
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function chargerDansContexte_(chemin, contexte) {
  var code = fs.readFileSync(chemin, 'utf8');
  vm.createContext(contexte);
  vm.runInContext(code, contexte, { filename: chemin });
}

function creerDbFactice_() {
  var stores = { parties: {}, plateauMaison: {}, historique: {} };
  var prochainIdHistorique = 1;
  return {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cle] || null); },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      var cle;
      if (nom === 'parties') cle = valeur.id;
      else if (nom === 'plateauMaison') cle = valeur.partieId;
      else if (nom === 'historique') cle = prochainIdHistorique++;
      else cle = valeur.id;
      stores[nom][cle] = valeur;
      return Promise.resolve(valeur);
    },
    _stores: stores
  };
}

// 4 maisons déchues x 2 technologies = 8 technologies disponibles, comme à
// la mise en place réelle (règle confirmée par l'utilisateur : "on prend
// toujours parti les 8 technologies des maisons déchues").
function ligneParties_(id, extra) {
  var base = {
    id: id,
    dateCreation: '2026-08-17T00:00:00.000Z',
    archivee: false,
    scenarioId: 'scenario-test',
    cycleNum: 1,
    cycleTermine: false,
    statut: 'en_cours',
    etatJson: {
      joueur: { nom: 'Maison Test', technologies: [{ nom: 'TechDepart', type: 'militaire' }] },
      adversaires: [
        { nom: 'Maison A', technologies: [{ nom: 'A1', type: 'combat' }, { nom: 'A2', type: 'production' }] },
        { nom: 'Maison B', technologies: [{ nom: 'B1', type: 'combat' }, { nom: 'B2', type: 'production' }] },
        { nom: 'Maison C', technologies: [{ nom: 'C1', type: 'combat' }, { nom: 'C2', type: 'production' }] },
        { nom: 'Maison D', technologies: [{ nom: 'D1', type: 'combat' }, { nom: 'D2', type: 'production' }] }
      ],
      evenements: { cycle1: null, cycle2: null, cycle3: null },
      focusJoueur: [],
      focusHeroiques: null
    }
  };
  return Object.assign(base, extra || {});
}

function lignePlateauMaison_(partieId, extra) {
  var base = {
    partieId: partieId,
    ressourceNourriture: 0, ressourceEnergie: 0, ressourceMateriel: 0,
    ressourceCredit: 0, ressourceScience: 0, influence: 0,
    cubeActif: 0, jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    programme1: null, programme2: null, programme3: null, programme4: null,
    technologieDepart: 'TechDepart', technologieDepartAmelioree: false,
    technologiesObtenues: [null, null, null, null, null, null],
    technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {},
    civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false
  };
  return Object.assign(base, extra || {});
}

function creerContexte_(db) {
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, Number: Number, DB: db, FocusService: { obtenirCarteHeroiqueParNom: function () { return Promise.reject(new Error('non utilisé')); } } };
  chargerDansContexte_(__dirname + '/gameService.js', ctx);
  return ctx;
}

var LES_4_CHOISIES = [
  { nom: 'A1', maison: 'Maison A' },
  { nom: 'B1', maison: 'Maison B' },
  { nom: 'C1', maison: 'Maison C' },
  { nom: 'D1', maison: 'Maison D' }
];

// ---------------------------------------------------------------
// choisirTechnologieAvancee
// ---------------------------------------------------------------

test('choisirTechnologieAvancee : emplacement invalide -> rejette', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  return ctx.GameService.choisirTechnologieAvancee('p1', 4, 'A1').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /invalide/i);
  });
});

test('choisirTechnologieAvancee : hors cycle 1 -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1', { cycleNum: 2 });
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieAvancee('p1', 0, 'A1').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /cycle 1/i);
  });
});

test('choisirTechnologieAvancee : technologie trouvée -> assignée au slot', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieAvancee('p1', 0, 'A1').then(function (partie) {
    assert.strictEqual(partie.technologiesAvanceesChoisies[0].nom, 'A1');
    assert.strictEqual(partie.technologiesAvanceesChoisies[0].maison, 'Maison A');
    assert.strictEqual(partie.technologiesAvanceesChoisies[1], null);
    assert.strictEqual(Object.keys(db._stores.historique).length, 1);
  });
});

test('choisirTechnologieAvancee : technologie introuvable -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieAvancee('p1', 0, 'Inexistante').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /introuvable/i);
  });
});

test('choisirTechnologieAvancee : doublon entre emplacements -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1', {
    technologiesAvanceesChoisies: [{ nom: 'A1', maison: 'Maison A' }, null, null, null]
  });
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieAvancee('p1', 1, 'A1').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /déjà choisie/i);
  });
});

test('choisirTechnologieAvancee : nom vide -> retire du slot', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1', {
    technologiesAvanceesChoisies: [{ nom: 'A1', maison: 'Maison A' }, null, null, null]
  });
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieAvancee('p1', 0, '').then(function (partie) {
    assert.strictEqual(partie.technologiesAvanceesChoisies[0], null);
  });
});

// ---------------------------------------------------------------
// definirTechnologieAvanceeAmelioree a été supprimée — zéro appelant réel
// (aucune UI ne l'invoquait). Le champ technologiesAvanceesAmeliorees
// qu'elle écrivait reste lu par focusEngine.js (effet
// influence_par_technologie_amelioree, voir focusEngine.test.js) mais
// aucun code ne peut plus l'alimenter — gap fonctionnel connu, pas testé
// ici.
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// obtenirTechnologiesAvanceesGroupes (fonction pure)
// ---------------------------------------------------------------

test('obtenirTechnologiesAvanceesGroupes : groupeB vide tant que les 4 emplacements ne sont pas remplis', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  var partie = {
    adversaires: ligneParties_('p1').etatJson.adversaires,
    technologiesAvanceesChoisies: [{ nom: 'A1', maison: 'Maison A' }, null, null, null],
    cycleActuel: 1
  };
  var groupes = ctx.GameService.obtenirTechnologiesAvanceesGroupes(partie);
  assert.strictEqual(groupes.toutes.length, 8);
  assert.strictEqual(groupes.groupeB.length, 0);
  assert.strictEqual(JSON.stringify(groupes.actif), JSON.stringify([]));
});

test('obtenirTechnologiesAvanceesGroupes : groupeB = complément une fois les 4 choisies', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  var partie = {
    adversaires: ligneParties_('p1').etatJson.adversaires,
    technologiesAvanceesChoisies: LES_4_CHOISIES,
    cycleActuel: 3
  };
  var groupes = ctx.GameService.obtenirTechnologiesAvanceesGroupes(partie);
  var nomsB = groupes.groupeB.map(function (t) { return t.nom; }).sort();
  assert.strictEqual(JSON.stringify(nomsB), JSON.stringify(['A2', 'B2', 'C2', 'D2']));
  assert.strictEqual(JSON.stringify(groupes.actif.slice().sort()), JSON.stringify(['A2', 'B2', 'C2', 'D2']));
});
