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
  function renderCubes_(partie) {
    var pm = partie.plateauMaison || {};
    var cubeActif = pm.cubeActif || 0;
    var container = document.getElementById('ressources-cubes');
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    var nomTechDepart = (partie.joueur && partie.joueur.technologieDepart) ? partie.joueur.technologieDepart.nom : null;

    Promise.all([
      SecteurService.obtenirSecteurs(partie.id),
      DB.getAll('originesMaison')
    ]).then(function (resultats) {
      var secteurs = resultats[0] || [];
      var origines = resultats[1] || [];
      var origine = origines.filter(function (o) {
        return o.maison === nomMaison && o.technologie === nomTechDepart;
      })[0] || null;

      var totaux = { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 };
      var totalDeploye = 0;
      secteurs.forEach(function (s) {
        var population = Number(s.population) || 0;
        Object.keys(GUILDE_VERS_RESSOURCE).forEach(function (cleGuilde) {
          totaux[GUILDE_VERS_RESSOURCE[cleGuilde]] += population * (Number(s[cleGuilde]) || 0);
        });
        totalDeploye += (Number(s.pnCorvette) || 0) + (Number(s.pnSentinelle) || 0) +
          (Number(s.pnDestroyer) || 0) + (Number(s.pnCuirasse) || 0) + (Number(s.pnPorteVaisseau) || 0);
      });

      if (origine && origine.bonusProd && totaux.hasOwnProperty(origine.bonusProd)) {
        totaux[origine.bonusProd] += 1;
      }

      RESSOURCES_PRODUCTION.forEach(function (cle) { niveauxProduction[cle] = totaux[cle]; });
      majNiveauxAffiches_();

      dernierTotalDeployeCubes_ = totalDeploye;
      var cubeInactif = Math.max(0, NB_CUBES_TOTAL - cubeActif - totalDeploye);

      container.innerHTML =
        '<div class="ligne-cubes">' +
        '<span class="ligne-cubes-titre">Cube</span>' +
        '<span class="ligne-cubes-item">Inactif <strong id="cube-inactif-valeur">' + cubeInactif + '</strong></span>' +
        '<span class="ligne-cubes-item">Actif ' +
        '<input type="number" step="1" min="0" class="cube-actif-input" id="cube-actif-input" value="' + cubeActif + '">' +
        '</span>' +
        '<span class="ligne-cubes-item">Déployé <strong>' + totalDeploye + '</strong></span>' +
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
          journal.push('Piste ' + LABEL_PISTE[piste] + ' : Corruption retirée, mais le compteur de Corruption (plateau maison) n’est pas décrémenté — Événement « Le visage du mal » actif ce cycle (la Corruption reste dans votre zone personnelle jusqu’à l’Évaluation).');
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
   */
  function carteFocusJoueurHTML_(carte, carteIndex, source) {
    var ressources = (partieAffichee.plateauMaison || {}).ressources || {};
    var actionsHtml = carte.actions.map(function (action, actionIndex) {
      var jouable = coutSuffisant_(action.cout, ressources);
      return '<div class="focus-action' + (jouable ? '' : ' focus-action-insuffisant') + '">' +
        '<div class="focus-action-corps">' +
        '<p class="focus-action-nom">' + (action.action || '(action)') + '</p>' +
        (action.texte ? '<p>' + action.texte + '</p>' : '') +
        '</div>' +
        '<div class="focus-action-side">' +
        pastillesCoutHTML_(action.cout) +
        '<button class="btn-jouer-action" data-source="' + (source || 'joueur') + '" data-carte="' + carteIndex + '" data-action="' + actionIndex + '" title="Jouer cette action" aria-label="Jouer cette action">▶</button>' +
        '</div>' +
        '</div>';
    }).join('');

    return '<div class="card focus-card">' +
      '<h3>' + carte.focus + '</h3>' +
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

    FocusEngine.jouerActionEtPersister(partie.id, carte, action, demanderChoix)
      .then(function (resultat) {
        journal = journal.concat(resultat.journal);
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
          SecteurService.obtenirAdjacences(partie.scenarioId)
        ]).then(function (resultats) {
          var secteurs = resultats[0] || [];
          var adjacenceMap = construireAdjacenceMap_(resultats[1]);

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

          function vousAppartient_(numero) {
            return secteurEstPossede_(secteurParNumero_(numero));
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
                    var labelType = labelVaisseau_(m.type);
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
          var parNumero = creerSecteurParNumero_(secteurs);
          return function (numero) { return secteurEstPossede_(parNumero(numero)); };
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
              '<button type="button" class="btn btn-secondary" id="envahir-btn-ajouter" style="width:100%;margin-top:10px;">Engager cette unité</button>' +
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
            btnValider.textContent = 'Lancer l\u2019invasion (' + totalEngage + ' unité(s))';
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
                        (maisonCible ? ', bonus de Maison déchue « ' + maisonCible + ' » non appliqué pour l\u2019instant' : '') + ').'
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
                    detail: detail,
                    avertissement: avertissement
                  });
                })
                .catch(function (erreur) {
                  btnValider.disabled = false;
                  btnValider.textContent = 'Lancer l\u2019invasion (' + totalEngage + ' unité(s))';
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
        // CivilisationService.avancerPisteSansEffet sur cette même piste
        // (le joueur avance sur cette piste en ignorant le bénéfice de la
        // case atteinte, sauf déjà au maximum). Résout le texte de détail
        // combiné, pour les 2 branches (piste unique/select) ci-dessous.
        function placerCorruptionSurPiste_(piste) {
          return CivilisationService.definirCorruption(partieCorruptionGain.id, piste, true).then(function () {
            var base = 'Corruption placée sur la piste ' + CivilisationService.NOM_PISTE[piste] + '.';
            if (!contexte.avancerPisteApresPlacement) return base;
            return CivilisationService.avancerPisteSansEffet(partieCorruptionGain.id, piste).then(function (resultatAvance) {
              if (resultatAvance.dejaMaximum) return base + ' Piste déjà au niveau maximum, pas d’avancement.';
              return base + ' Piste avancée d’une case (niveau ' + resultatAvance.ancienNiveau + ' → ' + resultatAvance.nouveauNiveau + ', sans bénéfice de case).';
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

        function apercuProchaineCase_(detail, piste) {
          var niveau = civActuelle[piste] || 0;
          if (niveau >= CivilisationService.NIVEAU_MAX) return 'Piste déjà au niveau maximum.';
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
            // Même tri que CivilisationService.avancerPisteMoinsAvancee
            // (js/civilisationService.js) : la moins avancée, égalité
            // départagée par l'ordre fixe Société > Gouvernement >
            // Économie — calculé ICI plutôt que d'appeler cette fonction
            // séparément, pour réutiliser TEL QUEL le rendu/la validation
            // du mode "piste imposée" ci-dessous (résultat identique).
            var pisteMoinsAvancee = CivilisationService.PISTES.slice().sort(function (a, b) {
              return (civActuelle[a] || 0) - (civActuelle[b] || 0);
            })[0];
            var niveauMoinsAvancee = civActuelle[pisteMoinsAvancee] || 0;
            contenu.innerHTML = '<p class="hint">Piste la moins avancée : ' + CivilisationService.NOM_PISTE[pisteMoinsAvancee] +
              ' (niveau ' + niveauMoinsAvancee + '/' + CivilisationService.NIVEAU_MAX + ')</p>' +
              '<p class="hint">' + apercuProchaineCase_(detail, pisteMoinsAvancee) + '</p>';
            btnValider.hidden = niveauMoinsAvancee >= CivilisationService.NIVEAU_MAX;
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
