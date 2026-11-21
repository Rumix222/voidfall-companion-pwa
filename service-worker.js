/**
 * service-worker.js — portail JDS (racine du dépôt)
 *
 * Remplace l'ancien service worker de Voidfall, qui était à cette même
 * adresse : le navigateur détecte le changement et installe celui-ci.
 *
 * Périmètre : le portail et JDS Origami. Voidfall garde son propre service
 * worker dans /voidfall/ (plus spécifique, il reste prioritaire chez lui).
 *
 * Stratégie : réseau d'abord, cache en secours (hors ligne). Pas de version
 * à incrémenter à chaque push : un fichier modifié est toujours rechargé
 * depuis le réseau quand on est en ligne.
 * Ne supprime QUE ses propres caches (préfixe "jds-").
 */
var CACHE_NOM = 'jds-portail-1';

var FICHIERS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './voidfall/icons/icon-192.png',
  './origami/webapp/',
  './origami/webapp/index.html',
  './origami/webapp/style.css',
  './origami/webapp/js/app.js',
  './origami/webapp/js/geometry-modamasu.js',
  './origami/webapp/js/geometry-pochette-v.js',
  './origami/webapp/js/print.js',
  './origami/webapp/js/svg-render.js'
];

self.addEventListener('install', function (evenement) {
  evenement.waitUntil(
    caches.open(CACHE_NOM).then(function (cache) {
      return Promise.all(FICHIERS.map(function (url) {
        return fetch(url, { cache: 'reload' })
          .then(function (reponse) { if (reponse.ok) { return cache.put(url, reponse); } })
          .catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evenement) {
  evenement.waitUntil(
    caches.keys().then(function (noms) {
      return Promise.all(noms
        .filter(function (nom) { return nom.indexOf('jds-') === 0 && nom !== CACHE_NOM; })
        .map(function (nom) { return caches.delete(nom); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evenement) {
  if (evenement.request.method !== 'GET') { return; }
  evenement.respondWith(
    fetch(evenement.request).then(function (reponse) {
      if (reponse && reponse.ok) {
        var copie = reponse.clone();
        caches.open(CACHE_NOM).then(function (cache) { cache.put(evenement.request, copie); });
      }
      return reponse;
    }).catch(function () {
      return caches.match(evenement.request, { ignoreSearch: true });
    })
  );
});
