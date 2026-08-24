# Architecture PWA — Voidfall Companion

Document de référence détaillé de l'architecture technique. Pour une lecture
rapide en début de session, voir [`CLAUDE.md`](../CLAUDE.md) à la racine du
repo. Pour les règles du jeu elles-mêmes (ce que l'app doit modéliser), voir
`docs/docs-rules-*.md` (§12).

---

## 0. Vue d'ensemble

- **Aucun framework, aucun build step, aucune dépendance npm au runtime.**
  PWA en JavaScript vanille : une coquille HTML unique (`index.html`), des
  modules `js/*.js` chargés par balises `<script>` classiques (ordre de
  chargement = ordre de déclaration dans `index.html`, voir §1), un seul
  fichier `css/style.css`.
- **Persistance** : IndexedDB (`js/db.js`), aucun backend/API réseau au
  runtime — le catalogue de règles (maisons, technologies, focus,
  événements...) est bundlé en JSON statique sous `data/catalogue/*.json`
  et importé dans IndexedDB au clic sur "Synchroniser le catalogue".
- **Offline-first** : Service Worker cache-first strict (`service-worker.js`,
  voir §8) — l'app fonctionne entièrement hors ligne une fois installée.
- **Langue** : français partout — identifiants de code, commentaires, UI.
  Seules les clés JSON internes des opcodes Coût/Effet (`cout`, `effet`,
  `gain`, `credit`, `science`...) restent en minuscules techniques.
- **Convention modules** : IIFE (`var X = (function () { 'use strict'; ...
  return {...}; })();`), fonctions privées suffixées `_`, fonctions
  publiques exposées telles quelles dans l'objet `return` final. Voir §9
  pour le détail des conventions.
- **Séparation pur / DOM** : quand la logique le justifie, un module "pur"
  (aucun accès DOM, aucun accès IndexedDB direct dans sa logique de calcul)
  est séparé de son écran DOM — modèles : `focusEngine.js` (pur) /
  `strategieService.js` (DOM), `combatService.js` (pur) /
  `combatVueService.js` (DOM). Les modules purs sont les seuls testés par
  `node:test` (§11).
- **Tests** : `node --test` ou `node <fichier>.test.js` directement, zéro
  dépendance npm — chaque test charge les VRAIS fichiers sources via le
  module `vm` de Node, avec une IndexedDB factice en mémoire quand le module
  en dépend.

---

## 1. Structure du repo (racine, servie telle quelle par GitHub Pages)

```
index.html                  # coquille unique : écrans en <section class="screen" hidden>,
                             #   + <script> embarqué (App IIFE + rendus d'écran)
manifest.json                # métadonnées PWA (nom, icônes, display standalone)
service-worker.js            # cache-first strict, liste FICHIERS_A_METTRE_EN_CACHE (§8)
version.js                   # APP_VERSION, source de vérité unique du cache (§8)
css/
  style.css                  # tout le style (§7)
data/
  catalogue/                 # 13 fichiers JSON = catalogue de règles statique (§3)
    maisons.json, technologies.json, focus.json, evenements.json,
    pistesCivilisation.json, programmes.json, scenarios.json,
    scenarioSecteurs.json, scenarioAdjacences.json, scenarioTrousDeVer.json,
    typesSecteur.json, originesMaison.json
docs/
  docs-architecture-pwa.md              # ce document
  docs-rules-cycle-de-jeu.md            # règles : cycles/phases (§12)
  docs-rules-flottes.md                 # règles : flottes/Puissance Navale (§12)
  docs-rules-Influence-et-ressources.md # règles : Influence/ressources (§12)
  docs-rules-secteurs.md                # règles : secteurs/guildes/installations (§12)
js/
  db.js                     # wrapper IndexedDB générique (§2) — AUCUNE logique métier
  catalogueSync.js          # import data/catalogue/*.json -> IndexedDB (lecture seule, tolérant)
  secteurService.js         # plateau des secteurs — mise en place + actions (§4.3)
  focusService.js           # catalogue Focus (mise en place par maison, pool héroïque) (§4.4)
  gameService.js             # cycle de vie de partie — LE module central (§4.2)
  focusEngine.js             # moteur PUR coût/effet des cartes Focus (§4.5)
  annulationService.js      # pile LIFO d'annulation (10 actions/partie) (§4.6)
  civilisationService.js    # avancement des pistes de Civilisation (§4.7)
  combatService.js          # moteur de combat PUR (Envahir/Escarmouche) (§4.8)
  scoreService.js           # fin de partie + historique enrichi (§4.9)
  setupService.js           # écran "Créer une partie" (DOM) (§5.6)
  strategieService.js       # écrans Plat. maison/Focus (DOM) + modale générique (§5.2, §6)
  combatVueService.js       # écran Combat (DOM) (§5.3)
  scoreVueService.js        # écran Fin de partie (DOM) (§5.4)
  historiqueVueService.js   # écran Historique (DOM) (§5.5)
  *.test.js / *_test.js / test_*.js  # tests node:test des modules purs (§11)
icons/
  icon-192.png, icon-512.png
```

**Ordre de chargement** (balises `<script>` de `index.html`, avant le
`</body>`) : `version.js` → `js/db.js` → `js/catalogueSync.js` →
`js/secteurService.js` → `js/focusService.js` → `js/gameService.js` →
`js/focusEngine.js` → `js/annulationService.js` → `js/civilisationService.js`
→ `js/combatService.js` → `js/scoreService.js` → `js/setupService.js` →
`js/strategieService.js` → `js/combatVueService.js` → `js/scoreVueService.js`
→ `js/historiqueVueService.js` → le `<script>` embarqué (`App` + le reste de
`index.html`). Cet ordre reflète les dépendances croisées (voir schéma en fin
de §4) : un module qui appelle `X.foo()` doit être chargé après `X`.

---

## 2. Modèle de données — IndexedDB (`js/db.js`)

Base `voidfallCompanion`, version 2 (`VERSION_BASE`, db.js). `js/db.js` est un
wrapper générique (aucune logique métier) : c'est la **source de vérité du
schéma** — toute nouvelle table doit être ajoutée à `STORES` (db.js:37-94)
avant d'être utilisable.

### 2.1 Stores

| Store | keyPath | Index | Rôle |
|---|---|---|---|
| `parties` | `id` | `archivee`, `dateCreation` | État de partie (mutable) — enregistrement top-level : `id`, `dateCreation`, `archivee`, `scenarioId`, `cycleNum`, `cycleTermine`, `statut`, `etatJson` (blob fourre-tout, voir §2.3) |
| `secteursPartie` | `[partieId, numero]` (composée) | `partieId` | Une ligne par secteur du plateau, par partie (voir shape §2.3) |
| `plateauMaison` | `partieId` | — | Plateau maison du joueur — 1 ligne par partie (ressources, civilisation, technologies, programmes...) |
| `historique` | `id` (autoIncrement) | `partieId`, `dateAction` | Journal d'actions best-effort (jamais bloquant en cas d'échec) |
| `pileAnnulation` | `id` (autoIncrement) | `partieId` | Pile LIFO des mutations Focus annulables |
| `maisons` | `nom` | — | Catalogue : maisons |
| `technologies` | `nom` | — | Catalogue : technologies |
| `focus` | `id` | — | Catalogue : cartes Focus |
| `evenements` | `[code, cycle]` (composée) | — | Catalogue : événements galactiques |
| `pistesCivilisation` | `[type, piste, caseNumero]` (composée) | — | Catalogue : cases des 3 pistes de Civilisation |
| `programmes` | `code` | — | Catalogue : cartes Programme |
| `scenarios` | `id` | — | Catalogue : scénarios |
| `scenarioSecteurs` | `[scenarioId, numero]` (composée) | — | Catalogue : secteurs par scénario (mise en place) |
| `scenarioAdjacences` | `[scenarioId, numeroA, numeroB]` (composée) | — | Catalogue : paires de secteurs adjacents |
| `scenarioTrousDeVer` | `[scenarioId, numeroA, numeroB]` (composée) | — | Catalogue : liaisons trou de ver (actuellement **vide**, voir §13) |
| `typesSecteur` | `id` | — | Catalogue : types de secteur (limites Installation/Guilde) |
| `originesMaison` | `idCarte` | — | Catalogue : cartes Origine (mise en place détaillée par maison) |
| `meta` | `cle` | — | Technique — horodatage/rapport de la dernière synchro catalogue |

### 2.2 API de `js/db.js` (`return`, db.js:238-247)

