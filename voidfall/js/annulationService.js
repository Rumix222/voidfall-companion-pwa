/**
 * annulationService.js
 * Pile d'annulation des actions Focus — Voidfall Companion PWA
 *
 * Permet d'annuler la dernière action Focus jouée, puis l'avant-dernière,
 * etc. (annulation en chaîne, LIFO). Réécrit les valeurs `avant` de chaque
 * mutation, aucune logique métier "inverse" à recalculer.
 *
 * Persisté en IndexedDB (store `pileAnnulation`, voir db.js) plutôt qu'en
 * mémoire, pour survivre à une fermeture accidentelle de l'app en cours
 * de partie.
 *
 * EVOLUTION 18 (todo.md, retour utilisateur) : une entrée de pile peut
 * mélanger DEUX formats de mutation (restaurerMutations_ ci-dessous gère
 * les deux, une entrée donnée n'utilise en pratique que l'un ou l'autre
 * selon la version de l'app qui l'a empilée) :
 * - Legacy (focusEngine.js, `diffChamps_`, champ par champ sur
 *   plateauMaison) : `{champ, avant, apres}`, cible implicitement
 *   plateauMaison[partieId].
 * - Générique (db.js, `DB.demarrerEnregistrement`/`put` — capture TOUTE
 *   écriture DB.put pendant qu'un enregistrement est actif, quel que soit
 *   le store, voir son en-tête) : `{store, cle, avant, apres}`, `avant`/
 *   `apres` sont la ligne COMPLÈTE avant/après (pas juste un champ) —
 *   restaurée telle quelle (DB.put), ou la ligne est supprimée si `avant`
 *   est `null` (elle n'existait pas avant l'action). C'est ce format qui
 *   permet désormais d'annuler les effets déclenchés par une action Focus/
 *   Programme en main mais persistés directement par une popup déléguée
 *   (secteurs, pistes de Civilisation, Programmes, Gloire...) — jusqu'ici
 *   hors de portée de la pile d'annulation (todo.md : annuler Conquête
 *   "Planifier" ne redéplaçait pas la Corruption ni ne retirait le
 *   Programme gagné).
 *
 * Règles :
 * - Limite de 10 actions par partie (la plus ancienne est purgée au-delà).
 * - La pile doit être entièrement vidée à chaque fin de cycle (voir
 *   viderPile ci-dessous) — exposée ici, pas encore appelée
 *   automatiquement par GameService.
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
   * Réécrit les valeurs `avant` d'un tableau de mutations (les 2 formats
   * cohabitants, voir en-tête de fichier) pour une partie donnée — SANS
   * toucher à la pile elle-même. Exportée (`restaurerMutations`) pour être
   * réutilisée par FocusEngine.jouerActionEtPersister (EVOLUTION 18) :
   * quand l'Effet d'une action échoue APRÈS qu'une ou plusieurs popups
   * déléguées aient déjà écrit en base (ex. "et/ou" : une option réussit,
   * l'autre est annulée — la RÈGLE MÉTIER de focusEngine.js exige qu'un
   * Effet en échec ne laisse AUCUNE trace), ces écritures — capturées par
   * `DB.demarrerEnregistrement`/`put` pendant la résolution — doivent être
   * défaites immédiatement, sans jamais transiter par la pile (rien n'est
   * empilé pour une action qui a échoué).
   *
   * Les mutations `{champ, avant, apres}` (legacy, implicitement
   * plateauMaison[partieId]) sont regroupées PAR LIGNE (une seule
   * lecture-écriture même si plusieurs champs plateauMaison ont changé) ;
   * les mutations `{store, cle, avant, apres}` (générique, ligne complète)
   * sont restaurées indépendamment (chaque `store`+`cle` n'apparaît
   * qu'une fois par capture, voir db.js).
   */
  function restaurerMutations_(partieId, mutations) {
    mutations = mutations || [];
    if (!mutations.length) return Promise.resolve();

    var mutationsChampPlateauMaison = mutations.filter(function (m) { return m.champ; });
    var mutationsLigneCompletes = mutations.filter(function (m) { return !m.champ; });

    var promesse = Promise.resolve();

    if (mutationsChampPlateauMaison.length) {
      promesse = promesse.then(function () {
        return DB.get('plateauMaison', partieId).then(function (ligne) {
          if (!ligne) return; // plateau introuvable : rien à restaurer plutôt que de faire échouer toute l'annulation
          mutationsChampPlateauMaison.forEach(function (m) { ligne[m.champ] = m.avant; });
          return DB.put('plateauMaison', ligne);
        });
      });
    }

    mutationsLigneCompletes.forEach(function (m) {
      promesse = promesse.then(function () {
        return (m.avant == null) ? DB.supprimer(m.store, m.cle) : DB.put(m.store, m.avant);
      });
    });

    return promesse;
  }

  /**
   * Annule la dernière action de la partie (dépile) : réécrit les valeurs
   * `avant` de chaque mutation (voir restaurerMutations_ ci-dessus), puis
   * retire l'entrée de la pile. Ré-appelable en chaîne : chaque appel
   * dépile une entrée de plus (dernière, puis avant-dernière, etc.),
   * jusqu'à pile vide. Retourne {succes: false, raison: 'pile_vide'} si
   * rien à annuler.
   */
  function annulerDerniere_(partieId) {
    if (!partieId) return Promise.reject(new Error('AnnulationService.annulerDerniere : partieId manquant.'));

    return obtenirPileTriee_(partieId).then(function (pile) {
      if (!pile.length) return { succes: false, raison: 'pile_vide' };

      var derniere = pile[pile.length - 1];
      return restaurerMutations_(partieId, derniere.mutations).then(function () {
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

  return {
    empiler: empiler_,
    annulerDerniere: annulerDerniere_,
    viderPile: viderPile_,
    obtenirPile: obtenirPile_,
    compter: compter_,
    // EVOLUTION 18 (todo.md) — voir en-tête de fichier. Réutilisée par
    // FocusEngine.jouerActionEtPersister pour annuler immédiatement les
    // écritures directes d'une action dont l'Effet a finalement échoué.
    restaurerMutations: restaurerMutations_
  };
})();
