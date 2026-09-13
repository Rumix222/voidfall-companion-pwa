/**
 * Test fumée — objectifsService.js (évaluation des conditions
 * d'Objectifs galactiques, Lot 1 : lignes "exploit" uniquement)
 * Exécution : node --test objectifsService.test.js
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function chargerDansContexte_() {
  var code = fs.readFileSync(__dirname + '/objectifsService.js', 'utf8');
  var ctx = { console: console, Object: Object, Array: Array };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'objectifsService.js' });
  return ctx;
}

function contexteDeBase_(extra) {
  return Object.assign({
    entretienTotal: 0, entretienRestant: 0, entretienSecteurs: 0,
    technologiesTotal: 0,
    corruptionMaison: 0,
    gloire: [],
    civilisation: { societe: 0, gouvernement: 0, economie: 0, corrompues: { societe: false, gouvernement: false, economie: false } },
    ressources: { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 },
    secteursPurs: [],
    secteursPossedes: [],
    installationsPuresTotal: 0, defenseOuBaseStellairePureTotal: 0,
    guildesPuresTotal: 0, guildeBanquierPureTotal: 0, guildeScientifiquePureTotal: 0,
    populationPureTotale: 0,
    programmesNonDepart: []
  }, extra || {});
}

// ---------------------------------------------------------------
// Clés simples (comparaison directe sur un champ du contexte)
// ---------------------------------------------------------------

test('entretien_total_min / entretien_total_max', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ entretienTotal: 8 });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'entretien_total_min', valeur: 8 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'entretien_total_min', valeur: 9 }, ctx), false);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'entretien_total_max', valeur: 6 }, ctx), false);
});

test('entretien_total_min ET entretien_integralement_satisfait (composé "et", Événement A/I)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var condition = { et: [{ cle: 'entretien_total_min', valeur: 8 }, { cle: 'entretien_integralement_satisfait', valeur: true }] };

  assert.strictEqual(ObjectifsService.evaluerCondition(condition, contexteDeBase_({ entretienTotal: 8, entretienRestant: 0 })), true);
  assert.strictEqual(ObjectifsService.evaluerCondition(condition, contexteDeBase_({ entretienTotal: 8, entretienRestant: 2 })), false, 'Entretien pas intégralement payé');
  assert.strictEqual(ObjectifsService.evaluerCondition(condition, contexteDeBase_({ entretienTotal: 5, entretienRestant: 0 })), false, 'Entretien total insuffisant');
});

test('technologie_total_min et technologie_base_ou_amelioree_total_min utilisent le même compte', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ technologiesTotal: 5 });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'technologie_total_min', valeur: 3 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'technologie_base_ou_amelioree_total_min', valeur: 5 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'technologie_base_ou_amelioree_total_min', valeur: 6 }, ctx), false);
});

test('corruption_maison / corruption_fiche_maison : même champ (jamais Chambres de décontamination)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ corruptionMaison: 0 });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'corruption_maison', valeur: 0 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'corruption_fiche_maison', valeur: 0 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'corruption_maison', valeur: 0 }, contexteDeBase_({ corruptionMaison: 1 })), false);
});

test('corruption_maison_et_secteurs_max : somme corruptionMaison + secteurs corrompus possédés', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ corruptionMaison: 0, secteursPossedes: [{ corrompu: true, cubes: 1 }, { corrompu: false, cubes: 2 }] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'corruption_maison_et_secteurs_max', valeur: 1 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'corruption_maison_et_secteurs_max', valeur: 0 }, ctx), false);
});

// ---------------------------------------------------------------
// Jetons Gloire
// ---------------------------------------------------------------

test('jetons_gloire_min / jetons_gloire_exact / gloire_valeur_min / gloire_valeur_totale_min', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ gloire: [2, 5, 1] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_min', valeur: 3 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_exact', valeur: 3 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_exact', valeur: 4 }, ctx), false);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'gloire_valeur_min', valeur: 4 }, ctx), true, 'un jeton de valeur 5 >= 4');
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'gloire_valeur_min', valeur: 6 }, ctx), false);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'gloire_valeur_totale_min', valeur: 8 }, ctx), true, '2+5+1=8');
});

// ---------------------------------------------------------------
// Secteurs Purs / secteurs possédés
// ---------------------------------------------------------------

test('secteur_pur_avec_guilde_banquier_min : compte les secteurs Purs AVEC au moins 1 Guilde Banquiers', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({
    secteursPurs: [{ guildeBanquiers: 1 }, { guildeBanquiers: 2 }, { guildeBanquiers: 0 }]
  });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteur_pur_avec_guilde_banquier_min', valeur: 2 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteur_pur_avec_guilde_banquier_min', valeur: 3 }, ctx), false);
});

test('secteur_pur_population_min : {seuil_population, nombre_secteurs_min}', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ secteursPurs: [{ population: 5 }, { population: 6 }, { population: 3 }] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteur_pur_population_min', seuil_population: 5, nombre_secteurs_min: 2 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteur_pur_population_min', seuil_population: 5, nombre_secteurs_min: 3 }, ctx), false);
});

test('secteurs_purs_avec_cubes_min : {valeur:{count, cubes_min}}', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ secteursPurs: [{ cubes: 2 }, { cubes: 3 }, { cubes: 1 }] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteurs_purs_avec_cubes_min', valeur: { count: 2, cubes_min: 2 } }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteurs_purs_avec_cubes_min', valeur: { count: 3, cubes_min: 2 } }, ctx), false);
});

test('secteurs_min / cubes_secteurs_min : portent sur secteursPossedes (Purs ET Corrompus)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ secteursPossedes: [{ corrompu: false, cubes: 3 }, { corrompu: true, cubes: 2 }, { corrompu: false, cubes: 1 }] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteurs_min', valeur: 3 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'secteurs_min', valeur: 4 }, ctx), false);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'cubes_secteurs_min', valeur: 6 }, ctx), true, '3+2+1=6');
});

// ---------------------------------------------------------------
// Civilisation / ressources / Programmes
// ---------------------------------------------------------------

test('civilisation_pure_niveau_min : ignore les pistes Corrompues', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctxCorrompue = contexteDeBase_({ civilisation: { societe: 3, gouvernement: 0, economie: 0, corrompues: { societe: true, gouvernement: false, economie: false } } });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'civilisation_pure_niveau_min', valeur: 1 }, ctxCorrompue), false, 'seule piste au niveau >=1 est Corrompue');

  var ctxPure = contexteDeBase_({ civilisation: { societe: 3, gouvernement: 0, economie: 0, corrompues: { societe: false, gouvernement: false, economie: false } } });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'civilisation_pure_niveau_min', valeur: 1 }, ctxPure), true);
});

test('ressource_reserve_min : au moins UN type de ressource atteint le seuil', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ ressources: { nourriture: 2, energie: 10, materiel: 0, credit: 0, science: 0 } });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'ressource_reserve_min', valeur: 10 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'ressource_reserve_min', valeur: 11 }, ctx), false);
});

test('programme_pur_en_jeu_hors_depart(_disponible) : emplacement occupé ET pas Corrompu', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctxAvecProgrammePur = contexteDeBase_({ programmesNonDepart: [{ nom: 'X', corrompu: false }, { nom: null, corrompu: false }] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'programme_pur_en_jeu_hors_depart', valeur: 1 }, ctxAvecProgrammePur), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'programme_pur_en_jeu_hors_depart_disponible', valeur: true }, ctxAvecProgrammePur), true);

  var ctxSeulementCorrompu = contexteDeBase_({ programmesNonDepart: [{ nom: 'X', corrompu: true }] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'programme_pur_en_jeu_hors_depart', valeur: 1 }, ctxSeulementCorrompu), false);
});

// ---------------------------------------------------------------
// Clés non couvertes / evaluerObjectifs
// ---------------------------------------------------------------

test('evaluerCondition : clé inconnue -> null (jamais une approximation)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_catastrophe_plateau_crise', valeur: 0 }, contexteDeBase_()), null);
});

test('evaluerCondition : "et" avec une sous-condition non couverte -> null (jamais une approximation partielle)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var condition = { et: [{ cle: 'entretien_total_min', valeur: 1 }, { cle: 'focus_preferes_absents_de_defausse', valeur: true }] };
  assert.strictEqual(ObjectifsService.evaluerCondition(condition, contexteDeBase_({ entretienTotal: 5 })), null);
});

test('evaluerObjectifs : parcourt tous les blocs/lignes, "multiplicateur"/"formule" restent rempli=null', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var objectifs = {
    blocs: [
      { lignes: [{ type: 'exploit', condition: { cle: 'entretien_total_min', valeur: 1 } }] },
      { separateur_avant: 'OU', lignes: [{ type: 'multiplicateur', recompense: {} }, { type: 'formule', recompense: {} }] }
    ]
  };
  var resultats = ObjectifsService.evaluerObjectifs(objectifs, contexteDeBase_({ entretienTotal: 5 }));
  assert.strictEqual(resultats.length, 3);
  assert.strictEqual(resultats[0].rempli, true);
  assert.strictEqual(resultats[1].rempli, null);
  assert.strictEqual(resultats[2].rempli, null);
});
