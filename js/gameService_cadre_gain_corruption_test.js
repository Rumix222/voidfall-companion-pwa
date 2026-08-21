// Test fumée node --test — GameService.appliquerCadreGainCorruption /
// cadreGainCorruptionAutomatisable (effet "Gagner une Corruption" d'un
// Cadre d'Événement galactique, type "gain" — voir
// docs-rules-corruption-gardiens-refuges-technoConsume.md §1). Mock DB
// minimal en mémoire (vm, pas de dépendance npm), même principe que
// test_gameService_cadreChoixCube.js — mais SANS focusEngine.js : cette
// mécanique ne l'utilise pas (chaque popup 'gagner_corruption' fait sa
// propre persistance côté strategieService.js, hors périmètre ici —
// demanderChoix est ici un simple mock qui ne persiste rien).
//
// ⚠️ Comparaisons de tableaux renvoyés par le code chargé en vm :
// JSON.stringify plutôt qu'assert.deepStrictEqual (voir
// secteurService_actions.test.js pour l'explication du "realm" vm).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerFixture_(effetCadre) {
  var evenementCycle1 = {
    code: 'X', cycle: 1, cadres: [
      { ordre: 1, obligatoire: true, resolution: 'par_joueur', texte: 'Gagnez une Corruption.', effet: effetCadre }
    ],
    cadresAppliques: {}
  };

  var lignePartie = {
    id: PARTIE_ID, dateCreation: '2026-08-21', archivee: false, scenarioId: 'scn1',
    cycleNum: 1, cycleTermine: false,
    etatJson: { evenements: { cycle1: evenementCycle1, cycle2: null, cycle3: null } }
  };
  var lignePlateauMaison = {
    partieId: PARTIE_ID, ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 5, ressourceScience: 5, influence: 0, cubeActif: 3,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    technologiesObtenues: [null, null, null, null, null], technologiesAvanceesChoisies: [null, null, null, null],
    technologiesAvanceesAmeliorees: {}, civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false
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
// cadreGainCorruptionAutomatisable
// ---------------------------------------------------------------

test('cadreGainCorruptionAutomatisable : cibles simples/repli/cible_options reconnues -> true', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible: 'secteur_au_choix', elements: { corruption: 1 } } }
  ), true);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable({
    effet: {
      type: 'gain', cible: 'piste_civilisation', elements: { corruption: 1 },
      repli: { condition: 'toutes_pistes_civilisation_corrompues', cibles_possibles: ['emplacement_programme', 'secteur_au_choix', 'carte_technologie_chambres_decontamination'] }
    }
  }), true);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 } } }
  ), true);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible: 'fiche_maison', elements: { corruption: 2 } } }
  ), true);
});

// 21/08/2026 : reste volontairement manuel — offre_programme (comme
// demandé par l'utilisateur), cadre composé (élément autre que
// "corruption"), cible contextuelle non modélisée, et effet_conditionnel
// (une piste de Civilisation devrait en plus avancer — voir JSDoc de
// resoudreCiblesCadreGainCorruption_, gameService.js).
test('cadreGainCorruptionAutomatisable : offre_programme / cadre composé / cible inconnue / effet_conditionnel -> false', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible: 'offre_programme', cible_detail: 'programme_domination', elements: { corruption: 1 } } }
  ), false);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible: 'chaque_offre_programme_non_corrompue', elements: { corruption: 1 } } }
  ), false);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible: 'meme_secteur_que_etape_precedente', elements: { corruption: 1 }, restriction: 'stockage_chambres_decontamination_interdit' } }
  ), false);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable({
    effet: {
      type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 },
      effet_conditionnel: { si_cible: 'piste_civilisation', condition: 'marqueur_pas_case_la_plus_a_droite', consequence: {} }
    }
  }), false);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'gain', cible: 'secteur_au_choix', elements: { corruption: 1, gloire: 1 } } }
  ), false);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(
    { effet: { type: 'placement', zone: 'secteur_neant_adjacent', elements: { corruption: 1 } } }
  ), false);

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable(null), false);
});

