/**
 * db.js
 * Wrapper IndexedDB — Voidfall Companion PWA
 *
 * Ouvre la base 'voidfallCompanion' et expose un accès générique
 * get/put/getAll par store.
 *
 * Convention : les fonctions publiques sont exposées via l'objet DB
 * (IIFE), les fonctions internes sont suffixées _.
 */

var DB = (function () {
  'use strict';

  var NOM_BASE = 'voidfallCompanion';
  var VERSION_BASE = 3;
  var promesseDB_ = null;

  /**
   * Définition des stores et de leurs index — une seule source de vérité,
   * utilisée à la fois par onupgradeneeded et par la validation des noms
   * de store dans les fonctions génériques ci-dessous.
   */
  var STORES = {
    // --- État de partie (mutable) ---
    parties: {
      keyPath: 'id',
      index: [
        { nom: 'archivee', cle: 'archivee' },
        { nom: 'dateCreation', cle: 'dateCreation' }
      ]
    },
    secteursPartie: {
      keyPath: ['partieId', 'numero'],
      index: [
        { nom: 'partieId', cle: 'partieId' }
      ]
    },
    plateauMaison: {
      keyPath: 'partieId',
      index: []
    },
    historique: {
      keyPath: 'id',
      autoIncrement: true,
      index: [
        { nom: 'partieId', cle: 'partieId' },
        { nom: 'dateAction', cle: 'dateAction' }
      ]
    },
    // Une entrée = une action Focus jouée avec succès (effet + coût
    // éventuel), sous forme de mutations de champs {champ, avant, apres}
    // — voir focusEngine.js pour la production de ces mutations et
    // annulationService.js pour la pile LIFO qui s'en sert. Limitée à 10
    // entrées par partie (purge côté annulationService.js, pas ici) et
    // vidée à chaque fin de cycle.
    pileAnnulation: {
      keyPath: 'id',
      autoIncrement: true,
      index: [
        { nom: 'partieId', cle: 'partieId' }
      ]
    },

    // --- Catalogue (lecture seule, réimporté en bloc à chaque sync) ---
    maisons: { keyPath: 'nom', index: [] },
    technologies: { keyPath: 'nom', index: [] },
    focus: { keyPath: 'id', index: [] },
    evenements: { keyPath: ['code', 'cycle'], index: [] },
    pistesCivilisation: { keyPath: ['type', 'piste', 'caseNumero'], index: [] },
    programmes: { keyPath: 'code', index: [] },
    scenarios: { keyPath: 'id', index: [] },
    scenarioSecteurs: { keyPath: ['scenarioId', 'numero'], index: [] },
    scenarioAdjacences: { keyPath: ['scenarioId', 'numeroA', 'numeroB'], index: [] },
    scenarioTrousDeVer: { keyPath: ['scenarioId', 'numeroA', 'numeroB'], index: [] },
    typesSecteur: { keyPath: 'id', index: [] },
    originesMaison: { keyPath: 'idCarte', index: [] },
    // Programmes de départ (1-2 par Origine A/B, Marqualos en a 2 "A2"/"B2"
    // supplémentaires) — voir data/catalogue/programmesDepart.json, câblé
    // sur l'emplacement 0 du plateau Programme (Plat. maison,
    // GameService.creerPartie / obtenirProgrammeDepart_ /
    // programmesUtilisesParDefaut_). Pas de `nom` (identifié par
    // `maison`+`origine`/`code`) ni de `type` (Domination/Force/Soutien/
    // Richesse) — ces Programmes n'en ont pas, contrairement aux 32
    // cartes de programmes.json (confirmé par l'utilisateur, pas juste
    // une donnée manquante). Champ `incertain` (coupure Origine A/Origine
    // B) : les 30 entrées sont désormais confirmées par image du livret,
    // `incertain:false` partout.
    programmesDepart: { keyPath: 'code', index: [{ nom: 'maison', cle: 'maison' }] },

    // --- Technique ---
    meta: { keyPath: 'cle', index: [] }
  };

  /**
   * Ouvre (ou crée) la base — une seule ouverture partagée pour toute
   * l'appli (promesse mise en cache, pas de réouverture à chaque appel).
   */
  function ouvrir_() {
    if (promesseDB_) return promesseDB_;

    promesseDB_ = new Promise(function (resoudre, rejeter) {
      var requete = indexedDB.open(NOM_BASE, VERSION_BASE);

      requete.onupgradeneeded = function (evenement) {
        var base = evenement.target.result;
        Object.keys(STORES).forEach(function (nomStore) {
          if (base.objectStoreNames.contains(nomStore)) return;
          var config = STORES[nomStore];
          var options = { keyPath: config.keyPath };
          if (config.autoIncrement) options.autoIncrement = true;
          var store = base.createObjectStore(nomStore, options);
          (config.index || []).forEach(function (idx) {
            store.createIndex(idx.nom, idx.cle);
          });
        });
      };

      requete.onsuccess = function (evenement) {
        resoudre(evenement.target.result);
      };

      requete.onerror = function (evenement) {
        rejeter(evenement.target.error);
      };
    });

    return promesseDB_;
  }

  function verifierStore_(nomStore) {
    if (!STORES[nomStore]) {
      throw new Error('DB : store inconnu "' + nomStore + '".');
    }
  }

  /**
   * Lecture d'un enregistrement par sa clé (simple ou composée, selon le
   * keyPath du store).
   */
  function get(nomStore, cle) {
    verifierStore_(nomStore);
    return ouvrir_().then(function (base) {
      return new Promise(function (resoudre, rejeter) {
        var transaction = base.transaction(nomStore, 'readonly');
        var requete = transaction.objectStore(nomStore).get(cle);
        requete.onsuccess = function () { resoudre(requete.result || null); };
        requete.onerror = function () { rejeter(requete.error); };
      });
    });
  }

  /**
   * Lecture de tous les enregistrements d'un store.
   */
  function getAll(nomStore) {
    verifierStore_(nomStore);
    return ouvrir_().then(function (base) {
      return new Promise(function (resoudre, rejeter) {
        var transaction = base.transaction(nomStore, 'readonly');
        var requete = transaction.objectStore(nomStore).getAll();
        requete.onsuccess = function () { resoudre(requete.result || []); };
        requete.onerror = function () { rejeter(requete.error); };
      });
    });
  }

  /**
   * Écriture (création ou mise à jour) d'un seul enregistrement.
   * ⚠️ Ne touche jamais aux autres enregistrements du store — respecte la
   * règle projet "ne jamais rerender/écraser les autres champs si un seul
   * est modifié localement".
   */
  function put(nomStore, valeur) {
    verifierStore_(nomStore);
    return ouvrir_().then(function (base) {
      return new Promise(function (resoudre, rejeter) {
        var transaction = base.transaction(nomStore, 'readwrite');
        var requete = transaction.objectStore(nomStore).put(valeur);
        requete.onsuccess = function () { resoudre(valeur); };
        requete.onerror = function () { rejeter(requete.error); };
      });
    });
  }

  /**
   * Écrasement complet d'un store en une seule transaction : vide le
   * store puis réinsère tous les enregistrements fournis. Utilisé par
   * catalogueSync.js (le catalogue est toujours réimporté en bloc, jamais
   * fusionné partiellement).
   */
  function putTout(nomStore, valeurs) {
    verifierStore_(nomStore);
    return ouvrir_().then(function (base) {
      return new Promise(function (resoudre, rejeter) {
        var transaction = base.transaction(nomStore, 'readwrite');
        var store = transaction.objectStore(nomStore);
        store.clear();
        (valeurs || []).forEach(function (valeur) { store.put(valeur); });
        transaction.oncomplete = function () { resoudre(valeurs); };
        transaction.onerror = function () { rejeter(transaction.error); };
      });
    });
  }

  /**
   * Suppression d'un seul enregistrement par sa clé (simple ou composée).
   * Pas d'erreur si la clé n'existe pas (IndexedDB delete() est idempotent).
   */
  function supprimer(nomStore, cle) {
    verifierStore_(nomStore);
    return ouvrir_().then(function (base) {
      return new Promise(function (resoudre, rejeter) {
        var transaction = base.transaction(nomStore, 'readwrite');
        var requete = transaction.objectStore(nomStore).delete(cle);
        requete.onsuccess = function () { resoudre(); };
        requete.onerror = function () { rejeter(requete.error); };
      });
    });
  }

  return {
    get: get,
    getAll: getAll,
    put: put,
    putTout: putTout,
    supprimer: supprimer
  };
})();
