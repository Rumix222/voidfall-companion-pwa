/**
 * secteurService.js
 * Plateau des secteurs — Voidfall Companion PWA
 * Version 1 — 17/08/2026
 *
 * Phase 3 du plan de migration : portage PARTIEL de SecteurService.js
 * (GAS, 338 l.). Seules les fonctions sans dépendance à une RPC Postgres
 * dont le SQL source n'a jamais été récupéré sont portées ici (même
 * situation déjà rencontrée pour choisirFocusHeroique/avancerCycle en
 * Phase 2 — voir gameService.js) :
 *
 *   PORTÉ : instancierSecteurs (mise en place du plateau à la création
 *   de partie — logique JS pure, aucune RPC), obtenirSecteurs (lecture),
 *   obtenirAdjacences (lecture catalogue), obtenirSecteurMere (lecture).
 *
 *   HORS PÉRIMÈTRE (RPC Postgres sans code source — secteurs_eligibles_
 *   construction, secteur_construire, secteurs_entretien_partie,
 *   secteur_regrouper, secteur_rappeler_cube, secteur_retirer_corruption,
 *   secteur_envahir_resoudre, secteur_deployer_cube) : toutes les ACTIONS
 *   de jeu sur les secteurs (construire, regrouper, envahir, etc.) —
 *   rien à porter, il faudrait les réécrire depuis les règles. Repoussé
 *   à une session dédiée (Phase 5, Combat/Invasion, ou une Phase de
 *   "moteur secteurs" séparée si le morceau s'avère trop gros).
 *
 * Simplification par rapport à GAS : getSecteurMereNumero(partieId) est
 * ici obtenirSecteurMere(scenarioId) — prend directement le scenarioId
 * (déjà connu de l'appelant via partie.scenarioId) plutôt que de
 * ré-interroger la partie pour le retrouver.
 *
 * Dépend de db.js (DB) : à charger avant ce fichier. gameService.js
 * dépend de ce fichier (creerPartie y fait appel) : à charger AVANT
 * gameService.js dans index.html.
 */

