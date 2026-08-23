// Test fumée node --test — GameService.gagnerProgramme (Phase 2, gain de
// Programme -> programmesEnMain, tableau non borné). Mock DB minimal en
// mémoire (vm), même gabarit que gameService_cadre_h1_test.js.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

var CATALOGUE_PROGRAMMES = [
  { code: 'D1', nom: 'Haute Société', type: 'Domination', objectif1: 'obj1', objectif2: 'obj2' },
  { code: 'F1', nom: 'Poigne de Fer', type: 'Force', objectif1: 'obj1', objectif2: 'obj2' },
  { code: 'F2', nom: 'Marche Forcée', type: 'Force', objectif1: 'obj1', objectif2: 'obj2' }
];

function slotVide_(corrompu) {
  return { nom: null, entretienActif: false, corrompu: !!corrompu };
}

function plateauBase_(champs) {
  return Object.assign({
    partieId: PARTIE_ID,
    programmesEnMain: [],
    programmesUtilises: [null, slotVide_(), slotVide_(), slotVide_(true)],
    offresProgramme: [
      { type: 'Domination', nom: null, corrompu: false },
      { type: 'Force', nom: 'Poigne de Fer', corrompu: false },
      { type: 'Soutien', nom: null, corrompu: false },
      { type: 'Richesse', nom: null, corrompu: false }
    ]
  }, champs || {});
}

function creerSandbox_(lignePlateauMaison) {
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = lignePlateauMaison;

  var DB = {
    get: function (table, cle) {
      if (table === 'plateauMaison') return Promise.resolve(plateauMaison[cle]);
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = ligne;
      return Promise.resolve(ligne);
    },
    getAll: function (table) {
      if (table === 'programmes') return Promise.resolve(CATALOGUE_PROGRAMMES);
      return Promise.resolve([]);
    }
  };

  var sandbox = {
    DB: DB, console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });
  return { sandbox: sandbox, plateauMaison: plateauMaison };
}

test('gagnerProgramme : succès — ajouté à programmesEnMain, offre correspondante nettoyée', function () {
  var ctx = creerSandbox_(plateauBase_());
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Poigne de Fer').then(function (resultat) {
    assert.strictEqual(resultat.nom, 'Poigne de Fer');
    assert.strictEqual(resultat.type, 'Force');

    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Poigne de Fer']));

    var offreForce = ligne.offresProgramme.filter(function (o) { return o.type === 'Force'; })[0];
    assert.strictEqual(offreForce.nom, null);
    assert.strictEqual(offreForce.corrompu, false);
    var offreDomination = ligne.offresProgramme.filter(function (o) { return o.type === 'Domination'; })[0];
    assert.strictEqual(offreDomination.nom, null);
  });
});

test('gagnerProgramme : plusieurs gains s\'accumulent (tableau non borné, pas de limite à 4)', function () {
  var ctx = creerSandbox_(plateauBase_({ programmesEnMain: ['Haute Société'] }));
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Poigne de Fer').then(function () {
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Haute Société', 'Poigne de Fer']));
  });
});

test('gagnerProgramme : Programme ne correspondant PAS à l\'offre en cours (pioche) — offre inchangée', function () {
  var ctx = creerSandbox_(plateauBase_());
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Marche Forcée').then(function () {
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Marche Forcée']));
    var offreForce = ligne.offresProgramme.filter(function (o) { return o.type === 'Force'; })[0];
    assert.strictEqual(offreForce.nom, 'Poigne de Fer', 'l\'offre "Poigne de Fer" reste affichée, non prise');
  });
});

test('gagnerProgramme : déjà en main -> rejette', function () {
  var ctx = creerSandbox_(plateauBase_({ programmesEnMain: ['Poigne de Fer'] }));
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Poigne de Fer').then(
    function () { throw new Error('aurait dû rejeter (déjà en main)'); },
    function (erreur) { assert.ok(/déjà en main/.test(erreur.message)); }
  );
});

test('gagnerProgramme : déjà en jeu sur la fiche Maison (programmesUtilises) -> rejette', function () {
  var ctx = creerSandbox_(plateauBase_({
    programmesUtilises: [null, { nom: 'Poigne de Fer', entretienActif: false, corrompu: false }, slotVide_(), slotVide_(true)]
  }));
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Poigne de Fer').then(
    function () { throw new Error('aurait dû rejeter (déjà en jeu)'); },
    function (erreur) { assert.ok(/déjà en jeu/.test(erreur.message)); }
  );
});

test('gagnerProgramme : Programme introuvable au catalogue -> rejette', function () {
  var ctx = creerSandbox_(plateauBase_());
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Carte Inexistante').then(
    function () { throw new Error('aurait dû rejeter (programme introuvable)'); },
    function (erreur) { assert.ok(/introuvable/.test(erreur.message)); }
  );
});

test('gagnerProgramme : offresProgramme absent en base (partie créée avant ce champ) -> repli sur défaut, aucune erreur', function () {
  var ligneSansOffres = plateauBase_();
  delete ligneSansOffres.offresProgramme;
  var ctx = creerSandbox_(ligneSansOffres);
  var GameService = ctx.sandbox.GameService;

  return GameService.gagnerProgramme(PARTIE_ID, 'Poigne de Fer').then(function (resultat) {
    assert.strictEqual(resultat.nom, 'Poigne de Fer');
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Poigne de Fer']));
    assert.ok(Array.isArray(ligne.offresProgramme));
    assert.strictEqual(ligne.offresProgramme.length, 4);
  });
});
