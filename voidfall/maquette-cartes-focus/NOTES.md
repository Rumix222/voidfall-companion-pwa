# Maquette — refonte du design des cartes Focus

Note de travail + inventaire des cas d'interaction actuels, en préparation
d'une refonte du design des cartes Focus (écran Stratégie). **Ceci est une
maquette statique (HTML/CSS/JS minimal, aucun moteur de jeu branché)** —
les pages HTML de ce dossier permettent de comparer visuellement le
design actuel et plusieurs pistes de redesign, à partir des VRAIS styles
de l'app (`css/style.css`, importé tel quel).

## État des lieux (décisions prises en session)

- **Variante A retenue** comme PRINCIPE : toujours le même composant,
  jamais de résolution silencieuse pour une action Focus.
- **Variante B abandonnée** (décision utilisateur) — conservée telle
  quelle dans `variante-b-carte.html` pour référence, non retenue.
- **Variante C ajoutée** : déclinaison du principe de la Variante A,
  pensée mobile/iPhone d'abord (demande explicite : "quelque chose
  d'innovant [...] avec une bonne expérience utilisateur sur iPhone").

## Comment consulter

Ouvrir `index.html` de ce dossier dans un navigateur (double-clic, ou
`python -m http.server` depuis la racine du projet puis
`/maquette-cartes-focus/`). Les pages sont interactives (cliquer sur les
actions/boutons "▶" ouvre vraiment les popups/feuilles/états simulés),
mais rien n'est persisté — c'est une démonstration visuelle, pas l'app.
Pour la Variante C (gestes tactiles), réduire la fenêtre du navigateur à
une largeur de téléphone (ou utiliser les outils développeur en mode
"appareil mobile") donne une bien meilleure idée du rendu réel.

## Pourquoi cette refonte

Le design actuel des cartes Focus (`carteFocusJoueurHTML_`,
`js/strategieService.js`) est fonctionnel mais chaque type d'effet a été
ajouté au fil de l'eau, avec son propre gabarit de popup (title/contenu
variables, parfois pas de popup du tout). Résultat : l'expérience change
beaucoup d'une carte à l'autre sans que ce soit toujours justifié par une
vraie différence de complexité. Objectif de cette maquette : explorer un
gabarit **plus standard/prévisible**, sans perdre la clarté sur les cas
réellement complexes (Regrouper, Envahir...).

Pistes comparées dans ce dossier :

- **Variante A — "Toujours une popup"** (`variante-a-popup.html`,
  **retenue**) : chaque clic sur une action Focus ouvre TOUJOURS une
  popup, avec un gabarit identique quel que soit le type d'effet (section
  Coût, section Effet, Annuler/Valider) — y compris pour les effets
  aujourd'hui résolus sans aucune interaction. Prévisibilité maximale, au
  prix d'un clic supplémentaire même pour les actions triviales.
- **Variante B — "Sélection depuis la carte"** (`variante-b-carte.html`,
  **abandonnée**) : la carte elle-même se dépliait (accordéon) pour
  montrer coût et effet directement dans la liste des Focus, sans quitter
  l'écran — sauf pour les 3 configurateurs multi-étapes (Regrouper/
  Envahir/Déployer un cube), qui restaient en popup dédiée.
- **Variante C — "Feuille d'action"** (`variante-c-feuille.html`,
  **piste actuelle, mobile d'abord**) : reprend le PRINCIPE de la
  Variante A (toujours le même composant) mais remplace la boîte modale
  centrée par une **feuille tactile ancrée en bas** (bottom sheet), le
  patron d'interaction natif iOS pour ce type de contenu (partage,
  Raccourcis, Plans...) :
  - **Hauteur au contenu par défaut** (pas de grand vide pour un message
    d'une ligne comme "Cas A"), extensible en quasi plein écran pour les
    configurateurs (Regrouper) — un SEUL composant s'adapte, au lieu
    d'un gabarit fixe.
  - **Grabber glissable au doigt** + rejet par balayage vers le bas ou
    tap sur le voile — pas besoin d'aller chercher un bouton "Annuler"
    du bout du pouce.
  - **Enchaînements en étapes GLISSÉES dans la même feuille** (puce
    d'étapes + "← Retour") pour les cas D→E (choix inclusif → sélection
    de la cible Corruption) et G (Envahir/Regrouper → configurateur),
    au lieu d'empiler des popups séparées comme aujourd'hui.
  - **Coût réglé au stepper** (deux gros boutons +/- de 44px, norme
    Apple HIG) plutôt qu'un curseur fin peu précis au doigt — barre
    segmentée ressource/Crédit en lecture seule à côté.
  - **Rangées de choix pleine largeur** (min. 44px de haut) au lieu de
    petits ronds radio/carrés checkbox, cible tactile bien plus fiable.

`actuel.html` reconstitue le comportement d'aujourd'hui (gabarits
hétérogènes) comme référence de comparaison — pas une 3ᵉ proposition.

Les 4 pages utilisent les 5 mêmes cartes d'exemple (choisies pour couvrir
tous les cas ci-dessous) afin de comparer à contenu égal.