// ---------------------------------------------------------------
// appliquerCadreGainCorruption
// ---------------------------------------------------------------

test('appliquerCadreGainCorruption : succès (1 corruption) — cadre marqué appliqué, ciblesAutorisees/ciblesRepli/exclureTechno transmis', function () {
  var ctx = creerSandbox_(creerFixture_({
    type: 'gain', cible: 'piste_civilisation', elements: { corruption: 1 },
    repli: { cibles_possibles: ['emplacement_programme', 'secteur_au_choix', 'carte_technologie_chambres_decontamination'] }
  }));
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_corruption');
    assert.strictEqual(contexte.partieId, PARTIE_ID);
    assert.strictEqual(JSON.stringify(contexte.ciblesAutorisees), JSON.stringify(['piste']));
    assert.strictEqual(JSON.stringify(contexte.ciblesRepli), JSON.stringify(['programme', 'secteur', 'techno']));
    assert.strictEqual(contexte.exclureTechno, false);
    return { detail: 'Corruption placée sur la piste Gouvernement.', piste: 'gouvernement' };
  };

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
    assert.strictEqual(partieMaj.evenements.cycle1.cadresAppliques[1].resume, 'Corruption placée sur la piste Gouvernement.');

    return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, demanderChoix).then(
      function () { throw new Error('aurait dû rejeter (déjà appliqué)'); },
      function (erreur) { assert.ok(/déjà été appliqué/.test(erreur.message)); }
    );
  });
});

test('appliquerCadreGainCorruption : Annuler sur la première popup — {annule:true}, cadre PAS marqué appliqué', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'secteur_au_choix', elements: { corruption: 1 } }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, function () { return { annule: true }; })
    .then(function (resultat) {
      assert.strictEqual(resultat.annule, true);
      return ctx.sandbox.DB.get('parties', PARTIE_ID);
    })
    .then(function (lignePartie) {
      assert.strictEqual(lignePartie.etatJson.evenements.cycle1.cadresAppliques[1], undefined);
    });
});

// 21/08/2026 (Cadre "Gagnez deux Corruption... sur des emplacements de
// Programme, si possible...", cible: emplacement_programme, elements:
// {corruption:2}) : Annuler APRÈS au moins un placement réussi ne
// renvoie PAS {annule:true} — le cadre est marqué appliqué avec le
// résumé PARTIEL (voir JSDoc gameService.js).
test('appliquerCadreGainCorruption : quantité 2, Annuler après le 1er placement — marqué appliqué, résumé partiel', function () {
  var ctx = creerSandbox_(creerFixture_({
    type: 'gain', cible: 'emplacement_programme', elements: { corruption: 2 },
    repli: { mode: 'excedent', cibles_possibles: ['piste_civilisation', 'secteur_au_choix', 'carte_technologie_chambres_decontamination'] }
  }));
  var GameService = ctx.sandbox.GameService;

  var appel = 0;
  var demanderChoix = function () {
    appel++;
    if (appel === 1) return { detail: 'Corruption placée sur un emplacement de Programme (manuellement).' };
    return { annule: true };
  };

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(appel, 2);
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
    assert.strictEqual(
      partieMaj.evenements.cycle1.cadresAppliques[1].resume,
      'Corruption placée sur un emplacement de Programme (manuellement).'
    );
  });
});

test('appliquerCadreGainCorruption : quantité 2, les deux réussissent — résumé concatène les deux détails', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'emplacement_programme', elements: { corruption: 2 } }));
  var GameService = ctx.sandbox.GameService;

  var appel = 0;
  var demanderChoix = function () {
    appel++;
    return { detail: 'Corruption #' + appel + ' placée.' };
  };

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, demanderChoix).then(function (partieMaj) {
    assert.strictEqual(appel, 2);
    assert.strictEqual(partieMaj.evenements.cycle1.cadresAppliques[1].resume, 'Corruption #1 placée. Corruption #2 placée.');
  });
});

