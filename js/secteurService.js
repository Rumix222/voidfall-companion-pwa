/**
 * secteurService.js
 * Plateau des secteurs — Voidfall Companion PWA
 * Version 2 — 17/08/2026 (Session 12 — SQL RPC récupéré)
 *
 * 17/08/2026 (Session 12) : portage de toutes les actions de jeu sur les
 * secteurs, désormais possible grâce au code SQL des RPC (fourni par
 * l'utilisateur, voir rpc.json) — construire, deployerCube,
 * envahirResoudre, rappelerCube, regrouper, retirerCorruption,
 * obtenirSecteursEligiblesConstruction, getEntretien. Portage LIGNE À
 * LIGNE de chaque fonction PL/pgSQL (mêmes validations, mêmes messages
 * d'erreur, même ordre d'opérations), adapté au modèle IndexedDB
 * (secteursPartie, clé composée [partieId, numero] — pas de transaction
 * SQL multi-lignes ni de verrou FOR UPDATE : JS étant mono-thread, aucun
 * autre appelant ne peut s'intercaler entre lecture et écriture ici).
 *
 * Phase 3 du plan de migration : portage PARTIEL de SecteurService.js
 * (GAS, 338 l.). Seules les fonctions sans dépendance à une RPC Postgres
 * dont le SQL source n'a jamais été récupéré sont portées ici (même
 * situation déjà rencontrée pour choisirFocusHeroique/avancerCycle en
 * Phase 2 — voir gameService.js) :
 *
 *   PORTÉ : instancierSecteurs (mise en place du plateau à la création
 *   de partie — logique JS pure, aucune RPC), obtenirSecteurs (lecture),
 *   obtenirAdjacences (lecture catalogue), obtenirSecteurMere (lecture),
 *   ET (Session 12) construire/deployerCube/envahirResoudre/
 *   rappelerCube/regrouper/retirerCorruption/
 *   obtenirSecteursEligiblesConstruction/getEntretien.
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

  // Portage direct des colonnes pn_* (secteurs_partie) <-> types de
  // vaisseau utilisés par les RPC secteur_deployer_cube/secteur_rappeler_
  // cube/secteur_regrouper/secteur_envahir_resoudre.
  var CHAMP_PN_PAR_TYPE = {
    corvette: 'pnCorvette', sentinelle: 'pnSentinelle', destroyer: 'pnDestroyer',
    cuirasse: 'pnCuirasse', porte_vaisseau: 'pnPorteVaisseau'
  };

  function totalPn_(secteur) {
    return (secteur.pnCorvette || 0) + (secteur.pnSentinelle || 0) + (secteur.pnDestroyer || 0) +
      (secteur.pnCuirasse || 0) + (secteur.pnPorteVaisseau || 0);
  }

  function appartientAuJoueur_(secteur) {
    return (secteur.pnNeant || 0) === 0 && totalPn_(secteur) > 0;
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC secteur_construire
   * (rpc.json). Construit une installation ou une Guilde sur un secteur
   * qui appartient au joueur, si un emplacement est libre (limite définie
   * par types_secteur.nombre_installation_max / nombre_guilde_max pour le
   * type de secteur concerné).
   */
  function construire(partieId, numero, categorie, type) {
    if (categorie !== 'installation' && categorie !== 'guilde') {
      return Promise.reject(new Error('Catégorie inconnue : ' + categorie));
    }

    return Promise.all([DB.get('parties', partieId), DB.get('secteursPartie', [partieId, numero])])
      .then(function (resultats) {
        var ligneP = resultats[0];
        var secteur = resultats[1];
        if (!ligneP || !ligneP.scenarioId) throw new Error('Scénario introuvable pour cette partie.');
        if (!secteur) throw new Error('Secteur ' + numero + ' introuvable.');
        if (!appartientAuJoueur_(secteur)) throw new Error('Ce secteur ne vous appartient pas.');

        return Promise.all([
          DB.get('scenarioSecteurs', [ligneP.scenarioId, numero]),
          DB.getAll('typesSecteur')
        ]).then(function (r2) {
          var ligneScenario = r2[0];
          var typeSecteur = ligneScenario ? r2[1].filter(function (t) { return t.id === ligneScenario.type; })[0] : null;

          var champ, max, utilises;
          if (categorie === 'installation') {
            champ = { chantier_naval: 'installationChantierNaval', defense_secteur: 'installationDefenseSecteur', base_stellaire: 'installationBaseStellaire' }[type];
            max = typeSecteur ? (typeSecteur.nombreInstallationMax || 0) : 0;
            utilises = secteur.installationChantierNaval + secteur.installationDefenseSecteur + secteur.installationBaseStellaire;
          } else {
            champ = { fermiers: 'guildeFermiers', ingenieurs: 'guildeIngenieurs', mineurs: 'guildeMineurs', banquiers: 'guildeBanquiers', scientifiques: 'guildeScientifiques' }[type];
            max = typeSecteur ? (typeSecteur.nombreGuildeMax || 0) : 0;
            utilises = secteur.guildeFermiers + secteur.guildeIngenieurs + secteur.guildeMineurs + secteur.guildeBanquiers + secteur.guildeScientifiques;
          }

          if (!champ) throw new Error('Type "' + type + '" inconnu pour la catégorie ' + categorie + '.');
          if (utilises >= max) throw new Error('Aucun emplacement libre sur ce secteur.');

          secteur[champ] = secteur[champ] + 1;
          return DB.put('secteursPartie', secteur).then(function (resultat) { return resultat; });
        });
      });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC
   * secteur_deployer_cube (rpc.json). AUCUNE validation côté RPC d'origine
   * (ni existence du secteur, ni stock) — portage fidèle : un type
   * inconnu ou un secteur introuvable ne fait juste rien (silencieux),
   * comme un UPDATE SQL sur 0 ligne.
   */
  function deployerCube(partieId, numero, type, quantite) {
    var champ = CHAMP_PN_PAR_TYPE[type];
    if (!champ) return Promise.resolve();
    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) return;
      secteur[champ] = (secteur[champ] || 0) + Number(quantite);
      return DB.put('secteursPartie', secteur);
    });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC
   * secteur_rappeler_cube (rpc.json).
   */
  function rappelerCube(partieId, numero, type) {
    var champ = CHAMP_PN_PAR_TYPE[type];
    if (!champ) return Promise.reject(new Error('Type de vaisseau inconnu : ' + type));

    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      var stock = secteur[champ] || 0;
      if (stock <= 0) throw new Error('Aucun ' + type + ' à rappeler dans le secteur ' + numero + '.');
      secteur[champ] = stock - 1;
      return DB.put('secteursPartie', secteur).then(function () { return { ok: true }; });
    });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC
   * secteur_retirer_corruption (rpc.json).
   */
  function retirerCorruption(partieId, numero) {
    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      secteur.corrompu = false;
      return DB.put('secteursPartie', secteur).then(function () { return { ok: true }; });
    });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC secteur_regrouper
   * (rpc.json) — déplacement de Puissance Navale entre secteurs
   * ADJACENTS qui appartiennent tous deux au joueur, 5 déplacements
   * maximum au total. Deux passes de validation AVANT toute écriture
   * (adjacence/appartenance, puis stock disponible agrégé par secteur de
   * départ+type), comme la RPC d'origine — IndexedDB n'a pas de verrou
   * FOR UPDATE, mais JS étant mono-thread ça ne change rien ici.
   */
  function regrouper(partieId, mouvements) {
    if (!Array.isArray(mouvements) || !mouvements.length) {
      return Promise.reject(new Error('Aucun mouvement fourni.'));
    }
    var totalDeplacements = mouvements.reduce(function (s, m) { return s + (Number(m.quantite) || 0); }, 0);
    if (totalDeplacements > 5) {
      return Promise.reject(new Error('Trop de déplacements demandés (' + totalDeplacements + ' / 5 maximum).'));
    }

    return Promise.all([DB.get('parties', partieId), DB.getAll('scenarioAdjacences')])
      .then(function (resultats) {
        var ligneP = resultats[0];
        if (!ligneP) throw new Error('Partie introuvable.');
        var adjacences = resultats[1].filter(function (a) { return a.scenarioId === ligneP.scenarioId; });

        function sontAdjacents(a, b) {
          return adjacences.some(function (adj) {
            return (adj.numeroA === a && adj.numeroB === b) || (adj.numeroA === b && adj.numeroB === a);
          });
        }

        var numerosVus = {};
        mouvements.forEach(function (m) {
          if (!CHAMP_PN_PAR_TYPE[m.type]) throw new Error('Type de vaisseau inconnu : ' + m.type);
          if (!(Number(m.quantite) > 0)) throw new Error('Quantité invalide pour un mouvement.');
          if (m.depart == null || m.arrivee == null || m.depart === m.arrivee) throw new Error('Secteurs de départ/arrivée invalides.');
          if (!sontAdjacents(m.depart, m.arrivee)) throw new Error('Secteurs ' + m.depart + ' et ' + m.arrivee + ' ne sont pas adjacents.');
          numerosVus[m.depart] = true;
          numerosVus[m.arrivee] = true;
        });

        var numeros = Object.keys(numerosVus).map(Number);
        return Promise.all(numeros.map(function (n) { return DB.get('secteursPartie', [partieId, n]); }))
          .then(function (secteursCharges) {
            var secteursParNumero = {};
            numeros.forEach(function (n, i) { secteursParNumero[n] = secteursCharges[i]; });

            mouvements.forEach(function (m) {
              var sDepart = secteursParNumero[m.depart];
              var sArrivee = secteursParNumero[m.arrivee];
              if (!sDepart) throw new Error('Secteur ' + m.depart + ' introuvable pour cette partie.');
              if (!sArrivee) throw new Error('Secteur ' + m.arrivee + ' introuvable pour cette partie.');
              if (!appartientAuJoueur_(sDepart)) throw new Error('Le secteur ' + m.depart + ' ne vous appartient pas.');
              if (!appartientAuJoueur_(sArrivee)) throw new Error('Le secteur ' + m.arrivee + ' ne vous appartient pas.');
            });

            var retireParCle = {};
            mouvements.forEach(function (m) {
              var cle = m.depart + ':' + m.type;
              retireParCle[cle] = (retireParCle[cle] || 0) + Number(m.quantite);
            });
            Object.keys(retireParCle).forEach(function (cle) {
              var idx = cle.lastIndexOf(':');
              var depart = Number(cle.slice(0, idx));
              var type = cle.slice(idx + 1);
              var champ = CHAMP_PN_PAR_TYPE[type];
              var dispo = secteursParNumero[depart][champ] || 0;
              if (dispo < retireParCle[cle]) {
                throw new Error('Stock insuffisant : secteur ' + depart + ' n\'a pas ' + retireParCle[cle] + ' ' + type + ' (dispo ' + dispo + ').');
              }
            });

            mouvements.forEach(function (m) {
              var champ = CHAMP_PN_PAR_TYPE[m.type];
              secteursParNumero[m.depart][champ] -= Number(m.quantite);
              secteursParNumero[m.arrivee][champ] = (secteursParNumero[m.arrivee][champ] || 0) + Number(m.quantite);
            });

            return Promise.all(numeros.map(function (n) { return DB.put('secteursPartie', secteursParNumero[n]); }))
              .then(function () { return { ok: true, deplacements: totalDeplacements }; });
          });
      });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC
   * secteur_envahir_resoudre (rpc.json). Persiste les conséquences de
   * l'effet "envahir" : retrait des unités engagées des secteurs sources
   * (avec reprise automatique par le Néant à 2 cubes si un secteur source
   * retombe à 0 PN, sauf le Secteur-Mère qui ne peut jamais être repris),
   * et en cas de victoire, dépôt des survivants + retrait des
   * Installations/Gardien/jetons Prime-Libération-Gloire du secteur
   * cible (les jetons retirés sont renvoyés à l'appelant, qui les reporte
   * sur plateau_maison côté client — inchangé, comme la RPC d'origine).
   */
  function envahirResoudre(partieId, cible, sources, victoire, survivants) {
    survivants = survivants || {};
    sources = sources || [];

    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP) throw new Error('Partie introuvable.');

      var numerosSources = [];
      sources.forEach(function (s) { if (numerosSources.indexOf(s.secteur) === -1) numerosSources.push(s.secteur); });
      var tousNumeros = numerosSources.slice();
      if (tousNumeros.indexOf(cible) === -1) tousNumeros.push(cible);

      return Promise.all([
        Promise.all(tousNumeros.map(function (n) { return DB.get('secteursPartie', [partieId, n]); })),
        DB.getAll('scenarioSecteurs')
      ]).then(function (resultats) {
        var secteursParNumero = {};
        tousNumeros.forEach(function (n, i) { secteursParNumero[n] = resultats[0][i]; });
        var scenarioSecteurs = resultats[1].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });

        // 1) Retire les unités engagées de chaque secteur source.
        sources.forEach(function (s) {
          var champ = CHAMP_PN_PAR_TYPE[s.type];
          var secteur = secteursParNumero[s.secteur];
          if (!champ || !secteur) return;
          secteur[champ] = Math.max(0, (secteur[champ] || 0) - Number(s.quantite));
        });

        // 2) Secteur(s) source retombé(s) à 0 PN -> repris par le Néant (2
        //    cubes), sauf Secteur-Mère.
        var secteursAbandonnes = [];
        numerosSources.forEach(function (n) {
          var secteur = secteursParNumero[n];
          if (!secteur) return;
          var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === n; })[0];
          var estSecteurMere = !!(ligneScenario && ligneScenario.type === 'secteur_mere');
          if (totalPn_(secteur) === 0 && !estSecteurMere) {
            secteur.pnNeant = 2;
            secteursAbandonnes.push(n);
          }
        });

        // 3) Conséquences sur le secteur cible, uniquement en cas de victoire.
        var jetonPrime = 0, jetonLiberation = 0, jetonGloire = 0;
        var secteurCible = secteursParNumero[cible];
        if (victoire && secteurCible) {
          jetonPrime = secteurCible.jetonPrime || 0;
          jetonLiberation = secteurCible.jetonLiberation || 0;
          jetonGloire = secteurCible.jetonGloire || 0;

          secteurCible.pnNeant = 0;
          secteurCible.pnCorvette = (secteurCible.pnCorvette || 0) + (Number(survivants.corvette) || 0);
          secteurCible.pnDestroyer = (secteurCible.pnDestroyer || 0) + (Number(survivants.destroyer) || 0);
          secteurCible.pnCuirasse = (secteurCible.pnCuirasse || 0) + (Number(survivants.cuirasse) || 0);
          secteurCible.pnSentinelle = (secteurCible.pnSentinelle || 0) + (Number(survivants.sentinelle) || 0);
          secteurCible.pnPorteVaisseau = (secteurCible.pnPorteVaisseau || 0) + (Number(survivants.porte_vaisseau) || 0);
          secteurCible.installationChantierNaval = 0;
          secteurCible.installationDefenseSecteur = 0;
          secteurCible.installationBaseStellaire = 0;
          secteurCible.nombreGardien = 0;
          secteurCible.jetonPrime = 0;
          secteurCible.jetonLiberation = 0;
          secteurCible.jetonGloire = 0;
        }

        return Promise.all(tousNumeros.map(function (n) { return DB.put('secteursPartie', secteursParNumero[n]); }))
          .then(function () {
            return {
              jetonPrime: jetonPrime,
              jetonLiberation: jetonLiberation,
              jetonGloire: jetonGloire,
              secteursAbandonnes: secteursAbandonnes
            };
          });
      });
    });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC
   * secteurs_eligibles_construction (rpc.json) — secteurs qui appartiennent
   * au joueur avec au moins un emplacement Installation/Guilde libre
   * (utilisé pour peupler le sélecteur de secteur d'un formulaire
   * Construire).
   */
  function obtenirSecteursEligiblesConstruction(partieId, categorie) {
    if (categorie !== 'installation' && categorie !== 'guilde') {
      return Promise.reject(new Error('Catégorie inconnue : ' + categorie));
    }

    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return [];

      return Promise.all([obtenirSecteurs(partieId), DB.getAll('scenarioSecteurs'), DB.getAll('typesSecteur')])
        .then(function (resultats) {
          var secteurs = resultats[0];
          var scenarioSecteurs = resultats[1].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });
          var typesParId = {};
          resultats[2].forEach(function (t) { typesParId[t.id] = t; });

          var resultat = [];
          secteurs.forEach(function (s) {
            if (!appartientAuJoueur_(s)) return;
            var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === s.numero; })[0];
            var typeSecteur = ligneScenario ? typesParId[ligneScenario.type] : null;
            if (!typeSecteur) return;

            var max, utilises;
            if (categorie === 'installation') {
              max = typeSecteur.nombreInstallationMax || 0;
              utilises = s.installationChantierNaval + s.installationDefenseSecteur + s.installationBaseStellaire;
            } else {
              max = typeSecteur.nombreGuildeMax || 0;
              utilises = s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques;
            }
            if (utilises < max) resultat.push({ numero: s.numero, emplacementsLibres: max - utilises });
          });
          return resultat;
        });
    });
  }

  /**
   * 17/08/2026 (Session 12) : portage direct de la RPC
   * secteurs_entretien_partie (rpc.json) — nombre d'unités d'entretien
   * dues (1 par emplacement Installation ou Guilde totalement occupé sur
   * chaque secteur), purement informatif (rien n'est déduit
   * automatiquement des ressources — voir chargerEntretien_, app-2.html).
   */
  function getEntretien(partieId) {
    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return 0;

      return Promise.all([obtenirSecteurs(partieId), DB.getAll('scenarioSecteurs'), DB.getAll('typesSecteur')])
        .then(function (resultats) {
          var secteurs = resultats[0];
          var scenarioSecteurs = resultats[1].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });
          var typesParId = {};
          resultats[2].forEach(function (t) { typesParId[t.id] = t; });

          var total = 0;
          secteurs.forEach(function (s) {
            var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === s.numero; })[0];
            var typeSecteur = ligneScenario ? typesParId[ligneScenario.type] : null;
            if (!typeSecteur) return;

            var guildesUtilisees = s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques;
            if ((typeSecteur.nombreGuildeMax || 0) > 0 && guildesUtilisees >= typeSecteur.nombreGuildeMax) total += 1;

            var installationsUtilisees = s.installationChantierNaval + s.installationDefenseSecteur + s.installationBaseStellaire;
            if ((typeSecteur.nombreInstallationMax || 0) > 0 && installationsUtilisees >= typeSecteur.nombreInstallationMax) total += 1;
          });
          return total;
        });
    });
  }

  /**
   * 18/08/2026 (Événement galactique A, Cycle 1 — Cadre 1) : secteurs
   * candidats pour l'effet "placez une Défense de Secteur et une Guilde
   * de Scientifiques dans un secteur du Néant adjacent à l'un de vos
   * secteurs" — un secteur du Néant (pnNeant > 0), adjacent à un secteur
   * qui appartient au joueur, avec au moins un emplacement Installation
   * ET un emplacement Guilde libres (les deux structures sont posées
   * ensemble, jamais l'une sans l'autre — voir placerDefenseGuildeNeant
   * Adjacent ci-dessous).
   */
  function obtenirSecteursEligiblesDefenseGuildeNeantAdjacent(partieId) {
    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return [];

      return Promise.all([
        obtenirSecteurs(partieId),
        obtenirAdjacences(ligneP.scenarioId),
        DB.getAll('scenarioSecteurs'),
        DB.getAll('typesSecteur')
      ]).then(function (resultats) {
        var secteurs = resultats[0];
        var scenarioSecteurs = resultats[2].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });
        var typesParId = {};
        resultats[3].forEach(function (t) { typesParId[t.id] = t; });

        var secteursParNumero = {};
        secteurs.forEach(function (s) { secteursParNumero[s.numero] = s; });

        var adjacenceMap = {};
        resultats[1].forEach(function (a) {
          adjacenceMap[a.numeroA] = adjacenceMap[a.numeroA] || [];
          adjacenceMap[a.numeroA].push(a.numeroB);
          adjacenceMap[a.numeroB] = adjacenceMap[a.numeroB] || [];
          adjacenceMap[a.numeroB].push(a.numeroA);
        });

        var resultat = [];
        secteurs.forEach(function (s) {
          if ((s.pnNeant || 0) <= 0) return;
          var adjacentAuJoueur = (adjacenceMap[s.numero] || []).some(function (n) {
            var voisin = secteursParNumero[n];
            return voisin && appartientAuJoueur_(voisin);
          });
          if (!adjacentAuJoueur) return;

          var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === s.numero; })[0];
          var typeSecteur = ligneScenario ? typesParId[ligneScenario.type] : null;
          if (!typeSecteur) return;

          var installationsUtilisees = s.installationChantierNaval + s.installationDefenseSecteur + s.installationBaseStellaire;
          var guildesUtilisees = s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques;
          var emplacementsInstallationLibres = (typeSecteur.nombreInstallationMax || 0) - installationsUtilisees;
          var emplacementsGuildeLibres = (typeSecteur.nombreGuildeMax || 0) - guildesUtilisees;
          if (emplacementsInstallationLibres > 0 && emplacementsGuildeLibres > 0) {
            resultat.push({
              numero: s.numero,
              emplacementsInstallationLibres: emplacementsInstallationLibres,
              emplacementsGuildeLibres: emplacementsGuildeLibres
            });
          }
        });
        return resultat;
      });
    });
  }

  /**
   * 18/08/2026 (Événement galactique A, Cycle 1 — Cadre 1) : place 1
   * Défense de Secteur et 1 Guilde de Scientifiques dans le secteur du
   * Néant adjacent choisi par le joueur — revalide les mêmes conditions
   * qu'obtenirSecteursEligiblesDefenseGuildeNeantAdjacent (jamais
   * confiance à l'appelant, même principe que construire ci-dessus)
   * avant d'écrire.
   */
  function placerDefenseGuildeNeantAdjacent(partieId, numero) {
    return obtenirSecteursEligiblesDefenseGuildeNeantAdjacent(partieId).then(function (eligibles) {
      var cible = eligibles.filter(function (e) { return e.numero === numero; })[0];
      if (!cible) {
        throw new Error('Secteur ' + numero + ' non éligible (doit être un secteur du Néant, adjacent à l\'un de vos secteurs, avec un emplacement Installation et un emplacement Guilde libres).');
      }

      return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
        if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
        secteur.installationDefenseSecteur = (secteur.installationDefenseSecteur || 0) + 1;
        secteur.guildeScientifiques = (secteur.guildeScientifiques || 0) + 1;
        return DB.put('secteursPartie', secteur).then(function () { return secteur; });
      });
    });
  }

  return {
    SCENARIO_PAR_DEFAUT: SCENARIO_PAR_DEFAUT,
    instancierSecteurs: instancierSecteurs,
    obtenirSecteurs: obtenirSecteurs,
    obtenirAdjacences: obtenirAdjacences,
    obtenirSecteurMere: obtenirSecteurMere,
    construire: construire,
    deployerCube: deployerCube,
    rappelerCube: rappelerCube,
    retirerCorruption: retirerCorruption,
    regrouper: regrouper,
    envahirResoudre: envahirResoudre,
    obtenirSecteursEligiblesConstruction: obtenirSecteursEligiblesConstruction,
    obtenirSecteursEligiblesDefenseGuildeNeantAdjacent: obtenirSecteursEligiblesDefenseGuildeNeantAdjacent,
    placerDefenseGuildeNeantAdjacent: placerDefenseGuildeNeantAdjacent,
    getEntretien: getEntretien
  };
})();
