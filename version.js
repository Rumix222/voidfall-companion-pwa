/**
 * version.js
 * Version 34 — 2026-08-18
 * Source de vérité unique pour la version de l'application.
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
 */

var APP_VERSION = '20260819.11';
