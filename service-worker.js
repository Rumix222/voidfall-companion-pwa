/**
 * service-worker.js
 *
 * Stratégie : cache-first strict sur la liste statique
 * FICHIERS_A_METTRE_EN_CACHE. Aucune logique de jeu ici — uniquement
 * l'installabilité et l'offline.
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
  './data/catalogue/maisons.json',
  './data/catalogue/technologies.json',
  './data/catalogue/focus.json',
  './data/catalogue/evenements.json',
  './data/catalogue/pistesCivilisation.json',
  './data/catalogue/programmes.json',
  './data/catalogue/scenarios.json',
  './data/catalogue/scenarioSecteurs.json',
  './data/catalogue/scenarioAdjacences.json',
  './data/catalogue/scenarioTrousDeVer.json',
  './data/catalogue/typesSecteur.json',
  './data/catalogue/originesMaison.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (evenement) {
  evenement.waitUntil(
    caches.open(CACHE_NOM)
      .then(function (cache) {
        // cache.addAll(urls) ferait un fetch() "normal" par URL, soumis au
        // cache HTTP du navigateur (un étage différent du Cache Storage du
        // Service Worker) — un fichier déjà tenu "frais" par ce cache HTTP
        // serait alors recopié tel quel dans CACHE_NOM, périmé, sans passer
        // par le réseau. `{ cache: 'reload' }` force un aller-retour réseau
        // réel par fichier (même principe que le paramètre anti-cache
        // ?bust= utilisé par js/catalogueSync.js) avant d'écrire dans le
        // Cache Storage — garantit que CACHE_NOM reflète toujours le
        // contenu réseau réel au moment de l'installation.
        return Promise.all(FICHIERS_A_METTRE_EN_CACHE.map(function (url) {
          return fetch(url, { cache: 'reload' }).then(function (reponse) {
            return cache.put(url, reponse);
          });
        }));
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
