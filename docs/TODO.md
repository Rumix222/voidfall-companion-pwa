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
Pour le cout : popup qui affiche les secteurs ou l'on possede de la puissance naval (+ de 1 pour les secteur hors secteur mere, car on ne peut pas abandonner un secteur)

#Evolution 14 : affichage augmenter_population (action harmoniser)
Afficher "Augmenter une population"

#Evolution 14 : popup action regrouper et envahir
Ajouter un espace apres le bouton "Ajouter ce déplacement"
Renommer le bouton valider en juste "Valider"
Ajouter un espace apres le bouton "Engager cette unité"
Renommer le bouton Lancer l'invasion... en juste "Valider"

#Evolution 15 : Le secteur mere nous appartient
Lors de l'action regrouper il faut proposer le secteur mere meme s'il n'y a pas de puissance naval dessus
Attention a ces regles (cf docs-rules-flottes.md et docs-rules-secteurs.md) :
- Le secteur mere nous appartient meme s'il n'y a plus de pissance naval dessus
- Le secteur mere n'est pas repris par le néant s'il n'y a plus de puissance naval dessus
- Un autre secteur qui nous appartient est automatiquement repris par le neant si on n'a pas de puissance naval dessus (peut arriver lors de l'action envahir)
- On n'a pas le droit de retirer la derniere puissance naval d'un secteur (hors secteur mere) lors d'un regroupement

#Evolution 16 : Perte de puissance naval
Lorsqu'on perd des cubes de puissance naval ces cube revienne dans les cube actif

#Evolution 17 : Action gratuite
Developpement - Harmoniser n'a aucun cout, dans l'historique des actions elle est noté comme annulée a cause de ça je crois

#Evolution 18 : Annuler la derniere action en semble pas bien fonctionner
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
