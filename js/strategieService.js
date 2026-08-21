/**
 * strategieService.js
 * Écrans Focus (ex-Stratégie), Plat. Galactique et Plat. maison — Voidfall Companion PWA
 * Version 31 — 21/08/2026 (Événement galactique G, Cycle 1 "Le visage du mal" — Cadres 1 et 2 : popup 'gagner_corruption'/toggleCorruption_/retirer_corruption informés)
 *
 * 21/08/2026 (Événement galactique G, Cycle 1 — Cadres 1 et 2, "Le visage
 * du mal") :
 * - Cadre 1 : quand la popup 'gagner_corruption' est ouverte avec
 *   `contexte.avancerPisteApresPlacement` (gameService.js —
 *   appliquerCadreGainCorruption, cadre non manuel désormais pour ce
 *   Cadre précis, voir sa JSDoc) ET que la cible choisie est "Piste de
 *   Civilisation", un second appel à CivilisationService.
 *   avancerPisteSansEffet (civilisationService.js v5) avance
 *   immédiatement cette même piste d'une case, sans résoudre son effet —
 *   exactement le comportement imprimé sur la carte. Hors de ce contexte
 *   précis (Focus "gain_corruption" générique, focusEngine.js), le
 *   drapeau est absent : comportement inchangé.
 * - Cadre 2 (permanent) : nouvel helper evenementConserveCorruptionActif_
 *   (vrai quand l'Événement choisi pour le cycle en cours a le code "G")
 *   — utilisé par toggleCorruption_ et les 2 branches "Piste de
 *   Civilisation" du contexte 'retirer_corruption' pour transmettre
 *   `options.conserverCorruptionRetiree` à CivilisationService.
 *   definirCorruption : le compteur plateauMaison.corruptionMaison n'est
 *   alors PAS décrémenté au retrait (Corruption gardée en zone
 *   personnelle jusqu'à l'Évaluation) — un petit message est ajouté au
 *   journal pour le signaler (resultat.corruptionMaisonConservee).
 *
 * 21/08/2026 (gain d'Influence variable "N par Guilde/Installation/cube/
 * secteur Pur", voir focusEngine.js v12 — CLES_INFLUENCE_SECTEUR_) :
 * nouveau contexte demanderChoix 'influence_secteur' — contrairement à
 * tous les autres contextes de ce fichier, AUCUN choix utilisateur : le
 * montant est entièrement déterminé par l'état du plateau
 * (SecteurService.obtenirAgregatsInfluenceSecteursPurs, secteurService.js
 * v12), la popup se contente d'un calcul + fermeture immédiate (voir son
 * JSDoc inline pour le détail des 9 formules couvertes et les 2 nouvelles
 * tables CHAMP_GUILDE_PAR_CLE_INFLUENCE_/LABEL_GUILDE_INFLUENCE_).
 * "influence_valeur_gloire"/"influence_par_technologie_amelioree" restent
 * en revanche résolues entièrement en pur côté focusEngine.js (aucun
 * changement ici) — voir focusEngine.js v12 pour la raison (aucune donnée
 * secteur nécessaire pour ces deux-là). Hors périmètre volontaire cette
 * session (voir focusEngine.js v12) : "influence_par_cube_neant"/
 * "influence_population_secteur" (liées à l'issue d'une invasion) et
 * "evaluer_influence_programme_pur" (texte libre non structuré,
 * programmes.json).
 *
 * 21/08/2026 (effet "Gagner une Corruption", voir
 * docs-rules-corruption-gardiens-refuges-technoConsume.md §1) : nouveau
 * contexte demanderChoix 'gagner_corruption' — miroir de
 * 'retirer_corruption' ci-dessous, inversé (place plutôt que retire),
 * avec en plus un mécanisme de restriction optionnel (contexte.
 * ciblesAutorisees/ciblesRepli/exclureTechno) pour les Cadres d'Événement
 * galactique dont l'effet catalogue précise une cible (voir son JSDoc
 * inline pour le détail complet). Comble le "hors périmètre" du GAIN de
 * Corruption laissé ouvert par l'EVOLUTION 5 ci-dessous (seul le retrait
 * avait été automatisé à l'époque). Réutilise SecteurService.
 * obtenirSecteursEligiblesGainCorruption/placerCorruption (secteurService.js
 * v11), CivilisationService.definirCorruption(..., true) (déjà existante),
 * et une nouvelle technologieChambreDecontamination_ (capacité réelle de
 * la carte — 2 emplacements, 3 si améliorée, contrairement au retrait qui
 * ne fait que décompter). GameService.appliquerCadreGainCorruption
 * (gameService.js, nouveau) est le seul appelant qui restreint les
 * cibles ; FocusEngine.resoudreCle_ ("gain_corruption", focusEngine.js
 * v11) les laisse toutes ouvertes.
 *
 * 21/08/2026 (Événement F, Cycle 1, Cadre 1) : nouveau contexte
 * demanderChoix 'placement_critere' — secteur déterminé par un `critere`
 * de Population (réutilise SecteurService.resoudrePlacementMultipleNeantAdjacent
 * en enveloppant l'option dans un `placements` à 1 entrée), avec un
 * second <select> de type de Guilde (TYPES_GUILDE_CONSTRUIRE_, réutilisé)
 * si l'élément "guilde" est générique. Résout {numero, type} sans
 * persister (contrairement à 'construire'/'retirer_corruption') : la
 * revalidation ET l'écriture se font côté GameService.
 * appliquerCadreChoixPlacement (gameService.js v20), appelé par
 * index.html.
 *
 * 20/08/2026 (correctif — retour utilisateur, EVOLUTION 7 KO : "le
 * résultat Appliqué (...) est trop verbeux, ne pas mettre le log
 * (case 1 ...) ici") : validerAvancementPiste_ (contexte
 * 'avancer_civilisation') n'ajoute plus `resultat.effetJournal` au
 * `detail` résolu — ne reste que "Piste X : niveau A → B — texte de la
 * case", même format concis que le bouton "Avancer" manuel de l'écran
 * Focus (avancerPiste_, qui journalise séparément effetJournal dans le
 * journal "Actions réalisées", pas dans un statut "✓ Appliqué (...)" de
 * Cadre — bien plus contraint en place). "déjà au niveau maximum" aligné
 * sur le libellé déjà utilisé ailleurs ("déjà au maximum").
 *
 * 20/08/2026 (EVOLUTION 7 — effet "avancer sur piste de Civilisation",
 * voir TODO.md) : nouveau contexte demanderChoix 'avancer_civilisation' —
 * piste au choix (contexte.piste === null : menu des 3 pistes, chacune
 * avec son niveau X/NIVEAU_MAX et un aperçu de la prochaine case) ou
 * imposée (contexte.piste renseigné : même aperçu, un seul bouton
 * "Avancer"). Réutilise CivilisationService.obtenirDetailPistes (déjà
 * chargé/mis en cache pour "prochaines cases" côté écran Focus,
 * obtenirDetailPistesCache_) et CivilisationService.avancerPiste (déjà
 * existante — même moteur que le bouton "Avancer" manuel de l'écran
 * Focus) pour la persistance ET la résolution en cascade de l'effet de
 * la nouvelle case (choix imbriqués, rappel manuel, retirer_corruption,
 * avance_rapide — tous déjà gérés par avancerPiste elle-même, aucun code
 * supplémentaire ici). js/gameService.js (v17), js/focusEngine.js (v9),
 * index.html (correctif LABEL_OPTION_FOCUSENGINE_/cleFocusEnginePourOptionCadre_
 * — voir en-tête index.html pour le détail).
 *
 * 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
 * TODO.md) : nouveau contexte demanderChoix 'retirer_corruption' — menu
 * de cibles (Secteur possédé Corrompu/Piste de Civilisation Corrompue/
 * Programme manuel/Technologie Chambres de décontamination), chacune
 * affichée seulement si éligible. Réutilise SecteurService.
 * obtenirSecteursEligiblesRetraitCorruption/retirerCorruption
 * (secteurService.js v8) et CivilisationService.definirCorruption (déjà
 * existante — PAS avancerPisteCorrompue, mécanique différente). Nouveau
 * jeton manuel 'chambreDecontamination' (jetonInputHTML_/persisterJeton_/
 * renderJetons_, même gabarit que Commerce/Prime/Libération), affiché sur
 * Plat. maison uniquement si le joueur possède cette Technologie — décompte
 * les Corruptions qu'elle stocke ; seul le RETRAIT est automatisé par
 * cette évolution, le GAIN (redirection d'une Corruption vers cette
 * Technologie au lieu d'un secteur/piste/Programme) reste hors périmètre,
 * incrémenté à la main comme les autres jetons de cette grille.
 * js/gameService.js (v16 — partie.plateauMaison.corruptionChambreDecontamination
 * + CHAMPS_PLATEAU_MAISON_AUTORISES), js/secteurService.js (v8),
 * js/focusEngine.js (v8 — 'retirer_corruption' retirée de
 * CLES_SECTEUR_HORS_PERIMETRE).
 *
 * 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2, retour
 * utilisateur : "automatiser augmentez une population pure ... et
 * etablir un guilde banquier -> idem que etablir une guilde sauf que
 * banquier est preselectionné dans la ddl et en lecture seul") :
 * - nouveau contexte demanderChoix 'augmenter_population_pure' (secteur
 *   possédé, non Corrompu, Population < 6 — SecteurService.
 *   obtenirSecteursEligiblesAugmenterPopulationPure/augmenterPopulationPure,
 *   secteurService.js v6), même gabarit minimal que
 *   'placement_secteur_neant_adjacent'.
 * - contexte 'construire' accepte désormais un `typeForce` optionnel
 *   (restreint + désactive le <select> Type) pour etablir_guilde_banquier
 *   (focusEngine.js TYPE_FORCE_PAR_CLE_CONSTRUIRE_).
 * Câblé générique via cleFocusEnginePourOptionCadre_/
 * GameService.appliquerCadreChoixFocusEngine (gameService.js v15,
 * index.html) — aucun code spécifique à l'Événement D dans ce fichier.
 *
 * 19/08/2026 (retour utilisateur — "Installation et guilde ne sont pas
 * rafraîchit lorsque je clique sur l'onglet secteur") : jouerAction_ (jouer
 * une carte Focus) appelle désormais App.renderSecteurs(partieFraiche)
 * après CHAQUE action résolue (en plus de afficher(partieFraiche) déjà en
 * place) — App.afficherEcran ne re-rend rien tout seul au changement
 * d'onglet (Piège n°2, voir CLAUDE.md), l'onglet Secteurs restait donc
 * affiché avec son dernier rendu pour toute action Focus écrivant
 * directement sur secteursPartie (construire_installation/etablir_guilde,
 * mais aussi regrouper/envahir/deployer_cube, qui avaient le même défaut
 * avant ce correctif — jamais remarqué jusqu'ici). Rappel systématique
 * plutôt que de détecter au cas par cas quelle action a touché les
 * secteurs (peu coûteux, idempotent). index.html (appliquerCadreFocusEngineEtRafraichir_,
 * même correctif côté Cadre d'Événement galactique).
 *
 * 19/08/2026 (Construire une Installation / Établir une Guilde portées —
 * retour utilisateur : mécanique perdue lors du portage GAS -> PWA)
 * : nouveau contexte 'construire' de demanderChoix (secteur possédé avec un
 * emplacement libre pour la catégorie, ❗ si c'est le dernier — même
 * gabarit que 'placement_secteur_neant_adjacent' — + type au choix,
 * TYPES_INSTALLATION_CONSTRUIRE_/TYPES_GUILDE_CONSTRUIRE_ nouvelles,
 * dupliquées depuis index.html par convention) — appelé par
 * focusEngine.js (resoudreCle_, clés construire_installation/installation/
 * etablir_guilde/guilde, désormais sorties de CLES_SECTEUR_HORS_PERIMETRE)
 * pour toute carte Focus ET par GameService.appliquerCadreChoixFocusEngine
 * pour un Cadre "choix" d'Événement galactique (ex. Événement C Cycle 1
 * Cadre 2). Persiste directement via SecteurService.construire (déjà porté
 * Session 12/13, jusqu'ici seulement branché sur le formulaire dédié de
 * l'écran Secteurs) au clic sur Valider, comme regrouper/envahir/
 * deployer_cube — focusEngine.js reste pur.
 *
 * 19/08/2026 (Événement galactique C, Cycle 1 — Cadre 1 "Vestiges du
 * Domineum") : popup 'placement_secteur_neant_adjacent' accepte un
 * `contexte.numeros` optionnel (liste de numéros précise, ex. secteurs à
 * égalité de Population) qui restreint la liste déroulante — la liste
 * éligible complète reste calculée via SecteurService.
 * obtenirSecteursEligiblesPlacementNeantAdjacent puis simplement filtrée,
 * aucune nouvelle logique d'éligibilité. Utilisé par index.html pour
 * désambiguïser un cadre "placement_multiple" (SecteurService.
 * resoudrePlacementMultipleNeantAdjacent) quand plusieurs secteurs sont à
 * égalité pour le même critère de Population — rétrocompatible (les
 * appelants existants ne passent pas `numeros`, comportement inchangé).
 *
 * 18/08/2026 (retour utilisateur) : fallback de titre par défaut de la
 * popup 'placement_secteur_neant_adjacent' ("Choisir un secteur du
 * Néant", jamais affiché en pratique car l'appelant passe toujours
 * contexte.titre = 'Choisir un secteur') aligné sur ce même libellé, par
 * cohérence. Le retrait du label "Secteur du Néant" au-dessus de la ddl
 * et l'espacement ajouté (.modal-choix-select, session précédente,
 * commentaire ci-dessous) restent inchangés — déjà en place.
 *
 * 18/08/2026 (Simplification UI Événement galactique — suite, retour
 * utilisateur + Cadre 1 générique) :
 * - Popup 'placement_secteur_neant_adjacent' : le label "Secteur du
 *   Néant" au-dessus de la liste déroulante est retiré (redondant avec
 *   le titre "Choisir un secteur") ; la liste gagne une marge basse
 *   (.modal-choix-select) pour ne plus être collée aux boutons Annuler/
 *   Valider.
 * - Même popup généralisée : appelle désormais SecteurService.
 *   obtenirSecteursEligiblesPlacementNeantAdjacent(partieId,
 *   contexte.elements) au lieu de l'ancienne fonction dédiée Défense de
 *   Secteur + Guilde de Scientifiques — `elements` vient de l'appelant
 *   (index.html, cadre.effet.elements) ; le "❗" (dernier emplacement)
 *   est maintenant calculé côté SecteurService (`e.dernierEmplacement`),
 *   qui seul sait quels types d'emplacement ce cadre consomme réellement.
 *   Permet de résoudre le Cadre 1 de l'Événement B Cycle 1 (jeton
 *   Libération + Défense de Secteur) avec ce même contexte, sans nouveau
 *   code ici. secteurService.js (v4), js/gameService.js (v11),
 *   index.html (v30).
 *
 * 18/08/2026 (Simplification UI Événement galactique, points 3/4/6) :
 * - demanderChoix, contexte 'placement_secteur_neant_adjacent' : la
 *   `description` (qui reprenait le texte du cadre, redondant avec la
 *   carte affichée derrière la popup — point 3) n'est plus affichée.
 *   L'option de secteur n'affiche plus que "Secteur N" (le détail des
 *   emplacements libres est retiré — point 4) et gagne un "⚠️" si
 *   l'emplacement Installation OU Guilde restant est le dernier
 *   disponible sur ce secteur.
 * - Nouveau contexte 'resoudre_cadre_evenement' (point 6) : popup
 *   générique pour résoudre un Cadre d'Événement galactique (un seul
 *   effet ou un choix entre plusieurs effets exclusifs) — une option =
 *   un bouton (ou un champ quantité + bouton pour une option
 *   proportionnelle), pas de rappel du texte du cadre. Remplace
 *   l'ancienne popup dédiée 'confirmation' de l'option "Gagner une
 *   technologie" (index.html gère désormais tout via une seule popup,
 *   voir ouvrirPopupCadreEtRafraichir_).
 *
 * 17/08/2026 (Lot F — corrections mineures) :
 * - Focus (joueur ET héroïques, carteFocusJoueurHTML_) : type de Focus
 *   (badge) et numéro de carte (.focus-id) retirés du titre. badgeType_
 *   (devenue inutile) supprimée.
 * - Nouveau : renderFocusHeroiquesJoueur_ (#focus-heroiques-joueur, écran
 *   Focus, voir index.html) — affiche le détail jouable des Focus
 *   héroïques choisis pour le cycle en cours (partie.focusHeroiques),
 *   réutilise carteFocusJoueurHTML_ avec source='heroique'. jouerAction_
 *   généralisée (nouveau paramètre `source`, voir resoudreCarteSource_)
 *   pour lire la carte dans focusJoueur OU focusHeroiques selon l'origine
 *   du clic (data-source sur le bouton ▶).
 * - renderFocusHeroiques_ (écran Plat. Galactique, les <select> de choix) :
 *   détail de carte (badge + actions) retiré — décision utilisateur, le
 *   nom dans le <select> suffit ici, le détail vit désormais sur l'écran
 *   Focus (renderFocusHeroiquesJoueur_ ci-dessus).
 * - renderCubes_ : Inactif/Actif/Déployé compactés sur une seule ligne
 *   (.ligne-cubes, css/style.css), "Cube" affiché une seule fois.
 * - renderPistesCivilisation_ : libellé "Corrompue" -> "COR." (gain de
 *   place). Boutons globaux "Avancer la moins avancée"/"Avancer la piste
 *   Corrompue" retirés du DOM (voir index.html) — liaisons en null-safe,
 *   avancerMoinsAvancee_/avancerCorrompue_ (et les fonctions
 *   CivilisationService qu'elles enveloppent) restent définies pour un
 *   futur pont Focus -> Civilisation.
 *
 * 17/08/2026 (Lot E — réorganisation Focus, bandeau de rappel) :
 * nouveau bandeau permanent #focus-rappel-ressources (écran Focus, voir
 * index.html v17) — renderRappelRessources_ (appelée depuis afficher())
 * affiche les 5 ressources principales + Cube actif en chiffres colorés,
 * réutilisant couleurCout_/abregeCout_ (déjà présentes, pastilles de coût
 * des cartes Focus) plutôt qu'une nouvelle palette. Rafraîchi en direct
 * pour les 5 ressources principales par majRappelRessourceAffiche_,
 * appelée depuis le listener 'input' de #ressources-principales (écran
 * Plat. maison, voir renderRessources_) — même mécanisme que
 * majDeltaAffiche_. Cube actif n'a pas de saisie directe sur cet écran :
 * rafraîchi seulement à chaque afficher(). Écran Focus réorganisé côté
 * index.html (Annuler + journal sous "Actions réalisées", cartes Focus
 * sous "Listes de focus") — aucun changement ici, tout cible toujours les
 * mêmes ids.
 *
 * 17/08/2026 (Lot D — Ressources/Civilisation vers Plat. maison) :
 * aucune fonction de ce fichier n'est modifiée — renderRessources_/
 * renderCubes_/renderGloire_/renderPistesCivilisation_ ciblent toujours
 * les mêmes ids (#ressources-principales, #ressources-jetons,
 * #ressources-gloire, #ressources-cubes, #pistes-civilisation-liste),
 * simplement déplacés de l'écran Stratégie (renommé "Focus") vers l'écran
 * Plat. maison dans index.html (v16) — même principe que le déplacement
 * des Focus héroïques au Lot C ci-dessous (afficher() reste appelée une
 * seule fois par rendu de partie, indépendamment de l'écran visible).
 * Restent ciblés dans l'écran Focus : #ressources-journal (renderJournal_)
 * et #btn-annuler-action/#annulation-compteur (majBoutonAnnuler_,
 * annulerDerniereAction_) — décision utilisateur, hors périmètre d'un
 * déplacement. Titre de fichier/module (strategieService.js /
 * StrategieService) volontairement conservé : aucune autre référence dans
 * le projet ne dépend du nom de l'écran, seul index.html a changé (ids
 * nav-strategie/screen-strategie -> nav-focus/screen-focus).
 *
 * 17/08/2026 (Lot C — restructuration Partie) : renderFocusHeroiques_
 * cible désormais #plateau-galactique-focus-heroiques (au lieu de
 * #strategie-focus-heroiques) — le bloc "Focus héroïques — cycle en
 * cours" quitte l'écran Stratégie pour l'écran Plat. Galactique (voir
 * index.html v15). Aucun autre changement : même fonction, toujours
 * appelée depuis afficher() ci-dessous à chaque rendu de partie, qu'importe
 * l'écran sur lequel vit physiquement son conteneur.
 *
 * 17/08/2026 (Lot 3 — finitions Stratégie, suite à l'audit UI/UX du 17/08,
 * grâce à style.html désormais disponible en Project Knowledge) :
 * - Pistes de Civilisation : affiche les 2 prochaines cases non atteintes
 *   (niveau+1 ET +2) au lieu d'une seule — portage de
 *   texteProchainesCasesHTML_ (strategie-2.html GAS). Structure/classes
 *   alignées sur le legacy (.piste-civilisation-bloc/-item/-label/
 *   -prochaines/-prochaine, liste verticale de lignes horizontales) au
 *   lieu de la grille de 3 cartes carrées (Session 5, écrite sans
 *   référence legacy). Piste au maximum -> plus de message "Piste au
 *   maximum." (retiré, legacy n'affiche simplement rien).
 * - Cartes Focus (joueur) : markup aligné sur carteFocusHTML_ — .card.
 *   focus-card, id de la carte affiché (.focus-id, jamais montré),
 *   actions en 2 colonnes (.focus-action-corps/-side : texte à gauche,
 *   pastilles de coût + bouton rond "▶" à droite) au lieu d'un
 *   empilement vertical avec bouton pleine largeur "Jouer cette action".
 * - pastillesCoutHTML_ : couleurCout_/abregeCout_ ajoutées (portage
 *   direct) — pastilles désormais colorées par ressource et abrégées
 *   comme en legacy (3 caractères depuis RESSOURCES_TOUTES, au lieu de
 *   LIBELLES_OPTIONS tronqué à 12 caractères).
 * Écarts assumés et CONSERVÉS (décision utilisateur, hors périmètre de ce
 * lot) : bouton "Avancer" par piste + les 2 boutons globaux "Avancer la
 * moins avancée"/"Avancer la piste Corrompue" (Session 5, sans équivalent
 * legacy — avancement uniquement via une action Focus côté GAS). Non
 * traité : affichage des Focus héroïques (renderFocusHeroiques_) — pas de
 * gabarit .focus-card équivalent côté legacy à cet endroit (app.html GAS
 * n'affiche qu'un simple menu déroulant, sans détail des actions).
 *
 * 17/08/2026 (Lot 2 — grille de ressources, suite à l'audit UI/UX du même
 * jour) : réécriture de la grille Nourriture/Énergie/Matériel/Crédit/
 * Science, portage fidèle de champRessourceHTML_ (strategie-2.html GAS) —
 * remplace l'affichage lecture seule (.ressource-case) par 6 cellules
 * fixes par ressource (pastille colorée, Niveau de production, →, Revenu,
 * Stock ÉDITABLE, Delta depuis le début du cycle). Ajouts associés :
 * - Niveau de production recalculé depuis les secteurs (population ×
 *   Guildes, + bonus d'origine "bonusProd" éventuel) — portage de
 *   recalculerNiveauxProduction_, fondu dans renderCubes_ (déjà asynchrone,
 *   même lecture de secteurs) plutôt qu'une fonction séparée.
 * - Commerce/Prime/Libération redeviennent éditables (.jeton-champ/
 *   .jeton-input, portage de champJetonHTML_), persistés au 'change'.
 * - Sauvegarde différée (debounce 600 ms) des champs simples, portage de
 *   sauvegarderPlateauMaisonDifferee_.
 * - soldeDebutCycle (baseline du delta) réinitialisé par afficher() quand
 *   partie.id ou partie.cycleActuel change — la PWA n'a pas de modale
 *   "Phase C" (point de reset legacy), c'est le point de reset le plus
 *   proche disponible côté PWA (bouton "Fin du cycle", index.html, qui
 *   rappelle afficher() avec un cycleActuel différent).
 * Décision utilisateur : les boutons "Avancer"/"Avancer la moins avancée"/
 * "Avancer la piste Corrompue" (Session 5, sans équivalent legacy) sont
 * CONSERVÉS — écart assumé, pas une régression à corriger.
 * Aucun fichier CSS legacy disponible pour cet écran (voir audit) : les
 * nouvelles classes CSS (css/style.css) sont une réécriture fidèle au
 * comportement du legacy, pas un copier-coller de règles existantes.
 *
 * 17/08/2026 (Session 14 fin — action secteur "Envahir" portée)
 *
 * 17/08/2026 (Session 14 fin) : nouveau cas contexte.type === 'envahir'
 * dans demanderChoix — portage direct de ouvrirModaleEnvahir_
 * (strategie-2.html GAS, ~l.1931-2170) : sélection de la cible (secteur du
 * Néant/Maison déchue, ou Corrompu selon contexte.corrompu) parmi les
 * secteurs adjacents à l'un des vôtres (calculerCiblesEnvahir_ porté),
 * engagement multi-sources/multi-types avec règle "secteur jamais vide".
 * Résout le combat via CombatService.resoudreInvasion (déjà porté,
 * Session 6) puis persiste via SecteurService.envahirResoudre (déjà
 * porté, Session 12). Portage de VAISSEAU_VERS_CHAMP_COMBAT (nouveau,
 * mapping clé TYPES_VAISSEAU -> nom de champ Combat). Conséquences :
 * jetonPrime/jetonLiberation/influence (victoire) et cubeActif (défaite)
 * relayés en scalaires à focusEngine.js (v4) qui les applique sur l'état
 * pur ; le jeton Gloire (array) est en revanche persisté DIRECTEMENT ici
 * via GameService.majPlateauMaison + etatGloire (même module var que
 * renderGloire_/renderGloireDOM_, Session 10) — même pattern que le clic
 * manuel sur un emplacement Gloire, volontairement hors du flux
 * d'annulation. HORS PÉRIMÈTRE cette session (avertissement journalisé) :
 * défausse d'un jeton Gloire pour un secteur source abandonné (repris par
 * le Néant, jetonsRetires.secteursAbandonnes) — édité manuellement par le
 * joueur pour l'instant ; résolution immédiate des jetons Prime/
 * Libération gagnés (ouvrirModaleResolutionJetons_ côté legacy) non plus
 * portée : ils restent de simples compteurs, comme n'importe quelle autre
 * carte via CLES_SIMPLES — pas de popup de dépense dédiée. Dernière des 3
 * actions secteur "lourdes" de la Session 14 (avec Regrouper et Déployer
 * des cubes).
 *
 * 17/08/2026 (Session 14 suite — action secteur "Déployer des cubes"
 * portée) : nouveau cas contexte.type ===
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

  // 17/08/2026 (Lot 2 — grille de ressources) : couleur ajoutée par
  // ressource (portage direct de RESSOURCES, strategie.html GAS — mêmes
  // valeurs hexadécimales, identité visuelle du plateau physique) ; .champ
  // (jamais lu) retiré au passage.
  var CHAMP_RESSOURCE = {
    nourriture: { label: 'Nourriture', couleur: '#49b867' },
    energie: { label: 'Énergie', couleur: '#f8a21b' },
    materiel: { label: 'Matériel', couleur: '#ec0d69' },
    credit: { label: 'Crédit', couleur: '#d1a671' },
    science: { label: 'Science', couleur: '#06afe5' }
  };
  var RESSOURCES_PRODUCTION = ['nourriture', 'energie', 'materiel', 'credit', 'science'];

  // 17/08/2026 (Lot 3 — finitions Stratégie) : palette complète, portage
  // direct de RESSOURCES (strategie-2.html GAS) — couvre aussi Influence/
  // Commerce/Prime/Libération/Cubes, absents de CHAMP_RESSOURCE (limité
  // aux 5 ressources de la grille "principales", Lot 2). Utilisée
  // uniquement par couleurCout_/abregeCout_ (pastilles de coût des cartes
  // Focus) — ne pas fusionner avec CHAMP_RESSOURCE, portées différentes.
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
  // directe d'une saisie manuelle (portage de CHAMP_DB_RESSOURCE_SIMPLE_,
  // strategie.html GAS — noms de colonnes adaptés au camelCase de
  // gameService.js : CHAMPS_PLATEAU_MAISON_AUTORISES).
  var CHAMP_DB_RESSOURCE_SIMPLE_ = {
    nourriture: 'ressourceNourriture',
    energie: 'ressourceEnergie',
    materiel: 'ressourceMateriel',
    credit: 'ressourceCredit',
    science: 'ressourceScience'
  };

  // Table Niveau -> Production (0 à 13, plafonnée au-delà) — portage direct
  // de PRODUCTION_NEMS/PRODUCTION_CREDIT (strategie.html GAS). Même courbe
  // pour Nourriture/Énergie/Matériel/Science, courbe distincte pour Crédit.
  var PRODUCTION_NEMS = [0, 1, 1, 2, 3, 3, 4, 4, 5, 6, 8, 10, 12, 15];
  var PRODUCTION_CREDIT = [0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 8];

  function calculerProduction_(cle, niveau) {
    niveau = Math.max(0, Math.min(13, Math.floor(Number(niveau) || 0)));
    var table = (cle === 'credit') ? PRODUCTION_CREDIT : PRODUCTION_NEMS;
    return table[niveau];
  }

  // Guilde -> ressource produite (portage direct de GUILDE_VERS_RESSOURCE,
  // strategie.html GAS), clés alignées sur secteurService.js (guildeFermiers
  // etc., déjà camelCase côté store secteursPartie).
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
  // affiché sur chaque ligne (portage de soldeDebutCycle, strategie.html
  // GAS). Réinitialisé par afficher() dès qu'une nouvelle partie s'ouvre ou
  // que le cycle change (voir reinitialiserSoldeDebutCycle_) — la PWA n'a
  // pas de modale "Phase C" (entretien non automatisé), donc pas d'autre
  // point de validation possible pour ce reset.
  var soldeDebutCycle = {};

  function reinitialiserSoldeDebutCycle_(partie) {
    var ressources = (partie.plateauMaison || {}).ressources || {};
    soldeDebutCycle = {};
    RESSOURCES_PRODUCTION.forEach(function (cle) { soldeDebutCycle[cle] = ressources[cle] || 0; });
  }

  // Sauvegarde différée (debounce 600 ms, fusion des champs en attente) —
  // portage direct de sauvegarderPlateauMaisonDifferee_ (strategie.html
  // GAS), pour ne pas écrire à chaque frappe sur un champ ressource/jeton.
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

  // 19/08/2026 (Construire une Installation / Établir une Guilde portées) :
  // mêmes clés que CHAMP_ELEMENT_PLACEMENT_ (secteurService.js) — pour le
  // popup 'construire' (sélection du type), portage direct des libellés
  // déjà utilisés par le formulaire dédié de l'écran Secteurs (index.html,
  // TYPES_INSTALLATION/TYPES_GUILDE), dupliqués ici par convention (même
  // principe que TYPES_VAISSEAU ci-dessus).
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

  // --- Portage direct depuis strategie-2.html GAS, pour le formulaire
  // "Déployer des cubes" (Session 14 suite) ---
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
   * 21/08/2026 (effet "Gagner une Corruption", voir
   * docs-rules-corruption-gardiens-refuges-technoConsume.md §1 — "La carte
   * [Chambres de décontamination] peut accueillir 2 marqueurs (3 si
   * améliorée)") : contrairement à nomsTechnologiesJoueur_ ci-dessus (qui
   * ne renvoie que des noms), cherche l'objet Technologie complet du
   * joueur (départ OU l'un des 5 emplacements obtenus — .amelioree porté
   * par chacun, voir GameService.definirTechnologieAmelioree/
   * definirTechnologieAvanceeAmelioree) pour en déduire la capacité
   * réelle. `null` si le joueur ne possède pas cette Technologie.
   */
  function technologieChambreDecontamination_(partie) {
    var candidats = [];
    if (partie.joueur && partie.joueur.technologieDepart && partie.joueur.technologieDepart.nom) {
      candidats.push(partie.joueur.technologieDepart);
    }
    (partie.technologiesObtenues || []).forEach(function (t) { if (t && t.nom) candidats.push(t); });
    return candidats.filter(function (t) { return (t.nom || '').trim().toLowerCase() === 'chambres de décontamination'; })[0] || null;
  }

  // 21/08/2026 (gain d'Influence variable "N par Guilde/Installation/
  // cube/secteur Pur") : clé Guilde du catalogue ("scientifique_pur",
  // "banquier_pur"...), rencontrée dans le tableau `influence_par_guilde`
  // de focus.json -> champ SecteurService.obtenirAgregatsInfluenceSecteursPurs
  // correspondant (secteurService.js v12, objet `guildesPures`) + libellé
  // affiché dans le détail du calcul (popup 'influence_secteur' ci-dessous).
  var CHAMP_GUILDE_PAR_CLE_INFLUENCE_ = {
    fermier_pur: 'fermiers', ingenieur_pur: 'ingenieurs', mineur_pur: 'mineurs',
    banquier_pur: 'banquiers', scientifique_pur: 'scientifiques'
  };
  var LABEL_GUILDE_INFLUENCE_ = {
    fermiers: 'Fermiers', ingenieurs: 'Ingénieurs', mineurs: 'Mineurs', banquiers: 'Banquiers', scientifiques: 'Scientifiques'
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
   * 21/08/2026 (Événement galactique G, Cycle 1 — Cadre 2 "Le visage du
   * mal", permanent : "chaque fois que vous retirez une Corruption, ...
   * gardez-la dans votre zone de jeu personnelle ... jusqu'à la phase
   * Évaluation") : vrai quand l'Événement choisi pour le CYCLE EN COURS
   * (partie.cycleNum) a le code "G" — seul signal utilisé pour activer
   * `options.conserverCorruptionRetiree` (CivilisationService.
   * definirCorruption, civilisationService.js v5) sur un retrait de
   * Corruption d'une piste de Civilisation. `partie.evenements` peut être
   * absent (partie sans Événement choisi) — repli silencieux sur `false`.
   */
  function evenementConserveCorruptionActif_(partie) {
    var evenementCycle = partie && partie.evenements && partie.evenements['cycle' + partie.cycleNum];
    return !!(evenementCycle && evenementCycle.code === 'G');
  }

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
   * 17/08/2026 (Session 10 — restauration IHM) : Influence n'est plus
   * affichée ici (déménagée sur l'écran Partie, voir index.html
   * App.renderEcranGame_ — comportement legacy app.html/strategie.html).
   * Ligne jetons restaurée à l'identique du legacy : Commerce (compteur =
   * longueur du tableau plateau_maison.jeton_commerce) + Prime +
   * Libération — Cube actif quitte cette ligne pour la nouvelle ligne
   * Cubes (voir renderCubes_).
   */
  /**
   * 17/08/2026 (Lot 2 — grille de ressources) : une ligne = 6 cellules
   * fixes (Libellé | Niveau | → | Revenu | Stock éditable | Delta),
   * portage direct de champRessourceHTML_ (strategie.html GAS). Niveau/
   * Revenu affichent la dernière valeur connue de niveauxProduction (mise
   * à jour de façon asynchrone par recalculerNiveauxEtCubes_ juste après —
   * voir majNiveauxAffiches_, qui corrige les spans "niveau-X" et
   * "revenu-X" sans reconstruire toute la grille).
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
   * 17/08/2026 (Lot E — réorganisation Focus, bandeau de rappel) : bandeau
   * fixe en bas de l'écran Focus (#focus-rappel-ressources, voir
   * index.html v17 et css/style.css), 6 chiffres colorés — les 5
   * ressources principales (Nourriture/Énergie/Matériel/Crédit/Science) +
   * Cube actif. Réutilise couleurCout_/abregeCout_ (déjà définies plus
   * bas, portage des pastilles de coût des cartes Focus) pour rester
   * visuellement cohérent avec le reste de l'écran plutôt que d'introduire
   * une nouvelle palette. Rendu à chaque afficher() ; les 5 ressources
   * principales sont en plus rafraîchies en direct par
   * majRappelRessourceAffiche_ (appelée depuis le listener 'input' de
   * #ressources-principales, écran Plat. maison — voir renderRessources_
   * ci-dessus). Cube actif est également rafraîchi en direct depuis la ligne
   * Cube (saisie directe ou bouton Activer, voir majAffichageCubes_/
   * renderCubes_ plus bas), en plus des actions Focus/Secteurs.
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
   * 17/08/2026 (Lot 2 — grille de ressources) : Commerce/Prime/Libération
   * redeviennent éditables (portage direct de champJetonHTML_, strategie.html
   * GAS — pas de pastille de couleur ni de suivi de delta/niveau pour ces
   * 3 jetons, contrairement à la grille principale). Persisté au 'change'
   * (pas à chaque frappe, comme le legacy). Commerce est stocké en base
   * comme un tableau de jetons 'disponible' (voir schéma jetonCommerce) —
   * la distinction 'programme' n'est pas câblée côté UI, comme en legacy.
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
      // 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
      // TODO.md) : jeton manuel — la mécanique qui AJOUTE une Corruption
      // sur cette case (au lieu d'un secteur/piste/Programme, quand le
      // joueur possède la Technologie "Chambres de décontamination")
      // reste hors périmètre de cette évolution (qui ne porte que le
      // RETRAIT, voir contexte 'retirer_corruption' plus bas) : ce compte
      // reste incrémenté à la main par le joueur, comme Commerce/Prime/
      // Libération ci-dessus. Plafonné à 2 (3 si Technologie améliorée —
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
      // 20/08/2026 (EVOLUTION 5, voir TODO.md) : jeton affiché seulement
      // si le joueur possède la Technologie concernée (sinon aucune
      // pertinence — grille jamais alourdie pour rien, même principe que
      // le reste de cet écran).
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
   * 17/08/2026 (Session 10, étendue Lot 2 — grille de ressources) : ligne
   * Cube inactif/actif/déployé (inchangée) + niveaux de production
   * Nourriture/Énergie/Matériel/Crédit/Science (nouveau — portage direct de
   * recalculerNiveauxProduction_, strategie.html GAS, jusqu'ici hors
   * périmètre). Niveau = somme, sur tous les secteurs de la partie, de
   * (population du secteur × nombre de Guildes de ce type), + 1 sur la
   * ressource nommée par originesMaison.bonusProd le cas échéant (même
   * hypothèse de correspondance Guilde -> Ressource qu'en legacy, non
   * reconfirmée ici). Cube déployé = somme de la Puissance Navale
   * (pnCorvette/Sentinelle/Destroyer/Cuirasse/PorteVaisseau) sur tous les
   * secteurs ; Cube inactif = total fixe − actif − déployé. Asynchrone
   * (lecture des secteurs + du catalogue originesMaison) : rendu séparé de
   * renderRessources_, appelé depuis afficher() sans bloquer le reste de
   * l'écran ; met à jour les spans "niveau-X" et "revenu-X" déjà présents
   * dans la grille (voir majNiveauxAffiches_) plutôt que de la reconstruire.
   * Silencieux en cas d'échec (garde le dernier rendu plutôt que de
   * bloquer l'écran, même logique que le legacy).
   *
   * 17/08/2026 (Lot F — corrections mineures) : les 3 valeurs (Inactif/
   * Actif/Déployé) tiennent désormais sur une seule ligne compacte
   * (.ligne-cubes, voir css/style.css), le mot "Cube" n'apparaît plus
   * qu'une fois au lieu de 3 (une case par valeur auparavant).
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
   * 17/08/2026 (Lot 3 — finitions Stratégie, suite à l'audit UI/UX du
   * 17/08) : structure/classes alignées sur renderPistesCivilisation_ et
   * texteProchainesCasesHTML_ (strategie-2.html GAS, désormais disponible
   * via style.html) — remplace la grille de 3 cartes carrées (Session 5,
   * écrite sans référence legacy) par une liste verticale de lignes
   * horizontales (.piste-civilisation-bloc/-item/-label), et affiche les
   * 2 prochaines cases non atteintes (niveau+1 ET +2, comme en legacy) au
   * lieu d'une seule. Piste au maximum -> aucune case affichée (comme en
   * legacy, sans message de repli — l'ancien "Piste au maximum." est
   * retiré pour coller exactement au comportement legacy).
   * Écart assumé et CONSERVÉ (décision utilisateur) : le bouton "Avancer"
   * par piste (résout l'effet de la case via CivilisationService.
   * avancerPiste) et les 2 boutons globaux "Avancer la moins avancée"/
   * "Avancer la piste Corrompue" (index.html) n'ont pas d'équivalent
   * legacy (avancement uniquement via une action Focus, côté GAS) — pas
   * une régression à corriger.
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

    // 17/08/2026 (Lot F — corrections mineures) : #btn-avancer-corrompue
    // n'est plus dans le DOM (bouton global retiré, voir index.html) —
    // gardé en null-safe plutôt que supprimé, la fonction CivilisationService
    // sous-jacente (avancerPisteCorrompue) reste appelable par un futur
    // pont Focus -> Civilisation (voir avancerCorrompue_ ci-dessous).
    var btnAvancerCorrompue = document.getElementById('btn-avancer-corrompue');
    if (btnAvancerCorrompue) btnAvancerCorrompue.disabled = !PISTES_ORDRE.some(function (p) { return corrompues[p]; });

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
   * niveau+1 et +2, si elles existent) — portage direct de
   * texteProchainesCasesHTML_ (strategie-2.html GAS). `cases` : 7 entrées
   * {case, texte} pour cette piste (index 0 = case 1), issues de
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
   * 17/08/2026 (Lot 3 — finitions Stratégie) : couleurCout_/abregeCout_
   * ajoutées (portage direct, strategie-2.html GAS) — pastillesCoutHTML_
   * n'abrégeait auparavant le libellé des clés non numériques qu'via
   * LIBELLES_OPTIONS (vocabulaire des popups de choix, tronqué à 12
   * caractères), ce qui ne correspondait pas au rendu legacy (abrégé à 3
   * caractères depuis RESSOURCES_TOUTES.label, ou "Choix"/"Cube"/6
   * caractères en repli). Chaque pastille reprend aussi la couleur de la
   * ressource concernée (--couleur-pastille), absente jusqu'ici.
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
   * 17/08/2026 (Lot 3 — finitions Stratégie, suite à l'audit UI/UX du
   * 17/08) : markup aligné sur carteFocusHTML_ (strategie-2.html GAS,
   * désormais disponible via style.html) — .card.focus-card (au lieu de
   * .card seul), actions en 2 colonnes (.focus-action-corps texte à
   * gauche, .focus-action-side pastilles de coût + bouton rond "▶" à
   * droite) au lieu d'un empilement vertical avec bouton pleine largeur
   * "Jouer cette action". Comportement inchangé (coutSuffisant_/
   * focus-action-insuffisant, écoute du clic) — seul le markup change.
   *
   * 17/08/2026 (Lot F — corrections mineures) : type de Focus (badge) et
   * numéro de carte (.focus-id) retirés du titre — décision utilisateur
   * (n'apportaient rien : le type est toujours "Héroïque" sur l'écran
   * Plat. Galactique, jamais montré ici, et le numéro est un identifiant
   * interne au catalogue, pas une info de jeu). Paramètre `source`
   * ajouté (data-source sur le bouton ▶, 'joueur' par défaut) — permet à
   * jouerAction_ de savoir dans quel tableau de la partie relire la carte
   * (partie.focusJoueur ou partie.focusHeroiques[cycle]) : voir
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
   * 17/08/2026 (Lot F — corrections mineures) : affiche, sur l'écran
   * Focus, le détail jouable (actions/coûts) des Focus héroïques choisis
   * pour le cycle en cours (partie.focusHeroiques['cycle' + cycleActuel],
   * choix fait sur l'écran Plat. Galactique — voir renderFocusHeroiques_
   * ci-dessous, désormais réduit à la seule sélection). Réutilise
   * carteFocusJoueurHTML_ telle quelle (même structure de carte que les
   * Focus joueur), avec source='heroique' pour que jouerAction_ relise
   * la bonne carte. #focus-heroiques-joueur (index.html) — masqué si
   * aucun Focus héroïque n'est encore choisi pour ce cycle (état initial
   * ou partie terminée).
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
   * 17/08/2026 (Session 13 — moteur secteurs/cycle branché sur l'IHM) :
   * chaque emplacement gagne un select (portage direct de
   * renderFocusHeroiquesCycleActuel, app-2.html GAS) — remplace
   * l'affichage seul des sessions précédentes (choisirFocusHeroique était
   * hors périmètre jusqu'ici, voir gameService.js). Un Focus héroïque
   * déjà choisi ailleurs (partie.focusHeroiquesPioches) n'apparaît plus
   * dans les options des AUTRES emplacements, sauf celui qui le porte
   * déjà (peut toujours être remis à "— Choisir —" pour le libérer).
   *
   * 17/08/2026 (Lot C — restructuration Partie) : conteneur déplacé de
   * l'écran Stratégie vers l'écran Plat. Galactique —
   * #strategie-focus-heroiques devient #plateau-galactique-focus-
   * heroiques (seul changement de cette fonction, toujours appelée
   * depuis afficher() ci-dessous, qui n'a pas besoin de savoir sur quel
   * écran vit son conteneur).
   *
   * 17/08/2026 (Lot F — corrections mineures) : le détail de la carte
   * (badge type + liste des actions) est retiré d'ici — décision
   * utilisateur, le <select> du nom suffit sur cet écran, le détail
   * jouable est désormais sur l'écran Focus (voir
   * renderFocusHeroiquesJoueur_ ci-dessus, basé sur le même
   * partie.focusHeroiques['cycle' + cycleActuel]). Le type n'est de
   * toute façon jamais utile ici : tous les Focus choisis sur cet écran
   * sont "Héroïque" par construction (FocusService.obtenirNomsPoolHeroique
   * ne liste que ce pool).
   *
   * 18/08/2026 (Réorganisation Plat. Galactique, retour utilisateur) :
   * chaque emplacement passe de <div class="card"><select>...</select>
   * </div> à <div class="techno-obtenue-ligne"><select>...</select>
   * </div> — même gabarit qu'un emplacement "Technologies avancées"
   * juste au-dessus sur cet écran (index.html). .card dessine son propre
   * cadre (fond + bordure) tout comme <select> le fait déjà nativement :
   * en ne contenant plus qu'un select (le badge type + liste d'actions a
   * quitté cet écran au Lot F, voir plus haut), .card ne faisait plus que
   * doubler ce cadre. #plateau-galactique-focus-heroiques n'est donc plus
   * un .card-list côté HTML (index.html) — devenu un conteneur nu.
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
   * 17/08/2026 (Lot F — corrections mineures) : `source` ajouté
   * ('joueur' ou 'heroique') — indique dans quel tableau de la partie
   * relire la carte avant de la jouer (partie.focusJoueur[carteIndex] ou
   * partie.focusHeroiques['cycle' + cycleActuel][carteIndex], ce dernier
   * indexé par emplacement 0/1/2, cohérent avec carteIndex passé par
   * renderFocusHeroiquesJoueur_). FocusEngine.jouerActionEtPersister ne
   * dépend pas de l'origine de la carte (juste carte + action), aucun
   * changement nécessaire côté focusEngine.js.
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
        // 19/08/2026 (retour utilisateur — "Installation et guilde ne sont
        // pas rafraîchit lorsque je clique sur l'onglet secteur") : une
        // action Focus peut écrire directement sur secteursPartie
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
        // 18/08/2026 (Événement galactique A, Cycle 1 — Cadre 2, option
        // Science -> Technologie) : confirmation générique (message +
        // Annuler/Valider), même modale que les autres types de choix —
        // pour une action sans sélection à faire (juste un coût à
        // confirmer avant de débiter, le reste — ici le choix de la
        // Technologie — restant manuel, hors périmètre).
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
          var adjacences = resultats[1] || [];

          var adjacenceMap = {};
          adjacences.forEach(function (a) {
            adjacenceMap[a.numeroA] = adjacenceMap[a.numeroA] || [];
            adjacenceMap[a.numeroA].push(a.numeroB);
            adjacenceMap[a.numeroB] = adjacenceMap[a.numeroB] || [];
            adjacenceMap[a.numeroB].push(a.numeroA);
          });

          function secteurParNumero_(numero) {
            return secteurs.filter(function (s) { return s.numero === numero; })[0];
          }

          function vousAppartientEnvahir_(numero) {
            var s = secteurParNumero_(numero);
            if (!s || (s.pnNeant || 0) > 0) return false;
            return ((s.pnCorvette || 0) + (s.pnSentinelle || 0) + (s.pnDestroyer || 0) + (s.pnCuirasse || 0) + (s.pnPorteVaisseau || 0)) > 0;
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
            var champ = CHAMP_PN_PAR_TYPE_VUE[type];
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
                  var labelType = TYPES_VAISSEAU.filter(function (t) { return t.cle === c.type; })[0].label;
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
                var labelType = TYPES_VAISSEAU.filter(function (t) { return t.cle === c.type; })[0].label;
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
                  // ci-dessus) — hors du flux d'annulation, comme lui. 21/
                  // 08/2026 (correctif — retour utilisateur) : un secteur
                  // pouvant porter PLUSIEURS jetons Gloire (SecteurService.
                  // envahirResoudre renvoie désormais un tableau), chacun
                  // est placé dans un emplacement Gloire libre distinct de
                  // la fiche Maison (au lieu d'un seul jeton auparavant).
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
        // 21/08/2026 (Événement F, Cycle 1, Cadre 1 — "Placez une Guilde
        // et 1 cube du Néant... OU placez un jeton Gloire de valeur 2 et
        // une Défense de Secteur...") : popup pour UNE option d'un cadre
        // "choix" dont chaque option est `type: 'placement'` (avec un
        // `critere` de Population, contexte.option — data/catalogue/
        // evenements.json), PAS un libre choix de secteur comme
        // 'placement_secteur_neant_adjacent' ci-dessous : le secteur est
        // déterminé par la Population des secteurs du Néant adjacents
        // (la plus basse ou la plus élevée selon `critere`), une égalité
        // laissant simplement plusieurs candidats au <select> — même
        // logique de calcul que SecteurService.
        // resoudrePlacementMultipleNeantAdjacent (réutilisée telle
        // quelle, contexte.option enveloppée dans un `placements` à 1
        // entrée, aucune duplication). Si `contexte.option.elements`
        // contient la clé GÉNÉRIQUE "guilde" (type au choix du joueur,
        // voir secteurService.js v10/CHAMP_ELEMENT_PLACEMENT_), un second
        // <select> de type apparaît (TYPES_GUILDE_CONSTRUIRE_, même liste
        // que la popup 'construire' ci-dessous, par cohérence). Ne
        // persiste RIEN ici (contrairement à 'construire'/
        // 'retirer_corruption') : résout juste {numero, type}, comme
        // 'placement_secteur_neant_adjacent' — la revalidation ET
        // l'écriture se font côté GameService.appliquerCadreChoixPlacement
        // (appelé par l'appelant, index.html), qui recalcule les
        // candidats à neuf plutôt que de faire confiance à cette popup.
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
        // 18/08/2026 (Événement galactique A, Cycle 1 — Cadre 1) : choix
        // du secteur du Néant où placer une structure — même gabarit que
        // 'envahir' ci-dessus (secteurs + adjacences chargés via
        // SecteurService, select unique + bouton Valider) mais sans
        // combat : la sélection seule est résolue ici, la persistance
        // (SecteurService.placerElementsNeantAdjacent, revalidée côté
        // service) est déclenchée par l'appelant (index.html,
        // GameService.appliquerCadrePlacement) une fois le choix connu.
        //
        // 18/08/2026 (Simplification UI Événement galactique — Cadre 1
        // générique) : `contexte.elements` (effet.elements du cadre,
        // transmis par l'appelant) remplace l'appel figé à l'ancienne
        // fonction dédiée Défense de Secteur + Guilde de Scientifiques —
        // permet de résoudre n'importe quel cadre "placement" du
        // catalogue (ex. Événement B Cycle 1 Cadre 1 : jeton Libération +
        // Défense de Secteur) avec ce même contexte, sans nouveau code.
        titre.textContent = contexte.titre || 'Choisir un secteur';
        contenu.innerHTML = '<p class="hint">Chargement des secteurs…</p>';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

        // 19/08/2026 (Événement galactique C, Cycle 1 — Cadre 1 "Vestiges
        // du Domineum") : `contexte.numeros`, optionnel — restreint la
        // liste à ces numéros précis (candidats déjà calculés par
        // l'appelant, ex. secteurs à égalité de Population pour
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
        // 19/08/2026 (Construire une Installation / Établir une Guilde
        // portées — retour utilisateur) : popup dédiée pour les clés
        // Focus/Cadre "construire_installation"/"installation"/
        // "etablir_guilde"/"guilde" (voir focusEngine.js) — même gabarit
        // que 'placement_secteur_neant_adjacent' (secteur + ❗ dernier
        // emplacement), avec un second <select> pour le type (au choix du
        // joueur, la règle ne l'impose jamais — docs-rules-secteurs.md
        // §2.3). Réutilise SecteurService.obtenirSecteursEligiblesConstruction/
        // construire, déjà portés (Session 12/13) mais jusqu'ici seulement
        // branchés sur le formulaire dédié de l'écran Secteurs — aucune
        // nouvelle logique métier ici, seulement une seconde façon de les
        // appeler (popup modale, réutilisable depuis Focus ET les Cadres
        // d'Événement galactique). `contexte.categorie` ('installation' ou
        // 'guilde') vient de focusEngine.js. Persiste directement via
        // SecteurService.construire au clic sur Valider (comme regrouper/
        // envahir/deployer_cube) — resolve({ detail }) pour le journal, ou
        // { annule: true } sur Annuler.
        //
        // 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2, retour
        // utilisateur : "etablir un guilde banquier -> idem que etablir
        // une guilde sauf que banquier est preselectionné dans la ddl et
        // en lecture seul") : `contexte.typeForce` optionnel (cle de
        // TYPES_GUILDE_CONSTRUIRE_/TYPES_INSTALLATION_CONSTRUIRE_, voir
        // focusEngine.js TYPE_FORCE_PAR_CLE_CONSTRUIRE_) — restreint le
        // <select> Type à cette seule option et le désactive (`disabled`,
        // valeur toujours lisible via `.value` malgré l'attribut) plutôt
        // que de laisser le joueur choisir librement.
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
        // 19/08/2026 (Événement galactique D, Cycle 1 — Cadre 2, retour
        // utilisateur : "automatiser augmentez une population pure :
        // choisir secteur dans DDL parmi secteur eligible (non
        // corrompu)") : popup dédiée pour la clé Focus/Cadre
        // "augmenter_population_pure" (voir focusEngine.js) — même
        // gabarit minimal que 'placement_secteur_neant_adjacent' (un seul
        // <select> de secteurs, "Secteur N", aucune information
        // supplémentaire répétée). Réutilise SecteurService.
        // obtenirSecteursEligiblesAugmenterPopulationPure/
        // augmenterPopulationPure (secteurService.js v6). Persiste
        // directement via SecteurService.augmenterPopulationPure au clic
        // sur Valider (comme construire ci-dessus) — resolve({ detail })
        // pour le journal, ou { annule: true } sur Annuler.
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

      } else if (contexte.type === 'retirer_corruption') {
        // 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
        // TODO.md) : popup à 2 niveaux — un menu de CIBLES possibles,
        // chacune affichée seulement si réellement éligible :
        // - "Secteur" : au moins un secteur possédé (SecteurService.
        //   obtenirSecteursEligiblesRetraitCorruption, secteurService.js
        //   v8) et Corrompu -> <select>, persiste via SecteurService.
        //   retirerCorruption (déjà existante, inchangée).
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
        // 21/08/2026 (Événement galactique G, Cycle 1, Cadre 2 — voir
        // en-tête de fichier) : options transmises à definirCorruption(...,
        // false) pour les 2 branches "piste" ci-dessous (afficherSousSelectPiste_).
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
        // 21/08/2026 (effet "Gagner une Corruption", voir
        // docs-rules-corruption-gardiens-refuges-technoConsume.md §1) :
        // miroir de 'retirer_corruption' ci-dessus, INVERSÉ — un menu de
        // CIBLES possibles pour PLACER la Corruption gagnée, chacune
        // affichée seulement si réellement éligible :
        // - "Secteur" : un secteur possédé (SecteurService.
        //   obtenirSecteursEligiblesGainCorruption, secteurService.js v11
        //   — possédé, PAS Corrompu, ET pas le Secteur-Mère, immunisé) ->
        //   <select>, persiste via SecteurService.placerCorruption.
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

        // 21/08/2026 (Événement galactique G, Cycle 1, Cadre 1 — voir
        // en-tête de fichier) : place la Corruption sur `piste` puis,
        // quand `contexte.avancerPisteApresPlacement` est vrai (transmis
        // par GameService.appliquerCadreGainCorruption pour ce Cadre
        // précis — jamais pour un gain_corruption Focus générique),
        // enchaîne CivilisationService.avancerPisteSansEffet sur cette
        // même piste ("le joueur doit avancer sur cette piste [en
        // ignorant le bénéfice de la case atteinte]", sauf déjà au
        // maximum — "la case la plus à droite"). Résout le texte de détail
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
        // 21/08/2026 (gain d'Influence variable "N par Guilde/Installation/
        // cube/secteur Pur", voir focusEngine.js v12 — CLES_INFLUENCE_SECTEUR_) :
        // AUCUN choix utilisateur ici (montant entièrement déterminé par
        // l'état du plateau) — calcule via SecteurService.
        // obtenirAgregatsInfluenceSecteursPurs (secteurService.js v12) puis
        // ferme la popup, résout {montant, detail} — même principe que la
        // résolution directe "une seule option" déjà en place ci-dessus
        // (retirer_corruption/gagner_corruption, piste unique). La popup
        // reste néanmoins visible brièvement ("Calcul en cours…", Annuler
        // disponible en cas d'erreur de chargement) : même contrat que
        // toutes les autres entrées de ce fichier (modal.hidden = false
        // inconditionnel en fin de fonction, voir plus bas).
        //
        // contexte.formule = la clé focusEngine.js (une des 9 de
        // CLES_INFLUENCE_SECTEUR_), contexte.valeur = le multiplicateur
        // catalogue (nombre), SAUF pour "influence_par_guilde" où c'est un
        // tableau de clés Guilde (CHAMP_GUILDE_PAR_CLE_INFLUENCE_ ci-dessus,
        // chaque Guilde valant implicitement 1 Influence — pas de
        // multiplicateur numérique pour cette clé précise, vérifié sur
        // tout focus.json).
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
              labels.push(LABEL_GUILDE_INFLUENCE_[champ]);
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
        // 21/08/2026 (correctif — retour utilisateur, Test Événement F
        // Cycle 1 KO : "améliorer un jeton gloire ... je ne vois pas le
        // résultat sur le plateau maison") : focusEngine.js reconnaît
        // désormais la clé "ameliorer_gloire" (v13) mais ne peut pas
        // écrire lui-même le résultat — le jeton Gloire (array) n'est pas
        // suivi par CHAMPS_DIFF_SUIVIS (non diffable par ce moteur au clone
        // JSON, voir focusEngine.js). AUCUN choix utilisateur ici (cible
        // toujours le jeton de plus petite valeur, +1 plafonné à 5) — même
        // principe de résolution déterministe que "influence_secteur"
        // ci-dessus : popup affichée brièvement ("Calcul en cours…"),
        // Annuler disponible en cas d'erreur. Persiste directement via
        // GameService.majPlateauMaison (même pattern que le clic manuel sur
        // un emplacement Gloire, renderGloireDOM_ ci-dessus) puis
        // rafraîchit immédiatement l'affichage Gloire du Plat. maison.
        //
        // 21/08/2026 (correctif — retour utilisateur, suite : "j'ajoute un
        // jeton gloire, je reviens sur plat. maison, j'améliore un jeton
        // gloire, c'est le mauvais jeton qui est amélioré et mon jeton
        // ajouté a disparu ; ça fonctionne si je fais une autre action
        // entre-temps") : lisait `partieAffichee.plateauMaison.gloire`, qui
        // n'est réécrit qu'au prochain StrategieService.afficher() complet
        // — le clic manuel sur un emplacement Gloire (renderGloireDOM_
        // ci-dessus) met à jour `etatGloire` (module var) ET la base
        // IMMÉDIATEMENT, mais PAS `partieAffichee.plateauMaison.gloire`
        // (jamais réassigné par ce clic), qui reste donc périmé tant
        // qu'aucune autre action n'a redéclenché un afficher() complet
        // ("l'autre action" qui faisait fonctionner le cas suivant). Lit
        // désormais `etatGloire` directement — seule source à jour en
        // permanence pour ce champ (même principe que le flux 'envahir'
        // ci-dessus, qui l'utilise déjà pour cette raison).
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
        // 20/08/2026 (EVOLUTION 7 — effet "avancer sur piste de
        // Civilisation" d'Événement galactique/Focus, voir TODO.md) :
        // popup pour les clés focusEngine.js "avancer_civilisation"
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
        // "et/ou", rappel manuel EVOLUTION 4, retirer_corruption EVOLUTION
        // 5, avance_rapide EVOLUTION 6 — déjà tous enchaînés
        // automatiquement par avancerPiste elle-même, aucun code
        // supplémentaire nécessaire ici pour cet enchaînement). Un refus
        // (choix annulé) sur un effet imbriqué N'ANNULE PAS l'avancement
        // de piste déjà acquis (avancerPiste renvoie effetSucces:false
        // SANS jamais rejeter la Promise) — resolve({detail}) couvre donc
        // aussi ce cas, jamais {annule:true} : cette popup n'est
        // annulable qu'AVANT validation (bouton Annuler), pas après.
        titre.textContent = contexte.piste
          ? 'Avancer sur la piste ' + CivilisationService.NOM_PISTE[contexte.piste]
          : 'Avancer sur une piste de Civilisation';
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
              // 20/08/2026 (correctif — retour utilisateur, EVOLUTION 7
              // KO : "le résultat Appliqué (...) est trop verbeux, ne pas
              // mettre le log (case 1 ...) ici") : `resultat.effetJournal`
              // (le détail de l'effet de la nouvelle case — rappel
              // manuel, retirer_corruption, avance_rapide, etc., voir
              // CivilisationService.avancerPiste) N'EST PLUS ajouté ici —
              // seuls le niveau atteint et le texte de la case restent,
              // même format concis que le bouton "Avancer" manuel de
              // l'écran Focus (avancerPiste_ ci-dessus, qui journalise
              // séparément effetJournal dans le journal "Actions
              // réalisées" — jamais dans un statut "✓ Appliqué (...)" de
              // Cadre, bien plus contraint en place).
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
        // 18/08/2026 (Simplification UI Événement galactique, point 6) :
        // popup générique de résolution d'un Cadre d'Événement galactique
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

        // 19/08/2026 (retour utilisateur, principe à garder pour les
        // prochains événements) : une option peut porter un `sousTexte`
        // optionnel (ex. "Choisir la technologie manuellement sur Plat.
        // maison") — rendu en italique, plus petit, sous le libellé
        // principal dans le même bouton (jamais noyé dans `option.label`
        // lui-même, qui reste concis).
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
    // 17/08/2026 (Lot 2 — grille de ressources) : la PWA n'a pas de modale
    // "Phase C" (voir en-tête de soldeDebutCycle) — le passage au cycle
    // suivant (bouton "Fin du cycle", index.html) rappelle afficher() avec
    // le même partie.id mais un cycleActuel différent, seul point de
    // détection disponible ici pour réinitialiser le delta "depuis le
    // début du cycle".
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
    // 21/08/2026 (retour utilisateur — "je ne vois pas le compteur
    // d'influence augmenter dans l'onglet plat. maison") : l'Influence
    // vit sur l'écran "Plat. maison" côté index.html (App.renderPlateauMaison
    // = renderEcranPlateauMaison_, "déménagée" de cet écran depuis la
    // Session 10, voir en-tête ci-dessus) — PAS dans les fonctions
    // render*_ de ce fichier. Tout appelant qui joue une action Focus
    // (jouerAction_ ci-dessous) ou résout un Cadre d'Événement galactique
    // (index.html, ~8 wrappers "…EtRafraichir_") appelle StrategieService.
    // afficher(partie) après persistance, mais AUCUN n'appelait jusqu'ici
    // App.renderPlateauMaison — l'Influence gagnée (gain fixe "influence",
    // ou l'une des formules variables ajoutées cette session, voir
    // focusEngine.js v12) restait donc invisible tant que le joueur ne
    // rechargeait pas la partie (App.ouvrirPartie, seul autre appelant de
    // renderEcranPlateauMaison_, lui l'appelait déjà directement).
    // Centralisé ICI plutôt que dans chaque appelant (mêmes risques d'oubli
    // que celui qui vient d'être corrigé) : idempotent, aucun listener
    // DOM ni écriture déclenchée par renderEcranPlateauMaison_, donc sans
    // risque même appelé deux fois (App.ouvrirPartie le fait déjà avant
    // d'appeler afficher()).
    if (typeof App !== 'undefined' && App.renderPlateauMaison) App.renderPlateauMaison(partie);
    renderRessources_(partie);
    renderRappelRessources_(partie);
    renderCubes_(partie);
    renderGloire_(partie);
    renderPistesCivilisation_(partie);
    renderFocusJoueur_(partie);
    renderFocusHeroiquesJoueur_(partie);
    renderFocusHeroiques_(partie);
    renderJournal_();
    majBoutonAnnuler_(partie.id);
  }

  document.getElementById('btn-annuler-action').addEventListener('click', annulerDerniereAction_);
  // 17/08/2026 (Lot F — corrections mineures) : boutons globaux
  // "Avancer la moins avancée"/"Avancer la piste Corrompue" retirés du
  // DOM (décision utilisateur, voir index.html) — liaisons en null-safe.
  // avancerMoinsAvancee_/avancerCorrompue_ restent définies, prêtes pour
  // un futur appel depuis une action Focus plutôt que depuis un bouton.
  var btnAvancerMoinsAvanceeGlobal = document.getElementById('btn-avancer-moins-avancee');
  if (btnAvancerMoinsAvanceeGlobal) btnAvancerMoinsAvanceeGlobal.addEventListener('click', avancerMoinsAvancee_);
  var btnAvancerCorrompueGlobal = document.getElementById('btn-avancer-corrompue');
  if (btnAvancerCorrompueGlobal) btnAvancerCorrompueGlobal.addEventListener('click', avancerCorrompue_);

  return {
    afficher: afficher,
    demanderChoix: demanderChoix
  };
})();
