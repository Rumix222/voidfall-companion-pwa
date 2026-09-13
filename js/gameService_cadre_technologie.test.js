// Test fumée node --test pour l'automatisation des Cadres d'Événement
// galactique "gagner une Technologie" (retour utilisateur : "il faut
// implémenter les effets de gains de technologie via les événements
// galactique") — GameService.appliquerCadreChoixFocusEngine (option
// directe {cle:'technologie_base', valeur:1}, ex. Événement F Cycle 1
// Cadre 1) et GameService.appliquerCadreOptionTechnologieAvecCout (combo
// {cout:{science:1}, gain:{technologie_base:1}}, ex. Événement A Cycle 1
// Cadre 2). Charge le VRAI focusEngine.js (moteur pur, popup
// 'gagner_technologie' déléguée à demanderChoix, MÊME mécanique que
// Focus Innovation "Inventer"/Piste de Civilisation) + le VRAI
// gameService.js — même principe que test_gameService_cadreChoixCube.js.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerLignePlateauMaison() {
  return {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}
  };
}

function creerSandbox(cadre) {
  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-09-13', archivee: false, scenarioId: 'scn1',
    cycleNum: 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: { code: 'X', cycle: 1, cadres: [cadre], cadresAppliques: {} }, cycle2: null, cycle3: null } }
  };
  var parties = {}; parties[PARTIE_ID] = lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = creerLignePlateauMaison();

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
  vm.runInContext(fs.readFileSync(__dirname + '/focusEngine.js', 'utf8'), sandbox, { filename: 'focusEngine.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });
  return { sandbox: sandbox, plateauMaison: plateauMaison, parties: parties };
}

test('Option directe {cle:"technologie_base"} (Événement F) : appliquerCadreChoixFocusEngine ouvre gagner_technologie, marque le cadre', function () {
  var cadre = {
    ordre: 1, obligatoire: true, resolution: 'par_joueur',
    texte: 'Chaque joueur choisit : gagnez une Technologie de base, ou activez 1 cube et gagnez un jeton Commerce.',
    effet: { type: 'choix', mode: 'exclusif', options: [
      { cle: 'technologie_base', valeur: 1 },
      { mode: 'groupe', gains: [{ cle: 'activer_cube', valeur: 1 }, { cle: 'commerce', valeur: 1 }] }
    ] }
  };
  var ctx = creerSandbox(cadre);
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_technologie');
    assert.strictEqual(JSON.stringify(contexte.niveaux), JSON.stringify(['base']));
    return Promise.resolve({ detail: 'Technologie "Nacelles" obtenue (De base).' });
  };

  return GameService.appliquerCadreChoixFocusEngine(PARTIE_ID, 1, 1, 0, demanderChoix)
    .then(function (partieMaj) {
      assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1], 'le cadre doit être marqué appliqué');
      assert.ok(/Technologie/i.test(partieMaj.evenements.cycle1.cadresAppliques[1].resume));

      return GameService.appliquerCadreChoixFocusEngine(PARTIE_ID, 1, 1, 0, demanderChoix).then(
        function () { throw new Error('aurait dû rejeter (déjà appliqué)'); },
        function (erreur) { assert.ok(/déjà été appliqué/.test(erreur.message)); }
      );
    });
});

test('Option directe {cle:"technologie_base_ou_amelioree"} : niveaux transmis en tableau', function () {
  var cadre = {
    ordre: 1, obligatoire: true, resolution: 'par_joueur', texte: 'Gagnez une Technologie de base ou améliorée.',
    effet: { type: 'choix', mode: 'exclusif', options: [
      { cle: 'technologie_base_ou_amelioree', valeur: 1 }
    ] }
  };
  var ctx = creerSandbox(cadre);
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_technologie');
    assert.strictEqual(JSON.stringify(contexte.niveaux), JSON.stringify(['base', 'amelioree']));
    return Promise.resolve({ detail: 'Technologie "Boucliers" obtenue (Améliorée).' });
  };

  return GameService.appliquerCadreChoixFocusEngine(PARTIE_ID, 1, 1, 0, demanderChoix)
    .then(function (partieMaj) {
      assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
    });
});

test('Combo {cout:{science:1}, gain:{technologie_base:1}} (Événement A) : appliquerCadreOptionTechnologieAvecCout débite le coût APRÈS le gain', function () {
  var cadre = {
    ordre: 2, obligatoire: false, resolution: null,
    texte: 'Dépensez 1 Science pour gagner une Technologie de base OU gagnez 3 Crédits.',
    effet: { type: 'choix', mode: 'exclusif', options: [
      { cout: { science: 1 }, gain: { technologie_base: 1 } },
      { gain: { credit: 3 } }
    ] }
  };
  var ctx = creerSandbox(cadre);
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_technologie');
    assert.strictEqual(JSON.stringify(contexte.niveaux), JSON.stringify(['base']));
    return Promise.resolve({ detail: 'Technologie "Nacelles" obtenue (De base).' });
  };

  return GameService.appliquerCadreOptionTechnologieAvecCout(PARTIE_ID, 1, 2, 0, demanderChoix)
    .then(function (partieMaj) {
      assert.strictEqual(partieMaj.plateauMaison.ressources.science, 4, 'Science débitée (5 -> 4)');
      assert.ok(partieMaj.evenements.cycle1.cadresAppliques[2], 'le cadre doit être marqué appliqué');
    });
});

test('Combo Technologie avec coût : Annuler la popup Technologie -> aucun coût débité, cadre non marqué', function () {
  var cadre = {
    ordre: 2, obligatoire: false, resolution: null,
    texte: 'Dépensez 1 Science pour gagner une Technologie de base OU gagnez 3 Crédits.',
    effet: { type: 'choix', mode: 'exclusif', options: [
      { cout: { science: 1 }, gain: { technologie_base: 1 } },
      { gain: { credit: 3 } }
    ] }
  };
  var ctx = creerSandbox(cadre);
  var GameService = ctx.sandbox.GameService;

  var demanderChoixAnnule = function () { return Promise.resolve({ annule: true }); };

  return GameService.appliquerCadreOptionTechnologieAvecCout(PARTIE_ID, 1, 2, 0, demanderChoixAnnule)
    .then(function (resultat) {
      assert.strictEqual(resultat.annule, true);
      return ctx.sandbox.DB.get('plateauMaison', PARTIE_ID);
    })
    .then(function (lignePlateauMaison) {
      assert.strictEqual(lignePlateauMaison.ressourceScience, 5, 'Science inchangée (aucun coût débité)');
      return ctx.sandbox.DB.get('parties', PARTIE_ID);
    })
    .then(function (lignePartie) {
      assert.strictEqual(lignePartie.etatJson.evenements.cycle1.cadresAppliques[2], undefined);
    });
});
