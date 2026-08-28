# EVOLUTION 1 : Travaux de gain de place
✅ Traité (20/08/2026) — index.html/version.js : "✓ Appliqué (...)" abrégé (Pop./Sec./ressources colorées comme Plat. maison, "+1" au lieu de "augmentée de"/"établie sur"), rendu uniquement (aucune donnée persistée modifiée).
Dans les résultats d'un effet d'évènement, après le texte Appliqué ( :
- Abrégé le mot Population en "Pop."
- Abrégé le mot Secteur en "Sec."
- Abrégé les noms des ressources, exemple "Fermiers" -> "Fer." et mettre le nom de la ressources avec sa couleur (visible dans plat. maison)
- Au lieu d'écrire augmenté de 1, écrire "+1"
- Au lieu d'écrire établie sur, écrire "+1"
Exemple avec les textes :
(Population du Secteur 1 augmentée de 1) -> (+1 Pop. Sec. 1)
(Guilde Fermiers établie sur le Secteur 1) -> (+1 Guilde Fer. Sec. 1)

# EVOLUTION 2 : Anomalie mise à jour guilde secteur
✅ Traité (20/08/2026) — secteurService.js : clés Guilde de CHAMP_ELEMENT_PLACEMENT_ passées au singulier (catalogue écrit "guilde_banquier", pas "guilde_banquiers") ; 2 autres cadres touchés par le même bug latent corrigés au passage.
v20260819.19
Suite a résolution de l'effet 1 de l'événement E cycle 1 (placez une guilde et 1 cube néant)
Quand je vais dans l'onglet Secteurs je vois bien l'a jout du cube, mais je ne vois pas la nouvelle guilde

#EVOLUTION 3 : Effet piste civilisation ou focus, Augmentez une population pure
✅ Traité (20/08/2026) — focusEngine.js : clé "augmenter_population" (sans "_pure", utilisée par piste Civilisation et Focus) reconnue au même titre que "augmenter_population_pure" (Événements), même popup de sélection de secteur.
Lorsque une piste civilisation arrive sur l'effet augmentez un population pure,
résoudre l'effet (déjà existant dans évènement, choix secteur dans une popup).
Certaines actions de focus peux aussi entrainer cette effet

#EVOLUTION 4 : Effet piste civilisation, effet manuel
✅ Traité (20/08/2026) — civilisationService.js : popup de rappel (contexte 'confirmation') affichée quand une case de piste retombe sur un effet non automatisé ; journal Focus simplifié pour gagner_technologie/gagner_programme uniquement.
✅ gagner_programme retraité (23/08/2026, chantier Programmes Phase 1+2) — n'est plus un rappel manuel : FocusEngine.resoudreCle_ ouvre désormais une popup dédiée ('gagner_programme', strategieService.js) qui persiste réellement le Programme choisi (GameService.gagnerProgramme) ; le journal Focus affiche le Programme obtenu, plus "programme choisi manuellement". resoudreCaseEtChainerAvanceRapide_ appelant déjà FocusEngine.resoudreEffet, le chemin piste de Civilisation en bénéficie automatiquement, sans code spécifique. gagner_technologie reste inchangé (toujours manuel, hors périmètre de ce lot).
Gagner une techonologie, gagner un programme, et temporairement les effets non implémenté sont a faire manuellement
Lorsqu'un effet a faire manuellement se déclenche suite a l'anvancement d'un piste civilisation, afficher un rappel par exemple dans une popup temporaire
Exemple de texte dans cette popup : "Choisir une technologie manuellement", "Choisir un programme manuellement", "Choisir une technologie de base ou avancé manuellement", "Choisir un programme force manuellement"
Exemple de texte a afficher dans l'historique des actions de l'onglet focus (existant mais à modifier) : "Case 2 - Gouvernement : technologie choisie manuellement", "Case 2 - Gouvernement : programme choisie manuellement", pas besoin ici de rappeler le choix entre techno de base ou avancé, ou le type de programme, ...

#EVOLUTION 5 : Effet retirer une corruption
✅ Traité (20/08/2026) — strategieService.js : popup à 4 cibles (Secteur possédé Corrompu / Piste Corrompue / Programme manuel / Chambres de décontamination, nouveau jeton manuel), chacune affichée seulement si éligible.
implémenter l'effet retirer une corruption, peut arriver d'un événement, de la piste civilisation ou d'un focus
ouvrir une popup pour choisir quelle corruption retirer : 
- soit programme (a appliquer manuellement)
- soit piste civilisation si au moins une est corrompu, puis choisir s'il y en a plusieurs
- soit secteur, choisir le secteur parmi la liste des secteurs corrompus qui nous appartiens (avec un de nos cube de puissance)
- soit technologie chambre de décontamination si on a la techno et qu'il y a au moins une corruption dessus

#EVOLUTION 6 : Effet avance_rapide de piste civilisation
✅ Traité (20/08/2026) — civilisationService.js : incrément supplémentaire automatique de la piste concernée, sans résoudre l'effet de la nouvelle case (une seule mutation empilée pour un Annuler correct).
simplement incrémenter le niveau de la piste civilisation concerné

#EVOLUTION 7 : Effet d'événement : avancer sur piste technologie
✅ Traité (20/08/2026) — strategieService.js : popup avec niveau X/7 + aperçu de la prochaine case (piste au choix ou imposée) ; délègue à CivilisationService.avancerPiste qui gère déjà tout l'enchaînement en cascade des évolutions précédentes. Correctif bonus : oubli EVOLUTION 5 dans la copie index.html de cleFocusEnginePourOptionCadre_/LABEL_OPTION_FOCUSENGINE_.
Si piste non préciséer afficher une popup pour choisir la piste, rappeler ou en est cahque piste x/x et le prochain effet qui sera résolu, et annuler / valider
Si piste précisé : par exemple "Avancer sur la piste Gouvernement", afficher une popup avec le niveau de la piste et l'effet qui sera résolu, et annuler / valider
Lors de la validation appliqué l'effet, attention avancer sur une piste peut entrainer de nouveau un choix pour l'utilisateur, bien gérer l'enchainement des popup et des actions en cascade

#EVOLUTION 8 : Correction données origine maison Belitan
✅ Traité (24/08/2026)
pour "bonusProd": "nourriture" ajouter aussi un bonus de crédit +1

#EVOLUTION 9 : Correction niveau de production
✅ Traité (24/08/2026)
pour le calcul du niveau de production il ne faut pas prendre en compte les secteur qui nous appartiennent pas.
Prendre en compte uniquement ou il y a au moins une puissance naval du joueur (donc pas du néant), exception pour le secteur mere qui nous appartient toujours (seul secteur ou on peu avoir 0 puissance sans le perdre).

#Evolution 10 : Implementer effet Déplacer corruption
✅ Traité (24/08/2026)
Exemple Focus conquête action planifier.
Dans popup permettre de choisir la corruption a déplacer et la destination, rappel des possibilité dans docs-rules-corruption-gardiens-refuges-technoConsume.md

#Evolution 11 : Annulation effet lorsque 2 effets
✅ Traité (24/08/2026)
A vérifier, avant implémentation de evolution 10, j'ai fait l'action planifier, choisi les deux effets, puis sur la popup de choix de programme j'ai fait annuler, le cout de l'action a quand même été débité. SI plusieurs effet il faudrait valider ou annuler tous les effets d'un coup pour éviter ça ?

#Evolution 12 : limite d'utilisation action focus
✅ Traité (24/08/2026)
A gere par cycle, réinitialiser lorsqu'on change de cycle :
- Lorsqu'on fait une action d'un focus, signaler au niveau du titre du focus, que ce focus a été utilisé (trouver un picto qui va bien)
- Si l'action s'est correctement terminée, griser l'action pour qu'elle ne soit pas réutilisable ce cycle. (trouver un design pour différencier action inutilisable car déjà utilisé de inutilisable car pas assez de ressource)
L'annulation de la derniere action rétabli l'utilisabilité de l'action
En fait pour la condition pour mettre le picto sur le focus c'est : au moins une action a été utilisé
Test : faire deux actions d'un focus, annuler la derniere action, le focus a toujours le picto

#Evolution 13 : Focus développement action installer
✅ Traité (24/08/2026) — focusEngine.js/strategieService.js : Coût "rappeler_cube" (8 cartes du catalogue, dont Développement "Installer") : nouveau cas dédié + popup 'rappeler_cube_cout', ne proposant que les secteurs qui ne seraient pas abandonnés (Secteur-Mère à part). Corrige au passage un bug latent (le repli générique "cube" décrémentait cubeActif au lieu de laisser le coût hors périmètre).
Pour le cout : popup qui affiche les secteurs ou l'on possede de la puissance naval (+ de 1 pour les secteur hors secteur mere, car on ne peut pas abandonner un secteur)

#Evolution 14 : affichage augmenter_population (action harmoniser)
✅ Traité (24/08/2026) — strategieService.js : "augmenter_population"/"augmenter_population_pure" ajoutées à LIBELLES_OPTIONS ("Augmenter une population"), affichées dans les popups de choix (ex. Focus Développement "Harmoniser") au lieu de la clé brute.
Afficher "Augmenter une population"

#Evolution 14 : popup action regrouper et envahir
✅ Déjà en place (vérifié 24/08/2026, aucun changement nécessaire) — les 4 points étaient déjà appliqués dans le code actuel (regrouper-btn-ajouter/envahir-btn-ajouter ont déjà margin-top/margin-bottom:10px, et les 2 boutons Valider affichent déjà juste "Valider").
Ajouter un espace apres le bouton "Ajouter ce déplacement"
Renommer le bouton valider en juste "Valider"
Ajouter un espace apres le bouton "Engager cette unité"
Renommer le bouton Lancer l'invasion... en juste "Valider"

#Evolution 15 : Le secteur mere nous appartient
✅ Traité (24/08/2026) — secteurService.js/strategieService.js : `regrouper` traite désormais le Secteur-Mère comme toujours "à vous" (destination valide même à 0 Puissance Navale) et interdit de vider un AUTRE secteur de sa dernière Puissance Navale (règle "hors Secteur-Mère" du livret) — validé côté SecteurService (revalidation avant écriture) ET côté popup (message immédiat). La reprise par le Néant d'un secteur vidé restait déjà correctement scopée à `envahirResoudre` (pas `regrouper`, qui interdit désormais ce cas en amont).
Lors de l'action regrouper il faut proposer le secteur mere meme s'il n'y a pas de puissance naval dessus
Attention a ces regles (cf docs-rules-flottes.md et docs-rules-secteurs.md) :
- Le secteur mere nous appartient meme s'il n'y a plus de pissance naval dessus
- Le secteur mere n'est pas repris par le néant s'il n'y a plus de puissance naval dessus
- Un autre secteur qui nous appartient est automatiquement repris par le neant si on n'a pas de puissance naval dessus (peut arriver lors de l'action envahir)
- On n'a pas le droit de retirer la derniere puissance naval d'un secteur (hors secteur mere) lors d'un regroupement

