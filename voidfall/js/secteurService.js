/**
 * secteurService.js
 * Plateau des secteurs — Voidfall Companion PWA
 *
 * Actions de jeu sur les secteurs (construire, déployer/rappeler un
 * cube, regrouper, envahir, gérer la Corruption) avec, pour chaque
 * action, une revalidation complète des règles d'éligibilité juste avant
 * l'écriture — jamais confiance dans les paramètres reçus de l'appelant.
 * Pas de transaction multi-lignes ni de verrou explicite sur IndexedDB :
 * JS étant mono-thread, aucun autre appelant ne peut s'intercaler entre
 * une lecture et l'écriture qui la suit.
 *
 * Dépend de db.js (DB) : à charger avant ce fichier. gameService.js
 * dépend de ce fichier (creerPartie y fait appel) : à charger AVANT
 * gameService.js dans index.html.
 */

var SecteurService = (function () {
  'use strict';

  // ⚠️ Un seul scénario a de vraies données pour l'instant ('solo_1',
  // "Première ligne").
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
      // jetonGloire est un TABLEAU de valeurs (docs-rules-cycle-de-jeu.md
      // §1.5.5 — un secteur peut porter plusieurs jetons Gloire, sans
      // limite), pas un simple nombre : un 2e jeton Gloire placé sur un
      // secteur en possédant déjà un s'ajoute au tableau au lieu de
      // l'écraser. Voir CHAMP_ELEMENT_PLACEMENT_.gloire/
      // placerElementsNeantAdjacent/envahirResoudre ci-dessous,
      // index.html (ligneSecteurHTML_) et strategieService.js (flux
      // envahir) pour les autres points concernés.
      jetonGloire: ligne.jetonGloireDepart ? [ligne.jetonGloireDepart] : [],
      jetonLiberation: ligne.jetonLiberationDepart || 0
    };
  }

  /**
   * Construit et enregistre les lignes secteursPartie pour une partie
   * tout juste créée. Tolérant : une erreur ici ne doit JAMAIS empêcher
   * la création de la partie — elle est capturée, journalée en console,
   * et la fonction résout quand même (tableau vide).
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
          // de l'une par l'autre.
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
   * Adjacences du scénario (paires de secteurs voisins) — utilisées par
   * regrouper et par le filtre d'adjacence des placements sur secteur du
   * Néant. Simple lecture catalogue.
   */
  function obtenirAdjacences(scenarioId) {
    return DB.getAll('scenarioAdjacences').then(function (lignes) {
      return lignes.filter(function (l) { return l.scenarioId === scenarioId; });
    });
  }

  /**
   * Numéro du Secteur-Mère du joueur pour un scénario donné (ou null si
   * introuvable). Prend scenarioId directement (déjà connu de l'appelant
   * via partie.scenarioId) plutôt que partieId.
   */
  function obtenirSecteurMere(scenarioId) {
    return DB.getAll('scenarioSecteurs').then(function (lignes) {
      var ligne = lignes.filter(function (l) { return l.scenarioId === scenarioId && l.type === 'secteur_mere'; })[0];
      return ligne ? ligne.numero : null;
    });
  }

  // Types de vaisseau (Puissance Navale) <-> champs secteursPartie
  // correspondants.
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

  // Même principe que totalPn_ : centralise le calcul d'emplacements
  // Installation/Guilde utilisés (plusieurs appelants dans ce fichier).
  function installationsUtilisees_(secteur) {
    return (secteur.installationChantierNaval || 0) + (secteur.installationDefenseSecteur || 0) + (secteur.installationBaseStellaire || 0);
  }

  function guildesUtilisees_(secteur) {
    return (secteur.guildeFermiers || 0) + (secteur.guildeIngenieurs || 0) + (secteur.guildeMineurs || 0) +
      (secteur.guildeBanquiers || 0) + (secteur.guildeScientifiques || 0);
  }

  /**
   * Nombre total d'emplacements Installation du Secteur-Mère du joueur —
   * la plupart des maisons utilisent le Secteur-Mère standard
   * (typesSecteur.json, 0 emplacement constructible en plus du Chantier
   * Naval imprimé), mais certaines ont un plateau différent (ex. Astoran :
   * 3 emplacements). `maisonJoueurSecteurMere` doit être null pour tout
   * secteur qui n'est PAS le Secteur-Mère (l'override ne doit jamais
   * s'appliquer ailleurs).
   */
  function maxInstallationSecteurMere_(maisonJoueurSecteurMere, typeSecteur) {
    if (maisonJoueurSecteurMere && maisonJoueurSecteurMere.secteurMereInstallationMax != null) {
      return maisonJoueurSecteurMere.secteurMereInstallationMax;
    }
    return typeSecteur ? (typeSecteur.nombreInstallationMax || 0) : 0;
  }

  /**
   * Construit une installation ou une Guilde sur un secteur qui
   * appartient au joueur, si un emplacement est libre (limite définie par
   * typesSecteur.nombreInstallationMax / nombreGuildeMax pour le type de
   * secteur concerné, ou par maisons.json secteurMereInstallationMax pour
   * les Secteurs-Mères non standard — voir maxInstallationSecteurMere_).
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
          DB.getAll('typesSecteur'),
          DB.getAll('maisons')
        ]).then(function (r2) {
          var ligneScenario = r2[0];
          var typeSecteur = ligneScenario ? r2[1].filter(function (t) { return t.id === ligneScenario.type; })[0] : null;
          var estSecteurMere = !!(ligneScenario && ligneScenario.type === 'secteur_mere');
          var maisonJoueur = (estSecteurMere && ligneP.joueur) ? r2[2].filter(function (m) { return m.nom === ligneP.joueur.nom; })[0] || null : null;

          var champ, max, utilises;
          if (categorie === 'installation') {
            champ = { chantier_naval: 'installationChantierNaval', defense_secteur: 'installationDefenseSecteur', base_stellaire: 'installationBaseStellaire' }[type];
            max = maxInstallationSecteurMere_(maisonJoueur, typeSecteur);
            utilises = installationsUtilisees_(secteur);
          } else {
            champ = { fermiers: 'guildeFermiers', ingenieurs: 'guildeIngenieurs', mineurs: 'guildeMineurs', banquiers: 'guildeBanquiers', scientifiques: 'guildeScientifiques' }[type];
            max = typeSecteur ? (typeSecteur.nombreGuildeMax || 0) : 0;
            utilises = guildesUtilisees_(secteur);
          }

          if (!champ) throw new Error('Type "' + type + '" inconnu pour la catégorie ' + categorie + '.');
          if (utilises >= max) throw new Error('Aucun emplacement libre sur ce secteur.');

          secteur[champ] = secteur[champ] + 1;
          return DB.put('secteursPartie', secteur).then(function (resultat) { return resultat; });
        });
      });
  }

  /**
   * Secteurs éligibles pour ajouter 1 au dé Population ("augmenter une
   * Population Pure") — un secteur possédé par le joueur
   * (appartientAuJoueur_), non Corrompu, avec une Population renseignée
   * (certains secteurs spéciaux n'en ont pas) et strictement inférieure à
   * 6 (docs-rules-secteurs.md §3).
   */
  function obtenirSecteursEligiblesAugmenterPopulationPure(partieId) {
    return obtenirSecteurs(partieId).then(function (secteurs) {
      return secteurs
        .filter(function (s) { return appartientAuJoueur_(s) && !s.corrompu && s.population !== null && s.population < 6; })
        .map(function (s) { return { numero: s.numero }; });
    });
  }

  /**
   * Secteurs éligibles pour l'option "Secteur" de la popup de choix de
   * retirer_corruption — un secteur possédé par le joueur
   * (appartientAuJoueur_) ET actuellement Corrompu. Même gabarit que
   * obtenirSecteursEligiblesAugmenterPopulationPure ci-dessus. Ne
   * remplace PAS la permissivité de retirerCorruption (ci-dessous),
   * utilisée telle quelle par le bouton "Retirer" écran Secteurs sans
   * cette restriction de possession : cette liste ne sert qu'à peupler
   * le <select> de la popup 'retirer_corruption' (strategieService.js),
   * qui appelle ensuite retirerCorruption comme n'importe quel autre
   * appelant.
   */
  function obtenirSecteursEligiblesRetraitCorruption(partieId) {
    return obtenirSecteurs(partieId).then(function (secteurs) {
      return secteurs
        .filter(function (s) { return appartientAuJoueur_(s) && s.corrompu; })
        .map(function (s) { return { numero: s.numero }; });
    });
  }

  /**
   * Ajoute 1 au dé Population du secteur choisi — revalide l'éligibilité
   * à neuf (jamais confiance à l'appelant, même principe que construire
   * ci-dessus) avant d'écrire.
   */
  function augmenterPopulationPure(partieId, numero) {
    return obtenirSecteursEligiblesAugmenterPopulationPure(partieId).then(function (eligibles) {
      if (!eligibles.some(function (e) { return e.numero === numero; })) {
        throw new Error('Secteur ' + numero + ' non éligible (doit être un secteur Pur que vous possédez, avec une Population inférieure à 6).');
      }
      return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
        if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
        secteur.population = (secteur.population || 0) + 1;
        return DB.put('secteursPartie', secteur).then(function () { return secteur; });
      });
    });
  }

  /**
   * Déploie un cube de Puissance Navale sur un secteur. AUCUNE validation
   * ici (ni existence du secteur, ni stock) : un type inconnu ou un
   * secteur introuvable ne fait juste rien (silencieux).
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
   * Rappelle 1 cube de Puissance Navale depuis un secteur vers la zone
   * active (EVOLUTION 33, todo.md — retour utilisateur : le rappel doit
   * "impliquer l'incrémentation du nombre de cube actif", jusqu'ici
   * seul `secteursPartie` était touché, `plateauMaison.cubeActif` jamais
   * recrédité). Écriture en 2 temps (secteur PUIS plateauMaison) : seule
   * source de vérité pour cette mécanique, utilisée par les 3 chemins
   * d'appel existants (formulaire "Rappeler un cube" de l'écran Secteurs,
   * popup 'rappeler_cube' — option "recall" d'un Cadre d'Événement —, et
   * popup 'rappeler_cube_cout' — Coût Focus "rappeler_cube") — aucun n'a
   * besoin d'être modifié pour bénéficier du correctif.
   */
  function rappelerCube(partieId, numero, type) {
    var champ = CHAMP_PN_PAR_TYPE[type];
    if (!champ) return Promise.reject(new Error('Type de vaisseau inconnu : ' + type));

    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      var stock = secteur[champ] || 0;
      if (stock <= 0) throw new Error('Aucun ' + type + ' à rappeler dans le secteur ' + numero + '.');
      secteur[champ] = stock - 1;
      return DB.put('secteursPartie', secteur);
    }).then(function () {
      return DB.get('plateauMaison', partieId);
    }).then(function (pm) {
      if (!pm) return { ok: true };
      pm.cubeActif = (pm.cubeActif || 0) + 1;
      return DB.put('plateauMaison', pm).then(function () { return { ok: true }; });
    });
  }

  function retirerCorruption(partieId, numero) {
    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      secteur.corrompu = false;
      return DB.put('secteursPartie', secteur).then(function () { return { ok: true }; });
    });
  }

  /**
   * Secteurs éligibles pour l'option "Secteur" de la popup de choix de
   * retirer_gardien (chantier "Refuges", §3 docs-rules-corruption-
   * gardiens-refuges-technoConsume.md — un Gardien peut aussi se trouver
   * au bord d'un secteur, sur un Trou de ver, ou sur le plateau Crise,
   * jamais suivis en base — voir strategieService.js, option manuelle
   * "Ailleurs" de cette même popup) — même gabarit qu'
   * obtenirSecteursEligiblesRetraitCorruption ci-dessus.
   */
  function obtenirSecteursEligiblesRetraitGardien(partieId) {
    return obtenirSecteurs(partieId).then(function (secteurs) {
      return secteurs
        .filter(function (s) { return appartientAuJoueur_(s) && (s.nombreGardien || 0) > 0; })
        .map(function (s) { return { numero: s.numero }; });
    });
  }

  /**
   * Retire 1 Gardien du secteur choisi — miroir de retirerCorruption
   * ci-dessus, mais décrémente (un secteur peut porter plusieurs
   * Gardiens) plutôt que de basculer un booléen.
   */
  function retirerGardien(partieId, numero) {
    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      if (!(secteur.nombreGardien > 0)) throw new Error('Aucun Gardien à retirer dans le secteur ' + numero + '.');
      secteur.nombreGardien -= 1;
      return DB.put('secteursPartie', secteur).then(function () { return { ok: true }; });
    });
  }

  /**
   * Secteurs éligibles pour l'option "Secteur" de la popup de choix de
   * gagner_corruption — miroir d'obtenirSecteursEligiblesRetraitCorruption
   * ci-dessus, mais INVERSÉ (un secteur possédé, PAS encore Corrompu) ET
   * avec une contrainte supplémentaire absente du retrait : le
   * Secteur-Mère standard est immunisé à la Corruption
   * (docs-rules-corruption-gardiens-refuges-technoConsume.md §1) — donc
   * exclu ici via obtenirSecteurMere(scenarioId), SAUF pour les maisons
   * dont le Secteur-Mère n'est PAS standard et peut être Corrompu (ex.
   * Marqualos, Novaris — maisons.json secteurMerePeutEtreCorrompu).
   */
  function obtenirSecteursEligiblesGainCorruption(partieId) {
    return Promise.all([DB.get('parties', partieId), obtenirSecteurs(partieId), DB.getAll('maisons')]).then(function (resultats) {
      var ligneP = resultats[0], secteurs = resultats[1];
      var maisonJoueur = ligneP && ligneP.joueur ? resultats[2].filter(function (m) { return m.nom === ligneP.joueur.nom; })[0] || null : null;
      var secteurMerePeutEtreCorrompu = !!(maisonJoueur && maisonJoueur.secteurMerePeutEtreCorrompu);

      return obtenirSecteurMere(ligneP ? ligneP.scenarioId : null).then(function (numeroSecteurMere) {
        return secteurs
          .filter(function (s) { return appartientAuJoueur_(s) && !s.corrompu && (secteurMerePeutEtreCorrompu || s.numero !== numeroSecteurMere); })
          .map(function (s) { return { numero: s.numero }; });
      });
    });
  }

  /**
   * Miroir de retirerCorruption ci-dessus — place la Corruption
   * (secteur.corrompu = true) au lieu de la retirer. Même permissivité
   * (aucune revalidation d'éligibilité ici, comme retirerCorruption) :
   * c'est obtenirSecteursEligiblesGainCorruption ci-dessus qui peuple le
   * <select> de la popup 'gagner_corruption' (strategieService.js).
   */
  function placerCorruption(partieId, numero) {
    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      secteur.corrompu = true;
      return DB.put('secteursPartie', secteur).then(function () { return { ok: true }; });
    });
  }

  // Correction manuelle libre d'un secteur (retour utilisateur 13-13/09/2026
  // — panneau détail de l'onglet Galaxie) : Population, Corrompu, cube du
  // Néant, jeton Prime, jeton Libération, Gardiens (nombreGardien, ajouté
  // 20/09/2026 — retour utilisateur : champ resté en lecture seule dans le
  // panneau détail, alors que retirerGardien/le placement en masse
  // d'Événement écrivent déjà ce même champ ailleurs). Liste blanche
  // volontaire, MÊME principe que GameService.CHAMPS_PLATEAU_MAISON_
  // AUTORISES/majPlateauMaison — ne JAMAIS laisser un appelant écrire un
  // champ arbitraire. Guildes/Installations/PN de vaisseaux restent
  // réservés aux actions guidées (construire/déployer/rappeler/envahir,
  // qui revalident les règles) — hors périmètre ici.
  var CHAMPS_SECTEUR_MANUELS_AUTORISES_ = ['population', 'corrompu', 'pnNeant', 'jetonPrime', 'jetonLiberation', 'nombreGardien'];

  /**
   * MàJ partielle liste-blanche d'un secteur (lecture-fusion-écriture,
   * même principe que GameService.majPlateauMaison) — AUCUNE validation
   * de règle (comme placerCorruption/retirerCorruption ci-dessus, MÊME
   * permissivité, volontaire) : sert à appliquer manuellement des effets
   * que l'app ne modélise pas encore (Plateau Crise, Escarmouche...) ou à
   * corriger une saisie, jamais à rejouer une mécanique déjà automatisée
   * ailleurs (qui, elle, revalide toujours — voir construire/envahir/
   * augmenterPopulationPure).
   */
  function majSecteur(partieId, numero, champs) {
    var filtre = {};
    Object.keys(champs || {}).forEach(function (cle) {
      if (CHAMPS_SECTEUR_MANUELS_AUTORISES_.indexOf(cle) !== -1) filtre[cle] = champs[cle];
    });
    if (!Object.keys(filtre).length) {
      return Promise.reject(new Error('Aucun champ valide à mettre à jour.'));
    }

    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      Object.keys(filtre).forEach(function (cle) { secteur[cle] = filtre[cle]; });
      return DB.put('secteursPartie', secteur);
    });
  }

  /**
   * Agrège, sur tous les secteurs "Purs" du joueur (appartientAuJoueur_
   * ET !corrompu — même définition que "Pur" déjà utilisée par
   * obtenirSecteursEligiblesAugmenterPopulationPure/
   * obtenirSecteursEligiblesGainCorruption ci-dessus), les compteurs
   * nécessaires aux formules d'Influence de focus.json/
   * pistesCivilisation.json (voir focusEngine.js — CLES_INFLUENCE_SECTEUR_) :
   * nombre de secteurs Purs, nombre de secteurs Purs avec au moins une
   * Guilde, nombre de secteurs Purs à Population 6, total de Guildes
   * Pures (par type et toutes confondues), total d'Installations Pures,
   * total de cubes de Puissance Navale sur secteurs Purs (totalPn_, quel
   * que soit le type de vaisseau). Un seul aller DB (obtenirSecteurs),
   * tout le reste est un simple comptage en mémoire — appelée par le
   * contexte demanderChoix 'influence_secteur' (strategieService.js),
   * qui sait quelle formule appliquer à quel compteur.
   *
   * Étendue (chantier "Objectifs galactiques", 13/09/2026) avec les
   * champs nécessaires à ObjectifsService.evaluerCondition
   * (js/objectifsService.js, module pur — construireContexteObjectifs_
   * dans strategieService.js assemble le `contexte` à partir de CE
   * retour) : `populationPureTotale`, `defenseOuBaseStellairePureTotal`,
   * `guildeBanquierPureTotal`/`guildeScientifiquePureTotal` (alias
   * pratiques de guildesPures.banquiers/scientifiques — évite à l'appelant
   * de connaître la forme interne de guildesPures), `secteursPurs[]`
   * (1 entrée par secteur Pur — population/guildeBanquiers/guildesTotal/
   * cubes, pour les conditions à SEUIL PAR SECTEUR comme
   * secteur_pur_population_min) et `secteursPossedes[]` (TOUS les
   * secteurs du joueur, Purs ET Corrompus — pour secteurs_min/
   * cubes_secteurs_min, "purs_ou_corrompus" dans le catalogue). Champs
   * existants inchangés (plusieurs appelants déjà en prod en dépendent).
   *
   * Étendue à nouveau (chantier "Objectifs galactiques", lignes hors
   * périmètre restantes, 13/09/2026) : `secteursPurs[].guildeScientifiques`
   * (manquait, nécessaire à secteur_pur_avec_guilde_scientifique) ;
   * `secteursPossedes[].entretien` (0/1/2 — MÊME calcul que getEntretien
   * ci-dessous mais PAR secteur au lieu d'un total, nécessite désormais
   * typesSecteur/scenarioSecteurs comme obtenirDetailSecteursProgrammes,
   * pour secteur_pur_ou_corrompu_entretien_min_2) ; `secteursPossedes[].
   * guildeFermiers/guildeIngenieurs/guildeMineurs` (pour
   * secteurs_avec_guildes_specifiques_min, "Purs ou Corrompus" — pas
   * besoin des 2 autres types de Guilde pour cette clé) ;
   * `emplacementsGuildeVidesTotal` (somme, sur TOUS les secteurs
   * possédés, de `nombreGuildeMax - guildesUtilisées`, pour
   * emplacements_guilde_vides_max — SIMPLIFIÉ comme `guildeVacante`
   * d'obtenirDetailSecteursProgrammes ci-dessous : ignore la nuance
   * "emplacements Vaisseaux-Arches exclus", mécanique non modélisée dans
   * l'app, décision déjà actée pour ce même type de calcul).
   */
  function obtenirAgregatsInfluenceSecteursPurs(partieId) {
    return Promise.all([
      obtenirSecteurs(partieId),
      DB.get('parties', partieId),
      DB.getAll('scenarioSecteurs'),
      DB.getAll('typesSecteur')
    ]).then(function (resultats) {
      var secteurs = resultats[0];
      var ligneP = resultats[1];
      var scenarioSecteurs = (ligneP && ligneP.scenarioId)
        ? resultats[2].filter(function (l) { return l.scenarioId === ligneP.scenarioId; })
        : [];
      var typesParId = {};
      resultats[3].forEach(function (t) { typesParId[t.id] = t; });

      function typeDe_(s) {
        var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === s.numero; })[0];
        return ligneScenario ? typesParId[ligneScenario.type] : null;
      }

      function entretienSecteur_(s) {
        var typeSecteur = typeDe_(s);
        if (!typeSecteur) return 0;
        var entretien = 0;
        if ((typeSecteur.nombreGuildeMax || 0) > 0 && guildesUtilisees_(s) >= typeSecteur.nombreGuildeMax) entretien += 1;
        if ((typeSecteur.nombreInstallationMax || 0) > 0 && installationsUtilisees_(s) >= typeSecteur.nombreInstallationMax) entretien += 1;
        return entretien;
      }

      function emplacementsGuildeVides_(s) {
        var typeSecteur = typeDe_(s);
        if (!typeSecteur) return 0;
        return Math.max(0, (typeSecteur.nombreGuildeMax || 0) - guildesUtilisees_(s));
      }

      var purs = secteurs.filter(function (s) { return appartientAuJoueur_(s) && !s.corrompu; });

      var guildesPures = { fermiers: 0, ingenieurs: 0, mineurs: 0, banquiers: 0, scientifiques: 0, total: 0 };
      var installationsPuresTotal = 0;
      var cubesSecteurPurTotal = 0;
      var nombreSecteurPurAvecGuilde = 0;
      var nombreSecteurPurPopulation6 = 0;
      var populationPureTotale = 0;
      var defenseOuBaseStellairePureTotal = 0;
      var secteursPurs = [];

      purs.forEach(function (s) {
        var guildesSecteur = (s.guildeFermiers || 0) + (s.guildeIngenieurs || 0) + (s.guildeMineurs || 0) +
          (s.guildeBanquiers || 0) + (s.guildeScientifiques || 0);
        guildesPures.fermiers += s.guildeFermiers || 0;
        guildesPures.ingenieurs += s.guildeIngenieurs || 0;
        guildesPures.mineurs += s.guildeMineurs || 0;
        guildesPures.banquiers += s.guildeBanquiers || 0;
        guildesPures.scientifiques += s.guildeScientifiques || 0;
        guildesPures.total += guildesSecteur;
        installationsPuresTotal += (s.installationChantierNaval || 0) + (s.installationDefenseSecteur || 0) + (s.installationBaseStellaire || 0);
        cubesSecteurPurTotal += totalPn_(s);
        if (guildesSecteur > 0) nombreSecteurPurAvecGuilde++;
        if (s.population === 6) nombreSecteurPurPopulation6++;
        populationPureTotale += s.population || 0;
        defenseOuBaseStellairePureTotal += (s.installationDefenseSecteur || 0) + (s.installationBaseStellaire || 0);
        secteursPurs.push({
          population: s.population || 0,
          guildeBanquiers: s.guildeBanquiers || 0,
          guildeFermiers: s.guildeFermiers || 0,
          guildeIngenieurs: s.guildeIngenieurs || 0,
          guildeMineurs: s.guildeMineurs || 0,
          guildeScientifiques: s.guildeScientifiques || 0,
          guildesTotal: guildesSecteur,
          cubes: totalPn_(s)
        });
      });

      var emplacementsGuildeVidesTotal = 0;
      var secteursPossedes = secteurs
        .filter(function (s) { return appartientAuJoueur_(s); })
        .map(function (s) {
          emplacementsGuildeVidesTotal += emplacementsGuildeVides_(s);
          return {
            corrompu: !!s.corrompu,
            cubes: totalPn_(s),
            entretien: entretienSecteur_(s),
            guildeFermiers: s.guildeFermiers || 0,
            guildeIngenieurs: s.guildeIngenieurs || 0,
            guildeMineurs: s.guildeMineurs || 0
          };
        });

      return {
        nombreSecteurPur: purs.length,
        nombreSecteurPurAvecGuilde: nombreSecteurPurAvecGuilde,
        nombreSecteurPurPopulation6: nombreSecteurPurPopulation6,
        guildesPures: guildesPures,
        installationsPuresTotal: installationsPuresTotal,
        cubesSecteurPurTotal: cubesSecteurPurTotal,
        populationPureTotale: populationPureTotale,
        defenseOuBaseStellairePureTotal: defenseOuBaseStellairePureTotal,
        guildeBanquierPureTotal: guildesPures.banquiers,
        guildeScientifiquePureTotal: guildesPures.scientifiques,
        secteursPurs: secteursPurs,
        secteursPossedes: secteursPossedes,
        emplacementsGuildeVidesTotal: emplacementsGuildeVidesTotal
      };
    });
  }

  /**
   * Détail FACTUEL (aucune règle de Programme ici — ça reste dans
   * js/programmeScoreService.js, module pur) par secteur "Pur" du
   * joueur, pour le calcul des points de victoire des Programmes
   * (chantier "Points de victoire des Programmes"). Même définition de
   * "Pur" que `obtenirAgregatsInfluenceSecteursPurs` ci-dessus
   * (appartientAuJoueur_ ET !corrompu). `entretien` (0, 1 ou 2) reprend
   * EXACTEMENT le calcul par secteur de `getEntretien` ci-dessus (1 par
   * emplacement Installation/Guilde totalement occupé), simplement non
   * sommé — nécessaire pour les objectifs Programme D5 ("secteur Pur
   * avec au moins 2 Entretien")/W1 ("secteur Pur sans aucun Entretien").
   * `guildeVacante` : au moins un emplacement de Guilde encore libre sur
   * ce secteur (nombreGuildeMax - guildesUtilisees > 0) — utilisé par
   * S1 ("secteurs Purs sans emplacement de Guilde vide"), simplifié SANS
   * la nuance Vaisseaux-Arches (mécanique non modélisée dans l'app,
   * décision actée avec l'utilisateur). `corruptionSecteurs` : nombre de
   * secteurs possédés ET Corrompus (utilisé par S6, combiné à
   * corruptionMaison côté strategieService.js).
   */
  function obtenirDetailSecteursProgrammes(partieId) {
    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return { secteursPurs: [], nombreSecteurTotal: 0, corruptionSecteurs: 0 };

      return Promise.all([obtenirSecteurs(partieId), DB.getAll('scenarioSecteurs'), DB.getAll('typesSecteur')])
        .then(function (resultats) {
          var secteurs = resultats[0];
          var scenarioSecteurs = resultats[1].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });
          var typesParId = {};
          resultats[2].forEach(function (t) { typesParId[t.id] = t; });

          var possedes = secteurs.filter(appartientAuJoueur_);
          var corruptionSecteurs = possedes.filter(function (s) { return s.corrompu; }).length;
          var secteursPurs = possedes
            .filter(function (s) { return !s.corrompu; })
            .map(function (s) {
              var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === s.numero; })[0];
              var typeSecteur = ligneScenario ? typesParId[ligneScenario.type] : null;
              var maxGuilde = typeSecteur ? (typeSecteur.nombreGuildeMax || 0) : 0;
              var maxInstallation = typeSecteur ? (typeSecteur.nombreInstallationMax || 0) : 0;
              var guildesUtilisees = guildesUtilisees_(s);
              var installationsUtilisees = installationsUtilisees_(s);

              var entretien = 0;
              if (maxGuilde > 0 && guildesUtilisees >= maxGuilde) entretien += 1;
              if (maxInstallation > 0 && installationsUtilisees >= maxInstallation) entretien += 1;

              return {
                population: s.population || 0,
                entretien: entretien,
                guildeFermiers: s.guildeFermiers || 0,
                guildeIngenieurs: s.guildeIngenieurs || 0,
                guildeMineurs: s.guildeMineurs || 0,
                guildeBanquiers: s.guildeBanquiers || 0,
                guildeScientifiques: s.guildeScientifiques || 0,
                installationChantierNaval: s.installationChantierNaval || 0,
                installationDefenseSecteur: s.installationDefenseSecteur || 0,
                installationBaseStellaire: s.installationBaseStellaire || 0,
                pn: {
                  corvette: s.pnCorvette || 0,
                  sentinelle: s.pnSentinelle || 0,
                  destroyer: s.pnDestroyer || 0,
                  cuirasse: s.pnCuirasse || 0,
                  porteVaisseau: s.pnPorteVaisseau || 0
                },
                guildeVacante: maxGuilde > guildesUtilisees
              };
            });

          return { secteursPurs: secteursPurs, nombreSecteurTotal: possedes.length, corruptionSecteurs: corruptionSecteurs };
        });
    });
  }

  /**
   * Déplacement de Puissance Navale entre secteurs ADJACENTS qui
   * appartiennent tous deux au joueur, 5 déplacements maximum au total.
   * Deux passes de validation AVANT toute écriture (adjacence/
   * appartenance, puis stock disponible agrégé par secteur de départ+type).
   *
   * EVOLUTION 15 (todo.md, docs-rules-flottes.md §1.5/§4,
   * docs-rules-secteurs.md) : le Secteur-Mère vous appartient TOUJOURS,
   * même à 0 Puissance Navale (jamais repris par le Néant) — il reste donc
   * une destination/un secteur "à vous" valide pour `appartientAuJoueur_`
   * même vide, ce que cette dernière (PN > 0 requis) ne capture pas seule.
   * À l'inverse, retirer la DERNIÈRE Puissance Navale d'un secteur qui
   * N'EST PAS le Secteur-Mère est interdit lors d'un regroupement (à la
   * différence d'Envahir, qui l'autorise et reprend alors le secteur par
   * le Néant — voir envahirResoudre ci-dessus) : validé ici en agrégeant
   * le retrait total (tous types confondus) par secteur de départ.
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
        return Promise.all([
          obtenirSecteurMere(ligneP.scenarioId),
          Promise.all(numeros.map(function (n) { return DB.get('secteursPartie', [partieId, n]); }))
        ]).then(function (r2) {
            var numeroSecteurMere = r2[0];
            var secteursCharges = r2[1];
            var secteursParNumero = {};
            numeros.forEach(function (n, i) { secteursParNumero[n] = secteursCharges[i]; });

            function appartientOuMere_(secteur, numero) {
              return appartientAuJoueur_(secteur) || numero === numeroSecteurMere;
            }

            mouvements.forEach(function (m) {
              var sDepart = secteursParNumero[m.depart];
              var sArrivee = secteursParNumero[m.arrivee];
              if (!sDepart) throw new Error('Secteur ' + m.depart + ' introuvable pour cette partie.');
              if (!sArrivee) throw new Error('Secteur ' + m.arrivee + ' introuvable pour cette partie.');
              if (!appartientOuMere_(sDepart, m.depart)) throw new Error('Le secteur ' + m.depart + ' ne vous appartient pas.');
              if (!appartientOuMere_(sArrivee, m.arrivee)) throw new Error('Le secteur ' + m.arrivee + ' ne vous appartient pas.');
            });

            // Objet imbriqué {depart: {type: quantite}} — agrège la
            // quantité demandée par secteur de départ et par type, pour
            // vérifier le stock disponible avant toute écriture.
            var retireParDepart = {};
            mouvements.forEach(function (m) {
              retireParDepart[m.depart] = retireParDepart[m.depart] || {};
              retireParDepart[m.depart][m.type] = (retireParDepart[m.depart][m.type] || 0) + Number(m.quantite);
            });
            Object.keys(retireParDepart).forEach(function (depart) {
              Object.keys(retireParDepart[depart]).forEach(function (type) {
                var champ = CHAMP_PN_PAR_TYPE[type];
                var demande = retireParDepart[depart][type];
                var dispo = secteursParNumero[depart][champ] || 0;
                if (dispo < demande) {
                  throw new Error('Stock insuffisant : secteur ' + depart + ' n\'a pas ' + demande + ' ' + type + ' (dispo ' + dispo + ').');
                }
              });

              // EVOLUTION 15 : jamais retirer la DERNIÈRE Puissance Navale
              // d'un secteur de départ hors Secteur-Mère (tous types
              // confondus — un secteur avec 1 Corvette + 1 Destroyer ne
              // doit pas non plus se retrouver à 0 en cumulant 2 mouvements
              // de types différents dans la même validation).
              var numeroDepart = Number(depart);
              if (numeroDepart === numeroSecteurMere) return;
              var totalRetireDepart = Object.keys(retireParDepart[depart])
                .reduce(function (s, type) { return s + retireParDepart[depart][type]; }, 0);
              if (totalPn_(secteursParNumero[depart]) - totalRetireDepart <= 0) {
                throw new Error('Le secteur ' + depart + ' se retrouverait sans Puissance Navale (interdit hors Secteur-Mère lors d\'un regroupement) — laissez-en au moins 1.');
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
   * Persiste les conséquences de l'effet "envahir" : retrait des unités
   * engagées des secteurs sources (avec reprise automatique par le
   * Néant à 2 cubes si un secteur source retombe à 0 PN, sauf le
   * Secteur-Mère qui ne peut jamais être repris), et en cas de victoire,
   * dépôt des survivants + retrait des Installations/Gardien/jetons
   * Prime-Libération-Gloire du secteur cible (les jetons retirés sont
   * renvoyés à l'appelant, qui les reporte sur le plateau maison côté
   * client).
   *
   * `garderInstallations` (chantier "effets permanents" des Technologies,
   * Réplicateurs de combat — Novaris, `permanent.after.successful_
   * invasion.keep_installations`) : quand vrai, les 3 champs Installation
   * (Chantier Naval/Défense de Secteur/Base Stellaire) ne sont PAS remis à
   * zéro — tout le reste (Gardien, jetons Prime/Libération/Gloire retirés
   * et renvoyés à l'appelant) reste inchangé, le texte de la carte ne
   * concernant QUE les Installations. Le "+1 jeton Prime" de cette même
   * Technologie n'est PAS géré ici (c'est l'appelant, strategieService.js,
   * qui pose la question au joueur ET ajoute ce +1 au `jetonPrime` qu'il
   * reçoit en retour, avant de le faire passer par FocusEngine.
   * resoudreGainJetonsPrime_ comme n'importe quel autre gain de jeton
   * Prime).
   */
  function envahirResoudre(partieId, cible, sources, victoire, survivants, garderInstallations) {
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
        var jetonPrime = 0, jetonLiberation = 0, jetonGloire = [];
        var secteurCible = secteursParNumero[cible];
        if (victoire && secteurCible) {
          jetonPrime = secteurCible.jetonPrime || 0;
          jetonLiberation = secteurCible.jetonLiberation || 0;
          // jetonGloire est un TABLEAU (plusieurs jetons Gloire possibles
          // sur un même secteur, voir CHAMP_ELEMENT_PLACEMENT_.gloire
          // ci-dessus) — normalise au passage une éventuelle ancienne
          // sauvegarde où ce champ était encore un simple nombre.
          jetonGloire = Array.isArray(secteurCible.jetonGloire)
            ? secteurCible.jetonGloire.slice()
            : (secteurCible.jetonGloire ? [secteurCible.jetonGloire] : []);

          secteurCible.pnNeant = 0;
          secteurCible.pnCorvette = (secteurCible.pnCorvette || 0) + (Number(survivants.corvette) || 0);
          secteurCible.pnDestroyer = (secteurCible.pnDestroyer || 0) + (Number(survivants.destroyer) || 0);
          secteurCible.pnCuirasse = (secteurCible.pnCuirasse || 0) + (Number(survivants.cuirasse) || 0);
          secteurCible.pnSentinelle = (secteurCible.pnSentinelle || 0) + (Number(survivants.sentinelle) || 0);
          secteurCible.pnPorteVaisseau = (secteurCible.pnPorteVaisseau || 0) + (Number(survivants.porte_vaisseau) || 0);
          if (!garderInstallations) {
            secteurCible.installationChantierNaval = 0;
            secteurCible.installationDefenseSecteur = 0;
            secteurCible.installationBaseStellaire = 0;
          }
          secteurCible.nombreGardien = 0;
          secteurCible.jetonPrime = 0;
          secteurCible.jetonLiberation = 0;
          secteurCible.jetonGloire = [];
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
   * Détermine le secteur ciblé par une Escarmouche (chantier "Escarmouche +
   * Plateau Crise", 14/09/2026 — retour utilisateur, règle précise fournie
   * car absente de docs-rules-cycle-de-jeu.md §3.1/§2.3.3.1.1, qui se
   * contente de "Déterminez lequel de vos secteurs est envahi"). Cascade
   * de critères, dans l'ordre :
   * 1. Éligibilité : secteur possédé par le joueur (`appartientAuJoueur_`),
   *    JAMAIS le Secteur-Mère, adjacent à au moins un secteur du Néant
   *    (pnNeant > 0). "Secteur immunisé aux Flottes du Néant"/"Gardien au
   *    bord étend l'adjacence" (docs-rules-flottes.md §4) : AUCUNE donnée
   *    modélisée (typesSecteur.json.effet est null partout, aucun champ
   *    "Gardien au bord" en base) — ignorés, jamais bloquant.
   * 2. Le Néant préfère un secteur où il gagne ou égalise le Combat (simulé
   *    via CombatService.resoudreEscarmouche sur des camps jetables —
   *    AUCUNE mutation DB). Si le joueur gagnerait partout, retombe sur
   *    TOUS les candidats de l'étape 1 (une Escarmouche cible toujours).
   * 3. Puis le secteur qui force le joueur à rappeler le PLUS de Puissance
   *    Navale (totalPn avant − après combat simulé).
   * 4. Puis un secteur Pur (`!corrompu`) de préférence.
   * 5. Puis la Population la plus élevée.
   * 6. Puis le plus de Guildes (somme des 5 champs `guilde*`).
   * 7. Puis aléatoire parmi les ex-aequo restants.
   *
   * Retourne `{numero, secteur, resultatCombat}` (résultat de la
   * simulation RETENUE, réutilisable tel quel par l'appelant — aucun
   * second calcul nécessaire) ou `null` si aucun secteur éligible (étape
   * 1 vide — pas une erreur, une Escarmouche peut légitimement n'avoir
   * aucune cible).
   */
  function determinerCibleEscarmouche(partieId, puissanceNeant) {
    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return null;

      return Promise.all([
        obtenirSecteurs(partieId),
        obtenirAdjacences(ligneP.scenarioId),
        obtenirSecteurMere(ligneP.scenarioId)
      ]).then(function (resultats) {
        var secteurs = resultats[0];
        var adjacences = resultats[1];
        var numeroSecteurMere = resultats[2];

        var secteursParNumero = {};
        secteurs.forEach(function (s) { secteursParNumero[s.numero] = s; });

        function sontAdjacents(a, b) {
          return adjacences.some(function (adj) {
            return (adj.numeroA === a && adj.numeroB === b) || (adj.numeroA === b && adj.numeroB === a);
          });
        }
        function adjacentAUnSecteurDuNeant_(numero) {
          return secteurs.some(function (autre) {
            return autre.numero !== numero && (autre.pnNeant || 0) > 0 && sontAdjacents(numero, autre.numero);
          });
        }

        // --- Étape 1 : éligibilité ---
        var candidats = secteurs.filter(function (s) {
          return appartientAuJoueur_(s) && s.numero !== numeroSecteurMere && adjacentAUnSecteurDuNeant_(s.numero);
        });
        if (!candidats.length) return null;

        return SecteurService_obtenirPartieAssemblee_(partieId).then(function (partie) {
          var simulations = candidats.map(function (s) {
            var resultatCombat = CombatService.resoudreEscarmouche(partie, puissanceNeant, s);
            return {
              numero: s.numero,
              secteur: s,
              resultatCombat: resultatCombat,
              pnRappele: totalPn_(s) - (resultatCombat.survivantsJoueur.corvette + resultatCombat.survivantsJoueur.destroyer +
                resultatCombat.survivantsJoueur.cuirasse + resultatCombat.survivantsJoueur.sentinelle + resultatCombat.survivantsJoueur.portevaisseau)
            };
          });

          // --- Étape 2 : préférence victoire/égalité du Néant ---
          var neantGagneOuEgalise = simulations.filter(function (sim) { return !sim.resultatCombat.victoireJoueur; });
          var restants = neantGagneOuEgalise.length ? neantGagneOuEgalise : simulations;

          // --- Étape 3 : le plus de PN rappelé ---
          var maxPnRappele = Math.max.apply(null, restants.map(function (sim) { return sim.pnRappele; }));
          restants = restants.filter(function (sim) { return sim.pnRappele === maxPnRappele; });

          // --- Étape 4 : secteur Pur de préférence ---
          var purs = restants.filter(function (sim) { return !sim.secteur.corrompu; });
          if (purs.length) restants = purs;

          // --- Étape 5 : Population la plus élevée ---
          var maxPopulation = Math.max.apply(null, restants.map(function (sim) { return Number(sim.secteur.population) || 0; }));
          restants = restants.filter(function (sim) { return (Number(sim.secteur.population) || 0) === maxPopulation; });

          // --- Étape 6 : le plus de Guildes ---
          function totalGuildes_(s) {
            return (s.guildeFermiers || 0) + (s.guildeIngenieurs || 0) + (s.guildeMineurs || 0) +
              (s.guildeBanquiers || 0) + (s.guildeScientifiques || 0);
          }
          var maxGuildes = Math.max.apply(null, restants.map(function (sim) { return totalGuildes_(sim.secteur); }));
          restants = restants.filter(function (sim) { return totalGuildes_(sim.secteur) === maxGuildes; });

          // --- Étape 7 : aléatoire parmi les ex-aequo restants ---
          var choisi = restants[Math.floor(Math.random() * restants.length)];
          return { numero: choisi.numero, secteur: choisi.secteur, resultatCombat: choisi.resultatCombat };
        });
      });
    });
  }

  // Récupère le strict sous-ensemble de l'objet `partie` assemblé requis
  // par CombatService.construireCamp/resoudreEscarmouche (joueur.nom,
  // joueur.technologieDepart.{nom,amelioree}, technologiesObtenues) —
  // GameService.assemblerPartie_ (privée, bien plus complète) n'est PAS
  // accessible depuis ce fichier (chargé AVANT gameService.js, voir
  // en-tête) : même lecture (`lignePartie.etatJson.joueur` pour le nom de
  // Maison/les Technologies de départ possibles, `plateauMaison.
  // technologieDepart`/`technologieDepartAmelioree` pour celle
  // effectivement choisie), sans dupliquer le reste (Civilisation, offres
  // Programme, etc. — inutile au combat).
  function SecteurService_obtenirPartieAssemblee_(partieId) {
    return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
      var ligneP = resultats[0];
      var pm = resultats[1] || {};
      if (!ligneP) throw new Error('Partie introuvable.');
      var joueur = (ligneP.etatJson && ligneP.etatJson.joueur) || {};
      return {
        joueur: Object.assign({}, joueur, {
          technologieDepart: pm.technologieDepart ? { nom: pm.technologieDepart, amelioree: !!pm.technologieDepartAmelioree } : null
        }),
        technologiesObtenues: pm.technologiesObtenues || [null, null, null, null, null]
      };
    });
  }

  /**
   * Persiste les conséquences d'une Escarmouche déjà simulée
   * (CombatService.resoudreEscarmouche) sur le secteur ciblé — appelée
   * après confirmation du joueur (jamais automatiquement).
   * - Victoire ou égalité (`resultatCombat.victoireJoueur`) : écrit les
   *   survivants (`survivantsJoueur`), rien d'autre ne change (les
   *   Installations/Guildes/jetons restent en place).
   * - Défaite : abandon COMPLET du secteur (docs-rules-flottes.md
   *   §4.1-4.4, PLUS complet que le raccourci de envahirResoudre pour un
   *   secteur SOURCE abandonné — voir son en-tête) : PN à 0, retrait des 3
   *   champs Installation (PAS les Guildes), marqueur `corrompu = true`,
   *   `pnNeant = 2` (jeton Flotte du Néant), `jetonPrime` incrémenté de 1
   *   (jeton face cachée — résolu ensuite comme n'importe quel gain de
   *   jeton Prime, FocusEngine.resoudreGainJetonsPrime_, par l'appelant).
   * Retourne le secteur persisté.
   */
  function appliquerResultatEscarmouche(partieId, numeroCible, resultatCombat) {
    return DB.get('secteursPartie', [partieId, numeroCible]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur introuvable : ' + numeroCible);

      if (resultatCombat.victoireJoueur) {
        var survivants = resultatCombat.survivantsJoueur || {};
        secteur.pnCorvette = survivants.corvette || 0;
        secteur.pnDestroyer = survivants.destroyer || 0;
        secteur.pnCuirasse = survivants.cuirasse || 0;
        secteur.pnSentinelle = survivants.sentinelle || 0;
        secteur.pnPorteVaisseau = survivants.portevaisseau || 0;
      } else {
        secteur.pnCorvette = 0;
        secteur.pnDestroyer = 0;
        secteur.pnCuirasse = 0;
        secteur.pnSentinelle = 0;
        secteur.pnPorteVaisseau = 0;
        secteur.installationChantierNaval = 0;
        secteur.installationDefenseSecteur = 0;
        secteur.installationBaseStellaire = 0;
        secteur.corrompu = true;
        secteur.pnNeant = 2;
        secteur.jetonPrime = (secteur.jetonPrime || 0) + 1;
      }

      return DB.put('secteursPartie', secteur).then(function () { return secteur; });
    });
  }

  /**
   * Secteurs qui appartiennent au joueur avec au moins un emplacement
   * Installation/Guilde libre (utilisé pour peupler le sélecteur de
   * secteur d'un formulaire Construire).
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
              utilises = installationsUtilisees_(s);
            } else {
              max = typeSecteur.nombreGuildeMax || 0;
              utilises = guildesUtilisees_(s);
            }
            if (utilises < max) resultat.push({ numero: s.numero, emplacementsLibres: max - utilises });
          });
          return resultat;
        });
    });
  }

  /**
   * Nombre d'unités d'entretien dues (1 par emplacement Installation ou
   * Guilde totalement occupé sur chaque secteur), purement informatif :
   * rien n'est déduit automatiquement des ressources (voir
   * chargerEntretien_, index.html).
   */
  function getEntretien(partieId) {
    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return 0;

      return Promise.all([obtenirSecteurs(partieId), DB.getAll('scenarioSecteurs'), DB.getAll('typesSecteur'), DB.getAll('maisons')])
        .then(function (resultats) {
          var secteurs = resultats[0];
          var scenarioSecteurs = resultats[1].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });
          var typesParId = {};
          resultats[2].forEach(function (t) { typesParId[t.id] = t; });
          var maisonJoueur = ligneP.joueur ? resultats[3].filter(function (m) { return m.nom === ligneP.joueur.nom; })[0] || null : null;

          var total = 0;
          secteurs.forEach(function (s) {
            var ligneScenario = scenarioSecteurs.filter(function (l) { return l.numero === s.numero; })[0];
            var typeSecteur = ligneScenario ? typesParId[ligneScenario.type] : null;
            if (!typeSecteur) return;
            var estSecteurMere = ligneScenario.type === 'secteur_mere';

            var guildesUtilisees = guildesUtilisees_(s);
            if ((typeSecteur.nombreGuildeMax || 0) > 0 && guildesUtilisees >= typeSecteur.nombreGuildeMax) total += 1;

            var maxInstallation = estSecteurMere ? maxInstallationSecteurMere_(maisonJoueur, typeSecteur) : (typeSecteur.nombreInstallationMax || 0);
            var installationsUtilisees = installationsUtilisees_(s);
            if (maxInstallation > 0 && installationsUtilisees >= maxInstallation) total += 1;

            // Certaines maisons (ex. Novaris : deux Chantiers Navals
            // préimprimés) ont un Secteur-Mère qui coûte un Entretien fixe
            // supplémentaire tant qu'il appartient au joueur — voir
            // maisons.json secteurMereEntretienBonus.
            if (estSecteurMere && maisonJoueur && maisonJoueur.secteurMereEntretienBonus && appartientAuJoueur_(s)) {
              total += maisonJoueur.secteurMereEntretienBonus;
            }
          });
          return total;
        });
    });
  }

  /**
   * Correspondance entre les clés `elements` d'un cadre de type
   * "placement" (data/catalogue/evenements.json) et les champs
   * secteursPartie à incrémenter. `categorie` détermine si l'élément
   * consomme un emplacement Installation/Guilde (limité par
   * typesSecteur.nombreInstallationMax/nombreGuildeMax) ou se pose
   * librement (jeton, categorie 'jeton', aucune limite d'emplacement).
   * Convention de nommage : les clés Guilde sont au PLURIEL (ex.
   * "guilde_fermiers", "guilde_banquiers"), sauf "guilde_scientifique"
   * au singulier — doit rester cohérent avec data/catalogue/
   * evenements.json.
   */
  var CHAMP_ELEMENT_PLACEMENT_ = {
    defense_secteur: { champ: 'installationDefenseSecteur', categorie: 'installation' },
    chantier_naval: { champ: 'installationChantierNaval', categorie: 'installation' },
    base_stellaire: { champ: 'installationBaseStellaire', categorie: 'installation' },
    guilde_scientifique: { champ: 'guildeScientifiques', categorie: 'guilde' },
    guilde_fermiers: { champ: 'guildeFermiers', categorie: 'guilde' },
    guilde_ingenieurs: { champ: 'guildeIngenieurs', categorie: 'guilde' },
    guilde_mineurs: { champ: 'guildeMineurs', categorie: 'guilde' },
    guilde_banquiers: { champ: 'guildeBanquiers', categorie: 'guilde' },
    liberation: { champ: 'jetonLiberation', categorie: 'jeton' },
    // jeton, aucun emplacement Installation/Guilde consommé.
    prime: { champ: 'jetonPrime', categorie: 'jeton' },
    // cube_neant incrémente pnNeant (comme les autres jetons ci-dessus,
    // aucun emplacement consommé — le secteur ciblé a déjà pnNeant > 0,
    // voir le filtre d'éligibilité plus bas, on y ajoute simplement le
    // cube posé). gloire est différent : jetonGloire stocke un TABLEAU de
    // valeurs (un secteur peut porter plusieurs jetons Gloire,
    // docs-rules-cycle-de-jeu.md §1.5.5 — voir ligneSecteurParDefaut_
    // ci-dessus) — `tableauValeurs: true` fait que
    // placerElementsNeantAdjacent AJOUTE la valeur au tableau au lieu de
    // l'écraser ou de l'incrémenter comme un simple compteur.
    cube_neant: { champ: 'pnNeant', categorie: 'jeton' },
    gloire: { champ: 'jetonGloire', categorie: 'jeton', tableauValeurs: true },
    // Chantier "Cadres placement en masse" (14/09/2026) — un Gardien posé
    // par un cadre "chaque_faille" (ex. Événement J Cycle 2), jeton comme
    // liberation/prime ci-dessus (aucun emplacement Installation/Guilde
    // consommé). N'existait pas encore ici : les seuls Gardiens jusqu'ici
    // posés par l'app venaient de la mise en place (nombreGardienDepart).
    gardien: { champ: 'nombreGardien', categorie: 'jeton' },
    // "guilde" GÉNÉRIQUE (type au choix du joueur, pas de suffixe) —
    // aucun `champ` (le type précis n'est connu qu'au moment du
    // placement, résolu côté appelant AVANT d'appeler
    // placerElementsNeantAdjacent, qui ne reçoit jamais cette clé
    // générique telle quelle — voir GameService.appliquerCadreChoixPlacement).
    // `categorie: 'guilde'` suffit à obtenirSecteursEligiblesPlacementNeantAdjacent
    // (ci-dessous), qui ne compte les emplacements que par categorie, pas
    // par champ précis.
    guilde: { categorie: 'guilde' }
  };

  /**
   * Secteurs candidats pour un cadre de type "placement" (zone
   * "secteur_neant_adjacent") — un secteur du Néant (pnNeant > 0),
   * adjacent à un secteur qui appartient au joueur, avec assez
   * d'emplacements Installation ET Guilde libres pour les éléments de
   * type correspondant demandés par `elements` (les jetons, ex.
   * Libération, ne consomment aucun emplacement). Générique : le calcul
   * des emplacements requis est dérivé de `elements`, pas fixé au type
   * de cadre. `dernierEmplacement` (bool) n'est vrai que si un type
   * d'emplacement réellement demandé par ce cadre est à son dernier
   * emplacement libre sur ce secteur (ex. un cadre qui ne pose qu'une
   * Installation n'alerte jamais sur la Guilde, et inversement).
   */
  function obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, elements) {
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

        var installationsNecessaires = 0, guildesNecessaires = 0;
        Object.keys(elements || {}).forEach(function (cle) {
          var info = CHAMP_ELEMENT_PLACEMENT_[cle];
          if (!info) return;
          var quantite = Number(elements[cle]) || 0;
          if (info.categorie === 'installation') installationsNecessaires += quantite;
          if (info.categorie === 'guilde') guildesNecessaires += quantite;
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

          var installationsUtilisees = installationsUtilisees_(s);
          var guildesUtilisees = guildesUtilisees_(s);
          var emplacementsInstallationLibres = (typeSecteur.nombreInstallationMax || 0) - installationsUtilisees;
          var emplacementsGuildeLibres = (typeSecteur.nombreGuildeMax || 0) - guildesUtilisees;

          if (installationsNecessaires > 0 && emplacementsInstallationLibres < installationsNecessaires) return;
          if (guildesNecessaires > 0 && emplacementsGuildeLibres < guildesNecessaires) return;

          var dernierEmplacement =
            (installationsNecessaires > 0 && emplacementsInstallationLibres === installationsNecessaires) ||
            (guildesNecessaires > 0 && emplacementsGuildeLibres === guildesNecessaires);

          resultat.push({ numero: s.numero, dernierEmplacement: dernierEmplacement });
        });
        return resultat;
      });
    });
  }

  /**
   * Place les éléments d'un cadre "placement" dans le secteur du Néant
   * adjacent choisi par le joueur — revalide les mêmes conditions
   * qu'obtenirSecteursEligiblesPlacementNeantAdjacent (jamais confiance à
   * l'appelant, même principe que construire ci-dessus) avant d'écrire :
   * incrémente le champ secteursPartie de chaque clé de `elements`
   * reconnue par CHAMP_ELEMENT_PLACEMENT_, de la quantité indiquée.
   */
  /**
   * Applique `elements` (gabarit CHAMP_ELEMENT_PLACEMENT_) EN MÉMOIRE sur
   * `secteur` — MUTE l'objet reçu, n'écrit rien elle-même (voir les 2
   * appelants : placerElementsNeantAdjacent, qui persiste 1 secteur, et
   * placerElementsEnMasse ci-dessous, qui persiste plusieurs secteurs en
   * série). Factorisée le 14/09/2026 (chantier "Cadres placement en
   * masse") pour ne jamais dupliquer cette logique d'écriture.
   */
  function appliquerElementsSurSecteur_(secteur, elements) {
    Object.keys(elements || {}).forEach(function (cle) {
      var info = CHAMP_ELEMENT_PLACEMENT_[cle];
      // `!info.champ` couvre les entrées GÉNÉRIQUES sans type résolu (ex.
      // "guilde", voir CHAMP_ELEMENT_PLACEMENT_ ci-dessus) — ne devrait
      // jamais arriver ici en usage normal (le type est toujours résolu
      // par l'appelant AVANT d'appeler cette fonction), mais ignoré
      // silencieusement plutôt que d'écrire sur un champ "undefined",
      // même filet de sécurité que pour une clé totalement inconnue.
      if (!info || !info.champ) return;
      var quantite = Number(elements[cle]) || 0;
      if (info.tableauValeurs) {
        // Un secteur peut porter plusieurs jetons Gloire (valeur
        // individuelle chacun, aucun plafond) — ajoute cette valeur au
        // tableau existant au lieu de l'écraser, normalisant au passage
        // une éventuelle ancienne sauvegarde où ce champ était encore un
        // simple nombre (jamais un tableau).
        var tableauExistant = Array.isArray(secteur[info.champ])
          ? secteur[info.champ].slice()
          : (secteur[info.champ] ? [secteur[info.champ]] : []);
        tableauExistant.push(quantite);
        secteur[info.champ] = tableauExistant;
      } else {
        secteur[info.champ] = (secteur[info.champ] || 0) + quantite;
      }
    });
  }

  function placerElementsNeantAdjacent(partieId, numero, elements) {
    return obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, elements).then(function (eligibles) {
      var cible = eligibles.filter(function (e) { return e.numero === numero; })[0];
      if (!cible) {
        throw new Error('Secteur ' + numero + ' non éligible (doit être un secteur du Néant, adjacent à l\'un de vos secteurs, avec les emplacements Installation/Guilde requis libres).');
      }

      return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
        if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
        appliquerElementsSurSecteur_(secteur, elements);
        return DB.put('secteursPartie', secteur).then(function () { return secteur; });
      });
    });
  }

  // ------------------------------------------------------------
  // Chantier "Cadres placement en masse" (14/09/2026) — cadres de type
  // "placement" dont la `zone` du catalogue (data/catalogue/evenements.json)
  // n'est PAS "secteur_neant_adjacent" mais un critère GALACTIQUE
  // ("chaque secteur de Faille", "chaque secteur du Néant avec au moins 4
  // Population"...) : contrairement à placerElementsNeantAdjacent
  // ci-dessus (UN secteur, choisi par le joueur parmi ceux adjacents à
  // ses propres secteurs), ces cadres posent les MÊMES éléments sur TOUS
  // les secteurs de la galaxie remplissant le critère, sans aucun choix
  // du joueur — jamais automatisés jusqu'ici (chaque cadre de ce type
  // tombait dans le "hors périmètre" générique, invisible/non cliquable
  // côté index.html). "secteur du Néant" garde ici EXACTEMENT le même
  // sens qu'ailleurs dans ce fichier (pnNeant > 0) — PAS "n'appartient pas
  // au joueur" (un secteur du joueur ou une Faille sans pnNeant peuvent
  // très bien ne pas être un "secteur du Néant").
  // ------------------------------------------------------------

  /**
   * Un prédicat par `zone` connue — reçoit (secteur, ctx) où
   * `ctx.typeParNumero`/`ctx.adjacenceMap` sont déjà résolus par
   * obtenirSecteursEligiblesPlacementEnMasse ci-dessous. Liste tenue
   * VOLONTAIREMENT limitée aux zones réellement rencontrées au catalogue
   * (vérifiées une par une contre le texte imprimé de la carte) — jamais
   * de correspondance approximative pour une zone inconnue, voir la
   * fonction appelante qui retourne [] dans ce cas.
   */
  var CRITERES_PLACEMENT_MASSE_ = {
    // "Placez un Gardien sur chaque Faille." — un TYPE de secteur, jamais
    // conditionné par pnNeant (une Faille reste une Faille même sans
    // Puissance Navale du Néant dessus).
    chaque_faille: function (secteur, ctx) { return ctx.typeParNumero[secteur.numero] === 'faille'; },
    chaque_secteur_neant_population_min_4: function (secteur) {
      return (secteur.pnNeant || 0) > 0 && (secteur.population || 0) >= 4;
    },
    chaque_secteur_neant_avec_defense_secteur_min_1: function (secteur) {
      return (secteur.pnNeant || 0) > 0 && (secteur.installationDefenseSecteur || 0) >= 1;
    },
    chaque_secteur_neant_cube_neant_max_2: function (secteur) {
      return (secteur.pnNeant || 0) > 0 && (secteur.pnNeant || 0) <= 2;
    },
    chaque_secteur_neant_adjacent_a_une_faille: function (secteur, ctx) {
      if ((secteur.pnNeant || 0) <= 0) return false;
      return (ctx.adjacenceMap[secteur.numero] || []).some(function (n) { return ctx.typeParNumero[n] === 'faille'; });
    }
  };

  /**
   * Secteurs galaxie entière remplissant le critère `zone` (voir
   * CRITERES_PLACEMENT_MASSE_ ci-dessus) — [] si `zone` est inconnue
   * (jamais une approximation). Contrairement à
   * obtenirSecteursEligiblesPlacementNeantAdjacent, ne filtre PAS sur la
   * possession du joueur ni sur les emplacements Installation/Guilde
   * libres : ces cadres s'appliquent inconditionnellement (la carte ne
   * prévoit aucun cas où l'emplacement manquerait).
   */
  function obtenirSecteursEligiblesPlacementEnMasse(partieId, zone) {
    var predicat = CRITERES_PLACEMENT_MASSE_[zone];
    if (!predicat) return Promise.resolve([]);

    return DB.get('parties', partieId).then(function (ligneP) {
      if (!ligneP || !ligneP.scenarioId) return [];

      return Promise.all([
        obtenirSecteurs(partieId),
        DB.getAll('scenarioSecteurs'),
        obtenirAdjacences(ligneP.scenarioId)
      ]).then(function (resultats) {
        var secteurs = resultats[0];
        var scenarioSecteurs = resultats[1].filter(function (l) { return l.scenarioId === ligneP.scenarioId; });

        var typeParNumero = {};
        scenarioSecteurs.forEach(function (l) { typeParNumero[l.numero] = l.type; });

        var adjacenceMap = {};
        resultats[2].forEach(function (a) {
          adjacenceMap[a.numeroA] = adjacenceMap[a.numeroA] || [];
          adjacenceMap[a.numeroA].push(a.numeroB);
          adjacenceMap[a.numeroB] = adjacenceMap[a.numeroB] || [];
          adjacenceMap[a.numeroB].push(a.numeroA);
        });

        var ctx = { typeParNumero: typeParNumero, adjacenceMap: adjacenceMap };
        return secteurs.filter(function (s) { return predicat(s, ctx); }).map(function (s) { return s.numero; });
      });
    });
  }

  /**
   * Place `elements` sur CHAQUE secteur remplissant le critère `zone` —
   * revalide l'éligibilité à neuf (jamais confiance à l'appelant, même
   * principe que placerElementsNeantAdjacent) avant d'écrire. Retourne la
   * liste des numéros de secteur effectivement modifiés (pour le résumé
   * "✓ Appliqué (Secteurs ...)", même gabarit que placement_multiple —
   * voir GameService.appliquerCadrePlacementEnMasse). Aucune écriture si
   * `zone` est inconnue ou si aucun secteur n'est éligible (tableau vide,
   * pas une erreur — une carte peut retrouver 0 cible, ex. aucune Faille
   * restante).
   */
  function placerElementsEnMasse(partieId, zone, elements) {
    return obtenirSecteursEligiblesPlacementEnMasse(partieId, zone).then(function (numeros) {
      return numeros.reduce(function (promesse, numero) {
        return promesse.then(function () {
          return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
            if (!secteur) return null;
            appliquerElementsSurSecteur_(secteur, elements);
            return DB.put('secteursPartie', secteur);
          });
        });
      }, Promise.resolve()).then(function () { return numeros; });
    });
  }

  /**
   * Calcule (SANS écrire) les cibles d'un cadre de type
   * "placement_multiple" (data/catalogue/evenements.json, effet.placements[]
   * — chaque entrée { critere: 'population_min'|'population_max', elements }).
   * Contrairement à un cadre "placement" simple, le secteur n'est pas un
   * libre choix du joueur : il est déterminé par la Population des
   * secteurs du Néant adjacents à l'un des secteurs du joueur (la plus
   * basse pour l'un, la plus élevée pour l'autre) — seule une égalité de
   * Population (rare) laisse un vrai choix au joueur (plusieurs candidats
   * à égalité pour le même critère).
   *
   * Retourne { casParticulier, groupes } où `groupes` est un tableau
   * parallèle à `effet.placements` (même ordre, même longueur) SAUF si
   * `casParticulier` est vrai (un seul secteur du Néant est adjacent au
   * total, voir `effet.cas_particulier` du catalogue) : dans ce cas
   * `groupes` ne contient qu'UNE entrée, ses `elements` fusionnant ceux de
   * TOUS les `placements` (tous les jetons posés sur cet unique secteur,
   * conforme à la règle imprimée). Chaque groupe : { elements, candidats }
   * — `candidats` = liste des numéros de secteur atteignant le critère (1
   * seul élément si aucune égalité, plusieurs sinon, vide si aucun secteur
   * éligible actuellement).
   *
   * Réutilise obtenirSecteursEligiblesPlacementNeantAdjacent (déjà
   * générique, filtre Néant/adjacence/emplacements Installation-Guilde
   * libres) pour chaque jeu d'éléments plutôt que de dupliquer ce filtre —
   * seule la Population (obtenirSecteurs) est nouvelle ici.
   */
  function resoudrePlacementMultipleNeantAdjacent(partieId, effet) {
    if (!effet || effet.type !== 'placement_multiple' || !Array.isArray(effet.placements)) {
      return Promise.resolve({ casParticulier: false, groupes: [] });
    }

    return Promise.all([
      obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, {}),
      obtenirSecteurs(partieId)
    ]).then(function (resultats) {
      var eligiblesBase = resultats[0];
      var populationParNumero = {};
      resultats[1].forEach(function (s) { populationParNumero[s.numero] = s.population; });

      var casParticulier = !!(effet.cas_particulier &&
        effet.cas_particulier.condition === 'un_seul_secteur_neant_adjacent' &&
        eligiblesBase.length === 1);

      if (casParticulier) {
        var elementsFusionnes = {};
        effet.placements.forEach(function (p) {
          Object.keys(p.elements || {}).forEach(function (cle) {
            elementsFusionnes[cle] = (elementsFusionnes[cle] || 0) + (Number(p.elements[cle]) || 0);
          });
        });
        return obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, elementsFusionnes).then(function (eligiblesFusionnes) {
          var candidats = eligiblesFusionnes.map(function (e) { return e.numero; });
          return { casParticulier: true, groupes: [{ elements: elementsFusionnes, candidats: candidats }] };
        });
      }

      return Promise.all(effet.placements.map(function (p) {
        return obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, p.elements).then(function (eligibles) {
          if (!eligibles.length) return { elements: p.elements, critere: p.critere, candidats: [] };
          var populations = eligibles.map(function (e) { return Number(populationParNumero[e.numero]) || 0; });
          var extremum = p.critere === 'population_max' ? Math.max.apply(null, populations) : Math.min.apply(null, populations);
          var candidats = eligibles
            .filter(function (e) { return (Number(populationParNumero[e.numero]) || 0) === extremum; })
            .map(function (e) { return e.numero; });
          return { elements: p.elements, critere: p.critere, candidats: candidats };
        });
      })).then(function (groupes) {
        return { casParticulier: false, groupes: groupes };
      });
    });
  }

  /**
   * Applique un cadre "placement_multiple" — `ciblesParGroupe` (un numéro de secteur
   * par entrée de `resoudrePlacementMultipleNeantAdjacent(...).groupes`,
   * même ordre) vient du joueur (choix explicite en cas d'égalité de
   * Population, ou seul candidat possible sinon) mais est REVALIDÉ ici :
   * les groupes sont recalculés à neuf (jamais confiance à l'appelant, même
   * principe que placerElementsNeantAdjacent) et chaque cible doit figurer
   * parmi les candidats recalculés. Écrit séquentiellement via
   * placerElementsNeantAdjacent (déjà générique) pour chaque groupe.
   */
  function appliquerPlacementMultipleNeantAdjacent(partieId, effet, ciblesParGroupe) {
    return resoudrePlacementMultipleNeantAdjacent(partieId, effet).then(function (resultat) {
      var groupes = resultat.groupes;
      if (!groupes.length || !Array.isArray(ciblesParGroupe) || ciblesParGroupe.length !== groupes.length) {
        throw new Error('Sélection de secteurs invalide pour ce cadre.');
      }
      groupes.forEach(function (groupe, i) {
        if (groupe.candidats.indexOf(ciblesParGroupe[i]) === -1) {
          throw new Error('Secteur ' + ciblesParGroupe[i] + ' non éligible pour ce placement (Population).');
        }
      });

      var promesse = Promise.resolve();
      groupes.forEach(function (groupe, i) {
        promesse = promesse.then(function () {
          return placerElementsNeantAdjacent(partieId, ciblesParGroupe[i], groupe.elements);
        });
      });
      return promesse.then(function () { return { secteurs: ciblesParGroupe.slice() }; });
    });
  }

  return {
    SCENARIO_PAR_DEFAUT: SCENARIO_PAR_DEFAUT,
    instancierSecteurs: instancierSecteurs,
    obtenirSecteurs: obtenirSecteurs,
    obtenirAdjacences: obtenirAdjacences,
    obtenirSecteurMere: obtenirSecteurMere,
    // Exposée publiquement (EVOLUTION 9) : seule source de vérité sur la
    // possession d'un secteur (PN joueur > 0 et pas de PN Néant), utilisée
    // par strategieService.js pour calculerNiveauxProduction_ sans dupliquer
    // la règle. Le Secteur-Mère est TOUJOURS possédé même sans PN dessus
    // (cas géré séparément par l'appelant via obtenirSecteurMere).
    appartientAuJoueur: appartientAuJoueur_,
    // Exposée publiquement : réutilisée par secteurVueService.js pour
    // dessiner le bon nombre d'emplacements Installation sur le
    // Secteur-Mère des maisons non standard (Astoran...).
    maxInstallationSecteurMere: maxInstallationSecteurMere_,
    construire: construire,
    deployerCube: deployerCube,
    rappelerCube: rappelerCube,
    retirerCorruption: retirerCorruption,
    obtenirSecteursEligiblesRetraitGardien: obtenirSecteursEligiblesRetraitGardien,
    retirerGardien: retirerGardien,
    regrouper: regrouper,
    envahirResoudre: envahirResoudre,
    determinerCibleEscarmouche: determinerCibleEscarmouche,
    appliquerResultatEscarmouche: appliquerResultatEscarmouche,
    obtenirSecteursEligiblesConstruction: obtenirSecteursEligiblesConstruction,
    obtenirSecteursEligiblesAugmenterPopulationPure: obtenirSecteursEligiblesAugmenterPopulationPure,
    augmenterPopulationPure: augmenterPopulationPure,
    obtenirSecteursEligiblesRetraitCorruption: obtenirSecteursEligiblesRetraitCorruption,
    obtenirSecteursEligiblesGainCorruption: obtenirSecteursEligiblesGainCorruption,
    placerCorruption: placerCorruption,
    majSecteur: majSecteur,
    obtenirAgregatsInfluenceSecteursPurs: obtenirAgregatsInfluenceSecteursPurs,
    obtenirDetailSecteursProgrammes: obtenirDetailSecteursProgrammes,
    obtenirSecteursEligiblesPlacementNeantAdjacent: obtenirSecteursEligiblesPlacementNeantAdjacent,
    placerElementsNeantAdjacent: placerElementsNeantAdjacent,
    obtenirSecteursEligiblesPlacementEnMasse: obtenirSecteursEligiblesPlacementEnMasse,
    placerElementsEnMasse: placerElementsEnMasse,
    resoudrePlacementMultipleNeantAdjacent: resoudrePlacementMultipleNeantAdjacent,
    appliquerPlacementMultipleNeantAdjacent: appliquerPlacementMultipleNeantAdjacent,
    getEntretien: getEntretien,
    // Exposée publiquement : seule source de vérité pour ce mapping,
    // utilisée aussi par strategieService.js (pas de copie locale).
    CHAMP_PN_PAR_TYPE: CHAMP_PN_PAR_TYPE
  };
})();
