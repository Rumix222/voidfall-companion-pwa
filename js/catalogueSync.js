/**
 * catalogueSync.js
 * Import Supabase -> IndexedDB (catalogue, lecture seule)
 * Version 1 — 16/08/2026
 *
 * Remplace SyncService.js (qui allait Sheets -> Supabase) : le sens est ici
 * inversé, Supabase -> IndexedDB, en lecture seule via la clé anon.
 *
 * Pré-requis avant d'utiliser ce fichier (vérifié en session le
 * 16/08/2026) : RLS activé sur les 12 tables catalogue, avec une policy
 * SELECT-only pour le rôle anon sur chacune. Sans ça, ne JAMAIS exposer la
 * clé anon ici — la page GitHub Pages est publique.
 *
 * ⚠️ À COMPLÉTER avant déploiement : SUPABASE_URL et SUPABASE_ANON_KEY
 * ci-dessous sont des placeholders. La clé anon est conçue pour être
 * publique (c'est RLS qui protège les données, pas le secret de la clé) —
 * il est donc normal qu'elle reste en dur dans ce fichier client, une fois
 * RLS confirmé SELECT-only.
 *
 * Le catalogue est toujours réimporté EN BLOC (jamais de fusion
 * partielle) : chaque store catalogue est vidé puis repeuplé en une seule
 * transaction (DB.putTout), comme confirmé en §5 du plan de migration.
 *
 * Conversion des colonnes : chaque ligne Supabase (snake_case) est
 * convertie en camelCase au niveau des clés de premier niveau seulement —
 * les valeurs jsonb (ex. "effet", "cout") restent inchangées à
 * l'intérieur, ce ne sont pas des noms de colonnes mais du contenu de jeu.
 *
 * Dépend de db.js (objet global DB) : à charger avant ce fichier.
 */

var CatalogueSync = (function () {
  'use strict';

  var SUPABASE_URL = 'https://qzrescihdqhbeiaxtrux.supabase.co'; // TODO : remplacer par l'URL réelle
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6cmVzY2loZHFoYmVpYXh0cnV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM4Njc0NywiZXhwIjoyMTAxOTYyNzQ3fQ.5uTBh4qAKLPyAGwbI03FO0Ed9lOa-08cuWRHTAOGks0';               // TODO : remplacer par la clé anon réelle

  /**
   * Table Supabase -> store IndexedDB correspondant (mapping 1:1, voir §2
   * du plan de migration).
   */
  var TABLES = [
    { table: 'maisons', store: 'maisons' },
    { table: 'technologies', store: 'technologies' },
    { table: 'focus', store: 'focus' },
    { table: 'evenements', store: 'evenements' },
    { table: 'pistes_civilisation', store: 'pistesCivilisation' },
    { table: 'programmes', store: 'programmes' },
    { table: 'scenarios', store: 'scenarios' },
    { table: 'scenario_secteurs', store: 'scenarioSecteurs' },
    { table: 'scenario_adjacences', store: 'scenarioAdjacences' },
    { table: 'scenario_trous_de_ver', store: 'scenarioTrousDeVer' },
    { table: 'types_secteur', store: 'typesSecteur' },
    { table: 'origines_maison', store: 'originesMaison' }
  ];

  /**
   * snake_case -> camelCase, sur les clés de premier niveau d'un objet
   * uniquement (pas de récursion dans les valeurs imbriquées type jsonb).
   */
  function convertirCle_(cle) {
    return cle.replace(/_([a-z0-9])/g, function (_match, lettre) {
      return lettre.toUpperCase();
    });
  }

  function convertirLigne_(ligne) {
    var resultat = {};
    Object.keys(ligne).forEach(function (cle) {
      resultat[convertirCle_(cle)] = ligne[cle];
    });
    return resultat;
  }

  /**
   * Lecture d'une table catalogue via l'API REST Supabase (PostgREST).
   */
  function lireTable_(nomTable) {
    var url = SUPABASE_URL + '/rest/v1/' + nomTable + '?select=*';
    return fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (reponse) {
      if (!reponse.ok) {
        throw new Error('HTTP ' + reponse.status + ' sur ' + nomTable);
      }
      return reponse.json();
    });
  }

  /**
   * Synchronise une table : lecture Supabase -> conversion camelCase ->
   * écrasement complet du store IndexedDB correspondant.
   * Tolérant : une table en échec ne bloque pas les autres (même principe
   * que DataService.getDonneesInstanciationSecteurs côté GAS) — l'erreur
   * est capturée et remontée dans le rapport final, jamais levée ici.
   */
  function synchroniserTable_(entree) {
    return lireTable_(entree.table)
      .then(function (lignes) {
        var lignesConverties = lignes.map(convertirLigne_);
        return DB.putTout(entree.store, lignesConverties).then(function () {
          return { table: entree.table, statut: 'ok', nombre: lignesConverties.length };
        });
      })
      .catch(function (erreur) {
        return { table: entree.table, statut: 'erreur', message: erreur.message };
      });
  }

  /**
   * Synchronise tout le catalogue (12 tables), en parallèle. Retourne
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
