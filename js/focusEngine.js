/**
 * focusEngine.js
 * Moteur coût/effet des actions Focus — Voidfall Companion PWA
 * Version 9 — 20/08/2026 (EVOLUTION 7 — effet "avancer sur piste de Civilisation" porté, retiré de CLES_CIVILISATION_HORS_PERIMETRE)
 *
 * 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2, retour
 * utilisateur : "automatiser augmentez une population pure ... et
 * etablir un guilde banquier -> idem que etablir une guilde sauf que
 * banquier est preselectionné dans la ddl et en lecture seule") : 2
 * nouvelles clés reconnues par resoudreCle_, même principe que
 * construire_installation/etablir_guilde (Effet UNIQUEMENT, signe > 0) :
 * - 'etablir_guilde_banquier' ajoutée à CATEGORIE_PAR_CLE_CONSTRUIRE_
 *   ('guilde', même popup 'construire' que etablir_guilde) + nouvelle
 *   TYPE_FORCE_PAR_CLE_CONSTRUIRE_ = { etablir_guilde_banquier: 'banquiers' }
 *   — demanderChoix({type:'construire', ..., typeForce}) transmis à la
 *   popup (strategieService.js), qui restreint alors le <select> Type à
 *   cette seule option et le désactive (lecture seule) au lieu de laisser
 *   le joueur choisir librement.
 * - 'augmenter_population_pure' : nouveau cas dédié, demanderChoix({type:
 *   'augmenter_population_pure', ...}) — la popup fait la sélection du
 *   secteur (SecteurService.obtenirSecteursEligiblesAugmenterPopulationPure,
 *   secteurService.js v6) et écrit directement via SecteurService.
 *   augmenterPopulationPure au moment de la validation (même pattern que
 *   construire/regrouper/envahir : focusEngine reste pur, aucun accès DB
 *   ici, resoudreCle_ relaie juste le résumé dans le journal).
 * js/gameService.js/index.html (cleFocusEnginePourOptionCadre_ dupliquée
 * dans les 2 fichiers), js/strategieService.js (popup, v21).
 *
 * 19/08/2026 (retour utilisateur : "on a dû perdre cette possibilité lors
 * du portage en PWA, il y a des actions de focus qui placent des guildes
 * ou des installations aussi") : "construire_installation"/"installation"/
 * "etablir_guilde"/"guilde" retirés de CLES_SECTEUR_HORS_PERIMETRE —
 * nouveau cas dédié dans resoudreCle_ (CLES_CONSTRUIRE/
 * CATEGORIE_PAR_CLE_CONSTRUIRE_) qui délègue à demanderChoix({type:
 * 'construire', categorie, ...}). Même principe que regrouper/envahir/
 * deployer_cube : la popup (DOM, strategieService.js) fait la sélection
 * secteur (possédé, au moins un emplacement libre pour la catégorie,
 * SecteurService.obtenirSecteursEligiblesConstruction déjà porté Session
 * 12/13 mais jamais branché ailleurs que le formulaire dédié écran
 * Secteurs) + type (Guilde ou Installation, au choix), appelle
 * directement SecteurService.construire et persiste en IndexedDB AU
 * MOMENT de la validation — resoudreCle_ ne fait que relayer le résumé
 * dans le journal, focusEngine reste pur. Bénéfice immédiat : toute carte
 * Focus du catalogue utilisant ces 4 clés (ex. id 21 "Organiser" —
 * Prospérité Standard, `effet.choice: ["gagner_programme", "installation"]`)
 * devient jouable sans changement supplémentaire (dispatch générique par
 * clé JSON, déjà en place). Portée volontairement limitée aux 4 clés de
 * base (quantité 1, secteur libre + type libre) — les variantes du
 * catalogue (etablir_guilde_meme_secteur/_up_to/_scientifique,
 * construire_installation_meme_secteur/_autre_secteur/_up_to) restent hors
 * périmètre (repli générique "effet non chiffré", pas de régression, juste
 * pas automatisées par ce lot — nécessiteraient de croiser l'état d'une
 * autre clé résolue dans le même JSON, ou une répétition "jusqu'à N fois",
 * hors de la portée demandée). js/strategieService.js (nouveau contexte
 * 'construire' de demanderChoix), js/gameService.js (cleFocusEnginePourOptionCadre_
 * étendu — Cadre "choix" d'Événement galactique portant sur etablir_guilde/
 * construire_installation, ex. Événement C Cycle 1 Cadre 2, réutilise
 * désormais ce même mécanisme au lieu d'une résolution manuelle),
 * index.html (idem, copie dupliquée par convention).
 *
 * 17/08/2026 (Session 14 fin) : "envahir"/"envahir_corrompu" retirés de
 * CLES_SECTEUR_HORS_PERIMETRE — nouveau cas dédié dans resoudreCle_ qui
 * délègue à demanderChoix({type:'envahir', corrompu, ...}). La popup (DOM,
 * strategieService.js) fait la sélection cible/engagement, résout le
 * combat via CombatService.resoudreInvasion et persiste via
 * SecteurService.envahirResoudre. Conséquences scalaires (jetonPrime/
 * jetonLiberation/influence en victoire, cubeActif en défaite) appliquées
 * ICI sur l'état pur ; le jeton Gloire (array) est persisté DIRECTEMENT
 * par la popup (hors diff/annulation, même pattern que le clic manuel sur
 * un emplacement Gloire). HORS PÉRIMÈTRE cette session (journalisé en
 * avertissement le cas échéant) : défausse d'un jeton Gloire pour un
 * secteur source abandonné (repris par le Néant) — les jetons Prime/
 * Libération gagnés restent en revanche de simples compteurs (déjà le cas
 * pour toute carte via CLES_SIMPLES), pas besoin de popup de résolution
 * dédiée. C'est la dernière des 3 actions secteur "lourdes" de la Session
 * 14 — construire_installation/etablir_guilde/rappeler_cube/
 * retirer_corruption/effet_secteur restent hors périmètre (déjà branchés
 * en boutons dédiés écran Secteurs pour les 2 premiers, Session 13).
 *
 * 17/08/2026 (Session 14 suite — action secteur "Déployer des cubes"
 * portée) :
 *
 * 17/08/2026 (Session 14 suite) : "deployer_cube_par_chantier"/
 * "deployer_cube"/"deploy_cube"/"deployer_cube_secteur_mere" (Effet
 * UNIQUEMENT, signe > 0 — comme le legacy) ouvrent désormais une popup
 * dédiée (voir MODE_PAR_CLE_DEPLOYER_CUBE et le nouveau cas
 * contexte.type === 'deployer_cube' de strategieService.js) qui choisit
 * secteur(s)/type(s) de Flotte (limités aux Technologies débloquées)/
 * quantité(s), sur les 3 modes du livret : 'par_chantier' (N cube(s) PAR
 * Chantier Naval possédé, dans son secteur), 'libre' (N cube(s) au choix
 * sur n'importe quel secteur possédé), 'secteur_mere' (N cube(s) dans le
 * Secteur-Mère uniquement). Différence assumée avec le legacy : la popup
 * (DOM) ne fait QUE persister le placement sur les secteurs
 * (SecteurService.deployerCube) — c'est resoudreCle_ ICI qui débite Cube
 * actif et le coût en ressources (Cuirassé → Matériel, Porte-Vaisseau →
 * Nourriture, voir COUT_DEPLOIEMENT_PAR_TYPE côté strategieService.js) sur
 * l'état pur, pour que ces mutations restent diffables/annulables comme
 * le reste du moteur (le legacy les écrivait directement depuis la popup
 * via un PATCH séparé, hors du flux normal d'annulation).
 *
 * 17/08/2026 (Session 14) : "regrouper"/"regroupe" retirés de
 * CLES_SECTEUR_HORS_PERIMETRE — nouveau cas dédié dans resoudreCle_ qui
 * délègue à demanderChoix({type:'regrouper', ...}). Le moteur reste PUR :
 * c'est la popup (implémentation DOM, voir strategieService.js) qui
 * appelle directement SecteurService.regrouper et persiste en IndexedDB
 * AU MOMENT de la validation — resoudreCle_ ne fait que relayer le résumé
 * renvoyé ({deplacements, detail}) dans le journal. "Annuler" bloque toute
 * l'action (même comportement que "choice"/"choice_repeat" ci-dessous),
 * cohérent avec le popup Envahir du legacy (envahir/envahir_corrompu
 * portés à leur tour en fin de Session 14, voir plus haut). rappeler_cube/
 * retirer_corruption/construire_installation/etablir_guilde/effet_secteur
 * restent hors périmètre (inchangé cette session, voir liste ci-dessous).
 *
 * Extraction PURE (aucun DOM, aucun accès direct à IndexedDB) de la
 * logique appliquerJson_/resoudreCle_/jouerAction_ de strategie.html
 * (GAS, lignes ~2583-2990). Porte le mapping des clés Coût/Effet vers
 * l'état du Plateau maison PWA (voir gameService.js — champs et liste
 * blanche CHAMPS_PLATEAU_MAISON_AUTORISES).
 *
 * ---------------------------------------------------------------------
 * MODE "PUR / DIFF" (tranché en session) :
 * FocusEngine.resoudreAction() ne fait AUCUNE écriture. Il reçoit l'état
 * actuel du plateau maison, calcule l'état résultant, et retourne :
 *   - succes (bool)
 *   - journal (liste de lignes texte)
 *   - mutations (liste de {champ, avant, apres} — un par champ modifié)
 *   - plateauMaisonApres (l'état complet résultant, prêt à être passé à
 *     GameService.majPlateauMaison par l'appelant)
 * C'est l'appelant (futur écran Stratégie, ou l'orchestrateur ci-dessous)
 * qui décide d'écrire en base et d'empiler les mutations dans la pile
 * d'annulation (voir annulationService.js, nouveau cette session).
 *
 * ---------------------------------------------------------------------
 * RÈGLE MÉTIER (déjà validée, préservée ET renforcée) :
 * Le Coût n'est débité qu'APRÈS résolution réussie de l'Effet. Amélioration
 * apportée par le mode pur par rapport à strategie.html GAS : côté GAS, si
 * une clé bloquante (ex. "Annuler" sur une popup Envahir) survient APRÈS
 * que d'autres clés du même JSON Effet/Coût aient déjà été appliquées, ces
 * clés précédentes restaient appliquées malgré le message "aucune donnée
 * modifiée" (incohérence documentée dans le commentaire de jouerAction_
 * GAS). Ici, resoudreJson_ travaille sur un CLONE de l'état et ne retourne
 * ses mutations à l'appelant QUE si la résolution complète du JSON (Effet
 * OU Coût, chacun pris comme un tout) a réussi — un blocage à N'IMPORTE
 * quelle clé annule bien la totalité du JSON en cours, pas seulement les
 * clés restantes. Le comportement legacy où le Coût est annulé après que
 * l'Effet a déjà réussi (cas limite documenté côté GAS) est conservé tel
 * quel : dans ce cas précis, les mutations de l'Effet sont conservées,
 * celles du Coût sont écartées, et un avertissement est journalisé.
 *
 * ---------------------------------------------------------------------
 * POINTS DE CHOIX (interaction utilisateur) :
 * Certaines clés nécessitent un choix du joueur (ex. "choice"/"choix",
 * "ressource_choix", "gagner_commerce"). Comme focusEngine.js est pur, il
 * ne peut pas ouvrir de popup lui-même : il appelle `demanderChoix(contexte)`,
 * une fonction fournie par l'appelant, qui doit retourner une Promise
 * résolue avec la réponse du joueur. Voir le mapping des `contexte.type`
 * dans les commentaires de resoudreCle_ ci-dessous. C'est ce mécanisme qui
 * permet de couvrir TOUTES les clés dès cette session (comme demandé),
 * tout en restant testable en Node (un `demanderChoix` factice répond
 * automatiquement dans les tests).
 *
 * ---------------------------------------------------------------------
 * CLÉS HORS PÉRIMÈTRE — signalé explicitement (pas d'invention de logique) :
 * Certaines clés dépendent de systèmes qui n'existent PAS ENCORE dans la
 * PWA (voir secteurService.js/gameService.js, en-têtes) :
 *   - Actions sur les secteurs : rappeler_cube, effet_secteur
 *     ("regrouper"/"regroupe" porté depuis la Session 14, "deployer_cube*"
 *     porté depuis la Session 14 suite, "envahir"/"envahir_corrompu"
 *     porté en fin de Session 14, "retirer_corruption" porté le
 *     20/08/2026 (EVOLUTION 5) — voir plus bas, cas dédiés dans
 *     resoudreCle_)
 *     (secteurService.js PWA ne porte QUE l'instanciation/lecture pour les
 *     clés restant ci-dessus — actions hors périmètre, cf. son en-tête)
 *   - Civilisation : avance_rapide, avancer_civilisation_moins_avancee,
 *     avancer_piste_corrompue ("avancer_civilisation"/"avancer_
 *     civilisation_societe"/"_gouvernement"/"_economie" portées le
 *     20/08/2026, EVOLUTION 7 — voir plus bas, cas dédié dans
 *     resoudreCle_ ; CHAMPS_PLATEAU_MAISON_AUTORISES de gameService.js
 *     exclut toujours civSociete/civGouvernement/civEconomie, mais
 *     CivilisationService.avancerPiste — appelée depuis la popup, pas
 *     depuis ce fichier — a ses propres fonctions dédiées pour ces champs)
 *   - Production : produire_ressource, produire_deux_ressources,
 *     produire_<ressource> (niveauxProduction dépend d'un calcul agrégé
 *     sur secteursPartie — population × guildes — non porté côté PWA)
 * Pour ces clés, resoudreCle_ NE BLOQUE PAS l'action (comportement aligné
 * sur le repli générique déjà présent côté GAS pour une clé non reconnue :
 * "effet non chiffré — à appliquer manuellement") : elle journalise un
 * avertissement explicite et continue. Aucune ressource n'est débitée/
 * créditée à tort pour ces clés — c'est délibérément prudent plutôt que de
 * deviner une mutation de secteur ou de piste de Civilisation qui n'a
 * aucune fonction de destination fiable pour l'instant.
 *
 * Dépend d'aucun module (pur). L'orchestrateur FocusEngine.jouerActionEtPersister
 * en bas de fichier dépend de DB (db.js), GameService (gameService.js) et
 * AnnulationService (annulationService.js) — à charger avant ce fichier
 * dans index.html si cette fonction est utilisée.
 */

