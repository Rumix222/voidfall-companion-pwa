// Test fumée node --test — GameService.appliquerCadreCorruptionOffreProgramme /
// cadreCorruptionOffreProgrammeAutomatisable (effet "Placer une Corruption
// sur l'offre de Programme" d'un Cadre d'Événement galactique, type "gain",
// cible "offre_programme"/"chaque_offre_programme_non_corrompue" — voir
// data/catalogue/evenements.json, ex. Événement A/Cycle2 cadre 2). Retour
// utilisateur (28/08/2026) : "L'effet placer une corruption des événements
// peu maintenant être automatisé. Exemple événement À cycle 2" — jusqu'ici
// ce cadre retombait sur appliquerCadreManuel (aucun delta), devenu
// automatisable depuis que plateauMaison.offresProgramme suit réellement
// l'état Corrompu de chaque offre.
//
// Mock DB minimal en mémoire (vm, pas de dépendance npm), même principe
// que gameService_cadre_gain_corruption_test.js.
//
// ⚠️ Comparaisons de tableaux renvoyés par le code chargé en vm :
// JSON.stringify plutôt qu'assert.deepStrictEqual (voir
// secteurService_actions.test.js pour l'explication du "realm" vm).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerFixture_(effetCadre, offresProgramme) {
  var evenementCycle2 = {
    code: 'A', cycle: 2, cadres: [
      { ordre: 2, obligatoire: true, resolution: 'unique', texte: 'Placez une Corruption sur l\'offre de Programme Force.', effet: effetCadre }
    ],
    cadresAppliques: {}
  };

  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-08-28', archivee: false, scenarioId: 'scn1',
    cycleNum: 2, cycleTermine: false,
    etatJson: { evenements: { cycle1: null, cycle2: evenementCycle2, cycle3: null } }
  };
  var lignePlateauMaison = {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}, civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false,
    offresProgramme: offresProgramme || [
      { type: 'Domination', nom: null, corrompu: false },
      { type: 'Force', nom: null, corrompu: false },
      { type: 'Soutien', nom: null, corrompu: false },
      { type: 'Richesse', nom: null, corrompu: false }
    ]
  };
  return { lignePartie: lignePartie, lignePlateauMaison: lignePlateauMaison };
}

function creerSandbox_(fixture) {
  var parties = {}; parties[PARTIE_ID] = fixture.lignePartie;
  var plateauMaison = {}; plateauMaison[PARTIE_ID] = fixture.lignePlateauMaison;

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
  vm.runInContext(fs.readFileSync(__dirname + '/gameService.js', 'utf8'), sandbox, { filename: 'gameService.js' });
  return { sandbox: sandbox, parties: parties, plateauMaison: plateauMaison };
}

// ---------------------------------------------------------------
// cadreCorruptionOffreProgrammeAutomatisable
// ---------------------------------------------------------------

test('cadreCorruptionOffreProgrammeAutomatisable : offre_programme (cible_detail connu) -> true', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;
  ['programme_domination', 'programme_force', 'programme_soutien', 'programme_richesse'].forEach(function (detail) {
    assert.strictEqual(GameService.cadreCorruptionOffreProgrammeAutomatisable(
      { effet: { type: 'gain', cible: 'offre_programme', cible_detail: detail, elements: { corruption: 1 } } }
    ), true, detail);
  });
});

test('cadreCorruptionOffreProgrammeAutomatisable : chaque_offre_programme_non_corrompue -> true', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;
  assert.strictEqual(GameService.cadreCorruptionOffreProgrammeAutomatisable(
    { effet: { type: 'gain', cible: 'chaque_offre_programme_non_corrompue', elements: { corruption: 1 } } }
  ), true);
});

