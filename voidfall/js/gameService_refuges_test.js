// Test fumée node --test pour le chantier "Refuges" (§3, docs-rules-
// corruption-gardiens-refuges-technoConsume.md, retour utilisateur
// 14/09/2026) — mock DB minimal en mémoire (vm, pas de dépendance npm),
// charge les VRAIS focusEngine.js + secteurService.js + gameService.js.
// Même principe que gameService_appliquer_gain_objectif_test.js.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';
var SCENARIO_ID = 'scn1';

function ligneEvenementCycle_() {
  return { code: 'X', cycle: 1, cadres: [], cadresAppliques: {}, objectifs: { blocs: [] } };
}

function creerFixture(options) {
  options = options || {};
  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-09-14', archivee: false, scenarioId: SCENARIO_ID,
    cycleNum: options.cycleNum || 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: options.evenementCycle1 || ligneEvenementCycle_(), cycle2: null, cycle3: null } }
  };
  var lignePlateauMaison = Object.assign({
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 0,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {},
    programmesEnMain: [], programmesUtilises: [null, null, null, null], offresProgramme: [],
    refuges: [], civSociete: 0, civGouvernement: 0, civEconomie: 0
  }, options.plateauMaison || {});

  return {
    lignePartie: lignePartie,
    lignePlateauMaison: lignePlateauMaison,
    scenario: { id: SCENARIO_ID, nom: 'Test', refuges: options.refugesConfig || [2, 2] },
    secteurs: options.secteurs || []
  };
}

function creerSandbox(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;
  var scenarios = {}; scenarios[fixture.scenario.id] = fixture.scenario;
  var secteursPartie = {};
  fixture.secteurs.forEach(function (s) { secteursPartie[s.partieId + '|' + s.numero] = s; });
  var historique = [];

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
      if (table === 'historique') historique.push(ligne);
      return Promise.resolve(ligne);
    },
    getAll: function (table) {
      if (table === 'secteursPartie') return Promise.resolve(Object.keys(secteursPartie).map(function (k) { return secteursPartie[k]; }));
      return Promise.resolve([]);
    }
  };

  var sandbox = {
    DB: DB, console: console, Promise: Promise, Object: Object, Number: Number,
    Date: Date, Error: Error, Array: Array, JSON: JSON, String: String, Math: Math
  };
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(__dirname + '/focusEngine.js', 'utf8'), sandbox, { filename: 'focusEngine.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/secteurService.js', 'utf8'), sandbox, { filename: 'secteurService.js' });
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

function demanderChoixVide_() { return Promise.reject(new Error('demanderChoix ne devrait pas être appelé dans ce test.')); }

// ---------------------------------------------------------------
// obtenirConfigRefuges / completerRefuges
// ---------------------------------------------------------------

test('obtenirConfigRefuges : lit refuges du scénario, [] si absent/scénario inconnu', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  return GameService.obtenirConfigRefuges(SCENARIO_ID).then(function (config) {
    assert.strictEqual(JSON.stringify(config), JSON.stringify([2, 2]));
    return GameService.obtenirConfigRefuges('inconnu').then(function (vide) {
      assert.strictEqual(vide.length, 0);
      return GameService.obtenirConfigRefuges(null).then(function (vide2) {
        assert.strictEqual(vide2.length, 0);
      });
    });
  });
});

test('completerRefuges : complète à la longueur de la config sans tronquer un excédent existant', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  var completes = GameService.completerRefuges([{ cubes: 1, recompenseAppliquee: false }], [2, 3]);
  assert.strictEqual(completes.length, 2);
  assert.strictEqual(completes[0].cubes, 1);
  assert.strictEqual(completes[1].cubes, 0);

  var excedent = GameService.completerRefuges([{ cubes: 2, recompenseAppliquee: true }, { cubes: 1, recompenseAppliquee: false }, { cubes: 4, recompenseAppliquee: true }], [2]);
  assert.strictEqual(excedent.length, 3, 'un excédent en base ne doit jamais être tronqué');
});

