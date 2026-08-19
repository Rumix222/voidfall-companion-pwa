/**
 * catalogueSync.js
 * Import JSON local -> IndexedDB (catalogue, lecture seule)
 * Version 2 — 18/08/2026
 *
 * 18/08/2026 : suppression de la dépendance Supabase. Le catalogue est
 * désormais bundlé dans le repo sous forme de fichiers JSON statiques
 * (data/catalogue/*.json, un fichier par store, déjà en camelCase — voir
 * export_catalogue.py qui a servi à générer l'état initial depuis
 * l'ancienne base Supabase). Le sens reste le même qu'avant (source ->
 * IndexedDB, en bloc, lecture seule), seule la source change : plus
 * d'appel réseau externe, plus de clé à protéger, fonctionne hors-ligne
 * dès le premier chargement une fois les fichiers mis en cache par le
 * Service Worker.
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
    { fichier: 'originesMaison', store: 'originesMaison' }
  ];

  /**
   * Lecture d'un fichier JSON local du catalogue.
   */
  function lireFichier_(nomFichier) {
    var url = './data/catalogue/' + nomFichier + '.json';
    // 19/08/2026 (bug constaté en test) : sans cache:'no-store', le
    // navigateur peut resservir une réponse HTTP mise en cache pour ce
    // fetch (le serveur statique n'envoie pas d'en-têtes de cache forts)
    // — "Synchroniser le catalogue" resservait alors un JSON périmé même
    // après une mise à jour bien déployée (APP_VERSION incrémenté, SW
    // réinstallé). Le catalogue devant toujours refléter le fichier
    // actuel au moment du clic, on force ici un aller-retour réseau.
    return fetch(url, { cache: 'no-store' }).then(function (reponse) {
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
   * Synchronise tout le catalogue (12 fichiers), en parallèle. Retourne
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