---

## Inventaire des cas d'interaction actuels

Recensé depuis `js/strategieService.js` (fonction `demanderChoix`, ~27
`contexte.type` distincts) et `js/focusEngine.js` (`resoudreCle_`). Classé
par NATURE d'interaction plutôt que par ordre alphabétique des clés — la
question qui compte pour le redesign est "qu'est-ce que le joueur doit
faire avec sa souris/son doigt", pas le nom interne de la clé JSON.

### A — Résolution automatique, aucune popup

L'effet/coût est appliqué directement au clic sur "▶", sans aucune
interaction supplémentaire — seule une ligne de journal confirme.

- Ressources simples (Nourriture/Énergie/Matériel/Crédit/Science,
  Influence, Prime, Libération) — **tant que la réserve suffit** (sinon →
  cas F, `paiement_ressource`).
- Cube générique (`activer_cube`, `cube`) — agit sur Cube actif.
- Modificateurs silencieux (`sans_benefice_case`, `exclude`,
  `restriction`, `same_sector`, `meme_secteur`, `tie_break`) — no-op,
  jamais visibles du joueur.
- Clé non reconnue par le moteur → repli générique, une ligne de journal
  "à appliquer manuellement" (rappel textuel, aucune action requise côté
  app).

*Exemple carte : n'importe quel coût "1 Crédit" simple.*

### B — Popup informative, sans choix réel (juste Annuler/Valider)

Une popup s'ouvre mais le RÉSULTAT est déjà entièrement déterminé
(calcul pur ou règle "toujours la plus petite valeur") — le joueur ne
fait que confirmer.

- `influence_secteur` — calcul d'Influence depuis les Guildes/secteurs
  Purs, affiché puis appliqué.
- `produire_revenu` — revenu de production actuel affiché puis crédité.
- `ameliorer_gloire` — cible TOUJOURS le jeton Gloire de plus PETITE
  valeur (+1).
- `defausser_gloire` — cible TOUJOURS le jeton Gloire de plus PETITE
  valeur (retiré).

*Exemple carte : Focus Production "Ravitailler" (produire_revenu).*

### C — Popup à choix EXCLUSIF (un seul, boutons de liste)

`choice`/`choix` du catalogue SANS "et/ou" dans le texte imprimé — un
groupe de boutons, un seul cliquable.

- `option_exclusive` (générique — 2 à 3 options la plupart du temps).
- `bonus_commerce` (variante à 6 boutons fixes, catalogue figé).

*Exemple carte : Focus Développement "Harmoniser" ("... ou ...").*

### D — Popup à choix INCLUSIF ("et/ou", cases à cocher)

`choice`/`choix` du catalogue AVEC "et/ou" dans le texte imprimé —
cases à cocher, 0 à N sélections, "Annuler" sur UNE option nichée annule
tout (règle métier stricte : le Coût n'est débité que si l'Effet entier
réussit).

- `options_inclusives`.

*Exemple carte : Focus Conquête "Planifier" ("... et/ou ...").*

### E — Popup de sélection sur liste dynamique (cible calculée)

Le joueur choisit UNE cible (secteur/piste/Programme/type) parmi une
liste calculée en direct depuis l'état de la partie — 0 configuration
libre, juste une sélection (parfois 2 sélections liées : secteur + type).

- `construire` (secteur éligible + type Installation/Guilde).
- `retirer_corruption` / `gagner_corruption` (jusqu'à 4 cibles : Secteur/
  Piste/Programme/Techno).
- `deplacer_corruption` (2 étapes : source puis destination, mêmes
  listes que ci-dessus).
