# Notes de session — POC rendu hexagonal des secteurs

Version : 20260909.1 — 09/09/2026
Fichier associé : `poc-rendu-secteurs.html` (autonome, HTML/SVG/JS vanilla, sans dépendance)

## À quoi sert ce document

Contexte complet d'une session de travail (claude.ai) où on a construit,
itération par itération, un POC de rendu visuel hexagonal des secteurs du
plateau galactique, en s'appuyant sur des photos de tuiles réelles. Ce
document sert de mémoire pour reprendre ce travail dans Claude Code (sur le
repo `voidfall-companion-pwa`), sans avoir à tout redécouvrir en relisant le
fichier HTML ligne par ligne.

**Ce POC n'est PAS intégré au repo.** Il n'est référencé ni dans
`index.html`, ni dans `service-worker.js` / `FICHIERS_A_METTRE_EN_CACHE`. Il
n'a pas non plus de fichier de test associé (contrairement à la règle
habituelle du projet) puisqu'il ne contient aucune logique métier testable —
uniquement du rendu SVG.

## Objectif du POC

Explorer un rendu hexagonal des secteurs (plateau galactique), inspiré de
l'apparence physique des tuiles du jeu, en vue d'une future vue "plateau"
dans la PWA. Construit de façon conversationnelle : à chaque itération, une
photo de tuile réelle ou d'iconographie officielle a été fournie, et le
rendu a été corrigé/affiné en conséquence.

## Ce qui a été construit

- **Plateau hexagonal** pour le scénario `solo_1` (10 secteurs), avec
  coordonnées axiales (q,r) reconstruites à la main à partir du graphe
  d'adjacence (`scenarioAdjacences.json`), faute de coordonnées existantes
  dans les données du projet.
- **Orientation ajustable** (rotation 60° / miroir horizontal / miroir
  vertical) appliquée à l'ensemble du plateau sans jamais faire pivoter le
  contenu des hexagones. Réglage validé et figé par défaut : Rotation 60° +
  miroir horizontal + miroir vertical (Secteur-Mère en bas à gauche).
- **Rendu détaillé de chaque hexagone standard** : dé de Population (avec
  variante Corrompue), Gardien, cube(s) de Puissance Navale (avec système de
  types de vaisseaux et lettres), 3 emplacements d'Installation (triangles),
  emplacements de Guilde (roues crantées), indicateur de récompenses.
- **Secteur-Mère et Faille** avec un rendu spécifique et un nombre
  d'emplacements différent (piloté par `typesSecteur.json`).
- **Panneau de détail au clic** listant toutes les données brutes du
  secteur, plus les emplacements Installations/Guildes dans l'ordre, plus
  les récompenses en icônes.

## Décisions clés à connaître avant de reprendre

### 1. Emplacements génériques (Installations ET Guildes)

