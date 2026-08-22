/**
 * annulationService.js
 * Pile d'annulation des actions Focus — Voidfall Companion PWA
 * Version 2 — 21/08/2026 (docs/docs-rapport.md CM-8 — retrait de l'export LIMITE_PAR_PARTIE jamais lu)
 *
 * Version 1 — 17/08/2026 (Session 4, Phase 4 suite)
 *
 * Permet d'annuler la dernière action Focus jouée, puis l'avant-dernière,
 * etc. (annulation en chaîne, LIFO). S'appuie sur les mutations {champ,
 * avant, apres} produites par focusEngine.js : annuler = réécrire les
 * valeurs `avant` sur plateauMaison, aucune logique métier "inverse" à
 * recalculer (choix retenu en session pour la robustesse — voir en-tête
 * de focusEngine.js).
 *
 * Persisté en IndexedDB (store `pileAnnulation`, voir db.js v3) plutôt
 * qu'en mémoire, pour survivre à une fermeture accidentelle de l'app en
 * cours de partie.
 *
 * Règles tranchées en session :
 * - Limite de 10 actions par partie (la plus ancienne est purgée au-delà).
 * - La pile est entièrement vidée à chaque fin de cycle (à appeler
 *   depuis GameService quand cette fonction existera — hors périmètre de
 *   cette session, voir docs-migration-pwa-plan.md, avancerCycle marqué
 *   "hors périmètre" faute de RPC source).
 *
 * Dépend de db.js (DB) : à charger avant ce fichier.
 */

var AnnulationService = (function () {
  'use strict';

  var LIMITE_PAR_PARTIE = 10;

  function obtenirPileTriee_(partieId) {
    return DB.getAll('pileAnnulation').then(function (toutes) {
      return toutes
        .filter(function (e) { return e.partieId === partieId; })
        .sort(function (a, b) { return a.id - b.id; }); // plus ancien -> plus récent
    });
  }

  /**
   * Empile une action jouée avec succès (mutations déjà appliquées en
   * base par l'appelant — voir FocusEngine.jouerActionEtPersister). Purge
   * la plus ancienne entrée de CETTE partie si la limite est dépassée.
   */
  function empiler_(partieId, entree) {
    if (!partieId) return Promise.reject(new Error('AnnulationService.empiler : partieId manquant.'));
    if (!entree || !entree.mutations || !entree.mutations.length) {
      return Promise.resolve(null); // rien à empiler (action sans mutation, ex. tout hors périmètre)
    }

    return obtenirPileTriee_(partieId).then(function (pile) {
      var purge = Promise.resolve();
      if (pile.length >= LIMITE_PAR_PARTIE) {
        var aPurger = pile.slice(0, pile.length - LIMITE_PAR_PARTIE + 1);
        purge = Promise.all(aPurger.map(function (e) { return DB.supprimer('pileAnnulation', e.id); }));
      }
      return purge.then(function () {
        return DB.put('pileAnnulation', {
          partieId: partieId,
          dateAction: new Date().toISOString(),
          source: entree.source || '',
          mutations: entree.mutations
        });
      });
    });
  }

  /**
   * Annule la dernière action de la partie (dépile) : réécrit les valeurs
   * `avant` de chaque mutation sur plateauMaison, puis retire l'entrée de
   * la pile. Ré-appelable en chaîne : chaque appel dépile une entrée de
   * plus (dernière, puis avant-dernière, etc.), jusqu'à pile vide.
   * Retourne {succes: false, raison: 'pile_vide'} si rien à annuler.
   */
  function annulerDerniere_(partieId) {
    if (!partieId) return Promise.reject(new Error('AnnulationService.annulerDerniere : partieId manquant.'));

    return obtenirPileTriee_(partieId).then(function (pile) {
      if (!pile.length) return { succes: false, raison: 'pile_vide' };

      var derniere = pile[pile.length - 1];
      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour annulation (partie ' + partieId + ').');
        derniere.mutations.forEach(function (m) { ligne[m.champ] = m.avant; });
        return DB.put('plateauMaison', ligne);
      }).then(function () {
        return DB.supprimer('pileAnnulation', derniere.id);
      }).then(function () {
        return { succes: true, source: derniere.source, mutations: derniere.mutations };
      });
    });
  }

  /**
   * Vide entièrement la pile d'une partie — à appeler à chaque fin de
   * cycle (règle tranchée en session).
   */
  function viderPile_(partieId) {
    if (!partieId) return Promise.reject(new Error('AnnulationService.viderPile : partieId manquant.'));
    return obtenirPileTriee_(partieId).then(function (pile) {
      return Promise.all(pile.map(function (e) { return DB.supprimer('pileAnnulation', e.id); }));
    }).then(function () { return true; });
  }

  /**
   * Liste la pile d'une partie (plus récent en dernier), pour affichage
   * (ex. un bouton "Annuler : <source de la dernière action>").
   */
  function obtenirPile_(partieId) {
    return obtenirPileTriee_(partieId);
  }

  /**
   * Longueur de la pile d'une partie (pratique pour griser un bouton
   * "Annuler" quand elle est vide).
   */
  function compter_(partieId) {
    return obtenirPileTriee_(partieId).then(function (pile) { return pile.length; });
  }

  // 21/08/2026 (docs/docs-rapport.md CM-8) : LIMITE_PAR_PARTIE retirée de
  // l'API publique (zéro appelant hors du fichier) — reste une constante
  // privée, toujours utilisée en interne par empiler_.
  return {
    empiler: empiler_,
    annulerDerniere: annulerDerniere_,
    viderPile: viderPile_,
    obtenirPile: obtenirPile_,
    compter: compter_
  };
})();