var FocusEngine = (function () {
  'use strict';

  // ------------------------------------------------------------
  // Constantes de mapping (portées telles quelles depuis
  // strategie.html GAS — RESSOURCES/RESSOURCES_PRODUCTION/BONUS_COMMERCE/
  // CLES_MODIFICATEURS_SILENCIEUSES, données du livret, indépendantes des
  // secteurs).
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
  var RESSOURCES_PRODUCTION = ['nourriture', 'energie', 'materiel', 'credit', 'science'];
  var NB_CUBES_TOTAL = 14;

  var CLES_MODIFICATEURS_SILENCIEUSES = ['sans_benefice_case', 'exclude', 'restriction', 'same_sector', 'meme_secteur', 'tie_break'];

  // 19/08/2026 (Construire une Installation / Établir une Guilde — retour
  // utilisateur : "on a dû perdre cette possibilité lors du portage") :
  // "rappeler_cube"/"effet_secteur" restent hors périmètre (déjà branchés
  // en formulaires dédiés écran Secteurs, session 13, pas de popup Focus/
  // Cadre dédiée demandée pour eux) — seules les 4 clés de construction/
  // établissement générique sortent de cette liste (voir CLES_CONSTRUIRE/
  // CATEGORIE_PAR_CLE_CONSTRUIRE_ ci-dessous). Les VARIANTES du catalogue
  // (etablir_guilde_meme_secteur/_up_to/_scientifique,
  // construire_installation_meme_secteur/_autre_secteur/_up_to —
  // contrainte de secteur croisée avec une autre clé du même JSON,
  // répétition "jusqu'à N fois", ou type figé) restent hors périmètre :
  // elles retombent sur le repli générique en bas de resoudreCle_ ("effet
  // non chiffré — à appliquer manuellement"), pas de régression, juste
  // pas automatisées par CE lot (portée volontairement limitée au pattern
  // décrit : secteur libre + type au choix, quantité 1).
  //
  // 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
  // TODO.md) : "retirer_corruption" RETIRÉE de cette liste — nouveau cas
  // dédié ci-dessous (comme construire/augmenter_population_pure), qui
  // ouvre une popup de choix parmi les 4 cibles possibles (Secteur, Piste
  // de Civilisation, Programme, Technologie Chambres de décontamination —
  // voir strategieService.js, contexte 'retirer_corruption').
  var CLES_SECTEUR_HORS_PERIMETRE = [
    'rappeler_cube', 'effet_secteur'
  ];
  var CATEGORIE_PAR_CLE_CONSTRUIRE_ = {
    construire_installation: 'installation', installation: 'installation',
    etablir_guilde: 'guilde', guilde: 'guilde',
    // 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2) : même popup
    // 'construire' (catégorie 'guilde') que etablir_guilde, avec le type
    // forcé sur "Banquiers" (voir TYPE_FORCE_PAR_CLE_CONSTRUIRE_ ci-dessous).
    etablir_guilde_banquier: 'guilde'
  };
  // 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2) : clé de
  // CLES_CONSTRUIRE -> type forcé (présélectionné et non modifiable côté
  // popup 'construire', strategieService.js) — absent pour les clés dont
  // le type reste au libre choix du joueur (etablir_guilde/
  // construire_installation, comportement inchangé).
  var TYPE_FORCE_PAR_CLE_CONSTRUIRE_ = {
    etablir_guilde_banquier: 'banquiers'
  };
  var CLES_CONSTRUIRE = Object.keys(CATEGORIE_PAR_CLE_CONSTRUIRE_);
  var CLES_DEPLOYER_CUBE = ['deployer_cube_par_chantier', 'deployer_cube', 'deploy_cube', 'deployer_cube_secteur_mere'];
  var MODE_PAR_CLE_DEPLOYER_CUBE = {
    deployer_cube_par_chantier: 'par_chantier',
    deployer_cube: 'libre',
    deploy_cube: 'libre',
    deployer_cube_secteur_mere: 'secteur_mere'
  };
  // 20/08/2026 (EVOLUTION 7 — effet "avancer sur piste [de Civilisation]",
  // voir TODO.md) : "avancer_civilisation" (piste au choix) et
  // "avancer_civilisation_societe"/"_gouvernement"/"_economie" (piste
  // imposée) RETIRÉES de cette liste — nouveau cas dédié ci-dessous (comme
  // construire/retirer_corruption), qui ouvre une popup de choix/aperçu
  // (contexte 'avancer_civilisation', strategieService.js) puis délègue à
  // CivilisationService.avancerPiste, seule source de vérité pour cette
  // mécanique (déjà utilisée par le bouton "Avancer" de l'écran Focus).
  // "avance_rapide" reste ICI (résolue différemment, en aval, à
  // l'intérieur même de CivilisationService.avancerPiste — voir son
  // en-tête, EVOLUTION 6 — jamais via resoudreCle_, cette clé n'apparaît
  // d'ailleurs que sur une case déjà en cours d'avancement, jamais comme
  // effet Focus/Cadre à résoudre isolément). "avancer_civilisation_moins_
  // avancee"/"avancer_piste_corrompue" restent hors périmètre (fonctions
  // dédiées existantes — CivilisationService.avancerPisteMoinsAvancee/
  // avancerPisteCorrompue — mais aucune popup Focus/Cadre demandée pour
  // elles à ce jour, hors périmètre de cette évolution).
  var CLES_CIVILISATION_HORS_PERIMETRE = [
    'avance_rapide', 'avancer_civilisation_moins_avancee', 'avancer_piste_corrompue'
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

  // Bonus Commerce — 6 bonus fixes du livret (portés tels quels depuis
  // strategie.html, var BONUS_COMMERCE). Données de règles statiques, donc
  // sans risque à porter en dur ici (contrairement aux clés secteur/civ).
  var BONUS_COMMERCE = [
    { label: 'Gagnez 3 Influence.', effet: { influence: 3 } },
    { label: 'Activez 1 cube de Puissance Navale.', effet: { activer_cube: 1 } },
    { label: 'Gagnez 2 Crédits ou 2 Science.', effet: { choice: [{ credit: 2 }, { science: 2 }] } },
    { label: 'Gagnez 2 ressources (Nourriture, Énergie et/ou Matériel).', effet: { choice_repeat: { times: 2, options: ['nourriture', 'energie', 'materiel'] } } },
    { label: 'Gagnez un jeton Prime.', effet: { gagner_prime: 1 } },
    { label: 'Gagnez 1 Science.', effet: { science: 1 } }
  ];

  var CHAMPS_DIFF_SUIVIS = [
    'ressourceNourriture', 'ressourceEnergie', 'ressourceMateriel',
    'ressourceCredit', 'ressourceScience', 'influence', 'cubeActif',
    'jetonPrime', 'jetonLiberation'
  ];

  // ------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------

  function cloner_(objet) {
    return JSON.parse(JSON.stringify(objet));
  }

  function diffChamps_(avant, apres) {
    var mutations = [];
    CHAMPS_DIFF_SUIVIS.forEach(function (champ) {
      var valAvant = avant[champ];
      var valApres = apres[champ];
      if (valAvant !== valApres) {
        mutations.push({ champ: champ, avant: valAvant, apres: valApres });
      }
    });
    return mutations;
  }

  function reponseAnnulee_(reponse) {
    return !reponse || reponse.annule === true;
  }

  // ------------------------------------------------------------
  // Résolution d'une clé Coût/Effet — cœur du moteur (portage de
  // resoudreCle_, strategie.html GAS ~2608-2739).
  // Retourne une Promise<boolean> : true (ou undefined traité comme true)
  // si la clé est résolue et ne bloque pas la suite, false si elle bloque
  // (annulation de TOUT le JSON en cours — voir resoudreJsonInterne_).
  // ------------------------------------------------------------

  function resoudreCle_(cle, valeur, signe, source, texteAction, etat, journal, demanderChoix) {

    // --- Ressources/jetons simples (nourriture, energie, materiel,
    // credit, science, influence, prime, liberation) ---
    if (CLES_SIMPLES.indexOf(cle) !== -1 && typeof valeur === 'number') {
      var champ = CHAMP_PAR_CLE[cle];
      etat[champ] = Math.max(0, etat[champ] + signe * valeur);
      journal.push(source + ' : ' + (signe > 0 ? '+' : '−') + valeur + ' ' + cle + '.');
      return Promise.resolve(true);
    }

    // --- Déploiement de cube (Effet UNIQUEMENT — signe > 0, comme le
    // legacy : côté Coût, ces clés retombent sur le traitement générique
    // "cube" ci-dessous, cas non prévu par le livret). Ouvre une popup
    // dédiée (mode selon la clé — voir MODE_PAR_CLE_DEPLOYER_CUBE) qui
    // choisit secteur(s)/type(s)/quantité(s) et persiste via
    // SecteurService.deployerCube (un appel par ligne engagée, fait CÔTÉ
    // POPUP — DOM, voir strategieService.js). La consommation de Cube
    // actif et le coût en ressources (Cuirassé/Porte-Vaisseau) sont en
    // revanche appliqués ICI, sur l'état pur, pour rester cohérents avec
    // le reste du moteur (diff/annulation) — amélioration par rapport au
    // legacy, où la popup écrivait elle-même plateau_maison. ---
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
      return Promise.resolve(demanderChoix({
        type: 'construire',
        categorie: CATEGORIE_PAR_CLE_CONSTRUIRE_[cle],
        typeForce: TYPE_FORCE_PAR_CLE_CONSTRUIRE_[cle],
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        journal.push(source + ' : ' + reponse.detail);
        return true;
      });
    }

    // --- Augmenter une Population Pure : Effet UNIQUEMENT (signe > 0).
    // Ouvre une popup dédiée (secteur possédé, non Corrompu, Population < 6
    // — voir SecteurService.obtenirSecteursEligiblesAugmenterPopulationPure)
    // qui appelle directement SecteurService.augmenterPopulationPure et
    // persiste en IndexedDB AU MOMENT de la validation (même pattern que
    // construire/regrouper/envahir ci-dessus — focusEngine reste pur,
    // aucun accès DB ici).
    //
    // 20/08/2026 (EVOLUTION 3 — voir TODO.md) : "augmenter_population"
    // (SANS "_pure") reconnue en plus de "augmenter_population_pure" —
    // c'est la clé utilisée par data/catalogue/pistesCivilisation.json ET
    // focus.json (jamais "_pure", forme réservée au seul catalogue
    // evenements.json) ; jusqu'ici non reconnue, elle retombait sur le
    // repli générique "effet non chiffré — à appliquer manuellement",
    // alors que la mécanique est IDENTIQUE (secteur Pur, Population < 6,
    // même popup). Comme CivilisationService.avancerPiste ET
    // FocusEngine.jouerActionEtPersister (actions Focus) délèguent tous
    // deux à CE même resoudreCle_, ce point unique couvre les 2 usages
    // demandés ("piste civilisation ou focus") sans code spécifique à
    // l'un ou l'autre. "augmenter_population_up_to" (variante "jusqu'à N
    // fois" du catalogue focus.json) reste HORS PÉRIMÈTRE — comme les
    // autres variantes _up_to/_meme_secteur déjà notées plus haut dans ce
    // fichier — et retombe donc sur le repli générique, journalisé en
    // avertissement, pas de régression. ---
    if ((cle === 'augmenter_population_pure' || cle === 'augmenter_population') && signe > 0) {
      return Promise.resolve(demanderChoix({
        type: 'augmenter_population_pure',
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        journal.push(source + ' : ' + reponse.detail);
        return true;
      });
    }

    // --- Retirer une Corruption : Effet UNIQUEMENT (signe > 0). Ouvre une
    // popup dédiée (contexte 'retirer_corruption', strategieService.js)
    // qui laisse le joueur choisir PARMI JUSQU'À 4 cibles possibles
    // (TODO.md, EVOLUTION 5) : un Secteur qu'il possède et Corrompu
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
      return Promise.resolve(demanderChoix({
        type: 'retirer_corruption',
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        journal.push(source + ' : ' + reponse.detail);
        return true;
      });
    }

    // --- Avancer sur une piste de Civilisation : Effet UNIQUEMENT (signe
    // > 0). Ouvre une popup dédiée (contexte 'avancer_civilisation',
    // strategieService.js) qui affiche, pour la ou les piste(s) candidate(s)
    // (TODO.md, EVOLUTION 7) — piste imposée (PISTE_PAR_CLE_AVANCER_
    // CIVILISATION_) OU au choix (contexte.piste === null, "avancer_
    // civilisation") — le niveau actuel (X/NIVEAU_MAX) et un aperçu de la
    // PROCHAINE case, avant Annuler/Valider. À la validation, la popup
    // appelle directement CivilisationService.avancerPiste (persistance
    // ET résolution de l'effet de la nouvelle case atteinte, laquelle
    // PEUT À SON TOUR ouvrir une ou plusieurs popups imbriquées —
    // demanderChoix relayé tel quel par avancerPiste, comme pour n'importe
    // quel autre effet : choix "et/ou", rappel manuel EVOLUTION 4,
    // retirer_corruption EVOLUTION 5, avance_rapide EVOLUTION 6 — déjà
    // tous gérés par avancerPiste elle-même, aucun code supplémentaire
    // nécessaire ici pour cet enchaînement). Comme construire/retirer_
    // corruption ci-dessus, la popup fait le choix ET la persistance
    // (focusEngine reste pur, aucun accès DB ici) ; resoudreCle_ relaie
    // juste le résumé dans le journal. ---
    if (CLES_AVANCER_CIVILISATION_.indexOf(cle) !== -1 && signe > 0) {
      return Promise.resolve(demanderChoix({
        type: 'avancer_civilisation',
        piste: PISTE_PAR_CLE_AVANCER_CIVILISATION_[cle] || null,
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        journal.push(source + ' : ' + reponse.detail);
        return true;
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
    // "Annuler" côté legacy pour cette popup). ---
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
    // Exclusif (un seul choix, peut bloquer si annulé) sauf si le Texte de
    // l'action contient "et/ou" (inclusif, sélection multiple, tolérant —
    // un refus sur une option nichée n'annule pas le reste). ---
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
          return promesse.then(function () {
            return resoudreOption_(valeur[indexOption], signe, source, etat, journal, demanderChoix);
          });
        }, Promise.resolve()).then(function () { return true; }); // tolérant, cf. resoudreOption_ GAS
      });
    }

    // --- choice_repeat : { times, options } — répète un choix exclusif
    // `times` fois ; un "Annuler" sur n'importe quel tour arrête les tours
    // restants et bloque toute l'action (comportement legacy conservé). ---
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
    // "choice_repeat" ci-dessus, cohérent avec le popup Envahir legacy). ---
    if (cle === 'regrouper' || cle === 'regroupe') {
      return Promise.resolve(demanderChoix({ type: 'regrouper', source: source, partieId: etat.partieId })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        journal.push(source + ' : Regrouper — ' + reponse.deplacements + ' déplacement(s) (' + reponse.detail + ').');
        return true;
      });
    }

    // --- Envahir / Envahir un secteur Corrompu : sélection de la cible
    // et engagement de sources, combat résolu via
    // CombatService.resoudreInvasion puis persisté via
    // SecteurService.envahirResoudre — tout cela dans la popup (DOM, voir
    // strategieService.js), pas ici (focusEngine reste pur). "Annuler"
    // bloque toute l'action. Conséquences SCALAIRES (jetonPrime/
    // jetonLiberation/influence en victoire, cubeActif en défaite,
    // clampé à NB_CUBES_TOTAL) appliquées ICI sur l'état pur — le jeton
    // Gloire (array, non diffable par ce moteur au clone JSON) est en
    // revanche persisté DIRECTEMENT par la popup (même pattern que le
    // clic manuel sur un emplacement Gloire côté écran Stratégie),
    // l'Influence gagnée depuis son total étant calculée là-bas et
    // simplement relayée ici en scalaire. HORS PÉRIMÈTRE cette session
    // (journalisé en avertissement le cas échéant, à traiter
    // manuellement) : défausse d'un jeton Gloire pour un secteur source
    // abandonné (repris par le Néant). PAS hors périmètre en revanche :
    // les jetons Prime/Libération gagnés restent de simples compteurs
    // (jetonPrime/jetonLiberation), cohérent avec le reste du moteur où
    // ce sont déjà des clés simples (CLES_SIMPLES) — leur résolution
    // immédiate (dépense) n'est pas automatisée, comme n'importe quelle
    // autre carte à jouer plus tard. ---
    if (cle === 'envahir' || cle === 'envahir_corrompu') {
      return Promise.resolve(demanderChoix({
        type: 'envahir',
        corrompu: cle === 'envahir_corrompu',
        source: source,
        partieId: etat.partieId
      })).then(function (reponse) {
        if (reponseAnnulee_(reponse)) return false;
        if (reponse.victoire) {
          etat.jetonPrime = (etat.jetonPrime || 0) + (reponse.jetonPrime || 0);
          etat.jetonLiberation = (etat.jetonLiberation || 0) + (reponse.jetonLiberation || 0);
          etat.influence = (etat.influence || 0) + (reponse.influenceGagnee || 0);
        } else {
          etat.cubeActif = Math.min(NB_CUBES_TOTAL, etat.cubeActif + (reponse.totalEngage || 0));
        }
        journal.push(source + ' : ' + reponse.detail);
        if (reponse.avertissement) journal.push(source + ' : ⚠️ ' + reponse.avertissement);
        return true;
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

    // --- Production non portée côté PWA (niveaux dérivés des secteurs,
    // calcul pas encore porté) ---
    if (cle === 'produire_ressource' || cle === 'produire_deux_ressources' || cle.indexOf('produire_') === 0) {
      journal.push(source + ' : ⚠️ "' + cle + '" non automatisé (niveaux de production pas encore calculés côté PWA) — à appliquer manuellement.');
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
        return resoudreCle_(cle, json[cle], signe, source, texteAction, etat, journal, demanderChoix);
      });
    }, Promise.resolve(true));
  }

  /**
   * Point d'entrée "un JSON entier" (Effet OU Coût) : clone `etatBase`,
   * résout toutes les clés dessus, et ne retourne les mutations que si
   * TOUT le JSON a été résolu avec succès (voir remarque sur l'amélioration
   * apportée par rapport à strategie.html GAS, en-tête de fichier).
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
   * Orchestrateur optionnel : lit le plateau maison, résout l'action,
   * écrit le résultat via GameService.majPlateauMaison et empile
   * l'annulation via AnnulationService.empiler. Ajouté cette session pour
   * boucler la fonctionnalité d'annulation demandée (sans quoi il n'y
   * aurait rien à empiler) — le rebranchement DOM complet de l'écran
   * Stratégie reste hors périmètre (session séparée), mais cette fonction
   * est le point d'entrée que ce futur écran pourra appeler directement.
   * Dépend de DB, GameService, AnnulationService (à charger avant ce
   * fichier si cette fonction est utilisée).
   */
  function jouerActionEtPersister(partieId, carte, action, demanderChoix) {
    return DB.get('plateauMaison', partieId).then(function (plateauMaison) {
      if (!plateauMaison) throw new Error('Plateau maison introuvable (partie ' + partieId + ').');

      return resoudreAction(plateauMaison, carte, action, demanderChoix).then(function (resultat) {
        if (!resultat.succes || !resultat.mutations.length) {
          return resultat;
        }

        var champs = {};
        resultat.mutations.forEach(function (m) { champs[m.champ] = resultat.plateauMaisonApres[m.champ]; });

        return GameService.majPlateauMaison(partieId, champs).then(function () {
          return AnnulationService.empiler(partieId, {
            source: carte.focus + ' — ' + (action.action || 'action'),
            mutations: resultat.mutations
          });
        }).then(function () {
          return resultat;
        });
      });
    });
  }

  /**
   * 17/08/2026 (Session 5, Phase 5 — Civilisation) : wrapper public léger
   * autour de resoudreJson_ (aucune nouvelle logique), pour permettre à
   * civilisationService.js de résoudre l'effet d'une case de piste de
   * Civilisation en réutilisant CE moteur plutôt que d'en dupliquer un
   * second. Toujours "pur" : ne fait aucune écriture, retourne
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
    jouerActionEtPersister: jouerActionEtPersister,
    // Exposés pour les tests / debug uniquement :
    BONUS_COMMERCE: BONUS_COMMERCE,
    CLES_SECTEUR_HORS_PERIMETRE: CLES_SECTEUR_HORS_PERIMETRE,
    CLES_CIVILISATION_HORS_PERIMETRE: CLES_CIVILISATION_HORS_PERIMETRE
  };
})();