#Evolution 16 : Perte de puissance naval
✅ Traité (24/08/2026) — strategieService.js/focusEngine.js : popup 'envahir' calcule désormais `cubesPerdus` (unités engagées non survivantes) et le crédite TOUJOURS en Cube actif, pas seulement en défaite comme avant — les pertes lors d'un combat GAGNÉ disparaissaient jusqu'ici du suivi sans jamais revenir en Cube actif (docs-rules-flottes.md §1.5 : subir des Dégâts au Combat = rappeler 1 cube vers la zone active).
Lorsqu'on perd des cubes de puissance naval ces cube revienne dans les cube actif

#Evolution 17 : Action gratuite
✅ Investigué (24/08/2026, aucun changement de code, décision utilisateur) — le catalogue indique bien un coût de 1 Science pour Focus Développement "Harmoniser" (Standard ET Héroïque, focus.json id 6/87) : pas de carte "gratuite" en jeu ici. Reproduit le flux complet (FocusEngine.resoudreAction avec l'Effet "choice" ["augmenter_population","retirer_corruption"]) : dans le cas nominal (option choisie avec une cible éligible), l'action réussit normalement, le coût est bien débité, aucune trace "annulée". Le message "action annulée" n'apparaît QUE si l'option choisie dans le "choice" exclusif ne peut aboutir (ex. aucun secteur Pur éligible pour Augmenter une Population Pure) : la popup correspondante ne propose alors que "Annuler", ce qui bloque toute l'action — comportement voulu de la RÈGLE MÉTIER (le Coût n'est jamais débité si l'Effet échoue), pas un bug. Piste d'amélioration UX identifiée mais non retenue pour l'instant : proposer automatiquement l'autre option d'un choix exclusif quand la première n'a aucune cible éligible (changement plus large, touchant le moteur de choix partagé par de nombreuses cartes Focus) — à reconsidérer si le problème se reproduit avec un scénario précis.
Developpement - Harmoniser n'a aucun cout, dans l'historique des actions elle est noté comme annulée a cause de ça je crois

#Evolution 18 : Annuler la derniere action en semble pas bien fonctionner
✅ Traité (24/08/2026) — refonte complète du moteur d'annulation (voir version.js pour le détail complet) :
- Bouton bloqué sur "Passage en cours" : corrigé (renommé "Annulation en cours…", texte restauré après une annulation réussie — il n'était restauré qu'en cas d'échec avant ce correctif).
- Cause racine du bug (Corruption non redéplacée/Programme non retiré) : de nombreuses popups déléguées (construire, regrouper, envahir, retirer/gagner/déplacer Corruption, augmenter Population, Gloire, gagner un Programme, rappeler un cube, avancer une piste de Civilisation) écrivent DIRECTEMENT en base, hors du diff plateauMaison suivi par la pile — jamais capturées, donc jamais annulées. Corrigé via un mécanisme générique db.js (`demarrerEnregistrement`/`arreterEnregistrement`/`enregistrementActif`) : capture AUTOMATIQUEMENT toute écriture `DB.put()` (n'importe quel store) pendant la résolution d'une action Focus (`FocusEngine.jouerActionEtPersister`) ou Programme en main (`GameService.utiliserProgramme`) — plus besoin de modifier chaque popup individuellement. `AnnulationService` généralise la restauration à ces mutations "ligne complète" en plus du format historique (champ plateauMaison).
- Terminologie du todo respectée : Action = Focus (jouerActionEtPersister) ou Programme en main (utiliserProgramme), seuls les 2 orchestrateurs qui démarrent un enregistrement. Effet d'un Événement galactique : jamais enregistré (aucun `demarrerEnregistrement` autour d'un Cadre), donc jamais tracé ni annulable — conforme à la demande. Un Effet qui échoue APRÈS qu'une popup déléguée ait déjà écrit (ex. "et/ou" partiel) restaure désormais IMMÉDIATEMENT ces écritures (RÈGLE MÉTIER : aucune trace), sans même transiter par la pile.
- `CivilisationService.avancerPiste`/`avancerPisteCorrompue` n'empilent plus leur propre entrée quand elles sont appelées DANS une action déjà enregistrée (évite une 2e entrée de pile pour ce qui doit rester une seule action annulable en un clic).
- Historique visuel ("cadre unique + sous-cadres") : le journal de l'écran Focus groupe désormais chaque action jouée sous un titre, avec ses lignes (Effet/Coût/rappels) en sous-liste indentée.
- Couverture tests : `db_enregistrement_test.js` (mécanisme générique, faux IndexedDB), `gameService_evolution18_undo_test.js` (intégration bout-en-bout via les 2 orchestrateurs, reproduit exactement le scénario "Conquête Planifier" rapporté), tests ajoutés dans `focusEngine.test.js`/`civilisationService_test.js`. Vérifié aussi manuellement dans un vrai navigateur (Playwright) : bouton, groupement du journal, aucune erreur JS.
Exemple :J'ai tenté d'annuler la derniere action COnquete - planifier, la corruption n'a pas été redéplacée. 
Et le bouton affiche toujours "Passage en cours" (renommer en annulation en cours pendant qu'on y est)
Bien architecturer le moteur d'action, enregistrer tous les éléments modifier par l'action pour pouvoir l'annuler.
Peut etre définir les termes employé, Action = Partie d'un focus (ex : planifier), un focus a trois actions.
Effet = ce que permet l'action ou sous partie d'une action (exemple planifier a 2 Effets : effet 1 : Gagnez un programme, effet 2 : déplacez une corruption)
Seul autre action que focus (sauf erreur) c'est action de programme en main.
Effet par contre on en a déclenché, en plus de focus et programme en main, par événement, piste civilisation, technologie..
L'effet d'un evenement n'a pas a etre annulé, car il n'est jamais pas déclenché par une action. il ne faut meme pas le tracer.
Par contre les autres effets, consequence d'une action doivent s'annuler en meme temps qu'on annule l'action.
Pour qua ca soit plus clair dans l'historique d'action, faire un cadre unique pour une action et des sous cadres pour les effets déclenché par cette action.

#Evolution 19 : Implémenter le  gain jeton prime

#Evolution 20 : Implémenter actions immédiate techno restante
✅ Traité (27/08/2026) — 28/28 technologies portées (chantier complet), voir mémoire de session voidfall-technologies-resolution-plan.md pour le détail des 4 tables de traduction (gains simples/choice, deploy fixe Secteur-Mère, cost+effet via la nouvelle FocusEngine.resoudreEffetEtCout, choice avec une alternative en deploy fixe).
