/**
 * scoreService.js
 * Fin de partie & historique — Voidfall Companion PWA
 *
 * Barème de l'Influence du Néant et règle de victoire : le joueur doit
 * STRICTEMENT dépasser l'Influence du Néant pour l'emporter (égalité =
 * défaite du joueur).
 *
 * enregistrerFinDePartie ajoute `finDePartie`/`terminee` à l'objet partie
 * puis appelle GameService.sauvegarderPartie tel quel — ces deux champs
 * n'ont pas de colonne dédiée (comme joueur/adversaires/evenements...),
 * ils vivent donc naturellement dans `parties.etatJson` sans aucune
 * modification nécessaire à gameService.js (voir pourEtatJson_, qui ne
 * retire que les champs à colonne dédiée).
 *
 * ⚠️ `terminee` (ce fichier) est un indicateur informatif distinct de
 * `cycleTermine`/`statut` (gameService.js, dédiés au cycle) — les deux
 * notions restent séparées, pour ne pas complexifier la logique de
 * statut déjà en place.
 *
 * Dépend de : gameService.js (GameService.obtenirPartie/sauvegarderPartie/
 * listerParties), secteurService.js (SecteurService.obtenirSecteurs/
 * SCENARIO_PAR_DEFAUT) et db.js (DB.getAll) — à charger avant ce fichier
 * (calculerCompteursAutomatiques, voir plus bas).
 */

