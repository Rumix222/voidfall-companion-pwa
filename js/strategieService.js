/**
 * strategieService.js
 * Écran Stratégie — Voidfall Companion PWA
 * Version 6 — 17/08/2026 (Session 14 suite — action secteur "Déployer des
 * cubes" portée)
 *
 * 17/08/2026 (Session 14 suite) : nouveau cas contexte.type ===
 * 'deployer_cube' dans demanderChoix — portage direct de
 * ouvrirModaleDeployerGenerique_ (strategie-2.html GAS, ~l.1354-1587),
 * 3 modes ('par_chantier'/'libre'/'secteur_mere'), types de Flotte limités
 * aux Technologies débloquées (typesVaisseauDeployables_/TECH_VAISSEAU,
 * portés tels quels) et coût en ressources par type
 * (COUT_DEPLOIEMENT_PAR_TYPE — Cuirassé/Matériel, Porte-Vaisseau/
 * Nourriture, portés tels quels). Différence assumée avec le legacy :
 * cette popup ne fait QUE le placement sur les secteurs
 * (SecteurService.deployerCube, un appel par ligne) — elle ne touche PAS
 * cubeActif/ressources de plateauMaison (c'est focusEngine.js qui s'en
 * charge après coup, sur l'état pur, voir son en-tête v3). Le legacy
 * écrivait plateau_maison directement depuis la popup (Api.majPlateauMaison),
 * hors du flux normal d'annulation — corrigé ici.
 *
 * 17/08/2026 (Session 14 — action secteur "Regrouper" portée) : nouveau
 * cas contexte.type === 'regrouper' dans demanderChoix — portage direct de
 * ouvrirModaleRegrouper_ (strategie-2.html
 * GAS, ~l.901-1059) : liste dynamique de mouvements de Puissance Navale
 * entre secteurs ADJACENTS qui appartiennent tous deux au joueur, 5
 * déplacements max au total, validation en direct des quantités
 * disponibles (mêmes règles que côté serveur, revérifiées par
 * SecteurService.regrouper). Appelé depuis focusEngine.js quand une carte
 * Focus a un effet/coût "regrouper"/"regroupe" (voir focusEngine.js v2).
 * Différence avec le legacy : Api.getSecteurs/Api.getScenarioAdjacences/
 * Api.secteurRegrouper (google.script.run) remplacés par
 * SecteurService.obtenirSecteurs/obtenirAdjacences/regrouper (appel
 * direct, IndexedDB) ; champs snake_case (pn_corvette, numero_a/numero_b)
 * remplacés par les champs camelCase du store secteursPartie (pnCorvette,
 * numeroA/numeroB). SecteurService.regrouper est appelé ICI (DOM), pas
 * dans focusEngine.js, qui reste pur — voir son en-tête.
 *
 * 17/08/2026 (Session 13) : Focus héroïques sélectionnables (select par
 * emplacement, portage direct de renderFocusHeroiquesCycleActuel,
 * app-2.html GAS) — GameService.choisirFocusHeroique porté (v7, SQL de la
 * RPC fourni par l'utilisateur). Remplace l'affichage seul des sessions
 * précédentes.
 *
 * 17/08/2026 (Session 10 — restauration IHM Stratégie/Partie)
 *
 * 17/08/2026 (Session 10) : restauration de blocs d'affichage présents
 * dans strategie.html (GAS) mais perdus lors du portage initial de cet
 * écran (Session 4) :
 * - Influence retirée de renderRessources_ (déménagée sur l'écran Partie,
 *   voir index.html App.renderEcranGame_ — comportement legacy).
 * - Ligne jetons restaurée à l'identique : Commerce (longueur de
 *   plateau_maison.jeton_commerce) + Prime + Libération. Cube actif en
 *   sort (rejoint la nouvelle ligne Cubes).
 * - Nouvelle ligne Cube inactif/actif/déployé (renderCubes_, #ressources-
 *   cubes) — Cube déployé recalculé depuis la Puissance Navale de tous
 *   les secteurs (SecteurService.obtenirSecteurs), portage direct de
 *   recalculerNiveauxProduction_ (partie Cube déployé uniquement).
 * - Nouveau bloc Gloire interactif (renderGloire_/renderGloireDOM_,
 *   #ressources-gloire) — 5 emplacements cliquables (vide -> 1 -> ... ->
 *   5 -> vide), persistés via GameService.majPlateauMaison.
 * Décisions de périmètre validées par l'utilisateur en session (Influence
 * déménagée, Cube actif sorti des jetons) plutôt que devinées depuis les
 * deux fichiers de référence fournis (index-2.html / strategie-2.html).
 *
 * 17/08/2026 (Session 5) : Pistes de Civilisation devenues INTERACTIVES —
 * bouton "Avancer" par piste (résout aussi l'effet de la case atteinte),
 * case à cocher "Corrompue", boutons "Avancer la moins avancée"/"Avancer
 * la piste Corrompue", branchés sur js/civilisationService.js (nouveau ce
 * jour). Remplace l'affichage lecture seule de la session précédente.
 *
 * Rebranche l'écran Stratégie (ressources, cartes Focus, annulation,
 * Civilisation) sur js/focusEngine.js (moteur pur), js/annulationService.js
 * (pile LIFO) et js/civilisationService.js, portage/adaptation des parties
 * DOM de strategie.html (GAS) qui restent dans le périmètre de cette PWA
 * (voir focusEngine.js en-tête pour la liste des clés Coût/Effet
 * volontairement hors périmètre — non jouables automatiquement,
 * journalisées "à appliquer manuellement").
 *
 * PÉRIMÈTRE VOLONTAIREMENT RÉDUIT (cohérent avec l'état réel de
 * gameService.js/secteurService.js — rien à porter faute de RPC source
 * côté GAS) :
 *   - [Nettoyage Session 13] Focus héroïques : SÉLECTIONNABLES depuis
 *     cette session (choisirFocusHeroique porté, voir gameService.js v7 —
 *     SQL de la RPC fourni par l'utilisateur). Ce commentaire disait
 *     encore "affichage seul" : corrigé, voir renderFocusHeroiques_.
 *   - Scratchpad manuel (édition directe des ressources par l'utilisateur,
 *     indépendante des actions Focus, présent dans strategie.html GAS) :
 *     toujours pas porté — hors sujet des sessions Focus/Civilisation.
 *   - Les clés avancer_civilisation_* À L'INTÉRIEUR d'une carte Focus
 *     restent journalisées "non automatisé" par focusEngine.js (pas de
 *     pont Focus -> CivilisationService cette session, voir focusEngine.js
 *     en-tête) — seuls les boutons dédiés de cette page font avancer les
 *     pistes.
 *
 * demanderChoix(contexte) est l'implémentation DOM (modale #modal-choix)
 * du callback attendu par focusEngine.js — voir focusEngine.js pour le
 * contrat exact de chaque contexte.type. Réutilisée telle quelle par
 * CivilisationService.avancerPiste (résolution de l'effet de case).
 *
 * Dépend de : db.js, gameService.js, focusEngine.js, annulationService.js,
 * civilisationService.js (à charger avant ce fichier), et de l'objet
 * global App défini dans index.html (App.getPartieCourante/
 * App.rafraichirPartieCourante).
 */

