/**
 * focusEngine.js
 * Moteur coût/effet des actions Focus — Voidfall Companion PWA
 *
 * Porte le mapping des clés Coût/Effet du catalogue Focus vers l'état du
 * Plateau maison PWA (voir gameService.js — champs et liste blanche
 * CHAMPS_PLATEAU_MAISON_AUTORISES).
 *
 * ---------------------------------------------------------------------
 * MODE "PUR / DIFF" :
 * FocusEngine.resoudreAction() ne fait AUCUNE écriture. Il reçoit l'état
 * actuel du plateau maison, calcule l'état résultant, et retourne :
 *   - succes (bool)
 *   - journal (liste de lignes texte)
 *   - mutations (liste de {champ, avant, apres} — un par champ modifié)
 *   - plateauMaisonApres (l'état complet résultant, prêt à être passé à
 *     GameService.majPlateauMaison par l'appelant)
 * C'est l'appelant (écran Stratégie, ou l'orchestrateur ci-dessous)
 * qui décide d'écrire en base et d'empiler les mutations dans la pile
 * d'annulation (voir annulationService.js).
 *
 * ---------------------------------------------------------------------
 * RÈGLE MÉTIER :
 * Le Coût n'est débité qu'APRÈS résolution réussie de l'Effet. resoudreJson_
 * travaille sur un CLONE de l'état et ne retourne ses mutations à
 * l'appelant QUE si la résolution complète du JSON (Effet OU Coût, chacun
 * pris comme un tout) a réussi — un blocage à N'IMPORTE quelle clé annule
 * bien la totalité du JSON en cours, pas seulement les clés restantes.
 * Cas limite volontairement toléré : si le Coût est annulé après que
 * l'Effet a déjà réussi, les mutations de l'Effet sont conservées, celles
 * du Coût sont écartées, et un avertissement est journalisé.
 *
 * ---------------------------------------------------------------------
 * POINTS DE CHOIX (interaction utilisateur) :
 * Certaines clés nécessitent un choix du joueur (ex. "choice"/"choix",
 * "ressource_choix", "gagner_commerce"). Comme focusEngine.js est pur, il
 * ne peut pas ouvrir de popup lui-même : il appelle `demanderChoix(contexte)`,
 * une fonction fournie par l'appelant, qui doit retourner une Promise
 * résolue avec la réponse du joueur. Voir le mapping des `contexte.type`
 * dans les commentaires de resoudreCle_ ci-dessous. C'est ce mécanisme qui
 * permet de couvrir TOUTES les clés du catalogue tout en restant testable
 * en Node (un `demanderChoix` factice répond automatiquement dans les
 * tests).
 *
 * ---------------------------------------------------------------------
 * CLÉS HORS PÉRIMÈTRE — signalé explicitement (pas d'invention de logique) :
 * Certaines clés dépendent de systèmes que la PWA ne modélise pas
 * automatiquement (voir secteurService.js/gameService.js, en-têtes) :
 *   - Actions sur les secteurs : effet_secteur (les autres actions
 *     secteur — regrouper/regroupe, deployer_cube*, envahir/
 *     envahir_corrompu, retirer_corruption, rappeler_cube (Coût, EVOLUTION
 *     13 todo.md) — ont chacune un cas dédié dans resoudreCle_ ci-dessous ;
 *     secteurService.js PWA ne porte que l'instanciation/lecture pour
 *     effet_secteur, action hors périmètre — cf. son en-tête)
 *   - Civilisation : avance_rapide, avancer_piste_corrompue
 *     ("avancer_civilisation" et ses variantes "_societe"/"_gouvernement"/
 *     "_economie"/"_moins_avancee" ont chacune un cas dédié ci-dessous qui
 *     délègue à CivilisationService.avancerPiste(MoinsAvancee) ;
 *     CHAMPS_PLATEAU_MAISON_AUTORISES de gameService.js exclut toujours
 *     civSociete/civGouvernement/civEconomie — ces champs restent sous la
 *     seule responsabilité de CivilisationService)
 *   - Production : produire_ressource, produire_deux_ressources — CHOIX du
 *     joueur parmi les 5 ressources, popup de sélection pas encore
 *     construite (produire_<ressource>, où la ressource est imposée par
 *     le nom de la clé — ex. Focus Production "Ravitailler" — A un cas
 *     dédié ci-dessous qui délègue le calcul du revenu à une popup
 *     'produire_revenu', strategieService.js, seul niveauxProduction
 *     — calcul agrégé sur secteursPartie, population × guildes — dépend
 *     d'un accès secteurs hors de portée de ce moteur pur)
 * Pour ces clés, resoudreCle_ NE BLOQUE PAS l'action : elle journalise un
 * avertissement explicite ("effet non chiffré — à appliquer manuellement")
 * et continue. Aucune ressource n'est débitée/créditée à tort pour ces
 * clés — c'est délibérément prudent plutôt que de deviner une mutation de
 * secteur ou de piste de Civilisation qui n'a aucune fonction de
 * destination fiable pour l'instant.
 *
 * Dépend d'aucun module (pur). L'orchestrateur FocusEngine.jouerActionEtPersister
 * en bas de fichier dépend de DB (db.js), GameService (gameService.js) et
 * AnnulationService (annulationService.js) — à charger avant ce fichier
 * dans index.html si cette fonction est utilisée.
 */

