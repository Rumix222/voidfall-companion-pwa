# EVOLUTION 1 : Travaux de gain de place
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
v20260819.19
Suite a résolution de l'effet 1 de l'événement E cycle 1 (placez une guilde et 1 cube néant)
Quand je vais dans l'onglet Secteurs je vois bien l'a jout du cube, mais je ne vois pas la nouvelle guilde

#EVOLUTION 3 : Effet piste civilisation ou focus, Augmentez une population pure
Lorsque une piste civilisation arrive sur l'effet augmentez un population pure,
résoudre l'effet (déjà existant dans évènement, choix secteur dans une popup).
Certaines actions de focus peux aussi entrainer cette effet

#EVOLUTION 4 : Effet piste civilisation, effet manuel
Gagner une techonologie, gagner un programme, et temporairement les effets non implémenté sont a faire manuellement
Lorsqu'un effet a faire manuellement se déclenche suite a l'anvancement d'un piste civilisation, afficher un rappel par exemple dans une popup temporaire
Exemple de texte dans cette popup : "Choisir une technologie manuellement", "Choisir un programme manuellement", "Choisir une technologie de base ou avancé manuellement", "Choisir un programme force manuellement"
Exemple de texte a afficher dans l'historique des actions de l'onglet focus (existant mais à modifier) : "Case 2 - Gouvernement : technologie choisie manuellement", "Case 2 - Gouvernement : programme choisie manuellement", pas besoin ici de rappeler le choix entre techno de base ou avancé, ou le type de programme, ...

#EVOLUTION 5 : Effet retirer une corruption
implémenter l'effet retirer une corruption, peut arriver d'un événement, de la piste civilisation ou d'un focus
ouvrir une popup pour choisir quelle corruption retirer : 
- soit programme (a appliquer manuellement)
- soit piste civilisation si au moins une est corrompu, puis choisir s'il y en a plusieurs
- soit secteur, choisir le secteur parmi la liste des secteurs corrompus qui nous appartiens (avec un de nos cube de puissance)
- soit technologie chambre de décontamination si on a la techno et qu'il y a au moins une corruption dessus

#EVOLUTION 6 : Effet avance_rapide de piste civilisation
simplement incrémenter le niveau de la piste civilisation concerné

#EVOLUTION 7 : Effet d'événement : avancer sur piste technologie
Si piste non préciséer afficher une popup pour choisir la piste, rappeler ou en est cahque piste x/x et le prochain effet qui sera résolu, et annuler / valider
Si piste précisé : par exemple "Avancer sur la piste Gouvernement", afficher une popup avec le niveau de la piste et l'effet qui sera résolu, et annuler / valider
Lors de la validation appliqué l'effet, attention avancer sur une piste peut entrainer de nouveau un choix pour l'utilisateur, bien gérer l'enchainement des popup et des actions en cascade
