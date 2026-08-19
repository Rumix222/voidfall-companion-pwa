# Architecture PWA — Voidfall Companion

Version 3 — 18/08/2026 (réécriture complète à partir d'une relecture exhaustive
du code, remplace la version 2 qui ne couvrait que la structure du repo, les
clés Coût/Effet de `focusEngine.js` et la stratégie de test)

Document de référence détaillé de l'architecture technique. Pour une lecture
rapide en début de session, voir [`CLAUDE.md`](../CLAUDE.md) à la racine du
repo. Pour les règles du jeu elles-mêmes (ce que l'app doit modéliser), voir
`docs/docs-rules-*.md` (§12).

**Note sur `docs-migration-pwa-plan.md`** : les anciennes versions de ce
document, ainsi que des commentaires dans `service-worker.js`/`version.js`,
renvoient à un fichier `docs/docs-migration-pwa-plan.md` qui **n'existe plus**
dans le repo. Référence morte à corriger/retirer au prochain passage sur ces
fichiers — ne pas chercher ce fichier, l'historique des décisions vit
désormais uniquement dans les en-têtes de commentaires versionnés
(`version.js`, en-têtes de chaque module).

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
  (migration depuis Supabase actée le 18/08/2026, voir en-tête de
  `js/catalogueSync.js`) et importé dans IndexedDB au clic sur
  "Synchroniser le catalogue".
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
                             #   + <script> embarqué (App IIFE + rendus d'écran, ~1890 lignes)
manifest.json                # métadonnées PWA (nom, icônes, display standalone)
service-worker.js            # cache-first strict, liste FICHIERS_A_METTRE_EN_CACHE (§8)
version.js                   # APP_VERSION, source de vérité unique du cache (§8)
css/
  style.css                  # tout le style, ~1565 lignes (§7)
data/
  catalogue/                 # 12 fichiers JSON = catalogue de règles statique (§3)
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
  *.test.js / *_test.js     # tests node:test des modules purs (§11)
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
| `pileAnnulation` | `id` (autoIncrement) | `partieId` | Pile LIFO des mutations Focus annulables (ajouté v3/Session 4) |
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
                   cubeActif, jetonPrime, jetonLiberation, jetonCommerce, gloire, programmes: [4] },
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
Economie` (bool), `programme1-4`, `technologiesObtenues` (array de 5, objets
ou null), `technologiesAvanceesChoisies` (array de 4),
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

**Rôle** : importe les 12 fichiers `data/catalogue/*.json` vers IndexedDB, en
écrasement complet à chaque synchronisation. Pas pur (fetch réseau + DB), mais
fonctionne offline dès que les JSON sont mis en cache par le Service Worker.

| Fonction | Paramètres | Description | Ligne |
|---|---|---|---|
| `synchroniser` | — | Synchronise les 12 tables en parallèle, tolérant, écrit `meta.catalogueVersion`, retourne `[{table, statut, nombre?\|message?}]` | catalogueSync.js:83 |

### 4.2 `js/gameService.js` — module central (1447 lignes)

**Rôle** : cycle de vie complet d'une partie — création, lecture, listing,
sauvegarde, archivage, suppression, mise à jour du plateau maison/civilisation,
choix d'événements galactiques, cycles, Focus héroïques, technologies. Assemble
l'objet "partie" (§2.3) depuis 2 records IndexedDB. Pas pur (IndexedDB direct
partout), sauf `actionsSimplesCadre`/`obtenirTechnologiesAvanceesGroupes`
explicitement signalées pures. Dépend en tolérant (`typeof X !== 'undefined'`)
de `SecteurService` et `FocusService`.

| Fonction | Paramètres | Description | Ligne |
|---|---|---|---|
| `obtenirMaisonsCatalogue` | — | Jointure maisons+technologies → `[{nom, complexite, technologies}]` | 633 |
| `creerPartie` | `(options)` | Crée une partie (tirage/choix maison+adversaires, origine, civilisation/ressources départ, mise en place Focus via `FocusService`, instanciation secteurs via `SecteurService`) | 650 |
| `obtenirPartie` | `(id)` | Une partie assemblée, ou `null` | 843 |
| `listerParties` | — | Toutes les parties, triées `dateCreation` décroissant | 854 |
| `sauvegarderPartie` | `(partie, action, details)` | Persiste une partie complète + ligne d'historique | 871 |
| `archiverPartie` | `(id, archivee)` | Bascule/fixe le flag `archivee` | 897 |
| `supprimerPartie` | `(id)` | Suppression définitive (plateauMaison + secteursPartie + parties) | 910 |
| `supprimerToutesPartiesNonArchivees` | — | Suppression en masse, retourne le nombre supprimé | 924 |
| `majPlateauMaison` | `(partieId, champs)` | MàJ partielle liste-blanche (`CHAMPS_PLATEAU_MAISON_AUTORISES`, 16 champs) | 943 |
| `majCivilisation` | `(partieId, champs)` | MàJ partielle liste-blanche des 6 champs Civilisation | 970 |
| `getEvenementsParCycle` | — | Catalogue événements, groupé `{cycle1,cycle2,cycle3}` | 998 |
| `choisirEvenement` | `(partieId, cycle, nomEvenement)` | Enregistre l'événement choisi pour un cycle | 1020 |
| `actionsSimplesCadre` | `(cadre)` | **Pure.** Actions "1 clic" applicables (deltas 5-ressources-simples uniquement) | 1042 |
| `appliquerCadreEffet` | `(partieId, cycle, ordreCadre, delta)` | Applique un delta ressources "1 clic", marque le cadre résolu (anti-double-application) | 1060 |
| `appliquerCadrePlacement` | `(partieId, cycle, ordreCadre, numeroSecteur)` | Cadre type "placement" → délègue à `SecteurService.placerDefenseGuildeNeantAdjacent`, marque résolu | 1115 |
| `definirTechnologieAmelioree` | `(partieId, cible, amelioree)` | Marque une techno possédée (`'depart'` ou slot 0-4) améliorée/non | 1157 |
| `avancerCycle` | `(partieId)` | Avance `cycleNum`/`cycleTermine` (1→2→3→'termine'), amorce les Focus héroïques du nouveau cycle | 1190 |
| `choisirFocusHeroique` | `(partieId, cycle, slot, nom)` | Enregistre/retire un Focus héroïque (slot 0-2), unicité via `focusHeroiquesPioches`, **pas** d'entrée d'historique (fidèle à l'origine) | 1234 |
| `choisirTechnologieObtenue` | `(partieId, slot, nomTechnologie)` | Technologie obtenue (slot 0-4), parmi les 8 des maisons déchues | 1293 |
| `choisirTechnologieAvancee` | `(partieId, slot, nomTechnologie)` | Une des 4 Technologies avancées (slot 0-3), cycle 1 uniquement, rejette les doublons | 1346 |
| `definirTechnologieAvanceeAmelioree` | `(partieId, nomTechnologie, amelioree)` | Marque une Technologie avancée améliorée, rejette hors du groupe actif | 1392 |
| `obtenirTechnologiesAvanceesGroupes` | `(partie)` | **Pure.** `{toutes, groupeA, groupeB, actif}` | 1432 |

**Constantes clés** :
- `RESSOURCES_SIMPLES_CADRE` (387) : `['nourriture','energie','materiel','credit','science']`
  — les 5 seules ressources de `plateauMaison` éligibles à une résolution "1
  clic" d'un cadre. Tout le reste (secteurs, Gloire, jetons, Civilisation,
  Corruption...) reste hors périmètre de `actionsSimplesCadre`/
  `appliquerCadreEffet` et s'affiche en texte brut à résoudre manuellement.
- `CHAMPS_PLATEAU_MAISON_AUTORISES` (175) : 16 champs modifiables via
  `majPlateauMaison` — exclut explicitement `civ*`/`technologieDepart`
  (leurs propres fonctions dédiées).
- `INFLUENCE_DEPART = 10`, `GLOIRE_DEPART = [2, null, null, null, null]` (172-173).

### 4.3 `js/secteurService.js` — plateau des secteurs (685 lignes)

**Rôle** : gère `secteursPartie` — mise en place initiale + toutes les
actions de jeu (construire, déployer/rappeler des cubes, envahir, regrouper,
retirer la corruption, placement d'Événement). Pas pur.

| Fonction | Paramètres | Description | Ligne |
|---|---|---|---|
| `SCENARIO_PAR_DEFAUT` | (constante) | `'solo_1'` — seul scénario avec de vraies données | 45 |
| `instancierSecteurs` | `(partie)` | Instancie toutes les lignes `secteursPartie` d'une partie créée ; tolérant, ne fait jamais échouer la création | 74 |
| `obtenirSecteurs` | `(partieId)` | Secteurs d'une partie, triés par numéro | 187 |
| `obtenirAdjacences` | `(scenarioId)` | Paires de secteurs adjacents (catalogue) | 199 |
| `obtenirSecteurMere` | `(scenarioId)` | Numéro du Secteur-Mère du joueur | 210 |
| `construire` | `(partieId, numero, categorie, type)` | Construit une installation/guilde sur un secteur possédé, si emplacement libre | 241 |
| `deployerCube` | `(partieId, numero, type, quantite)` | Ajoute des cubes ; silencieux si invalide (fidèle à la RPC d'origine) | 288 |
| `rappelerCube` | `(partieId, numero, type)` | Retire 1 cube, erreur si stock insuffisant | 302 |
| `retirerCorruption` | `(partieId, numero)` | `corrompu = false` | 319 |
| `regrouper` | `(partieId, mouvements)` | Déplace de la Puissance Navale entre secteurs adjacents possédés (≤5 déplacements), 2 passes de validation | 336 |
| `envahirResoudre` | `(partieId, cible, sources, victoire, survivants)` | Persiste les conséquences d'une invasion (retrait unités, reprise Néant si secteur vidé, dépôt survivants + reset installations en victoire) | 421 |
| `obtenirSecteursEligiblesConstruction` | `(partieId, categorie)` | Secteurs possédés avec ≥1 emplacement libre | 506 |
| `obtenirSecteursEligiblesDefenseGuildeNeantAdjacent` | `(partieId)` | Secteurs du Néant adjacents à un secteur possédé, Installation+Guilde libres (Événement A/Cadre 1) | 588 |
| `placerDefenseGuildeNeantAdjacent` | `(partieId, numero)` | Place 1 Défense de Secteur + 1 Guilde de Scientifiques (revalide l'éligibilité) | 652 |
| `getEntretien` | `(partieId)` | Unités d'entretien dues (informatif) | 550 |

Helper clé : `appartientAuJoueur_(secteur)` (230) = `pnNeant === 0 &&
totalPn_(secteur) > 0`.

### 4.4 `js/focusService.js` — catalogue Focus (189 lignes)

**Rôle** : accès catalogue "Focus" — regroupe les lignes brutes en cartes
(famille + type), mise en place par maison, pool héroïque. Lit IndexedDB,
n'écrit jamais.

| Fonction | Paramètres | Description | Ligne |
|---|---|---|---|
| `obtenirCartesFocus` | — | Toutes les cartes, regroupées par `focus+type` | 167 |
| `obtenirFocusParFamille` | — | Cartes regroupées en `{focus: [cartes...]}` | 173 |
| `obtenirMiseEnPlace` | `(nomMaison)` | Par famille : la carte spécifique à la maison, sinon Standard | 184 |
| `obtenirPoolHeroique` | — | Cartes de type "Héroïque", triées | 185 |
| `obtenirNomsPoolHeroique` | — | Noms de famille des Focus héroïques disponibles | 186 |
| `obtenirCarteHeroiqueParNom` | `(nom)` | Carte héroïque complète par nom (erreur si absente) | 187 |

Shape "carte Focus" : `{id, focus, type ('Standard'|'Héroïque'|maison),
actions: [{action, cout, effet, texte}]}`.

### 4.5 `js/focusEngine.js` — moteur coût/effet PUR (621 lignes)

**Rôle** : interprète les opcodes JSON `cout`/`effet` d'une action Focus,
calcule l'état résultant sous forme de diff. Entièrement pur SAUF
`jouerActionEtPersister` (seule fonction non pure du fichier).

| Export | Paramètres | Description | Ligne |
|---|---|---|---|
| `resoudreAction` | `(plateauMaison, carte, action, demanderChoix)` | **Pure.** Résout Effet puis Coût (coût débité seulement si l'Effet réussit) ; retourne `{succes, journal, mutations, plateauMaisonApres}` | 529 |
| `resoudreEffet` | `(plateauMaison, effetJson, source, texteAction, demanderChoix)` | **Pure.** Réutilisée par `civilisationService.js` (effet de case, signe toujours +1) ; retourne `{succes, journal, mutations, etatResultat}` | 608 |
| `jouerActionEtPersister` | `(partieId, carte, action, demanderChoix)` | **Non pure** — lit `plateauMaison`, appelle `resoudreAction`, écrit via `GameService.majPlateauMaison`, empile via `AnnulationService.empiler` | 573 |
| `BONUS_COMMERCE` | (const, test) | Les 6 bonus fixes du livret Commerce | 185 |
| `CLES_SECTEUR_HORS_PERIMETRE` | (const, test) | Voir liste ci-dessous | 166 |
| `CLES_CIVILISATION_HORS_PERIMETRE` | (const, test) | Voir liste ci-dessous | 177 |

**Clés automatisées** (`resoudreCle_`, 232) : ressources simples
(`nourriture/energie/materiel/credit/science/influence/prime/liberation`),
clés `cube*` (agissent sur `cubeActif`), `deployer_cube_par_chantier`/
`deployer_cube`/`deploy_cube`/`deployer_cube_secteur_mere` (popup dédiée,
persistance via `SecteurService.deployerCube`), `ressource_choix`,
`choice`/`choix` (exclusif ou inclusif si "et/ou"), `choice_repeat`,
`gagner_commerce`, `regrouper`/`regroupe` (popup → `SecteurService.regrouper`),
`envahir`/`envahir_corrompu` (popup → `CombatService.resoudreInvasion` +
`SecteurService.envahirResoudre`), et les no-op silencieux
`sans_benefice_case`/`exclude`/`restriction`/`same_sector`/`meme_secteur`/
`tie_break`. Toute clé inconnue tombe dans un repli générique (journalisée,
jamais bloquante).

**Hors périmètre explicite** (journalisé `"⚠️ non automatisé"`, ne bloque
jamais) :
- `CLES_SECTEUR_HORS_PERIMETRE` (166-169) : `construire_installation`,
  `installation`, `etablir_guilde`, `guilde`, `rappeler_cube`,
  `retirer_corruption`, `effet_secteur`. Raison : RPC Postgres GAS sans code
  source jamais récupéré pour celles-ci, ou déjà couvertes par des boutons
  dédiés écran Secteurs (Construire/Rappeler un cube) plutôt que par le pont
  Focus.
- `CLES_CIVILISATION_HORS_PERIMETRE` (177-180) : `avancer_civilisation_
  societe/gouvernement/economie`, `avancer_civilisation`, `avance_rapide`,
  `avancer_civilisation_moins_avancee`, `avancer_piste_corrompue`. Bien
  implémenté dans `civilisationService.js`, mais uniquement via les boutons
  dédiés de l'écran Plat. maison — pas de pont automatique depuis une carte
  Focus.
- `produire_ressource`, `produire_deux_ressources`, tout préfixe `produire_*`
  : niveaux de production (Population × Guildes par secteur) non calculés
  automatiquement côté résolution Focus (ils LE sont côté affichage, voir
  `renderCubes_` §5.2).

### 4.6 `js/annulationService.js` — pile d'annulation (129 lignes)

**Rôle** : pile LIFO des actions Focus jouées, persistée (`pileAnnulation`,
survit à une fermeture accidentelle). Annuler = réécrire les valeurs `avant`
de chaque mutation, aucune logique métier "inverse" recalculée.

| Fonction | Paramètres | Description | Ligne |
|---|---|---|---|
| `empiler` | `(partieId, {source, mutations})` | Empile une action réussie ; purge la plus ancienne si `LIMITE_PAR_PARTIE` dépassée ; no-op si aucune mutation | 122 |
| `annulerDerniere` | `(partieId)` | Dépile + annule la dernière action, ré-appelable en chaîne | 123 |
| `viderPile` | `(partieId)` | Vide la pile d'une partie (appelé à chaque fin de cycle) | 124 |
| `obtenirPile` | `(partieId)` | Pile triée du plus ancien au plus récent | 125 |
| `compter` | `(partieId)` | Longueur de la pile | 126 |
| `LIMITE_PAR_PARTIE` | (constante) | `10` | 127 |

### 4.7 `js/civilisationService.js` — pistes de Civilisation (238 lignes)

**Rôle** : avancement des 3 pistes (Société/Gouvernement/Économie) + effet de
la case atteinte (réutilise `FocusEngine.resoudreEffet`), marqueurs
"Corrompue".

| Export | Paramètres | Description | Ligne |
|---|---|---|---|
| `PISTES` | (constante) | `['societe','gouvernement','economie']` | 39 |
| `NOM_PISTE` | (constante) | Map clé → libellé affiché | 40 |
| `NIVEAU_MAX` | (constante) | `7` | 43 |
| `avancerPiste` | `(partieId, nomMaison, piste, demanderChoix)` | Avance d'une case, résout l'effet, empile UNE entrée pour les deux mutations ; no-op si déjà au niveau max | 91 |
| `avancerPisteMoinsAvancee` | `(partieId, nomMaison, demanderChoix)` | Avance la piste au niveau le plus bas (égalité : Société > Gouvernement > Économie) | 149 |
| `definirCorruption` | `(partieId, piste, valeur)` | Coche/décoche "Corrompue" (aucun effet déclenché) | 162 |
| `avancerPisteCorrompue` | `(partieId)` | Avance la piste Corrompue SANS résoudre l'effet, puis décoche | 176 |
| `obtenirDetailPistes` | `(nomMaison)` | Détail complet (texte des 7 cases × 3 pistes) | 208 |

### 4.8 `js/combatService.js` — moteur de combat PUR (399 lignes)

**Rôle** : résolution Envahir/Escarmouche. Entièrement pur — aucune
dépendance, aucun DOM, aucun IndexedDB. La persistance des conséquences reste
hors périmètre de ce fichier (déléguée à `SecteurService.envahirResoudre`).

| Fonction | Paramètres | Description | Ligne |
|---|---|---|---|
| `NOMS_VAISSEAUX` | (constante) | `['Destroyers','Cuirassés','Sentinelles','Porte-Vaisseaux']` (= noms de technologie débloquante) | 47 |
| `vaisseauxDebloques` | `(partie)` | Types débloqués par les technologies du joueur | 69 |
| `construireCamp` | `(nom, corvette, destroyer, cuirasse, sentinelle, portevaisseau, defenseSecteur, estJoueur, partie)` | Construit un "camp" de combat | 106 |
| `totalNavale` | `(camp)` | Somme des 5 types de Puissance Navale | 126 |
| `resoudreCombat` | `(attaquant, defenseur)` | Résout Approche + Salves successives, mute les camps EN PLACE, retourne `{vainqueur, cubesRestants, log}` | 222 |
| `resoudreInvasion` | `(partie, unitesAttaquant, secteurCible)` | Construit les 2 camps, appelle `resoudreCombat`, ajoute `survivantsAttaquant` | 353 |

**Simplifications assumées** : aucun bonus nécessitant une dépense de
ressource en cours de combat (Missiles longue portée, Drones autonomes, Focus
"Bombarder") ; le choix du cube rappelé est automatisé (priorité fixe :
Corvette > Sentinelle > Destroyer > Porte-Vaisseaux > Cuirassé), jamais laissé
au joueur.

### 4.9 `js/scoreService.js` — fin de partie (185 lignes)

**Rôle** : calcul du barème Influence du Néant, détermination du vainqueur,
enregistrement + historique enrichi. Pas pur au sens PWA (passe par
`GameService`), mais logique de calcul elle-même pure.

| Export | Paramètres | Description | Ligne |
|---|---|---|---|
| `BAREME` | (constante) | Points par poste (voir ci-dessous) | 34 |
| `DIFFICULTES_INFLUENCE_BASE` | (constante) | `[60, 100, 140]` | 46 |
| `calculerInfluence` | `(compteurs)` | **Pure.** Détail + total Influence du Néant | 130 |
| `enregistrerFinDePartie` | `(partieId, scoreFinal, compteursInfluence)` | Calcule l'Influence, détermine le vainqueur (`scoreFinal > influenceTotal` strictement), persiste `finDePartie`/`terminee` | 137 |
| `getHistorique` | — | Liste enrichie (événements, technos, vainqueur) pour l'écran Historique | 165 |

`BAREME` (34-44, points/unité) : `secteursFaille:60`, `refugesIncomplets:20`,
`catastrophes:20`, `gardiens:10`, `technologiesConsommees:5`,
`crisesPermanentes:5`, `maisonsDechues:3`, `corruption:2`,
`populationNeant:1`.

### 4.10 Schéma de dépendances

```
db.js
 └─ catalogueSync.js
 └─ focusService.js
 └─ secteurService.js
     └─ gameService.js  (creerPartie → SecteurService.instancierSecteurs, FocusService.obtenirMiseEnPlace ;
                          choisirFocusHeroique → FocusService.obtenirCarteHeroiqueParNom ;
                          appliquerCadrePlacement → SecteurService.placerDefenseGuildeNeantAdjacent)
         └─ annulationService.js
         └─ focusEngine.js  (pur, sauf jouerActionEtPersister → DB + GameService + AnnulationService)
             └─ civilisationService.js  (→ GameService.majCivilisation/majPlateauMaison,
                                          → FocusEngine.resoudreEffet, → AnnulationService.empiler)
         └─ scoreService.js  (→ GameService.obtenirPartie/sauvegarderPartie/listerParties)
 └─ combatService.js  (indépendant, 100% pur — consommé par les popups liées à "envahir")
```

Côté écrans, `strategieService.js` appelle directement `SecteurService`
(`regrouper`/`deployerCube`/`envahirResoudre`/`obtenirSecteursEligiblesDefense
GuildeNeantAdjacent`) et `CombatService.resoudreInvasion` depuis ses popups
`demanderChoix` (§6) — ces actions ne repassent PAS par `focusEngine.js` pour
la persistance, seulement pour le calcul du coût/gain scalaire simple.

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

**`App` — API publique** (`return`, index.html:1763-1772) :

| Fonction | Paramètres | Rôle | Ligne |
|---|---|---|---|
| `afficherEcran` | `nom` | Bascule `hidden`/`.active` par suffixe d'id ; cas spécial `nom==='combat'` → appelle aussi `CombatVueService.afficher` | 754 |
| `afficherPartieCreee` | `partie` | Alias legacy conservé pour `setupService.js` → délègue à `ouvrirPartie` | 1757 |
| `ouvrirPartie` | `partie` | Point d'entrée commun : `partieCourante`, affiche la nav, rend les 4 écrans "partie", appelle `StrategieService.afficher`+`CombatVueService.afficher`, bascule sur `plateau-galactique` | 1743 |
| `getPartieCourante` | — | Retourne `partieCourante` en mémoire | 767 |
| `rafraichirPartieCourante` | — | Recharge depuis IndexedDB, **ne rend rien** | 776 |
| `renderPlateauGalactique` | `partie` | Alias public de `renderEcranPlateauGalactique_` | 813 |
| `renderPlateauMaison` | `partie` | Alias public de `renderEcranPlateauMaison_` | 968 |
| `renderSecteurs` | `partie` | Alias public de `renderEcranSecteurs_` | 1704 |

**⚠️ Le gotcha "rafraîchissement explicite"** — `App.afficherEcran` est
**purement visuel** (toggle `hidden`/`.active`, aucun re-rendu, sauf le cas
spécial Combat). Conséquence : **toute mutation d'état doit explicitement
rappeler les fonctions de rendu concernées après persistance**, changer
d'onglet seul ne rafraîchit rien.
- `StrategieService.afficher(partie)` rafraîchit Focus + Plat. maison en
  entier (ressources, cubes, gloire, civilisation, Focus joueur/héroïques) —
  appelée après quasiment toute action mutante.
- Plat. Galactique / Plat. maison / Secteurs (`renderEcranPlateauGalactique_`
  / `renderEcranPlateauMaison_` / `renderEcranSecteurs_`) ne sont PAS
  couverts par `StrategieService.afficher` et doivent être rappelés
  explicitement là où leurs données changent.
- `screen-mise-en-place` est rendu une seule fois à l'ouverture, contenu figé
  par design.
- **Bug historique documenté** (index.html, commentaire Lot F) : des
  fonctions de rendu privées (`_`) appelées depuis une closure DIFFÉRENTE de
  celle où elles sont définies produisent un `ReferenceError` silencieux
  (avalé par un `.catch` générique), visible seulement comme une alerte
  trompeuse. **Règle à respecter pour tout nouveau code** : un appel
  cross-closure à un rendu d'écran doit toujours passer par l'alias public
  `App.render*`, jamais par le nom privé `_`.

**`#modal-choix`** (index.html:517-526) : markup unique et partagé
(`.modal-overlay > .modal-box > {h3#modal-choix-titre, div#modal-choix-
contenu, div.modal-actions > {btn Annuler, btn Valider}}`), déclaré dans
`index.html` mais entièrement piloté par `StrategieService.demanderChoix`
(§6). Une seule ouverture possible à la fois (nœuds DOM uniques, pas de file
d'attente).

**Autres fonctions de rendu notables** (non exhaustif, voir le fichier pour
le détail) : `renderEcranPlateauGalactique_` (813), `renderTechnologiesAvancees_`
(891), `renderEcranPlateauMaison_` (968), `renderTechnologiesObtenues_` (1036),
`renderCadresEvenement_` (1299), `renderObjectifsEvenement_` (1418),
`renderEvenementCycle_` (1450), `renderEcranSecteurs_` (1704),
`renderFormulaireConstruire_` (1587), `renderFormulaireRappelerCube_` (1644).

### 5.2 `js/strategieService.js` — le plus gros module écran (2117 lignes)

**Rôle** : possède le contenu dynamique de Plat. maison (ressources, jetons/
cubes/gloire, pistes Civilisation) et Focus (journal, cartes Focus jouables,
bandeau de rappel), + la sélection des Focus héroïques sur Plat. Galactique.
Seul propriétaire de la modale générique `demanderChoix` (§6), consommée à la
fois par `focusEngine.js` (via le paramètre `demanderChoix` passé en
callback) et par `index.html` (cadres d'Événement galactique).

**API publique** (`return`, 2113-2116) :

| Fonction | Paramètres | Rôle | Ligne |
|---|---|---|---|
| `afficher` | `partie` | Rafraîchit tous les blocs possédés (voir §5.1) ; réinitialise `journal`/`soldeDebutCycle` si partie/cycle changent | 2072 |
| `demanderChoix` | `contexte` | Dispatcher générique de modale — catalogue complet en §6 | 1292 |

**Rendus clés** : `champRessourceHTML_`/`renderRessources_` (grille 6
colonnes : pastille/Niveau/→/Revenu/Stock éditable/Delta, 485/518),
`renderRappelRessources_` (bandeau fixe, 568), `renderJetons_` (Commerce/
Prime/Libération, 619), `renderCubes_` (recalcule les niveaux de production
Population×Guildes+bonus origine depuis `SecteurService.obtenirSecteurs`,
659), `renderGloire_`/`renderGloireDOM_` (5 emplacements cliquables, 727/737),
`carteFocusJoueurHTML_` (gabarit carte Focus, 1030), `renderFocusJoueur_`
(1060), `renderFocusHeroiquesJoueur_` (1085), `renderFocusHeroiques_`
(sélection cycle, 1141), `jouerAction_` (joue une action via
`FocusEngine.jouerActionEtPersister`, 1213).

**Tables de couleurs/libellés** (dupliquées en partie ailleurs, voir §13) :
`CHAMP_RESSOURCE` (259, 5 ressources principales + couleur hex),
`RESSOURCES_PRODUCTION` (266), `RESSOURCES_TOUTES` (274, superset incluant
influence/commerce/prime/liberation/cubes — utilisé UNIQUEMENT par les
pastilles de coût, volontairement pas fusionné avec `CHAMP_RESSOURCE`),
`TYPES_VAISSEAU` (366), `LIBELLES_OPTIONS` (421, vocabulaire des popups de
choix), `couleurCout_`/`abregeCout_` (972/979, fonctions de résolution
couleur/libellé abrégé pour les pastilles de coût).

### 5.3 `js/combatVueService.js` (158 lignes)

**Rôle** : `screen-combat` — calculateur Envahir/Escarmouche indépendant de
`focusEngine.js`/`annulationService.js` : ne persiste jamais rien, le joueur
applique le résultat manuellement.

| Fonction | Paramètres | Rôle | Ligne |
|---|---|---|---|
| `afficher` | `partie` | (Ré)initialise l'écran (conserve le mode courant, re-rend) — appelée depuis `App.ouvrirPartie` et à chaque clic sur l'onglet Combat | 148 |

DOM : `#combat-champs-attaquant`/`-defenseur`, `#combat-resultat`,
`#mode-envahir`/`#mode-escarmouche`.

### 5.4 `js/scoreVueService.js` (116 lignes)

**Rôle** : `screen-fin` — formulaire de score final + calculateur Influence
du Néant (aperçu ; le calcul faisant foi est celui de
`ScoreService.enregistrerFinDePartie`). **API publique vide** (`return {}`)
— module entièrement auto-câblé au chargement (écouteurs sur `#btn-terminer-
partie`, `#btn-retour-fin`, `#btn-enregistrer-fin`, `#influence-difficulte`).

### 5.5 `js/historiqueVueService.js` (218 lignes)

**Rôle** : `screen-historique` — liste enrichie (date, statut/score, badge
vainqueur, événements/technologies), actions par carte (reprendre/archiver/
supprimer) + suppression en masse des non-archivées.

| Fonction | Paramètres | Rôle | Ligne |
|---|---|---|---|
| `ouvrirHistorique` | — | Bascule sur l'écran, charge `ScoreService.getHistorique()`, rend les cartes, câble les actions (aussi auto-câblée sur `#btn-historique`) | 173 |

### 5.6 `js/setupService.js` (349 lignes)

**Rôle** : `screen-setup` — formulaire de création de partie (mode manuel/
aléatoire, maison/difficulté, sous-formulaire "reproduire une partie physique
en cours" avec technologie de départ, 4 maisons déchues sans doublon, 3
technologies sans point avec compteur/verrou).

| Fonction | Paramètres | Rôle | Ligne |
|---|---|---|---|
| `init` | — | Câble TOUS les écouteurs de cet écran (bascules mode, listes maisons déchues, `#btn-lancer-partie` → `GameService.creerPartie` puis `App.afficherPartieCreee`) ; appelée une fois en fin de bootstrap d'`index.html` | 263 |

---

## 6. Système de modale générique (`StrategieService.demanderChoix`)

`demanderChoix(contexte)` (js/strategieService.js:1292-2065) est le point
d'entrée UNIQUE pour tout choix nécessitant une interaction joueur — utilisé
par `focusEngine.js` (paramètre callback), par `civilisationService.js` et
par `index.html` (cadres d'Événement galactique). Retourne toujours une
`Promise`. Catalogue complet des `contexte.type` :

| `type` | Rôle | `resolve(...)` | Persiste elle-même ? | Ligne |
|---|---|---|---|---|
| `option_exclusive` | Choisir une option (liste de boutons) | `{indexChoisi}` ou `{annule:true}` | Non | 1301 |
| `options_inclusives` | Choisir 0-N options (cases à cocher) | `number[]` (indices) | Non | 1317 |
| `ressource_choix` | Choisir N ressources une à une (gain/dépense), arrêt anticipé possible | `string[]` (clés ressource) | Non | 1333 |
| `confirmation` | Confirmation générique oui/non (pas de sélection) | `{confirme:true}` ou `{annule:true}` | Non | 1357 |
| `bonus_commerce` | Choisir un bonus (liste de libellés bruts) | `{indexChoisi}` ou `{annule:true}` | Non | 1372 |
| `regrouper` | Déplacer de la Puissance Navale entre secteurs adjacents possédés (≤5), constructeur multi-lignes | `{deplacements, detail, mouvements}` ou `{annule:true}` | **Oui** — `SecteurService.regrouper` appelé dans la popup | 1388 |
| `deployer_cube` | Déployer du Cube actif en Flotte (3 modes) | `{totalCubes, coutParRessource, detail, mouvements}` ou `{annule:true}` | **Oui** — `SecteurService.deployerCube` par ligne (ressources/cubeActif restent gérés par `focusEngine.js`) | 1544 |
| `envahir` | Flux complet d'invasion (cible Néant/Maison déchue/Corrompu, engagement multi-source, résolution combat) | `{victoire, jetonPrime, jetonLiberation, influenceGagnee, totalEngage, detail, avertissement}` ou `{annule:true}` | **Oui, largement** — `CombatService.resoudreInvasion` puis `SecteurService.envahirResoudre` ; persiste aussi directement le jeton Gloire (array), hors flux d'annulation | 1749 |
| `placement_secteur_neant_adjacent` | Choisir un secteur du Néant adjacent éligible (Installation+Guilde libres) | `{numero}` ou `{annule:true}` | Non — sélection seule, l'appelant (`index.html`) persiste via `GameService.appliquerCadrePlacement` | 2009 |
| *(inconnu)* | Repli non bloquant, log un avertissement console | `{annule:true}` | Non | 2055 |

Pattern commun à chaque branche : `titre.textContent`, `contenu.innerHTML`,
affiche/masque `btnValider`/`btnAnnuler`, câble leurs listeners pour
`resolve(...)` + `fermerModale_()`, puis `modal.hidden = false` en toute fin
de `demanderChoix` (après le `if/else if`).

---

## 7. `css/style.css` — carte structurelle (1565 lignes)

Aucune media query dans le fichier — la gestion mobile passe par un scroll
horizontal de la nav (`.nav-ecrans`) plutôt que des breakpoints. Variables
CSS sur `:root` (128-150) : `--color-bg/-surface/-surface-2/-border`
(palette violet sombre), `--color-nebula-1/-2` (accents dégradé), `--color-
coral/-coral-dim` (seul accent chaud, réservé aux actions/sélection),
`--color-text/-text-muted`, `--radius` (16px), `--radius-sm` (10px),
`--font-display`, `--font-body`.

| Lignes | Famille | Description |
|---|---|---|
| 1-126 | En-tête | Changelog versionné (v14) |
| 128-163 | `:root`, reset | Variables CSS, reset boîte, base html/body |
| 164-195 | `.starfield`/`.nebula-glow` | Décor de fond (étoiles + halo nébuleuse) |
| 196-234 | `#app`, `.topbar*` | Coquille app, barre de titre cliquable |
| 235-237 | `.screen` | Mécanisme show/hide (`[hidden]`) |
| 238-260 | `.section-title`, `.hint*` | Titres de section, texte d'aide |
| 262-325 | Boutons | `.btn`/-primary/-secondary/-danger/-toggle(.active), `.mode-toggle` |
| 327-372 | `.setup-bloc*` | Blocs de formulaire "Créer une partie" |
| 374-412 | Cartes | `.card`, `.card-joueur`, `.card-list` |
| 413-472 | En-tête Plateau Galactique | `.plateau-galactique-entete`, `.titre-cycle` |
| 474-557 | **Cadres/Objectifs Événement galactique** | `.cadre-carte(-obligatoire/-optionnel)`, `.cadre-entete/-texte/-statut/-actions`, `.btn-cadre-technologie`, `.cadre-input-proportionnel`, `.objectif-bloc/-separateur/-ligne` |
| 559-657 | Mise en place manuelle | `.case-mise-en-place-manuelle`, `.techno-sans-point-*` |
| 658-677 | `.resultat-partie-creee` | Confirmation post-création |
| 678-736 | Table Secteurs + nav | `.table-secteurs`(`.ligne-corrompue`), `.barre-navigation-partie`/`.nav-ecrans` |
| 737-1043 | **Ressources / Civilisation** | `.ressources-liste`, `.ressource-case*`, `.ressources-cubes`, `.ressources-gloire`/`.gloire-emplacements/-jeton(.actif)`, `.plateau-influence`, `.ressources-journal`, `.bloc-annulation*`, `.pistes-civilisation-liste`/`.piste-civilisation-*` |
| 930-968 | `#screen-focus` | `.rappel-ressources-footer` (bandeau fixe) |
| 1044-1093 | Technologies | `.check-amelioree`, `.techno-obtenue-ligne`, `.champ-technologie-fixe` |
| 1094-1218 | **Cartes Focus & badges** | `.focus-card`/`.focus-id`/`.focus-action*`, `.pastille-cout`, `.btn-jouer-action`, `.focus-action-insuffisant`, `.badge`/-type-* |
| 1219-1286 | **Modale générique** | `.modal-overlay(.hidden)`, `.modal-box`, `.modal-choix-boutons/-cases/-case`, `.modal-actions` |
| 1287-1319 | Popup Regrouper | `.regrouper-liste`, `.btn-lien`, `.regrouper-form` |
| 1320-1361 | **Combat** | `.combat-colonnes`, `.combat-champ`, `.combat-actions`, `.combat-resultat` |
| 1363-1512 | Fin de partie & grille ressources | `.form-grid`, `.field(-points)`, `.field-ressource*` (grille 6 colonnes), `.jeton-champ/-input`, `.total-influence` |
| 1513-1565 | **Historique** | `.historique-item`, `.badge-tag/-sans-point/-vainqueur(-joueur/-neant/-egalite)`, `.historique-liste/-badges` |

---

## 8. PWA — Service Worker & versioning

### 8.1 Fichiers cachés (`FICHIERS_A_METTRE_EN_CACHE`, service-worker.js:74-109)

32 entrées : `./`, `./index.html`, `./manifest.json`, `./version.js`,
`./css/style.css`, les 16 modules `js/*.js` (hors `*.test.js`/`_test.js`,
jamais expédiés en prod), les 12 `data/catalogue/*.json`, `./icons/icon-192.png`,
`./icons/icon-512.png`.

### 8.2 Stratégie : cache-first strict

`fetch` handler (143-153) : `caches.match(request)` d'abord ; réseau
uniquement si absent du cache. Pas de revalidation, pas de stale-while-
revalidate (choix assumé pour la simplicité, voir en-tête du fichier).

### 8.3 Mécanisme de cache-busting

```js
importScripts('./version.js');
var CACHE_NOM = 'voidfall-companion-' + APP_VERSION;   // version.js: APP_VERSION = '20260818.5'
```
`install` : `caches.open(CACHE_NOM)` + `cache.addAll(...)` + `self.skipWaiting()`.
`activate` : supprime tous les caches ≠ `CACHE_NOM` + `self.clients.claim()`.

### 8.4 ⚠️ Gotcha de mise à jour (documenté dans le repo lui-même)

Citation directe de `service-worker.js:60-67` :
> « IMPORTANT — condition de mise à jour : Le navigateur ne réinstalle ce
> Service Worker que s'il détecte que CE FICHIER a changé (comparaison
> octet à octet). [...] il suffit d'incrémenter APP_VERSION à chaque push
> qui modifie un fichier mis en cache pour que ce fichier change aussi, et
> donc que le Service Worker soit réinstallé. »

Et `version.js:12-16` (règle explicite) :
> « RÈGLE : incrémenter cette valeur à CHAQUE push qui modifie un fichier
> mis en cache par service-worker.js [...] Sans ce changement, le Service
> Worker n'est jamais réinstallé et l'ancien contenu reste servi
> indéfiniment. »

**En pratique, testé en session (18/08/2026)** : éditer `version.js` seul ne
suffit PAS toujours à faire réinstaller le Service Worker dans un onglet déjà
ouvert — le byte-diff porte sur `service-worker.js` lui-même, et le cache
HTTP du navigateur peut réutiliser une réponse `fetch()` mise en cache pour
les fichiers importés (`js/*.js` récupérés pendant `cache.addAll`). **Pour
tester un changement de code localement de façon fiable** : soit
`navigator.serviceWorker.getRegistrations()` → `unregister()` +
`caches.keys()` → `caches.delete()` puis recharger, soit servir depuis un
port différent (nouvelle origine = HTTP cache et Service Worker vierges).
Toujours incrémenter `APP_VERSION` à chaque changement de fichier caché
(règle du projet), mais ne pas compter dessus seul pour valider en local.

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
- **Niveaux de production** (`produire_ressource`/`produire_*`) non calculés
  automatiquement lors de la résolution d'une action Focus (ils le sont côté
  affichage uniquement, `renderCubes_`).
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

- **Modules purs testés, existants** : `js/focusEngine.test.js` (426 l.,
  couvre aussi `annulationService.js`), `js/gameService_cycle_focus_
  technologie.test.js` (276 l.), `js/gameService_evenements_technologie.test.js`
  (256 l.), `js/gameService_technologies_avancees_test.js` (277 l., ⚠️
  convention de nommage incohérente — `_test.js` sans point, à corriger si
  l'occasion se présente), `js/secteurService_actions.test.js` (342 l.).
  Chaque fichier charge les VRAIS fichiers sources dans un contexte `vm` avec
  une IndexedDB factice en mémoire (`get`/`getAll`/`put`/`supprimer`) quand
  le module en dépend. Exécution : `node <fichier>.test.js` ou
  `node --test` (racine `js/`), zéro dépendance npm. Écrits et exécutés
  AVANT toute livraison.
- **Non testés actuellement** (malgré une intention documentée
  précédemment) : `civilisationService.js`, `combatService.js`,
  `scoreService.js` — aucun fichier `*.test.js` dédié n'existe pour ces
  trois modules au 18/08/2026, alors qu'ils sont "purs" ou quasi-purs et
  candidats naturels au même pattern. À considérer en dette de test.
- **Bout en bout** (décidé Session 9, implémentation reportée) : même
  pattern DB factice, un seul fichier chargeant TOUS les services réels
  ensemble et enchaînant un scénario de partie complet (création → actions
  Focus → annulation → Civilisation → Combat → fin de partie → historique).
  Ne couvre pas le DOM ni le Service Worker.
- **Écarté** : navigateur headless (Playwright/Puppeteer) — casserait le
  principe "zéro dépendance npm" du projet, plus lourd à faire tourner sans
  CI dédiée.

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

---

## 13. Dette / incohérences connues (relevées lors de la réécriture du 18/08/2026)

- **Référence morte** : `docs-migration-pwa-plan.md` cité par
  `service-worker.js`/`version.js`/l'ancienne version de ce document
  n'existe plus dans le repo (voir note en tête de document).
- **Tables couleur/libellé dupliquées** entre `index.html` (`LABEL_RESSOURCE_
  CADRE_`, `LABEL_ELEMENT_PLACEMENT_`, `COULEUR_SCIENCE_CADRE_`,
  `LABEL_GUILDE`, `LABEL_INSTALLATION`, `LABEL_PN`, `TYPES_INSTALLATION`,
  `TYPES_GUILDE`, `TYPES_VAISSEAU`) et `js/strategieService.js`
  (`CHAMP_RESSOURCE`, `RESSOURCES_TOUTES`, `TYPES_VAISSEAU`) — aucune n'est
  exposée publiquement par `strategieService.js`, donc `index.html` ne peut
  que dupliquer les valeurs (ex. `COULEUR_SCIENCE_CADRE_ = '#06afe5'` doit
  rester manuellement synchronisée avec `CHAMP_RESSOURCE.science.couleur`).
  À surveiller si une couleur/un libellé change un jour d'un seul côté.
- **`scoreVueService.js`** : `#btn-retour-fin` appelle
  `App.afficherEcran('game')` — `screen-game` n'existe plus depuis la
  restructuration en écrans séparés (Mise en place/Plat. Galactique/Plat.
  maison), probablement du code mort silencieux (aucun écran ne correspond
  au suffixe `'game'`).
- **`scenarioTrousDeVer.json`** est un tableau vide — la mécanique "trou de
  ver" a un store/une jointure prête côté catalogue mais n'est utilisée par
  aucun scénario ni aucun code de résolution actuellement.
- **Couverture de test partielle** : voir §11 — `civilisationService.js`,
  `combatService.js`, `scoreService.js` n'ont pas de fichier de test dédié
  malgré leur nature (quasi-)pure.
- **Convention de nommage des tests incohérente** : `js/gameService_
  technologies_avancees_test.js` utilise `_test.js` (sans point) alors que
  les 4 autres fichiers de test utilisent `.test.js`.
