// Test fumée node --test — GameService.utiliserProgramme (Phase 3, jouer
// l'action gratuite d'un Programme puis le placer sur le plateau des 4
// emplacements de la fiche Maison). Mock DB + FocusEngine minimal en
// mémoire (vm), même gabarit que gameService_cadre_h1_test.js.
//
// FocusEngine.resoudreEffet est mocké entièrement (pas rechargé depuis le
// vrai fichier) : ce test couvre l'ORCHESTRATION propre à
// utiliserProgramme (placement/conflit/plein/annulation/corruption) —
// la résolution réelle de "envahir"/"choice et/ou"/etc. est déjà couverte
// par focusEngine.test.js.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

var CATALOGUE_PROGRAMMES = [
  { code: 'D1', nom: 'Haute Société', type: 'Domination' },
  { code: 'D2', nom: 'Syndicat Commercial', type: 'Domination' },
  { code: 'F1', nom: 'Poigne de Fer', type: 'Force' },
  { code: 'S1', nom: 'Front Uni', type: 'Soutien' },
  { code: 'R1', nom: 'Marché Noir', type: 'Richesse' }
];

function slotVide_(corrompu) {
  return { nom: null, entretienActif: false, corrompu: !!corrompu };
}

function plateauBase_(champs) {
  return Object.assign({
    partieId: PARTIE_ID,
    ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0,
    corruptionMaison: 1,
    programmesEnMain: ['Haute Société'],
    programmesUtilises: [null, slotVide_(), slotVide_(), slotVide_(true)],
    offresProgramme: []
  }, champs || {});
}

function creerSandbox_(lignePlateauMaison, resultatEffetMock) {
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = lignePlateauMaison;
  var appelsResoudreEffet = [];

  var DB = {
    get: function (table, cle) {
      if (table === 'plateauMaison') return Promise.resolve(Object.assign({}, plateauMaison[cle]));
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = ligne;
      return Promise.resolve(ligne);
    },
    getAll: function (table) {
      if (table === 'programmes') return Promise.resolve(CATALOGUE_PROGRAMMES);
      return Promise.resolve([]);
    },
    // EVOLUTION 18 (todo.md) : GameService.utiliserProgramme enveloppe
    // désormais sa résolution sous DB.demarrerEnregistrement/
    // arreterEnregistrement (voir db.js) — stubs no-op ici, ce fichier
    // couvre l'ORCHESTRATION (placement/conflit/plein/annulation), pas le
    // mécanisme d'enregistrement lui-même (voir
    // gameService_evolution18_undo_test.js pour une intégration complète
    // avec le vrai db.js).
    demarrerEnregistrement: function () {},
    arreterEnregistrement: function () { return []; }
  };

  var FocusEngine = {
    resoudreEffet: function (etat, effet, source, texteAction, demanderChoix) {
      appelsResoudreEffet.push({ etat: etat, effet: effet, source: source, texteAction: texteAction });
      return Promise.resolve(resultatEffetMock);
    }
  };

  // Stub minimal : mutationsCapturees est toujours [] (voir
  // arreterEnregistrement ci-dessus), donc jamais réellement invoqué dans
  // ce fichier — présent uniquement pour que la référence globale
  // AnnulationService résolve (utiliserProgramme y accède toujours dans
  // la branche `resultatFinal.annule`, mutations vides ou non).
  var AnnulationService = {
    empiler: function () { return Promise.resolve(); },
    restaurerMutations: function () { return Promise.resolve(); }
  };

  var sandbox = {
    DB: DB, FocusEngine: FocusEngine, AnnulationService: AnnulationService,
    console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });
  return { sandbox: sandbox, plateauMaison: plateauMaison, appelsResoudreEffet: appelsResoudreEffet };
}

function resultatSucces_(etatResultat, mutations) {
  return { succes: true, journal: ['Programme — Haute Société : Envahi le Secteur 3.'], mutations: mutations || [], etatResultat: etatResultat || {} };
}

test('utiliserProgramme : succès, emplacement 1-3 vide -> placé directement, aucun demanderChoix', function () {
  var ctx = creerSandbox_(plateauBase_(), resultatSucces_());
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function () { throw new Error('ne devrait pas être appelé (emplacement libre, aucun conflit)'); };

  return GameService.utiliserProgramme(PARTIE_ID, 'Haute Société', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.place, true);
    assert.strictEqual(resultat.nom, 'Haute Société');
    assert.strictEqual(resultat.type, 'Domination');

    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify([]));
    assert.strictEqual(ligne.programmesUtilises[1].nom, 'Haute Société');
    // Retour utilisateur (28/08/2026) : "Quand un programme arrive sur le
    // plateau maison, par défaut la case entretien doit être cochée".
    assert.strictEqual(ligne.programmesUtilises[1].entretienActif, true);
    assert.strictEqual(ligne.programmesUtilises[1].corrompu, false);
    assert.strictEqual(ligne.programmesUtilises[0], null, 'emplacement 0 (départ) jamais touché');

    assert.strictEqual(ctx.appelsResoudreEffet.length, 1);
    assert.strictEqual(ctx.appelsResoudreEffet[0].effet.envahir, 1);
    assert.strictEqual(ctx.appelsResoudreEffet[0].etat.partieId, PARTIE_ID);
  });
});

