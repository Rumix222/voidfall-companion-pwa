/**
 * strategieService.js
 * Écrans Focus, Plat. Galactique et Plat. maison — Voidfall Companion PWA
 *
 * demanderChoix(contexte) est l'implémentation DOM (modale #modal-choix)
 * du callback attendu par focusEngine.js — voir focusEngine.js pour le
 * contrat exact de chaque contexte.type. Réutilisée telle quelle par
 * CivilisationService.avancerPiste (résolution de l'effet de case).
 *
 * Limites connues (hors périmètre volontaire, non automatisé) :
 * - Scratchpad manuel (édition directe des ressources indépendante des
 *   actions Focus) : non implémenté.
 * - Les clés avancer_civilisation_* à l'intérieur d'une carte Focus
 *   restent journalisées "non automatisé" par focusEngine.js — seul le
 *   contexte dédié 'avancer_civilisation' fait avancer les pistes
 *   automatiquement.
 * - Gain d'Influence : "influence_par_cube_neant"/"influence_population_
 *   secteur" (liées à l'issue d'une invasion) et
 *   "evaluer_influence_programme_pur" (texte libre non structuré,
 *   programmes.json) restent résolues manuellement, hors du contexte
 *   'influence_secteur'.
 * - Gain de Corruption redirigé vers la Technologie Chambre de
 *   décontamination (au lieu d'un secteur/piste/Programme) : le jeton
 *   correspondant reste incrémenté à la main — seul le RETRAIT est
 *   automatisé (contextes 'retirer_corruption'/'gagner_corruption').
 * - Invasion ('envahir') : défausse d'un jeton Gloire pour un secteur
 *   source abandonné (repris par le Néant) et résolution immédiate des
 *   jetons Prime/Libération gagnés restent manuelles — ils restent de
 *   simples compteurs (CLES_SIMPLES), pas de popup de dépense dédiée.
 *
 * Dépend de : db.js, gameService.js, focusEngine.js, annulationService.js,
 * civilisationService.js (à charger avant ce fichier), et de l'objet
 * global App défini dans index.html (App.getPartieCourante/
 * App.rafraichirPartieCourante).
 */

