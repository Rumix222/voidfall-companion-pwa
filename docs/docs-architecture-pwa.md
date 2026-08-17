# Architecture PWA — Voidfall Companion
Version 2 — 17/08/2026 (Session 14 : mise à jour §2 après portage
Regrouper/Déployer des cubes/Envahir)

Document de référence détaillé. Voir docs-migration-pwa-plan.md pour
l'avancement (§0) et l'historique des décisions.

---

## 1. Structure du repo (racine, servie telle quelle par GitHub Pages)

```
index.html                  # coquille unique : écrans en <section class="screen"> cachés
manifest.json
service-worker.js           # cache-first strict, liste FICHIERS_A_METTRE_EN_CACHE
version.js                  # APP_VERSION, source de vérité du cache
css/
  style.css
js/
  db.js                     # wrapper IndexedDB générique (get/getAll/put/putTout/supprimer/vider)
  catalogueSync.js          # import Supabase -> IndexedDB (catalogue, lecture seule)
  gameService.js            # cycle de vie de partie (créer/lire/lister/sauvegarder/
                             # archiver/supprimer, majPlateauMaison, majCivilisation)
  secteurService.js         # plateau des secteurs — mise en place/lecture + actions
                             # (construire/deployerCube/rappelerCube/retirerCorruption/
                             # regrouper/envahirResoudre/getEntretien — voir §2)
  focusService.js           # catalogue Focus (mise en place par maison, pool héroïque)
  focusEngine.js            # moteur PUR coût/effet des cartes Focus (aucun DOM, aucun
                             # IndexedDB) — voir §2 pour les clés hors périmètre restantes
  annulationService.js      # pile LIFO d'annulation (10 actions/partie, à vider en fin
                             # de cycle une fois avancerCycle porté)
  civilisationService.js    # avancement des pistes de Civilisation + effet de case
                             # (réutilise FocusEngine.resoudreEffet)
  combatService.js          # moteur de combat PUR (Envahir/Escarmouche)
  combatVueService.js       # écran Combat (DOM)
  scoreService.js           # fin de partie (score + barème Influence du Néant), historique enrichi
  scoreVueService.js        # écran Fin de partie (DOM)
  historiqueVueService.js   # écran Historique (DOM)
  strategieService.js       # écran Stratégie (DOM) — ressources, Focus jouables, Civilisation,
                             # modale de choix générique (demanderChoix : option_exclusive/
                             # options_inclusives/ressource_choix/bonus_commerce/regrouper/
                             # deployer_cube/envahir)
  setupService.js           # écran Créer une partie (DOM)
icons/
```

Convention constante : IIFE, suffixe `_` pour les fonctions privées,
français partout, un module "pur" (aucun DOM/IndexedDB direct) séparé de
son écran (DOM) quand la logique le justifie — voir focusEngine.js/
strategieService.js et combatService.js/combatVueService.js comme modèles.

---

## 2. Clés Coût/Effet du moteur Focus (focusEngine.js)

**Portées et automatisées** (Session 14) : `regrouper`/`regroupe`,
`deployer_cube`/`deploy_cube`/`deployer_cube_par_chantier`/
`deployer_cube_secteur_mere`, `envahir`/`envahir_corrompu`. Chacune ouvre
une popup dédiée (`demanderChoix`, implémentation DOM dans
`strategieService.js`) qui persiste directement via `SecteurService`
(`regrouper`/`deployerCube`/`envahirResoudre`) et, pour Envahir, résout le
combat via `CombatService.resoudreInvasion` avant persistance. Les
mutations scalaires du plateau maison (ressources, cubeActif, jetons,
influence) restent appliquées côté `focusEngine.js` (pur, diffable,
annulable) ; le jeton Gloire (array) est en revanche persisté directement
par la popup, hors du flux d'annulation (même pattern que le clic manuel
sur un emplacement Gloire).

**Encore hors périmètre**, journalisées `"⚠️ non automatisé"` sans jamais
bloquer l'action :
- **Actions secteur** : `construire_installation`/`installation`,
  `etablir_guilde`/`guilde`, `rappeler_cube`, `retirer_corruption`,
  `effet_secteur`. Raison : RPC Postgres GAS sans code source jamais
  récupéré pour celles-ci, ou déjà couvertes par des boutons dédiés écran
  Secteurs (Construire/Rappeler un cube, Session 13) plutôt que par le
  pont Focus.
- **`avancer_civilisation_*` DEPUIS une carte Focus** : avancement des
  pistes bien implémenté (`civilisationService.js`), mais uniquement via
  les boutons dédiés de l'écran Stratégie — pas de pont automatique.
- **`produire_ressource`, `produire_deux_ressources`, `produire_*`** :
  niveaux de production (population × guildes par secteur) non calculés
  côté PWA.
- **Défausse de Gloire pour secteur source abandonné** (repris par le
  Néant lors d'une invasion) et **résolution immédiate des jetons Prime/
  Libération gagnés** : simplement journalisées/créditées comme
  compteurs, pas de popup dédiée (voir Session 14).

---

## 3. Stratégie de test

- **Modules purs** (`focusEngine`, `civilisationService`, `combatService`,
  `scoreService`, futurs modules similaires) : un fichier `<nom>.test.js`
  dédié, `node:test` + `vm` (aucune dépendance npm). Charge les VRAIS
  fichiers sources dans un contexte `vm`, avec une DB IndexedDB factice en
  mémoire (`get`/`getAll`/`put`/`supprimer`) quand le module en dépend.
  Écrit et exécuté (`node --test`) AVANT toute livraison.
- **Bout en bout** (décidé Session 9, implémentation reportée) : même
  pattern DB factice, mais un seul fichier qui charge TOUS les services
  réels ensemble (`gameService`, `secteurService`, `focusService`,
  `focusEngine`, `annulationService`, `civilisationService`,
  `combatService`, `scoreService`) et enchaîne un scénario de partie
  complet (création → actions Focus → annulation → Civilisation → Combat
  → fin de partie → historique). Ne couvre pas le DOM ni le Service
  Worker (`index.html`, écrans `*VueService.js`, `service-worker.js`).
- **Écarté** : navigateur headless (Playwright/Puppeteer) — couvrirait le
  DOM en plus, mais casserait le principe "zéro dépendance npm" déjà en
  place sur tout le projet, et plus lourd à faire tourner sans
  environnement CI dédié.