| Fonction | Paramètres | Description |
|---|---|---|
| `ouvrir` | — | Ouvre/retourne la connexion partagée (créée au 1er appel, mise en cache) |
| `get` | `(nomStore, cle)` | Lecture d'un enregistrement par clé (simple ou composée) ; `null` si absent |
| `getAll` | `(nomStore)` | Tous les enregistrements d'un store |
| `put` | `(nomStore, valeur)` | Création/mise à jour d'un seul enregistrement |
| `putTout` | `(nomStore, valeurs)` | Écrasement complet d'un store en une transaction (clear + réinsertion) — utilisé par `catalogueSync.js` |
| `supprimer` | `(nomStore, cle)` | Suppression d'un enregistrement (idempotent) |
| `vider` | `(nomStore)` | Vide entièrement un store |
| `NOMS_STORES` | (constante) | `Object.keys(STORES)` |
| `demarrerEnregistrement` | — | **EVOLUTION 18** (todo.md). Démarre un enregistrement générique : toute écriture `put()` suivante (quel que soit le store, sauf `pileAnnulation`/`parties`/`historique`) est capturée automatiquement `{store, cle, avant, apres}` — un seul couple avant/après par ligne touchée (1er avant, dernier après), même si elle est réécrite plusieurs fois. Appelé UNIQUEMENT par `FocusEngine.jouerActionEtPersister`/`GameService.utiliserProgramme` — jamais par la résolution d'un Cadre d'Événement galactique (effet d'Événement volontairement non traçable) |
| `arreterEnregistrement` | — | Arrête l'enregistrement en cours et retourne les mutations capturées (`[]` si aucun enregistrement actif) — prêt à passer tel quel à `AnnulationService.empiler`/`restaurerMutations` |
| `enregistrementActif` | — | Vrai si un enregistrement est en cours — consommé par `CivilisationService.avancerPiste` pour savoir si elle doit empiler sa propre entrée (usage autonome) ou laisser ses mutations remonter dans l'enregistrement ambiant (appelée depuis une action Focus/Programme déjà suivie) |

### 2.3 Data shapes clés

**Objet "partie" assemblé** (`GameService.assemblerPartie_`, fusion de
`parties` + `plateauMaison`) :
```
{
  id, dateCreation, archivee, scenarioId, cycleNum, cycleTermine,
  cycleActuel,              // dérivé : cycleTermine ? 'termine' : cycleNum — JAMAIS stocké
  civilisation: { societe, gouvernement, economie,
                  corrompues: { societe, gouvernement, economie } },
  technologiesObtenues, technologiesAvanceesChoisies, technologiesAvanceesAmeliorees,
  joueur: { ..., technologieDepart: { nom, type, amelioree } },
  plateauMaison: { ressources: { nourriture, energie, materiel, credit, science, influence },
                   cubeActif, jetonPrime, jetonLiberation, jetonCommerce, gloire,
                   programmesEnMain: [String],       // gagnés, pas encore joués — non borné
                   programmesUtilises: [4],           // plateau Programme, voir §4.2
                   offresProgramme: [4] },  // [{type, nom, corrompu}] — offre publique, voir §4.2
  // -- tout ce qui suit vient du blob etatJson --
  adversaires, evenements: { cycle1, cycle2, cycle3 },  // événement formaté ou null,
                                                          // + cadresAppliques ajouté dynamiquement
  technologiesAcquises, focusJoueur,
  focusHeroiques: { cycle1, cycle2, cycle3 },           // chacun [null,null,null]
  focusHeroiquesPioches,
  finDePartie, terminee                                  // ajoutés par scoreService.js en fin de partie
}
```

**`plateauMaison` (record IndexedDB)** : `partieId`, `technologieDepart`,
`technologieDepartAmelioree`, `ressourceNourriture/Energie/Materiel/Credit/
Science`, `influence`, `cubeActif`, `jetonPrime`, `jetonLiberation`,
`jetonCommerce` (array), `gloire` (array `[2,null,null,null,null]`),
`civSociete/Gouvernement/Economie`, `civCorrompueSociete/Gouvernement/
Economie` (bool), `programmesEnMain` (array de noms de Programme, non
borné — gagnés via `GameService.gagnerProgramme`, pas encore joués),
`programmesUtilises` (array de 4 — plateau Programme de la fiche Maison ;
index 0 réservé au Programme de départ, `{code, entretienActif:true,
corrompu:false, depart:true}` (identifié par `code`, PAS de `nom`, voir
`data/catalogue/programmesDepart.json` ci-dessous) déterminé à la création
de partie par `GameService.creerPartie`/`obtenirProgrammeDepart_` (maison +
technologie de départ), `null` si aucune correspondance catalogue (repli
tolérant, comme `originesMaison`) ; index 1-3, `null` ou `{nom,
entretienActif, corrompu}`, remplis via `GameService.utiliserProgramme` —
`programme1-4`, Phase 2, abandonné sans migration), `offresProgramme`
(array de 4 `{type, nom, corrompu}`, un par type Domination/Force/Soutien/
Richesse — offre publique, Plat. Galactique, voir §4.2), `technologiesObtenues`
(array de 5, objets ou null), `technologiesAvanceesChoisies` (array de 4),
`technologiesAvanceesAmeliorees` (map `{nom: bool}`).

**Ligne `secteursPartie`** : `{partieId, numero, maisonAssociee, population,
corrompu (bool), nombreGardien, guildeFermiers/Ingenieurs/Mineurs/Banquiers/
Scientifiques, installationChantierNaval/DefenseSecteur/BaseStellaire,
pnNeant, pnCorvette/Sentinelle/Destroyer/Cuirasse/PorteVaisseau, jetonPrime,
jetonGloire, jetonLiberation}`.

**Entrée `pileAnnulation`** : `{id (autoIncrement), partieId, dateAction,
source (string), mutations: [{champ, avant, apres}]}`.

---

## 3. Catalogue statique (`data/catalogue/*.json`)

Importé par `js/catalogueSync.js` (`CatalogueSync.synchroniser`) : les 12
fichiers sont lus (`fetch`) et écrasent en bloc (`DB.putTout`, jamais fusionné)
le store IndexedDB correspondant, en parallèle et de façon tolérante (l'échec
d'un fichier ne bloque pas les autres). Ce mapping fichier→store est défini
dans `catalogueSync.js:31-44` (`TABLES`).

| Fichier | Store | Entrées | Concept |
|---|---|---|---|
| `maisons.json` | `maisons` | 14 | Les 14 maisons jouables — technologies de départ, contenu fixe du Secteur-Mère/Maison déchue |
| `technologies.json` | `technologies` | 28 | Cartes Technologie (effet `permanent`/`immediat`/`ameliore`, chacun un opcode JSON) |
| `focus.json` | `focus` | 111 | Cartes Focus (Standard/Héroïque/maison), 1 `cout` + 1 `effet` par action — consommées par `focusEngine.js` |
| `evenements.json` | `evenements` | 30 | Événements galactiques — voir détail §3.1 |
| `pistesCivilisation.json` | `pistesCivilisation` | 231 | Chaque case des 3 pistes (Société/Gouvernement/Économie), Standard + variantes par maison |
| `programmes.json` | `programmes` | 32 | Cartes Programme (objectifs de score de fin de partie) |
| `scenarios.json` | `scenarios` | 1 | Scénario(s) solo disponibles (seul `solo_1` a de vraies données) |
| `scenarioSecteurs.json` | `scenarioSecteurs` | 10 | Mise en place du plateau par scénario (1 ligne/secteur) |
| `scenarioAdjacences.json` | `scenarioAdjacences` | 18 | Graphe d'adjacence des secteurs par scénario |
| `scenarioTrousDeVer.json` | `scenarioTrousDeVer` | 0 | Liaisons trou de ver — **vide**, aucun scénario du catalogue n'en utilise actuellement |
| `typesSecteur.json` | `typesSecteur` | 13 | Types de secteur spéciaux (limites Installation/Guilde, effet) |
| `originesMaison.json` | `originesMaison` | 28 | Cartes Origine (2 par maison) — mise en place détaillée ressources/flotte/civilisation |
| `programmesDepart.json` | `programmesDepart` | 30 | Programmes de départ (1 par Origine A/B, +2 "supplémentaires" pour Marqualos, exclus de l'auto-placement) — identifiés par `maison`+`origine`/`code`, PAS de `nom` ni de `type` (Domination/Force/Soutien/Richesse) : ces Programmes n'en ont pas, contrairement aux 32 cartes de `programmes.json` (confirmé par l'utilisateur). Les 30 entrées sont confirmées par image du livret (champ `incertain`, toujours `false` à ce jour). Câblé sur l'emplacement 0 du plateau Programme (Plat. maison) : `GameService.creerPartie` cherche l'entrée maison+technologie de départ via `obtenirProgrammeDepart_` et la place dans `programmesUtilises[0]` |

### 3.1 `evenements.json` — structure détaillée

Chaque ligne : `{code, cycle, nom, manches, cadres: [...], objectifs: {blocs: [...]}}`
(clé composée IndexedDB `[code, cycle]` — une même lettre d'événement revient
une fois par cycle avec un contenu différent).

**`cadres[]`** (moitié gauche de la carte, résolue en Phase Préparation,
§1.5 de `docs-rules-cycle-de-jeu.md`) : `{ordre, obligatoire (bool — bordure
pleine/pointillée), resolution (string|null — 'par_joueur'/'collectif'/
'unique'/'permanent'/'retardement'), texte, effet}`.

`effet.type` rencontrés dans le catalogue :

- **`"placement"`** — pose des éléments dans une zone ciblée :
  `{type:"placement", zone:"secteur_neant_adjacent", elements:{defense_secteur:1, guilde_scientifique:1}}`.
  C'est le type automatisé pour l'Événement A/Cycle 1/Cadre 1 (voir §5.2,
  `contexte.type === 'placement_secteur_neant_adjacent'`).
- **`"choix"`** — liste d'options exclusives :
  `{type:"choix", mode:"exclusif", options:[{cout:{science:1}, gain:{technologie_base:1}}, {gain:{credit:3}}]}`.
  Une option purement "ressources simples" (voir `RESSOURCES_SIMPLES_CADRE`,
  §4.2) est auto-résolue par `GameService.actionsSimplesCadre` ; l'option
  Science→Technologie (Événement A/Cycle 1/Cadre 2) n'est PAS purement
  simple (le gain `technologie_base` ne l'est pas) — seul son coût est
  automatisé via un bouton dédié (`.btn-cadre-technologie`, §5.2).
- **`"echange"`** — coût contre gain, 3 sous-formes : proportionnel/plafonné
  (`mode:"proportionnel"`, ex. Science→Crédit jusqu'à un plafond), coût
  unique → gains groupés (`gain.mode:"groupe"`, `gain.gains:[...]`, souvent
  `cible:"meme_secteur_que_le_cout"`), ou 1:1 simple. Variante
  `"echange_collectif"` : coût partagé entre joueurs (`partage_entre_joueurs:
  true`, `cout_total`).
- **`"gain"`** — grant inconditionnel : `{type:"gain", cible, cible_detail?,
  elements:{...}, repli?:{...}}` (le `repli` est une cible alternative si la
  cible principale est pleine/indisponible).

**`objectifs.blocs[]`** (moitié droite, évaluée en Phase Évaluation §3.3,
affichage seul — jamais résolue automatiquement) :
`{blocs: [{separateur_avant?: "OU", lignes: [{type:"exploit"|"multiplicateur"|"formule",
texte, condition?, recompense:{mode:"libre"|"unique"|"exclusif_repete",
repetitions?, gains:[...]}}]}]}`. `separateur_avant:"OU"` marque un bloc
alternatif au précédent (§3.3 du rulebook).

---

## 4. Couche moteur / services (`js/*.js` hors écrans)

### 4.1 `js/catalogueSync.js`

**Rôle** : importe les 13 fichiers `data/catalogue/*.json` vers IndexedDB, en
écrasement complet à chaque synchronisation. Pas pur (fetch réseau + DB), mais
fonctionne offline dès que les JSON sont mis en cache par le Service Worker.

| Fonction | Paramètres | Description |
|---|---|---|
| `synchroniser` | — | Synchronise les 12 tables en parallèle, tolérant, écrit `meta.catalogueVersion`, retourne `[{table, statut, nombre?\|message?}]` |

### 4.2 `js/gameService.js` — module central

**Rôle** : cycle de vie complet d'une partie — création, lecture, listing,
sauvegarde, archivage, suppression, mise à jour du plateau maison/civilisation,
choix d'événements galactiques et résolution de leurs Cadres, cycles, Focus
héroïques, technologies (obtenues et avancées). Assemble l'objet "partie"
(§2.3) depuis 2 records IndexedDB. Pas pur (IndexedDB direct partout), sauf
les fonctions marquées **Pure** ci-dessous. Dépend en tolérant
(`typeof X !== 'undefined'`) de `SecteurService` et `FocusService`.

| Fonction | Paramètres | Description |
|---|---|---|
| `obtenirMaisonsCatalogue` | — | Jointure maisons+technologies → `[{nom, complexite, technologies: [{nom, type, texte, texteAmeliore}]}]` |
| `cleFocusEnginePourOptionCadre` | `(option)` | Clé `focusEngine.js` correspondant à une option de Cadre "choix" (source de vérité unique, lue à la fois pour savoir si un bouton d'option est cliquable et pour résoudre le choix) |
| `creerPartie` | `(options)` | Crée une partie (tirage/choix maison+adversaires, origine, civilisation/ressources départ, Programme de départ → `programmesUtilises[0]`, mise en place Focus via `FocusService`, instanciation secteurs via `SecteurService`) |
| `obtenirPartie` | `(id)` | Une partie assemblée, ou `null` |
| `listerParties` | — | Toutes les parties, triées `dateCreation` décroissant |
| `sauvegarderPartie` | `(partie, action, details)` | Persiste une partie complète + ligne d'historique |
| `archiverPartie` | `(id, archivee)` | Bascule/fixe le flag `archivee` |
| `supprimerPartie` | `(id)` | Suppression définitive (plateauMaison + secteursPartie + parties) |
| `supprimerToutesPartiesNonArchivees` | — | Suppression en masse, retourne le nombre supprimé |
| `majPlateauMaison` | `(partieId, champs)` | MàJ partielle liste-blanche (`CHAMPS_PLATEAU_MAISON_AUTORISES`) |
| `majCivilisation` | `(partieId, champs)` | MàJ partielle liste-blanche des 6 champs Civilisation |
| `getEvenementsParCycle` | — | Catalogue événements, groupé `{cycle1,cycle2,cycle3}` |
| `choisirEvenement` | `(partieId, cycle, nomEvenement)` | Enregistre l'événement choisi pour un cycle |
| `actionsSimplesCadre` | `(cadre)` | **Pure.** Actions "1 clic" applicables (deltas 5-ressources-simples uniquement) |
| `appliquerCadreEffet` | `(partieId, cycle, ordreCadre, delta)` | Applique un delta ressources "1 clic", marque le cadre résolu (anti-double-application) |
| `appliquerCadreManuel` | `(partieId, cycle, ordreCadre)` | Marque un cadre "gain" résolu manuellement, aucun delta appliqué |
| `appliquerCadrePlacement` | `(partieId, cycle, ordreCadre, numeroSecteur)` | Cadre type "placement" (1 secteur, éléments fixes du catalogue) → délègue à `SecteurService.placerElementsNeantAdjacent`, marque résolu |
| `appliquerCadrePlacementMultiple` | `(partieId, cycle, ordreCadre, ciblesParGroupe)` | Cadre type "placement" à plusieurs groupes de secteurs simultanés → délègue à `SecteurService.appliquerPlacementMultipleNeantAdjacent` |
| `appliquerCadreChoixPlacement` | `(partieId, cycle, ordreCadre, indexOption, numeroSecteur, typeGuildeChoisi)` | Cadre "choix" dont une option résout un placement |
| `appliquerCadreChoixManuel` | `(partieId, cycle, ordreCadre, indexOption, resume)` | Cadre "choix" dont une option se résout manuellement (aucun delta automatisable) |
| `appliquerCadreChoixFocusEngine` | `(partieId, cycle, ordreCadre, indexOption, demanderChoix)` | Cadre "choix" dont une option délègue à `FocusEngine.resoudreEffet` (ex. activer/déployer un cube) — seule source de vérité pour cette mécanique, qu'elle soit déclenchée depuis Focus ou un Cadre |
| `cadreGainCorruptionAutomatisable` | `(cadre)` | **Pure.** Détecte si un cadre "gain" de Corruption est résolvable automatiquement |
| `appliquerCadreGainCorruption` | `(partieId, cycle, ordreCadre, demanderChoix)` | Applique un cadre "gain" de Corruption sur une piste de Civilisation |
| `appliquerCadreChoixCorruptionGloire` | `(partieId, cycle, ordreCadre, indexOption, demanderChoix)` | Option "choix" au gabarit `{gain:{corruption:1,gloire:1}}` (Événement H Cycle 1 Cadre 1, seul cas connu) — ouvre 'gagner_corruption' (4 cibles ouvertes) puis ajoute un jeton Gloire valeur 1 au premier emplacement libre de `plateauMaison.gloire` |
| `appliquerCadreChoixRappelCube` | `(partieId, cycle, ordreCadre, indexOption, demanderChoix)` | Option "choix" au gabarit `{recall:{cube:1}}` (Événement H Cycle 1 Cadre 1) — ouvre 'rappeler_cube' (secteur + type de vaisseau), qui persiste elle-même via `SecteurService.rappelerCube` |
| `definirTechnologieAmelioree` | `(partieId, cible, amelioree)` | Marque une techno possédée (`'depart'` ou slot 0-4) améliorée/non |
| `avancerCycle` | `(partieId)` | Avance `cycleNum`/`cycleTermine` (1→2→3→'termine'), amorce les Focus héroïques du nouveau cycle |
| `choisirFocusHeroique` | `(partieId, cycle, slot, nom)` | Enregistre/retire un Focus héroïque (slot 0-2), unicité via `focusHeroiquesPioches`, **pas** d'entrée d'historique |
| `choisirTechnologieObtenue` | `(partieId, slot, nomTechnologie)` | Technologie obtenue (slot 0-4), parmi les 8 des maisons déchues |
| `choisirTechnologieAvancee` | `(partieId, slot, nomTechnologie)` | Une des 4 Technologies avancées (slot 0-3), cycle 1 uniquement, rejette les doublons |
| `obtenirTechnologiesAvanceesGroupes` | `(partie)` | **Pure.** `{toutes, groupeA, groupeB, actif}` — `actif` = noms améliorables au cycle en cours |
| `gagnerProgramme` | `(partieId, nomProgramme)` | Ajoute `nomProgramme` à `programmesEnMain` (non borné, rejette si déjà en main ou déjà dans `programmesUtilises`) ; réinitialise l'entrée `offresProgramme` correspondante si `nomProgramme` en faisait partie. Appelée directement par la popup `'gagner_programme'` (strategieService.js), même principe que `SecteurService.placerCorruption` — aucun historique/rechargement ici |
| `utiliserProgramme` | `(partieId, nomProgramme, demanderChoix)` | Résout l'action gratuite du Programme (`EFFET_PROGRAMME_PAR_TYPE_`, table fixe par type) via `FocusEngine.resoudreEffet` (`cout` toujours vide) puis, si l'action va au bout, déplace la carte de `programmesEnMain` vers `programmesUtilises` (emplacements 1-3 uniquement) — conflit de type → confirmation, 3 emplacements pleins → popup dédiée, refus → reste en main. Décrémente `corruptionMaison` si l'emplacement remplacé était Corrompu. Appelée par la popup `'utiliser_programme'` (strategieService.js). **EVOLUTION 18** (todo.md) : 2e (et dernier) orchestrateur, avec `FocusEngine.jouerActionEtPersister`, à envelopper sa résolution sous `DB.demarrerEnregistrement()`/empiler via `AnnulationService.empiler` — même mécanisme, voir `annulationService.js` §4.6 |

**Constantes clés** :
- `RESSOURCES_SIMPLES_CADRE` : `['nourriture','energie','materiel','credit','science']`
  — les 5 seules ressources de `plateauMaison` éligibles à une résolution "1
  clic" d'un cadre. Tout le reste (secteurs, Gloire, jetons, Civilisation,
  Corruption...) reste hors périmètre de `actionsSimplesCadre`/
  `appliquerCadreEffet` et s'affiche en texte brut à résoudre manuellement.
- `CHAMPS_PLATEAU_MAISON_AUTORISES` : champs modifiables via
  `majPlateauMaison` — exclut explicitement `civ*`/`technologieDepart`
  (leurs propres fonctions dédiées).
- `INFLUENCE_DEPART = 10`, `GLOIRE_DEPART = [2, null, null, null, null]`.
- `INFO_PROGRAMME_PAR_TYPE` : table de règles fixes du livret ("Actions de
  Programme") — `{Domination|Force|Soutien|Richesse: {focusLies: [2 noms],
  action: texte}}`. Les 2 Focus liés et l'action de Programme sont FIXES
  PAR TYPE (les 8 cartes d'un même type partagent la même action), pas un
  champ par carte de `data/catalogue/programmes.json` — même statut que
  `FocusEngine.BONUS_COMMERCE` (donnée de règles figée). Consommée par
  `index.html`/`strategieService.js` (`renderProgrammesEnMain_`, écran
  Focus).
- `EFFET_PROGRAMME_PAR_TYPE_` : JSON Effet FocusEngine correspondant à
  chaque action de `INFO_PROGRAMME_PAR_TYPE` ci-dessus (Domination →
  `{envahir:1}`, Soutien → `{choice:['activer_cube','construire_installation']}`,
  Force → `{choice:['avancer_civilisation_moins_avancee','gagner_commerce']}`,
  Richesse → `{choice:['etablir_guilde',{produire_ressource:1}]}`) —
  consommée par `GameService.utiliserProgramme` (Phase 3), le texte de
  `INFO_PROGRAMME_PAR_TYPE[type].action` servant TEL QUEL de `texteAction`
  à `FocusEngine.resoudreEffet` ("et/ou" y déclenche le mode choix
  inclusif, son absence le mode exclusif — voir `focusEngine.js`
  `resoudreCle_`, cas `"choice"`/`"choix"`).

### 4.3 `js/secteurService.js` — plateau des secteurs

**Rôle** : gère `secteursPartie` — mise en place initiale + toutes les
actions de jeu (construire, déployer/rappeler des cubes, envahir, regrouper,
retirer/gagner la corruption, augmenter la Population Pure, placement
d'Événement — 1 secteur ou plusieurs groupes simultanés, agrégats
d'Influence des secteurs Purs). Pas pur.

| Fonction | Paramètres | Description |
|---|---|---|
| `SCENARIO_PAR_DEFAUT` | (constante) | `'solo_1'` — seul scénario avec de vraies données |
| `instancierSecteurs` | `(partie)` | Instancie toutes les lignes `secteursPartie` d'une partie créée ; tolérant, ne fait jamais échouer la création |
| `obtenirSecteurs` | `(partieId)` | Secteurs d'une partie, triés par numéro |
| `obtenirAdjacences` | `(scenarioId)` | Paires de secteurs adjacents (catalogue) |
| `obtenirSecteurMere` | `(scenarioId)` | Numéro du Secteur-Mère du joueur |
| `construire` | `(partieId, numero, categorie, type)` | Construit une installation/guilde sur un secteur possédé, si emplacement libre |
| `deployerCube` | `(partieId, numero, type, quantite)` | Ajoute des cubes ; silencieux si invalide |
| `rappelerCube` | `(partieId, numero, type)` | Retire 1 cube, erreur si stock insuffisant |
| `retirerCorruption` | `(partieId, numero)` | `corrompu = false` |
| `obtenirSecteursEligiblesRetraitCorruption` | `(partieId)` | Secteurs possédés ET Corrompus |
| `obtenirSecteursEligiblesGainCorruption` | `(partieId)` | Secteurs possédés, PAS Corrompus, hors Secteur-Mère |
| `placerCorruption` | `(partieId, numero)` | `corrompu = true` |
| `obtenirSecteursEligiblesAugmenterPopulationPure` | `(partieId)` | Secteurs Purs (0 Guilde/Installation) avec Population définie et < 6 |
| `augmenterPopulationPure` | `(partieId, numero)` | +1 Population sur un secteur Pur éligible |
| `obtenirAgregatsInfluenceSecteursPurs` | `(partieId)` | Agrège Guildes/Installations/cubes/secteurs sur les seuls secteurs Purs — alimente les formules `influence_par_*` |
| `regrouper` | `(partieId, mouvements)` | Déplace de la Puissance Navale entre secteurs adjacents possédés (≤5 déplacements), 2 passes de validation |
| `envahirResoudre` | `(partieId, cible, sources, victoire, survivants)` | Persiste les conséquences d'une invasion (retrait unités, reprise Néant si secteur vidé, dépôt survivants + reset installations en victoire) |
| `obtenirSecteursEligiblesConstruction` | `(partieId, categorie)` | Secteurs possédés avec ≥1 emplacement libre |
| `obtenirSecteursEligiblesPlacementNeantAdjacent` | `(partieId, elements)` | Secteurs du Néant adjacents à un secteur possédé, avec emplacement libre pour chaque type d'élément demandé — générique à toute combinaison Installation/Guilde/jeton du catalogue |
| `placerElementsNeantAdjacent` | `(partieId, numero, elements)` | Pose les éléments demandés sur le secteur cible |
| `resoudrePlacementMultipleNeantAdjacent` | `(partieId, effet)` | Cadre à plusieurs groupes de placement simultanés : calcule les candidats éligibles par groupe |
| `appliquerPlacementMultipleNeantAdjacent` | `(partieId, effet, ciblesParGroupe)` | Persiste chaque groupe (délègue à `placerElementsNeantAdjacent`) |
| `getEntretien` | `(partieId)` | Unités d'entretien dues (informatif) |

Helper clé : `appartientAuJoueur_(secteur)` = `pnNeant === 0 &&
totalPn_(secteur) > 0`.

### 4.4 `js/focusService.js` — catalogue Focus

**Rôle** : accès catalogue "Focus" — regroupe les lignes brutes en cartes
(famille + type), mise en place par maison, pool héroïque. Lit IndexedDB,
n'écrit jamais.

| Fonction | Paramètres | Description |
|---|---|---|
| `obtenirMiseEnPlace` | `(nomMaison)` | Par famille : la carte spécifique à la maison, sinon Standard |
| `obtenirNomsPoolHeroique` | — | Noms de famille des Focus héroïques disponibles |
| `obtenirCarteHeroiqueParNom` | `(nom)` | Carte héroïque complète par nom (erreur si absente) |

Shape "carte Focus" : `{id, focus, type ('Standard'|'Héroïque'|maison),
actions: [{action, cout, effet, texte}]}`.

### 4.5 `js/focusEngine.js` — moteur coût/effet PUR

**Rôle** : interprète les opcodes JSON `cout`/`effet` d'une action Focus,
calcule l'état résultant sous forme de diff. Entièrement pur SAUF
`jouerActionEtPersister` (seule fonction non pure du fichier).

| Export | Paramètres | Description |
|---|---|---|
| `resoudreAction` | `(plateauMaison, carte, action, demanderChoix)` | **Pure.** Résout Effet puis Coût (coût débité seulement si l'Effet réussit) ; retourne `{succes, journal, mutations, plateauMaisonApres}` |
| `resoudreEffet` | `(plateauMaison, effetJson, source, texteAction, demanderChoix)` | **Pure.** Réutilisée par `civilisationService.js` (effet de case, signe toujours +1) ; retourne `{succes, journal, mutations, etatResultat}` |
| `jouerActionEtPersister` | `(partieId, carte, action, demanderChoix)` | **Non pure** — lit `plateauMaison`, appelle `resoudreAction`, écrit via `GameService.majPlateauMaison`, empile via `AnnulationService.empiler`. **EVOLUTION 18** (todo.md) : toute la résolution se déroule sous `DB.demarrerEnregistrement()` — si l'Effet échoue, restaure immédiatement (`AnnulationService.restaurerMutations`) ce qu'une popup déléguée aurait déjà écrit ; sinon empile les mutations CAPTURÉES (superset de `resultat.mutations`, couvre aussi les écritures hors plateauMaison) |
| `BONUS_COMMERCE` | (const, test) | Les 6 bonus fixes du livret Commerce |
| `CLES_SECTEUR_HORS_PERIMETRE` | (const, test) | Voir liste ci-dessous |
| `CLES_CIVILISATION_HORS_PERIMETRE` | (const, test) | Voir liste ci-dessous |

**Clés automatisées** (`resoudreCle_`) : ressources simples
(`nourriture/energie/materiel/credit/science/influence/prime/liberation`),
clés `cube*` (agissent sur `cubeActif`), `deployer_cube_par_chantier`/
`deployer_cube`/`deploy_cube`/`deployer_cube_secteur_mere` (popup dédiée,
persistance via `SecteurService.deployerCube`), `ressource_choix`,
`choice`/`choix` (exclusif ou inclusif si "et/ou"), `choice_repeat`,
`gagner_commerce`, `regrouper`/`regroupe` (popup → `SecteurService.regrouper`),
`envahir`/`envahir_corrompu` (popup → `CombatService.resoudreInvasion` +
`SecteurService.envahirResoudre`), `rappeler_cube` en Coût (EVOLUTION 13,
todo.md — popup `rappeler_cube_cout`, secteurs possédés avec >1 Puissance
Navale, Secteur-Mère excepté, → `SecteurService.rappelerCube`),
`influence_secteur` (popup sans choix
utilisateur, calcul pur depuis `SecteurService.
obtenirAgregatsInfluenceSecteursPurs` — voir §6), `produire_<ressource>`
(ressource imposée par la clé — popup sans choix utilisateur, calcul pur
via `calculerNiveauxProduction_`, ex. Focus Production "Ravitailler" —
voir §6), et les no-op silencieux
`sans_benefice_case`/`exclude`/`restriction`/`same_sector`/`meme_secteur`/
`tie_break`. Toute clé inconnue tombe dans un repli générique (journalisée,
jamais bloquante).

**Hors périmètre explicite** (journalisé `"⚠️ non automatisé"`, ne bloque
jamais) :
- `CLES_SECTEUR_HORS_PERIMETRE` : `effet_secteur` uniquement (les autres
  clés listées ici historiquement — `construire_installation`,
  `installation`, `etablir_guilde`, `guilde`, `retirer_corruption`,
  `rappeler_cube` — ont chacune un cas dédié dans `resoudreCle_`, voir
  ci-dessus).
- `CLES_CIVILISATION_HORS_PERIMETRE` : `avancer_civilisation_
  societe/gouvernement/economie`, `avancer_civilisation`, `avance_rapide`,
  `avancer_civilisation_moins_avancee`, `avancer_piste_corrompue`. Bien
  implémenté dans `civilisationService.js`, mais uniquement via les boutons
  dédiés de l'écran Plat. maison — pas de pont automatique depuis une carte
  Focus.
- `produire_ressource`, `produire_deux_ressources` : CHOIX du joueur parmi
  les 5 ressources, popup de sélection pas encore construite.
  `produire_<ressource>` (ressource imposée par le nom de la clé, ex. Focus
  Production "Ravitailler" — `produire_energie`/`produire_materiel`/
  `produire_nourriture`) N'est PLUS hors périmètre : délègue à une popup
  dédiée (`produire_revenu`, `strategieService.js`) qui calcule le revenu
  de production actuel via `calculerNiveauxProduction_` (même calcul que
  `renderCubes_` §5.2, désormais factorisé en commun) et crédite la
  ressource.

### 4.6 `js/annulationService.js` — pile d'annulation

**Rôle** : pile LIFO des actions Focus/Programme en main jouées, persistée
(`pileAnnulation`, survit à une fermeture accidentelle). Annuler = réécrire
les valeurs `avant` de chaque mutation, aucune logique métier "inverse"
recalculée.

**EVOLUTION 18** (todo.md, retour utilisateur — annuler "Conquête Planifier"
ne redéplaçait pas la Corruption ni ne retirait le Programme gagné) : une
entrée de pile mélange désormais 2 formats de mutation, gérés tous deux par
`restaurerMutations`/`annulerDerniere` :
- Legacy `{champ, avant, apres}` (implicitement `plateauMaison[partieId]`,
  produit par `focusEngine.js`/`diffChamps_`) — toujours produit par
  `CivilisationService.avancerPiste` en usage AUTONOME (bouton "Avancer"
  manuel, ou Cadre d'Événement galactique).
- Générique `{store, cle, avant, apres}` (ligne COMPLÈTE d'un store
  quelconque, avant/après) — capturé AUTOMATIQUEMENT par
  `DB.demarrerEnregistrement`/`put` (voir `js/db.js` §4.2bis ci-dessous)
  pendant toute la résolution d'une action Focus
  (`FocusEngine.jouerActionEtPersister`) ou Programme en main
  (`GameService.utiliserProgramme`) — couvre donc AUSSI les popups
  déléguées qui persistent directement (secteurs via `SecteurService`,
  pistes de Civilisation, Programmes, Gloire...), jusqu'ici hors de portée
  de la pile.

| Fonction | Paramètres | Description |
|---|---|---|
| `empiler` | `(partieId, {source, mutations})` | Empile une action réussie ; purge la plus ancienne au-delà de la limite ; no-op si aucune mutation |
| `annulerDerniere` | `(partieId)` | Dépile + annule la dernière action (`restaurerMutations` ci-dessous), ré-appelable en chaîne |
| `restaurerMutations` | `(partieId, mutations)` | **EVOLUTION 18.** Réécrit les valeurs `avant` d'un tableau de mutations SANS toucher à la pile — réutilisée par `jouerActionEtPersister`/`utiliserProgramme` pour annuler immédiatement les écritures d'une action dont l'Effet a finalement échoué (RÈGLE MÉTIER : aucune trace) |
| `viderPile` | `(partieId)` | Vide la pile d'une partie — exposée mais pas encore appelée automatiquement en fin de cycle |
| `obtenirPile` | `(partieId)` | Pile triée du plus ancien au plus récent |
| `compter` | `(partieId)` | Longueur de la pile |

### 4.7 `js/civilisationService.js` — pistes de Civilisation

**Rôle** : avancement des 3 pistes (Société/Gouvernement/Économie) + effet de
la case atteinte (réutilise `FocusEngine.resoudreEffet`), marqueurs
"Corrompue", chaînage des cases "Avance rapide". Règle générique Corruption
(docs-rules-corruption-gardiens-refuges-technoConsume.md §1) : `avancerPiste`
n'applique JAMAIS l'effet d'une case atteinte sur une piste marquée
Corrompue au moment de l'appel (le niveau avance quand même) — appliqué une
seule fois, pour tout appelant.

| Export | Paramètres | Description |
|---|---|---|
| `PISTES` | (constante) | `['societe','gouvernement','economie']` |
| `NOM_PISTE` | (constante) | Map clé → libellé affiché |
| `NIVEAU_MAX` | (constante) | `7` |
| `avancerPiste` | `(partieId, nomMaison, piste, demanderChoix)` | Avance d'une case ; résout l'effet (chaîne les cases "Avance rapide" consécutives) SAUF piste Corrompue (aucun effet, aucun chaînage) ; empile UNE entrée pour toutes les mutations ; no-op si déjà au niveau max |
| `avancerPisteMoinsAvancee` | `(partieId, nomMaison, demanderChoix)` | Avance la piste au niveau le plus bas (égalité : Société > Gouvernement > Économie) |
| `definirCorruption` | `(partieId, piste, valeur, options)` | Coche/décoche "Corrompue" ; `options.conserverCorruptionRetiree` conserve le compteur au retrait (Événement G) |
| `avancerPisteCorrompue` | `(partieId)` | Avance la piste Corrompue SANS résoudre l'effet, puis décoche — pont Focus → Civilisation pas encore câblé à un bouton, testée seulement |
| `obtenirDetailPistes` | `(nomMaison)` | Détail complet (texte des 7 cases × 3 pistes) |

### 4.8 `js/combatService.js` — moteur de combat PUR

**Rôle** : résolution Envahir/Escarmouche. Entièrement pur — aucune
dépendance, aucun DOM, aucun IndexedDB. La persistance des conséquences reste
hors périmètre de ce fichier (déléguée à `SecteurService.envahirResoudre`).

| Fonction | Paramètres | Description |
|---|---|---|
| `vaisseauxDebloques` | `(partie)` | Types débloqués par les technologies du joueur |
| `construireCamp` | `(nom, corvette, destroyer, cuirasse, sentinelle, portevaisseau, defenseSecteur, estJoueur, partie)` | Construit un "camp" de combat |
| `resoudreCombat` | `(attaquant, defenseur)` | Résout Approche + Salves successives, mute les camps EN PLACE, retourne `{vainqueur, cubesRestants, log}` |
| `resoudreInvasion` | `(partie, unitesAttaquant, secteurCible)` | Construit les 2 camps, appelle `resoudreCombat`, ajoute `survivantsAttaquant` |

Testé par `js/combatService.test.js` (24 tests — cas de base + les 8 bonus
de Technologie, voir §11).

**Simplifications assumées** : aucun bonus nécessitant une dépense de
ressource en cours de combat (Missiles longue portée, Drones autonomes, Focus
"Bombarder") ; le choix du cube rappelé est automatisé (priorité fixe :
Corvette > Sentinelle > Destroyer > Porte-Vaisseaux > Cuirassé), jamais laissé
au joueur.

### 4.9 `js/scoreService.js` — fin de partie

**Rôle** : calcul du barème Influence du Néant, détermination du vainqueur,
enregistrement + historique enrichi. Pas pur au sens PWA (passe par
`GameService`/`SecteurService`/`DB`), mais logique de calcul elle-même pure
(`calculerInfluence`, `compteursAutomatiquesDepuisEtat_`).

| Export | Paramètres | Description |
|---|---|---|
| `BAREME` | (constante) | Points par poste (voir ci-dessous) |
| `DIFFICULTES_INFLUENCE_BASE` | (constante) | `[60, 100, 140]` |
| `CLES_COMPTEURS_AUTOMATISABLES` | (constante) | Clés de `BAREME` calculables depuis l'état suivi (voir ci-dessous) |
| `calculerInfluence` | `(compteurs)` | **Pure.** Détail + total Influence du Néant |
| `calculerCompteursAutomatiques` | `(partieId)` | Charge secteurs + `scenarioSecteurs` + Civilisation, retourne la part automatisable des compteurs — consommé par `scoreVueService.js` pour pré-remplir le formulaire (champs laissés modifiables) |
| `enregistrerFinDePartie` | `(partieId, scoreFinal, compteursInfluence)` | Calcule l'Influence, détermine le vainqueur (`scoreFinal > influenceTotal` strictement), persiste `finDePartie`/`terminee` |
| `getHistorique` | — | Liste enrichie (événements, technos, vainqueur) pour l'écran Historique |

`BAREME` (points/unité) : `secteursFaille:30`, `refugesIncomplets:20`,
`catastrophes:20`, `gardiens:10`, `technologiesConsommees:5`,
`crisesPermanentes:5`, `maisonsDechues:3`, `corruption:2`,
`populationNeant:1`. `secteursFaille` valait 60 par erreur avant le
23/08/2026 (voir `docs-rules-cycle-de-jeu.md` §4).

Automatisables (`CLES_COMPTEURS_AUTOMATISABLES`), pré-remplis mais
modifiables : `secteursFaille` (secteurs de type `faille` du scénario),
`gardiens` (somme `secteursPartie.nombreGardien`), `maisonsDechues`
(secteurs avec `maisonAssociee` assignée), `populationNeant` (population
des secteurs avec `pnNeant > 0`), `corruption` (secteurs `corrompu` +
pistes de Civilisation Corrompues — partiel, ignore Programmes/fiches
Maison/offre de Programmes, non suivis par l'app). Le reste
(`refugesIncomplets`, `catastrophes`, `technologiesConsommees`,
`crisesPermanentes`, la difficulté de base) n'a aucune trace en base et
reste entièrement manuel.

Score final du joueur (`#fin-score-final`, écran Fin de partie) : lui
aussi pré-rempli, mais côté `scoreVueService.js` directement (pas
`ScoreService`) — c'est un simple recopiage de
`partie.plateauMaison.ressources.influence` (rechargé frais via
`GameService.obtenirPartie`), l'Influence étant la seule mesure de score
du jeu (`docs-rules-Influence-et-ressources.md` §1). Champ laissé
modifiable. ⚠️ Ce total ne reflète que les gains d'Influence automatisés
par l'app (Focus/Cadres/Gloire/formules `influence_par_*`) — l'évaluation
des Objectifs galactiques/Programme en fin de Cycle
(`docs-rules-cycle-de-jeu.md` §3.3/3.4) reste hors périmètre et doit être
ajoutée à la main, via le cadran Influence désormais éditable sur Plat.
maison (`#influence-maison-input`, index.html — même gabarit que
Corruption, `GameService.majPlateauMaison`).

### 4.10 Schéma de dépendances

```
db.js
 └─ catalogueSync.js
 └─ focusService.js
 └─ secteurService.js
     └─ gameService.js  (creerPartie → SecteurService.instancierSecteurs, FocusService.obtenirMiseEnPlace ;
                          choisirFocusHeroique → FocusService.obtenirCarteHeroiqueParNom ;
                          appliquerCadrePlacement(Multiple) → SecteurService.placerElementsNeantAdjacent/
                          appliquerPlacementMultipleNeantAdjacent)
         └─ annulationService.js
         └─ focusEngine.js  (pur, sauf jouerActionEtPersister → DB + GameService + AnnulationService)
             └─ civilisationService.js  (→ GameService.majCivilisation/majPlateauMaison,
                                          → FocusEngine.resoudreEffet, → AnnulationService.empiler)
         └─ scoreService.js  (→ GameService.obtenirPartie/sauvegarderPartie/listerParties,
                                → SecteurService.obtenirSecteurs, → DB.getAll('scenarioSecteurs'))
 └─ combatService.js  (indépendant, 100% pur — consommé par les popups liées à "envahir")
```

Côté écrans, `strategieService.js` appelle directement `SecteurService`
(`regrouper`/`deployerCube`/`envahirResoudre`/`obtenirSecteursEligibles*`) et
`CombatService.resoudreInvasion` depuis ses popups `demanderChoix` (§6) — ces
actions ne repassent PAS par `focusEngine.js` pour la persistance, seulement
pour le calcul du coût/gain scalaire simple.

---

## 5. Couche écrans (`index.html` + `js/*VueService.js` + `strategieService.js` + `setupService.js`)

### 5.1 `index.html` — la coquille

**Écrans** (`<section id="screen-...">`) :

| Screen id | Nav | Purpose |
|---|---|---|
| `screen-home` | — | Accueil : "Créer une partie", sync catalogue, lien Historique, statut SW/version |
| `screen-setup` | — | Création de partie (§5.6) |
| `screen-mise-en-place` | "Mise en place" | Recap lecture-seule du joueur + 4 maisons déchues (rendu 1 seule fois, jamais rafraîchi) |
| `screen-plateau-galactique` | "Plat. Galactique" | Écran par défaut à l'ouverture — Cycle/"Fin du cycle", Événement galactique, Technologies avancées, Focus héroïques (sélection) |
| `screen-plateau-maison` | "Plat. maison" | Ressources, jetons/cubes, pistes Civilisation, technologies, Influence |
| `screen-fin` | — | Formulaire de fin de partie (§5.4) |
| `screen-focus` | "Focus" | Actions réalisées (Annuler+journal), cartes Focus jouables, bandeau de rappel ressources |
| `screen-secteurs` | "Secteurs" | Table des secteurs + formulaires Construire/Rappeler un cube |
| `screen-combat` | "Combat" | Calculateur Envahir/Escarmouche (§5.3) |
| `screen-historique` | — | Liste enrichie des parties (§5.5) |

**`App` — API publique** (`return`, fin de l'IIFE) :

| Fonction | Paramètres | Rôle |
|---|---|---|
| `afficherEcran` | `nom` | Bascule `hidden`/`.active` par suffixe d'id ; cas spécial `nom==='combat'` → appelle aussi `CombatVueService.afficher` ; cas spécial `nom==='secteurs'` → appelle aussi `renderEcranSecteurs_` |
| `afficherPartieCreee` | `partie` | Alias conservé pour `setupService.js` → délègue à `ouvrirPartie` |
| `ouvrirPartie` | `partie` | Point d'entrée commun : fixe `partieCourante`, affiche la nav, rend les écrans "partie", appelle `StrategieService.afficher`+`CombatVueService.afficher`, bascule sur `plateau-galactique` |
| `getPartieCourante` | — | Retourne `partieCourante` en mémoire |
| `rafraichirPartieCourante` | — | Recharge depuis IndexedDB, **ne rend rien** |
| `renderPlateauGalactique` | `partie` | Alias public de `renderEcranPlateauGalactique_` |
| `renderPlateauMaison` | `partie` | Alias public de `renderEcranPlateauMaison_` |
| `renderSecteurs` | `partie` | Alias public de `renderEcranSecteurs_` |

**⚠️ Le gotcha "rafraîchissement explicite"** — `App.afficherEcran` est
**purement visuel** (toggle `hidden`/`.active`, aucun re-rendu, sauf les cas
spéciaux Combat/Secteurs ci-dessus). Conséquence : **toute mutation d'état
doit explicitement rappeler les fonctions de rendu concernées après
persistance**, changer d'onglet seul ne rafraîchit rien.
- `StrategieService.afficher(partie)` rafraîchit Focus + Plat. maison en
  entier (ressources, cubes, gloire, civilisation, Focus joueur/héroïques) —
  appelée après quasiment toute action mutante.
- Plat. Galactique / Plat. maison (`renderEcranPlateauGalactique_` /
  `renderEcranPlateauMaison_`) ne sont PAS couverts par
  `StrategieService.afficher` et doivent être rappelés explicitement là où
  leurs données changent.
- `screen-mise-en-place` est rendu une seule fois à l'ouverture, contenu figé
  par design.
- **Règle à respecter pour tout nouveau code** : un appel cross-closure
  (depuis un autre fichier) à une fonction de rendu d'écran doit toujours
  passer par l'alias public `App.render*`, jamais par le nom privé `_` —
  sous peine de `ReferenceError` silencieux (voir CLAUDE.md, Piège n°2).

**`#modal-choix`** : markup unique et partagé (`.modal-overlay > .modal-box
> {h3#modal-choix-titre, div#modal-choix-contenu, div.modal-actions >
{btn Annuler, btn Valider}}`), déclaré dans `index.html` mais entièrement
piloté par `StrategieService.demanderChoix` (§6). Une seule ouverture
possible à la fois (nœuds DOM uniques, pas de file d'attente).

**Autres fonctions de rendu notables** (non exhaustif, voir le fichier pour
le détail) : `renderEcranPlateauGalactique_`, `renderTechnologiesAvancees_`,
`renderEcranPlateauMaison_`, `renderTechnologiesObtenues_`,
`renderCadresEvenement_`, `renderObjectifsEvenement_`, `renderEvenementCycle_`,
`renderEcranSecteurs_`, `renderFormulaireConstruire_`,
`renderFormulaireRappelerCube_`, `titreTechnologie_` (tooltip "Améliorée" —
texte de base ou amélioré selon l'état de la case).

### 5.2 `js/strategieService.js` — le plus gros module écran

**Rôle** : possède le contenu dynamique de Plat. maison (ressources, jetons/
cubes/gloire, pistes Civilisation) et Focus (journal, cartes Focus jouables,
bandeau de rappel), + la sélection des Focus héroïques sur Plat. Galactique.
Seul propriétaire de la modale générique `demanderChoix` (§6), consommée à la
fois par `focusEngine.js` (via le paramètre `demanderChoix` passé en
callback) et par `index.html` (cadres d'Événement galactique).

**API publique** (`return`) :

| Export | Rôle |
|---|---|
| `afficher(partie)` | Rafraîchit tous les blocs possédés (voir §5.1) ; réinitialise `journal`/`soldeDebutCycle` si partie/cycle changent |
| `demanderChoix(contexte)` | Dispatcher générique de modale — catalogue complet en §6 |
| `CHAMP_RESSOURCE` | 5 ressources principales + couleur hex — voir §4.2/§4.5, réutilisée par `index.html` (§13) |
| `TYPES_INSTALLATION_CONSTRUIRE_`, `TYPES_GUILDE_CONSTRUIRE_`, `TYPES_VAISSEAU` | Listes `{cle, label}` pour les `<select>` de formulaire — réutilisées par `index.html` (Secteurs : Construire/Rappeler un cube) |
| `GUILDE_VERS_RESSOURCE` | Guilde (colonne `secteursPartie`, ex. `guildeFermiers`) → clé ressource produite |

**Rendus clés** : `champRessourceHTML_`/`renderRessources_` (grille 6
colonnes : pastille/Niveau/→/Revenu/Stock éditable/Delta),
`renderRappelRessources_` (bandeau fixe), `renderJetons_` (Commerce/
Prime/Libération), `renderCubes_` (affichage — délègue le calcul des
niveaux de production Population×Guildes+bonus origine à
`calculerNiveauxProduction_`, aussi réutilisée par le contexte
`produire_revenu`, §6, pour créditer l'effet "produire_&lt;ressource&gt;"
d'une carte Focus, ex. Ravitailler), `renderGloire_`/`renderGloireDOM_`
(5 emplacements cliquables),
`carteFocusJoueurHTML_` (gabarit carte Focus), `renderFocusJoueur_`,
`renderFocusHeroiquesJoueur_`, `renderFocusHeroiques_` (sélection cycle),
`jouerAction_` (joue une action via `FocusEngine.jouerActionEtPersister`).

**Autres tables de couleurs/libellés** (non exposées, usage interne à ce
fichier) : `RESSOURCES_PRODUCTION`, `RESSOURCES_TOUTES` (superset incluant
influence/commerce/prime/liberation/cubes — utilisé UNIQUEMENT par les
pastilles de coût, volontairement pas fusionné avec `CHAMP_RESSOURCE`,
portées différentes), `LIBELLES_OPTIONS` (vocabulaire des popups de choix),
`couleurCout_`/`abregeCout_` (résolution couleur/libellé abrégé pour les
pastilles de coût).

### 5.3 `js/combatVueService.js`

**Rôle** : `screen-combat` — calculateur Envahir/Escarmouche indépendant de
`focusEngine.js`/`annulationService.js` : ne persiste jamais rien, le joueur
applique le résultat manuellement.

| Fonction | Paramètres | Rôle |
|---|---|---|
| `afficher` | `partie` | (Ré)initialise l'écran (conserve le mode courant, re-rend) — appelée depuis `App.ouvrirPartie` et à chaque clic sur l'onglet Combat |

DOM : `#combat-champs-attaquant`/`-defenseur`, `#combat-resultat`,
`#mode-envahir`/`#mode-escarmouche`.

### 5.4 `js/scoreVueService.js`

**Rôle** : `screen-fin` — formulaire de score final + calculateur Influence
du Néant (aperçu ; le calcul faisant foi est celui de
`ScoreService.enregistrerFinDePartie`). **API publique vide** (`return {}`)
— module entièrement auto-câblé au chargement (écouteurs sur `#btn-terminer-
partie`, `#btn-retour-fin`, `#btn-enregistrer-fin`, `#influence-difficulte`).

### 5.5 `js/historiqueVueService.js`

**Rôle** : `screen-historique` — liste enrichie (date, statut/score, badge
vainqueur, événements/technologies), actions par carte (reprendre/archiver/
supprimer) + suppression en masse des non-archivées. **API publique vide**
(`return {}`) — auto-câblée sur `#btn-historique`.

### 5.6 `js/setupService.js`

**Rôle** : `screen-setup` — formulaire de création de partie (mode manuel/
aléatoire, maison/difficulté, sous-formulaire "reproduire une partie physique
en cours" avec technologie de départ, 4 maisons déchues sans doublon, 3
technologies sans point avec compteur/verrou).

| Fonction | Paramètres | Rôle |
|---|---|---|
| `init` | — | Câble TOUS les écouteurs de cet écran (bascules mode, listes maisons déchues, `#btn-lancer-partie` → `GameService.creerPartie` puis `App.afficherPartieCreee`) ; appelée une fois en fin de bootstrap d'`index.html` |

---

## 6. Système de modale générique (`StrategieService.demanderChoix`)

`demanderChoix(contexte)` est le point d'entrée UNIQUE pour tout choix
nécessitant une interaction joueur — utilisé par `focusEngine.js` (paramètre
callback), par `civilisationService.js` et par `index.html` (cadres
d'Événement galactique). Retourne toujours une `Promise`. Catalogue complet
des `contexte.type` (22 branches, `if/else if`) :

| `type` | Rôle | `resolve(...)` | Persiste elle-même ? |
|---|---|---|---|
| `option_exclusive` | Choisir une option (liste de boutons) | `{indexChoisi}` ou `{annule:true}` | Non |
| `options_inclusives` | Choisir 0-N options (cases à cocher) | `number[]` (indices) | Non |
| `ressource_choix` | Choisir N ressources une à une (gain/dépense), arrêt anticipé possible | `string[]` (clés ressource) | Non |
| `confirmation` | Confirmation générique oui/non (pas de sélection) | `{confirme:true}` ou `{annule:true}` | Non |
| `bonus_commerce` | Choisir un bonus (liste de libellés bruts) | `{indexChoisi}` ou `{annule:true}` | Non |
| `regrouper` | Déplacer de la Puissance Navale entre secteurs adjacents possédés (≤5), constructeur multi-lignes | `{deplacements, detail, mouvements}` ou `{annule:true}` | **Oui** — `SecteurService.regrouper` appelé dans la popup |
| `deployer_cube` | Déployer du Cube actif en Flotte (3 modes) | `{totalCubes, coutParRessource, detail, mouvements}` ou `{annule:true}` | **Oui** — `SecteurService.deployerCube` par ligne (ressources/cubeActif restent gérés par `focusEngine.js`) |
| `envahir` | Flux complet d'invasion (cible Néant/Maison déchue/Corrompu, engagement multi-source, résolution combat) | `{victoire, jetonPrime, jetonLiberation, influenceGagnee, totalEngage, detail, avertissement}` ou `{annule:true}` | **Oui, largement** — `CombatService.resoudreInvasion` puis `SecteurService.envahirResoudre` ; persiste aussi directement le jeton Gloire (array), hors flux d'annulation |
| `construire` | Choisir secteur + catégorie + type pour Construire une Installation/Guilde | `{detail, numero, type}` ou `{annule:true}` | **Oui** — `SecteurService.construire` |
| `rappeler_cube` | Choisir secteur + type de vaisseau pour Rappeler un cube (option "recall" d'un Cadre, Événement H Cycle 1) | `{detail, numero, type}` ou `{annule:true}` | **Oui** — `SecteurService.rappelerCube` |
| `augmenter_population_pure` | Choisir un secteur Pur éligible pour +1 Population | `{detail, numero}` ou `{annule:true}` | **Oui** — `SecteurService.augmenterPopulationPure` |
| `retirer_corruption` | Choisir un secteur possédé Corrompu à décocher | `{detail, numero}` ou `{annule:true}` | **Oui** — `SecteurService.retirerCorruption` |
| `gagner_corruption` | Choisir un secteur possédé non-Corrompu à corrompre | `{detail, numero}` ou `{annule:true}` | **Oui** — `SecteurService.placerCorruption` |
| `gagner_programme` | Choisir un Programme du catalogue (groupé par type, filtré par `contexte.typeImpose` le cas échéant, offre publique mise en évidence, exclut les Programmes déjà en main) | `{detail, nom, type}` ou `{annule:true}` | **Oui** — `GameService.gagnerProgramme` |
| `utiliser_programme` | Affiche l'action gratuite du Programme (`INFO_PROGRAMME_PAR_TYPE`), bouton "Résoudre" → `GameService.utiliserProgramme` (relaie la même `demanderChoix` pour toute sous-popup imbriquée — envahir/options_inclusives/avancer_civilisation/confirmation/etc.) | `{detail, place, nom, type}` ou `{annule:true}` | **Oui** — `GameService.utiliserProgramme` |
| `choisir_emplacement_programme` | Plateau Programme plein (3 emplacements occupés, aucun conflit de type) : choisir lequel remplacer | `{numero}` ou `{annule:true}` | Non — sélection seule, `GameService.utiliserProgramme` persiste |
| `influence_secteur` | Aucun choix utilisateur : calcule un gain d'Influence variable depuis `SecteurService.obtenirAgregatsInfluenceSecteursPurs` (9 formules), ferme immédiatement | `{montant, detail}` | Non — calcul pur, la persistance du gain reste côté appelant |
| `produire_revenu` | Aucun choix utilisateur : calcule le revenu de production actuel de `contexte.ressource` via `calculerNiveauxProduction_` (Population × Guildes + bonus d'origine, puis table PRODUCTION_NEMS/PRODUCTION_CREDIT), ferme immédiatement | `{montant, detail}` | Non — calcul pur, la persistance du gain reste côté appelant |
| `ameliorer_gloire` | Choisir un jeton Gloire posé à améliorer (+1 valeur) | `{detail}` ou `{annule:true}` | **Oui** — écrit directement `plateauMaison.gloire`, hors flux d'annulation |
| `avancer_civilisation` | Choisir une piste de Civilisation à avancer — `contexte.moinsAvancee:true` calcule la piste la moins avancée localement (action de Programme Force) plutôt qu'une `piste` imposée/au choix | (résolution interne, pas de `resolve` direct) | **Oui** — délègue à `CivilisationService.avancerPiste` |
| `resoudre_cadre_evenement` | Liste les options d'un cadre "choix" d'Événement galactique (delta simple / proportionnel / Technologie) | dépend de l'option choisie | Variable selon l'option |
| `placement_secteur_neant_adjacent` | Choisir un secteur du Néant adjacent éligible (1 groupe d'éléments fixes) | `{numero}` ou `{annule:true}` | Non — sélection seule, l'appelant (`index.html`) persiste via `GameService.appliquerCadrePlacement` |
| `placement_critere` | Désambiguïser un placement multi-groupes par critère (ex. égalité de Population) — Événement C | `{numero}` ou `{annule:true}` | Non — sélection seule |
| *(inconnu)* | Repli non bloquant, log un avertissement console | `{annule:true}` | Non |

Pattern commun à chaque branche : `titre.textContent`, `contenu.innerHTML`,
affiche/masque `btnValider`/`btnAnnuler`, câble leurs listeners pour
`resolve(...)` + `fermerModale_()`, puis `modal.hidden = false` en toute fin
de `demanderChoix` (après le `if/else if`).

---

## 7. `css/style.css` — carte structurelle

Aucune media query dans le fichier — la gestion mobile passe par un scroll
horizontal de la nav (`.nav-ecrans`) plutôt que des breakpoints. Variables
CSS sur `:root` : `--color-bg/-surface/-surface-2/-border` (palette violet
sombre), `--color-nebula-1/-2` (accents dégradé), `--color-coral/-coral-dim`
(seul accent chaud, réservé aux actions/sélection), `--color-text/-text-
muted`, `--radius` (16px), `--radius-sm` (10px), `--font-display`,
`--font-body`.

Grandes familles de règles, dans l'ordre du fichier : reset/`:root` →
décor de fond (`.starfield`/`.nebula-glow`) → coquille app (`#app`,
`.topbar*`) → mécanisme d'écrans (`.screen[hidden]`) → titres de section
(`.section-title`/`.subsection-title`/`.hint*`) → boutons (`.btn`/-primary/
-secondary/-danger/-toggle) → formulaire "Créer une partie" (`.setup-bloc*`)
→ cartes (`.card`/`.card-joueur`/`.card-list`) → en-tête Plateau Galactique
(`.plateau-galactique-entete`/`.titre-cycle`) → **Cadres/Objectifs
Événement galactique** (`.cadre-carte`/`.cadre-entete/-texte/-statut/
-actions`/`.objectif-bloc/-separateur/-ligne`) → mise en place manuelle →
table Secteurs + nav (`.table-secteurs`/`.barre-navigation-partie`/
`.nav-ecrans`) → **Ressources/Civilisation** (`.ressources-liste`,
`.ressource-case*`, `.ressources-cubes`, `.ressources-gloire`, `.plateau-
influence`, `.ressources-journal`, `.bloc-annulation*`, `.pistes-
civilisation-liste`) → technologies (`.check-amelioree`, `.techno-obtenue-
ligne`) → **Cartes Focus & badges** (`.focus-card`, `.pastille-cout`,
`.badge`/-type-*) → **Modale générique** (`.modal-overlay`, `.modal-box`,
`.modal-choix-*`) → popup Regrouper (`.regrouper-liste`, `.btn-lien`) →
**Combat** (`.combat-colonnes`, `.combat-resultat`) → Fin de partie & grille
ressources (`.form-grid`, `.field-ressource*`, `.total-influence`) →
**Historique** (`.historique-item`, `.badge-tag/-vainqueur*`).

---

## 8. PWA — Service Worker & versioning

### 8.1 Fichiers cachés (`FICHIERS_A_METTRE_EN_CACHE`, `service-worker.js`)

`./`, `./index.html`, `./manifest.json`, `./version.js`, `./css/style.css`,
les modules `js/*.js` (hors `*.test.js`/`_test.js`/`test_*.js`, jamais
expédiés en prod), les 12 `data/catalogue/*.json`, `./icons/icon-192.png`,
`./icons/icon-512.png`.

### 8.2 Stratégie : cache-first strict

`fetch` handler : `caches.match(request)` d'abord ; réseau uniquement si
absent du cache. Pas de revalidation, pas de stale-while-revalidate (choix
assumé pour la simplicité).

### 8.3 Mécanisme de cache-busting

```js
importScripts('./version.js');
var CACHE_NOM = 'voidfall-companion-' + APP_VERSION;
```
`install` : `caches.open(CACHE_NOM)` + fetch anti-cache HTTP par fichier
(`{cache: 'reload'}`, voir §8.4) + `self.skipWaiting()`.
`activate` : supprime tous les caches ≠ `CACHE_NOM` + `self.clients.claim()`.

### 8.4 ⚠️ Gotcha de mise à jour (documenté dans `service-worker.js` lui-même)

Le navigateur ne réinstalle le Service Worker que s'il détecte que
`service-worker.js` a changé au niveau OCTET (comparaison byte-à-byte) —
`CACHE_NOM` est dérivé de `APP_VERSION` (`version.js`) précisément pour que
ce fichier change à chaque incrément, et déclenche donc bien la
réinstallation. **RÈGLE du projet** : incrémenter `APP_VERSION` à chaque
push qui modifie un fichier mis en cache (§8.1) — sans ça, le Service Worker
n'est jamais réinstallé et l'ancien contenu reste servi indéfiniment.

**En pratique**, éditer `version.js` seul ne suffit pas toujours à faire
réinstaller le Service Worker dans un onglet déjà ouvert — le byte-diff
porte sur `service-worker.js` lui-même, et le cache HTTP du navigateur peut
réutiliser une réponse `fetch()` mise en cache pour les fichiers importés.
**Pour tester un changement de code localement de façon fiable** : soit
`navigator.serviceWorker.getRegistrations()` → `unregister()` +
`caches.keys()` → `caches.delete()` puis recharger, soit servir depuis un
port différent (nouvelle origine = HTTP cache et Service Worker vierges).
Toujours incrémenter `APP_VERSION` à chaque changement de fichier caché,
mais ne pas compter dessus seul pour valider en local.

---

## 9. Conventions de code

- **IIFE + `_` privé** : chaque module `js/*.js` est
  `var NomService = (function () { 'use strict'; ...; return {...}; })();`.
  Toute fonction interne non exposée porte un suffixe `_`
  (`assemblerPartie_`, `appartientAuJoueur_`...). Les fonctions exposées dans
  `return {}` gardent le même nom, sans suffixe.
- **Français partout** : identifiants, commentaires, messages d'erreur,
  contenu UI. Seules les clés internes des opcodes JSON du catalogue
  (`cout`, `effet`, `gain`, noms de ressources) restent en minuscules
  techniques (parfois en anglais partiel hérité, ex. `porte_vaisseau`).
- **Pur vs DOM** : quand un module a une logique de calcul substantielle et
  testable indépendamment du DOM/IndexedDB, elle est isolée dans un module
  "pur" séparé de son écran — `focusEngine.js`/`strategieService.js`,
  `combatService.js`/`combatVueService.js`. Un module pur ne doit JAMAIS
  appeler `DB.*` ni toucher au DOM dans sa logique de résolution (seule
  exception tolérée : une fonction d'orchestration clairement isolée, comme
  `jouerActionEtPersister` dans `focusEngine.js`).
- **Persistance liste-blanche** : toute écriture partielle sur `plateauMaison`
  passe par `GameService.majPlateauMaison(partieId, champs)`, qui filtre
  `champs` contre `CHAMPS_PLATEAU_MAISON_AUTORISES` — jamais d'écriture
  IndexedDB directe sur `plateauMaison` depuis un module autre que
  `gameService.js`/`secteurService.js` (exception assumée et documentée :
  `appliquerCadreEffet`/`definirTechnologieAmelioree` dans `gameService.js`
  écrivent directement la ligne `plateauMaison` car `majPlateauMaison` ne
  connaît pas ce contexte — pattern lecture-fusion-écriture explicite).
- **Anti-double-application** : les effets de cadre d'Événement galactique se
  marquent dans `evenements.cycleN.cadresAppliques[ordre]` (partie de
  `etatJson`) pour empêcher un second clic de rejouer l'effet.
- **Rafraîchissement explicite après mutation** : voir le gotcha détaillé en
  §5.1 — c'est la source d'erreur la plus fréquente historiquement dans ce
  projet.

---

## 10. Hors périmètre connu (fonctionnalités volontairement non automatisées)

Récapitulatif transverse (détail par module en §4.5) :
- **Actions secteur depuis une carte Focus** : `construire_installation`/
  `installation`/`etablir_guilde`/`guilde`/`rappeler_cube`/
  `retirer_corruption`/`effet_secteur` — couvertes par des boutons dédiés
  écran Secteurs, pas par le pont Focus.
- **Avancement de Civilisation depuis une carte Focus** : implémenté
  ailleurs (`civilisationService.js`, boutons Plat. maison), pas de pont
  Focus automatique.
- **Production, choix de la ressource** (`produire_ressource`/
  `produire_deux_ressources`) : le joueur choisit parmi les 5 ressources,
  popup de sélection pas encore construite. `produire_<ressource>`
  (ressource imposée par la clé, ex. Focus Production "Ravitailler") EST
  automatisé (popup `produire_revenu`, `strategieService.js`, §4.5).
- **Défausse de Gloire pour secteur source abandonné** lors d'une invasion,
  et **résolution immédiate des jetons Prime/Libération** : simples
  compteurs journalisés/crédités, pas de popup dédiée.
- **Objectifs galactiques** (`objectifs.blocs[]`) : affichage seul, jamais
  résolus automatiquement (le joueur les évalue manuellement en Phase
  Évaluation).
- **Résolution de bonus de combat coûteux en ressources** (Missiles longue
  portée, Drones autonomes, Focus "Bombarder") côté `combatService.js`.
- **Choix du cube rappelé en combat** : automatisé par priorité fixe, jamais
  laissé au joueur.

---

## 11. Stratégie de test

### 11.1 Tests unitaires (modules purs, zéro dépendance npm)

Chaque fichier charge les VRAIS fichiers sources dans un contexte `vm` avec
une IndexedDB factice en mémoire (`get`/`getAll`/`put`/`supprimer`) quand le
module en dépend. Exécution : `node <fichier>.test.js`/`node <fichier>` ou
`node --test` (racine `js/`, ne matche que `*.test.js` — voir la remarque de
convention ci-dessous).

12 fichiers, ~130 tests au total : `js/focusEngine.test.js` (couvre aussi
`annulationService.js`), `js/combatService.test.js`,
`js/civilisationService_test.js`, `js/secteurService_actions.test.js`,
`js/gameService_cycle_focus_technologie.test.js`,
`js/gameService_evenements_technologie.test.js`,
`js/gameService_technologies_avancees_test.js`,
`js/gameService_cadre_ecriture_imbriquee_test.js`,
`js/gameService_cadre_gain_corruption_test.js`,
`js/gameService_cadre_placement_choix_test.js`,
`js/test_gameService_cadreChoixCube.js`, `js/test_secteurService_placement.js`.

- **Non testé** : `scoreService.js` — logique de calcul simple (barème fixe),
  priorité de test moindre que ne l'était `combatService.js` (résolution de
  combat nettement plus complexe, désormais couvert).
- **Convention de nommage incohérente** : `*.test.js` / `*_test.js` /
  `test_*.js` coexistent selon le fichier. `node --test` sans argument ne
  matche que `*.test.js` — les deux autres familles doivent être lancées
  individuellement (`node js/<fichier>`).

### 11.2 Tests bout-en-bout (Playwright, navigateur réel)

Complète les tests unitaires ci-dessus (moteur pur, IndexedDB factice) par
un parcours dans un vrai navigateur : DOM réel, `index.html`,
`service-worker.js`, tous les écrans — seul moyen d'attraper les bugs de
rendu/navigation (voir CLAUDE.md, Piège n°2) qu'un test de moteur pur ne
peut pas voir. `devDependencies` uniquement (`package.json`, `node_modules/`
— jamais servis en prod, jamais dans le cache du Service Worker).

- `e2e/partie-complete.spec.js` (`npm run test:e2e`) : smoke test léger —
  création de partie + navigation sur tous les écrans, aucune erreur JS.
- `e2e/partie-aleatoire.spec.js` (`npm run test:e2e:aleatoire`, ~2-3 min) :
  partie complète semi-aléatoire (3 cycles + fin de partie) pour chacune des
  14 maisons du catalogue, en cliquant réellement dans le DOM — seeds
  déterministes, fuzzing seedé plutôt qu'énumération exhaustive.

---

## 12. Docs de règles associées (`docs/docs-rules-*.md`)

Annotations ligne-à-ligne du livret de règles officiel Voidfall, avec une
légende commune (✅ pris en compte / ❌ non pris en compte / 🚫 hors
périmètre / 🔍 à vérifier / ⚠️ attention / 💬 commentaire pour l'app) —
elles indiquent précisément ce que l'app automatise vs laisse manuel.

- **`docs-rules-cycle-de-jeu.md`** (231 l.) : le cycle complet 3-Cycles/
  3-Phases — §1 Phase Préparation (mise en place solo, Événement galactique,
  cadres), §2 Phase Focus (sélection, actions, technologies, nettoyage,
  progression du Néant), §3 Phase Évaluation (contre-attaque, entretien,
  objectifs galactiques/de Programme), §4 Fin de partie (barème Influence du
  Néant — correspond exactement à `scoreService.js`).
- **`docs-rules-flottes.md`** (92 l.) : §1 flottes/Puissance Navale (5 types,
  états de cube, déployer/rappeler/activer), §2 flottes du Néant, §3
  Regrouper/Envahir, §4 secteurs abandonnés/prise de contrôle Néant —
  correspond à `secteurService.js` §4.3.
- **`docs-rules-Influence-et-ressources.md`** (43 l.) : Influence (seule
  condition de victoire), les 5 ressources (substitution Crédit↔N/E/M,
  plafond 15), production (Niveau × Guildes, plafond 13, surproduction).
- **`docs-rules-secteurs.md`** (71 l.) : adjacence/Tempêtes du Néant,
  contrôle de secteur, compétences de secteur, Purs/Corrompus, les 5 Guildes
  et 3 Installations, règles de construction, population — correspond aux
  catalogues `typesSecteur.json`/`scenarioSecteurs.json`.
- **`docs-rules-corruption-gardiens-refuges-technoConsume.md`** (82 l.) :
  Corruption (effets négatifs, piste/Population/Programme corrompus),
  Gardiens et Refuges, Technologies "à consommer" — mécaniques transverses
  couvertes par `civilisationService.js`/`secteurService.js` (Corruption) et
  ponctuellement citées en commentaire là où l'app les automatise.

---

## 13. Dette / incohérences connues

- **`data/catalogue/scenarioTrousDeVer.json`** est un tableau vide — la
  mécanique "trou de ver" a un store/une jointure prête côté catalogue mais
  n'est utilisée par aucun scénario ni aucun code de résolution
  actuellement. Décision produit nécessaire (fonctionnalité prévue ou
  store à retirer) — pas une suppression mécanique.
- **`js/strategieService.js` (3400+ lignes)** : la modale générique
  `demanderChoix` (§6, 22 branches `contexte.type`) représente à elle seule
  près de la moitié du fichier, fonctionnellement indépendante du reste
  (rendu Focus/Plat. maison) — candidate à extraction dans un fichier dédié
  si une refonte de fond est planifiée. Ses branches gagneraient aussi à
  passer d'un `if/else if` géant à un dispatch par table. Non traité :
  volume/risque de régression trop importants pour une session de
  maintenance courante.
- **`index.html`** : le moteur de résolution des Cadres d'Événement
  galactique (plusieurs centaines de lignes du script embarqué) casse la
  convention "1 fichier dédié par écran" — candidat à extraction vers
  `js/evenementVueService.js`, même réserve que ci-dessus (non traité).
  `LABEL_GUILDE`/`LABEL_INSTALLATION`/`LABEL_PN` (tableau Secteurs,
  libellés abrégés) restent des tables à part de `strategieService.js` —
  pas une duplication au sens strict (clés et textes différents des
  tables `cle`/`label` de §5.2).
- **`js/gameService.js`** : pattern lire→muter→sauvegarder→**relire**
  systématique (`rechargerPartie_`) pour reconstruire le retour de
  quasiment toute mutation. Examiné et volontairement conservé : ce n'est
  pas un simple refetch redondant — `rechargerPartie_` appelle
  `assemblerPartie_`, qui recalcule des champs dérivés et applique des
  valeurs par défaut que l'objet muté en mémoire avant la sauvegarde n'a
  pas nécessairement à jour. Le supprimer gagnerait une lecture IndexedDB
  locale (perf négligeable) contre le risque de renvoyer une `partie`
  subtilement différente de ce qui est réellement persisté.
