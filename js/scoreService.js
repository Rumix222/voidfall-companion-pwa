/**
 * scoreService.js
 * Fin de partie & historique — Voidfall Companion PWA
 * Version 1 — 17/08/2026 (Session 7, Phase 5 — Score)
 *
 * Portage quasi textuel de ScoreService.js (GAS, 213 l.) — comme
 * CivilisationService.js et combat.html avant lui, ce module s'est avéré
 * ENTIÈREMENT PUR côté GAS (aucune RPC Postgres, uniquement des appels
 * DataService.getPartieById/updatePartieEtHistorique/getAllParties déjà
 * équivalents à GameService.obtenirPartie/sauvegarderPartie/listerParties
 * côté PWA). Barème de l'Influence du Néant et règle de victoire (le
 * joueur doit STRICTEMENT dépasser l'Influence du Néant) repris à
 * l'identique.
 *
 * enregistrerFinDePartie ajoute `finDePartie`/`terminee` à l'objet partie
 * puis appelle GameService.sauvegarderPartie tel quel — ces deux champs
 * n'ont pas de colonne dédiée (comme joueur/adversaires/evenements...),
 * ils vivent donc naturellement dans `parties.etatJson` sans aucune
 * modification nécessaire à gameService.js (voir pourEtatJson_, qui ne
 * retire que les champs à colonne dédiée).
 *
 * ⚠️ `terminee` (ce fichier) est un indicateur informatif distinct de
 * `cycleTermine`/`statut` (gameService.js, dédiés au cycle) — pas de
 * fusion des deux notions cette session, pour ne pas toucher à la logique
 * de statut déjà en place.
 *
 * Dépend de : gameService.js (GameService.obtenirPartie/sauvegarderPartie/
 * listerParties) — à charger avant ce fichier.
 */

var ScoreService = (function () {
  'use strict';

  var BAREME = {
    secteursFaille: 60,
    refugesIncomplets: 20,
    catastrophes: 20,
    gardiens: 10,
    technologiesConsommees: 5,
    crisesPermanentes: 5,
    maisonsDechues: 3,
    corruption: 2,
    populationNeant: 1
  };

  var DIFFICULTES_INFLUENCE_BASE = [60, 100, 140];

  function toNombre_(v) {
    var n = Number(v);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  /**
   * Calcule l'Influence totale du Néant à partir des compteurs saisis.
   * compteurs.difficulteBase : 60 | 100 | 140, + une clé par entrée de
   * BAREME (nombres entiers >= 0). Retourne le détail par poste + total.
   */
  function calculerInfluence(compteurs) {
    compteurs = compteurs || {};

    var base = DIFFICULTES_INFLUENCE_BASE.indexOf(Number(compteurs.difficulteBase)) !== -1
      ? Number(compteurs.difficulteBase)
      : 0;

    var detail = { difficulteBase: base };
    var total = base;

    Object.keys(BAREME).forEach(function (cle) {
      var quantite = toNombre_(compteurs[cle]);
      var points = quantite * BAREME[cle];
      detail[cle] = { quantite: quantite, points: points };
      total += points;
    });

    detail.total = total;
    return detail;
  }

  /**
   * Le joueur l'emporte si son score final est STRICTEMENT supérieur à
   * l'Influence du Néant ; en cas d'égalité stricte, le joueur perd.
   */
  function determinerVainqueur_(scoreFinal, influenceTotal) {
    return scoreFinal > influenceTotal ? 'joueur' : 'neant';
  }

  function evenementsUtilises_(partie) {
    var evenements = (partie && partie.evenements) || {};
    return [1, 2, 3]
      .map(function (cycle) { return evenements['cycle' + cycle]; })
      .filter(Boolean)
      .map(function (e) { return { nom: e.nom, cycle: e.cycle }; });
  }

  /**
   * Les 8 technologies des maisons déchues tirées à la mise en place
   * (technologies "disponibles" que le joueur pouvait obtenir).
   */
  function technologiesDisponibles_(partie) {
    var toutes = [];
    ((partie && partie.adversaires) || []).forEach(function (m) {
      (m.technologies || []).forEach(function (t) {
        toutes.push({ nom: t.nom, maison: m.nom, sansPoint: !!t.sansPoint });
      });
    });
    return toutes;
  }

  /**
   * Technologies effectivement acquises : technologie de départ +
   * emplacements remplis de technologiesObtenues, avec leur statut
   * "améliorée".
   */
  function technologiesAcquises_(partie) {
    var acquises = [];
    var depart = partie && partie.joueur && partie.joueur.technologieDepart;
    if (depart) {
      acquises.push({ nom: depart.nom, origine: 'depart', amelioree: !!depart.amelioree });
    }
    ((partie && partie.technologiesObtenues) || []).forEach(function (t) {
      if (t) acquises.push({ nom: t.nom, maison: t.maison, origine: 'obtenue', amelioree: !!t.amelioree });
    });
    return acquises;
  }

  return {

    BAREME: BAREME,
    DIFFICULTES_INFLUENCE_BASE: DIFFICULTES_INFLUENCE_BASE,
    calculerInfluence: calculerInfluence,

    /**
     * Enregistre la fin de partie : score final saisi + calcul de
     * l'Influence du Néant à partir des compteurs saisis + détermination
     * du vainqueur. Persisté via GameService.sauvegarderPartie (etatJson).
     */
    enregistrerFinDePartie: function (partieId, scoreFinal, compteursInfluence) {
      return GameService.obtenirPartie(partieId).then(function (partie) {
        if (!partie) throw new Error('Partie introuvable.');

        var influence = calculerInfluence(compteursInfluence);
        var scoreFinalNombre = toNombre_(scoreFinal);
        var vainqueur = determinerVainqueur_(scoreFinalNombre, influence.total);

        partie.finDePartie = {
          scoreFinal: scoreFinalNombre,
          influence: influence,
          vainqueur: vainqueur,
          dateFin: new Date().toISOString()
        };
        partie.terminee = true;

        var details = 'Score ' + scoreFinalNombre + ' / Influence Néant ' + influence.total + ' / Vainqueur : ' + vainqueur;
        return GameService.sauvegarderPartie(partie, 'fin_de_partie', details).then(function () {
          return partie;
        });
      });
    },

    /**
     * Historique enrichi (événements choisis, technologies disponibles/
     * acquises, vainqueur), pour un futur écran Historique dédié (Phase 6).
     * GameService.listerParties() trie déjà par date décroissante.
     */
    getHistorique: function () {
      return GameService.listerParties().then(function (parties) {
        return parties.map(function (partie) {
          return {
            id: partie.id,
            date: partie.dateCreation,
            maisonJoueur: partie.joueur ? partie.joueur.nom : '',
            terminee: !!partie.terminee,
            archivee: !!partie.archivee,
            scoreFinal: partie.finDePartie ? partie.finDePartie.scoreFinal : null,
            influenceTotal: partie.finDePartie ? partie.finDePartie.influence.total : null,
            vainqueur: partie.finDePartie ? partie.finDePartie.vainqueur : null,
            evenements: evenementsUtilises_(partie),
            technologiesDisponibles: technologiesDisponibles_(partie),
            technologiesAcquises: technologiesAcquises_(partie)
          };
        });
      });
    }
  };
})();