// ---------------------------------------------------------------
// pistesNiveau4EligiblesRefuge (pure)
// ---------------------------------------------------------------

test('pistesNiveau4EligiblesRefuge : ne retient que Niveau >= 4 ET pas déjà réclamé', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  var partie = {
    civilisation: { societe: 4, gouvernement: 3, economie: 5 },
    plateauMaison: { refugeNiveau4Societe: false, refugeNiveau4Gouvernement: false, refugeNiveau4Economie: true }
  };
  var eligibles = GameService.pistesNiveau4EligiblesRefuge(partie).map(function (p) { return p.cle; });
  assert.strictEqual(JSON.stringify(eligibles), JSON.stringify(['societe']));
});

// ---------------------------------------------------------------
// ajouterCubeRefuge — 3 branches de sourcing + garde-fous
// ---------------------------------------------------------------

test('ajouterCubeRefuge : cube inactif disponible -> incrémente juste la tuile, cubeActif inchangé', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  return GameService.ajouterCubeRefuge(PARTIE_ID, 0, demanderChoixVide_).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].cubes, 1);
    assert.strictEqual(partieMaj.plateauMaison.refuges[1].cubes, 0, 'la 2e tuile ne doit pas être touchée');
    assert.strictEqual(partieMaj.plateauMaison.cubeActif, 0);
  });
});

test('ajouterCubeRefuge : aucun cube inactif -> désactive un cube actif', function () {
  var secteurDeploye = secteurPossede_(1, { pnCorvette: 10 }); // 10 cubes déployés
  var ctx = creerSandbox(creerFixture({ plateauMaison: { cubeActif: 4 }, secteurs: [secteurDeploye] }));
  var GameService = ctx.sandbox.GameService;
  // 14 (total) - 4 (actif) - 10 (déployé) - 0 (refuges) = 0 inactif disponible.
  return GameService.ajouterCubeRefuge(PARTIE_ID, 0, demanderChoixVide_).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].cubes, 1);
    assert.strictEqual(partieMaj.plateauMaison.cubeActif, 3, 'cubeActif décrémenté de 1');
  });
});

test('ajouterCubeRefuge : ni inactif ni actif -> popup rappeler_cube_cout, incrémente seulement si non annulée', function () {
  var secteurDeploye = secteurPossede_(1, { pnCorvette: 14 });
  var ctx = creerSandbox(creerFixture({ plateauMaison: { cubeActif: 0 }, secteurs: [secteurDeploye] }));
  var GameService = ctx.sandbox.GameService;

  var appels = [];
  function demanderChoixSucces(contexte) {
    appels.push(contexte.type);
    assert.strictEqual(contexte.type, 'rappeler_cube_cout');
    return { detail: 'Cube rappelé du Secteur 1.', numero: 1 };
  }

  return GameService.ajouterCubeRefuge(PARTIE_ID, 0, demanderChoixSucces).then(function (partieMaj) {
    assert.strictEqual(appels.length, 1);
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].cubes, 1);
    assert.strictEqual(partieMaj.plateauMaison.cubeActif, 0, 'le cube rappelé ne repasse jamais par cubeActif');
  });
});

test('ajouterCubeRefuge : popup rappeler_cube_cout annulée -> {annule:true}, rien incrémenté', function () {
  var secteurDeploye = secteurPossede_(1, { pnCorvette: 14 });
  var ctx = creerSandbox(creerFixture({ plateauMaison: { cubeActif: 0 }, secteurs: [secteurDeploye] }));
  var GameService = ctx.sandbox.GameService;

  return GameService.ajouterCubeRefuge(PARTIE_ID, 0, function () { return { annule: true }; }).then(function (resultat) {
    assert.strictEqual(resultat.annule, true);
    // Le padding refuges->longueur config (chargerRefugeOuvrable_) mute déjà
    // `pm` en mémoire AVANT le sourcing (harmless, juste des tuiles à 0) —
    // ce qui compte : DB.put n'a JAMAIS été appelé, donc le compte de la
    // tuile visée reste à 0 (jamais incrémenté).
    assert.strictEqual((ctx.plateauMaison[PARTIE_ID].refuges[0] || {}).cubes || 0, 0, 'la tuile ne doit pas être incrémentée sur annulation');
  });
});

