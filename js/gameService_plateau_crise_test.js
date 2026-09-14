/**
 * Test fumée — gameService.js (Plateau Crise light : payerCoutCrise +
 * les 7 champs criseModificateurEscarmouche/criseCoutXxx/crisePerpetuelle
 * via majPlateauMaison) — retour utilisateur 13/09/2026.
 * Exécution : node js/gameService_plateau_crise_test.js
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
  var stores = { parties: {}, plateauMaison: {} };
  return {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cle] || null); },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      var cle = nom === 'parties' ? valeur.id : valeur.partieId;
      stores[nom][cle] = valeur;
      return Promise.resolve(valeur);
    },
    _stores: stores
  };
}

function ligneParties_(id) {
  return {
    id: id, dateCreation: '2026-09-13T00:00:00.000Z', archivee: false, scenarioId: 'scenario-test',
    cycleNum: 1, cycleTermine: false,
    etatJson: { joueur: { nom: 'Maison Test', technologies: [] }, adversaires: [], evenements: { cycle1: null, cycle2: null, cycle3: null } }
  };
}

function lignePlateauMaison_(partieId, extra) {
  var base = {
    partieId: partieId,
    ressourceNourriture: 0, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 10,
    cubeActif: 0, jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null],
    criseModificateurEscarmouche: 0, criseCoutMateriel: 0, criseCoutEnergie: 0,
    criseCoutScience: 0, criseCoutCredit: 0, criseCoutInfluence: 0, crisePerpetuelle: 0
  };
  return Object.assign(base, extra || {});
}

function creerContexte_(db) {
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, Math: Math, Number: Number, DB: db };
  chargerDansContexte_(__dirname + '/gameService.js', ctx);
  return ctx;
}

test('majPlateauMaison : les 7 champs Plateau Crise sont whitelistés', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.majPlateauMaison('p1', {
    criseModificateurEscarmouche: 2, criseCoutMateriel: 1, criseCoutEnergie: 2,
    criseCoutScience: 1, criseCoutCredit: 3, criseCoutInfluence: 6, crisePerpetuelle: 4
  }).then(function () {
    var ligne = db._stores.plateauMaison['p1'];
    assert.strictEqual(ligne.criseModificateurEscarmouche, 2);
    assert.strictEqual(ligne.criseCoutMateriel, 1);
    assert.strictEqual(ligne.criseCoutEnergie, 2);
    assert.strictEqual(ligne.criseCoutScience, 1);
    assert.strictEqual(ligne.criseCoutCredit, 3);
    assert.strictEqual(ligne.criseCoutInfluence, 6);
    assert.strictEqual(ligne.crisePerpetuelle, 4);
  });
});

test('payerCoutCrise : décrémente les vraies ressources/Influence, remet SEULEMENT criseCoutInfluence à 0 (retour utilisateur 14/09/2026 — les 4 autres sont des valeurs fixes rappelées au Cycle suivant)', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1', {
    criseCoutMateriel: 2, criseCoutEnergie: 1, criseCoutScience: 2, criseCoutCredit: 4, criseCoutInfluence: 9,
    criseModificateurEscarmouche: 3, crisePerpetuelle: 1
  });
  var ctx = creerContexte_(db);

  return ctx.GameService.payerCoutCrise('p1').then(function (partie) {
    assert.strictEqual(partie.plateauMaison.ressources.materiel, 3, '5 - 2');
    assert.strictEqual(partie.plateauMaison.ressources.energie, 4, '5 - 1');
    assert.strictEqual(partie.plateauMaison.ressources.science, 3, '5 - 2');
    assert.strictEqual(partie.plateauMaison.ressources.credit, 1, '5 - 4');
    assert.strictEqual(partie.plateauMaison.ressources.influence, 1, '10 - 9');

    var ligne = db._stores.plateauMaison['p1'];
    assert.strictEqual(ligne.criseCoutMateriel, 2, 'valeur fixe, pas remise à 0');
    assert.strictEqual(ligne.criseCoutEnergie, 1, 'valeur fixe, pas remise à 0');
    assert.strictEqual(ligne.criseCoutScience, 2, 'valeur fixe, pas remise à 0');
    assert.strictEqual(ligne.criseCoutCredit, 4, 'valeur fixe, pas remise à 0');
    assert.strictEqual(ligne.criseCoutInfluence, 0, 'seule pénalité ponctuelle, remise à 0');
    // Pas un coût — jamais remis à 0 par payerCoutCrise.
    assert.strictEqual(ligne.criseModificateurEscarmouche, 3);
    assert.strictEqual(ligne.crisePerpetuelle, 1);
  });
});

test('payerCoutCrise : ne descend jamais sous 0 (coût supérieur au stock)', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1', {
    ressourceMateriel: 1, criseCoutMateriel: 2,
    influence: 3, criseCoutInfluence: 15
  });
  var ctx = creerContexte_(db);

  return ctx.GameService.payerCoutCrise('p1').then(function (partie) {
    assert.strictEqual(partie.plateauMaison.ressources.materiel, 0);
    assert.strictEqual(partie.plateauMaison.ressources.influence, 0);
  });
});

test('payerCoutCrise : plateau maison introuvable -> rejette', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);

  return ctx.GameService.payerCoutCrise('inexistante').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /introuvable/i);
  });
});
