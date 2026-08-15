/**
 * service-worker.js
 * Version 2 — 2026-08-16
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
  './js/db.js',
  './js/catalogueSync.js',
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