var SecteurService = (function () {
  'use strict';

  // ⚠️ Un seul scénario a de vraies données pour l'instant ('solo_1',
  // "Première ligne") — porté tel quel depuis SecteurService.js GAS.
  var SCENARIO_PAR_DEFAUT = 'solo_1';

  function ligneSecteurParDefaut_(partieId, ligne) {
    return {
      partieId: partieId,
      numero: ligne.numero,
      maisonAssociee: null,
      population: ligne.populationDepart,
      corrompu: !!ligne.corrompuDepart,
      nombreGardien: ligne.nombreGardienDepart || 0,
      guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      installationChantierNaval: 0,
      installationDefenseSecteur: ligne.installationDefenseSecteurDepart || 0,
      installationBaseStellaire: 0,
      pnNeant: ligne.pnNeantDepart || 0,
      pnCorvette: 0, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0,
      jetonPrime: ligne.jetonPrimeDepart || 0,
      jetonGloire: ligne.jetonGloireDepart || 0,
      jetonLiberation: ligne.jetonLiberationDepart || 0
    };
  }

  /**
   * Construit et enregistre les lignes secteursPartie pour une partie
   * tout juste créée. Tolérant (comme instancierSecteurs_ côté GAS) :
   * une erreur ici ne doit JAMAIS empêcher la création de la partie —
   * elle est capturée, journalée en console, et la fonction résout quand
   * même (tableau vide).
   */
  function instancierSecteurs(partie) {
    var scenarioId = partie.scenarioId || SCENARIO_PAR_DEFAUT;
    var nomsAdversaires = (partie.adversaires || []).map(function (m) { return m.nom; });
    var nomMaisonJoueur = partie.joueur ? partie.joueur.nom : null;
    var nomTechnologieDepart = (partie.joueur && partie.joueur.technologieDepart) ? partie.joueur.technologieDepart.nom : null;

    return Promise.all([
      DB.getAll('scenarioSecteurs'),
      DB.getAll('originesMaison'),
      DB.getAll('maisons')
    ]).then(function (resultats) {
      var lignesScenario = resultats[0]
        .filter(function (l) { return l.scenarioId === scenarioId; })
        .sort(function (a, b) { return a.numero - b.numero; });
      if (!lignesScenario.length) return [];

      var origine = resultats[1].filter(function (o) {
        return o.maison === nomMaisonJoueur && o.technologie === nomTechnologieDepart;
      })[0] || null;

      var maisonsParNom = {};
      resultats[2].forEach(function (m) { maisonsParNom[m.nom] = m; });
      var secteurMereDonnees = nomMaisonJoueur ? (maisonsParNom[nomMaisonJoueur] || null) : null;

      // Assigne une maison déchue DISTINCTE à chaque secteur "maison_dechue"
      // du scénario, parmi les 4 maisons tirées comme adversaires.
      var dechuesDisponibles = nomsAdversaires.slice();

      var secteurs = lignesScenario.map(function (ligne) {
        var secteur = ligneSecteurParDefaut_(partie.id, ligne);

        if (ligne.type === 'secteur_mere') {
          secteur.population = origine ? origine.secteurMerePopulation : null;

          // Les GUILDES du Secteur-Mère sont la SOMME de deux sources :
          // "maisons" (contenu fixe imprimé) + "originesMaison" (contenu
          // supplémentaire de l'Origine choisie) — jamais un remplacement
          // de l'une par l'autre (portage du correctif GAS du 12/08/2026).
          if (secteurMereDonnees) {
            secteur.installationChantierNaval = secteurMereDonnees.secteurMereInstallationChantierNaval || 0;
            secteur.installationDefenseSecteur += secteurMereDonnees.secteurMereInstallationDefenseSecteur || 0;
            secteur.installationBaseStellaire = secteurMereDonnees.secteurMereInstallationBaseStellaire || 0;
          }

          var guildeMaison = secteurMereDonnees || {};
          var guildeOrigine = origine || {};
          secteur.guildeFermiers = (guildeMaison.secteurMereGuildeFermiers || 0) + (guildeOrigine.secteurMereGuildeFermiers || 0);
          secteur.guildeIngenieurs = (guildeMaison.secteurMereGuildeIngenieurs || 0) + (guildeOrigine.secteurMereGuildeIngenieurs || 0);
          secteur.guildeMineurs = (guildeMaison.secteurMereGuildeMineurs || 0) + (guildeOrigine.secteurMereGuildeMineurs || 0);
          secteur.guildeBanquiers = (guildeMaison.secteurMereGuildeBanquiers || 0) + (guildeOrigine.secteurMereGuildeBanquiers || 0);
          secteur.guildeScientifiques = (guildeMaison.secteurMereGuildeScientifiques || 0) + (guildeOrigine.secteurMereGuildeScientifiques || 0);

          if (origine) {
            secteur.pnCorvette = origine.secteurMerePnCorvette || 0;
            secteur.pnSentinelle = origine.secteurMerePnSentinelle || 0;
            secteur.pnDestroyer = origine.secteurMerePnDestroyer || 0;
            secteur.pnCuirasse = origine.secteurMerePnCuirasse || 0;
            secteur.pnPorteVaisseau = origine.secteurMerePnPorteVaisseau || 0;
          }
        } else if (ligne.sousType === 'avant_poste') {
          secteur.population = origine ? origine.avantPostePopulation : null;
          if (origine) {
            secteur.installationChantierNaval = origine.avantPosteInstallationChantierNaval || 0;
            secteur.installationDefenseSecteur += origine.avantPosteInstallationDefenseSecteur || 0;
            secteur.installationBaseStellaire = origine.avantPosteInstallationBaseStellaire || 0;
            secteur.guildeFermiers = origine.avantPosteGuildeFermiers || 0;
            secteur.guildeIngenieurs = origine.avantPosteGuildeIngenieurs || 0;
            secteur.guildeMineurs = origine.avantPosteGuildeMineurs || 0;
            secteur.guildeBanquiers = origine.avantPosteGuildeBanquiers || 0;
            secteur.guildeScientifiques = origine.avantPosteGuildeScientifiques || 0;
            secteur.pnCorvette = origine.avantPostePnCorvette || 0;
            secteur.pnSentinelle = origine.avantPostePnSentinelle || 0;
            secteur.pnDestroyer = origine.avantPostePnDestroyer || 0;
            secteur.pnCuirasse = origine.avantPostePnCuirasse || 0;
            secteur.pnPorteVaisseau = origine.avantPostePnPorteVaisseau || 0;
          }
        } else if (ligne.sousType === 'maison_dechue') {
          var nomDechue = dechuesDisponibles.length
            ? dechuesDisponibles.splice(Math.floor(Math.random() * dechuesDisponibles.length), 1)[0]
            : null;
          secteur.maisonAssociee = nomDechue;

          if (nomDechue) {
            var donneesDechue = maisonsParNom[nomDechue] || null;
            if (donneesDechue) {
              secteur.population = donneesDechue.maisonDechuePopulation;
              secteur.installationChantierNaval = donneesDechue.maisonDechueInstallationChantierNaval || 0;
              secteur.installationDefenseSecteur += donneesDechue.maisonDechueInstallationDefenseSecteur || 0;
              secteur.installationBaseStellaire = donneesDechue.maisonDechueInstallationBaseStellaire || 0;
              secteur.guildeFermiers = donneesDechue.maisonDechueGuildeFermiers || 0;
              secteur.guildeIngenieurs = donneesDechue.maisonDechueGuildeIngenieurs || 0;
              secteur.guildeMineurs = donneesDechue.maisonDechueGuildeMineurs || 0;
              secteur.guildeBanquiers = donneesDechue.maisonDechueGuildeBanquiers || 0;
              secteur.guildeScientifiques = donneesDechue.maisonDechueGuildeScientifiques || 0;
            }
          }
        }

        return secteur;
      });

      return Promise.all(secteurs.map(function (s) { return DB.put('secteursPartie', s); }))
        .then(function () { return secteurs; });
    }).catch(function (erreur) {
      console.warn('SecteurService.instancierSecteurs : échec (partie créée quand même, sans plateau de secteurs) :', erreur);
      return [];
    });
  }

  /**
   * État actuel des secteurs d'une partie (écran de consultation), triés
   * par numéro.
   */
  function obtenirSecteurs(partieId) {
    return DB.getAll('secteursPartie').then(function (secteurs) {
      return secteurs
        .filter(function (s) { return s.partieId === partieId; })
        .sort(function (a, b) { return a.numero - b.numero; });
    });
  }

  /**
   * Adjacences du scénario (paires de secteurs voisins) — pour la future
   * action "Regrouper" (Phase 5+). Simple lecture catalogue.
   */
  function obtenirAdjacences(scenarioId) {
    return DB.getAll('scenarioAdjacences').then(function (lignes) {
      return lignes.filter(function (l) { return l.scenarioId === scenarioId; });
    });
  }

  /**
   * Numéro du Secteur-Mère du joueur pour un scénario donné (ou null si
   * introuvable). Voir note d'en-tête : prend scenarioId directement,
   * contrairement à getSecteurMereNumero(partieId) côté GAS.
   */
  function obtenirSecteurMere(scenarioId) {
    return DB.getAll('scenarioSecteurs').then(function (lignes) {
      var ligne = lignes.filter(function (l) { return l.scenarioId === scenarioId && l.type === 'secteur_mere'; })[0];
      return ligne ? ligne.numero : null;
    });
  }

  return {
    SCENARIO_PAR_DEFAUT: SCENARIO_PAR_DEFAUT,
    instancierSecteurs: instancierSecteurs,
    obtenirSecteurs: obtenirSecteurs,
    obtenirAdjacences: obtenirAdjacences,
    obtenirSecteurMere: obtenirSecteurMere
  };
})();
