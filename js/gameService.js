/**
 * gameService.js
 * Cycle de vie de partie — Voidfall Companion PWA
 *
 * Créer / lire / lister / sauvegarder / archiver / supprimer une partie ;
 * mise à jour partielle du plateau maison (majPlateauMaison) ; Événement
 * galactique (sélection par cycle, Cadres — automatisés quand possible,
 * sinon résolution manuelle) ; avancement de cycle ; Focus héroïques ;
 * Technologies (obtenues, avancées) ; délégation à CivilisationService
 * pour les pistes de Civilisation (majCivilisation).
 *
 * Séparation de colonnes (invariant du fichier) : civilisation /
 * cycleActuel / technologiesObtenues / plateauMaison ne sont JAMAIS
 * sérialisés dans `parties.etatJson` — ils vivent dans leurs clés dédiées
 * (record `plateauMaison`, ou colonnes cycleNum/cycleTermine de
 * `parties`). Voir pourEtatJson_/assemblerPartie_ ci-dessous. `etatJson`
 * ne contient QUE les champs sans colonne dédiée : joueur (sans
 * technologieDepart, autoritaire dans plateauMaison), adversaires,
 * evenements, technologiesAcquises, focusJoueur, focusHeroiques,
 * focusHeroiquesPioches — id/dateCreation/archivee/scenarioId/cycleNum/
 * cycleTermine vivent en colonnes top-level du record `parties`, jamais
 * dupliqués dans le blob.
 *
 * `cycleActuel` n'est PAS stocké comme un champ redondant en plus de
 * cycleNum/cycleTermine : il est recalculé à chaque lecture
 * (assemblerPartie_) à partir de ces deux colonnes, qui restent seules
 * autoritaires — évite une source de vérité en trop à garder synchronisée
 * par les fonctions de cycle.
 *
 * Champ `technologiesAvanceesAmeliorees` (map {nom: bool}, sur
 * plateauMaison) : lu par focusEngine.js pour l'effet
 * "influence_par_technologie_amelioree" (voir focusEngine.test.js) — un
 * contrat actif. Sa valeur reste structurellement toujours `{}` en usage
 * réel : aucune UI ne l'alimente aujourd'hui (majPlateauMaison ne
 * l'autorise pas non plus via CHAMPS_PLATEAU_MAISON_AUTORISES) — gap
 * fonctionnel connu (UI manquante pour marquer une Technologie avancée
 * comme améliorée), pas du code mort.
 *
 * technologiesObtenues compte 5 emplacements (le tableau par défaut) ;
 * avec la Technologie de départ (fixe, hors de ce tableau), cela fait 6
 * technologies maximum au total. Une partie dont une technologie occupe
 * un 6e emplacement (ancien format) la conserve telle quelle en base
 * (colonne dédiée, jamais tronquée ici) — seul index.html limite
 * l'affichage/l'édition à 5.
 *
 * Identifiant de partie : crypto.randomUUID(), généré une seule fois à la
 * création — unicité locale par appareil, aucun serveur à consulter.
 *
 * Dépend de db.js (objet global DB) : à charger avant ce fichier.
 * secteurService.js et focusService.js sont des dépendances optionnelles
 * de creerPartie (gardées par `typeof X !== 'undefined'`) : ce fichier
 * reste utilisable seul (tests) si l'un ou l'autre n'est pas chargé.
 * FocusEngine est résolu en référence globale paresseuse (au moment de
 * l'appel, pas au chargement) par appliquerCadreChoixFocusEngine, ce qui
 * permet à focusEngine.js d'être chargé après gameService.js dans
 * index.html malgré la dépendance inverse que FocusEngine a lui-même sur
 * GameService pour son orchestrateur jouerActionEtPersister.
 */