var StrategieService = (function () {
  'use strict';

  var CHAMP_RESSOURCE = {
    nourriture: { champ: 'nourriture', label: 'Nourriture' },
    energie: { champ: 'energie', label: 'Énergie' },
    materiel: { champ: 'materiel', label: 'Matériel' },
    credit: { champ: 'credit', label: 'Crédit' },
    science: { champ: 'science', label: 'Science' }
  };
  var RESSOURCES_PRODUCTION = ['nourriture', 'energie', 'materiel', 'credit', 'science'];

  // Portage direct de TYPES_VAISSEAU (strategie-2.html GAS) — pour le
  // formulaire Regrouper. Les clés correspondent aux colonnes pn_* de
  // secteursPartie via SecteurService.CHAMP_PN_PAR_TYPE (pnCorvette,
  // pnSentinelle, pnDestroyer, pnCuirasse, pnPorteVaisseau).
  var TYPES_VAISSEAU = [
    { cle: 'corvette', label: 'Corvette' },
    { cle: 'sentinelle', label: 'Sentinelle' },
    { cle: 'destroyer', label: 'Destroyer' },
    { cle: 'cuirasse', label: 'Cuirasse' },
    { cle: 'porte_vaisseau', label: 'Porte-Vaisseau' }
  ];
  var CHAMP_PN_PAR_TYPE_VUE = {
    corvette: 'pnCorvette', sentinelle: 'pnSentinelle', destroyer: 'pnDestroyer',
    cuirasse: 'pnCuirasse', porte_vaisseau: 'pnPorteVaisseau'
  };

  // --- Portage direct depuis strategie-2.html GAS, pour le formulaire
  // "Déployer des cubes" (Session 14 suite) ---
  var TECH_VAISSEAU = { sentinelle: 'sentinelles', destroyer: 'destroyers', cuirasse: 'cuirassés', porte_vaisseau: 'porte-vaisseaux' };
  var COUT_DEPLOIEMENT_PAR_TYPE = {
    cuirasse: { ressource: 'materiel', parCube: 1, label: 'Matériel' },
    porte_vaisseau: { ressource: 'nourriture', parCube: 1, label: 'Nourriture' }
  };

  function nomsTechnologiesJoueur_(partie) {
    var noms = [];
    if (partie.joueur && partie.joueur.technologieDepart) noms.push(partie.joueur.technologieDepart.nom);
    (partie.technologiesObtenues || []).forEach(function (t) { if (t) noms.push(t.nom); });
    return noms.map(function (n) { return (n || '').trim().toLowerCase(); });
  }

  // Corvette toujours disponible, les autres types nécessitent la
  // Technologie de même nom (voir TECH_VAISSEAU).
  function typesVaisseauDeployables_(partie) {
    var noms = nomsTechnologiesJoueur_(partie);
    return TYPES_VAISSEAU.filter(function (t) {
      if (t.cle === 'corvette') return true;
      var techNom = TECH_VAISSEAU[t.cle];
      return techNom && noms.indexOf(techNom) !== -1;
    });
  }

  var LABEL_PISTE = { societe: 'Société', gouvernement: 'Gouvernement', economie: 'Économie' };
  var PISTES_ORDRE = ['societe', 'gouvernement', 'economie'];
  // Cache du détail des 7 cases par maison (référence statique, une seule
  // lecture catalogue par maison — voir CivilisationService.obtenirDetailPistes).
  var detailPistesCache = {};

  // Portage direct de LIBELLES_OPTIONS (strategie.html GAS) — clés brutes
  // -> texte lisible pour les popups de choix. Repli sur la clé brute si
  // absente d'ici (vocabulaire déjà en français, reste lisible).
  var LIBELLES_OPTIONS = {
    envahir: 'Envahir un secteur',
    envahir_corrompu: 'Envahir un secteur Corrompu',
    regrouper: 'Regrouper',
    regroupe: 'Regrouper',
    installation: 'Construire une Installation',
    construire_installation: 'Construire une Installation',
    guilde: 'Établir une Guilde',
    etablir_guilde: 'Établir une Guilde',
    retirer_corruption: 'Retirer une Corruption',
    activer_cube: 'Activer 1 cube',
    deployer_cube: 'Déployer 1 cube',
    deploy_cube: 'Déployer 1 cube',
    deployer_cube_par_chantier: 'Déployer 1 cube par Chantier Naval',
    deployer_cube_secteur_mere: 'Déployer 1 cube dans le Secteur-Mère',
    gagner_programme: 'Gagner un Programme',
    gagner_commerce: 'Gagner un jeton Commerce',
    gagner_prime: 'Gagner un jeton Prime',
    produire_ressource: 'Produire un type de ressource',
    produire_deux_ressources: 'Produire deux types de ressources différentes',
    avancer_civilisation: 'Avancer sur une piste de Civilisation au choix',
    avancer_civilisation_societe: 'Avancer sur la piste Société',
    avancer_civilisation_gouvernement: 'Avancer sur la piste Gouvernement',
    avancer_civilisation_economie: 'Avancer sur la piste Économie',
    avancer_civilisation_moins_avancee: 'Avancer sur votre piste la moins avancée',
    avance_rapide: 'Avancer librement sur une piste de Civilisation',
    nourriture: 'Nourriture', energie: 'Énergie', materiel: 'Matériel',
    credit: 'Crédit', science: 'Science', influence: 'Influence'
  };

  var partieAffichee = null;
  var journal = [];

  // 16/08/2026 (portage legacy strategie.html) : total fixe de cubes de
  // Puissance Navale (inactif + actif + déployé), identique pour toutes
  // les maisons — voir strategie.html GAS, NB_CUBES_TOTAL.
  var NB_CUBES_TOTAL = 14;
  // État local des 5 emplacements Gloire (null = vide, 1-5 = valeur du
  // jeton) — reconstruit depuis partie.plateauMaison.gloire à chaque
  // afficher(), comme les autres blocs de cet écran.
  var etatGloire = [null, null, null, null, null];

  // ------------------------------------------------------------
  // Rendu ressources
  // ------------------------------------------------------------

  /**
   * 17/08/2026 (Session 10 — restauration IHM) : Influence n'est plus
   * affichée ici (déménagée sur l'écran Partie, voir index.html
   * App.renderEcranGame_ — comportement legacy app.html/strategie.html).
   * Ligne jetons restaurée à l'identique du legacy : Commerce (compteur =
   * longueur du tableau plateau_maison.jeton_commerce) + Prime +
   * Libération — Cube actif quitte cette ligne pour la nouvelle ligne
   * Cubes (voir renderCubes_).
   */
  function renderRessources_(partie) {
    var pm = partie.plateauMaison || {};
    var ressources = pm.ressources || {};

    var principales = document.getElementById('ressources-principales');
    principales.innerHTML = RESSOURCES_PRODUCTION.map(function (cle) {
      return '<div class="ressource-case"><div class="ressource-case-label">' + CHAMP_RESSOURCE[cle].label + '</div>' +
        '<div class="ressource-case-valeur">' + (ressources[cle] || 0) + '</div></div>';
    }).join('');

    var nbCommerce = Array.isArray(pm.jetonCommerce) ? pm.jetonCommerce.length : 0;
    var jetons = document.getElementById('ressources-jetons');
    jetons.innerHTML =
      '<div class="ressource-case"><div class="ressource-case-label">Commerce</div><div class="ressource-case-valeur">' + nbCommerce + '</div></div>' +
      '<div class="ressource-case"><div class="ressource-case-label">Prime</div><div class="ressource-case-valeur">' + (pm.jetonPrime || 0) + '</div></div>' +
      '<div class="ressource-case"><div class="ressource-case-label">Libération</div><div class="ressource-case-valeur">' + (pm.jetonLiberation || 0) + '</div></div>';
  }

  /**
   * 17/08/2026 (Session 10 — restauration IHM) : ligne Cube inactif/actif/
   * déployé — portage direct de recalculerNiveauxProduction_ (strategie.html
   * GAS, partie Cube déployé uniquement ; les niveaux de production
   * Nourriture/Énergie/etc. par Guilde restent hors périmètre de cette
   * restauration, non recalculés automatiquement côté PWA). Cube déployé =
   * somme de la Puissance Navale (pn_corvette/sentinelle/destroyer/
   * cuirasse/porte_vaisseau) sur tous les secteurs de la partie ; Cube
   * inactif = total fixe - actif - déployé. Asynchrone (lecture des
   * secteurs) : rendu séparé de renderRessources_, appelé depuis afficher()
   * sans bloquer le reste de l'écran ; silencieux en cas d'échec (garde le
   * dernier rendu plutôt que de bloquer l'écran, même logique que le
   * legacy).
   */
  function renderCubes_(partie) {
    var pm = partie.plateauMaison || {};
    var cubeActif = pm.cubeActif || 0;
    var container = document.getElementById('ressources-cubes');

    SecteurService.obtenirSecteurs(partie.id).then(function (secteurs) {
      var totalDeploye = (secteurs || []).reduce(function (somme, s) {
        return somme + (Number(s.pnCorvette) || 0) + (Number(s.pnSentinelle) || 0) +
          (Number(s.pnDestroyer) || 0) + (Number(s.pnCuirasse) || 0) + (Number(s.pnPorteVaisseau) || 0);
      }, 0);
      var cubeInactif = Math.max(0, NB_CUBES_TOTAL - cubeActif - totalDeploye);

      container.innerHTML =
        '<div class="ressource-case"><div class="ressource-case-label">Cube inactif</div><div class="ressource-case-valeur">' + cubeInactif + '</div></div>' +
        '<div class="ressource-case"><div class="ressource-case-label">Cube actif</div><div class="ressource-case-valeur">' + cubeActif + '</div></div>' +
        '<div class="ressource-case"><div class="ressource-case-label">Cube déployé</div><div class="ressource-case-valeur">' + totalDeploye + '</div></div>';
    }).catch(function () {
      // Silencieux — garde le dernier rendu plutôt que de bloquer l'écran.
    });
  }

  /**
   * 17/08/2026 (Session 10 — restauration IHM) : Gloire — 5 emplacements,
   * chacun vide (null) ou valeur 1-5. Portage direct de renderGloire_
   * (strategie.html GAS) : un clic fait avancer l'emplacement (vide -> 1 ->
   * 2 -> ... -> 5 -> vide) et persiste immédiatement via
   * GameService.majPlateauMaison (lecture-fusion-écriture, ne touche que le
   * champ gloire).
   */
  function renderGloire_(partie) {
    var pm = partie.plateauMaison || {};
    etatGloire = (Array.isArray(pm.gloire) ? pm.gloire.slice(0, 5) : []);
    while (etatGloire.length < 5) etatGloire.push(null);
    renderGloireDOM_(partie);
  }

  // Ne relit jamais l'état depuis `partie` — s'appuie uniquement sur
  // etatGloire (état local déjà à jour), pour ne pas écraser un clic tout
  // juste appliqué par l'ancienne valeur non encore persistée.
  function renderGloireDOM_(partie) {
    var container = document.getElementById('ressources-gloire');
    var emplacements = etatGloire.map(function (valeur, i) {
      var actif = (valeur !== null && valeur !== undefined);
      return '<button type="button" class="gloire-jeton' + (actif ? ' actif' : '') +
        '" data-index="' + i + '" aria-label="Emplacement Gloire ' + (i + 1) + '">' +
        (actif ? valeur : '') + '</button>';
    }).join('');
    container.innerHTML = '<label>GLOIRE</label><div class="gloire-emplacements">' + emplacements + '</div>';

    Array.prototype.forEach.call(container.querySelectorAll('.gloire-jeton'), function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.dataset.index);
        var actuel = etatGloire[i];
        etatGloire[i] = (actuel === null || actuel === undefined) ? 1 : (actuel >= 5 ? null : actuel + 1);
        renderGloireDOM_(partie);
        GameService.majPlateauMaison(partie.id, { gloire: etatGloire }).catch(function (erreur) {
          window.alert('Échec de l\'enregistrement de la Gloire : ' + erreur.message);
        });
      });
    });
  }

  function renderJournal_() {
    var container = document.getElementById('ressources-journal');
    if (!journal.length) {
      container.innerHTML = '<p class="hint">Aucune action jouée pour l\'instant.</p>';
      return;
    }
    container.innerHTML = '<ul class="journal-liste">' +
      journal.slice().reverse().map(function (ligne) {
        var estAvertissement = ligne.indexOf('⚠️') !== -1 || ligne.indexOf('annulée') !== -1 || ligne.indexOf('↩️') !== -1;
        return '<li' + (estAvertissement ? ' class="journal-avertissement"' : '') + '>' + ligne + '</li>';
      }).join('') +
      '</ul>';
  }

  /**
   * 17/08/2026 (Session 5, Phase 5 — Civilisation) : chaque piste gagne un
   * bouton "Avancer" (résout aussi l'effet de la case atteinte, via
   * CivilisationService.avancerPiste) et une case "Corrompue" — remplace
   * l'affichage lecture-seule de la session précédente.
   */
  function renderPistesCivilisation_(partie) {
    var civ = partie.civilisation || { societe: 0, gouvernement: 0, economie: 0, corrompues: {} };
    var corrompues = civ.corrompues || {};
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    var container = document.getElementById('pistes-civilisation-liste');

    container.innerHTML = PISTES_ORDRE.map(function (piste) {
      var niveau = civ[piste] || 0;
      var auMax = niveau >= CivilisationService.NIVEAU_MAX;
      return '<div class="piste-civilisation-case">' +
        '<div class="piste-civilisation-nom">' + LABEL_PISTE[piste] + '</div>' +
        '<div class="piste-civilisation-niveau">' + niveau + ' / ' + CivilisationService.NIVEAU_MAX + '</div>' +
        '<p class="hint piste-civilisation-texte-prochaine" id="piste-texte-' + piste + '" style="margin:4px 0;"></p>' +
        '<button class="btn btn-secondary btn-avancer-piste" data-piste="' + piste + '"' + (auMax ? ' disabled' : '') + '>Avancer</button>' +
        '<label class="piste-civilisation-corrompue"><input type="checkbox" class="check-corrompue" data-piste="' + piste + '"' + (corrompues[piste] ? ' checked' : '') + '> Corrompue</label>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.btn-avancer-piste'), function (btn) {
      btn.addEventListener('click', function () { avancerPiste_(btn.dataset.piste, btn); });
    });
    Array.prototype.forEach.call(container.querySelectorAll('.check-corrompue'), function (cb) {
      cb.addEventListener('change', function () { toggleCorruption_(cb.dataset.piste, cb.checked, cb); });
    });

    document.getElementById('btn-avancer-corrompue').disabled = !PISTES_ORDRE.some(function (p) { return corrompues[p]; });

    if (nomMaison) {
      obtenirDetailPistesCache_(nomMaison).then(function (detail) {
        PISTES_ORDRE.forEach(function (piste) {
          var niveau = civ[piste] || 0;
          var el = document.getElementById('piste-texte-' + piste);
          if (!el) return; // l'écran a pu être re-rendu entre-temps
          if (niveau >= CivilisationService.NIVEAU_MAX) { el.textContent = 'Piste au maximum.'; return; }
          var prochaine = (detail[piste] || [])[niveau]; // case niveau+1, index 0-based
          el.textContent = prochaine ? ('Prochaine case : ' + prochaine.texte) : '';
        });
      }).catch(function (erreur) {
        console.warn('StrategieService : détail des pistes indisponible :', erreur);
      });
    }
  }

  function obtenirDetailPistesCache_(nomMaison) {
    if (detailPistesCache[nomMaison]) return Promise.resolve(detailPistesCache[nomMaison]);
    return CivilisationService.obtenirDetailPistes(nomMaison).then(function (detail) {
      detailPistesCache[nomMaison] = detail;
      return detail;
    });
  }

  function avancerPiste_(piste, btn) {
    if (btn.disabled) return;
    var partie = partieAffichee;
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    if (!nomMaison) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    CivilisationService.avancerPiste(partie.id, nomMaison, piste, demanderChoix)
      .then(function (resultat) {
        if (resultat.dejaMaximum) {
          journal.push('Piste ' + LABEL_PISTE[piste] + ' : déjà au maximum.');
        } else {
          journal.push('Piste ' + LABEL_PISTE[piste] + ' : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau +
            ' — ' + (resultat.texte || 'aucun effet de case.'));
          journal = journal.concat(resultat.effetJournal || []);
        }
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec de l\'avancement : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  function avancerMoinsAvancee_() {
    var btn = document.getElementById('btn-avancer-moins-avancee');
    if (btn.disabled) return;
    var partie = partieAffichee;
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    if (!nomMaison) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    CivilisationService.avancerPisteMoinsAvancee(partie.id, nomMaison, demanderChoix)
      .then(function (resultat) {
        journal.push('Piste la moins avancée (' + LABEL_PISTE[resultat.piste] + ') : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau +
          ' — ' + (resultat.texte || 'aucun effet de case.'));
        journal = journal.concat(resultat.effetJournal || []);
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec de l\'avancement : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  function avancerCorrompue_() {
    var btn = document.getElementById('btn-avancer-corrompue');
    if (btn.disabled) return;
    var partie = partieAffichee;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    CivilisationService.avancerPisteCorrompue(partie.id)
      .then(function (resultat) {
        journal.push('Piste Corrompue (' + LABEL_PISTE[resultat.piste] + ') : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau + ' (sans bénéfice de case).');
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  function toggleCorruption_(piste, valeur, cb) {
    cb.disabled = true;
    CivilisationService.definirCorruption(partieAffichee.id, piste, valeur)
      .then(function () { return App.rafraichirPartieCourante(); })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec : ' + erreur.message);
        cb.checked = !valeur;
        cb.disabled = false;
      });
  }

  // ------------------------------------------------------------
  // Rendu cartes Focus (joueur + héroïques)
  // ------------------------------------------------------------

  function badgeType_(type) {
    var classe = 'badge';
    if (type === 'Standard') classe += ' badge-type-standard';
    else if (type === 'Héroïque') classe += ' badge-type-heroique';
    else classe += ' badge-type-maison';
    return '<span class="' + classe + '">' + (type || '?') + '</span>';
  }

  function pastillesCoutHTML_(cout) {
    if (!cout || typeof cout !== 'object' || cout.brut) return '';
    var cles = Object.keys(cout);
    if (!cles.length) return '';
    return '<div class="focus-action-cout">' + cles.map(function (cle) {
      var valeur = cout[cle];
      var texte = (typeof valeur === 'number') ? valeur : (LIBELLES_OPTIONS[cle] || cle).slice(0, 12);
      return '<span class="pastille-cout" title="' + cle + (typeof valeur === 'number' ? ' : ' + valeur : '') + '">' + texte + '</span>';
    }).join('') + '</div>';
  }

  function coutSuffisant_(cout, ressources) {
    if (!cout || typeof cout !== 'object' || cout.brut) return true;
    var suffisant = true;
    Object.keys(cout).forEach(function (cle) {
      if (CHAMP_RESSOURCE[cle] && typeof cout[cle] === 'number' && (ressources[cle] || 0) < cout[cle]) {
        suffisant = false;
      }
    });
    return suffisant;
  }

  function carteFocusJoueurHTML_(carte, carteIndex) {
    var ressources = (partieAffichee.plateauMaison || {}).ressources || {};
    var actionsHtml = carte.actions.map(function (action, actionIndex) {
      var jouable = coutSuffisant_(action.cout, ressources);
      return '<div class="focus-action' + (jouable ? '' : ' focus-action-insuffisant') + '">' +
        '<div class="focus-action-titre">' + (action.action || 'Action') + '</div>' +
        (action.texte ? '<div class="focus-action-texte">' + action.texte + '</div>' : '') +
        pastillesCoutHTML_(action.cout) +
        '<button class="btn btn-primary btn-jouer-action" data-carte="' + carteIndex + '" data-action="' + actionIndex + '">Jouer cette action</button>' +
        '</div>';
    }).join('');

    return '<div class="card">' +
      badgeType_(carte.type) +
      '<div style="font-weight:600;margin-bottom:4px;">' + carte.focus + '</div>' +
      actionsHtml +
      '</div>';
  }

  function renderFocusJoueur_(partie) {
    var container = document.getElementById('strategie-focus-joueur');
    var cartes = partie.focusJoueur || [];

    if (!cartes.length) {
      container.innerHTML = '<p class="hint">Aucun Focus configuré pour cette partie (créée avant cette fonctionnalité, ou mise en place Focus indisponible à la création).</p>';
      return;
    }

    container.innerHTML = cartes.map(function (c, i) { return carteFocusJoueurHTML_(c, i); }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.btn-jouer-action'), function (btn) {
      btn.addEventListener('click', function () {
        jouerAction_(Number(btn.dataset.carte), Number(btn.dataset.action), btn);
      });
    });
  }

  /**
   * 17/08/2026 (Session 13 — moteur secteurs/cycle branché sur l'IHM) :
   * chaque emplacement gagne un select (portage direct de
   * renderFocusHeroiquesCycleActuel, app-2.html GAS) — remplace
   * l'affichage seul des sessions précédentes (choisirFocusHeroique était
   * hors périmètre jusqu'ici, voir gameService.js). Un Focus héroïque
   * déjà choisi ailleurs (partie.focusHeroiquesPioches) n'apparaît plus
   * dans les options des AUTRES emplacements, sauf celui qui le porte
   * déjà (peut toujours être remis à "— Choisir —" pour le libérer).
   */
  function renderFocusHeroiques_(partie) {
    var container = document.getElementById('strategie-focus-heroiques');
    var cycle = partie.cycleActuel;
    if (!cycle || cycle === 'termine') {
      container.innerHTML = '<p class="hint">Partie terminée.</p>';
      return;
    }
    var cle = 'cycle' + cycle;
    var cartes = (partie.focusHeroiques && partie.focusHeroiques[cle]) || [null, null, null];
    var pioches = partie.focusHeroiquesPioches || [];

    FocusService.obtenirNomsPoolHeroique().then(function (noms) {
      container.innerHTML = [0, 1, 2].map(function (slot) {
        var carte = cartes[slot];
        var valeurActuelle = carte ? carte.focus : '';
        var exclus = pioches.filter(function (nom) { return nom !== valeurActuelle; });
        var optionsDisponibles = noms.filter(function (nom) { return exclus.indexOf(nom) === -1; });
        var options = '<option value="">— Choisir —</option>' + optionsDisponibles.map(function (nom) {
          return '<option value="' + nom + '"' + (nom === valeurActuelle ? ' selected' : '') + '>' + nom + '</option>';
        }).join('');

        var detail = carte
          ? badgeType_(carte.type) + '<div style="font-weight:600;margin-top:6px;">' + carte.focus + '</div>' +
            (carte.actions || []).map(function (a) {
              return '<div class="hint" style="margin:4px 0 0;">' + (a.action || '—') + (a.texte ? ' — ' + a.texte : '') + '</div>';
            }).join('')
          : '<p class="hint" style="margin:6px 0 0;">Emplacement ' + (slot + 1) + ' : non choisi.</p>';

        return '<div class="card">' +
          '<select class="select-focus-heroique" data-slot="' + slot + '">' + options + '</select>' +
          detail +
          '</div>';
      }).join('');

      Array.prototype.forEach.call(container.querySelectorAll('.select-focus-heroique'), function (select) {
        select.addEventListener('change', function () {
          var slot = Number(select.dataset.slot);
          select.disabled = true;
          GameService.choisirFocusHeroique(partie.id, cycle, slot, select.value)
            .then(function () {
              return App.rafraichirPartieCourante();
            })
            .then(function (partieFraiche) {
              afficher(partieFraiche);
            })
            .catch(function (erreur) {
              select.disabled = false;
              window.alert('Échec du choix du Focus héroïque : ' + erreur.message);
            });
        });
      });
    }).catch(function () {
      container.innerHTML = '<p class="hint">Erreur de chargement du pool de Focus héroïques.</p>';
    });
  }

  // ------------------------------------------------------------
  // Jouer une action Focus
  // ------------------------------------------------------------

  function jouerAction_(carteIndex, actionIndex, btn) {
    if (btn.disabled) return; // sécurité anti double-clic
    var partie = partieAffichee;
    var carte = (partie.focusJoueur || [])[carteIndex];
    var action = carte ? carte.actions[actionIndex] : null;
    if (!carte || !action) return;

    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    FocusEngine.jouerActionEtPersister(partie.id, carte, action, demanderChoix)
      .then(function (resultat) {
        journal = journal.concat(resultat.journal);
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) {
        afficher(partieFraiche);
      })
      .catch(function (erreur) {
        window.alert('Échec de l\'action : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  // ------------------------------------------------------------
  // Annulation
  // ------------------------------------------------------------

  function majBoutonAnnuler_(partieId) {
    var btn = document.getElementById('btn-annuler-action');
    var compteur = document.getElementById('annulation-compteur');
    AnnulationService.compter(partieId).then(function (nb) {
      btn.disabled = (nb === 0);
      compteur.textContent = nb ? nb + ' action(s) annulable(s)' : '';
    });
  }

  function annulerDerniereAction_() {
    var partie = partieAffichee;
    if (!partie) return;
    var btn = document.getElementById('btn-annuler-action');
    if (btn.disabled) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    AnnulationService.annulerDerniere(partie.id)
      .then(function (resultat) {
        journal.push(resultat.succes ? ('↩️ Action annulée : ' + resultat.source + '.') : 'Aucune action à annuler.');
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) {
        afficher(partieFraiche);
      })
      .catch(function (erreur) {
        window.alert('Échec de l\'annulation : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  // ------------------------------------------------------------
  // Modale de choix générique (demanderChoix)
  // ------------------------------------------------------------

  function libelleOption_(opt) {
    if (typeof opt === 'string') return LIBELLES_OPTIONS[opt] || opt;
    return Object.keys(opt).map(function (k) {
      var v = opt[k];
      return (LIBELLES_OPTIONS[k] || k) + (typeof v === 'number' ? ' (' + v + ')' : '');
    }).join(' + ');
  }

  function fermerModale_() {
    document.getElementById('modal-choix').hidden = true;
  }

  function demanderChoix(contexte) {
    var modal = document.getElementById('modal-choix');
    var titre = document.getElementById('modal-choix-titre');
    var contenu = document.getElementById('modal-choix-contenu');
    var btnValider = document.getElementById('modal-choix-valider');
    var btnAnnuler = document.getElementById('modal-choix-annuler');

    return new Promise(function (resolve) {

      if (contexte.type === 'option_exclusive') {
        titre.textContent = 'Choisissez une option';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        contenu.innerHTML = '<div class="modal-choix-boutons">' +
          contexte.options.map(function (opt, i) {
            return '<button class="btn btn-secondary btn-choix-liste" data-index="' + i + '">' + libelleOption_(opt) + '</button>';
          }).join('') + '</div>';
        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
          btn.addEventListener('click', function () {
            fermerModale_();
            resolve({ indexChoisi: Number(btn.dataset.index) });
          });
        });
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

      } else if (contexte.type === 'options_inclusives') {
        titre.textContent = 'Choisissez une ou plusieurs options (et/ou)';
        btnAnnuler.hidden = true;
        btnValider.hidden = false;
        btnValider.textContent = 'Valider';
        contenu.innerHTML = '<div class="modal-choix-cases">' +
          contexte.options.map(function (opt, i) {
            return '<label class="modal-choix-case"><input type="checkbox" data-index="' + i + '"> ' + libelleOption_(opt) + '</label>';
          }).join('') + '</div>';
        btnValider.onclick = function () {
          var indices = Array.prototype.filter.call(contenu.querySelectorAll('input[type="checkbox"]'), function (cb) { return cb.checked; })
            .map(function (cb) { return Number(cb.dataset.index); });
          fermerModale_();
          resolve(indices);
        };

      } else if (contexte.type === 'ressource_choix') {
        var restant = contexte.nombre;
        var choisies = [];
        titre.textContent = (contexte.signe > 0 ? 'Choisissez ' : 'Dépensez ') + contexte.nombre + ' ressource(s) au choix';
        btnAnnuler.hidden = true;
        btnValider.hidden = false;
        btnValider.textContent = 'Valider (arrêter ici)';
        btnValider.onclick = function () { fermerModale_(); resolve(choisies); };

        function render() {
          contenu.innerHTML = '<p class="hint">Il reste ' + restant + ' à choisir (ou "Valider" pour arrêter avant).</p>' +
            '<div class="modal-choix-boutons">' + RESSOURCES_PRODUCTION.map(function (cle) {
              return '<button class="btn btn-secondary btn-choix-ressource" data-ressource="' + cle + '">' + CHAMP_RESSOURCE[cle].label + '</button>';
            }).join('') + '</div>';
          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-ressource'), function (btn) {
            btn.addEventListener('click', function () {
              choisies.push(btn.dataset.ressource);
              restant--;
              if (restant <= 0) { fermerModale_(); resolve(choisies); } else { render(); }
            });
          });
        }
        render();

      } else if (contexte.type === 'bonus_commerce') {
        titre.textContent = 'Bonus Commerce — choisissez un bonus';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        contenu.innerHTML = '<div class="modal-choix-boutons">' +
          contexte.options.map(function (label, i) {
            return '<button class="btn btn-secondary btn-choix-liste" data-index="' + i + '">' + label + '</button>';
          }).join('') + '</div>';
        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
          btn.addEventListener('click', function () {
            fermerModale_();
            resolve({ indexChoisi: Number(btn.dataset.index) });
          });
        });
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

      } else if (contexte.type === 'regrouper') {
        titre.textContent = 'Regrouper';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partie = partieAffichee;
        Promise.all([
          SecteurService.obtenirSecteurs(partie.id),
          SecteurService.obtenirAdjacences(partie.scenarioId)
        ]).then(function (resultats) {
          var secteurs = resultats[0] || [];
          var adjacences = resultats[1] || [];

          var adjacenceMap = {};
          adjacences.forEach(function (a) {
            adjacenceMap[a.numeroA] = adjacenceMap[a.numeroA] || [];
            adjacenceMap[a.numeroA].push(a.numeroB);
            adjacenceMap[a.numeroB] = adjacenceMap[a.numeroB] || [];
            adjacenceMap[a.numeroB].push(a.numeroA);
          });

          var mouvements = []; // état local à cette ouverture de popup

          function secteurParNumero_(numero) {
            return secteurs.filter(function (s) { return s.numero === numero; })[0];
          }

          function stockRestant_(numero, type) {
            var secteur = secteurParNumero_(numero);
            var champ = CHAMP_PN_PAR_TYPE_VUE[type];
            var stockInitial = secteur ? (secteur[champ] || 0) : 0;
            var dejaPris = mouvements
              .filter(function (m) { return m.depart === numero && m.type === type; })
              .reduce(function (somme, m) { return somme + m.quantite; }, 0);
            return stockInitial - dejaPris;
          }

          // Même critère "vous appartient" que Construire/Rappeler un cube :
          // pas de Néant sur le secteur, au moins une unité de Puissance
          // Navale à vous déjà présente.
          function vousAppartient_(numero) {
            var secteur = secteurParNumero_(numero);
            if (!secteur || (secteur.pnNeant || 0) > 0) return false;
            return ((secteur.pnCorvette || 0) + (secteur.pnSentinelle || 0) + (secteur.pnDestroyer || 0)
              + (secteur.pnCuirasse || 0) + (secteur.pnPorteVaisseau || 0)) > 0;
          }

          function render() {
            var total = mouvements.reduce(function (s, m) { return s + m.quantite; }, 0);

            var listeHTML = mouvements.length
              ? '<ul class="regrouper-liste">' + mouvements.map(function (m, i) {
                  var labelType = TYPES_VAISSEAU.filter(function (t) { return t.cle === m.type; })[0].label;
                  return '<li>' + m.quantite + '× ' + labelType + ' : Secteur ' + m.depart + ' → Secteur ' + m.arrivee +
                    ' <button type="button" class="btn-lien regrouper-retirer" data-index="' + i + '">retirer</button></li>';
                }).join('') + '</ul>'
              : '<p class="hint">Aucun déplacement ajouté.</p>';

            contenu.innerHTML = '' +
              '<p class="hint">Déplacements utilisés : <strong>' + total + ' / 5</strong></p>' +
              listeHTML +
              '<div class="regrouper-form">' +
              '<label class="hint" for="regrouper-type">Type</label>' +
              '<select id="regrouper-type">' + TYPES_VAISSEAU.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') + '</select>' +
              '<label class="hint" for="regrouper-depart" style="margin-top:8px;display:block;">Départ</label>' +
              '<select id="regrouper-depart"></select>' +
              '<label class="hint" for="regrouper-arrivee" style="margin-top:8px;display:block;">Arrivée (secteur adjacent)</label>' +
              '<select id="regrouper-arrivee"></select>' +
              '<label class="hint" for="regrouper-quantite" style="margin-top:8px;display:block;">Quantité</label>' +
              '<input type="number" min="1" step="1" value="1" id="regrouper-quantite">' +
              '<button type="button" class="btn btn-secondary" id="regrouper-btn-ajouter" style="width:100%;margin-top:10px;">Ajouter ce déplacement</button>' +
              '</div>';

            Array.prototype.forEach.call(contenu.querySelectorAll('.regrouper-retirer'), function (btn) {
              btn.addEventListener('click', function () {
                mouvements.splice(Number(btn.dataset.index), 1);
                render();
              });
            });

            var selectType = document.getElementById('regrouper-type');
            var selectDepart = document.getElementById('regrouper-depart');
            var selectArrivee = document.getElementById('regrouper-arrivee');
            var champQuantite = document.getElementById('regrouper-quantite');
            var btnAjouter = document.getElementById('regrouper-btn-ajouter');

            function majDepart() {
              var type = selectType.value;
              var options = secteurs
                .filter(function (s) { return vousAppartient_(s.numero); })
                .map(function (s) { return { numero: s.numero, stock: stockRestant_(s.numero, type) }; })
                .filter(function (o) { return o.stock > 0; });
              selectDepart.innerHTML = options.length
                ? options.map(function (o) { return '<option value="' + o.numero + '">Secteur ' + o.numero + ' (' + o.stock + ' disponible(s))</option>'; }).join('')
                : '<option value="">Aucun secteur disponible</option>';
              majArrivee();
            }

            function majArrivee() {
              var depart = Number(selectDepart.value);
              var voisins = (adjacenceMap[depart] || []).filter(vousAppartient_);
              selectArrivee.innerHTML = voisins.length
                ? voisins.map(function (n) { return '<option value="' + n + '">Secteur ' + n + '</option>'; }).join('')
                : '<option value="">Aucun secteur adjacent vous appartenant</option>';
            }

            selectType.addEventListener('change', majDepart);
            selectDepart.addEventListener('change', majArrivee);
            majDepart();

            btnAjouter.addEventListener('click', function () {
              var type = selectType.value;
              var depart = Number(selectDepart.value);
              var arrivee = Number(selectArrivee.value);
              var quantite = Math.max(1, Math.floor(Number(champQuantite.value) || 1));

              if (!depart || !arrivee) { window.alert('Choisis un secteur de départ et d\'arrivée.'); return; }
              var dispo = stockRestant_(depart, type);
              if (quantite > dispo) { window.alert('Seulement ' + dispo + ' disponible(s) sur ce secteur pour ce type.'); return; }
              if (total + quantite > 5) { window.alert('Il ne reste que ' + (5 - total) + ' déplacement(s) sur les 5 autorisés.'); return; }

              mouvements.push({ type: type, depart: depart, arrivee: arrivee, quantite: quantite });
              render();
            });

            btnValider.hidden = mouvements.length === 0;
            btnValider.textContent = 'Valider (' + total + ' déplacement(s))';
            btnValider.onclick = function () {
              btnValider.disabled = true;
              btnValider.textContent = 'Passage en cours…';
              SecteurService.regrouper(partie.id, mouvements)
                .then(function () {
                  var detail = mouvements.map(function (m) {
                    var labelType = TYPES_VAISSEAU.filter(function (t) { return t.cle === m.type; })[0].label;
                    return m.quantite + '× ' + labelType + ' ' + m.depart + '→' + m.arrivee;
                  }).join(', ');
                  fermerModale_();
                  btnValider.disabled = false;
                  resolve({ deplacements: total, detail: detail, mouvements: mouvements });
                })
                .catch(function (erreur) {
                  btnValider.disabled = false;
                  btnValider.textContent = 'Valider (' + total + ' déplacement(s))';
                  window.alert('Échec du regroupement : ' + erreur.message);
                });
            };
          }

          render();
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du chargement des secteurs : ' + erreur.message);
        });

      } else if (contexte.type === 'deployer_cube') {
        titre.textContent = 'Déployer des cubes';
        contenu.innerHTML = '<p class="hint">Chargement…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieDeploiement = partieAffichee;
        var typesDeployables = typesVaisseauDeployables_(partieDeploiement);
        var etatRessourcesLocal = {
          cubeActif: contexte.cubeActif,
          materiel: contexte.ressourceMateriel,
          nourriture: contexte.ressourceNourriture
        };

        function vousAppartientDeploiement_(secteurs) {
          return function (numero) {
            var secteur = secteurs.filter(function (s) { return s.numero === numero; })[0];
            if (!secteur || (secteur.pnNeant || 0) > 0) return false;
            return ((secteur.pnCorvette || 0) + (secteur.pnSentinelle || 0) + (secteur.pnDestroyer || 0)
              + (secteur.pnCuirasse || 0) + (secteur.pnPorteVaisseau || 0)) > 0;
          };
        }

        function demarrerAvecCiblesDeploiement_(cibles, quantiteMaxGlobale) {
          var deploiements = []; // {numero, type, quantite}

          function totalEngage_() {
            return deploiements.reduce(function (s, d) { return s + d.quantite; }, 0);
          }

          function renderListe_() {
            var liste = document.getElementById('deployer-liste');
            liste.innerHTML = deploiements.length
              ? deploiements.map(function (d, i) {
                  var label = typesDeployables.filter(function (t) { return t.cle === d.type; })[0].label;
                  return '<li>' + d.quantite + '× ' + label + ' → Secteur ' + d.numero +
                    ' <button type="button" class="btn-lien deployer-retirer" data-index="' + i + '">retirer</button></li>';
                }).join('')
              : '<p class="hint">Aucun cube engagé.</p>';
            Array.prototype.forEach.call(liste.querySelectorAll('.deployer-retirer'), function (btn) {
              btn.addEventListener('click', function () {
                deploiements.splice(Number(btn.dataset.index), 1);
                renderListe_();
                majCompteurEtBouton_();
              });
            });
          }

          function majCompteurEtBouton_() {
            var engage = totalEngage_();
            var restant = quantiteMaxGlobale - engage;
            document.getElementById('deployer-compteur').textContent =
              engage + ' / ' + quantiteMaxGlobale + ' cube(s) engagé(s)' + (restant > 0 ? ' (' + restant + ' au choix, si Cube actif suffisant)' : '');
            btnValider.hidden = deploiements.length === 0;
            btnValider.textContent = 'Déployer (' + engage + ' cube(s))';
          }

          contenu.innerHTML =
            '<p class="hint" id="deployer-compteur"></p>' +
            '<ul class="regrouper-liste" id="deployer-liste"></ul>' +
            '<div class="regrouper-form">' +
            '<select id="deployer-select-type">' + typesDeployables.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') + '</select>' +
            (cibles.length > 1
              ? '<select id="deployer-select-secteur" style="margin-top:6px;">' +
                cibles.map(function (c) { return '<option value="' + c.numero + '">Secteur ' + c.numero + (c.maxCubes < Infinity ? ' (' + c.maxCubes + ' max)' : '') + '</option>'; }).join('') +
                '</select>'
              : '') +
            '<input type="number" min="1" step="1" value="1" id="deployer-quantite" style="margin-top:6px;">' +
            '<button type="button" class="btn btn-secondary" id="deployer-ajouter" style="width:100%;margin-top:8px;">Ajouter ce déploiement</button>' +
            '</div>';

          renderListe_();
          majCompteurEtBouton_();

          document.getElementById('deployer-ajouter').addEventListener('click', function () {
            var type = document.getElementById('deployer-select-type').value;
            var selectSecteur = document.getElementById('deployer-select-secteur');
            var numero = selectSecteur ? Number(selectSecteur.value) : cibles[0].numero;
            var quantite = Math.max(1, Math.floor(Number(document.getElementById('deployer-quantite').value) || 1));

            var restantGlobal = quantiteMaxGlobale - totalEngage_();
            if (quantite > restantGlobal) {
              window.alert('Cet effet permet de déployer au maximum ' + quantiteMaxGlobale + ' cube(s) au total (indépendamment de ton stock de Cube actif).' +
                (totalEngage_() > 0 ? ' Tu as déjà engagé ' + totalEngage_() + ' cube(s) — il en reste ' + restantGlobal + '.' : ''));
              return;
            }

            var cible = cibles.filter(function (c) { return c.numero === numero; })[0];
            if (cible && cible.maxCubes < Infinity) {
              var dejaSurCeSecteur = deploiements.filter(function (d) { return d.numero === numero; }).reduce(function (s, d) { return s + d.quantite; }, 0);
              if (dejaSurCeSecteur + quantite > cible.maxCubes) {
                window.alert('Ce secteur ne peut recevoir que ' + cible.maxCubes + ' cube(s) via cet effet.');
                return;
              }
            }

            var dejaEngageTotal = totalEngage_();
            if (dejaEngageTotal + quantite > etatRessourcesLocal.cubeActif) {
              window.alert('Pas assez de Cube actif : ' + etatRessourcesLocal.cubeActif + ' disponible(s), ' + dejaEngageTotal + ' déjà prévu(s).');
              return;
            }

            var cout = COUT_DEPLOIEMENT_PAR_TYPE[type];
            if (cout) {
              var dejaEngageCoutant = deploiements.filter(function (d) { return d.type === type; }).reduce(function (s, d) { return s + d.quantite; }, 0);
              var coutTotal = (dejaEngageCoutant + quantite) * cout.parCube;
              if (coutTotal > etatRessourcesLocal[cout.ressource]) {
                window.alert('Pas assez de ' + cout.label + ' (' + cout.parCube + ' par cube) : ' + etatRessourcesLocal[cout.ressource] + ' disponible(s).');
                return;
              }
            }

            deploiements.push({ numero: numero, type: type, quantite: quantite });
            renderListe_();
            majCompteurEtBouton_();
          });

          btnValider.onclick = function () {
            if (!deploiements.length) return;

            var coutParRessource = {};
            deploiements.forEach(function (d) {
              var cout = COUT_DEPLOIEMENT_PAR_TYPE[d.type];
              if (cout) coutParRessource[cout.ressource] = (coutParRessource[cout.ressource] || 0) + cout.parCube * d.quantite;
            });
            var ressourceInsuffisante = Object.keys(coutParRessource).some(function (r) { return coutParRessource[r] > etatRessourcesLocal[r]; });
            var totalCubes = totalEngage_();
            if (ressourceInsuffisante || totalCubes > etatRessourcesLocal.cubeActif) {
              window.alert('Ressources ou Cube actif insuffisant(s) pour ce déploiement.');
              return;
            }

            btnValider.disabled = true;
            btnValider.textContent = 'Passage en cours…';

            Promise.all(deploiements.map(function (d) {
              return SecteurService.deployerCube(partieDeploiement.id, d.numero, d.type, d.quantite);
            })).then(function () {
              var detail = deploiements.map(function (d) {
                var label = typesDeployables.filter(function (t) { return t.cle === d.type; })[0].label;
                return d.quantite + '× ' + label + ' → secteur ' + d.numero;
              }).join(', ');
              fermerModale_();
              btnValider.disabled = false;
              // Ne persiste PAS cubeActif/ressources ici : focusEngine.js
              // s'en charge (état pur, diffable/annulable) — voir son
              // en-tête. Cette popup ne fait que le placement secteur.
              resolve({ totalCubes: totalCubes, coutParRessource: coutParRessource, detail: detail, mouvements: deploiements });
            }).catch(function (erreur) {
              btnValider.disabled = false;
              btnValider.textContent = 'Déployer (' + totalCubes + ' cube(s))';
              window.alert('Échec du déploiement : ' + erreur.message);
            });
          };
        }

        if (contexte.mode === 'par_chantier') {
          SecteurService.obtenirSecteurs(partieDeploiement.id).then(function (secteurs) {
            var vousAppartient = vousAppartientDeploiement_(secteurs);
            var cibles = secteurs
              .filter(function (s) { return vousAppartient(s.numero) && (s.installationChantierNaval || 0) > 0; })
              .map(function (s) { return { numero: s.numero, maxCubes: (s.installationChantierNaval || 0) * contexte.quantiteDemandee }; });

            if (!cibles.length) {
              contenu.innerHTML = '<p class="hint">Aucun Chantier Naval en votre possession.</p>';
              return;
            }
            var quantiteMaxGlobale = cibles.reduce(function (s, c) { return s + c.maxCubes; }, 0);
            demarrerAvecCiblesDeploiement_(cibles, quantiteMaxGlobale);
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

        } else if (contexte.mode === 'secteur_mere') {
          SecteurService.obtenirSecteurMere(partieDeploiement.scenarioId).then(function (numeroMere) {
            if (!numeroMere) {
              contenu.innerHTML = '<p class="hint">Secteur-Mère introuvable.</p>';
              return;
            }
            demarrerAvecCiblesDeploiement_([{ numero: numeroMere, maxCubes: Infinity }], contexte.quantiteDemandee);
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement du Secteur-Mère : ' + erreur.message);
          });

        } else { // 'libre'
          SecteurService.obtenirSecteurs(partieDeploiement.id).then(function (secteurs) {
            var vousAppartient = vousAppartientDeploiement_(secteurs);
            var cibles = secteurs
              .filter(function (s) { return vousAppartient(s.numero); })
              .map(function (s) { return { numero: s.numero, maxCubes: Infinity }; });

            if (!cibles.length) {
              contenu.innerHTML = '<p class="hint">Aucun secteur vous appartenant.</p>';
              return;
            }
            demarrerAvecCiblesDeploiement_(cibles, contexte.quantiteDemandee);
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });
        }

      } else {
        // Type de contexte inconnu — ne devrait pas arriver (tous les
        // types possibles sont produits par focusEngine.js ci-dessus).
        // Résolution non bloquante par défaut plutôt que de bloquer l'UI.
        console.warn('StrategieService.demanderChoix : type de contexte inconnu :', contexte.type);
        resolve({ annule: true });
        return;
      }

      modal.hidden = false;
    });
  }

  // ------------------------------------------------------------
  // API publique
  // ------------------------------------------------------------

  function afficher(partie) {
    if (!partieAffichee || partieAffichee.id !== partie.id) journal = [];
    partieAffichee = partie;
    renderRessources_(partie);
    renderCubes_(partie);
    renderGloire_(partie);
    renderPistesCivilisation_(partie);
    renderFocusJoueur_(partie);
    renderFocusHeroiques_(partie);
    renderJournal_();
    majBoutonAnnuler_(partie.id);
  }

  document.getElementById('btn-annuler-action').addEventListener('click', annulerDerniereAction_);
  document.getElementById('btn-avancer-moins-avancee').addEventListener('click', avancerMoinsAvancee_);
  document.getElementById('btn-avancer-corrompue').addEventListener('click', avancerCorrompue_);

  return {
    afficher: afficher,
    demanderChoix: demanderChoix
  };
})();