// ---------------------------------------------------------------
// 21/08/2026 (Événement galactique G, Cycle 1, Cadre 1 "Le visage du mal" —
// voir en-tête de fichier gameService.js v22) : effet_conditionnel reconnu
// UNIQUEMENT quand il correspond exactement au gabarit de ce Cadre.
// ---------------------------------------------------------------

test('cadreGainCorruptionAutomatisable : effet_conditionnel EXACT du Cadre G/Cycle1/1 -> true', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable({
    effet: {
      type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 },
      effet_conditionnel: {
        si_cible: 'piste_civilisation', condition: 'marqueur_pas_case_la_plus_a_droite',
        consequence: { cle: 'avancer_piste_civilisation', valeur: 1, note: 'ignorer_le_benefice_de_la_case_atteinte' }
      }
    }
  }), true);
});

test('cadreGainCorruptionAutomatisable : effet_conditionnel proche mais DIFFÉRENT (autre cle/valeur/condition) -> false', function () {
  var ctx = creerSandbox_(creerFixture_({}));
  var GameService = ctx.sandbox.GameService;

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable({
    effet: {
      type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 },
      effet_conditionnel: { si_cible: 'piste_civilisation', condition: 'autre_condition', consequence: { cle: 'avancer_piste_civilisation', valeur: 1 } }
    }
  }), false, 'condition différente');

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable({
    effet: {
      type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 },
      effet_conditionnel: { si_cible: 'piste_civilisation', condition: 'marqueur_pas_case_la_plus_a_droite', consequence: { cle: 'autre_chose', valeur: 1 } }
    }
  }), false, 'cle de conséquence différente');

  assert.strictEqual(GameService.cadreGainCorruptionAutomatisable({
    effet: {
      type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 },
      effet_conditionnel: { si_cible: 'piste_civilisation', condition: 'marqueur_pas_case_la_plus_a_droite', consequence: { cle: 'avancer_piste_civilisation', valeur: 2 } }
    }
  }), false, 'valeur différente');
});

test('appliquerCadreGainCorruption : Cadre G/Cycle1/1 — transmet avancerPisteApresPlacement=true à la popup', function () {
  var ctx = creerSandbox_(creerFixture_({
    type: 'gain', cible_options: ['emplacement_programme', 'piste_civilisation'], elements: { corruption: 1 },
    effet_conditionnel: {
      si_cible: 'piste_civilisation', condition: 'marqueur_pas_case_la_plus_a_droite',
      consequence: { cle: 'avancer_piste_civilisation', valeur: 1 }
    }
  }));
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_corruption');
    assert.strictEqual(contexte.avancerPisteApresPlacement, true);
    assert.strictEqual(JSON.stringify(contexte.ciblesAutorisees), JSON.stringify(['programme', 'piste']));
    return { detail: 'Corruption placée sur la piste Gouvernement (piste Corrompue). Piste avancée d’une case.', piste: 'gouvernement' };
  };

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
  });
});

test('appliquerCadreGainCorruption : cadre sans effet_conditionnel — avancerPisteApresPlacement=false transmis à la popup', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'piste_civilisation', elements: { corruption: 1 } }));
  var GameService = ctx.sandbox.GameService;

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.avancerPisteApresPlacement, false);
    return { detail: 'Corruption placée sur la piste Économie.', piste: 'economie' };
  };

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, demanderChoix).then(function (partieMaj) {
    assert.ok(partieMaj.evenements.cycle1.cadresAppliques[1]);
  });
});

test('appliquerCadreGainCorruption : cadre non automatisable (offre_programme) — rejette explicitement', function () {
  var ctx = creerSandbox_(creerFixture_({ type: 'gain', cible: 'offre_programme', cible_detail: 'programme_force', elements: { corruption: 1 } }));
  var GameService = ctx.sandbox.GameService;

  return GameService.appliquerCadreGainCorruption(PARTIE_ID, 1, 1, function () {
    throw new Error('demanderChoix ne devrait pas être appelé');
  }).then(
    function () { throw new Error('aurait dû rejeter (non automatisable)'); },
    function (erreur) { assert.ok(/pas automatisable/.test(erreur.message)); }
  );
});
