/**
 * service-worker.js
 * Version 12 — 2026-08-17
 * 17/08/2026 (Session 8, Phase 6 — Historique) : ajout de
 * js/historiqueVueService.js à FICHIERS_A_METTRE_EN_CACHE. index.html
 * (liste accueil retirée, bouton "Historique des parties" ajouté) et
 * css/style.css ont aussi changé mais restent au même chemin.
 * 17/08/2026 (Session 7, Phase 5 — Score) : ajout de js/scoreService.js
 * et js/scoreVueService.js à FICHIERS_A_METTRE_EN_CACHE. index.html et
 * css/style.css ont aussi changé (écran Fin de partie) mais restent au
 * même chemin.
 * 17/08/2026 (Session 6, Phase 5 — Combat/Invasion) : ajout de
 * js/combatService.js et js/combatVueService.js à
 * FICHIERS_A_METTRE_EN_CACHE. index.html et css/style.css ont aussi
 * changé (nav "Combat") mais restent au même chemin.
 * 17/08/2026 (Session 5, Phase 5 — Civilisation) : ajout de
 * js/civilisationService.js à FICHIERS_A_METTRE_EN_CACHE. index.html,
 * css/style.css, js/gameService.js, js/focusEngine.js et
 * js/strategieService.js ont aussi changé mais restent au même chemin.
 * 17/08/2026 (Session 4, suite — rebranchement DOM) : ajout de
 * js/strategieService.js à FICHIERS_A_METTRE_EN_CACHE (écran Stratégie
 * complet). index.html et css/style.css ont aussi changé (v8/v3) mais
 * restent au même chemin.
 * 17/08/2026 (Session 4, Phase 4 suite) : ajout de js/focusEngine.js et
 * js/annulationService.js à FICHIERS_A_METTRE_EN_CACHE (moteur coût/effet
 * Focus pur + pile d'annulation). js/db.js a aussi changé (v3, nouveau
 * store pileAnnulation) mais reste au même chemin.
 * 17/08/2026 (Phase 4, partielle) : ajout de js/focusService.js à
 * FICHIERS_A_METTRE_EN_CACHE (mise en place des Focus à la création de
 * partie). js/gameService.js a aussi changé (appelle
 * FocusService.obtenirMiseEnPlace) mais reste au même chemin.
 * 17/08/2026 (Phase 3) : ajout de js/secteurService.js à
 * FICHIERS_A_METTRE_EN_CACHE (instanciation du plateau des secteurs à la
 * création de partie). js/gameService.js a aussi changé (appelle
 * SecteurService.instancierSecteurs) mais reste au même chemin.
 * 17/08/2026 (suite) : ajout de css/style.css et js/setupService.js à
 * FICHIERS_A_METTRE_EN_CACHE (écran "Créer une partie", voir
 * docs-migration-pwa-plan.md section 1). js/gameService.js a aussi
 * changé (obtenirMaisonsCatalogue exposée) mais reste au même chemin.
 * 17/08/2026 : ajout de js/gameService.js à FICHIERS_A_METTRE_EN_CACHE
 * (Phase 2 — cycle de vie de partie, voir docs-migration-pwa-plan.md
 * section 1). js/db.js a aussi changé (ajout de DB.supprimer) mais reste
 * au même chemin, donc pas de nouvelle entrée à ajouter pour lui.
 * 16/08/2026 : ajout de js/db.js et js/catalogueSync.js à
 * FICHIERS_A_METTRE_EN_CACHE (Phase 1 — couche IndexedDB + import
 * catalogue, voir docs-migration-pwa-plan.md section 1).
 * PoC minimal de migration PWA (voir docs-migration-pwa-plan.md, section 4).
 * Stratégie : cache-first strict sur une liste statique de fichiers.
 * Aucune logique de jeu ici — uniquement l'installabilité et l'offline.
 *
 * Stratégie de cache non encore tranchée pour la suite (cache-first strict
 * vs stale-while-revalidate) : voir docs-migration-pwa-plan.md, section 6.
 * Pour ce PoC, on reste en cache-first strict, le plus simple à valider.
 *
 * IMPORTANT — condition de mise à jour :
 * Le navigateur ne réinstalle ce Service Worker que s'il détecte que CE
 * FICHIER a changé (comparaison octet à octet). Pour garantir qu'un
 * changement de contenu déclenche bien une mise à jour, CACHE_NOM est
 * dérivé de APP_VERSION (voir version.js) plutôt que codé en dur ici :
 * il suffit d'incrémenter APP_VERSION à chaque push qui modifie un
 * fichier mis en cache pour que ce fichier change aussi, et donc que le
 * Service Worker soit réinstallé.
 */

importScripts('./version.js');

var CACHE_NOM = 'voidfall-companion-' + APP_VERSION;

var FICHIERS_A_METTRE_EN_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './version.js',
  './css/style.css',
  './js/db.js',
  './js/catalogueSync.js',
  './js/secteurService.js',
  './js/focusService.js',
  './js/focusEngine.js',
  './js/annulationService.js',
  './js/civilisationService.js',
  './js/combatService.js',
  './js/scoreService.js',
  './js/gameService.js',
  './js/setupService.js',
  './js/strategieService.js',
  './js/combatVueService.js',
  './js/scoreVueService.js',
  './js/historiqueVueService.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (evenement) {
  evenement.waitUntil(
    caches.open(CACHE_NOM)
      .then(function (cache) {
        return cache.addAll(FICHIERS_A_METTRE_EN_CACHE);
      })
      .then(function () {
        // Fait passer le nouveau Service Worker en "actif" sans attendre
        // la fermeture des anciens onglets/instances de l'app.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (evenement) {
  evenement.waitUntil(
    caches.keys()
      .then(function (nomsCaches) {
        return Promise.all(
          nomsCaches
            .filter(function (nom) { return nom !== CACHE_NOM; })
            .map(function (nom) { return caches.delete(nom); })
        );
      })
      .then(function () {
        // Prend le contrôle immédiat des pages déjà ouvertes, pour que la
        // mise à jour du cache soit visible sans fermer/rouvrir l'app.
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (evenement) {
  evenement.respondWith(
    caches.match(evenement.request)
      .then(function (reponseEnCache) {
        if (reponseEnCache) {
          return reponseEnCache;
        }
        return fetch(evenement.request);
      })
  );
});
