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
