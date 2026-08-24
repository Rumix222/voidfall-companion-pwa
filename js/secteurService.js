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
   * Construit une installation ou une Guilde sur un secteur qui
   * appartient au joueur, si un emplacement est libre (limite définie par
   * typesSecteur.nombreInstallationMax / nombreGuildeMax pour le type de
   * secteur concerné).
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

  function retirerCorruption(partieId, numero) {
    return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
      if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
      secteur.corrompu = false;
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
   * exclu ici via obtenirSecteurMere(scenarioId), jamais éligible en gain
   * (alors qu'il ne peut de toute façon jamais être Corrompu, donc cette
   * exclusion ne change rien à obtenirSecteursEligiblesRetraitCorruption).
   */
  function obtenirSecteursEligiblesGainCorruption(partieId) {
    return Promise.all([DB.get('parties', partieId), obtenirSecteurs(partieId)]).then(function (resultats) {
      var ligneP = resultats[0], secteurs = resultats[1];
      return obtenirSecteurMere(ligneP ? ligneP.scenarioId : null).then(function (numeroSecteurMere) {
        return secteurs
          .filter(function (s) { return appartientAuJoueur_(s) && !s.corrompu && s.numero !== numeroSecteurMere; })
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
   */
  function obtenirAgregatsInfluenceSecteursPurs(partieId) {
    return obtenirSecteurs(partieId).then(function (secteurs) {
      var purs = secteurs.filter(function (s) { return appartientAuJoueur_(s) && !s.corrompu; });

      var guildesPures = { fermiers: 0, ingenieurs: 0, mineurs: 0, banquiers: 0, scientifiques: 0, total: 0 };
      var installationsPuresTotal = 0;
      var cubesSecteurPurTotal = 0;
      var nombreSecteurPurAvecGuilde = 0;
      var nombreSecteurPurPopulation6 = 0;

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
      });

      return {
        nombreSecteurPur: purs.length,
        nombreSecteurPurAvecGuilde: nombreSecteurPurAvecGuilde,
        nombreSecteurPurPopulation6: nombreSecteurPurPopulation6,
        guildesPures: guildesPures,
        installationsPuresTotal: installationsPuresTotal,
        cubesSecteurPurTotal: cubesSecteurPurTotal
      };
    });
  }

  /**
   * Déplacement de Puissance Navale entre secteurs ADJACENTS qui
   * appartiennent tous deux au joueur, 5 déplacements maximum au total.
   * Deux passes de validation AVANT toute écriture (adjacence/
   * appartenance, puis stock disponible agrégé par secteur de départ+type).
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
          secteurCible.installationChantierNaval = 0;
          secteurCible.installationDefenseSecteur = 0;
          secteurCible.installationBaseStellaire = 0;
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

            var guildesUtilisees = guildesUtilisees_(s);
            if ((typeSecteur.nombreGuildeMax || 0) > 0 && guildesUtilisees >= typeSecteur.nombreGuildeMax) total += 1;

            var installationsUtilisees = installationsUtilisees_(s);
            if ((typeSecteur.nombreInstallationMax || 0) > 0 && installationsUtilisees >= typeSecteur.nombreInstallationMax) total += 1;
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
  function placerElementsNeantAdjacent(partieId, numero, elements) {
    return obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, elements).then(function (eligibles) {
      var cible = eligibles.filter(function (e) { return e.numero === numero; })[0];
      if (!cible) {
        throw new Error('Secteur ' + numero + ' non éligible (doit être un secteur du Néant, adjacent à l\'un de vos secteurs, avec les emplacements Installation/Guilde requis libres).');
      }

      return DB.get('secteursPartie', [partieId, numero]).then(function (secteur) {
        if (!secteur) throw new Error('Secteur ' + numero + ' introuvable pour cette partie.');
        Object.keys(elements || {}).forEach(function (cle) {
          var info = CHAMP_ELEMENT_PLACEMENT_[cle];
          // `!info.champ` couvre les entrées GÉNÉRIQUES sans type résolu
          // (ex. "guilde", voir CHAMP_ELEMENT_PLACEMENT_ ci-dessus) — ne
          // devrait jamais arriver ici en usage normal (le type est
          // toujours résolu par l'appelant AVANT d'appeler cette
          // fonction), mais ignoré silencieusement plutôt que d'écrire
          // sur un champ "undefined", même filet de sécurité que pour
          // une clé totalement inconnue.
          if (!info || !info.champ) return;
          var quantite = Number(elements[cle]) || 0;
          if (info.tableauValeurs) {
            // Un secteur peut porter plusieurs jetons Gloire (valeur
            // individuelle chacun, aucun plafond) — ajoute cette valeur au
            // tableau existant au lieu de l'écraser, normalisant au passage
            // une éventuelle ancienne sauvegarde où ce champ était encore
            // un simple nombre (jamais un tableau).
            var tableauExistant = Array.isArray(secteur[info.champ])
              ? secteur[info.champ].slice()
              : (secteur[info.champ] ? [secteur[info.champ]] : []);
            tableauExistant.push(quantite);
            secteur[info.champ] = tableauExistant;
          } else {
            secteur[info.champ] = (secteur[info.champ] || 0) + quantite;
          }
        });
        return DB.put('secteursPartie', secteur).then(function () { return secteur; });
      });
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
    construire: construire,
    deployerCube: deployerCube,
    rappelerCube: rappelerCube,
    retirerCorruption: retirerCorruption,
    regrouper: regrouper,
    envahirResoudre: envahirResoudre,
    obtenirSecteursEligiblesConstruction: obtenirSecteursEligiblesConstruction,
    obtenirSecteursEligiblesAugmenterPopulationPure: obtenirSecteursEligiblesAugmenterPopulationPure,
    augmenterPopulationPure: augmenterPopulationPure,
    obtenirSecteursEligiblesRetraitCorruption: obtenirSecteursEligiblesRetraitCorruption,
    obtenirSecteursEligiblesGainCorruption: obtenirSecteursEligiblesGainCorruption,
    placerCorruption: placerCorruption,
    obtenirAgregatsInfluenceSecteursPurs: obtenirAgregatsInfluenceSecteursPurs,
    obtenirSecteursEligiblesPlacementNeantAdjacent: obtenirSecteursEligiblesPlacementNeantAdjacent,
    placerElementsNeantAdjacent: placerElementsNeantAdjacent,
    resoudrePlacementMultipleNeantAdjacent: resoudrePlacementMultipleNeantAdjacent,
    appliquerPlacementMultipleNeantAdjacent: appliquerPlacementMultipleNeantAdjacent,
    getEntretien: getEntretien,
    // Exposée publiquement : seule source de vérité pour ce mapping,
    // utilisée aussi par strategieService.js (pas de copie locale).
    CHAMP_PN_PAR_TYPE: CHAMP_PN_PAR_TYPE
  };
})();
