/**
 * objectifsService.js
 * Objectifs galactiques (moitié droite de la carte Événement galactique,
 * §3.3 docs-rules-cycle-de-jeu.md) — Voidfall Companion PWA
 *
 * Chantier lancé le 13/09/2026 (retour utilisateur : "Passons à
 * l'implémentation des gains des objectifs galactiques à résoudre /
 * choisir à chaque fin de cycle"), décision actée avant de coder ("calcul
 * automatique quand possible") : ce module PUR (aucun accès DB/DOM)
 * évalue si la CONDITION d'un objectif est remplie, à partir d'un
 * `contexte` déjà construit par l'appelant (strategieService.js, qui a
 * accès à partieAffichee + SecteurService). L'APPLICATION du gain
 * (Lot 2, pas encore fait) reste pour l'instant manuelle, comme le
 * fallback déjà en place pour les Cadres d'Événement galactique
 * (GameService.appliquerCadreChoixManuel) — cohérent avec l'existant.
 *
 * Catalogue (data/catalogue/evenements.json, `objectifs.blocs[].lignes[]`)
 * — inventaire fait avant de coder (30 événements, 65 lignes) :
 *   - 35 lignes "exploit" : condition booléenne, gain une fois si remplie
 *     — SEUL type couvert par ce Lot 1 (evaluerCondition ci-dessous).
 *   - 24 lignes "multiplicateur" (gain répété selon un compteur, parfois
 *     plafonné — `recompense.gains[].par`/`plafond_occurrences`) et
 *     6 lignes "formule" (gain calculé, ex. "autant d'Influence que votre
 *     Gloire totale") — PAS COUVERTS ici, restent "non automatisé"
 *     (affichage du texte seul) jusqu'à un Lot 2/3 séparé.
 *
 * Sur les 35 lignes "exploit", 28 clés de condition distinctes sont
 * couvertes ici (30/35 lignes automatisables — voir CLES_NON_COUVERTES_
 * ci-dessous pour le détail des 5 lignes restantes, hors périmètre de ce
 * lot car la donnée sous-jacente n'est pas trackée par l'app
 * aujourd'hui, ou demande un calcul de Revenu asynchrone non inclus dans
 * `contexte`) :
 *   - focus_preferes_absents_de_defausse (Événement E) : aucune pioche/
 *     défausse de cartes Focus modélisée dans l'appli (voir mémoire de
 *     session voidfall-focus-prefere-report.md) — non calculable.
 *   - jetons_catastrophe_plateau_crise (Événement J) : le Plateau Crise
 *     "light" ne suit pas de jeton Catastrophe — non calculable.
 *   - emplacements_guilde_vides_max (Événement E) : demande le nombre
 *     d'emplacements Guilde CONSTRUCTIBLES par secteur (typesSecteur.json)
 *     moins les emplacements Vaisseaux-Arches (exclusion spécifique) —
 *     reporté, calcul plus complexe que le reste de ce lot.
 *   - secteurs_avec_guildes_specifiques_min (Événement C) : condition ET
 *     récompense ("exclusif_repete") toutes deux complexes — reporté.
 *   - revenu_credit_min (Événement D) : nécessite un calcul de Revenu
 *     asynchrone (StrategieService.calculerNiveauxProduction_ +
 *     calculerProductionAvecBonusTechnologie_) non inclus dans `contexte`
 *     aujourd'hui — reporté (contexte à enrichir si besoin).
 *
 * Forme du `contexte` attendu par evaluerCondition (construit par
 * StrategieService, voir feuilleFlowPhaseEvaluation_/objectifsContexte_
 * — nom exact à confirmer côté strategieService.js) :
 *   {
 *     entretienTotal, entretienRestant,      // nombres — Phase Évaluation
 *     technologiesTotal,                     // départ + obtenues, compté
 *     corruptionMaison,                      // plateauMaison.corruptionMaison
 *     gloire: [valeur, ...],                 // plateauMaison.gloire
 *     civilisation: { societe, gouvernement, economie,
 *                     corrompues: { societe, gouvernement, economie } },
 *     ressources: { nourriture, energie, materiel, credit, science },
 *     secteursPurs: [{ population, guildeBanquiers, guildesTotal, cubes }],
 *     secteursPossedes: [{ corrompu, cubes }], // Purs ET Corrompus, joueur
 *     installationsPuresTotal, defenseOuBaseStellairePureTotal,
 *     guildesPuresTotal, guildeBanquierPureTotal, guildeScientifiquePureTotal,
 *     populationPureTotale,
 *     programmesNonDepart: [{ nom, corrompu }]  // emplacements 1-3 remplis
 *   }
 */
