/**
 * version.js
 * Version 12 — 2026-08-17
 * Source de vérité unique pour la version de l'application.
 * Chargé à la fois par index.html (contexte navigateur, via <script src>)
 * et par service-worker.js (contexte Service Worker, via importScripts).
 *
 * Format : AAAAMMJJ.N (date du jour + compteur de push du jour).
 * Exemple : '20260815.1' -> premier push du 15/08/2026,
 *           '20260815.2' -> deuxième push le même jour, etc.
 *
 * RÈGLE : incrémenter cette valeur à CHAQUE push qui modifie un fichier
 * mis en cache par service-worker.js (index.html, icônes, css/js futurs).
 * Sans ce changement, le Service Worker n'est jamais réinstallé et
 * l'ancien contenu reste servi indéfiniment (voir en-tête de
 * service-worker.js pour le détail du mécanisme).
 *
 * 17/08/2026 (Session 10 — restauration IHM Stratégie/Partie) : incrémenté
 * suite à la restauration de blocs d'affichage perdus lors du portage
 * initial de l'écran Stratégie (Session 4) : Influence déménagée vers
 * l'écran Partie, ligne jetons restaurée (Commerce/Prime/Libération),
 * ligne Cube inactif/actif/déployé et widget Gloire (5 emplacements
 * cliquables) ajoutés. Fichiers modifiés (chemins déjà en cache, aucune
 * nouvelle entrée) : index.html (v9), css/style.css (v4),
 * js/strategieService.js (v3).
 *
 * 17/08/2026 (Session 9, Phase 7 — Nettoyage) : incrémenté suite à la
 * correction de deux commentaires obsolètes dans gameService.js/
 * index.html (mentionnaient encore Focus non-jouable / Civilisation
 * lecture seule, faux depuis les Sessions 4/5 — aucun changement de
 * comportement, uniquement de la documentation). Confirmation que
 * LogService.js/UiService.js/Version.js (GAS) n'ont aucun équivalent PWA
 * à porter — voir docs-migration-pwa-plan.md §6.
 *
 * 17/08/2026 (Session 8, Phase 6 — Historique) : incrémenté suite à
 * l'ajout de js/historiqueVueService.js (écran Historique enrichi —
 * événements/technologies/vainqueur, reprendre/archiver/supprimer/tout-
 * supprimer) et à la refonte d'index.html (v9 — la simple liste "Parties
 * enregistrées" de l'accueil, présente depuis la Session 4, est retirée
 * au profit d'un bouton "Historique des parties" ouvrant ce nouvel
 * écran). css/style.css a aussi changé (styles historique/badges).
 *
 * 17/08/2026 (Session 7, Phase 5 — Score) : incrémenté suite à l'ajout de
 * js/scoreService.js (fin de partie, Influence du Néant, portage pur
 * depuis ScoreService.js GAS) et js/scoreVueService.js (écran Fin de
 * partie, bouton "Terminer la partie" sur l'écran Partie). index.html et
 * css/style.css ont aussi changé mais restent au même chemin.
 *
 * 17/08/2026 (Session 6, Phase 5 — Combat/Invasion) : incrémenté suite à
 * l'ajout de js/combatService.js (moteur de combat pur, portage quasi
 * textuel de combat.html GAS) et js/combatVueService.js (écran Combat,
 * nav "Combat" ajoutée) à FICHIERS_A_METTRE_EN_CACHE. index.html et
 * css/style.css ont aussi changé mais restent au même chemin.
 *
 * 17/08/2026 (Session 5, Phase 5 — Civilisation) : incrémenté suite à
 * l'ajout de js/civilisationService.js (avancement des pistes de
 * Civilisation + effet de case, réutilise focusEngine.js) et à la mise à
 * jour de js/gameService.js (v5 — ajout majCivilisation), js/focusEngine.js
 * (ajout du wrapper public resoudreEffet), js/strategieService.js (v2 —
 * pistes interactives) et index.html (nouveaux boutons Civilisation,
 * script civilisationService.js).
 *
 * 17/08/2026 (Session 4, suite — rebranchement DOM) : incrémenté suite à
 * l'ajout de js/strategieService.js (écran Stratégie complet : ressources,
 * Focus jouables, pistes de Civilisation en lecture seule, bouton
 * Annuler) et à la refonte d'index.html (v8 — nav Partie/Stratégie/
 * Secteurs, écran Partie persistant remplaçant l'ancien écran de
 * confirmation, bouton "Continuer" sur les parties enregistrées) et de
 * css/style.css (v3 — styles modale/ressources/cartes Focus/nav).
 *
 * 17/08/2026 (Session 4, Phase 4 suite) : incrémenté suite à l'ajout de
 * js/focusEngine.js (moteur coût/effet Focus, pur) et
 * js/annulationService.js (pile d'annulation des actions Focus) à
 * FICHIERS_A_METTRE_EN_CACHE. js/db.js a aussi changé (v3 — ajout du
 * store pileAnnulation, VERSION_BASE 1 -> 2) mais reste au même chemin.
 *
 * 17/08/2026 (Phase 4, partielle) : incrémenté suite à l'ajout de
 * js/focusService.js (mise en place des Focus) à
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Phase 3) : incrémenté suite à l'ajout de
 * js/secteurService.js (plateau des secteurs) à FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (suite) : incrémenté suite à l'ajout de css/style.css et
 * js/setupService.js (écran "Créer une partie") à
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 : incrémenté suite à l'ajout de js/gameService.js (Phase 2 —
 * cycle de vie de partie) à FICHIERS_A_METTRE_EN_CACHE, et à la mise à
 * jour de js/db.js (ajout de DB.supprimer).
 *
 * 16/08/2026 : incrémenté suite à l'ajout de js/db.js et
 * js/catalogueSync.js à FICHIERS_A_METTRE_EN_CACHE (Phase 1 migration).
 */

var APP_VERSION = '20260817.12';
