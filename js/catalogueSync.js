/**
 * catalogueSync.js
 * Import JSON local -> IndexedDB (catalogue, lecture seule)
 *
 * Le catalogue est bundlé dans le repo sous forme de fichiers JSON
 * statiques (data/catalogue/*.json, un fichier par store, en camelCase).
 * Synchronisation toujours en bloc (source -> IndexedDB), jamais fusionnée
 * partiellement ; fonctionne hors-ligne dès le premier chargement une fois
 * les fichiers mis en cache par le Service Worker.
 *
 * Pour mettre à jour le catalogue : éditer le(s) fichier(s) JSON
 * concerné(s) dans data/catalogue/, committer, pousser. Les joueurs
 * récupèrent la mise à jour au prochain "Synchroniser le catalogue"
 * (après passage de APP_VERSION pour invalider le cache Service Worker,
 * voir service-worker.js).
 *
 * Dépend de db.js (objet global DB) : à charger avant ce fichier.
 */

var CatalogueSync = (function () {
  'use strict';

  /**
   * Fichier JSON local -> store IndexedDB correspondant (mapping 1:1).
   */
  var TABLES = [
    { fichier: 'maisons', store: 'maisons' },
    { fichier: 'technologies', store: 'technologies' },
    { fichier: 'focus', store: 'focus' },
    { fichier: 'evenements', store: 'evenements' },
    { fichier: 'pistesCivilisation', store: 'pistesCivilisation' },
    { fichier: 'programmes', store: 'programmes' },
    { fichier: 'scenarios', store: 'scenarios' },
    { fichier: 'scenarioSecteurs', store: 'scenarioSecteurs' },
    { fichier: 'scenarioAdjacences', store: 'scenarioAdjacences' },
    { fichier: 'scenarioTrousDeVer', store: 'scenarioTrousDeVer' },
    { fichier: 'typesSecteur', store: 'typesSecteur' },
    { fichier: 'originesMaison', store: 'originesMaison' },
    { fichier: 'programmesDepart', store: 'programmesDepart' }
  ];

  /**
   * Lecture d'un fichier JSON local du catalogue.
   */
  function lireFichier_(nomFichier) {
    var url = './data/catalogue/' + nomFichier + '.json';
    // cache:'no-store' seul ne suffit pas à garantir un aller-retour
    // réseau réel : le serveur statique n'envoie pas d'en-têtes de cache
    // forts (le navigateur peut resservir une réponse HTTP en cache), et
    // surtout un Service Worker déjà actif intercepte la requête AVANT
    // qu'elle n'atteigne le réseau via son handler 'fetch' (cache-first),
    // dès que caches.match() trouve une entrée pour cette URL exacte —
    // quel que soit le mode de cache demandé. Le paramètre anti-cache
    // (?bust=) rend l'URL inédite pour caches.match() (comparaison
    // stricte, query string incluse), ce qui la fait retomber sur un vrai
    // fetch() réseau. Nécessaire pour que "Synchroniser le catalogue"
    // reflète toujours le fichier actuel (voir Piège n°1 dans CLAUDE.md).
    return fetch(url + '?bust=' + Date.now(), { cache: 'no-store' }).then(function (reponse) {
      if (!reponse.ok) {
        throw new Error('HTTP ' + reponse.status + ' sur ' + url);
      }
      return reponse.json();
    });
  }

  /**
   * Synchronise une table : lecture JSON local -> écrasement complet du
   * store IndexedDB correspondant.
   * Tolérant : un fichier en échec ne bloque pas les autres — l'erreur
   * est capturée et remontée dans le rapport final, jamais levée ici.
   */
  function synchroniserTable_(entree) {
    return lireFichier_(entree.fichier)
      .then(function (lignes) {
        return DB.putTout(entree.store, lignes).then(function () {
          return { table: entree.fichier, statut: 'ok', nombre: lignes.length };
        });
      })
      .catch(function (erreur) {
        return { table: entree.fichier, statut: 'erreur', message: erreur.message };
      });
  }

  /**
   * Synchronise tout le catalogue (13 fichiers), en parallèle. Retourne
   * toujours un rapport détaillé par table, jamais un rejet global — un
   * échec partiel ne doit pas empêcher l'app de démarrer avec le
   * catalogue déjà en cache (principe offline-first du projet).
   */
  function synchroniser() {
    return Promise.all(TABLES.map(synchroniserTable_)).then(function (rapport) {
      return DB.put('meta', {
        cle: 'catalogueVersion',
        valeur: new Date().toISOString(),
        rapport: rapport
      }).then(function () {
        return rapport;
      });
    });
  }

  return {
    synchroniser: synchroniser
  };
})();
