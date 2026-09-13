// Test fumée node --test pour GameService.appliquerGainObjectif/
// gainObjectifAutomatisable (chantier "Application automatique élargie
// des Objectifs galactiques — Lot 1", retour utilisateur 13/09/2026) —
// mock DB minimal en mémoire (vm, pas de dépendance npm), charge les
// VRAIS focusEngine.js + gameService.js. MÊME principe que
// test_gameService_cadreChoixCube.js (appliquerCadreChoixFocusEngine) :
// une ligne d'Objectif "exploit"/mode "unique"/1 gain partage le même
// vocabulaire `{cle, valeur}` qu'une option de Cadre "choix", donc le
// même moteur FocusEngine.resoudreEffet.
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function ligneObjectif_(type, recompense, texte) {
  return { type: type, texte: texte || 'texte objectif', recompense: recompense };
}

function creerFixtureBase(objectifsBlocs) {
  var evenementCycle1 = {
    code: 'X', cycle: 1,
    cadres: [],
    cadresAppliques: {},
    objectifs: { blocs: objectifsBlocs }
  };

  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-09-13', archivee: false, scenarioId: 'scn1',
    cycleNum: 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: evenementCycle1, cycle2: null, cycle3: null } }
  };
  var lignePlateauMaison = {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {},
    programmesEnMain: [], programmesUtilises: [null, null, null, null], offresProgramme: []
  };
  return { lignePartie: lignePartie, lignePlateauMaison: lignePlateauMaison };
}

function creerSandbox(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;
  var historique = [];

  var DB = {
    get: function (table, cle) {
      if (table === 'parties') return Promise.resolve(parties[cle]);
      if (table === 'plateauMaison') return Promise.resolve(plateauMaison[cle]);
      return Promise.resolve(null);
    },
    put: function (table, ligne) {
      if (table === 'parties') parties[ligne.id] = ligne;
      if (table === 'plateauMaison') plateauMaison[ligne.partieId] = ligne;
      if (table === 'historique') historique.push(ligne);
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

// ---------------------------------------------------------------
// gainObjectifAutomatisable
// ---------------------------------------------------------------

test('gainObjectifAutomatisable : true pour une ligne exploit/unique/1 gain à clé résolvable', function () {
  var ctx = creerSandbox(creerFixtureBase([]));
  var GameService = ctx.sandbox.GameService;
  var ligne = ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1 }] });
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligne), true);
});

test('gainObjectifAutomatisable : false pour type "multiplicateur" (même mode unique/1 gain)', function () {
  var ctx = creerSandbox(creerFixtureBase([]));
  var GameService = ctx.sandbox.GameService;
  var ligne = ligneObjectif_('multiplicateur', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1 }] });
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligne), false);
});

test('gainObjectifAutomatisable : false si mode != unique, ou plusieurs gains, ou gain.par/formule/bareme présent', function () {
  var ctx = creerSandbox(creerFixtureBase([]));
  var GameService = ctx.sandbox.GameService;
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligneObjectif_('exploit', { mode: 'libre', gains: [{ cle: 'retirer_corruption', valeur: 1 }] })), false);
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1 }, { cle: 'prime', valeur: 1 }] })), false);
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligneObjectif_('multiplicateur', { mode: 'unique', gains: [{ cle: 'augmenter_population_pure', valeur: 1, par: 'secteur_pur_avec_guilde_scientifique' }] })), false);
});

test('gainObjectifAutomatisable : false pour un gain Influence (déjà couvert par le mécanisme existant, jamais de double bouton)', function () {
  var ctx = creerSandbox(creerFixtureBase([]));
  var GameService = ctx.sandbox.GameService;
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'influence', valeur: 5 }] })), false);
});

test('gainObjectifAutomatisable : false pour une clé non couverte (ex. produire_type_ressource, choix du joueur non modélisé)', function () {
  var ctx = creerSandbox(creerFixtureBase([]));
  var GameService = ctx.sandbox.GameService;
  assert.strictEqual(GameService.gainObjectifAutomatisable(ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'produire_type_ressource', valeur: 2, quantite: 'jusqu_a' }] })), false);
});

// ---------------------------------------------------------------
// appliquerGainObjectif — dispatch par clé
// ---------------------------------------------------------------

test('appliquerGainObjectif : retirer_corruption -> délègue à demanderChoix, marque objectifsAppliques', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1, cible: 'secteur_au_choix' }] }, 'Retirez une Corruption.')] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  var appelsDemanderChoix = [];
  function demanderChoix(contexte) {
    appelsDemanderChoix.push(contexte);
    assert.strictEqual(contexte.type, 'retirer_corruption');
    return { detail: 'Corruption retirée du Secteur 3.' };
  }

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(appelsDemanderChoix.length, 1);
    var evenementCycle1 = partieMaj.evenements.cycle1;
    assert.ok(evenementCycle1.objectifsAppliques['0:0']);
    assert.ok(evenementCycle1.objectifsAppliques['0:0'].resume.indexOf('Corruption retirée du Secteur 3') !== -1);
  });
});

