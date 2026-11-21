// Test fumée node --test pour le chantier "Escarmouche + Plateau Crise"
// (docs-rules-cycle-de-jeu.md §2.3.3/§3.1, retour utilisateur 14/09/2026) —
// mock DB minimal en mémoire (vm, pas de dépendance npm), charge les VRAIS
// combatService.js + focusEngine.js + secteurService.js + scoreService.js +
// gameService.js. Même principe que gameService_refuges_test.js.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';
var SCENARIO_ID = 'scn1';

function ligneEvenementCycle_(extra) {
  return Object.assign({ code: 'X', cycle: 1, cadres: [], cadresAppliques: {}, objectifs: { blocs: [] } }, extra);
}

function creerFixture(options) {
  options = options || {};
  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-09-14', archivee: false, scenarioId: SCENARIO_ID,
    cycleNum: options.cycleNum || 1, cycleTermine: false,
    etatJson: {
      joueur: { nom: 'Test', technologies: [] },
      evenements: { cycle1: options.evenementCycle1 === undefined ? ligneEvenementCycle_() : options.evenementCycle1, cycle2: null, cycle3: null }
    }
  };
  var lignePlateauMaison = Object.assign({
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 10, cubeActif: 0,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {},
    programmesEnMain: [], programmesUtilises: [null, null, null, null], offresProgramme: [],
    refuges: [], civSociete: 0, civGouvernement: 0, civEconomie: 0,
    criseModificateurEscarmouche: 0,
    criseCoutMateriel: 0, criseCoutEnergie: 0, criseCoutScience: 0, criseCoutCredit: 0, criseCoutInfluence: 0
  }, options.plateauMaison || {});

  return {
    lignePartie: lignePartie,
    lignePlateauMaison: lignePlateauMaison,
    scenario: { id: SCENARIO_ID, nom: 'Test', refuges: [] },
    secteurs: options.secteurs || [],
    adjacences: options.adjacences || []
  };
}