test('utiliserProgramme : conflit de type, confirmation ACCEPTÉE -> remplace l\'emplacement, conserve le Corrompu lié au slot (corruptionMaison inchangé)', function () {
  var plateau = plateauBase_({
    programmesEnMain: ['Syndicat Commercial'],
    programmesUtilises: [null, { nom: 'Haute Société', entretienActif: true, corrompu: true }, slotVide_(), slotVide_(true)],
    corruptionMaison: 2
  });
  var ctx = creerSandbox_(plateau, resultatSucces_());
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'confirmation');
    assert.ok(/Haute Société/.test(contexte.message));
    assert.ok(/Syndicat Commercial/.test(contexte.message));
    return { confirme: true };
  };

  return GameService.utiliserProgramme(PARTIE_ID, 'Syndicat Commercial', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.place, true);
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(ligne.programmesUtilises[1].nom, 'Syndicat Commercial');
    assert.strictEqual(ligne.programmesUtilises[1].corrompu, true, 'la Corruption reste sur l\'emplacement, pas sur la carte remplacée');
    assert.strictEqual(ligne.corruptionMaison, 2, 'inchangé : la Corruption ne quitte pas le plateau, elle reste sur le slot');
  });
});

test('utiliserProgramme : conflit de type, confirmation REFUSÉE -> reste en main, action déjà résolue non annulée', function () {
  var plateau = plateauBase_({
    programmesEnMain: ['Syndicat Commercial'],
    programmesUtilises: [null, { nom: 'Haute Société', entretienActif: false, corrompu: false }, slotVide_(), slotVide_(true)]
  });
  var ctx = creerSandbox_(plateau, resultatSucces_());
  var GameService = ctx.sandbox.GameService;

  return GameService.utiliserProgramme(PARTIE_ID, 'Syndicat Commercial', function () { return { annule: true }; }).then(function (resultat) {
    assert.strictEqual(resultat.place, false);
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Syndicat Commercial']), 'reste en main');
    assert.strictEqual(ligne.programmesUtilises[1].nom, 'Haute Société', 'emplacement existant non touché');
  });
});

test('utiliserProgramme : 3 emplacements pleins, aucun conflit -> popup choisir_emplacement_programme, place au slot choisi', function () {
  var plateau = plateauBase_({
    programmesEnMain: ['Front Uni'],
    programmesUtilises: [
      null,
      { nom: 'Haute Société', entretienActif: false, corrompu: false },
      { nom: 'Poigne de Fer', entretienActif: false, corrompu: false },
      { nom: 'Marché Noir', entretienActif: false, corrompu: true }
    ]
  });
  var ctx = creerSandbox_(plateau, resultatSucces_());
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'choisir_emplacement_programme');
    assert.strictEqual(contexte.options.length, 3);
    assert.strictEqual(contexte.options[2].nom, 'Marché Noir');
    return { numero: 3 };
  };

  return GameService.utiliserProgramme(PARTIE_ID, 'Front Uni', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.place, true);
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(ligne.programmesUtilises[3].nom, 'Front Uni');
    assert.strictEqual(ligne.programmesUtilises[3].corrompu, true, 'la Corruption reste sur l\'emplacement 3, pas sur la carte remplacée');
    assert.strictEqual(ligne.corruptionMaison, 1, 'inchangé (valeur de plateauBase_) : la Corruption ne quitte pas le plateau');
  });
});

test('utiliserProgramme : 3 emplacements pleins, choix ANNULÉ -> reste en main', function () {
  var plateau = plateauBase_({
    programmesEnMain: ['Front Uni'],
    programmesUtilises: [
      null,
      { nom: 'Haute Société', entretienActif: false, corrompu: false },
      { nom: 'Poigne de Fer', entretienActif: false, corrompu: false },
      { nom: 'Marché Noir', entretienActif: false, corrompu: false }
    ]
  });
  var ctx = creerSandbox_(plateau, resultatSucces_());
  var GameService = ctx.sandbox.GameService;

  return GameService.utiliserProgramme(PARTIE_ID, 'Front Uni', function () { return { annule: true }; }).then(function (resultat) {
    assert.strictEqual(resultat.place, false);
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Front Uni']));
  });
});

test('utiliserProgramme : action annulée (resoudreEffet.succes:false) -> {annule:true}, rien ne bouge', function () {
  var ctx = creerSandbox_(plateauBase_(), { succes: false, journal: [], mutations: [], etatResultat: {} });
  var GameService = ctx.sandbox.GameService;

  return GameService.utiliserProgramme(PARTIE_ID, 'Haute Société', function () { return { annule: true }; }).then(function (resultat) {
    assert.strictEqual(resultat.annule, true);
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(JSON.stringify(ligne.programmesEnMain), JSON.stringify(['Haute Société']), 'inchangé (aucune écriture)');
  });
});

test('utiliserProgramme : Programme absent de programmesEnMain -> rejette', function () {
  var ctx = creerSandbox_(plateauBase_({ programmesEnMain: [] }), resultatSucces_());
  var GameService = ctx.sandbox.GameService;

  return GameService.utiliserProgramme(PARTIE_ID, 'Haute Société', function () {
    throw new Error('demanderChoix ne devrait pas être appelé');
  }).then(
    function () { throw new Error('aurait dû rejeter'); },
    function (erreur) { assert.ok(/introuvable en main/.test(erreur.message)); }
  );
});

test('utiliserProgramme : mutations de ressources fusionnées (ex. coût/gain de l\'action)', function () {
  var etatResultat = Object.assign({}, plateauBase_(), { cubeActif: 5, influence: 12 });
  var mutations = [{ champ: 'cubeActif', avant: 3, apres: 5 }, { champ: 'influence', avant: 0, apres: 12 }];
  var ctx = creerSandbox_(plateauBase_(), resultatSucces_(etatResultat, mutations));
  var GameService = ctx.sandbox.GameService;

  return GameService.utiliserProgramme(PARTIE_ID, 'Haute Société', function () {
    throw new Error('ne devrait pas être appelé');
  }).then(function () {
    var ligne = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(ligne.cubeActif, 5);
    assert.strictEqual(ligne.influence, 12);
  });
});