var ScoreService = (function () {
  'use strict';

  var BAREME = {
    secteursFaille: 30,
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

  // Postes du barème calculables depuis l'état déjà suivi par l'app —
  // le reste (catastrophes, crises permanentes, difficulté de base) ne vit
  // que sur le plateau physique et reste à saisir à la main.
  // `refugesIncomplets` a rejoint cette liste le 14/09/2026 (chantier
  // "Refuges", §3) — voir refugesIncomplets_ ci-dessous. `technologiesConsommees`
  // l'a rejointe le 17/09/2026 (EVOLUTION 35, todo.md) — compteur manuel
  // simple (plateauMaison.technologiesConsommees, saisi sur Plat.
  // Galactique/section Plateau Crise), simplement recopié ici, pas de
  // calcul — voir compteursAutomatiquesDepuisEtat_ ci-dessous.
  var CLES_COMPTEURS_AUTOMATISABLES = ['secteursFaille', 'gardiens', 'maisonsDechues', 'populationNeant', 'corruption', 'refugesIncomplets', 'technologiesConsommees'];

  /**
   * Nombre de tuiles de Refuge INCOMPLÈTES (§3, docs-rules-corruption-
   * gardiens-refuges-technoConsume.md — "20 Influence pour chaque Refuge
   * incomplet") — une tuile absente de `plateauMaison.refuges` (jamais
   * initialisée) compte comme incomplète par défaut, même logique que
   * GameService.completerRefuges. `config` = tailles de tuile du
   * scénario (ex. [2,2]) ; `refugesBruts` = `plateauMaison.refuges`.
   */
  function refugesIncomplets_(refugesBruts, config) {
    var refuges = refugesBruts || [];
    var incomplets = 0;
    config.forEach(function (taille, index) {
      var cubes = (refuges[index] && refuges[index].cubes) || 0;
      if (cubes < taille) incomplets += 1;
    });
    return incomplets;
  }

  /**
   * Calcule la part automatisable des compteurs d'Influence à partir de
   * l'état déjà suivi par l'app (secteurs + Civilisation). Pure — reçoit
   * les données déjà chargées, ne touche pas IndexedDB elle-même (voir
   * calculerCompteursAutomatiques ci-dessous pour le chargement).
   *
   * - secteursFaille : nombre de secteurs de type "faille" du scénario
   *   (fixé à la mise en place, jamais retiré du plateau en cours de
   *   partie — voir docs-rules-secteurs.md/évènements catalogue).
   * - gardiens : somme de nombreGardien sur tous les secteurs ("plateau
   *   central", par opposition au plateau Crise non suivi par l'app).
   * - maisonsDechues : secteurs avec une maison déchue encore assignée
   *   (maisonAssociee) — la carte reste sur le secteur même après
   *   invasion, envahirResoudre ne la retire jamais.
   * - populationNeant : population des secteurs avec de la Puissance
   *   Navale du Néant (pnNeant > 0) — la règle exclut explicitement les
   *   secteurs "du Néant" sans aucune Puissance Navale.
   * - corruption : secteurs Corrompus + pistes de Civilisation
   *   Corrompues. Partiel : ne compte pas la Corruption des Programmes/
   *   fiches Maison/offre de Programmes, non suivie par l'app — à
   *   compléter à la main si besoin.
   * - technologiesConsommees (EVOLUTION 35, todo.md) : simple recopiage du
   *   compteur manuel `plateauMaison.technologiesConsommees` (section
   *   Plateau Crise, Plat. Galactique) — aucun calcul, ce n'est pas un
   *   agrégat déduit des secteurs comme les autres postes ci-dessus.
   */
  function compteursAutomatiquesDepuisEtat_(secteurs, nombreSecteursFaille, corrompuesCivilisation, refugesBruts, configRefuges, technologiesConsommees) {
    secteurs = secteurs || [];

    var gardiens = 0;
    var maisonsDechues = 0;
    var populationNeant = 0;
    var corruptionSecteurs = 0;

    secteurs.forEach(function (s) {
      gardiens += Number(s.nombreGardien) || 0;
      if (s.maisonAssociee) maisonsDechues += 1;
      if ((Number(s.pnNeant) || 0) > 0) populationNeant += Number(s.population) || 0;
      if (s.corrompu) corruptionSecteurs += 1;
    });

    var corruptionCivilisation = ['societe', 'gouvernement', 'economie'].filter(function (piste) {
      return corrompuesCivilisation && corrompuesCivilisation[piste];
    }).length;

    return {
      secteursFaille: toNombre_(nombreSecteursFaille),
      gardiens: gardiens,
      maisonsDechues: maisonsDechues,
      populationNeant: populationNeant,
      corruption: corruptionSecteurs + corruptionCivilisation,
      refugesIncomplets: refugesIncomplets_(refugesBruts, configRefuges || []),
      technologiesConsommees: toNombre_(technologiesConsommees)
    };
  }

  /**
   * Charge l'état de la partie (secteurs + scénario + Civilisation) et
   * calcule la part automatisable des compteurs d'Influence — consommé
   * par l'écran Fin de partie pour pré-remplir le formulaire (champs
   * laissés modifiables, voir scoreVueService.js).
   */
  function calculerCompteursAutomatiques(partieId) {
    return GameService.obtenirPartie(partieId).then(function (partie) {
      var scenarioId = (partie && partie.scenarioId) || SecteurService.SCENARIO_PAR_DEFAUT;
      return Promise.all([
        Promise.resolve(partie),
        SecteurService.obtenirSecteurs(partieId),
        DB.getAll('scenarioSecteurs'),
        GameService.obtenirConfigRefuges(scenarioId)
      ]).then(function (resultats) {
        var secteurs = resultats[1];
        var lignesScenario = resultats[2];
        var configRefuges = resultats[3];

        var nombreSecteursFaille = lignesScenario.filter(function (l) {
          return l.scenarioId === scenarioId && l.type === 'faille';
        }).length;

        var corrompuesCivilisation = partie && partie.civilisation && partie.civilisation.corrompues;
        var refugesBruts = partie && partie.plateauMaison && partie.plateauMaison.refuges;
        var technologiesConsommees = partie && partie.plateauMaison && partie.plateauMaison.technologiesConsommees;

        return compteursAutomatiquesDepuisEtat_(secteurs, nombreSecteursFaille, corrompuesCivilisation, refugesBruts, configRefuges, technologiesConsommees);
      });
    });
  }

  return {

    BAREME: BAREME,
    DIFFICULTES_INFLUENCE_BASE: DIFFICULTES_INFLUENCE_BASE,
    CLES_COMPTEURS_AUTOMATISABLES: CLES_COMPTEURS_AUTOMATISABLES,
    calculerInfluence: calculerInfluence,
    calculerCompteursAutomatiques: calculerCompteursAutomatiques,

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
     * acquises, vainqueur), consommé par l'écran Historique
     * (historiqueVueService.js). GameService.listerParties() trie déjà
     * par date décroissante.
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
