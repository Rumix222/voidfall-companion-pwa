/**
 * Test fumée — objectifsService.js (évaluation des Objectifs galactiques
 * — Lot 1 : lignes "exploit" ; Lot 2 : lignes "multiplicateur")
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
    cubeActif: 0, cubesSecteurPurTotal: 0,
    revenus: null,
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

// Retour utilisateur (14/09/2026) : un événement affichait "Condition
// remplie" pour "au moins trois jetons Gloire" dès le tout début de
// partie (fin de cycle 1 immédiate), alors qu'un seul jeton Gloire réel
// est possédé (GameService.GLOIRE_DEPART = [2, null, null, null, null]).
// Cause : plateauMaison.gloire est un tableau à 5 EMPLACEMENTS FIXES
// (null = vide), jamais compacté — jetons_gloire_min/_exact utilisaient
// `.length` (toujours 5) au lieu de compter les emplacements réellement
// occupés.
test('jetons_gloire_min / jetons_gloire_exact ignorent les emplacements vides (null) — GLOIRE_DEPART', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctxDepart = contexteDeBase_({ gloire: [2, null, null, null, null] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_min', valeur: 3 }, ctxDepart), false, '1 seul jeton réel, pas 5');
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_exact', valeur: 1 }, ctxDepart), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_exact', valeur: 5 }, ctxDepart), false);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'gloire_valeur_totale_min', valeur: 2 }, ctxDepart), true, 'null ne doit pas fausser la somme');

  var ctxTroisJetons = contexteDeBase_({ gloire: [2, 4, 3, null, null] });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'jetons_gloire_min', valeur: 3 }, ctxTroisJetons), true);
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
// Lot 2 — lignes "multiplicateur" (via evaluerObjectifs, evaluerMultiplicateur_
// n'est pas exposée directement — testée à travers l'API publique)
// ---------------------------------------------------------------

function objectifsAvecUneLigne_(ligne) {
  return { blocs: [{ lignes: [ligne] }] };
}

test('multiplicateur : "par" simple (installation_pure) -> compte + gainAuto (gain Influence pur)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ligne = { type: 'multiplicateur', texte: 'Événement C', recompense: { mode: 'unique', gains: [{ cle: 'influence', valeur: 2, par: 'installation_pure' }] } };
  var ctx = contexteDeBase_({ installationsPuresTotal: 4 });
  var resultats = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne), ctx);
  assert.strictEqual(resultats[0].compte, 4);
  assert.strictEqual(resultats[0].gainAuto, 8); // 4 x 2
});

test('multiplicateur : compte calculable mais gain NON-Influence -> compte renseigné, gainAuto null (reste manuel)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  // Forme réelle Événement J : "gagnez un jeton Prime pour chaque jeton Libération" — "par" non couvert (CLES_PAR_NON_COUVERTES).
  var ligne = { type: 'multiplicateur', texte: 'Événement J', recompense: { mode: 'unique', gains: [{ cle: 'prime', valeur: 1, par: 'jeton_liberation' }] } };
  var resultats = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne), contexteDeBase_());
  assert.strictEqual(resultats[0].compte, null, '"jeton_liberation" hors de COMPTEURS_PAR_ — jamais un gain non-Influence deviné');
  assert.strictEqual(resultats[0].gainAuto, null);
});

test('multiplicateur : secteur_pur_population_4/5/6 comptent EXACTEMENT (pas "au moins")', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ secteursPurs: [{ population: 4 }, { population: 5 }, { population: 6 }, { population: 6 }] });
  var ligne4 = { type: 'multiplicateur', recompense: { mode: 'unique', gains: [{ cle: 'influence', valeur: 1, par: 'secteur_pur_population_4' }] } };
  var ligne6 = { type: 'multiplicateur', recompense: { mode: 'unique', gains: [{ cle: 'influence', valeur: 6, par: 'secteur_pur_population_6' }] } };
  assert.strictEqual(ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne4), ctx)[0].compte, 1);
  var resultat6 = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne6), ctx)[0];
  assert.strictEqual(resultat6.compte, 2);
  assert.strictEqual(resultat6.gainAuto, 12); // 2 x 6
});

test('multiplicateur : secteur_pur_avec_guilde_fermier_ingenieur_ou_mineur_min_1 (au moins 1 des 3 types)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({
    secteursPurs: [
      { guildeFermiers: 1, guildeIngenieurs: 0, guildeMineurs: 0 },
      { guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 2 },
      { guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0 }
    ]
  });
  var ligne = { type: 'multiplicateur', recompense: { mode: 'unique', gains: [{ cle: 'influence', valeur: 2, par: 'secteur_pur_avec_guilde_fermier_ingenieur_ou_mineur_min_1' }] } };
  assert.strictEqual(ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne), ctx)[0].compte, 2);
});

test('multiplicateur : plafond_occurrences limite le compte', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ installationsPuresTotal: 10 });
  var ligne = { type: 'multiplicateur', recompense: { mode: 'unique', gains: [{ cle: 'influence', valeur: 1, par: 'installation_pure', plafond_occurrences: 3 }] } };
  assert.strictEqual(ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne), ctx)[0].compte, 3);
});

test('multiplicateur : barème par niveau de piste (Événement A) — somme sur les pistes PURES uniquement', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({
    civilisation: { societe: 2, gouvernement: 3, economie: 0, corrompues: { societe: false, gouvernement: true, economie: false } }
  });
  var ligne = {
    type: 'multiplicateur',
    recompense: { mode: 'unique', gains: [{ cle: 'influence', par: 'piste_civilisation_pure', bareme: [{ niveau: 1, valeur: 3 }, { niveau: 2, valeur: 6 }, { niveau: 3, valeur: 9 }, { niveau: 4, valeur: 12 }] }] }
  };
  var resultat = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligne), ctx)[0];
  // Gouvernement (niveau 3) est Corrompue -> exclue malgré son niveau élevé.
  // Société niveau 2 -> 6 ; Économie niveau 0 -> aucune entrée de barème (0).
  assert.strictEqual(resultat.gainAuto, 6);
});

test('multiplicateur : mode différent de "unique", ou plusieurs gains -> non automatisable', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ligneLibre = { type: 'multiplicateur', recompense: { mode: 'libre', gains: [{ cle: 'nourriture', valeur: 2, par: 'corruption_conservee' }, { cle: 'influence', valeur: 1, par: 'corruption_conservee' }] } };
  var resultat = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneLibre), contexteDeBase_())[0];
  assert.strictEqual(resultat.compte, null);
  assert.strictEqual(resultat.gainAuto, null);
});

// ---------------------------------------------------------------
// Lot 3 — lignes "formule"
// ---------------------------------------------------------------

function ligneFormule_(formule) {
  return { type: 'formule', recompense: { mode: 'unique', gains: [{ cle: 'influence', formule: formule }] } };
}

test('formule : egal_a_valeur_totale_gloire (Événement B) — ignore les emplacements vides', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ gloire: [2, 5, null, null, null] });
  var resultat = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_('egal_a_valeur_totale_gloire')), ctx)[0];
  assert.strictEqual(resultat.gainAuto, 7);
});

test('formule : egal_a_population_pure_totale (Événements E/J)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ populationPureTotale: 11 });
  var resultat = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_('egal_a_population_pure_totale')), ctx)[0];
  assert.strictEqual(resultat.gainAuto, 11);
});

test('formule : total_ressources_reserve_divise_par_2_arrondi_inferieur (Événement C)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ ressources: { nourriture: 3, energie: 2, materiel: 0, credit: 1, science: 1 } }); // total 7
  var resultat = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_('total_ressources_reserve_divise_par_2_arrondi_inferieur')), ctx)[0];
  assert.strictEqual(resultat.gainAuto, 3); // floor(7/2)
});

test('formule composée "somme" (Événement F) : revenu max parmi 5 + revenu min parmi N/E/M — null si revenus absents', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var formule = { operation: 'somme', termes: ['revenu_max_parmi_5_types_ressource', 'revenu_min_parmi_nourriture_energie_materiel'] };

  var ctxSansRevenu = contexteDeBase_();
  assert.strictEqual(ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_(formule)), ctxSansRevenu)[0].gainAuto, null, 'ctx.revenus absent -> non calculable, jamais deviné');

  var ctxAvecRevenu = contexteDeBase_({ revenus: { nourriture: 2, energie: 5, materiel: 1, credit: 8, science: 3 } });
  var resultat = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_(formule)), ctxAvecRevenu)[0];
  assert.strictEqual(resultat.gainAuto, 9); // max(2,5,1,8,3)=8 + min(2,5,1)=1
});

test('formule composée "produit" (Événement I) : somme des 3 meilleurs jetons Gloire distincts x 2', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var formule = { operation: 'produit', termes: ['somme_valeur_3_meilleurs_jetons_gloire_distincts', 2] };

  // Moins de 3 jetons réels -> ne compte que ceux qui existent (2, ici).
  var ctxDeuxJetons = contexteDeBase_({ gloire: [2, 5, null, null, null] });
  assert.strictEqual(ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_(formule)), ctxDeuxJetons)[0].gainAuto, 14); // (2+5) x 2

  // 4 jetons réels -> seuls les 3 meilleurs comptent (5+4+3=12, PAS 2).
  var ctxQuatreJetons = contexteDeBase_({ gloire: [2, 5, 4, 3, null] });
  assert.strictEqual(ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_(formule)), ctxQuatreJetons)[0].gainAuto, 24); // (5+4+3) x 2
});

test('formule : opération/terme inconnu -> gainAuto null (jamais une approximation)', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var resultatFormuleInconnue = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_('formule_jamais_vue')), contexteDeBase_())[0];
  assert.strictEqual(resultatFormuleInconnue.gainAuto, null);

  var formuleTermeInconnu = { operation: 'somme', termes: ['terme_jamais_vu', 2] };
  var resultatTerme = ObjectifsService.evaluerObjectifs(objectifsAvecUneLigne_(ligneFormule_(formuleTermeInconnu)), contexteDeBase_())[0];
  assert.strictEqual(resultatTerme.gainAuto, null);
});

test('revenu_credit_min (exploit, Lot 1 -> couverte au Lot 3) : lit ctx.revenus.credit, PAS ressources.credit', function () {
  var ObjectifsService = chargerDansContexte_().ObjectifsService;
  var ctx = contexteDeBase_({ revenus: { nourriture: 0, energie: 0, materiel: 0, credit: 3, science: 0 }, ressources: { nourriture: 0, energie: 0, materiel: 0, credit: 99, science: 0 } });
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'revenu_credit_min', valeur: 3 }, ctx), true);
  assert.strictEqual(ObjectifsService.evaluerCondition({ cle: 'revenu_credit_min', valeur: 4 }, ctx), false);
  assert.strictEqual(ObjectifsService.CLES_NON_COUVERTES.indexOf('revenu_credit_min'), -1, 'ne doit plus figurer dans la liste des clés non couvertes');
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