- `gagner_programme` (catalogue filtré par type, offre publique mise en
  évidence).
- `rappeler_cube` / `rappeler_cube_cout` (secteur + type de vaisseau).
- `avancer_civilisation` (piste imposée, au choix, la moins avancée, ou
  — nouveau — égalité "au choix").
- `augmenter_population_pure` (secteur Pur éligible).
- `placement_secteur_neant_adjacent` / `placement_critere` (secteur du
  Néant adjacent, Cadre d'Événement).
- `choisir_emplacement_programme` (parmi 3 emplacements du plateau
  Programme).

*Exemple carte : Focus Héroïque Renfort "Accélérer" (option "Avancer sur
la piste la moins avancée").*

### F — Popup de répartition/paiement de ressource

Le joueur ajuste une RÉPARTITION NUMÉRIQUE plutôt qu'un choix discret.

- `ressource_choix` (choisir N ressources parmi les 5, une à la fois).
- `paiement_ressource` (répartir un coût Nourriture/Énergie/Matériel
  entre la réserve et le Crédit, substitution 1 pour 1 — n'apparaît
  aujourd'hui QUE si la réserve seule ne suffit pas ; c'est justement le
  sujet en discussion : le rendre systématique, cf. Variante A).

*Exemple carte : Focus Héroïque Renfort "Accélérer" (option "+4
ressources au choix"), coût de Focus Conquête "Préparer" (substitution
Crédit).*

### G — Popup de paramétrage MULTI-ÉTAPES (configurateur)

Le joueur construit une LISTE d'actions cumulées (ajouter/retirer),
avec une jauge de progression et des contraintes croisées (adjacence,
stock par secteur, coût par unité) — la seule catégorie où une UI inline
sur la carte serait vraiment difficile à faire tenir.

- `regrouper` (jusqu'à 5 déplacements de Puissance Navale).
- `deployer_cube` (déploiements multiples, cibles/coûts croisés selon le
  mode : libre / par Chantier Naval / Secteur-Mère).
- `envahir` (cible + engagement multi-source + résolution de combat).

*Exemple carte : Focus Conquête "Engager" ("Envahissez ... ou
regroupez").*

### H — Confirmation générique

Un message + Annuler/Valider, pour une action sans sélection à faire
(coût à confirmer, rappel manuel affiché).

- `confirmation` (ex. remplacement d'un Programme en jeu, rappel manuel
  d'un effet non automatisé).

### I — Hors carte Focus (même moteur, déclenché ailleurs)

Pour mémoire — ces `contexte.type` réutilisent les MÊMES popups que
ci-dessus mais ne sont jamais ouverts par un clic sur une carte Focus :
`resoudre_cadre_evenement` (Cadre d'Événement galactique),
`phase_evaluation` (fin de cycle), `utiliser_programme` (Programme en
main, réutilise déjà le gabarit `.focus-action` — voir
`js/strategieService.js`). Un redesign des cartes Focus a donc un effet
de bord naturel sur l'écran Plat. maison (Programmes en main), qui
partage le même gabarit de carte.

---

## Constats sur le design actuel (pourquoi standardiser)

- **Titre de popup incohérent** : parfois le nom de l'action ("Regrouper"),
  parfois une question ("Choisissez une option"), parfois neutre
  ("Payer 3 Matériel").
- **Libellé du bouton Valider incohérent** : "Valider", "Avancer",
  "Déployer (N cube(s))", "Rappeler", "Remplacer"... — pas de convention
  unique.
- **Le texte imprimé de la carte n'est PAS répété dans la popup** — sauf
  exception (`resoudre_cadre_evenement`) — le joueur doit se souvenir de
  ce qu'il a lu sur la carte en dessous.
- **Le coût n'est jamais visible DANS la popup d'effet** — il n'apparaît
  que sur la carte (pastilles), avant l'ouverture ; une fois dans la
  popup, le joueur ne le revoit plus avant de valider.
- **La distinction "aucune interaction" (cas A) vs "popup informative sans
  choix" (cas B) est arbitraire** aux yeux du joueur — rien ne dit
  pourquoi certains effets s'appliquent silencieusement et d'autres
  ouvrent une popup à cliquer.

C'est précisément ce que les variantes A/B tentent de corriger, chacune
avec un compromis différent (cohérence totale vs fluidité de la liste).
