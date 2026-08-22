/**
 * combatService.js
 * Moteur de combat (Envahir / Escarmouche) — Voidfall Companion PWA
 *
 * Calcule le résultat exact d'un Combat (Envahir/Escarmouche), technologies
 * de base et améliorées comprises. La PERSISTANCE des conséquences d'une
 * invasion sur le plateau des secteurs (retrait des Installations,
 * changement de propriétaire, dépôt de la Puissance Navale survivante)
 * reste hors périmètre : resoudreInvasion() calcule le résultat, mais
 * l'appliquer au plateau reste à faire manuellement par le joueur (comme
 * le reste des actions secteur non automatisées, voir focusEngine.js).
 *
 * Simplifications connues, non couvertes :
 * - Aucun bonus nécessitant une dépense de ressource en cours de combat
 *   (Missiles longue portée, Drones autonomes, Focus Exaltation "Bombarder").
 * - Le choix du cube rappelé est automatisé selon une priorité fixe
 *   (Corvette > Sentinelle > Destroyer > Porte-Vaisseaux > Cuirassé)
 *   plutôt que laissé au joueur.
 *
 * Module pur : aucune dépendance, aucun accès DOM ni IndexedDB. La
 * construction des champs de saisie et le branchement des boutons vivent
 * dans js/combatVueService.js (écran Combat).
 */