var ObjectifsService = (function () {
  'use strict';

  var CLES_NON_COUVERTES_ = [
    'focus_preferes_absents_de_defausse',
    'jetons_catastrophe_plateau_crise',
    'emplacements_guilde_vides_max',
    'secteurs_avec_guildes_specifiques_min',
    'revenu_credit_min'
  ];

  // ------------------------------------------------------------
  // Évaluateurs par clé de condition — chacun reçoit (condition, contexte)
  // et retourne un booléen. Ne JAMAIS deviner une clé absente de ce
  // dictionnaire : evaluerCondition retourne alors `null` (non
  // automatisable), jamais une approximation.
  // ------------------------------------------------------------

  function compterSecteursPursAvec_(contexte, predicat) {
    return (contexte.secteursPurs || []).filter(predicat).length;
  }

  var EVALUATEURS_ = {
    entretien_total_min: function (c, ctx) { return ctx.entretienTotal >= c.valeur; },
    entretien_total_max: function (c, ctx) { return ctx.entretienTotal <= c.valeur; },
    // "et si vous réussissez à le satisfaire intégralement" — toujours
    // combinée à entretien_total_min via {et:[...]} dans le catalogue,
    // jamais seule (vérifié sur les 2 occurrences, Événements A et I).
    entretien_integralement_satisfait: function (c, ctx) { return ctx.entretienRestant === 0; },
    entretien_secteurs_min: function (c, ctx) { return ctx.entretienSecteurs >= c.valeur; },

    installations_pures_min: function (c, ctx) { return ctx.installationsPuresTotal >= c.valeur; },
    defense_secteur_ou_base_stellaire_pure_min: function (c, ctx) { return ctx.defenseOuBaseStellairePureTotal >= c.valeur; },
    guilde_pure_min: function (c, ctx) { return ctx.guildesPuresTotal >= c.valeur; },
    guilde_banquier_pure_min: function (c, ctx) { return ctx.guildeBanquierPureTotal >= c.valeur; },
    guilde_scientifique_pure_min: function (c, ctx) { return ctx.guildeScientifiquePureTotal >= c.valeur; },
    population_pure_totale_min: function (c, ctx) { return ctx.populationPureTotale >= c.valeur; },

    secteur_pur_avec_guilde_banquier_min: function (c, ctx) {
      return compterSecteursPursAvec_(ctx, function (s) { return (s.guildeBanquiers || 0) > 0; }) >= c.valeur;
    },
    secteur_pur_population_min: function (c, ctx) {
      return compterSecteursPursAvec_(ctx, function (s) { return (s.population || 0) >= c.seuil_population; }) >= c.nombre_secteurs_min;
    },
    secteurs_purs_avec_cubes_min: function (c, ctx) {
      var seuils = c.valeur || {};
      return compterSecteursPursAvec_(ctx, function (s) { return (s.cubes || 0) >= seuils.cubes_min; }) >= seuils.count;
    },

    // "purs_ou_corrompus" : porte sur TOUS les secteurs possédés du
    // joueur (secteursPossedes), jamais seulement les Purs.
    secteurs_min: function (c, ctx) { return (ctx.secteursPossedes || []).length >= c.valeur; },
    cubes_secteurs_min: function (c, ctx) {
      var total = (ctx.secteursPossedes || []).reduce(function (s, sec) { return s + (sec.cubes || 0); }, 0);
      return total >= c.valeur;
    },

    // corruption_maison / corruption_fiche_maison : 2 clés DIFFÉRENTES au
    // catalogue pour le MÊME champ (plateauMaison.corruptionMaison,
    // jamais la Corruption des Chambres de décontamination — compteur
    // séparé, jamais fusionné avec corruptionMaison ailleurs dans
    // l'appli — la précision "corruption_chambres_decontamination_exclue"
    // du catalogue est donc automatiquement respectée).
    corruption_maison: function (c, ctx) { return ctx.corruptionMaison <= c.valeur; },
    corruption_fiche_maison: function (c, ctx) { return ctx.corruptionMaison <= c.valeur; },
    corruption_maison_et_secteurs_max: function (c, ctx) {
      var nbSecteursCorrompus = (ctx.secteursPossedes || []).filter(function (s) { return s.corrompu; }).length;
      return (ctx.corruptionMaison + nbSecteursCorrompus) <= c.valeur;
    },

    // technologie_total_min / technologie_base_ou_amelioree_total_min :
    // une Technologie est TOUJOURS "de base" ou "améliorée" (jamais un
    // 3e état) — même compte pour les 2 clés (départ + les 5 obtenues,
    // emplacements vides exclus).
    technologie_total_min: function (c, ctx) { return ctx.technologiesTotal >= c.valeur; },
    technologie_base_ou_amelioree_total_min: function (c, ctx) { return ctx.technologiesTotal >= c.valeur; },

    jetons_gloire_min: function (c, ctx) { return (ctx.gloire || []).length >= c.valeur; },
    jetons_gloire_exact: function (c, ctx) { return (ctx.gloire || []).length === c.valeur; },
    gloire_valeur_min: function (c, ctx) { return (ctx.gloire || []).some(function (v) { return v >= c.valeur; }); },
    gloire_valeur_totale_min: function (c, ctx) {
      return (ctx.gloire || []).reduce(function (s, v) { return s + v; }, 0) >= c.valeur;
    },

    // "Niveau 1 (ou supérieur) sur au moins une piste Pure" — Pure =
    // PAS Corrompue (même sens que "secteur Pur" mais pour une piste de
    // Civilisation, docs-rules-cycle-de-jeu.md).
    civilisation_pure_niveau_min: function (c, ctx) {
      var civ = ctx.civilisation || {};
      var corr = civ.corrompues || {};
      return ['societe', 'gouvernement', 'economie'].some(function (piste) {
        return !corr[piste] && (civ[piste] || 0) >= c.valeur;
      });
    },

    ressource_reserve_min: function (c, ctx) {
      var r = ctx.ressources || {};
      return ['nourriture', 'energie', 'materiel', 'credit', 'science'].some(function (cle) { return (r[cle] || 0) >= c.valeur; });
    },

    // "Programme Pur en jeu (hors départ)" — un des 3 emplacements 1-3
    // occupé (nom non vide) ET pas Corrompu. Les 2 clés catalogue
    // ("...", "..._disponible") vérifient exactement la même chose —
    // seule la récompense diffère (construire une Installation vs.
    // évaluer les objectifs de ce Programme), jamais la condition.
    programme_pur_en_jeu_hors_depart: function (c, ctx) {
      return (ctx.programmesNonDepart || []).some(function (p) { return p.nom && !p.corrompu; });
    },
    programme_pur_en_jeu_hors_depart_disponible: function (c, ctx) {
      return (ctx.programmesNonDepart || []).some(function (p) { return p.nom && !p.corrompu; });
    }
  };

  /**
   * Évalue récursivement une condition (objet `{cle,...}`, ou composée
   * `{et:[...]}`/`{ou:[...]}` — vues sur le catalogue : SEUL `et` est
   * utilisé aujourd'hui, `ou` géré par cohérence/anticipation d'un futur
   * événement). Retourne `true`/`false` si évaluable, `null` si la clé
   * (ou une sous-clé) n'est pas couverte (voir CLES_NON_COUVERTES_) —
   * l'appelant doit alors retomber sur une confirmation manuelle, jamais
   * une approximation.
   */
  function evaluerCondition(condition, contexte) {
    if (!condition) return null;
    if (condition.et) {
      var resultatsEt = condition.et.map(function (sc) { return evaluerCondition(sc, contexte); });
      if (resultatsEt.indexOf(null) !== -1) return null;
      return resultatsEt.every(Boolean);
    }
    if (condition.ou) {
      var resultatsOu = condition.ou.map(function (sc) { return evaluerCondition(sc, contexte); });
      if (resultatsOu.indexOf(null) !== -1) return null;
      return resultatsOu.some(Boolean);
    }
    var evaluateur = EVALUATEURS_[condition.cle];
    if (!evaluateur) return null;
    return evaluateur(condition, contexte);
  }

  /**
   * Évalue TOUTES les lignes "exploit" de `objectifs.blocs` (structure
   * catalogue evenements.json) contre `contexte` — retourne un tableau
   * plat `{blocIndex, ligneIndex, ligne, rempli}` (rempli = true/false/
   * null["non automatisable"]) ; les lignes "multiplicateur"/"formule"
   * sont incluses avec `rempli: null` (jamais évaluées ici, Lot 1 se
   * limite aux exploits — voir en-tête du fichier), pour que l'appelant
   * puisse quand même les lister/afficher de façon uniforme.
   */
  function evaluerObjectifs(objectifs, contexte) {
    var resultats = [];
    ((objectifs && objectifs.blocs) || []).forEach(function (bloc, blocIndex) {
      (bloc.lignes || []).forEach(function (ligne, ligneIndex) {
        var rempli = ligne.type === 'exploit' ? evaluerCondition(ligne.condition, contexte) : null;
        resultats.push({ blocIndex: blocIndex, ligneIndex: ligneIndex, ligne: ligne, rempli: rempli });
      });
    });
    return resultats;
  }

  return {
    evaluerCondition: evaluerCondition,
    evaluerObjectifs: evaluerObjectifs,
    // Exposée pour les tests / un futur écran de diagnostic uniquement.
    CLES_NON_COUVERTES: CLES_NON_COUVERTES_
  };
})();
