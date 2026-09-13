/**
 * objectifsService.js
 * Objectifs galactiques (moitié droite de la carte Événement galactique,
 * §3.3 docs-rules-cycle-de-jeu.md) — Voidfall Companion PWA
 *
 * Chantier lancé le 13/09/2026 (retour utilisateur : "Passons à
 * l'implémentation des gains des objectifs galactiques à résoudre /
 * choisir à chaque fin de cycle"), décision actée avant de coder ("calcul
 * automatique quand possible") : ce module PUR (aucun accès DB/DOM)
 * évalue une ligne d'objectif à partir d'un `contexte` déjà construit par
 * l'appelant (strategieService.js, qui a accès à partieAffichee +
 * SecteurService).
 *
 * Catalogue (data/catalogue/evenements.json, `objectifs.blocs[].lignes[]`)
 * — inventaire fait avant de coder (30 événements, 65 lignes), 3 types
 * très clairement séparés dans les données :
 *   - 35 lignes "exploit" : condition booléenne, gain une fois si remplie
 *     (evaluerCondition/gainAutoExploit_ — Lot 1).
 *   - 24 lignes "multiplicateur" : `recompense.gains[].par` désigne un
 *     COMPTEUR (nombre d'occurrences, parfois plafonné —
 *     `plafond_occurrences`), le gain s'applique `compte` fois
 *     (evaluerMultiplicateur_/COMPTEURS_PAR_ — Lot 2).
 *   - 6 lignes "formule" (gain calculé, ex. "autant d'Influence que votre
 *     Gloire totale") — PAS COUVERTES, `rempli`/`compte`/`gainAuto`
 *     restent `null` (Lot 3 futur).
 *
 * Application du gain — AUTOMATIQUE uniquement pour le cas le plus
 * simple des 2 lots (voir `gainAuto` dans evaluerObjectifs ci-dessous) :
 * un gain Influence UNIQUE (mode "unique", 1 seul élément dans
 * `recompense.gains`) sans complication supplémentaire. Tout le reste
 * (gains non-Influence, modes libre/groupe/exclusif/exclusif_repete,
 * `puis`) reste MANUEL, comme le fallback déjà en place pour les Cadres
 * d'Événement galactique (GameService.appliquerCadreChoixManuel) —
 * cohérent avec l'existant.
 *
 * Sur les 35 lignes "exploit", 28 clés de condition distinctes sont
 * couvertes (30/35 lignes automatisables — voir CLES_NON_COUVERTES_
 * ci-dessous pour le détail des 5 lignes restantes, hors périmètre car la
 * donnée sous-jacente n'est pas trackée par l'app aujourd'hui, ou demande
 * un calcul de Revenu asynchrone non inclus dans `contexte`) :
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
 * Sur les 24 lignes "multiplicateur", 15 clés `par` distinctes sont
 * couvertes par COMPTEURS_PAR_ (19/24 lignes avec un `compte` calculable ;
 * `gainAuto` seulement pour celles au gain Influence pur — voir
 * CLES_PAR_NON_COUVERTES_ pour les 5 restantes : gains non-Influence ou
 * Entretien par secteur non tracké).
 *
 * Forme du `contexte` attendu (construit par StrategieService,
 * `construireContexteObjectifs_`, popup 'phase_evaluation') :
 *   {
 *     entretienTotal, entretienRestant,      // nombres — Phase Évaluation
 *     technologiesTotal,                     // départ + obtenues, compté
 *     corruptionMaison,                      // plateauMaison.corruptionMaison
 *     cubeActif,                             // plateauMaison.cubeActif (cube de la zone active)
 *     cubesSecteurPurTotal,                  // total PN sur secteurs Purs (tous types confondus)
 *     gloire: [valeur|null, ...],            // plateauMaison.gloire, TEL QUEL —
 *                                            // 5 emplacements fixes, null = vide
 *                                            // (voir valeursGloire_ ci-dessous,
 *                                            // seul point de lecture correct)
 *     civilisation: { societe, gouvernement, economie,
 *                     corrompues: { societe, gouvernement, economie } },
 *     ressources: { nourriture, energie, materiel, credit, science },
 *     secteursPurs: [{ population, guildeBanquiers, guildeFermiers,
 *                      guildeIngenieurs, guildeMineurs, guildesTotal, cubes }],
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
    'secteurs_avec_guildes_specifiques_min'
    // revenu_credit_min COUVERTE depuis le Lot 3 (13/09/2026) — contexte
    // enrichi de `revenus` (StrategieService.calculerNiveauxProduction_ +
    // calculerProductionAvecBonusTechnologie_), voir EVALUATEURS_ ci-dessous.
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

  /**
   * `contexte.gloire` est le tableau BRUT `plateauMaison.gloire` — un
   * nombre FIXE de 5 emplacements (`GameService.GLOIRE_DEPART = [2, null,
   * null, null, null]` à la création de partie, voir aussi
   * `js/gameService.js` autour de `gloire.indexOf(null)`), PAS un tableau
   * compact d'une entrée par jeton réellement possédé — un emplacement
   * vide vaut `null`, jamais retiré du tableau. Bug corrigé (retour
   * utilisateur, 14/09/2026) : `jetons_gloire_min`/`jetons_gloire_exact`
   * utilisaient `.length` directement, TOUJOURS égal à 5 quel que soit le
   * nombre réel de jetons Gloire possédés — "Condition remplie" à tort
   * dès le tout début de partie (1 seul jeton Gloire réel, valeur 2,
   * GLOIRE_DEPART). Cette fonction filtre les emplacements vides avant
   * tout comptage — seul point d'entrée pour lire `contexte.gloire` dans
   * ce fichier, aucun évaluateur ne doit plus lire `ctx.gloire` en direct.
   */
  function valeursGloire_(contexte) {
    return (contexte.gloire || []).filter(function (v) { return v !== null && v !== undefined; });
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

    jetons_gloire_min: function (c, ctx) { return valeursGloire_(ctx).length >= c.valeur; },
    jetons_gloire_exact: function (c, ctx) { return valeursGloire_(ctx).length === c.valeur; },
    gloire_valeur_min: function (c, ctx) { return valeursGloire_(ctx).some(function (v) { return v >= c.valeur; }); },
    gloire_valeur_totale_min: function (c, ctx) {
      return valeursGloire_(ctx).reduce(function (s, v) { return s + v; }, 0) >= c.valeur;
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

    // Couverte depuis le Lot 3 (13/09/2026) — "Revenu de Crédits" =
    // production RÉELLE (niveau -> table PRODUCTION_CREDIT + bonus
    // Technologie, StrategieService.calculerProductionAvecBonusTechnologie_),
    // PAS `ressources.credit` (le stock en réserve, condition
    // ressource_reserve_min ci-dessus) ni le NIVEAU brut — `ctx.revenus`
    // est déjà le montant final, calculé côté StrategieService (accès
    // secteurs/technologies hors de portée d'un module pur).
    revenu_credit_min: function (c, ctx) { return (ctx.revenus || {}).credit >= c.valeur; },

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

  // ------------------------------------------------------------
  // Lot 2 (13/09/2026) — lignes "multiplicateur" : `recompense.gains[].par`
  // désigne un COMPTEUR (nombre d'occurrences de la condition élémentaire,
  // ex. "par secteur Pur"), le gain s'applique `compte` fois. Sur les 24
  // lignes "multiplicateur" du catalogue, ce lot couvre le sous-ensemble
  // qui se prête à l'AUTO-APPLICATION (comme le cas "exploit" simple du
  // Lot 1) : mode "unique", 1 seul gain, `cle:"influence"`, `par` connu
  // (liste ci-dessous). Piste_civilisation_pure/bareme (Événement A,
  // valeur du gain dépendante du NIVEAU de la piste, pas un simple
  // "valeur × compte") a son propre traitement, voir evaluerMultiplicateur_
  // ci-dessous. Hors périmètre de ce lot (gains NON-Influence, ou `par`
  // non couvert) : compte affiché quand calculable, gain à appliquer
  // manuellement — voir CLES_PAR_NON_COUVERTES_ pour le détail.
  // ------------------------------------------------------------

  var CLES_PAR_NON_COUVERTES_ = [
    'corruption_conservee',                    // Événement G — gain Nourriture/Influence, mode "libre" (pas juste Influence)
    'secteur_pur_avec_guilde_scientifique',     // Événement G — gain augmenter_population_pure, pas Influence
    'jeton_gloire_valeur_5',                    // Événement I — gain produire_type_ressource, pas Influence
    'jeton_liberation',                         // Événement J — gain jeton Prime, pas Influence
    'secteur_pur_ou_corrompu_entretien_min_2'   // Événement B — Entretien PAR SECTEUR non tracké (SecteurService.getEntretien ne donne qu'un total)
  ];

  function compterSecteursPurs_(contexte, predicat) {
    return (contexte.secteursPurs || []).filter(predicat).length;
  }

  // Pistes de Civilisation "Pures" (PAS Corrompues) — retourne leurs
  // niveaux (pas leurs noms), pour piste_civilisation_pure_niveau_min_1
  // (compte) et le barème d'Influence par niveau (Événement A).
  function niveauxPistesCivilisationPures_(contexte) {
    var civ = contexte.civilisation || {};
    var corr = civ.corrompues || {};
    return ['societe', 'gouvernement', 'economie']
      .filter(function (piste) { return !corr[piste]; })
      .map(function (piste) { return civ[piste] || 0; });
  }

  var COMPTEURS_PAR_ = {
    installation_pure: function (ctx) { return ctx.installationsPuresTotal || 0; },
    type_ressource_avec_8_unites_min_en_reserve: function (ctx) {
      var r = ctx.ressources || {};
      return ['nourriture', 'energie', 'materiel', 'credit', 'science'].filter(function (cle) { return (r[cle] || 0) >= 8; }).length;
    },
    cube_zone_active_fiche_maison: function (ctx) { return ctx.cubeActif || 0; },
    cube_secteur_pur: function (ctx) { return ctx.cubesSecteurPurTotal || 0; },
    secteur_pur_cube_min_3: function (ctx) { return compterSecteursPurs_(ctx, function (s) { return (s.cubes || 0) >= 3; }); },
    // Ligne D : "par Corruption de la fiche Maison" — contrairement aux
    // autres clés `secteur_pur_...`, ce n'est PAS un compte de secteurs
    // mais directement la valeur du compteur corruptionMaison (jamais les
    // Chambres de décontamination, compteur séparé — voir corruption_maison
    // ci-dessus dans EVALUATEURS_).
    corruption_fiche_maison: function (ctx) { return ctx.corruptionMaison || 0; },
    secteur_pur_avec_guilde_banquier_min_1: function (ctx) { return compterSecteursPurs_(ctx, function (s) { return (s.guildeBanquiers || 0) >= 1; }); },
    secteur_pur_population_4: function (ctx) { return compterSecteursPurs_(ctx, function (s) { return s.population === 4; }); },
    secteur_pur_population_5: function (ctx) { return compterSecteursPurs_(ctx, function (s) { return s.population === 5; }); },
    secteur_pur_population_6: function (ctx) { return compterSecteursPurs_(ctx, function (s) { return s.population === 6; }); },
    secteur_pur_au_dela_du_4e: function (ctx) { return Math.max(0, (ctx.secteursPurs || []).length - 4); },
    secteur_pur_avec_guilde_fermier_ingenieur_ou_mineur_min_1: function (ctx) {
      return compterSecteursPurs_(ctx, function (s) {
        return ((s.guildeFermiers || 0) + (s.guildeIngenieurs || 0) + (s.guildeMineurs || 0)) >= 1;
      });
    },
    piste_civilisation_pure_niveau_min_1: function (ctx) {
      return niveauxPistesCivilisationPures_(ctx).filter(function (n) { return n >= 1; }).length;
    },
    credit_en_reserve: function (ctx) { return (ctx.ressources || {}).credit || 0; },
    guilde_banquier_pure: function (ctx) { return ctx.guildeBanquierPureTotal || 0; }
  };

  /**
   * Résout une ligne "multiplicateur" — retourne `{compte, gainAuto}` :
   * `compte` = nombre d'occurrences calculé (null si non calculable, ex.
   * `par` inconnu/hors liste blanche COMPTEURS_PAR_) ; `gainAuto` =
   * montant d'Influence à ajouter automatiquement (null si le gain n'est
   * PAS de l'Influence pure — reste alors manuel malgré un `compte`
   * parfois calculable, affiché à titre indicatif).
   */
  function evaluerMultiplicateur_(ligne, contexte) {
    var rec = ligne.recompense;
    if (!rec || rec.mode !== 'unique' || !rec.gains || rec.gains.length !== 1) return { compte: null, gainAuto: null };
    var gain = rec.gains[0];

    // Cas spécial (Événement A) : le gain dépend du NIVEAU de la piste,
    // pas d'un simple "valeur × compte" — `bareme` remplace `valeur`.
    if (gain.bareme) {
      if (gain.par !== 'piste_civilisation_pure') return { compte: null, gainAuto: null };
      var total = niveauxPistesCivilisationPures_(contexte).reduce(function (somme, niveau) {
        var entree = gain.bareme.filter(function (b) { return b.niveau === niveau; })[0];
        return somme + (entree ? entree.valeur : 0);
      }, 0);
      return { compte: null, gainAuto: gain.cle === 'influence' ? total : null };
    }

    if (!gain.par) return { compte: null, gainAuto: null };
    var compteur = COMPTEURS_PAR_[gain.par];
    if (!compteur) return { compte: null, gainAuto: null };

    var compte = compteur(contexte);
    if (gain.plafond_occurrences != null) compte = Math.min(compte, gain.plafond_occurrences);
    var gainAuto = gain.cle === 'influence' ? compte * (Number(gain.valeur) || 0) : null;
    return { compte: compte, gainAuto: gainAuto };
  }

  /**
   * Cas "exploit" auto-appliqué (Lot 1) : mode "unique", 1 seul gain
   * `{cle:"influence"}` SANS `par`/`formule` — voir en-tête du fichier.
   */
  function gainAutoExploit_(ligne, rempli) {
    if (rempli !== true) return null;
    var rec = ligne.recompense;
    if (!rec || rec.mode !== 'unique' || !rec.gains || rec.gains.length !== 1) return null;
    var gain = rec.gains[0];
    if (gain.cle !== 'influence' || gain.par || gain.formule) return null;
    return Number(gain.valeur) || 0;
  }

  // ------------------------------------------------------------
  // Lot 3 (13/09/2026) — lignes "formule" : `recompense.gains[].formule`
  // remplace `valeur` — soit une chaîne (calcul direct), soit un objet
  // `{operation, termes}` (les 2 termes sont combinés par "somme" ou
  // "produit" — SEULES 2 opérations vues au catalogue). Les 6 lignes
  // "formule" du catalogue sont TOUTES mode "unique"/1 seul gain
  // "influence" — donc les 6 sont potentiellement auto-appliables, sous
  // réserve que chaque terme utilisé soit couvert ci-dessous.
  // ------------------------------------------------------------

  // Formules directes (chaîne) — chacune retourne un nombre à partir de
  // `contexte` seul.
  var FORMULES_SIMPLES_ = {
    egal_a_valeur_totale_gloire: function (ctx) { return valeursGloire_(ctx).reduce(function (s, v) { return s + v; }, 0); },
    egal_a_population_pure_totale: function (ctx) { return ctx.populationPureTotale || 0; },
    total_ressources_reserve_divise_par_2_arrondi_inferieur: function (ctx) {
      var r = ctx.ressources || {};
      var total = ['nourriture', 'energie', 'materiel', 'credit', 'science'].reduce(function (s, cle) { return s + (r[cle] || 0); }, 0);
      return Math.floor(total / 2);
    }
  };

  // Termes nommés utilisés DANS un `{operation, termes}` composé — jamais
  // rencontrés seuls au catalogue à ce jour, mais gardés séparés de
  // FORMULES_SIMPLES_ pour ne jamais les confondre avec une formule
  // directe (un terme n'est valide qu'à l'intérieur d'une opération).
  var TERMES_FORMULE_ = {
    // ctx.revenus : voir EVALUATEURS_.revenu_credit_min ci-dessus — même
    // source, le montant de production RÉEL (pas le niveau brut).
    revenu_max_parmi_5_types_ressource: function (ctx) {
      var r = ctx.revenus;
      if (!r) return null;
      return Math.max(r.nourriture, r.energie, r.materiel, r.credit, r.science);
    },
    revenu_min_parmi_nourriture_energie_materiel: function (ctx) {
      var r = ctx.revenus;
      if (!r) return null;
      return Math.min(r.nourriture, r.energie, r.materiel);
    },
    // "vos 3 jetons Gloire différents à la valeur la plus haute" — trie
    // les emplacements réellement occupés (valeursGloire_, jamais les
    // `null` — voir le bug corrigé au Lot 2) et prend les 3 premiers (2
    // ou 1 si le joueur en a moins, "vous ne pouvez pas compter un même
    // jeton deux fois" est de toute façon respecté : chaque emplacement
    // n'est lu qu'une fois).
    somme_valeur_3_meilleurs_jetons_gloire_distincts: function (ctx) {
      return valeursGloire_(ctx).slice().sort(function (a, b) { return b - a; }).slice(0, 3)
        .reduce(function (s, v) { return s + v; }, 0);
    }
  };

  /**
   * Résout `gain.formule` (chaîne OU `{operation, termes}`) contre
   * `contexte` — retourne un nombre, ou `null` si un terme est inconnu
   * (jamais une approximation, même règle que evaluerCondition).
   */
  function resoudreFormule_(formule, contexte) {
    if (typeof formule === 'string') {
      var directe = FORMULES_SIMPLES_[formule];
      return directe ? directe(contexte) : null;
    }
    if (formule && formule.operation && Array.isArray(formule.termes)) {
      var valeurs = formule.termes.map(function (terme) {
        if (typeof terme === 'number') return terme;
        var f = TERMES_FORMULE_[terme];
        return f ? f(contexte) : null;
      });
      if (valeurs.indexOf(null) !== -1) return null;
      if (formule.operation === 'somme') return valeurs.reduce(function (s, v) { return s + v; }, 0);
      if (formule.operation === 'produit') return valeurs.reduce(function (s, v) { return s * v; }, 1);
      return null; // opération inconnue — jamais devinée
    }
    return null;
  }

  /**
   * Résout une ligne "formule" — retourne `gainAuto` (Influence à
   * ajouter automatiquement) ou `null` si non calculable. Les 6 lignes
   * "formule" du catalogue sont toutes mode "unique"/1 seul gain
   * "influence" (vérifié à l'inventaire) — pas de garde-fou `par` ici
   * contrairement à gainAutoExploit_, une ligne "formule" n'a jamais les
   * deux à la fois.
   */
  function gainAutoFormule_(ligne, contexte) {
    var rec = ligne.recompense;
    if (!rec || rec.mode !== 'unique' || !rec.gains || rec.gains.length !== 1) return null;
    var gain = rec.gains[0];
    if (gain.cle !== 'influence' || !gain.formule) return null;
    return resoudreFormule_(gain.formule, contexte);
  }

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
   * Évalue TOUTES les lignes de `objectifs.blocs` (structure catalogue
   * evenements.json) contre `contexte` — retourne un tableau plat
   * `{blocIndex, ligneIndex, ligne, rempli, compte, gainAuto}` :
   *   - "exploit" : `rempli` = true/false/null["non automatisable"],
   *     `compte` toujours null. `gainAuto` = montant d'Influence à
   *     ajouter automatiquement si `rempli===true` ET que la récompense
   *     est un gain Influence unique simple (Lot 1), sinon `null`.
   *   - "multiplicateur" (Lot 2) : `rempli` toujours null (pas de
   *     condition booléenne), `compte` = nombre d'occurrences calculé
   *     (null si non automatisable). `gainAuto` = Influence à ajouter
   *     automatiquement si le gain est de l'Influence pure (mode
   *     "unique", 1 seul gain), sinon null (compte peut être renseigné
   *     à titre indicatif même quand gainAuto est null).
   *   - "formule" (Lot 3) : `rempli`/`compte` toujours null (ni condition
   *     booléenne, ni compteur d'occurrences — une valeur calculée
   *     directe). `gainAuto` = Influence calculée si tous les termes de
   *     la formule sont couverts (voir FORMULES_SIMPLES_/TERMES_FORMULE_),
   *     sinon `null`.
   */
  function evaluerObjectifs(objectifs, contexte) {
    var resultats = [];
    ((objectifs && objectifs.blocs) || []).forEach(function (bloc, blocIndex) {
      (bloc.lignes || []).forEach(function (ligne, ligneIndex) {
        var rempli = null, compte = null, gainAuto = null;
        if (ligne.type === 'exploit') {
          rempli = evaluerCondition(ligne.condition, contexte);
          gainAuto = gainAutoExploit_(ligne, rempli);
        } else if (ligne.type === 'multiplicateur') {
          var resultatMultiplicateur = evaluerMultiplicateur_(ligne, contexte);
          compte = resultatMultiplicateur.compte;
          gainAuto = resultatMultiplicateur.gainAuto;
        } else if (ligne.type === 'formule') {
          gainAuto = gainAutoFormule_(ligne, contexte);
        }
        resultats.push({ blocIndex: blocIndex, ligneIndex: ligneIndex, ligne: ligne, rempli: rempli, compte: compte, gainAuto: gainAuto });
      });
    });
    return resultats;
  }

  return {
    evaluerCondition: evaluerCondition,
    evaluerObjectifs: evaluerObjectifs,
    // Exposées pour les tests / un futur écran de diagnostic uniquement.
    CLES_NON_COUVERTES: CLES_NON_COUVERTES_,
    CLES_PAR_NON_COUVERTES: CLES_PAR_NON_COUVERTES_
  };
})();