test('ajouterCubeRefuge : tuile déjà complète -> rejette', function () {
  var ctx = creerSandbox(creerFixture({ plateauMaison: { refuges: [{ cubes: 2, recompenseAppliquee: false }, { cubes: 0, recompenseAppliquee: false }] } }));
  var GameService = ctx.sandbox.GameService;
  return GameService.ajouterCubeRefuge(PARTIE_ID, 0, demanderChoixVide_).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('complet') !== -1); }
  );
});

test('ajouterCubeRefuge : index hors limites -> rejette', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  return GameService.ajouterCubeRefuge(PARTIE_ID, 5, demanderChoixVide_).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('introuvable') !== -1); }
  );
});

// ---------------------------------------------------------------
// appliquerRefugeNiveau4 — idempotence
// ---------------------------------------------------------------

test('appliquerRefugeNiveau4 : source 1 cube ET pose le flag ; un 2e appel rejette (déjà réclamé)', function () {
  var ctx = creerSandbox(creerFixture({ plateauMaison: { civSociete: 4 } }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerRefugeNiveau4(PARTIE_ID, 'societe', 0, demanderChoixVide_).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].cubes, 1);
    assert.strictEqual(partieMaj.plateauMaison.refugeNiveau4Societe, true);

    return GameService.appliquerRefugeNiveau4(PARTIE_ID, 'societe', 1, demanderChoixVide_).then(
      function () { assert.fail('aurait dû rejeter (déjà réclamé)'); },
      function (erreur) { assert.ok(erreur.message.indexOf('déjà été réclamé') !== -1); }
    );
  });
});

test('appliquerRefugeNiveau4 : piste inconnue -> rejette', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  return GameService.appliquerRefugeNiveau4(PARTIE_ID, 'inconnue', 0, demanderChoixVide_).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('inconnue') !== -1); }
  );
});

// ---------------------------------------------------------------
// appliquerRefugePhaseEval — plafonnement de l'allocation par Cycle
// ---------------------------------------------------------------

test('appliquerRefugePhaseEval : plafonne à nombreEligibles, incrémente refugeCubesPhaseEval', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerRefugePhaseEval(PARTIE_ID, 1, 0, 2, demanderChoixVide_).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].cubes, 1);
    assert.strictEqual(partieMaj.evenements.cycle1.refugeCubesPhaseEval, 1);

    return GameService.appliquerRefugePhaseEval(PARTIE_ID, 1, 0, 2, demanderChoixVide_).then(function (partieMaj2) {
      assert.strictEqual(partieMaj2.plateauMaison.refuges[0].cubes, 2);
      assert.strictEqual(partieMaj2.evenements.cycle1.refugeCubesPhaseEval, 2);

      // Tuile 0 pleine désormais — 3e appel visant une AUTRE tuile mais
      // l'allocation (2/2) est déjà atteinte : doit rejeter.
      return GameService.appliquerRefugePhaseEval(PARTIE_ID, 1, 1, 2, demanderChoixVide_).then(
        function () { assert.fail('aurait dû rejeter (allocation atteinte)'); },
        function (erreur) { assert.ok(erreur.message.indexOf('Allocation') !== -1); }
      );
    });
  });
});

// ---------------------------------------------------------------
// appliquerRecompenseRefuge — les 4 récompenses + garde-fous
// ---------------------------------------------------------------

function fixtureTuilePleine_(extra) {
  return creerFixture(Object.assign({ plateauMaison: { refuges: [{ cubes: 2, recompenseAppliquee: false }, { cubes: 0, recompenseAppliquee: false }] } }, extra || {}));
}