var GameService = (function () {
  'use strict';

  // Mise en place solo — constantes du livret, identiques pour toute
  // Maison/Origine.
  var INFLUENCE_DEPART = 10;
  var GLOIRE_DEPART = [2, null, null, null, null];

  // Table de règles fixes (livret "Actions de Programme") : les 2 Focus
  // qui débloquent l'action gratuite d'un Programme, et l'action
  // elle-même — FIXES PAR TYPE (Domination/Force/Soutien/Richesse), pas
  // par carte (les 8 cartes d'un même type partagent la même action).
  // Même statut que BONUS_COMMERCE (focusEngine.js) : donnée de règles
  // figée, sans risque à porter en dur. Consommée par index.html
  // ("Programmes en main", écran Focus) et, plus tard, par la résolution
  // de l'action de Programme elle-même (Phase 3, non traitée ici).
  var INFO_PROGRAMME_PAR_TYPE = {
    Domination: { focusLies: ['Tentation', 'Innovation'], action: 'Envahissez un secteur.' },
    Soutien: { focusLies: ['Conquête', 'Renfort'], action: 'Activez 1 cube et/ou construisez une Installation.' },
    Force: { focusLies: ['Prospérité', 'Progrès'], action: 'Avancez sur votre piste Civilisation la moins avancée (au choix si égalité) ou gagnez un jeton Commerce.' },
    Richesse: { focusLies: ['Développement', 'Production'], action: 'Établissez une Guilde et/ou produisez un type de ressource. Si vous faites les deux, vous devez choisir le type de ressource qui correspond à la Guilde établie.' }
  };
  // JSON Effet FocusEngine correspondant à chaque action de Programme
  // ci-dessus — voir GameService.utiliserProgramme. Le texte de
  // INFO_PROGRAMME_PAR_TYPE[type].action sert TEL QUEL de `texteAction` à
  // FocusEngine.resoudreEffet : "et/ou" y déclenche le mode choix
  // INCLUSIF (Soutien/Richesse), son absence le mode EXCLUSIF (Force) —
  // voir focusEngine.js resoudreCle_, cas "choice"/"choix". Richesse
  // inclut `produire_ressource`, non automatisé côté PWA (niveaux de
  // production non calculés) : sans conséquence ici, ce choix retombe
  // simplement sur le repli générique de resoudreCle_ ("à appliquer
  // manuellement", ne bloque jamais) — le Programme part bien en jeu,
  // avec un rappel manuel pour cette moitié de l'action.
  // `tie_break: "au_choix"` sur l'option Force (todo.md, retour
  // utilisateur) : le texte imprimé ("au choix si égalité") le dit
  // explicitement, comme le Focus Héroïque Renfort "Accélérer" — voir
  // focusEngine.js resoudreCle_, cas "avancer_civilisation_moins_avancee",
  // qui lit cette clé sœur pour laisser le joueur choisir parmi les
  // pistes à égalité plutôt que l'ordre fixe Société > Gouvernement >
  // Économie.
  var EFFET_PROGRAMME_PAR_TYPE_ = {
    Domination: { envahir: 1 },
    Soutien: { choice: ['activer_cube', 'construire_installation'] },
    Force: { choice: [{ tie_break: 'au_choix', avancer_civilisation_moins_avancee: 1 }, 'gagner_commerce'] },
    Richesse: { choice: ['etablir_guilde', { produire_ressource: 1 }] }
  };
  // Ordre d'affichage fixe de l'offre de Programme (Plat. Galactique) —
  // même ordre que le tableau ci-dessus.
  var TYPES_PROGRAMME_OFFRE = ['Domination', 'Force', 'Soutien', 'Richesse'];

  /**
   * Chantier "résolution des Technologies" (retour utilisateur,
   * 25/08/2026) : chaque Technologie obtenue (data/catalogue/
   * technologies.json, champ `immediat`) a un effet immédiat à résoudre
   * au moment même de son acquisition — voir GameService.
   * gagnerTechnologieEtResoudreEffet ci-dessous. `immediat` utilise un
   * vocabulaire PROPRE au catalogue Technologies (gain/cost/activate_cube/
   * deploy/build), différent de celui de focus.json/pistesCivilisation.json
   * — ces 2 tables traduisent, TECHNOLOGIE PAR TECHNOLOGIE (à la main, une
   * seule fois portée), ce vocabulaire vers ce que le moteur PWA sait déjà
   * résoudre :
   * - EFFET_TECHNOLOGIE_IMMEDIAT_ : sous-ensemble de `immediat` déjà
   *   entièrement exprimable en JSON Effet FocusEngine (gains simples,
   *   gagner_commerce, activer_cube — mêmes clés que EFFET_PROGRAMME_
   *   PAR_TYPE_ ci-dessus) — résolu via FocusEngine.resoudreEffet, EXACTEMENT
   *   comme GameService.utiliserProgramme.
   * - TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_ : `immediat.deploy` avec
   *   destination TOUJOURS fixe "Secteur-Mère" (jamais un choix du
   *   joueur) — hors du vocabulaire FocusEngine (une action secteur),
   *   résolu par un appel direct à SecteurService.deployerCube sur le
   *   numéro du Secteur-Mère (SecteurService.obtenirSecteurMere).
   * - EFFET_TECHNOLOGIE_IMMEDIAT_AVEC_COUT_ : `immediat.cost` combiné à un
   *   Effet (`activate`/`remove_corruption` exprimables en JSON FocusEngine,
   *   ou `{}` quand le "vrai" Effet est un déploiement Secteur-Mère résolu
   *   à part) — résolu via FocusEngine.resoudreEffetEtCout (Effet-puis-
   *   Coût, comme resoudreAction pour une action Focus, mais SANS le
   *   suivi actionsFocusUtilisees).
   * - TECHNOLOGIES_CHOIX_DEPLOIEMENT_SECTEUR_MERE_ : `immediat.choice`
   *   dont une alternative est un déploiement FIXE Secteur-Mère (donc
   *   hors vocabulaire FocusEngine, comme TECHNOLOGIES_DEPLOIEMENT_
   *   SECTEUR_MERE_ ci-dessus, mais DANS un choice) — le choix est posé
   *   directement par gagnerTechnologieEtResoudreEffet (popup
   *   'option_exclusive' à la main) puis dispatché entre SecteurService.
   *   deployerCube et FocusEngine.resoudreEffet selon la réponse.
   *
   * TOUTES les 28 Technologies du catalogue ont désormais un effet
   * immédiat résolu automatiquement (chantier complet, 27/08/2026) —
   * seuls restent hors périmètre le champ `permanent` (bonus passifs de
   * combat/production, jamais modélisés) et `ameliore` (version
   * améliorée du bonus permanent), affichés comme texte informatif
   * uniquement (voir docs-architecture-pwa.md §10). Ces 4 tables
   * couvrent tout le vocabulaire `immediat` rencontré dans le
   * catalogue : gains simples, gagner_commerce/activer_cube, deploy
   * fixe Secteur-Mère (seul ou combiné à un cost), build sur secteur au
   * choix (seul ou combiné à un cost/activate), choice exclusif entre 2
   * alternatives (dont l'une peut être un deploy fixe ou un build), et
   * upgrade.gloire/move.corruption (mécaniques déterministes uniques).
   *
   * `EFFET_TECHNOLOGIE_IMMEDIAT_` accepte aussi une clé "choice" — MÊME
   * FORMAT tableau que focus.json (PAS le format objet {cle:valeur,...}
   * du catalogue Technologies, traduit à la main ici) : résolu en mode
   * EXCLUSIF (`texteAction` transmis vide par gagnerTechnologieEtResoudreEffet
   * ci-dessous, jamais "et/ou") via la MÊME popup 'option_exclusive' déjà
   * portée Feuille (contrairement à 'bonus_commerce', jamais migrée —
   * voir Nacelles/gagner_commerce ci-dessous, qui retombe donc sur
   * #modal-choix le temps de ce sous-choix) : Clonage/Nexus de commerce
   * s'affichent donc entièrement DANS la Feuille, sans aucun repli.
   */
  var EFFET_TECHNOLOGIE_IMMEDIAT_ = {
    'Nacelles': { gagner_commerce: 1, activer_cube: 1 },
    'Collecte de données': { credit: 2, science: 2 },
    'Réplicateurs de combat': { activer_cube: 1 },
    'Robotique': { materiel: 2 },
    'Torpilles': { materiel: 2 },
    'Ciblage': { energie: 2 },
    'Hyperpropulsion': { prime: 3 },
    'Clonage': { choice: [{ credit: 1 }, { activer_cube: 1 }] },
    'Nexus de commerce': { choice: [{ nourriture: 2 }, { gagner_commerce: 1 }] },
    // `immediat.upgrade.gloire`/`immediat.move.corruption` — mécaniques
    // "uniques" (aucun choix, aucun secteur) déjà entièrement outillées
    // côté FocusEngine (clés 'ameliorer_gloire'/'deplacer_corruption',
    // popups dédiées qui ciblent automatiquement le jeton Gloire le plus
    // bas / ouvrent le menu Source-Destination de Corruption) — aucune
    // nouvelle mécanique à construire, une simple entrée de table.
    'Surveillance centrale': { ameliorer_gloire: 1 },
    'Chambres de décontamination': { deplacer_corruption: 1 },
    // `immediat.build` (secteur au CHOIX du joueur) — la popup 'construire'
    // (FocusEngine, CLES_CONSTRUIRE) gère déjà nativement le choix de
    // secteur ET de type forcé (voir etablir_guilde_banquier ci-dessus,
    // même principe) : 'construire_chantier_naval'/'construire_
    // base_stellaire' (2 nouvelles entrées CATEGORIE_PAR_CLE_CONSTRUIRE_/
    // TYPE_FORCE_PAR_CLE_CONSTRUIRE_, focusEngine.js) forcent le type de
    // structure exigé par la carte, sans jamais laisser le joueur en
    // choisir un autre.
    'Quais orbitaux': { construire_chantier_naval: 1, activer_cube: 1 },
    'Bases Stellaires': { construire_base_stellaire: 1 },
    'Matrice neuronale': { etablir_guilde_banquier: 1 },
    // Cybernétique : `immediat.build.structure === "guilde"` (type de
    // Guilde au LIBRE choix du joueur, contrairement à Matrice neuronale
    // ci-dessus) — clé `etablir_guilde` déjà existante (catégorie 'guilde',
    // AUCUN typeForce), même popup 'construire'.
    'Cybernétique': { etablir_guilde: 1 },
    // 4 Technologies suivantes : `immediat.choice` dont au moins une
    // alternative retombe elle-même sur une popup à choix de secteur
    // (augmenter_population_pure/deployer_cube/etablir_guilde/construire_
    // chantier_naval) — déjà un enchaînement ÉPROUVÉ par focusEngine.js
    // (choice -> option choisie -> resoudreJsonInterne_ récursif, EXACT
    // même mécanisme que 'choice': ['augmenter_population',
    // 'augmenter_population_pure'] déjà couvert par focusEngine.test.js),
    // aucune nouvelle mécanique de choix à construire ici, juste des
    // clés déjà connues combinées dans un tableau. `population_pure` du
    // catalogue Technologies -> `augmenter_population_pure` (FocusEngine) ;
    // `deploy_cube` du catalogue Technologies -> `deployer_cube`
    // (FocusEngine, forme "mode libre" déjà exercée par focus.json/
    // pistesCivilisation.json, plutôt que l'alias `deploy_cube`, jamais
    // rencontré ailleurs dans le vrai catalogue) ; `build_chantier_naval`
    // -> `construire_chantier_naval` (voir Quais orbitaux ci-dessus).
    'Terraformation': { choice: [{ materiel: 2 }, { augmenter_population_pure: 1 }] },
    'Transports tactiques': { choice: [{ deployer_cube: 1 }, { augmenter_population_pure: 1 }] },
    'Vaisseaux-Arches': { choice: [{ guilde: 1 }, { augmenter_population_pure: 1 }] },
    'Scanner de récupération': { choice: [{ deployer_cube: 1 }, { activer_cube: 1 }] },
    'Missiles longue portée': { choice: [{ energie: 2 }, { construire_chantier_naval: 1 }] },
    // Drones autonomes : `immediat` = `{gain:{commerce_token:1},
    // choice:{deploy_cube:1}}` — un `choice` à UNE SEULE clé (le catalogue
    // ne propose ici qu'UNE alternative, pas un "A ou B") : traduit tel
    // quel en tableau à 1 élément, la popup 'option_exclusive' affiche
    // simplement cette unique alternative + Annuler (aucun mécanisme
    // nouveau — un `choice` à 1 option est un cas valide, pas un cas
    // particulier, de la résolution `choice` déjà en place).
    'Drones autonomes': { gagner_commerce: 1, choice: [{ deployer_cube: 1 }] }
  };
  var TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_ = {
    'Boucliers': 'corvette',
    'Destroyers': 'destroyer',
    'Torpilles': 'corvette',
    'Ciblage': 'corvette',
    // Cuirassés : `immediat.deploy` fixe Secteur-Mère comme les 4
    // ci-dessus, mais avec en PLUS un `cost` — voir EFFET_TECHNOLOGIE_
    // IMMEDIAT_AVEC_COUT_ ci-dessous, résolu APRÈS ce déploiement
    // (toujours inconditionnel, comme les autres entrées de cette table).
    'Cuirassés': 'cuirasse'
  };
  /**
   * 3e table de traduction du chantier (voir EFFET_TECHNOLOGIE_IMMEDIAT_/
   * TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_ ci-dessus) : `immediat.cost`
   * combiné à un Effet (Cellules énergétiques/Purificateur : `activate`/
   * `remove_corruption`, tous deux EXPRIMABLES en JSON FocusEngine ; ou
   * Cuirassés/Porte-Vaisseaux : `effet: {}`, leur "vrai" Effet — un
   * déploiement fixe Secteur-Mère, direct ou au choix — étant résolu à
   * PART, voir TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_/TECHNOLOGIES_
   * CHOIX_DEPLOIEMENT_SECTEUR_MERE_, cette entrée ne sert alors qu'à
   * débiter le `cost`). Résolu via FocusEngine.resoudreEffetEtCout
   * (Effet-puis-Coût, MÊME moteur que resoudreAction pour une action
   * Focus, sans le suivi `actionsFocusUtilisees` — nouvelle fonction,
   * gameService.gagnerTechnologieEtResoudreEffet n'avait jusqu'ici jamais
   * eu besoin de débiter un coût, seulement d'accorder des gains
   * signe=+1 via resoudreEffet).
   */
  var EFFET_TECHNOLOGIE_IMMEDIAT_AVEC_COUT_ = {
    'Cellules énergétiques': { effet: { activer_cube: 2 }, cout: { energie: 2 } },
    'Purificateur': { effet: { retirer_corruption: 1 }, cout: { science: 1 } },
    'Cuirassés': { effet: {}, cout: { materiel: 1 } },
    'Porte-Vaisseaux': { effet: {}, cout: { nourriture: 1 } }
  };
  /**
   * 4e table : `immediat.choice` dont une alternative est un déploiement
   * FIXE Secteur-Mère (hors vocabulaire FocusEngine, comme TECHNOLOGIES_
   * DEPLOIEMENT_SECTEUR_MERE_ ci-dessus, mais ICI dans un `choice` — donc
   * PAS de résolution inconditionnelle possible) et l'autre une clé
   * FocusEngine ordinaire. Comme cette alternative "déploiement fixe" n'a
   * aucune traduction possible en clé FocusEngine (le moteur reste pur,
   * aucun accès direct à SecteurService), le choix lui-même est posé ICI,
   * directement par gagnerTechnologieEtResoudreEffet (demanderChoix au
   * format 'option_exclusive', options = 2 libellés FR bruts — la popup
   * affiche tel quel toute chaîne absente de LIBELLES_OPTIONS, aucune
   * modif strategieService.js nécessaire), puis DISPATCHE manuellement
   * vers SecteurService.deployerCube (option 0) ou FocusEngine.resoudreEffet
   * (option 1, `effetAutre`) — jamais via le `choice` générique de
   * FocusEngine (qui ne saurait pas résoudre l'option 0). `Porte-Vaisseaux`
   * a EN PLUS un `cost` (EFFET_TECHNOLOGIE_IMMEDIAT_AVEC_COUT_ ci-dessus,
   * hors du choice dans le catalogue -> débité après, quelle que soit
   * l'option choisie) ; `Sentinelles` n'en a aucun.
   */
  var TECHNOLOGIES_CHOIX_DEPLOIEMENT_SECTEUR_MERE_ = {
    'Porte-Vaisseaux': {
      typeUnite: 'portevaisseau',
      labelDeploiement: 'Déployer 1 Porte-Vaisseau sur le Secteur-Mère.',
      labelAutre: 'Activer 1 cube de Puissance Navale.',
      effetAutre: { activer_cube: 1 }
    },
    'Sentinelles': {
      typeUnite: 'sentinelle',
      labelDeploiement: 'Déployer 1 Sentinelle sur le Secteur-Mère.',
      labelAutre: 'Construire une Défense de Secteur.',
      // `construire_defense_secteur` : 3e clé à type forcé de
      // CATEGORIE_PAR_CLE_CONSTRUIRE_/TYPE_FORCE_PAR_CLE_CONSTRUIRE_
      // (focusEngine.js), même principe que construire_chantier_naval/
      // construire_base_stellaire.
      effetAutre: { construire_defense_secteur: 1 }
    }
  };
  // Le rappel "Effet immédiat" affiché à la popup 'gagner_technologie'
  // (strategieService.js) est désormais dérivé DIRECTEMENT du champ brut
  // "immediat" du catalogue (texteEffetImmediatDepuisJson_,
  // strategieService.js — traducteur générique, couvre les 28
  // technologies) plutôt que d'une table de textes écrits à la main ici,
  // limitée aux technologies déjà portées (retour utilisateur : "il n'y a
  // pas de texte pour l'effet immédiat... afficher le gain directement à
  // partir de l'effet").

  /**
   * Gain d'Influence propre à la VALEUR d'une Technologie du pool
   * "Technologies obtenues" (retour utilisateur, 25/08/2026) : à la mise
   * en place, 5 des 8 technologies des maisons déchues sont désignées
   * "avec gain", 3 "sans gain" (`sansPoint`, choisi manuellement en mise
   * en place, ou tiré aléatoirement — marquerTechnologiesSansPoint_/
   * marquerTechnologiesSansPointManuel_ ci-dessous, déjà en place avant ce
   * chantier). Une Technologie "avec gain" (sansPoint === false) vaut 4
   * Influence De base, 6 Améliorée — SÉPARÉ de tout gain d'Influence
   * propre à l'effet immédiat de la carte elle-même (ex. Bonus Commerce,
   * "Gagnez 3 Influence" — les deux s'additionnent, ce n'est PAS un
   * doublon). Modélisé comme une base (INFLUENCE_TECHNOLOGIE_BASE_,
   * accordée une fois à l'acquisition, gagnerTechnologieEtResoudreEffet
   * ci-dessous) + un delta (INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_,
   * appliqué par definirTechnologieAmelioree à CHAQUE changement d'état
   * de la case "Améliorée" — que ce changement ait lieu au moment même de
   * l'acquisition — Focus Innovation "Inventer" peut accorder le niveau
   * Améliorée directement — ou plus tard, via la case normale du Plat.
   * maison une fois le cycle d'amélioration débloqué) plutôt qu'une
   * valeur fixe 4/6 dupliquée à 2 endroits : 4 + 2 = 6, une seule source
   * de vérité pour "2". Volontairement JAMAIS appliqué à la Technologie
   * de départ (cible === 'depart' de definirTechnologieAmelioree) — hors
   * périmètre de ce chantier pour l'instant, elle n'est de toute façon
   * jamais "acquise" via une action.
   */
  var INFLUENCE_TECHNOLOGIE_BASE_ = 4;
  var INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_ = 2;

  /**
   * Identifiant de partie (retour utilisateur — "crypto.randomUUID is not
   * a function" à la création d'une partie sur iPhone via
   * http://<IP-LAN>:port) : `crypto.randomUUID()` (voir creerPartie
   * ci-dessous) n'existe QUE dans un contexte sécurisé (HTTPS ou
   * localhost) — accéder à la PWA par son IP locale en simple HTTP (utile
   * pour tester sur un vrai téléphone sans certificat) en fait un contexte
   * non sécurisé où cette fonction est absente de l'objet `crypto`, d'où
   * l'erreur. `crypto.getRandomValues()`, LUI, n'est PAS restreint aux
   * contextes sécurisés (seuls `randomUUID`/`crypto.subtle` le sont) :
   * repli vers un UUID v4 assemblé à la main à partir de ces octets
   * aléatoires cryptographiquement forts, puis vers Math.random en tout
   * dernier recours (ni l'un ni l'autre disponibles) — suffisant ici,
   * l'unicité recherchée n'est que locale par appareil (aucun serveur à
   * consulter, voir en-tête de fichier).
   */
  function genererIdPartie_() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      var octets = crypto.getRandomValues(new Uint8Array(16));
      octets[6] = (octets[6] & 0x0f) | 0x40;
      octets[8] = (octets[8] & 0x3f) | 0x80;
      var hex = Array.prototype.map.call(octets, function (o) { return ('0' + o.toString(16)).slice(-2); });
      return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function offresProgrammeParDefaut_() {
    return TYPES_PROGRAMME_OFFRE.map(function (type) {
      return { type: type, nom: null, corrompu: false };
    });
  }

  /**
   * Plateau Programme par défaut (4 emplacements fixes de la fiche
   * Maison — voir GameService.utiliserProgramme) : index 0 réservé au
   * Programme de départ — `slot0` (optionnel, passé par creerPartie une
   * fois obtenirProgrammeDepart_ résolu) est `{code, entretienActif:
   * true, corrompu: false, depart: true}` identifié par `code` (pas de
   * `nom`/`type`, ces Programmes n'en ont pas), ou `null` en repli (aucune
   * correspondance catalogue trouvée, ou partie créée avant ce câblage).
   * Index 1-3 : emplacements "utilisés" au fil de la partie, vides au
   * départ SAUF le dernier (index 3), Corrompu dès la mise en place
   * (règle du livret) — reflété aussi dans corruptionMaison, voir
   * creerPartie ci-dessous.
   */
  function programmesUtilisesParDefaut_(slot0) {
    return [
      slot0 || null,
      { nom: null, entretienActif: false, corrompu: false },
      { nom: null, entretienActif: false, corrompu: false },
      { nom: null, entretienActif: false, corrompu: true }
    ];
  }

  var CHAMPS_PLATEAU_MAISON_AUTORISES = [
    'ressourceNourriture', 'ressourceEnergie', 'ressourceMateriel',
    'ressourceCredit', 'ressourceScience', 'influence', 'cubeActif',
    'jetonPrime', 'jetonLiberation', 'jetonCommerce', 'gloire',
    // Programmes "en main" (gagnés, pas encore joués — tableau non borné
    // de noms, même famille que jetonCommerce) et "en jeu" (joués sur la
    // fiche Maison, 4 emplacements fixes — voir GameService.gagnerProgramme/
    // utiliserProgramme). Remplace l'ancien programme1-4 (colonnes
    // abandonnées, jamais migrées — IndexedDB n'impose pas de schéma).
    'programmesEnMain', 'programmesUtilises',
    // Offre publique de Programme (4 emplacements fixes, 1 par type,
    // { type, nom, corrompu } — voir GameService.gagnerProgramme et
    // index.html/renderOffreProgrammes_). Même famille que `gloire` :
    // tableau non diffable par focusEngine.js, écrit tel quel.
    'offresProgramme',
    'technologiesObtenues', 'technologiesAvanceesChoisies',
    // Compteur manuel des Corruptions actuellement stockées sur la
    // Technologie "Chambres de décontamination" (jeton simple, même
    // principe que jetonPrime/jetonLiberation — voir strategieService.js,
    // jetonInputHTML_/persisterJeton_). Le jeu ne gagne PAS automatiquement
    // de Corruption sur cette case (mécanique de stockage non automatisée) :
    // l'incrémenter reste manuel, le décrémenter peut se faire via l'effet
    // retirer_corruption (FocusEngine.js) si le joueur possède la
    // Technologie.
    'corruptionChambreDecontamination',
    // Compteur générique du nombre de Corruptions actuellement sur la
    // fiche Maison — tenu à jour automatiquement par
    // CivilisationService.definirCorruption pour les pistes de
    // Civilisation (via majCivilisation, voir CHAMPS_CIVILISATION_
    // AUTORISES ci-dessous) ; whitelisté ICI en plus pour permettre la
    // saisie manuelle directe (Programmes/Chambres de décontamination,
    // non automatisées — champ éditable, strategieService.js).
    'corruptionMaison',
    // EVOLUTION 12 (todo.md, retour utilisateur) — tableau des clés
    // "Focus — Action" jouées avec succès CE cycle (voir focusEngine.js,
    // resoudreAction/CHAMPS_DIFF_SUIVIS — la mutation de ce champ passe
    // par le même mécanisme diff/undo que le reste du plateau, empilée
    // par AnnulationService comme n'importe quelle autre). Utilisé par
    // strategieService.js pour griser le bouton d'une action déjà jouée
    // et signaler le Focus concerné. Réinitialisé à [] à chaque
    // changement de cycle par GameService.avancerCycle ci-dessous.
    'actionsFocusUtilisees'
  ];

  // ------------------------------------------------------------
  // Utilitaires génériques
  // ------------------------------------------------------------

  function pickRandom_(tableau) {
    return tableau[Math.floor(Math.random() * tableau.length)];
  }

  function tirerMaisonsAdverses_(maisons, nomExclu, nombre) {
    var pool = maisons.filter(function (m) { return m.nom !== nomExclu; });
    var choisies = [];
    while (choisies.length < nombre && pool.length > 0) {
      var index = Math.floor(Math.random() * pool.length);
      choisies.push(pool.splice(index, 1)[0]);
    }
    return choisies;
  }

  function formatMaison_(maison) {
    return {
      nom: maison.nom,
      complexite: maison.complexite,
      technologies: maison.technologies.map(function (t) {
        return { nom: t.nom, type: t.type || '', texte: t.texte || '', texteAmeliore: t.texteAmeliore || '' };
      })
    };
  }

  function marquerTechnologiesSansPoint_(maisonsList, nombre) {
    var toutesLesTechs = [];
    maisonsList.forEach(function (m) {
      m.technologies.forEach(function (t) { toutesLesTechs.push(t); });
    });

    var indices = toutesLesTechs.map(function (_, i) { return i; });
    for (var i = indices.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    }
    var indicesSansPoint = {};
    indices.slice(0, nombre).forEach(function (idx) { indicesSansPoint[idx] = true; });

    toutesLesTechs.forEach(function (t, idx) { t.sansPoint = !!indicesSansPoint[idx]; });
  }

  function marquerTechnologiesSansPointManuel_(maisonsList, nomsSansPoint) {
    var toutesLesTechs = [];
    maisonsList.forEach(function (m) {
      m.technologies.forEach(function (t) { toutesLesTechs.push(t); });
    });

    toutesLesTechs.forEach(function (t) { t.sansPoint = false; });

    nomsSansPoint.forEach(function (nom) {
      var techno = toutesLesTechs.filter(function (t) { return t.nom === nom; })[0];
      if (!techno) {
        throw new Error('Technologie "' + nom + '" introuvable parmi les maisons déchues choisies.');
      }
      techno.sansPoint = true;
    });
  }

  // ------------------------------------------------------------
  // Accès catalogue (stores IndexedDB peuplés par catalogueSync.js).
  // ------------------------------------------------------------

  /**
   * Jointure maisons + technologies (clés catalogue camelCase, voir
   * catalogueSync.js) -> [{ nom, complexite, technologies: [{nom, type,
   * texte, texteAmeliore}] }]. "texte" alimente le tooltip des badges
   * technologie sur l'écran Partie ; "texteAmeliore" celui de la case
   * "Améliorée" (Plat. maison, voir index.html
   * renderTechnologiesObtenues_/renderEcranPlateauMaison_).
   */
  function obtenirMaisonsCatalogue_() {
    return Promise.all([DB.getAll('maisons'), DB.getAll('technologies')]).then(function (resultats) {
      var maisons = resultats[0];
      var technologies = resultats[1];
      var techParNom = {};
      technologies.forEach(function (t) { techParNom[t.nom] = t; });

      return maisons.map(function (m) {
        var nomsTech = [m.technologie1, m.technologie2].filter(Boolean);
        var technologiesMaison = nomsTech.map(function (nomTech) {
          var t = techParNom[nomTech];
          return { nom: nomTech, type: t ? (t.type || '') : '', texte: t ? (t.texte || '') : '', texteAmeliore: t ? (t.texteAmeliore || '') : '' };
        });
        return { nom: m.nom, complexite: m.complexite, technologies: technologiesMaison };
      });
    });
  }

  /**
   * originesMaison est indexé par idCarte (pas par maison+technologie) —
   * lecture complète puis filtre en JS (store léger, ~28 lignes).
   */
  function obtenirOrigineMaison_(nomMaison, nomTechnologie) {
    return DB.getAll('originesMaison').then(function (origines) {
      return origines.filter(function (o) {
        return o.maison === nomMaison && o.technologie === nomTechnologie;
      })[0] || null;
    });
  }

  /**
   * Programme de départ (emplacement 0 du plateau Programme, Plat.
   * maison) — 1 par maison+technologie de départ (data/catalogue/
   * programmesDepart.json). Exclut volontairement les entrées
   * `supplementaire:true` (2 cartes bonus de Marqualos, "A2"/"B2",
   * hors périmètre : aucune règle de sélection automatique établie).
   */
  function obtenirProgrammeDepart_(nomMaison, nomTechnologie) {
    return DB.getAll('programmesDepart').then(function (programmesDepart) {
      return programmesDepart.filter(function (p) {
        return p.maison === nomMaison && p.technologieDepart === nomTechnologie && !p.supplementaire;
      })[0] || null;
    });
  }

  /**
   * Retrouve le Type d'une technologie de départ à partir des 2
   * technologies déjà connues de la maison (évite un aller IndexedDB
   * supplémentaire — technologieDepart est toujours l'une des deux).
   */
  function technologieTypeDepuis_(technologies, nom) {
    if (!nom) return null;
    var t = (technologies || []).filter(function (x) { return x.nom === nom; })[0];
    return t ? t.type : null;
  }

  /**
   * Les 8 technologies des 4 maisons déchues (mise en place), toutes
   * maisons confondues — même liste source que choisirTechnologieObtenue
   * (slots "Technologies obtenues") et que toutesTechnologiesAdverses_
   * (index.html/strategieService.js), exposée ici en fonction réutilisable
   * pour les fonctions Technologies avancées ci-dessous (choix + calcul du
   * groupe actif par cycle).
   */
  function technologiesAdversesToutes_(partie) {
    var toutes = [];
    (partie.adversaires || []).forEach(function (m) {
      (m.technologies || []).forEach(function (t) {
        toutes.push({ nom: t.nom, maison: m.nom, type: t.type || '', sansPoint: !!t.sansPoint });
      });
    });
    return toutes;
  }

  /**
   * Règle du groupe actif : les 4 Technologies avancées choisies au
   * cycle 1 (partie.technologiesAvanceesChoisies) sont améliorables au
   * cycle 2 ; au cycle 3, ce sont les 4 AUTRES parmi les 8 (le complément,
   * calculé, jamais choisi manuellement) qui deviennent améliorables, à la
   * place des 4 premières (pas en plus). Aucune amélioration possible au
   * cycle 1 (rien
   * n'est encore "actif"), ni une fois les 4 emplacements du cycle 1
   * incomplets (retourne [] tant que les 4 ne sont pas tous remplis :
   * le complément ne serait pas fiable). Retourne un tableau de noms
   * (string[]), pas d'objets — suffisant pour un test d'appartenance
   * (indexOf) côté définirTechnologieAvanceeAmelioree.
   */
  function groupeActifTechnologiesAvancees_(partie) {
    var choisies = (partie.technologiesAvanceesChoisies || []).filter(Boolean);
    if (choisies.length < 4) return [];
    if (partie.cycleActuel === 2) {
      return choisies.map(function (t) { return t.nom; });
    }
    if (partie.cycleActuel === 3) {
      var nomsChoisis = choisies.map(function (t) { return t.nom; });
      return technologiesAdversesToutes_(partie)
        .filter(function (t) { return nomsChoisis.indexOf(t.nom) === -1; })
        .map(function (t) { return t.nom; });
    }
    return [];
  }

  /**
   * Formate un événement galactique. data/catalogue/evenements.json
   * structure chaque événement en `cadres[]` (effets de la moitié gauche
   * de la carte, résolus en Phase Préparation, à l'ouverture du Cycle —
   * voir docs/docs-rules-cycle-de-jeu.md §1.5) et `objectifs.blocs[]`
   * (moitié droite, évalués en Phase Évaluation, §3.3). `manches` (haut
   * droit de la carte, §2 Introduction) est conservé tel quel.
   * `instruction` (champ optionnel côté catalogue, popup de résolution
   * manuelle d'un cadre "gain" — voir index.html
   * appliquerCadreManuelEtRafraichir_) est absent par défaut (null),
   * jamais bloquant pour un cadre qui n'en définit pas.
   */
  function formatEvenement_(e) {
    return {
      code: e.code,
      nom: e.nom,
      cycle: e.cycle,
      manches: e.manches,
      cadres: (e.cadres || []).map(function (c) {
        return {
          ordre: c.ordre,
          obligatoire: !!c.obligatoire,
          resolution: c.resolution || null,
          texte: c.texte,
          instruction: c.instruction || null,
          effet: c.effet || null
        };
      }),
      objectifs: e.objectifs || null
    };
  }

  // Les 5 ressources de plateauMaison déjà suivies par l'app — seule
  // "monnaie" commune assez simple pour être créditée/débitée en un clic
  // depuis un cadre d'Événement galactique (voir actionsSimplesCadre_
  // ci-dessous). Tout le reste d'un cadre (secteurs, Gloire, jetons
  // Commerce/Prime/Libération, pistes de Civilisation, Corruption...)
  // reste hors périmètre (docs-rules-cycle-de-jeu.md §1.5, la plupart des
  // sous-points sont ❌/🚫) et s'affiche en texte brut, à résoudre
  // manuellement par le joueur.
  // RESSOURCES_SIMPLES_CADRE est identique à FocusEngine.RESSOURCES_
  // PRODUCTION, et CHAMP_RESSOURCE_PLATEAU_MAISON_ est un sous-ensemble
  // exact de FocusEngine.CHAMP_PAR_CLE (les 5 premières entrées) — PAS
  // fusionnées : gameService.js charge avant focusEngine.js (index.html)
  // et reste volontairement utilisable sans lui (seule exception déjà
  // existante : appliquerCadreChoixFocusEngine, qui vérifie `typeof
  // FocusEngine` avant utilisation). Si l'une de ces 5 ressources change
  // ici, vérifier l'autre copie côté focusEngine.js.
  var RESSOURCES_SIMPLES_CADRE = ['nourriture', 'energie', 'materiel', 'credit', 'science'];
  var CHAMP_RESSOURCE_PLATEAU_MAISON_ = {
    nourriture: 'ressourceNourriture', energie: 'ressourceEnergie', materiel: 'ressourceMateriel',
    credit: 'ressourceCredit', science: 'ressourceScience'
  };

  /**
   * Réduit un objet {ressource: valeur, ...} à un delta exploitable
   * seulement s'il ne porte QUE sur RESSOURCES_SIMPLES_CADRE — sinon null
   * (l'effet sort du périmètre "1 clic").
   */
  function deltaRessourcesSimple_(objet) {
    if (!objet) return null;
    var delta = {};
    var cles = Object.keys(objet);
    for (var i = 0; i < cles.length; i++) {
      var cle = cles[i];
      if (RESSOURCES_SIMPLES_CADRE.indexOf(cle) === -1) return null;
      var valeur = Number(objet[cle]);
      if (!valeur) return null;
      delta[cle] = valeur;
    }
    return Object.keys(delta).length ? delta : null;
  }

  function ajouterDelta_(base, ajout, signe) {
    var resultat = Object.assign({}, base);
    Object.keys(ajout || {}).forEach(function (cle) {
      resultat[cle] = (resultat[cle] || 0) + signe * ajout[cle];
    });
    return resultat;
  }

  /**
   * Extrait un delta ressources "1 clic" d'une option de cadre (élément
   * de effet.options, ou effet lui-même pour un échange direct) — deux
   * formes rencontrées dans evenements.json :
   *   - { cle: 'science', valeur: 3 } (gain direct)
   *   - { cout: {...}, gain: {...} } (échange)
   * Retourne null si l'option contient autre chose (secteur, Gloire,
   * Technologie, jeton...).
   */
  function deltaOptionCadre_(option) {
    if (!option) return null;
    if (option.cle && !option.cout && !option.gain) {
      if (RESSOURCES_SIMPLES_CADRE.indexOf(option.cle) === -1 || !option.valeur) return null;
      var direct = {};
      direct[option.cle] = Number(option.valeur);
      return direct;
    }
    if (option.cout || option.gain) {
      var coutSimple = deltaRessourcesSimple_(option.cout);
      var gainSimple = deltaRessourcesSimple_(option.gain);
      if ((option.cout && !coutSimple) || (option.gain && !gainSimple)) return null;
      var delta = ajouterDelta_(ajouterDelta_({}, coutSimple, -1), gainSimple, 1);
      return Object.keys(delta).length ? delta : null;
    }
    return null;
  }

  /**
   * Correspondance entre une option `effet.options[i]` d'un cadre "choix"
   * et la clé Effet reconnue par FocusEngine.resoudreCle_ : d'abord pour
   * les cubes de Puissance Navale (voir focusEngine.js,
   * CLES_DEPLOYER_CUBE et la clé générique "cube") — { cle: 'activer_cube',
   * valeur: N } et { cle: 'deployer_cube', valeur: N, cible: 'secteur_mere'
   * | absent } — puis pour construction/établissement — { cle:
   * 'etablir_guilde', valeur: N } / { cle: 'construire_installation',
   * valeur: N } (identité — FocusEngine.resoudreCle_ reconnaît ces clés
   * telles quelles, voir CLES_CONSTRUIRE côté focusEngine.js). Retourne
   * null si l'option ne correspond à aucune des formes reconnues (jamais
   * d'invention de clé FocusEngine à partir d'une donnée non prévue).
   */
  function cleFocusEnginePourOptionCadre_(option) {
    if (!option || !option.cle) return null;
    if (option.cle === 'activer_cube') return 'activer_cube';
    if (option.cle === 'deployer_cube') {
      if (option.cible === 'secteur_mere') return 'deployer_cube_secteur_mere';
      if (!option.cible) return 'deployer_cube';
    }
    if (option.cle === 'etablir_guilde' || option.cle === 'construire_installation') return option.cle;
    if (option.cle === 'etablir_guilde_banquier' || option.cle === 'augmenter_population_pure') return option.cle;
    // Même mécanisme générique — FocusEngine.resoudreCle_ reconnaît
    // nativement 'retirer_corruption', identité comme les autres clés
    // ci-dessus.
    if (option.cle === 'retirer_corruption') return option.cle;
    // EVOLUTION 10 — même mécanisme générique, FocusEngine.resoudreCle_
    // reconnaît nativement 'deplacer_corruption' (ex. Événement A Cycle 1
    // Cadre "exploit" : "retirez une Corruption et déplacez une
    // Corruption", evenements.json).
    if (option.cle === 'deplacer_corruption') return option.cle;
    // Même mécanisme générique — FocusEngine.resoudreCle_ reconnaît
    // nativement 'avancer_civilisation' (piste au choix) et
    // 'avancer_civilisation_societe'/'_gouvernement'/'_economie' (piste
    // imposée).
    if (option.cle === 'avancer_civilisation' || option.cle === 'avancer_civilisation_societe' ||
      option.cle === 'avancer_civilisation_gouvernement' || option.cle === 'avancer_civilisation_economie') {
      return option.cle;
    }
    // Même mécanisme générique — FocusEngine.resoudreCle_ reconnaît
    // nativement 'ameliorer_gloire', résolue sans popup (déterministe).
    if (option.cle === 'ameliorer_gloire') return option.cle;
    return null;
  }

  // ------------------------------------------------------------
  // Effet "Gagner une Corruption" d'un Cadre d'Événement galactique — type
  // "gain", data/catalogue/evenements.json (voir
  // docs-rules-corruption-gardiens-refuges-technoConsume.md §1) :
  // resoudreCiblesCadreGainCorruption_ traduit le vocabulaire de cible du
  // catalogue ("cible"/"cible_options"/"repli"/"restriction") vers les 4
  // cibles concrètes reconnues par la popup 'gagner_corruption'
  // (strategieService.js) — 'secteur'/'piste'/'programme'/'techno'. Volon-
  // tairement CONSERVATEUR : retourne `null` (cadre non automatisable, la
  // main appelante (index.html) reste alors sur l'existant appliquerCadreManuel,
  // AUCUNE régression) dès que :
  // - `effet.elements` contient autre chose que "corruption" seule (cadre
  //   composé, ex. "Augmentez la Population... Ensuite placez une
  //   Corruption sur CE secteur" — cible contextuelle non modélisable ici) ;
  // - `effet.effet_conditionnel` est présent ET ne correspond PAS
  //   exactement au gabarit reconnu par conditionAvancerPisteSiCorrompue_
  //   ci-dessous (Événement G Cycle 1 Cadre 1 — "si la Corruption est
  //   placée sur une piste... le joueur doit avancer sur cette piste [en
  //   ignorant le bénéfice de la case atteinte]" — SEUL effet_conditionnel
  //   automatisé à ce jour : appliqué en enchaînant simplement la
  //   Corruption (CivilisationService.definirCorruption) PUIS l'avancement
  //   GÉNÉRIQUE (CivilisationService.avancerPiste, strategieService.js/
  //   placerCorruptionSurPiste_) — "aucun bénéfice de case pour une piste
  //   Corrompue" est désormais une règle appliquée par avancerPiste
  //   elle-même pour TOUT appelant, plus un chemin dédié ; ne décoche PAS
  //   la piste (contrairement à avancerPisteCorrompue, qui reste un pont
  //   Focus -> Civilisation non câblé, hors périmètre ici) ; tout AUTRE
  //   effet_conditionnel reste hors périmètre, laissé manuel) ;
  // - une cible (primaire OU de repli) ne correspond à aucune entrée
  //   connue — notamment "offre_programme" (case précise du plateau des
  //   Programmes, jamais suivie en base — reste manuel, comme demandé) et
  //   "chaque_offre_programme_non_corrompue"/"meme_secteur_que_etape_
  //   precedente" (effets sur plusieurs cibles/contextuels, hors périmètre).
  // Vérifié sur tout evenements.json : ce filtre couvre exactement les
  // Cadres "gain" corruption dont la cible est un choix personnel du
  // joueur parmi secteur/piste/Programme/Technologie (avec repli éventuel),
  // et exclut tout le reste — aucune automatisation approximative.
  // ------------------------------------------------------------
  var CIBLE_KIND_MAP_GAIN_CORRUPTION_ = {
    piste_civilisation: ['piste'],
    secteur_au_choix: ['secteur'],
    emplacement_programme: ['programme'],
    fiche_maison: ['piste', 'programme'],
    carte_technologie_chambres_decontamination: ['techno']
  };

  function traduireCiblesGainCorruption_(cibles) {
    var resultat = [];
    for (var i = 0; i < cibles.length; i++) {
      var mappees = CIBLE_KIND_MAP_GAIN_CORRUPTION_[cibles[i]];
      if (!mappees) return null;
      resultat = resultat.concat(mappees);
    }
    return resultat;
  }

  // Reconnaît EXACTEMENT le gabarit imprimé sur la carte de l'Événement
  // galactique G, Cycle 1, Cadre 1 — "si_cible":"piste_civilisation",
  // "condition":"marqueur_pas_case_la_plus_a_droite",
  // "consequence":{"cle":"avancer_piste_civilisation","valeur":1,...} (voir
  // data/catalogue/evenements.json) — et rien d'autre, pour ne prendre
  // AUCUN risque sur un futur Cadre au vocabulaire similaire mais à la
  // sémantique différente (aucune autre carte du catalogue n'utilise
  // "effet_conditionnel" à ce jour, vérifié sur tout evenements.json).
  function conditionAvancerPisteSiCorrompue_(effetConditionnel) {
    return !!effetConditionnel &&
      effetConditionnel.si_cible === 'piste_civilisation' &&
      effetConditionnel.condition === 'marqueur_pas_case_la_plus_a_droite' &&
      !!effetConditionnel.consequence &&
      effetConditionnel.consequence.cle === 'avancer_piste_civilisation' &&
      Number(effetConditionnel.consequence.valeur) === 1;
  }

  function resoudreCiblesCadreGainCorruption_(effet) {
    if (!effet || effet.type !== 'gain') return null;
    var avancerPisteApresPlacement = conditionAvancerPisteSiCorrompue_(effet.effet_conditionnel);
    if (effet.effet_conditionnel && !avancerPisteApresPlacement) return null;
    var elements = effet.elements || {};
    var clesElements = Object.keys(elements);
    if (clesElements.length !== 1 || clesElements[0] !== 'corruption' || typeof elements.corruption !== 'number' || elements.corruption < 1) {
      return null;
    }

    var ciblesPrimaires = effet.cible ? [effet.cible] : (Array.isArray(effet.cible_options) ? effet.cible_options : null);
    if (!ciblesPrimaires || !ciblesPrimaires.length) return null;
    var tier1 = traduireCiblesGainCorruption_(ciblesPrimaires);
    if (!tier1) return null;

    var tier2 = [];
    if (effet.repli && Array.isArray(effet.repli.cibles_possibles)) {
      var tier2Traduit = traduireCiblesGainCorruption_(effet.repli.cibles_possibles);
      if (!tier2Traduit) return null;
      tier2 = tier2Traduit;
    }

    return {
      quantite: elements.corruption,
      ciblesAutorisees: tier1,
      ciblesRepli: tier2,
      exclureTechno: effet.restriction === 'stockage_chambres_decontamination_interdit',
      avancerPisteApresPlacement: avancerPisteApresPlacement
    };
  }

  /**
   * Construit le texte "✓ Appliqué (...)" pour
   * GameService.appliquerCadreChoixPlacement ci-dessous — `elements` est
   * le dict RÉSOLU (jamais la clé générique "guilde", toujours
   * "guilde_<type>" une fois le type choisi). Pas de réutilisation
   * d'abregerResumeCadre_ (index.html) : ses gabarits reconnus
   * ("Population du Secteur N augmentée de...", "Guilde X établie sur...")
   * ne correspondent pas à ce cas (plusieurs éléments combinés en un seul
   * placement) — texte déjà concis nativement, laissé tel quel
   * (abregerResumeCadre_ le laisse de toute façon passer inchangé si
   * aucun de ses gabarits ne correspond).
   */
  var LABEL_TYPE_GUILDE_RESUME_ = {
    fermiers: 'Fermiers', ingenieurs: 'Ingénieurs', mineurs: 'Mineurs', banquiers: 'Banquiers', scientifiques: 'Scientifiques'
  };
  function construireResumePlacementChoix_(elements, numero) {
    var parties = Object.keys(elements || {}).map(function (cle) {
      var valeur = Number(elements[cle]) || 0;
      if (cle.indexOf('guilde_') === 0) {
        var type = cle.slice('guilde_'.length);
        return 'Guilde ' + (LABEL_TYPE_GUILDE_RESUME_[type] || type);
      }
      if (cle === 'cube_neant') return valeur + ' cube' + (valeur > 1 ? 's' : '') + ' du Néant';
      if (cle === 'gloire') return 'jeton Gloire ' + valeur;
      if (cle === 'defense_secteur') return 'Défense de Secteur';
      if (cle === 'chantier_naval') return 'Chantier Naval';
      if (cle === 'base_stellaire') return 'Base Stellaire';
      if (cle === 'liberation') return valeur + ' jeton(s) Libération';
      if (cle === 'prime') return valeur + ' jeton(s) Prime';
      return cle;
    });
    return parties.join(' + ') + ' \u2192 Secteur ' + numero + '.';
  }

  /**
   * Retourne les actions "1 clic" applicables pour un cadre d'Événement
   * galactique ({index, delta}[]), ou [] si l'effet ne se prête pas à une
   * résolution automatique (nécessite un secteur, un choix de Gloire/
   * Technologie précis, une piste de Civilisation, etc.) — dans ce cas le
   * cadre reste affiché en texte seul, à résoudre manuellement. Les
   * résolutions "permanent"/"collectif"/"retardement" ne sont jamais
   * proposées en 1 clic : elles ne se résolvent pas une fois pour toutes
   * au début du Cycle (voir docs-rules-cycle-de-jeu.md §1.5.3).
   */
  function actionsSimplesCadre_(cadre) {
    if (!cadre || !cadre.effet) return [];
    if (cadre.resolution && ['permanent', 'collectif', 'retardement'].indexOf(cadre.resolution) !== -1) return [];
    var effet = cadre.effet;

    if (effet.type === 'choix' && Array.isArray(effet.options)) {
      var actions = [];
      effet.options.forEach(function (option, index) {
        var delta = deltaOptionCadre_(option);
        if (delta) actions.push({ index: index, delta: delta });
      });
      return actions;
    }

    if (effet.type === 'echange' && effet.mode === 'proportionnel' &&
        effet.cout && effet.gain && effet.gain.ratio === '1_pour_1_avec_cout' &&
        RESSOURCES_SIMPLES_CADRE.indexOf(effet.cout.cle) !== -1 &&
        RESSOURCES_SIMPLES_CADRE.indexOf(effet.gain.cle) !== -1) {
      return [{
        index: 0, proportionnel: true,
        ressourceCout: effet.cout.cle, ressourceGain: effet.gain.cle,
        plafond: Number(effet.cout.plafond) || null
      }];
    }

    if (effet.type === 'echange' && (effet.cout || effet.gain)) {
      var deltaEchange = deltaOptionCadre_(effet);
      return deltaEchange ? [{ index: 0, delta: deltaEchange }] : [];
    }

    return [];
  }

  // ------------------------------------------------------------
  // Assemblage / désassemblage entre la forme "client" (un seul objet
  // partie, civilisation/plateauMaison inclus) et les 2 records IndexedDB
  // (parties + plateauMaison).
  // ------------------------------------------------------------

  function assemblerPartie_(lignePartie, lignePlateauMaison) {
    if (!lignePartie) return null;
    var pm = lignePlateauMaison || {};
    var partie = Object.assign({}, lignePartie.etatJson || {});

    partie.id = lignePartie.id;
    partie.dateCreation = lignePartie.dateCreation;
    partie.archivee = !!lignePartie.archivee;
    partie.scenarioId = lignePartie.scenarioId || null;
    partie.cycleNum = lignePartie.cycleNum || 1;
    partie.cycleTermine = !!lignePartie.cycleTermine;
    partie.cycleActuel = partie.cycleTermine ? 'termine' : partie.cycleNum;

    partie.civilisation = {
      societe: pm.civSociete || 0,
      gouvernement: pm.civGouvernement || 0,
      economie: pm.civEconomie || 0,
      corrompues: {
        societe: !!pm.civCorrompueSociete,
        gouvernement: !!pm.civCorrompueGouvernement,
        economie: !!pm.civCorrompueEconomie
      }
    };
    partie.technologiesObtenues = pm.technologiesObtenues || [null, null, null, null, null];
    // technologiesAvanceesChoisies (les 4 choisies au cycle 1, parmi les
    // 8 des maisons déchues) et technologiesAvanceesAmeliorees (map
    // {nom: bool}, couvre les 8 — celles du cycle 2 ET celles du cycle
    // 3) suivent le même principe que technologiesObtenues ci-dessus :
    // colonnes dédiées de plateauMaison, jamais dans etatJson.
    partie.technologiesAvanceesChoisies = pm.technologiesAvanceesChoisies || [null, null, null, null];
    partie.technologiesAvanceesAmeliorees = pm.technologiesAvanceesAmeliorees || {};

    if (partie.joueur) {
      partie.joueur = Object.assign({}, partie.joueur, {
        technologieDepart: {
          nom: pm.technologieDepart || null,
          type: technologieTypeDepuis_(partie.joueur.technologies, pm.technologieDepart),
          amelioree: !!pm.technologieDepartAmelioree
        }
      });
    }

    partie.plateauMaison = {
      ressources: {
        nourriture: pm.ressourceNourriture || 0,
        energie: pm.ressourceEnergie || 0,
        materiel: pm.ressourceMateriel || 0,
        credit: pm.ressourceCredit || 0,
        science: pm.ressourceScience || 0,
        influence: pm.influence || 0
      },
      cubeActif: pm.cubeActif || 0,
      jetonPrime: pm.jetonPrime || 0,
      jetonLiberation: pm.jetonLiberation || 0,
      jetonCommerce: pm.jetonCommerce || [],
      gloire: pm.gloire || [],
      // Programmes gagnés mais pas encore joués (tableau non borné de
      // noms) — voir GameService.gagnerProgramme/utiliserProgramme.
      programmesEnMain: pm.programmesEnMain || [],
      // Plateau Programme (4 emplacements fixes de la fiche Maison) —
      // repli sur le défaut pour toute partie créée avant l'ajout de ce
      // champ (même principe que offresProgramme ci-dessous).
      programmesUtilises: Array.isArray(pm.programmesUtilises) ? pm.programmesUtilises : programmesUtilisesParDefaut_(),
      // Offre publique de Programme — voir CHAMPS_PLATEAU_MAISON_AUTORISES
      // ci-dessus. Repli sur le défaut (4 emplacements vides) pour toute
      // partie créée avant l'ajout de ce champ.
      offresProgramme: Array.isArray(pm.offresProgramme) ? pm.offresProgramme : offresProgrammeParDefaut_(),
      // Jeton manuel (Corruption(s) actuellement stockée(s) sur la
      // Technologie "Chambres de décontamination") — voir
      // CHAMPS_PLATEAU_MAISON_AUTORISES ci-dessus.
      corruptionChambreDecontamination: pm.corruptionChambreDecontamination || 0,
      // Compteur de Corruption sur la fiche Maison.
      corruptionMaison: pm.corruptionMaison || 0,
      // EVOLUTION 12 — voir CHAMPS_PLATEAU_MAISON_AUTORISES ci-dessus.
      // Repli sur tableau vide pour toute partie créée avant l'ajout de
      // ce champ (même principe que programmesEnMain/offresProgramme).
      actionsFocusUtilisees: Array.isArray(pm.actionsFocusUtilisees) ? pm.actionsFocusUtilisees : []
    };

    return partie;
  }

  /**
   * Relit parties+plateauMaison et réassemble une `partie` à jour —
   * dernière étape de quasiment toute mutation de ce fichier (une
   * écriture ne renvoie jamais l'objet persisté directement, toujours un
   * aller-retour DB frais : assemblerPartie_ recalcule des champs dérivés
   * et applique des valeurs par défaut que l'objet muté en mémoire n'a
   * pas nécessairement à jour). Factorisée ici plutôt que dupliquée à
   * chaque fonction.
   */
  function rechargerPartie_(partieId) {
    return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r) {
      return assemblerPartie_(r[0], r[1]);
    });
  }

  /**
   * Boilerplate commun aux fonctions `appliquerCadre*` (résolution d'un
   * Cadre d'Événement galactique) — lit parties+plateauMaison, assemble
   * la `partie`,
   * retrouve l'Événement galactique du cycle, applique le garde-fou
   * anti-double-application (un Cadre déjà résolu ne peut pas l'être une
   * seconde fois), et retrouve le `cadre` lui-même dans le catalogue de
   * l'Événement (`evenementCycle.cadres`) — présent même pour les
   * appelants qui n'en ont pas besoin (appliquerCadreEffet/
   * appliquerCadreManuel), le coût d'un `.filter` sur un tableau de
   * quelques éléments est négligeable face à la duplication qu'il évite.
   * Chaque appelant reste responsable de sa propre validation métier
   * (type de cadre attendu, option, etc.) et de la persistance finale
   * (`evenementCycle.cadresAppliques[ordreCadre] = ...` puis
   * `sauvegarderPartie`) — cette fonction ne fait que le chargement.
   */
  function chargerCadreOuvrable_(partieId, cycle, ordreCadre) {
    return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
      var lignePlateauMaison = resultats[1];
      var partie = assemblerPartie_(resultats[0], lignePlateauMaison);
      if (!partie) throw new Error('Partie introuvable.');

      var cleCycle = 'cycle' + cycle;
      var evenementCycle = (partie.evenements || {})[cleCycle];
      if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
      evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
      if (evenementCycle.cadresAppliques[ordreCadre]) {
        throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
      }

      var cadre = (evenementCycle.cadres || []).filter(function (c) { return c.ordre === ordreCadre; })[0];

      return {
        partie: partie,
        lignePlateauMaison: lignePlateauMaison,
        cleCycle: cleCycle,
        evenementCycle: evenementCycle,
        cadre: cadre
      };
    });
  }

  /**
   * Retire de l'objet partie tout ce qui a une colonne/clé dédiée
   * ailleurs, avant persistance dans parties.etatJson (voir en-tête).
   */
  function pourEtatJson_(partie) {
    var copie = Object.assign({}, partie);
    delete copie.id;
    delete copie.dateCreation;
    delete copie.archivee;
    delete copie.scenarioId;
    delete copie.cycleNum;
    delete copie.cycleTermine;
    delete copie.cycleActuel;
    delete copie.civilisation;
    delete copie.technologiesObtenues;
    delete copie.plateauMaison;
    if (copie.joueur) {
      copie.joueur = Object.assign({}, copie.joueur);
      delete copie.joueur.technologieDepart;
    }
    return copie;
  }

  // ------------------------------------------------------------
  // Journal d'actions — best-effort, ne doit jamais faire échouer
  // l'action principale.
  // ------------------------------------------------------------

  function ajouterHistorique_(partieId, action, details) {
    return DB.put('historique', {
      dateAction: new Date().toISOString(),
      partieId: partieId || null,
      action: action,
      details: details || ''
    }).catch(function (erreur) {
      console.warn('GameService : ajout historique a échoué (non bloquant) :', erreur);
    });
  }

  // ------------------------------------------------------------
  // Suppression — plateauMaison (+ secteursPartie) avant parties. Pas de
  // contrainte FK sous IndexedDB : l'ordre n'est pas obligatoire, conservé
  // par cohérence/lisibilité.
  // ------------------------------------------------------------

  function supprimerSecteursPartie_(partieId) {
    return DB.getAll('secteursPartie').then(function (secteurs) {
      var aSupprimer = secteurs.filter(function (s) { return s.partieId === partieId; });
      return Promise.all(aSupprimer.map(function (s) {
        return DB.supprimer('secteursPartie', [s.partieId, s.numero]);
      }));
    });
  }

  function supprimerPartieInterne_(partieId) {
    return Promise.all([
      DB.supprimer('plateauMaison', partieId),
      supprimerSecteursPartie_(partieId)
    ]).then(function () {
      return DB.supprimer('parties', partieId);
    });
  }

  return {

    /**
     * Exposée publiquement pour setupService.js. Pas de distinction
     * "légère vs détaillée" : la donnée est déjà locale (IndexedDB), pas
     * d'enjeu de poids de payload réseau à optimiser ici.
     */
    obtenirMaisonsCatalogue: obtenirMaisonsCatalogue_,

    /**
     * Exposée publiquement pour index.html, qui lit directement cette
     * fonction pour savoir si un bouton d'option de Cadre doit être
     * cliquable, plutôt que de dupliquer la logique localement (une
     * source de vérité unique évite un désync entre les deux copies).
     */
    cleFocusEnginePourOptionCadre: cleFocusEnginePourOptionCadre_,

    // Table de règles fixes "Actions de Programme" (voir sa déclaration
    // plus haut) — exposée pour index.html ("Programmes en main", écran
    // Focus).
    INFO_PROGRAMME_PAR_TYPE: INFO_PROGRAMME_PAR_TYPE,

    // Chantier Technologies (voir déclarations plus haut) — exposés pour
    // la popup 'gagner_technologie' (strategieService.js) : rappel du
    // nombre d'Influence à la sélection dans la liste déroulante, une
    // seule source de vérité avec ce qui est réellement résolu par
    // GameService.gagnerTechnologieEtResoudreEffet/definirTechnologieAmelioree.
    INFLUENCE_TECHNOLOGIE_BASE: INFLUENCE_TECHNOLOGIE_BASE_,
    INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE: INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_,

    /**
     * Crée une nouvelle partie : tire une maison (ou utilise celle choisie
     * en mode manuel) et ses adversaires, calcule les ressources/
     * civilisation de départ depuis originesMaison, met en place les
     * Focus de la maison (FocusService) et instancie le plateau des
     * secteurs (SecteurService) si ces modules sont chargés.
     * @param {Object} options
     *   options.mode : 'manuel' | 'aleatoire'
     *   options.maison : nom de la maison (mode manuel)
     *   options.complexite : difficulté choisie (mode aléatoire, optionnel)
     *   options.miseEnPlaceManuelle : true pour reproduire une partie
     *     physique déjà en cours (mode doit être 'manuel') :
     *   options.technologieDepart, options.maisonsDechues (4 noms),
     *   options.technologiesSansPoint (3 noms parmi les 8 des maisons déchues)
     *   options.scenarioId : optionnel (mise en place des secteurs
     *     déléguée à SecteurService.instancierSecteurs, pas de valeur par
     *     défaut imposée ici)
     */
    creerPartie: function (options) {
      options = options || {};

      return obtenirMaisonsCatalogue_().then(function (maisons) {
        if (!maisons.length) {
          throw new Error('Aucune maison trouvée dans le catalogue local (store "maisons" vide — lancer une synchronisation).');
        }

        var maisonJoueurBrute;
        if (options.mode === 'manuel') {
          maisonJoueurBrute = maisons.filter(function (m) { return m.nom === options.maison; })[0];
          if (!maisonJoueurBrute) throw new Error('Maison "' + options.maison + '" introuvable.');
        } else {
          var pool = maisons;
          if (options.complexite) {
            pool = maisons.filter(function (m) { return String(m.complexite) === String(options.complexite); });
            if (!pool.length) throw new Error('Aucune maison ne correspond à la difficulté choisie.');
          }
          maisonJoueurBrute = pickRandom_(pool);
        }

        var maisonJoueur = formatMaison_(maisonJoueurBrute);
        var adversaires;

        if (options.miseEnPlaceManuelle) {
          if (!options.technologieDepart) throw new Error('Choisis la technologie de départ.');
          var techDepart = maisonJoueur.technologies.filter(function (t) { return t.nom === options.technologieDepart; })[0];
          if (!techDepart) throw new Error('Technologie de départ "' + options.technologieDepart + '" introuvable pour ' + maisonJoueur.nom + '.');
          maisonJoueur.technologieDepart = techDepart;

          var nomsDechues = options.maisonsDechues || [];
          if (nomsDechues.length !== 4) throw new Error('Choisis exactement 4 maisons déchues.');
          if (nomsDechues.indexOf(maisonJoueur.nom) !== -1) throw new Error('Une maison déchue ne peut pas être votre propre maison.');
          if (new Set(nomsDechues).size !== 4) throw new Error('Les 4 maisons déchues doivent être différentes.');

          adversaires = nomsDechues.map(function (nom) {
            var m = maisons.filter(function (x) { return x.nom === nom; })[0];
            if (!m) throw new Error('Maison déchue "' + nom + '" introuvable.');
            return formatMaison_(m);
          });

          var nomsSansPoint = options.technologiesSansPoint || [];
          if (nomsSansPoint.length !== 3) throw new Error('Choisis exactement 3 technologies sans gain d\'Influence.');
          if (new Set(nomsSansPoint).size !== 3) throw new Error('Les 3 technologies sans gain d\'Influence doivent être différentes.');
          marquerTechnologiesSansPointManuel_(adversaires, nomsSansPoint);

        } else {
          maisonJoueur.technologieDepart = pickRandom_(maisonJoueur.technologies);
          adversaires = tirerMaisonsAdverses_(maisons, maisonJoueurBrute.nom, 4).map(formatMaison_);
          marquerTechnologiesSansPoint_(adversaires, 3);
        }

        return Promise.all([
          obtenirOrigineMaison_(maisonJoueur.nom, maisonJoueur.technologieDepart.nom)
            .catch(function (erreur) {
              console.warn('GameService.creerPartie : lecture originesMaison a échoué (civilisation/ressources de départ à 0) :', erreur);
              return null;
            }),
          // Mise en place des Focus de la maison — tolérant (garde
          // typeof, comme SecteurService), une erreur ici ne doit jamais
          // empêcher la création de la partie.
          (typeof FocusService !== 'undefined' && FocusService.obtenirMiseEnPlace)
            ? FocusService.obtenirMiseEnPlace(maisonJoueur.nom).catch(function (erreur) {
                console.warn('GameService.creerPartie : mise en place Focus échouée (partie créée quand même, sans Focus) :', erreur);
                return [];
              })
            : Promise.resolve([]),
          // Programme de départ (emplacement 0 du plateau Programme) —
          // tolérant, une lecture catalogue échouée ne doit jamais
          // empêcher la création de la partie (repli : slot 0 vide).
          obtenirProgrammeDepart_(maisonJoueur.nom, maisonJoueur.technologieDepart.nom)
            .catch(function (erreur) {
              console.warn('GameService.creerPartie : lecture programmesDepart a échoué (emplacement 0 laissé vide) :', erreur);
              return null;
            })
        ])
          .then(function (resultats) {
            var origineDepart = resultats[0];
            var focusJoueur = resultats[1];
            var programmeDepart = resultats[2];
            var civilisationDepart = { societe: 0, gouvernement: 0, economie: 0 };
            var ressourcesDepart = { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 };
            var cubeActifDepart = 0;

            if (origineDepart) {
              civilisationDepart = {
                societe: Number(origineDepart.civilisationSocieteDepart) || 0,
                gouvernement: Number(origineDepart.civilisationGouvernementDepart) || 0,
                economie: Number(origineDepart.civilisationEconomieDepart) || 0
              };
              ressourcesDepart = {
                nourriture: Number(origineDepart.ressourceNourriture) || 0,
                energie: Number(origineDepart.ressourceEnergie) || 0,
                materiel: Number(origineDepart.ressourceMateriel) || 0,
                credit: Number(origineDepart.ressourceCredit) || 0,
                science: Number(origineDepart.ressourceScience) || 0
              };
              cubeActifDepart = Number(origineDepart.cubeActifDepart) || 0;
            } else {
              console.warn('GameService.creerPartie : origine introuvable pour ' + maisonJoueur.nom + ' / ' + maisonJoueur.technologieDepart.nom + ' (civilisation/ressources de départ à 0).');
            }

            var id = genererIdPartie_();
            var dateCreation = new Date().toISOString();

            var partie = {
              id: id,
              dateCreation: dateCreation,
              archivee: false,
              scenarioId: options.scenarioId || (typeof SecteurService !== 'undefined' ? SecteurService.SCENARIO_PAR_DEFAUT : null),
              cycleNum: 1,
              cycleTermine: false,
              cycleActuel: 1,
              joueur: maisonJoueur,
              adversaires: adversaires,
              evenements: { cycle1: null, cycle2: null, cycle3: null },
              technologiesAcquises: [maisonJoueur.technologieDepart],
              technologiesObtenues: [null, null, null, null, null],
              civilisation: {
                societe: civilisationDepart.societe,
                gouvernement: civilisationDepart.gouvernement,
                economie: civilisationDepart.economie,
                corrompues: { societe: false, gouvernement: false, economie: false }
              },
              // focusHeroiques : emplacements vides par cycle, remplis en
              // cours de partie (voir choisirFocusHeroique/avancerCycle
              // plus bas). focusJoueur : mise en place réelle via
              // FocusService.obtenirMiseEnPlace ci-dessus, jouable via
              // js/focusEngine.js.
              focusHeroiques: { cycle1: [null, null, null], cycle2: [null, null, null], cycle3: [null, null, null] },
              focusHeroiquesPioches: [],
              focusJoueur: focusJoueur
            };

            var plateauMaison = {
              partieId: id,
              technologieDepart: maisonJoueur.technologieDepart.nom,
              technologieDepartAmelioree: false,
              ressourceNourriture: ressourcesDepart.nourriture,
              ressourceEnergie: ressourcesDepart.energie,
              ressourceMateriel: ressourcesDepart.materiel,
              ressourceCredit: ressourcesDepart.credit,
              ressourceScience: ressourcesDepart.science,
              influence: INFLUENCE_DEPART,
              cubeActif: cubeActifDepart,
              jetonPrime: 0,
              jetonLiberation: 0,
              jetonCommerce: [],
              gloire: GLOIRE_DEPART.slice(),
              civSociete: civilisationDepart.societe,
              civGouvernement: civilisationDepart.gouvernement,
              civEconomie: civilisationDepart.economie,
              civCorrompueSociete: false,
              civCorrompueGouvernement: false,
              civCorrompueEconomie: false,
              programmesEnMain: [],
              programmesUtilises: programmesUtilisesParDefaut_(programmeDepart
                ? { code: programmeDepart.code, entretienActif: true, corrompu: false, depart: true }
                : null),
              // Reflète la Corruption initiale du dernier emplacement
              // Programme (programmesUtilisesParDefaut_, index 3,
              // corrompu dès la mise en place) — corruptionMaison
              // additionne déjà la Corruption des pistes de Civilisation
              // (CivilisationService.definirCorruption) et, désormais,
              // celle des emplacements Programme (voir
              // GameService.utiliserProgramme/index.html
              // renderProgrammesPlateauMaison_).
              corruptionMaison: 1,
              offresProgramme: offresProgrammeParDefaut_(),
              technologiesObtenues: [null, null, null, null, null],
              technologiesAvanceesChoisies: [null, null, null, null],
              technologiesAvanceesAmeliorees: {}
            };

            var enregistrementPartie = {
              id: id,
              dateCreation: dateCreation,
              archivee: false,
              scenarioId: partie.scenarioId,
              cycleNum: 1,
              cycleTermine: false,
              statut: 'en_cours',
              etatJson: pourEtatJson_(partie)
            };

            return Promise.all([
              DB.put('parties', enregistrementPartie),
              DB.put('plateauMaison', plateauMaison)
            ]).then(function () {
              // Instanciation du plateau des secteurs après l'écriture de
              // "parties" (secteursPartie.partieId n'a pas de contrainte
              // FK sous IndexedDB, mais on garde cet ordre par cohérence).
              // Tolérant en soi (voir SecteurService.instancierSecteurs) :
              // une erreur ici ne remonte jamais jusqu'à la création de la
              // partie.
              if (typeof SecteurService !== 'undefined' && SecteurService.instancierSecteurs) {
                return SecteurService.instancierSecteurs(partie);
              }
            }).then(function () {
              return ajouterHistorique_(id, 'creation_partie', maisonJoueur.nom);
            }).then(function () {
              return assemblerPartie_(enregistrementPartie, plateauMaison);
            });
          });
      });
    },

    /**
     * Récupère une partie existante par id (ou null si absente).
     */
    obtenirPartie: function (id) {
      return Promise.all([DB.get('parties', id), DB.get('plateauMaison', id)]).then(function (resultats) {
        if (!resultats[0]) return null;
        return assemblerPartie_(resultats[0], resultats[1]);
      });
    },

    /**
     * Retourne toutes les parties enregistrées (état complet), triées par
     * date de création décroissante — utilisé pour l'écran Historique.
     */
    listerParties: function () {
      return Promise.all([DB.getAll('parties'), DB.getAll('plateauMaison')]).then(function (resultats) {
        var lignesParties = resultats[0];
        var plateaux = resultats[1];
        var plateauParId = {};
        plateaux.forEach(function (p) { plateauParId[p.partieId] = p; });

        return lignesParties
          .map(function (ligne) { return assemblerPartie_(ligne, plateauParId[ligne.id]); })
          .sort(function (a, b) { return (b.dateCreation || '').localeCompare(a.dateCreation || ''); });
      });
    },

    /**
     * Sauvegarde une partie déjà créée (le client garde l'état complet en
     * mémoire) + ajoute une ligne au journal d'actions.
     */
    sauvegarderPartie: function (partie, action, details) {
      if (!partie || !partie.id) {
        return Promise.reject(new Error('Partie invalide (id manquant).'));
      }
      var enregistrementPartie = {
        id: partie.id,
        dateCreation: partie.dateCreation,
        archivee: !!partie.archivee,
        scenarioId: partie.scenarioId || null,
        cycleNum: partie.cycleNum || 1,
        cycleTermine: !!partie.cycleTermine,
        statut: partie.cycleTermine ? 'terminee' : 'en_cours',
        etatJson: pourEtatJson_(partie)
      };
      return DB.put('parties', enregistrementPartie).then(function () {
        return ajouterHistorique_(partie.id, action, details || '');
      }).then(function () {
        return partie;
      });
    },

    /**
     * Bascule/fixe le flag "archivee" d'une partie. Lecture-fusion-écriture
     * pour ne toucher QUE ce champ (règle projet : ne jamais rerender/
     * écraser les autres champs si un seul est modifié localement).
     */
    archiverPartie: function (id, archivee) {
      return DB.get('parties', id).then(function (ligne) {
        if (!ligne) throw new Error('Partie introuvable pour archivage (id : ' + id + ').');
        ligne.archivee = !!archivee;
        return DB.put('parties', ligne);
      }).then(function () { return true; });
    },

    /**
     * Supprime définitivement une partie (quel que soit son statut).
     * L'historique n'est jamais supprimé (pas de contrainte FK sous
     * IndexedDB sur historique.partieId).
     */
    supprimerPartie: function (id) {
      return DB.get('parties', id).then(function (ligne) {
        if (!ligne) throw new Error('Partie introuvable pour suppression (id : ' + id + ').');
        return supprimerPartieInterne_(id);
      }).then(function () {
        return ajouterHistorique_(id, 'suppression_partie', '');
      }).then(function () { return true; });
    },

    /**
     * Supprime définitivement toutes les parties NON archivées
     * (irréversible, confirmation côté client). Retourne le nombre de
     * parties supprimées.
     */
    supprimerToutesPartiesNonArchivees: function () {
      return DB.getAll('parties').then(function (lignes) {
        var aCibler = lignes.filter(function (l) { return !l.archivee; });
        return Promise.all(aCibler.map(function (l) { return supprimerPartieInterne_(l.id); }))
          .then(function () {
            return ajouterHistorique_(null, 'suppression_masse', aCibler.length + ' partie(s) non archivée(s) supprimée(s).');
          })
          .then(function () { return aCibler.length; });
      });
    },

    /**
     * Mise à jour partielle du plateau maison (ressources, influence, cube
     * actif, jetons, Gloire, Programmes, technologiesObtenues). Liste
     * blanche volontaire — un appelant ne doit pouvoir écrire QUE ces
     * champs (pas civSociete ni technologieDepart, qui ont leurs propres
     * fonctions dédiées — voir majCivilisation ci-dessous et
     * definirTechnologieAmelioree plus bas). Lecture-fusion-écriture :
     * ne touche jamais aux champs non fournis dans `champs`.
     */
    majPlateauMaison: function (partieId, champs) {
      var filtre = {};
      Object.keys(champs || {}).forEach(function (cle) {
        if (CHAMPS_PLATEAU_MAISON_AUTORISES.indexOf(cle) !== -1) filtre[cle] = champs[cle];
      });
      if (!Object.keys(filtre).length) {
        return Promise.reject(new Error('Aucun champ valide à mettre à jour.'));
      }

      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour mise à jour (partie ' + partieId + ').');
        Object.keys(filtre).forEach(function (cle) { ligne[cle] = filtre[cle]; });
        return DB.put('plateauMaison', ligne);
      });
    },

    /**
     * Mise à jour partielle des 6 champs Civilisation (niveaux des 3
     * pistes + leurs 3 marqueurs "Corrompue"), volontairement exclus de
     * majPlateauMaison (voir commentaire ci-dessus). Même principe
     * lecture-fusion-écriture, liste blanche séparée par cohérence avec le
     * découpage fonctionnel (civilisationService.js est seul appelant
     * prévu de celle-ci, comme focusEngine.js/écran Stratégie le sont de
     * majPlateauMaison).
     */
    majCivilisation: function (partieId, champs) {
      var CHAMPS_CIVILISATION_AUTORISES = [
        'civSociete', 'civGouvernement', 'civEconomie',
        'civCorrompueSociete', 'civCorrompueGouvernement', 'civCorrompueEconomie',
        // CivilisationService.definirCorruption ajuste corruptionMaison
        // dans le MÊME appel que le marqueur Corrompue qui vient de
        // changer (une seule écriture) — whitelisté ici en plus de
        // CHAMPS_PLATEAU_MAISON_AUTORISES (saisie manuelle).
        'corruptionMaison'
      ];
      var filtre = {};
      Object.keys(champs || {}).forEach(function (cle) {
        if (CHAMPS_CIVILISATION_AUTORISES.indexOf(cle) !== -1) filtre[cle] = champs[cle];
      });
      if (!Object.keys(filtre).length) {
        return Promise.reject(new Error('Aucun champ Civilisation valide à mettre à jour.'));
      }

      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour mise à jour (partie ' + partieId + ').');
        Object.keys(filtre).forEach(function (cle) { ligne[cle] = filtre[cle]; });
        return DB.put('plateauMaison', ligne);
      });
    },

    /**
     * Liste des événements galactiques du catalogue, groupés par cycle
     * (1/2/3). Utilisé pour peupler les menus déroulants de choix
     * d'événement (voir index.html, écran Partie).
     */
    getEvenementsParCycle: function () {
      return DB.getAll('evenements').then(function (lignes) {
        var evenements = lignes.map(formatEvenement_);
        return {
          cycle1: evenements.filter(function (e) { return String(e.cycle) === '1'; }),
          cycle2: evenements.filter(function (e) { return String(e.cycle) === '2'; }),
          cycle3: evenements.filter(function (e) { return String(e.cycle) === '3'; })
        };
      });
    },

    /**
     * Enregistre le choix d'un événement galactique pour un cycle donné
     * (1, 2 ou 3). partie.evenements vit dans etatJson (pas de colonne
     * dédiée) — sauvegarde via sauvegarderPartie (lecture-fusion-écriture
     * implicite : on relit la partie complète juste avant de la
     * réécrire).
     */
    choisirEvenement: function (partieId, cycle, nomEvenement) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId), DB.getAll('evenements')])
        .then(function (resultats) {
          var partie = assemblerPartie_(resultats[0], resultats[1]);
          if (!partie) throw new Error('Partie introuvable.');
          var evenement = resultats[2].map(formatEvenement_).filter(function (e) {
            return e.nom === nomEvenement && String(e.cycle) === String(cycle);
          })[0];
          if (!evenement) throw new Error('Événement introuvable pour ce cycle.');
          partie.evenements = partie.evenements || { cycle1: null, cycle2: null, cycle3: null };
          partie.evenements['cycle' + cycle] = evenement;
          return GameService.sauvegarderPartie(partie, 'choix_evenement_cycle' + cycle, nomEvenement);
        });
    },

    /**
     * Fonction PURE (aucun accès DB), exposée pour l'IHM — voir
     * actionsSimplesCadre_ ci-dessus pour le détail de ce qui est
     * considéré "1 clic" (uniquement des deltas sur les 5 ressources
     * suivies par plateauMaison) et ce qui reste hors périmètre.
     */
    actionsSimplesCadre: actionsSimplesCadre_,

    /**
     * Applique en un clic l'une des actions renvoyées par
     * actionsSimplesCadre_ pour le cadre `ordreCadre` de l'Événement
     * galactique choisi au Cycle `cycle` — crédite/débite les 5
     * ressources concernées sur plateauMaison et marque le cadre comme
     * résolu (evenements.cycleN.cadresAppliques[ordreCadre]) pour éviter
     * une double application. Même pattern lecture-fusion-écriture que
     * definirTechnologieAvanceeAmelioree : écriture directe sur la ligne
     * plateauMaison (pas de passage par majPlateauMaison, qui ne connaît
     * pas ce contexte "cadre d'Événement"), puis sauvegarderPartie pour
     * persister evenements (etatJson). `delta` doit être l'un des objets
     * `delta` renvoyés par actionsSimplesCadre_ (ou dérivé d'un `.gain`
     * proportionnel) — revalidé ici (RESSOURCES_SIMPLES_CADRE) avant
     * toute écriture, jamais fait confiance à l'appelant.
     */
    appliquerCadreEffet: function (partieId, cycle, ordreCadre, delta) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, lignePlateauMaison = ctx.lignePlateauMaison, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle;

        var champsPlateauMaison = {};
        Object.keys(delta || {}).forEach(function (ressource) {
          if (RESSOURCES_SIMPLES_CADRE.indexOf(ressource) === -1) return;
          var stockActuel = partie.plateauMaison.ressources[ressource] || 0;
          var nouveauStock = stockActuel + Number(delta[ressource]);
          if (nouveauStock < 0) throw new Error('Ressource insuffisante pour appliquer ce cadre (' + ressource + ').');
          champsPlateauMaison[CHAMP_RESSOURCE_PLATEAU_MAISON_[ressource]] = nouveauStock;
        });
        if (!Object.keys(champsPlateauMaison).length) {
          throw new Error('Aucune ressource valide à appliquer pour ce cadre.');
        }

        evenementCycle.cadresAppliques[ordreCadre] = { delta: delta, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        Object.keys(champsPlateauMaison).forEach(function (champ) {
          lignePlateauMaison[champ] = champsPlateauMaison[champ];
        });

        return Promise.all([
          DB.put('plateauMaison', lignePlateauMaison),
          GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
        ]);
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "gain" (voir data/catalogue/evenements.
     * json) — hors périmètre d'actionsSimplesCadre_ (ne porte sur aucune
     * des 5 ressources plateauMaison ; typiquement une ressource que
     * l'app ne suit pas, comme l'offre de Programme Domination) : ne fait
     * qu'enregistrer que le joueur a résolu l'effet à la main sur le
     * plateau physique, même garde-fou anti-double-application que
     * appliquerCadreEffet/appliquerCadrePlacement ci-dessus, mais sans
     * toucher plateauMaison (aucun delta à appliquer).
     */
    appliquerCadreManuel: function (partieId, cycle, ordreCadre) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle;

        evenementCycle.cadresAppliques[ordreCadre] = { manuel: true, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "placement" (zone
     * "secteur_neant_adjacent", voir data/catalogue/evenements.json) —
     * hors périmètre d'actionsSimplesCadre_ (ne porte pas sur les 5
     * ressources simples de plateauMaison mais sur secteursPartie). Place
     * la structure sur le secteur choisi par le joueur via
     * SecteurService.placerElementsNeantAdjacent (qui revalide Néant/
     * adjacence/emplacements libres — jamais confiance à l'appelant),
     * puis marque le cadre comme résolu, même garde-fou anti-double-
     * application qu'appliquerCadreEffet ci-dessus.
     *
     * Retrouve le cadre `ordreCadre` dans evenementCycle.cadres (catalogue
     * complet de l'événement choisi, déjà persisté par choisirEvenement)
     * pour lire son `effet.elements` et le transmettre tel quel à
     * SecteurService.placerElementsNeantAdjacent (générique) : ce point
     * d'entrée résout ainsi n'importe quel cadre "placement" du
     * catalogue, quels que soient ses éléments.
     */
    appliquerCadrePlacement: function (partieId, cycle, ordreCadre, numeroSecteur) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        if (!cadre || !cadre.effet || cadre.effet.type !== 'placement') {
          throw new Error('Cadre de placement introuvable pour cet ordre.');
        }

        return SecteurService.placerElementsNeantAdjacent(partieId, numeroSecteur, cadre.effet.elements).then(function () {
          evenementCycle.cadresAppliques[ordreCadre] = { secteur: numeroSecteur, le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;
          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
        });
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "placement_multiple" — jeux d'éléments
     * répartis sur des secteurs du Néant adjacents désignés par un
     * critère de Population (pas un libre choix comme "placement"
     * simple, voir SecteurService.resoudrePlacementMultipleNeantAdjacent).
     * `ciblesParGroupe` (un numéro de secteur par groupe, même ordre que
     * SecteurService.resoudrePlacementMultipleNeantAdjacent(...).groupes)
     * vient de l'appelant (StrategieService/index.html, secteur unique par
     * groupe ou choisi par le joueur en cas d'égalité de Population) mais
     * est intégralement revalidé côté SecteurService.
     * appliquerPlacementMultipleNeantAdjacent (jamais confiance à
     * l'appelant), même garde-fou anti-double-application que
     * appliquerCadrePlacement ci-dessus.
     */
    appliquerCadrePlacementMultiple: function (partieId, cycle, ordreCadre, ciblesParGroupe) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        if (!cadre || !cadre.effet || cadre.effet.type !== 'placement_multiple') {
          throw new Error('Cadre de placement multiple introuvable pour cet ordre.');
        }

        return SecteurService.appliquerPlacementMultipleNeantAdjacent(partieId, cadre.effet, ciblesParGroupe).then(function (resultat) {
          var secteursUniques = [];
          (resultat.secteurs || []).forEach(function (numero) {
            if (secteursUniques.indexOf(numero) === -1) secteursUniques.push(numero);
          });
          evenementCycle.cadresAppliques[ordreCadre] = { secteurs: secteursUniques, le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;
          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
        });
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique UNE option d'un cadre `type: 'choix'` dont chaque option
     * est elle-même `type: 'placement'` (avec un `critere` de Population
     * — data/catalogue/evenements.json, PAS un flat {cle, valeur} comme
     * les options automatisées par FocusEngine, voir
     * cleFocusEnginePourOptionCadre_ ci-dessus) — hors périmètre de
     * "placement"/"placement_multiple" (ceux-ci n'offrent jamais de CHOIX
     * entre plusieurs placements alternatifs, toujours un seul ou
     * plusieurs SIMULTANÉS).
     *
     * `typeGuildeChoisi` (optionnel, une des clés de TYPES_GUILDE_CONSTRUIRE_
     * côté strategieService.js — 'fermiers'/'ingenieurs'/'mineurs'/
     * 'banquiers'/'scientifiques') résout la clé GÉNÉRIQUE "guilde" de
     * l'option (type au choix du joueur, voir CHAMP_ELEMENT_PLACEMENT_,
     * secteurService.js) en "guilde_<type>" avant tout appel à
     * SecteurService.placerElementsNeantAdjacent — qui ne reçoit donc
     * jamais la clé générique. Revalide intégralement le `numeroSecteur`
     * reçu (jamais confiance à l'appelant, même principe qu'
     * appliquerCadrePlacement/appliquerCadrePlacementMultiple ci-dessus) :
     * recalcule les candidats pour CE critère via SecteurService.
     * resoudrePlacementMultipleNeantAdjacent (réutilisée telle quelle, en
     * enveloppant l'unique option dans un `placements` à 1 entrée — aucune
     * duplication de la logique de calcul des candidats par critère de
     * Population).
     */
    appliquerCadreChoixPlacement: function (partieId, cycle, ordreCadre, indexOption, numeroSecteur, typeGuildeChoisi) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        if (!option || option.type !== 'placement' || !option.elements) {
          throw new Error('Option de placement introuvable pour ce cadre.');
        }
        if (typeof SecteurService === 'undefined') throw new Error('SecteurService indisponible.');

        var elementsResolus = Object.assign({}, option.elements);
        if (Object.prototype.hasOwnProperty.call(elementsResolus, 'guilde')) {
          if (!typeGuildeChoisi) throw new Error('Type de Guilde manquant pour ce placement.');
          elementsResolus['guilde_' + typeGuildeChoisi] = elementsResolus.guilde;
          delete elementsResolus.guilde;
        }

        return SecteurService.resoudrePlacementMultipleNeantAdjacent(partieId, { type: 'placement_multiple', placements: [option] })
          .then(function (resultatCandidats) {
            var groupe = (resultatCandidats.groupes || [])[0];
            if (!groupe || groupe.candidats.indexOf(numeroSecteur) === -1) {
              throw new Error('Secteur ' + numeroSecteur + ' non éligible pour ce placement (Population).');
            }

            return SecteurService.placerElementsNeantAdjacent(partieId, numeroSecteur, elementsResolus).then(function () {
              evenementCycle.cadresAppliques[ordreCadre] = {
                resume: construireResumePlacementChoix_(elementsResolus, numeroSecteur),
                le: new Date().toISOString()
              };
              partie.evenements[cleCycle] = evenementCycle;
              return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
            });
          });
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "choix" (data/catalogue/evenements.json)
     * dont l'option retenue ne correspond à AUCUNE mécanique automatisée
     * par l'app (ni cube/construction — cleFocusEnginePourOptionCadre_ —,
     * ni Science->Technologie — optionTechnologieViaScience_) : fallback
     * générique — ne fait qu'enregistrer que le joueur a résolu l'option
     * choisie à la main sur le plateau physique, même garde-fou anti-
     * double-application que les autres appliquerCadre*, sans toucher ni
     * plateauMaison ni secteursPartie. `resume` (texte au passé, ex.
     * "Guilde établie manuellement") est fourni par l'appelant (IHM) —
     * GameService reste une couche de données pure, comme pour
     * appliquerCadreChoixFocusEngine (resume dérivé côté FocusEngine, ici
     * côté index.html faute de mécanique à déléguer).
     *
     * Reste le filet de sécurité générique pour toute future option de
     * cadre "choix" sans mécanique automatisée derrière — n'est pas figée
     * sur un cadre précis (etablir_guilde/construire_installation, par
     * exemple, sont désormais automatisés via appliquerCadreChoixFocusEngine
     * plutôt que de passer par ici).
     */
    appliquerCadreChoixManuel: function (partieId, cycle, ordreCadre, indexOption, resume) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        if (!option) throw new Error('Option de cadre introuvable pour cet ordre.');

        evenementCycle.cadresAppliques[ordreCadre] = { manuel: true, resume: resume, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre "choix" dont l'option retenue (`indexOption`,
     * dans cadre.effet.options) porte sur une mécanique déjà automatisée
     * côté FocusEngine (voir cleFocusEnginePourOptionCadre_ ci-dessus) —
     * hors périmètre d'actionsSimplesCadre_ (ne porte pas sur les 5
     * ressources simples). Réutilise FocusEngine.resoudreEffet (moteur
     * pur déjà utilisé par l'écran Focus pour ces mêmes clés — activer_cube
     * y est une clé "cube" générique, deployer_cube_secteur_mere y ouvre
     * la popup dédiée 'deployer_cube', etablir_guilde/
     * construire_installation la popup 'construire' via `demanderChoix`,
     * voir focusEngine.js) plutôt que de dupliquer une deuxième logique
     * de résolution : seule source de vérité pour ces mécaniques, qu'elles
     * soient déclenchées depuis Focus ou depuis un Cadre d'Événement
     * galactique.
     *
     * `demanderChoix` est fourni par l'appelant (StrategieService,
     * couche IHM) — GameService reste autrement une couche de données
     * pure ; FocusEngine.resoudreEffet est la SEULE fonction ici qui
     * accepte un callback IHM, exactement comme FocusEngine.
     * jouerActionEtPersister le fait déjà pour les actions Focus.
     *
     * Ne lève PAS d'erreur si le joueur annule la popup imbriquée
     * (déployer/construire), voir strategieService.js : ce n'est pas un
     * échec, `resultatEffet.succes === false` dans ce cas précis — résout
     * avec { annule: true } plutôt que de rejeter, pour que l'appelant
     * (index.html) réactive simplement le cadre sans message d'erreur,
     * cohérent avec le comportement d'Annuler sur les autres popups de
     * résolution de cadre. `champsPlateauMaison` reste borné aux champs
     * déjà surveillés par FocusEngine (CHAMPS_DIFF_SUIVIS) — jamais une
     * clé arbitraire (etablir_guilde/construire_installation ne touchent
     * d'ailleurs aucun de ces champs — mutations vide, l'écriture se fait
     * directement sur secteursPartie par la popup, voir strategieService.js).
     */
    appliquerCadreChoixFocusEngine: function (partieId, cycle, ordreCadre, indexOption, demanderChoix) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, lignePlateauMaison = ctx.lignePlateauMaison, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        var cleFocusEngine = cleFocusEnginePourOptionCadre_(option);
        if (!cleFocusEngine) throw new Error('Option automatisable introuvable pour ce cadre.');
        if (typeof FocusEngine === 'undefined') throw new Error('FocusEngine indisponible.');

        var effet = {};
        effet[cleFocusEngine] = Number(option.valeur) || 1;

        var source = 'Cadre #' + ordreCadre;
        var lignePlateauMaisonAvecId = Object.assign({ partieId: partieId }, lignePlateauMaison);

        return FocusEngine.resoudreEffet(lignePlateauMaisonAvecId, effet, source, cadre.texte, demanderChoix)
          .then(function (resultatEffet) {
            if (!resultatEffet.succes) {
              return { annule: true };
            }

            var champs = {};
            resultatEffet.mutations.forEach(function (m) { champs[m.champ] = resultatEffet.etatResultat[m.champ]; });

            var resume = resultatEffet.journal.map(function (ligne) {
              var prefixe = source + ' : ';
              return ligne.indexOf(prefixe) === 0 ? ligne.slice(prefixe.length) : ligne;
            }).join(' ').replace(/\.\s*$/, '');

            evenementCycle.cadresAppliques[ordreCadre] = { resume: resume, le: new Date().toISOString() };
            partie.evenements[cleCycle] = evenementCycle;

            // NE PAS réutiliser `lignePlateauMaison` (capturée tout en
            // haut, AVANT FocusEngine.resoudreEffet) pour l'écriture
            // finale. Certaines options (avancer_civilisation ;
            // retirer_corruption, option Technologie) écrivent
            // DIRECTEMENT sur plateauMaison PENDANT la résolution, via
            // une popup imbriquée qui appelle elle-même
            // GameService.majPlateauMaison/majCivilisation (toutes deux
            // lecture-fusion-écriture, sûres) — un DB.put bâti sur le
            // snapshot périmé de `lignePlateauMaison` écraserait ces
            // écritures avec les anciennes valeurs (violation de la
            // règle #1 du projet, "lecture-fusion-écriture systématique :
            // ne jamais écraser un champ non concerné par la modification
            // en cours" — voir CLAUDE.md). On relit donc une ligne
            // FRAÎCHE juste avant de fusionner uniquement `champs` (les
            // mutations suivies par focusEngine.js pour L'ACTION DIRECTE
            // du cadre — cube/ressources — jamais celles d'une popup
            // imbriquée, qui persiste déjà elle-même). Si `champs` est
            // vide (rien à écrire côté focusEngine, ex. avancer_civilisation
            // seule sans coût), aucune écriture superflue.
            var ecrirePlateauMaison = Object.keys(champs).length
              ? DB.get('plateauMaison', partieId).then(function (ligneFraiche) {
                Object.keys(champs).forEach(function (champ) { ligneFraiche[champ] = champs[champ]; });
                return DB.put('plateauMaison', ligneFraiche);
              })
              : Promise.resolve();

            return Promise.all([
              ecrirePlateauMaison,
              GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            ]).then(function () {
              return rechargerPartie_(partieId);
            });
          });
      });
    },

    /**
     * true si le Cadre est automatisable pour ce gain (secteur/piste/
     * Programme/Technologie, avec repli éventuel — voir
     * resoudreCiblesCadreGainCorruption_ ci-dessus) — utilisée par
     * index.html pour décider si ce Cadre "gain" doit ouvrir la popup
     * dédiée (appliquerCadreGainCorruption ci-dessous) ou rester sur
     * l'existant appliquerCadreManuel (offre_programme, cadre composé,
     * effet_conditionnel — voir JSDoc de resoudreCiblesCadreGainCorruption_).
     */
    cadreGainCorruptionAutomatisable: function (cadre) {
      return !!resoudreCiblesCadreGainCorruption_(cadre && cadre.effet);
    },

    /**
     * Applique un cadre "type":"gain" dont l'effet ne porte QUE sur
     * "corruption" (voir resoudreCiblesCadreGainCorruption_ ci-dessus et
     * docs-rules-corruption-gardiens-refuges-technoConsume.md §1) et dont
     * la cible est automatisable (sinon, cadreGainCorruptionAutomatisable
     * renvoie false et l'appelant — index.html — reste sur
     * GameService.appliquerCadreManuel, cette fonction n'est même pas
     * invoquée). Répète `quantite` fois l'appel à
     * demanderChoix({type:'gagner_corruption', ...}) — chaque popup fait
     * SA PROPRE persistance (secteur/piste/Technologie — comme
     * appliquerCadreChoixFocusEngine/retirer_corruption ci-dessus,
     * focusEngine.js) ; cette fonction ne fait qu'accumuler les résumés et
     * marquer le cadre appliqué à la fin (même garde-fou anti-double-
     * application que les autres appliquerCadre* de ce fichier).
     *
     * Un "Annuler" sur la TOUTE PREMIÈRE popup (rien encore placé) résout
     * `{annule:true}` — le cadre n'est PAS marqué appliqué, cohérent avec
     * appliquerCadreChoixFocusEngine. Un "Annuler" APRÈS au moins une
     * Corruption déjà placée (`quantite` > 1 — un seul Cadre du catalogue
     * à ce jour, "Gagnez deux Corruption... sur des emplacements de
     * Programme") marque le cadre appliqué avec le résumé PARTIEL obtenu
     * plutôt que de rejeter : les Corruptions déjà placées sont réellement
     * sur le plateau (persistées par la/les popup(s) déjà résolue(s)) —
     * les laisser sans marquer le cadre permettrait au joueur de rouvrir
     * le Cadre et d'en placer au-delà de ce que la carte autorise.
     */
    appliquerCadreGainCorruption: function (partieId, cycle, ordreCadre, demanderChoix) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var config = resoudreCiblesCadreGainCorruption_(cadre && cadre.effet);
        if (!config) throw new Error('Ce cadre n’est pas automatisable pour le gain de Corruption.');

        var source = 'Cadre #' + ordreCadre;
        var details = [];
        var annuleSansRien = false;
        var repetitions = [];
        for (var i = 0; i < config.quantite; i++) repetitions.push(i);

        return repetitions.reduce(function (promesse) {
          return promesse.then(function (arreter) {
            if (arreter) return true;
            return Promise.resolve(demanderChoix({
              type: 'gagner_corruption',
              source: source,
              partieId: partieId,
              ciblesAutorisees: config.ciblesAutorisees,
              ciblesRepli: config.ciblesRepli,
              exclureTechno: config.exclureTechno,
              avancerPisteApresPlacement: config.avancerPisteApresPlacement
            })).then(function (reponse) {
              if (!reponse || reponse.annule) {
                if (!details.length) annuleSansRien = true;
                return true;
              }
              details.push(reponse.detail);
              return false;
            });
          });
        }, Promise.resolve(false)).then(function () {
          if (annuleSansRien) return { annule: true };

          evenementCycle.cadresAppliques[ordreCadre] = { resume: details.join(' '), le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;

          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            .then(function () {
              return rechargerPartie_(partieId);
            });
        });
      });
    },

    // ------------------------------------------------------------
    // Événement H, Cycle 1, Cadre 1 ("Droit en enfer") : 2 options
    // exclusives au vocabulaire inédit dans tout le reste du catalogue
    // (vérifié — grep sur "gloire"/"recall" à l'intérieur de tout
    // `cadre.effet`) : { gain: { corruption:1, gloire:1 } } et
    // { recall: { cube:1 } }, ni l'une ni l'autre reconnue par
    // deltaOptionCadre_/cleFocusEnginePourOptionCadre_ ci-dessus (aucune
    // des deux ne porte de `cle`/`valeur`). Les 2 fonctions ci-dessous
    // reconnaissent EXACTEMENT ce gabarit (même prudence que
    // conditionAvancerPisteSiCorrompue_ plus haut) — aucune tentative de
    // généraliser à un futur Cadre au vocabulaire similaire.
    // ------------------------------------------------------------

    /**
     * Option "gain: {corruption:1, gloire:1}" — compose 2 mécaniques déjà
     * automatisées séparément : ouvre la popup 'gagner_corruption'
     * existante (mêmes 4 cibles que GameService.appliquerCadreGainCorruption,
     * aucune cible n'étant précisée par le catalogue pour cette option —
     * donc les 4 restent ouvertes, sans repli) puis, une fois la
     * Corruption placée, ajoute un jeton Gloire de valeur 1 au premier
     * emplacement libre de plateauMaison.gloire (même geste que le clic
     * manuel sur un emplacement vide — voir renderGloireDOM_,
     * strategieService.js — et le dépôt automatique de Gloire après une
     * invasion réussie, même fichier). Relit `plateauMaison` À NEUF après
     * la popup (jamais le snapshot capturé par chargerCadreOuvrable_ :
     * la popup 'gagner_corruption' peut avoir déjà écrit dessus elle-même
     * — option "Technologie — Chambres de décontamination" — voir
     * l'avertissement équivalent dans appliquerCadreChoixFocusEngine
     * ci-dessus). Si les 5 emplacements Gloire sont déjà occupés, la
     * Corruption reste placée normalement mais le jeton Gloire n'est pas
     * posé — signalé dans le résumé, à corriger manuellement (aucune
     * défausse/remplacement inventé, cas non couvert par les règles).
     */
    appliquerCadreChoixCorruptionGloire: function (partieId, cycle, ordreCadre, indexOption, demanderChoix) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        var gain = option && option.gain;
        var estGabaritReconnu = gain && !option.cout && !option.recall &&
          Object.keys(gain).length === 2 && gain.corruption === 1 && gain.gloire === 1;
        if (!estGabaritReconnu) throw new Error('Option de cadre non automatisable pour ce gain Corruption + Gloire.');

        var source = 'Cadre #' + ordreCadre;
        return Promise.resolve(demanderChoix({
          type: 'gagner_corruption',
          source: source,
          partieId: partieId,
          ciblesAutorisees: ['secteur', 'piste', 'programme', 'techno']
        })).then(function (reponse) {
          if (!reponse || reponse.annule) return { annule: true };

          return DB.get('plateauMaison', partieId).then(function (ligneFraiche) {
            var gloire = Array.isArray(ligneFraiche.gloire) ? ligneFraiche.gloire.slice(0, 5) : [];
            while (gloire.length < 5) gloire.push(null);
            var indexLibre = gloire.indexOf(null);
            if (indexLibre === -1) indexLibre = gloire.indexOf(undefined);
            var gloirePlacee = indexLibre !== -1;

            var resume = reponse.detail + (gloirePlacee
              ? ' Jeton Gloire (valeur 1) gagné.'
              : ' Aucun emplacement Gloire libre — jeton Gloire à ajouter manuellement.');
            evenementCycle.cadresAppliques[ordreCadre] = { resume: resume, le: new Date().toISOString() };
            partie.evenements[cleCycle] = evenementCycle;

            var ecrireGloire = Promise.resolve();
            if (gloirePlacee) {
              gloire[indexLibre] = 1;
              ligneFraiche.gloire = gloire;
              ecrireGloire = DB.put('plateauMaison', ligneFraiche);
            }

            return Promise.all([
              ecrireGloire,
              GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            ]).then(function () {
              return rechargerPartie_(partieId);
            });
          });
        });
      });
    },

    /**
     * Option "recall: {cube:1}" — ouvre la popup 'rappeler_cube' (nouvelle,
     * strategieService.js, même gabarit que 'construire' : secteur +
     * type de vaisseau) qui persiste elle-même via
     * SecteurService.rappelerCube, comme 'gagner_corruption'/'construire'
     * le font déjà pour d'autres mécaniques.
     */
    appliquerCadreChoixRappelCube: function (partieId, cycle, ordreCadre, indexOption, demanderChoix) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        var recall = option && option.recall;
        var estGabaritReconnu = recall && !option.gain && !option.cout &&
          Object.keys(recall).length === 1 && recall.cube === 1;
        if (!estGabaritReconnu) throw new Error('Option de cadre non automatisable pour ce rappel de cube.');

        return Promise.resolve(demanderChoix({
          type: 'rappeler_cube',
          source: 'Cadre #' + ordreCadre,
          partieId: partieId
        })).then(function (reponse) {
          if (!reponse || reponse.annule) return { annule: true };

          evenementCycle.cadresAppliques[ordreCadre] = { resume: reponse.detail, le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;

          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            .then(function () {
              return rechargerPartie_(partieId);
            });
        });
      });
    },

    /**
     * Marque une technologie possédée (départ, cible='depart' ; ou l'un
     * des 5 emplacements obtenus, cible=index 0-4) comme améliorée ou
     * non. Écrit directement sur le record `plateauMaison` (et non via
     * majPlateauMaison, qui exclut volontairement technologieDepart et
     * technologiesObtenues — "leurs propres fonctions dédiées", voir
     * commentaire de CHAMPS_PLATEAU_MAISON_AUTORISES).
     *
     * Pool "Technologies obtenues" (cible = slot 0-4) UNIQUEMENT (jamais
     * pour la Technologie de départ — voir INFLUENCE_TECHNOLOGIE_BASE_
     * ci-dessus) : ajuste l'Influence de ±INFLUENCE_TECHNOLOGIE_
     * DELTA_AMELIOREE_ à CHAQUE changement RÉEL d'état de cette case,
     * sauf si la Technologie est `sansPoint` (aucun gain d'Influence dans
     * un sens comme dans l'autre). Couvre aussi bien l'amélioration
     * "normale" (case cochée plus tard, une fois le cycle débloqué) que
     * le niveau Améliorée accordé directement à l'acquisition (Focus
     * Innovation "Inventer" — gagnerTechnologieEtResoudreEffet appelle
     * cette même fonction).
     */
    definirTechnologieAmelioree: function (partieId, cible, amelioree) {
      amelioree = !!amelioree;
      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour mise à jour (partie ' + partieId + ').');

        if (cible === 'depart') {
          ligne.technologieDepartAmelioree = amelioree;
          return DB.put('plateauMaison', ligne);
        }

        var slot = Number(cible);
        if (slot < 0 || slot > 4) throw new Error('Emplacement de technologie invalide.');
        var technologiesObtenues = ligne.technologiesObtenues || [null, null, null, null, null];
        if (!technologiesObtenues[slot]) throw new Error('Aucune technologie à cet emplacement.');
        var etaitAmelioree = !!technologiesObtenues[slot].amelioree;
        technologiesObtenues[slot] = Object.assign({}, technologiesObtenues[slot], { amelioree: amelioree });
        ligne.technologiesObtenues = technologiesObtenues;
        if (etaitAmelioree !== amelioree && !technologiesObtenues[slot].sansPoint) {
          var delta = amelioree ? INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_ : -INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_;
          ligne.influence = Math.max(0, (ligne.influence || 0) + delta);
        }
        return DB.put('plateauMaison', ligne);
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Fait avancer la partie au cycle suivant (1 -> 2 -> 3 -> 'termine').
     * cycleActuel n'est jamais stocké tel quel (calculé à la lecture, voir
     * assemblerPartie_) : incrémente cycleNum/cycleTermine et amorce
     * focusHeroiques/focusHeroiquesPioches pour le nouveau cycle si
     * absents. EVOLUTION 12 : réinitialise aussi
     * plateauMaison.actionsFocusUtilisees ([]) — écrit SÉPARÉMENT via
     * majPlateauMaison, jamais porté par sauvegarderPartie/etatJson
     * (pourEtatJson_ exclut toujours `plateauMaison`, colonnes dédiées de
     * la table `plateauMaison`, pas de `parties`).
     */
    avancerCycle: function (partieId) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        if (partie.cycleTermine || partie.cycleNum >= 3) {
          partie.cycleTermine = true;
          partie.cycleActuel = 'termine';
        } else {
          partie.cycleNum = partie.cycleNum + 1;
          partie.cycleTermine = false;
          partie.cycleActuel = partie.cycleNum;

          if (!partie.focusHeroiques) {
            partie.focusHeroiques = { cycle1: [null, null, null], cycle2: [null, null, null], cycle3: [null, null, null] };
          }
          var cle = 'cycle' + partie.cycleNum;
          if (!partie.focusHeroiques[cle]) partie.focusHeroiques[cle] = [null, null, null];
          if (!partie.focusHeroiquesPioches) partie.focusHeroiquesPioches = [];
        }

        // Reflète aussi la réinitialisation sur l'objet `partie` EN
        // MÉMOIRE, en plus de l'écriture DB ci-dessous : sauvegarderPartie
        // renvoie CET objet tel quel (pas de relecture DB), et l'appelant
        // (index.html, bouton "Fin du cycle") l'utilise directement pour
        // re-rendre l'écran Focus sans passer par un rechargement complet
        // — sans cette ligne, l'écran afficherait encore les actions de
        // l'ancien cycle comme "utilisées" jusqu'au prochain rafraîchissement.
        partie.plateauMaison = partie.plateauMaison || {};
        partie.plateauMaison.actionsFocusUtilisees = [];

        return GameService.majPlateauMaison(partieId, { actionsFocusUtilisees: [] }).then(function () {
          return GameService.sauvegarderPartie(partie, 'avancer_cycle', 'cycle suivant');
        });
      });
    },

    /**
     * Enregistre (ou retire, si nom est vide) le Focus héroïque choisi
     * manuellement pour un emplacement (0/1/2) d'un cycle donné. Un même
     * Focus héroïque ne peut être choisi qu'une fois par partie, tous
     * cycles confondus (focusHeroiquesPioches) ; remplacer un emplacement
     * déjà occupé libère l'ancien choix. Construction de la carte
     * (regroupement des 2-3 actions du catalogue "focus") déléguée à
     * FocusService.obtenirCarteHeroiqueParNom.
     *
     * ⚠️ Contrairement à avancerCycle/choisirTechnologieObtenue, cette
     * action n'écrit pas d'entrée d'historique (écriture directe dans
     * `parties`, sans ajouterHistorique_).
     */
    choisirFocusHeroique: function (partieId, cycle, slot, nom) {
      slot = Number(slot);
      if (slot < 0 || slot > 2) return Promise.reject(new Error('Emplacement de Focus héroïque invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        if (!partie.focusHeroiques) {
          partie.focusHeroiques = { cycle1: [null, null, null], cycle2: [null, null, null], cycle3: [null, null, null] };
        }
        var cle = 'cycle' + cycle;
        if (!partie.focusHeroiques[cle]) partie.focusHeroiques[cle] = [null, null, null];

        var pioches = (partie.focusHeroiquesPioches || []).slice();
        var ancienne = partie.focusHeroiques[cle][slot];
        if (ancienne) {
          var idxAncienne = pioches.indexOf(ancienne.focus);
          if (idxAncienne !== -1) pioches.splice(idxAncienne, 1);
        }

        var suite;
        if (!nom) {
          partie.focusHeroiques[cle][slot] = null;
          suite = Promise.resolve();
        } else {
          if (pioches.indexOf(nom) !== -1) {
            return Promise.reject(new Error('"' + nom + '" a déjà été choisi ce cycle ou lors d\'un cycle précédent.'));
          }
          suite = FocusService.obtenirCarteHeroiqueParNom(nom).then(function (carte) {
            partie.focusHeroiques[cle][slot] = carte;
            pioches.push(nom);
          });
        }

        return suite.then(function () {
          partie.focusHeroiquesPioches = pioches;
          var enregistrementPartie = {
            id: partie.id,
            dateCreation: partie.dateCreation,
            archivee: !!partie.archivee,
            scenarioId: partie.scenarioId || null,
            cycleNum: partie.cycleNum || 1,
            cycleTermine: !!partie.cycleTermine,
            statut: partie.cycleTermine ? 'terminee' : 'en_cours',
            etatJson: pourEtatJson_(partie)
          };
          return DB.put('parties', enregistrementPartie).then(function () { return partie; });
        });
      });
    },

    /**
     * Enregistre (ou retire, si nomTechnologie est vide) la technologie
     * obtenue dans l'un des 5 emplacements du plateau maison, parmi les
     * technologies des maisons déchues (partie.adversaires).
     */
    choisirTechnologieObtenue: function (partieId, slot, nomTechnologie) {
      slot = Number(slot);
      if (slot < 0 || slot > 4) return Promise.reject(new Error('Emplacement de technologie invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        var technologies = (partie.technologiesObtenues || [null, null, null, null, null]).slice();

        if (!nomTechnologie) {
          technologies[slot] = null;
        } else {
          var trouvee = null;
          (partie.adversaires || []).forEach(function (maison) {
            (maison.technologies || []).forEach(function (t) {
              if (t.nom === nomTechnologie) {
                trouvee = { nom: t.nom, type: t.type || '', sansPoint: !!t.sansPoint, maison: maison.nom };
              }
            });
          });
          if (!trouvee) throw new Error('Technologie introuvable parmi les maisons déchues.');
          technologies[slot] = trouvee;
        }

        return GameService.majPlateauMaison(partieId, { technologiesObtenues: technologies }).then(function () {
          return ajouterHistorique_(partieId, 'technologie_obtenue_slot' + slot, nomTechnologie || '(retirée)');
        }).then(function () {
          return rechargerPartie_(partieId);
        });
      });
    },

    /**
     * Gagne une Technologie (choisirTechnologieObtenue) ET, dans la
     * foulée, résout son effet immédiat — voir EFFET_TECHNOLOGIE_
     * IMMEDIAT_/TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_ ci-dessus.
     * `demanderChoix` est transmis tel quel à FocusEngine.resoudreEffet
     * (nécessaire si l'effet immédiat déclenche lui-même une popup — ex.
     * Nacelles/"gagner_commerce" -> choix parmi les 6 Bonus Commerce) :
     * appelée depuis la popup 'gagner_technologie' (strategieService.js,
     * Feuille ET #modal-choix), qui lui transmet sa PROPRE fonction
     * demanderChoix — la même que celle utilisée pour tout le reste de la
     * résolution en cours, exactement comme CivilisationService.
     * avancerPiste/GameService.utiliserProgramme.
     * Retourne `{partie, detailImmediat}` — `detailImmediat` (chaîne,
     * '' si la Technologie n'a pas encore d'entrée dans les 2 tables
     * ci-dessus) est prêt à être ajouté au résumé "Technologie ... obtenue"
     * affiché par l'appelant.
     */
    gagnerTechnologieEtResoudreEffet: function (partieId, slot, nomTechnologie, amelioree, demanderChoix) {
      var detailsImmediat = [];
      return GameService.choisirTechnologieObtenue(partieId, slot, nomTechnologie).then(function () {
        // Valeur de la Technologie elle-même (INFLUENCE_TECHNOLOGIE_BASE_
        // ci-dessus) — SÉPARÉE de tout gain d'Influence propre à l'effet
        // immédiat de la carte (ex. Bonus Commerce "Gagnez 3 Influence",
        // détail plus bas) : les deux s'additionnent. `sansPoint` = 0
        // (3 des 8 technologies des maisons déchues, fixé à la mise en
        // place) : aucun gain ici, ni via definirTechnologieAmelioree
        // plus bas.
        return DB.get('plateauMaison', partieId).then(function (ligne) {
          var slotObj = (ligne.technologiesObtenues || [])[slot];
          if (!slotObj || slotObj.sansPoint) return;
          ligne.influence = (ligne.influence || 0) + INFLUENCE_TECHNOLOGIE_BASE_;
          return DB.put('plateauMaison', ligne).then(function () {
            detailsImmediat.push('+' + INFLUENCE_TECHNOLOGIE_BASE_ + ' Influence (valeur de la Technologie).');
          });
        });
      }).then(function () {
        // Le delta Améliorée (+INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_,
        // 4 -> 6 au total) est appliqué PAR definirTechnologieAmelioree
        // elle-même (même fonction que la case à cocher normale du Plat.
        // maison) — pas dupliqué ici.
        return amelioree ? GameService.definirTechnologieAmelioree(partieId, slot, true) : Promise.resolve();
      }).then(function () {
        if (amelioree && detailsImmediat.length) {
          detailsImmediat.push('+' + INFLUENCE_TECHNOLOGIE_DELTA_AMELIOREE_ + ' Influence (Améliorée).');
        }
        var effet = EFFET_TECHNOLOGIE_IMMEDIAT_[nomTechnologie];
        var typeDeploiement = TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_[nomTechnologie];
        var avecCout = EFFET_TECHNOLOGIE_IMMEDIAT_AVEC_COUT_[nomTechnologie];
        var choixDeploiement = TECHNOLOGIES_CHOIX_DEPLOIEMENT_SECTEUR_MERE_[nomTechnologie];
        var source = 'Technologie — ' + nomTechnologie;
        var suite = Promise.resolve();

        // Factorise l'application d'un résultat {succes, journal, mutations,
        // etatResultat} (FocusEngine.resoudreEffet OU resoudreEffetEtCout,
        // MÊME forme) : écrit les champs mutés en base et journalise, en
        // retirant le préfixe "source : " (ou "source (suffixe) : ", ex.
        // "Technologie — Nacelles (Bonus Commerce) : ..." —
        // resoudreJsonInterne_ ajoute ce suffixe pour les clés résolues
        // récursivement, gagner_commerce/choice) déjà présent en tête de
        // chaque ligne — utilisée par les 3 blocs ci-dessous (`effet`
        // principal, `effetAutre` du choix Secteur-Mère, `avecCout`).
        function appliquerResultatEffet_(resultatEffet) {
          if (!resultatEffet.succes) return Promise.resolve();
          return DB.get('plateauMaison', partieId).then(function (ligneFraiche) {
            resultatEffet.mutations.forEach(function (m) { ligneFraiche[m.champ] = resultatEffet.etatResultat[m.champ]; });
            return DB.put('plateauMaison', ligneFraiche);
          }).then(function () {
            resultatEffet.journal.forEach(function (ligne) {
              var indexSepare = ligne.indexOf(' : ');
              var prefixe = indexSepare !== -1 ? ligne.slice(0, indexSepare) : '';
              detailsImmediat.push(prefixe.indexOf(source) === 0 ? ligne.slice(indexSepare + 3) : ligne);
            });
          });
        }

        if (effet) {
          suite = suite.then(function () {
            if (typeof FocusEngine === 'undefined') return;
            return DB.get('plateauMaison', partieId).then(function (ligne) {
              var etatAvecId = Object.assign({ partieId: partieId }, ligne);
              return FocusEngine.resoudreEffet(etatAvecId, effet, source, '', demanderChoix).then(appliquerResultatEffet_);
            });
          });
        }

        if (typeDeploiement) {
          suite = suite.then(function () {
            if (typeof SecteurService === 'undefined') return;
            return DB.get('parties', partieId).then(function (partieBrute) {
              return SecteurService.obtenirSecteurMere(partieBrute ? partieBrute.scenarioId : null);
            }).then(function (numero) {
              if (numero == null) return;
              return SecteurService.deployerCube(partieId, numero, typeDeploiement, 1).then(function () {
                var labelType = typeDeploiement.charAt(0).toUpperCase() + typeDeploiement.slice(1);
                detailsImmediat.push('1 ' + labelType + ' déployé(e) sur le Secteur-Mère.');
              });
            });
          });
        }

        // `choice` dont une alternative est un déploiement FIXE Secteur-
        // Mère (voir TECHNOLOGIES_CHOIX_DEPLOIEMENT_SECTEUR_MERE_
        // ci-dessus) : hors vocabulaire FocusEngine, le choix est posé ICI
        // directement (popup 'option_exclusive', options = libellés FR
        // bruts) puis dispatché à la main — jamais via le `choice`
        // générique de FocusEngine, qui ne saurait pas résoudre l'option
        // "déploiement fixe".
        if (choixDeploiement) {
          suite = suite.then(function () {
            return Promise.resolve(demanderChoix({
              type: 'option_exclusive',
              options: [choixDeploiement.labelDeploiement, choixDeploiement.labelAutre],
              source: source
            })).then(function (reponse) {
              if (!reponse || reponse.annule) return;
              if (reponse.indexChoisi === 0) {
                if (typeof SecteurService === 'undefined') return;
                return DB.get('parties', partieId).then(function (partieBrute) {
                  return SecteurService.obtenirSecteurMere(partieBrute ? partieBrute.scenarioId : null);
                }).then(function (numero) {
                  if (numero == null) return;
                  return SecteurService.deployerCube(partieId, numero, choixDeploiement.typeUnite, 1).then(function () {
                    detailsImmediat.push(choixDeploiement.labelDeploiement);
                  });
                });
              }
              if (typeof FocusEngine === 'undefined') return;
              return DB.get('plateauMaison', partieId).then(function (ligne) {
                var etatAvecId = Object.assign({ partieId: partieId }, ligne);
                return FocusEngine.resoudreEffet(etatAvecId, choixDeploiement.effetAutre, source, '', demanderChoix).then(appliquerResultatEffet_);
              });
            });
          });
        }

        // `cost` combiné à un Effet (voir EFFET_TECHNOLOGIE_IMMEDIAT_AVEC_
        // COUT_ ci-dessus) — résolu EN DERNIER (le Coût n'est débité
        // qu'après tout le reste de l'Effet de la carte, cohérent avec la
        // RÈGLE MÉTIER Effet-puis-Coût de FocusEngine.resoudreEffetEtCout
        // elle-même).
        if (avecCout) {
          suite = suite.then(function () {
            if (typeof FocusEngine === 'undefined') return;
            return DB.get('plateauMaison', partieId).then(function (ligne) {
              var etatAvecId = Object.assign({ partieId: partieId }, ligne);
              return FocusEngine.resoudreEffetEtCout(etatAvecId, avecCout.effet, avecCout.cout, source, demanderChoix).then(appliquerResultatEffet_);
            });
          });
        }

        return suite.then(function () {
          return rechargerPartie_(partieId);
        }).then(function (partieFraiche) {
          return { partie: partieFraiche, detailImmediat: detailsImmediat.join(' ') };
        });
      });
    },

    /**
     * Gagner un Programme (data/catalogue/programmes.json) — appelée
     * directement par la popup 'gagner_programme' (strategieService.js)
     * au clic sur Valider, qui fait le choix ET délègue ici la
     * persistance (même principe que SecteurService.placerCorruption/
     * CivilisationService.definirCorruption pour gagner_corruption :
     * simple lecture-fusion-écriture, aucun historique/rechargement de
     * partie ici — c'est l'appelant de plus haut niveau, Focus ou piste
     * de Civilisation via FocusEngine.resoudreEffet, qui gère déjà son
     * propre journal/rafraîchissement).
     *
     * - Cherche `nomProgramme` dans le catalogue (rejette si absent).
     * - Rejette si déjà dans programmesEnMain OU déjà joué
     *   (programmesUtilises) — un Programme est unique dans toute la
     *   partie (une seule copie physique de chaque carte).
     * - Ajoute le nom à `programmesEnMain` (tableau non borné, même
     *   famille que jetonCommerce — voir GameService.utiliserProgramme
     *   pour le passage "en main" -> "en jeu").
     * - Si ce Programme correspond à l'offre publique actuellement
     *   révélée pour son type (plateauMaison.offresProgramme), cette
     *   entrée est réinitialisée (nom: null, corrompu: false) — l'offre
     *   "prise" redevient à révéler. Si le joueur a pris un autre
     *   Programme du même type (pioche, "2 premiers", non suivis par
     *   l'app), l'offre reste inchangée.
     */
    gagnerProgramme: function (partieId, nomProgramme) {
      return Promise.all([DB.get('plateauMaison', partieId), DB.getAll('programmes')]).then(function (resultats) {
        var ligne = resultats[0];
        var catalogue = resultats[1];
        if (!ligne) throw new Error('Plateau maison introuvable pour cette partie.');

        var carte = catalogue.filter(function (p) { return p.nom === nomProgramme; })[0];
        if (!carte) throw new Error('Programme "' + nomProgramme + '" introuvable au catalogue.');

        var enMain = Array.isArray(ligne.programmesEnMain) ? ligne.programmesEnMain.slice() : [];
        var enJeu = Array.isArray(ligne.programmesUtilises) ? ligne.programmesUtilises : programmesUtilisesParDefaut_();
        if (enMain.indexOf(nomProgramme) !== -1) throw new Error('Ce Programme est déjà en main.');
        if (enJeu.some(function (s) { return s && s.nom === nomProgramme; })) {
          throw new Error('Ce Programme est déjà en jeu sur la fiche Maison.');
        }

        enMain.push(nomProgramme);
        ligne.programmesEnMain = enMain;

        var offres = Array.isArray(ligne.offresProgramme) ? ligne.offresProgramme.slice() : offresProgrammeParDefaut_();
        ligne.offresProgramme = offres.map(function (o) {
          return (o.type === carte.type && o.nom === nomProgramme) ? { type: o.type, nom: null, corrompu: false } : o;
        });

        return DB.put('plateauMaison', ligne).then(function () {
          return { nom: carte.nom, type: carte.type };
        });
      });
    },

    /**
     * Utiliser un Programme "en main" : résout sa vraie action gratuite
     * (règle fixe par type, voir EFFET_PROGRAMME_PAR_TYPE_/
     * INFO_PROGRAMME_PAR_TYPE ci-dessus) via FocusEngine.resoudreEffet —
     * même moteur que les actions Focus, avec un `effet` construit à la
     * main plutôt qu'une vraie carte catalogue (mêmes principes que
     * appliquerCadreChoixFocusEngine ci-dessus : `cout` toujours vide,
     * les actions de Programme sont gratuites). Si l'action va au bout
     * (`resultatEffet.succes`), la carte quitte `programmesEnMain` pour
     * rejoindre le plateau Programme (`programmesUtilises`, emplacements
     * 1-3 UNIQUEMENT — l'emplacement 0, Programme de départ, n'est
     * jamais touché ici, voir programmesUtilisesParDefaut_) :
     *   - un emplacement 1-3 porte déjà un Programme du MÊME type ->
     *     demande confirmation (`demanderChoix({type:'confirmation'})`)
     *     avant de le remplacer ; refusé -> le Programme reste en main,
     *     l'action reste résolue/persistée (impossible d'annuler un
     *     "envahir" déjà joué) ;
     *   - sinon un emplacement 1-3 est vide -> le cible directement ;
     *   - sinon (3 emplacements déjà occupés, aucun conflit de type) ->
     *     popup dédiée (`demanderChoix({type:'choisir_emplacement_programme'})`)
     *     pour choisir lequel remplacer ; annulé -> le Programme reste en
     *     main.
     * La Corruption est liée à l'EMPLACEMENT, pas à la carte qui l'occupe
     * (case "Corrompu" cochable/décochable même à vide, voir
     * renderProgrammesPlateauMaison_) : placer un Programme dans un
     * emplacement déjà Corrompu conserve ce `corrompu:true` tel quel (et
     * ne touche donc pas `corruptionMaison`) — seul `entretienActif`
     * redémarre à `false` pour la carte entrante.
     */
    utiliserProgramme: function (partieId, nomProgramme, demanderChoix) {
      // EVOLUTION 18 (todo.md) : "action de Programme en main" est, avec
      // l'action Focus (voir FocusEngine.jouerActionEtPersister), le seul
      // autre type d'action annulable au sens du todo.md — enveloppe donc
      // toute la résolution (y compris les popups déléguées ouvertes par
      // FocusEngine.resoudreEffet, qui peuvent écrire directement en base,
      // ex. secteurs/pistes de Civilisation) sous un enregistrement db.js,
      // exactement comme jouerActionEtPersister (voir son en-tête pour le
      // détail du mécanisme). `DB.arreterEnregistrement()` est TOUJOURS
      // appelé (succès, refus, ou exception).
      DB.demarrerEnregistrement();
      return Promise.all([DB.get('plateauMaison', partieId), DB.getAll('programmes')]).then(function (resultats) {
        var ligneDepart = resultats[0];
        var catalogue = resultats[1];
        if (!ligneDepart) throw new Error('Plateau maison introuvable pour cette partie.');

        var carte = catalogue.filter(function (p) { return p.nom === nomProgramme; })[0];
        if (!carte) throw new Error('Programme "' + nomProgramme + '" introuvable au catalogue.');

        var enMainDepart = Array.isArray(ligneDepart.programmesEnMain) ? ligneDepart.programmesEnMain : [];
        if (enMainDepart.indexOf(nomProgramme) === -1) {
          throw new Error('Programme "' + nomProgramme + '" introuvable en main.');
        }
        if (typeof FocusEngine === 'undefined') throw new Error('FocusEngine indisponible.');

        var effet = EFFET_PROGRAMME_PAR_TYPE_[carte.type];
        var texteAction = (INFO_PROGRAMME_PAR_TYPE[carte.type] || {}).action || '';
        var source = 'Programme — ' + nomProgramme;
        var etatAvecId = Object.assign({ partieId: partieId }, ligneDepart);

        return FocusEngine.resoudreEffet(etatAvecId, effet, source, texteAction, demanderChoix).then(function (resultatEffet) {
          if (!resultatEffet.succes) return { annule: true };

          return DB.get('plateauMaison', partieId).then(function (ligneFraiche) {
            resultatEffet.mutations.forEach(function (m) { ligneFraiche[m.champ] = resultatEffet.etatResultat[m.champ]; });

            var enMain = Array.isArray(ligneFraiche.programmesEnMain) ? ligneFraiche.programmesEnMain.slice() : [];
            var slots = Array.isArray(ligneFraiche.programmesUtilises) ? ligneFraiche.programmesUtilises.slice() : programmesUtilisesParDefaut_();

            var indexConflit = -1;
            for (var i = 1; i <= 3; i++) { if (slots[i] && slots[i].nom && catalogue.filter(function (p) { return p.nom === slots[i].nom; })[0].type === carte.type) { indexConflit = i; break; } }

            function placer_(indexCible) {
              var enMainSansCarte = enMain.filter(function (n) { return n !== nomProgramme; });
              var resume = resultatEffet.journal.map(function (ligne) {
                var prefixe = source + ' : ';
                return ligne.indexOf(prefixe) === 0 ? ligne.slice(prefixe.length) : ligne;
              }).join(' ');

              if (indexCible === -1) {
                return DB.put('plateauMaison', ligneFraiche).then(function () {
                  return { place: false, nom: carte.nom, type: carte.type, resume: resume };
                });
              }

              // Corruption liée à l'emplacement, pas à la carte : conserve
              // le `corrompu` déjà présent sur ce slot (voir JSDoc ci-dessus).
              var corrompuExistant = !!(slots[indexCible] && slots[indexCible].corrompu);
              slots[indexCible] = { nom: nomProgramme, entretienActif: false, corrompu: corrompuExistant };
              ligneFraiche.programmesEnMain = enMainSansCarte;
              ligneFraiche.programmesUtilises = slots;
              return DB.put('plateauMaison', ligneFraiche).then(function () {
                return { place: true, nom: carte.nom, type: carte.type, resume: resume };
              });
            }

            if (indexConflit !== -1) {
              return Promise.resolve(demanderChoix({
                type: 'confirmation',
                titre: 'Remplacer un Programme ?',
                message: 'Un Programme de type ' + carte.type + ' (« ' + slots[indexConflit].nom + ' ») est déjà en jeu. Le remplacer par « ' + nomProgramme + ' » ?',
                texteValider: 'Remplacer'
              })).then(function (reponse) {
                return placer_((reponse && reponse.confirme) ? indexConflit : -1);
              });
            }

            var indexLibre = -1;
            for (var j = 1; j <= 3; j++) { if (!slots[j] || !slots[j].nom) { indexLibre = j; break; } }
            if (indexLibre !== -1) return placer_(indexLibre);

            return Promise.resolve(demanderChoix({
              type: 'choisir_emplacement_programme',
              source: source,
              options: [1, 2, 3].map(function (n) {
                var carteExistante = catalogue.filter(function (p) { return p.nom === slots[n].nom; })[0];
                return { slot: n, nom: slots[n].nom, type: carteExistante ? carteExistante.type : '' };
              })
            })).then(function (reponse) {
              return placer_((reponse && !reponse.annule && typeof reponse.numero === 'number') ? reponse.numero : -1);
            });
          });
        });
      }).then(function (resultatFinal) {
        var mutationsCapturees = DB.arreterEnregistrement();
        if (resultatFinal && resultatFinal.annule) {
          // L'Effet a finalement échoué (RÈGLE MÉTIER : aucune trace) —
          // défait immédiatement tout ce qu'une popup déléguée aurait déjà
          // écrit en base, sans jamais transiter par la pile.
          return AnnulationService.restaurerMutations(partieId, mutationsCapturees).then(function () { return resultatFinal; });
        }
        if (!mutationsCapturees.length) return resultatFinal;
        return AnnulationService.empiler(partieId, {
          source: 'Programme — ' + nomProgramme,
          mutations: mutationsCapturees
        }).then(function () { return resultatFinal; });
      }).catch(function (erreur) {
        DB.arreterEnregistrement(); // filet de sécurité, voir commentaire ci-dessus
        throw erreur;
      });
    },

    /**
     * Enregistre (ou retire, si nomTechnologie est vide) le choix d'une
     * des 4 Technologies avancées (parmi les 8 des maisons déchues) —
     * même principe que choisirTechnologieObtenue (recherche dans
     * partie.adversaires, écriture via majPlateauMaison), avec deux
     * règles propres à cette mécanique :
     *   - le choix ne se fait qu'au cycle 1 (rejette sinon — les 4
     *     emplacements sont fixés pour le reste de la partie une fois le
     *     cycle 1 passé) ;
     *   - une même technologie ne peut occuper qu'un seul des 4
     *     emplacements à la fois (contrairement à choisirTechnologieObtenue,
     *     qui ne vérifie pas ce doublon — gênant ici vu que les 4 NON
     *     choisies deviennent le groupe du cycle 3, un doublon fausserait
     *     ce complément).
     * L'amélioration (case à cocher) est gérée séparément par
     * definirTechnologieAvanceeAmelioree, jamais ici.
     */
    choisirTechnologieAvancee: function (partieId, slot, nomTechnologie) {
      slot = Number(slot);
      if (slot < 0 || slot > 3) return Promise.reject(new Error('Emplacement de technologie avancée invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');
        if (partie.cycleActuel !== 1) {
          throw new Error('Les Technologies avancées ne se choisissent qu\'au cycle 1.');
        }

        var choisies = (partie.technologiesAvanceesChoisies || [null, null, null, null]).slice();

        if (!nomTechnologie) {
          choisies[slot] = null;
        } else {
          var trouvee = technologiesAdversesToutes_(partie).filter(function (t) { return t.nom === nomTechnologie; })[0];
          if (!trouvee) throw new Error('Technologie avancée introuvable parmi les maisons déchues.');
          var dejaPriseAilleurs = choisies.some(function (t, i) { return i !== slot && t && t.nom === nomTechnologie; });
          if (dejaPriseAilleurs) throw new Error('Cette technologie est déjà choisie à un autre emplacement.');
          choisies[slot] = { nom: trouvee.nom, maison: trouvee.maison };
        }

        return GameService.majPlateauMaison(partieId, { technologiesAvanceesChoisies: choisies }).then(function () {
          return ajouterHistorique_(partieId, 'technologie_avancee_slot' + slot, nomTechnologie || '(retirée)');
        }).then(function () {
          return rechargerPartie_(partieId);
        });
      });
    },

    /**
     * Fonction PURE (aucun accès DB) exposée pour l'IHM (index.html) —
     * regroupe la logique d'affichage par cycle (quelles 4 technologies
     * montrer, lesquelles sont améliorables) au même endroit que la
     * logique d'écriture ci-dessus (groupeActifTechnologiesAvancees_),
     * pour éviter toute divergence entre affichage et persistance.
     *   - toutes : les 8 technologies des maisons déchues (mise en place).
     *   - groupeA : les 4 choisies au cycle 1 (partie.technologiesAvancees
     *     Choisies, dans l'ordre des emplacements — peut contenir des null
     *     tant que le choix du cycle 1 n'est pas terminé).
     *   - groupeB : le complément des 4 autres parmi les 8 (calculé, jamais
     *     stocké) — vide tant que groupeA n'a pas ses 4 emplacements remplis.
     *   - actif : les noms améliorables CE cycle-ci (voir
     *     groupeActifTechnologiesAvancees_) — [] aux cycles 1 et 'termine'.
     */
    obtenirTechnologiesAvanceesGroupes: function (partie) {
      var toutes = technologiesAdversesToutes_(partie);
      var choisies = partie.technologiesAvanceesChoisies || [null, null, null, null];
      var nomsChoisis = choisies.filter(Boolean).map(function (t) { return t.nom; });
      var groupeB = nomsChoisis.length === 4
        ? toutes.filter(function (t) { return nomsChoisis.indexOf(t.nom) === -1; })
        : [];
      return {
        toutes: toutes,
        groupeA: choisies,
        groupeB: groupeB,
        actif: groupeActifTechnologiesAvancees_(partie)
      };
    }
  };
})();