test('cadreCorruptionOffreProgrammeAutomatisable : cible_detail inconnu / elements composés / effet_conditionnel -> false', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;
  assert.strictEqual(GameService.cadreCorruptionOffreProgrammeAutomatisable(
    { effet: { type: 'gain', cible: 'offre_programme', cible_detail: 'programme_inconnu', elements: { corruption: 1 } } }
  ), false);
  assert.strictEqual(GameService.cadreCorruptionOffreProgrammeAutomatisable(
    { effet: { type: 'gain', cible: 'offre_programme', cible_detail: 'programme_force', elements: { corruption: 1, influence: 2 } } }
  ), false);
  assert.strictEqual(GameService.cadreCorruptionOffreProgrammeAutomatisable(
    { effet: { type: 'gain', cible: 'offre_programme', cible_detail: 'programme_force', elements: { corruption: 1 }, effet_conditionnel: { si_cible: 'x' } } }
  ), false);
  // Cible reconnue par l'AUTRE mécanisme (gagner_corruption), pas celui-ci.
  assert.strictEqual(GameService.cadreCorruptionOffreProgrammeAutomatisable(
    { effet: { type: 'gain', cible: 'secteur_au_choix', elements: { corruption: 1 } } }
  ), false);
});

// ---------------------------------------------------------------
// appliquerCadreCorruptionOffreProgramme
// ---------------------------------------------------------------

test('appliquerCadreCorruptionOffreProgramme : cible fixe (programme_force) — corrompt UNIQUEMENT cette offre', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'offre_programme', cible_detail: 'programme_force', elements: { corruption: 1 } }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreCorruptionOffreProgramme(PARTIE_ID, 2, 2).then(function (partie) {
    var offres = ctx.plateauMaison[PARTIE_ID].offresProgramme;
    assert.strictEqual(JSON.stringify(offres.map(function (o) { return o.type + ':' + o.corrompu; })),
      JSON.stringify(['Domination:false', 'Force:true', 'Soutien:false', 'Richesse:false']));
    var applique = ctx.parties[PARTIE_ID].etatJson.evenements.cycle2.cadresAppliques[2];
    assert.strictEqual(applique.resume, 'Corruption placée sur l’offre de Programme Force.');
    assert.ok(applique.le);
  });
});

test('appliquerCadreCorruptionOffreProgramme : chaque_offre_programme_non_corrompue — corrompt les 4, idempotent sur celle déjà Corrompue', function () {
  var fixture = creerFixture_(
    { type: 'gain', cible: 'chaque_offre_programme_non_corrompue', elements: { corruption: 1 } },
    [
      { type: 'Domination', nom: null, corrompu: true },
      { type: 'Force', nom: 'Truc', corrompu: false },
      { type: 'Soutien', nom: null, corrompu: false },
      { type: 'Richesse', nom: null, corrompu: false }
    ]
  );
  var ctx = creerSandbox_(fixture);
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreCorruptionOffreProgramme(PARTIE_ID, 2, 2).then(function () {
    var offres = ctx.plateauMaison[PARTIE_ID].offresProgramme;
    assert.strictEqual(JSON.stringify(offres.map(function (o) { return o.type + ':' + o.corrompu; })),
      JSON.stringify(['Domination:true', 'Force:true', 'Soutien:true', 'Richesse:true']));
    // "nom" (Programme actuellement révélé) n'est jamais touché par cette écriture.
    assert.strictEqual(offres[1].nom, 'Truc');
  });
});

test('appliquerCadreCorruptionOffreProgramme : cadre non automatisable — rejette explicitement', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'secteur_au_choix', elements: { corruption: 1 } }));
  var GameService = ctx.sandbox.GameService;
  return assert.rejects(
    GameService.appliquerCadreCorruptionOffreProgramme(PARTIE_ID, 2, 2),
    /pas automatisable/
  );
});

test('appliquerCadreCorruptionOffreProgramme : double application -> rejetée (garde-fou déjà appliqué)', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'offre_programme', cible_detail: 'programme_force', elements: { corruption: 1 } }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreCorruptionOffreProgramme(PARTIE_ID, 2, 2).then(function () {
    return assert.rejects(
      GameService.appliquerCadreCorruptionOffreProgramme(PARTIE_ID, 2, 2),
      /déjà été appliqué/
    );
  });
});
