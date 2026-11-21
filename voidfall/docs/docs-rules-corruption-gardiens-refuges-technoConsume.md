# Légende
- ✅ Pris en compte
- ❌ Non pris en compte
- 🚫 À ignorer / Hors périmètre
- 🔍 À vérifier
- ⚠️ Attention
- 💬 Commentaire pour l'application voidfall companion

# 1. CORRUPTION
La Corruption vous inflige des effets négatifs.
Une Population Corrompue ne peut pas évoluer,
une piste de Civilisation Corrompue ne vous rapporte aucun bénéfice, ✅ 💬 CivilisationService.avancerPiste (js/civilisationService.js) : la piste avance quand même, mais aucun effet de case (ni chaînage "avance rapide") n'est résolu si elle est marquée Corrompue au moment de l'avancement — appliqué pour tout appelant (bouton "Avancer" manuel, Focus/Programme, Événement G Cycle 1 Cadre 1).
vous ne pouvez pas évaluer les objectifs d’un Programme Corrompu,
et la plupart des objectifs des Programmes nécessitent des éléments Purs.
Certaines actions se payent en gagnant de la Corruption ;
certains effets de jeu vous permettent de la déplacer ou de la retirer.
Lorsque vous gagnez une Corruption, prenez-la dans la réserve commune puis choisissez une des options suivantes :
- Placez-la dans n’importe lequel de vos secteurs Purs (sauf un secteur immunisé à la Corruption, comme un Secteur-Mère standard). Chaque secteur ne peut accueillir qu’une seule Corruption.
- Placez-la sur l’un de vos trois emplacements de Programme, sauf celui de départ, qui se trouve le plus à gauche. Chaque emplacement de Programme ne peut accueillir qu’une seule Corruption.
- Placez-la sur l’un de vos trois marqueurs de piste de Civilisation. Chaque piste ne peut accueillir qu’une seule Corruption.
- Si vous avez la Technologie des Chambres de Décontamination, vous bénéficiez d’une quatrième option de placement ; cela ne signifie pas pour autant que les Chambres de Décontamination sont Corrompues. La carte peut accueillir 2 marqueurs (3 si améliorée). Voir catalogue.
Si aucune option n’est éligible, vous ne pouvez pas payer le coût requis.
Envahir un secteur Corrompu ne fait pas gagner de la Corruption ; la Corruption reste simplement sur le secteur que vous venez d’envahir.
Déplacer une Corruption revient à déplacer un marqueur placé selon l’une des options données précédement sur un autre emplacement éligible.
Si vous n’avez pas de Corruption, vous ne pouvez pas résoudre cet effet.
Retirer une Corruption revient à remettre dans la réserve un marqueur placé selon l’une des options données précédement.
Si vous n’avez pas de Corruption, vous ne pouvez pas résoudre cet effet.
Certains effets de cartes Événement galactique vous demandent deplacer la Corruption gagnée sur un emplacement bien précis.
Vous ne pouvez en aucun cas placer la Corruption ailleurs. Si vous ne pouvez pas le faire, ignorez l’effet indiqué.
Effet existants : 
- Placez la Corruption gagnée sur l’un de vos secteurs Purs.
- Placez la Corruption gagnée sur votre fiche Maison (sur un marqueur de piste de Civilisation ou sur l’un des emplacements de Programme, sauf celui de gauche).
- Placez la Corruption gagnée sur l’un de vos marqueurs de piste de Civilisation.
- Placez la Corruption gagnée sur l’un de vos emplacements de Programme, sauf celui de gauche.
- Placez une Corruption de la réserve commune sur l’emplacement correspondant au type de Programme indiqué sur le plateau des Programmes (ici, sur le type “Richesse”), rendant de fait cette offre Corrompue.
Cette Corruption ne vous est pas assignée – vous ne pourrez pas la déplacer ou la retirer via une action standard.
En revanche, si vous gagnez un Programme de l’offre ainsi Corrompue, alors vous gagnez aussi la Corruption.
Si l’offre en question était déjà Corrompue, ignorez cette instruction.
# 2. GARDIENS
Les Gardiens peuvent se trouver à plusieurs endroits :
- Au bord d’un secteur (dans ce cas, il est impossible d’interagir avec),
- Sur un secteur Trou de ver (il est impossible d’interagir avec),
- Sur une tuile Secteur, souvent en compagnie de Flottes du Néant,
- Sur le plateau Crise, pour bloquer l’un des emplacements de la rangée militaire ou économique,
- Dans la réserve commune.
Lorsque vous devez placer un Gardien sur un secteur, prenez-le depuis la réserve commune et placez-le sur un secteur du Néant adjacent à l’un de vos secteurs.
Si plusieurs secteurs sont éligibles, choisissez-en un qui n’a pas déjà un Gardien.
S’il n’y a aucun secteur du Néant adjacent ou s’il ne reste plus de Gardiens dans la réserve, ignorez cette instruction.
Lorsque vous devez retirer un Gardien, vous pouvez le faire depuis le plateau Crise ou depuis n’importe quel secteur. Remettez le Gardien à la réserve commune.
# 2.1 PLATEAU Crise
Le plateau Crise affiche deux rangées d’emplacements de cartes :
- La rangée des Crises militaires, en haut,
- Et la rangée des Crises économiques, en bas.
Chaque emplacement peut accueillir soit une Crise, soit un Gardien.
L’emplacement libre le plus à gauche de la rangée militaire (sans Crise ni Gardien) indique la Puissance Navale du Néant à utiliser lors d’une Escarmouche.
L’emplacement libre le plus à gauche de la rangée économique affiche des ressources.
Si vous réussissez à envahir un secteur occupé par un ou plusieurs Gardiens, déplacez tout Gardien de ce secteur vers l’une des rangées de votre choix.
Lorsqu’un Gardien est placé sur une rangée, déplacez tout Gardien ou Crise qui s’y trouvait d’un cran vers la droite.
Si cela force un Gardien ou une Crise à sortir du plateau par la droite, défaussez-le et placez un jeton Catastrophe sur un emplacement Catastrophe du plateau Crise.
Lorsque vous retirez un Gardien d’une rangée, faites glisser les Gardiens et Crises restant(e)s d’un cran vers la gauche pour combler l’espace vacant.
# 3. REFUGES
Chaque Refuge dispose de 2, 3 ou 4 niveaux, que les joueurs peuvent construire. ✅ 💬 Chantier "Refuges" lancé le 14/09/2026 (retour utilisateur) — nombre de tuiles et de niveaux par tuile fixés par le scénario (`data/catalogue/scenarios.json`, champ `refuges`, ex. `[2,2]` pour l'unique scénario `solo_1` à ce jour), lus dynamiquement (GameService.obtenirConfigRefuges) — jamais codés en dur. Section persistante "Refuges" en bas de l'écran Plat. Galactique (index.html/App.renderRefuges_) : une tuile par entrée, ●/○ pour chaque emplacement rempli/vide.
Lorsque vous construisez un niveau de Refuge, vous pouvez placer 1 cube de Puissance Navale inactif sur l’emplacement libre le plus bas d’une tuile Refuge. ✅
Si vous n’avez aucun cube inactif à placer, alors vous pouvez désactiver un cube actif. ✅
Si vous n’avez pas de cube actif, vous pouvez en rappeler un et le désactiver aussitôt. ✅ 💬 GameService.sourcerCubeRefuge_ implémente les 3 branches dans cet ordre exact (inactif dérivé — NB_CUBES_TOTAL moins actif moins déployé sur secteurs moins déjà-sur-Refuge — puis désactivation de `cubeActif`, puis popup 'rappeler_cube_cout' déjà existante comme Coût Focus, qui persiste elle-même via SecteurService.rappelerCube — le cube ne repasse jamais par `cubeActif` dans ce dernier cas).
Vous pouvez immédiatement construire un niveau de Refuge à chaque fois que vous parvenez à accomplir l’un des exploits économiques suivants :
- Vous surproduisez au moins deux fois lors du même tour. Chaque joueur peut placer 1 seul cube inactif lors d’un même tour de cette façon, mais il est possible de le faire à votre propre tour et pendant le tour de quelqu’un d’autre lors d’une même manche. ❌ 💬 aucune notion de "tour"/"manche" suivie par l'appli (Phase Focus non modélisée en tours discrets) — bouton manuel "+1 cube" toujours disponible (section "Refuges" persistante), le joueur juge lui-même la condition remplie sur le plateau physique. Décision actée avec l'utilisateur avant de coder (construire un concept de tour dédié à cette seule règle serait disproportionné).
- Vous atteignez le Niveau 4 de n’importe laquelle de vos pistes de Civilisation. ✅ GameService.pistesNiveau4EligiblesRefuge (pure) détecte `civ<Piste> >= 4` non encore réclamé (flag `refugeNiveau4<Piste>`, un événement UNIQUE par piste — les niveaux ne redescendant jamais) — bouton dédié par piste éligible dans la section "Refuges" persistante.
- Lors de l’étape 2 de la phase Évaluation (Entretien), vous avez un secteur Pur avec 6 Population et au moins trois Guildes. Si vous avez deux secteurs qui remplissent ces conditions, vous pouvez construire deux niveaux lors de chaque Cycle, et ainsi de suite. ✅ Section "Refuges" de la popup "Phase Évaluation" (strategieService.js/texteRefugesPhaseEval_) — recalculée à CHAQUE Cycle (comme les Objectifs galactiques), compte les secteurs Purs éligibles via `agregatsSecteursEval.secteursPurs` déjà chargé, plafonne l'allocation via `evenementCycle.refugeCubesPhaseEval` (remis à 0 à chaque nouveau Cycle).
Lorsque le dernier niveau d’une tuile Refuge a été construit, la tuile est complétée (sinon, elle reste incomplète). ✅
Laissez les cubes de Puissance Navale sur la tuile. Tous les joueurs peuvent immédiatement choisir une récompense différente parmi ces 4 options : ✅ 💬 GameService.appliquerRecompenseRefuge délègue à FocusEngine.resoudreEffet (`{choix:[...]}`, même mécanisme que le mode "exclusif" des Objectifs galactiques Lot 2) — un seul gain résolu au final, aucun risque de persistance partielle.
- Retirer une Corruption, ✅ clé déjà automatisée (retirer_corruption)
- Retirer un Gardien, ✅ nouvelle clé `retirer_gardien` (focusEngine.js/secteurService.js/strategieService.js) — popup listant les secteurs possédés avec au moins 1 Gardien + option "Ailleurs" (bord de secteur/Trou de ver/plateau Crise, jamais suivis en base) toujours proposée, résolution manuelle comme l'option "Programme" de retirer_corruption
- Gagner 3 ressources (quelles qu’elles soient) ✅ clé déjà automatisée (ressource_choix)
- Déployer 2 cubes de Puissance Navale. ✅ clé déjà automatisée (deployer_cube)
Les deux premiers exploits économiques peuvent être atteints lors de la phase Préparation ou Évaluation via certains effets d’Événements galactiques. ❌ 💬 aucun effet de ce type rencontré au catalogue à ce jour (Focus Héroïque "Commandement" propose `construire_refuge_niveau` en choix — hors périmètre de ce chantier, non câblé côté FocusEngine.resoudreCle_, retombe sur le repli générique manuel).
Lorsque vous comptez le nombre de surproductions que vous avez réalisées, considérez la phase Préparation et la phase Évaluation comme deux tours distincts. 🚫 sans objet (déclencheur manuel, voir ci-dessus).
# 4. TECHNOLOGIES CONSUMEES
Certaines Technologies peuvent être consumées ; il s’agit d’une pénalité de Crise représentant la disparition du savoir des Novarques, qui se consume dans l’influence corruptrice du Néant.
Lorsque vous consumez une Technologie de base, choisissez une Technologie du tableau avec de l’Influence, si possible, et placez-la à côté du plateau Crise.
Lorsque vous consumez une Technologie améliorée, prenez la carte la plus à gauche du plateau galactique à la place.
S’il n’y a pas de Technologies sur le plateau galactique ou si la tuile de blocage est toujours là, cette pénalité de Crise ne peut pas être résolue (vous devez donc choisir une autre option pour faire face à la Crise, comme expliqué).
Les cartes Technologie consumées ne sont plus disponibles et rapportent des points d’Influence au Néant à la fin de la partie.