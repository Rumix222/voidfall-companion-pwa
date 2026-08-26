/**
 * version.js
 * Version 103 — 2026-08-26
 * Source de vérité unique pour la version de l'application.
 *
 * 26/08/2026, dernière fois (chantier Technologies — popup 'gagner_
 * technologie' : "Améliorée" verrouillée à l'offre du cycle + rappel
 * complet à la sélection, retour utilisateur : "propose la version
 * améliorée uniquement si la technologie est dans l'offre sur le plat.
 * galactique et à partir du cycle 2 ; à la sélection dans la ddl, ajoute
 * le texte de l'effet immédiat et le nombre d'influence") :
 * - "Améliorée" n'est proposée QUE si la Technologie sélectionnée dans la
 *   liste fait partie de l'offre "Technologies avancées" du cycle en
 *   cours — GameService.obtenirTechnologiesAvanceesGroupes(partie).actif,
 *   même source de vérité que la case "Améliorée" du Plat. maison ([] au
 *   cycle 1, couvre "à partir du cycle 2" sans vérification de cycle
 *   séparée). DÉPEND du nom de la Technologie choisie (pas un simple
 *   "verrouillé/déverrouillé" global comme avant) : la zone niveau
 *   (rangée-choix côté Feuille, <select> côté #modal-choix) se reconstruit
 *   dynamiquement à chaque changement de sélection dans la ddl —
 *   feuilleFlowGagnerTechnologie_/#modal-choix, strategieService.js.
 * - Le rappel sous la ddl (déjà le texte de la Technologie, texteAmeliore
 *   si "Améliorée" choisie) s'enrichit de 2 lignes : "Effet immédiat :
 *   ..." (nouvelle table gameService.js TEXTE_EFFET_IMMEDIAT_TECHNOLOGIE_,
 *   texte FR écrit à la main technologie par technologie en PARALLÈLE de
 *   EFFET_TECHNOLOGIE_IMMEDIAT_/TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_ —
 *   "si dispo dans catalogue", donc seulement les 3 technologies déjà
 *   portées) et "+N Influence." (calculé depuis GameService.
 *   INFLUENCE_TECHNOLOGIE_BASE/DELTA_AMELIOREE, réagit aussi au niveau
 *   choisi — "Aucun gain d'Influence" si `sansPoint`). Les 3 nouvelles
 *   tables/constantes gameService.js sont exposées publiquement (comme
 *   INFO_PROGRAMME_PAR_TYPE) pour rester une SEULE source de vérité avec
 *   ce que gagnerTechnologieEtResoudreEffet/definirTechnologieAmelioree
 *   résolvent réellement — jamais une copie dupliquée côté affichage.
 * 145 tests au vert. Vérifié en navigateur réel (Feuille ET #modal-choix,
 * partie forcée cycle 1 puis cycle 2 avec 4 technologies dans l'offre) :
 * cycle 1 -> aucune Technologie n'offre "Améliorée" ; cycle 2, Technologie
 * dans l'offre -> "Améliorée" proposée, bascule bien le texte/l'Influence
 * affichés (+4 -> +6) ; cycle 2, Technologie HORS offre -> "Améliorée"
 * non proposée même si le catalogue l'autoriserait pour cette carte.
 * Aucune erreur JS sur les 2 chemins (Focus Innovation "Inventer" ET
 * avancement de Piste de Civilisation, Gouvernement Case 2).
 * Fichiers touchés : js/gameService.js, js/strategieService.js,
 * version.js.
 *
 * 25/08/2026, avant (chantier Technologies — gain d'Influence lié
 * à la VALEUR d'une Technologie obtenue, retour utilisateur : "à la
 * création de la partie on définit 5 techno avec gain et 3 sans gain...
 * les techno de base font gagner 4 influence, les techno avancées 6") :
 * - `INFLUENCE_TECHNOLOGIE_BASE_` (4) / `INFLUENCE_TECHNOLOGIE_
 *   DELTA_AMELIOREE_` (2, soit 4+2=6 Améliorée — une seule source de
 *   vérité pour "6", jamais dupliquée) : gagnerTechnologieEtResoudreEffet
 *   accorde +4 Influence à l'acquisition de toute Technologie du pool
 *   "avec gain" (sansPoint === false — 5 des 8 technologies des maisons
 *   déchues, fixé à la mise en place, déjà en place avant ce chantier) ;
 *   `definirTechnologieAmelioree` accorde/retire ±2 Influence à CHAQUE
 *   changement de la case "Améliorée" (couvre aussi bien l'amélioration
 *   normale — case cochée plus tard, cycle débloqué — que le niveau
 *   Améliorée accordé directement à l'acquisition, Focus Innovation
 *   "Inventer"). SÉPARÉ de tout gain d'Influence propre à l'effet
 *   immédiat de la carte elle-même (ex. Nacelles/Bonus Commerce "Gagnez 3
 *   Influence") : les deux s'additionnent, ce n'est pas un doublon.
 *   `sansPoint` (3 des 8) : aucun gain, dans un sens comme dans l'autre.
 *   Volontairement PAS appliqué à la Technologie de départ (jamais
 *   "acquise" via une action, hors périmètre de ce chantier pour
 *   l'instant).
 * 145 tests au vert. Vérifié en navigateur réel (3 scénarios, Influence
 * remise à 0) : Technologie "avec gain" De base -> exactement +4 ;
 * Technologie "avec gain" Améliorée (Nacelles, effet immédiat propre
 * "Gagnez 3 Influence" inclus) -> +4+2+3 = +9 au total ; Technologie
 * `sansPoint` (Boucliers, forcée pour ce test) prise Améliorée ->
 * Influence bien INCHANGÉE. Journal lisible : chaque composante
 * (valeur de base, delta Améliorée, effet propre de la carte) sur sa
 * propre ligne.
 * Fichiers touchés : js/gameService.js, version.js.
 *
 * 25/08/2026, avant (chantier "résolution des Technologies",
 * lancement — 3 premières technologies portées : Nacelles/Boucliers
 * (Valnis), Collecte de données (Belitan), toutes maisons de complexité
 * 1) :
 * - Plat. maison, "Technologies obtenues" (5 emplacements) : le <select>
 *   de choix manuel disparaît (retour utilisateur : "les techno sont
 *   gagnées via des actions") — affichage en lecture seule, nom cliquable
 *   pour révéler son texte (texteAmeliore si "Améliorée" cochée et fourni
 *   par le catalogue, sinon le texte de base), même gabarit visuel que
 *   .programme-nom-toggle/.programme-detail-texte (Programmes, juste
 *   en-dessous sur le même écran). La case "Améliorée" reste (mécanique
 *   DISTINCTE — améliore une Technologie déjà obtenue, peu importe
 *   comment) : mise à jour en place (title + panneau détail) sans
 *   re-render complet, pour ne pas refermer un panneau déjà ouvert.
 * - gameService.js : nouvelle GameService.gagnerTechnologieEtResoudreEffet
 *   (partieId, slot, nomTechnologie, amelioree, demanderChoix) — compose
 *   choisirTechnologieObtenue + definirTechnologieAmelioree + résolution
 *   de l'effet immédiat (technologies.json, champ `immediat`, jusqu'ici
 *   jamais interprété). 2 nouvelles tables de traduction (vocabulaire
 *   `immediat` du catalogue Technologies -> ce que le moteur PWA sait
 *   déjà résoudre), étendues technologie par technologie au fil du
 *   chantier :
 *   - EFFET_TECHNOLOGIE_IMMEDIAT_ : sous-ensemble déjà exprimable en JSON
 *     Effet FocusEngine (gains simples, gagner_commerce, activer_cube) —
 *     résolu via FocusEngine.resoudreEffet, EXACTEMENT comme GameService.
 *     utiliserProgramme (même moteur, même demanderChoix transmis tel
 *     quel — nécessaire, ex. Nacelles/"gagner_commerce" déclenche la
 *     popup 'bonus_commerce', choix parmi les 6 Bonus Commerce fixes).
 *   - TECHNOLOGIES_DEPLOIEMENT_SECTEUR_MERE_ : `immediat.deploy` à
 *     destination TOUJOURS fixe "Secteur-Mère" (jamais un choix du
 *     joueur) — hors du vocabulaire FocusEngine, résolu par un appel
 *     direct SecteurService.deployerCube/obtenirSecteurMere.
 *   Le reste de `immediat` (et tout `permanent`/`ameliore`) demeure hors
 *   périmètre (bonus de combat/production non modélisés) — toute
 *   Technologie SANS entrée dans ces 2 tables n'a, pour l'instant, aucun
 *   effet immédiat résolu automatiquement (étendre ces tables est la
 *   suite prévue de ce chantier).
 * - strategieService.js : popup 'gagner_technologie' (Feuille d'action
 *   ET #modal-choix) — liste déroulante <select>/<optgroup> groupée par
 *   maison déchue (retour utilisateur : "semblable à programme"),
 *   remplace l'ancienne liste de rangées-choix (Feuille) / le <select>
 *   sans groupe (#modal-choix) ; un rappel du texte de la Technologie
 *   sous le select (comme pour un Programme), réactif au niveau choisi
 *   (De base/Améliorée). Le Valider appelle désormais GameService.
 *   gagnerTechnologieEtResoudreEffet au lieu de choisirTechnologieObtenue
 *   seule — le résumé "Technologie ... obtenue (niveau)." affiché au
 *   joueur inclut désormais le détail de l'effet immédiat le cas échéant.
 * - Gain d'Influence : déjà couvert nativement dès qu'un effet immédiat
 *   futur en comportera un (clé "influence", déjà comprise par
 *   FocusEngine — CLES_SIMPLES) — vérifié qu'aucune des 28 technologies
 *   du catalogue n'a actuellement d'Influence dans son `immediat` (le
 *   mécanisme d'Influence liée aux Technologies déjà en place,
 *   "N par Technologie améliorée", focusEngine.js, est un effet Focus/
 *   Piste SÉPARÉ, pas un gain automatique à l'acquisition).
 * 145+19+13 tests au vert (145 *.test.js + 19 civilisationService_test.js
 * + 13 gameService_cycle_focus_technologie.test.js, ainsi que les 9
 * autres fichiers *_test.js/test_*.js individuels, tous verts). Vérifié
 * en navigateur réel (Playwright, gabarit iPhone, adversaires forcées à
 * Valnis+Belitan pour disposer des 3 technologies) : Nacelles (Bonus
 * Commerce en repli #modal-choix fonctionnel, +1 cube actif), Collecte de
 * données (+2 Crédit +2 Science), Boucliers (1 Corvette déployée sur le
 * Secteur-Mère confirmé via SecteurService.obtenirSecteurMere) — les 3
 * bien inscrites au Plat. maison, texte dépliable au clic, aucune erreur
 * JS.
 * Fichiers touchés : index.html, js/gameService.js,
 * js/strategieService.js, version.js.
 *
 * 25/08/2026, avant (retouche visuelle du stepper de Coût +
 * Focus Innovation "Inventer" — gagner une Technologie) :
 * - `.cout-stepper-resume` (css/style.css) : marge au-dessus réduite de
 *   8px à 4px (retour utilisateur : "un peu moins d'espace entre la
 *   barre de ressource et le nombre en dessous").
 * - `gagner_technologie` (focusEngine.js, clé jusqu'ici SANS AUCUNE
 *   résolution — repli générique "effet non chiffré... à appliquer
 *   manuellement", jamais automatisée) obtient désormais un cas dédié :
 *   ouvre une popup dédiée (contexte 'gagner_technologie') qui liste les
 *   technologies encore disponibles parmi les 4 maisons déchues
 *   (partie.adversaires), choisie automatiquement au premier emplacement
 *   libre des 5 "Technologies obtenues" (comme gagner_programme n'impose
 *   pas quel emplacement de Programme). Si `valeur` propose plusieurs
 *   niveaux (tableau, ex. ["base","amelioree"]), un second choix permet
 *   de trancher — ceci COURT-CIRCUITE délibérément la restriction
 *   habituelle "Technologies avancées" (verrouillée hors du bon cycle) :
 *   c'est exactement ce que ce tableau signifie dans le catalogue, pas un
 *   bug. Persiste via GameService.choisirTechnologieObtenue (+
 *   GameService.definirTechnologieAmelioree si "Améliorée" retenu) —
 *   fonctions déjà existantes et testées, réutilisées telles quelles
 *   (aucune modification de gameService.js).
 * - Double implémentation (comme 'gagner_programme') : `feuilleFlow
 *   GagnerTechnologie_` (strategieService.js, Feuille d'action) pour Focus
 *   Innovation Standard "Inventer" (`CARTES_ELIGIBLES_FEUILLE_`,
 *   `FEUILLE_TYPES_SUPPORTES_` étendus) ET une branche équivalente dans
 *   `#modal-choix` — INDISPENSABLE, pas une simple précaution : la clé
 *   "gagner_technologie" est aussi déclenchée par des cases de Piste de
 *   Civilisation (pistesCivilisation.json, ~14 occurrences) via
 *   CivilisationService.avancerPiste, un chemin qui n'est JAMAIS scopé à
 *   la Feuille (carteEnFeuille_ reste toujours faux pour un avancement de
 *   piste) — sans ce 2e cas, ces cases seraient tombées sur une popup
 *   vide (repli `{annule:true}` de demanderChoixFeuille_, hors périmètre
 *   Feuille).
 * - civilisationService.js : le mécanisme `texteRappelPourCle_`/
 *   `afficherRappelsManuelsEtAjusterJournal_` dédié à "gagner_technologie"
 *   (rappel "Choisir une technologie... manuellement", basé sur la
 *   détection du gabarit générique "à appliquer manuellement" dans le
 *   journal) devient MORT pour cette clé — cette clé n'emprunte plus
 *   jamais ce gabarit désormais — même principe que le devenir de ce
 *   même mécanisme pour "gagner_programme" lors de sa propre migration
 *   (voir commentaires historiques du fichier, dead code volontairement
 *   laissé en place, pas de suppression). 2 tests civilisationService_test.js
 *   mis à jour en conséquence (asserts sur l'ancien comportement "rappel
 *   manuel" remplacés par l'assertion du nouveau contexte
 *   'gagner_technologie' — cross-realm deepStrictEqual évité sur les
 *   tableaux `niveaux`, harnais de test vm avec JSON injecté dans le
 *   sandbox, comparaison élément par élément à la place). 145+19 tests au
 *   vert (145 *.test.js + 19 civilisationService_test.js, ainsi que les 10
 *   autres fichiers *_test.js/test_*.js individuels, tous verts). Vérifié
 *   en navigateur réel (Focus Innovation "Inventer") : écran combiné
 *   Coût ("2 Science.") + Effet (8 technologies proposées, labellées par
 *   maison d'origine — bug mineur préexistant corrigé au passage,
 *   t.maison était toujours `undefined` sur partie.adversaires[].
 *   technologies[] car formatMaison_ (gameService.js) ne garde que
 *   {nom, type, texte, texteAmeliore} — rattaché localement à l'affichage
 *   sans toucher gameService.js), choix du niveau (De base/Améliorée),
 *   Technologie bien inscrite au premier emplacement libre du Plat.
 *   maison avec le bon niveau, journal propre ("Technologie ... obtenue
 *   (Améliorée)."), aucune erreur JS.
 * Fichiers touchés : css/style.css, focusEngine.js, strategieService.js,
 * civilisationService_test.js, version.js.
 *
 * 25/08/2026, avant (Focus Innovation "Consolider" — retour
 * utilisateur : "il ne faut pas répéter 3 fois le stock une fois suffit,
 * comme ça on peut resserrer les slide des ressource") :
 * `feuilleSectionCoutHTML_` affiche désormais un SEUL rappel de stock
 * groupé ("Stock : 1 Énergie, 1 Matériel, 1 Nourriture, 10 Crédit.") en
 * tête de la section Coût dès que 2 steppers ou plus sont affichés côte à
 * côte (le Crédit étant de toute façon un pool UNIQUE partagé — répéter
 * "N Crédit" sous chaque stepper n'apportait rien), au lieu d'un rappel
 * individuel sous CHAQUE stepper — `feuilleStepperCoutHTML_` reçoit un
 * nouveau paramètre `masquerHint` qui omet ce texte (l'indicateur
 * "Insuffisant" par ressource, span#avert-{id}, reste inchangé, juste
 * sans le texte de stock qui l'accompagnait). L'espacement vertical entre
 * steppers est réduit en conséquence (14px -> 6px) une fois ce texte
 * disparu. Comportement des cartes à UNE seule ressource substituable
 * (Conquête/Développement/Rechercher) inchangé (rappel individuel
 * toujours affiché, seuil à 2 steppers). 145 tests au vert, vérifié en
 * navigateur réel (Focus Innovation "Consolider") : un seul rappel de
 * stock visible, 3 barres resserrées, ressources correctement débitées.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 25/08/2026, avant (Historique : le warning périmé
 * "effet_secteur non automatisé" disparaît quand l'action l'a en fait
 * traité + Feuille d'action sur Focus Innovation Standard) :
 * - `filtrerJournalEffetSecteurResolu_` (strategieService.js, NOUVEAU) :
 *   focusEngine.js pousse TOUJOURS l'avertissement "effet_secteur non
 *   automatisé" en résolvant l'Effet (avant le Coût, où la construction
 *   réelle a lieu côté Feuille pour "Installer") — il n'a aucun moyen de
 *   savoir que l'UI le traitera plus tard. Ce filtre d'AFFICHAGE (pas la
 *   donnée en base) retire cette ligne du journal quand la MÊME
 *   résolution contient aussi une ligne "construite/établie sur le
 *   Secteur", preuve qu'elle a bien été traitée. Vérifié en navigateur
 *   réel (Focus Développement "Installer") : le journal affiche
 *   uniquement "Cube de Corvette rappelé... Guilde Fermiers établie...",
 *   plus aucune trace d'"effet_secteur".
 * - Focus Innovation Standard (Rechercher/Inventer/Consolider) porté sur
 *   la Feuille d'action, `CARTES_ELIGIBLES_FEUILLE_` étendue. Nécessitait
 *   de généraliser le système de paiement combiné Coût+Effet (jusqu'ici
 *   limité à UNE seule ressource substituable par action) : "Consolider"
 *   (cout:{energie:1, materiel:1, nourriture:1}) est la première carte
 *   avec 3 ressources substituables SIMULTANÉMENT.
 *   `feuilleInfosCoutInitial_`/`feuilleSectionCoutHTML_` renvoient/
 *   affichent désormais un TABLEAU `substituables` (un stepper par
 *   ressource) au lieu d'un `cle`/`montant` unique ; `feuillePrepaiement_`
 *   devient une MAP `{cle: {montant, utiliseRessource}}` au lieu d'un
 *   objet unique ; nouvelle `feuilleBrancherSectionCout_` recalcule le
 *   budget Crédit PARTAGÉ (le même compte pour les 3 steppers) à chaque
 *   changement et désactive Valider si l'engagement total dépasse le
 *   Crédit réel disponible. `feuilleFlowGagnerProgramme_` affiche
 *   maintenant elle aussi une section Coût combinée quand elle est le
 *   premier écran (cas de "Consolider", effet direct sans wrapper
 *   choice). Deux nouveaux flows auto-résolutifs (aucune interaction —
 *   ports directs des branches #modal-choix 'influence_secteur'/
 *   'produire_revenu') : `feuilleFlowInfluenceSecteur_` (Influence
 *   variable par Guilde/Installation/cube/secteur Pur) et
 *   `feuilleFlowProduireRevenu_` (production actuelle d'une ressource
 *   précise) — "Rechercher" (et/ou Science+Crédit / Influence). Labels
 *   manquants ajoutés à `LIBELLES_OPTIONS` (produire_credit/energie/
 *   materiel/nourriture/science, influence_par_*) — affichaient sinon la
 *   clé brute JSON dans la liste et/ou.
 * - Bug de course DÉCOUVERT en testant ces 2 nouveaux flows auto-
 *   résolutifs (les premiers assez rapides — quelques ms — pour
 *   l'exposer ; jamais rencontré avant, toute carte migrée jusqu'ici
 *   exigeait une vraie interaction utilisateur, largement plus lente que
 *   l'animation) : `feuilleRendreEtape_` planifie l'échange de contenu
 *   (nouveau HTML + recalcul de hauteur) dans un `setTimeout` non suivi —
 *   si l'étape se résout ET que `jouerAction_` ferme toute la feuille
 *   AVANT que ce timeout ne se déclenche, celui-ci s'exécute quand même
 *   APRÈS coup, réinjecte du HTML périmé et rouvre visuellement la
 *   feuille (figée). Un second bug, plus profond, est apparu en corrigeant
 *   le premier : `feuilleFlowGagnerProgramme_` pousse un écran
 *   "Chargement…" PUIS rappelle `feuilleRendreEtape_` une 2e fois sur la
 *   MÊME étape une fois les Programmes chargés (2 appels avant que le 1er
 *   timeout n'ait eu le temps de se déclencher) — chaque appel ajoutait sa
 *   propre classe de transition SANS retirer celle du précédent, la
 *   laissant orpheline pour toujours (opacité 0 figée en permanence) :
 *   1er cas qui déclenche ce double rendu assez tôt pour l'exposer, sur
 *   Focus Innovation "Consolider" (corps de la Feuille resté visuellement
 *   VIDE malgré un contenu bien présent dans le DOM). Les deux corrigés en
 *   suivant/nettoyant systématiquement les classes de transition
 *   résiduelles (`feuilleTimeoutEntree_`, nouveau) plutôt qu'au cas par
 *   cas. 145 tests au vert. Vérifié en navigateur réel (Playwright,
 *   gabarit iPhone, partie réelle) : Rechercher (et/ou complet, labels
 *   corrects, feuille se referme proprement), Inventer (0 écran
 *   interactif — cout science + effet gagner_technologie tous deux hors
 *   périmètre — flash minime ~6px avant fermeture, acceptable), Consolider
 *   (3 steppers colorés visibles et fonctionnels, Programme obtenu,
 *   ressources débitées 1/1/1 correctement) — aucune erreur JS sur tout le
 *   parcours des 3 actions.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 25/08/2026, avant (Focus Développement "Installer" — refonte
 * de l'écran, retour utilisateur : "ça ne fonctionne pas" (l'entrée
 * précédente enchaînait Coût puis Effet sur 2 écrans SÉPARÉS, section
 * "Effet" affichée en HAUT sans son propre choix de secteur visible) —
 * "la sélection du secteur pour le coût doit être dans la section coût
 * (en haut), dans la partie effet je dois sélectionner guilde ou
 * installation, puis le type") :
 * `feuilleFlowRappelerCubeCout_` fusionne désormais Coût et Effet sur UN
 * SEUL écran, dans le bon ordre : "Coût" (secteur + type de vaisseau)
 * TOUJOURS en haut, "Effet" (Guilde et/ou Installation) en dessous — la
 * section Effet se recalcule DYNAMIQUEMENT (sans nouvel appel réseau, les
 * éligibilités des 2 catégories pour TOUS les secteurs sont chargées une
 * seule fois au départ) à chaque changement du `<select>` Secteur, pour
 * refléter les emplacements réellement libres sur le secteur choisi. Au
 * clic sur Valider : rappelle le cube PUIS enchaîne
 * (feuilleTraiterCategoriesConstruction_, nouvelle — reprend le
 * séquencement de l'ex-feuilleEnchainerEffetSecteurConstruction_,
 * supprimée) le sous-choix du TYPE précis pour chaque catégorie cochée,
 * l'une après l'autre. Titre de l'écran aligné sur les autres écrans
 * combinés Coût+Effet (nom de l'action, "Développement — Installer" —
 * plus "Rappeler un cube", redondant avec le titre de la section Coût).
 * 145 tests au vert (aucune régression métier — même logique
 * SecteurService.construire/rappelerCube, seule la présentation change).
 * Vérifié manuellement dans un vrai navigateur (Playwright, partie
 * réelle) : contenu HTML confirme "Coût" avant "Effet" ; changement de
 * secteur re-calcule bien les options disponibles (Secteur 1 -> Guilde
 * seule, Secteur 11 -> Guilde ET Installation) ; parcours complet des 2
 * catégories sur le même secteur, persistance réelle confirmée, jamais
 * l'ancienne modale affichée, aucune erreur JS.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 25/08/2026, avant (Focus Développement "Installer" — l'Effet
 * (Guilde et/ou Installation) utilise désormais le secteur choisi pour le
 * Coût comme destination, retour utilisateur : "pour la partie coût
 * proposer les secteurs où je peux retirer un cube, et pour la partie
 * effet utiliser ce secteur comme destination") :
 * `focusEngine.js` classe `effet_secteur` hors périmètre
 * (CLES_SECTEUR_HORS_PERIMETRE) : AUCUN `demanderChoix` n'est jamais émis
 * pour l'Effet de "Installer" (résolu silencieusement, "à appliquer
 * manuellement") — le SEUL point d'accroche possible est donc à
 * l'intérieur même de la résolution du Coût (`rappeler_cube_cout`), qui
 * partage son secteur avec l'Effet selon le texte de la carte ("Dans le
 * secteur d'où vous avez rappelé le cube...").
 * - Nouvelle `feuilleEnchainerEffetSecteurConstruction_` : une fois le
 *   cube rappelé, vérifie `action.effet.effet_secteur` (générique — pas
 *   le nom de l'action, couvre aussi une future carte au même
 *   sous-ensemble de clés) ; si 'guilde'/'installation' y figurent,
 *   vérifie l'éligibilité RÉELLE du secteur du rappel
 *   (SecteurService.obtenirSecteursEligiblesConstruction, filtré sur ce
 *   numéro précis) puis enchaîne, DANS LA MÊME feuille, un choix inclusif
 *   (et/ou, fidèle au texte de la carte) → pour chaque catégorie cochée,
 *   un sous-choix du type précis (Guilde : Fermiers/Ingénieurs/etc. ;
 *   Installation : Chantier Naval/etc.) → persistance via
 *   SecteurService.construire pour chacune, séquentiellement. Repli
 *   inchangé (résolution immédiate) si le secteur n'a aucun emplacement
 *   libre, ou si la carte n'utilise pas ces 2 clés (ex. "Progrès Standard
 *   Restaurer" du catalogue, `effet_secteur:['retirer_corruption',
 *   'regrouper']` — non couvert ici, hors périmètre tant que non migrée
 *   à la Feuille).
 * 145 tests au vert (aucune régression — logique métier inchangée,
 * réutilise SecteurService.construire/obtenirSecteursEligiblesConstruction
 * déjà existants). Vérifié manuellement dans un vrai navigateur
 * (Playwright, partie réelle) : rappel de cube sur un secteur avec
 * emplacements Guilde ET Installation libres -> choix et/ou -> les 2
 * construites l'une après l'autre sur CE secteur -> persistance réelle
 * confirmée en base (guildeFermiers/installationChantierNaval incrémentés
 * sur le bon secteur) -> jamais #modal-choix affiché, aucune erreur JS.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 25/08/2026, avant (Historique allégé + Feuille d'action portée
 * sur Focus Développement Standard, retour utilisateur : "continuons
 * l'implémentation du nouveau pattern sur le focus développement") :
 * - Historique ("Actions réalisées", #ressources-journal) : "ne pas
 *   rappeler le focus et l'action dans les sous-sections... on l'a déjà
 *   dans la section principale" — chaque sous-ligne d'un cadre répétait
 *   son titre en préfixe (ex. "Conquête — Planifier (effet) : ..."), déjà
 *   affiché comme titre du cadre. Nouvelle fonction
 *   `allegerLigneJournal_` (renderJournal_) retire ce préfixe s'il
 *   correspond EXACTEMENT au titre du cadre — ne touche jamais un cadre
 *   dont les sous-lignes ont un préfixe différent (ex. le cadre "Piste X"
 *   de CivilisationService.avancerPiste, laissé intact).
 * - Feuille d'action étendue à Focus Développement Standard (Harmoniser/
 *   Croître/Installer) — 2e carte migrée, `CARTES_ELIGIBLES_FEUILLE_`
 *   devient une liste (plan de migration, mémoire persistante : "petit à
 *   petit", #modal-choix retiré seulement à la fin). 4 nouveaux
 *   `feuilleFlow*_`, portage direct des branches #modal-choix
 *   équivalentes (même logique métier, SANS changement) :
 *   - `feuilleFlowRetirerCorruption_` ("Harmoniser") : menu de cibles
 *     Secteur/Piste/Programme/Chambres de décontamination, réutilise le
 *     choix de Programme numéroté (1/2/3) introduit pour "Déplacer une
 *     Corruption" (dupliqué volontairement, pas factorisé, pour ne pas
 *     risquer de régression sur du code déjà vérifié — factorisation
 *     prévue une fois toutes les cartes migrées).
 *   - `feuilleFlowConstruire_` ("Croître") : secteur + type via
 *     `<select>` (`.regrouper-form`, même composant que Regrouper/
 *     Envahir).
 *   - `feuilleFlowAugmenterPopulationPure_` ("Harmoniser", autre
 *     branche) : simple choix de secteur en rangée-choix.
 *   - `feuilleFlowRappelerCubeCout_` ("Installer") : secteur + type via
 *     `<select>` ; "Installer" n'a AUCUN choix d'Effet (`effet_secteur`
 *     hors périmètre de focusEngine.js, résolu silencieusement) — cet
 *     écran est donc son SEUL écran, affiche une section "Effet"
 *     statique en plus du formulaire (même principe que
 *     feuilleFlowPaiementRessource_ pour Focus Conquête "Préparer").
 * 145 tests au vert (aucune régression — logique métier inchangée,
 * seule la fonction appelante change). Vérifié manuellement dans un vrai
 * navigateur (Playwright, partie réelle + Programmes forcés via
 * IndexedDB) : Harmoniser (les 2 branches, y compris le retrait de
 * Corruption sur Programme numéroté) ; Croître (coût combiné + choix
 * secteur/type) ; Installer (section Effet statique + rappel de cube) —
 * jamais #modal-choix affiché sur les 3 actions, aucune erreur JS ;
 * historique confirmé sans répétition du titre dans les sous-lignes.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 25/08/2026, avant (Feuille d'action — "Déplacer une
 * Corruption" : libellé, rappel de la source, choix du Programme
 * numéroté, titres cohérents — retour utilisateur) :
 * - Libellé manquant : "deplacer_corruption" (clé brute) s'affichait dans
 *   la liste "et/ou" (ex. Focus Conquête "Planifier") — `LIBELLES_OPTIONS`
 *   n'avait jamais cette entrée. Ajoutée : "Déplacer une Corruption".
 * - Rappel des choix précédents : les écrans Destination (catégorie ET
 *   sous-choix) affichent désormais "Source : X." en haut — repris de
 *   l'ancienne #modal-choix (qui le faisait déjà), perdu lors du premier
 *   portage en Feuille (entrée d'il y a plusieurs versions).
 * - Choix du Programme désormais RÉELLEMENT implémenté (auparavant "à
 *   retirer/placer manuellement", aucune écriture) : emplacements 1/2/3 de
 *   la fiche Maison (hors Programme de départ, sans notion de Corruption)
 *   sélectionnables par leur NUMÉRO — Source limité aux emplacements
 *   CORROMPUS, Destination aux NON corrompus. Écrit `.corrompu` sur
 *   `plateauMaison.programmesUtilises` (même pattern que le clic manuel
 *   sur la case "Cor." de l'écran Plat. maison — `corruptionMaison` suit
 *   le même delta ±1).
 *   - PRÉREQUIS (`index.html`, `renderProgrammesPlateauMaison_`) : les 3
 *     emplacements 1/2/3 affichent désormais leur numéro en préfixe
 *     ("1. Nom (Type)") sur l'écran Plat. maison, pour que le joueur
 *     retrouve l'emplacement désigné par son numéro dans la popup.
 * - Titres incohérents corrigés : seul le tout premier écran ("Source")
 *   portait le préfixe "Déplacer une Corruption — " ; les écrans suivants
 *   (Source — Secteur/Piste, Destination, Destination — Secteur/Piste)
 *   affichaient un titre tronqué ("Source — Secteur", "Destination"...).
 *   Tous préfixés uniformément maintenant.
 * - Bug latent corrigé au passage : `afficherSousChoixSource_` (sous-choix
 *   Secteur/Piste/Programme de la Source) n'était pas marquée
 *   `racineSequence:false` — "← Retour" y restait masqué à tort (même
 *   bug que celui corrigé pour Programme/Corruption dans une entrée
 *   précédente, resté sur cette seule fonction).
 * - Comptage des pastilles d'étape confirmé inchangé (2, "Source"/
 *   "Destination") : les sous-écrans (catégorie, sous-choix Secteur/
 *   Piste/Programme) restent toujours rattachés à la même pastille que
 *   leur phase (etapeIndex 0 pour tout ce qui précède la Destination, 1
 *   pour tout le reste) — comportement déjà correct, pas de régression.
 * 145 tests au vert (aucune régression sur SecteurService.js/
 * CivilisationService.js/GameService.js — seule la fonction appelante
 * change). Vérifié manuellement dans un vrai navigateur (Playwright,
 * emplacements Programme forcés via IndexedDB) : parcours complet Source
 * (Programme 1 corrompu) -> Destination (Programme 2 non corrompu),
 * rappel "Source : Programme 1..." affiché, titres cohérents à chaque
 * étape, ET persistance réelle vérifiée en base après coup (emplacement 1
 * décorrompu, emplacement 2 devenu corrompu) — aucune erreur JS.
 * Fichiers touchés : index.html, strategieService.js, version.js.
 *
 * 25/08/2026, avant (Feuille d'action — couleur Crédit sur la
 * barre + <select>/<optgroup> pour "Gagner un Programme", retour
 * utilisateur) :
 * - `.cout-stepper-seg-credit`/`.valeur-credit` (css/style.css) :
 *   couleur du Crédit (#d1a671, CHAMP_RESSOURCE.credit.couleur) au lieu
 *   du corail générique — même principe que le segment "ressource" déjà
 *   coloré par ressource (entrée précédente). Le badge "Insuffisant"
 *   reste corail (avertissement, pas une couleur de ressource).
 * - `feuilleFlowGagnerProgramme_` : "on peut reprendre la ddl qu'on avait
 *   avant avec séparation par type et étoile sur les programmes de
 *   l'offre" — remplace la liste plate de rangée-choix par le
 *   `<select>`/`<optgroup>` groupé par type (Domination/Force/Soutien/
 *   Richesse) de l'ancienne branche #modal-choix 'gagner_programme'
 *   équivalente plus bas, étoile "★" sur le Programme actuellement révélé
 *   dans l'offre publique conservée, ET le détail (objectif1/objectif2)
 *   affiché sous le select au changement de sélection — repris à
 *   l'identique, seul le conteneur change (feuille au lieu de
 *   #modal-choix).
 * 145 tests au vert. Vérifié manuellement dans un vrai navigateur
 * (Playwright) : couleur du segment Crédit exacte (rgb(209,166,113)) ;
 * 4 groupes de type affichés, détail des objectifs mis à jour au
 * changement de sélection — aucune erreur JS.
 * Fichiers touchés : css/style.css, strategieService.js, version.js.
 *
 * 25/08/2026, avant (Feuille d'action — Regrouper/Envahir
 * portés DANS la feuille + 2 ajustements visuels, retour utilisateur :
 * "quand on passe à l'action regrouper ou envahir il faudrait rester
 * dans la même popup comme dans le POC") :
 * - Écart de scope corrigé : `feuilleFlowRegrouper_`/`feuilleFlowEnvahir_`
 *   (nouvelles) portent DIRECTEMENT dans la feuille les formulaires
 *   auparavant volontairement laissés sur #modal-choix (engagement
 *   multi-unités, calculateur de combat) — portage FIDÈLE des branches
 *   #modal-choix 'regrouper'/'envahir' plus bas dans ce fichier : mêmes
 *   appels métier (SecteurService.obtenirSecteurs/obtenirAdjacences/
 *   obtenirSecteurMere/regrouper/envahirResoudre, CombatService.
 *   resoudreInvasion, GameService.majPlateauMaison pour la Gloire), même
 *   validation (règle "jamais vider un secteur hors Secteur-Mère", etc.),
 *   seul le CHROME change — étape unique ré-affichée en place (même
 *   pattern que la maquette/l'écran Test : `<select>`/`<input>` dans
 *   `.regrouper-form`, déjà stylée pour le thème sombre, réutilisée telle
 *   quelle). `FEUILLE_TYPES_SUPPORTES_` inclut désormais 'regrouper' ET
 *   'envahir' — Focus Conquête Standard "Engager" ne quitte donc plus
 *   jamais la feuille, du choix initial jusqu'au paiement (déjà
 *   pré-capturé sur le premier écran, entrée précédente) en passant par
 *   le combat/regroupement.
 * - Barre du stepper de paiement teintée selon la couleur de la ressource
 *   (`CHAMP_RESSOURCE[cle].couleur`, ex. Énergie -> jaune) au lieu d'une
 *   couleur neutre fixe — `feuilleStepperCoutHTML_` accepte désormais un
 *   paramètre `couleur` optionnel (segment Crédit inchangé, toujours
 *   corail).
 * - `.feuille-separateur` (ligne courte avant "Effet") centrée
 *   (`margin: 20px auto` au lieu de `20px 0`).
 * 145 tests au vert (aucune logique métier touchée — SecteurService.js/
 * CombatService.js/GameService.js inchangés, seule la fonction qui les
 * appelle change). Vérifié manuellement dans un vrai navigateur
 * (Playwright, ressources forcées via IndexedDB) : Regrouper complet
 * (ajout d'un déplacement réel, validé, coût débité) SANS jamais afficher
 * #modal-choix ; Envahir complet (combat réel résolu, log affiché,
 * défaite gérée correctement) SANS jamais afficher #modal-choix ;
 * couleur de barre vérifiée par calcul (rgb exact) ; séparateur vérifié
 * centré (marges gauche/droite égales) — aucune erreur JS.
 * Fichiers touchés : css/style.css, strategieService.js, version.js.
 *
 * 25/08/2026, avant (Feuille d'action — corrige un vrai bug
 * "insuffisant" à tort + 4 ajustements visuels, retour utilisateur après
 * test sur iPhone en production, écran combiné Coût+Effet de l'entrée
 * précédente) :
 * - BUG CORRIGÉ (pas un simple ajustement) : "ça me met insuffisant alors
 *   que j'ai les ressources". `feuilleInfosCoutInitial_` lisait
 *   `partieAffichee.plateauMaison.ressourceEnergie`/`.ressourceCredit`
 *   (champs plats) — ces champs n'existent QUE sur la ligne BRUTE
 *   `plateauMaison` telle que stockée en IndexedDB ; l'objet ASSEMBLÉ que
 *   `partieAffichee` porte réellement (`GameService.assemblerPartie_`,
 *   gameService.js) imbrique les ressources sous
 *   `plateauMaison.ressources.energie`/`.credit` (clés COURTES). Le stock
 *   lu valait donc TOUJOURS 0, déclenchant le message "insuffisant" dès
 *   qu'un coût substituable existait, peu importe la réserve réelle —
 *   n'affectait QUE l'écran combiné (nouveau) ; l'ancien écran
 *   `paiement_ressource` autonome (`contexte.stockRessource` fourni
 *   directement par `focusEngine.js`, jamais lu depuis `partieAffichee`)
 *   n'a jamais été concerné, d'où l'absence de ce bug dans les
 *   vérifications précédentes portant sur lui. Repéré et reproduit en
 *   forçant des ressources abondantes via IndexedDB (Playwright) plutôt
 *   qu'en devinant une origine "chanceuse" — confirmé : `App.
 *   getPartieCourante().plateauMaison.ressourceEnergie` est bien
 *   `undefined`, la bonne clé est `.ressources.energie`.
 * - Hauteur par défaut de la feuille : 42% (entrée précédente) jugé
 *   encore trop petit — passée à 70% de la fenêtre.
 * - Rappel de stock : "X Crédit disponible" → "X Crédit." (mot
 *   "disponible" retiré, redondant).
 * - Message d'insuffisance : la phrase complète ("Insuffisant même en
 *   combinant Crédit et réserve") remplacée par le seul mot "Insuffisant"
 *   (orange), affiché EN LIGNE juste après le rappel de stock plutôt
 *   qu'en paragraphe séparé.
 * - Nouveau séparateur `.feuille-separateur` (css/style.css, 48px de
 *   large, PAS pleine largeur) entre les sections "Coût" et "Effet" des 3
 *   écrans combinés.
 * 145 tests au vert (aucun touché par le bug, hors périmètre de la suite
 * — logique DOM/lecture d'état). Vérifié manuellement dans un vrai
 * navigateur (Playwright, ressources forcées via IndexedDB pour un test
 * déterministe) : stock correctement lu (10/10, avertissement masqué),
 * puis ressources forcées à 0 -> badge "Insuffisant" affiché correctement
 * ; hauteur mesurée à 70% ; séparateur présent ; aucune erreur JS.
 * Fichiers touchés : css/style.css, index.html, strategieService.js,
 * version.js.
 *
 * 25/08/2026, avant (Feuille d'action — écran combiné Coût+Effet
 * dès le premier écran, retour utilisateur : "je pensais que dans le
 * dernier design choisi le coût s'affichait dès le début en haut de la
 * popup, une partie coût et une partie effet, comme dans la maquette
 * variante-c-feuille.html") :
 * Écart identifié entre la maquette (qui combinait TOUJOURS Coût+Effet
 * sur un seul écran) et la production livrée (qui les affichait comme 2
 * écrans séparés et séquentiels — reflet fidèle de la mécanique RÉELLE de
 * `focusEngine.js`, Effet résolu PUIS Coût, via 2 appels `demanderChoix`
 * INDÉPENDANTS). Plutôt que de restructurer `focusEngine.js` (moteur pur,
 * RÈGLE MÉTIER "Effet puis Coût" invariante, risque élevé pour un gain
 * cosmétique), la Feuille "pré-répond" désormais elle-même au 2e appel :
 * - `feuilleFlowOptionExclusive_`/`feuilleFlowOptionsInclusives_` (le
 *   tout premier écran d'une action, `feuillePile_` encore vide)
 *   affichent maintenant AUSSI une section "Coût" (stepper Crédit si la
 *   ressource est substituable, texte fixe sinon — `feuilleInfosCoutInitial_`/
 *   `feuilleSectionCoutHTML_`, nouvelles) à CÔTÉ de la section "Effet"
 *   (choix exclusif/inclusif), sur le MÊME écran — fidèle à la maquette.
 *   La valeur choisie est capturée dans `feuillePrepaiement_` (nouveau)
 *   au clic sur Valider, PAS encore envoyée à focusEngine.js (qui n'a pas
 *   encore demandé le Coût à ce stade).
 * - `feuilleFlowPaiementRessource_` : si le `contexte` reçu correspond
 *   exactement à `feuillePrepaiement_` (même clé/montant), répond
 *   IMMÉDIATEMENT avec la valeur déjà capturée — AUCUN écran
 *   supplémentaire ne s'affiche, l'utilisateur ne voit donc qu'UN écran.
 *   Repli sur le comportement normal (écran dédié) si `feuillePrepaiement_`
 *   est absent ou ne correspond pas — cas Focus Conquête "Préparer" (effet
 *   silencieux `activer_cube`, jamais de choix d'Effet donc jamais de
 *   pré-paiement) : cet écran affiche désormais lui-même une section
 *   "Effet" statique (texte de l'action) en plus du Coût, pour la même
 *   raison — TOUJOURS les 2 sections, même quand l'un des deux volets n'a
 *   rien d'interactif (principe déjà énoncé par la maquette).
 * - Titres des écrans : "Choisissez une option"/"Payer N Ressource"
 *   remplacés par le nom de l'action ("Conquête — Engager", etc.) quand
 *   c'est le premier écran — cohérent avec le fait qu'il combine
 *   désormais 2 informations (Coût ET Effet), pas seulement l'une des
 *   deux.
 * - `feuilleStepperCoutHTML_`/`feuilleBrancherStepperCout_` : nouvel
 *   avertissement dédié ("Insuffisant même en combinant Crédit et
 *   réserve"), affiché/masqué automatiquement selon que le stepper permet
 *   ou non de couvrir le montant — utile maintenant que ce stepper peut
 *   apparaître SANS le message "Insuffisant..." dédié de l'ancien écran
 *   `paiement_ressource` autonome (celui-ci reste inchangé pour son propre
 *   cas, ce nouvel avertissement couvre le cas combiné).
 * `feuilleActionCourante_` (nouveau, `{carte, action}`) posé par
 * jouerAction_ juste avant le premier `demanderChoix`, lu par les
 * fonctions ci-dessus pour accéder au texte/titre/coût de l'action — remis
 * à `null` dans tous les cas de sortie (succès/échec/erreur), comme
 * `carteEnFeuille_`.
 * 145 tests `*.test.js` + toutes les suites `*_test.js` au vert (aucune
 * logique de focusEngine.js touchée — seule la PRÉSENTATION du Coût
 * change de moment, jamais son calcul). Vérifié manuellement dans un vrai
 * navigateur (Playwright, gabarit iPhone, partie réelle) : Préparer
 * (Coût+Effet combinés sur 1 écran, substitution fonctionnelle) ; Engager/
 * Planifier (Coût+Effet combinés sur le 1er écran, avertissement
 * "insuffisant" correctement masqué/affiché selon les fonds réels de la
 * partie testée) — aucune erreur JS.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 25/08/2026, avant (Feuille d'action — ajustements retour
 * utilisateur après test sur iPhone en production, Focus Conquête
 * "Engager") :
 * - Zone de grab (`.feuille-grabber-zone`, css/style.css) : "j'ai du mal à
 *   attraper le grab" — la cible tactile réelle (padding autour de la
 *   barre visuelle 5px) ne faisait qu'environ 21px de haut, sous la norme
 *   Apple HIG (44px min.). Portée à 45px (`padding: 20px 0; min-height:
 *   44px;`), `touch-action: none` explicite dessus (déjà sur `.feuille`
 *   parent, redondance volontaire pour la fiabilité du geste).
 * - Bouton "Annuler"/"Fermer" en bas de la feuille retiré (`#feuille-
 *   annuler` en production, `#test-feuille-annuler` sur l'écran Test) —
 *   "devenu inutile" une fois le geste de glissé fiable (fix ci-dessus) :
 *   les 2 autres façons de rejeter (glissé vers le bas, tap sur le voile)
 *   suffisent. `.feuille-pied-lien` (css/style.css) supprimée, plus
 *   utilisée nulle part.
 * - `feuilleTailleAuContenu_`/`tailleAuContenu` (strategieService.js/
 *   index.html) : "la popup n'est pas assez dépliée de base" — un plancher
 *   absolu de 180px laissait un contenu court (ex. les 2 options
 *   d'Engager) occuper une fraction minime de l'écran. Plancher relatif à
 *   la fenêtre (42% — sensation "demi-feuille" façon Plans iOS) à la
 *   place.
 * - "Il manque la gestion du coût pour pouvoir payer en crédit" (Engager) :
 *   INVESTIGUÉ, PAS UN BUG — vérifié manuellement (Playwright, gabarit
 *   iPhone, Regrouper réel complété jusqu'au bout) que la feuille de
 *   paiement ("Payer 2 Énergie", stepper Crédit) apparaît bien après un
 *   Regrouper/Envahir résolu via le repli #modal-choix — le mécanisme de
 *   "masquage puis résurgence" (feuilleFermer_/feuillePousserEtape_,
 *   entrée précédente) fonctionne correctement. Cause la plus probable du
 *   retour utilisateur : les 3 frictions ci-dessus (grab difficile à
 *   attraper, feuille trop petite) empêchaient probablement d'aller
 *   jusqu'à cette étape lors du test initial — à reconfirmer après ce
 *   correctif plutôt qu'un changement de code supplémentaire sans
 *   diagnostic clair.
 * 145 tests `*.test.js` + toutes les suites `*_test.js` au vert (aucune
 * logique métier touchée, uniquement CSS/DOM/JS de présentation).
 * Vérifié manuellement dans un vrai navigateur (Playwright, gabarit
 * iPhone 390×844, partie réelle) : zone de grab mesurée à 45px, geste de
 * glissé vers le bas toujours fonctionnel (feuille se ferme), hauteur
 * par défaut à 42% de l'écran sur un contenu court, Engager -> Regrouper
 * réel complété -> "Payer 2 Énergie" affiché correctement -> validé,
 * aucune erreur JS.
 * Fichiers touchés : css/style.css, index.html, strategieService.js,
 * version.js.
 *
 * 25/08/2026, avant (Feuille d'action EN PRODUCTION — Focus
 * Conquête Standard, retour utilisateur : "implémente cette version du
 * poc dans la vraie appli sur le même focus") :
 * Après validation sur l'écran Test (état factice), la feuille tactile
 * (maquette-cartes-focus/variante-c-feuille.html) devient un VRAI rendu
 * alternatif de `StrategieService.demanderChoix` — branchée sur les
 * vraies données de la partie, pour de vrai jouable depuis l'écran Focus.
 * - Scope VOLONTAIREMENT limité : `carteEligibleFeuille_` ne couvre QUE
 *   Focus Conquête **Standard** (celle testée tout du long) — Astoran/
 *   Yarvek/Zenor/Héroïque ont un Conquête différent (clés Effet non
 *   couvertes ici), toute autre carte du catalogue continue d'utiliser
 *   `#modal-choix`, INCHANGÉ. `FEUILLE_TYPES_SUPPORTES_` ne couvre que les
 *   5 `contexte.type` que cette carte déclenche réellement
 *   (option_exclusive/options_inclusives/paiement_ressource/
 *   gagner_programme/deplacer_corruption) — "regrouper"/"envahir" (choix
 *   possibles d'Engager, formulaires d'engagement multi-unités/
 *   calculateur de combat) retombent volontairement sur `#modal-choix`
 *   INCHANGÉ même en mode Feuille : la feuille se MASQUE (pas annulée —
 *   `feuillePile_`/`feuilleSequenceEtOu_` intacts) le temps de cette
 *   étape, la modale classique prend le relais, puis la feuille RESSURGIT
 *   automatiquement si une étape Feuille suit (ex. le paiement du coût
 *   d'Engager, après Regrouper/Envahir) — `feuillePousserEtape_` annule le
 *   masquage retardé en attente et ré-affiche le voile.
 * - `jouerAction_` : positionne `carteEnFeuille_` et ouvre la feuille
 *   AVANT même le premier `demanderChoix` (dès l'appui sur l'action, pas
 *   seulement à la première popup) ; la referme dans TOUS les cas
 *   (succès/échec/erreur), filet de sécurité.
 * - `demanderChoix` : nouveau garde-fou tout en haut — intercepte les
 *   types supportés en mode Feuille (`demanderChoixFeuille_`), court-
 *   circuitant tout le reste de la fonction (dont `modal.hidden = false`
 *   en bas) ; sinon masque la feuille si elle était active puis continue
 *   INCHANGÉ.
 * - `demanderChoixFeuille_` + 5 `feuilleFlow*_` réutilisent EXACTEMENT les
 *   mêmes fonctions métier que les branches `#modal-choix` équivalentes
 *   (`SecteurService.retirerCorruption`/`placerCorruption`,
 *   `CivilisationService.definirCorruption`,
 *   `GameService.majPlateauMaison`/`gagnerProgramme`, `DB.getAll
 *   ('programmes')`) — seul le CHROME (rendu HTML/DOM) change, jamais la
 *   logique de persistance. "Déplacer une Corruption" (le plus complexe :
 *   catégorie source → sous-choix → catégorie destination → sous-choix)
 *   troque les `<select>`+bouton "Valider" de la modale contre des
 *   rangées `rangée-choix` — cibles tactiles catégorie navigant
 *   IMMÉDIATEMENT au tap (comme les boutons `.btn-choix-liste` d'origine),
 *   sous-choix Secteur/Piste par rangée + Valider.
 * - Bug de fond corrigé PENDANT la conception (repéré avant tout
 *   dégât — jamais livré cassé) : le bouton "← Retour" restait visible
 *   entre 2 appels `demanderChoix` INDÉPENDANTS (ex. entre "Gagner un
 *   Programme" et "Déplacer une Corruption" au sein d'un même "et/ou"),
 *   permettant de revenir sur une étape dont la Promise était déjà
 *   résolue — un clic Valider dessus ne faisait plus rien, l'action
 *   restait bloquée en attente indéfiniment. Nouveau champ d'étape
 *   `racineSequence` (`false` UNIQUEMENT sur une sous-étape imbriquée DANS
 *   un même flow, ex. destination après source de "Déplacer une
 *   Corruption" — même Promise, pas encore résolue) ; `feuilleRendreEtape_`
 *   ne montre "← Retour" que dans ce cas précis. **Même correctif appliqué
 *   à l'écran Test** (`index.html`, `rendreEtape`), qui portait le même
 *   bug latent (jamais cliqué pendant les vérifications précédentes).
 * - Bug cosmétique corrigé en vérifiant : les rangées "catégorie" de
 *   Déplacer une Corruption (navigation immédiate, pas de sélection
 *   persistante) affichaient à tort une coche ✓ sur la première option par
 *   défaut (`feuilleRangeeChoixHTML_` marque l'index 0 sauf 4e paramètre
 *   explicite) — corrigé en passant `-1` (aucun index par défaut).
 * `index.html` : nouveau markup `#feuille`/`#feuille-scrim` (identique à
 * l'écran Test, ids sans préfixe `test-`) juste après `#modal-choix`.
 * 145 tests `*.test.js` + toutes les suites `*_test.js` au vert (aucune
 * logique de focusEngine.js/gameService.js/secteurService.js/
 * civilisationService.js touchée par ce changement, uniquement
 * strategieService.js/index.html). Vérifié aussi manuellement dans un vrai
 * navigateur (Playwright, script ad-hoc, gabarit iPhone 390×844, partie
 * réelle Belitan) : Préparer (paiement systématique, feuille se ferme
 * après validation) ; Planifier (et/ou réel -> 32 Programmes du VRAI
 * catalogue -> Déplacer Corruption réel avec les VRAIES éligibilités de la
 * partie -> paiement) ; Engager (choix Envahir/Regrouper en Feuille ->
 * repli #modal-choix confirmé pour Regrouper, feuille bien masquée
 * pendant ce temps) — zéro erreur JS sur tout le parcours.
 * Fichiers touchés : strategieService.js, index.html, version.js.
 *
 * 25/08/2026, avant (Substitution Crédit devenue SYSTÉMATIQUE
 * pour Nourriture/Énergie/Matériel — retour utilisateur, après test sur
 * l'écran Test/Feuille d'action sur iPhone : "je veux avoir le choix
 * crédit s'il y a du coût nourriture énergie matériel") :
 * Le POC limité à UNE carte (Focus Conquête "Préparer", entrée
 * précédente) est retenu comme comportement DÉFINITIF ("option 1" des 3
 * envisagées en session — la popup s'ouvre désormais TOUJOURS pour un
 * Coût en Nourriture/Énergie/Matériel, même quand la réserve seule
 * suffit, sur N'IMPORTE QUELLE carte du catalogue (Focus, Programme,
 * Cadre d'Événement — tout ce qui passe par FocusEngine.resoudreCle_).
 * - `focusEngine.js` : supprime `POC_TOUJOURS_PROPOSER_SUBSTITUTION_` et
 *   la condition `etat[champ] < valeur || POC...indexOf(source)` du cas
 *   dédié — ne reste que `RESSOURCES_SUBSTITUABLES_CREDIT_.indexOf(cle)
 *   !== -1 && ... && signe < 0`, inconditionnel. Popup 'paiement_ressource'
 *   (strategieService.js) et `coutSuffisant_` (grisage des boutons Focus)
 *   INCHANGÉS — seule la CONDITION D'OUVERTURE de la popup change, pas sa
 *   mécanique.
 * - `focusEngine.test.js` : 2 tests renommés/réécrits pour refléter le
 *   nouveau comportement par défaut ("réserve suffisante -> popup quand
 *   même" au lieu de "aucune popup") plutôt que testé comme une exception
 *   scopée à une carte ; 3 autres tests (effet_secteur, envahir, regrouper)
 *   dont le coût Énergie n'était qu'un témoin accessoire mis à jour (soit
 *   changé pour un coût en Crédit — non substituable, hors sujet — soit
 *   leur stub `demanderChoix` étendu pour dispatcher aussi sur
 *   'paiement_ressource'). `gameService_evolution18_undo_test.js` : même
 *   correctif sur le stub du test Conquête "Planifier" (cout Énergie).
 * 145 tests `*.test.js` + toutes les suites `*_test.js` au vert après ces
 * changements. Vérifié aussi manuellement dans un vrai navigateur
 * (Playwright, script ad-hoc, écran Test) : Focus Conquête "Planifier"
 * (coût Crédit+Énergie, réserve large) ouvre bien la popup de paiement
 * pour l'Énergie malgré la réserve suffisante, aucune erreur JS.
 *
 * Dans la foulée (même retour utilisateur, écran Test) : sur un choix
 * "et/ou" à 2 options sélectionnées (ex. Focus Conquête "Planifier" —
 * Gagner un Programme ET Déplacer une Corruption), rien ne signalait
 * visuellement qu'une 2e action suivrait la première pendant la
 * résolution de la première, ni qu'on était sur la 2e en la résolvant.
 * - `index.html` (écran Test, `flowOptionsInclusives_`) : dès que ≥ 2
 *   options sont cochées, mémorise leurs libellés dans l'ordre où
 *   `focusEngine.js` va les résoudre (`sequenceEtOu_`) ; chaque flow
 *   délégué susceptible d'apparaître dans un tel choix
 *   (`flowGagnerProgramme_`/`flowDeplacerCorruption_`) préfixe désormais
 *   son titre "Action X/N — " via `consommerEtiquetteSequence_()`, qui
 *   avance le curseur et se réinitialise après la DERNIÈRE action de la
 *   séquence (aussi réinitialisé au début de `jouerActionTest_`, pour ne
 *   jamais fuiter d'une action à l'autre). Limité à l'écran Test pour
 *   l'instant (pas encore porté dans `strategieService.js`/`#modal-choix`,
 *   qui n'a pas ce concept de "feuille unique" pour l'instant).
 * Vérifié manuellement (même script Playwright que ci-dessus) : "Action
 * 1/2 — Gagner un Programme" puis "Action 2/2 — Déplacer une Corruption —
 * source/destination" affichés correctement, aucune erreur JS.
 * Fichiers touchés : focusEngine.js, focusEngine.test.js,
 * gameService_evolution18_undo_test.js, index.html, version.js.
 *
 * 25/08/2026, avant (Bug bloquant — "crypto.randomUUID is not a
 * function" à la création d'une partie sur iPhone, retour utilisateur en
 * testant le nouvel écran Test ci-dessous) :
 * `GameService.creerPartie` (js/gameService.js) appelait directement
 * `crypto.randomUUID()` pour l'identifiant de partie — cette fonction
 * n'existe QUE dans un contexte sécurisé (HTTPS ou localhost). Accéder à
 * la PWA par son IP locale en simple HTTP (`http://192.168.x.x:8000`,
 * nécessaire pour tester sur un vrai téléphone sans certificat) en fait un
 * contexte non sécurisé : `crypto.randomUUID` y est absent de l'objet
 * `crypto`, d'où l'erreur — jamais rencontrée en développement local
 * (`localhost`/`127.0.0.1`, toujours considéré sécurisé).
 * - Nouvelle fonction privée `genererIdPartie_()` : utilise
 *   `crypto.randomUUID()` si disponible (comportement inchangé en
 *   contexte sécurisé), sinon repli sur un UUID v4 assemblé à la main via
 *   `crypto.getRandomValues()` (LUI n'est PAS restreint aux contextes
 *   sécurisés, seuls `randomUUID`/`crypto.subtle` le sont — toujours
 *   cryptographiquement fort), sinon `Math.random()` en tout dernier
 *   recours si aucun des deux n'existe. Suffisant ici : l'unicité
 *   recherchée n'est que locale par appareil (aucun serveur à consulter).
 * Pas de nouveau test (fonction triviale, dépendante de l'environnement
 * navigateur — vérifiée manuellement : module chargé avec succès dans un
 * contexte Node dont `crypto.randomUUID` est absent, format d'UUID v4
 * valide généré via le repli `getRandomValues`).
 * Fichiers touchés : gameService.js, version.js.
 *
 * 25/08/2026, avant (Nouvel écran "Test" — bac à sable "Feuille
 * d'action" branché sur le vrai moteur, retour utilisateur — suite à la
 * Variante C de maquette-cartes-focus/, "quelle est la meilleure façon de
 * procéder sur un cas réel sur mon iPhone ?") :
 * Nouvel onglet `#nav-test`/`#screen-test` (index.html), visible dans la
 * même barre de navigation que Focus/Secteurs/Combat une fois une partie
 * ouverte. Objectif : valider le GESTE tactile réel (drag du grabber,
 * snap, safe-area, élasticité du scroll Safari) sur un vrai iPhone avant
 * d'envisager de remplacer la modale centrée `#modal-choix` en production
 * — un émulateur desktop ne reproduit fidèlement aucun de ces points.
 * - Reprend la mécanique de la feuille tactile de
 *   `maquette-cartes-focus/variante-c-feuille.html` (grabber glissable,
 *   snap fermé/au-contenu/plein-écran, étapes qui glissent dans la même
 *   feuille avec puce d'étapes + "← Retour", coût au stepper +/-) — mais
 *   la branche cette fois comme un VRAI `demanderChoix`, passé à
 *   `FocusEngine.resoudreAction` (js/focusEngine.js, moteur pur), plutôt
 *   que de rejouer la logique coût/effet à la main comme la maquette
 *   statique. Testé sur un `etatTest_` (plateauMaison) FACTICE tenu en
 *   mémoire (10 de chaque ressource, `partieId:'test'`) — AUCUNE lecture
 *   ni écriture IndexedDB, la vraie partie n'est jamais touchée.
 * - Carte testée : Focus Conquête Standard (focus.json id 1-3 — Engager/
 *   Planifier/Préparer, recopiées telles quelles dans le script), choisie
 *   pour la diversité de cas qu'elle couvre à elle seule : "Préparer" est
 *   déjà la carte du POC de substitution Crédit systématique (entrée
 *   précédente, `POC_TOUJOURS_PROPOSER_SUBSTITUTION_`) — la feuille de
 *   paiement s'ouvre donc réellement, même réserve suffisante ; "Planifier"
 *   ("et/ou") exerce le choix inclusif RÉEL (`options_inclusives`) menant à
 *   1 ou 2 popups déléguées enchaînées ; "Engager" exerce le choix exclusif
 *   RÉEL (`option_exclusive`) entre Envahir/Regrouper.
 * - `demanderChoixTest_` (nouvelle IIFE en bas de `index.html`, après le
 *   bloc Wake Lock) couvre exactement les `contexte.type` que ces 3
 *   actions déclenchent : `paiement_ressource`/`option_exclusive`/
 *   `options_inclusives` sont résolus par la feuille avec la MÊME
 *   sémantique exacte que `strategieService.js` (mêmes formes de réponse
 *   attendues par `focusEngine.js` — `{indexChoisi}`, tableau brut
 *   d'indices, `{utiliseRessource}`) ; les popups NORMALEMENT déléguées à
 *   une écriture DB directe (`gagner_programme`, `deplacer_corruption`,
 *   `regrouper`, `envahir`) sont ici résolues par un mini-formulaire LOCAL
 *   qui invente son propre résultat plausible (offre de Programmes/cibles
 *   de Corruption/secteurs factices) — seule la MÉCANIQUE de la feuille est
 *   ce qui est testé pour ces 4 cas, pas le vrai plateau des secteurs.
 * - `css/style.css` : classes `.feuille*`/`.rangee-choix*`/`.cout-stepper*`
 *   portées telles quelles depuis `maquette-cartes-focus/mockup.css`
 *   (y compris les 2 correctifs déjà validés en maquette : `height:0` par
 *   défaut au lieu d'un `min-height` qui empêchait la fermeture complète,
 *   et une règle `[hidden]{display:none}` explicite sur `.feuille-retour`/
 *   `.feuille-etapes`, dont le `display:flex` de la classe écrasait sinon
 *   la règle `[hidden]` du navigateur).
 * Pas de nouveau test `*.test.js` (écran 100% DOM/geste, hors périmètre de
 * cette suite — la logique Coût/Effet elle-même, déjà exercée ici via le
 * vrai `FocusEngine.resoudreAction`, reste couverte par
 * `focusEngine.test.js` existant, inchangé). Vérifié manuellement dans un
 * vrai navigateur (Playwright, scripts ad-hoc, gabarit iPhone 390×844) sur
 * la maquette statique d'origine avant portage (fermeture complète de la
 * feuille, sélection conservée après "← Retour", bouton "← Retour"/puce
 * d'étapes bien masqués à l'étape unique, configurateur qui fait grandir
 * la feuille) — zéro erreur JS.
 * Fichiers touchés : index.html, css/style.css, version.js.
 *
 * 24/08/2026, avant (POC — popup de paiement systématique pour
 * Focus Conquête "Préparer", retour utilisateur) :
 * Suite à la substitution Crédit (entrée précédente) : l'utilisateur
 * hésite entre 3 options pour proposer la substitution même quand la
 * réserve suffit déjà (préserver la Nourriture en vue de l'Entretien
 * notamment) — systématique partout, seulement pour la Nourriture, ou un
 * 2e bouton dédié par action. Ce POC teste la 1re option, VOLONTAIREMENT
 * limité à UNE seule carte pour évaluer l'expérience avant de trancher.
 * - `focusEngine.js` : nouvelle constante `POC_TOUJOURS_PROPOSER_
 *   SUBSTITUTION_` (liste de `source`, aujourd'hui une seule entrée
 *   "Conquête — Préparer (coût)") — quand la `source` en cours y figure,
 *   la popup 'paiement_ressource' s'ouvre MÊME si la réserve suffit
 *   seule (contournant la condition `etat[champ] < valeur` habituelle).
 *   Aucun changement de comportement ailleurs : la popup pré-remplie déjà
 *   son montant au maximum possible en ressource (voir entrée
 *   précédente), donc dans ce cas elle affiche par défaut EXACTEMENT ce
 *   qui se serait passé automatiquement, tout en restant modifiable —
 *   aucun redesign de la popup n'a été nécessaire.
 * 2 tests ajoutés dans `focusEngine.test.js` (popup ouverte malgré
 * réserve suffisante sur cette carte précisément ; comportement par
 * défaut inchangé sur une AUTRE carte avec un coût matériel similaire,
 * confirme le scope limité à cette seule carte). Vérifié aussi
 * manuellement dans un vrai navigateur (Playwright, script ad-hoc) :
 * réserve à 10 Matériel (coût 3), popup quand même ouverte, choix de
 * payer entièrement en Crédit validé, Matériel resté intact.
 * Fichiers touchés : focusEngine.js, focusEngine.test.js, version.js.
 *
 * 24/08/2026, avant (Substitution Crédit pour un coût en
 * Nourriture/Énergie/Matériel — retour utilisateur,
 * docs-rules-Influence-et-ressources.md §2, marqué 🔍 "à vérifier") :
 * Règle jusqu'ici non implémentée : "les crédits peuvent être utilisés
 * comme substitut pour une dépense de Nourriture, Énergie, ou Matériel à
 * raison de 1 pour 1" (jamais Science, jamais l'Entretien — déjà
 * correctement respecté par construction, la popup 'phase_evaluation' ne
 * proposant que ces 3 ressources). `focusEngine.js` ne bloquait par
 * ailleurs JAMAIS un Coût faute de ressources (clampé à 0 silencieusement)
 * — la règle du livret dit pourtant qu'une action sans réserve suffisante
 * est impossible.
 * - `focusEngine.js` : nouveau cas dédié, AVANT le repli CLES_SIMPLES
 *   générique, pour un Coût (signe < 0) en Nourriture/Énergie/Matériel
 *   (`RESSOURCES_SUBSTITUABLES_CREDIT_`) — déclenché UNIQUEMENT quand la
 *   réserve seule ne suffit pas (`etat[champ] < valeur`) : le cas courant
 *   où la réserve suffit reste géré silencieusement par CLES_SIMPLES,
 *   comportement inchangé, aucune popup superflue sur la quasi-totalité
 *   des actions Focus. En cas de manque, ouvre une popup dédiée (contexte
 *   'paiement_ressource', strategieService.js) qui laisse le joueur
 *   répartir librement le montant entre le reste de la ressource et le
 *   Crédit — SANS obligation d'épuiser d'abord la ressource jusqu'à son
 *   dernier point (retour utilisateur explicite : le joueur peut préférer
 *   la préserver et payer davantage en Crédit). "Annuler" bloque le Coût
 *   (RÈGLE MÉTIER déjà tolérée : "coût annulé après effet déjà réussi")
 *   — notamment quand ni la ressource ni le Crédit, même combinés, ne
 *   suffisent.
 * - `strategieService.js` : nouvelle popup 'paiement_ressource' (résumé
 *   "X Nourriture/Énergie/Matériel + Y Crédit (substitution)" mis à jour
 *   en direct, Valider désactivé si la répartition choisie dépasse le
 *   Crédit disponible, message dédié + Valider caché si même la
 *   combinaison complète ne suffit pas) ; `coutSuffisant_` (grisage des
 *   boutons Focus) considère désormais le Crédit disponible comme un pool
 *   PARTAGÉ pouvant couvrir le manque de Nourriture/Énergie/Matériel — un
 *   bouton n'est plus grisé à tort juste parce qu'UNE ressource manque si
 *   le Crédit peut couvrir l'écart.
 * 7 tests ajoutés dans `focusEngine.test.js` (réserve suffisante seule
 * -> aucune popup ; réserve insuffisante -> popup + substitution
 * partielle ; choix de préserver une partie de la réserve ; combinaison
 * totalement insuffisante -> Annuler, effet déjà réussi conservé ;
 * jamais déclenché pour un GAIN ; Science jamais substituable). Vérifié
 * aussi manuellement dans un vrai navigateur (Playwright, scripts
 * ad-hoc) : rendu/calcul en direct de la popup, bouton Focus non grisé
 * grâce au Crédit, flux complet clic → popup → validation → journal
 * ("−3 materiel (dont 3 substitués par Crédit)") → réserves déduites
 * correctement, aucune erreur JS.
 * Fichiers touchés : focusEngine.js, focusEngine.test.js,
 * strategieService.js, docs/docs-rules-Influence-et-ressources.md,
 * version.js.
 *
 * 24/08/2026, avant (Coût "defausser_gloire" — retour utilisateur,
 * Focus Progrès Héroïque "Restaurer") :
 * Nouvelle clé Coût "defausser_gloire" (focus.json — Progrès Héroïque
 * "Restaurer" id 102, et Commandement Héroïque "Utiliser" id 92, tous
 * deux cout:{defausser_gloire:1}) — jusqu'ici sans cas dédié, retombait
 * sur le repli générique "effet non chiffré — à appliquer manuellement".
 * - `focusEngine.js` (`resoudreCle_`) : nouveau cas dédié (Coût
 *   uniquement, signe < 0), miroir de "ameliorer_gloire" déjà existant —
 *   délègue à une popup dédiée (contexte 'defausser_gloire',
 *   strategieService.js) qui fait le calcul ET la persistance (le jeton
 *   Gloire, array, n'est pas suivi par CHAMPS_DIFF_SUIVIS).
 * - `strategieService.js` : nouvelle popup 'defausser_gloire' — AUCUN
 *   choix utilisateur, cible TOUJOURS le jeton Gloire de plus PETITE
 *   valeur posé sur la fiche Maison (retour utilisateur explicite),
 *   remis à `null` (retiré) ; contrairement à "ameliorer_gloire", aucun
 *   plafond à 5 (un jeton déjà au maximum reste éligible à la défausse).
 *   Si aucun jeton Gloire n'est posé, annule l'action entière (comme tout
 *   autre coût bloquant faute de cible).
 * 2 tests ajoutés dans `focusEngine.test.js` (succès — délègue bien à la
 * popup dédiée ; annulé — coût non débité, effet déjà réussi conservé).
 * Vérifié aussi manuellement dans un vrai navigateur (Playwright, script
 * ad-hoc) : 2 jetons Gloire posés (valeurs 2 et 4), le jeton 2 (le plus
 * petit) est bien celui défaussé, le jeton 4 reste ; aucune erreur JS.
 * Fichiers touchés : focusEngine.js, focusEngine.test.js,
 * strategieService.js, version.js.
 *
 * 24/08/2026, avant (Popup "Déployer un cube" — Secteur-Mère non
 * proposé sans Puissance Navale, retour utilisateur) :
 * Même bug que Regrouper avant EVOLUTION 15 (todo.md) : la popup
 * 'deployer_cube' (strategieService.js, modes 'libre' et 'par_chantier' —
 * 'secteur_mere' n'était pas concerné, il cible déjà directement le
 * Secteur-Mère sans filtre d'appartenance) excluait le Secteur-Mère dès
 * qu'il n'avait plus de Puissance Navale dessus, alors qu'il appartient
 * TOUJOURS au joueur (jamais repris par le Néant, docs-rules-flottes.md/
 * docs-rules-secteurs.md).
 * - `vousAppartientDeploiement_` accepte désormais un `numeroSecteurMere`
 *   optionnel — un secteur est éligible s'il appartient au joueur (PN > 0)
 *   OU s'il s'agit du Secteur-Mère, quel que soit son niveau de Puissance
 *   Navale.
 * - Les modes 'libre' et 'par_chantier' résolvent désormais aussi
 *   `SecteurService.obtenirSecteurMere(scenarioId)` (en parallèle de
 *   `obtenirSecteurs`, `Promise.all`) pour l'y passer.
 * Vérifié manuellement dans un vrai navigateur (Playwright, script
 * ad-hoc) : Secteur-Mère vidé de sa Puissance Navale, proposé comme
 * cible valide dans les 2 modes concernés, aucune erreur JS.
 * Fichiers touchés : strategieService.js, version.js.
 *
 * 24/08/2026, avant (Focus Héroïque Renfort "Accélérer" — retour
 * utilisateur, plusieurs points de clarté/correction) :
 * - Bug corrigé : "avancer sur votre piste la moins avancée" (focus.json
 *   id 106, et l'action de Programme Force — EFFET_PROGRAMME_PAR_TYPE_,
 *   gameService.js) ne proposait QUE la piste la mieux placée dans l'ordre
 *   fixe Société > Gouvernement > Économie, même quand une AUTRE piste
 *   était à égalité (ex. Gouvernement ET Économie à 0 : seul Gouvernement
 *   apparaissait). Le catalogue portait pourtant déjà le signal
 *   `tie_break:"au_choix"` (clé sœur de `avancer_civilisation_moins_avancee`
 *   dans le même objet JSON), jusqu'ici totalement ignoré (traité comme un
 *   modificateur silencieux, `CLES_MODIFICATEURS_SILENCIEUSES`).
 *   - `focusEngine.js` : `resoudreJsonInterne_` passe désormais le JSON
 *     parent en dernier paramètre de `resoudreCle_` (nouveau `jsonParent`,
 *     paramètre optionnel, rétrocompatible) — le cas
 *     "avancer_civilisation_moins_avancee" y lit `jsonParent.tie_break`
 *     et transmet `contexte.tieBreakAuChoix` à la popup.
 *   - `gameService.js` : `EFFET_PROGRAMME_PAR_TYPE_.Force` porte
 *     désormais lui aussi `tie_break:"au_choix"` (son texte imprimé le dit
 *     explicitement : "au choix si égalité").
 *   - `strategieService.js` (popup 'avancer_civilisation', branche
 *     `moinsAvancee`) : calcule maintenant TOUTES les pistes à égalité au
 *     niveau le plus bas ; si `tieBreakAuChoix` et plusieurs candidates,
 *     affiche un choix restreint à celles-ci (même gabarit que le choix
 *     libre entre les 3 pistes) plutôt que de retomber silencieusement sur
 *     l'ordre fixe (comportement inchangé quand `tieBreakAuChoix` est
 *     absent/faux — cas non concernés par ce correctif).
 * - Libellés plus clairs (`strategieService.js`) :
 *   - `libelleOption_` (labels des popups 'option_exclusive'/
 *     'options_inclusives') : la clé `tie_break` est désormais filtrée
 *     (jamais un choix affichable — elle produisait un label du genre
 *     "tie_break + Avancer sur votre piste la moins avancée (1)",
 *     source de confusion) ; `ressource_choix` a désormais un label dédié
 *     "+N ressource(s) au choix" au lieu du gabarit générique "clé (N)".
 *   - Popup 'ressource_choix' : titre "Gagner N ressource(s) au choix"
 *     côté gain (au lieu de "Choisissez N...", qui ne précisait pas le
 *     sens gain/coût — "Dépensez N..." déjà correct côté coût, inchangé) ;
 *     chaque bouton de ressource affiche désormais un compteur "+N" (ex.
 *     "Crédit +2") dès qu'il a déjà été cliqué dans la sélection en cours
 *     — indication visuelle demandée en plus du texte "Il reste N à
 *     choisir" déjà existant.
 * - `css/style.css` : nouvelle classe `.choix-ressource-compteur` (badge
 *   "+N" sur les boutons de la popup 'ressource_choix').
 * 2 tests ajoutés dans `focusEngine.test.js` (tie_break présent/absent ->
 * `contexte.tieBreakAuChoix` correct). Vérifié aussi manuellement dans un
 * vrai navigateur (Playwright, scripts ad-hoc) : libellés de la popup
 * inclusive de Renfort id 106 (regroupé/"+4 ressources au choix"/piste),
 * titre + compteur de la popup ressource_choix, et le scénario exact du
 * bug rapporté (Gouvernement/Économie à égalité 0/7, partie fraîche) —
 * les 2 pistes sont bien proposées, le choix "Économie" persiste
 * correctement en base.
 * Fichiers touchés : focusEngine.js, focusEngine.test.js, gameService.js,
 * strategieService.js, css/style.css, version.js.
 *
 * 24/08/2026, avant (Garder l'écran allumé — Screen Wake Lock API,
 * retour utilisateur : "la PWA peut-elle empêcher l'iPhone de passer en
 * veille ?") :
 * Nouveau toggle discret `#btn-veille-ecran` (icône ☕) dans la barre de
 * titre (`.topbar`), toujours visible (header commun à tous les écrans).
 * - `index.html` (markup + script de câblage en bas de page) : utilise
 *   `navigator.wakeLock.request('screen')` — supporté par Safari iOS
 *   depuis la 16.4 (y compris une PWA installée en standalone). Bouton
 *   `hidden` par défaut dans le markup, révélé par JS UNIQUEMENT si
 *   `'wakeLock' in navigator` — pas de bouton sans effet sur un navigateur/
 *   iOS plus ancien. Préférence persistée dans IndexedDB (store `meta`,
 *   clé `veilleEcranActive` — même mécanisme que `catalogueVersion`,
 *   js/catalogueSync.js), jamais en `localStorage` (seule persistance du
 *   projet = IndexedDB, voir CLAUDE.md).
 *   Le verrou est automatiquement relâché par le navigateur dès que l'app
 *   quitte le premier plan (comportement standard de l'API, pas une
 *   limite du code) — redemandé à chaque retour au premier plan
 *   (`visibilitychange`) tant que le toggle est actif ; un refus (ex.
 *   batterie faible) reste silencieux, sans interrompre l'utilisateur pour
 *   ce confort optionnel.
 * - `css/style.css` : `.topbar` passe en `position: relative` ; nouvelles
 *   classes `.btn-veille-ecran`/`.btn-veille-ecran.active` — bouton
 *   épinglé au coin droit de la barre de titre, atténué/grisé au repos,
 *   coloré une fois activé.
 * Pas de nouveau test (feature purement DOM/API navigateur, hors périmètre
 * de la suite `*.test.js`/`*_test.js` — vérifié manuellement).
 * Fichiers touchés : index.html, css/style.css, version.js.
 *
 * 24/08/2026, avant (EVOLUTION 18 — Refonte du moteur d'annulation,
 * todo.md, retour utilisateur : "annuler la dernière action" (Conquête
 * "Planifier") ne redéplaçait pas la Corruption ni ne retirait le
 * Programme gagné ; le bouton restait bloqué sur "Passage en cours") :
 * - Bouton bloqué : `strategieService.js` (`annulerDerniereAction_`)
 *   renomme le texte transitoire en "Annulation en cours…" et le restaure
 *   désormais aussi après une annulation RÉUSSIE (`majBoutonAnnuler_`,
 *   appelée par `afficher()`, ne remet à jour que `.disabled`, jamais
 *   `.textContent` — le texte n'était restauré qu'en cas d'échec avant ce
 *   correctif).
 * - Cause racine du bug de fond : ~12 popups déléguées (construire,
 *   regrouper, envahir, retirer/gagner/déplacer Corruption, augmenter
 *   Population, améliorer Gloire, gagner un Programme, rappeler un cube,
 *   avancer une piste de Civilisation) écrivent DIRECTEMENT en base
 *   (secteurs, plateau maison hors des 9 champs `diffChamps_`, pistes de
 *   Civilisation), jamais capturées par la pile d'annulation.
 * - `db.js` : nouveau mécanisme générique de "changelog" —
 *   `demarrerEnregistrement`/`arreterEnregistrement`/`enregistrementActif`.
 *   Pendant un enregistrement actif, TOUTE écriture `put()` (n'importe
 *   quel store, sauf `pileAnnulation`/`parties`/`historique`) est capturée
 *   automatiquement `{store, cle, avant, apres}` — un seul couple
 *   avant/après par ligne touchée (1er avant, dernier après), quel que
 *   soit le nombre d'écritures pendant l'action. Choix délibéré plutôt
 *   qu'un threading manuel de mutations popup par popup (proposé par
 *   l'utilisateur en session) : capture tout automatiquement, aucun risque
 *   d'oubli sur une popup future, zéro changement requis dans
 *   secteurService.js/civilisationService.js/gameService.js.
 * - `annulationService.js` : `restaurerMutations` (nouvelle, exportée)
 *   généralise la restauration aux 2 formats de mutation cohabitants
 *   (legacy `{champ, avant, apres}` plateauMaison, générique `{store,
 *   cle, avant, apres}` ligne complète — `DB.put`/`DB.supprimer` si
 *   `avant` est `null`) ; `annulerDerniere` en interne l'utilise
 *   désormais aussi.
 * - `focusEngine.js` (`jouerActionEtPersister`) et `gameService.js`
 *   (`utiliserProgramme`) — les 2 SEULS orchestrateurs "action annulable"
 *   au sens du todo.md — enveloppent désormais toute leur résolution
 *   (Effet + Coût + popups déléguées imbriquées) sous un enregistrement :
 *   Effet en échec -> `AnnulationService.restaurerMutations` immédiat
 *   (RÈGLE MÉTIER : un Effet en échec ne laisse AUCUNE trace — une popup
 *   déléguée ayant déjà écrit avant l'échec, ex. "et/ou" partiel, était
 *   jusqu'ici une fuite silencieuse) ; succès -> empile les mutations
 *   CAPTURÉES (superset de `diffChamps_`, couvre aussi le hors-plateauMaison)
 *   comme UNE SEULE entrée. Un Cadre d'Événement galactique n'enveloppe
 *   toujours rien (aucun `demarrerEnregistrement`) : conforme à la règle
 *   explicite du todo.md ("l'effet d'un evenement... il ne faut meme pas
 *   le tracer").
 * - `civilisationService.js` (`avancerPiste`/`avancerPisteCorrompue`) :
 *   `empilerSiAutonome_` saute le self-empile historique quand
 *   `DB.enregistrementActif()` est vrai (appel imbriqué dans une action
 *   déjà suivie, ex. popup 'avancer_civilisation') — évite une 2e entrée
 *   de pile séparée pour ce qui doit rester UNE seule action annulable.
 *   Comportement autonome inchangé (bouton "Avancer" manuel, Cadre
 *   d'Événement).
 * - `strategieService.js` : le journal de l'écran Focus
 *   (`ressources-journal`) groupe désormais chaque action jouée sous un
 *   "cadre" (titre + sous-liste indentée de ses lignes Effet/Coût/rappels)
 *   au lieu d'une liste plate — "faire un cadre unique pour une action et
 *   des sous cadres pour les effets déclenché par cette action" (todo.md).
 *   `journal` passe de `string[]` à `{action, lignes}[]` (nouveaux helpers
 *   `pousserJournalLigne_`/`pousserJournalGroupe_`, tous les points
 *   d'écriture mis à jour). `css/style.css` : classes `.journal-action*`.
 * 15 tests ajoutés (`db_enregistrement_test.js` : 7, mécanisme générique
 * contre un faux IndexedDB minimal ; `gameService_evolution18_undo_test.js` :
 * 5, intégration bout-en-bout via les 2 orchestrateurs — reproduit
 * exactement "Conquête Planifier" du retour utilisateur ; 3 dans
 * `focusEngine.test.js`/`secteurService_actions.test.js`/
 * `civilisationService_test.js`). Vérifié aussi manuellement dans un vrai
 * navigateur (Playwright, script ad-hoc) : bouton non bloqué, groupement
 * visuel du journal, aucune erreur JS. 208 tests `*.test.js`/`*_test.js`
 * au vert après ces changements (tous fichiers de test du projet).
 * Fichiers touchés : db.js, annulationService.js, focusEngine.js,
 * gameService.js, civilisationService.js, strategieService.js,
 * css/style.css, db_enregistrement_test.js (nouveau),
 * gameService_evolution18_undo_test.js (nouveau), focusEngine.test.js,
 * secteurService_actions.test.js, civilisationService_test.js,
 * gameService_utiliser_programme_test.js, docs/docs-architecture-pwa.md,
 * docs/TODO.md, version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache —
 * les 2 fichiers de test *_test.js ne sont jamais servis à l'app, voir
 * FICHIERS_A_METTRE_EN_CACHE).
 *
 * 24/08/2026, avant (EVOLUTION 16 — Perte de Puissance Navale,
 * todo.md, docs-rules-flottes.md §1.5) :
 * Sur une invasion GAGNÉE avec des pertes en cours de combat (unités
 * engagées mais non survivantes), ces cubes disparaissaient purement et
 * simplement du suivi — ni déposés sur le secteur (seuls les survivants le
 * sont), ni reversés en Cube actif. Seule la DÉFAITE totale créditait tout
 * `totalEngage` en Cube actif ("les Dégâts au Combat" = rappeler 1 cube
 * vers la zone active, docs-rules-flottes.md §1.5 — une règle qui
 * s'applique aussi en cas de victoire avec pertes partielles).
 * - `strategieService.js` (popup 'envahir') : calcule désormais
 *   `cubesPerdus` = `totalEngage` moins la somme des survivants exacts
 *   (`resultatCombat.survivantsAttaquant`, déjà calculés par
 *   `CombatService.resoudreInvasion`) — inclus dans l'objet résolu et
 *   mentionné dans le journal ("X cube(s) perdu(s) au combat reversé(s)
 *   en Cube actif") quand > 0.
 * - `focusEngine.js` (`resoudreCle_`, cas 'envahir'/'envahir_corrompu') :
 *   crédite `cubeActif` avec `reponse.cubesPerdus` en victoire (nouveau)
 *   ou `reponse.totalEngage` en défaite/égalité (inchangé — en défaite,
 *   les survivants attaquant sont toujours 0, donc les deux formules
 *   coïncident).
 * 1 test ajouté dans `focusEngine.test.js` (victoire avec pertes partielles
 * — cubeActif crédité et clampé à 14). 130 tests `*.test.js` au vert après
 * ce changement.
 * Fichiers touchés : strategieService.js, focusEngine.js,
 * focusEngine.test.js, docs/TODO.md, version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTION 15 — Le Secteur-Mère vous
 * appartient toujours, todo.md, docs-rules-flottes.md §1.5/§4) :
 * L'action Regrouper ne traitait pas le Secteur-Mère différemment des
 * autres secteurs : il n'était ni proposable comme destination à 0
 * Puissance Navale (secteurEstPossede_/appartientAuJoueur_ exigent PN > 0),
 * ni protégé par la règle "on ne vide jamais un secteur hors Secteur-Mère"
 * (absente jusqu'ici de `SecteurService.regrouper`, qui ne validait que
 * l'adjacence/l'appartenance/le stock disponible).
 * - `secteurService.js` (`regrouper`) : charge désormais aussi
 *   `obtenirSecteurMere(scenarioId)` ; un secteur de départ/arrivée est
 *   valide s'il appartient au joueur OU s'il s'agit du Secteur-Mère
 *   (`appartientOuMere_`) ; après la validation de stock existante, rejette
 *   tout mouvement qui viderait ENTIÈREMENT (tous types confondus) un
 *   secteur de départ AUTRE que le Secteur-Mère. La reprise par le Néant
 *   d'un secteur vidé restait déjà correctement scopée à `envahirResoudre`
 *   (jamais implémentée côté `regrouper`, qui interdit désormais ce cas en
 *   amont plutôt que de le laisser survenir).
 * - `strategieService.js` (popup 'regrouper') : charge
 *   `SecteurService.obtenirSecteurMere` en plus des secteurs/adjacences ;
 *   `vousAppartient_` inclut désormais le Secteur-Mère (destination
 *   possible même vide) ; le clic "Ajouter ce déplacement" applique la
 *   même règle de "dernière Puissance Navale" que le serveur AVANT
 *   d'ajouter le mouvement (message immédiat plutôt qu'un rejet différé à
 *   la validation).
 * 3 tests ajoutés dans `secteurService_actions.test.js` (Secteur-Mère
 * destination valide à 0 PN, secteur normal jamais vidable, Secteur-Mère
 * lui-même librement vidable). 129 tests `*.test.js` au vert après ces
 * changements (secteurService_actions.test.js + focusEngine.test.js
 * confondus).
 * Fichiers touchés : secteurService.js, strategieService.js,
 * secteurService_actions.test.js, docs/TODO.md, version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTION 14 — affichage augmenter_population +
 * vérification popups Regrouper/Envahir, todo.md) :
 * - `strategieService.js` : "augmenter_population"/"augmenter_population_pure"
 *   ajoutées à `LIBELLES_OPTIONS` ("Augmenter une population" pour les
 *   deux) — ces clés retombaient sur le repli "clé brute" dans les popups
 *   de choix (ex. Focus Développement "Harmoniser", `choice:
 *   ["augmenter_population", "retirer_corruption"]`), affichant
 *   littéralement "augmenter_population" au lieu d'un libellé lisible.
 * - Second point du todo.md (espacement des boutons "Ajouter ce
 *   déplacement"/"Engager cette unité", boutons Valider renommés) :
 *   vérifié, déjà en place dans le code actuel (aucun changement
 *   nécessaire) — probablement couvert par un chantier de texte antérieur
 *   (commit "Programmes : gain de place et textes raccourcis").
 * Fichiers touchés : strategieService.js, docs/TODO.md, version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTION 13 — Focus Développement "Installer"
 * : Coût "rappeler_cube", todo.md) :
 * La clé Coût "rappeler_cube" (focus.json — Focus Développement "Installer"
 * Standard et 7 autres cartes, toujours `{rappeler_cube:1}`) retombait à
 * tort sur le repli générique "toute clé contenant cube" de
 * `FocusEngine.resoudreCle_` : celui-ci DÉCRÉMENTAIT `cubeActif` de 1,
 * l'exact inverse de la règle du jeu (rappeler un cube AJOUTE 1 cube depuis
 * un secteur vers la zone active, ça ne consomme pas un cube déjà actif) —
 * ce coût n'était donc jamais réellement débité.
 * - `focusEngine.js` : nouveau cas dédié pour `rappeler_cube` en Coût
 *   (signe < 0), testé AVANT le repli générique "cube" (comme
 *   `CLES_DEPLOYER_CUBE` déjà) — délègue à une popup dédiée (contexte
 *   'rappeler_cube_cout', strategieService.js) qui fait le choix ET la
 *   persistance (`SecteurService.rappelerCube`), comme construire/
 *   regrouper/envahir. Retiré de `CLES_SECTEUR_HORS_PERIMETRE` (ne
 *   contient plus que `effet_secteur`).
 * - `strategieService.js` : nouvelle popup 'rappeler_cube_cout', DISTINCTE
 *   de la popup 'rappeler_cube' existante (option "recall" d'un Cadre
 *   d'Événement, un EFFET sans cette contrainte) — ne propose que les
 *   secteurs possédés qui ne seraient PAS abandonnés par ce rappel :
 *   Secteur-Mère toujours éligible (jamais abandonné), les autres
 *   uniquement s'ils portent STRICTEMENT PLUS d'1 cube de Puissance Navale
 *   au total (docs-rules-flottes.md §1.5/§4 — rappeler le dernier cube
 *   d'un secteur hors Secteur-Mère l'abandonne et coûte un jeton Gloire,
 *   mécanique délibérément non modélisée ici, choix du TODO).
 * 2 tests ajoutés dans `focusEngine.test.js` (succès — cubeActif inchangé,
 * annulation — coût non débité). 58 tests `*.test.js`/`*_test.js` au vert
 * après ce changement (focusEngine.test.js seul, non re-décompté
 * globalement).
 * Fichiers touchés : focusEngine.js, focusEngine.test.js,
 * strategieService.js, docs/docs-architecture-pwa.md, docs/TODO.md,
 * version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTION 12 — Limite d'utilisation d'une
 * action Focus par cycle, todo.md, retour utilisateur) :
 * Nouveau champ `plateauMaison.actionsFocusUtilisees` (tableau de clés
 * "Focus — Action", ex. "Politique — Contrôler") accumulant les actions
 * Focus jouées avec succès CE cycle (Focus joueur ET Focus héroïques,
 * même chemin de code) :
 * - `FocusEngine.resoudreAction` (focusEngine.js) ajoute la clé de
 *   l'action dès que l'Effet a réussi (idempotent — rejouer une action
 *   déjà marquée ne duplique pas sa clé), en réutilisant `libelleSource`
 *   (déjà utilisé pour le journal/la pile d'annulation). Cette mutation
 *   passe par le MÊME mécanisme diff/undo que le reste du plateau
 *   (`CHAMPS_DIFF_SUIVIS`) : annuler la DERNIÈRE action retire
 *   automatiquement sa clé, sans code dédié côté AnnulationService — le
 *   Focus concerné regagne son picto/bouton utilisable dès que ce n'est
 *   plus la seule action utilisée, exactement comme demandé (todo.md :
 *   "faire deux actions d'un focus, annuler la dernière, le focus a
 *   toujours le picto"). `diffChamps_` (même fichier) compare désormais
 *   par CONTENU (JSON.stringify) plutôt que par référence — nécessaire
 *   pour ce nouveau champ TABLEAU (un clone JSON a toujours une
 *   référence différente même à contenu identique), sans changer le
 *   comportement des champs scalaires déjà suivis.
 * - `GameService` (gameService.js) : `actionsFocusUtilisees` ajouté à
 *   `CHAMPS_PLATEAU_MAISON_AUTORISES` (écriture autorisée via
 *   majPlateauMaison) et exposé dans `assemblerPartie_`
 *   (partie.plateauMaison.actionsFocusUtilisees, repli sur [] pour les
 *   parties créées avant ce champ). `avancerCycle` réinitialise ce
 *   champ à [] à chaque changement de cycle — à la fois dans l'objet
 *   `partie` renvoyé EN MÉMOIRE (index.html re-rend l'écran Focus
 *   directement avec cet objet, sans rechargement complet) ET dans la
 *   table `plateauMaison` (écriture séparée via majPlateauMaison,
 *   jamais portée par sauvegarderPartie/etatJson — pourEtatJson_ exclut
 *   toujours `plateauMaison`).
 * - `strategieService.js` (`carteFocusJoueurHTML_`, réutilisée pour les
 *   Focus joueur ET héroïques) : chaque bouton d'action déjà jouée ce
 *   cycle devient réellement `disabled` (icône ✓ au lieu de ▶, classe
 *   `.focus-action-deja-utilisee`) — visuellement DISTINCTE de
 *   `.focus-action-insuffisant` (ressources manquantes, rouge) pour ne
 *   pas confondre les 2 raisons d'indisponibilité. Le titre de la carte
 *   affiche un badge "✓ Utilisé" (`.badge-focus-utilise`, vert) dès
 *   qu'au moins une action de ce Focus a été jouée ce cycle.
 * - `style.css` : 2 nouvelles classes — `.focus-action-deja-utilisee`
 *   (gris neutre, bouton non cliquable) et `.badge-focus-utilise`
 *   (badge vert sur le titre, distinct des badge-type-* existants qui
 *   servent au TYPE de carte, pas à son état d'utilisation).
 * 6 tests ajoutés (`focusEngine_test.js` : marquage, non-marquage sur
 * annulation, idempotence, intégration annulation ↔ 2 actions du même
 * Focus reproduisant exactement le scénario todo.md ;
 * `gameService_cycle_focus_technologie_test.js` : réinitialisation
 * mémoire + DB au changement de cycle) — 1 test existant
 * (`produire_ressource`) mis à jour (une action "réussie mais hors
 * périmètre" produit désormais 1 mutation : actionsFocusUtilisees).
 * 198 tests `*_test.js` au vert après ces changements.
 * Fichiers touchés : focusEngine.js, gameService.js, strategieService.js,
 * style.css, focusEngine_test.js,
 * gameService_cycle_focus_technologie_test.js, version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTION 11 — Bug annulation coût débité
 * malgré une option nichée annulée, todo.md, retour utilisateur) :
 * Reproduit avec Focus Conquête "Planifier" (focus.json id 2 : { choice:
 * ["gagner_programme", "deplacer_corruption"] }, texte "et/ou") —
 * sélectionner les 2 options via la popup 'options_inclusives' PUIS
 * Annuler la popup nichée de l'UNE d'elles (ex. gagner_programme)
 * débitait quand même le Coût de l'action (credit/energie).
 * `FocusEngine.resoudreCle_`, branche "choice"/"choix" INCLUSIVE
 * (texte contenant "et/ou", focusEngine.js) : la boucle `reduce` sur les
 * options sélectionnées ignorait délibérément ("tolérant", commentaire
 * d'origine) le résultat `false` d'une option nichée annulée et
 * retournait TOUJOURS `true` — l'Effet était donc considéré réussi même
 * si l'une des options choisies avait été annulée en cours de route, et
 * `FocusEngine.resoudreAction` débitait le Coût en conséquence. Ce
 * comportement enfreignait la RÈGLE MÉTIER documentée en tête de
 * focusEngine.js ("un blocage à N'IMPORTE quelle clé annule bien la
 * totalité du JSON en cours, pas seulement les clés restantes").
 * Correctif : la boucle `reduce` propage désormais normalement le
 * résultat de chaque option nichée (même mécanisme que
 * `resoudreJsonInterne_`/`choice_repeat`, déjà corrects) — un "Annuler"
 * sur N'IMPORTE laquelle des options sélectionnées (la 1re ou la 2e)
 * bloque désormais TOUTE l'action : aucune mutation, Coût jamais débité,
 * comme pour une option "choice" exclusive. Ce changement s'applique à
 * TOUTE clé "choice"/"choix" inclusive du catalogue (focus.json/
 * evenements.json/pistesCivilisation.json), pas seulement à "Planifier".
 * 2 tests de non-régression ajoutés dans `focusEngine_test.js`
 * (annulation de la 1re option des 2 sélectionnées, puis de la 2e après
 * succès de la 1re — dans les 2 cas : succes=false, mutations=[], état
 * renvoyé inchangé) ; le test existant "choix imbriqué (et/ou)" renommé
 * pour clarifier qu'il porte sur les options NON sélectionnées (ignorées
 * sans erreur), pas sur la tolérance à l'annulation (ce dont il ne
 * s'agissait jamais) — comportement inchangé pour ce cas. 193 tests
 * `*_test.js` au vert après ces changements.
 * Fichiers touchés : focusEngine.js, focusEngine_test.js, version.js.
 * `service-worker.js` inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTION 10 — Déplacer une Corruption,
 * todo.md, retour utilisateur) :
 * Nouvelle clé Effet "deplacer_corruption" (focus.json — ex. Focus
 * Politique "Contrôler", Focus Conquête "Planifier", Focus Zenor
 * "Répliquer" — et evenements.json, Cadres "choix"/"exploit" d'Événement
 * galactique) — jusqu'ici sans cas dédié, retombait sur le repli
 * générique "effet non chiffré — à appliquer manuellement" :
 * - `FocusEngine.resoudreCle_` (focusEngine.js) reconnaît désormais
 *   "deplacer_corruption" (Effet uniquement, signe > 0) au même titre que
 *   "retirer_corruption"/"gain_corruption" — délègue à une popup dédiée
 *   (contexte 'deplacer_corruption', strategieService.js) qui fait le
 *   choix ET la persistance.
 * - `GameService.cleFocusEnginePourOptionCadre_` (gameService.js)
 *   reconnaît aussi "deplacer_corruption" pour un usage en option de
 *   Cadre "choix" d'Événement galactique (ex. evenements.json, Événement
 *   A Cycle 1 : "retirez une Corruption et déplacez une Corruption").
 * - Nouvelle popup `strategieService.js` (contexte 'deplacer_corruption')
 *   à 2 ÉTAPES : 1) SOURCE — même menu que 'retirer_corruption' (Secteur
 *   possédé Corrompu / Piste Corrompue / Programme manuel / Chambres de
 *   décontamination si stockage > 0) ; 2) DESTINATION — même menu que
 *   'gagner_corruption' (Secteur possédé Pur non immunisé / Piste non
 *   Corrompue / Programme manuel / Chambres de décontamination si
 *   emplacement libre), calculé et affiché AVANT toute écriture en base,
 *   donc excluant naturellement la source (toujours Corrompue à ce
 *   stade) — sauf exception explicite : Chambres de décontamination
 *   n'est jamais proposée comme destination si la source EST elle-même
 *   la Technologie (emplacements non suivis individuellement, seul le
 *   compte agrégé plateauMaison.corruptionChambreDecontamination l'est).
 *   Écriture : PLACE d'abord sur la destination, RETIRE ensuite de la
 *   source (échec DB en cours de route -> au pire une Corruption en trop,
 *   jamais une Corruption perdue).
 * - `index.html` : libellé `LABEL_OPTION_FOCUSENGINE_.deplacer_corruption`
 *   ("Déplacer une Corruption") pour l'usage en option de Cadre.
 * - 3 tests ajoutés dans `focusEngine_test.js` (succès, annulation à
 *   n'importe laquelle des 2 étapes bloque toute l'action — coût jamais
 *   débité, combinaison "et/ou" avec augmenter_population comme
 *   focus.json id 81 Zenor "Répliquer") — 191 tests `*_test.js` au vert
 *   après ces changements.
 * Fichiers touchés : focusEngine.js, strategieService.js, gameService.js,
 * index.html, focusEngine_test.js, version.js. `service-worker.js`
 * inchangé (aucun nouveau fichier à mettre en cache).
 *
 * 24/08/2026, avant (EVOLUTIONS 8, 9, 14 — todo.md, retour
 * utilisateur) :
 * - EVOLUTION 8 (origine Belitan/Collecte de données) : `originesMaison.json`
 *   gagne un champ `bonusProdSecondaire` (null par défaut sur toutes les
 *   entrées) ; fixé à "credit" pour l'entrée Belitan dont `bonusProd` vaut
 *   déjà "nourriture" — Belitan produit désormais +1 Nourriture ET +1
 *   Crédit. `StrategieService.calculerNiveauxProduction_` (strategieService.js)
 *   applique ce second bonus au même titre que `bonusProd`.
 * - EVOLUTION 9 (niveau de production — secteurs non possédés) :
 *   `calculerNiveauxProduction_` ne comptait, à tort, la contribution
 *   Population × Guildes de TOUS les secteurs de la partie, y compris ceux
 *   ne nous appartenant plus (repris par le Néant). Le calcul ne prend
 *   désormais en compte que les secteurs possédés (au moins 1 PN joueur et
 *   aucune PN Néant dessus), sauf le Secteur-Mère qui nous appartient
 *   toujours même sans PN dessus. `SecteurService.appartientAuJoueur`
 *   (secteurService.js) est exposée publiquement (seule source de vérité,
 *   déjà utilisée en interne par `appartientAuJoueur_`) pour que
 *   strategieService.js s'appuie dessus sans dupliquer la règle. Le total
 *   de Puissance Navale déployée (`totalDeploye`, affiché en Cube déployé)
 *   n'est PAS concerné : les champs pnCorvette/etc. représentent déjà la PN
 *   du joueur, par opposition à pnNeant.
 * - EVOLUTION 14 (libellé "Augmenter une population") : le bouton d'option
 *   de Cadre `augmenter_population_pure` (index.html,
 *   LABEL_OPTION_FOCUSENGINE_) affichait "Augmenter une Population Pure" —
 *   renommé "Augmenter une population" pour matcher le texte déjà utilisé
 *   ailleurs (popups de résolution, journal).
 * - EVOLUTION 14/15 (doublon de numérotation dans todo.md — popups
 *   Regrouper/Envahir, retour utilisateur) : dans strategieService.js,
 *   les boutons "Ajouter ce déplacement" (Regrouper) et "Engager cette
 *   unité" (Envahir) ont désormais un espace (margin-bottom) après eux,
 *   avant le bouton Valider global. Les boutons Valider de ces deux popups
 *   affichaient le décompte dans leur libellé ("Valider (N
 *   déplacement(s))", "Lancer l'invasion (N unité(s))") — simplifiés en
 *   "Valider" tout court (4 occurrences : normal + message d'erreur), le
 *   décompte restant visible juste au-dessus ("Déplacements utilisés :
 *   N / 5", "N unité(s) de Puissance Navale engagée(s)").
 * Fichiers touchés : originesMaison.json, secteurService.js,
 * strategieService.js, index.html, version.js. `service-worker.js` inchangé
 * (aucun nouveau fichier à mettre en cache, CACHE_NOM dérive déjà de
 * APP_VERSION). 188 tests `*_test.js`/`*.test.js` au vert après ces
 * changements (secteurService_actions_test.js re-vérifié en particulier
 * pour l'export `appartientAuJoueur`).
 * EVOLUTIONS 10 (déplacer corruption), 11 (annulation multi-effets), 12
 * (limite d'utilisation Focus par cycle), 13 (coût action Installer) et 15/
 * 16 (règles Secteur-Mère lors de Regrouper, perte de PN) du todo.md restent
 * HORS PÉRIMÈTRE de cette livraison — scope à clarifier avec l'utilisateur
 * avant implémentation (chacune est une fonctionnalité distincte,
 * potentiellement ambiguë architecturalement).
 *
 * 24/08/2026, avant (Plat. maison — renomme la section "Corruption
 * et Influence" en "Corruption maison et influence", retour utilisateur) :
 * clarifie que ce compteur (`plateauMaison.corruptionMaison`) ne porte QUE
 * sur les Corruptions de la fiche Maison elle-même (pistes de
 * Civilisation, emplacements de Programme, Technologie Chambres de
 * décontamination — voir CivilisationService.definirCorruption/
 * gameService.js CHAMPS_PLATEAU_MAISON_AUTORISES) et jamais sur les
 * secteurs Corrompus possédés (compteur distinct, non suivi). Pur
 * changement de libellé (`index.html`, `<h2 class="section-title">` +
 * commentaire associé) — aucune logique modifiée.
 *
 * 24/08/2026, avant (Focus Production — automatise l'effet
 * "Ravitailler", retour utilisateur) :
 * `FocusEngine.resoudreCle_` (js/focusEngine.js) automatise désormais les
 * clés Effet "produire_<ressource>" où la ressource est imposée par le
 * nom même de la clé (produire_nourriture/energie/materiel/credit/
 * science — ex. Focus Production "Ravitailler", catalogue focus.json id
 * 14/98) : Effet uniquement (signe > 0), aucun choix utilisateur — le
 * gain est le revenu de production ACTUEL de cette ressource (Niveau
 * Population × Guildes + bonus d'origine, table PRODUCTION_NEMS/
 * PRODUCTION_CREDIT), calculé via une nouvelle popup dédiée
 * (`produire_revenu`, strategieService.js), même principe que
 * `influence_secteur` (aucune interaction, juste un calcul déterministe
 * qui ferme la popup immédiatement). Reste HORS PÉRIMÈTRE, inchangé :
 * `produire_ressource`/`produire_deux_ressources` (CHOIX du joueur parmi
 * les 5 ressources — popup de sélection pas encore construite).
 * `strategieService.js` : le calcul des niveaux de production
 * (Population × Guildes + bonus d'origine, jusqu'ici inline dans
 * `renderCubes_`) est factorisé dans une nouvelle fonction
 * `calculerNiveauxProduction_(partie)`, réutilisée par `renderCubes_`
 * (affichage, inchangé) ET par le contexte `produire_revenu` — même
 * calcul, une seule source de vérité.
 * 4 tests ajoutés dans `js/focusEngine.test.js` (delegation demanderChoix,
 * Ravitailler combine 3 clés produire_* résolues indépendamment, Annuler
 * bloque l'action, produire_ressource/produire_deux_ressources restent
 * hors périmètre) — 114 tests `*.test.js` + 18 `*_test.js` au vert.
 *
 * 24/08/2026, avant (Civilisation — règle générique "piste
 * Corrompue = aucun bénéfice de case", retour utilisateur) :
 * `CivilisationService.avancerPiste` (js/civilisationService.js)
 * applique désormais elle-même la règle docs-rules-corruption-gardiens-
 * refuges-technoConsume.md §1 ("une piste de Civilisation Corrompue ne
 * vous rapporte aucun bénéfice") : si la piste visée est marquée
 * Corrompue au moment de l'appel, le NIVEAU avance quand même d'une case
 * mais AUCUN effet n'est résolu (ni un éventuel enchaînement "avance
 * rapide", qui EST lui-même un bénéfice de case). Avant ce correctif,
 * SEUL le chemin dédié de l'Événement galactique G Cycle 1 Cadre 1
 * (corrompre une piste puis la faire avancer) ignorait le bénéfice ; le
 * bouton "Avancer" manuel (écran Focus) et les clés Focus/Programme
 * "avancer_civilisation" et variantes (dont "_moins_avancee"),
 * résolues via la popup 'avancer_civilisation' (strategieService.js),
 * appliquaient à tort l'effet de case même sur une piste Corrompue — bug
 * corrigé en centralisant la règle dans avancerPiste elle-même, pour
 * tout appelant.
 * Supprime `CivilisationService.avancerPisteSansEffet` (fonction dédiée
 * à un seul appelant, devenue redondante) : `strategieService.js`
 * (placerCorruptionSurPiste_, Événement G Cycle 1 Cadre 1) appelle
 * désormais la avancerPiste GÉNÉRIQUE — la piste vient d'être marquée
 * Corrompue par definirCorruption juste avant, donc la règle ci-dessus
 * s'y applique déjà telle quelle, sans code spécifique. La popup
 * 'avancer_civilisation' affiche en prime un aperçu "Piste Corrompue —
 * avancera sans bénéfice de case" au lieu du texte de la prochaine case,
 * pour ne pas laisser croire à un gain qui n'aura pas lieu.
 * `avancerPisteCorrompue` (mécanique différente — avance ET décoche,
 * jamais câblée à un bouton) reste inchangée, hors périmètre ici.
 * 3 tests remplacent les 2 tests avancerPisteSansEffet dans
 * `js/civilisationService_test.js` (110 + 18 tests `*.test.js`/`*_test.js`
 * toujours au vert).
 *
 * 23/08/2026, avant (Fin de cycle — popup "Phase Évaluation",
 * retour utilisateur, voir docs-rules-cycle-de-jeu.md §3) :
 * Le bouton "Fin du cycle"/"Terminer la partie" (index.html) ouvre
 * désormais StrategieService.demanderChoix({type:'phase_evaluation'})
 * avant d'appeler GameService.avancerCycle (qui n'est déclenché qu'après
 * validation de cette popup — "Annuler" referme sans rien persister ni
 * avancer). La popup affiche 5 sections : Plateau Crise/Refuge/Objectifs
 * galactiques/Objectifs de Programme sont de simples rappels textuels "à
 * détailler plus tard" (à automatiser indépendamment plus tard, la
 * dernière correspondant à la Phase 4 de l'implémentation des
 * Programmes) ; seule la section Entretien est réellement automatisée :
 * total = SecteurService.getEntretien + 2 par emplacement Programme
 * "Entretien actif" (même calcul que chargerEntretien_) ; paiement par
 * unité au choix (1 Nourriture / 2 Énergie / 2 Matériel, jamais de
 * substitution par Crédit/Science ni par perte d'Influence volontaire),
 * un bouton par ressource désactivé dès que le stock local ne suffit
 * plus (aucune écriture DB avant "Valider" — le paiement ne vit qu'en
 * variables locales le temps de la popup, annulable en fermant l'onglet
 * ou via "Annuler") ; "Valider" reste désactivé tant qu'il reste de
 * l'Entretien impayé ET qu'au moins une ressource permet encore de payer
 * une unité, et applique en un seul GameService.majPlateauMaison les 3
 * stocks décomptés + l'Influence diminuée de 3 par unité restée
 * impayée (`Math.max(0, ...)`, jamais négatif).
 * `css/style.css` : classes `.modal-section`/`.modal-section-titre`
 * (séparateur entre les 5 sections de la popup, même style que
 * `.focus-action`).
 * `e2e/helpers/interactions.js` : nouveau helper `resoudrePhaseEvaluation`
 * (paie l'Entretien tant que possible puis Valide) appelé par
 * `e2e/partie-aleatoire.spec.js` après chaque clic sur `#btn-fin-cycle`.
 * Corrige aussi une régression introduite par le changement de gabarit
 * de "Programmes en main" (version précédente) : `jouerUneActionFocusAleatoire`
 * ciblait `#screen-focus .focus-action .btn-jouer-action` sans le
 * scoper — les cartes Programme en main réutilisant désormais ce même
 * gabarit, le sélecteur y piochait aussi par erreur. Restreint
 * maintenant à `#strategie-focus-joueur`/`#focus-heroiques-joueur`.
 * Validé par les 110 tests `*.test.js` existants (inchangés, aucune
 * logique de gameService.js/secteurService.js touchée) + `npm run
 * test:e2e` + `npm run test:e2e:aleatoire` (14 maisons).
 *
 * 23/08/2026, avant (Programmes — gain de place + textes raccourcis,
 * retour utilisateur) :
 * - `chargerEntretien_` (index.html) : texte de l'Entretien dû raccourci en
 *   "Entretien : N" (le détail — "par unité, au choix..." + décompte
 *   Programmes — passe en `title` de #entretien-secteurs, plus de bandeau
 *   permanent).
 * - `renderProgrammesPlateauMaison_` (index.html) : titre du Programme de
 *   départ raccourci en "Maison - Origine" (ex. "Belitan - A", plus
 *   "Programme de départ — Belitan, Origine A") ; labels "Entretien"/
 *   "Corrompu" abrégés en "Ent."/"Cor." (title conservé pour clarté) sur
 *   les 4 emplacements ; le nom de chaque Programme (départ + emplacements
 *   1-3) devient cliquable (`.programme-nom-toggle`) pour afficher/masquer
 *   son texte (`.programme-detail-texte`, replié par défaut) — les
 *   emplacements 1-3 affichent désormais aussi objectif1/objectif2 du
 *   catalogue `programmes` (absents avant ce changement).
 * - `data/catalogue/programmesDepart.json` : `bonusPermanent` reformulé en
 *   "Prod <Ressource> + 1" (ex. "Prod Énergie + 1"), plus la phrase
 *   complète "Votre Niveau de Production d'Énergie augmente de 1." — pur
 *   changement de texte d'affichage, aucune logique n'en dépend
 *   (`bonusPermanent` n'est lu que par `renderProgrammesPlateauMaison_`).
 * - `renderProgrammesEnMain_` (js/strategieService.js) : carte
 *   restructurée sur le gabarit `.focus-action`/`.focus-action-corps`/
 *   `.focus-action-side` (déjà utilisé par carteFocusJoueurHTML_) — Focus
 *   liés + action sur une ligne ("FocusA, FocusB | Action"), nom de la
 *   carte en dessous en petit italique (`.hint hint-inline`), type de
 *   Programme retiré de l'affichage ; bouton "Utiliser" remplacé par le
 *   même bouton rond "▶" (`.btn-jouer-action`) que pour jouer une action
 *   Focus (même style, popup 'utiliser_programme' inchangée derrière).
 *
 * 23/08/2026, avant (Programmes — la case "Corrompu" d'un
 * emplacement (Plat. maison) reste cochable à vide, retour utilisateur) :
 * la Corruption d'un emplacement du plateau Programme est liée à
 * l'EMPLACEMENT lui-même, pas à la carte qui l'occupe — la case
 * "Corrompu" des emplacements 1-3 (`index.html`,
 * `renderProgrammesPlateauMaison_`) n'est donc plus désactivée quand
 * l'emplacement est vide (seule la case "Entretien" le reste, un
 * emplacement vide n'a pas d'Entretien à payer). Corrige en cascade
 * `GameService.utiliserProgramme` : placer un Programme dans un
 * emplacement déjà Corrompu conservait auparavant `corrompu:false` sur
 * la nouvelle carte et décrémentait `corruptionMaison` (comme si la
 * Corruption appartenait à l'ancienne carte remplacée) — désormais le
 * `corrompu` déjà présent sur le slot est conservé tel quel et
 * `corruptionMaison` n'est plus touché par ce chemin (seul le toggle
 * manuel de la case, `persisterSlots_`, ajuste ce compteur). 2 tests de
 * `js/gameService_utiliser_programme_test.js` mis à jour en conséquence.
 * Validé par les 128 tests `*.test.js`/`*_test.js`/`test_*.js` existants
 * + un parcours Playwright ponctuel (créé puis supprimé) : emplacement
 * vide, case Entretien désactivée/case Corrompu activable, coché ->
 * `#corruption-maison-input` +1, décoché -> -1.
 *
 * 23/08/2026, juste avant (Programmes — câblage de l'emplacement 0,
 * "Programme de départ") : `GameService.creerPartie` détermine désormais
 * le Programme de départ du joueur (maison + technologie de départ tirée
 * ou choisie) via un nouveau helper `obtenirProgrammeDepart_(nomMaison,
 * nomTechnologie)` (mirroring `obtenirOrigineMaison_` — lecture complète
 * de `programmesDepart`, filtre en JS, exclut les entrées
 * `supplementaire:true` de Marqualos, hors périmètre) et le place dans
 * `programmesUtilises[0]` : `{code, entretienActif:true, corrompu:false,
 * depart:true}`, ou `null` si aucune correspondance (catalogue non
 * synchronisé — tolérant, comme pour `originesMaison`). Slot 0 est donc
 * identifié par `code` (pas `nom`, ces Programmes n'en ont pas) —
 * `programmesUtilisesParDefaut_(slot0)` accepte désormais un paramètre
 * optionnel pour ce slot au lieu de toujours le laisser `null`.
 * `index.html` (`renderProgrammesPlateauMaison_`) : le slot 0 n'est plus
 * un placeholder texte fixe — recherche l'entrée `programmesDepart`
 * correspondante (`DB.getAll('programmesDepart')`, en plus du catalogue
 * `programmes` déjà chargé) et affiche ses `objectifs` + `bonusPermanent`
 * éventuel, avec un toggle "Entretien" (actif par défaut, contrairement
 * aux emplacements 1-3) — toujours AUCUNE case "Corrompu" pour ce slot
 * (n'existe pas pour le Programme de départ, inchangé). Bug latent
 * corrigé au passage dans les handlers Entretien/Corrompu (emplacements
 * 1-3) : ils reconstruisaient le slot modifié avec un littéral
 * `{nom: s.nom, ...}` figé, qui aurait silencieusement perdu le champ
 * `code` du slot 0 dès qu'un AUTRE emplacement était coché/décoché sur le
 * même écran (tous les slots repassent par le même tableau reconstruit
 * en mémoire) — remplacé par `Object.assign({}, s, {...})`, générique
 * quel que soit le champ identifiant du slot. `chargerEntretien_`
 * (déjà générique, somme `entretienActif` sur les 4 emplacements sans
 * distinction) prend donc automatiquement en compte le Programme de
 * départ sans modification. Validé par les 128 tests `*.test.js`/
 * `*_test.js`/`test_*.js` existants (aucune régression, `programmesUtilises
 * ParDefaut_` reste rétrocompatible sans argument) + un parcours
 * Playwright ponctuel (créé puis supprimé) : partie Valnis (technologie
 * de départ tirée aléatoirement, code attendu recalculé dynamiquement
 * depuis `programmesDepart.json`) — slot 0 affiche le bon `code`/
 * objectifs/bonus, Entretien actif par défaut (+2 vérifié sur
 * `#entretien-secteurs`), décoché -> +2 retiré, aucune case Corrompu
 * présente.
 *
 * 23/08/2026, dernière fois (Catalogue — Programmes de départ, dernière
 * maison confirmée) : image de la page confirmant Kradmor/Astoran (déjà
 * exacts) et Shiveus (H7-A/B, dernière maison encore `incertain:true`) —
 * la coupure déduite par comparaison de formulation était la bonne, aucun
 * changement de contenu, juste `incertain` passé à `false`. Les 30
 * entrées de data/catalogue/programmesDepart.json sont désormais toutes
 * confirmées par image (plus aucune `incertain:true`) — reste seulement
 * `nom`/`type` inexistants pour ces Programmes (confirmé précédemment,
 * pas une donnée manquante) et le câblage sur l'emplacement 0 du plateau
 * Programme, toujours non traité (Phase 3 reste inchangée).
 *
 * 23/08/2026, toujours (Catalogue — Programmes de départ, correctif de
 * contenu Thegwyn) : image de la page 20/52 du livret, confirmant
 * Belitan/Novaris/Fenrax (déjà exacts) et révélant une erreur sur Thegwyn
 * — H6-A ne fait que 2 objectifs ("secteurs Purs" + "Guildes de Fermiers
 * Pures"), sans bonus de Production ; tout le reste (ressource 8 unités,
 * piste Gouvernement, Guildes Banquiers/Scientifiques + bonus Énergie et
 * Matériel) appartient à H6-B, pas répartis 4/3 comme précédemment déduit.
 * H6-A/H6-B corrigés, `incertain` passé à `false` pour les deux. Seul
 * Shiveus (H7-A/B) reste `incertain:true`.
 *
 * 23/08/2026, encore (Catalogue — Programmes de départ, correctif de
 * contenu Nervo) : image de la page 19/52 du livret fournie par
 * l'utilisateur, confirmant Cortozaar/Marqualos/Zenor/Yarvek (déjà
 * exacts) et révélant une erreur sur Nervo — la phrase "Pour chaque piste
 * de Civilisation Pure, gagnez respectivement 2/4/6/8 Influence..."
 * appartient à H9-A (3e objectif), pas à H9-B comme précédemment déduit
 * par comparaison de formulation (coupure 2/3 supposée, en réalité 3/2).
 * H9-A/H9-B corrigés dans data/catalogue/programmesDepart.json,
 * `incertain` passé à `false` pour les deux (désormais confirmés par
 * image, comme Valnis/Kradmor). Restent `incertain:true` : Shiveus
 * (H7-A/B) et Thegwyn (H6-A/B), toujours non confirmés.
 *
 * 23/08/2026, suite (Catalogue — Programmes de départ, correctif) :
 * `nom`/`type` retirés de data/catalogue/programmesDepart.json (30
 * entrées) — décision utilisateur explicite : ces Programmes n'ONT pas de
 * nom (identifiés par `maison`+`origine`/`code`, ex. "H1-A") ni de type
 * (Domination/Force/Soutien/Richesse), ce n'est pas une donnée manquante à
 * compléter plus tard, contrairement à ce que l'entrée précédente
 * supposait. Corrige aussi les commentaires `js/db.js`/
 * `docs-architecture-pwa.md` qui présentaient ces deux champs comme
 * "pas encore renseignés". Aucun changement de comportement (catalogue
 * pur, toujours non câblé sur le plateau Programme).
 *
 * 23/08/2026 (Catalogue — Programmes de départ, préparation avant Phase 4 ;
 * PAS ENCORE câblé sur le plateau Programme — emplacement 0 de
 * `programmesUtilises` reste `null` à la création de partie, aucun
 * changement de comportement en jeu dans ce lot) : nouveau fichier
 * `data/catalogue/programmesDepart.json` (30 entrées — 1 par Origine A/B
 * des 14 maisons, +2 "supplémentaires" A2/B2 propres à Marqualos), nouveau
 * store IndexedDB `programmesDepart` (`js/db.js`, `VERSION_BASE` 2→3 pour
 * déclencher `onupgradeneeded` chez les joueurs déjà installés — validé en
 * navigateur réel, le store se recrée bien sans perte des autres),
 * enregistré dans `js/catalogueSync.js` (`TABLES`, 12→13 fichiers) et
 * `service-worker.js` (`FICHIERS_A_METTRE_EN_CACHE`).
 * Schéma (corrigé par l'entrée suivante — voir plus haut) : `{code,
 * maison, origine ('A'|'B'), technologieDepart, supplementaire,
 * objectifs:[String], bonusPermanent:String|null, incertain}` — PAS de
 * `nom`/`type`, ces Programmes n'en ont pas (décision utilisateur, voir
 * ci-dessus). `type` (Domination/Force/Soutien/Richesse) manquant bloque
 * le câblage sur `INFO_PROGRAMME_PAR_TYPE`/le plateau Programme (Phase 3),
 * remis à plus tard. `bonusPermanent` isole la ligne
 * "+" (Niveau de Production, effet permanent immédiat) des `objectifs`
 * (scoring, évalués en fin de partie) — distinction confirmée visuellement
 * par les 2 images fournies. `incertain:true` sur Shiveus (H7-A/B), Nervo
 * (H9-A/B) et Thegwyn (H6-A/B) : la coupure Origine A/Origine B n'a pu être
 * déduite que par comparaison de formulation avec les maisons confirmées
 * (gabarit partagé Valnis/Dunlork/Cortozaar/Belitan, images Valnis/Kradmor,
 * labels A/A2/B/B2 explicites de Marqualos) — à corriger si besoin
 * (décision utilisateur, "si trop compliqué je remplirai les données plus
 * tard"). Aucun changement de comportement en jeu : ce lot est un ajout de
 * données catalogue pur, aucun code de `creerPartie`/Phase 3 ne lit encore
 * ce store.
 *
 * 23/08/2026 (Programmes — Phase 3 : utiliser un Programme + plateau des
 * 4 emplacements de la fiche Maison ; Phase 4 "objectifs + score" non
 * traitée) :
 * - Séparation de modèle nécessaire : "Programmes en main" (gagné, pas
 *   encore joué) et "plateau Programme" (joué, actif) sont deux états
 *   distincts que `programme1-4` (Phase 2) conflait. Nouveaux champs
 *   `plateauMaison.programmesEnMain` (tableau non borné de noms, même
 *   famille que `jetonCommerce`) et `plateauMaison.programmesUtilises`
 *   (tableau fixe de 4, `null`/`{nom,entretienActif,corrompu}`, index 0
 *   réservé au Programme de départ — laissé vide, données Origine Maison
 *   pas encore disponibles au catalogue, "on les ajoutera plus tard",
 *   décision utilisateur ; index 1-3 remplis via "Utiliser"). `programme1-4`
 *   abandonné (retiré de `CHAMPS_PLATEAU_MAISON_AUTORISES`/`creerPartie`/
 *   `assemblerPartie_`, aucune migration — IndexedDB n'impose pas de
 *   schéma). `GameService.gagnerProgramme` (Phase 2) cible désormais
 *   `programmesEnMain`, sans limite de 4 ; rejette aussi un Programme déjà
 *   présent dans `programmesUtilises`.
 * - Nouvelle `GameService.utiliserProgramme(partieId, nomProgramme,
 *   demanderChoix)` : résout l'action gratuite du Programme (règle fixe
 *   par type, nouvelle table `EFFET_PROGRAMME_PAR_TYPE_` construite depuis
 *   `INFO_PROGRAMME_PAR_TYPE` déjà existante — Domination -> `{envahir:1}`,
 *   Soutien -> `{choice:['activer_cube','construire_installation']}`
 *   (et/ou), Force -> `{choice:['avancer_civilisation_moins_avancee',
 *   'gagner_commerce']}` (ou), Richesse -> `{choice:['etablir_guilde',
 *   {produire_ressource:1}]}` (et/ou) — via `FocusEngine.resoudreEffet`,
 *   MÊME moteur que les actions Focus, `cout` toujours vide (actions de
 *   Programme gratuites). `produire_ressource` (Richesse) n'est pas
 *   automatisé côté PWA (niveaux de production non calculés) mais ne
 *   bloque rien : en mode "et/ou" une clé non reconnue retombe sur le
 *   repli générique existant (rappel manuel, jamais un blocage) — le
 *   Programme part bien en jeu. Si l'action va au bout, le Programme
 *   quitte `programmesEnMain` pour `programmesUtilises` (emplacements 1-3
 *   UNIQUEMENT, l'emplacement 0 n'est jamais touché ici) : emplacement
 *   libre -> placé directement ; emplacement du MÊME type déjà occupé ->
 *   confirmation (refusée -> reste en main, action déjà résolue non
 *   annulable) ; 3 emplacements pleins sans conflit -> nouvelle popup de
 *   choix. Un emplacement remplacé qui était Corrompu décrémente
 *   `corruptionMaison` de 1.
 * - `js/focusEngine.js` : nouveau cas `avancer_civilisation_moins_avancee`
 *   dans `resoudreCle_` (déléguait auparavant au repli générique, retiré
 *   de `CLES_CIVILISATION_HORS_PERIMETRE`) — délègue à la MÊME popup
 *   `'avancer_civilisation'` que les variantes existantes, avec un flag
 *   `moinsAvancee:true` : la popup (`js/strategieService.js`) calcule
 *   elle-même la piste la moins avancée (même tri que
 *   `CivilisationService.avancerPisteMoinsAvancee`, fonction déjà
 *   existante mais jamais câblée sur une popup jusqu'ici) puis réutilise
 *   tel quel le rendu/la validation du mode "piste imposée".
 * - Nouvelles popups `js/strategieService.js` : `'utiliser_programme'`
 *   (affiche l'action, bouton "Résoudre" -> `GameService.utiliserProgramme`,
 *   relaie la MÊME `demanderChoix` pour toutes les sous-popups imbriquées
 *   — envahir/options_inclusives/avancer_civilisation/confirmation/etc.,
 *   exactement comme une vraie action Focus) et
 *   `'choisir_emplacement_programme'` (menu à 3 boutons, comme
 *   `gagner_corruption`). `renderProgrammesEnMain_` (Phase 2) : bouton
 *   "Utiliser" n'est plus un stub désactivé, lit `programmesEnMain` (plus
 *   `programmes`), rafraîchit toute la partie (`App.rafraichirPartieCourante`)
 *   au retour pour refléter les mutations ressources/cube/civilisation
 *   éventuelles ET le déplacement vers Plat. maison.
 * - Nouvelle section "Programmes" sur Plat. maison (`index.html`, entre
 *   "Technologies" et "Corruption et Influence") : emplacement 0 en
 *   placeholder texte ("à renseigner"), emplacements 1-3 (nom+type en
 *   lecture seule — jamais choisis ici, uniquement via "Utiliser") avec
 *   toggle "Entretien" (actif = +2 à l'Entretien dû, additionné à
 *   `SecteurService.getEntretien` dans `chargerEntretien_`, règle du
 *   livret §3.2.1.1 — icônes Entretien des cartes Programme, jusqu'ici non
 *   prises en compte) et case "Corrompu" (ajuste `corruptionMaison` de ±1
 *   au clic, met aussi à jour directement `#corruption-maison-input` — pas
 *   re-rendu par ce bloc sinon). `creerPartie` : dernier emplacement (index
 *   3) Corrompu dès la mise en place (règle du livret), `corruptionMaison`
 *   initialisé à 1 en conséquence.
 * - `js/gameService_programme_test.js` (7 tests, réécrit pour
 *   `programmesEnMain`), nouveau `js/gameService_utiliser_programme_test.js`
 *   (8 tests, FocusEngine mocké — couvre l'orchestration : placement
 *   direct, conflit de type accepté/refusé, plateau plein choisi/annulé,
 *   action annulée, Programme introuvable, mutations fusionnées), 2 tests
 *   ajoutés à `js/focusEngine.test.js`
 *   (`avancer_civilisation_moins_avancee`). Validé aussi par 2 parcours
 *   Playwright ponctuels (créés puis supprimés) : Annuler sur l'invasion
 *   imbriquée laisse le Programme en main ; placement réussi (voie
 *   Force/Commerce) + toggle Entretien (+2 vérifié sur Plat. Galactique)
 *   + toggle Corrompu (+1 vérifié, bug de rafraîchissement DOM trouvé et
 *   corrigé au passage) + conflit de type avec remplacement confirmé — en
 *   plus des 110 tests `*.test.js` + tous les `*_test.js`/`test_*.js`
 *   existants + `e2e/partie-complete.spec.js`.
 *
 * 23/08/2026 (Programmes — Phase 1 offre + Phase 2 gain, chantier découpé
 * en 4 phases par l'utilisateur ; Phase 3 "actions de Programme"/Phase 4
 * "objectifs + score" non traitées ici) :
 * - Phase 1 — nouvelle section "Offre Programmes" (Plat. Galactique,
 *   index.html, entre "Focus héroïques" et le bouton "Terminer la
 *   partie") : 4 emplacements fixes (1 par type Domination/Force/Soutien/
 *   Richesse), chacun un <select> limité au catalogue de ce type + une
 *   case Corrompu — persistance directe via GameService.majPlateauMaison
 *   (nouveau champ `plateauMaison.offresProgramme`, tableau de 4
 *   `{type, nom, corrompu}`, même famille que `gloire` — non diffable par
 *   focusEngine.js). renderOffreProgrammes_ (index.html), appelée depuis
 *   renderEcranPlateauGalactique_.
 * - Phase 2 — gagner un Programme devient réellement interactif :
 *   nouvelle popup 'gagner_programme' (strategieService.js, gabarit
 *   'construire') listant tout le catalogue groupé par type (`<optgroup>`),
 *   filtré sur un type imposé le cas échéant, excluant les Programmes
 *   déjà en main, l'offre publique en cours mise en évidence ("★ "), le
 *   texte (objectif1/objectif2) affiché au changement de sélection.
 *   Persiste via la nouvelle GameService.gagnerProgramme(partieId,
 *   nomProgramme) : écrit le 1er emplacement `programme1-4` libre,
 *   réinitialise l'entrée `offresProgramme` correspondante si le
 *   Programme choisi en faisait partie. FocusEngine.resoudreCle_ (js/
 *   focusEngine.js) reconnaît désormais "gagner_programme" (valeur 1 ou
 *   type en chaîne) ET les clés bare "programme_force"/"programme_soutien"/
 *   "programme_domination"/"programme_richesse" (2 vocabulaires du
 *   catalogue pour la même mécanique) — même pattern que
 *   retirer_corruption/gain_corruption/ameliorer_gloire (popup dédiée,
 *   resoudreCle_ ne fait que relayer le résumé dans le journal).
 *   civilisationService.js (resoudreCaseEtChainerAvanceRapide_) appelle
 *   déjà FocusEngine.resoudreEffet en interne : le chemin piste de
 *   Civilisation en bénéficie automatiquement, sans code spécifique —
 *   seul nettoyage nécessaire, la branche "gagner_programme" de
 *   texteRappelPourCle_ (devenue inatteignable, plus jamais de rappel
 *   manuel pour cette clé) et TYPES_PROGRAMME_CONNUS_ (orpheline)
 *   retirées ; gagner_technologie inchangé (toujours manuel, hors
 *   périmètre de ce lot). Aucun cadre `evenements.json` n'utilise
 *   gagner_programme en option "choix" (vérifié sur tout le catalogue) —
 *   aucun changement nécessaire côté Cadres d'Événement galactique.
 * - Nouvelle section "Programmes en main" (écran Focus, index.html, entre
 *   "Listes de focus" et "Focus héroïques") : une carte par Programme
 *   possédé (programme1-4) — nom, type, les 2 Focus liés et l'action de
 *   Programme, données FIXES PAR TYPE (règle du livret "Actions de
 *   Programme", pas un champ par carte de data/catalogue/programmes.json)
 *   portées en dur dans la nouvelle constante GameService.
 *   INFO_PROGRAMME_PAR_TYPE (même statut que FocusEngine.BONUS_COMMERCE).
 *   Bouton "Utiliser" en stub désactivé (résolution de l'action =
 *   Phase 3, non traitée). renderProgrammesEnMain_ (strategieService.js),
 *   appelée depuis StrategieService.afficher — qui appelle désormais
 *   aussi App.renderPlateauGalactique(partie) systématiquement (même
 *   rationale que l'appel déjà existant à App.renderPlateauMaison :
 *   idempotent, sans risque même hors-sujet) pour que l'offre publique se
 *   rafraîchisse si un gain de Programme via une action Focus vient d'en
 *   vider une entrée.
 * Nouveaux tests : js/gameService_programme_test.js (7 tests,
 * GameService.gagnerProgramme), 5 tests ajoutés à js/focusEngine.test.js
 * (gagner_programme valeur 1/type imposé/clé bare/annulé), 2 tests de
 * js/civilisationService_test.js réécrits pour le nouveau comportement.
 * Validé aussi par un parcours Playwright ponctuel (créé puis supprimé,
 * comme pour l'Événement H) couvrant offre → gain via Focus → mise en
 * évidence de l'offre dans la popup → "Programmes en main" → offre
 * nettoyée, en plus des 108 tests `*.test.js` + tous les
 * `*_test.js`/`test_*.js` existants + e2e/partie-complete.spec.js.
 *
 * 23/08/2026, suite encore (Événement galactique H, Cycle 1, Cadre 1 —
 * "Droit en enfer") : Cadre "choix" au vocabulaire inédit dans tout le
 * reste du catalogue (vérifié par grep sur "gloire"/"recall" à
 * l'intérieur de tout `cadre.effet`) — 2 options : { gain: {
 * corruption:1, gloire:1 } } (aucune des deux clés `cle`/`valeur`
 * attendues par deltaOptionCadre_/cleFocusEnginePourOptionCadre_) et
 * { recall: { cube:1 } } (mécanique jamais branchée sur un Cadre — seul
 * un formulaire dédié de l'écran Secteurs existait). Les deux sont
 * désormais automatisées, en composant des mécaniques déjà existantes
 * plutôt qu'en en inventant de nouvelles :
 * - Option Corruption + Gloire : réutilise la popup 'gagner_corruption'
 *   existante (mêmes 4 cibles que GameService.appliquerCadreGainCorruption,
 *   aucune cible n'étant précisée par le catalogue pour cette option —
 *   donc les 4 restent ouvertes) puis ajoute un jeton Gloire de valeur 1
 *   au premier emplacement libre de plateauMaison.gloire (même geste que
 *   le clic manuel sur un emplacement vide, ou le dépôt automatique après
 *   une invasion réussie — strategieService.js). Si les 5 emplacements
 *   Gloire sont déjà occupés, la Corruption est placée normalement mais
 *   le jeton Gloire non posé, signalé dans le résumé du cadre (aucune
 *   défausse/remplacement inventé, cas non couvert par les règles).
 * - Option Rappel de cube : nouvelle popup 'rappeler_cube'
 *   (strategieService.js, même gabarit que 'construire' — secteur + type
 *   de vaisseau, réutilise SecteurService.obtenirSecteurs/rappelerCube,
 *   secteurEstPossede_ pour l'éligibilité — même règle qu'index.html/
 *   renderFormulaireRappelerCube_, le formulaire dédié de l'écran
 *   Secteurs).
 * js/gameService.js (2 nouvelles fonctions — appliquerCadreChoixCorruptionGloire/
 * appliquerCadreChoixRappelCube, reconnaissent EXACTEMENT ce gabarit,
 * même prudence que conditionAvancerPisteSiCorrompue_ — aucune tentative
 * de généraliser à un futur Cadre au vocabulaire similaire),
 * js/strategieService.js (contexte 'rappeler_cube'), index.html
 * (actionsCadre_ reconnaît les 2 nouvelles formes d'option,
 * ouvrirPopupCadreEtRafraichir_ + 2 nouveaux wrappers
 * appliquerCadreCorruptionGloireEtRafraichir_/
 * appliquerCadreRappelCubeEtRafraichir_). Cadre 2 (modificateur_permanent
 * — surcharge de coût sur TOUT déploiement de cube pour le reste du
 * Cycle 1) volontairement laissé en l'état (texte seul, non cliquable) :
 * comme les 8 autres Cadres "modificateur_permanent" du catalogue, aucun
 * n'est automatisé à ce jour — intercepter un type d'action existant
 * (deployer_cube) pour lui appliquer un surcoût conditionnel pendant tout
 * un Cycle est une mécanique transverse d'une nature différente, pas
 * traitée dans ce lot. Nouveau fichier de test
 * js/gameService_cadre_h1_test.js (7 tests, même principe que
 * gameService_cadre_gain_corruption_test.js). Validé aussi par un
 * parcours Playwright ponctuel (créé puis supprimé, pas conservé dans
 * e2e/) couvrant les 2 options + le Cadre 2 non cliquable, en plus des
 * 104 tests `*.test.js` + tous les `*_test.js`/`test_*.js` existants +
 * e2e/partie-complete.spec.js.
 *
 * 23/08/2026, encore (Plat. maison — Influence éditable) : le cadran
 * Influence (#influence-maison-input) devient un champ numérique
 * modifiable, même gabarit que Corruption juste à côté (auparavant un
 * <span> en lecture seule — AUCUN moyen de corriger l'Influence à la
 * main dans toute l'app, alors que l'évaluation des Objectifs
 * galactiques/Programme en fin de Cycle (docs-rules-cycle-de-jeu.md
 * §3.3/3.4) reste hors périmètre de l'automatisation et doit donc être
 * ajoutée manuellement). index.html (renderEcranPlateauMaison_ —
 * inputInfluenceMaison.onchange -> GameService.majPlateauMaison(partie.id,
 * {influence}), champ déjà whitelisté côté gameService.js
 * CHAMPS_PLATEAU_MAISON_AUTORISES, aucun changement nécessaire là-bas).
 * Aucune nouvelle classe CSS (réutilise .plateau-influence
 * .ressource-case-input, déjà stylée pour Corruption).
 *
 * 23/08/2026, suite (Fin de partie — score final du joueur) : le champ
 * "Score final du joueur" (#fin-score-final) est lui aussi pré-rempli à
 * l'ouverture de l'écran Fin de partie, depuis l'Influence accumulée sur
 * Plat. maison (partie.plateauMaison.ressources.influence) — c'est la
 * seule utilité de l'Influence (docs-rules-Influence-et-ressources.md
 * §1). ⚠️ Au moment de ce lot, ce total ne reflétait QUE les gains
 * automatisés (Focus/Cadres) — pas l'évaluation des Objectifs galactiques/
 * Programme, alors hors périmètre ET sans aucun champ pour les ajouter à
 * la main (corrigé juste au-dessus, même journée). Champ laissé
 * modifiable. js/scoreVueService.js (preremplirScoreFinal_, rechargement
 * frais via GameService.obtenirPartie plutôt que partieCourante en
 * mémoire, potentiellement périmé après une action Focus), index.html (span
 * .field-auto sous le label du champ). Aucun changement gameService.js/
 * scoreService.js pour ce complément.
 *
 * 23/08/2026 (Fin de partie — automatisation des compteurs d'Influence) :
 * l'écran Fin de partie pré-remplit désormais les compteurs calculables
 * depuis l'état déjà suivi par l'app (secteurs de Faille du scénario,
 * jetons Gardien, cartes Maison Déchue encore sur des secteurs,
 * Population des secteurs occupés par une Puissance Navale du Néant,
 * Corruption des secteurs + pistes de Civilisation) — champs laissés
 * modifiables, le joueur ajuste selon le plateau physique. Le reste
 * (catastrophes, crises permanentes, refuges incomplets, technologies
 * consumées, difficulté de base) n'a aucune trace en base et reste
 * entièrement manuel. js/scoreService.js (nouveau
 * ScoreService.calculerCompteursAutomatiques/CLES_COMPTEURS_
 * AUTOMATISABLES, pure calculerCompteursAutomatiquesDepuisEtat_ séparée
 * du chargement DB), js/scoreVueService.js (preremplirCompteursAutomatiques_,
 * appelé à l'ouverture de l'écran Fin de partie), css/style.css
 * (.field-auto). Corrigé au passage : BAREME.secteursFaille valait 60,
 * la règle indique 30 par secteur de Faille encore sur le plateau (bug
 * documenté de longue date, docs/docs-rules-cycle-de-jeu.md §4) —
 * changement de comportement pour toute partie déjà terminée avec au
 * moins un secteur de Faille non nul dans ses compteurs, aucun impact
 * sur les parties déjà enregistrées (finDePartie n'est jamais
 * recalculé rétroactivement). docs/docs-rules-cycle-de-jeu.md et
 * docs/docs-architecture-pwa.md mis à jour en conséquence.
 *
 * 22/08/2026 (nettoyage des commentaires historiques + mise à jour de la
 * documentation) : passage sur l'ensemble du code applicatif
 * (`index.html`, `css/style.css`, tout `js/*.js` y compris les fichiers de
 * test, `service-worker.js`) pour retirer les commentaires qui ne
 * racontaient que l'historique du projet (dates, "Session N"/"Lot X",
 * "retour utilisateur", numéros de version, références à
 * `docs/docs-rapport.md`, narration de portage depuis le legacy Google
 * Apps Script) — conservé partout : le POURQUOI non évident du
 * comportement actuel (invariants, contournements de bug, périmètres
 * volontairement hors scope), reformulé sans la référence historique.
 * `version.js` n'est PAS concerné (reste le changelog daté du projet, par
 * design). Un correctif de documentation réel trouvé au passage :
 * `gameService.js` `creerPartie` affirmait à tort qu'aucun secteur n'est
 * instancié, alors que `SecteurService.instancierSecteurs` est bien
 * appelé — JSDoc corrigée pour refléter le code réel. `docs/docs-
 * architecture-pwa.md` mis à jour en profondeur pour refléter l'état
 * actuel du code (API publiques de chaque module, catalogue complet des
 * 18 `contexte.type` de `demanderChoix`, stratégie de test à jour —
 * `civilisationService.js`/`combatService.js` désormais testés,
 * `scoreService.js` seul module pur restant sans test dédié — dette
 * connue réévaluée : extractions `strategieService.js`/`index.html` et
 * refetch `gameService.js` examinés et documentés comme des choix
 * délibérés plutôt que de la dette). `CLAUDE.md` mis à jour en
 * conséquence (tailles de fichiers, points résolus). Aucun changement de
 * comportement : validé par les 104 tests `*.test.js` + les 7 fichiers
 * `*_test.js`/`test_*.js` + `e2e/partie-complete.spec.js` +
 * `e2e/partie-aleatoire.spec.js` (14 maisons).
 *
 * 22/08/2026 (docs/docs-rapport.md DUP-1 + DUP-4, suite de la reprise des
 * corrections du rapport d'audit) :
 * - DUP-1 : index.html ne tient plus ses propres copies de
 *   LABEL_RESSOURCE_CADRE_/COULEUR_RESSOURCE_CADRE_/TYPES_INSTALLATION/
 *   TYPES_GUILDE/TYPES_VAISSEAU/COULEUR_PAR_GUILDE_CADRE_ — lit désormais
 *   StrategieService.CHAMP_RESSOURCE/TYPES_INSTALLATION_CONSTRUIRE_/
 *   TYPES_GUILDE_CONSTRUIRE_/TYPES_VAISSEAU/GUILDE_VERS_RESSOURCE
 *   (nouvellement exposées) — nouveau helper index.html
 *   libelleRessourceCadre_, COULEUR_PAR_GUILDE_CADRE_ recalculée (2 hops
 *   via les tables exposées) au lieu d'une 3ᵉ copie figée des 5 couleurs.
 *   2 divergences de libellé trouvées entre les anciennes copies,
 *   tranchées par l'utilisateur : "Défense Secteur" -> "Défense de
 *   Secteur" (formulaire Construire, écran Secteurs) et "Cuirasse" ->
 *   "Cuirassé" (corrigé côté strategieService.js, désormais cohérent avec
 *   combatService.js qui utilisait déjà l'accent). LABEL_GUILDE/
 *   LABEL_INSTALLATION/LABEL_PN (tableau Secteurs, libellés abrégés,
 *   clés `guildeFermiers` etc.) restent des tables à part — pas une
 *   duplication au sens strict (texte ET clés différents des tables
 *   `cle`/`label` ci-dessus).
 * - DUP-4 : LABEL_GUILDE_INFLUENCE_ (strategieService.js, copie exacte de
 *   TYPES_GUILDE_CONSTRUIRE_) supprimée, remplacée par labelGuilde_(cle)
 *   (même principe que labelVaisseau_/MUT-6). CHAMP_RESSOURCE vs
 *   RESSOURCES_TOUTES (strategieService.js) restent volontairement
 *   séparées (déjà documenté avant ce lot — portées différentes, voir
 *   commentaire en tête de RESSOURCES_TOUTES).
 * Aucun changement de comportement à l'exception des 2 libellés
 * corrigés ci-dessus (décision utilisateur) : validé par les 80 tests
 * `*.test.js` + les 51 tests `*_test.js`/`test_*.js` +
 * e2e/partie-complete.spec.js + e2e/partie-aleatoire.spec.js (14 maisons).
 *
 * 22/08/2026 (docs/docs-rapport.md GAP-1 + ARCH-6, reprise des corrections
 * du rapport d'audit) :
 * - GAP-1 : `texteAmeliore` (catalogue technologies.json, rempli sur les 28
 *   entrées mais jamais affiché) désormais visible en tooltip sur la case
 *   "Améliorée" cochée — Technologie de départ ET les 5 emplacements
 *   "Technologies obtenues" (Plat. maison). js/gameService.js
 *   (obtenirMaisonsCatalogue_/formatMaison_ propagent désormais
 *   texteAmeliore, comme texte déjà avant), index.html (nouveau helper
 *   titreTechnologie_, title dynamique sur #technologie-depart-plateau-
 *   maison et chaque `.check-amelioree` de renderTechnologiesObtenues_ —
 *   lookup par nom dans partie.joueur.technologies/toutesLesTechs, aucun
 *   changement de schéma persisté).
 * - ARCH-6 : commentaire obsolète `index.html` (écran Secteurs, mentionnait
 *   "SecteurService.obtenirSecteurMere n'est plus appelé" — faux, utilisé
 *   par js/strategieService.js popup 'deployer_cube' mode 'secteur_mere')
 *   corrigé ; `.subsection-title` (h3, 4 occurrences statiques + 1
 *   générée en JS) stylée pour la première fois (css/style.css, même
 *   gabarit que `.card h3`, sans le trait orange — délibérément absent,
 *   voir commentaire index.html) ; js/civilisationService.js : 9
 *   échappements `\uXXXX` résiduels (mélangés aux caractères accentués
 *   directs utilisés partout ailleurs dans ce fichier) remplacés par leur
 *   caractère direct (`’` -> apostrophe ASCII `'`, cohérent avec le
 *   reste du fichier, pas de guillemet typographique ailleurs — 2
 *   occurrences réécrites en `\'` pour rester dans une chaîne à guillemets
 *   simples). La plage regex de la ligne 133 (normalisation Unicode des
 *   diacritiques, U+0300 à U+036F) n'est PAS concernée, laissée telle
 *   quelle (pas un problème de cohérence, un vrai intervalle de code
 *   points illustrable seulement en échappement).
 * Aucun changement de comportement (sauf l'ajout du tooltip GAP-1, prévu) :
 * validé par les 80 tests `*.test.js` + les 51 tests `*_test.js`/
 * `test_*.js`.
 *
 * 21/08/2026 (docs/docs-rapport.md MUT-2 à MUT-8 + DUP-2/DUP-3, suite de
 * la relecture complète) :
 * - MUT-2 : focusEngine.js — motif demanderChoix/journal répété 7 fois
 *   dans resoudreCle_ factorisé en `demanderChoixEtJournaliser_`.
 * - MUT-3/MUT-4/MUT-5/MUT-6 : strategieService.js — `secteurEstPossede_`/
 *   `creerSecteurParNumero_`/`construireAdjacenceMap_`/`labelVaisseau_`
 *   factorisent ce qui était dupliqué entre les popups Regrouper/
 *   Déployer un cube/Envahir.
 * - MUT-7/MUT-8 : secteurService.js — `installationsUtilisees_`/
 *   `guildesUtilisees_` factorisent le calcul d'emplacements utilisés
 *   (8 occurrences) ; `regrouper` utilise un objet imbriqué plutôt
 *   qu'une clé composite reparsée.
 * - DUP-2 : `SecteurService.CHAMP_PN_PAR_TYPE` exposée publiquement,
 *   copie locale de strategieService.js supprimée.
 * - DUP-3 : gameService.js/focusEngine.js — tables de ressources
 *   identiques documentées par des commentaires croisés plutôt que
 *   fusionnées (gameService.js charge avant focusEngine.js et doit
 *   rester utilisable sans lui).
 * DUP-1/DUP-4 (index.html duplique des tables de strategieService.js)
 * non traités — plus gros volume, laissés pour une session dédiée.
 * Aucun changement de comportement : validé par 80 tests `*.test.js` +
 * 51 tests `*_test.js`/`test_*.js` + e2e/partie-complete.spec.js +
 * e2e/partie-aleatoire.spec.js (14 maisons + 10 seeds supplémentaires).
 *
 * 21/08/2026 (docs/docs-rapport.md MUT-1 + code mort CM-1 à CM-8/CM-10,
 * suite de la relecture complète) :
 * - MUT-1 : gameService.js — les 8 fonctions `appliquerCadre*` (~15
 *   lignes de boilerplate répétées + refetch dupliqué 11 fois)
 *   factorisées via `chargerCadreOuvrable_`/`rechargerPartie_`.
 * - CM-1 : gameService.js — `definirTechnologieAvanceeAmelioree`
 *   supprimée (zéro appelant réel). Le champ `technologiesAvanceesAmeliorees`
 *   qu'elle écrivait est CONSERVÉ : lu par un effet récent et testé de
 *   focusEngine.js (`influence_par_technologie_amelioree`) — gap
 *   fonctionnel (UI manquante), pas du code mort, corrigé dans le
 *   rapport d'audit initial.
 * - CM-2 : focusService.js — 3 exports jamais appelés retirés
 *   (obtenirCartesFocus/obtenirFocusParFamille/obtenirPoolHeroique).
 * - CM-3 : strategieService.js — avancerMoinsAvancee_/avancerCorrompue_
 *   supprimées (boutons DOM retirés depuis le Lot F, listeners jamais
 *   attachés).
 * - CM-4 : combatService.js — NOMS_VAISSEAUX/totalNavale retirés de
 *   l'API publique.
 * - CM-5 : css/style.css — .resultat-partie-creee/.carte-partie-actions
 *   (vestiges d'écrans supprimés) retirées.
 * - CM-6 : db.js — DB.ouvrir/DB.vider/DB.NOMS_STORES retirés de l'API
 *   publique (vider() supprimée entièrement, zéro appelant même en
 *   interne).
 * - CM-7 : historiqueVueService.js — export ouvrirHistorique retiré.
 * - CM-8 : annulationService.js — export LIMITE_PAR_PARTIE retiré.
 * - CM-10 : data/catalogue/technologies.json — champ idSheet (résidu
 *   d'export Google Sheets) retiré des 28 entrées.
 * CM-9 (data/catalogue/scenarioTrousDeVer.json vide) non traité —
 * nécessite une décision produit (fonctionnalité prévue ou fichier à
 * retirer), pas une suppression mécanique.
 * Validé par les 80 tests `*.test.js` + les 51 tests `*_test.js`/
 * `test_*.js` + e2e/partie-complete.spec.js + e2e/partie-aleatoire.spec.js
 * (14 maisons).
 *
 * 21/08/2026 (docs/docs-rapport.md BUG-1 et BUG-2, relecture complète du
 * 21/08/2026) :
 * - BUG-1 : js/scoreVueService.js — #btn-retour-fin appelait
 *   App.afficherEcran('game'), écran renommé depuis en
 *   'plateau-galactique' → écran vide au clic depuis Fin de partie.
 * - BUG-2 : js/gameService.js — cleFocusEnginePourOptionCadre_ exposée
 *   publiquement (GameService.cleFocusEnginePourOptionCadre) ;
 *   index.html en gardait une copie recopiée à la main (déjà cause d'un
 *   Cadre non cliquable par le passé), supprimée au profit de la seule
 *   source de vérité.
 *
 * 21/08/2026 (bug trouvé par le nouveau scénario E2E aléatoire,
 * e2e/partie-aleatoire.spec.js) : js/strategieService.js — demanderChoix
 * ne réinitialisait jamais #modal-choix-valider.disabled à l'ouverture
 * d'une nouvelle popup. Si un chemin de sortie d'une popup précédente
 * (parmi ~10 qui désactivent ce bouton pendant un appel async) oubliait
 * de le réactiver, TOUTE popup suivante — même un simple 'confirmation' —
 * restait bloquée sans aucun indice visuel. Reset défensif ajouté en
 * tête de demanderChoix.
 * Chargé à la fois par index.html (contexte navigateur, via <script src>)
 * et par service-worker.js (contexte Service Worker, via importScripts).
 *
 * Format : AAAAMMJJ.N (date du jour + compteur de push du jour).
 * Exemple : '20260815.1' -> premier push du 15/08/2026,
 *           '20260815.2' -> deuxième push le même jour, etc.
 *
 * RÈGLE : incrémenter cette valeur à CHAQUE push qui modifie un fichier
 * mis en cache par service-worker.js (index.html, icônes, css/js futurs).
 * Sans ce changement, le Service Worker n'est jamais réinstallé et
 * l'ancien contenu reste servi indéfiniment (voir en-tête de
 * service-worker.js pour le détail du mécanisme).
 *
 * 18/08/2026 (retour utilisateur) : badges "Par joueur"/"Une fois"
 * retirés (bruit visuel, la majorité des cadres sont dans l'un de ces
 * deux cas — LABEL_RESOLUTION_CADRE_ ne garde plus que permanent/
 * collectif/retardement, index.html v33). Popup de placement : le
 * fallback de titre par défaut ("Choisir un secteur du Néant", jamais
 * affiché en pratique — l'appelant passe toujours un titre explicite)
 * aligné sur "Choisir un secteur" par cohérence avec le titre réellement
 * utilisé (js/strategieService.js v19) — le retrait du label "Secteur du
 * Néant"/l'espacement sous la ddl (retour utilisateur précédent, déjà
 * livrés) restent en place, confirmés inchangés.
 *
 * 18/08/2026 (Simplification UI Événement galactique — Cadre 3
 * générique, Événement B Cycle 1 : "activer 1 cube / déployer 1 cube
 * sur le Secteur-Mère") : dernier cadre de l'Événement B Cycle 1 porté,
 * en réutilisant focusEngine.js (fourni par l'utilisateur cette
 * session) — GameService.appliquerCadreChoixCube délègue à
 * FocusEngine.resoudreEffet (moteur pur déjà utilisé par l'écran Focus
 * pour activer_cube/deployer_cube_secteur_mere) plutôt que de dupliquer
 * une deuxième logique de débit de cubeActif : FocusEngine reste la
 * SEULE source de vérité pour cette mécanique, qu'elle soit déclenchée
 * depuis Focus ou depuis un Cadre d'Événement galactique. Pour l'option
 * "déployer", une SECONDE popup s'ouvre (choix du type de Flotte,
 * contexte 'deployer_cube' déjà existant côté Focus, mode 'secteur_mere'
 * — aucune modification nécessaire côté strategieService.js pour ce
 * mode, déjà générique). js/gameService.js (v12 — nouvelle méthode
 * appliquerCadreChoixCube + cleFocusEnginePourOptionCadre_, dépend
 * désormais de FocusEngine — référence globale paresseuse, résolue
 * seulement à l'appel), index.html (v32 — actionsCadre_ reconnaît les
 * options cube via cleFocusEnginePourOptionCadre_/libelleOptionCube_,
 * nouvelle appliquerCadreCubeEtRafraichir_, texte "✓ Appliqué" gère le
 * cas cadresAppliques[ordre].resume en plus de .delta/.secteur). Tests
 * fumée dédiés : test_gameService_cadreChoixCube.js (node --test, charge
 * le vrai focusEngine.js + mock DB en mémoire, 4 scénarios). Avec ce
 * lot, les 3 Cadres de l'Événement B Cycle 1 sont couverts : Cadre 1
 * (placement, généralisé précédemment), Cadre 2 (Corruption, hors
 * périmètre — décision utilisateur), Cadre 3 (ce lot).
 *
 * 18/08/2026 (Simplification UI Événement galactique — retouches popup +
 * Cadre 1 générique, Événement B Cycle 1) :
 * - Popup 'placement_secteur_neant_adjacent' (retour utilisateur) : label
 *   "Secteur du Néant" au-dessus de la ddl retiré (redondant avec le
 *   titre "Choisir un secteur") ; marge ajoutée sous la ddl
 *   (.modal-choix-select) pour ne plus être collée aux boutons Annuler/
 *   Valider. js/strategieService.js (v15), css/style.css (v19).
 * - Cadre 1 (placement) généralisé pour porter l'Événement B Cycle 1
 *   (jeton Libération + Défense de Secteur), qui utilise des éléments
 *   différents de l'Événement A (Défense de Secteur + Guilde de
 *   Scientifiques, seul cas géré jusqu'ici — la fonction était codée en
 *   dur pour ce jeu d'éléments précis) : SecteurService.
 *   obtenirSecteursEligiblesDefenseGuildeNeantAdjacent/
 *   placerDefenseGuildeNeantAdjacent remplacées par
 *   obtenirSecteursEligiblesPlacementNeantAdjacent(partieId, elements)/
 *   placerElementsNeantAdjacent(partieId, numero, elements), génériques
 *   à n'importe quelle combinaison d'Installations/Guildes/jetons
 *   (CHAMP_ELEMENT_PLACEMENT_) — un jeton comme Libération se pose sans
 *   consommer d'emplacement Installation/Guilde. Le "❗" dernier
 *   emplacement n'alerte que sur un type d'emplacement réellement
 *   demandé par le cadre en cours (ex. un cadre qui ne pose pas de
 *   Guilde n'alerte jamais sur la Guilde). secteurService.js (v4 —
 *   fonctions génériques + test fumée dédié
 *   test_secteurService_placement.js, node --test, mock DB en mémoire
 *   via vm, 2 scénarios Événement A/B), js/gameService.js (v11 —
 *   appliquerCadrePlacement lit cadre.effet.elements depuis
 *   evenementCycle.cadres au lieu d'appeler l'ancienne fonction dédiée),
 *   js/strategieService.js (v15 — contexte 'placement_secteur_neant_
 *   adjacent' reçoit `elements` et délègue aux fonctions génériques),
 *   index.html (v31 — appliquerCadrePlacementEtRafraichir_ transmet
 *   cadre.effet.elements à la popup). Le Cadre 2 (Corruption sur l'offre
 *   de Programme Domination) reste hors périmètre (texte seul, décision
 *   utilisateur — aucun modèle d'offre de Programme dans l'app
 *   actuellement). Le Cadre 3 (choix activer/déployer 1 cube) reste en
 *   attente de focusEngine.js (nécessaire pour ne pas dupliquer/
 *   dérégler la logique de débit de cubeActif déjà utilisée côté Focus),
 *   demandé à l'utilisateur, non traité dans ce lot.
 *
 * 18/08/2026 (Simplification UI Événement galactique, points 2 à 6) :
 * suite du point 1 (cadre entier cliquable). Popups (StrategieService.
 * demanderChoix) : le texte du cadre n'est plus jamais répété dedans
 * (point 3) — 'placement_secteur_neant_adjacent' perd sa `description`
 * et son titre devient générique ("Choisir un secteur" au lieu de
 * rappeler les éléments posés) ; sa liste déroulante n'affiche plus que
 * "Secteur N" (retrait du détail des emplacements libres, point 4) et
 * ajoute un "❗" si l'emplacement Installation OU Guilde restant est le
 * dernier disponible sur ce secteur. Le texte "✓ Appliqué" du cadre
 * placement n'affiche plus le détail des éléments posés (implicite,
 * toujours identiques pour ce cadre) : juste "✓ Appliqué (Secteur N)"
 * (point 5). Nouveau contexte 'resoudre_cadre_evenement' (point 6) :
 * les cadres "choix" (ex. Cadre 2 de l'Événement A — +3 Crédit / -1
 * Science pour une Technologie) perdent leurs boutons directs sur la
 * carte ; le cadre entier devient cliquable comme un cadre "placement"
 * et ouvre une popup listant les effets possibles (un clic = résolution
 * immédiate, plus de confirmation séparée pour l'option Technologie —
 * son rappel "-N Science, à choisir sur Plat. maison" est désormais le
 * libellé de l'option dans la liste). index.html (v29 — actionsCadre_
 * factorise la construction de la liste d'actions [simple/proportionnel/
 * technologie] réutilisée pour savoir si un cadre est cliquable ET pour
 * résoudre le choix ; ouvrirPopupCadreEtRafraichir_ remplace
 * appliquerCadreTechnologieEtRafraichir_, supprimée ; renderCadresEvenement_
 * n'émet plus aucun <button>/<div class="cadre-actions"> ; LABEL_ELEMENT_
 * PLACEMENT_/libelleElementsPlacementCadre_/COULEUR_SCIENCE_CADRE_,
 * devenues orphelines, supprimées), js/strategieService.js (v17 — voir
 * son propre en-tête pour le détail), css/style.css (v18 — .cadre-actions/
 * .btn-cadre-appliquer(-proportionnel)/.btn-cadre-technologie retirées,
 * désormais orphelines ; .cadre-action-proportionnelle/.cadre-input-
 * proportionnel conservées, réutilisées dans la nouvelle popup). Aucun
 * changement gameService.js/secteurService.js (mêmes fonctions
 * appelées, seule l'IHM autour change).
 *
 * 18/08/2026 (Simplification UI Événement galactique, point 1) : le cadre
 * "placement" (Défense de Secteur + Guilde, seul cadre à popup existant à
 * ce jour) n'a plus de bouton "Placer : ..." dédié sous le texte — c'est
 * tout le cadre (.cadre-carte-cliquable) qui devient cliquable/activable
 * au clavier (role="button", tabindex, Entrée/Espace) et ouvre directement
 * la popup de sélection du secteur. index.html (v28 — actionsHtml du cas
 * placement non appliqué vidé, classe/attributs cliquables sur la div
 * .cadre-carte, nouvelle fonction pseudoBoutonCarte_ qui adapte le div à
 * l'API .disabled attendue par appliquerCadrePlacementEtRafraichir_ via
 * une classe CSS plutôt que l'attribut natif, listener déplacé de
 * .btn-cadre-placement vers .cadre-carte-cliquable), css/style.css (v17 —
 * .cadre-carte-cliquable/.cadre-carte-en-cours, .btn-cadre-placement
 * conservée en CSS pour compat mais plus référencée en HTML). Aucun
 * changement gameService.js/secteurService.js/strategieService.js (même
 * appel appliquerCadrePlacementEtRafraichir_, même popup demanderChoix,
 * seul le déclencheur change). Le texte "✓ Appliqué (Secteur N : ...)"
 * n'est pas touché par ce lot (point 2, à traiter séparément).
 *
 * 18/08/2026 (Événement A Cycle 1, Cadre 2 — option Science -> Technologie) :
 * bouton "Gagner une technologie" (pastille de coût "1" ronde, couleur
 * Science, réutilise .pastille-cout des cartes Focus) pour la première
 * moitié de l'option exclusive du Cadre 2 — seul le coût (-1 Science) est
 * automatisé, le gain (choix de la Technologie de base) reste manuel sur
 * Plat. maison (rappelé dans une confirmation avant de débiter). Les deux
 * options du cadre (celle-ci et "Appliquer : +3 Crédit") partagent le même
 * cadresAppliques[ordre] : appliquer l'une verrouille l'autre, conforme au
 * mode "exclusif" du catalogue. js/strategieService.js (v16 — nouveau cas
 * contexte.type === 'confirmation' de demanderChoix, générique, réutilisable
 * hors de ce cadre), index.html (v27), css/style.css (v16 —
 * .btn-cadre-technologie). Aucun changement gameService.js/secteurService.js
 * (réutilise appliquerCadreEffet tel quel, le coût étant une simple
 * ressource déjà gérée par RESSOURCES_SIMPLES_CADRE).
 *
 * 18/08/2026 (Événement A Cycle 1, Cadre 1 — placement Défense de Secteur
 * + Guilde de Scientifiques) : premier cadre de type "placement" (zone
 * "secteur_neant_adjacent") sorti du hors-périmètre — bouton "Placer"
 * dédié (même gabarit que "Appliquer : +3 Crédit") qui ouvre la modale de
 * choix générique des actions de Focus pour sélectionner le secteur du
 * Néant cible (candidats filtrés : Néant, adjacent à un secteur du
 * joueur, au moins un emplacement Installation ET un emplacement Guilde
 * libres), puis persiste : js/secteurService.js (v3 —
 * obtenirSecteursEligiblesDefenseGuildeNeantAdjacent/
 * placerDefenseGuildeNeantAdjacent), js/gameService.js (v12 —
 * appliquerCadrePlacement), js/strategieService.js (v15 — nouveau cas
 * contexte.type === 'placement_secteur_neant_adjacent' de demanderChoix),
 * index.html (v26). Aucune nouvelle classe CSS (réutilise .cadre-actions/
 * .btn-cadre-appliquer et .hint/select de la modale générique).
 *
 * 18/08/2026 (Réorganisation Plat. Galactique, retour utilisateur) :
 * "Cycle X" quitte les .section-title et devient un titre de page
 * (.titre-cycle, sans trait orange) dans un bandeau d'en-tête avec
 * l'Entretien dû juste en dessous et le bouton "Fin du cycle" à droite
 * (les deux étaient tout en bas de l'écran) ; les 3 blocs restants
 * (Événement galactique — manches rapatriées ici depuis "Cycle X",
 * Technologies avancées, Focus héroïques) deviennent des sections à part
 * entière avec le trait orange (h3.subsection-title n'avait en réalité
 * aucune règle CSS définie) ; Focus héroïques : double cadre par
 * emplacement corrigé (.card autour d'un simple <select> qui a déjà son
 * propre cadre — résidu du détail de carte affiché ici avant le Lot F),
 * aligné sur le gabarit .techno-obtenue-ligne de Technologies avancées ;
 * #btn-retour-accueil-partie supprimé, remplacé par le titre de l'app
 * cliquable (#topbar-titre) depuis n'importe quel onglet : index.html
 * (v25), js/strategieService.js (v14), css/style.css (v16).
 *
 * 18/08/2026 (Refonte affichage Événement galactique) : formatEvenement_
 * lit désormais cadres[]/objectifs.blocs[]/manches (plus texte1/texte2,
 * disparus de la migration catalogue ci-dessous) — Plat. Galactique
 * affiche les Cadres et Objectifs séparément (bordure pleine/pointillée
 * selon obligatoire, badge de résolution), le nombre de manches à côté du
 * titre "Cycle X", et un bouton "Appliquer" par action de cadre que
 * GameService.actionsSimplesCadre reconnaît comme un simple delta sur les
 * 5 ressources déjà suivies (le reste — secteurs, Gloire, Corruption...
 * reste à résoudre manuellement) : js/gameService.js (v11), index.html
 * (v23), css/style.css (v15).
 * Correctifs suite au retour utilisateur sur ce lot : titre "Cadres —
 * Phase Préparation" et badges "Obligatoire"/"Facultatif" retirés (la
 * carte imprimée ne montre que la bordure pleine/pointillée, conservée en
 * CSS ; le texte "Cadres" faisait doublon avec le bloc Objectifs juste en
 * dessous) ; et correctif d'un bug réel : cliquer "Appliquer" créditait
 * bien plateauMaison en base, mais #ressources-principales (Plat. maison)
 * ne se rafraîchissait pas, car rendu par StrategieService.afficher()
 * (jamais rappelé après l'action — afficherEcran ne fait que basculer la
 * visibilité entre écrans, ne re-rend rien) : index.html (v24). Aucun
 * changement gameService.js pour ce correctif (la donnée était déjà
 * correctement persistée, seul l'affichage était en cause).
 *
 * 18/08/2026 (Migration catalogue Supabase -> JSON local) : le catalogue
 * n'est plus lu depuis Supabase (js/catalogueSync.js réécrit, plus de
 * clé/URL Supabase dans le code) mais depuis 12 fichiers JSON bundlés
 * sous data/catalogue/*.json, ajoutés à FICHIERS_A_METTRE_EN_CACHE
 * (service-worker.js). Incrémenté pour forcer la réinstallation du
 * Service Worker et la mise en cache de ces nouveaux fichiers.
 *
 * 17/08/2026 (Lot K — corrections mineures, technologies avancées) :
 * incrémenté suite à un correctif sur Plat. maison — la case "Améliorée"
 * de la Technologie de départ (#check-amelioree-depart) n'appliquait pas
 * le même verrou que les 5 cases de "Technologies obtenues" (Lot I,
 * v21) : elle se déverrouillait dès qu'une technologie de départ était
 * choisie, sans vérifier qu'elle est référencée sur Plat. Galactique
 * (dans le groupe actif du cycle en cours). Corrigé : même contrôle,
 * même source de vérité (GameService.obtenirTechnologiesAvanceesGroupes
 * (partie).actif), aucun changement côté gameService.js : index.html
 * (v23). Fichier modifié, chemin déjà en cache, aucune nouvelle entrée
 * dans FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot J — corrections mineures, écran Combat) : incrémenté
 * suite à un correctif sur l'écran Combat — les vaisseaux disponibles
 * (CombatService.vaisseauxDebloques) se rafraîchissent désormais dès le
 * clic sur l'onglet Combat (App.afficherEcran appelle désormais
 * CombatVueService.afficher()), plus seulement au bascule Envahir/
 * Escarmouche : index.html (v22). Fichier modifié, chemin déjà en cache,
 * aucune nouvelle entrée dans FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot I — corrections mineures, technologies avancées) :
 * incrémenté suite à un retour arrière sur le Lot G — la section dédiée
 * "Technologies avancées" ajoutée sur Plat. maison est supprimée
 * (mauvaise approche, décision utilisateur). À la place, la case
 * "Améliorée" déjà existante dans "Technologies obtenues" (Plat. maison)
 * n'est cochable que si la technologie choisie dans sa ddl fait partie du
 * groupe actif du cycle en cours (même
 * GameService.obtenirTechnologiesAvanceesGroupes que Plat. Galactique,
 * aucun changement côté gameService.js) : index.html (v21). Fichier
 * modifié, chemin déjà en cache, aucune nouvelle entrée dans
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot H — corrections mineures, tableau Secteurs) : incrémenté
 * suite à un lot de petites corrections textuelles : tableau Secteurs
 * compacté (Guildes en 3 lettres + point, "Chantier"/"Défense" ->
 * "Ch."/"Def.", "Corvette (Néant)" -> "Cube néant" — index.html v20) ;
 * écran Historique — bouton "Archiver (protéger du « Tout supprimer »)"
 * simplifié en "Archiver", "Technologies disponibles (maisons déchues)"
 * -> "Technologies disponibles" (js/historiqueVueService.js v2). Fichiers
 * modifiés, chemins déjà en cache, aucune nouvelle entrée dans
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot G — corrections mineures, suite) : incrémenté suite au
 * déplacement de la case "Améliorée" des Technologies avancées — retirée
 * de Plat. Galactique (redevient lecture seule), ajoutée sur Plat. maison
 * (nouveau bloc #technologies-avancees-ameliorees-liste, liste
 * permanente des 8 technologies, verrouillée au cycle 1 et à l'état
 * 'termine', déverrouillée uniquement pour le groupe actif du cycle en
 * cours) : index.html (v19). Fichier modifié, chemin déjà en cache,
 * aucune nouvelle entrée dans FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot F — corrections mineures) : incrémenté suite à un lot de
 * petites corrections/simplifications sur Plat. Galactique/Plat. maison/
 * Focus/Secteurs : correctif du bouton "Fin du cycle" (ne fonctionnait
 * plus, ReferenceError silencieuse — App expose désormais ses fonctions
 * de rendu d'écran), #btn-fin-cycle relabellisé "Terminer la partie" au
 * cycle 3 (remplace #btn-terminer-partie, désormais toujours caché),
 * suffixes de titres superflus retirés (Focus héroïques, Événement
 * galactique), noms de maison retirés des Technologies avancées, ligne
 * Cube compactée, libellé "Corrompue" -> "COR.", boutons globaux de
 * civilisation retirés (fonctions conservées pour un futur usage par une
 * action), Technologies obtenues 6 -> 5 emplacements, cartes Focus (type
 * + numéro retirés du titre) et nouvel affichage du détail des Focus
 * héroïques du cycle sur l'écran Focus, en-tête de colonne Secteurs
 * "Gardiens" -> "Gard." : index.html (v18), js/strategieService.js
 * (v13), js/gameService.js (v10), css/style.css (v14). Fichiers modifiés,
 * chemins déjà en cache, aucune nouvelle entrée dans
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot E — réorganisation Focus, bandeau de rappel) : incrémenté
 * suite à la réorganisation de l'écran Focus (index.html v17) — "Actions
 * réalisées" (Annuler + journal) puis "Listes de focus" (ex-"Vos Focus") ;
 * ajout d'un bandeau permanent en bas d'écran (#focus-rappel-ressources,
 * position fixed) affichant Nourriture/Énergie/Matériel/Crédit/Science/
 * Cube actif en chiffres colorés, réutilisant la palette des pastilles de
 * coût des cartes Focus (couleurCout_/abregeCout_) : js/strategieService.js
 * (v12), css/style.css (v13 — .rappel-ressources-footer/.rappel-chip*,
 * #screen-focus padding-bottom). Fichiers modifiés, chemins déjà en cache,
 * aucune nouvelle entrée dans FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Lot D — Ressources/Civilisation vers Plat. maison) :
 * incrémenté suite au déplacement des sections Ressources / Jetons et
 * cubes de puissance navale (avec la Gloire) / Pistes de Civilisation de
 * l'écran Stratégie vers l'écran Plat. maison (ordre : Ressources / Jetons
 * et cubes de puissance navale / Pistes de Civilisation / Technologies /
 * Influence), et renommage de l'onglet "Stratégie" en "Focus" (id
 * nav-strategie -> nav-focus, data-nav strategie -> focus, id
 * screen-strategie -> screen-focus, seule référence dans tout le projet) :
 * index.html (v16). Restent dans "Focus" (décision utilisateur) : bouton
 * Annuler la dernière action + journal. js/strategieService.js (v11) —
 * aucune fonction modifiée, tout cible toujours les mêmes ids, simplement
 * déplacés dans le DOM. Fichiers modifiés, chemins déjà en cache, aucune
 * nouvelle entrée.
 *
 * 17/08/2026 (Lot C — restructuration Partie) : incrémenté suite à
 * index.html (v15 — écran "Partie" renommé "Plat. Galactique",
 * Technologies avancées), js/gameService.js (v9 — nouvelle mécanique
 * Technologies avancées) et js/strategieService.js (v10 — conteneur Focus
 * héroïques déplacé). js/gameService.js change de chemin cache identique
 * (déjà dans FICHIERS_A_METTRE_EN_CACHE) — aucune nouvelle entrée requise.
 *
 * 17/08/2026 (Lot A/B — restructuration Partie) : incrémenté suite à
 * index.html (v14 — écran Partie éclaté en 3 écrans nav : Mise en place /
 * Partie / Plat. maison) et css/style.css (v12 — .champ-technologie-fixe).
 * Pas de nouvelle entrée dans FICHIERS_A_METTRE_EN_CACHE
 * (service-worker.js) : les 2 fichiers modifiés restent aux mêmes
 * chemins déjà en cache.
 *
 * 17/08/2026 (Lot 3 — finitions Stratégie, suite à l'audit UI/UX du
 * 17/08) : incrémenté suite à style.html (désormais disponible) —
 * Pistes de Civilisation : 2 prochaines cases non atteintes (niveau+1 ET
 * +2) au lieu d'une seule, structure/classes alignées sur le legacy
 * (liste verticale au lieu d'une grille de 3 cartes). Cartes Focus
 * (joueur) : gabarit .focus-card/.focus-id/.focus-action-corps/
 * .focus-action-side (texte à gauche, pastilles de coût + bouton rond
 * "▶" à droite) au lieu d'un bouton "Jouer cette action" pleine largeur ;
 * pastilles de coût désormais colorées et abrégées comme en legacy :
 * js/strategieService.js (v9), css/style.css (v11). Décision utilisateur
 * confirmée : bouton "Avancer" par piste + les 2 boutons globaux
 * d'avancement (sans équivalent legacy) restent en place. Non traité,
 * signalé : affichage des Focus héroïques, pas de gabarit .focus-card
 * équivalent côté legacy à cet endroit. Fichiers modifiés, chemins déjà
 * en cache, aucune nouvelle entrée.
 *
 * 17/08/2026 (Lot 1 — maisons déchues, suite à l'audit UI/UX du 17/08) :
 * incrémenté suite au portage de carteMaisonHTML (app-2.html GAS) sur
 * l'écran Partie — carte joueur : ligne "Difficulté" ajoutée ; cartes
 * maisons déchues : technologies affichées en badges (.badge/.badge-
 * sans-point, tooltip = texte de règle) au lieu du seul nom de maison.
 * Prérequis CSS corrigés au passage (.badge/.badge-type-* écrites sans
 * référence legacy lors d'une session précédente, effet de bord assumé
 * sur les cartes Focus de l'écran Stratégie) + .card-joueur/.card-list/
 * .card h3/.card p ajoutées (absentes jusqu'ici) : js/gameService.js
 * (v8 — champ "texte" ajouté aux technologies), index.html (v13),
 * css/style.css (v10). Fichiers modifiés, chemins déjà en cache, aucune
 * nouvelle entrée. Hors périmètre, signalé : le texte de règle complet
 * de la Technologie de départ du joueur (legacy l'affiche, la PWA
 * n'affiche que le type) — nécessite un accès aux données non trivial
 * depuis ce point du modèle actuel, reporté à un lot séparé.
 *
 * 17/08/2026 (Lot 2 — grille de ressources, suite à l'audit UI/UX du même
 * jour) : incrémenté suite à la réécriture de la grille de ressources
 * principales (écran Stratégie) — niveau/flèche/revenu/stock éditable/
 * delta par ressource + niveaux de production recalculés depuis les
 * secteurs, Commerce/Prime/Libération redevenus éditables :
 * js/strategieService.js (v8), css/style.css (v9). Décision utilisateur :
 * les boutons d'avancement manuel des pistes de Civilisation (Session 5,
 * sans équivalent legacy) sont conservés. Fichiers modifiés, chemins déjà
 * en cache, aucune nouvelle entrée.
 *
 * 17/08/2026 (Session 14 fin — action secteur "Envahir" portée) :
 * incrémenté suite au portage de "envahir"/"envahir_corrompu" (sélection
 * cible + engagement multi-sources/multi-types, résolution via
 * CombatService.resoudreInvasion + SecteurService.envahirResoudre déjà
 * portés, conséquences Prime/Libération/Influence/Cube actif) :
 * js/focusEngine.js (v4, reste pur) et js/strategieService.js (v7,
 * nouveau cas contexte.type === 'envahir' de demanderChoix). Dernière des
 * 3 actions secteur de la Session 14 (Regrouper, Déployer des cubes,
 * Envahir) — toutes déclenchées depuis une carte Focus, popups avec
 * choix, même logique que le legacy. Hors périmètre, journalisé : défausse
 * de jeton Gloire pour secteur source abandonné, résolution immédiate des
 * jetons Prime/Libération gagnés (restent de simples compteurs). Aucune
 * nouvelle classe CSS. Fichiers modifiés, chemins déjà en cache, aucune
 * nouvelle entrée.
 *
 * 17/08/2026 (Session 14 suite — action secteur "Déployer des cubes"
 * portée) : incrémenté suite au portage de "deployer_cube_par_chantier"/
 * "deployer_cube"/"deploy_cube"/"deployer_cube_secteur_mere" (3 modes,
 * types de Flotte limités aux Technologies débloquées, coût en ressources
 * par type), déclenché depuis une carte Focus (Effet uniquement) :
 * js/focusEngine.js (v3, reste pur — débite cubeActif/coût ressource sur
 * l'état, contrairement au legacy qui écrivait plateau_maison depuis la
 * popup) et js/strategieService.js (v6, nouveau cas contexte.type ===
 * 'deployer_cube' de demanderChoix, appelle SecteurService.deployerCube).
 * Aucune nouvelle classe CSS (réutilise .regrouper-liste/.btn-lien/
 * .regrouper-form ajoutées pour Regrouper). Envahir reste hors périmètre
 * (prochaine session — le plus lourd, nécessite CombatService +
 * SecteurService.envahirResoudre). Fichiers modifiés, chemins déjà en
 * cache, aucune nouvelle entrée.
 *
 * 17/08/2026 (Session 14 — action secteur "Regrouper" portée) : incrémenté
 * suite au portage de l'action "Regrouper" (déplacement de Puissance
 * Navale entre secteurs adjacents, jusqu'à 5 déplacements), déclenchée
 * depuis une carte Focus (effet/coût "regrouper"/"regroupe") : nouveau cas
 * dédié dans js/focusEngine.js (v2, reste pur) qui délègue à une popup
 * portée depuis strategie.html (GAS) dans js/strategieService.js (v5,
 * nouveau cas contexte.type === 'regrouper' de demanderChoix, appelle
 * directement SecteurService.regrouper). css/style.css (v8 — styles
 * .regrouper-liste/.btn-lien/.regrouper-form). Envahir/Déployer des cubes
 * restent hors périmètre (prochaine session). Fichiers modifiés, chemins
 * déjà en cache, aucune nouvelle entrée.
 *
 * 17/08/2026 (Session 13 — moteur secteurs/cycle branché sur l'IHM) :
 * incrémenté suite au branchement du moteur porté en Session 12 sur
 * l'IHM : bouton "Fin du cycle" + Technologies obtenues + Entretien
 * (écran Partie), Focus héroïques sélectionnables (écran Stratégie,
 * js/strategieService.js v4), formulaires Construire/Rappeler un cube +
 * Retirer corruption (écran Secteurs). index.html (v12), css/style.css
 * (v7). Envahir/Regrouper/Déployer des cubes restent hors périmètre
 * (formulaire multi-unités plus complexe, prochaine session). Fichiers
 * modifiés, chemins déjà en cache, aucune nouvelle entrée.
 *
 * 17/08/2026 (Session 12 — SQL RPC récupéré) : incrémenté suite au
 * portage complet du moteur secteurs/cycle, débloqué par le SQL des RPC
 * (rpc.json, fourni par l'utilisateur) : avancerCycle,
 * choisirFocusHeroique, choisirTechnologieObtenue (js/gameService.js v7)
 * + construire/deployerCube/rappelerCube/retirerCorruption/regrouper/
 * envahirResoudre/obtenirSecteursEligiblesConstruction/getEntretien
 * (js/secteurService.js v2). 36 tests fumée au total sur ces deux
 * fichiers (node --test). Pas encore branché sur l'IHM (formulaires
 * Construire/Envahir/Regrouper, bouton "Fin du cycle") — prochaine
 * session. Fichiers modifiés, chemins déjà en cache, aucune nouvelle
 * entrée.
 *
 * 17/08/2026 (Session 12 — restauration IHM Partie) : incrémenté suite au
 * portage de definirTechnologieAmelioree/choisirEvenement/
 * getEvenementsParCycle (js/gameService.js v6, ni l'une ni l'autre n'est
 * une RPC Postgres) et à leur branchement sur l'écran Partie (case
 * "Technologie de départ améliorée", sélection d'Événement galactique par
 * cycle) : index.html (v11), css/style.css (v6). Fichiers modifiés,
 * chemins déjà en cache, aucune nouvelle entrée.
 *
 * 17/08/2026 (Session 11 — restauration IHM Secteurs) : incrémenté suite à
 * la restauration de l'écran Secteurs (colonnes Guildes/Installations/
 * Flotte/Gardiens, portage direct de secteurs.html GAS) et au passage de
 * la nav Partie/Stratégie/Secteurs/Combat en scroll horizontal (4 boutons
 * ne tenaient plus sur smartphone). Fichiers modifiés (chemins déjà en
 * cache, aucune nouvelle entrée) : index.html (v10), css/style.css (v5).
 *
 * 17/08/2026 (Session 10 — restauration IHM Stratégie/Partie) : incrémenté
 * suite à la restauration de blocs d'affichage perdus lors du portage
 * initial de l'écran Stratégie (Session 4) : Influence déménagée vers
 * l'écran Partie, ligne jetons restaurée (Commerce/Prime/Libération),
 * ligne Cube inactif/actif/déployé et widget Gloire (5 emplacements
 * cliquables) ajoutés. Fichiers modifiés (chemins déjà en cache, aucune
 * nouvelle entrée) : index.html (v9), css/style.css (v4),
 * js/strategieService.js (v3).
 *
 * 17/08/2026 (Session 9, Phase 7 — Nettoyage) : incrémenté suite à la
 * correction de deux commentaires obsolètes dans gameService.js/
 * index.html (mentionnaient encore Focus non-jouable / Civilisation
 * lecture seule, faux depuis les Sessions 4/5 — aucun changement de
 * comportement, uniquement de la documentation). Confirmation que
 * LogService.js/UiService.js/Version.js (GAS) n'ont aucun équivalent PWA
 * à porter — voir docs-migration-pwa-plan.md §6.
 *
 * 17/08/2026 (Session 8, Phase 6 — Historique) : incrémenté suite à
 * l'ajout de js/historiqueVueService.js (écran Historique enrichi —
 * événements/technologies/vainqueur, reprendre/archiver/supprimer/tout-
 * supprimer) et à la refonte d'index.html (v9 — la simple liste "Parties
 * enregistrées" de l'accueil, présente depuis la Session 4, est retirée
 * au profit d'un bouton "Historique des parties" ouvrant ce nouvel
 * écran). css/style.css a aussi changé (styles historique/badges).
 *
 * 17/08/2026 (Session 7, Phase 5 — Score) : incrémenté suite à l'ajout de
 * js/scoreService.js (fin de partie, Influence du Néant, portage pur
 * depuis ScoreService.js GAS) et js/scoreVueService.js (écran Fin de
 * partie, bouton "Terminer la partie" sur l'écran Partie). index.html et
 * css/style.css ont aussi changé mais restent au même chemin.
 *
 * 17/08/2026 (Session 6, Phase 5 — Combat/Invasion) : incrémenté suite à
 * l'ajout de js/combatService.js (moteur de combat pur, portage quasi
 * textuel de combat.html GAS) et js/combatVueService.js (écran Combat,
 * nav "Combat" ajoutée) à FICHIERS_A_METTRE_EN_CACHE. index.html et
 * css/style.css ont aussi changé mais restent au même chemin.
 *
 * 17/08/2026 (Session 5, Phase 5 — Civilisation) : incrémenté suite à
 * l'ajout de js/civilisationService.js (avancement des pistes de
 * Civilisation + effet de case, réutilise focusEngine.js) et à la mise à
 * jour de js/gameService.js (v5 — ajout majCivilisation), js/focusEngine.js
 * (ajout du wrapper public resoudreEffet), js/strategieService.js (v2 —
 * pistes interactives) et index.html (nouveaux boutons Civilisation,
 * script civilisationService.js).
 *
 * 17/08/2026 (Session 4, suite — rebranchement DOM) : incrémenté suite à
 * l'ajout de js/strategieService.js (écran Stratégie complet : ressources,
 * Focus jouables, pistes de Civilisation en lecture seule, bouton
 * Annuler) et à la refonte d'index.html (v8 — nav Partie/Stratégie/
 * Secteurs, écran Partie persistant remplaçant l'ancien écran de
 * confirmation, bouton "Continuer" sur les parties enregistrées) et de
 * css/style.css (v3 — styles modale/ressources/cartes Focus/nav).
 *
 * 17/08/2026 (Session 4, Phase 4 suite) : incrémenté suite à l'ajout de
 * js/focusEngine.js (moteur coût/effet Focus, pur) et
 * js/annulationService.js (pile d'annulation des actions Focus) à
 * FICHIERS_A_METTRE_EN_CACHE. js/db.js a aussi changé (v3 — ajout du
 * store pileAnnulation, VERSION_BASE 1 -> 2) mais reste au même chemin.
 *
 * 17/08/2026 (Phase 4, partielle) : incrémenté suite à l'ajout de
 * js/focusService.js (mise en place des Focus) à
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (Phase 3) : incrémenté suite à l'ajout de
 * js/secteurService.js (plateau des secteurs) à FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 (suite) : incrémenté suite à l'ajout de css/style.css et
 * js/setupService.js (écran "Créer une partie") à
 * FICHIERS_A_METTRE_EN_CACHE.
 *
 * 17/08/2026 : incrémenté suite à l'ajout de js/gameService.js (Phase 2 —
 * cycle de vie de partie) à FICHIERS_A_METTRE_EN_CACHE, et à la mise à
 * jour de js/db.js (ajout de DB.supprimer).
 *
 * 16/08/2026 : incrémenté suite à l'ajout de js/db.js et
 * js/catalogueSync.js à FICHIERS_A_METTRE_EN_CACHE (Phase 1 migration).
 *
 * 19/08/2026 (correctif) : js/setupService.js avait été écrasé par erreur
 * par le contenu de js/secteurService.js dans un commit précédent ("event
 * b") — SetupService n'existait plus (ReferenceError au chargement,
 * écran "Créer une partie" mort). Contenu de setupService.js restauré à
 * sa dernière version valide (secteurService.js n'a pas été affecté,
 * aucune régression côté Événement B).
 *
 * 19/08/2026 (Cadre 2 générique, Événement B Cycle 1 — "Placez une
 * Corruption sur l'offre de Programme Domination") : cadre `effet.type
 * === 'gain'` rendu cliquable (index.html v31 — data-manuel, popup
 * 'confirmation' réutilisée, statut "✓ Fait (à la main)") ; ajout de
 * GameService.appliquerCadreManuel (js/gameService.js v14 — marque le
 * cadre résolu, aucun delta sur plateauMaison). Générique à tout futur
 * cadre "gain" du catalogue.
 *
 * 19/08/2026 (retour utilisateur, principes UX/UI à garder pour les
 * prochains événements) : libellé d'une option "delta simple" au
 * gabarit du jeu ("Gagner 3 Crédits" au lieu de "Appliquer : +3
 * Crédit") ; option "Technologie" séparée en libellé concis + sousTexte
 * italique/petit ("Choisir la technologie manuellement sur Plat.
 * maison") plutôt que noyée entre parenthèses (index.html v32,
 * js/strategieService.js v20, css/style.css — .cadre-action-sous-texte) ;
 * popup manuelle de l'Événement B (Cadre 2) ne rappelle plus le texte du
 * cadre (déjà visible sur la carte derrière la popup) ; dès qu'au moins
 * un Cadre est appliqué, le select Événement galactique est verrouillé
 * (disabled) pour empêcher de changer d'événement en cours de
 * résolution.
 *
 * 19/08/2026 (retour utilisateur, suite) : vocabulaire des statuts de
 * Cadre uniformisé sur "Appliqué" (jamais "Fait") et "manuellement"
 * (jamais "à la main") — "✓ Appliqué (manuellement)" pour un cadre
 * "gain", "✓ Appliqué (-1 Science / technologie choisie manuellement)"
 * pour l'option Technologie du Cadre 2 Événement A (formulé au passé,
 * l'action manuelle est considérée faite). Popup manuelle du Cadre 2
 * Événement B : message remplacé par une instruction courte et
 * spécifique en italique (cadre.instruction, nouveau champ optionnel du
 * catalogue data/catalogue/evenements.json — fallback sur cadre.texte
 * si absent) au lieu du message générique précédent. `instruction`
 * ajouté à la liste blanche de champs de formatEvenement_
 * (js/gameService.js) — sans ce correctif, le champ était filtré et le
 * message retombait toujours sur cadre.texte.
 *
 * 19/08/2026 (correctif, bug constaté en testant ce qui précède) :
 * js/catalogueSync.js force désormais `cache: 'no-store'` sur le fetch
 * de chaque fichier JSON du catalogue — sans ça, "Synchroniser le
 * catalogue" pouvait resservir une réponse HTTP mise en cache par le
 * navigateur au lieu du fichier à jour, même après une mise à jour bien
 * déployée (APP_VERSION incrémenté, Service Worker réinstallé).
 *
 * 19/08/2026 (retours utilisateur — écran Nouvelle partie + Plat. maison) :
 * - Écran Nouvelle partie : ddl Maison triée par complexité croissante
 *   (js/setupService.js, peuplerListes_) ; étoiles ★/☆ (au lieu de ⭐/☆,
 *   tailles incohérentes car l'une est un glyphe emoji et l'autre un
 *   glyphe texte) ; case "Reproduire une partie physique déjà en cours"
 *   relibellée "Partie déjà en cours" ; texte sous la case, une fois
 *   cochée, raccourci en "Renseigner les éléments de départ" (index.html).
 * - Onglet Plat. maison, ligne Cube : espacement augmenté (gap 10px ->
 *   18px, scroll horizontal si besoin plutôt que retour à la ligne, même
 *   convention que .nav-ecrans) ; Cube actif devient éditable directement
 *   (input, même sauvegarde différée que les jetons Commerce/Prime/
 *   Libération) — js/strategieService.js (renderCubes_ +
 *   persisterCubeActif_/majAffichageCubes_, nouvelles), css/style.css
 *   (.ligne-cubes/.cube-actif-input).
 *
 * 19/08/2026 (retour utilisateur, suite) : l'input Cube actif était trop
 * large — repris à l'identique du gabarit .jeton-input (Commerce/Prime/
 * Libération, largeur 34px) au lieu d'un style dédié plus imposant ;
 * bouton "Activer" retiré (décision utilisateur — l'input éditable seul
 * suffit) : js/strategieService.js, css/style.css.
 *
 * 19/08/2026 (retour utilisateur, suite) : ligne Cube — les 4 éléments
 * (titre + Inactif/Actif/Déployé) étaient regroupés à gauche malgré le
 * gap augmenté ; `justify-content: space-between` ajouté à .ligne-cubes
 * pour qu'ils se répartissent sur toute la largeur de la ligne :
 * css/style.css.
 *
 * 19/08/2026 (retour utilisateur — jetons Prime/Libération/Gloire absents
 * du tableau Secteurs) : ces 3 champs existent bien par secteur
 * (secteursPartie.jetonPrime/jetonLiberation/jetonGloire, posés par
 * SecteurService.envahirResoudre en cas de victoire) mais
 * ligneSecteurHTML_ ne les affichait jamais — nouvelle colonne "Jetons"
 * (entre Gard. et Action, même convention que Guildes/Installations/
 * Flotte : n'affiche que les valeurs non nulles via listeNonNulle_,
 * nouveau dico LABEL_JETON_SECTEUR) : index.html.
 *
 * 19/08/2026 (retour utilisateur, correctif immédiat) : jetonGloire n'est
 * PAS un compteur comme jetonPrime/jetonLiberation — c'est la VALEUR (1-5)
 * du jeton Gloire posé sur le secteur, recopiée telle quelle dans un
 * emplacement de plateauMaison.gloire lors d'une invasion réussie (voir
 * js/strategieService.js, etatGloire[i] = jetonGloire). L'affichage
 * "N× Gloire" du lot précédent laissait croire à N jetons — corrigé en
 * "Gloire (N)" (N = la valeur), sorti de LABEL_JETON_SECTEUR/
 * listeNonNulle_ (qui reste correct pour Prime/Libération, de vrais
 * compteurs) : index.html.
 *
 * 19/08/2026 (correctif Piège n°1 — mises à jour Service Worker non
 * détectées, en local ET potentiellement en production) : un changement de
 * data/catalogue/maisons.json (difficulté des maisons) restait invisible
 * malgré commit + déploiement + "Synchroniser le catalogue", car
 * incrémenter APP_VERSION seul ne suffit pas à faire réinstaller le
 * Service Worker — la détection native du navigateur compare
 * service-worker.js OCTET À OCTET, or ce fichier ne référence APP_VERSION
 * que via importScripts('./version.js'), donc ses propres octets ne
 * changent jamais quand seul version.js/le catalogue bouge. Pire :
 * "Synchroniser le catalogue" (cache:'no-store', correctif du 19/08
 * précédent) ne suffisait pas non plus une fois un ancien Service Worker
 * déjà actif — son handler 'fetch' cache-first intercepte la requête AVANT
 * le réseau, quel que soit le mode de cache demandé, dès que
 * caches.match() trouve une entrée pour l'URL exacte. Correctif à deux
 * volets : (1) index.html — nouveau mécanisme d'auto-réparation, exécuté à
 * chaque chargement, qui compare l'APP_VERSION réellement servie par le
 * réseau (fetch avec paramètre anti-cache ?bust=, qui rend l'URL inédite
 * pour caches.match() et la fait retomber sur un vrai fetch() réseau côté
 * Service Worker) à celle chargée par la page ; en cas d'écart, purge
 * Service Worker + Cache Storage puis recharge une seule fois (garde
 * sessionStorage) — indépendant de la détection native, se répare tout
 * seul à chaque déploiement futur, même catalogue-only ; (2)
 * js/catalogueSync.js (v3) — même paramètre anti-cache ?bust= sur
 * lireFichier_, pour que "Synchroniser le catalogue" atteigne toujours le
 * réseau réel. service-worker.js (v14) change aussi ses octets (aucun
 * changement fonctionnel) : indispensable pour que CE déploiement-ci soit
 * détecté nativement au moins une fois et installe le nouveau index.html —
 * les déploiements suivants n'en auront plus besoin, l'auto-réparation
 * prenant le relais. IndexedDB (parties sauvegardées) non affecté par
 * aucune purge de ce correctif.
 *
 * 19/08/2026 (retour utilisateur — popup "Déployer des cubes") : bouton
 * "Ajouter ce déploiement" collé à l'input Quantité au-dessus et à la
 * liste des déploiements engagés en dessous — marge ajoutée avant/après
 * (margin-top/bottom 8px -> 16px) : js/strategieService.js.
 *
 * 19/08/2026 (Événement galactique C, Cycle 1 "Vestiges du Domineum") :
 * les 2 Cadres de cet événement portés. Cadre 1 — nouveau type de cadre
 * "placement_multiple" (data/catalogue/evenements.json) : plusieurs jeux
 * d'éléments (jeton Prime / jeton Libération + Défense de Secteur),
 * chacun sur un secteur du Néant adjacent désigné par un critère de
 * Population (la plus basse / la plus élevée) — pas un libre choix du
 * joueur comme le cadre "placement" simple existant. SecteurService (v4)
 * calcule les cibles (resoudrePlacementMultipleNeantAdjacent, réutilise le
 * filtre Néant/adjacence/emplacements déjà générique) et écrit
 * (appliquerPlacementMultipleNeantAdjacent, revalide tout) ; `prime`
 * ajouté à CHAMP_ELEMENT_PLACEMENT_ (jeton, aucun emplacement consommé —
 * premier cadre à en poser un). En l'absence d'égalité de Population,
 * l'app calcule seule les 2 secteurs cibles et affiche une popup de
 * confirmation (Annuler/Valider) avant d'écrire ; en cas d'égalité (rare),
 * une popup de sélection restreinte aux secteurs à égalité s'ouvre à la
 * place (contexte.numeros, nouveau paramètre optionnel de la popup
 * 'placement_secteur_neant_adjacent', js/strategieService.js v18). Le cas
 * particulier "un seul secteur du Néant adjacent" (règle imprimée sur la
 * carte) fusionne tous les jetons sur cet unique secteur, géré par le même
 * calcul générique (pas un code séparé). Cadre 2 ("Établissez une Guilde
 * OU construisez une Installation") : les deux options sont hors
 * périmètre (aucune mécanique de construction de Guilde/Installation
 * automatisée par l'app à ce jour, mêmes clés déjà signalées hors
 * périmètre côté Focus) — nouvelle option "manuelle" générique dans la
 * popup de résolution de cadre (comme "Gagner une technologie"), marque
 * juste l'option choisie comme résolue à la main
 * (GameService.appliquerCadreChoixManuel, aucun delta), statut "✓ Appliqué
 * (Guilde établie manuellement)"/"(Installation construite manuellement)".
 * js/gameService.js (v13), js/secteurService.js (v4), js/strategieService.js
 * (v18), index.html. Aucun changement css/style.css (réutilise les
 * classes .cadre-carte-cliquable/.modal-choix-* existantes).
 *
 * 19/08/2026 (Construire une Installation / Établir une Guilde portées —
 * retour utilisateur : "on a dû perdre cette possibilité lors du portage
 * en PWA, il y a des actions de focus qui placent des guildes ou des
 * installations aussi") : les clés "construire_installation"/
 * "installation"/"etablir_guilde"/"guilde" (Focus ET Cadres d'Événement
 * galactique) sortent de CLES_SECTEUR_HORS_PERIMETRE — nouveau cas dédié
 * dans FocusEngine.resoudreCle_ qui délègue à une popup dédiée (nouveau
 * contexte 'construire' de StrategieService.demanderChoix) : secteur
 * possédé avec un emplacement libre pour la catégorie (❗ si c'est le
 * dernier, même convention que le placement d'Événement galactique), puis
 * type au choix (5 Guildes ou 3 Installations) — Valider appelle
 * directement SecteurService.construire (déjà porté Session 12/13,
 * jusqu'ici seulement branché sur le formulaire dédié de l'écran
 * Secteurs) et persiste. Bénéfice double : toute carte Focus du catalogue
 * utilisant ces 4 clés devient jouable (dispatch générique déjà en place,
 * aucun changement supplémentaire nécessaire), ET Événement C Cycle 1
 * Cadre 2 ("Etablissez une Guilde OU construisez une Installation", porté
 * la session précédente avec une résolution manuelle de repli) devient
 * automatisé de la même façon — GameService.appliquerCadreChoixCube
 * renommée appliquerCadreChoixFocusEngine (ne concernait plus que les
 * cubes). Portée volontairement limitée aux 4 clés de base (secteur libre
 * + type libre, quantité 1) — les variantes du catalogue
 * (etablir_guilde_meme_secteur/_up_to/_scientifique,
 * construire_installation_meme_secteur/_autre_secteur/_up_to) restent
 * hors périmètre (repli générique existant, pas de régression).
 * js/focusEngine.js (v5), js/strategieService.js (v19), js/gameService.js
 * (v14), index.html. Aucun changement css/style.css.
 *
 * 19/08/2026 (correctif Piège n°1 bis, retour utilisateur : "Établir
 * Guilde ne fonctionne pas sur Event C") : le lot précédent (v.15) était
 * fonctionnellement correct (vérifié dans un environnement à cache neuf)
 * mais service-worker.js recopiait parfois une version PÉRIMÉE d'un
 * fichier dans le nouveau cache lors de l'installation — cache.addAll(urls)
 * est soumis au cache HTTP du navigateur (étage différent du Cache Storage
 * du Service Worker, que le mécanisme d'auto-réparation d'index.html vide
 * pourtant bien avant de recharger) : si ce cache HTTP tenait encore
 * l'ancien js/focusEngine.js pour "frais", il était re-servi tel quel.
 * Corrigé : chaque fichier précaché est désormais récupéré avec
 * `fetch(url, { cache: 'reload' })` (ignore le cache HTTP en lecture, même
 * principe que le ?bust= déjà utilisé par js/catalogueSync.js), garantit
 * un contenu réseau réel au moment de l'installation. service-worker.js
 * (v15) — seul fichier modifié, changement d'octets indispensable pour que
 * la détection native du navigateur ET l'auto-réparation se déclenchent
 * sur ce déploiement-ci.
 *
 * 19/08/2026 (retour utilisateur — "Installation et guilde ne sont pas
 * rafraîchit lorsque je clique sur l'onglet secteur") : Établir une
 * Guilde/Construire une Installation écrivent bien sur secteursPartie
 * (déjà vérifié), mais l'onglet Secteurs n'était jamais explicitement
 * rappelé pour se re-rendre — App.afficherEcran ne re-rend rien tout seul
 * au changement d'onglet (Piège n°2, voir CLAUDE.md), donc l'onglet
 * affichait son dernier rendu, périmé. Ajout de App.renderSecteurs(...)
 * après résolution : dans appliquerCadreFocusEngineEtRafraichir_
 * (index.html — chemin Cadre d'Événement galactique, ex. Événement C
 * Cycle 1 Cadre 2) et dans jouerAction_ (js/strategieService.js — chemin
 * Focus, systématique après CHAQUE action plutôt que de détecter au cas
 * par cas laquelle touche les secteurs : couvre aussi regrouper/envahir/
 * deployer_cube, qui avaient le même défaut avant ce correctif, jamais
 * remarqué jusqu'ici). js/strategieService.js (v20), index.html. Aucun
 * changement gameService.js/secteurService.js/focusEngine.js (la donnée
 * était déjà correctement persistée, seul l'affichage était en cause).
 *
 * 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 1 "Nous sommes la
 * résistance", retour utilisateur : "premier effet nombre cube et gloire
 * pas rafraichit quand on va dans onglet secteur") : le Cadre 1 (cube_neant
 * + gloire) réutilise le pattern générique "placement" (Cadres 1 des
 * Événements A/B/C, App.renderSecteurs déjà appelé) — le vrai bug n'était
 * pas un défaut de rafraîchissement mais une absence d'écriture :
 * cube_neant/gloire manquaient dans CHAMP_ELEMENT_PLACEMENT_
 * (js/secteurService.js), la popup validait donc sans rien persister sur
 * secteursPartie. Ajout des 2 clés (gloire avec un nouveau mode `valeur:
 * true` — jetonGloire stocke la valeur du jeton, pas une quantité,
 * contrairement à cube_neant/prime/liberation qui s'incrémentent).
 * js/secteurService.js (v5). Aucun changement index.html/gameService.js
 * (le câblage générique du Cadre 1 "placement" couvrait déjà D sans code
 * spécifique, comme prévu).
 *
 * 19/08/2026 (Piège n°2, retour utilisateur — "une bonne fois pour toute,
 * rafraichir toute les données secteurs lorsqu'on clique sur l'onglet
 * secteurs") : au lieu de compter sur chaque action qui mute
 * secteursPartie pour explicitement rappeler App.renderSecteurs (plusieurs
 * oublis déjà rencontrés — Construire/Établir, Événement D Cadre 1, avant
 * ça regrouper/envahir/deployer_cube), App.afficherEcran('secteurs')
 * rappelle désormais systématiquement renderEcranSecteurs_ à chaque clic
 * sur l'onglet Secteurs, même principe déjà en place pour l'onglet Combat.
 * Les rappels explicites existants restent (utiles si l'écran Secteurs
 * est déjà affiché au moment de l'action). index.html.
 *
 * 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2, retour
 * utilisateur : "automatiser augmentez une population pure : choisir
 * secteur dans DDL parmi secteur eligible (non corrompu)" / "etablir un
 * guilde banquier -> idem que etablir une guilde sauf que banquier est
 * preselectionné dans la ddl et en lecture seul") : 2 des 3 options du
 * Cadre 2 automatisées (la 3ᵉ, "Activer 1 cube", l'était déjà) — même
 * mécanisme générique que Construire une Installation/Établir une Guilde
 * (cleFocusEnginePourOptionCadre_ -> FocusEngine.resoudreCle_ -> popup
 * demanderChoix dédiée qui écrit directement sur secteursPartie), aucun
 * code spécifique à l'Événement D. augmenter_population_pure : nouvelle
 * popup 'augmenter_population_pure' (secteur possédé, non Corrompu,
 * Population < 6 — docs-rules-secteurs.md §3). etablir_guilde_banquier :
 * réutilise la popup 'construire' existante avec un nouveau paramètre
 * `typeForce` ('banquiers') qui restreint et désactive le <select> Type.
 * js/secteurService.js (v6), js/focusEngine.js (v6), js/gameService.js
 * (v15), js/strategieService.js (v21), index.html
 * (LABEL_OPTION_CONSTRUIRE_ renommé LABEL_OPTION_FOCUSENGINE_).
 *
 * 20/08/2026 (EVOLUTION 1 — gain de place, voir TODO.md) : le texte de
 * résultat d'un Cadre d'Événement galactique affiché après "✓ Appliqué ("
 * (renderCadresEvenement_, index.html) est désormais abrégé — "Population"
 * -> "Pop.", "Secteur" -> "Sec.", noms de ressource/Guilde abrégés à 3
 * lettres et colorés comme sur Plat. maison (ex. "Fermiers" -> "Fer." en
 * vert Nourriture), "augmentée de 1"/"établie sur" remplacés par un
 * préfixe "+1" (ex. "Population du Secteur 1 augmentée de 1" -> "+1 Pop.
 * Sec. 1", "Guilde Fermiers établie sur le Secteur 1" -> "+1 Guilde Fer.
 * Sec. 1"). 2 nouvelles fonctions dédiées à ce seul rendu
 * (abregerResumeCadre_ pour cadresAppliques[ordre].resume,
 * libelleDeltaCadreAbrege_/libelleRessourceAbregeeHTML_ pour .delta) —
 * libelleDeltaCadre_/LABEL_RESSOURCE_CADRE_/libelleActionCadre_ restent
 * INCHANGÉES (libellé des boutons, non concerné) et le texte source
 * (strategieService.js/focusEngine.js/gameService.js) n'est pas modifié
 * (le journal Focus "Actions réalisées" affiche donc toujours le texte
 * complet, non abrégé — hors périmètre de cette évolution). Décision
 * assistant à valider : le même principe "+1"/"Sec." est aussi appliqué
 * au résumé "Installation <Label> construite sur le Secteur N" (non
 * demandé explicitement par TODO.md, mais cohérent avec la règle
 * générale) — Label d'Installation non abrégé/non coloré (pas de
 * ressource associée). index.html.
 *
 * 20/08/2026 (EVOLUTION 2 — anomalie mise à jour Guilde Secteur, voir
 * TODO.md) : correctif CHAMP_ELEMENT_PLACEMENT_ (js/secteurService.js) —
 * 4 des 5 clés Guilde étaient au pluriel ("guilde_fermiers",
 * "guilde_ingenieurs", "guilde_mineurs", "guilde_banquiers") alors que
 * data/catalogue/evenements.json (cadre.effet.elements) les écrit
 * toujours au SINGULIER (seul "guilde_scientifique", déjà singulier,
 * fonctionnait). Un cadre "placement" (obtenirSecteursEligiblesPlacement
 * NeantAdjacent/placerElementsNeantAdjacent) ignore silencieusement toute
 * clé `elements` inconnue (aucune erreur remontée) : sur l'Événement E
 * Cycle 1 Cadre 1 ("Placez une Guilde de Banquiers et 1 cube du Néant..."),
 * cube_neant (clé reconnue) s'appliquait normalement tandis que
 * guilde_banquier (clé catalogue, absente de la table au pluriel) était
 * purement perdu — d'où le cube visible mais la Guilde absente de l'onglet
 * Secteurs, malgré une popup de résolution "réussie". Même bug latent
 * repéré (recherche globale sur le catalogue) et corrigé au passage sur 2
 * autres cadres non encore rencontrés en jeu : Événement B Cycle 2 Cadre
 * 1, Événement E Cycle 3 Cadre 1 (même clé "guilde_banquier"). fermiers/
 * ingenieurs/mineurs alignés au singulier par cohérence avec ce même
 * principe (catalogue) même si aucun cadre ne les utilise encore
 * aujourd'hui — vérifié sans risque de régression (ces clés au pluriel
 * n'étaient référencées nulle part ailleurs dans le projet). Nouveau test
 * de régression dédié (test_secteurService_placement.js) reproduisant
 * exactement le cadre buggé. js/secteurService.js (v7).
 *
 * 20/08/2026 (EVOLUTION 3 — effet "Augmentez une Population Pure" de
 * piste Civilisation/Focus, voir TODO.md) : js/focusEngine.js
 * (resoudreCle_) reconnaît désormais aussi la clé "augmenter_population"
 * (SANS "_pure") — c'est la seule forme utilisée par data/catalogue/
 * pistesCivilisation.json ET focus.json (jamais "_pure", qui reste
 * propre à evenements.json), jusqu'ici NON reconnue : elle retombait
 * silencieusement sur le repli générique "effet non chiffré — à
 * appliquer manuellement" au lieu d'ouvrir la popup de sélection de
 * secteur déjà existante (contexte 'augmenter_population_pure',
 * strategieService.js, EVOLUTION D Cycle 1 Cadre 2). Un seul point de
 * correction couvre les 2 usages demandés : CivilisationService.
 * avancerPiste (avancement d'une piste de Civilisation) ET FocusEngine.
 * jouerActionEtPersister (action Focus), qui délèguent tous deux à ce
 * même resoudreCle_ — vérifié par un test manuel de bout en bout
 * (avancerPiste -> demanderChoix({type:'augmenter_population_pure'})
 * bien appelé). "augmenter_population_up_to" (variante "jusqu'à N fois"
 * du catalogue focus.json) reste HORS PÉRIMÈTRE, comme les autres
 * variantes _up_to déjà notées dans focusEngine.js — repli générique
 * inchangé, pas de régression. 3 nouveaux tests dans focusEngine_test.js
 * (succès, annulé, choix inclusif mixant les 2 clés). js/focusEngine.js
 * (v7). Aucun changement gameService.js/index.html/strategieService.js
 * (cleFocusEnginePourOptionCadre_ ne concerne QUE les Cadres "choix"
 * d'Événement galactique, qui utilisent déjà exclusivement la forme
 * "_pure" — vérifié sur tout evenements.json, rien à y changer).
 *
 * 20/08/2026 (EVOLUTION 4 — effet manuel de piste Civilisation, voir
 * TODO.md) : js/civilisationService.js (avancerPiste) affiche désormais
 * un rappel temporaire (popup `demanderChoix({type:'confirmation'})`,
 * même mécanisme déjà utilisé côté Cadre "gain" d'Événement galactique —
 * index.html) chaque fois que l'Effet résolu d'une case retombe sur une
 * clé non automatisée par focusEngine.js (détecté via le suffixe commun
 * "— à appliquer manuellement." de la ligne de journal correspondante,
 * sans dupliquer la liste des clés non automatisées — focusEngine.js
 * reste seul juge de ce qui l'est ou non, et n'est PAS modifié par cette
 * évolution). Texte dédié pour "gagner_technologie" ("Choisir une
 * technologie [de base ou avancée] manuellement", selon la valeur — base
 * seule, ou tableau ["base","amelioree"], les 2 seules formes présentes
 * dans data/catalogue/pistesCivilisation.json) et "gagner_programme"
 * ("Choisir un programme [<type>] manuellement", type omis pour la
 * valeur numérique générique) ; repli générique (texte imprimé de la
 * case) pour toute autre clé non automatisée (ex. retirer_corruption).
 * Journal Focus ("Actions réalisées") simplifié UNIQUEMENT pour ces 2
 * clés ("technologie choisie manuellement"/"programme choisi
 * manuellement" — accord "choisi" masculin corrigé pour "programme",
 * TODO.md écrivait "choisie" pour les 2 lignes d'exemple, coquille
 * probable — pas de rappel du choix base/avancée ni du type de
 * Programme, comme demandé) ; toute autre clé garde son texte technique
 * existant, inchangé. Purement informatif : n'affecte jamais la
 * persistance (déjà faite avant l'affichage du rappel). Scope strictement
 * limité à avancerPiste (piste Civilisation) — AUCUN changement
 * focusEngine.js, donc aucun effet sur les actions Focus (qui appellent
 * le même resoudreCle_ mais n'affichent jamais ce rappel). Nouveau
 * fichier de test dédié civilisationService_test.js (7 cas — le module
 * en était dépourvu jusqu'ici, dette connue signalée dans CLAUDE.md) :
 * effet automatisé sans rappel, gagner_technologie (2 formes),
 * gagner_programme (2 formes), clé générique hors périmètre (journal
 * inchangé), et choice inclusif où seule une option automatisée est
 * choisie (aucun rappel). js/civilisationService.js (v2).
 *
 * 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
 * TODO.md) : "retirer_corruption" retirée de CLES_SECTEUR_HORS_PERIMETRE
 * (js/focusEngine.js v8) — nouveau cas dédié qui délègue à
 * demanderChoix({type:'retirer_corruption'}), même principe que
 * construire/augmenter_population_pure. Nouvelle popup dédiée
 * (js/strategieService.js v22, contexte 'retirer_corruption') : menu de
 * CIBLES possibles, chacune affichée seulement si éligible — Secteur
 * possédé Corrompu (nouvelle SecteurService.
 * obtenirSecteursEligiblesRetraitCorruption, js/secteurService.js v8 —
 * persiste via SecteurService.retirerCorruption déjà existante, sans
 * changer son comportement historique côté bouton "Retirer" de l'écran
 * Secteurs, non restreint) ; Piste de Civilisation Corrompue s'il y en a
 * au moins une, choix si plusieurs (CivilisationService.
 * definirCorruption(..., false) déjà existante — PAS
 * avancerPisteCorrompue, mécanique différente : celle-ci avance la piste
 * d'une case sans bénéfice, non demandé ici) ; Programme, toujours
 * proposée et résolue manuellement (Corruption de Programme non suivie
 * en base) ; Technologie "Chambres de décontamination", si possédée ET
 * au moins 1 Corruption stockée dessus. Ce dernier point introduit un
 * nouveau jeton manuel plateauMaison.corruptionChambreDecontamination
 * (CHAMPS_PLATEAU_MAISON_AUTORISES + partie.plateauMaison,
 * js/gameService.js v16 ; jetonInputHTML_/persisterJeton_/renderJetons_,
 * js/strategieService.js — affiché sur Plat. maison uniquement si la
 * Technologie est possédée) : cette évolution n'automatise QUE le
 * RETRAIT (décrément) — la mécanique qui AJOUTE une Corruption sur cette
 * case au lieu d'un secteur/piste/Programme reste hors périmètre,
 * incrémentée à la main comme Commerce/Prime/Libération. Bonus mineur :
 * cleFocusEnginePourOptionCadre_ (js/gameService.js) reconnaît aussi
 * { cle: 'retirer_corruption' } pour un futur Cadre "choix" d'Événement
 * galactique utilisant cette clé au format simple (aucun cadre du
 * catalogue actuel n'est concerné — vérifié sur evenements.json, les
 * occurrences existantes sont soit dans des objectifs (non automatisés,
 * mécanisme séparé), soit dans des structures "échange"/"gain" complexes
 * hors du pattern "choix" simple déjà automatisé). Témoin "clé secteur
 * hors périmètre" des tests existants (focusEngine_test.js,
 * civilisationService_test.js) basculé de "retirer_corruption" (portée
 * par ce lot) vers "effet_secteur" (toujours hors périmètre). 5 nouveaux
 * tests au total (focusEngine_test.js ×2, civilisationService_test.js ×1
 * bout-en-bout depuis une piste, secteurService_actions_test.js ×1
 * d'éligibilité) — 52/52 tests passent sur l'ensemble de la suite,
 * aucune régression.
 *
 * 20/08/2026 (EVOLUTION 6 — effet "avance_rapide" de piste Civilisation,
 * voir TODO.md) : "simplement incrémenter le niveau de la piste
 * concernée" — js/civilisationService.js (v3, avancerPiste) incrémente
 * désormais AUTOMATIQUEMENT la piste d'un niveau supplémentaire quand
 * l'effet de la case résolue est "avance_rapide", SANS résoudre l'effet
 * de la nouvelle case atteinte (même principe qu'avancerPisteCorrompue,
 * déjà existante, qui avance aussi sans bénéfice de case). Détecté via le
 * même signal qu'EVOLUTION 4 (suffixe "à appliquer manuellement." du
 * journal FocusEngine) — "avance_rapide" reste volontairement dans
 * CLES_CIVILISATION_HORS_PERIMETRE côté focusEngine.js (aucune mutation
 * de piste ne pourrait de toute façon transiter par son diff générique,
 * limité aux ressources/cubeActif/jetons — voir focusEngine.js en-tête) :
 * AUCUN changement focusEngine.js, scope strictement limité à
 * avancerPiste. "avance_rapide" n'apparaît d'ailleurs QUE dans
 * data/catalogue/pistesCivilisation.json (jamais evenements.json/
 * focus.json, vérifié), donc aucun risque pour Focus/Événements. Piste
 * déjà au niveau maximum au moment de l'avance_rapide : aucune écriture
 * supplémentaire, journal adapté en conséquence. Une SEULE mutation de
 * champNiveau empilée dans la pile d'annulation (ancien -> niveau final,
 * jamais l'étape intermédiaire) pour qu'"Annuler" revienne correctement
 * en un coup, malgré 2 écritures DB successives (AnnulationService.
 * annulerDerniere_ applique ses mutations dans l'ordre, sans inversion :
 * 2 mutations sur le même champ s'écraseraient l'une l'autre au lieu de
 * revenir à l'ancien niveau — piège identifié et évité). 3 nouveaux tests
 * dans civilisationService_test.js (incrément simple, une seule mutation
 * empilée / Annuler correct, piste déjà au maximum) — 11/11 tests du
 * fichier passent, 88/95 sur l'ensemble de la suite (7 échecs restants :
 * mêmes échecs préexistants du baseline, aucune régression).
 *
 * 20/08/2026 (EVOLUTION 7 — effet d'Événement/Focus "avancer sur une
 * piste de Civilisation", voir TODO.md) : "avancer_civilisation" (piste
 * au choix) et "avancer_civilisation_societe"/"_gouvernement"/"_economie"
 * (piste imposée) retirées de CLES_CIVILISATION_HORS_PERIMETRE
 * (js/focusEngine.js v9) — nouveau cas dédié qui délègue à
 * demanderChoix({type:'avancer_civilisation', piste}), même principe que
 * construire/retirer_corruption. Nouvelle popup dédiée
 * (js/strategieService.js v23, contexte 'avancer_civilisation') :
 * "piste non précisée" -> menu des 3 pistes, chacune avec son niveau
 * actuel (X/NIVEAU_MAX) et un aperçu de la PROCHAINE case (réutilise
 * CivilisationService.obtenirDetailPistes, déjà chargé/mis en cache côté
 * écran Focus pour le même besoin) ; "piste précisée" -> même aperçu pour
 * cette seule piste, un bouton "Avancer". À la validation, délègue
 * directement à CivilisationService.avancerPiste (déjà existante — même
 * moteur que le bouton "Avancer" manuel de l'écran Focus), qui gère SEULE
 * tout l'enchaînement en cascade demandé par TODO.md (choix "et/ou"
 * imbriqués, rappel manuel EVOLUTION 4, retirer_corruption EVOLUTION 5,
 * avance_rapide EVOLUTION 6 — tous déjà pris en charge en interne par
 * avancerPiste depuis les évolutions précédentes, aucun code
 * supplémentaire nécessaire ici pour cet enchaînement). Un refus (choix
 * annulé) sur un effet imbriqué N'ANNULE PAS l'avancement de piste déjà
 * acquis (avancerPiste ne rejette jamais sa Promise) — resolve({detail})
 * couvre donc aussi ce cas ; la popup n'est annulable qu'AVANT
 * validation. js/gameService.js (v17 — cleFocusEnginePourOptionCadre_
 * reconnaît aussi ces 4 clés pour un Cadre "choix", ex. Événement E
 * Cycle 1 Cadre 2, seul cas au format simple du catalogue actuel —
 * vérifié sur evenements.json/focus.json).
 *
 * Correctif EVOLUTION 5 découvert au passage (index.html) :
 * cleFocusEnginePourOptionCadre_/LABEL_OPTION_FOCUSENGINE_ — la copie
 * locale d'index.html (dupliquée de gameService.js "pour savoir si le
 * cadre est cliquable") avait été oubliée lors de l'ajout de
 * 'retirer_corruption' (EVOLUTION 5) : un Cadre "choix" portant sur
 * cette clé n'était donc PAS reconnu comme cliquable côté rendu (malgré
 * GameService.appliquerCadreChoixFocusEngine déjà prêt à la résoudre), et
 * son libellé de bouton serait de toute façon tombé sur libelleOptionCube_
 * ("Déployer N cube(s)", faux, faute d'entrée dans
 * LABEL_OPTION_FOCUSENGINE_). Corrigé au passage, en même temps que
 * l'ajout des 4 nouvelles clés de cette évolution.
 *
 * 4 nouveaux tests dans focusEngine_test.js (piste au choix, piste
 * imposée "gouvernement", les 2 autres pistes imposées "societe"/
 * "economie", annulé) — 26/26 tests du fichier passent, 92/99 sur
 * l'ensemble de la suite (7 échecs restants : mêmes échecs préexistants
 * du baseline test_gameService_cadreChoixCube.js — dette déjà connue,
 * méthode renommée appliquerCadreChoixCube -> appliquerCadreChoixFocusEngine
 * avant cette session, non corrigée ici, hors périmètre). Aucun test
 * dédié pour le nouveau contexte de popup lui-même (strategieService.js
 * n'a pas de suite de tests — DOM-heavy, dette connue déjà signalée dans
 * CLAUDE.md, cohérent avec les évolutions précédentes).
 *
 * 20/08/2026 (correctifs — retour utilisateur sur EVOLUTION 7 + préférence
 * générale "corriger la donnée plutôt que le code") :
 *
 * 1) BUG — "j'avance sur une piste de Civilisation (Cadre d'Événement),
 * mais l'effet de la nouvelle case (testé : activer un cube + gagner 1
 * Crédit et 1 Science) n'apparaît pas sur Plat. maison". Root cause :
 * GameService.appliquerCadreChoixFocusEngine (js/gameService.js, v18)
 * capturait `lignePlateauMaison` UNE SEULE FOIS tout en haut (avant
 * FocusEngine.resoudreEffet), puis réécrivait cet instantané tel quel à
 * la fin (DB.put brut, pas lecture-fusion-écriture) — alors que la popup
 * imbriquée 'avancer_civilisation' (EVOLUTION 7) ET l'option Technologie
 * de 'retirer_corruption' (EVOLUTION 5) écrivent DIRECTEMENT sur
 * plateauMaison PENDANT la résolution (via GameService.majPlateauMaison/
 * majCivilisation, elles-mêmes lecture-fusion-écriture, donc sûres) :
 * l'écriture finale du cadre écrasait ces changements avec les valeurs
 * d'avant, violant la règle #1 du projet (CLAUDE.md, "lecture-fusion-
 * écriture systématique"). Corrigé en relisant une ligne FRAÎCHE juste
 * avant de fusionner uniquement les champs suivis par focusEngine.js lui-
 * même (l'action DIRECTE du cadre — jamais ceux d'une popup imbriquée,
 * qui persiste déjà elle-même). Nouveau fichier de test dédié
 * gameService_cadre_ecriture_imbriquee_test.js (2 cas — le premier
 * reproduit fidèlement le bug via un `demanderChoix` factice qui écrit
 * sur plateauMaison avant de résoudre, exactement comme le fait la
 * vraie popup ; vérifié qu'il échoue bien sur l'ancien code et passe sur
 * le correctif — attention portée au mock DB : un DB.get() DOIT cloner,
 * sans quoi le bug reste invisible en test, comme en IndexedDB réel).
 *
 * 2) UX — "le résultat Appliqué (...) est trop verbeux, ne pas mettre le
 * log (case 1 ...) ici" : js/strategieService.js (v24) — le résumé de la
 * popup 'avancer_civilisation' n'inclut plus `effetJournal` (le détail
 * technique de l'effet en cascade de la nouvelle case) ; il ne reste que
 * "Piste X : niveau A → B — texte de la case", même format concis que le
 * bouton "Avancer" manuel de l'écran Focus.
 *
 * 3) DONNÉE plutôt que CODE — retour utilisateur : "si c'est un écart de
 * convention de nommage, je préfère mettre à jour les données plutôt que
 * bidouiller le code". S'applique à EVOLUTION 2 (20/08/2026, plus tôt
 * cette session) : CHAMP_ELEMENT_PLACEMENT_ (js/secteurService.js, v9)
 * REVIENT à sa forme d'origine (4 clés Guilde au PLURIEL — "guilde_
 * fermiers"/"guilde_ingenieurs"/"guilde_mineurs"/"guilde_banquiers",
 * seule "guilde_scientifique" au singulier, convention déjà majoritaire
 * avant EVOLUTION 2) ; la véritable anomalie — 3 occurrences de la
 * coquille "guilde_banquier" (singulier) dans data/catalogue/
 * evenements.json (Événement E Cycle 1 Cadre 1, Événement B Cycle 2
 * Cadre 1, Événement E Cycle 3 Cadre 1) — est corrigée directement dans
 * la DONNÉE ("guilde_banquier" -> "guilde_banquiers"), diff minimal
 * (3 lignes), JSON revalidé. test_secteurService_placement.js mis à jour
 * en conséquence (fixture + assertions sur la clé corrigée). Confirmé
 * avec l'utilisateur : EVOLUTION 3 ("augmenter_population" reconnue en
 * plus d'"augmenter_population_pure") N'EST PAS concernée — pas un écart
 * de convention mais un vrai synonyme légitime (une seule mécanique
 * possible, "on ne peut pas augmenter une population non pure").
 *
 * 20/08/2026 (correctif — retour utilisateur : "l'effet avance rapide
 * doit faire gagner le bonus de la case atteinte") : js/civilisationService.js
 * (v4) — avancerPiste résout désormais l'EFFET de la case suivante quand
 * l'effet résolu est "avance_rapide" (pas seulement son niveau, comme la
 * première version de EVOLUTION 6 le faisait — lecture initiale de
 * TODO.md "simplement incrémenter le niveau", corrigée par ce retour).
 * Nouvelle fonction récursive resoudreCaseEtChainerAvanceRapide_ : résout
 * une case, PUIS enchaîne automatiquement sur la case suivante tant que
 * l'effet résolu est encore "avance_rapide" (chaîne à profondeur
 * illimitée, plafonnée par NIVEAU_MAX — vérifié sur tout data/catalogue/
 * pistesCivilisation.json : "avance_rapide" n'est jamais combinée à un
 * autre effet sur la même case, donc chaque case de la chaîne enchaîne
 * encore OU résout un effet normal, jamais les deux). Toutes les
 * mutations d'effet (ressources/cube/etc.) de CHAQUE case traversée sont
 * appliquées ET persistées au fil de la chaîne. Une SEULE mutation de
 * champNiveau reste empilée dans la pile d'annulation (ancien -> niveau
 * FINAL, aucune étape intermédiaire), pour qu'"Annuler" revienne
 * correctement en un coup quel que soit le nombre de sauts — vérifié sur
 * une chaîne à 2 sauts. `resultat.texte` concatène désormais les textes
 * de TOUTES les cases traversées (plus seulement celui de la première).
 * Un effet manuel (EVOLUTION 4) ou retirer_corruption (EVOLUTION 5) sur
 * une case atteinte par avance_rapide déclenche normalement sa propre
 * popup/rappel, comme n'importe quelle case atteinte classiquement. 3
 * tests réécrits dans civilisationService_test.js (gain effectif du
 * bonus, chaîne à 2 sauts consécutifs, déjà au maximum en cours de
 * chaîne) — 11/11 tests du fichier passent, 94/101 sur l'ensemble de la
 * suite (7 échecs restants : mêmes échecs préexistants du baseline).
 *
 * 21/08/2026 (nouvelle demande — "Implémenter améliorer un jeton
 * gloire") : effet "ameliorer_gloire" ("il faut incrémenter la valeur de
 * notre plus petit jeton gloire. Si je n'ai pas de jeton gloire de
 * valeur inférieure à 5 l'effet ne fait rien.") résolu directement dans
 * js/focusEngine.js (v10, resoudreCle_) — Effet uniquement, signe > 0,
 * entièrement déterministe : incrémente le plus petit jeton Gloire
 * possédé de valeur < 5 ; si aucun n'est éligible (aucun jeton posé, ou
 * tous déjà à 5), l'effet réussit sans rien modifier. AUCUNE popup
 * nécessaire (contrairement à construire/retirer_corruption/avancer_
 * civilisation, qui exigent un vrai choix du joueur ou touchent une
 * autre table que plateauMaison) : résolu en une passe, pure, sur
 * `etat.gloire`.
 *
 * 'gloire' (tableau de 5 emplacements, null = vide) ajoutée à
 * CHAMPS_DIFF_SUIVIS — piège identifié et corrigé au passage :
 * diffChamps_ comparait ses champs par référence stricte (`!==`), or
 * resoudreJson_ CLONE systématiquement tout l'état (cloner_, JSON deep
 * clone) avant résolution ; un tableau cloné a TOUJOURS une référence
 * différente de l'original même si son CONTENU est identique — un `!==`
 * brut aurait donc signalé "gloire" comme muté à CHAQUE action, même
 * celles qui ne touchent jamais Gloire (pollution de la pile
 * d'annulation avec des entrées fantômes, écriture DB superflue à
 * chaque fois). Corrigé en comparant par CONTENU (JSON.stringify) plutôt
 * que par référence — reste strictement équivalent à `!==` pour les
 * champs scalaires déjà suivis (aucune régression). Ce piège était
 * invisible sans un test dédié : 2 des 4 nouveaux tests de
 * focusEngine_test.js vérifient spécifiquement ce point (vérifié qu'ils
 * échouent bien sur le `!==` brut et passent sur le correctif).
 *
 * cleFocusEnginePourOptionCadre_ (js/gameService.js v19 + copie locale
 * index.html — les 2 mises à jour ensemble cette fois, leçon retenue de
 * l'oubli EVOLUTION 5/7) reconnaît { cle: 'ameliorer_gloire' } pour le
 * seul Cadre "choix" simple du catalogue actuel qui l'utilise (Événement
 * F Cycle 1 Cadre 2 — vérifié sur evenements.json, les autres occurrences
 * sont dans des objectifs ou des structures "libre"/"echange" hors du
 * pattern simple déjà automatisé). LABEL_OPTION_FOCUSENGINE_ (index.html)
 * complétée. 4 nouveaux tests dans focusEngine_test.js (incrément du
 * plus petit jeton, aucun jeton éligible — 2 sous-cas, égalité entre
 * jetons, non-régression sur une action qui ne touche pas Gloire) + 1
 * nouveau test bout-en-bout dans gameService_cadre_ecriture_imbriquee_test.js
 * (persistance via un Cadre "choix") — 99/106 sur l'ensemble de la
 * suite (7 échecs restants : mêmes échecs préexistants du baseline).
 *
 * 21/08/2026 (Événement F, Cycle 1, Cadre 1 — "Placez une Guilde et 1
 * cube du Néant dans le secteur du Néant adjacent avec la Population la
 * plus basse OU placez un jeton Gloire de valeur 2 et une Défense de
 * Secteur dans le secteur du Néant adjacent avec la Population la plus
 * élevée.") : nouveau gabarit de cadre — un `type: 'choix'` dont chaque
 * option est elle-même `type: 'placement'` avec un `critere` de
 * Population (distinct de "placement"/"placement_multiple" existants,
 * qui n'offrent jamais de choix entre plusieurs placements alternatifs).
 *
 * js/secteurService.js (v10) : nouvelle clé GÉNÉRIQUE "guilde" dans
 * CHAMP_ELEMENT_PLACEMENT_ (type au choix du joueur, sans `champ` —
 * résolu en "guilde_<type>" avant tout appel à
 * placerElementsNeantAdjacent, qui ne la reçoit donc jamais telle
 * quelle ; suffit tel quel à obtenirSecteursEligiblesPlacementNeantAdjacent,
 * qui compte par `categorie`, jamais par `champ` précis). Filet de
 * sécurité ajouté à placerElementsNeantAdjacent : ignore désormais aussi
 * silencieusement toute entrée sans `champ`.
 *
 * js/gameService.js (v20) : nouvelle méthode appliquerCadreChoixPlacement
 * (+ construireResumePlacementChoix_/LABEL_TYPE_GUILDE_RESUME_) —
 * résout la clé générique "guilde" via `typeGuildeChoisi`, revalide
 * intégralement le secteur choisi côté serveur (réutilise
 * SecteurService.resoudrePlacementMultipleNeantAdjacent en enveloppant
 * l'option dans un `placements` à 1 entrée, aucune duplication de la
 * logique de calcul des candidats par critère de Population), même
 * garde-fou anti-double-application qu'appliquerCadrePlacement/
 * appliquerCadrePlacementMultiple.
 *
 * js/strategieService.js (v25) : nouveau contexte demanderChoix
 * 'placement_critere' — secteur déterminé par le critère (candidats
 * recalculés à l'affichage), second <select> de type de Guilde
 * (TYPES_GUILDE_CONSTRUIRE_, réutilisé) si l'élément "guilde" est
 * générique. Résout {numero, type} SANS persister (contrairement à
 * 'construire'/'retirer_corruption') : la revalidation et l'écriture
 * sont laissées à GameService.appliquerCadreChoixPlacement.
 *
 * index.html : actionsCadre_ reconnaît désormais une option `type:
 * 'placement'` au sein d'un cadre "choix" (LABEL_ELEMENT_PLACEMENT_CADRE_/
 * libelleOptionPlacementChoix_ — ex. "Guilde + cube du Néant (Population
 * la plus basse)") ; ouvrirPopupCadreEtRafraichir_/nouvelle
 * resoudreOptionPlacementCritereEtRafraichir_ câblent la popup
 * 'placement_critere' puis GameService.appliquerCadreChoixPlacement,
 * même pattern que les autres résolutions de cadre. Le rendu du statut
 * "✓ Appliqué (...)" une fois résolu réutilise tel quel le chemin
 * générique existant (cadresAppliques[ordre].resume), aucun changement
 * nécessaire dans renderCadresEvenement_.
 *
 * Nouveau fichier de test dédié gameService_cadre_placement_choix_test.js
 * (5 cas : les 2 options résolues correctement chacune sur le bon
 * secteur, secteur ne correspondant pas au critère rejeté par la
 * revalidation serveur, type de Guilde manquant rejeté, garde-fou anti-
 * double-application) — 104/111 sur l'ensemble de la suite (7 échecs
 * restants : mêmes échecs préexistants du baseline, aucune régression).
 *
 * 21/08/2026 (retour utilisateur : "Événement E Cycle 1 Cadre 2 —
 * Avancer piste civilisation -> avance rapide -> gagner un jeton
 * commerce -> gagner un jeton prime, ça s'est mal passé") : la clé
 * "gagner_prime" (pistesCivilisation.json, et Bonus Commerce —
 * gagner_commerce ouvre une popup de 6 bonus fixes dont "Gagnez un
 * jeton Prime.", resolu récursivement) retombait sur le repli générique
 * non automatisé de FocusEngine.resoudreCle_ (aucun cas dédié, contrairement
 * à la clé simple "prime" déjà couverte par CLES_SIMPLES) — le jeton
 * Prime n'était donc jamais réellement crédité en bout de chaîne, juste
 * signalé "à appliquer manuellement". Nouveau cas dédié dans
 * focusEngine.js (v10) : "gagner_prime" traité comme alias de "prime"
 * (jetonPrime, déjà dans CHAMPS_DIFF_SUIVIS — diff/persistance
 * inchangées). Corrige aussi bien l'avancement direct sur une case
 * "Gagnez un/deux jeton(s) Prime." que le sous-choix Bonus Commerce.
 *
 * 21/08/2026 (implémentation "Gagner une Corruption", voir nouveau
 * docs/docs-rules-corruption-gardiens-refuges-technoConsume.md §1) :
 * nouveau contexte demanderChoix 'gagner_corruption' (strategieService.js
 * v26) — popup miroir de 'retirer_corruption', menu de cibles (Secteur
 * possédé non Corrompu et non immunisé/Piste de Civilisation non
 * Corrompue/Programme manuel/Technologie Chambres de décontamination —
 * capacité réelle 2, 3 si améliorée), chacune affichée seulement si
 * éligible. Nouvelles SecteurService.obtenirSecteursEligiblesGainCorruption/
 * placerCorruption (secteurService.js v11, miroir du retrait). Branchée à
 * 2 endroits :
 * - FocusEngine.resoudreCle_ (focusEngine.js v11) : nouvelle clé
 *   "gain_corruption" (Focus/pistes de Civilisation) — les 4 cibles sont
 *   ouvertes, "sans précision".
 * - GameService.appliquerCadreGainCorruption/cadreGainCorruptionAutomatisable
 *   (gameService.js v21) : un Cadre d'Événement galactique "type":"gain"
 *   dont l'effet précise une cible catalogue (cible/cible_options/repli)
 *   automatisable (secteur_au_choix/piste_civilisation/emplacement_
 *   programme/fiche_maison/carte_technologie_chambres_decontamination)
 *   ouvre désormais la même popup avec ces cibles restreintes en priorité
 *   stricte (repli seulement si le 1er groupe est intégralement
 *   inéligible), au lieu de systématiquement retomber sur
 *   appliquerCadreManuel. Reste volontairement manuel (aucune régression) :
 *   "offre_programme" (comme demandé), les cadres à cible composée/
 *   contextuelle ("chaque_offre_programme_non_corrompue",
 *   "meme_secteur_que_etape_precedente") et le seul cadre avec un
 *   `effet_conditionnel` (Événement G Cycle 1 — la piste de Civilisation
 *   doit en plus avancer sans bénéfice, mécanique volontairement pas
 *   automatisée cette session, voir JSDoc de resoudreCiblesCadreGainCorruption_).
 * index.html : nouvelle catégorie de cadre "estGainCorruption" (à côté de
 * placement/placement_multiple/manuel/résolution) + appliquerCadreGainCorruptionEtRafraichir_.
 *
 * 21/08/2026 (retour utilisateur : "Implémenter le gain d'influence, il y
 * en a à plusieurs endroits") : la clé simple "influence" (montant fixe)
 * était déjà automatisée, mais pas les formules VARIABLES de focus.json/
 * pistesCivilisation.json. Périmètre retenu avec l'utilisateur : les
 * formules calculables depuis l'état du plateau (Gloire/Technologies/
 * secteurs) — PAS celles liées à l'issue d'un combat ni la Technologie
 * dont l'Influence dépend du texte libre d'un Programme (voir focusEngine.js
 * v12 pour le détail précis du périmètre exclu).
 * - "influence_valeur_gloire" (somme des jetons Gloire) et
 *   "influence_par_technologie_amelioree" (Technologies améliorées,
 *   3 sources combinées) : résolues entièrement en pur dans
 *   FocusEngine.resoudreCle_ (focusEngine.js v12), aucun accès DB requis
 *   (tout est déjà sur `etat` = la ligne plateauMaison brute).
 * - Les 9 clés "influence_par_guilde", "influence_par_installation_pure",
 *   "influence_par_cube_secteur_pur" et "influence_par_secteur_pur" (et
 *   leurs variantes, comptage sur secteursPartie) : nouvelle
 *   SecteurService.obtenirAgregatsInfluenceSecteursPurs (secteurService.js
 *   v12) + nouveau contexte demanderChoix 'influence_secteur'
 *   (strategieService.js v27) — calcul déterministe SANS choix utilisateur
 *   (contrairement à tous les autres contextes de ce fichier), la popup
 *   s'affiche brièvement puis se ferme d'elle-même une fois le montant
 *   calculé, comme la résolution directe déjà en place pour une piste
 *   Corrompue unique (retirer_corruption).
 *
 * 21/08/2026 (correctif — retour utilisateur : "je ne vois pas le
 * compteur d'influence augmenter dans l'onglet plat. maison") : le
 * compteur "Influence" vit sur l'écran Plat. maison via App.renderPlateauMaison
 * (index.html, "déménagé" là depuis la Session 10 — comportement legacy
 * strategie.html/index.html GAS), un rendu SÉPARÉ des fonctions render*_
 * de strategieService.js. Toute action qui gagne de l'Influence (le gain
 * fixe "influence" déjà existant, ou l'une des formules variables
 * ajoutées cette session) persistait bien en base, mais aucun appelant
 * (jouerAction_ pour une action Focus, les ~8 wrappers "…EtRafraichir_"
 * d'index.html pour un Cadre d'Événement galactique) n'appelait
 * App.renderPlateauMaison après coup — seul App.ouvrirPartie (chargement
 * initial d'une partie) le faisait. StrategieService.afficher (appelée
 * par TOUS ces points) appelle désormais App.renderPlateauMaison
 * elle-même (strategieService.js v28) : un seul endroit à corriger plutôt
 * que chaque appelant, qui referme définitivement ce trou pour toute
 * action future qui gagnerait de l'Influence.
 *
 * 21/08/2026 (correctifs — retour utilisateur, "Test evenement F cycle 1
 * ko") : 2 bugs distincts sur les 2 effets du Cadre 2.
 * - Effet 1 ("placez un jeton Gloire de valeur 2... ") : jetonGloire
 *   (secteursPartie) était un simple NOMBRE (la valeur du jeton posé), qui
 *   ne pouvait représenter qu'UN SEUL jeton par secteur — un 2e jeton
 *   Gloire placé sur un secteur en possédant déjà un ÉCRASAIT
 *   silencieusement le premier au lieu de s'y ajouter (rien de visible ne
 *   changeait si les 2 valeurs étaient identiques), alors que
 *   docs-rules-cycle-de-jeu.md §1.5.5 précise explicitement "aucune limite
 *   au nombre de jetons Prime, Libération ou Gloire dans un secteur".
 *   jetonGloire devient un TABLEAU de valeurs : js/secteurService.js
 *   (v13 — ligneSecteurParDefaut_/CHAMP_ELEMENT_PLACEMENT_.gloire
 *   (tableauValeurs)/placerElementsNeantAdjacent/envahirResoudre, avec
 *   normalisation à la lecture d'une éventuelle ancienne sauvegarde où ce
 *   champ était encore un nombre), index.html (ligneSecteurHTML_ — affiche
 *   "Gloire (2, 3)" pour plusieurs jetons), js/strategieService.js (flux
 *   'envahir' — place chaque jeton récupéré dans un emplacement Gloire
 *   libre distinct de la fiche Maison, au lieu d'un seul).
 * - Effet 2 ("améliorez un jeton Gloire") : cleFocusEnginePourOptionCadre_
 *   (js/gameService.js) routait déjà cette clé vers FocusEngine, mais
 *   FocusEngine.resoudreCle_ ne la reconnaissait PAS réellement (le
 *   commentaire l'annonçant était erroné) — elle retombait donc sur le
 *   repli générique "effet non chiffré", qui marque le Cadre comme
 *   appliqué SANS RIEN modifier sur la fiche Maison. Nouveau cas dédié
 *   dans js/focusEngine.js (v13) : comme retirer_corruption/avancer_
 *   civilisation, délègue à une popup dédiée (contexte 'ameliorer_gloire',
 *   js/strategieService.js) — le jeton Gloire (array) n'étant pas suivi
 *   par CHAMPS_DIFF_SUIVIS (non diffable par ce moteur), la popup calcule
 *   ET persiste directement (aucun choix utilisateur : cible toujours le
 *   jeton de plus petite valeur parmi les 5 emplacements, +1 plafonné à
 *   5) puis rafraîchit immédiatement l'affichage Gloire.
 * Nouveaux tests dans js/gameService_cadre_placement_choix_test.js
 * (coexistence de 2 jetons Gloire sur un même secteur).
 *
 * 21/08/2026 (correctif — retour utilisateur, suite immédiate au lot
 * précédent : "j'ajoute un jeton gloire valeur 1, reviens sur plat.
 * maison, fait l'effet améliorer jeton gloire, c'est le jeton de valeur 2
 * qui est amélioré et je ne vois plus mon jeton de valeur 1 ... ça a
 * fonctionné lorsque j'ai fait une autre action entre-temps") : le
 * contexte 'ameliorer_gloire' (js/strategieService.js) lisait
 * `partieAffichee.plateauMaison.gloire`, qui n'est réécrit qu'au prochain
 * StrategieService.afficher() COMPLET — le clic manuel sur un emplacement
 * Gloire (renderGloireDOM_) met à jour `etatGloire` (module var) ET la
 * base IMMÉDIATEMENT, mais jamais `partieAffichee.plateauMaison.gloire`
 * lui-même, qui restait donc périmé tant qu'aucune autre action n'avait
 * redéclenché un afficher() complet (« l'autre action » qui faisait
 * fonctionner le cas suivant, par coïncidence). Résultat : le jeton
 * fraîchement ajouté n'existait pas dans le tableau à 5 emplacements lu,
 * ET était écrasé par l'écriture finale (basée sur ce même tableau
 * périmé). Corrigé en lisant `etatGloire` directement (js/strategieService.js
 * v30) — seule source à jour en permanence pour ce champ, déjà utilisée
 * par le flux 'envahir' pour la même raison. Reproduit et vérifié dans le
 * Browser pane (partie fraîche, Gloire de départ [2,null,null,null,null],
 * ajout manuel d'un jeton valeur 1 SANS action intermédiaire, puis
 * "Améliorer un jeton Gloire" — persiste désormais bien [2,2,null,null,null]
 * en IndexedDB au lieu d'écraser en [3,null,null,null,null]).
 *
 * 21/08/2026 (Événement galactique G, Cycle 1 "Le visage du mal" — Cadres
 * 1 et 2, voir en-têtes de civilisationService.js v5/gameService.js v22/
 * strategieService.js v31/index.html v23) :
 * - Cadre 1 ("Gagnez une Corruption sur un emplacement de Programme ou sur
 *   une piste de Civilisation. Si la Corruption est placée sur une
 *   piste... le joueur doit avancer sur cette piste [en ignorant le
 *   bénéfice de la case atteinte]") : désormais automatisé via la popup
 *   'gagner_corruption' existante — choix Programme (manuel) ou Piste de
 *   Civilisation (marque la piste Corrompue puis l'avance d'une case sans
 *   résoudre son effet, sauf déjà au maximum).
 * - Cadre 2 (permanent : "chaque fois que vous retirez une Corruption,
 *   gardez-la dans votre zone de jeu personnelle... jusqu'à la phase
 *   Évaluation") : nouveau compteur plateauMaison.corruptionMaison,
 *   affiché sur Plat. maison à gauche d'Influence (champ numérique
 *   modifiable) — mis à jour automatiquement au marquage/démarquage
 *   Corrompue d'une piste de Civilisation ; tenu manuellement pour les
 *   Programmes/Chambres de décontamination. Tant que cet Événement est
 *   actif pour le cycle en cours, un retrait de Corruption sur une piste
 *   ne décrémente PAS ce compteur (petit message ajouté au journal pour
 *   le signaler).
 */

var APP_VERSION = '20260826.1';