Point clarifié en cours de session, important pour la suite : les
emplacements d'Installation sont **génériques**, exactement comme les
Guildes. N'importe lequel des 3 types (Défense de Secteur / Chantier Naval /
Base Stellaire) peut occuper n'importe quel emplacement, y compris en
double sur un même secteur (ex. 3× Défense de Secteur, démontré sur le
secteur #31). Seule l'**orientation** du triangle (pointe en haut ou en bas)
est fixe et liée à la **position** du slot sur la tuile imprimée, jamais au
type qui l'occupe.

Dans le POC, ces emplacements sont représentés comme des **tableaux
ordonnés, remplis par la gauche par défaut** :
```js
guildesDemo: ["scientifiques", "banquiers", "mineurs"]
installationsDemo: ["defense", "chantier", "base"]
```

⚠️ **Ce sont des données de démonstration** ajoutées à la main dans le
tableau `SECTEURS` du POC. `scenarioSecteurs.json` ne contient aujourd'hui
ni attribution de Guilde par secteur, ni détail des Installations par type
(seul le champ réel `installationDefenseSecteurDepart` existe, un simple
compte 0/1). **Avant tout portage dans l'app**, il faudra décider comment
persister ces tableaux dans le vrai schéma de données (voir "Questions
ouvertes" ci-dessous).

### 2. Types de vaisseaux / cubes de Puissance Navale

Un cube de Puissance Navale empile au maximum **3 vaisseaux d'un même
type**. Au-delà, la quantité se répartit automatiquement sur plusieurs
cubes (ex. 4 → un cube "3" + un cube "1"). Chaque cube affiche sa valeur
directement sur sa face, plus une **lettre de type** :

| Type de vaisseau | Lettre |
|---|---|
| Corvette | (aucune) |
| Sentinelle | S |
| Destroyer | D |
| Cuirassé | C |
| Porte-vaisseau | P |

Démontré sur l'Avant-Poste (secteur #11) avec un cube "3S" et un cube "3D".
Couleur du cube = camp (orange = Puissance du Néant, bleu = joueur — jamais
les deux en même temps sur un même emplacement).

### 3. Mapping icône ↔ donnée (validé au fil des itérations avec photos)

| Icône | Donnée / signification |
|---|---|
| Dé à points bleus | Population (`populationDepart`) |
| Pointes orange courtes autour du dé | Secteur Corrompu (`corrompuDepart`) |
| Buste orange (tête + épaules) | Gardiens (`nombreGardienDepart`, toujours 1 max ⇒ jamais de "×N") |
| Cube isométrique orange | Puissance du Néant (`pnNeantDepart`) |
| Cube isométrique bleu | Puissance du joueur (démo mise en place, Secteur-Mère uniquement) |
| Triangle rose + hexagone doré | Installation Défense de Secteur |
| Triangle vert + clé à molette | Installation Chantier Naval |
| Triangle violet + globe doré | Installation Base Stellaire |
| Roue crantée + symbole coloré | Guilde (5 types : Fermiers, Ingénieurs, Mineurs, Scientifiques, Banquiers) |
| Badge blanc en demi-cercle + valeur | Jeton Gloire (`jetonGloireDepart`) |
| Amas de gemmes rouge/or | Jeton Prime (`jetonPrimeDepart`) |
| Hexagone sombre + ruban doré | Jeton Libération (`jetonLiberationDepart`) |
| Point jaune sous le Gardien | Signale la présence de récompenses (détail au clic) |

Le numéro de secteur et le sous-type (Avant-poste/Maison déchue) ne
s'affichent plus **sur** l'hexagone (trop de bruit visuel) : ils restent
visibles dans le panneau de détail au clic.

populationDepart -> rennomer en population
corrompuDepart -> rennomer en corrompu ou surcharger population avec un paramètre corrompu
BOn en fait enlever le mot Depart a toute les fonctions, les icone concerne le jeu en général, pas uniquement le départ
Cube isométrique bleu -> utilisé pour toute puissance naval du joueur.


### 4. Nombre d'emplacements dépend du type de secteur

Piloté par `typesSecteur.json` (`nombreInstallationMax` / `nombreGuildeMax`),
pas codé en dur dans le rendu :

| Type | Installations | Guildes |
|---|---|---|
| `standard` | 3 | 3 |
| `secteur_mere` | 0 | 2 |
| `faille` | 0 | 0 |

il y a peu etre d'autre type de secteur dans les données catalogue

## Scénario solo_2 "Ultime résistance" (brouillon en cours, 17/09/2026)

Ajouté au POC comme second jeu de données sélectionnable (`SECTEURS_SOLO_2`,
boutons en haut de page). **Transcription non confirmée en totalité — ne
pas porter dans `scenarioSecteurs.json`/`scenarioAdjacences.json` avant
validation finale avec le porteur du projet.**

- Toutes les valeurs de mise en place (Population/Corrompu, PN Néant,
  Défense, Gloire, Prime, Libération, Gardien, 4 types de secteur
  Faille/Ceinture d'Astéroïdes/Genèse/Colonie de Survivants, 1 Maison
  Déchue, 1 Avant-poste) ont été confirmées secteur par secteur en
  conversation à partir d'une photo du plateau et de la page de règles
  (mise en place §3-5).
- L'**adjacence** (17 paires) a aussi été confirmée verbalement, MAIS les
  coordonnées axiales (q,r) qui la matérialisent dans le POC sont une
  reconstruction à la main (comme pour solo_1), validée seulement par un
  script Node vérifiant que les 17 paires + les 3 paires Tempête sont bien
  géométriquement adjacentes — **pas** par une relecture visuelle
  hexagone-par-hexagone avec le porteur du projet. 4 touches géométriques
  incidentes non confirmées existent dans ce placement (secteur-mère↔MD,
  HD↔Ceinture, MD↔Genèse, Colonie↔Maison-Déchue) : probablement sans
  conséquence pour un POC, mais à vérifier avant portage si elles
  comptaient comme adjacences réelles.
- **Tempête du Néant** (3 paires : HC↔Centre, Centre↔Genèse, Faille↔Centre)
  casse l'adjacence de jeu (§1.1 docs-rules-secteurs.md, non automatisé
  dans l'app) — rendu dans le POC comme un trait orange en pointillés
  entre les deux hexagones concernés, mais ces paires sont volontairement
  ABSENTES du graphe d'adjacence utilisé pour la validation ci-dessus.
- Numérotation des secteurs (1 à 12) inventée pour ce POC, aucune
  convention officielle connue (rien dans le code ne dépend du format du
  `numero`, vérifié dans `secteurService.js`).
- Le **mapping icône ↔ donnée a été corrigé** par rapport à la table de la
  section précédente, suite à la page de règles (mise en place §3-5) :
  - Cube isométrique orange + multiplicateur = PN Néant (`pnNeantDepart`),
    **pas** un compte de Gardiens.
  - Buste orange = Gardien (`nombreGardienDepart`, confirmé max 1),
    physiquement placé au BORD du secteur (§3c des règles), pas au milieu.
  - Triangle + hexagone doré = Défense de Secteur (confirmé, inchangé).
  - Un drapeau/bannière remplaçant la valeur de Population = secteur de
    Maison Déchue (`sousType`), **pas** un jeton Libération. Le jeton
    Libération, lui, est un jeton distinct compté normalement (parfois
    2 sur un même secteur dans ce scénario) — cf. `icoJetonLiberation_`.
- **Champs encore manquants pour `scenarios.json`** (`complexite`,
  `nombreSecteurs`, `refuges`) : pas encore demandés au porteur du projet.
- Types de tuile encore non confirmés au niveau symbole imprimé (le "3a"
  des règles) — seuls les 4 types eux-mêmes (Faille/Ceinture/Genèse/
  Colonie) sont confirmés, pas leur icône exacte sur la vraie tuile.
  Reporté volontairement ("on verra après").

## Questions ouvertes (à trancher avant tout portage dans l'app)

1. Où et comment persister les tableaux ordonnés Installations/Guildes
   (aujourd'hui simulés) dans le vrai schéma de données
   (`scenarioSecteurs.json` et/ou IndexedDB via `db.js`) ? A voir ensemble, implique peu etre une refonte de certains choix
2. Étendre les coordonnées (q,r) aux scénarios autres que `solo_1`. Oui, mais pour l'instant un seul scénario décrit, il faudra le faire plus tard
3. Aucune interaction d'écriture n'est implémentée (construire/retirer une
   Installation ou une Guilde) : c'est un rendu en lecture seule.
4. Densité visuelle : sur un hexagone cumulant sous-type + beaucoup
   d'éléments remplis, certains espacements restent tendus sur petit écran.

Comme toujours sur ce projet : lire les fichiers réels avant de coder (ne
jamais supposer leur contenu), et journaliser explicitement tout écart de
périmètre.