function creerSandbox(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;
  var scenarios = {}; scenarios[fixture.scenario.id] = fixture.scenario;
  var secteursPartie = {};
  fixture.secteurs.forEach(function (s) { secteursPartie[s.partieId + '|' + s.numero] = s; });
  var scenarioAdjacences = {};
  fixture.adjacences.forEach(function (a, i) { scenarioAdjacences[i] = a; });

  var DB = {
    get: function (table, cle) {
      if (table === 'parties') return Promise.resolve(parties[cle]);
      if (table === 'plateauMaison') return Promise.resolve(plateauMaison[cle]);
      if (table === 'scenarios') return Promise.resolve(scenarios[cle]);
      if (table === 'secteursPartie') return Promise.resolve(secteursPartie[cle[0] + '|' + cle[1]]);
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'parties') parties[ligne.id] = ligne;
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = ligne;
      if (table === 'scenarios') scenarios[ligne.id] = ligne;
      if (table === 'secteursPartie') secteursPartie[ligne.partieId + '|' + ligne.numero] = ligne;
      return Promise.resolve(ligne);
    },
    getAll: function (table) {
      if (table === 'secteursPartie') return Promise.resolve(Object.keys(secteursPartie).map(function (k) { return secteursPartie[k]; }));
      if (table === 'scenarioAdjacences') return Promise.resolve(Object.keys(scenarioAdjacences).map(function (k) { return scenarioAdjacences[k]; }));
      return Promise.resolve([]);
    }
  };

  var sandbox = {
    DB: DB, console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(__dirname + '/combatService.js', 'utf8'), sandbox, { filename: 'combatService.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/focusEngine.js', 'utf8'), sandbox, { filename: 'focusEngine.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/secteurService.js', 'utf8'), sandbox, { filename: 'secteurService.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/scoreService.js', 'utf8'), sandbox, { filename: 'scoreService.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });

  return { sandbox: sandbox, plateauMaison: plateauMaison, parties: parties, secteursPartie: secteursPartie };
}

function secteurPossede_(numero, champs) {
  return Object.assign({ partieId: PARTIE_ID, numero: numero, population: 0, corrompu: false, nombreGardien: 0,
    guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
    installationChantierNaval: 0, installationDefenseSecteur: 0, installationBaseStellaire: 0,
    pnNeant: 0, pnCorvette: 0, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0,
    jetonPrime: 0, jetonGloire: [], jetonLiberation: 0 }, champs);
}

// ---------------------------------------------------------------
// calculerPuissanceNeantDefaut
// ---------------------------------------------------------------

// Corrigé 15/09/2026 (retour utilisateur "ça me paraît trop élevé") : la
// Corruption comptée est celle de la fiche Maison (pistes de Civilisation +
// Programmes), PAS les secteurs Corrompus du plateau galactique — un
// secteur Corrompu ne doit donc PLUS influencer ce calcul.
test('calculerPuissanceNeantDefaut : Corruption fiche Maison (pistes + Programmes) + criseModificateurEscarmouche + 1 aux Cycles 2/3', function () {
  var fixture = creerFixture({
    cycleNum: 1,
    plateauMaison: {
      criseModificateurEscarmouche: 2,
      civCorrompueSociete: true,
      programmesUtilises: [null, { nom: 'X', entretienActif: true, corrompu: true }, null, null]
    },
    // Secteur Corrompu : ne doit PAS être compté (hors fiche Maison).
    secteurs: [secteurPossede_(1, { corrompu: true }), secteurPossede_(2, { corrompu: false })]
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.calculerPuissanceNeantDefaut(PARTIE_ID).then(function (puissance) {
    // Piste Société Corrompue (1) + Programme Corrompu (1) + modificateur (2) + 0 (Cycle 1) = 4.
    assert.strictEqual(puissance, 4);
  });
});

test('calculerPuissanceNeantDefaut : secteur Corrompu seul (aucune Corruption fiche Maison) -> ignoré, ne compte que le modificateur', function () {
  var fixture = creerFixture({
    cycleNum: 1,
    plateauMaison: { criseModificateurEscarmouche: 1 },
    secteurs: [secteurPossede_(1, { corrompu: true })]
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.calculerPuissanceNeantDefaut(PARTIE_ID).then(function (puissance) {
    assert.strictEqual(puissance, 1);
  });
});

// Ajouté 15/09/2026 (retour utilisateur — "ne pas oublier la Corruption de
// la Technologie Chambres de décontamination le cas échéant") : ce compteur
// manuel (index.html/renderTechnologiesObtenues_) fait partie de la
// Corruption de la fiche Maison au même titre que pistes/Programmes.
test('calculerPuissanceNeantDefaut : Corruption stockée sur Chambres de décontamination comptée', function () {
  var fixture = creerFixture({
    cycleNum: 1,
    plateauMaison: { corruptionChambreDecontamination: 2 }
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.calculerPuissanceNeantDefaut(PARTIE_ID).then(function (puissance) {
    assert.strictEqual(puissance, 2);
  });
});

test('calculerPuissanceNeantDefaut : +1 aux Cycles 2 et 3', function () {
  var ctx1 = creerSandbox(creerFixture({ cycleNum: 1 }));
  var ctx2 = creerSandbox(creerFixture({ cycleNum: 2 }));
  var ctx3 = creerSandbox(creerFixture({ cycleNum: 3 }));

  return Promise.all([
    ctx1.sandbox.GameService.calculerPuissanceNeantDefaut(PARTIE_ID),
    ctx2.sandbox.GameService.calculerPuissanceNeantDefaut(PARTIE_ID),
    ctx3.sandbox.GameService.calculerPuissanceNeantDefaut(PARTIE_ID)
  ]).then(function (resultats) {
    assert.strictEqual(resultats[0], 0);
    assert.strictEqual(resultats[1], 1);
    assert.strictEqual(resultats[2], 1);
  });
});

// ---------------------------------------------------------------
// previsualiserEscarmouche / appliquerEscarmouche (standalone, sans paiement)
// ---------------------------------------------------------------

test('previsualiserEscarmouche : aucune écriture, retourne {aucuneCible:true} si aucun secteur éligible', function () {
  var fixture = creerFixture({ secteurs: [secteurPossede_(1, { pnCorvette: 1 })] }); // possédé mais pas adjacent au Néant
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.previsualiserEscarmouche(PARTIE_ID, 3).then(function (resultat) {
    assert.strictEqual(resultat.aucuneCible, true);
    assert.strictEqual(ctx.secteursPartie['p1|1'].pnCorvette, 1, 'aucune écriture en prévisualisation');
  });
});

test('appliquerEscarmouche : victoire du joueur -> écrit les survivants, aucun flag posé, aucun paiement', function () {
  var fixture = creerFixture({
    secteurs: [
      secteurPossede_(1, { pnCorvette: 10 }),
      secteurPossede_(10, { pnCorvette: 0, pnNeant: 2 })
    ],
    adjacences: [{ scenarioId: SCENARIO_ID, numeroA: 1, numeroB: 10 }]
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerEscarmouche(PARTIE_ID, 3).then(function (resultat) {
    assert.strictEqual(resultat.cible.numero, 1);
    assert.strictEqual(resultat.cible.resultatCombat.victoireJoueur, true);
    assert.ok(ctx.secteursPartie['p1|1'].pnCorvette < 10, 'quelques cubes doivent avoir été perdus au combat');
    assert.ok(ctx.secteursPartie['p1|1'].pnCorvette > 0);
    // Aucun paiement ni flag "résolu" pour le bouton standalone.
    assert.strictEqual(ctx.plateauMaison[PARTIE_ID].influence, 10);
  });
});

test('appliquerEscarmouche : défaite -> abandon complet persisté (via SecteurService.appliquerResultatEscarmouche)', function () {
  var fixture = creerFixture({
    secteurs: [
      secteurPossede_(1, { pnCorvette: 1, installationDefenseSecteur: 1 }),
      secteurPossede_(10, { pnCorvette: 0, pnNeant: 2 })
    ],
    adjacences: [{ scenarioId: SCENARIO_ID, numeroA: 1, numeroB: 10 }]
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerEscarmouche(PARTIE_ID, 5).then(function (resultat) {
    assert.strictEqual(resultat.cible.resultatCombat.victoireJoueur, false);
    var secteur = ctx.secteursPartie['p1|1'];
    assert.strictEqual(secteur.corrompu, true);
    assert.strictEqual(secteur.pnNeant, 2);
    assert.strictEqual(secteur.installationDefenseSecteur, 0);
    assert.strictEqual(secteur.jetonPrime, 1);
  });
});

test('appliquerEscarmouche : aucun secteur éligible -> {aucuneCible:true}, aucune écriture', function () {
  var fixture = creerFixture({ secteurs: [secteurPossede_(1, { pnCorvette: 1 })] });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerEscarmouche(PARTIE_ID, 3).then(function (resultat) {
    assert.strictEqual(resultat.aucuneCible, true);
    assert.strictEqual(ctx.secteursPartie['p1|1'].pnCorvette, 1);
  });
});

// ---------------------------------------------------------------
// appliquerEscarmouchePhaseEval (avec paiement + flag escarmoucheResoluePhaseEval)
// ---------------------------------------------------------------

test('appliquerEscarmouchePhaseEval : applique le paiement (5 ressources), remet SEULEMENT criseCoutInfluence à 0 (les 4 autres restent, retour utilisateur 14/09/2026), pose le flag', function () {
  var fixture = creerFixture({
    plateauMaison: { criseCoutMateriel: 2, criseCoutEnergie: 1, criseCoutInfluence: 3 },
    secteurs: [
      secteurPossede_(1, { pnCorvette: 10 }),
      secteurPossede_(10, { pnCorvette: 0, pnNeant: 2 })
    ],
    adjacences: [{ scenarioId: SCENARIO_ID, numeroA: 1, numeroB: 10 }]
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  var paiement = { materiel: 2, energie: 1, influence: 3 };
  return GameService.appliquerEscarmouchePhaseEval(PARTIE_ID, 1, 3, paiement).then(function (resultat) {
    var pm = ctx.plateauMaison[PARTIE_ID];
    assert.strictEqual(pm.ressourceMateriel, 3); // 5 - 2
    assert.strictEqual(pm.ressourceEnergie, 4); // 5 - 1
    assert.strictEqual(pm.influence, 7); // 10 - 3
    assert.strictEqual(pm.criseCoutMateriel, 2, 'valeur fixe rappelée au Cycle suivant, pas remise à 0');
    assert.strictEqual(pm.criseCoutEnergie, 1, 'valeur fixe rappelée au Cycle suivant, pas remise à 0');
    assert.strictEqual(pm.criseCoutInfluence, 0, 'seule pénalité ponctuelle, remise à 0');
    assert.strictEqual(ctx.parties[PARTIE_ID].etatJson.evenements.cycle1.escarmoucheResoluePhaseEval, true);
    assert.strictEqual(resultat.cible.numero, 1);
  });
});

test('appliquerEscarmouchePhaseEval : déjà résolue ce Cycle -> rejette', function () {
  var fixture = creerFixture({
    evenementCycle1: ligneEvenementCycle_({ escarmoucheResoluePhaseEval: true }),
    secteurs: [secteurPossede_(1, { pnCorvette: 1 })]
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerEscarmouchePhaseEval(PARTIE_ID, 1, 3, {}).then(function () {
    assert.fail('devrait rejeter');
  }, function (erreur) {
    assert.ok(/déjà été résolue/.test(erreur.message));
  });
});

test('appliquerEscarmouchePhaseEval : aucun Événement choisi pour ce Cycle -> rejette', function () {
  var fixture = creerFixture({ evenementCycle1: null, secteurs: [secteurPossede_(1, { pnCorvette: 1 })] });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerEscarmouchePhaseEval(PARTIE_ID, 1, 3, {}).then(function () {
    assert.fail('devrait rejeter');
  }, function (erreur) {
    assert.ok(/Aucun Événement galactique choisi/.test(erreur.message));
  });
});

test('appliquerEscarmouchePhaseEval : aucun secteur éligible -> résout quand même le paiement/le flag, cible = {aucuneCible:true}', function () {
  var fixture = creerFixture({
    plateauMaison: { criseCoutCredit: 4 },
    secteurs: [secteurPossede_(1, { pnCorvette: 1 })] // possédé mais pas adjacent au Néant
  });
  var ctx = creerSandbox(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerEscarmouchePhaseEval(PARTIE_ID, 1, 3, { credit: 4 }).then(function (resultat) {
    assert.strictEqual(resultat.cible.aucuneCible, true);
    assert.strictEqual(ctx.plateauMaison[PARTIE_ID].ressourceCredit, 1); // 5 - 4
    assert.strictEqual(ctx.parties[PARTIE_ID].etatJson.evenements.cycle1.escarmoucheResoluePhaseEval, true);
  });
});