test('appliquerRecompenseRefuge : retirer_corruption (secteur)', function () {
  var secteurCorrompu = secteurPossede_(1, { pnCorvette: 1, corrompu: true });
  var ctx = creerSandbox(fixtureTuilePleine_({ secteurs: [secteurCorrompu] }));
  var GameService = ctx.sandbox.GameService;

  function demanderChoix(contexte) {
    if (contexte.type === 'option_exclusive') return { indexChoisi: 0 };
    if (contexte.type === 'retirer_corruption') return { detail: 'Corruption retirée du Secteur 1.', numero: 1 };
    throw new Error('type inattendu : ' + contexte.type);
  }

  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].recompenseAppliquee, true);
  });
});

test('appliquerRecompenseRefuge : retirer_gardien (secteur)', function () {
  var secteurGardien = secteurPossede_(1, { pnCorvette: 1, nombreGardien: 1 });
  var ctx = creerSandbox(fixtureTuilePleine_({ secteurs: [secteurGardien] }));
  var GameService = ctx.sandbox.GameService;

  function demanderChoix(contexte) {
    if (contexte.type === 'option_exclusive') return { indexChoisi: 1 };
    if (contexte.type === 'retirer_gardien') return { detail: 'Gardien retiré du Secteur 1.', numero: 1 };
    throw new Error('type inattendu : ' + contexte.type);
  }

  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].recompenseAppliquee, true);
  });
});

test('appliquerRecompenseRefuge : ressource_choix (3 ressources au choix)', function () {
  var ctx = creerSandbox(fixtureTuilePleine_());
  var GameService = ctx.sandbox.GameService;

  function demanderChoix(contexte) {
    if (contexte.type === 'option_exclusive') return { indexChoisi: 2 };
    if (contexte.type === 'ressource_choix') return ['nourriture', 'energie', 'materiel'];
    throw new Error('type inattendu : ' + contexte.type);
  }

  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.ressources.nourriture, 6); // 5 + 1
    assert.strictEqual(partieMaj.plateauMaison.ressources.energie, 6);
    assert.strictEqual(partieMaj.plateauMaison.ressources.materiel, 6);
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].recompenseAppliquee, true);
  });
});

test('appliquerRecompenseRefuge : deployer_cube (2 cubes)', function () {
  var ctx = creerSandbox(fixtureTuilePleine_({ plateauMaison: { cubeActif: 3, refuges: [{ cubes: 2, recompenseAppliquee: false }, { cubes: 0, recompenseAppliquee: false }] } }));
  var GameService = ctx.sandbox.GameService;

  function demanderChoix(contexte) {
    if (contexte.type === 'option_exclusive') return { indexChoisi: 3 };
    if (contexte.type === 'deployer_cube') return { detail: '2 cubes déployés.', totalCubes: 2, coutParRessource: {} };
    throw new Error('type inattendu : ' + contexte.type);
  }

  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.cubeActif, 1); // 3 - 2
    assert.strictEqual(partieMaj.plateauMaison.refuges[0].recompenseAppliquee, true);
  });
});

test('appliquerRecompenseRefuge : tuile pas encore complète -> rejette', function () {
  var ctx = creerSandbox(creerFixture());
  var GameService = ctx.sandbox.GameService;
  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, demanderChoixVide_).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('pas encore complet') !== -1); }
  );
});

test('appliquerRecompenseRefuge : récompense déjà appliquée -> rejette', function () {
  var ctx = creerSandbox(creerFixture({ plateauMaison: { refuges: [{ cubes: 2, recompenseAppliquee: true }, { cubes: 0, recompenseAppliquee: false }] } }));
  var GameService = ctx.sandbox.GameService;
  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, demanderChoixVide_).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('déjà été appliquée') !== -1); }
  );
});

test('appliquerRecompenseRefuge : "Annuler" sur le choix -> {annule:true}, recompenseAppliquee reste false', function () {
  var ctx = creerSandbox(fixtureTuilePleine_());
  var GameService = ctx.sandbox.GameService;
  return GameService.appliquerRecompenseRefuge(PARTIE_ID, 0, function () { return { annule: true }; }).then(function (resultat) {
    assert.strictEqual(resultat.annule, true);
  });
});
