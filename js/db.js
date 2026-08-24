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
   * Écriture BRUTE (création ou mise à jour) d'un seul enregistrement —
   * jamais appelée directement en dehors de put() ci-dessous (qui
   * l'entoure de la capture d'enregistrement EVOLUTION 18, voir plus bas).
   * ⚠️ Ne touche jamais aux autres enregistrements du store — respecte la
   * règle projet "ne jamais rerender/écraser les autres champs si un seul
   * est modifié localement".
   */
  function ecrirePut_(nomStore, valeur) {
    return ouvrir_().then(function (base) {
      return new Promise(function (resoudre, rejeter) {
        var transaction = base.transaction(nomStore, 'readwrite');
        var requete = transaction.objectStore(nomStore).put(valeur);
        requete.onsuccess = function () { resoudre(valeur); };
        requete.onerror = function () { rejeter(requete.error); };
      });
    });
  }

  // ------------------------------------------------------------
  // EVOLUTION 18 (todo.md, retour utilisateur — annuler la dernière action
  // ne rétablit pas les effets déclenchés en dehors de plateauMaison, ex.
  // Focus Conquête "Planifier" : le Programme gagné et la Corruption
  // déplacée ne sont pas défaits par "Annuler la dernière action") :
  //
  // Journal de bord ("changelog") générique, plutôt qu'un système de
  // mutations construites à la main par chaque popup/service — TOUTE
  // écriture DB.put() passée pendant un enregistrement actif est capturée
  // automatiquement, quel que soit le store ou l'appelant (secteurService.js/
  // civilisationService.js/gameService.js n'ont RIEN à changer). Un seul
  // "avant"/"apres" est conservé PAR ENREGISTREMENT (store+clé) : si la
  // même ligne est réécrite plusieurs fois pendant une même action (ex.
  // "regrouper" touche 2 secteurs, ou une piste de Civilisation chaîne
  // plusieurs "avance rapide"), seul le tout premier "avant" et le tout
  // dernier "apres" sont retenus — annuler restaure bien l'état d'avant
  // l'action entière, pas un état intermédiaire.
  //
  // Portée délibérément limitée à une "action" au sens todo.md (Action
  // Focus via FocusEngine.jouerActionEtPersister, action de Programme en
  // main via GameService.utiliserProgramme) : ce sont les 2 SEULS
  // appelants qui démarrent un enregistrement (voir demarrerEnregistrement/
  // arreterEnregistrement ci-dessous, appelés depuis focusEngine.js/
  // gameService.js). Un effet déclenché par un Événement galactique
  // (Cadre) n'est PAS enregistré (aucun `demarrerEnregistrement` autour de
  // GameService.appliquerCadre*) — conforme à la règle explicite du
  // todo.md : "L'effet d'un evenement n'a pas a etre annulé... il ne faut
  // meme pas le tracer".
  //
  // `pileAnnulation`/`parties`/`historique` sont TOUJOURS exclus de la
  // capture (stores de bookkeeping, jamais du contenu de partie à annuler)
  // — évite aussi tout risque de capture récursive si un enregistrement
  // reste actif au moment où AnnulationService.empiler écrit sa propre
  // entrée (en pratique jamais le cas : empiler est toujours appelé APRÈS
  // arreterEnregistrement par les 2 orchestrateurs ci-dessus).
  // ------------------------------------------------------------

  var STORES_EXCLUS_ENREGISTREMENT_ = { pileAnnulation: true, parties: true, historique: true };
  var enregistrement_ = null; // null = inactif, sinon {'store|JSON(cle)': {store, cle, avant, apres}}

  function clonerValeur_(valeur) {
    return valeur == null ? valeur : JSON.parse(JSON.stringify(valeur));
  }

  /**
   * Extrait la clé (simple ou composée) d'un enregistrement à partir du
   * keyPath déclaré du store (STORES ci-dessus) — même convention que
   * IndexedDB lui-même (keyPath tableau = clé composée, dans l'ordre).
   */
  function clePourEnregistrement_(nomStore, valeur) {
    var keyPath = STORES[nomStore].keyPath;
    if (Array.isArray(keyPath)) return keyPath.map(function (champ) { return valeur[champ]; });
    return valeur[keyPath];
  }

  /**
   * Démarre un nouvel enregistrement (remplace tout enregistrement en
   * cours — un seul à la fois, JS étant mono-thread et les 2 orchestrateurs
   * concernés n'imbriquant jamais 2 actions annulables en parallèle).
   */
  function demarrerEnregistrement() {
    enregistrement_ = {};
  }

  /**
   * Arrête l'enregistrement en cours et retourne les mutations capturées
   * (tableau de {store, cle, avant, apres}), prêt à être passé tel quel à
   * AnnulationService.empiler. Sans effet si aucun enregistrement actif
   * (retourne []) — sûr à appeler même après une erreur en amont.
   */
  function arreterEnregistrement() {
    var captures = enregistrement_
      ? Object.keys(enregistrement_).map(function (cleInterne) { return enregistrement_[cleInterne]; })
      : [];
    enregistrement_ = null;
    return captures;
  }

  /**
   * Vrai si un enregistrement est actuellement actif — consommé par
   * civilisationService.js (avancerPiste) pour savoir si CET appel fait
   * partie d'une action déjà enregistrée par un orchestrateur englobant
   * (auquel cas il ne doit PAS empiler sa propre entrée séparée dans la
   * pile d'annulation, ses mutations remontant naturellement dans
   * l'enregistrement ambiant) ou s'il est déclenché de façon autonome
   * (bouton dédié écran Plat. maison, hors de toute action Focus/Programme
   * — comportement inchangé, self-empile comme avant EVOLUTION 18).
   */
  function enregistrementActif() {
    return !!enregistrement_;
  }

  /**
   * Écriture (création ou mise à jour) d'un seul enregistrement — capture
   * transparente pour la pile d'annulation si un enregistrement est actif
   * (EVOLUTION 18 ci-dessus), délègue à ecrirePut_ pour l'écriture réelle.
   */
  function put(nomStore, valeur) {
    verifierStore_(nomStore);

    if (!enregistrement_ || STORES_EXCLUS_ENREGISTREMENT_[nomStore]) {
      return ecrirePut_(nomStore, valeur);
    }

    var cle = clePourEnregistrement_(nomStore, valeur);
    var cleInterne = nomStore + '|' + JSON.stringify(cle);
    var enregistrementCourant = enregistrement_;

    function noterApres_(resultat) {
      // enregistrementCourant (pas enregistrement_) : si un NOUVEL
      // enregistrement a démarré entre-temps (ne devrait jamais arriver en
      // pratique, mono-thread + pas d'imbrication), on n'écrit pas dans le
      // mauvais enregistrement.
      var entree = enregistrementCourant[cleInterne];
      if (entree) entree.apres = clonerValeur_(valeur);
      return resultat;
    }

    if (enregistrementCourant[cleInterne]) {
      // Déjà touché plus tôt dans CETTE action : "avant" déjà capturé,
      // seul "apres" doit avancer.
      return ecrirePut_(nomStore, valeur).then(noterApres_);
    }

    // Premier contact avec cette ligne pendant l'action : capture "avant"
    // via une lecture fraîche AVANT d'écrire.
    return get(nomStore, cle).then(function (avant) {
      enregistrementCourant[cleInterne] = { store: nomStore, cle: cle, avant: clonerValeur_(avant), apres: null };
      return ecrirePut_(nomStore, valeur).then(noterApres_);
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
    supprimer: supprimer,
    // EVOLUTION 18 (todo.md) — voir bloc de commentaires ci-dessus.
    demarrerEnregistrement: demarrerEnregistrement,
    arreterEnregistrement: arreterEnregistrement,
    enregistrementActif: enregistrementActif
  };
})();
