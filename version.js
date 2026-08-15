/**
 * version.js
 * Version 7 — 2026-08-17
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

var APP_VERSION = '20260817.5';