var FocusEngine = (function () {
  'use strict';

  // ------------------------------------------------------------
  // Constantes de mapping — RESSOURCES/RESSOURCES_PRODUCTION/BONUS_COMMERCE/
  // CLES_MODIFICATEURS_SILENCIEUSES : données du livret, indépendantes des
  // secteurs.
  // ------------------------------------------------------------

  var CHAMP_PAR_CLE = {
    nourriture: 'ressourceNourriture',
    energie: 'ressourceEnergie',
    materiel: 'ressourceMateriel',
    credit: 'ressourceCredit',
    science: 'ressourceScience',
    influence: 'influence',
    prime: 'jetonPrime',
    liberation: 'jetonLiberation'
  };
  var CLES_SIMPLES = Object.keys(CHAMP_PAR_CLE);
  // RESSOURCES_PRODUCTION est identique à gameService.js/
  // RESSOURCES_SIMPLES_CADRE, et les 5 premières entrées de CHAMP_PAR_CLE
  // ci-dessus correspondent à gameService.js/CHAMP_RESSOURCE_PLATEAU_
  // MAISON_ — PAS fusionnées : focusEngine.js charge après gameService.js
  // (voir index.html) et les deux fichiers restent volontairement
  // indépendants l'un de l'autre. Si l'une de ces 5 ressources change
  // ici, vérifier l'autre copie côté gameService.js.
  var RESSOURCES_PRODUCTION = ['nourriture', 'energie', 'materiel', 'credit', 'science'];
  var NB_CUBES_TOTAL = 14;
  // todo.md (retour utilisateur) — docs-rules-Influence-et-ressources.md
  // §2 : les 3 SEULES ressources qu'un coût de Crédit peut substituer à 1
  // pour 1 (jamais Science, jamais un coût qui n'est pas une de ces 3
  // ressources — ex. l'Entretien, hors périmètre de focusEngine.js).
  var RESSOURCES_SUBSTITUABLES_CREDIT_ = ['nourriture', 'energie', 'materiel'];

  var CLES_MODIFICATEURS_SILENCIEUSES = ['sans_benefice_case', 'exclude', 'restriction', 'same_sector', 'meme_secteur', 'tie_break'];

  // "effet_secteur" reste hors périmètre (déjà branché en formulaire dédié
  // côté écran Secteurs, pas de popup Focus/Cadre dédiée pour lui) — les
  // clés de construction/établissement générique (voir CLES_CONSTRUIRE/
  // CATEGORIE_PAR_CLE_CONSTRUIRE_ ci-dessous), "retirer_corruption" (cas
  // dédié, comme construire/augmenter_population_pure, qui ouvre une popup
  // de choix parmi les 4 cibles possibles — Secteur, Piste de Civilisation,
  // Programme, Technologie Chambres de décontamination — voir
  // strategieService.js, contexte 'retirer_corruption') et "rappeler_cube"
  // (EVOLUTION 13, todo.md — cas dédié Coût uniquement, voir plus bas dans
  // resoudreCle_, testé avant le repli générique "cube") en sont exclues.
  // Les VARIANTES du catalogue (etablir_guilde_meme_secteur/_up_to/
  // _scientifique, construire_installation_meme_secteur/_autre_secteur/
  // _up_to — contrainte de secteur croisée avec une autre clé du même
  // JSON, répétition "jusqu'à N fois", ou type figé) restent hors
  // périmètre : elles retombent sur le repli générique en bas de
  // resoudreCle_ ("effet non chiffré — à appliquer manuellement"), portée
  // volontairement limitée au pattern décrit (secteur libre + type au
  // choix, quantité 1).
  var CLES_SECTEUR_HORS_PERIMETRE = [
    'effet_secteur'
  ];
  var CATEGORIE_PAR_CLE_CONSTRUIRE_ = {
    construire_installation: 'installation', installation: 'installation',
    etablir_guilde: 'guilde', guilde: 'guilde',
    // Même popup 'construire' (catégorie 'guilde') que etablir_guilde,
    // avec le type forcé sur "Banquiers" (voir TYPE_FORCE_PAR_CLE_
    // CONSTRUIRE_ ci-dessous).
    etablir_guilde_banquier: 'guilde',
    // Même popup 'construire' (catégorie 'installation') que
    // construire_installation, type forcé — utilisées par gameService.js/
    // EFFET_TECHNOLOGIE_IMMEDIAT_ (Quais orbitaux/Bases Stellaires,
    // `immediat.build.structure` toujours fixe, jamais un choix de type)
    // sur le même principe que etablir_guilde_banquier ci-dessus.
    construire_chantier_naval: 'installation',
    construire_base_stellaire: 'installation',
    // Idem — Sentinelles (gameService.js/TECHNOLOGIES_CHOIX_DEPLOIEMENT_
    // SECTEUR_MERE_) : autre alternative de son `choice` que le déploiement
    // fixe sur le Secteur-Mère.
    construire_defense_secteur: 'installation'
  };
  // Clé de CLES_CONSTRUIRE -> type forcé (présélectionné et non modifiable
  // côté popup 'construire', strategieService.js) — absent pour les clés
  // dont le type reste au libre choix du joueur (etablir_guilde/
  // construire_installation).
  var TYPE_FORCE_PAR_CLE_CONSTRUIRE_ = {
    etablir_guilde_banquier: 'banquiers',
    construire_chantier_naval: 'chantier_naval',
    construire_base_stellaire: 'base_stellaire',
    construire_defense_secteur: 'defense_secteur'
  };
  var CLES_CONSTRUIRE = Object.keys(CATEGORIE_PAR_CLE_CONSTRUIRE_);
  var CLES_DEPLOYER_CUBE = ['deployer_cube_par_chantier', 'deployer_cube', 'deploy_cube', 'deployer_cube_secteur_mere'];
  var MODE_PAR_CLE_DEPLOYER_CUBE = {
    deployer_cube_par_chantier: 'par_chantier',
    deployer_cube: 'libre',
    deploy_cube: 'libre',
    deployer_cube_secteur_mere: 'secteur_mere'
  };
  // "avancer_civilisation" (piste au choix) et "avancer_civilisation_
  // societe"/"_gouvernement"/"_economie" (piste imposée) ont un cas dédié
  // ci-dessous (comme construire/retirer_corruption), qui ouvre une popup
  // de choix/aperçu (contexte 'avancer_civilisation', strategieService.js)
  // puis délègue à CivilisationService.avancerPiste, seule source de
  // vérité pour cette mécanique (déjà utilisée par le bouton "Avancer" de
  // l'écran Focus) — elles n'apparaissent donc pas dans la liste
  // ci-dessous. "avance_rapide" reste hors périmètre ICI (résolue
  // différemment, en aval, à l'intérieur même de CivilisationService.
  // avancerPiste — voir son en-tête — jamais via resoudreCle_ : cette clé
  // n'apparaît d'ailleurs que sur une case déjà en cours d'avancement,
  // jamais comme effet Focus/Cadre à résoudre isolément). "avancer_
  // civilisation_moins_avancee"/"avancer_piste_corrompue" restent hors
  // périmètre : des fonctions dédiées existent (CivilisationService.
  // avancerPisteMoinsAvancee/avancerPisteCorrompue) mais aucune popup
  // Focus/Cadre n'est branchée dessus.
  var CLES_CIVILISATION_HORS_PERIMETRE = [
    'avance_rapide', 'avancer_piste_corrompue'
  ];
  // Clé Focus/Cadre -> piste imposée (identifiant CivilisationService.PISTES)
  // — absente pour "avancer_civilisation" (piste au choix, voir
  // contexte.piste === null côté popup).
  var PISTE_PAR_CLE_AVANCER_CIVILISATION_ = {
    avancer_civilisation_societe: 'societe',
    avancer_civilisation_gouvernement: 'gouvernement',
    avancer_civilisation_economie: 'economie'
  };
  var CLES_AVANCER_CIVILISATION_ = ['avancer_civilisation'].concat(Object.keys(PISTE_PAR_CLE_AVANCER_CIVILISATION_));

  // Bonus Commerce — 6 bonus fixes du livret. Données de règles statiques,
  // donc sans risque à porter en dur ici (contrairement aux clés secteur/
  // civ, qui dépendent de l'état de la partie).
  var BONUS_COMMERCE = [
    { label: 'Gagnez 3 Influence.', effet: { influence: 3 } },
    { label: 'Activez 1 cube de Puissance Navale.', effet: { activer_cube: 1 } },
    { label: 'Gagnez 2 Crédits ou 2 Science.', effet: { choice: [{ credit: 2 }, { science: 2 }] } },
    { label: 'Gagnez 2 ressources (Nourriture, Énergie et/ou Matériel).', effet: { choice_repeat: { times: 2, options: ['nourriture', 'energie', 'materiel'] } } },
    { label: 'Gagnez un jeton Prime.', effet: { gagner_prime: 1 } },
    { label: 'Gagnez 1 Science.', effet: { science: 1 } }
  ];

  /**
   * Jetons Prime — 11 faces distinctes du jeu physique (retour utilisateur,
   * capture des jetons réels : "le nombre en bleu est le nombre de jeton de
   * chaque type dans la boîte, ne pas prendre en compte" — seul le TEXTE de
   * chaque face compte, pas sa quantité physique). Comme BONUS_COMMERCE
   * ci-dessus, données de règles statiques portées en dur.
   *
   * Puisqu'on ne peut pas tirer un jeton au hasard dans une appli, le
   * joueur choisit LUI-MÊME quelle face il a tirée (popup 'option_exclusive'
   * listant les 11 libellés exacts du jeu physique, voir
   * resoudreGainJetonsPrime_ ci-dessous) puis, pour les faces qui ont
   * elles-mêmes un choix interne ("ou"/"et/ou"), un 2e sous-choix. `effet`
   * de chaque face est un `choice` FocusEngine ordinaire (options à 1 ou
   * plusieurs clés simples, résolues via resoudreOption_/
   * resoudreJsonInterne_, EXACTEMENT comme un `choice` de focus.json) —
   * `inclusif: true` (SEULE la face "Science et/ou Influence") force le
   * mode "et/ou" (options_inclusives) via texteAction='et/ou', les 10
   * autres restant exclusives ("ou" — un seul des 2 côtés).
   */
  var TOKENS_PRIME_ = [
    { label: 'Gagnez 2 Nourriture ou 1 Influence.', effet: { choice: [{ nourriture: 2 }, { influence: 1 }] } },
    { label: 'Gagnez 2 Matériel ou 1 Influence.', effet: { choice: [{ materiel: 2 }, { influence: 1 }] } },
    { label: 'Gagnez 2 Énergie ou 1 Influence.', effet: { choice: [{ energie: 2 }, { influence: 1 }] } },
    { label: 'Gagnez 1 Nourriture et 1 Énergie ou gagnez 1 Influence.', effet: { choice: [{ nourriture: 1, energie: 1 }, { influence: 1 }] } },
    { label: 'Gagnez 1 Nourriture et 1 Science ou gagnez 1 Influence.', effet: { choice: [{ nourriture: 1, science: 1 }, { influence: 1 }] } },
    { label: 'Gagnez 1 Nourriture et 1 Matériel ou gagnez 1 Influence.', effet: { choice: [{ nourriture: 1, materiel: 1 }, { influence: 1 }] } },
    { label: 'Gagnez 1 Énergie et 1 Science ou gagnez 1 Influence.', effet: { choice: [{ energie: 1, science: 1 }, { influence: 1 }] } },
    { label: 'Gagnez 1 Énergie et 1 Matériel ou gagnez 1 Influence.', effet: { choice: [{ energie: 1, materiel: 1 }, { influence: 1 }] } },
    { label: 'Gagnez 1 Matériel et 1 Science ou gagnez 1 Influence.', effet: { choice: [{ materiel: 1, science: 1 }, { influence: 1 }] } },
    { label: 'Gagnez 1 ressource.', effet: { choice: [{ nourriture: 1 }, { energie: 1 }, { materiel: 1 }, { science: 1 }] } },
    { label: 'Gagnez 1 Science et/ou 1 Influence.', effet: { choice: [{ science: 1 }, { influence: 1 }] }, inclusif: true }
  ];

  // Clé "programme_<type>" bare (focus.json, ex. {"choice":["programme_force",
  // "programme_richesse"]}) -> type imposé reconnu par la popup
  // 'gagner_programme' (voir le cas dédié dans resoudreCle_ ci-dessous,
  // même mécanique que "gagner_programme":"force" mais vocabulaire de clé
  // plutôt que de valeur).
  var CLE_PROGRAMME_VERS_TYPE_ = {
    programme_force: 'Force', programme_soutien: 'Soutien',
    programme_domination: 'Domination', programme_richesse: 'Richesse'
  };

  // Gain d'Influence variable "par Guilde/Installation/cube/secteur Pur" :
  // clés dont le montant dépend d'un comptage sur secteursPartie — voir le
  // cas dédié dans resoudreCle_ ci-dessous pour le détail.
  var CLES_INFLUENCE_SECTEUR_ = [
    'influence_par_guilde', 'influence_par_guilde_pure', 'influence_par_guilde_scientifique_pure',
    'influence_par_installation_pure', 'influence_par_cube_secteur_pur', 'influence_par_cube_secteur_pur_et_fiche',
    'influence_par_secteur_pur', 'influence_par_secteur_pur_avec_guilde', 'influence_par_secteur_pur_population_6'
  ];

  var CHAMPS_DIFF_SUIVIS = [
    'ressourceNourriture', 'ressourceEnergie', 'ressourceMateriel',
    'ressourceCredit', 'ressourceScience', 'influence', 'cubeActif',
    'jetonPrime', 'jetonLiberation',
    // EVOLUTION 12 : liste des actions Focus déjà jouées CE cycle (voir
    // resoudreAction ci-dessous) — seul champ TABLEAU de cette liste,
    // d'où le passage de diffChamps_ à une comparaison par CONTENU
    // (JSON.stringify) plutôt que par référence, voir plus bas.
    'actionsFocusUtilisees'
  ];

  // ------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------

  function cloner_(objet) {
    return JSON.parse(JSON.stringify(objet));
  }

  // Comparaison par CONTENU (pas par référence) : `etat` est TOUJOURS un
  // clone JSON de l'état de départ (cloner_ ci-dessus), donc un champ
  // tableau jamais modifié (ex. actionsFocusUtilisees inchangé) a de
  // toute façon une référence différente de l'original — une comparaison
  // `!==` naïve le signalerait à tort comme "modifié" à chaque action.
  // Fonctionne aussi pour les champs scalaires déjà suivis ci-dessus
  // (JSON.stringify(5) !== JSON.stringify(5) est faux, comme 5!==5).
  function diffChamps_(avant, apres) {
    var mutations = [];
    CHAMPS_DIFF_SUIVIS.forEach(function (champ) {
      var valAvant = avant[champ];
      var valApres = apres[champ];
      if (JSON.stringify(valAvant) !== JSON.stringify(valApres)) {
        mutations.push({ champ: champ, avant: valAvant, apres: valApres });
      }
    });
    return mutations;
  }

  function reponseAnnulee_(reponse) {
    return !reponse || reponse.annule === true;
  }

  /**
   * Factorise un motif répété dans resoudreCle_ (construire, augmenter_
   * population_pure, retirer_corruption, gain_corruption, avancer_
   * civilisation, ameliorer_gloire, regrouper) — ouvre une popup dédiée
   * dont le contenu ET la persistance sont gérés entièrement par elle
   * (focusEngine reste pur, aucun accès DB ici), n'annule TOUT l'effet que
   * si la popup est annulée, sinon journalise un résumé.
   * `formatterMessage(reponse)` optionnel pour les popups dont
   * le résumé n'est pas simplement `source + ' : ' + reponse.detail`
   * (ex. "regrouper", qui préfixe avec le nombre de déplacements).
   */
  function demanderChoixEtJournaliser_(contexte, source, journal, demanderChoix, formatterMessage) {
    return Promise.resolve(demanderChoix(contexte)).then(function (reponse) {
      if (reponseAnnulee_(reponse)) return false;
      journal.push(formatterMessage ? formatterMessage(reponse) : (source + ' : ' + reponse.detail));
      return true;
    });
  }

  /**
   * Résout le gain de `n` jeton(s) Prime (retour utilisateur : "chaque
   * jeton prime donne le choix d'une... récompense... en réalité dans le
   * jeu je pioche au hasard un jeton avec le gain écrit dessus") : pour
   * CHAQUE jeton, incrémente `etat.jetonPrime` (le compteur physique,
   * inchangé) PUIS fait choisir au joueur LAQUELLE des 11 faces réelles il
   * a tirée (popup 'option_exclusive', libellés exacts de TOKENS_PRIME_ —
   * voir sa description), et résout l'`effet` (un `choice` FocusEngine
   * ordinaire, éventuellement lui-même 'et/ou' pour la face Science/
   * Influence) de la face choisie via resoudreJsonInterne_ récursivement.
   * Utilisée par la clé "prime"/"gagner_prime" (signe > 0) ci-dessous ET
   * par la clé "envahir"/"envahir_corrompu" plus bas (jetonPrime gagné en
   * cas de victoire) — un seul point d'entrée pour ne jamais dupliquer
   * cette logique. "Annuler" sur N'IMPORTE LEQUEL des jetons bloque TOUT
   * (même règle que choice_repeat) : le compteur jetonPrime déjà incrémenté
   * pour ce jeton EST DÉFAIT (la Promise renvoie false, donc
   * resoudreJsonInterne_ écarte tout l'état muté par resoudreJson_ — voir
   * son en-tête, "ne retourne ses mutations à l'appelant QUE si la
   * résolution complète a réussi").
   */
  function resoudreGainJetonsPrime_(n, source, etat, journal, demanderChoix) {
    var labels = TOKENS_PRIME_.map(function (t) { return t.label; });
    var promise = Promise.resolve(true);
    var _boucle = function (numero) {
      promise = promise.then(function (succesPrecedent) {
        if (succesPrecedent === false) return false;
        return Promise.resolve(demanderChoix({
          type: 'option_exclusive',
          options: labels,
          source: source + (n > 1 ? ' (jeton Prime ' + numero + '/' + n + ')' : ' (jeton Prime)')
        })).then(function (reponse) {
          if (reponseAnnulee_(reponse)) return false;
          etat.jetonPrime = (etat.jetonPrime || 0) + 1;
          var token = TOKENS_PRIME_[reponse.indexChoisi];
          var sourceToken = source + ' (' + token.label + ')';
          return resoudreJsonInterne_(token.effet, 1, sourceToken, token.inclusif ? 'et/ou' : '', etat, journal, demanderChoix);
        });
      });
    };
    for (var i = 1; i <= n; i++) { _boucle(i); }
    return promise;
  }

  // ------------------------------------------------------------
  // Résolution d'une clé Coût/Effet — cœur du moteur.
  // Retourne une Promise<boolean> : true (ou undefined traité comme true)
  // si la clé est résolue et ne bloque pas la suite, false si elle bloque
  // (annulation de TOUT le JSON en cours — voir resoudreJsonInterne_).
  // ------------------------------------------------------------

  function resoudreCle_(cle, valeur, signe, source, texteAction, etat, journal, demanderChoix, jsonParent) {

    // --- Coût en Nourriture/Énergie/Matériel : substitution en Crédit
    // (todo.md, retour utilisateur — docs-rules-Influence-et-ressources.md
    // §2 : "les crédits peuvent être utilisés comme substitut pour une
    // dépense de Nourriture, Énergie, ou Matériel à raison de 1 pour 1"
    // — jamais Science, jamais l'Entretien, hors périmètre de ce cas).
    // Coût UNIQUEMENT (signe < 0) — retour utilisateur explicite (test sur
    // l'écran Test/Feuille d'action, iPhone) : la popup s'ouvre désormais
    // TOUJOURS pour ces 3 ressources, MÊME quand la réserve seule suffit
    // (comportement "systématique", option 1 retenue après avoir évalué
    // le POC limité à une seule carte — Focus Conquête "Préparer" — via
    // l'écran Test). Un GAIN de ces mêmes ressources (Effet, signe > 0 :
    // la substitution n'a de sens que pour une DÉPENSE) et les 5 autres
    // clés simples (credit/science/influence/prime/liberation, jamais
    // substituables) restent hors de ce cas, gérés silencieusement par le
    // repli CLES_SIMPLES ci-dessous. Ouvre une popup dédiée (contexte
    // 'paiement_ressource', strategieService.js) qui laisse le joueur
    // choisir librement la répartition entre la ressource et le Crédit —
    // SANS obligation d'épuiser d'abord la ressource jusqu'à son dernier
    // point (le joueur peut préférer la préserver et payer davantage en
    // Crédit, notamment pour la Nourriture en vue de l'Entretien) ; le
    // montant "à payer en ressource" est pré-rempli au maximum possible
    // mais reste modifiable. "Annuler" bloque le Coût (RÈGLE MÉTIER :
    // "coût annulé après effet déjà réussi", déjà tolérée plus bas dans
    // resoudreAction) — notamment quand ni la ressource ni le Crédit
    // disponible, même combinés, ne suffisent à couvrir le montant. ---
    if (RESSOURCES_SUBSTITUABLES_CREDIT_.indexOf(cle) !== -1 && typeof valeur === 'number' && signe < 0) {
      var champRessourceSubstituable_ = CHAMP_PAR_CLE[cle];
      return Promise.resolve(demanderChoix({
        type: 'paiement_ressource',
        ressource: cle,
        montant: valeur,
        stockRessource: etat[champRessourceSubstituable_],
        stockCredit: etat.ressourceCredit,
        source: source
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        var utiliseRessource = Math.min(valeur, Math.max(0, Math.floor(Number(reponse.utiliseRessource)) || 0));
        var utiliseCredit = valeur - utiliseRessource;
        etat[champRessourceSubstituable_] = Math.max(0, etat[champRessourceSubstituable_] - utiliseRessource);
        etat.ressourceCredit = Math.max(0, etat.ressourceCredit - utiliseCredit);
        journal.push(source + ' : −' + valeur + ' ' + cle +
          (utiliseCredit > 0 ? ' (dont ' + utiliseCredit + ' substitué' + (utiliseCredit > 1 ? 's' : '') + ' par Crédit)' : '') + '.');
        return true;
      });
    }

    // --- Gagner un/des jeton(s) Prime : "prime" (bare, CLES_SIMPLES) et
    // "gagner_prime" (alias rencontré tel quel dans pistesCivilisation.json
    // "Gagnez un/deux jeton(s) Prime." et dans BONUS_COMMERCE ci-dessus,
    // cle gagner_commerce -> popup Bonus Commerce -> resoudreJsonInterne_
    // récursif sur { gagner_prime: 1 }) partagent désormais le MÊME cas
    // dédié — Effet UNIQUEMENT (signe > 0 : un COÛT en jetons Prime,
    // jamais rencontré dans le catalogue, resterait un simple décompte via
    // CLES_SIMPLES ci-dessous). Chantier "gain de jeton Prime" (retour
    // utilisateur, todo.md) : voir resoudreGainJetonsPrime_ ci-dessus pour
    // le détail (incrémente le compteur ET fait choisir une récompense par
    // jeton, parmi les 11 faces réelles du jeu). ---
    if ((cle === 'prime' || cle === 'gagner_prime') && typeof valeur === 'number' && signe > 0) {
      return resoudreGainJetonsPrime_(valeur, source, etat, journal, demanderChoix);
    }

    // --- Ressources/jetons simples (nourriture, energie, materiel,
    // credit, science, influence, prime, liberation) — "prime" en signe > 0
    // est déjà intercepté ci-dessus ; ce repli ne le concerne donc plus que
    // pour un éventuel COÛT (signe < 0, jamais rencontré au catalogue à ce
    // jour). ---
    if (CLES_SIMPLES.indexOf(cle) !== -1 && typeof valeur === 'number') {
      var champ = CHAMP_PAR_CLE[cle];
      etat[champ] = Math.max(0, etat[champ] + signe * valeur);
      journal.push(source + ' : ' + (signe > 0 ? '+' : '−') + valeur + ' ' + cle + '.');
      return Promise.resolve(true);
    }

    // --- gagner_prime en COÛT (signe < 0, jamais rencontré au catalogue à
    // ce jour, conservé par prudence) : simple décompte, aucune récompense
    // (dépenser un jeton Prime n'en fait pas gagner un). ---
    if (cle === 'gagner_prime' && typeof valeur === 'number') {
      etat.jetonPrime = Math.max(0, etat.jetonPrime + signe * valeur);
      journal.push(source + ' : ' + (signe > 0 ? '+' : '−') + valeur + ' prime.');
      return Promise.resolve(true);
    }

    // --- Gagner de l'Influence : "valeur totale de Gloire" — Effet
    // UNIQUEMENT (signe > 0, comme le reste des gains d'Influence
    // variable ci-dessous). `etat.gloire` (array de 5 cases, null ou
    // valeur du jeton posé) est déjà présent sur `etat` (= la ligne
    // plateauMaison brute, voir focusEngine.resoudreEffet plus bas) :
    // résolue entièrement ICI, en pur, contrairement aux formules "par
    // secteur" plus bas (nécessitent SecteurService, donc demanderChoix). ---
    if (cle === 'influence_valeur_gloire' && signe > 0) {
      var sommeGloire = (etat.gloire || []).reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
      etat.influence = Math.max(0, etat.influence + sommeGloire);
      journal.push(source + ' : +' + sommeGloire + ' influence (valeur totale de Gloire).');
      return Promise.resolve(true);
    }

    // --- Gagner de l'Influence : "N par Technologie améliorée" — Effet
    // UNIQUEMENT (signe > 0). Comme influence_valeur_gloire ci-dessus,
    // entièrement résolue en pur : les 3 sources de Technologies
    // possédées (départ, 5 emplacements obtenus, 4 avancées choisies)
    // sont TOUTES des champs plateauMaison bruts déjà présents sur `etat`
    // (technologieDepart/technologieDepartAmelioree — GameService.
    // definirTechnologieAmelioree ; technologiesObtenues[].amelioree —
    // même fonction, cible=index ; technologiesAvanceesChoisies +
    // technologiesAvanceesAmeliorees[nom] — GameService.
    // definirTechnologieAvanceeAmelioree), aucun accès DB nécessaire. ---
    if (cle === 'influence_par_technologie_amelioree' && signe > 0 && typeof valeur === 'number') {
      var nombreTechnologiesAmeliorees = 0;
      if (etat.technologieDepart && etat.technologieDepartAmelioree) nombreTechnologiesAmeliorees++;
      (etat.technologiesObtenues || []).forEach(function (t) { if (t && t.amelioree) nombreTechnologiesAmeliorees++; });
      (etat.technologiesAvanceesChoisies || []).forEach(function (nom) {
        if (nom && etat.technologiesAvanceesAmeliorees && etat.technologiesAvanceesAmeliorees[nom]) nombreTechnologiesAmeliorees++;
      });
      var gainTechnologiesAmeliorees = valeur * nombreTechnologiesAmeliorees;
      etat.influence = Math.max(0, etat.influence + gainTechnologiesAmeliorees);
      journal.push(source + ' : +' + gainTechnologiesAmeliorees + ' influence (' + nombreTechnologiesAmeliorees + ' technologie(s) améliorée(s) × ' + valeur + ').');
      return Promise.resolve(true);
    }

    // --- Gagner de l'Influence : formules "N par Guilde/Installation/
    // cube/secteur Pur" — Effet UNIQUEMENT (signe > 0). Contrairement aux
    // 2 cas ci-dessus, nécessitent un comptage sur secteursPartie
    // (SecteurService.obtenirAgregatsInfluenceSecteursPurs, secteurService.js
    // v12) — hors de portée de focusEngine (pur, aucun accès DB) : ouvre
    // une popup dédiée (contexte 'influence_secteur', strategieService.js)
    // qui calcule le montant ET l'affiche brièvement (aucun choix
    // utilisateur, juste un calcul déterministe — même principe que la
    // résolution directe "une seule piste éligible" de retirer_corruption/
    // gagner_corruption ci-dessous, qui ferme la popup sans interaction).
    // "influence_par_guilde" a une forme différente des 8 autres : `valeur`
    // est un tableau de clés Guilde ("scientifique_pur", "banquier_pur"...)
    // plutôt qu'un nombre — chaque Guilde valant implicitement 1 Influence,
    // transmis tel quel à la popup qui sait l'interpréter. ---
    if (CLES_INFLUENCE_SECTEUR_.indexOf(cle) !== -1 && signe > 0) {
      return Promise.resolve(demanderChoix({
        type: 'influence_secteur',
        formule: cle,
        valeur: valeur,
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        etat.influence = Math.max(0, etat.influence + (Number(reponse.montant) || 0));
        journal.push(source + ' : ' + reponse.detail);
        return true;
      });
    }

    // --- Déploiement de cube (Effet UNIQUEMENT — signe > 0 : côté Coût,
    // ces clés retombent sur le traitement générique "cube" ci-dessous,
    // cas non prévu par le livret). Ouvre une popup dédiée (mode selon la
    // clé — voir MODE_PAR_CLE_DEPLOYER_CUBE) qui choisit secteur(s)/
    // type(s)/quantité(s) et persiste via SecteurService.deployerCube (un
    // appel par ligne engagée, fait CÔTÉ POPUP — DOM, voir
    // strategieService.js). La consommation de Cube actif et le coût en
    // ressources (Cuirassé/Porte-Vaisseau) sont en revanche appliqués ICI,
    // sur l'état pur, pour rester cohérents avec le reste du moteur
    // (diff/annulation) plutôt que d'être écrits directement par la
    // popup. ---
    if (CLES_DEPLOYER_CUBE.indexOf(cle) !== -1 && typeof valeur === 'number' && signe > 0) {
      return Promise.resolve(demanderChoix({
        type: 'deployer_cube',
        mode: MODE_PAR_CLE_DEPLOYER_CUBE[cle],
        quantiteDemandee: valeur,
        source: source,
        partieId: etat.partieId,
        cubeActif: etat.cubeActif,
        ressourceMateriel: etat.ressourceMateriel,
        ressourceNourriture: etat.ressourceNourriture
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        var totalCubes = Number(reponse.totalCubes) || 0;
        etat.cubeActif = Math.max(0, etat.cubeActif - totalCubes);
        var coutParRessource = reponse.coutParRessource || {};
        Object.keys(coutParRessource).forEach(function (r) {
          var champRessource = CHAMP_PAR_CLE[r];
          if (champRessource) etat[champRessource] = Math.max(0, etat[champRessource] - coutParRessource[r]);
        });
        journal.push(source + ' : Déployer — ' + reponse.detail +
          (Object.keys(coutParRessource).length
            ? ' (coût : ' + Object.keys(coutParRessource).map(function (r) { return coutParRessource[r] + ' ' + r; }).join(', ') + ')'
            : '') + '.');
        return true;
      });
    }

    // --- Rappeler un cube (EVOLUTION 13, todo.md) : Coût UNIQUEMENT
    // (signe < 0 — ex. Focus Développement "Installer" Standard,
    // cout: {rappeler_cube:1}, 7 autres cartes du catalogue partagent ce
    // même coût). Doit être testée AVANT le repli générique "toute clé
    // contenant cube" plus bas (qui déciderait sinon, à tort, de décrémenter
    // cubeActif — un rappel de cube AJOUTE à la zone active depuis un
    // secteur, il ne consomme pas un cube déjà actif). Ouvre une popup
    // dédiée (contexte 'rappeler_cube_cout', strategieService.js)
    // DISTINCTE de la popup 'rappeler_cube' déjà existante (option "recall"
    // d'un Cadre d'Événement, un EFFET, sans cette restriction) : ne
    // propose QUE les secteurs qui ne seraient PAS abandonnés par ce rappel
    // (Secteur-Mère à part, toujours éligible) — voir docs-rules-flottes.md
    // §1.5/§4 : rappeler le dernier cube d'un secteur hors Secteur-Mère
    // l'abandonne et coûte un jeton Gloire, mécanique délibérément non
    // modélisée ici (choix du TODO). La popup fait le choix ET la
    // persistance (comme construire/regrouper/envahir ci-dessous —
    // focusEngine reste pur, aucun accès DB ici) ; resoudreCle_ relaie
    // juste le résumé dans le journal. "Annuler" bloque toute l'action
    // (même règle que les autres popups de coût/effet). ---
    if (cle === 'rappeler_cube' && signe < 0) {
      return demanderChoixEtJournaliser_({
        type: 'rappeler_cube_cout',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Construire une Installation / Établir une Guilde : Effet
    // UNIQUEMENT (signe > 0 — aucune clé de ce catalogue ne les utilise
    // comme Coût à ce jour ; une "détruire" éventuelle est une clé séparée,
    // déjà hors périmètre, voir "detruire" dans le repli générique).
    // Ouvre une popup dédiée (secteur possédé avec un emplacement libre
    // pour la catégorie + type au choix, voir contexte.type === 'construire'
    // de strategieService.js) qui appelle directement SecteurService.
    // construire et persiste en IndexedDB AU MOMENT de la validation (comme
    // regrouper/envahir/deployer_cube ci-dessus — focusEngine reste pur,
    // aucun accès DB ici). "installation"/"guilde" (formes courtes, sans
    // préfixe verbe, rencontrées dans des tableaux "choice") sont les mêmes
    // clés que "construire_installation"/"etablir_guilde". ---
    if (CLES_CONSTRUIRE.indexOf(cle) !== -1 && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'construire',
        categorie: CATEGORIE_PAR_CLE_CONSTRUIRE_[cle],
        typeForce: TYPE_FORCE_PAR_CLE_CONSTRUIRE_[cle],
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Augmenter une Population Pure : Effet UNIQUEMENT (signe > 0).
    // Ouvre une popup dédiée (secteur possédé, non Corrompu, Population < 6
    // — voir SecteurService.obtenirSecteursEligiblesAugmenterPopulationPure)
    // qui appelle directement SecteurService.augmenterPopulationPure et
    // persiste en IndexedDB AU MOMENT de la validation (même pattern que
    // construire/regrouper/envahir ci-dessus — focusEngine reste pur,
    // aucun accès DB ici).
    //
    // "augmenter_population" (SANS "_pure") est reconnue au même titre que
    // "augmenter_population_pure" : c'est la clé utilisée par data/
    // catalogue/pistesCivilisation.json ET focus.json (jamais "_pure",
    // forme réservée au seul catalogue evenements.json) — la mécanique est
    // IDENTIQUE (secteur Pur, Population < 6, même popup). Comme
    // CivilisationService.avancerPiste ET FocusEngine.jouerActionEtPersister
    // (actions Focus) délèguent tous deux à CE même resoudreCle_, ce point
    // unique couvre les 2 usages ("piste civilisation ou focus") sans code
    // spécifique à l'un ou l'autre. "augmenter_population_up_to" (variante
    // "jusqu'à N fois" du catalogue focus.json) reste HORS PÉRIMÈTRE —
    // comme les autres variantes _up_to/_meme_secteur déjà notées plus
    // haut dans ce fichier — et retombe donc sur le repli générique,
    // journalisé en avertissement. ---
    if ((cle === 'augmenter_population_pure' || cle === 'augmenter_population') && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'augmenter_population_pure',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Retirer une Corruption : Effet UNIQUEMENT (signe > 0). Ouvre une
    // popup dédiée (contexte 'retirer_corruption', strategieService.js)
    // qui laisse le joueur choisir PARMI JUSQU'À 4 cibles possibles :
    // un Secteur qu'il possède et Corrompu
    // (SecteurService.obtenirSecteursEligiblesRetraitCorruption/
    // retirerCorruption), une piste de Civilisation actuellement
    // Corrompue s'il y en a au moins une (CivilisationService.
    // definirCorruption(..., false) — PAS avancerPisteCorrompue, mécanique
    // différente), un Programme (toujours proposé, non automatisé — la
    // Corruption d'un Programme n'est pas suivie en base, résolution
    // manuelle comme le reste des Programmes), ou la Technologie "Chambres
    // de décontamination" si le joueur la possède ET qu'elle stocke au
    // moins 1 Corruption (nouveau jeton manuel corruptionChambreDecontamination,
    // voir gameService.js/strategieService.js). La popup fait le choix ET
    // la persistance (comme construire/regrouper/envahir/augmenter_
    // population_pure ci-dessus — focusEngine reste pur, aucun accès DB
    // ici) ; resoudreCle_ relaie juste le résumé dans le journal. ---
    if (cle === 'retirer_corruption' && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'retirer_corruption',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Gagner une Corruption : Effet UNIQUEMENT (signe > 0). Miroir de
    // retirer_corruption ci-dessus — ouvre une popup dédiée (contexte
    // 'gagner_corruption', strategieService.js) qui laisse le joueur
    // choisir PARMI les cibles éligibles (voir docs-rules-corruption-
    // gardiens-refuges-technoConsume.md §1) : un Secteur qu'il possède,
    // Pur et non immunisé (SecteurService.obtenirSecteursEligiblesGainCorruption/
    // placerCorruption), une piste de Civilisation pas encore Corrompue
    // (CivilisationService.definirCorruption(..., true)), un Programme
    // (toujours proposé, non automatisé — même limitation que
    // retirer_corruption, la Corruption d'un Programme n'étant pas suivie
    // en base), ou la Technologie "Chambres de décontamination" si le
    // joueur la possède ET qu'il reste au moins un emplacement libre (2,
    // 3 si améliorée — plateauMaison.corruptionChambreDecontamination).
    // Catalogue vérifié : "gain_corruption" n'apparaît jamais avec une
    // valeur > 1 (contrairement à certains Cadres d'Événement galactique,
    // hors périmètre de focusEngine.js — voir GameService.
    // appliquerCadreGainCorruption, qui réutilise la même popup avec des
    // cibles restreintes/un repli issus du catalogue). La popup fait le
    // choix ET la persistance (focusEngine reste pur, aucun accès DB
    // ici) ; resoudreCle_ relaie juste le résumé dans le journal. ---
    if (cle === 'gain_corruption' && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'gagner_corruption',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Déplacer une Corruption (EVOLUTION 10) : Effet UNIQUEMENT (signe
    // > 0). Ouvre une popup dédiée à 2 étapes (contexte
    // 'deplacer_corruption', strategieService.js) : la SOURCE (menu
    // identique à 'retirer_corruption' ci-dessus — Secteur/Piste/
    // Programme/Technologie Chambres de décontamination Corrompus), puis
    // la DESTINATION (menu identique à 'gagner_corruption' — calculé
    // AVANT toute écriture, donc excluant naturellement la source, qui
    // reste Corrompue tant qu'on n'a pas validé). Même contrat
    // d'annulation que retirer_corruption/gagner_corruption : la popup
    // fait le choix ET la persistance (focusEngine reste pur, aucun
    // accès DB ici), et l'annulation à n'importe quelle étape bloque
    // TOUTE l'action (coût jamais débité) — cf. reponseAnnulee_.
    // resoudreCle_ relaie juste le résumé dans le journal. ---
    if (cle === 'deplacer_corruption' && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'deplacer_corruption',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Avancer sur une piste de Civilisation : Effet UNIQUEMENT (signe
    // > 0). Ouvre une popup dédiée (contexte 'avancer_civilisation',
    // strategieService.js) qui affiche, pour la ou les piste(s) candidate(s)
    // — piste imposée (PISTE_PAR_CLE_AVANCER_CIVILISATION_) OU au choix
    // (contexte.piste === null, "avancer_civilisation") — le niveau actuel
    // (X/NIVEAU_MAX) et un aperçu de la PROCHAINE case, avant
    // Annuler/Valider. À la validation, la popup appelle directement
    // CivilisationService.avancerPiste (persistance ET résolution de
    // l'effet de la nouvelle case atteinte, laquelle PEUT À SON TOUR
    // ouvrir une ou plusieurs popups imbriquées — demanderChoix relayé tel
    // quel par avancerPiste, comme pour n'importe quel autre effet : choix
    // "et/ou", rappel manuel, retirer_corruption, avance_rapide — déjà
    // tous gérés par avancerPiste elle-même, aucun code supplémentaire
    // nécessaire ici pour cet enchaînement). Comme construire/retirer_
    // corruption ci-dessus, la popup fait le choix ET la persistance
    // (focusEngine reste pur, aucun accès DB ici) ; resoudreCle_ relaie
    // juste le résumé dans le journal. ---
    if (CLES_AVANCER_CIVILISATION_.indexOf(cle) !== -1 && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'avancer_civilisation',
        piste: PISTE_PAR_CLE_AVANCER_CIVILISATION_[cle] || null,
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Avancer sur la piste de Civilisation la MOINS avancée : Effet
    // UNIQUEMENT (signe > 0). Réutilise la MÊME popup 'avancer_civilisation'
    // que ci-dessus (contexte.moinsAvancee:true plutôt que contexte.piste
    // imposé) — la popup calcule elle-même quelle piste est la moins
    // avancée (identique au tri de CivilisationService.
    // avancerPisteMoinsAvancee, js/civilisationService.js) puis se
    // comporte comme le mode "piste imposée" ci-dessus. Utilisée par
    // l'action de Programme de type Force (voir gameService.js,
    // EFFET_PROGRAMME_PAR_TYPE_) et par le Focus Héroïque Renfort
    // "Accélérer" (focus.json id 106).
    //
    // `tie_break: "au_choix"` (todo.md, retour utilisateur) : clé SŒUR
    // facultative, dans le MÊME objet JSON que cette clé (ex. focus.json
    // id 106 : `{tie_break:"au_choix", avancer_civilisation_moins_avancee:1}`)
    // — lue ici via `jsonParent` (voir resoudreJsonInterne_ ci-dessus).
    // Quand elle vaut "au_choix", la popup laisse le joueur choisir PARMI
    // les pistes À ÉGALITÉ pour la moins avancée, plutôt que de retomber
    // silencieusement sur l'ordre fixe Société > Gouvernement > Économie
    // (comportement par défaut, inchangé, pour tout appelant SANS ce
    // marqueur — ex. l'action de Programme Force ci-dessus, qui le porte
    // désormais elle aussi, son texte imprimé disant lui aussi "au choix
    // si égalité"). Répare le bug rapporté : sur Renfort "Accélérer",
    // seule la piste la mieux placée dans cet ordre fixe (ex. Gouvernement)
    // était proposée même quand Économie était À ÉGALITÉ. ---
    if (cle === 'avancer_civilisation_moins_avancee' && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'avancer_civilisation',
        piste: null,
        moinsAvancee: true,
        tieBreakAuChoix: !!(jsonParent && jsonParent.tie_break === 'au_choix'),
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Améliorer un jeton Gloire : Effet UNIQUEMENT (signe > 0). Aucun
    // choix utilisateur — cible TOUJOURS le jeton Gloire de plus petite
    // valeur parmi ceux posés sur la fiche Maison (règle : incrémente d'1,
    // plafonné à 5), même principe de résolution déterministe que
    // "influence_secteur" ci-dessus. Le jeton Gloire (array, 5 emplacements)
    // n'est PAS suivi par CHAMPS_DIFF_SUIVIS (non diffable par ce moteur au
    // clone JSON, voir plus haut) : la popup dédiée (contexte
    // 'ameliorer_gloire', strategieService.js) fait donc le calcul ET la
    // persistance directement (comme retirer_corruption/avancer_civilisation
    // ci-dessus) ; resoudreCle_ relaie juste le résumé dans le journal.
    // S'il n'existe aucun jeton Gloire améliorable (aucun posé, ou tous déjà
    // à la valeur maximale 5), la popup annule l'effet entier (comme
    // n'importe quel autre effet bloquant faute de cible).
    if (cle === 'ameliorer_gloire' && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'ameliorer_gloire',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Défausser un jeton Gloire : Coût UNIQUEMENT (signe < 0) — ex.
    // Focus Progrès Héroïque "Restaurer" (focus.json id 102) et
    // Commandement Héroïque "Utiliser" (id 92), tous deux
    // cout:{defausser_gloire:1}. AUCUN choix utilisateur (retour
    // utilisateur, todo.md) : cible TOUJOURS le jeton Gloire de plus
    // PETITE valeur posé sur la fiche Maison — miroir de "ameliorer_gloire"
    // ci-dessus (même détermination déterministe, plus petite valeur),
    // mais pour le RETIRER plutôt que l'améliorer : contrairement à
    // ameliorer_gloire, aucun plafond ici, un jeton déjà à 5 reste
    // éligible à la défausse. Le jeton Gloire (array, 5 emplacements)
    // n'est PAS suivi par CHAMPS_DIFF_SUIVIS (non diffable par ce moteur
    // au clone JSON) : la popup dédiée (contexte 'defausser_gloire',
    // strategieService.js) fait donc le calcul ET la persistance
    // directement (comme ameliorer_gloire ci-dessus) ; resoudreCle_ relaie
    // juste le résumé dans le journal. Si aucun jeton Gloire n'est posé,
    // la popup annule l'action entière (comme n'importe quel autre coût
    // bloquant faute de cible). ---
    if (cle === 'defausser_gloire' && signe < 0) {
      return demanderChoixEtJournaliser_({
        type: 'defausser_gloire',
        source: source,
        partieId: etat.partieId
      }, source, journal, demanderChoix);
    }

    // --- Gagner un Programme : Effet UNIQUEMENT (signe > 0). Deux
    // vocabulaires rencontrés dans le catalogue pour la même mécanique :
    // "gagner_programme" avec une valeur numérique 1 (tous types ouverts)
    // ou une chaîne de type ("force"/"soutien"/"domination"/"richesse",
    // pistesCivilisation.json) ; ou une clé "programme_force"/
    // "programme_richesse"/etc. bare (focus.json, un type imposé par
    // clé plutôt que par valeur — CLE_PROGRAMME_VERS_TYPE_ ci-dessus).
    // Ouvre une popup dédiée (contexte 'gagner_programme',
    // strategieService.js) qui liste tous les Programmes du catalogue
    // (filtrés sur `typeImpose` le cas échéant, offre publique mise en
    // évidence) et fait le choix ET la persistance (comme retirer_
    // corruption/ameliorer_gloire ci-dessus — focusEngine reste pur,
    // aucun accès DB ici) ; resoudreCle_ relaie juste le résumé dans le
    // journal. ---
    if (cle === 'gagner_programme' && signe > 0) {
      var typeImposeValeur = (typeof valeur === 'string' && valeur)
        ? valeur.charAt(0).toUpperCase() + valeur.slice(1).toLowerCase()
        : null;
      return demanderChoixEtJournaliser_({
        type: 'gagner_programme',
        source: source,
        partieId: etat.partieId,
        typeImpose: typeImposeValeur
      }, source, journal, demanderChoix);
    }
    if (CLE_PROGRAMME_VERS_TYPE_[cle] && signe > 0) {
      return demanderChoixEtJournaliser_({
        type: 'gagner_programme',
        source: source,
        partieId: etat.partieId,
        typeImpose: CLE_PROGRAMME_VERS_TYPE_[cle]
      }, source, journal, demanderChoix);
    }

    // --- Gagner une Technologie : Effet UNIQUEMENT (signe > 0). `valeur`
    // = "base" (chaîne, niveau imposé, aucun choix de niveau) ou un
    // tableau de niveaux possibles (ex. ["base","amelioree"], Focus
    // Innovation "Inventer" — le joueur choisit le niveau au moment même
    // où il l'invente. Ceci COURT-CIRCUITE délibérément la restriction
    // habituelle "Technologies avancées" (GameService.
    // obtenirTechnologiesAvanceesGroupes — case Améliorée verrouillée
    // hors du bon cycle) : cette clé accorde le niveau choisi
    // immédiatement, quel que soit le cycle en cours — pas un bug, c'est
    // exactement ce que "gagner_technologie":["base","amelioree"]
    // signifie dans le catalogue). Ouvre une popup dédiée (contexte
    // 'gagner_technologie', strategieService.js) qui liste les
    // technologies encore disponibles parmi les 4 maisons déchues (celles
    // pas déjà occupant un des 5 emplacements "Technologies obtenues") et
    // fait le choix ET la persistance (GameService.choisirTechnologieObtenue
    // puis, si "amelioree" est proposé et retenu,
    // GameService.definirTechnologieAmelioree) — focusEngine reste pur,
    // aucun accès DB ici. Si aucun emplacement libre ou aucune technologie
    // disponible, la popup l'affiche et bloque (Annuler). ---
    if (cle === 'gagner_technologie' && signe > 0) {
      var niveauxTech = Array.isArray(valeur) ? valeur : (typeof valeur === 'string' && valeur ? [valeur] : ['base']);
      return demanderChoixEtJournaliser_({
        type: 'gagner_technologie',
        source: source,
        partieId: etat.partieId,
        niveaux: niveauxTech
      }, source, journal, demanderChoix);
    }

    // --- Focus préféré : "action_focus_prefere"/"copy_action" (2 noms de
    // clé DIFFÉRENTS au catalogue pour la MÊME mécanique — vérifié champ
    // par champ, toujours {payer_cout/pay_cost:true, emplacement/
    // location:["main"/"hand","defausse"/"discard"]}, jamais d'autre
    // combinaison) : "Faites une action d'un Focus préféré de votre main
    // ou défausse (en payant son coût et en résolvant ses effets)" — voir
    // docs-rules-programmes-FocusPrefere-ConsulterEvenement.md §2. Effet
    // UNIQUEMENT (signe > 0, jamais rencontré en Coût sur tout le
    // catalogue). "Main ou défausse" n'a pas d'équivalent dans l'appli
    // (aucune pioche/défausse de cartes Focus modélisée, voir mémoire de
    // session voidfall-focus-prefere-report.md) — traité comme "n'importe
    // laquelle des cartes Focus préférées du joueur", toujours la version
    // spécifique à sa Maison si elle existe (règle explicite : "Si l'un
    // de vos Focus préférés est aussi une carte spécifique à votre
    // Maison, résolvez [...] comme indiqué sur votre carte Focus plutôt
    // que sur la version standard").
    //
    // Popup dédiée (contexte 'action_focus_prefere', strategieService.js)
    // qui fait TOUT le travail hors de portée de ce moteur pur (accès
    // maisons.json/focusPrefere + FocusService.obtenirMiseEnPlace_, choix
    // du joueur parmi les actions des 2 cartes préférées) et résout avec
    // l'action COMPLÈTE choisie ({carte, action, cout, effet, texte}),
    // PAS juste un indexChoisi — reste alors à résoudre cette action
    // elle-même : delegue à resoudreEffetEtCout (même moteur, MÊME `etat`
    // en cours plutôt qu'un clone séparé — ÉVITE tout risque d'écrasement
    // avec le reste de CETTE résolution, contrairement à un aller-retour
    // DB séparé comme gagner_technologie ci-dessus, dont les champs ne se
    // recoupent jamais avec le reste du moteur ; ici n'importe quel champ
    // peut être touché par l'action choisie). "Vous devez tout de même
    // payer le coût" (de l'action CHOISIE) : resoudreEffetEtCout paie
    // aussi bien l'Effet que le Coût de cette action nichée. "Faire une
    // action de cette manière ne compte pas comme résoudre ce Focus" :
    // automatiquement respecté — cette délégation ne passe PAS par
    // resoudreAction (le seul endroit qui alimente actionsFocusUtilisees,
    // EVOLUTION 12), et aucun mécanisme Programme/jeton Commerce
    // "déclenché par la résolution d'un Focus" n'est modélisé par
    // l'appli — rien à exclure explicitement. Un "Annuler" à N'IMPORTE
    // quelle étape (choix de l'action, ou plus loin dans SA propre
    // résolution) bloque TOUTE cette clé (même règle que "choice"
    // ci-dessus), donc potentiellement toute l'action englobante. ---
    if ((cle === 'action_focus_prefere' || cle === 'copy_action') && signe > 0) {
      return Promise.resolve(demanderChoix({
        type: 'action_focus_prefere',
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        var sourceNichee = source + ' (Focus préféré — ' + reponse.carte + ' — ' + reponse.action + ')';
        return resoudreEffetEtCout(etat, reponse.effet, reponse.cout, sourceNichee, demanderChoix).then(function (resultat) {
          Object.assign(etat, resultat.etatResultat);
          Array.prototype.push.apply(journal, resultat.journal);
          return resultat.succes;
        });
      });
    }

    // --- Toute autre clé contenant "cube" (ex. activer_cube, cube) :
    // n'agit QUE sur cubeActif (seul champ Cube persisté côté plateauMaison
    // PWA — cubeInactif/cubeDeploye sont dérivés des secteurs, non stockés
    // ici). Un coût qui dépasserait cubeActif est appliqué jusqu'à 0 et
    // signalé, plutôt que de deviner une consommation de cubes déployés. ---
    if (cle.toLowerCase().indexOf('cube') !== -1 && typeof valeur === 'number') {
      if (signe > 0) {
        var nouveauCubeActif = Math.min(NB_CUBES_TOTAL, etat.cubeActif + valeur);
        etat.cubeActif = nouveauCubeActif;
        journal.push(source + ' : +' + valeur + ' cube(s) activé(s).');
      } else {
        var pris = Math.min(etat.cubeActif, valeur);
        etat.cubeActif -= pris;
        var reste = valeur - pris;
        if (reste > 0) {
          journal.push(source + ' : ' + pris + ' cube(s) actif(s) consommé(s) — ' + reste + ' restant(s) à couvrir manuellement (cubes déployés non gérés par ce moteur).');
        } else {
          journal.push(source + ' : ' + pris + ' cube(s) actif(s) consommé(s).');
        }
      }
      return Promise.resolve(true);
    }

    // --- ressource_choix : N unités au choix parmi les 5 ressources de
    // production (pas Influence/Commerce). Ne bloque jamais (pas de bouton
    // "Annuler" pour cette popup). ---
    if (cle === 'ressource_choix' && typeof valeur === 'number') {
      return Promise.resolve(demanderChoix({ type: 'ressource_choix', nombre: valeur, signe: signe, source: source })).then(function (reponse) {
        var choisies = Array.isArray(reponse) ? reponse.slice(0, valeur) : [];
        choisies.forEach(function (cleRessource) {
          if (RESSOURCES_PRODUCTION.indexOf(cleRessource) === -1) return;
          var champProduction = CHAMP_PAR_CLE[cleRessource];
          etat[champProduction] = Math.max(0, etat[champProduction] + signe);
          journal.push(source + ' : ' + (signe > 0 ? '+1 ' : '−1 ') + cleRessource + ' (au choix).');
        });
        return true;
      });
    }

    // --- choice / choix : liste d'options (chaînes ou fragments JSON).
    // Exclusif (un seul choix, peut bloquer si annulé) OU, si le Texte de
    // l'action contient "et/ou", inclusif (sélection multiple des
    // options à résoudre — laquelle "options_inclusives" détermine, PAS
    // le contenu de cette réponse). Dans LES DEUX CAS, un "Annuler" sur
    // N'IMPORTE quelle option nichée bloque TOUTE l'action — EVOLUTION 11
    // (todo.md, retour utilisateur : Focus Conquête "Planifier", et/ou
    // "gagner_programme"/"deplacer_corruption" — sélectionner les 2 puis
    // Annuler la popup de programme débitait quand même le Coût). Ce
    // comportement est celui documenté en RÈGLE MÉTIER en tête de
    // fichier ("un blocage à N'IMPORTE quelle clé annule bien la
    // totalité du JSON en cours") — la version précédente de cette
    // branche inclusive l'enfreignait délibérément ("tolérant"), ce qui
    // était le bug : `resoudreJsonInterne_` (qui appelle `resoudreCle_`
    // ci-dessous) et `resoudreJson_` n'ont AUCUN moyen de savoir qu'une
    // option nichée a échoué si cette fonction retourne toujours `true`
    // — le Coût de l'action entière est alors débité à tort. ---
    if ((cle === 'choice' || cle === 'choix') && Array.isArray(valeur)) {
      var inclusif = String(texteAction || '').indexOf('et/ou') !== -1;

      if (!inclusif) {
        return Promise.resolve(demanderChoix({ type: 'option_exclusive', options: valeur, source: source })).then(function (reponse) {
          if (reponseAnnulee_(reponse)) return false;
          var option = valeur[reponse.indexChoisi];
          return resoudreOption_(option, signe, source, etat, journal, demanderChoix);
        });
      }

      return Promise.resolve(demanderChoix({ type: 'options_inclusives', options: valeur, source: source })).then(function (reponse) {
        var indices = Array.isArray(reponse) ? reponse : [];
        return indices.reduce(function (promesse, indexOption) {
          return promesse.then(function (succesPrecedent) {
            if (succesPrecedent === false) return false;
            return resoudreOption_(valeur[indexOption], signe, source, etat, journal, demanderChoix);
          });
        }, Promise.resolve(true));
      });
    }

    // --- choice_repeat : { times, options } — répète un choix exclusif
    // `times` fois ; un "Annuler" sur n'importe quel tour arrête les tours
    // restants et bloque toute l'action. ---
    if (cle === 'choice_repeat' && valeur && Array.isArray(valeur.options)) {
      var fois = valeur.times || 1;
      var tourPromise = Promise.resolve(true);
      var _boucle = function (numero) {
        tourPromise = tourPromise.then(function (succesPrecedent) {
          if (succesPrecedent === false) return false;
          return Promise.resolve(demanderChoix({ type: 'option_exclusive', options: valeur.options, source: source + ' (choix ' + numero + '/' + fois + ')' })).then(function (reponse) {
            if (reponseAnnulee_(reponse)) return false;
            return resoudreOption_(valeur.options[reponse.indexChoisi], signe, source, etat, journal, demanderChoix);
          });
        });
      };
      for (var i = 1; i <= fois; i++) { _boucle(i); }
      return tourPromise;
    }

    // --- Bonus Commerce : le joueur choisit 1 des 6 bonus fixes, résolu
    // récursivement (peut lui-même contenir choice/choice_repeat). ---
    if (cle === 'gagner_commerce') {
      var optionsLabels = BONUS_COMMERCE.map(function (b) { return b.label; });
      return Promise.resolve(demanderChoix({ type: 'bonus_commerce', options: optionsLabels, source: source })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        var bonus = BONUS_COMMERCE[reponse.indexChoisi];
        return resoudreJsonInterne_(bonus.effet, signe, source + ' (Bonus Commerce)', bonus.label, etat, journal, demanderChoix);
      });
    }

    // --- Regrouper : déplacement de Puissance Navale entre secteurs
    // adjacents (jusqu'à 5 déplacements au total). SecteurService.regrouper
    // persiste directement en IndexedDB — appelé par la popup elle-même
    // (implémentation DOM de demanderChoix, voir strategieService.js) au
    // moment de la validation, PAS ici (focusEngine reste pur, aucun accès
    // DB). resoudreCle_ se contente de relayer le résumé dans le journal.
    // "Annuler" bloque toute l'action (même règle que "choice"/
    // "choice_repeat" ci-dessus). ---
    if (cle === 'regrouper' || cle === 'regroupe') {
      return demanderChoixEtJournaliser_({ type: 'regrouper', source: source, partieId: etat.partieId }, source, journal, demanderChoix, function (reponse) {
        return source + ' : Regrouper — ' + reponse.deplacements + ' déplacement(s) (' + reponse.detail + ').';
      });
    }

    // --- Envahir / Envahir un secteur Corrompu : sélection de la cible
    // et engagement de sources, combat résolu via
    // CombatService.resoudreInvasion puis persisté via
    // SecteurService.envahirResoudre — tout cela dans la popup (DOM, voir
    // strategieService.js), pas ici (focusEngine reste pur). "Annuler"
    // bloque toute l'action. Conséquences SCALAIRES (jetonPrime/
    // jetonLiberation/influence en victoire, cubeActif TOUJOURS — voir
    // EVOLUTION 16 ci-dessous, clampé à NB_CUBES_TOTAL) appliquées ICI sur
    // l'état pur — le jeton Gloire (array, non diffable par ce moteur au
    // clone JSON) est en revanche persisté DIRECTEMENT par la popup (même
    // pattern que le clic manuel sur un emplacement Gloire côté écran
    // Stratégie), l'Influence gagnée depuis son total étant calculée
    // là-bas et simplement relayée ici en scalaire. HORS PÉRIMÈTRE
    // (journalisé en avertissement le cas échéant, à traiter
    // manuellement) : défausse d'un jeton Gloire pour un secteur source
    // abandonné (repris par le Néant). jetonLiberation gagné reste un
    // simple compteur (CLES_SIMPLES), sa résolution immédiate (dépense)
    // n'est pas automatisée. jetonPrime gagné, LUI, délègue désormais à
    // resoudreGainJetonsPrime_ (chantier "gain de jeton Prime", todo.md) —
    // plus un simple compteur, voir plus bas.
    //
    // EVOLUTION 16 (todo.md, docs-rules-flottes.md §1.5 : "subir des
    // Dégâts au Combat" = rappeler 1 cube vers la zone active) :
    // `reponse.cubesPerdus` (calculé par la popup — totalEngage moins les
    // survivants exacts de CombatService.resoudreInvasion) revient
    // TOUJOURS en Cube actif, victoire ou défaite — pas seulement en
    // défaite comme avant cette évolution (les cubes perdus au cours d'un
    // combat gagné disparaissaient jusqu'ici du suivi sans jamais revenir
    // en Cube actif). En défaite/égalité, survivants = 0 côté popup, donc
    // `cubesPerdus` vaut `totalEngage` — comportement inchangé pour ce
    // cas. ---
    if (cle === 'envahir' || cle === 'envahir_corrompu') {
      return Promise.resolve(demanderChoix({
        type: 'envahir',
        corrompu: cle === 'envahir_corrompu',
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        // jetonPrime gagné en victoire : chantier "gain de jeton Prime"
        // (todo.md) — délègue à resoudreGainJetonsPrime_ (ci-dessus),
        // MÊME mécanisme que la clé "prime"/"gagner_prime", pour ne jamais
        // dupliquer le choix de récompense par jeton.
        var nbPrimeGagnes = reponse.victoire ? (reponse.jetonPrime || 0) : 0;
        var suitePrime = nbPrimeGagnes > 0
          ? resoudreGainJetonsPrime_(nbPrimeGagnes, source, etat, journal, demanderChoix)
          : Promise.resolve(true);
        return suitePrime.then(function (succesPrime) {
          if (succesPrime === false) return false;
          if (reponse.victoire) {
            etat.jetonLiberation = (etat.jetonLiberation || 0) + (reponse.jetonLiberation || 0);
            etat.influence = (etat.influence || 0) + (reponse.influenceGagnee || 0);
          }
          var cubesPerdus = reponse.victoire ? (reponse.cubesPerdus || 0) : (reponse.totalEngage || 0);
          etat.cubeActif = Math.min(NB_CUBES_TOTAL, etat.cubeActif + cubesPerdus);
          journal.push(source + ' : ' + reponse.detail);
          if (reponse.avertissement) journal.push(source + ' : ⚠️ ' + reponse.avertissement);
          return true;
        });
      });
    }

    // --- Actions secteur non portées côté PWA (hors périmètre, voir
    // en-tête de fichier) ---
    if (CLES_SECTEUR_HORS_PERIMETRE.indexOf(cle) !== -1) {
      journal.push(source + ' : ⚠️ "' + cle + '" non automatisé (action sur les secteurs pas encore portée côté PWA) — à appliquer manuellement.');
      return Promise.resolve(true);
    }

    // --- Civilisation non portée côté PWA (hors périmètre) ---
    if (CLES_CIVILISATION_HORS_PERIMETRE.indexOf(cle) !== -1) {
      journal.push(source + ' : ⚠️ "' + cle + '" non automatisé (avancement de Civilisation pas encore porté côté PWA) — à appliquer manuellement.');
      return Promise.resolve(true);
    }

    // --- Produire une ressource précise (produire_nourriture/energie/
    // materiel/credit/science — ex. Focus Production "Ravitailler") :
    // Effet UNIQUEMENT (signe > 0), AUCUN choix utilisateur — la
    // ressource visée est imposée par le nom même de la clé (contrairement
    // à produire_ressource/produire_deux_ressources ci-dessous, où le
    // joueur choisit parmi les 5). Le gain est le revenu de production
    // ACTUEL de cette ressource (Niveau Population × Guildes + bonus
    // d'origine, table PRODUCTION_NEMS/PRODUCTION_CREDIT), hors de portée
    // de focusEngine (pur, aucun accès aux secteurs) : ouvre une popup
    // dédiée (contexte 'produire_revenu', strategieService.js) qui
    // calcule le montant ET l'affiche brièvement, même principe que
    // influence_secteur ci-dessus (aucune interaction utilisateur, juste
    // un calcul déterministe). ---
    if (cle.indexOf('produire_') === 0 && cle !== 'produire_ressource' && cle !== 'produire_deux_ressources' && signe > 0) {
      var cleRessourceProduite = cle.slice('produire_'.length);
      if (RESSOURCES_PRODUCTION.indexOf(cleRessourceProduite) !== -1) {
        return Promise.resolve(demanderChoix({
          type: 'produire_revenu',
          ressource: cleRessourceProduite,
          source: source,
          partieId: etat.partieId
        })).then(function (reponse) {
          if (reponseAnnulee_(reponse)) return false;
          var champProduit = CHAMP_PAR_CLE[cleRessourceProduite];
          etat[champProduit] = Math.max(0, etat[champProduit] + (Number(reponse.montant) || 0));
          journal.push(source + ' : ' + reponse.detail);
          return true;
        });
      }
    }

    // --- Production non portée côté PWA (produire_ressource/
    // produire_deux_ressources — CHOIX du joueur parmi les 5 ressources,
    // popup de sélection pas encore construite ; et tout produire_<clé>
    // qui ne correspond à aucune des 5 ressources ci-dessus, cas non
    // rencontré dans le catalogue à ce jour) ---
    if (cle === 'produire_ressource' || cle === 'produire_deux_ressources' || cle.indexOf('produire_') === 0) {
      journal.push(source + ' : ⚠️ "' + cle + '" non automatisé (sélection de ressource au choix du joueur pas encore construite côté PWA) — à appliquer manuellement.');
      return Promise.resolve(true);
    }

    // --- Clés de contexte silencieuses (accompagnent un autre effet,
    // déjà pris en compte par lui — aucune action séparée) ---
    if (CLES_MODIFICATEURS_SILENCIEUSES.indexOf(cle) !== -1) {
      return Promise.resolve(true);
    }

    // --- Repli générique (clé non reconnue) ---
    journal.push(source + ' : effet non chiffré (' + cle + (typeof valeur !== 'object' ? ' : ' + valeur : '') + ') — à appliquer manuellement.');
    return Promise.resolve(true);
  }

  /**
   * Résout une option de choix (chaîne "cle" -> {cle: 1}, ou objet JSON
   * utilisé tel quel), en la faisant passer par la même résolution
   * générique que n'importe quel Coût/Effet.
   */
  function resoudreOption_(option, signe, source, etat, journal, demanderChoix) {
    var objet = option;
    if (typeof option === 'string') {
      objet = {};
      objet[option] = 1;
    }
    return resoudreJsonInterne_(objet, signe, source, '', etat, journal, demanderChoix);
  }

  /**
   * Résout séquentiellement toutes les clés d'un objet Coût/Effet sur
   * `etat` (muté en place — cet objet est TOUJOURS un clone local, jamais
   * l'état d'origine de l'appelant, voir resoudreJson_ ci-dessous).
   * S'arrête dès qu'une clé retourne false (bloquant).
   */
  function resoudreJsonInterne_(json, signe, source, texteAction, etat, journal, demanderChoix) {
    if (!json || typeof json !== 'object') return Promise.resolve(true);
    var cles = Object.keys(json);
    return cles.reduce(function (promesse, cle) {
      return promesse.then(function (succesPrecedent) {
        if (succesPrecedent === false) return false;
        // `json` (l'objet JSON complet en cours de résolution, pas
        // seulement la clé/valeur courante) est passé en dernier paramètre
        // — utilisé par le cas "avancer_civilisation_moins_avancee"
        // ci-dessus pour lire une éventuelle clé sœur "tie_break" (EVOLUTION
        // todo.md, Focus Héroïque Renfort "Accélérer") sans dupliquer la
        // boucle de résolution.
        return resoudreCle_(cle, json[cle], signe, source, texteAction, etat, journal, demanderChoix, json);
      });
    }, Promise.resolve(true));
  }

  /**
   * Point d'entrée "un JSON entier" (Effet OU Coût) : clone `etatBase`,
   * résout toutes les clés dessus, et ne retourne les mutations que si
   * TOUT le JSON a été résolu avec succès (voir RÈGLE MÉTIER, en-tête de
   * fichier).
   */
  function resoudreJson_(json, signe, source, texteAction, etatBase, demanderChoix) {
    var etatLocal = cloner_(etatBase);
    var journalLocal = [];
    return resoudreJsonInterne_(json, signe, source, texteAction, etatLocal, journalLocal, demanderChoix).then(function (succes) {
      if (succes === false) {
        return { succes: false, journal: [], etatResultat: etatBase, mutations: [] };
      }
      return { succes: true, journal: journalLocal, etatResultat: etatLocal, mutations: diffChamps_(etatBase, etatLocal) };
    });
  }

  // ------------------------------------------------------------
  // API publique
  // ------------------------------------------------------------

  /**
   * Résout une action Focus complète (Effet, puis Coût si l'Effet réussit).
   * `plateauMaison` : état actuel (objet plateauMaison, non muté).
   * `carte` : carte Focus (voir focusService.js — {focus, type, actions}).
   * `action` : une entrée de carte.actions ({action, cout, effet, texte}).
   * `demanderChoix(contexte)` : fonction fournie par l'appelant, retourne
   * une Promise résolue avec la réponse du joueur (voir les différents
   * `contexte.type` dans resoudreCle_ ci-dessus).
   *
   * EVOLUTION 12 (todo.md, retour utilisateur — limite d'utilisation
   * d'une action Focus par cycle) : dès que l'Effet a réussi (même
   * condition que le reste de cette fonction — un Coût qui échoue APRÈS
   * un Effet réussi ne bloque pas l'action, voir le bloc ci-dessous),
   * `libelleSource` (déjà utilisé comme identifiant de journal/pile
   * d'annulation) est ajouté à `plateauMaison.actionsFocusUtilisees` si
   * absent. Cette mutation passe par le MÊME mécanisme diff/undo que le
   * reste du plateau (CHAMPS_DIFF_SUIVIS/diffChamps_ ci-dessus) : annuler
   * cette action (AnnulationService, pile d'annulation) retire
   * AUTOMATIQUEMENT sa clé de la liste, sans code dédié côté annulation —
   * strategieService.js n'a qu'à lire ce champ pour griser le bouton
   * correspondant et signaler le Focus concerné (au moins 1 action
   * utilisée). Réinitialisé à chaque changement de cycle par
   * GameService.avancerCycle (gameService.js). Limite connue : la clé
   * est `carte.focus + ' — ' + action.action`, PAS un identifiant par
   * carte — une collision (2 cartes différentes partageant exactement le
   * même nom de Focus ET d'action) marquerait à tort les deux comme
   * utilisées ; le catalogue actuel ne présente pas ce cas.
   *
   * Retourne une Promise<{succes, journal, mutations, plateauMaisonApres}>.
   * N'écrit RIEN en base — voir jouerActionEtPersister ci-dessous pour
   * l'orchestrateur qui écrit + empile l'annulation.
   */
  function resoudreAction(plateauMaison, carte, action, demanderChoix) {
    var libelleSource = carte.focus + ' — ' + (action.action || 'action');
    var sourceEffet = libelleSource + ' (effet)';

    return resoudreJson_(action.effet, 1, sourceEffet, action.texte, plateauMaison, demanderChoix).then(function (resultatEffet) {
      if (!resultatEffet.succes) {
        return {
          succes: false,
          journal: [libelleSource + ' : action annulée — aucun coût prélevé, aucune donnée modifiée.'],
          mutations: [],
          plateauMaisonApres: plateauMaison
        };
      }

      var sourceCout = libelleSource + ' (coût)';
      return resoudreJson_(action.cout, -1, sourceCout, action.texte, resultatEffet.etatResultat, demanderChoix).then(function (resultatCout) {
        var etatFinal = resultatCout.succes ? resultatCout.etatResultat : resultatEffet.etatResultat;
        var journalFinal = resultatEffet.journal.slice();
        if (resultatCout.succes) {
          journalFinal = journalFinal.concat(resultatCout.journal);
        } else {
          journalFinal.push(sourceCout + ' : ⚠️ coût annulé après application de l\u2019effet — vérifiez le suivi de ressources manuellement.');
        }

        var actionsUtilisees = Array.isArray(etatFinal.actionsFocusUtilisees) ? etatFinal.actionsFocusUtilisees : [];
        if (actionsUtilisees.indexOf(libelleSource) === -1) {
          etatFinal.actionsFocusUtilisees = actionsUtilisees.concat([libelleSource]);
        }

        return {
          succes: true,
          journal: journalFinal,
          mutations: diffChamps_(plateauMaison, etatFinal),
          plateauMaisonApres: etatFinal
        };
      });
    });
  }

  /**
   * Variante de resoudreAction ci-dessus pour un Effet+Coût INDÉPENDANT
   * d'une action Focus (ex. `immediat.cost`+`immediat.activate`/`remove_
   * corruption` d'une Technologie — gameService.js/EFFET_TECHNOLOGIE_
   * IMMEDIAT_AVEC_COUT_) : MÊME règle métier Effet-puis-Coût (le Coût
   * n'est débité qu'après résolution réussie de l'Effet, un Coût annulé
   * après un Effet déjà réussi laisse un avertissement plutôt que de tout
   * annuler) que resoudreAction, mais SANS le suivi `actionsFocusUtilisees`
   * (EVOLUTION 12, todo.md — propre aux actions Focus/limite par cycle,
   * hors de propos pour l'acquisition d'une Technologie) et sans exiger de
   * `carte`/`action` (juste les 2 JSON Effet/Coût directement, `source`
   * déjà complet). `effetJson`/`coutJson` peuvent être `{}` (ex. Cuirassés/
   * Porte-Vaisseaux : le "vrai" Effet — un déploiement à destination fixe
   * Secteur-Mère — est résolu à PART, hors du vocabulaire FocusEngine,
   * voir TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_/TECHNOLOGIES_CHOIX_
   * DEPLOIEMENT_SECTEUR_MERE_ ; cette fonction ne sert alors qu'à débiter
   * le Coût, avec la même popup 'paiement_ressource' que n'importe quel
   * autre coût substituable).
   * Retourne `{succes, journal, mutations, etatResultat}` — même contrat
   * que FocusEngine.resoudreEffet (champ `etatResultat`, PAS
   * `plateauMaisonApres`).
   */
  function resoudreEffetEtCout(plateauMaison, effetJson, coutJson, source, demanderChoix) {
    return resoudreJson_(effetJson, 1, source + ' (effet)', '', plateauMaison, demanderChoix).then(function (resultatEffet) {
      if (!resultatEffet.succes) {
        return { succes: false, journal: [source + ' : action annulée — aucun coût prélevé, aucune donnée modifiée.'], mutations: [], etatResultat: plateauMaison };
      }

      var sourceCout = source + ' (coût)';
      return resoudreJson_(coutJson, -1, sourceCout, '', resultatEffet.etatResultat, demanderChoix).then(function (resultatCout) {
        var etatFinal = resultatCout.succes ? resultatCout.etatResultat : resultatEffet.etatResultat;
        var journalFinal = resultatEffet.journal.slice();
        if (resultatCout.succes) {
          journalFinal = journalFinal.concat(resultatCout.journal);
        } else {
          journalFinal.push(sourceCout + ' : ⚠️ coût annulé après application de l’effet — vérifiez le suivi de ressources manuellement.');
        }

        return {
          succes: true,
          journal: journalFinal,
          mutations: diffChamps_(plateauMaison, etatFinal),
          etatResultat: etatFinal
        };
      });
    });
  }

  /**
   * Orchestrateur : lit le plateau maison, résout l'action, écrit le
   * résultat via GameService.majPlateauMaison et empile l'annulation via
   * AnnulationService.empiler — le point d'entrée que l'écran Stratégie
   * appelle pour jouer une action Focus (voir strategieService.js).
   * Dépend de DB, GameService, AnnulationService (à charger avant ce
   * fichier si cette fonction est utilisée).
   *
   * EVOLUTION 18 (todo.md, retour utilisateur — annuler la dernière action
   * ne rétablit pas les effets déclenchés par des popups déléguées qui
   * persistent DIRECTEMENT en base, ex. secteurs/Programmes/pistes de
   * Civilisation via SecteurService/GameService/CivilisationService, hors
   * du diff plateauMaison de resoudreAction ci-dessus) : toute la
   * résolution — Effet ET Coût, y compris les popups déléguées qu'elle
   * ouvre via demanderChoix — se déroule maintenant sous
   * `DB.demarrerEnregistrement()` (db.js), qui capture AUTOMATIQUEMENT
   * TOUTE écriture DB.put() faite pendant cette fenêtre, quel que soit le
   * store — pas seulement les 9 champs plateauMaison suivis par
   * diffChamps_. `DB.arreterEnregistrement()` est TOUJOURS appelé (succès,
   * échec, ou exception) avant de quitter cette fonction, pour ne jamais
   * laisser un enregistrement actif fuiter vers d'autres écritures DB sans
   * rapport.
   * - Si l'Effet échoue (resultat.succes === false) : la RÈGLE MÉTIER de
   *   ce fichier veut qu'un Effet en échec ne laisse AUCUNE trace — or une
   *   popup déléguée peut avoir déjà écrit en base AVANT que l'échec ne
   *   soit connu (ex. "et/ou" : une option réussit, l'autre est annulée).
   *   Ces écritures captées sont donc immédiatement défaites via
   *   AnnulationService.restaurerMutations, sans jamais transiter par la
   *   pile (rien n'est empilé pour une action qui échoue).
   * - Si l'Effet réussit : les mutations capturées (englobant la propre
   *   écriture GameService.majPlateauMaison ci-dessous PLUS toute écriture
   *   d'une popup déléguée) remplacent — pas s'ajoutent à —
   *   `resultat.mutations` (diffChamps_) pour l'appel à
   *   AnnulationService.empiler : c'est un sur-ensemble strictement plus
   *   complet du même événement, construire les deux séparément ne ferait
   *   que dupliquer la mutation plateauMaison.
   */
  function jouerActionEtPersister(partieId, carte, action, demanderChoix) {
    return DB.get('plateauMaison', partieId).then(function (plateauMaison) {
      if (!plateauMaison) throw new Error('Plateau maison introuvable (partie ' + partieId + ').');

      DB.demarrerEnregistrement();

      return resoudreAction(plateauMaison, carte, action, demanderChoix).then(function (resultat) {
        if (!resultat.succes) {
          var mutationsARestaurer = DB.arreterEnregistrement();
          return AnnulationService.restaurerMutations(partieId, mutationsARestaurer).then(function () { return resultat; });
        }

        var champs = {};
        resultat.mutations.forEach(function (m) { champs[m.champ] = resultat.plateauMaisonApres[m.champ]; });
        var ecriturePlateauMaison = Object.keys(champs).length
          ? GameService.majPlateauMaison(partieId, champs)
          : Promise.resolve();

        return ecriturePlateauMaison.then(function () {
          var mutationsCapturees = DB.arreterEnregistrement();
          if (!mutationsCapturees.length) return resultat;

          return AnnulationService.empiler(partieId, {
            source: carte.focus + ' — ' + (action.action || 'action'),
            mutations: mutationsCapturees
          }).then(function () {
            return resultat;
          });
        });
      }).catch(function (erreur) {
        DB.arreterEnregistrement(); // filet de sécurité, voir commentaire ci-dessus
        throw erreur;
      });
    });
  }

  /**
   * Wrapper public léger autour de resoudreJson_ (aucune logique propre),
   * pour permettre à civilisationService.js de résoudre l'effet d'une case
   * de piste de Civilisation en réutilisant CE moteur plutôt que d'en
   * dupliquer un second. Toujours "pur" : ne fait aucune écriture, retourne
   * {succes, journal, mutations, etatResultat} — ⚠️ champ "etatResultat",
   * PAS "plateauMaisonApres" (nom différent de resoudreAction ci-dessus,
   * qui enveloppe ce même résultat interne — attention à l'appelant).
   * Signe toujours +1 : une case de piste n'a jamais de "coût".
   */
  function resoudreEffet(plateauMaison, effetJson, source, texteAction, demanderChoix) {
    return resoudreJson_(effetJson, 1, source, texteAction, plateauMaison, demanderChoix);
  }

  return {
    resoudreAction: resoudreAction,
    resoudreEffet: resoudreEffet,
    resoudreEffetEtCout: resoudreEffetEtCout,
    jouerActionEtPersister: jouerActionEtPersister,
    // Exposés pour les tests / debug uniquement :
    BONUS_COMMERCE: BONUS_COMMERCE,
    CLES_SECTEUR_HORS_PERIMETRE: CLES_SECTEUR_HORS_PERIMETRE,
    CLES_CIVILISATION_HORS_PERIMETRE: CLES_CIVILISATION_HORS_PERIMETRE
  };
})();