var CombatService = (function () {
  'use strict';

  // Le nom de la technologie qui débloque un vaisseau est identique au
  // nom du vaisseau (colonne "Permanent" de l'onglet Technologie).
  var NOMS_VAISSEAUX = ['Destroyers', 'Cuirassés', 'Sentinelles', 'Porte-Vaisseaux'];

  function normaliser_(nom) {
    return (nom || '').trim().toLowerCase();
  }

  /**
   * Technologies possédées par le joueur : technologie de départ (mise en
   * place) + technologies obtenues (plateau maison), en ignorant les
   * emplacements vides.
   */
  function technologiesJoueur_(partie) {
    var techs = [];
    if (partie.joueur && partie.joueur.technologieDepart) {
      techs.push(partie.joueur.technologieDepart);
    }
    (partie.technologiesObtenues || []).forEach(function (t) {
      if (t) techs.push(t);
    });
    return techs;
  }

  function vaisseauxDebloques(partie) {
    var noms = technologiesJoueur_(partie).map(function (t) { return normaliser_(t.nom); });
    return NOMS_VAISSEAUX.filter(function (vaisseau) {
      return noms.indexOf(normaliser_(vaisseau)) !== -1;
    });
  }

  /**
   * Technologies du joueur pertinentes pour le combat, avec leur état
   * "amélioré".
   */
  function techsCombat_(partie) {
    var techs = technologiesJoueur_(partie);

    function trouve(nom) {
      var norm = normaliser_(nom);
      return techs.filter(function (t) { return normaliser_(t.nom) === norm; })[0];
    }
    function possede(nom) { return !!trouve(nom); }
    function ameliore(nom) { var t = trouve(nom); return !!(t && t.amelioree); }

    return {
      hasBoucliers: possede('Boucliers'),
      hasBouclersAmeliore: ameliore('Boucliers'),
      hasCiblage: possede('Ciblage'),
      hasCiblageAmeliore: ameliore('Ciblage'),
      hasTorpilles: possede('Torpilles'),
      hasTorpillesAmeliore: ameliore('Torpilles'),
      hasCellulesEnergetiques: possede('Cellules énergétiques'),
      hasDestroyersAmeliore: ameliore('Destroyers')
    };
  }

  /**
   * Construit un camp de combat. estJoueur : true si ce camp représente
   * le joueur (bénéficie de ses Technologies) ; false pour le Néant.
   */
  function construireCamp(nom, corvette, destroyer, cuirasse, sentinelle, portevaisseau, defenseSecteur, estJoueur, partie) {
    return {
      nom: nom,
      estJoueur: estJoueur,
      techs: estJoueur ? techsCombat_(partie) : {
        hasBoucliers: false, hasBouclersAmeliore: false,
        hasCiblage: false, hasCiblageAmeliore: false,
        hasTorpilles: false, hasTorpillesAmeliore: false,
        hasCellulesEnergetiques: false, hasDestroyersAmeliore: false
      },
      corvette: corvette || 0,
      destroyer: destroyer || 0,
      cuirasse: cuirasse || 0,
      sentinelle: sentinelle || 0,
      portevaisseau: portevaisseau || 0,
      defenseSecteur: defenseSecteur || 0,
      absorptionSalveDisponible: 0
    };
  }

  function totalNavale_(camp) {
    return camp.corvette + camp.destroyer + camp.cuirasse + camp.sentinelle + camp.portevaisseau;
  }

  function calculerInitiative_(camp, estEnvahisseur) {
    var init = camp.corvette + camp.destroyer + camp.cuirasse + camp.portevaisseau;
    if (estEnvahisseur) init += camp.sentinelle; // Sentinelle : 0 Initiative côté Défenseur
    if (camp.cuirasse > 0) init += 1;
    if (estEnvahisseur && camp.destroyer > 0) init += 1;
    // Ciblage de base : +5 Initiative. Ciblage amélioré remplace ce bonus
    // par une garantie de premier tir (voir premierFrappeGarantie_).
    if (camp.techs.hasCiblage && !camp.techs.hasCiblageAmeliore && camp.corvette > 0) init += 5;
    return init;
  }

  /**
   * Ciblage amélioré : "vous infligez toujours les Dégâts en premier...
   * Toutefois, si vous êtes Défenseur et n'avez que des Sentinelles, vous
   * n'avez pas d'Initiative et ne pouvez pas infliger de Dégât."
   */
  function premierFrappeGarantie_(camp, estEnvahisseur) {
    if (!camp.techs.hasCiblageAmeliore) return false;
    if (!estEnvahisseur) {
      var navaleHorsSentinelle = camp.corvette + camp.destroyer + camp.cuirasse + camp.portevaisseau;
      if (navaleHorsSentinelle === 0 && camp.sentinelle > 0) return false;
    }
    return true;
  }

  /**
   * Détermine qui frappe en premier lors d'une étape de Salve : priorité
   * à la garantie de premier tir (Ciblage amélioré) si un seul camp la
   * possède, sinon comparaison normale d'Initiative.
   */
  function determinerOrdre_(initAttaquant, initDefenseur, attaquantPremier, defenseurPremier) {
    if (attaquantPremier && !defenseurPremier) return 'attaquant';
    if (defenseurPremier && !attaquantPremier) return 'defenseur';
    if (initAttaquant > initDefenseur) return 'attaquant';
    if (initDefenseur > initAttaquant) return 'defenseur';
    return 'egalite';
  }

  var ORDRE_RAPPEL = [
    { cle: 'corvette', label: 'Corvette' },
    { cle: 'sentinelle', label: 'Sentinelle' },
    { cle: 'destroyer', label: 'Destroyer' },
    { cle: 'portevaisseau', label: 'Porte-Vaisseaux' },
    { cle: 'cuirasse', label: 'Cuirassé' }
  ];

  function rappelerCube_(camp) {
    for (var i = 0; i < ORDRE_RAPPEL.length; i++) {
      if (camp[ORDRE_RAPPEL[i].cle] > 0) {
        camp[ORDRE_RAPPEL[i].cle]--;
        return ORDRE_RAPPEL[i].label;
      }
    }
    return null;
  }

  function appliquerDegat_(camp, log, contexte) {
    if (camp.absorptionSalveDisponible > 0) {
      camp.absorptionSalveDisponible--;
      log.push(camp.nom + ' absorbe le Dégât (' + contexte + ').');
    } else {
      var type = rappelerCube_(camp);
      if (type) {
        log.push(camp.nom + ' rappelle 1 cube de ' + type + ' (' + contexte + ').');
      } else {
        log.push(camp.nom + ' ne peut plus rappeler de cube (' + contexte + ').');
      }
    }
  }

  /**
   * Applique les Dégâts d'Approche infligés par `source` à `cible`, en
   * tenant compte de l'Absorption d'Approche disponible pour `cible`.
   */
  function resoudreApproche_(source, cible, degats, absorptionDisponible, log) {
    if (degats <= 0) return;
    var absorbes = Math.min(absorptionDisponible, degats);
    var restants = degats - absorbes;
    log.push(source.nom + ' inflige ' + degats + ' Dégât(s) d\'Approche à ' + cible.nom +
      (absorbes > 0 ? ' (' + absorbes + ' absorbé(s))' : '') + '.');
    for (var i = 0; i < restants; i++) {
      var type = rappelerCube_(cible);
      log.push(cible.nom + ' rappelle 1 cube de ' + (type || 'Puissance') + ' (Dégât d\'Approche).');
    }
  }

  /**
   * Résout un combat complet entre un Envahisseur (attaquant) et un
   * Défenseur, technologies de base ET améliorées comprises. Mute
   * `attaquant`/`defenseur` EN PLACE (leurs champs par type reflètent les
   * survivants exacts à la fin). Retourne { vainqueur, cubesRestants, log }.
   */
  function resoudreCombat(attaquant, defenseur) {
    var log = [];

    // Porte-Vaisseaux : déploient 1 Corvette chacun avant l'étape d'Approche.
    [attaquant, defenseur].forEach(function (camp) {
      if (camp.portevaisseau > 0) {
        camp.corvette += camp.portevaisseau;
        log.push(camp.nom + ' déploie ' + camp.portevaisseau + ' Corvette(s) via ses Porte-Vaisseaux.');
      }
    });

    // --- Étape d'Approche ---
    log.push('--- Approche ---');

    var degatsDefenseur = defenseur.defenseSecteur + defenseur.sentinelle;
    if (degatsDefenseur > 0 && defenseur.estJoueur && defenseur.techs.hasCellulesEnergetiques) {
      degatsDefenseur += 1;
      log.push(defenseur.nom + ' inflige 1 Dégât d\'Approche supplémentaire (Cellules énergétiques).');
    }
    var absorptionAttaquant = attaquant.cuirasse +
      (attaquant.estJoueur && attaquant.techs.hasBouclersAmeliore && attaquant.corvette > 0 ? 1 : 0);
    resoudreApproche_(defenseur, attaquant, degatsDefenseur, absorptionAttaquant, log);

    var degatsAttaquant = 0;
    if (attaquant.estJoueur && attaquant.techs.hasDestroyersAmeliore && attaquant.destroyer > 0) {
      degatsAttaquant += 1;
      log.push(attaquant.nom + ' inflige 1 Dégât d\'Approche (Destroyers améliorés).');
    }
    var absorptionDefenseur =
      (defenseur.estJoueur && defenseur.techs.hasBouclersAmeliore && defenseur.corvette > 0 ? 1 : 0);
    resoudreApproche_(attaquant, defenseur, degatsAttaquant, absorptionDefenseur, log);

    if (degatsDefenseur <= 0 && degatsAttaquant <= 0) {
      log.push('Aucun Dégât d\'Approche.');
    }

    // --- Absorptions de Salve disponibles pour tout le combat ---
    if (attaquant.techs.hasBoucliers) attaquant.absorptionSalveDisponible += 1;
    if (defenseur.techs.hasBoucliers && defenseur.corvette > 0) defenseur.absorptionSalveDisponible += 1;
    defenseur.absorptionSalveDisponible += defenseur.cuirasse;
    defenseur.absorptionSalveDisponible += defenseur.portevaisseau;

    // --- Étapes de Salve ---
    var etape = 0;
    var maxEtapes = 50; // garde-fou
    while (totalNavale_(attaquant) > 0 && totalNavale_(defenseur) > 0 && etape < maxEtapes) {
      etape++;
      log.push('--- Salve ' + etape + ' ---');

      if (attaquant.techs.hasTorpilles && attaquant.corvette > 0 &&
        (etape === 1 || attaquant.techs.hasTorpillesAmeliore)) {
        log.push(attaquant.nom + ' inflige 1 Dégât de Salve supplémentaire (Torpilles).');
        appliquerDegat_(defenseur, log, 'Torpilles de ' + attaquant.nom);
      }
      if (defenseur.techs.hasTorpilles && defenseur.corvette > 0 &&
        (etape === 1 || defenseur.techs.hasTorpillesAmeliore)) {
        log.push(defenseur.nom + ' inflige 1 Dégât de Salve supplémentaire (Torpilles).');
        appliquerDegat_(attaquant, log, 'Torpilles de ' + defenseur.nom);
      }

      if (etape === 1 && attaquant.estJoueur && attaquant.techs.hasDestroyersAmeliore && attaquant.destroyer > 0) {
        log.push(attaquant.nom + ' inflige ' + attaquant.destroyer + ' Dégât(s) de Salve supplémentaire(s) (Destroyers améliorés).');
        for (var d = 0; d < attaquant.destroyer && totalNavale_(defenseur) > 0; d++) {
          appliquerDegat_(defenseur, log, 'Destroyers améliorés de ' + attaquant.nom);
        }
      }

      if (totalNavale_(attaquant) <= 0 || totalNavale_(defenseur) <= 0) break;

      var initAttaquant = calculerInitiative_(attaquant, true);
      var initDefenseur = calculerInitiative_(defenseur, false);
      var attaquantPremier = premierFrappeGarantie_(attaquant, true);
      var defenseurPremier = premierFrappeGarantie_(defenseur, false);

      log.push('Initiative : ' + attaquant.nom + ' ' + initAttaquant +
        (attaquantPremier ? ' (premier tir garanti)' : '') + ' — ' +
        defenseur.nom + ' ' + initDefenseur +
        (defenseurPremier ? ' (premier tir garanti)' : '') + '.');

      var ordre = determinerOrdre_(initAttaquant, initDefenseur, attaquantPremier, defenseurPremier);

      if (ordre === 'attaquant') {
        appliquerDegat_(defenseur, log, attaquant.nom + ' frappe en premier');
        if (totalNavale_(defenseur) > 0 && calculerInitiative_(defenseur, false) >= 1) {
          appliquerDegat_(attaquant, log, defenseur.nom + ' riposte');
        }
      } else if (ordre === 'defenseur') {
        appliquerDegat_(attaquant, log, defenseur.nom + ' frappe en premier');
        if (totalNavale_(attaquant) > 0 && calculerInitiative_(attaquant, true) >= 1) {
          appliquerDegat_(defenseur, log, attaquant.nom + ' riposte');
        }
      } else if (initAttaquant === 0 && initDefenseur === 0) {
        log.push('Aucun camp n\'a d\'Initiative : combat bloqué, arrêt de la simulation.');
        break;
      } else {
        log.push('Égalité d\'Initiative : les deux camps s\'infligent 1 Dégât simultanément.');
        appliquerDegat_(defenseur, log, attaquant.nom + ' (simultané)');
        appliquerDegat_(attaquant, log, defenseur.nom + ' (simultané)');
      }
    }

    var totalAttaquant = totalNavale_(attaquant);
    var totalDefenseur = totalNavale_(defenseur);
    var vainqueur = null;
    var cubesRestants = 0;

    if (totalAttaquant > 0 && totalDefenseur <= 0) {
      vainqueur = attaquant;
      cubesRestants = totalAttaquant;
    } else if (totalDefenseur > 0 && totalAttaquant <= 0) {
      vainqueur = defenseur;
      cubesRestants = totalDefenseur;
    }

    log.push('--- Résultat ---');
    log.push(vainqueur
      ? vainqueur.nom + ' remporte le Combat avec ' + cubesRestants + ' cube(s) de Puissance Navale restant(s).'
      : 'Aucun survivant : égalité.');

    return { vainqueur: vainqueur, cubesRestants: cubesRestants, log: log };
  }

  /**
   * Résout un Combat d'invasion à partir d'unités de Puissance Navale déjà
   * agrégées, contre un secteur cible (ligne secteursPartie PWA — voir
   * secteurService.js/db.js, champs camelCase). L'appelant reste
   * responsable de la validation d'adjacence/appartenance/stock avant
   * d'arriver ici, et de l'application manuelle des conséquences sur le
   * plateau des secteurs (hors périmètre, voir en-tête de fichier).
   * Retourne { vainqueur, cubesRestants, log, survivantsAttaquant }.
   */
  function resoudreInvasion(partie, unitesAttaquant, secteurCible) {
    unitesAttaquant = unitesAttaquant || {};
    secteurCible = secteurCible || {};

    var attaquant = construireCamp(
      partie.joueur.nom,
      unitesAttaquant.corvette || 0,
      unitesAttaquant.destroyer || 0,
      unitesAttaquant.cuirasse || 0,
      unitesAttaquant.sentinelle || 0,
      unitesAttaquant.portevaisseau || 0,
      0,
      true, partie
    );

    var defenseSecteur = (secteurCible.installationDefenseSecteur || 0) + (secteurCible.installationBaseStellaire || 0);
    var defenseur = construireCamp(
      'Le Néant',
      secteurCible.pnNeant || 0, 0, 0, 0, 0,
      defenseSecteur,
      false, partie
    );

    var resultat = resoudreCombat(attaquant, defenseur);

    // `attaquant` a été muté en place pendant le combat — ses champs par
    // type sont déjà les survivants exacts.
    resultat.survivantsAttaquant = {
      corvette: attaquant.corvette,
      destroyer: attaquant.destroyer,
      cuirasse: attaquant.cuirasse,
      sentinelle: attaquant.sentinelle,
      portevaisseau: attaquant.portevaisseau
    };

    return resultat;
  }

  return {
    vaisseauxDebloques: vaisseauxDebloques,
    construireCamp: construireCamp,
    resoudreCombat: resoudreCombat,
    resoudreInvasion: resoudreInvasion
  };
})();