var StrategieService = (function () {
  'use strict';

  // Couleurs alignées sur l'identité visuelle du plateau physique.
  var CHAMP_RESSOURCE = {
    nourriture: { label: 'Nourriture', couleur: '#49b867' },
    energie: { label: 'Énergie', couleur: '#f8a21b' },
    materiel: { label: 'Matériel', couleur: '#ec0d69' },
    credit: { label: 'Crédit', couleur: '#d1a671' },
    science: { label: 'Science', couleur: '#06afe5' }
  };
  var RESSOURCES_PRODUCTION = ['nourriture', 'energie', 'materiel', 'credit', 'science'];

  // Palette complète — couvre aussi Influence/Commerce/Prime/Libération/
  // Cubes, absents de CHAMP_RESSOURCE (limité aux 5 ressources de la
  // grille "principales"). Utilisée uniquement par couleurCout_/
  // abregeCout_ (pastilles de coût des cartes Focus) — ne pas fusionner
  // avec CHAMP_RESSOURCE, portées différentes.
  var RESSOURCES_TOUTES = {
    nourriture: { label: 'Nourriture', couleur: '#49b867' },
    energie: { label: 'Énergie', couleur: '#f8a21b' },
    materiel: { label: 'Matériel', couleur: '#ec0d69' },
    credit: { label: 'Crédit', couleur: '#d1a671' },
    science: { label: 'Science', couleur: '#06afe5' },
    influence: { label: 'Influence', couleur: '#c0257a' },
    commerce: { label: 'Commerce', couleur: '#e0b34d' },
    prime: { label: 'Prime', couleur: '#e0b34d' },
    liberation: { label: 'Libération', couleur: '#e0b34d' },
    cubeInactif: { label: 'Cube inactif', couleur: '#4a4360' },
    cubeActif: { label: 'Cube actif', couleur: '#9a90b3' },
    cubeDeploye: { label: 'Cube déployé', couleur: '#6b6285' }
  };

  // Colonne Stock -> champ plateauMaison correspondant, pour la persistance
  // directe d'une saisie manuelle (noms alignés sur gameService.js :
  // CHAMPS_PLATEAU_MAISON_AUTORISES).
  var CHAMP_DB_RESSOURCE_SIMPLE_ = {
    nourriture: 'ressourceNourriture',
    energie: 'ressourceEnergie',
    materiel: 'ressourceMateriel',
    credit: 'ressourceCredit',
    science: 'ressourceScience'
  };

  // Table Niveau -> Production (0 à 13, plafonnée au-delà). Même courbe
  // pour Nourriture/Énergie/Matériel/Science, courbe distincte pour Crédit.
  var PRODUCTION_NEMS = [0, 1, 1, 2, 3, 3, 4, 4, 5, 6, 8, 10, 12, 15];
  var PRODUCTION_CREDIT = [0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 8];

  function calculerProduction_(cle, niveau) {
    niveau = Math.max(0, Math.min(13, Math.floor(Number(niveau) || 0)));
    var table = (cle === 'credit') ? PRODUCTION_CREDIT : PRODUCTION_NEMS;
    return table[niveau];
  }

  // Guilde -> ressource produite, clés alignées sur secteurService.js
  // (guildeFermiers etc., camelCase côté store secteursPartie).
  var GUILDE_VERS_RESSOURCE = {
    guildeFermiers: 'nourriture',
    guildeIngenieurs: 'energie',
    guildeMineurs: 'materiel',
    guildeBanquiers: 'credit',
    guildeScientifiques: 'science'
  };

  // Niveaux de production courants (Population × Guildes, + bonus d'origine
  // éventuel), recalculés par recalculerNiveauxEtCubes_ — voir plus bas.
  var niveauxProduction = {};

  // Snapshot des ressources au début du cycle en cours, pour le delta
  // affiché sur chaque ligne. Réinitialisé par afficher() dès qu'une
  // nouvelle partie s'ouvre ou que le cycle change (voir
  // reinitialiserSoldeDebutCycle_) — la détection se fait toujours via le
  // changement de cycleActuel constaté par afficher(), pas depuis la
  // popup 'phase_evaluation' elle-même (celle-ci persiste puis déclenche
  // GameService.avancerCycle, qui redéclenche afficher() en aval avec un
  // cycleActuel différent — même mécanisme qu'avant son introduction).
  var soldeDebutCycle = {};

  function reinitialiserSoldeDebutCycle_(partie) {
    var ressources = (partie.plateauMaison || {}).ressources || {};
    soldeDebutCycle = {};
    RESSOURCES_PRODUCTION.forEach(function (cle) { soldeDebutCycle[cle] = ressources[cle] || 0; });
  }

  // Sauvegarde différée (debounce 600 ms, fusion des champs en attente),
  // pour ne pas écrire à chaque frappe sur un champ ressource/jeton.
  var champsPlateauMaisonEnAttente_ = {};
  var minuteurSauvegardePlateauMaison_ = null;

  function sauvegarderPlateauMaisonDifferee_(champs) {
    Object.assign(champsPlateauMaisonEnAttente_, champs);
    clearTimeout(minuteurSauvegardePlateauMaison_);
    minuteurSauvegardePlateauMaison_ = setTimeout(function () {
      var partie = App.getPartieCourante();
      var aEnvoyer = champsPlateauMaisonEnAttente_;
      champsPlateauMaisonEnAttente_ = {};
      if (!partie || !Object.keys(aEnvoyer).length) return;
      GameService.majPlateauMaison(partie.id, aEnvoyer).catch(function (erreur) {
        window.alert('Échec de l\'enregistrement : ' + erreur.message);
      });
    }, 600);
  }

  // Pour le formulaire Regrouper. Les clés correspondent aux colonnes pn_*
  // de secteursPartie via SecteurService.CHAMP_PN_PAR_TYPE (pnCorvette,
  // pnSentinelle, pnDestroyer, pnCuirasse, pnPorteVaisseau).
  var TYPES_VAISSEAU = [
    { cle: 'corvette', label: 'Corvette' },
    { cle: 'sentinelle', label: 'Sentinelle' },
    { cle: 'destroyer', label: 'Destroyer' },
    { cle: 'cuirasse', label: 'Cuirassé' },
    { cle: 'porte_vaisseau', label: 'Porte-Vaisseau' }
  ];

  // Helpers partagés par les popups Regrouper/Déployer un cube/Envahir.

  // Critère "vous appartient" (pas de Néant, au moins une unité de
  // Puissance Navale à vous) — même règle que Construire/Rappeler un
  // cube, prend directement un objet secteur (pas un numéro : chaque
  // popup garde son propre secteurParNumero_/secteurs local pour la
  // résolution numéro -> secteur, voir creerSecteurParNumero_ ci-dessous).
  function secteurEstPossede_(secteur) {
    if (!secteur || (secteur.pnNeant || 0) > 0) return false;
    return ((secteur.pnCorvette || 0) + (secteur.pnSentinelle || 0) + (secteur.pnDestroyer || 0)
      + (secteur.pnCuirasse || 0) + (secteur.pnPorteVaisseau || 0)) > 0;
  }

  // Fabrique un lookup numéro -> secteur fermé sur un tableau de secteurs
  // donné (chaque popup a le sien, chargé de façon asynchrone) — évite de
  // redéfinir la même fonction filter(...)[0] à chaque popup.
  function creerSecteurParNumero_(secteurs) {
    return function (numero) {
      return secteurs.filter(function (s) { return s.numero === numero; })[0];
    };
  }

  // Libellé d'affichage d'un type de vaisseau à partir de sa clé.
  function labelVaisseau_(cle) {
    var type = TYPES_VAISSEAU.filter(function (t) { return t.cle === cle; })[0];
    return type ? type.label : cle;
  }

  // Même principe que labelVaisseau_ ci-dessus, pour une Guilde.
  function labelGuilde_(cle) {
    var type = TYPES_GUILDE_CONSTRUIRE_.filter(function (t) { return t.cle === cle; })[0];
    return type ? type.label : cle;
  }

  // Table d'adjacence bidirectionnelle {numero: [numeros voisins]} à
  // partir du tableau brut SecteurService.obtenirAdjacences.
  function construireAdjacenceMap_(adjacences) {
    var adjacenceMap = {};
    (adjacences || []).forEach(function (a) {
      adjacenceMap[a.numeroA] = adjacenceMap[a.numeroA] || [];
      adjacenceMap[a.numeroA].push(a.numeroB);
      adjacenceMap[a.numeroB] = adjacenceMap[a.numeroB] || [];
      adjacenceMap[a.numeroB].push(a.numeroA);
    });
    return adjacenceMap;
  }

  // Mêmes clés que CHAMP_ELEMENT_PLACEMENT_ (secteurService.js) — pour la
  // popup 'construire' (sélection du type), libellés dupliqués depuis le
  // formulaire dédié de l'écran Secteurs (index.html, TYPES_INSTALLATION/
  // TYPES_GUILDE) par convention (même principe que TYPES_VAISSEAU
  // ci-dessus).
  var TYPES_INSTALLATION_CONSTRUIRE_ = [
    { cle: 'chantier_naval', label: 'Chantier Naval' },
    { cle: 'defense_secteur', label: 'Défense de Secteur' },
    { cle: 'base_stellaire', label: 'Base Stellaire' }
  ];
  var TYPES_GUILDE_CONSTRUIRE_ = [
    { cle: 'fermiers', label: 'Fermiers' },
    { cle: 'ingenieurs', label: 'Ingénieurs' },
    { cle: 'mineurs', label: 'Mineurs' },
    { cle: 'banquiers', label: 'Banquiers' },
    { cle: 'scientifiques', label: 'Scientifiques' }
  ];

  // Pour le formulaire "Déployer des cubes".
  var TECH_VAISSEAU = { sentinelle: 'sentinelles', destroyer: 'destroyers', cuirasse: 'cuirassés', porte_vaisseau: 'porte-vaisseaux' };
  var COUT_DEPLOIEMENT_PAR_TYPE = {
    cuirasse: { ressource: 'materiel', parCube: 1, label: 'Matériel' },
    porte_vaisseau: { ressource: 'nourriture', parCube: 1, label: 'Nourriture' }
  };

  // Mapping clé TYPES_VAISSEAU -> nom de champ attendu par
  // CombatService.resoudreInvasion (aligné sur construireCamp) — seule
  // "porte_vaisseau" diffère ("portevaisseau", sans underscore).
  var VAISSEAU_VERS_CHAMP_COMBAT = {
    corvette: 'corvette', sentinelle: 'sentinelle', destroyer: 'destroyer',
    cuirasse: 'cuirasse', porte_vaisseau: 'portevaisseau'
  };

  function nomsTechnologiesJoueur_(partie) {
    var noms = [];
    if (partie.joueur && partie.joueur.technologieDepart) noms.push(partie.joueur.technologieDepart.nom);
    (partie.technologiesObtenues || []).forEach(function (t) { if (t) noms.push(t.nom); });
    return noms.map(function (n) { return (n || '').trim().toLowerCase(); });
  }

  /**
   * Contrairement à nomsTechnologiesJoueur_ ci-dessus (qui ne renvoie que
   * des noms), cherche l'objet Technologie complet du joueur (départ OU
   * l'un des 5 emplacements obtenus — .amelioree porté par chacun, voir
   * GameService.definirTechnologieAmelioree/
   * definirTechnologieAvanceeAmelioree) pour en déduire la capacité
   * réelle : voir docs-rules-corruption-gardiens-refuges-technoConsume.md
   * §1 (la carte accueille 2 marqueurs de Corruption, 3 si améliorée).
   * `null` si le joueur ne possède pas cette Technologie.
   */
  function technologieChambreDecontamination_(partie) {
    var candidats = [];
    if (partie.joueur && partie.joueur.technologieDepart && partie.joueur.technologieDepart.nom) {
      candidats.push(partie.joueur.technologieDepart);
    }
    (partie.technologiesObtenues || []).forEach(function (t) { if (t && t.nom) candidats.push(t); });
    return candidats.filter(function (t) { return (t.nom || '').trim().toLowerCase() === 'chambres de décontamination'; })[0] || null;
  }

  // Clé Guilde du catalogue ("scientifique_pur", "banquier_pur"...),
  // rencontrée dans le tableau `influence_par_guilde` de focus.json ->
  // champ SecteurService.obtenirAgregatsInfluenceSecteursPurs correspondant
  // (objet `guildesPures`) + libellé affiché dans le détail du calcul
  // (popup 'influence_secteur' ci-dessous).
  var CHAMP_GUILDE_PAR_CLE_INFLUENCE_ = {
    fermier_pur: 'fermiers', ingenieur_pur: 'ingenieurs', mineur_pur: 'mineurs',
    banquier_pur: 'banquiers', scientifique_pur: 'scientifiques'
  };

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

  /**
   * Vrai quand l'Événement choisi pour le CYCLE EN COURS (partie.cycleNum)
   * a le code "G" (Cadre 2 permanent, "Le visage du mal" : "chaque fois
   * que vous retirez une Corruption, ... gardez-la dans votre zone de jeu
   * personnelle ... jusqu'à la phase Évaluation") — seul signal utilisé
   * pour activer `options.conserverCorruptionRetiree`
   * (CivilisationService.definirCorruption) sur un retrait de Corruption
   * d'une piste de Civilisation. `partie.evenements` peut être absent
   * (partie sans Événement choisi) — repli silencieux sur `false`.
   */
  function evenementConserveCorruptionActif_(partie) {
    var evenementCycle = partie && partie.evenements && partie.evenements['cycle' + partie.cycleNum];
    return !!(evenementCycle && evenementCycle.code === 'G');
  }

  // Clés brutes -> texte lisible pour les popups de choix. Repli sur la
  // clé brute si absente d'ici (vocabulaire déjà en français, reste
  // lisible).
  var LIBELLES_OPTIONS = {
    envahir: 'Envahir un secteur',
    envahir_corrompu: 'Envahir un secteur Corrompu',
    regrouper: 'Regrouper',
    regroupe: 'Regrouper',
    // Manquait (retour utilisateur) : affichait la clé brute "deplacer_corruption"
    // dans la popup et/ou "et/ou" (ex. Focus Conquête "Planifier").
    deplacer_corruption: 'Déplacer une Corruption',
    installation: 'Construire une Installation',
    construire_installation: 'Construire une Installation',
    guilde: 'Établir une Guilde',
    etablir_guilde: 'Établir une Guilde',
    retirer_corruption: 'Retirer une Corruption',
    // EVOLUTION 14 (todo.md) : "augmenter_population" (pistesCivilisation.json/
    // focus.json) et "augmenter_population_pure" (evenements.json) sont la
    // MÊME mécanique (voir FocusEngine.resoudreCle_) — même libellé pour
    // les deux, plutôt que d'afficher la clé brute.
    augmenter_population: 'Augmenter une population',
    augmenter_population_pure: 'Augmenter une population',
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
  // EVOLUTION 18 (todo.md — "faire un cadre unique pour une action et des
  // sous cadres pour les effets déclenché par cette action") : chaque
  // entrée est {action: string|null, lignes: string[]} plutôt qu'une
  // simple ligne de texte — `action` (le libellé de la Focus/Programme
  // jouée, ex. "Conquête — Planifier") regroupe visuellement TOUTES les
  // lignes produites par CETTE résolution (Effet + Coût + éventuels
  // rappels manuels) sous un même "cadre" (renderJournal_ ci-dessous) ;
  // `action: null` pour les messages hors action (avancement de piste
  // manuel écran Plat. maison, confirmation d'annulation...), rendus tels
  // quels comme avant (une simple ligne).
  var journal = [];

  function pousserJournalLigne_(texte) {
    journal.push({ action: null, lignes: [texte] });
  }

  function pousserJournalGroupe_(action, lignes) {
    lignes = (lignes || []).filter(Boolean);
    if (!lignes.length) return;
    journal.push({ action: action, lignes: lignes });
  }

  // Total fixe de cubes de Puissance Navale (inactif + actif + déployé),
  // identique pour toutes les maisons.
  var NB_CUBES_TOTAL = 14;
  // Dernier total de Cube déployé calculé par renderCubes_ (dérivé des
  // secteurs) — conservé pour recalculer Cube inactif en local (input Actif
  // édité à la main / bouton Activer) sans re-solliciter SecteurService.
  var dernierTotalDeployeCubes_ = 0;
  // État local des 5 emplacements Gloire (null = vide, 1-5 = valeur du
  // jeton) — reconstruit depuis partie.plateauMaison.gloire à chaque
  // afficher(), comme les autres blocs de cet écran.
  var etatGloire = [null, null, null, null, null];

  // ------------------------------------------------------------
  // Rendu ressources
  // ------------------------------------------------------------

  /**
   * Influence n'est pas affichée ici (elle vit sur l'écran Partie, voir
   * index.html App.renderEcranGame_). La ligne jetons se limite à Commerce
   * (compteur = longueur du tableau plateauMaison.jetonCommerce) + Prime +
   * Libération — Cube actif vit sur la ligne Cubes séparée (renderCubes_).
   *
   * Une ligne ressource = 6 cellules fixes (Libellé | Niveau | → | Revenu |
   * Stock éditable | Delta). Niveau/Revenu affichent la dernière valeur
   * connue de niveauxProduction, mise à jour de façon asynchrone par
   * recalculerNiveauxEtCubes_ juste après — voir majNiveauxAffiches_, qui
   * corrige les spans "niveau-X" et "revenu-X" sans reconstruire toute la
   * grille.
   */
  function champRessourceHTML_(cle, ressources) {
    var niveau = niveauxProduction[cle] || 0;
    var revenu = calculerProduction_(cle, niveau);
    var valeur = ressources[cle] || 0;
    var delta = valeur - (soldeDebutCycle[cle] || 0);
    var deltaTexte = delta > 0 ? ('+' + delta) : String(delta);

    return '' +
      '<div class="field field-ressource" style="--couleur-ressource:' + CHAMP_RESSOURCE[cle].couleur + '">' +
      '<label for="ressource-' + cle + '"><span class="pastille-ressource"></span>' + CHAMP_RESSOURCE[cle].label + '</label>' +
      '<span class="ressource-niveau" id="niveau-' + cle + '" title="Niveau de production (Population × Guildes)">' + niveau + '</span>' +
      '<span class="ressource-fleche">→</span>' +
      '<span class="ressource-revenu" id="revenu-' + cle + '" title="Revenu ajouté à la ressource lors d\'une action Produire">+' + revenu + '</span>' +
      '<input type="number" step="1" id="ressource-' + cle + '" class="ressource-input" data-ressource="' + cle + '" value="' + valeur + '">' +
      '<span class="ressource-delta" id="delta-' + cle + '" title="Depuis le début du cycle">' + deltaTexte + '</span>' +
      '</div>';
  }

  function majDeltaAffiche_(cle, valeur) {
    var badge = document.getElementById('delta-' + cle);
    if (!badge) return;
    var delta = valeur - (soldeDebutCycle[cle] || 0);
    badge.textContent = delta > 0 ? ('+' + delta) : String(delta);
  }

  function persisterRessourceSimple_(cle, valeur) {
    var champDb = CHAMP_DB_RESSOURCE_SIMPLE_[cle];
    if (!champDb) return;
    var champs = {};
    champs[champDb] = valeur;
    sauvegarderPlateauMaisonDifferee_(champs);
  }

  function renderRessources_(partie) {
    var pm = partie.plateauMaison || {};
    var ressources = pm.ressources || {};

    var principales = document.getElementById('ressources-principales');
    principales.innerHTML = RESSOURCES_PRODUCTION.map(function (cle) {
      return champRessourceHTML_(cle, ressources);
    }).join('');

    Array.prototype.forEach.call(principales.querySelectorAll('.ressource-input'), function (input) {
      input.addEventListener('input', function () {
        var cle = input.dataset.ressource;
        var valeur = Number(input.value) || 0;
        if (partieAffichee && partieAffichee.plateauMaison) partieAffichee.plateauMaison.ressources[cle] = valeur;
        majDeltaAffiche_(cle, valeur);
        majRappelRessourceAffiche_(cle, valeur);
        // Rejoue la jouabilité des cartes Focus (coutSuffisant_ relit
        // partieAffichee.plateauMaison.ressources, déjà à jour ci-dessus) —
        // ne touche pas #ressources-principales, l'input garde le focus.
        renderFocusJoueur_(partieAffichee);
        persisterRessourceSimple_(cle, valeur);
      });
    });

    renderJetons_(partie);
  }

  /**
   * Bandeau fixe en bas de l'écran Focus (#focus-rappel-ressources, voir
   * index.html et css/style.css), 6 chiffres colorés — les 5 ressources
   * principales (Nourriture/Énergie/Matériel/Crédit/Science) + Cube actif.
   * Réutilise couleurCout_/abregeCout_ (pastilles de coût des cartes
   * Focus) pour rester visuellement cohérent avec le reste de l'écran
   * plutôt que d'introduire une nouvelle palette. Rendu à chaque
   * afficher() ; les 5 ressources principales sont en plus rafraîchies en
   * direct par majRappelRessourceAffiche_ (appelée depuis le listener
   * 'input' de #ressources-principales, écran Plat. maison — voir
   * renderRessources_ ci-dessus). Cube actif est également rafraîchi en
   * direct depuis la ligne Cube (saisie directe ou bouton Activer, voir
   * majAffichageCubes_/renderCubes_ plus bas), en plus des actions
   * Focus/Secteurs.
   */
  function rappelChipHTML_(cle, valeur) {
    return '<div class="rappel-chip">' +
      '<span class="rappel-chip-label">' + abregeCout_(cle) + '</span>' +
      '<span class="rappel-chip-valeur" id="rappel-' + cle + '" style="color:' + couleurCout_(cle) + '">' + valeur + '</span>' +
      '</div>';
  }

  function renderRappelRessources_(partie) {
    var container = document.getElementById('focus-rappel-ressources');
    if (!container) return;
    var pm = partie.plateauMaison || {};
    var ressources = pm.ressources || {};
    container.innerHTML = RESSOURCES_PRODUCTION.map(function (cle) {
      return rappelChipHTML_(cle, ressources[cle] || 0);
    }).join('') + rappelChipHTML_('cubeActif', pm.cubeActif || 0);
  }

  function majRappelRessourceAffiche_(cle, valeur) {
    var el = document.getElementById('rappel-' + cle);
    if (el) el.textContent = valeur;
  }

  /**
   * Commerce/Prime/Libération sont éditables mais sans pastille de couleur
   * ni suivi de delta/niveau (contrairement à la grille principale) —
   * persistés au 'change', pas à chaque frappe. Commerce est stocké en
   * base comme un tableau de jetons 'disponible' (voir schéma
   * jetonCommerce) — la distinction 'programme' n'est pas câblée côté UI.
   */
  function jetonInputHTML_(cle, label, valeur) {
    return '<div class="jeton-champ" data-jeton="' + cle + '">' +
      '<label>' + label + '</label>' +
      '<input type="number" step="1" min="0" class="jeton-input" id="jeton-valeur-' + cle + '" data-jeton="' + cle + '" value="' + valeur + '">' +
      '</div>';
  }

  function persisterJeton_(cle, valeurBrute) {
    var n = Math.max(0, Number(valeurBrute) || 0);
    var champs = {};
    if (cle === 'commerce') {
      var tokens = [];
      for (var i = 0; i < n; i++) tokens.push('disponible');
      champs.jetonCommerce = tokens;
      if (partieAffichee && partieAffichee.plateauMaison) partieAffichee.plateauMaison.jetonCommerce = tokens;
    } else if (cle === 'prime') {
      champs.jetonPrime = n;
      if (partieAffichee && partieAffichee.plateauMaison) partieAffichee.plateauMaison.jetonPrime = n;
    } else if (cle === 'liberation') {
      champs.jetonLiberation = n;
      if (partieAffichee && partieAffichee.plateauMaison) partieAffichee.plateauMaison.jetonLiberation = n;
    } else if (cle === 'chambreDecontamination') {
      // Jeton manuel — l'AJOUT d'une Corruption sur cette case (au lieu
      // d'un secteur/piste/Programme) reste incrémenté à la main par le
      // joueur, comme Commerce/Prime/Libération ci-dessus (seul le RETRAIT
      // est automatisé, voir contexte 'retirer_corruption' plus bas).
      // Plafonné à 2 (3 si Technologie améliorée —
      // ligne.ameliore.storage.corruption_max, voir data/catalogue/
      // technologies.json) côté règle du jeu, non forcé ici (même
      // principe que les autres jetons de cette grille, jamais plafonnés
      // côté UI).
      champs.corruptionChambreDecontamination = n;
      if (partieAffichee && partieAffichee.plateauMaison) partieAffichee.plateauMaison.corruptionChambreDecontamination = n;
    } else {
      return;
    }
    sauvegarderPlateauMaisonDifferee_(champs);
  }

  function renderJetons_(partie) {
    var pm = partie.plateauMaison || {};
    var nbCommerce = Array.isArray(pm.jetonCommerce) ? pm.jetonCommerce.length : 0;
    var jetons = document.getElementById('ressources-jetons');
    var possedeChambreDecontamination = nomsTechnologiesJoueur_(partie).indexOf('chambres de décontamination') !== -1;
    jetons.innerHTML =
      jetonInputHTML_('commerce', 'Commerce', nbCommerce) +
      jetonInputHTML_('prime', 'Prime', pm.jetonPrime || 0) +
      jetonInputHTML_('liberation', 'Libération', pm.jetonLiberation || 0) +
      // Jeton affiché seulement si le joueur possède la Technologie
      // concernée (sinon aucune pertinence — grille jamais alourdie pour
      // rien, même principe que le reste de cet écran).
      (possedeChambreDecontamination
        ? jetonInputHTML_('chambreDecontamination', 'Corr. Chambres déconta.', pm.corruptionChambreDecontamination || 0)
        : '');

    Array.prototype.forEach.call(jetons.querySelectorAll('.jeton-input'), function (input) {
      input.addEventListener('change', function () {
        persisterJeton_(input.dataset.jeton, input.value);
      });
    });
  }

  /**
   * Rend la ligne Cube inactif/actif/déployé ET recalcule les niveaux de
   * production Nourriture/Énergie/Matériel/Crédit/Science. Niveau = somme,
   * sur tous les secteurs de la partie, de (population du secteur ×
   * nombre de Guildes de ce type), + 1 sur la ressource nommée par
   * originesMaison.bonusProd le cas échéant. Cube déployé = somme de la
   * Puissance Navale (pnCorvette/Sentinelle/Destroyer/Cuirasse/
   * PorteVaisseau) sur tous les secteurs ; Cube inactif = total fixe −
   * actif − déployé. Asynchrone (lecture des secteurs + du catalogue
   * originesMaison) : rendu séparé de renderRessources_, appelé depuis
   * afficher() sans bloquer le reste de l'écran ; met à jour les spans
   * "niveau-X" et "revenu-X" déjà présents dans la grille (voir
   * majNiveauxAffiches_) plutôt que de la reconstruire. Silencieux en cas
   * d'échec (garde le dernier rendu plutôt que de bloquer l'écran).
   * Les 3 valeurs (Inactif/Actif/Déployé) tiennent sur une seule ligne
   * compacte (.ligne-cubes, voir css/style.css), le mot "Cube" n'apparaît
   * qu'une fois.
   */
  /**
   * Calcule les NIVEAUX de production Nourriture/Énergie/Matériel/Crédit/
   * Science (population du secteur × nombre de Guildes de ce type, sommé
   * sur les seuls secteurs qui APPARTIENNENT au joueur — cf EVOLUTION 9,
   * SecteurService.appartientAuJoueur, exception Secteur-Mère toujours
   * possédé même sans PN dessus — + 1 sur la ressource nommée par
   * originesMaison.bonusProd, + 1 supplémentaire sur bonusProdSecondaire
   * le cas échéant — EVOLUTION 8, ex. Belitan/Collecte de données) ainsi
   * que le total de Puissance Navale déployée (non filtré par possession :
   * les champs pnCorvette/etc. représentent déjà la PN du joueur, par
   * opposition à pnNeant). Factorisé pour être réutilisé par
   * renderCubes_ (affichage, ci-dessous) ET par le contexte
   * 'produire_revenu' (résolution de l'effet "produire_<ressource>" d'une
   * carte Focus, ex. Production — Ravitailler, voir demanderChoix
   * plus bas) : focusEngine.js reste pur (aucun accès aux secteurs), donc
   * lui délègue ce calcul via demanderChoix plutôt que de le dupliquer.
   * Retourne { niveaux: {nourriture,energie,materiel,credit,science},
   * totalDeploye }.
   */
  function calculerNiveauxProduction_(partie) {
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    var nomTechDepart = (partie.joueur && partie.joueur.technologieDepart) ? partie.joueur.technologieDepart.nom : null;

    return Promise.all([
      SecteurService.obtenirSecteurs(partie.id),
      DB.getAll('originesMaison'),
      SecteurService.obtenirSecteurMere(partie.scenarioId)
    ]).then(function (resultats) {
      var secteurs = resultats[0] || [];
      var origines = resultats[1] || [];
      var numeroSecteurMere = resultats[2];
      var origine = origines.filter(function (o) {
        return o.maison === nomMaison && o.technologie === nomTechDepart;
      })[0] || null;

      var totaux = { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 };
      var totalDeploye = 0;
      secteurs.forEach(function (s) {
        totalDeploye += (Number(s.pnCorvette) || 0) + (Number(s.pnSentinelle) || 0) +
          (Number(s.pnDestroyer) || 0) + (Number(s.pnCuirasse) || 0) + (Number(s.pnPorteVaisseau) || 0);

        // EVOLUTION 9 : un secteur non possédé (pas de PN joueur dessus,
        // ou repris par le Néant) ne contribue pas au niveau de
        // production, sauf le Secteur-Mère qui nous appartient toujours.
        var estSecteurMere = numeroSecteurMere !== null && s.numero === numeroSecteurMere;
        if (!estSecteurMere && !SecteurService.appartientAuJoueur(s)) return;

        var population = Number(s.population) || 0;
        Object.keys(GUILDE_VERS_RESSOURCE).forEach(function (cleGuilde) {
          totaux[GUILDE_VERS_RESSOURCE[cleGuilde]] += population * (Number(s[cleGuilde]) || 0);
        });
      });

      if (origine && origine.bonusProd && totaux.hasOwnProperty(origine.bonusProd)) {
        totaux[origine.bonusProd] += 1;
      }
      // EVOLUTION 8 : bonus secondaire (ex. Belitan/Collecte de données :
      // +1 Crédit en plus du +1 Nourriture de bonusProd).
      if (origine && origine.bonusProdSecondaire && totaux.hasOwnProperty(origine.bonusProdSecondaire)) {
        totaux[origine.bonusProdSecondaire] += 1;
      }

      return { niveaux: totaux, totalDeploye: totalDeploye };
    });
  }

  function renderCubes_(partie) {
    var pm = partie.plateauMaison || {};
    var cubeActif = pm.cubeActif || 0;
    var container = document.getElementById('ressources-cubes');

    calculerNiveauxProduction_(partie).then(function (resultat) {
      RESSOURCES_PRODUCTION.forEach(function (cle) { niveauxProduction[cle] = resultat.niveaux[cle]; });
      majNiveauxAffiches_();

      dernierTotalDeployeCubes_ = resultat.totalDeploye;
      var cubeInactif = Math.max(0, NB_CUBES_TOTAL - cubeActif - resultat.totalDeploye);

      container.innerHTML =
        '<div class="ligne-cubes">' +
        '<span class="ligne-cubes-titre">Cube</span>' +
        '<span class="ligne-cubes-item">Inactif <strong id="cube-inactif-valeur">' + cubeInactif + '</strong></span>' +
        '<span class="ligne-cubes-item">Actif ' +
        '<input type="number" step="1" min="0" class="cube-actif-input" id="cube-actif-input" value="' + cubeActif + '">' +
        '</span>' +
        '<span class="ligne-cubes-item">Déployé <strong>' + resultat.totalDeploye + '</strong></span>' +
        '</div>';

      document.getElementById('cube-actif-input').addEventListener('input', function () {
        persisterCubeActif_(this.value);
        majAffichageCubes_();
      });
    }).catch(function () {
      // Silencieux — garde le dernier rendu plutôt que de bloquer l'écran.
    });
  }

  /**
   * Persiste Cube actif (saisie directe sur Plat. maison, en plus des
   * actions Focus/Secteurs qui le modifiaient jusqu'ici seules) — même
   * sauvegarde différée que les jetons (persisterJeton_).
   */
  function persisterCubeActif_(valeurBrute) {
    var n = Math.max(0, Math.min(NB_CUBES_TOTAL, Number(valeurBrute) || 0));
    if (partieAffichee && partieAffichee.plateauMaison) partieAffichee.plateauMaison.cubeActif = n;
    sauvegarderPlateauMaisonDifferee_({ cubeActif: n });
  }

  /**
   * Recale Inactif/l'input Actif après une saisie directe, sans reconstruire
   * toute la ligne (garde le focus de l'input).
   */
  function majAffichageCubes_() {
    var pm = (partieAffichee && partieAffichee.plateauMaison) || {};
    var cubeActif = pm.cubeActif || 0;
    var cubeInactif = Math.max(0, NB_CUBES_TOTAL - cubeActif - dernierTotalDeployeCubes_);

    var elInactif = document.getElementById('cube-inactif-valeur');
    var elInput = document.getElementById('cube-actif-input');
    if (elInactif) elInactif.textContent = cubeInactif;
    if (elInput && elInput !== document.activeElement) elInput.value = cubeActif;

    majRappelRessourceAffiche_('cubeActif', cubeActif);
  }

  function majNiveauxAffiches_() {
    RESSOURCES_PRODUCTION.forEach(function (cle) {
      var niveau = niveauxProduction[cle] || 0;
      var revenu = calculerProduction_(cle, niveau);
      var elNiveau = document.getElementById('niveau-' + cle);
      var elRevenu = document.getElementById('revenu-' + cle);
      if (elNiveau) elNiveau.textContent = niveau;
      if (elRevenu) elRevenu.textContent = '+' + revenu;
    });
  }

  /**
   * Gloire — 5 emplacements, chacun vide (null) ou valeur 1-5. Un clic
   * fait avancer l'emplacement (vide -> 1 -> 2 -> ... -> 5 -> vide) et
   * persiste immédiatement via GameService.majPlateauMaison
   * (lecture-fusion-écriture, ne touche que le champ gloire).
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

  // Repéré par ligne (avant/après EVOLUTION 18, même critère) : passage en
  // rouge/avertissement pour les lignes de rappel/échec/annulation.
  function journalLigneEstAvertissement_(ligne) {
    return ligne.indexOf('⚠️') !== -1 || ligne.indexOf('annulée') !== -1 || ligne.indexOf('↩️') !== -1;
  }

  /**
   * EVOLUTION 18 (todo.md) : une entrée `{action, lignes}` avec `action`
   * renseigné devient un "cadre" — titre (le libellé Focus/Programme) +
   * sous-cadre listant chaque ligne produite par CETTE résolution (Effet/
   * Coût/rappels manuels) — plutôt que de les noyer individuellement dans
   * la liste plate, comme demandé ("faire un cadre unique pour une action
   * et des sous cadres pour les effets déclenché par cette action").
   * `action: null` reste une simple ligne, comportement inchangé.
   */
  function renderJournal_() {
    var container = document.getElementById('ressources-journal');
    if (!journal.length) {
      container.innerHTML = '<p class="hint">Aucune action jouée pour l\'instant.</p>';
      return;
    }
    container.innerHTML = '<ul class="journal-liste">' +
      journal.slice().reverse().map(function (entree) {
        if (!entree.action) {
          var ligneUnique = entree.lignes[0];
          var estAvertissementLigne = journalLigneEstAvertissement_(ligneUnique);
          return '<li' + (estAvertissementLigne ? ' class="journal-avertissement"' : '') + '>' + ligneUnique + '</li>';
        }
        return '<li class="journal-action">' +
          '<div class="journal-action-titre">' + entree.action + '</div>' +
          '<ul class="journal-action-effets">' +
          entree.lignes.map(function (ligne) {
            var estAvertissement = journalLigneEstAvertissement_(ligne);
            return '<li' + (estAvertissement ? ' class="journal-avertissement"' : '') + '>' + ligne + '</li>';
          }).join('') +
          '</ul>' +
          '</li>';
      }).join('') +
      '</ul>';
  }

  /**
   * Liste verticale de lignes horizontales
   * (.piste-civilisation-bloc/-item/-label) ; affiche les 2 prochaines
   * cases non atteintes (niveau+1 ET +2) par piste. Piste au maximum ->
   * aucune case affichée (pas de message de repli).
   * Le bouton "Avancer" par piste (résout l'effet de la case via
   * CivilisationService.avancerPiste) et les 2 boutons globaux "Avancer la
   * moins avancée"/"Avancer la piste Corrompue" (index.html) n'ont pas
   * d'équivalent sur le plateau physique — assumé, ce sont des raccourcis
   * volontaires de l'app.
   */
  function renderPistesCivilisation_(partie) {
    var civ = partie.civilisation || { societe: 0, gouvernement: 0, economie: 0, corrompues: {} };
    var corrompues = civ.corrompues || {};
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    var container = document.getElementById('pistes-civilisation-liste');

    container.innerHTML = PISTES_ORDRE.map(function (piste) {
      var niveau = civ[piste] || 0;
      var auMax = niveau >= CivilisationService.NIVEAU_MAX;
      return '' +
        '<div class="piste-civilisation-bloc">' +
        '<div class="piste-civilisation-item">' +
        '<span class="piste-civilisation-label">' + LABEL_PISTE[piste] + '</span>' +
        '<span class="piste-civilisation-niveau">' + niveau + ' / ' + CivilisationService.NIVEAU_MAX + '</span>' +
        '<button type="button" class="btn btn-secondary btn-avancer-piste" data-piste="' + piste + '"' + (auMax ? ' disabled' : '') + '>Avancer</button>' +
        '<label class="piste-civilisation-corrompue"><input type="checkbox" class="check-corrompue" data-piste="' + piste + '"' + (corrompues[piste] ? ' checked' : '') + '> COR.</label>' +
        '</div>' +
        '<div id="piste-prochaines-' + piste + '"></div>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.btn-avancer-piste'), function (btn) {
      btn.addEventListener('click', function () { avancerPiste_(btn.dataset.piste, btn); });
    });
    Array.prototype.forEach.call(container.querySelectorAll('.check-corrompue'), function (cb) {
      cb.addEventListener('change', function () { toggleCorruption_(cb.dataset.piste, cb.checked, cb); });
    });

    if (nomMaison) {
      obtenirDetailPistesCache_(nomMaison).then(function (detail) {
        PISTES_ORDRE.forEach(function (piste) {
          var niveau = civ[piste] || 0;
          var el = document.getElementById('piste-prochaines-' + piste);
          if (!el) return; // l'écran a pu être re-rendu entre-temps
          el.innerHTML = texteProchainesCasesHTML_(detail[piste], niveau);
        });
      }).catch(function (erreur) {
        console.warn('StrategieService : détail des pistes indisponible :', erreur);
      });
    }
  }

  /**
   * Texte des 1-2 prochaines cases non atteintes d'une piste (case
   * niveau+1 et +2, si elles existent). `cases` : 7 entrées {case, texte}
   * pour cette piste (index 0 = case 1), issues de
   * CivilisationService.obtenirDetailPistes.
   */
  function texteProchainesCasesHTML_(cases, niveau) {
    if (!cases) return '';
    var prochaines = [];
    for (var c = niveau + 1; c <= Math.min(CivilisationService.NIVEAU_MAX, niveau + 2); c++) {
      var entree = cases[c - 1];
      if (entree) prochaines.push(entree);
    }
    if (!prochaines.length) return '';
    return '<div class="piste-civilisation-prochaines">' +
      prochaines.map(function (e) {
        return '<p class="piste-civilisation-prochaine"><strong>Case ' + e.case + '</strong> — ' + (e.texte || '(aucun texte)') + '</p>';
      }).join('') +
      '</div>';
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
          pousserJournalLigne_('Piste ' + LABEL_PISTE[piste] + ' : déjà au maximum.');
        } else {
          var ligneNiveau = 'Piste ' + LABEL_PISTE[piste] + ' : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau +
            ' — ' + (resultat.texte || 'aucun effet de case.');
          pousserJournalGroupe_('Piste ' + LABEL_PISTE[piste], [ligneNiveau].concat(resultat.effetJournal || []));
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

  // Les fonctions CivilisationService avancerPisteMoinsAvancee/
  // avancerPisteCorrompue restent en place et testées
  // (civilisationService_test.js) pour un futur pont Focus -> Civilisation,
  // mais aucun bouton DOM ne les appelle plus ici (aucun élément
  // #btn-avancer-moins-avancee/#btn-avancer-corrompue dans index.html).

  function toggleCorruption_(piste, valeur, cb) {
    cb.disabled = true;
    var options = !valeur ? { conserverCorruptionRetiree: evenementConserveCorruptionActif_(partieAffichee) } : null;
    CivilisationService.definirCorruption(partieAffichee.id, piste, valeur, options)
      .then(function (resultat) {
        if (resultat && resultat.corruptionMaisonConservee) {
          pousserJournalLigne_('Piste ' + LABEL_PISTE[piste] + ' : Corruption retirée, mais le compteur de Corruption (plateau maison) n’est pas décrémenté — Événement « Le visage du mal » actif ce cycle (la Corruption reste dans votre zone personnelle jusqu’à l’Évaluation).');
        }
        return App.rafraichirPartieCourante();
      })
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

  /**
   * couleurCout_/abregeCout_ fournissent la couleur et le libellé abrégé
   * (3 caractères, ou "Choix"/"Cube" en repli) de chaque pastille de coût
   * (pastillesCoutHTML_) — distinct de LIBELLES_OPTIONS (vocabulaire des
   * popups de choix, tronqué à 12 caractères, sans notion de couleur).
   */
  function couleurCout_(cle) {
    var trouve = RESSOURCES_TOUTES[cle];
    if (trouve) return trouve.couleur;
    if (cle.toLowerCase().indexOf('cube') !== -1) return '#9a90b3';
    return '#6b6285';
  }

  function abregeCout_(cle) {
    var trouve = RESSOURCES_TOUTES[cle];
    if (trouve) return trouve.label.slice(0, 3);
    if (cle === 'ressource_choix') return 'Choix';
    if (cle.toLowerCase().indexOf('cube') !== -1) return 'Cube';
    return cle.slice(0, 6);
  }

  function pastillesCoutHTML_(cout) {
    if (!cout || typeof cout !== 'object' || cout.brut) return '';
    var cles = Object.keys(cout);
    if (!cles.length) return '';
    return '<div class="focus-action-cout">' + cles.map(function (cle) {
      var valeur = cout[cle];
      var texte = (typeof valeur === 'number') ? valeur : abregeCout_(cle);
      return '<span class="pastille-cout" style="--couleur-pastille:' + couleurCout_(cle) + '" title="' + cle + (typeof valeur === 'number' ? ' : ' + valeur : '') + '">' + texte + '</span>';
    }).join('') + '</div>';
  }

  // todo.md (retour utilisateur) — docs-rules-Influence-et-ressources.md
  // §2 : mêmes 3 ressources substituables par du Crédit que
  // focusEngine.js/RESSOURCES_SUBSTITUABLES_CREDIT_ (copie locale
  // volontaire, fichiers indépendants — voir la même convention pour
  // RESSOURCES_PRODUCTION, dupliquée entre focusEngine.js/gameService.js).
  var RESSOURCES_SUBSTITUABLES_CREDIT_ = ['nourriture', 'energie', 'materiel'];

  /**
   * Un coût est "suffisant" si chaque ressource requise est couverte par
   * la réserve elle-même OU, pour Nourriture/Énergie/Matériel
   * (RESSOURCES_SUBSTITUABLES_CREDIT_ ci-dessus), par le Crédit disponible
   * en complément (todo.md, retour utilisateur — la carte Focus ne doit
   * plus être grisée à tort juste parce qu'UNE ressource manque si le
   * Crédit peut couvrir l'écart, voir focusEngine.js pour la popup de
   * paiement réelle). Le Crédit disponible est un pool PARTAGÉ entre
   * plusieurs clés substituables d'un même coût : `creditRestant` est
   * décrémenté au fil du parcours (ordre des clés de `cout`) pour ne pas
   * compter deux fois le même Crédit sur 2 manques différents.
   */
  function coutSuffisant_(cout, ressources) {
    if (!cout || typeof cout !== 'object' || cout.brut) return true;
    var suffisant = true;
    var creditRestant = ressources.credit || 0;
    Object.keys(cout).forEach(function (cle) {
      if (!CHAMP_RESSOURCE[cle] || typeof cout[cle] !== 'number') return;
      var manque = cout[cle] - (ressources[cle] || 0);
      if (manque <= 0) return;
      if (RESSOURCES_SUBSTITUABLES_CREDIT_.indexOf(cle) !== -1 && creditRestant >= manque) {
        creditRestant -= manque;
        return;
      }
      suffisant = false;
    });
    return suffisant;
  }

  /**
   * Carte Focus : .card.focus-card, actions en 2 colonnes
   * (.focus-action-corps texte à gauche, .focus-action-side pastilles de
   * coût + bouton rond "▶" à droite). Ni type (badge) ni numéro de carte
   * dans le titre — le type est toujours "Héroïque" pour les cartes
   * concernées (déjà visible sur l'écran Plat. Galactique) et le numéro
   * n'est qu'un identifiant interne au catalogue, pas une info de jeu.
   * Le paramètre `source` (data-source sur le bouton ▶, 'joueur' par
   * défaut) indique à jouerAction_ dans quel tableau de la partie relire
   * la carte (partie.focusJoueur ou partie.focusHeroiques[cycle]) : voir
   * renderFocusHeroiquesJoueur_ ci-dessous, qui réutilise cette même
   * fonction pour les Focus héroïques du cycle en cours.
   *
   * EVOLUTION 12 (todo.md, retour utilisateur — limite d'utilisation
   * d'une action Focus par cycle) : `partie.plateauMaison.
   * actionsFocusUtilisees` (tableau de clés "Focus — Action", voir
   * FocusEngine.resoudreAction/GameService.avancerCycle) détermine, pour
   * chaque action, si elle a déjà été jouée avec succès CE cycle — le
   * bouton est alors DÉSACTIVÉ (attribut HTML `disabled`, pas seulement
   * visuel) et affiche ✓ au lieu de ▶, la ligne entière prend la classe
   * `.focus-action-deja-utilisee` (css/style.css) — visuellement
   * distincte de `.focus-action-insuffisant` (ressources manquantes,
   * bordure/texte rouges) pour ne pas confondre les 2 raisons
   * d'indisponibilité. Le titre de la carte affiche un badge "✓ Utilisé"
   * dès qu'AU MOINS une action de cette carte a été jouée ce cycle.
   * Annuler la DERNIÈRE action (bouton "Annuler", écran Stratégie)
   * retire automatiquement sa clé de actionsFocusUtilisees (mécanisme
   * diff/undo générique de focusEngine.js, aucun code dédié ici) : au
   * prochain rendu (afficher() rappelé après l'annulation), le bouton
   * redevient utilisable et le badge disparaît si c'était la dernière
   * action de ce Focus.
   */
  function carteFocusJoueurHTML_(carte, carteIndex, source) {
    var ressources = (partieAffichee.plateauMaison || {}).ressources || {};
    var actionsUtilisees = (partieAffichee.plateauMaison || {}).actionsFocusUtilisees || [];
    var auMoinsUneUtilisee = false;
    var actionsHtml = carte.actions.map(function (action, actionIndex) {
      var jouable = coutSuffisant_(action.cout, ressources);
      var libelleAction = carte.focus + ' — ' + (action.action || 'action');
      var dejaUtilisee = actionsUtilisees.indexOf(libelleAction) !== -1;
      if (dejaUtilisee) auMoinsUneUtilisee = true;
      var classe = dejaUtilisee ? ' focus-action-deja-utilisee' : (jouable ? '' : ' focus-action-insuffisant');
      return '<div class="focus-action' + classe + '">' +
        '<div class="focus-action-corps">' +
        '<p class="focus-action-nom">' + (action.action || '(action)') + '</p>' +
        (action.texte ? '<p>' + action.texte + '</p>' : '') +
        '</div>' +
        '<div class="focus-action-side">' +
        pastillesCoutHTML_(action.cout) +
        '<button class="btn-jouer-action" data-source="' + (source || 'joueur') + '" data-carte="' + carteIndex + '" data-action="' + actionIndex + '"' +
        (dejaUtilisee ? ' disabled title="Déjà jouée ce cycle" aria-label="Déjà jouée ce cycle"' : ' title="Jouer cette action" aria-label="Jouer cette action"') + '>' +
        (dejaUtilisee ? '✓' : '▶') +
        '</button>' +
        '</div>' +
        '</div>';
    }).join('');

    var badgeUtilise = auMoinsUneUtilisee
      ? ' <span class="badge badge-focus-utilise" title="Au moins une action de ce Focus a été jouée ce cycle">✓ Utilisé</span>'
      : '';

    return '<div class="card focus-card">' +
      '<h3>' + carte.focus + badgeUtilise + '</h3>' +
      actionsHtml +
      '</div>';
  }

  function activerBoutonsJouerAction_(container) {
    Array.prototype.forEach.call(container.querySelectorAll('.btn-jouer-action'), function (btn) {
      btn.addEventListener('click', function () {
        jouerAction_(btn.dataset.source || 'joueur', Number(btn.dataset.carte), Number(btn.dataset.action), btn);
      });
    });
  }

  function renderFocusJoueur_(partie) {
    var container = document.getElementById('strategie-focus-joueur');
    var cartes = partie.focusJoueur || [];

    if (!cartes.length) {
      container.innerHTML = '<p class="hint">Aucun Focus configuré pour cette partie (créée avant cette fonctionnalité, ou mise en place Focus indisponible à la création).</p>';
      return;
    }

    container.innerHTML = cartes.map(function (c, i) { return carteFocusJoueurHTML_(c, i, 'joueur'); }).join('');
    activerBoutonsJouerAction_(container);
  }

  /**
   * Programmes obtenus par le joueur mais pas encore joués
   * (partie.plateauMaison.programmesEnMain, tableau non borné — voir
   * GameService.gagnerProgramme) — les 2 Focus liés et l'action de
   * Programme (règle FIXE par type, GameService.INFO_PROGRAMME_PAR_TYPE,
   * pas de champ par carte — voir gameService.js) en haut, séparés par une
   * barre ; le nom de la carte en dessous, petit/italique (`.hint
   * hint-inline`). Type volontairement PAS affiché (bruit visuel, peu
   * utile une fois les Focus liés visibles). PAS objectif1/objectif2
   * (ceux-ci ne servent qu'à la popup de sélection 'gagner_programme',
   * décision utilisateur explicite). Gabarit `.focus-action`/
   * `.focus-action-corps`/`.focus-action-side` réutilisé tel quel
   * (carteFocusJoueurHTML_ ci-dessus) : le bouton rond "▶" (même icône que
   * pour jouer une action Focus) ouvre la popup 'utiliser_programme'
   * (GameService.utiliserProgramme) — si l'action va au bout ET qu'un
   * emplacement lui est attribué, le Programme quitte cette liste pour le
   * plateau Programme (Plat. maison, renderProgrammesPlateauMaison_,
   * index.html) : rafraîchit donc les deux écrans au retour de la popup.
   */
  function renderProgrammesEnMain_(partie) {
    var container = document.getElementById('programmes-main-liste');
    if (!container) return;

    var noms = (partie.plateauMaison || {}).programmesEnMain || [];
    if (!noms.length) {
      container.innerHTML = '<p class="hint">Aucun Programme en main pour l\'instant.</p>';
      return;
    }

    DB.getAll('programmes').then(function (catalogue) {
      var parNom = {};
      catalogue.forEach(function (p) { parNom[p.nom] = p; });

      container.innerHTML = noms.map(function (nom) {
        var carte = parNom[nom];
        var type = carte ? carte.type : '';
        var info = GameService.INFO_PROGRAMME_PAR_TYPE[type] || null;
        return '<div class="card">' +
          '<div class="focus-action">' +
          '<div class="focus-action-corps">' +
          '<p class="focus-action-nom">' + (info ? info.focusLies.join(', ') + ' | ' + info.action : '(inconnu)') + '</p>' +
          '<p class="hint hint-inline" style="margin:0;">' + nom + '</p>' +
          '</div>' +
          '<div class="focus-action-side">' +
          '<button class="btn-jouer-action btn-utiliser-programme" data-nom="' + nom + '" data-type="' + type + '" title="Utiliser ce Programme" aria-label="Utiliser ce Programme">▶</button>' +
          '</div>' +
          '</div>' +
          '</div>';
      }).join('');

      Array.prototype.forEach.call(container.querySelectorAll('.btn-utiliser-programme'), function (btn) {
        btn.addEventListener('click', function () {
          btn.disabled = true;
          demanderChoix({
            type: 'utiliser_programme',
            partieId: partie.id,
            nomProgramme: btn.dataset.nom,
            typeProgramme: btn.dataset.type
          }).then(function (resultat) {
            btn.disabled = false;
            if (!resultat || resultat.annule) return;
            // Rechargement complet plutôt qu'une fusion locale :
            // utiliserProgramme peut avoir muté ressources/cube/gloire/
            // civilisation/secteurs (selon le type de Programme joué) en
            // plus de programmesEnMain/programmesUtilises — App.
            // rafraichirPartieCourante (index.html) relit la partie ET
            // met à jour partieCourante, seule source de vérité partagée
            // avec index.html (Piège n°2, CLAUDE.md).
            if (typeof App === 'undefined' || !App.rafraichirPartieCourante) return;
            return App.rafraichirPartieCourante().then(function (partieMaj) {
              if (partieMaj) afficher(partieMaj);
            });
          }).catch(function (erreur) {
            btn.disabled = false;
            window.alert('Échec de la résolution : ' + erreur.message);
          });
        });
      });
    }).catch(function () {
      container.innerHTML = '<p class="hint">Erreur de chargement du catalogue Programmes.</p>';
    });
  }

  /**
   * Affiche, sur l'écran Focus, le détail jouable (actions/coûts) des
   * Focus héroïques choisis pour le cycle en cours
   * (partie.focusHeroiques['cycle' + cycleActuel], choix fait sur l'écran
   * Plat. Galactique — voir renderFocusHeroiques_ ci-dessous, qui ne gère
   * que la sélection). Réutilise carteFocusJoueurHTML_ telle quelle (même
   * structure de carte que les Focus joueur), avec source='heroique' pour
   * que jouerAction_ relise la bonne carte. #focus-heroiques-joueur
   * (index.html) est masqué si aucun Focus héroïque n'est encore choisi
   * pour ce cycle (état initial ou partie terminée).
   */
  function renderFocusHeroiquesJoueur_(partie) {
    var bloc = document.getElementById('bloc-focus-heroiques-joueur');
    var container = document.getElementById('focus-heroiques-joueur');
    if (!bloc || !container) return;
    var cycle = partie.cycleActuel;
    if (!cycle || cycle === 'termine') { bloc.hidden = true; container.innerHTML = ''; return; }
    var cartes = (partie.focusHeroiques && partie.focusHeroiques['cycle' + cycle]) || [null, null, null];
    var cartesChoisies = cartes.map(function (c, i) { return { carte: c, slot: i }; }).filter(function (x) { return x.carte; });

    if (!cartesChoisies.length) { bloc.hidden = true; container.innerHTML = ''; return; }

    bloc.hidden = false;
    container.innerHTML = cartesChoisies.map(function (x) {
      return carteFocusJoueurHTML_(x.carte, x.slot, 'heroique');
    }).join('');
    activerBoutonsJouerAction_(container);
  }

  /**
   * Un <select> par emplacement (3), conteneur
   * #plateau-galactique-focus-heroiques sur l'écran Plat. Galactique.
   * Un Focus héroïque déjà choisi ailleurs (partie.focusHeroiquesPioches)
   * n'apparaît plus dans les options des AUTRES emplacements, sauf celui
   * qui le porte déjà (peut toujours être remis à "— Choisir —" pour le
   * libérer).
   *
   * Ni badge type ni liste d'actions ici : le <select> du nom suffit,
   * le détail jouable est sur l'écran Focus (voir
   * renderFocusHeroiquesJoueur_ ci-dessus, basé sur le même
   * partie.focusHeroiques['cycle' + cycleActuel]). Le type n'est de
   * toute façon jamais utile ici : tous les Focus choisis sur cet écran
   * sont "Héroïque" par construction (FocusService.obtenirNomsPoolHeroique
   * ne liste que ce pool). Chaque emplacement est un
   * <div class="techno-obtenue-ligne"><select>...</select></div> — même
   * gabarit qu'un emplacement "Technologies avancées" juste au-dessus sur
   * cet écran (index.html) ; pas de .card ici, le <select> dessine déjà
   * son propre cadre.
   */
  function renderFocusHeroiques_(partie) {
    var container = document.getElementById('plateau-galactique-focus-heroiques');
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

        return '<div class="techno-obtenue-ligne">' +
          '<select class="select-focus-heroique" data-slot="' + slot + '">' + options + '</select>' +
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

  /**
   * `source` ('joueur' ou 'heroique') indique dans quel tableau de la
   * partie relire la carte avant de la jouer (partie.focusJoueur[carteIndex]
   * ou partie.focusHeroiques['cycle' + cycleActuel][carteIndex], ce
   * dernier indexé par emplacement 0/1/2, cohérent avec carteIndex passé
   * par renderFocusHeroiquesJoueur_). FocusEngine.jouerActionEtPersister
   * ne dépend pas de l'origine de la carte (juste carte + action).
   */
  function resoudreCarteSource_(source, carteIndex) {
    var partie = partieAffichee;
    if (source === 'heroique') {
      var cycle = partie.cycleActuel;
      if (!cycle || cycle === 'termine') return null;
      return ((partie.focusHeroiques && partie.focusHeroiques['cycle' + cycle]) || [])[carteIndex] || null;
    }
    return (partie.focusJoueur || [])[carteIndex] || null;
  }

  function jouerAction_(source, carteIndex, actionIndex, btn) {
    if (btn.disabled) return; // sécurité anti double-clic
    var partie = partieAffichee;
    var carte = resoudreCarteSource_(source, carteIndex);
    var action = carte ? carte.actions[actionIndex] : null;
    if (!carte || !action) return;

    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    // Feuille d'action (retour utilisateur, POC testé sur l'écran Test) :
    // scopée à Focus Conquête Standard, voir carteEligibleFeuille_. Ouverte
    // ICI (avant même le premier demanderChoix) pour reproduire le geste
    // natif "la feuille apparaît dès l'appui sur l'action", pas seulement
    // à la première popup — fermée dans TOUS les cas ci-dessous (succès,
    // échec, erreur), filet de sécurité même si un contexte inattendu
    // laissait la promesse de résolution en suspens.
    carteEnFeuille_ = carteEligibleFeuille_(carte);
    feuilleActionCourante_ = carteEnFeuille_ ? { carte: carte, action: action } : null;
    feuillePrepaiement_ = null;
    if (carteEnFeuille_) feuilleOuvrir_();

    FocusEngine.jouerActionEtPersister(partie.id, carte, action, demanderChoix)
      .then(function (resultat) {
        feuilleFermer_();
        carteEnFeuille_ = false;
        feuilleActionCourante_ = null;
        // Même libellé que AnnulationService (source de la pile, voir
        // FocusEngine.jouerActionEtPersister) — un seul "cadre" pour toute
        // la résolution (Effet + Coût + rappels manuels éventuels).
        pousserJournalGroupe_(carte.focus + ' — ' + (action.action || 'action'), resultat.journal);
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) {
        afficher(partieFraiche);
        // Une action Focus peut écrire directement sur secteursPartie
        // (construire_installation/etablir_guilde, regrouper, envahir,
        // deployer_cube — toutes hors du diff plateauMaison, voir
        // focusEngine.js) sans qu'afficher() ci-dessus ne le sache —
        // App.afficherEcran ne re-rend rien tout seul en changeant
        // d'onglet (Piège n°2, voir CLAUDE.md) : rappel systématique,
        // peu coûteux et idempotent, plutôt que de détecter au cas par
        // cas quelle action a touché les secteurs.
        App.renderSecteurs(partieFraiche);
      })
      .catch(function (erreur) {
        feuilleFermer_();
        carteEnFeuille_ = false;
        feuilleActionCourante_ = null;
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
    btn.textContent = 'Annulation en cours…';

    AnnulationService.annulerDerniere(partie.id)
      .then(function (resultat) {
        pousserJournalLigne_(resultat.succes ? ('↩️ Action annulée : ' + resultat.source + '.') : 'Aucune action à annuler.');
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) {
        // majBoutonAnnuler_ (appelée par afficher() ci-dessous) ne remet
        // à jour QUE .disabled (selon la nouvelle taille de la pile),
        // jamais .textContent — sans cette ligne, le bouton restait bloqué
        // sur "Annulation en cours…" après une annulation réussie (todo.md,
        // EVOLUTION 18, retour utilisateur).
        btn.textContent = texteOriginal;
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
    return Object.keys(opt)
      // "tie_break" (ex. focus.json id 106, Renfort "Accélérer") est un
      // MODIFICATEUR silencieux pour FocusEngine (voir
      // CLES_MODIFICATEURS_SILENCIEUSES), jamais un choix affichable —
      // sans ce filtre, une option comme {tie_break:"au_choix",
      // avancer_civilisation_moins_avancee:1} affichait littéralement
      // "tie_break + Avancer sur votre piste la moins avancée (1)"
      // (todo.md, retour utilisateur : "libellé tie_break j'ai pas compris
      // ce que ça signifie").
      .filter(function (k) { return k !== 'tie_break'; })
      .map(function (k) {
        var v = opt[k];
        // "ressource_choix" (todo.md, retour utilisateur) : label dédié
        // "+N ressource(s) au choix" plutôt que le gabarit générique
        // "clé (N)" — bien plus clair dans une liste d'options ("Regrouper",
        // "+4 ressources au choix", "Avancer sur votre piste la moins
        // avancée (1)"...).
        if (k === 'ressource_choix' && typeof v === 'number') {
          return '+' + v + ' ressource' + (v > 1 ? 's' : '') + ' au choix';
        }
        return (LIBELLES_OPTIONS[k] || k) + (typeof v === 'number' ? ' (' + v + ')' : '');
      }).join(' + ');
  }

  function fermerModale_() {
    document.getElementById('modal-choix').hidden = true;
  }

  // ============================================================
  // Feuille d'action — rendu ALTERNATIF de demanderChoix (bottom sheet
  // iPhone-first), retour utilisateur après test sur l'écran Test
  // (index.html, état factice) : "implémente cette version du poc dans la
  // vraie appli sur le même focus". Mécanique portée telle quelle depuis
  // maquette-cartes-focus/variante-c-feuille.html / l'écran Test — seule
  // différence : branchée ici sur les VRAIES données de la partie
  // (SecteurService/CivilisationService/GameService), exactement les
  // mêmes fonctions que les branches #modal-choix équivalentes plus bas,
  // seul le CHROME visuel change.
  //
  // Scope VOLONTAIREMENT limité : `carteEligibleFeuille_` ne couvre QUE
  // Focus Conquête Standard (celle testée tout du long) — les autres
  // maisons ont un Conquête différent (Astoran/Yarvek/Zenor/Héroïque, avec
  // des clés Effet non couvertes ici : nourriture_par_secteur_pur,
  // gagner_technologie, etc.), et toutes les autres cartes du catalogue
  // continuent d'utiliser #modal-choix, INCHANGÉ. `FEUILLE_TYPES_
  // SUPPORTES_` couvre les contexte.type déclenchés par cette carte,
  // désormais TOUS (option_exclusive/options_inclusives/
  // paiement_ressource/gagner_programme/deplacer_corruption/regrouper/
  // envahir) — retour utilisateur : "il faudrait rester dans la même
  // popup [pour Regrouper/Envahir] comme dans le POC" (auparavant repli
  // volontaire sur #modal-choix, formulaires jugés hors périmètre du
  // premier portage — feuilleFlowRegrouper_/feuilleFlowEnvahir_, plus
  // bas, les portent maintenant directement DANS la feuille, réutilisant
  // la logique métier des branches #modal-choix équivalentes SANS aucun
  // changement).
  function carteEligibleFeuille_(carte) {
    return !!carte && carte.focus === 'Conquête' && carte.type === 'Standard';
  }
  var carteEnFeuille_ = false;
  var FEUILLE_TYPES_SUPPORTES_ = ['option_exclusive', 'options_inclusives', 'paiement_ressource', 'gagner_programme', 'deplacer_corruption', 'regrouper', 'envahir'];

  var feuillePile_ = [];
  var feuilleRejetCourant_ = null;
  var feuilleInitialisee_ = false;
  var feuilleEls_ = {};
  // Choix "et/ou" à ≥ 2 options : mémorise leurs libellés dans l'ordre où
  // focusEngine.js va les résoudre (chacune via un demanderChoix
  // INDÉPENDANT) pour préfixer "Action X/N — " sur les flows délégués
  // susceptibles d'apparaître dedans (gagner_programme/deplacer_corruption)
  // — voir feuilleFlowOptionsInclusives_/feuilleConsommerEtiquetteSequence_.
  var feuilleSequenceEtOu_ = null;
  // {carte, action} de l'action en cours de résolution — posé par
  // jouerAction_ AVANT le premier demanderChoix, lu par
  // feuilleInfosCoutInitial_ (Coût combiné dès le premier écran, voir
  // ci-dessous) et par feuilleFlowPaiementRessource_ (texte d'Effet quand
  // le paiement EST le premier et seul écran, ex. Focus Conquête
  // "Préparer" — effet silencieux, aucune popup dédiée pour lui).
  var feuilleActionCourante_ = null;
  // Retour utilisateur (test iPhone) : "je pensais que le coût s'affichait
  // dès le début, une partie coût et une partie effet, comme dans la
  // maquette variante-c-feuille.html" — feuilleFlowOptionExclusive_/
  // feuilleFlowOptionsInclusives_ (le tout premier écran d'une action)
  // affichent désormais AUSSI le stepper de coût quand l'action porte une
  // ressource substituable (Nourriture/Énergie/Matériel), et capturent le
  // montant choisi ici. Quand focusEngine.js redemande ensuite
  // 'paiement_ressource' pour CETTE MÊME clé/montant (résolution Coût,
  // toujours APRÈS l'Effet — architecture de focusEngine.js, RÈGLE
  // MÉTIER non modifiée), feuilleFlowPaiementRessource_ répond
  // IMMÉDIATEMENT avec la valeur déjà capturée, SANS ré-afficher un écran
  // — l'utilisateur ne voit donc qu'UN SEUL écran combiné Coût+Effet,
  // fidèle à la maquette d'origine, même si focusEngine.js continue en
  // interne de résoudre Effet PUIS Coût en 2 appels demanderChoix
  // séquentiels. Remis à `null` par jouerAction_ à chaque nouvelle action
  // ET consommé (remis à `null`) dès qu'utilisé, pour ne jamais fuiter
  // vers un appel demanderChoix qui ne correspond pas (repli normal sur un
  // écran dédié dans ce cas, comportement inchangé).
  var feuillePrepaiement_ = null;

  /**
   * Calcule les infos d'affichage du Coût de l'action EN COURS
   * (feuilleActionCourante_), pour l'écran combiné Coût+Effet — au plus
   * UNE clé substituable par action dans le catalogue actuel (jamais
   * vérifié au-delà de Focus Conquête Standard, seule carte éligible à la
   * Feuille pour l'instant) : la 1re trouvée dans `action.cout` gagne, les
   * autres clés (jamais substituables, ex. Crédit) sont listées en texte
   * fixe. Retourne `null` si l'action n'a aucun coût.
   */
  function feuilleInfosCoutInitial_() {
    var action = feuilleActionCourante_ && feuilleActionCourante_.action;
    if (!action || !action.cout || typeof action.cout !== 'object') return null;
    var cout = action.cout;
    var cleSubstituable = null;
    Object.keys(cout).forEach(function (cle) {
      if (!cleSubstituable && RESSOURCES_SUBSTITUABLES_CREDIT_.indexOf(cle) !== -1 && typeof cout[cle] === 'number') {
        cleSubstituable = cle;
      }
    });
    var texteFixe = Object.keys(cout).filter(function (c) { return c !== cleSubstituable; })
      .map(function (c) { return (typeof cout[c] === 'number' ? cout[c] + ' ' : '') + (CHAMP_RESSOURCE[c] ? CHAMP_RESSOURCE[c].label : abregeCout_(c)); })
      .join(', ') || null;
    if (!cleSubstituable) return { substituable: false, texteFixe: texteFixe };

    // partieAffichee.plateauMaison.ressources (clés courtes : energie,
    // credit...) — PAS les champs plats ressourceEnergie/ressourceCredit
    // (ceux-là n'existent que sur la ligne BRUTE `plateauMaison` en DB,
    // CHAMP_DB_RESSOURCE_SIMPLE_ ci-dessus sert à la persistance d'une
    // saisie manuelle, pas à la lecture ici — bug corrigé après retour
    // utilisateur : "ça me met insuffisant alors que j'ai les ressources",
    // le stock lu valait donc toujours 0).
    var ressources = (partieAffichee && partieAffichee.plateauMaison && partieAffichee.plateauMaison.ressources) || {};
    return {
      substituable: true,
      cle: cleSubstituable,
      montant: cout[cleSubstituable],
      label: CHAMP_RESSOURCE[cleSubstituable].label,
      stockRessource: ressources[cleSubstituable] || 0,
      stockCredit: ressources.credit || 0,
      texteFixe: texteFixe
    };
  }

  function feuilleSectionCoutHTML_(infos, idStepper) {
    if (!infos) return '';
    if (!infos.substituable) {
      return infos.texteFixe ? '<div class="feuille-section"><p class="feuille-section-titre">Coût</p><p class="hint">' + infos.texteFixe + '.</p></div>' : '';
    }
    return '<div class="feuille-section"><p class="feuille-section-titre">Coût</p>' +
      (infos.texteFixe ? '<p class="hint">' + infos.texteFixe + ' (fixe).</p>' : '') +
      feuilleStepperCoutHTML_(idStepper, infos.label, infos.montant, infos.stockRessource, infos.stockCredit, CHAMP_RESSOURCE[infos.cle] && CHAMP_RESSOURCE[infos.cle].couleur) + '</div>';
  }

  function feuilleConsommerEtiquetteSequence_() {
    if (!feuilleSequenceEtOu_) return '';
    feuilleSequenceEtOu_.position++;
    var etiquette = 'Action ' + feuilleSequenceEtOu_.position + '/' + feuilleSequenceEtOu_.libelles.length + ' — ';
    if (feuilleSequenceEtOu_.position >= feuilleSequenceEtOu_.libelles.length) feuilleSequenceEtOu_ = null;
    return etiquette;
  }

  function feuilleInit_() {
    if (feuilleInitialisee_) return;
    feuilleInitialisee_ = true;
    feuilleEls_.scrim = document.getElementById('feuille-scrim');
    feuilleEls_.feuille = document.getElementById('feuille');
    feuilleEls_.grabberZone = document.getElementById('feuille-grabber-zone');
    feuilleEls_.teteRetour = document.getElementById('feuille-retour');
    feuilleEls_.teteTitre = document.getElementById('feuille-titre');
    feuilleEls_.teteEtapes = document.getElementById('feuille-etapes');
    feuilleEls_.corpsInner = document.getElementById('feuille-corps-inner');
    feuilleEls_.btnValider = document.getElementById('feuille-valider');
    if (!feuilleEls_.scrim || !feuilleEls_.feuille) return;

    var dragY = null, dragH = null;
    feuilleEls_.grabberZone.addEventListener('pointerdown', function (e) {
      dragY = e.clientY;
      dragH = feuilleEls_.feuille.getBoundingClientRect().height;
      feuilleEls_.feuille.classList.remove('feuille-animee');
      feuilleEls_.grabberZone.setPointerCapture(e.pointerId);
    });
    feuilleEls_.grabberZone.addEventListener('pointermove', function (e) {
      if (dragY === null) return;
      var h = Math.max(20, Math.min(window.innerHeight * 0.92, dragH + (dragY - e.clientY)));
      feuilleEls_.feuille.style.height = h + 'px';
    });
    function finDrag() {
      if (dragY === null) return;
      dragY = null;
      feuilleEls_.feuille.classList.add('feuille-animee');
      var h = feuilleEls_.feuille.getBoundingClientRect().height;
      var auto = feuilleTailleAuContenu_();
      var plein = window.innerHeight * 0.92;
      if (h < auto * 0.55) { feuilleFermerEtAnnuler_(); return; }
      feuilleEls_.feuille.style.height = (h > (auto + plein) / 2 ? plein : auto) + 'px';
    }
    feuilleEls_.grabberZone.addEventListener('pointerup', finDrag);
    feuilleEls_.grabberZone.addEventListener('pointercancel', finDrag);

    feuilleEls_.scrim.addEventListener('click', feuilleFermerEtAnnuler_);
    feuilleEls_.teteRetour.addEventListener('click', function () {
      var actuelle = feuillePile_[feuillePile_.length - 1];
      if (feuillePile_.length <= 1 || (actuelle && actuelle.racineSequence !== false)) return;
      feuillePile_.pop();
      feuilleRendreEtape_(feuillePile_[feuillePile_.length - 1], 'arriere');
    });
  }

  function feuilleTailleAuContenu_() {
    var chrome = document.querySelector('#feuille .feuille-tete').offsetHeight +
      document.querySelector('#feuille .feuille-pied').offsetHeight + 26;
    // Retour utilisateur (test iPhone réel) : "la popup n'est pas assez
    // dépliée de base" (42% initialement, encore insuffisant au retour
    // suivant) — un contenu court (ex. 2 options d'Engager) ne remplissait
    // qu'une fraction minime de l'écran. Plancher relatif à la fenêtre
    // (70%) plutôt qu'un
    // plancher absolu (180px) trop petit sur un écran de téléphone actuel.
    return Math.min(window.innerHeight * 0.92, Math.max(window.innerHeight * 0.70, feuilleEls_.corpsInner.scrollHeight + chrome));
  }
  function feuilleAjusterHauteur_() {
    feuilleEls_.feuille.classList.add('feuille-animee');
    feuilleEls_.feuille.style.height = feuilleTailleAuContenu_() + 'px';
  }
  function feuilleOuvrir_() {
    feuilleInit_();
    feuillePile_ = [];
    feuilleSequenceEtOu_ = null;
    feuilleEls_.scrim.hidden = false;
    feuilleEls_.feuille.classList.add('feuille-animee');
    feuilleEls_.feuille.style.height = '0px';
    requestAnimationFrame(function () { feuilleAjusterHauteur_(); });
  }
  // Chrono du masquage retardé du voile (voir feuilleFermer_) — annulé par
  // feuillePousserEtape_ si une étape Feuille revient entre-temps (cas
  // "Engager" : la feuille se masque le temps du repli #modal-choix pour
  // Regrouper/Envahir, hors périmètre — voir FEUILLE_TYPES_SUPPORTES_ —
  // puis DOIT ressurgir pour le paiement du coût qui suit).
  var feuilleTimeoutFermeture_ = null;
  function feuilleFermer_() {
    if (!feuilleInitialisee_ || !feuilleEls_.feuille) return;
    feuilleEls_.feuille.classList.add('feuille-animee');
    feuilleEls_.feuille.style.height = '0px';
    if (feuilleTimeoutFermeture_) clearTimeout(feuilleTimeoutFermeture_);
    feuilleTimeoutFermeture_ = setTimeout(function () {
      feuilleEls_.scrim.hidden = true;
      feuilleTimeoutFermeture_ = null;
    }, 280);
  }
  function feuilleFermerEtAnnuler_() {
    var r = feuilleRejetCourant_;
    feuilleRejetCourant_ = null;
    feuilleFermer_();
    if (r) r();
  }

  /**
   * `racineSequence !== false` (par défaut, valeur absente sur la plupart
   * des étapes) = étape racine d'un appel demanderChoix INDÉPENDANT (un
   * par flow_* ci-dessous) — jamais de "← Retour" vers une racine
   * précédente, dont la Promise est déjà résolue (un clic Valider dessus
   * ne ferait plus rien : la résolution de l'action a déjà avancé au-delà,
   * l'utilisateur resterait bloqué sur l'étape courante, toujours en
   * attente). Seule une étape explicitement marquée `racineSequence:false`
   * (sous-étape imbriquée DANS un même flow_*, ex. destination après
   * source de "Déplacer une Corruption" — même Promise, pas encore
   * résolue) peut être quittée par Retour.
   */
  function feuilleRendreEtape_(etape, direction) {
    var els = feuilleEls_;
    els.teteTitre.textContent = etape.titre;
    els.teteRetour.hidden = feuillePile_.length <= 1 || etape.racineSequence !== false;
    if (etape.nbEtapes > 1) {
      els.teteEtapes.hidden = false;
      els.teteEtapes.innerHTML = '';
      for (var i = 0; i < etape.nbEtapes; i++) {
        var s = document.createElement('span');
        if (i === etape.etapeIndex) s.className = 'actif';
        els.teteEtapes.appendChild(s);
      }
    } else {
      els.teteEtapes.hidden = true;
    }
    var classeSortie = direction === 'avant' ? 'transition-sortie-avant' : 'transition-sortie-arriere';
    els.corpsInner.classList.add(classeSortie);
    setTimeout(function () {
      els.corpsInner.innerHTML = etape.html;
      if (etape.brancher) etape.brancher(els.corpsInner);
      els.corpsInner.classList.remove(classeSortie);
      els.corpsInner.classList.add('transition-entree');
      requestAnimationFrame(function () { els.corpsInner.classList.remove('transition-entree'); feuilleAjusterHauteur_(); });
    }, direction ? 150 : 0);
    els.btnValider.hidden = !etape.onValider;
    els.btnValider.disabled = false;
    els.btnValider.onclick = etape.onValider || null;
  }
  function feuillePousserEtape_(etape, direction) {
    // Ré-affiche le voile/annule un masquage retardé en attente — voir
    // feuilleFermer_ : couvre le cas "Engager" où la feuille a été
    // masquée le temps du repli #modal-choix (Regrouper/Envahir) puis
    // ressurgit pour le paiement du coût qui suit.
    if (feuilleTimeoutFermeture_) { clearTimeout(feuilleTimeoutFermeture_); feuilleTimeoutFermeture_ = null; }
    feuilleEls_.scrim.hidden = false;
    feuillePile_.push(etape);
    feuilleRendreEtape_(etape, direction || 'avant');
  }

  function feuilleRangeeChoixHTML_(nom, options, multiple, selectionParDefaut) {
    return options.map(function (o, i) {
      var selectionnee = multiple
        ? (selectionParDefaut || []).indexOf(i) !== -1
        : i === (selectionParDefaut || 0);
      return '<button type="button" class="rangee-choix' + (selectionnee ? ' selectionnee' : '') + '"' +
        (multiple ? ' data-multiple' : '') + ' data-groupe="' + nom + '" data-i="' + i + '">' +
        '<span>' + o + '</span><span class="rangee-choix-marque">' + (selectionnee ? '✓' : '') + '</span></button>';
    }).join('');
  }
  function feuilleBrancherRangeeChoix_(container, nom, multiple, onChange) {
    var rangees = Array.prototype.slice.call(container.querySelectorAll('.rangee-choix[data-groupe="' + nom + '"]'));
    rangees.forEach(function (r) {
      r.addEventListener('click', function () {
        if (!multiple) {
          rangees.forEach(function (autre) {
            autre.classList.remove('selectionnee');
            autre.querySelector('.rangee-choix-marque').textContent = '';
          });
        }
        var maintenantSelectionnee = !r.classList.contains('selectionnee');
        r.classList.toggle('selectionnee', multiple ? maintenantSelectionnee : true);
        r.querySelector('.rangee-choix-marque').textContent = r.classList.contains('selectionnee') ? '✓' : '';
        if (onChange) onChange(rangees.filter(function (x) { return x.classList.contains('selectionnee'); }).map(function (x) { return Number(x.dataset.i); }));
      });
    });
  }
  // Cibles "catégorie" (source/destination de Déplacer une Corruption) :
  // le tap navigue IMMÉDIATEMENT vers l'étape suivante (pas de Valider
  // séparé) — même comportement que les boutons `.btn-choix-liste` de la
  // branche #modal-choix équivalente plus bas.
  function feuilleBrancherRangeeChoixImmediat_(container, nom, onChoisi) {
    var rangees = Array.prototype.slice.call(container.querySelectorAll('.rangee-choix[data-groupe="' + nom + '"]'));
    rangees.forEach(function (r, i) {
      r.addEventListener('click', function () { onChoisi(i); });
    });
  }
  // `couleur` (retour utilisateur) : segment "ressource" de la barre
  // teinté selon CHAMP_RESSOURCE[cle].couleur (ex. Énergie -> jaune),
  // plutôt qu'une couleur neutre fixe — le segment "Crédit" reste corail,
  // inchangé.
  function feuilleStepperCoutHTML_(id, label, montant, stock, credit, couleur) {
    return '<div class="cout-stepper" id="stepper-' + id + '">' +
      '<button type="button" class="cout-stepper-bouton" data-role="moins">−</button>' +
      '<div class="cout-stepper-barre"><div class="cout-stepper-seg-ressource" id="seg-res-' + id + '"' + (couleur ? ' style="background:' + couleur + '"' : '') + '></div><div class="cout-stepper-seg-credit" id="seg-cred-' + id + '"></div></div>' +
      '<button type="button" class="cout-stepper-bouton" data-role="plus">+</button>' +
      '</div>' +
      '<p class="cout-stepper-resume" id="resume-' + id + '"></p>' +
      '<p class="hint cout-stepper-hint">Stock : ' + stock + ' ' + label + ', ' + credit + ' Crédit.' +
      ' <span id="avert-' + id + '" style="color:var(--color-coral);" hidden>Insuffisant</span></p>';
  }
  function feuilleBrancherStepperCout_(container, id, label, montant, stock, credit, estado, onMaj) {
    if (estado.v == null) estado.v = Math.min(montant, stock);
    var boutons = container.querySelectorAll('#stepper-' + id + ' .cout-stepper-bouton');
    var segRes = container.querySelector('#seg-res-' + id);
    var segCred = container.querySelector('#seg-cred-' + id);
    var resume = container.querySelector('#resume-' + id);
    var avertissement = container.querySelector('#avert-' + id);
    function maj() {
      var v = estado.v;
      var pctRes = montant ? (v / montant) * 100 : 0;
      segRes.style.width = pctRes + '%';
      segCred.style.width = (100 - pctRes) + '%';
      resume.innerHTML = '<span class="valeur-ressource">' + v + ' ' + label + '</span>' +
        (montant - v > 0 ? ' + <span class="valeur-credit">' + (montant - v) + ' Crédit</span>' : '');
      boutons[0].disabled = v <= 0;
      boutons[1].disabled = v >= Math.min(montant, stock);
      var impossible = (montant - v) > credit;
      if (avertissement) avertissement.hidden = !impossible;
      if (onMaj) onMaj(impossible);
    }
    boutons[0].onclick = function () { estado.v = Math.max(0, estado.v - 1); maj(); };
    boutons[1].onclick = function () { estado.v = Math.min(Math.min(montant, stock), estado.v + 1); maj(); };
    maj();
  }

  // --- Flows Feuille (un par contexte.type de FEUILLE_TYPES_SUPPORTES_),
  // branchés sur les VRAIES données de la partie. ---

  function feuilleFlowOptionExclusive_(contexte) {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    feuilleRejetCourant_ = function () { resolve({ annule: true }); };
    var options = contexte.options.map(libelleOption_);
    // Coût combiné sur ce même écran UNIQUEMENT si c'est le tout premier
    // (feuillePile_ encore vide) — voir feuilleActionCourante_/
    // feuillePrepaiement_ ci-dessus.
    var infosCout = feuillePile_.length === 0 ? feuilleInfosCoutInitial_() : null;
    var estadoCout = (infosCout && infosCout.substituable) ? {} : null;
    var action = feuilleActionCourante_ && feuilleActionCourante_.action;
    var titre = action ? (feuilleActionCourante_.carte.focus + ' — ' + (action.action || 'action')) : 'Choisissez une option';
    var sectionCoutOpt = feuilleSectionCoutHTML_(infosCout, 'optCombine');
    feuillePousserEtape_({
      titre: titre, nbEtapes: 1, etapeIndex: 0,
      html: sectionCoutOpt + (sectionCoutOpt ? '<hr class="feuille-separateur">' : '') +
        '<div class="feuille-section"><p class="feuille-section-titre">Effet</p>' + feuilleRangeeChoixHTML_('opt', options, false) + '</div>',
      brancher: function (el) {
        feuilleBrancherRangeeChoix_(el, 'opt', false);
        if (infosCout && infosCout.substituable) {
          feuilleBrancherStepperCout_(el, 'optCombine', infosCout.label, infosCout.montant, infosCout.stockRessource, infosCout.stockCredit, estadoCout, function (impossible) { feuilleEls_.btnValider.disabled = impossible; });
        }
      },
      onValider: function () {
        var i = Number(feuilleEls_.corpsInner.querySelector('.rangee-choix.selectionnee').dataset.i);
        feuilleRejetCourant_ = null;
        if (infosCout && infosCout.substituable) {
          feuillePrepaiement_ = { cle: infosCout.cle, montant: infosCout.montant, utiliseRessource: estadoCout.v };
        }
        resolve({ indexChoisi: i });
      }
    }, feuillePile_.length ? 'avant' : null);
    return promise;
  }

  function feuilleFlowOptionsInclusives_(contexte) {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    var selection = [];
    feuilleRejetCourant_ = function () { resolve(selection); };
    var options = contexte.options.map(libelleOption_);
    var infosCout = feuillePile_.length === 0 ? feuilleInfosCoutInitial_() : null;
    var estadoCout = (infosCout && infosCout.substituable) ? {} : null;
    var action = feuilleActionCourante_ && feuilleActionCourante_.action;
    var titre = action ? (feuilleActionCourante_.carte.focus + ' — ' + (action.action || 'action')) : 'Une ou plusieurs options (et/ou)';
    var etape = {
      titre: titre, nbEtapes: 1, etapeIndex: 0,
      html: '',
      brancher: function (el) {
        feuilleBrancherRangeeChoix_(el, 'inc', true, function (indices) { selection = indices; etape.html = html(); });
        if (infosCout && infosCout.substituable) {
          feuilleBrancherStepperCout_(el, 'incCombine', infosCout.label, infosCout.montant, infosCout.stockRessource, infosCout.stockCredit, estadoCout, function (impossible) { feuilleEls_.btnValider.disabled = impossible; });
        }
      },
      onValider: function () {
        feuilleRejetCourant_ = null;
        if (infosCout && infosCout.substituable) {
          feuillePrepaiement_ = { cle: infosCout.cle, montant: infosCout.montant, utiliseRessource: estadoCout.v };
        }
        // ≥ 2 options choisies -> focusEngine.js va résoudre chacune, DANS
        // L'ORDRE de contexte.options (resoudreOption_/reduce), via un
        // demanderChoix INDÉPENDANT à chaque fois — voir
        // feuilleConsommerEtiquetteSequence_.
        feuilleSequenceEtOu_ = selection.length > 1
          ? { libelles: selection.map(function (i) { return options[i]; }), position: 0 }
          : null;
        resolve(selection);
      }
    };
    function html() {
      var sectionCout = feuilleSectionCoutHTML_(infosCout, 'incCombine');
      return sectionCout + (sectionCout ? '<hr class="feuille-separateur">' : '') +
        '<div class="feuille-section"><p class="feuille-section-titre">Effet — une ou plusieurs options</p>' + feuilleRangeeChoixHTML_('inc', options, true, selection) + '</div>';
    }
    etape.html = html();
    feuillePousserEtape_(etape, feuillePile_.length ? 'avant' : null);
    return promise;
  }

  function feuilleFlowPaiementRessource_(contexte) {
    // Déjà réglé sur l'écran combiné Coût+Effet précédent (feuilleFlow
    // OptionExclusive_/OptionsInclusives_) — répond immédiatement, aucun
    // écran supplémentaire (voir feuillePrepaiement_ ci-dessus).
    if (feuillePrepaiement_ && feuillePrepaiement_.cle === contexte.ressource && feuillePrepaiement_.montant === contexte.montant) {
      var reponsePrepayee = { utiliseRessource: feuillePrepaiement_.utiliseRessource };
      feuillePrepaiement_ = null;
      return Promise.resolve(reponsePrepayee);
    }
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    feuilleRejetCourant_ = function () { resolve({ annule: true }); };
    var estado = {};
    var label = CHAMP_RESSOURCE[contexte.ressource].label;
    var montant = contexte.montant;
    var stockRessource = contexte.stockRessource || 0;
    var stockCredit = contexte.stockCredit || 0;
    var combinaisonImpossible = stockRessource + stockCredit < montant;
    // Écran combiné Coût+Effet même ici, quand ce paiement est le tout
    // premier ET seul écran de l'action (ex. Focus Conquête "Préparer" —
    // effet silencieux "activer_cube", jamais de demanderChoix pour lui) :
    // affiche le texte de l'action en section "Effet", fidèle à la
    // maquette d'origine (toujours Coût + Effet, même quand l'un des deux
    // n'a rien d'interactif).
    var action = feuilleActionCourante_ && feuilleActionCourante_.action;
    var sectionEffet = (feuillePile_.length === 0 && action)
      ? '<div class="feuille-section"><p class="feuille-section-titre">Effet</p><p class="hint">' + (action.texte || 'Appliqué automatiquement.') + '</p></div>'
      : '';
    var titre = (feuillePile_.length === 0 && action) ? (feuilleActionCourante_.carte.focus + ' — ' + (action.action || 'action')) : ('Payer ' + montant + ' ' + label);
    feuillePousserEtape_({
      titre: titre, nbEtapes: 1, etapeIndex: 0,
      html: combinaisonImpossible
        ? '<p class="hint">Stock : ' + stockRessource + ' ' + label + ', ' + stockCredit + ' Crédit.</p>' +
          '<p class="hint" style="color:var(--color-coral);">Insuffisant même en substituant tout le Crédit disponible (1 Crédit = 1 ' + label + ') — Annuler.</p>'
        : '<div class="feuille-section"><p class="feuille-section-titre">Coût</p>' + feuilleStepperCoutHTML_('pay', label, montant, stockRessource, stockCredit, CHAMP_RESSOURCE[contexte.ressource] && CHAMP_RESSOURCE[contexte.ressource].couleur) + '</div>' +
          (sectionEffet ? '<hr class="feuille-separateur">' : '') + sectionEffet,
      brancher: combinaisonImpossible ? null : function (el) {
        feuilleBrancherStepperCout_(el, 'pay', label, montant, stockRessource, stockCredit, estado, function (impossible) { feuilleEls_.btnValider.disabled = impossible; });
      },
      onValider: combinaisonImpossible ? null : function () { feuilleRejetCourant_ = null; resolve({ utiliseRessource: estado.v }); }
    }, feuillePile_.length ? 'avant' : null);
    return promise;
  }

  function feuilleFlowGagnerProgramme_(contexte) {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    feuilleRejetCourant_ = function () { resolve({ annule: true }); };
    var partieProgramme = partieAffichee;
    var TYPES_PROGRAMME_ORDRE_ = ['Domination', 'Force', 'Soutien', 'Richesse'];
    var etiquette = feuilleConsommerEtiquetteSequence_();

    feuillePousserEtape_({
      titre: etiquette + 'Gagner un Programme', nbEtapes: 1, etapeIndex: 0,
      html: '<p class="hint">Chargement…</p>'
    }, feuillePile_.length > 1 ? 'avant' : null);

    DB.getAll('programmes').then(function (catalogue) {
      var pm = partieProgramme.plateauMaison || {};
      var dejaEnJeu = (Array.isArray(pm.programmesUtilises) ? pm.programmesUtilises : [])
        .filter(Boolean).map(function (s) { return s.nom; }).filter(Boolean);
      var dejaEnMain = (pm.programmesEnMain || []).concat(dejaEnJeu);
      var offres = Array.isArray(pm.offresProgramme) ? pm.offresProgramme : [];
      var typesAffiches = contexte.typeImpose ? [contexte.typeImpose] : TYPES_PROGRAMME_ORDRE_;
      var offreParNom_ = {};
      offres.forEach(function (o) { offreParNom_[o.nom] = true; });

      var disponibles = catalogue.filter(function (p) {
        return typesAffiches.indexOf(p.type) !== -1 && dejaEnMain.indexOf(p.nom) === -1;
      }).sort(function (a, b) {
        var ia = typesAffiches.indexOf(a.type), ib = typesAffiches.indexOf(b.type);
        return ia !== ib ? ia - ib : a.nom.localeCompare(b.nom);
      });

      var etapeCourante = feuillePile_[feuillePile_.length - 1];
      if (!disponibles.length) {
        etapeCourante.html = '<p class="hint">Aucun Programme disponible' + (contexte.typeImpose ? ' de type ' + contexte.typeImpose : '') + ' (déjà tous en main).</p>';
        feuilleRendreEtape_(etapeCourante, null);
        return;
      }

      // Retour utilisateur : reprend le <select>/<optgroup> (groupé par
      // type, comme #modal-choix ci-dessous) plutôt qu'une liste plate de
      // rangée-choix — étoile "★" sur le Programme actuellement révélé
      // dans l'offre publique, détail (objectif1/objectif2) affiché sous
      // le select au changement de sélection.
      var groupes = typesAffiches.map(function (type) {
        var optionsType = disponibles.filter(function (p) { return p.type === type; })
          .map(function (p) { return '<option value="' + p.nom + '">' + (offreParNom_[p.nom] ? '★ ' : '') + p.nom + '</option>'; })
          .join('');
        return optionsType ? '<optgroup label="' + type + '">' + optionsType + '</optgroup>' : '';
      }).join('');
      var parNom_ = {};
      disponibles.forEach(function (p) { parNom_[p.nom] = p; });

      etapeCourante.html = '<div class="feuille-section">' +
        '<select id="feuille-programme-select" class="modal-choix-select">' + groupes + '</select>' +
        '<p class="hint" id="feuille-programme-detail" style="margin-top:8px;"></p>' +
        '</div>';
      etapeCourante.brancher = function (el) {
        var selectProgramme = el.querySelector('#feuille-programme-select');
        var detailProgramme = el.querySelector('#feuille-programme-detail');
        function majDetail_() {
          var carte = parNom_[selectProgramme.value];
          detailProgramme.innerHTML = carte ? (carte.objectif1 || '') + '<br>' + (carte.objectif2 || '') : '';
        }
        selectProgramme.addEventListener('change', majDetail_);
        majDetail_();
      };
      etapeCourante.onValider = function () {
        var nomChoisi = feuilleEls_.corpsInner.querySelector('#feuille-programme-select').value;
        feuilleEls_.btnValider.disabled = true;
        GameService.gagnerProgramme(partieProgramme.id, nomChoisi).then(function (resultat) {
          feuilleEls_.btnValider.disabled = false;
          feuilleRejetCourant_ = null;
          resolve({ detail: 'Programme "' + resultat.nom + '" (' + resultat.type + ') obtenu.', nom: resultat.nom, type: resultat.type });
        }).catch(function (erreur) {
          feuilleEls_.btnValider.disabled = false;
          window.alert('Échec de l\'obtention du Programme : ' + erreur.message);
        });
      };
      feuilleRendreEtape_(etapeCourante, null);
    }).catch(function (erreur) {
      window.alert('Échec du chargement des Programmes : ' + erreur.message);
    });

    return promise;
  }

  function feuilleFlowDeplacerCorruption_() {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    feuilleRejetCourant_ = function () { resolve({ annule: true }); };
    var partieDeplacer = partieAffichee;
    var etiquette = feuilleConsommerEtiquetteSequence_();
    var TITRE_BASE_DEP_ = 'Déplacer une Corruption';

    var pistesCorrompuesDep = CivilisationService.PISTES.filter(function (p) {
      return !!(partieDeplacer.civilisation && partieDeplacer.civilisation.corrompues && partieDeplacer.civilisation.corrompues[p]);
    });
    var possedeChambreDep = nomsTechnologiesJoueur_(partieDeplacer).indexOf('chambres de décontamination') !== -1;
    var techChambreDep = technologieChambreDecontamination_(partieDeplacer);
    var maxChambreDep = techChambreDep ? (techChambreDep.amelioree ? 3 : 2) : 0;
    var corruptionStockeeDep = (partieDeplacer.plateauMaison && partieDeplacer.plateauMaison.corruptionChambreDecontamination) || 0;
    var optionsRetraitPisteDep_ = { conserverCorruptionRetiree: evenementConserveCorruptionActif_(partieDeplacer) };

    // Retour utilisateur : "le choix du programme peut maintenant être
    // implémenté" — emplacements 1/2/3 de la fiche Maison (hors Programme
    // de départ, emplacement 0, qui n'a pas de notion de Corruption),
    // désignés par leur NUMÉRO (visible sur l'écran Plat. maison depuis ce
    // même retour utilisateur, renderProgrammesPlateauMaison_, index.html).
    var slotsProgrammeDep = (partieDeplacer.plateauMaison && Array.isArray(partieDeplacer.plateauMaison.programmesUtilises))
      ? partieDeplacer.plateauMaison.programmesUtilises : [];
    function slotProgrammeDep_(i) { return slotsProgrammeDep[i] || { nom: null, entretienActif: false, corrompu: false }; }
    var indicesProgrammeCorrompusDep = [1, 2, 3].filter(function (i) { return slotProgrammeDep_(i).corrompu; });
    var indicesProgrammeNonCorrompusDep = [1, 2, 3].filter(function (i) { return !slotProgrammeDep_(i).corrompu; });
    function libelleSlotProgrammeDep_(i) {
      var s = slotProgrammeDep_(i);
      return 'Programme ' + i + (s.nom ? ' — ' + s.nom : '');
    }
    // Écrit .corrompu sur l'emplacement `index` (persistance directe via
    // GameService.majPlateauMaison, même pattern que le clic manuel sur la
    // case "Cor." de l'écran Plat. maison — .corruptionMaison suit le
    // même delta ±1) ; garde slotsProgrammeDep synchronisé pour un
    // éventuel second écrit dans la MÊME résolution (source ET destination
    // toutes deux "Programme", sur 2 emplacements différents).
    function ecrireProgrammeCorrompuDep_(index, corrompu) {
      var nouveauxSlots = slotsProgrammeDep.map(function (s, i) {
        return i === index ? Object.assign({}, slotProgrammeDep_(i), { corrompu: corrompu }) : s;
      });
      var delta = corrompu ? 1 : -1;
      var corruptionMaison = Math.max(0, ((partieDeplacer.plateauMaison && partieDeplacer.plateauMaison.corruptionMaison) || 0) + delta);
      return GameService.majPlateauMaison(partieDeplacer.id, { programmesUtilises: nouveauxSlots, corruptionMaison: corruptionMaison }).then(function () {
        partieDeplacer.plateauMaison.programmesUtilises = nouveauxSlots;
        partieDeplacer.plateauMaison.corruptionMaison = corruptionMaison;
        slotsProgrammeDep = nouveauxSlots;
      });
    }

    function libelleCibleDep_(c) {
      if (c.cle === 'secteur') return 'Secteur ' + c.numero;
      if (c.cle === 'piste') return 'la piste ' + CivilisationService.NOM_PISTE[c.piste];
      if (c.cle === 'techno') return 'Chambres de décontamination';
      if (c.cle === 'programme') return libelleSlotProgrammeDep_(c.index);
      return 'un Programme (manuellement)'; // repli, ne devrait plus arriver
    }
    function executerRetraitDep_(source) {
      if (source.cle === 'secteur') return SecteurService.retirerCorruption(partieDeplacer.id, source.numero);
      if (source.cle === 'piste') return CivilisationService.definirCorruption(partieDeplacer.id, source.piste, false, optionsRetraitPisteDep_);
      if (source.cle === 'programme') return ecrireProgrammeCorrompuDep_(source.index, false);
      if (source.cle === 'techno') {
        var champs = { corruptionChambreDecontamination: corruptionStockeeDep - 1 };
        return GameService.majPlateauMaison(partieDeplacer.id, champs).then(function () {
          partieDeplacer.plateauMaison.corruptionChambreDecontamination = corruptionStockeeDep - 1;
        });
      }
      return Promise.resolve();
    }
    function executerPlacementDep_(destination) {
      if (destination.cle === 'secteur') return SecteurService.placerCorruption(partieDeplacer.id, destination.numero);
      if (destination.cle === 'piste') return CivilisationService.definirCorruption(partieDeplacer.id, destination.piste, true);
      if (destination.cle === 'programme') return ecrireProgrammeCorrompuDep_(destination.index, true);
      if (destination.cle === 'techno') {
        var champs = { corruptionChambreDecontamination: corruptionStockeeDep + 1 };
        return GameService.majPlateauMaison(partieDeplacer.id, champs).then(function () {
          partieDeplacer.plateauMaison.corruptionChambreDecontamination = corruptionStockeeDep + 1;
        });
      }
      return Promise.resolve();
    }
    function terminerDeplacement_(source, destination) {
      feuilleEls_.btnValider.disabled = true;
      executerPlacementDep_(destination)
        .then(function () { return executerRetraitDep_(source); })
        .then(function () {
          feuilleRejetCourant_ = null;
          feuilleEls_.btnValider.disabled = false;
          resolve({ detail: 'Corruption déplacée de ' + libelleCibleDep_(source) + ' vers ' + libelleCibleDep_(destination) + '.' });
        })
        .catch(function (erreur) {
          feuilleEls_.btnValider.disabled = false;
          window.alert('Échec du déplacement : ' + erreur.message);
        });
    }

    // Convertit (catégorie, item choisi dans la liste) en cible {cle, ...}
    // — item est un objet secteur pour 'secteur', une chaîne pour 'piste',
    // un numéro d'emplacement pour 'programme'.
    function construireCibleDep_(cle, item) {
      if (cle === 'secteur') return { cle: 'secteur', numero: item.numero };
      if (cle === 'piste') return { cle: 'piste', piste: item };
      if (cle === 'programme') return { cle: 'programme', index: item };
      return { cle: cle };
    }
    // Rappel de la Source déjà choisie, affiché sur les étapes Destination
    // qui suivent (retour utilisateur : "afficher le choix des étapes
    // précédentes dans les étapes suivantes") — même principe que
    // l'ancienne #modal-choix 'deplacer_corruption' (identique plus bas).
    function rappelSourceDep_(source) {
      return '<p class="hint">Source : ' + libelleCibleDep_(source) + '.</p>';
    }

    function afficherSousChoixDestination_(source, cle, liste, labelFn) {
      var libelleCategorie = cle === 'secteur' ? 'Secteur' : cle === 'piste' ? 'Piste' : 'Programme';
      feuillePousserEtape_({
        titre: etiquette + TITRE_BASE_DEP_ + ' — Destination — ' + libelleCategorie, nbEtapes: 2, etapeIndex: 1,
        racineSequence: false,
        html: rappelSourceDep_(source) + '<div class="feuille-section">' + feuilleRangeeChoixHTML_('depDstSel', liste.map(labelFn), false) + '</div>',
        brancher: function (el) { feuilleBrancherRangeeChoix_(el, 'depDstSel', false); },
        onValider: function () {
          var i = Number(feuilleEls_.corpsInner.querySelector('.rangee-choix.selectionnee').dataset.i);
          terminerDeplacement_(source, construireCibleDep_(cle, liste[i]));
        }
      }, 'avant');
    }

    function chargerEtAfficherDestination_(source) {
      var etapeChargement = { titre: etiquette + TITRE_BASE_DEP_ + ' — Destination', nbEtapes: 2, etapeIndex: 1, racineSequence: false, html: rappelSourceDep_(source) + '<p class="hint">Chargement…</p>' };
      feuillePousserEtape_(etapeChargement, 'avant');

      var pistesNonCorrompuesDep = CivilisationService.PISTES.filter(function (p) {
        return !(partieDeplacer.civilisation && partieDeplacer.civilisation.corrompues && partieDeplacer.civilisation.corrompues[p]);
      });
      var chambreDisponibleDep = possedeChambreDep && corruptionStockeeDep < maxChambreDep;

      SecteurService.obtenirSecteursEligiblesGainCorruption(partieDeplacer.id).then(function (eligiblesSecteursGain) {
        var options = [];
        if (eligiblesSecteursGain.length) options.push({ cle: 'secteur', label: 'Secteur' });
        if (pistesNonCorrompuesDep.length) options.push({ cle: 'piste', label: 'Piste de Civilisation' });
        if (indicesProgrammeNonCorrompusDep.length) options.push({ cle: 'programme', label: 'Programme' });
        if (source.cle !== 'techno' && chambreDisponibleDep) {
          options.push({ cle: 'techno', label: 'Chambres de décontamination (' + (maxChambreDep - corruptionStockeeDep) + ' libre(s))' });
        }

        var etapeCourante = feuillePile_[feuillePile_.length - 1];
        // -1 : aucune coche par défaut (feuilleRangeeChoixHTML_ marque
        // sinon l'index 0 "sélectionné" — trompeur ici, ces rangées
        // naviguent IMMÉDIATEMENT au tap, ne sont jamais "sélectionnées").
        etapeCourante.html = rappelSourceDep_(source) + '<div class="feuille-section">' + feuilleRangeeChoixHTML_('depDstCat', options.map(function (o) { return o.label; }), false, -1) + '</div>';
        etapeCourante.brancher = function (el) {
          feuilleBrancherRangeeChoixImmediat_(el, 'depDstCat', function (i) {
            var cle = options[i].cle;
            if (cle === 'secteur') return afficherSousChoixDestination_(source, 'secteur', eligiblesSecteursGain, function (e) { return 'Secteur ' + e.numero; });
            if (cle === 'piste') return afficherSousChoixDestination_(source, 'piste', pistesNonCorrompuesDep, function (p) { return CivilisationService.NOM_PISTE[p]; });
            if (cle === 'programme') return afficherSousChoixDestination_(source, 'programme', indicesProgrammeNonCorrompusDep, libelleSlotProgrammeDep_);
            if (cle === 'techno') return terminerDeplacement_(source, { cle: 'techno' });
          });
        };
        feuilleRendreEtape_(etapeCourante, null);
      }).catch(function (erreur) {
        window.alert('Échec du chargement des secteurs : ' + erreur.message);
      });
    }

    function afficherSousChoixSource_(cle, liste, labelFn) {
      var libelleCategorie = cle === 'secteur' ? 'Secteur' : cle === 'piste' ? 'Piste' : 'Programme';
      feuillePousserEtape_({
        titre: etiquette + TITRE_BASE_DEP_ + ' — Source — ' + libelleCategorie, nbEtapes: 2, etapeIndex: 0,
        racineSequence: false,
        html: '<div class="feuille-section">' + feuilleRangeeChoixHTML_('depSrcSel', liste.map(labelFn), false) + '</div>',
        brancher: function (el) { feuilleBrancherRangeeChoix_(el, 'depSrcSel', false); },
        onValider: function () {
          var i = Number(feuilleEls_.corpsInner.querySelector('.rangee-choix.selectionnee').dataset.i);
          chargerEtAfficherDestination_(construireCibleDep_(cle, liste[i]));
        }
      }, feuillePile_.length ? 'avant' : null);
    }

    SecteurService.obtenirSecteursEligiblesRetraitCorruption(partieDeplacer.id).then(function (eligiblesSecteursRetrait) {
      var options = [];
      if (eligiblesSecteursRetrait.length) options.push({ cle: 'secteur', label: 'Secteur' });
      if (pistesCorrompuesDep.length) options.push({ cle: 'piste', label: 'Piste de Civilisation' });
      if (indicesProgrammeCorrompusDep.length) options.push({ cle: 'programme', label: 'Programme' });
      if (possedeChambreDep && corruptionStockeeDep > 0) {
        options.push({ cle: 'techno', label: 'Chambres de décontamination (' + corruptionStockeeDep + ' stockée(s))' });
      }

      feuillePousserEtape_({
        titre: etiquette + TITRE_BASE_DEP_ + ' — Source', nbEtapes: 2, etapeIndex: 0,
        // -1 : idem ci-dessus (voir chargerEtAfficherDestination_) — aucune
        // coche par défaut sur ces rangées "catégorie" à navigation immédiate.
        html: '<div class="feuille-section">' + feuilleRangeeChoixHTML_('depSrcCat', options.map(function (o) { return o.label; }), false, -1) + '</div>',
        brancher: function (el) {
          feuilleBrancherRangeeChoixImmediat_(el, 'depSrcCat', function (i) {
            var cle = options[i].cle;
            if (cle === 'secteur') return afficherSousChoixSource_('secteur', eligiblesSecteursRetrait, function (e) { return 'Secteur ' + e.numero; });
            if (cle === 'piste') return afficherSousChoixSource_('piste', pistesCorrompuesDep, function (p) { return CivilisationService.NOM_PISTE[p]; });
            if (cle === 'programme') return afficherSousChoixSource_('programme', indicesProgrammeCorrompusDep, libelleSlotProgrammeDep_);
            if (cle === 'techno') return chargerEtAfficherDestination_({ cle: 'techno' });
          });
        }
      }, feuillePile_.length ? 'avant' : null);
    }).catch(function (erreur) {
      window.alert('Échec du chargement des secteurs : ' + erreur.message);
    });

    return promise;
  }

  /**
   * Regrouper, DANS la feuille (retour utilisateur : "il faudrait rester
   * dans la même popup comme dans le POC" — auparavant repli volontaire
   * sur #modal-choix, voir CLES_TYPES_SUPPORTES_ ci-dessus, entrées
   * précédentes). Portage DIRECT de la branche #modal-choix 'regrouper'
   * équivalente plus bas (même logique, mêmes appels SecteurService) —
   * seul le CHROME change : une étape unique ré-affichée en place
   * (`rerender_`, comme `feuilleFlowRegrouper_`/`feuilleFlowEnvahir_`
   * partagent le même besoin de formulaire dynamique que
   * feuilleFlowDeplacerCorruption_ n'a pas), pas de `contexte.type`
   * distinct de son homologue #modal-choix (identique).
   */
  function feuilleFlowRegrouper_() {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    feuilleRejetCourant_ = function () { resolve({ annule: true }); };
    var etiquette = feuilleConsommerEtiquetteSequence_();
    var partie = partieAffichee;

    var etape = { titre: etiquette + 'Regrouper', nbEtapes: 1, etapeIndex: 0, html: '<p class="hint">Chargement des secteurs…</p>' };
    feuillePousserEtape_(etape, feuillePile_.length ? 'avant' : null);

    Promise.all([
      SecteurService.obtenirSecteurs(partie.id),
      SecteurService.obtenirAdjacences(partie.scenarioId),
      SecteurService.obtenirSecteurMere(partie.scenarioId)
    ]).then(function (resultats) {
      var secteurs = resultats[0] || [];
      var adjacenceMap = construireAdjacenceMap_(resultats[1]);
      var numeroSecteurMere = resultats[2];
      var mouvements = [];
      var secteurParNumero_ = creerSecteurParNumero_(secteurs);

      function stockRestant_(numero, type) {
        var secteur = secteurParNumero_(numero);
        var champ = SecteurService.CHAMP_PN_PAR_TYPE[type];
        var stockInitial = secteur ? (secteur[champ] || 0) : 0;
        var dejaPris = mouvements.filter(function (m) { return m.depart === numero && m.type === type; })
          .reduce(function (s, m) { return s + m.quantite; }, 0);
        return stockInitial - dejaPris;
      }
      function vousAppartient_(numero) {
        return secteurEstPossede_(secteurParNumero_(numero)) || numero === numeroSecteurMere;
      }
      function totalStockRestantDepart_(numero) {
        var secteur = secteurParNumero_(numero);
        var totalInitial = secteur
          ? ((secteur.pnCorvette || 0) + (secteur.pnSentinelle || 0) + (secteur.pnDestroyer || 0) + (secteur.pnCuirasse || 0) + (secteur.pnPorteVaisseau || 0))
          : 0;
        var dejaContribue = mouvements.filter(function (m) { return m.depart === numero; }).reduce(function (s, m) { return s + m.quantite; }, 0);
        return totalInitial - dejaContribue;
      }

      function html() {
        var total = mouvements.reduce(function (s, m) { return s + m.quantite; }, 0);
        var listeHTML = mouvements.length
          ? '<ul class="regrouper-liste">' + mouvements.map(function (m, i) {
              return '<li>' + m.quantite + '× ' + labelVaisseau_(m.type) + ' : Secteur ' + m.depart + ' → Secteur ' + m.arrivee +
                ' <button type="button" class="btn-lien regrouper-retirer" data-index="' + i + '">retirer</button></li>';
            }).join('') + '</ul>'
          : '<p class="hint">Aucun déplacement ajouté.</p>';

        return '<p class="hint">Déplacements utilisés : <strong>' + total + ' / 5</strong></p>' +
          listeHTML +
          '<div class="regrouper-form">' +
          '<label class="hint" for="feuille-regrouper-type">Type</label>' +
          '<select id="feuille-regrouper-type">' + TYPES_VAISSEAU.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') + '</select>' +
          '<label class="hint" for="feuille-regrouper-depart" style="margin-top:8px;display:block;">Départ</label>' +
          '<select id="feuille-regrouper-depart"></select>' +
          '<label class="hint" for="feuille-regrouper-arrivee" style="margin-top:8px;display:block;">Arrivée (secteur adjacent)</label>' +
          '<select id="feuille-regrouper-arrivee"></select>' +
          '<label class="hint" for="feuille-regrouper-quantite" style="margin-top:8px;display:block;">Quantité</label>' +
          '<input type="number" min="1" step="1" value="1" id="feuille-regrouper-quantite">' +
          '<button type="button" class="btn btn-secondary" id="feuille-regrouper-btn-ajouter" style="width:100%;margin-top:10px;margin-bottom:10px;">Ajouter ce déplacement</button>' +
          '</div>';
      }

      function brancher(el) {
        Array.prototype.forEach.call(el.querySelectorAll('.regrouper-retirer'), function (btn) {
          btn.addEventListener('click', function () { mouvements.splice(Number(btn.dataset.index), 1); rerender_(); });
        });

        var selectType = document.getElementById('feuille-regrouper-type');
        var selectDepart = document.getElementById('feuille-regrouper-depart');
        var selectArrivee = document.getElementById('feuille-regrouper-arrivee');
        var champQuantite = document.getElementById('feuille-regrouper-quantite');
        var btnAjouter = document.getElementById('feuille-regrouper-btn-ajouter');

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
          var total = mouvements.reduce(function (s, m) { return s + m.quantite; }, 0);

          if (!depart || !arrivee) { window.alert('Choisis un secteur de départ et d\'arrivée.'); return; }
          var dispo = stockRestant_(depart, type);
          if (quantite > dispo) { window.alert('Seulement ' + dispo + ' disponible(s) sur ce secteur pour ce type.'); return; }
          if (total + quantite > 5) { window.alert('Il ne reste que ' + (5 - total) + ' déplacement(s) sur les 5 autorisés.'); return; }
          if (depart !== numeroSecteurMere && totalStockRestantDepart_(depart) - quantite < 1) {
            window.alert('Impossible : le secteur ' + depart + ' se retrouverait sans Puissance Navale (interdit hors Secteur-Mère lors d\'un regroupement) — laisse-en au moins 1.');
            return;
          }

          mouvements.push({ type: type, depart: depart, arrivee: arrivee, quantite: quantite });
          rerender_();
        });

        feuilleEls_.btnValider.hidden = mouvements.length === 0;
        feuilleEls_.btnValider.onclick = mouvements.length === 0 ? null : function () {
          feuilleEls_.btnValider.disabled = true;
          SecteurService.regrouper(partie.id, mouvements)
            .then(function () {
              var total2 = mouvements.reduce(function (s, m) { return s + m.quantite; }, 0);
              var detail = mouvements.map(function (m) { return m.quantite + '× ' + labelVaisseau_(m.type) + ' ' + m.depart + '→' + m.arrivee; }).join(', ');
              feuilleRejetCourant_ = null;
              feuilleEls_.btnValider.disabled = false;
              resolve({ deplacements: total2, detail: detail, mouvements: mouvements });
            })
            .catch(function (erreur) {
              feuilleEls_.btnValider.disabled = false;
              window.alert('Échec du regroupement : ' + erreur.message);
            });
        };
      }

      function rerender_() {
        feuilleEls_.corpsInner.innerHTML = html();
        brancher(feuilleEls_.corpsInner);
        feuilleAjusterHauteur_();
      }

      etape.html = html();
      etape.brancher = brancher;
      rerender_();
    }).catch(function (erreur) {
      feuilleEls_.corpsInner.innerHTML = '<p class="hint">Erreur de chargement.</p>';
      window.alert('Échec du chargement des secteurs : ' + erreur.message);
    });

    return promise;
  }

  /**
   * Envahir, DANS la feuille — même principe que feuilleFlowRegrouper_ ci-
   * dessus (portage direct de la branche #modal-choix 'envahir' plus bas,
   * même logique/appels CombatService/SecteurService, seul le chrome
   * change).
   */
  function feuilleFlowEnvahir_(contexte) {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    feuilleRejetCourant_ = function () { resolve({ annule: true }); };
    var etiquette = feuilleConsommerEtiquetteSequence_();
    var corrompu = !!contexte.corrompu;
    var partieEnvahir = partieAffichee;

    function maisonDechue_(s) { return (s && s.maisonAssociee) || null; }

    var etape = { titre: etiquette + (corrompu ? 'Envahir un secteur Corrompu' : 'Envahir un secteur'), nbEtapes: 1, etapeIndex: 0, html: '<p class="hint">Chargement des secteurs…</p>' };
    feuillePousserEtape_(etape, feuillePile_.length ? 'avant' : null);

    Promise.all([
      SecteurService.obtenirSecteurs(partieEnvahir.id),
      SecteurService.obtenirAdjacences(partieEnvahir.scenarioId)
    ]).then(function (resultats) {
      var secteurs = resultats[0] || [];
      var adjacenceMap = construireAdjacenceMap_(resultats[1]);
      var secteurParNumero_ = creerSecteurParNumero_(secteurs);

      function vousAppartientEnvahir_(numero) { return secteurEstPossede_(secteurParNumero_(numero)); }

      var ciblesEligibles = secteurs.filter(function (s) {
        var eligible = corrompu ? !!s.corrompu : ((s.pnNeant || 0) > 0 || !!maisonDechue_(s));
        return !vousAppartientEnvahir_(s.numero) && eligible && (adjacenceMap[s.numero] || []).some(vousAppartientEnvahir_);
      });

      if (!ciblesEligibles.length) {
        etape.html = '<p class="hint">Aucun secteur ' + (corrompu ? 'Corrompu' : 'du Néant ou de Maison déchue') + ' adjacent à l’un de vos secteurs actuellement.</p>';
        etape.onValider = null;
        feuilleRendreEtape_(etape, null);
        return;
      }

      function totalStockSecteur_(numero) {
        var s = secteurParNumero_(numero);
        if (!s) return 0;
        return (s.pnCorvette || 0) + (s.pnSentinelle || 0) + (s.pnDestroyer || 0) + (s.pnCuirasse || 0) + (s.pnPorteVaisseau || 0);
      }
      var contributions = [];
      function stockRestantType_(numero, type) {
        var s = secteurParNumero_(numero);
        var champ = SecteurService.CHAMP_PN_PAR_TYPE[type];
        var initial = s ? (s[champ] || 0) : 0;
        var pris = contributions.filter(function (c) { return c.secteur === numero && c.type === type; }).reduce(function (som, c) { return som + c.quantite; }, 0);
        return initial - pris;
      }
      function totalContribueSecteur_(numero) {
        return contributions.filter(function (c) { return c.secteur === numero; }).reduce(function (som, c) { return som + c.quantite; }, 0);
      }

      function html() {
        var selectCibleExistant = document.getElementById('feuille-envahir-select-cible');
        var cible = Number((selectCibleExistant && selectCibleExistant.value) || ciblesEligibles[0].numero);
        var totalEngage = contributions.reduce(function (s, c) { return s + c.quantite; }, 0);

        var listeHTML = contributions.length
          ? '<ul class="regrouper-liste">' + contributions.map(function (c, i) {
              return '<li>' + c.quantite + '× ' + labelVaisseau_(c.type) + ' : Secteur ' + c.secteur + ' → Secteur ' + cible +
                ' <button type="button" class="btn-lien envahir-retirer" data-index="' + i + '">retirer</button></li>';
            }).join('') + '</ul>'
          : '<p class="hint">Aucune unité engagée.</p>';

        return '<label class="hint" for="feuille-envahir-select-cible">Secteur ' + (corrompu ? 'Corrompu' : 'du Néant') + ' à envahir</label>' +
          '<select id="feuille-envahir-select-cible">' +
          ciblesEligibles.map(function (s) {
            var maison = maisonDechue_(s);
            var etiquette2 = maison ? ('Maison déchue : ' + maison) : ('Néant : ' + (s.pnNeant || 0));
            return '<option value="' + s.numero + '"' + (s.numero === cible ? ' selected' : '') + '>Secteur ' + s.numero + ' (' + etiquette2 + ')</option>';
          }).join('') +
          '</select>' +
          '<p class="hint" style="margin-top:10px;"><strong>' + totalEngage + '</strong> unité(s) de Puissance Navale engagée(s).</p>' +
          listeHTML +
          '<div class="regrouper-form">' +
          '<label class="hint" for="feuille-envahir-type">Type</label>' +
          '<select id="feuille-envahir-type">' + TYPES_VAISSEAU.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') + '</select>' +
          '<label class="hint" for="feuille-envahir-secteur-source" style="margin-top:8px;display:block;">Secteur source (adjacent à la cible, à vous)</label>' +
          '<select id="feuille-envahir-secteur-source"></select>' +
          '<label class="hint" for="feuille-envahir-quantite" style="margin-top:8px;display:block;">Quantité</label>' +
          '<input type="number" min="1" step="1" value="1" id="feuille-envahir-quantite">' +
          '<button type="button" class="btn btn-secondary" id="feuille-envahir-btn-ajouter" style="width:100%;margin-top:10px;margin-bottom:10px;">Engager cette unité</button>' +
          '</div>';
      }

      function brancher(el) {
        Array.prototype.forEach.call(el.querySelectorAll('.envahir-retirer'), function (btn) {
          btn.addEventListener('click', function () { contributions.splice(Number(btn.dataset.index), 1); rerender_(); });
        });

        var selectCible = document.getElementById('feuille-envahir-select-cible');
        var selectType = document.getElementById('feuille-envahir-type');
        var selectSource = document.getElementById('feuille-envahir-secteur-source');
        var champQuantite = document.getElementById('feuille-envahir-quantite');
        var btnAjouter = document.getElementById('feuille-envahir-btn-ajouter');

        function majSources() {
          var cibleActuelle = Number(selectCible.value);
          var type = selectType.value;
          var options = (adjacenceMap[cibleActuelle] || [])
            .filter(vousAppartientEnvahir_)
            .map(function (numero) { return { numero: numero, stockType: stockRestantType_(numero, type), totalRestant: totalStockSecteur_(numero) - totalContribueSecteur_(numero) }; })
            .filter(function (o) { return o.stockType > 0 && o.totalRestant > 1; });
          selectSource.innerHTML = options.length
            ? options.map(function (o) { return '<option value="' + o.numero + '">Secteur ' + o.numero + ' (' + o.stockType + ' disponible(s), ' + o.totalRestant + ' au total)</option>'; }).join('')
            : '<option value="">Aucun secteur disponible</option>';
        }

        selectCible.addEventListener('change', function () { contributions.length = 0; rerender_(); });
        selectType.addEventListener('change', majSources);
        majSources();

        btnAjouter.addEventListener('click', function () {
          var type = selectType.value;
          var numeroSource = Number(selectSource.value);
          var quantite = Math.max(1, Math.floor(Number(champQuantite.value) || 1));

          if (!numeroSource) { window.alert('Choisis un secteur source.'); return; }
          var dispoType = stockRestantType_(numeroSource, type);
          if (quantite > dispoType) { window.alert('Seulement ' + dispoType + ' disponible(s) sur ce secteur pour ce type.'); return; }
          var totalRestantApres = totalStockSecteur_(numeroSource) - totalContribueSecteur_(numeroSource) - quantite;
          if (totalRestantApres < 1) { window.alert('Impossible : le secteur ' + numeroSource + ' se retrouverait sans Puissance Navale — laisse-en au moins 1.'); return; }

          contributions.push({ type: type, secteur: numeroSource, quantite: quantite });
          rerender_();
        });

        feuilleEls_.btnValider.hidden = contributions.length === 0;
        feuilleEls_.btnValider.onclick = contributions.length === 0 ? null : function () {
          var cibleFinale = Number(selectCible.value);
          var secteurCible = secteurParNumero_(cibleFinale);
          if (!secteurCible) { window.alert('Secteur cible introuvable.'); return; }

          var totalEngage = contributions.reduce(function (s, c) { return s + c.quantite; }, 0);
          var unitesAttaquant = {};
          contributions.forEach(function (c) {
            var champ = VAISSEAU_VERS_CHAMP_COMBAT[c.type];
            unitesAttaquant[champ] = (unitesAttaquant[champ] || 0) + c.quantite;
          });

          var resultatCombat = CombatService.resoudreInvasion(partieEnvahir, unitesAttaquant, secteurCible);
          var victoire = !!(resultatCombat.vainqueur && resultatCombat.vainqueur.nom === partieEnvahir.joueur.nom);

          var totalSurvivantsAttaquant = Object.keys(resultatCombat.survivantsAttaquant || {})
            .reduce(function (s, k) { return s + (resultatCombat.survivantsAttaquant[k] || 0); }, 0);
          var cubesPerdus = Math.max(0, totalEngage - totalSurvivantsAttaquant);

          var detailContributions = contributions.map(function (c) { return c.quantite + '× ' + labelVaisseau_(c.type) + ' (secteur ' + c.secteur + ')'; }).join(', ');
          var maisonCible = maisonDechue_(secteurCible);

          feuilleEls_.btnValider.disabled = true;

          var sourcesPayload = contributions.map(function (c) { return { type: c.type, secteur: c.secteur, quantite: c.quantite }; });
          var survivantsPayload = {};
          if (victoire && resultatCombat.survivantsAttaquant) {
            Object.keys(resultatCombat.survivantsAttaquant).forEach(function (champCombat) {
              var cleColonne = champCombat === 'portevaisseau' ? 'porte_vaisseau' : champCombat;
              survivantsPayload[cleColonne] = resultatCombat.survivantsAttaquant[champCombat];
            });
          }

          SecteurService.envahirResoudre(partieEnvahir.id, cibleFinale, sourcesPayload, victoire, survivantsPayload)
            .then(function (jetonsRetires) {
              jetonsRetires = jetonsRetires || {};
              var influenceGagnee = 0;
              if (victoire) {
                var jetonsGloireGagnes = Array.isArray(jetonsRetires.jetonGloire)
                  ? jetonsRetires.jetonGloire
                  : (jetonsRetires.jetonGloire ? [jetonsRetires.jetonGloire] : []);
                var auMoinsUnGloirePlace = false;
                jetonsGloireGagnes.forEach(function (valeurGloire) {
                  if (!(valeurGloire > 0)) return;
                  var indexLibre = etatGloire.indexOf(null);
                  if (indexLibre === -1) indexLibre = etatGloire.indexOf(undefined);
                  if (indexLibre !== -1) { etatGloire[indexLibre] = valeurGloire; auMoinsUnGloirePlace = true; }
                });
                if (auMoinsUnGloirePlace) {
                  GameService.majPlateauMaison(partieEnvahir.id, { gloire: etatGloire }).catch(function (e) { window.alert('Échec de l’enregistrement de la Gloire : ' + e.message); });
                  renderGloireDOM_(partieEnvahir);
                }
                influenceGagnee = etatGloire.reduce(function (s, v) { return s + (v || 0); }, 0);
              }

              var detail = 'Invasion du secteur ' + cibleFinale +
                (corrompu ? ' (Corrompu)' : (maisonCible ? ' (Maison déchue : ' + maisonCible + ')' : ' (Néant)')) +
                ' avec ' + totalEngage + ' unité(s) [' + detailContributions + '] — ' +
                (victoire
                  ? 'VICTOIRE (' + resultatCombat.cubesRestants + ' cube(s) déposé(s) sur le secteur' +
                    (maisonCible ? ', bonus de Maison déchue « ' + maisonCible + ' » non appliqué pour l’instant' : '') +
                    (cubesPerdus > 0 ? ', ' + cubesPerdus + ' cube(s) perdu(s) au combat reversé(s) en Cube actif' : '') + ').'
                  : 'ÉCHEC — flotte anéantie, unités reversées en Cube actif ; secteur(s) source vidé(s) éventuellement repris par le Néant.');

              var avertissement = null;
              var abandonnes = jetonsRetires.secteursAbandonnes || [];
              if (abandonnes.length) {
                avertissement = 'Secteur(s) ' + abandonnes.join(', ') + ' repris par le Néant (vidé(s) de Puissance Navale) — défaussez un jeton Gloire de votre choix par secteur, si vous en avez (à faire manuellement, hors périmètre cette session).';
              }

              feuilleRejetCourant_ = null;
              feuilleEls_.btnValider.disabled = false;
              window.alert(resultatCombat.log.join('\n'));
              resolve({
                victoire: victoire,
                jetonPrime: victoire ? (jetonsRetires.jetonPrime || 0) : 0,
                jetonLiberation: victoire ? (jetonsRetires.jetonLiberation || 0) : 0,
                influenceGagnee: influenceGagnee,
                totalEngage: totalEngage,
                cubesPerdus: cubesPerdus,
                detail: detail,
                avertissement: avertissement
              });
            })
            .catch(function (erreur) {
              feuilleEls_.btnValider.disabled = false;
              window.alert('Échec de la résolution : ' + erreur.message);
            });
        };
      }

      function rerender_() {
        feuilleEls_.corpsInner.innerHTML = html();
        brancher(feuilleEls_.corpsInner);
        feuilleAjusterHauteur_();
      }

      etape.html = html();
      etape.brancher = brancher;
      rerender_();
    }).catch(function (erreur) {
      feuilleEls_.corpsInner.innerHTML = '<p class="hint">Erreur de chargement.</p>';
      window.alert('Échec du chargement des secteurs : ' + erreur.message);
    });

    return promise;
  }

  function demanderChoixFeuille_(contexte) {
    if (contexte.type === 'option_exclusive') return feuilleFlowOptionExclusive_(contexte);
    if (contexte.type === 'options_inclusives') return feuilleFlowOptionsInclusives_(contexte);
    if (contexte.type === 'paiement_ressource') return feuilleFlowPaiementRessource_(contexte);
    if (contexte.type === 'gagner_programme') return feuilleFlowGagnerProgramme_(contexte);
    if (contexte.type === 'deplacer_corruption') return feuilleFlowDeplacerCorruption_();
    if (contexte.type === 'regrouper') return feuilleFlowRegrouper_();
    if (contexte.type === 'envahir') return feuilleFlowEnvahir_(contexte);
    return Promise.resolve({ annule: true }); // ne devrait pas arriver, voir FEUILLE_TYPES_SUPPORTES_
  }

  function demanderChoix(contexte) {
    // Feuille d'action (Focus Conquête Standard uniquement, voir
    // carteEligibleFeuille_ ci-dessus) : intercepte les types qu'elle sait
    // résoudre (TOUS ceux déclenchés par cette carte, y compris
    // 'regrouper'/'envahir' depuis leur portage direct — voir
    // FEUILLE_TYPES_SUPPORTES_), court-circuitant TOUT le reste de cette
    // fonction (y compris `modal.hidden = false` tout en bas) —
    // #modal-choix ne s'affiche donc jamais pour cette carte. Tout autre
    // type (aucun connu actuellement pour Conquête Standard — filet de
    // sécurité si le catalogue évoluait) et toute autre carte retombent
    // sur le reste de cette fonction, INCHANGÉ.
    if (carteEnFeuille_ && FEUILLE_TYPES_SUPPORTES_.indexOf(contexte.type) !== -1) {
      return demanderChoixFeuille_(contexte);
    }
    // Repli #modal-choix (filet de sécurité, ne devrait plus se produire
    // pour Conquête Standard depuis que 'regrouper'/'envahir' sont dans
    // FEUILLE_TYPES_SUPPORTES_) : masque la feuille le temps de cette
    // étape SANS l'annuler (feuilleFermer_ ne touche jamais feuillePile_/
    // feuilleSequenceEtOu_) — elle ressurgirait automatiquement si un type
    // Feuille revenait ensuite (feuillePousserEtape_ annule ce masquage).
    if (carteEnFeuille_) feuilleFermer_();

    var modal = document.getElementById('modal-choix');
    var titre = document.getElementById('modal-choix-titre');
    var contenu = document.getElementById('modal-choix-contenu');
    var btnValider = document.getElementById('modal-choix-valider');
    var btnAnnuler = document.getElementById('modal-choix-annuler');

    // btnValider est un nœud DOM unique réutilisé par TOUTES les popups
    // (fermerModale_ ne fait que masquer la modale, jamais réinitialiser
    // .disabled). Plusieurs branches ci-dessous désactivent btnValider
    // pendant un appel async puis le réactivent dans leur .then/.catch —
    // un chemin de sortie qui oublierait de le réactiver laisserait donc
    // la PROCHAINE popup — même un simple type 'confirmation' qui ne
    // touche jamais lui-même à .disabled — bloquée sans indice visuel
    // (aucun style ne distingue un bouton disabled ici). Reset défensif
    // systématique à l'ouverture de toute nouvelle popup plutôt que de
    // traquer laquelle des branches a la fuite.
    btnValider.disabled = false;

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

      } else if (contexte.type === 'paiement_ressource') {
        // Coût en Nourriture/Énergie/Matériel dont la réserve seule ne
        // suffit pas (todo.md, retour utilisateur — voir focusEngine.js,
        // resoudreCle_, cas dédié : cette popup n'ouvre QUE face à un
        // manque, jamais quand la réserve suffit seule). Laisse le joueur
        // répartir librement le montant entre la ressource restante et le
        // Crédit (docs-rules-Influence-et-ressources.md §2, 1 Crédit pour
        // 1 unité manquante) — SANS obligation d'utiliser tout le stock
        // encore disponible (le joueur peut préférer le préserver et
        // payer davantage en Crédit). resolve({utiliseRessource}) — le
        // reste (montant - utiliseRessource) est en Crédit, calculé par
        // focusEngine.js ; resolve({annule:true}) si le joueur renonce ou
        // si même la combinaison complète ne suffit pas (bouton Valider
        // alors désactivé/cette dernière possibilité affichée en clair).
        var labelRessourcePaiement = CHAMP_RESSOURCE[contexte.ressource].label;
        var montantPaiement = contexte.montant;
        var stockRessourcePaiement = contexte.stockRessource || 0;
        var stockCreditPaiement = contexte.stockCredit || 0;
        var combinaisonImpossible = stockRessourcePaiement + stockCreditPaiement < montantPaiement;

        titre.textContent = 'Payer ' + montantPaiement + ' ' + labelRessourcePaiement;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        if (combinaisonImpossible) {
          contenu.innerHTML = '<p class="hint">Stock : ' + stockRessourcePaiement + ' ' + labelRessourcePaiement + ', ' + stockCreditPaiement + ' Crédit.</p>' +
            '<p class="hint" style="color:var(--color-coral);">Insuffisant même en substituant tout le Crédit disponible (1 Crédit = 1 ' + labelRessourcePaiement + ') — Annuler.</p>';
          btnValider.hidden = true;
        } else {
          btnValider.hidden = false;
          btnValider.textContent = 'Valider';

          var render = function () {
            var input = document.getElementById('paiement-ressource-input');
            var utiliseRessourcePaiement = Math.max(0, Math.min(montantPaiement, Math.floor(Number(input.value)) || 0));
            var utiliseCreditPaiement = montantPaiement - utiliseRessourcePaiement;
            var possible = utiliseCreditPaiement <= stockCreditPaiement;
            document.getElementById('paiement-ressource-resume').textContent =
              utiliseRessourcePaiement + ' ' + labelRessourcePaiement + (utiliseCreditPaiement > 0 ? ' + ' + utiliseCreditPaiement + ' Crédit (substitution)' : '');
            btnValider.disabled = !possible;
            btnValider.onclick = possible ? function () { fermerModale_(); resolve({ utiliseRessource: utiliseRessourcePaiement }); } : null;
          };

          contenu.innerHTML =
            '<p class="hint" id="paiement-ressource-resume"></p>' +
            '<p class="hint">Stock : ' + stockRessourcePaiement + ' ' + labelRessourcePaiement + ', ' + stockCreditPaiement + ' Crédit (1 Crédit = 1 ' + labelRessourcePaiement + ' manquant).</p>' +
            '<label class="hint" for="paiement-ressource-input">Payer en ' + labelRessourcePaiement + ' (le reste en Crédit)</label>' +
            '<input type="number" min="0" max="' + montantPaiement + '" step="1" value="' + Math.min(montantPaiement, stockRessourcePaiement) + '" id="paiement-ressource-input" class="modal-choix-select">';

          document.getElementById('paiement-ressource-input').addEventListener('input', render);
          render();
        }

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
        // "Gagner"/"Dépensez" plutôt que "Choisissez" des deux côtés
        // (todo.md, retour utilisateur — Focus Héroïque Renfort
        // "Accélérer") : plus clair sur le SENS de l'effet (gain vs coût),
        // "Choisissez" ne le précisait pas.
        titre.textContent = (contexte.signe > 0 ? 'Gagner ' : 'Dépensez ') + contexte.nombre + ' ressource(s) au choix';
        btnAnnuler.hidden = true;
        btnValider.hidden = false;
        btnValider.textContent = 'Valider (arrêter ici)';
        btnValider.onclick = function () { fermerModale_(); resolve(choisies); };

        // Nombre de fois où CETTE ressource a déjà été cliquée dans cette
        // ouverture de popup — affiché directement sur son bouton (todo.md,
        // retour utilisateur : "à chaque clic indiquer combien de
        // ressources on a choisi, ex +x afficher sur le bouton").
        function compteurChoisi_(cle) {
          return choisies.filter(function (c) { return c === cle; }).length;
        }

        function render() {
          contenu.innerHTML = '<p class="hint">Il reste ' + restant + ' à choisir (ou "Valider" pour arrêter avant).</p>' +
            '<div class="modal-choix-boutons">' + RESSOURCES_PRODUCTION.map(function (cle) {
              var n = compteurChoisi_(cle);
              return '<button class="btn btn-secondary btn-choix-ressource" data-ressource="' + cle + '">' + CHAMP_RESSOURCE[cle].label +
                (n > 0 ? ' <span class="choix-ressource-compteur">+' + n + '</span>' : '') + '</button>';
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

      } else if (contexte.type === 'confirmation') {
        // Confirmation générique (message + Annuler/Valider), même
        // modale que les autres types de choix — pour une action sans
        // sélection à faire (juste un coût à confirmer avant de débiter,
        // le reste restant manuel, hors périmètre — ex. le choix de la
        // Technologie pour l'option Science -> Technologie).
        titre.textContent = contexte.titre || 'Confirmer';
        contenu.innerHTML = '<p class="hint">' + (contexte.message || '') + '</p>';
        btnAnnuler.hidden = false;
        btnValider.hidden = false;
        btnValider.textContent = contexte.texteValider || 'Valider';
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };
        btnValider.onclick = function () { fermerModale_(); resolve({ confirme: true }); };

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
          SecteurService.obtenirAdjacences(partie.scenarioId),
          SecteurService.obtenirSecteurMere(partie.scenarioId)
        ]).then(function (resultats) {
          var secteurs = resultats[0] || [];
          var adjacenceMap = construireAdjacenceMap_(resultats[1]);
          var numeroSecteurMere = resultats[2];

          var mouvements = []; // état local à cette ouverture de popup

          var secteurParNumero_ = creerSecteurParNumero_(secteurs);

          function stockRestant_(numero, type) {
            var secteur = secteurParNumero_(numero);
            var champ = SecteurService.CHAMP_PN_PAR_TYPE[type];
            var stockInitial = secteur ? (secteur[champ] || 0) : 0;
            var dejaPris = mouvements
              .filter(function (m) { return m.depart === numero && m.type === type; })
              .reduce(function (somme, m) { return somme + m.quantite; }, 0);
            return stockInitial - dejaPris;
          }

          // EVOLUTION 15 (todo.md) : le Secteur-Mère vous appartient
          // TOUJOURS, même à 0 Puissance Navale (jamais repris par le
          // Néant) — proposé comme destination/secteur "à vous" même vide,
          // ce que secteurEstPossede_ (PN > 0 requis) ne capture pas seul.
          function vousAppartient_(numero) {
            return secteurEstPossede_(secteurParNumero_(numero)) || numero === numeroSecteurMere;
          }

          // Total de Puissance Navale (tous types confondus) encore présent
          // sur un secteur de départ après les mouvements déjà ajoutés à
          // cette popup — pour interdire de le vider hors Secteur-Mère
          // (EVOLUTION 15, même règle que SecteurService.regrouper qui
          // revalidera de toute façon à la persistance).
          function totalStockRestantDepart_(numero) {
            var secteur = secteurParNumero_(numero);
            var totalInitial = secteur
              ? ((secteur.pnCorvette || 0) + (secteur.pnSentinelle || 0) + (secteur.pnDestroyer || 0) + (secteur.pnCuirasse || 0) + (secteur.pnPorteVaisseau || 0))
              : 0;
            var dejaContribue = mouvements
              .filter(function (m) { return m.depart === numero; })
              .reduce(function (somme, m) { return somme + m.quantite; }, 0);
            return totalInitial - dejaContribue;
          }

          function render() {
            var total = mouvements.reduce(function (s, m) { return s + m.quantite; }, 0);

            var listeHTML = mouvements.length
              ? '<ul class="regrouper-liste">' + mouvements.map(function (m, i) {
                  var labelType = labelVaisseau_(m.type);
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
              '<button type="button" class="btn btn-secondary" id="regrouper-btn-ajouter" style="width:100%;margin-top:10px;margin-bottom:10px;">Ajouter ce déplacement</button>' +
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
              // EVOLUTION 15 : jamais vider un secteur de départ hors Secteur-Mère.
              if (depart !== numeroSecteurMere && totalStockRestantDepart_(depart) - quantite < 1) {
                window.alert('Impossible : le secteur ' + depart + ' se retrouverait sans Puissance Navale (interdit hors Secteur-Mère lors d\'un regroupement) — laisse-en au moins 1.');
                return;
              }

              mouvements.push({ type: type, depart: depart, arrivee: arrivee, quantite: quantite });
              render();
            });

            btnValider.hidden = mouvements.length === 0;
            btnValider.textContent = 'Valider';
            btnValider.onclick = function () {
              btnValider.disabled = true;
              btnValider.textContent = 'Passage en cours…';
              SecteurService.regrouper(partie.id, mouvements)
                .then(function () {
                  var detail = mouvements.map(function (m) {
                    var labelType = labelVaisseau_(m.type);
                    return m.quantite + '× ' + labelType + ' ' + m.depart + '→' + m.arrivee;
                  }).join(', ');
                  fermerModale_();
                  btnValider.disabled = false;
                  resolve({ deplacements: total, detail: detail, mouvements: mouvements });
                })
                .catch(function (erreur) {
                  btnValider.disabled = false;
                  btnValider.textContent = 'Valider';
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

        // EVOLUTION todo.md (retour utilisateur) : le Secteur-Mère vous
        // appartient TOUJOURS, même à 0 Puissance Navale (jamais repris
        // par le Néant — même règle déjà appliquée à Regrouper,
        // EVOLUTION 15) — `numeroSecteurMere` (optionnel, résolu par les
        // modes 'par_chantier'/'libre' ci-dessous ; 'secteur_mere' cible
        // déjà directement le Secteur-Mère sans passer par cette fonction)
        // le rend éligible comme cible de déploiement même vide.
        function vousAppartientDeploiement_(secteurs, numeroSecteurMere) {
          var parNumero = creerSecteurParNumero_(secteurs);
          return function (numero) { return secteurEstPossede_(parNumero(numero)) || numero === numeroSecteurMere; };
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
            '<button type="button" class="btn btn-secondary" id="deployer-ajouter" style="width:100%;margin:16px 0;">Ajouter ce déploiement</button>' +
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
          Promise.all([
            SecteurService.obtenirSecteurs(partieDeploiement.id),
            SecteurService.obtenirSecteurMere(partieDeploiement.scenarioId)
          ]).then(function (resultats) {
            var secteurs = resultats[0];
            var vousAppartient = vousAppartientDeploiement_(secteurs, resultats[1]);
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
          Promise.all([
            SecteurService.obtenirSecteurs(partieDeploiement.id),
            SecteurService.obtenirSecteurMere(partieDeploiement.scenarioId)
          ]).then(function (resultats) {
            var secteurs = resultats[0];
            var vousAppartient = vousAppartientDeploiement_(secteurs, resultats[1]);
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

      } else if (contexte.type === 'envahir') {
        var corrompu = !!contexte.corrompu;
        titre.textContent = corrompu ? 'Envahir un secteur Corrompu' : 'Envahir un secteur';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieEnvahir = partieAffichee;

        function maisonDechue_(s) {
          return (s && s.maisonAssociee) || null;
        }

        Promise.all([
          SecteurService.obtenirSecteurs(partieEnvahir.id),
          SecteurService.obtenirAdjacences(partieEnvahir.scenarioId)
        ]).then(function (resultats) {
          var secteurs = resultats[0] || [];
          var adjacenceMap = construireAdjacenceMap_(resultats[1]);

          var secteurParNumero_ = creerSecteurParNumero_(secteurs);

          function vousAppartientEnvahir_(numero) {
            return secteurEstPossede_(secteurParNumero_(numero));
          }

          // Portage direct de calculerCiblesEnvahir_ : la Corruption est
          // un attribut INDÉPENDANT de l'appartenance au Néant/Maison
          // déchue — "envahir" (corrompu=false) ne filtre pas sur
          // !s.corrompu, seul "envahir_corrompu" exige s.corrompu === true.
          var ciblesEligibles = secteurs.filter(function (s) {
            var eligible = corrompu ? !!s.corrompu : ((s.pnNeant || 0) > 0 || !!maisonDechue_(s));
            return !vousAppartientEnvahir_(s.numero) && eligible && (adjacenceMap[s.numero] || []).some(vousAppartientEnvahir_);
          });

          if (!ciblesEligibles.length) {
            contenu.innerHTML = '<p class="hint">Aucun secteur ' + (corrompu ? 'Corrompu' : 'du Néant ou de Maison déchue') + ' adjacent à l\u2019un de vos secteurs actuellement.</p>';
            return;
          }

          function totalStockSecteur_(numero) {
            var s = secteurParNumero_(numero);
            if (!s) return 0;
            return (s.pnCorvette || 0) + (s.pnSentinelle || 0) + (s.pnDestroyer || 0) + (s.pnCuirasse || 0) + (s.pnPorteVaisseau || 0);
          }

          var contributions = []; // {type, secteur, quantite}

          function stockRestantType_(numero, type) {
            var s = secteurParNumero_(numero);
            var champ = SecteurService.CHAMP_PN_PAR_TYPE[type];
            var initial = s ? (s[champ] || 0) : 0;
            var pris = contributions.filter(function (c) { return c.secteur === numero && c.type === type; })
              .reduce(function (som, c) { return som + c.quantite; }, 0);
            return initial - pris;
          }

          function totalContribueSecteur_(numero) {
            return contributions.filter(function (c) { return c.secteur === numero; })
              .reduce(function (som, c) { return som + c.quantite; }, 0);
          }

          function render() {
            var selectCibleExistant = document.getElementById('envahir-select-cible');
            var cible = Number((selectCibleExistant && selectCibleExistant.value) || ciblesEligibles[0].numero);
            var totalEngage = contributions.reduce(function (s, c) { return s + c.quantite; }, 0);

            var listeHTML = contributions.length
              ? '<ul class="regrouper-liste">' + contributions.map(function (c, i) {
                  var labelType = labelVaisseau_(c.type);
                  return '<li>' + c.quantite + '× ' + labelType + ' : Secteur ' + c.secteur + ' → Secteur ' + cible +
                    ' <button type="button" class="btn-lien envahir-retirer" data-index="' + i + '">retirer</button></li>';
                }).join('') + '</ul>'
              : '<p class="hint">Aucune unité engagée.</p>';

            contenu.innerHTML = '' +
              '<label class="hint" for="envahir-select-cible">Secteur ' + (corrompu ? 'Corrompu' : 'du Néant') + ' à envahir</label>' +
              '<select id="envahir-select-cible">' +
              ciblesEligibles.map(function (s) {
                var maison = maisonDechue_(s);
                var etiquette = maison ? ('Maison déchue : ' + maison) : ('Néant : ' + (s.pnNeant || 0));
                return '<option value="' + s.numero + '"' + (s.numero === cible ? ' selected' : '') + '>Secteur ' + s.numero + ' (' + etiquette + ')</option>';
              }).join('') +
              '</select>' +
              '<p class="hint" style="margin-top:10px;"><strong>' + totalEngage + '</strong> unité(s) de Puissance Navale engagée(s).</p>' +
              listeHTML +
              '<div class="regrouper-form">' +
              '<label class="hint" for="envahir-type">Type</label>' +
              '<select id="envahir-type">' + TYPES_VAISSEAU.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') + '</select>' +
              '<label class="hint" for="envahir-secteur-source" style="margin-top:8px;display:block;">Secteur source (adjacent à la cible, à vous)</label>' +
              '<select id="envahir-secteur-source"></select>' +
              '<label class="hint" for="envahir-quantite" style="margin-top:8px;display:block;">Quantité</label>' +
              '<input type="number" min="1" step="1" value="1" id="envahir-quantite">' +
              '<button type="button" class="btn btn-secondary" id="envahir-btn-ajouter" style="width:100%;margin-top:10px;margin-bottom:10px;">Engager cette unité</button>' +
              '</div>';

            Array.prototype.forEach.call(contenu.querySelectorAll('.envahir-retirer'), function (btn) {
              btn.addEventListener('click', function () {
                contributions.splice(Number(btn.dataset.index), 1);
                render();
              });
            });

            var selectCible = document.getElementById('envahir-select-cible');
            var selectType = document.getElementById('envahir-type');
            var selectSource = document.getElementById('envahir-secteur-source');
            var champQuantite = document.getElementById('envahir-quantite');
            var btnAjouter = document.getElementById('envahir-btn-ajouter');

            function majSources() {
              var cibleActuelle = Number(selectCible.value);
              var type = selectType.value;
              var options = (adjacenceMap[cibleActuelle] || [])
                .filter(vousAppartientEnvahir_)
                .map(function (numero) {
                  return { numero: numero, stockType: stockRestantType_(numero, type), totalRestant: totalStockSecteur_(numero) - totalContribueSecteur_(numero) };
                })
                // "Secteur jamais vide" : il doit rester au moins 1 unité
                // au total sur le secteur après contribution.
                .filter(function (o) { return o.stockType > 0 && o.totalRestant > 1; });
              selectSource.innerHTML = options.length
                ? options.map(function (o) { return '<option value="' + o.numero + '">Secteur ' + o.numero + ' (' + o.stockType + ' disponible(s), ' + o.totalRestant + ' au total)</option>'; }).join('')
                : '<option value="">Aucun secteur disponible</option>';
            }

            // Changer de cible réinitialise les unités déjà engagées : les
            // secteurs sources adjacents ne sont plus forcément les mêmes.
            selectCible.addEventListener('change', function () { contributions.length = 0; render(); });
            selectType.addEventListener('change', majSources);
            majSources();

            btnAjouter.addEventListener('click', function () {
              var type = selectType.value;
              var numeroSource = Number(selectSource.value);
              var quantite = Math.max(1, Math.floor(Number(champQuantite.value) || 1));

              if (!numeroSource) { window.alert('Choisis un secteur source.'); return; }
              var dispoType = stockRestantType_(numeroSource, type);
              if (quantite > dispoType) { window.alert('Seulement ' + dispoType + ' disponible(s) sur ce secteur pour ce type.'); return; }
              var totalRestantApres = totalStockSecteur_(numeroSource) - totalContribueSecteur_(numeroSource) - quantite;
              if (totalRestantApres < 1) { window.alert('Impossible : le secteur ' + numeroSource + ' se retrouverait sans Puissance Navale — laisse-en au moins 1.'); return; }

              contributions.push({ type: type, secteur: numeroSource, quantite: quantite });
              render();
            });

            btnValider.hidden = contributions.length === 0;
            btnValider.textContent = 'Valider';
            btnValider.onclick = function () {
              var cibleFinale = Number(selectCible.value);
              var secteurCible = secteurParNumero_(cibleFinale);
              if (!secteurCible) { window.alert('Secteur cible introuvable.'); return; }

              var unitesAttaquant = {};
              contributions.forEach(function (c) {
                var champ = VAISSEAU_VERS_CHAMP_COMBAT[c.type];
                unitesAttaquant[champ] = (unitesAttaquant[champ] || 0) + c.quantite;
              });

              var resultatCombat = CombatService.resoudreInvasion(partieEnvahir, unitesAttaquant, secteurCible);
              var victoire = !!(resultatCombat.vainqueur && resultatCombat.vainqueur.nom === partieEnvahir.joueur.nom);

              // EVOLUTION 16 (todo.md, docs-rules-flottes.md §1.5 : "subir
              // des Dégâts au Combat" = rappeler 1 cube vers la zone
              // active) : les cubes engagés qui ne survivent PAS au combat
              // (totalEngage - survivants, quel que soit le camp vainqueur
              // — en défaite/égalité, survivants = 0, donc TOUT revient,
              // comportement déjà en place avant cette évolution) sont
              // reversés en Cube actif plutôt que de disparaître du suivi.
              var totalSurvivantsAttaquant = Object.keys(resultatCombat.survivantsAttaquant || {})
                .reduce(function (s, k) { return s + (resultatCombat.survivantsAttaquant[k] || 0); }, 0);
              var cubesPerdus = Math.max(0, totalEngage - totalSurvivantsAttaquant);

              var detailContributions = contributions.map(function (c) {
                var labelType = labelVaisseau_(c.type);
                return c.quantite + '× ' + labelType + ' (secteur ' + c.secteur + ')';
              }).join(', ');
              var maisonCible = maisonDechue_(secteurCible);

              btnValider.disabled = true;
              btnValider.textContent = 'Résolution en cours…';

              var sourcesPayload = contributions.map(function (c) {
                return { type: c.type, secteur: c.secteur, quantite: c.quantite };
              });
              var survivantsPayload = {};
              if (victoire && resultatCombat.survivantsAttaquant) {
                Object.keys(resultatCombat.survivantsAttaquant).forEach(function (champCombat) {
                  var cleColonne = champCombat === 'portevaisseau' ? 'porte_vaisseau' : champCombat;
                  survivantsPayload[cleColonne] = resultatCombat.survivantsAttaquant[champCombat];
                });
              }

              SecteurService.envahirResoudre(partieEnvahir.id, cibleFinale, sourcesPayload, victoire, survivantsPayload)
                .then(function (jetonsRetires) {
                  jetonsRetires = jetonsRetires || {};

                  // Jeton(s) Gloire (array côté secteursPartie ET côté
                  // plateauMaison, non diffable par focusEngine.js) :
                  // persisté(s) DIRECTEMENT ici, même pattern que le clic
                  // manuel sur un emplacement (voir renderGloireDOM_
                  // ci-dessus) — hors du flux d'annulation, comme lui. Un
                  // secteur pouvant porter PLUSIEURS jetons Gloire
                  // (SecteurService.envahirResoudre renvoie un tableau),
                  // chacun est placé dans un emplacement Gloire libre
                  // distinct de la fiche Maison.
                  var influenceGagnee = 0;
                  if (victoire) {
                    var jetonsGloireGagnes = Array.isArray(jetonsRetires.jetonGloire)
                      ? jetonsRetires.jetonGloire
                      : (jetonsRetires.jetonGloire ? [jetonsRetires.jetonGloire] : []);
                    var auMoinsUnGloirePlace = false;
                    jetonsGloireGagnes.forEach(function (valeurGloire) {
                      if (!(valeurGloire > 0)) return;
                      var indexLibre = etatGloire.indexOf(null);
                      if (indexLibre === -1) indexLibre = etatGloire.indexOf(undefined);
                      if (indexLibre !== -1) {
                        etatGloire[indexLibre] = valeurGloire;
                        auMoinsUnGloirePlace = true;
                      }
                    });
                    if (auMoinsUnGloirePlace) {
                      GameService.majPlateauMaison(partieEnvahir.id, { gloire: etatGloire }).catch(function (e) { window.alert('Échec de l\u2019enregistrement de la Gloire : ' + e.message); });
                      renderGloireDOM_(partieEnvahir);
                    }
                    var sommeGloire = etatGloire.reduce(function (s, v) { return s + (v || 0); }, 0);
                    influenceGagnee = sommeGloire;
                  }

                  var detail = 'Invasion du secteur ' + cibleFinale +
                    (corrompu ? ' (Corrompu)' : (maisonCible ? ' (Maison déchue : ' + maisonCible + ')' : ' (Néant)')) +
                    ' avec ' + totalEngage + ' unité(s) [' + detailContributions + '] — ' +
                    (victoire
                      ? 'VICTOIRE (' + resultatCombat.cubesRestants + ' cube(s) déposé(s) sur le secteur' +
                        (maisonCible ? ', bonus de Maison déchue « ' + maisonCible + ' » non appliqué pour l\u2019instant' : '') +
                        (cubesPerdus > 0 ? ', ' + cubesPerdus + ' cube(s) perdu(s) au combat reversé(s) en Cube actif' : '') + ').'
                      : 'ÉCHEC — flotte anéantie, unités reversées en Cube actif ; secteur(s) source vidé(s) éventuellement repris par le Néant.');

                  var avertissement = null;
                  var abandonnes = jetonsRetires.secteursAbandonnes || [];
                  if (abandonnes.length) {
                    avertissement = 'Secteur(s) ' + abandonnes.join(', ') + ' repris par le Néant (vidé(s) de Puissance Navale) — défaussez un jeton Gloire de votre choix par secteur, si vous en avez (à faire manuellement, hors périmètre cette session).';
                  }

                  fermerModale_();
                  btnValider.disabled = false;
                  window.alert(resultatCombat.log.join('\n'));
                  resolve({
                    victoire: victoire,
                    jetonPrime: victoire ? (jetonsRetires.jetonPrime || 0) : 0,
                    jetonLiberation: victoire ? (jetonsRetires.jetonLiberation || 0) : 0,
                    influenceGagnee: influenceGagnee,
                    totalEngage: totalEngage,
                    cubesPerdus: cubesPerdus,
                    detail: detail,
                    avertissement: avertissement
                  });
                })
                .catch(function (erreur) {
                  btnValider.disabled = false;
                  btnValider.textContent = 'Valider';
                  window.alert('Échec de la résolution : ' + erreur.message);
                });
            };
          }

          render();
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du chargement des secteurs : ' + erreur.message);
        });

      } else if (contexte.type === 'placement_critere') {
        // Popup pour UNE option d'un cadre "choix" dont chaque option est
        // `type: 'placement'` (avec un `critere` de Population,
        // contexte.option — data/catalogue/evenements.json), PAS un libre
        // choix de secteur comme 'placement_secteur_neant_adjacent'
        // ci-dessous : le secteur est déterminé par la Population des
        // secteurs du Néant adjacents (la plus basse ou la plus élevée
        // selon `critere`), une égalité laissant simplement plusieurs
        // candidats au <select> — même logique de calcul que
        // SecteurService.resoudrePlacementMultipleNeantAdjacent
        // (réutilisée telle quelle, contexte.option enveloppée dans un
        // `placements` à 1 entrée, aucune duplication). Si
        // `contexte.option.elements` contient la clé GÉNÉRIQUE "guilde"
        // (type au choix du joueur, voir CHAMP_ELEMENT_PLACEMENT_ dans
        // secteurService.js), un second <select> de type apparaît
        // (TYPES_GUILDE_CONSTRUIRE_, même liste que la popup 'construire'
        // ci-dessous, par cohérence). Ne persiste RIEN ici (contrairement
        // à 'construire'/'retirer_corruption') : résout juste
        // {numero, type}, comme 'placement_secteur_neant_adjacent' — la
        // revalidation ET l'écriture se font côté
        // GameService.appliquerCadreChoixPlacement (appelé par
        // l'appelant, index.html), qui recalcule les candidats à neuf
        // plutôt que de faire confiance à cette popup.
        titre.textContent = contexte.titre || 'Choisir un secteur';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partiePlacementCritere = partieAffichee;
        var optionPlacementCritere = contexte.option || {};
        var demandeTypeGuilde = Object.prototype.hasOwnProperty.call(optionPlacementCritere.elements || {}, 'guilde');

        SecteurService.resoudrePlacementMultipleNeantAdjacent(partiePlacementCritere.id, { type: 'placement_multiple', placements: [optionPlacementCritere] })
          .then(function (resultat) {
            var groupe = (resultat.groupes || [])[0];
            var candidats = groupe ? groupe.candidats : [];
            if (!candidats.length) {
              contenu.innerHTML = '<p class="hint">Aucun secteur du Néant adjacent à l’un de vos secteurs, avec les emplacements requis libres, ne correspond actuellement à ce critère de Population.</p>';
              return;
            }

            contenu.innerHTML = '' +
              '<select id="placement-critere-select-secteur" class="modal-choix-select">' +
              candidats.map(function (numero) { return '<option value="' + numero + '">Secteur ' + numero + '</option>'; }).join('') +
              '</select>' +
              (demandeTypeGuilde
                ? '<select id="placement-critere-select-type" class="modal-choix-select" style="margin-top:8px;">' +
                  TYPES_GUILDE_CONSTRUIRE_.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') +
                  '</select>'
                : '');

            btnValider.hidden = false;
            btnValider.textContent = 'Placer';
            btnValider.onclick = function () {
              var numero = Number(document.getElementById('placement-critere-select-secteur').value);
              var type = demandeTypeGuilde ? document.getElementById('placement-critere-select-type').value : undefined;
              fermerModale_();
              resolve({ numero: numero, type: type });
            };
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'placement_secteur_neant_adjacent') {
        // Choix du secteur du Néant où placer une structure — même
        // gabarit que 'envahir' ci-dessus (secteurs + adjacences chargés
        // via SecteurService, select unique + bouton Valider) mais sans
        // combat : la sélection seule est résolue ici, la persistance
        // (SecteurService.placerElementsNeantAdjacent, revalidée côté
        // service) est déclenchée par l'appelant (index.html,
        // GameService.appliquerCadrePlacement) une fois le choix connu.
        //
        // `contexte.elements` (effet.elements du cadre, transmis par
        // l'appelant) permet de résoudre n'importe quel cadre
        // "placement" du catalogue (ex. jeton Libération + Défense de
        // Secteur) avec ce même contexte générique, sans nouveau code
        // par cadre.
        titre.textContent = contexte.titre || 'Choisir un secteur';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        // `contexte.numeros`, optionnel — restreint la liste à ces
        // numéros précis (candidats déjà calculés par l'appelant, ex.
        // secteurs à égalité de Population pour
        // SecteurService.resoudrePlacementMultipleNeantAdjacent) au lieu
        // de tous les secteurs éligibles. La liste éligible complète (avec
        // `dernierEmplacement`) reste calculée normalement puis filtrée —
        // aucune duplication de la logique d'éligibilité.
        var partiePlacement = partieAffichee;
        SecteurService.obtenirSecteursEligiblesPlacementNeantAdjacent(partiePlacement.id, contexte.elements)
          .then(function (eligibles) {
            if (Array.isArray(contexte.numeros)) {
              eligibles = eligibles.filter(function (e) { return contexte.numeros.indexOf(e.numero) !== -1; });
            }
            if (!eligibles.length) {
              contenu.innerHTML = '<p class="hint">Aucun secteur du Néant adjacent à l’un de vos secteurs, avec les emplacements Installation/Guilde requis libres actuellement.</p>';
              return;
            }

            contenu.innerHTML = '' +
              '<select id="placement-select-secteur" class="modal-choix-select">' +
              eligibles.map(function (e) {
                return '<option value="' + e.numero + '">Secteur ' + e.numero + (e.dernierEmplacement ? ' ❗' : '') + '</option>';
              }).join('') +
              '</select>';

            btnValider.hidden = false;
            btnValider.textContent = 'Placer';
            btnValider.onclick = function () {
              var numero = Number(document.getElementById('placement-select-secteur').value);
              fermerModale_();
              resolve({ numero: numero });
            };
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'construire') {
        // Popup dédiée pour les clés Focus/Cadre
        // "construire_installation"/"installation"/"etablir_guilde"/
        // "guilde" (voir focusEngine.js) — même gabarit que
        // 'placement_secteur_neant_adjacent' (secteur + ❗ dernier
        // emplacement), avec un second <select> pour le type (au choix du
        // joueur, la règle ne l'impose jamais — docs-rules-secteurs.md
        // §2.3). Réutilise
        // SecteurService.obtenirSecteursEligiblesConstruction/construire
        // (jusqu'ici seulement branchées sur le formulaire dédié de
        // l'écran Secteurs) — aucune nouvelle logique métier ici,
        // seulement une seconde façon de les appeler (popup modale,
        // réutilisable depuis Focus ET les Cadres d'Événement
        // galactique). `contexte.categorie` ('installation' ou 'guilde')
        // vient de focusEngine.js. Persiste directement via
        // SecteurService.construire au clic sur Valider (comme regrouper/
        // envahir/deployer_cube) — resolve({ detail }) pour le journal, ou
        // { annule: true } sur Annuler.
        //
        // `contexte.typeForce` optionnel (clé de
        // TYPES_GUILDE_CONSTRUIRE_/TYPES_INSTALLATION_CONSTRUIRE_, voir
        // focusEngine.js TYPE_FORCE_PAR_CLE_CONSTRUIRE_) restreint le
        // <select> Type à cette seule option et le désactive (`disabled`,
        // valeur toujours lisible via `.value` malgré l'attribut) plutôt
        // que de laisser le joueur choisir librement — utile pour un
        // cadre qui impose un type précis (ex. Guilde Banquier).
        var estInstallation = contexte.categorie === 'installation';
        titre.textContent = estInstallation ? 'Construire une Installation' : 'Établir une Guilde';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieConstruire = partieAffichee;
        var typesConstruire = estInstallation ? TYPES_INSTALLATION_CONSTRUIRE_ : TYPES_GUILDE_CONSTRUIRE_;
        if (contexte.typeForce) {
          typesConstruire = typesConstruire.filter(function (t) { return t.cle === contexte.typeForce; });
        }

        SecteurService.obtenirSecteursEligiblesConstruction(partieConstruire.id, contexte.categorie)
          .then(function (eligibles) {
            if (!eligibles.length) {
              contenu.innerHTML = '<p class="hint">Aucun secteur possédé avec un emplacement ' +
                (estInstallation ? 'Installation' : 'Guilde') + ' libre actuellement.</p>';
              return;
            }

            contenu.innerHTML = '' +
              '<select id="construire-select-secteur" class="modal-choix-select">' +
              eligibles.map(function (e) {
                return '<option value="' + e.numero + '">Secteur ' + e.numero + (e.emplacementsLibres === 1 ? ' ❗' : '') + '</option>';
              }).join('') +
              '</select>' +
              '<select id="construire-select-type" class="modal-choix-select" style="margin-top:8px;"' + (contexte.typeForce ? ' disabled' : '') + '>' +
              typesConstruire.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') +
              '</select>';

            btnValider.hidden = false;
            btnValider.textContent = estInstallation ? 'Construire' : 'Établir';
            btnValider.onclick = function () {
              var numero = Number(document.getElementById('construire-select-secteur').value);
              var type = document.getElementById('construire-select-type').value;
              var labelType = typesConstruire.filter(function (t) { return t.cle === type; })[0].label;
              btnValider.disabled = true;

              SecteurService.construire(partieConstruire.id, numero, contexte.categorie, type)
                .then(function () {
                  fermerModale_();
                  btnValider.disabled = false;
                  var detail = estInstallation
                    ? 'Installation ' + labelType + ' construite sur le Secteur ' + numero + '.'
                    : 'Guilde ' + labelType + ' établie sur le Secteur ' + numero + '.';
                  resolve({ detail: detail, numero: numero, type: type });
                })
                .catch(function (erreur) {
                  btnValider.disabled = false;
                  window.alert('Échec de la construction : ' + erreur.message);
                });
            };
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'augmenter_population_pure') {
        // Popup dédiée pour la clé Focus/Cadre
        // "augmenter_population_pure" (voir focusEngine.js) — même
        // gabarit minimal que 'placement_secteur_neant_adjacent' (un seul
        // <select> de secteurs, "Secteur N", aucune information
        // supplémentaire répétée). Réutilise SecteurService.
        // obtenirSecteursEligiblesAugmenterPopulationPure/
        // augmenterPopulationPure. Persiste directement via
        // SecteurService.augmenterPopulationPure au clic sur Valider
        // (comme construire ci-dessus) — resolve({ detail }) pour le
        // journal, ou { annule: true } sur Annuler.
        titre.textContent = 'Choisir un secteur';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partiePopulation = partieAffichee;

        SecteurService.obtenirSecteursEligiblesAugmenterPopulationPure(partiePopulation.id)
          .then(function (eligibles) {
            if (!eligibles.length) {
              contenu.innerHTML = '<p class="hint">Aucun secteur Pur (non Corrompu) avec une Population inférieure à 6 actuellement.</p>';
              return;
            }

            contenu.innerHTML = '' +
              '<select id="population-select-secteur" class="modal-choix-select">' +
              eligibles.map(function (e) { return '<option value="' + e.numero + '">Secteur ' + e.numero + '</option>'; }).join('') +
              '</select>';

            btnValider.hidden = false;
            btnValider.textContent = 'Augmenter';
            btnValider.onclick = function () {
              var numero = Number(document.getElementById('population-select-secteur').value);
              btnValider.disabled = true;

              SecteurService.augmenterPopulationPure(partiePopulation.id, numero)
                .then(function () {
                  fermerModale_();
                  btnValider.disabled = false;
                  resolve({ detail: 'Population du Secteur ' + numero + ' augmentée de 1.', numero: numero });
                })
                .catch(function (erreur) {
                  btnValider.disabled = false;
                  window.alert('Échec de l\'augmentation de Population : ' + erreur.message);
                });
            };
          }).catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'rappeler_cube') {
        // Popup dédiée à l'option "recall" d'un Cadre d'Événement
        // galactique (voir GameService.appliquerCadreChoixRappelCube,
        // gameService.js — Événement H Cycle 1 Cadre 1, seul cas connu à
        // ce jour) — même gabarit que 'construire' ci-dessus (secteur +
        // type de vaisseau). secteurEstPossede_ reprend exactement la
        // même règle d'éligibilité que le formulaire dédié de l'écran
        // Secteurs (index.html, renderFormulaireRappelerCube_) : secteur
        // sans Puissance Navale du Néant, avec au moins 1 cube. Persiste
        // directement via SecteurService.rappelerCube au clic sur
        // Valider (comme construire/augmenter_population_pure ci-dessus)
        // — resolve({ detail }) pour le journal, ou { annule: true } sur
        // Annuler.
        titre.textContent = 'Rappeler un cube';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieRappel = partieAffichee;

        SecteurService.obtenirSecteurs(partieRappel.id).then(function (secteurs) {
          var eligibles = secteurs.filter(secteurEstPossede_);
          if (!eligibles.length) {
            contenu.innerHTML = '<p class="hint">Aucun secteur possédé avec de la Puissance Navale actuellement.</p>';
            return;
          }

          contenu.innerHTML = '' +
            '<select id="rappel-cadre-select-secteur" class="modal-choix-select">' +
            eligibles.map(function (s) { return '<option value="' + s.numero + '">Secteur ' + s.numero + '</option>'; }).join('') +
            '</select>' +
            '<select id="rappel-cadre-select-type" class="modal-choix-select" style="margin-top:8px;">' +
            TYPES_VAISSEAU.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') +
            '</select>';

          btnValider.hidden = false;
          btnValider.textContent = 'Rappeler';
          btnValider.onclick = function () {
            var numero = Number(document.getElementById('rappel-cadre-select-secteur').value);
            var type = document.getElementById('rappel-cadre-select-type').value;
            btnValider.disabled = true;

            SecteurService.rappelerCube(partieRappel.id, numero, type)
              .then(function () {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: 'Cube de ' + labelVaisseau_(type) + ' rappelé depuis le Secteur ' + numero + '.', numero: numero, type: type });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec du rappel : ' + erreur.message);
              });
          };
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du chargement des secteurs : ' + erreur.message);
        });

      } else if (contexte.type === 'rappeler_cube_cout') {
        // Coût "rappeler_cube" d'une action Focus (EVOLUTION 13, todo.md
        // — ex. Focus Développement "Installer" Standard, voir
        // FocusEngine.resoudreCle_, cas dédié). POPUP DISTINCTE de
        // 'rappeler_cube' ci-dessus (option "recall" d'un Cadre
        // d'Événement, un EFFET) : la règle d'éligibilité diffère — un
        // simple Coût d'action Focus ne doit jamais abandonner un secteur
        // (docs-rules-flottes.md §1.5/§4 : rappeler le dernier cube d'un
        // secteur hors Secteur-Mère l'abandonne et coûte un jeton Gloire,
        // mécanique délibérément non modélisée ici) — ne propose que les
        // secteurs possédés avec STRICTEMENT PLUS d'1 cube de Puissance
        // Navale au total, SAUF le Secteur-Mère qui reste éligible même à
        // son dernier cube (il ne peut jamais être abandonné). Persiste
        // directement via SecteurService.rappelerCube au clic sur Valider
        // (même pattern que 'rappeler_cube'/'construire' ci-dessus).
        titre.textContent = 'Rappeler un cube';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieRappelCout = partieAffichee;

        Promise.all([
          SecteurService.obtenirSecteurs(partieRappelCout.id),
          SecteurService.obtenirSecteurMere(partieRappelCout.scenarioId)
        ]).then(function (resultats) {
          var secteurs = resultats[0];
          var numeroSecteurMere = resultats[1];
          var eligibles = secteurs.filter(function (s) {
            if (!secteurEstPossede_(s)) return false;
            if (s.numero === numeroSecteurMere) return true;
            var total = (s.pnCorvette || 0) + (s.pnSentinelle || 0) + (s.pnDestroyer || 0) + (s.pnCuirasse || 0) + (s.pnPorteVaisseau || 0);
            return total > 1;
          });
          if (!eligibles.length) {
            contenu.innerHTML = '<p class="hint">Aucun secteur ne permet de rappeler un cube sans l\'abandonner.</p>';
            return;
          }

          contenu.innerHTML = '' +
            '<select id="rappel-cout-select-secteur" class="modal-choix-select">' +
            eligibles.map(function (s) { return '<option value="' + s.numero + '">Secteur ' + s.numero + '</option>'; }).join('') +
            '</select>' +
            '<select id="rappel-cout-select-type" class="modal-choix-select" style="margin-top:8px;">' +
            TYPES_VAISSEAU.map(function (t) { return '<option value="' + t.cle + '">' + t.label + '</option>'; }).join('') +
            '</select>';

          btnValider.hidden = false;
          btnValider.textContent = 'Rappeler';
          btnValider.onclick = function () {
            var numero = Number(document.getElementById('rappel-cout-select-secteur').value);
            var type = document.getElementById('rappel-cout-select-type').value;
            btnValider.disabled = true;

            SecteurService.rappelerCube(partieRappelCout.id, numero, type)
              .then(function () {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: 'Cube de ' + labelVaisseau_(type) + ' rappelé depuis le Secteur ' + numero + '.', numero: numero, type: type });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec du rappel : ' + erreur.message);
              });
          };
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du chargement des secteurs : ' + erreur.message);
        });

      } else if (contexte.type === 'gagner_programme') {
        // Effet "Gagner un Programme" (voir focusEngine.js, clé
        // "gagner_programme"/"programme_force"/etc.) — l'aléatoire de la
        // pioche physique n'est pas modélisé : liste TOUS les Programmes
        // du catalogue, groupés par type (<optgroup>, ordre fixe
        // Domination/Force/Soutien/Richesse — un seul groupe si
        // `contexte.typeImpose` restreint le type), en excluant ceux déjà
        // en main (plateauMaison.programmesEnMain) OU déjà en jeu
        // (plateauMaison.programmesUtilises — Phase 3) et en préfixant "★ " le
        // Programme actuellement révélé dans l'offre publique
        // (plateauMaison.offresProgramme) pour le mettre en évidence.
        // Au changement de sélection, affiche objectif1/objectif2 du
        // Programme choisi ("son texte"). Persiste directement via
        // GameService.gagnerProgramme au clic sur Valider (comme
        // construire/rappeler_cube ci-dessus) — celle-ci retire aussi
        // l'entrée d'offre correspondante si le Programme choisi en
        // faisait partie.
        titre.textContent = 'Gagner un Programme';
        contenu.innerHTML = '<p class="hint">Chargement des Programmes…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieProgramme = partieAffichee;
        var TYPES_PROGRAMME_ORDRE_ = ['Domination', 'Force', 'Soutien', 'Richesse'];

        DB.getAll('programmes').then(function (catalogue) {
          var pm = partieProgramme.plateauMaison || {};
          var dejaEnJeu = (Array.isArray(pm.programmesUtilises) ? pm.programmesUtilises : [])
            .filter(Boolean).map(function (s) { return s.nom; }).filter(Boolean);
          var dejaEnMain = (pm.programmesEnMain || []).concat(dejaEnJeu);
          var offres = Array.isArray(pm.offresProgramme) ? pm.offresProgramme : [];
          var typesAffiches = contexte.typeImpose ? [contexte.typeImpose] : TYPES_PROGRAMME_ORDRE_;

          var parNom = {};
          catalogue.forEach(function (p) { parNom[p.nom] = p; });

          var groupes = typesAffiches.map(function (type) {
            var offreCourante = offres.filter(function (o) { return o.type === type; })[0];
            var options = catalogue
              .filter(function (p) { return p.type === type && dejaEnMain.indexOf(p.nom) === -1; })
              .sort(function (a, b) { return a.nom.localeCompare(b.nom); })
              .map(function (p) {
                var estOffre = !!offreCourante && offreCourante.nom === p.nom;
                return '<option value="' + p.nom + '">' + (estOffre ? '★ ' : '') + p.nom + '</option>';
              }).join('');
            return options ? '<optgroup label="' + type + '">' + options + '</optgroup>' : '';
          }).join('');

          if (!groupes.trim()) {
            contenu.innerHTML = '<p class="hint">Aucun Programme disponible' +
              (contexte.typeImpose ? ' de type ' + contexte.typeImpose : '') + ' (déjà tous en main).</p>';
            return;
          }

          contenu.innerHTML = '' +
            '<select id="programme-gain-select" class="modal-choix-select">' + groupes + '</select>' +
            '<div id="programme-gain-detail" class="hint" style="margin-top:8px;"></div>';

          var selectProgramme = document.getElementById('programme-gain-select');
          var detailProgramme = document.getElementById('programme-gain-detail');
          function majDetail_() {
            var carte = parNom[selectProgramme.value];
            detailProgramme.innerHTML = carte ? (carte.objectif1 || '') + '<br>' + (carte.objectif2 || '') : '';
          }
          selectProgramme.addEventListener('change', majDetail_);
          majDetail_();

          btnValider.hidden = false;
          btnValider.textContent = 'Valider';
          btnValider.onclick = function () {
            var nomChoisi = selectProgramme.value;
            btnValider.disabled = true;

            GameService.gagnerProgramme(partieProgramme.id, nomChoisi)
              .then(function (resultat) {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: 'Programme "' + resultat.nom + '" (' + resultat.type + ') obtenu.', nom: resultat.nom, type: resultat.type });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec de l\'obtention du Programme : ' + erreur.message);
              });
          };
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du chargement des Programmes : ' + erreur.message);
        });

      } else if (contexte.type === 'utiliser_programme') {
        // Utiliser un Programme "en main" (Phase 3) — popup légère :
        // affiche l'action gratuite du Programme (règle fixe par type,
        // GameService.INFO_PROGRAMME_PAR_TYPE) et un bouton "Résoudre" qui
        // délègue TOUT à GameService.utiliserProgramme (choix du type
        // d'action, éventuel conflit d'emplacement, persistance) — cette
        // MÊME fonction demanderChoix (celle de cette popup) lui est
        // transmise telle quelle : chaque sous-popup imbriquée (envahir,
        // options_inclusives, avancer_civilisation, confirmation de
        // remplacement, choix d'emplacement...) réutilise donc
        // #modal-choix normalement, exactement comme une vraie action
        // Focus. `resolve({detail, place})` en fin de résolution ;
        // `{annule:true}` si l'action n'est pas allée au bout (voir
        // GameService.utiliserProgramme).
        var infoProgrammeUtiliser = GameService.INFO_PROGRAMME_PAR_TYPE[contexte.typeProgramme] || null;
        titre.textContent = 'Utiliser : ' + contexte.nomProgramme;
        contenu.innerHTML = '<p class="hint">' + (infoProgrammeUtiliser ? infoProgrammeUtiliser.action : 'Action inconnue.') + '</p>';
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };
        btnValider.hidden = false;
        btnValider.textContent = 'Résoudre';
        btnValider.onclick = function () {
          btnValider.disabled = true;
          GameService.utiliserProgramme(contexte.partieId, contexte.nomProgramme, demanderChoix)
            .then(function (resultat) {
              btnValider.disabled = false;
              if (!resultat || resultat.annule) { fermerModale_(); resolve({ annule: true }); return; }
              fermerModale_();
              resolve({
                detail: resultat.resume + (resultat.place ? '' : ' (Programme resté en main — emplacement non attribué.)'),
                place: resultat.place, nom: resultat.nom, type: resultat.type
              });
            })
            .catch(function (erreur) {
              btnValider.disabled = false;
              window.alert('Échec de la résolution : ' + erreur.message);
            });
        };

      } else if (contexte.type === 'choisir_emplacement_programme') {
        // Plateau Programme plein (3 emplacements 1-3 déjà occupés, aucun
        // conflit de type) — GameService.utiliserProgramme demande ici
        // lequel remplacer. `contexte.options` = [{slot, nom, type}, ...]
        // (déjà préparé par l'appelant). Résout {numero} ou {annule:true}
        // — même gabarit que 'gagner_corruption' (menu à boutons).
        titre.textContent = 'Emplacement Programme plein — remplacer lequel ?';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };
        contenu.innerHTML = '<div class="modal-choix-boutons">' +
          (contexte.options || []).map(function (o) {
            return '<button type="button" class="btn btn-secondary btn-choix-liste" data-slot="' + o.slot + '">' +
              'Emplacement ' + o.slot + ' — ' + o.nom + ' (' + o.type + ')</button>';
          }).join('') + '</div>';
        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
          btn.addEventListener('click', function () {
            fermerModale_();
            resolve({ numero: Number(btn.dataset.slot) });
          });
        });

      } else if (contexte.type === 'retirer_corruption') {
        // Effet "Retirer une Corruption" : popup à 2 niveaux — un menu de
        // CIBLES possibles, chacune affichée seulement si réellement
        // éligible :
        // - "Secteur" : au moins un secteur possédé (SecteurService.
        //   obtenirSecteursEligiblesRetraitCorruption) et Corrompu ->
        //   <select>, persiste via SecteurService.retirerCorruption.
        // - "Piste de Civilisation" : au moins une piste marquée
        //   Corrompue (partie.civilisation.corrompues, voir gameService.js/
        //   assemblerPartie_) -> résolution directe si une seule, <select>
        //   si plusieurs ; persiste via CivilisationService.
        //   definirCorruption(..., false) — PAS avancerPisteCorrompue,
        //   mécanique différente (celle-ci avance la piste d'une case sans
        //   le bénéfice, ce qui n'est pas ce que demande cet effet).
        // - "Programme" : TOUJOURS proposée (la Corruption d'un Programme
        //   n'est pas suivie en base — hors périmètre, résolution manuelle
        //   comme le reste des Programmes, cf. TODO.md "a appliquer
        //   manuellement").
        // - "Technologie — Chambres de décontamination" : seulement si le
        //   joueur possède cette Technologie (nomsTechnologiesJoueur_) ET
        //   qu'elle stocke au moins 1 Corruption (nouveau jeton manuel
        //   plateauMaison.corruptionChambreDecontamination — voir
        //   gameService.js/renderJetons_ plus haut ; la mécanique qui
        //   AJOUTE une Corruption sur cette case reste hors périmètre,
        //   incrémentée manuellement par le joueur comme les autres
        //   jetons de cette grille).
        // Si aucune des 4 n'est éligible (secteur/piste/techno) — ne
        // devrait jamais arriver, "Programme" étant toujours disponible.
        titre.textContent = 'Retirer une Corruption';
        contenu.innerHTML = '<p class="hint">Chargement…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieCorruption = partieAffichee;
        var pistesCorrompues = CivilisationService.PISTES.filter(function (p) {
          return !!(partieCorruption.civilisation && partieCorruption.civilisation.corrompues && partieCorruption.civilisation.corrompues[p]);
        });
        var possedeChambreDecontamination = nomsTechnologiesJoueur_(partieCorruption).indexOf('chambres de décontamination') !== -1;
        var corruptionStockee = (partieCorruption.plateauMaison && partieCorruption.plateauMaison.corruptionChambreDecontamination) || 0;
        // Options transmises à definirCorruption(..., false) pour les 2
        // branches "piste" ci-dessous (afficherSousSelectPiste_).
        var optionsRetraitPiste_ = { conserverCorruptionRetiree: evenementConserveCorruptionActif_(partieCorruption) };
        function detailRetraitPiste_(piste, resultat) {
          var base = 'Corruption retirée de la piste ' + CivilisationService.NOM_PISTE[piste] + '.';
          if (resultat && resultat.corruptionMaisonConservee) {
            base += ' Compteur de Corruption (plateau maison) conservé — Événement « Le visage du mal » actif ce cycle.';
          }
          return base;
        }

        function afficherMenuCibles_(eligiblesSecteurs) {
          var options = [];
          if (eligiblesSecteurs.length) options.push({ cle: 'secteur', label: 'Secteur' });
          if (pistesCorrompues.length) options.push({ cle: 'piste', label: 'Piste de Civilisation' });
          options.push({ cle: 'programme', label: 'Programme', sousTexte: 'à retirer manuellement' });
          if (possedeChambreDecontamination && corruptionStockee > 0) {
            options.push({ cle: 'techno', label: 'Chambres de décontamination', sousTexte: corruptionStockee + ' Corruption(s) stockée(s)' });
          }

          btnValider.hidden = true;
          contenu.innerHTML = '<div class="modal-choix-boutons">' +
            options.map(function (o) {
              return '<button type="button" class="btn btn-secondary btn-choix-liste" data-cle="' + o.cle + '">' +
                o.label + (o.sousTexte ? '<br><span class="cadre-action-sous-texte">' + o.sousTexte + '</span>' : '') +
                '</button>';
            }).join('') + '</div>';

          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
            btn.addEventListener('click', function () {
              var cle = btn.dataset.cle;
              if (cle === 'secteur') return afficherSousSelectSecteur_(eligiblesSecteurs);
              if (cle === 'piste') return afficherSousSelectPiste_();
              if (cle === 'programme') {
                fermerModale_();
                resolve({ detail: 'Corruption retirée d\u2019un Programme (manuellement).' });
                return;
              }
              if (cle === 'techno') {
                btn.disabled = true;
                var champs = { corruptionChambreDecontamination: corruptionStockee - 1 };
                GameService.majPlateauMaison(partieCorruption.id, champs)
                  .then(function () {
                    partieCorruption.plateauMaison.corruptionChambreDecontamination = corruptionStockee - 1;
                    fermerModale_();
                    resolve({ detail: 'Corruption retirée de Chambres de décontamination (reste ' + (corruptionStockee - 1) + ').' });
                  })
                  .catch(function (erreur) {
                    btn.disabled = false;
                    window.alert('Échec du retrait : ' + erreur.message);
                  });
              }
            });
          });
        }

        function afficherSousSelectSecteur_(eligibles) {
          titre.textContent = 'Retirer une Corruption — Secteur';
          contenu.innerHTML = '' +
            '<select id="corruption-select-secteur" class="modal-choix-select">' +
            eligibles.map(function (e) { return '<option value="' + e.numero + '">Secteur ' + e.numero + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Retirer';
          btnValider.onclick = function () {
            var numero = Number(document.getElementById('corruption-select-secteur').value);
            btnValider.disabled = true;
            SecteurService.retirerCorruption(partieCorruption.id, numero)
              .then(function () {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: 'Corruption retirée du Secteur ' + numero + '.', numero: numero });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec du retrait : ' + erreur.message);
              });
          };
        }

        function afficherSousSelectPiste_() {
          if (pistesCorrompues.length === 1) {
            var piste = pistesCorrompues[0];
            CivilisationService.definirCorruption(partieCorruption.id, piste, false, optionsRetraitPiste_)
              .then(function (resultat) {
                fermerModale_();
                resolve({ detail: detailRetraitPiste_(piste, resultat), piste: piste });
              })
              .catch(function (erreur) {
                window.alert('Échec du retrait : ' + erreur.message);
              });
            return;
          }
          titre.textContent = 'Retirer une Corruption — Piste de Civilisation';
          contenu.innerHTML = '' +
            '<select id="corruption-select-piste" class="modal-choix-select">' +
            pistesCorrompues.map(function (p) { return '<option value="' + p + '">' + CivilisationService.NOM_PISTE[p] + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Retirer';
          btnValider.onclick = function () {
            var pisteChoisie = document.getElementById('corruption-select-piste').value;
            btnValider.disabled = true;
            CivilisationService.definirCorruption(partieCorruption.id, pisteChoisie, false, optionsRetraitPiste_)
              .then(function (resultat) {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: detailRetraitPiste_(pisteChoisie, resultat), piste: pisteChoisie });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec du retrait : ' + erreur.message);
              });
          };
        }

        SecteurService.obtenirSecteursEligiblesRetraitCorruption(partieCorruption.id)
          .then(function (eligiblesSecteurs) { afficherMenuCibles_(eligiblesSecteurs); })
          .catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'gagner_corruption') {
        // Effet "Gagner une Corruption" (voir
        // docs-rules-corruption-gardiens-refuges-technoConsume.md §1) :
        // miroir de 'retirer_corruption' ci-dessus, INVERSÉ — un menu de
        // CIBLES possibles pour PLACER la Corruption gagnée, chacune
        // affichée seulement si réellement éligible :
        // - "Secteur" : un secteur possédé (SecteurService.
        //   obtenirSecteursEligiblesGainCorruption — possédé, PAS
        //   Corrompu, ET pas le Secteur-Mère, immunisé) -> <select>,
        //   persiste via SecteurService.placerCorruption.
        // - "Piste de Civilisation" : une piste PAS encore Corrompue ->
        //   résolution directe si une seule, <select> si plusieurs ;
        //   persiste via CivilisationService.definirCorruption(..., true).
        // - "Programme" : comme pour le retrait, TOUJOURS proposée dès
        //   qu'autorisée (la Corruption d'un Programme n'est pas suivie en
        //   base) — résolution manuelle.
        // - "Technologie — Chambres de décontamination" : si le joueur la
        //   possède ET qu'il reste au moins un emplacement libre (2, 3 si
        //   améliorée — technologieChambreDecontamination_ ci-dessus).
        //
        // `contexte.ciblesAutorisees`/`contexte.ciblesRepli` (tableaux
        // parmi 'secteur'/'piste'/'programme'/'techno') restreignent le
        // menu — utilisés par GameService.appliquerCadreGainCorruption
        // (gameService.js) pour un Cadre d'Événement galactique dont
        // l'effet précise une cible (catalogue : "cible"/"cible_options" +
        // "repli" éventuel — priorité STRICTE : le groupe "repli" n'est
        // proposé QUE si aucune cible du 1er groupe n'est éligible ;
        // "Programme" fait exception, toujours proposée dès qu'autorisée
        // dans l'un OU l'autre groupe, jamais bloquante — cohérent avec le
        // reste de cette popup). Non fournis (appel FocusEngine "sans
        // précision", gain_corruption) : les 4 cibles sont ouvertes, aucun
        // repli. `contexte.exclureTechno` (catalogue : "restriction":
        // "stockage_chambres_decontamination_interdit") retire la
        // Technologie des deux groupes.
        titre.textContent = 'Gagner une Corruption';
        contenu.innerHTML = '<p class="hint">Chargement…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieCorruptionGain = partieAffichee;
        var pistesNonCorrompues = CivilisationService.PISTES.filter(function (p) {
          return !(partieCorruptionGain.civilisation && partieCorruptionGain.civilisation.corrompues && partieCorruptionGain.civilisation.corrompues[p]);
        });
        var techChambreGain = technologieChambreDecontamination_(partieCorruptionGain);
        var maxChambreGain = techChambreGain ? (techChambreGain.amelioree ? 3 : 2) : 0;
        var corruptionStockeeGain = (partieCorruptionGain.plateauMaison && partieCorruptionGain.plateauMaison.corruptionChambreDecontamination) || 0;
        var chambreDisponibleGain = !!techChambreGain && corruptionStockeeGain < maxChambreGain;

        var tier1 = contexte.ciblesAutorisees || ['secteur', 'piste', 'programme', 'techno'];
        var tier2 = contexte.ciblesRepli || [];
        if (contexte.exclureTechno) {
          tier1 = tier1.filter(function (c) { return c !== 'techno'; });
          tier2 = tier2.filter(function (c) { return c !== 'techno'; });
        }
        var programmeAutorise = tier1.indexOf('programme') !== -1 || tier2.indexOf('programme') !== -1;
        var tier1SansProgramme = tier1.filter(function (c) { return c !== 'programme'; });
        var tier2SansProgramme = tier2.filter(function (c) { return c !== 'programme'; });

        function optionsEligibles_(cibles, eligiblesSecteurs) {
          var options = [];
          if (cibles.indexOf('secteur') !== -1 && eligiblesSecteurs.length) options.push({ cle: 'secteur', label: 'Secteur' });
          if (cibles.indexOf('piste') !== -1 && pistesNonCorrompues.length) options.push({ cle: 'piste', label: 'Piste de Civilisation' });
          if (cibles.indexOf('techno') !== -1 && chambreDisponibleGain) {
            options.push({ cle: 'techno', label: 'Chambres de décontamination', sousTexte: (maxChambreGain - corruptionStockeeGain) + ' emplacement(s) libre(s)' });
          }
          return options;
        }

        function afficherMenuCibles_(eligiblesSecteurs) {
          var options = optionsEligibles_(tier1SansProgramme, eligiblesSecteurs);
          if (!options.length && tier2SansProgramme.length) options = optionsEligibles_(tier2SansProgramme, eligiblesSecteurs);
          if (programmeAutorise) options.push({ cle: 'programme', label: 'Programme', sousTexte: 'à placer manuellement' });

          if (!options.length) {
            fermerModale_();
            resolve({ annule: true });
            return;
          }

          btnValider.hidden = true;
          contenu.innerHTML = '<div class="modal-choix-boutons">' +
            options.map(function (o) {
              return '<button type="button" class="btn btn-secondary btn-choix-liste" data-cle="' + o.cle + '">' +
                o.label + (o.sousTexte ? '<br><span class="cadre-action-sous-texte">' + o.sousTexte + '</span>' : '') +
                '</button>';
            }).join('') + '</div>';

          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
            btn.addEventListener('click', function () {
              var cle = btn.dataset.cle;
              if (cle === 'secteur') return afficherSousSelectSecteur_(eligiblesSecteurs);
              if (cle === 'piste') return afficherSousSelectPiste_();
              if (cle === 'programme') {
                fermerModale_();
                resolve({ detail: 'Corruption placée sur un emplacement de Programme (manuellement).' });
                return;
              }
              if (cle === 'techno') {
                btn.disabled = true;
                var champs = { corruptionChambreDecontamination: corruptionStockeeGain + 1 };
                GameService.majPlateauMaison(partieCorruptionGain.id, champs)
                  .then(function () {
                    partieCorruptionGain.plateauMaison.corruptionChambreDecontamination = corruptionStockeeGain + 1;
                    fermerModale_();
                    resolve({ detail: 'Corruption placée sur Chambres de décontamination (' + (corruptionStockeeGain + 1) + '/' + maxChambreGain + ').' });
                  })
                  .catch(function (erreur) {
                    btn.disabled = false;
                    window.alert('Échec du placement : ' + erreur.message);
                  });
              }
            });
          });
        }

        function afficherSousSelectSecteur_(eligibles) {
          titre.textContent = 'Gagner une Corruption — Secteur';
          contenu.innerHTML = '' +
            '<select id="corruption-gain-select-secteur" class="modal-choix-select">' +
            eligibles.map(function (e) { return '<option value="' + e.numero + '">Secteur ' + e.numero + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Placer';
          btnValider.onclick = function () {
            var numero = Number(document.getElementById('corruption-gain-select-secteur').value);
            btnValider.disabled = true;
            SecteurService.placerCorruption(partieCorruptionGain.id, numero)
              .then(function () {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: 'Corruption placée sur le Secteur ' + numero + '.', numero: numero });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec du placement : ' + erreur.message);
              });
          };
        }

        // Place la Corruption sur `piste` puis, quand
        // `contexte.avancerPisteApresPlacement` est vrai (transmis par
        // GameService.appliquerCadreGainCorruption pour un Cadre précis —
        // jamais pour un gain_corruption Focus générique), enchaîne
        // CivilisationService.avancerPiste sur cette même piste — la piste
        // vient d'être marquée Corrompue par definirCorruption ci-dessus,
        // donc la règle générique de avancerPiste ("aucun bénéfice de case
        // pour une piste Corrompue", voir civilisationService.js) s'y
        // applique déjà telle quelle : pas besoin d'un chemin dédié
        // "sans effet" (ex-avancerPisteSansEffet, fusionné dans
        // avancerPiste). Résout le texte de détail combiné, pour les 2
        // branches (piste unique/select) ci-dessous.
        function placerCorruptionSurPiste_(piste) {
          return CivilisationService.definirCorruption(partieCorruptionGain.id, piste, true).then(function () {
            var base = 'Corruption placée sur la piste ' + CivilisationService.NOM_PISTE[piste] + '.';
            if (!contexte.avancerPisteApresPlacement) return base;
            var nomMaisonGain = partieCorruptionGain.joueur ? partieCorruptionGain.joueur.nom : null;
            return CivilisationService.avancerPiste(partieCorruptionGain.id, nomMaisonGain, piste, demanderChoix).then(function (resultatAvance) {
              if (resultatAvance.dejaMaximum) return base + ' Piste déjà au niveau maximum, pas d’avancement.';
              return base + ' Piste avancée d’une case (niveau ' + resultatAvance.ancienNiveau + ' → ' + resultatAvance.nouveauNiveau + ', sans bénéfice de case — piste Corrompue).';
            });
          });
        }

        function afficherSousSelectPiste_() {
          if (pistesNonCorrompues.length === 1) {
            var piste = pistesNonCorrompues[0];
            placerCorruptionSurPiste_(piste)
              .then(function (detail) {
                fermerModale_();
                resolve({ detail: detail, piste: piste });
              })
              .catch(function (erreur) {
                window.alert('Échec du placement : ' + erreur.message);
              });
            return;
          }
          titre.textContent = 'Gagner une Corruption — Piste de Civilisation';
          contenu.innerHTML = '' +
            '<select id="corruption-gain-select-piste" class="modal-choix-select">' +
            pistesNonCorrompues.map(function (p) { return '<option value="' + p + '">' + CivilisationService.NOM_PISTE[p] + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Placer';
          btnValider.onclick = function () {
            var pisteChoisie = document.getElementById('corruption-gain-select-piste').value;
            btnValider.disabled = true;
            placerCorruptionSurPiste_(pisteChoisie)
              .then(function (detail) {
                fermerModale_();
                btnValider.disabled = false;
                resolve({ detail: detail, piste: pisteChoisie });
              })
              .catch(function (erreur) {
                btnValider.disabled = false;
                window.alert('Échec du placement : ' + erreur.message);
              });
          };
        }

        SecteurService.obtenirSecteursEligiblesGainCorruption(partieCorruptionGain.id)
          .then(function (eligiblesSecteurs) { afficherMenuCibles_(eligiblesSecteurs); })
          .catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'deplacer_corruption') {
        // EVOLUTION 10 — Effet "Déplacer une Corruption" (docs-rules-
        // corruption-gardiens-refuges-technoConsume.md §1 : "Déplacer une
        // Corruption revient à déplacer un marqueur placé selon l'une des
        // options [Secteur/Piste/Programme/Techno] sur un autre
        // emplacement éligible.") Popup à 2 ÉTAPES :
        // 1) SOURCE — même menu que 'retirer_corruption' ci-dessus
        //    (Secteur possédé Corrompu / Piste Corrompue / Programme
        //    manuel / Chambres de décontamination si stockage > 0).
        // 2) DESTINATION — même menu que 'gagner_corruption' ci-dessus
        //    (Secteur possédé Pur non immunisé / Piste non Corrompue /
        //    Programme manuel / Chambres de décontamination si
        //    emplacement libre), calculé et affiché AVANT toute écriture
        //    en base : la source (toujours Corrompue à ce stade) est donc
        //    naturellement absente de son propre menu de destination pour
        //    Secteur/Piste (un secteur/une piste ne peut pas être à la
        //    fois Corrompu ET éligible à une NOUVELLE Corruption). Seule
        //    exception explicite : "Chambres de décontamination" n'est
        //    JAMAIS proposée comme destination si la source EST elle-même
        //    la Technologie — les emplacements de la carte ne sont pas
        //    suivis individuellement en base (seul le compte agrégé
        //    plateauMaison.corruptionChambreDecontamination l'est), donc
        //    "déplacer" d'un jeton chambre à lui-même n'a pas de sens.
        //    "Programme" reste TOUJOURS proposé aux 2 étapes (manuel, non
        //    suivi en base — même limitation que retirer_corruption/
        //    gagner_corruption).
        // Écriture : PLACE d'abord sur la destination, RETIRE ensuite de
        // la source — ordre choisi pour qu'un échec DB en cours de route
        // laisse au pire une Corruption EN TROP (facile à corriger
        // manuellement) plutôt qu'une Corruption perdue.
        titre.textContent = 'Déplacer une Corruption';
        contenu.innerHTML = '<p class="hint">Chargement…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieDeplacer = partieAffichee;
        var pistesCorrompuesDep = CivilisationService.PISTES.filter(function (p) {
          return !!(partieDeplacer.civilisation && partieDeplacer.civilisation.corrompues && partieDeplacer.civilisation.corrompues[p]);
        });
        var possedeChambreDep = nomsTechnologiesJoueur_(partieDeplacer).indexOf('chambres de décontamination') !== -1;
        var techChambreDep = technologieChambreDecontamination_(partieDeplacer);
        var maxChambreDep = techChambreDep ? (techChambreDep.amelioree ? 3 : 2) : 0;
        var corruptionStockeeDep = (partieDeplacer.plateauMaison && partieDeplacer.plateauMaison.corruptionChambreDecontamination) || 0;
        var optionsRetraitPisteDep_ = { conserverCorruptionRetiree: evenementConserveCorruptionActif_(partieDeplacer) };

        function libelleCibleDep_(c) {
          if (c.cle === 'secteur') return 'Secteur ' + c.numero;
          if (c.cle === 'piste') return 'la piste ' + CivilisationService.NOM_PISTE[c.piste];
          if (c.cle === 'techno') return 'Chambres de décontamination';
          return 'un Programme (manuellement)';
        }

        function executerRetraitDep_(source) {
          if (source.cle === 'secteur') return SecteurService.retirerCorruption(partieDeplacer.id, source.numero);
          if (source.cle === 'piste') return CivilisationService.definirCorruption(partieDeplacer.id, source.piste, false, optionsRetraitPisteDep_);
          if (source.cle === 'techno') {
            var champs = { corruptionChambreDecontamination: corruptionStockeeDep - 1 };
            return GameService.majPlateauMaison(partieDeplacer.id, champs).then(function () {
              partieDeplacer.plateauMaison.corruptionChambreDecontamination = corruptionStockeeDep - 1;
            });
          }
          return Promise.resolve(); // 'programme' : manuel, rien à écrire.
        }

        function executerPlacementDep_(destination) {
          if (destination.cle === 'secteur') return SecteurService.placerCorruption(partieDeplacer.id, destination.numero);
          if (destination.cle === 'piste') return CivilisationService.definirCorruption(partieDeplacer.id, destination.piste, true);
          if (destination.cle === 'techno') {
            var champs = { corruptionChambreDecontamination: corruptionStockeeDep + 1 };
            return GameService.majPlateauMaison(partieDeplacer.id, champs).then(function () {
              partieDeplacer.plateauMaison.corruptionChambreDecontamination = corruptionStockeeDep + 1;
            });
          }
          return Promise.resolve(); // 'programme'
        }

        function terminerDeplacement_(source, destination) {
          btnValider.disabled = true;
          executerPlacementDep_(destination)
            .then(function () { return executerRetraitDep_(source); })
            .then(function () {
              fermerModale_();
              btnValider.disabled = false;
              resolve({ detail: 'Corruption déplacée de ' + libelleCibleDep_(source) + ' vers ' + libelleCibleDep_(destination) + '.' });
            })
            .catch(function (erreur) {
              btnValider.disabled = false;
              window.alert('Échec du déplacement : ' + erreur.message);
            });
        }

        // --- Étape 2 : menu DESTINATION (calculé APRÈS le choix de la
        // source, mais AVANT toute écriture — voir chargerEtAfficherDestination_
        // ci-dessous, qui recharge les listes d'éligibilité juste avant).
        function afficherEtapeDestinationDep_(source, eligiblesSecteursGain, pistesNonCorrompuesDep, chambreDisponibleDep) {
          var options = [];
          if (eligiblesSecteursGain.length) options.push({ cle: 'secteur', label: 'Secteur' });
          if (pistesNonCorrompuesDep.length) options.push({ cle: 'piste', label: 'Piste de Civilisation' });
          options.push({ cle: 'programme', label: 'Programme', sousTexte: 'à placer manuellement' });
          if (source.cle !== 'techno' && chambreDisponibleDep) {
            options.push({ cle: 'techno', label: 'Chambres de décontamination', sousTexte: (maxChambreDep - corruptionStockeeDep) + ' emplacement(s) libre(s)' });
          }

          titre.textContent = 'Déplacer une Corruption — Destination';
          btnValider.hidden = true;
          contenu.innerHTML = '<p class="hint">Source : ' + libelleCibleDep_(source) + '.</p>' +
            '<div class="modal-choix-boutons">' +
            options.map(function (o) {
              return '<button type="button" class="btn btn-secondary btn-choix-liste" data-cle="' + o.cle + '">' +
                o.label + (o.sousTexte ? '<br><span class="cadre-action-sous-texte">' + o.sousTexte + '</span>' : '') +
                '</button>';
            }).join('') + '</div>';

          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
            btn.addEventListener('click', function () {
              var cle = btn.dataset.cle;
              if (cle === 'secteur') return afficherSousSelectSecteurDestinationDep_(source, eligiblesSecteursGain);
              if (cle === 'piste') return afficherSousSelectPisteDestinationDep_(source, pistesNonCorrompuesDep);
              if (cle === 'programme') return terminerDeplacement_(source, { cle: 'programme' });
              if (cle === 'techno') return terminerDeplacement_(source, { cle: 'techno' });
            });
          });
        }

        function afficherSousSelectSecteurDestinationDep_(source, eligibles) {
          titre.textContent = 'Déplacer une Corruption — Destination Secteur';
          contenu.innerHTML = '<p class="hint">Source : ' + libelleCibleDep_(source) + '.</p>' +
            '<select id="corruption-deplacer-select-secteur-dest" class="modal-choix-select">' +
            eligibles.map(function (e) { return '<option value="' + e.numero + '">Secteur ' + e.numero + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Valider';
          btnValider.onclick = function () {
            var numero = Number(document.getElementById('corruption-deplacer-select-secteur-dest').value);
            terminerDeplacement_(source, { cle: 'secteur', numero: numero });
          };
        }

        function afficherSousSelectPisteDestinationDep_(source, pistesEligibles) {
          if (pistesEligibles.length === 1) {
            terminerDeplacement_(source, { cle: 'piste', piste: pistesEligibles[0] });
            return;
          }
          titre.textContent = 'Déplacer une Corruption — Destination Piste de Civilisation';
          contenu.innerHTML = '<p class="hint">Source : ' + libelleCibleDep_(source) + '.</p>' +
            '<select id="corruption-deplacer-select-piste-dest" class="modal-choix-select">' +
            pistesEligibles.map(function (p) { return '<option value="' + p + '">' + CivilisationService.NOM_PISTE[p] + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Valider';
          btnValider.onclick = function () {
            var pisteChoisie = document.getElementById('corruption-deplacer-select-piste-dest').value;
            terminerDeplacement_(source, { cle: 'piste', piste: pisteChoisie });
          };
        }

        // Recharge les listes d'éligibilité DESTINATION juste avant
        // affichage (état courant, rien encore écrit à ce stade).
        function chargerEtAfficherDestinationDep_(source) {
          contenu.innerHTML = '<p class="hint">Chargement…</p>';
          var pistesNonCorrompuesDep = CivilisationService.PISTES.filter(function (p) {
            return !(partieDeplacer.civilisation && partieDeplacer.civilisation.corrompues && partieDeplacer.civilisation.corrompues[p]);
          });
          var chambreDisponibleDep = possedeChambreDep && corruptionStockeeDep < maxChambreDep;
          SecteurService.obtenirSecteursEligiblesGainCorruption(partieDeplacer.id)
            .then(function (eligiblesSecteursGain) {
              afficherEtapeDestinationDep_(source, eligiblesSecteursGain, pistesNonCorrompuesDep, chambreDisponibleDep);
            })
            .catch(function (erreur) {
              contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
              window.alert('Échec du chargement des secteurs : ' + erreur.message);
            });
        }

        // --- Étape 1 : menu SOURCE (identique à 'retirer_corruption').
        function afficherEtapeSourceDep_(eligiblesSecteursRetrait) {
          var options = [];
          if (eligiblesSecteursRetrait.length) options.push({ cle: 'secteur', label: 'Secteur' });
          if (pistesCorrompuesDep.length) options.push({ cle: 'piste', label: 'Piste de Civilisation' });
          options.push({ cle: 'programme', label: 'Programme', sousTexte: 'à retirer manuellement' });
          if (possedeChambreDep && corruptionStockeeDep > 0) {
            options.push({ cle: 'techno', label: 'Chambres de décontamination', sousTexte: corruptionStockeeDep + ' Corruption(s) stockée(s)' });
          }

          btnValider.hidden = true;
          contenu.innerHTML = '<div class="modal-choix-boutons">' +
            options.map(function (o) {
              return '<button type="button" class="btn btn-secondary btn-choix-liste" data-cle="' + o.cle + '">' +
                o.label + (o.sousTexte ? '<br><span class="cadre-action-sous-texte">' + o.sousTexte + '</span>' : '') +
                '</button>';
            }).join('') + '</div>';

          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
            btn.addEventListener('click', function () {
              var cle = btn.dataset.cle;
              if (cle === 'secteur') return afficherSousSelectSecteurSourceDep_(eligiblesSecteursRetrait);
              if (cle === 'piste') return afficherSousSelectPisteSourceDep_();
              if (cle === 'programme') return chargerEtAfficherDestinationDep_({ cle: 'programme' });
              if (cle === 'techno') return chargerEtAfficherDestinationDep_({ cle: 'techno' });
            });
          });
        }

        function afficherSousSelectSecteurSourceDep_(eligibles) {
          titre.textContent = 'Déplacer une Corruption — Source Secteur';
          contenu.innerHTML = '' +
            '<select id="corruption-deplacer-select-secteur-src" class="modal-choix-select">' +
            eligibles.map(function (e) { return '<option value="' + e.numero + '">Secteur ' + e.numero + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Valider';
          btnValider.onclick = function () {
            var numero = Number(document.getElementById('corruption-deplacer-select-secteur-src').value);
            chargerEtAfficherDestinationDep_({ cle: 'secteur', numero: numero });
          };
        }

        function afficherSousSelectPisteSourceDep_() {
          if (pistesCorrompuesDep.length === 1) {
            chargerEtAfficherDestinationDep_({ cle: 'piste', piste: pistesCorrompuesDep[0] });
            return;
          }
          titre.textContent = 'Déplacer une Corruption — Source Piste de Civilisation';
          contenu.innerHTML = '' +
            '<select id="corruption-deplacer-select-piste-src" class="modal-choix-select">' +
            pistesCorrompuesDep.map(function (p) { return '<option value="' + p + '">' + CivilisationService.NOM_PISTE[p] + '</option>'; }).join('') +
            '</select>';
          btnValider.hidden = false;
          btnValider.textContent = 'Valider';
          btnValider.onclick = function () {
            var pisteChoisie = document.getElementById('corruption-deplacer-select-piste-src').value;
            chargerEtAfficherDestinationDep_({ cle: 'piste', piste: pisteChoisie });
          };
        }

        SecteurService.obtenirSecteursEligiblesRetraitCorruption(partieDeplacer.id)
          .then(function (eligiblesSecteursRetrait) { afficherEtapeSourceDep_(eligiblesSecteursRetrait); })
          .catch(function (erreur) {
            contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
            window.alert('Échec du chargement des secteurs : ' + erreur.message);
          });

      } else if (contexte.type === 'influence_secteur') {
        // Gain d'Influence variable "N par Guilde/Installation/cube/
        // secteur Pur" (voir focusEngine.js — CLES_INFLUENCE_SECTEUR_) :
        // AUCUN choix utilisateur ici (montant entièrement déterminé par
        // l'état du plateau) — calcule via SecteurService.
        // obtenirAgregatsInfluenceSecteursPurs puis ferme la popup, résout
        // {montant, detail} — même principe que la résolution directe
        // "une seule option" déjà en place ci-dessus
        // (retirer_corruption/gagner_corruption, piste unique). La popup
        // reste néanmoins visible brièvement ("Calcul en cours…", Annuler
        // disponible en cas d'erreur de chargement) : même contrat que
        // toutes les autres entrées de ce fichier (modal.hidden = false
        // inconditionnel en fin de fonction, voir plus bas).
        //
        // contexte.formule = la clé focusEngine.js (une des clés de
        // CLES_INFLUENCE_SECTEUR_), contexte.valeur = le multiplicateur
        // catalogue (nombre), SAUF pour "influence_par_guilde" où c'est un
        // tableau de clés Guilde (CHAMP_GUILDE_PAR_CLE_INFLUENCE_ ci-dessus,
        // chaque Guilde valant implicitement 1 Influence — pas de
        // multiplicateur numérique pour cette clé précise).
        titre.textContent = 'Gagner de l’Influence';
        contenu.innerHTML = '<p class="hint">Calcul en cours…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieInfluence = partieAffichee;
        SecteurService.obtenirAgregatsInfluenceSecteursPurs(partieInfluence.id).then(function (agregats) {
          var formule = contexte.formule;
          var valeur = contexte.valeur;
          var montant = 0;
          var detail = '';

          if (formule === 'influence_par_guilde') {
            var clesGuilde = Array.isArray(valeur) ? valeur : [];
            var labels = [];
            clesGuilde.forEach(function (cleGuilde) {
              var champ = CHAMP_GUILDE_PAR_CLE_INFLUENCE_[cleGuilde];
              if (!champ) return;
              montant += agregats.guildesPures[champ] || 0;
              labels.push(labelGuilde_(champ));
            });
            detail = montant + ' Influence (Guildes Pures de ' + labels.join('/') + ' — ' + montant + ' au total).';
          } else if (formule === 'influence_par_guilde_pure') {
            montant = valeur * agregats.guildesPures.total;
            detail = montant + ' Influence (' + agregats.guildesPures.total + ' Guilde(s) Pure(s) × ' + valeur + ').';
          } else if (formule === 'influence_par_guilde_scientifique_pure') {
            montant = valeur * agregats.guildesPures.scientifiques;
            detail = montant + ' Influence (' + agregats.guildesPures.scientifiques + ' Guilde(s) de Scientifiques Pures × ' + valeur + ').';
          } else if (formule === 'influence_par_installation_pure') {
            montant = valeur * agregats.installationsPuresTotal;
            detail = montant + ' Influence (' + agregats.installationsPuresTotal + ' Installation(s) Pure(s) × ' + valeur + ').';
          } else if (formule === 'influence_par_cube_secteur_pur') {
            montant = valeur * agregats.cubesSecteurPurTotal;
            detail = montant + ' Influence (' + agregats.cubesSecteurPurTotal + ' cube(s) sur secteurs Purs × ' + valeur + ').';
          } else if (formule === 'influence_par_cube_secteur_pur_et_fiche') {
            var cubeActifFiche = (partieInfluence.plateauMaison && partieInfluence.plateauMaison.cubeActif) || 0;
            var totalCubes = agregats.cubesSecteurPurTotal + cubeActifFiche;
            montant = valeur * totalCubes;
            detail = montant + ' Influence (' + totalCubes + ' cube(s) — ' + agregats.cubesSecteurPurTotal +
              ' sur secteurs Purs + ' + cubeActifFiche + ' actif(s) sur la fiche Maison — × ' + valeur + ').';
          } else if (formule === 'influence_par_secteur_pur') {
            montant = valeur * agregats.nombreSecteurPur;
            detail = montant + ' Influence (' + agregats.nombreSecteurPur + ' secteur(s) Pur(s) × ' + valeur + ').';
          } else if (formule === 'influence_par_secteur_pur_avec_guilde') {
            montant = valeur * agregats.nombreSecteurPurAvecGuilde;
            detail = montant + ' Influence (' + agregats.nombreSecteurPurAvecGuilde + ' secteur(s) Pur(s) avec Guilde × ' + valeur + ').';
          } else if (formule === 'influence_par_secteur_pur_population_6') {
            montant = valeur * agregats.nombreSecteurPurPopulation6;
            detail = montant + ' Influence (' + agregats.nombreSecteurPurPopulation6 + ' secteur(s) Pur(s) à Population 6 × ' + valeur + ').';
          } else {
            detail = '0 Influence (formule "' + formule + '" inconnue).';
          }

          fermerModale_();
          resolve({ montant: montant, detail: detail });
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du calcul d’Influence : ' + erreur.message);
        });

      } else if (contexte.type === 'produire_revenu') {
        // Effet "Produire une ressource précise" (produire_nourriture/
        // energie/materiel/credit/science — voir focusEngine.js, ex. Focus
        // Production "Ravitailler") : AUCUN choix utilisateur — le gain est
        // le revenu de production ACTUEL de `contexte.ressource` (Niveau
        // Population × Guildes + bonus d'origine, calculerNiveauxProduction_
        // ci-dessus, puis table PRODUCTION_NEMS/PRODUCTION_CREDIT via
        // calculerProduction_ — même calcul que la grille affichée sur
        // l'écran Plat. maison). Résolution directe, même principe que
        // 'influence_secteur' juste au-dessus (popup affichée brièvement,
        // "Calcul en cours…", Annuler disponible en cas d'erreur).
        var labelRessourceProduite = CHAMP_RESSOURCE[contexte.ressource] ? CHAMP_RESSOURCE[contexte.ressource].label : contexte.ressource;
        titre.textContent = 'Produire — ' + labelRessourceProduite;
        contenu.innerHTML = '<p class="hint">Calcul en cours…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        calculerNiveauxProduction_(partieAffichee).then(function (resultat) {
          var niveauProduit = resultat.niveaux[contexte.ressource] || 0;
          var montantProduit = calculerProduction_(contexte.ressource, niveauProduit);
          fermerModale_();
          resolve({
            montant: montantProduit,
            detail: '+' + montantProduit + ' ' + labelRessourceProduite + ' (Production, Niveau ' + niveauProduit + ').'
          });
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du calcul de production : ' + erreur.message);
        });

      } else if (contexte.type === 'ameliorer_gloire') {
        // focusEngine.js reconnaît la clé "ameliorer_gloire" mais ne peut
        // pas écrire lui-même le résultat — le jeton Gloire (array) n'est
        // pas suivi par CHAMPS_DIFF_SUIVIS (non diffable par ce moteur au
        // clone JSON, voir focusEngine.js). AUCUN choix utilisateur ici
        // (cible toujours le jeton de plus petite valeur, +1 plafonné à
        // 5) — même principe de résolution déterministe que
        // "influence_secteur" ci-dessus : popup affichée brièvement
        // ("Calcul en cours…"), Annuler disponible en cas d'erreur.
        // Persiste directement via GameService.majPlateauMaison (même
        // pattern que le clic manuel sur un emplacement Gloire,
        // renderGloireDOM_ ci-dessus) puis rafraîchit immédiatement
        // l'affichage Gloire du Plat. maison.
        //
        // IMPORTANT : lit `etatGloire` (module var), PAS
        // `partieAffichee.plateauMaison.gloire` — ce dernier n'est réécrit
        // qu'au prochain StrategieService.afficher() complet, alors que le
        // clic manuel sur un emplacement Gloire (renderGloireDOM_
        // ci-dessus) met à jour `etatGloire` ET la base IMMÉDIATEMENT sans
        // jamais réassigner `partieAffichee.plateauMaison.gloire`. Lire ce
        // dernier ici cible donc potentiellement le mauvais jeton si un
        // clic manuel a eu lieu depuis le dernier affichage complet —
        // `etatGloire` est la seule source à jour en permanence pour ce
        // champ (même principe que le flux 'envahir' ci-dessus, qui
        // l'utilise déjà pour cette raison).
        titre.textContent = 'Améliorer un jeton Gloire';
        contenu.innerHTML = '<p class="hint">Calcul en cours…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieGloireAmelioration = partieAffichee;
        var gloireAvantAmelioration = etatGloire.slice(0, 5);
        while (gloireAvantAmelioration.length < 5) gloireAvantAmelioration.push(null);

        var indexGloireMin = -1, valeurGloireMin = null;
        gloireAvantAmelioration.forEach(function (v, i) {
          if (v === null || v === undefined || v >= 5) return;
          if (valeurGloireMin === null || v < valeurGloireMin) { valeurGloireMin = v; indexGloireMin = i; }
        });

        if (indexGloireMin === -1) {
          fermerModale_();
          window.alert('Aucun jeton Gloire à améliorer (aucun jeton posé, ou tous déjà à la valeur maximale 5).');
          resolve({ annule: true });
        } else {
          var gloireApresAmelioration = gloireAvantAmelioration.slice();
          gloireApresAmelioration[indexGloireMin] = valeurGloireMin + 1;
          GameService.majPlateauMaison(partieGloireAmelioration.id, { gloire: gloireApresAmelioration })
            .then(function () {
              partieGloireAmelioration.plateauMaison.gloire = gloireApresAmelioration;
              etatGloire = gloireApresAmelioration;
              renderGloireDOM_(partieGloireAmelioration);
              fermerModale_();
              resolve({ detail: 'jeton Gloire ' + valeurGloireMin + ' → ' + (valeurGloireMin + 1) + '.' });
            })
            .catch(function (erreur) {
              window.alert('Échec de l’amélioration du jeton Gloire : ' + erreur.message);
            });
        }

      } else if (contexte.type === 'defausser_gloire') {
        // Coût "defausser_gloire" (todo.md, retour utilisateur — ex. Focus
        // Progrès Héroïque "Restaurer", focus.json id 102) — miroir de
        // 'ameliorer_gloire' ci-dessus (même détermination automatique du
        // jeton Gloire de plus petite valeur, mêmes précautions sur
        // `etatGloire` — voir son commentaire "IMPORTANT" ci-dessus), mais
        // RETIRE le jeton (case remise à null) plutôt que d'incrémenter sa
        // valeur. Aucun plafond à 5 ici : un jeton déjà au maximum reste
        // éligible à la défausse.
        titre.textContent = 'Défausser un jeton Gloire';
        contenu.innerHTML = '<p class="hint">Calcul en cours…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieGloireDefausse = partieAffichee;
        var gloireAvantDefausse = etatGloire.slice(0, 5);
        while (gloireAvantDefausse.length < 5) gloireAvantDefausse.push(null);

        var indexGloireMinDefausse = -1, valeurGloireMinDefausse = null;
        gloireAvantDefausse.forEach(function (v, i) {
          if (v === null || v === undefined) return;
          if (valeurGloireMinDefausse === null || v < valeurGloireMinDefausse) { valeurGloireMinDefausse = v; indexGloireMinDefausse = i; }
        });

        if (indexGloireMinDefausse === -1) {
          fermerModale_();
          window.alert('Aucun jeton Gloire à défausser (aucun jeton posé sur la fiche Maison).');
          resolve({ annule: true });
        } else {
          var gloireApresDefausse = gloireAvantDefausse.slice();
          gloireApresDefausse[indexGloireMinDefausse] = null;
          GameService.majPlateauMaison(partieGloireDefausse.id, { gloire: gloireApresDefausse })
            .then(function () {
              partieGloireDefausse.plateauMaison.gloire = gloireApresDefausse;
              etatGloire = gloireApresDefausse;
              renderGloireDOM_(partieGloireDefausse);
              fermerModale_();
              resolve({ detail: 'jeton Gloire ' + valeurGloireMinDefausse + ' défaussé.' });
            })
            .catch(function (erreur) {
              window.alert('Échec de la défausse du jeton Gloire : ' + erreur.message);
            });
        }

      } else if (contexte.type === 'avancer_civilisation') {
        // Popup pour les clés focusEngine.js "avancer_civilisation"
        // (piste au choix, contexte.piste === null) / "avancer_
        // civilisation_societe"/"_gouvernement"/"_economie" (piste
        // imposée, contexte.piste renseigné) — affiche pour chaque piste
        // candidate son niveau actuel (X/NIVEAU_MAX) et un aperçu de la
        // PROCHAINE case (celle qui serait atteinte), réutilise
        // CivilisationService.obtenirDetailPistes (déjà chargé/mis en
        // cache pour "prochaines cases" — voir obtenirDetailPistesCache_/
        // texteProchainesCasesHTML_ plus haut, écran Focus). À la
        // validation, appelle CivilisationService.avancerPiste
        // directement (persistance ET résolution de l'effet de la
        // nouvelle case — qui peut À SON TOUR ouvrir une ou plusieurs
        // popups imbriquées : demanderChoix est relayé tel quel, choix
        // "et/ou", rappel manuel, retirer_corruption, avance_rapide — déjà
        // tous enchaînés automatiquement par avancerPiste elle-même,
        // aucun code supplémentaire nécessaire ici pour cet enchaînement).
        // Un refus (choix annulé) sur un effet imbriqué N'ANNULE PAS
        // l'avancement de piste déjà acquis (avancerPiste renvoie
        // effetSucces:false SANS jamais rejeter la Promise) —
        // resolve({detail}) couvre donc aussi ce cas, jamais
        // {annule:true} : cette popup n'est annulable qu'AVANT validation
        // (bouton Annuler), pas après.
        titre.textContent = contexte.moinsAvancee
          ? 'Avancer sur votre piste la moins avancée'
          : (contexte.piste
            ? 'Avancer sur la piste ' + CivilisationService.NOM_PISTE[contexte.piste]
            : 'Avancer sur une piste de Civilisation');
        contenu.innerHTML = '<p class="hint">Chargement…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        var partieCivilisation = partieAffichee;
        var nomMaisonCivilisation = partieCivilisation.joueur ? partieCivilisation.joueur.nom : null;
        var civActuelle = partieCivilisation.civilisation || {};

        // Piste Corrompue (partieCivilisation.civilisation.corrompues,
        // voir gameService.js/assemblerPartie_) : avancerPiste n'y résout
        // aucun effet (règle générique, civilisationService.js) — l'aperçu
        // le signale au lieu du texte de la case, pour ne pas laisser
        // croire au joueur qu'il va gagner le bénéfice affiché.
        function apercuProchaineCase_(detail, piste) {
          var niveau = civActuelle[piste] || 0;
          if (niveau >= CivilisationService.NIVEAU_MAX) return 'Piste déjà au niveau maximum.';
          if (civActuelle.corrompues && civActuelle.corrompues[piste]) return 'Piste Corrompue — avancera sans bénéfice de case.';
          var cases = (detail && detail[piste]) || [];
          var entree = cases[niveau]; // case niveau+1 (index niveau, 0-based)
          return entree ? ('Case ' + entree.case + ' — ' + (entree.texte || '(aucun texte)')) : '';
        }

        function validerAvancementPiste_(piste, boutonDeclencheur) {
          if (boutonDeclencheur) boutonDeclencheur.disabled = true;
          btnValider.disabled = true;
          CivilisationService.avancerPiste(partieCivilisation.id, nomMaisonCivilisation, piste, demanderChoix)
            .then(function (resultat) {
              fermerModale_();
              btnValider.disabled = false;
              if (resultat.dejaMaximum) {
                resolve({ detail: 'Piste ' + CivilisationService.NOM_PISTE[piste] + ' : déjà au maximum.', piste: piste });
                return;
              }
              // `resultat.effetJournal` (le détail de l'effet de la
              // nouvelle case — rappel manuel, retirer_corruption,
              // avance_rapide, etc., voir CivilisationService.avancerPiste)
              // n'est PAS ajouté ici — seuls le niveau atteint et le texte
              // de la case sont affichés, pour rester concis dans le statut
              // "✓ Appliqué (...)" d'un Cadre. Le bouton "Avancer" manuel
              // de l'écran Focus (avancerPiste_ ci-dessus) journalise, lui,
              // effetJournal séparément dans le journal "Actions
              // réalisées".
              var detail = 'Piste ' + CivilisationService.NOM_PISTE[piste] + ' : niveau ' + resultat.ancienNiveau + ' \u2192 ' + resultat.nouveauNiveau +
                (resultat.texte ? ' \u2014 ' + resultat.texte : '');
              resolve({ detail: detail, piste: piste });
            })
            .catch(function (erreur) {
              if (boutonDeclencheur) boutonDeclencheur.disabled = false;
              btnValider.disabled = false;
              window.alert('Échec de l\'avancement : ' + erreur.message);
            });
        }

        obtenirDetailPistesCache_(nomMaisonCivilisation).then(function (detail) {
          if (contexte.moinsAvancee) {
            var niveauMin = Math.min.apply(null, CivilisationService.PISTES.map(function (p) { return civActuelle[p] || 0; }));
            var pistesAEgalite = CivilisationService.PISTES.filter(function (p) { return (civActuelle[p] || 0) === niveauMin; });

            // todo.md (retour utilisateur, Focus Héroïque Renfort
            // "Accélérer") : plusieurs pistes à égalité pour la moins
            // avancée — si l'appelant l'a signalé (`tieBreakAuChoix`, voir
            // focusEngine.js resoudreCle_ cas "avancer_civilisation_moins_
            // avancee", clé sœur "tie_break":"au_choix" du catalogue),
            // laisser le joueur choisir PARMI CELLES-LÀ SEULEMENT, plutôt
            // que de retomber silencieusement sur l'ordre fixe Société >
            // Gouvernement > Économie ci-dessous. Bug rapporté : seule la
            // piste la mieux placée dans cet ordre était proposée, même
            // quand une autre piste (ex. Économie) était aussi au niveau
            // le plus bas.
            if (contexte.tieBreakAuChoix && pistesAEgalite.length > 1) {
              contenu.innerHTML = '<p class="hint">' + pistesAEgalite.length + ' pistes sont à égalité pour la moins avancée (niveau ' +
                niveauMin + '/' + CivilisationService.NIVEAU_MAX + ') — choisissez laquelle avancer.</p>' +
                '<div class="modal-choix-boutons">' +
                pistesAEgalite.map(function (piste) {
                  return '<button type="button" class="btn btn-secondary btn-choix-liste" data-piste="' + piste + '">' +
                    CivilisationService.NOM_PISTE[piste] + ' — niveau ' + niveauMin + '/' + CivilisationService.NIVEAU_MAX +
                    '<br><span class="cadre-action-sous-texte">' + apercuProchaineCase_(detail, piste) + '</span>' +
                    '</button>';
                }).join('') + '</div>';
              btnValider.hidden = true;
              Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
                btn.addEventListener('click', function () { validerAvancementPiste_(btn.dataset.piste, btn); });
              });
              return;
            }

            // Sans égalité (ou sans tie_break "au_choix" côté appelant) :
            // même tri que CivilisationService.avancerPisteMoinsAvancee
            // (js/civilisationService.js) — l'ordre fixe PISTES départage
            // silencieusement, comportement inchangé.
            var pisteMoinsAvancee = pistesAEgalite[0];
            contenu.innerHTML = '<p class="hint">Piste la moins avancée : ' + CivilisationService.NOM_PISTE[pisteMoinsAvancee] +
              ' (niveau ' + niveauMin + '/' + CivilisationService.NIVEAU_MAX + ')</p>' +
              '<p class="hint">' + apercuProchaineCase_(detail, pisteMoinsAvancee) + '</p>';
            btnValider.hidden = niveauMin >= CivilisationService.NIVEAU_MAX;
            btnValider.textContent = 'Avancer';
            btnValider.onclick = function () { validerAvancementPiste_(pisteMoinsAvancee, null); };
            return;
          }

          if (contexte.piste) {
            var piste = contexte.piste;
            var niveau = civActuelle[piste] || 0;
            contenu.innerHTML = '<p class="hint">Niveau actuel : ' + niveau + '/' + CivilisationService.NIVEAU_MAX + '</p>' +
              '<p class="hint">' + apercuProchaineCase_(detail, piste) + '</p>';
            btnValider.hidden = niveau >= CivilisationService.NIVEAU_MAX;
            btnValider.textContent = 'Avancer';
            btnValider.onclick = function () { validerAvancementPiste_(piste, null); };
            return;
          }

          contenu.innerHTML = '<div class="modal-choix-boutons">' +
            CivilisationService.PISTES.map(function (piste) {
              var niveau = civActuelle[piste] || 0;
              return '<button type="button" class="btn btn-secondary btn-choix-liste" data-piste="' + piste + '">' +
                CivilisationService.NOM_PISTE[piste] + ' \u2014 niveau ' + niveau + '/' + CivilisationService.NIVEAU_MAX +
                '<br><span class="cadre-action-sous-texte">' + apercuProchaineCase_(detail, piste) + '</span>' +
                '</button>';
            }).join('') + '</div>';
          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
            btn.addEventListener('click', function () { validerAvancementPiste_(btn.dataset.piste, btn); });
          });
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement.</p>';
          window.alert('Échec du chargement des pistes de Civilisation : ' + erreur.message);
        });

      } else if (contexte.type === 'resoudre_cadre_evenement') {
        // Popup générique de résolution d'un Cadre d'Événement galactique
        // — le texte du cadre n'est PAS répété ici (déjà visible sur la
        // carte, restée affichée derrière la popup) : seule la liste des
        // effets possibles est montrée, une option = un bouton. Une
        // option "proportionnelle" (échange N pour N, cf. actionsCadre_
        // dans index.html) affiche un champ quantité + un bouton dédié.
        // resolve({ indexChoisi, quantite }) ; l'appelant (index.html)
        // connaît la liste d'actions dans le même ordre et sait quoi
        // appliquer pour l'index choisi.
        titre.textContent = contexte.titre || 'Résoudre l\u2019effet';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        // Une option peut porter un `sousTexte` optionnel (ex. "Choisir
        // la technologie manuellement sur Plat. maison") — rendu en
        // italique, plus petit, sous le libellé principal dans le même
        // bouton (jamais noyé dans `option.label` lui-même, qui reste
        // concis).
        var sousTexteHtml_ = function (option) {
          return option.sousTexte ? '<br><span class="cadre-action-sous-texte">' + option.sousTexte + '</span>' : '';
        };

        contenu.innerHTML = '<div class="modal-choix-boutons">' +
          contexte.options.map(function (option, i) {
            if (option.proportionnel) {
              return '<span class="cadre-action-proportionnelle" data-index="' + i + '">' +
                '<input type="number" min="0"' + (option.plafond ? ' max="' + option.plafond + '"' : '') +
                ' value="0" class="cadre-input-proportionnel">' +
                '<button type="button" class="btn btn-secondary btn-choix-liste-proportionnel" data-index="' + i + '">' +
                option.label + sousTexteHtml_(option) + '</button></span>';
            }
            return '<button type="button" class="btn btn-secondary btn-choix-liste" data-index="' + i + '">' +
              option.label + sousTexteHtml_(option) + '</button>';
          }).join('') + '</div>';

        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
          btn.addEventListener('click', function () {
            fermerModale_();
            resolve({ indexChoisi: Number(btn.dataset.index) });
          });
        });
        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste-proportionnel'), function (btn) {
          btn.addEventListener('click', function () {
            var input = btn.parentElement ? btn.parentElement.querySelector('.cadre-input-proportionnel') : null;
            var quantite = Math.max(0, Math.floor(Number(input && input.value) || 0));
            if (!quantite) return;
            fermerModale_();
            resolve({ indexChoisi: Number(btn.dataset.index), quantite: quantite });
          });
        });

      } else if (contexte.type === 'phase_evaluation') {
        // Popup "Phase Évaluation" (bouton "Fin du cycle"/"Terminer la
        // partie", index.html) — voir docs-rules-cycle-de-jeu.md §3. Seule
        // la section Entretien (§3.2) est réellement automatisée pour
        // l'instant ; les 4 autres (Plateau Crise §3.1, Refuge §3.2.3,
        // Objectifs galactiques §3.3, Objectifs de Programme §3.4, cette
        // dernière correspondant à la Phase 4 de l'implémentation des
        // Programmes) ne sont que des rappels textuels — à automatiser
        // plus tard, chacune indépendamment. "Annuler" ferme la popup sans
        // rien persister ni avancer de cycle (aucune écriture DB n'a lieu
        // avant Valider, le paiement d'Entretien ne vit qu'en variables
        // locales le temps de la popup) — utile pour revenir en arrière si
        // "Fin du cycle" a été cliqué trop tôt (actions Focus pas encore
        // toutes jouées).
        //
        // Entretien (§3.2.1/3.2.2) : total = SecteurService.getEntretien
        // (emplacements Installation/Guilde occupés) + 2 par emplacement
        // Programme "Entretien actif" (partie.plateauMaison.
        // programmesUtilises, même calcul que chargerEntretien_,
        // index.html). Paiement par unité, au choix 1 Nourriture OU 2
        // Énergie OU 2 Matériel (jamais de Crédit/Science ici, sauf
        // Technologie non modélisée — §3.2.2, hors périmètre) : chaque
        // clic sur un des 3 boutons décrémente le stock LOCAL (aucune
        // écriture DB avant Valider, pour rester annulable en fermant
        // l'onglet) et incrémente `entretienPaye`. "Valider" reste
        // désactivé tant qu'il reste de l'Entretien impayé ET qu'au moins
        // une des 3 ressources permet encore de payer une unité (règle
        // explicite de l'utilisateur : on ne peut pas choisir de perdre de
        // l'Influence pour économiser des ressources, cf. §3.2.2 aussi) ;
        // dès que ce n'est plus vrai (Entretien à 0 OU ressources
        // réellement insuffisantes), Valider s'active et applique en un
        // seul GameService.majPlateauMaison : les 3 stocks décomptés +
        // l'Influence diminuée de 3 par unité d'Entretien restée impayée
        // (`Math.max(0, ...)`, même clamp que #influence-maison-input).
        titre.textContent = 'Phase Évaluation — Cycle ' + (partieAffichee.cycleActuel || '');
        contenu.innerHTML = '<p class="hint">Chargement de l’Entretien…</p>';
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };
        btnValider.hidden = false;
        btnValider.textContent = 'Valider et passer au cycle suivant';

        var partieEval = partieAffichee;
        var ressourcesEval = (partieEval.plateauMaison || {}).ressources || {};
        var stockEval = {
          nourriture: ressourcesEval.nourriture || 0,
          energie: ressourcesEval.energie || 0,
          materiel: ressourcesEval.materiel || 0
        };
        var influenceInitiale = ressourcesEval.influence || 0;
        var entretienPaye = 0;

        var slotsProgrammeEval = Array.isArray((partieEval.plateauMaison || {}).programmesUtilises)
          ? partieEval.plateauMaison.programmesUtilises : [];
        var entretienProgrammesEval = slotsProgrammeEval.filter(function (s) { return s && s.entretienActif; }).length * 2;

        SecteurService.getEntretien(partieEval.id).then(function (unitesSecteursEval) {
          var entretienTotal = unitesSecteursEval + entretienProgrammesEval;

          function renderPhaseEvaluation_() {
            var restant = entretienTotal - entretienPaye;
            var peutPayerNourriture = restant > 0 && stockEval.nourriture >= 1;
            var peutPayerEnergie = restant > 0 && stockEval.energie >= 2;
            var peutPayerMateriel = restant > 0 && stockEval.materiel >= 2;
            var peutEncorePayer = peutPayerNourriture || peutPayerEnergie || peutPayerMateriel;

            var texteEntretien;
            if (!entretienTotal) {
              texteEntretien = '<p>Aucun Entretien dû.</p>';
            } else if (!restant) {
              texteEntretien = '<p>Entretien dû : <strong>' + entretienTotal + '</strong> — intégralement payé.</p>';
            } else {
              texteEntretien = '<p>Entretien dû : <strong>' + entretienTotal + '</strong> — reste <strong>' + restant + '</strong> à payer.</p>' +
                '<div class="modal-choix-boutons">' +
                '<button type="button" class="btn btn-secondary" id="phase-eval-payer-nourriture"' + (peutPayerNourriture ? '' : ' disabled') + '>Payer 1 unité — 1 Nourriture (stock ' + stockEval.nourriture + ')</button>' +
                '<button type="button" class="btn btn-secondary" id="phase-eval-payer-energie"' + (peutPayerEnergie ? '' : ' disabled') + '>Payer 1 unité — 2 Énergie (stock ' + stockEval.energie + ')</button>' +
                '<button type="button" class="btn btn-secondary" id="phase-eval-payer-materiel"' + (peutPayerMateriel ? '' : ' disabled') + '>Payer 1 unité — 2 Matériel (stock ' + stockEval.materiel + ')</button>' +
                '</div>' +
                (peutEncorePayer
                  ? '<p class="hint">Vous devez payer tant que vous en avez les moyens (aucune substitution par Influence).</p>'
                  : '<p class="hint">Ressources insuffisantes : ' + restant + ' point(s) d’Entretien non payé(s) — ' + (restant * 3) + ' Influence seront perdus à la validation.</p>');
            }

            contenu.innerHTML = '' +
              '<div class="modal-section">' +
              '<h4 class="modal-section-titre">Plateau Crise</h4>' +
              '<p class="hint">Non automatisé — résolvez l’Escarmouche sur le plateau physique (docs-rules-cycle-de-jeu.md §3.1).</p>' +
              '</div>' +
              '<div class="modal-section">' +
              '<h4 class="modal-section-titre">Entretien</h4>' +
              texteEntretien +
              '</div>' +
              '<div class="modal-section">' +
              '<h4 class="modal-section-titre">Refuge</h4>' +
              '<p class="hint">Non automatisé — à détailler plus tard (§3.2.3).</p>' +
              '</div>' +
              '<div class="modal-section">' +
              '<h4 class="modal-section-titre">Objectifs galactiques</h4>' +
              '<p class="hint">Non automatisé — à détailler plus tard (§3.3).</p>' +
              '</div>' +
              '<div class="modal-section">' +
              '<h4 class="modal-section-titre">Objectifs de Programme</h4>' +
              '<p class="hint">Non automatisé — à détailler plus tard (§3.4, Phase 4 des Programmes).</p>' +
              '</div>';

            var btnPayerNourriture = document.getElementById('phase-eval-payer-nourriture');
            var btnPayerEnergie = document.getElementById('phase-eval-payer-energie');
            var btnPayerMateriel = document.getElementById('phase-eval-payer-materiel');
            if (btnPayerNourriture) btnPayerNourriture.addEventListener('click', function () { stockEval.nourriture -= 1; entretienPaye++; renderPhaseEvaluation_(); });
            if (btnPayerEnergie) btnPayerEnergie.addEventListener('click', function () { stockEval.energie -= 2; entretienPaye++; renderPhaseEvaluation_(); });
            if (btnPayerMateriel) btnPayerMateriel.addEventListener('click', function () { stockEval.materiel -= 2; entretienPaye++; renderPhaseEvaluation_(); });

            btnValider.disabled = peutEncorePayer;
          }

          renderPhaseEvaluation_();

          btnValider.onclick = function () {
            btnValider.disabled = true;
            var restant = entretienTotal - entretienPaye;
            var perteInfluence = restant * 3;
            var nouvelleInfluence = Math.max(0, influenceInitiale - perteInfluence);

            GameService.majPlateauMaison(partieEval.id, {
              ressourceNourriture: stockEval.nourriture,
              ressourceEnergie: stockEval.energie,
              ressourceMateriel: stockEval.materiel,
              influence: nouvelleInfluence
            }).then(function () {
              partieEval.plateauMaison.ressources.nourriture = stockEval.nourriture;
              partieEval.plateauMaison.ressources.energie = stockEval.energie;
              partieEval.plateauMaison.ressources.materiel = stockEval.materiel;
              partieEval.plateauMaison.ressources.influence = nouvelleInfluence;
              fermerModale_();
              resolve({ confirme: true, entretienNonPaye: restant, influencePerdue: perteInfluence });
            }).catch(function (erreur) {
              btnValider.disabled = false;
              window.alert('Échec de l\'enregistrement de l\'Entretien : ' + erreur.message);
            });
          };
        }).catch(function (erreur) {
          contenu.innerHTML = '<p class="hint">Erreur de chargement de l’Entretien.</p>';
          window.alert('Échec du chargement de l\'Entretien : ' + erreur.message);
        });

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
    var nouvellePartie = !partieAffichee || partieAffichee.id !== partie.id;
    // Le passage au cycle suivant (bouton "Fin du cycle", index.html —
    // via la popup 'phase_evaluation' puis GameService.avancerCycle)
    // rappelle afficher() avec le même partie.id mais un cycleActuel
    // différent, seul point de détection disponible ici pour
    // réinitialiser le delta "depuis le début du cycle" (voir en-tête de
    // soldeDebutCycle).
    var nouveauCycle = nouvellePartie || partieAffichee.cycleActuel !== partie.cycleActuel;
    if (nouvellePartie) {
      journal = [];
      // Évite d'afficher un instant les niveaux de production de la
      // partie précédemment ouverte avant que renderCubes_ (asynchrone)
      // ne les recalcule pour celle-ci.
      niveauxProduction = {};
    }
    if (nouveauCycle) reinitialiserSoldeDebutCycle_(partie);
    partieAffichee = partie;
    // L'Influence vit sur l'écran "Plat. maison" côté index.html
    // (App.renderPlateauMaison = renderEcranPlateauMaison_) — PAS dans les
    // fonctions render*_ de ce fichier. Tout appelant qui joue une action
    // Focus (jouerAction_ ci-dessous) ou résout un Cadre d'Événement
    // galactique (index.html, wrappers "…EtRafraichir_") appelle
    // StrategieService.afficher(partie) après persistance : cet appel à
    // App.renderPlateauMaison est donc nécessaire pour que l'Influence
    // gagnée (gain fixe ou formule variable, voir focusEngine.js) reste
    // visible sans recharger la partie. Centralisé ICI plutôt que dans
    // chaque appelant pour éviter tout risque d'oubli : idempotent, aucun
    // listener DOM ni écriture déclenchée par renderEcranPlateauMaison_,
    // donc sans risque même appelé deux fois (App.ouvrirPartie, seul
    // autre appelant de renderEcranPlateauMaison_, l'appelle déjà
    // directement avant afficher()).
    if (typeof App !== 'undefined' && App.renderPlateauMaison) App.renderPlateauMaison(partie);
    // Un gain de Programme (popup 'gagner_programme') peut retirer une
    // entrée de l'offre publique (Plat. Galactique) — même rationale que
    // App.renderPlateauMaison ci-dessus : idempotent, aucun listener/
    // écriture déclenché par ce rendu, sans risque même appelé après une
    // action qui ne touche pas les Programmes.
    if (typeof App !== 'undefined' && App.renderPlateauGalactique) App.renderPlateauGalactique(partie);
    renderRessources_(partie);
    renderRappelRessources_(partie);
    renderCubes_(partie);
    renderGloire_(partie);
    renderPistesCivilisation_(partie);
    renderFocusJoueur_(partie);
    renderProgrammesEnMain_(partie);
    renderFocusHeroiquesJoueur_(partie);
    renderFocusHeroiques_(partie);
    renderJournal_();
    majBoutonAnnuler_(partie.id);
  }

  document.getElementById('btn-annuler-action').addEventListener('click', annulerDerniereAction_);

  return {
    afficher: afficher,
    demanderChoix: demanderChoix,
    // Tables exposées pour que index.html n'en tienne pas de copies
    // locales (CHAMP_RESSOURCE, TYPES_INSTALLATION_CONSTRUIRE_,
    // TYPES_GUILDE_CONSTRUIRE_, TYPES_VAISSEAU, GUILDE_VERS_RESSOURCE —
    // voir index.html pour les appelants : formulaires Construire/
    // Rappeler un cube de l'écran Secteurs, libellés/couleurs "✓
    // Appliqué" des Cadres d'Événement galactique). Source de vérité
    // unique — ne pas dupliquer ces tables ailleurs.
    CHAMP_RESSOURCE: CHAMP_RESSOURCE,
    TYPES_INSTALLATION_CONSTRUIRE_: TYPES_INSTALLATION_CONSTRUIRE_,
    TYPES_GUILDE_CONSTRUIRE_: TYPES_GUILDE_CONSTRUIRE_,
    TYPES_VAISSEAU: TYPES_VAISSEAU,
    GUILDE_VERS_RESSOURCE: GUILDE_VERS_RESSOURCE
  };
})();