test('appliquerGainObjectif : avancer_civilisation -> délègue à demanderChoix (piste au choix)', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'avancer_civilisation', valeur: 1 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  function demanderChoix(contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    return { detail: 'Piste Économie avancée au Niveau 2.' };
  }

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.objectifsAppliques['0:0']);
  });
});

test('appliquerGainObjectif : technologie_base_ou_amelioree -> mappe vers gagner_technologie avec niveaux [base, amelioree]', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'technologie_base_ou_amelioree', valeur: 1 }] }, 'Gagnez une Technologie.')] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  function demanderChoix(contexte) {
    assert.strictEqual(contexte.type, 'gagner_technologie');
    assert.strictEqual(JSON.stringify(contexte.niveaux), JSON.stringify(['base', 'amelioree']));
    return { detail: 'Technologie Robotique (base) obtenue.' };
  }

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.objectifsAppliques['0:0']);
  });
});

test('appliquerGainObjectif : "programme" et "gagner_programme" (2 orthographes catalogue) mappent tous 2 vers la popup gagner_programme', function () {
  var objectifs = [{ lignes: [
    ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'programme', valeur: 1 }] }),
    ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'gagner_programme', valeur: 1 }] })
  ] }];

  function verifie_(blocIndex, ligneIndex) {
    var ctx = creerSandbox(creerFixtureBase(objectifs));
    var GameService = ctx.sandbox.GameService;
    function demanderChoix(contexte) {
      assert.strictEqual(contexte.type, 'gagner_programme');
      return { detail: 'Programme "Poigne de Fer" (Force) obtenu.' };
    }
    return GameService.appliquerGainObjectif(PARTIE_ID, 1, blocIndex, ligneIndex, demanderChoix).then(function (partieMaj) {
      assert.ok(partieMaj.evenements.cycle1.objectifsAppliques[blocIndex + ':' + ligneIndex]);
    });
  }

  return verifie_(0, 0).then(function () { return verifie_(0, 1); });
});

test('appliquerGainObjectif : construire_installation -> délègue à demanderChoix (construction)', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'construire_installation', valeur: 1 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  function demanderChoix() { return { detail: 'Défense de Secteur construite sur le Secteur 2.' }; }

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.objectifsAppliques['0:0']);
  });
});

test('appliquerGainObjectif : prime -> ouvre la popup "option_exclusive" (récompense de jeton Prime), crédite jetonPrime', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'prime', valeur: 1 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  // TOKENS_PRIME_[0] : "Gagnez 2 Nourriture ou 1 Influence." — indexChoisi:0
  // à chaque appel (jeton PUIS choix interne) -> "2 Nourriture".
  function demanderChoix(contexte) {
    assert.strictEqual(contexte.type, 'option_exclusive');
    return { indexChoisi: 0 };
  }

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(partieMaj.plateauMaison.jetonPrime, 1);
    assert.strictEqual(partieMaj.plateauMaison.ressources.nourriture, 7); // 5 + 2
    assert.ok(partieMaj.evenements.cycle1.objectifsAppliques['0:0']);
  });
});

// ---------------------------------------------------------------
// Garde-fous
// ---------------------------------------------------------------

test('appliquerGainObjectif : déjà appliqué -> rejette, ne rappelle pas demanderChoix', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;
  var appels = 0;
  function demanderChoix() { appels++; return { detail: 'ok' }; }

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix)
    .then(function () {
      return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, demanderChoix).then(
        function () { assert.fail('aurait dû rejeter (déjà appliqué)'); },
        function (erreur) {
          assert.ok(erreur.message.indexOf('déjà été appliqué') !== -1);
          assert.strictEqual(appels, 1, 'demanderChoix ne doit pas être rappelé pour une ligne déjà appliquée');
        }
      );
    });
});

test('appliquerGainObjectif : type "multiplicateur" -> rejette, jamais résolu comme un simple gain unique', function () {
  var objectifs = [{ lignes: [ligneObjectif_('multiplicateur', { mode: 'unique', gains: [{ cle: 'augmenter_population_pure', valeur: 1, par: 'secteur_pur_avec_guilde_scientifique', plafond_occurrences: 3 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, function () { return { detail: 'ok' }; }).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('type non pris en charge') !== -1); }
  );
});

test('appliquerGainObjectif : "Annuler" sur la popup -> {annule:true}, objectifsAppliques PAS marqué (réessayable)', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 0, function () { return { annule: true }; }).then(function (resultat) {
    assert.strictEqual(resultat.annule, true);
    assert.strictEqual(Object.keys((ctx.parties[PARTIE_ID].etatJson.evenements.cycle1.objectifsAppliques) || {}).length, 0);
  });
});

test('appliquerGainObjectif : ligne introuvable (blocIndex/ligneIndex hors catalogue) -> rejette', function () {
  var objectifs = [{ lignes: [ligneObjectif_('exploit', { mode: 'unique', gains: [{ cle: 'retirer_corruption', valeur: 1 }] })] }];
  var ctx = creerSandbox(creerFixtureBase(objectifs));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerGainObjectif(PARTIE_ID, 1, 0, 5, function () { return { detail: 'ok' }; }).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('introuvable') !== -1); }
  );
});
