# Voidfall Companion PWA

Compagnon web (français) du jeu de plateau **Voidfall**, mode solo. Aide à
suivre l'état d'une partie physique (ressources, secteurs, cycles,
Événements galactiques, combat, score) — ne remplace pas le plateau
physique. Doc complète et à jour : [`docs/docs-architecture-pwa.md`](docs/docs-architecture-pwa.md).
Règles du jeu annotées : `docs/docs-rules-*.md`.

## Stack — contraintes à respecter

- **Vanilla JS, zéro build, zéro dépendance npm au runtime.** Pas de React/
  Vue/bundler. L'app livrée (tout ce que `service-worker.js` met en cache)
  reste 100 % vanilla JS servie telle quelle. `package.json` existe
  uniquement pour l'outillage de test (Playwright, voir § Tests E2E
  ci-dessous) — ce sont des `devDependencies`, jamais chargées par
  `index.html` ni par le Service Worker. N'ajoute pas de dépendance
  runtime sans demande explicite.
- **IIFE + suffixe `_`** : chaque module est `var X = (function(){'use
  strict'; ...; return {...};})();`. Privé = suffixe `_`. Respecte ce
  pattern pour tout nouveau code.
- **Français partout** : identifiants, commentaires, UI, messages d'erreur.
- **IndexedDB** (`js/db.js`) = seule persistance. Catalogue de règles =
  JSON statique bundlé (`data/catalogue/*.json`), jamais d'API réseau au
  runtime.
- **PWA offline** via Service Worker cache-first strict.

## ⚠️ Piège n°1 : le cache du Service Worker

Toute modif d'un fichier listé dans `FICHIERS_A_METTRE_EN_CACHE`
(`service-worker.js`) — donc `index.html`, `css/style.css`, tout `js/*.js`,
tout `data/catalogue/*.json` — **doit s'accompagner d'un incrément de
`APP_VERSION`** dans `version.js` (format `AAAAMMJJ.N`), sinon le Service
Worker n'est jamais réinstallé.

**Mais ça ne suffit pas toujours pour tester en local** : le byte-diff du
navigateur porte sur `service-worker.js` lui-même, pas sur `version.js`
importé. Pour valider un changement dans le navigateur (Browser pane) :
1. Servir depuis un **port frais** (nouvelle origine = cache HTTP + SW
   vierges) — le plus fiable, à privilégier.
2. Sinon : `navigator.serviceWorker.getRegistrations()` → `unregister()`
   chaque registration, `caches.keys()` → `caches.delete()` chaque entrée,
   puis recharger.

## ⚠️ Piège n°2 : rafraîchissement d'écran non automatique

`App.afficherEcran(nom)` (`index.html`) ne fait que basculer `hidden`/
`.active` — **aucun re-rendu automatique** (seule exception : l'onglet
Combat). Toute action qui mute l'état doit **explicitement rappeler** les
fonctions de rendu concernées après persistance :
- `StrategieService.afficher(partie)` → Focus + Plat. maison en entier.
- `App.renderPlateauGalactique(partie)` / `App.renderPlateauMaison(partie)` /
  `App.renderSecteurs(partie)` → à rappeler explicitement si l'action
  touche respectivement l'Événement galactique/Technologies, le plateau
  maison, ou les secteurs.
- Un appel cross-fichier à une fonction de rendu **doit** passer par
  l'alias public `App.render*` (jamais le nom privé `_`) — un appel direct
  au nom privé depuis un autre closure produit un `ReferenceError`
  silencieux (bug déjà rencontré, voir §5.1 de la doc archi).

## Carte rapide des fichiers

| Je dois modifier... | Fichier |
|---|---|
| Cycle de vie de partie, cadres/objectifs d'Événement galactique, technologies, Focus héroïques | `js/gameService.js` |
| Plateau des secteurs (construire, envahir, regrouper, déployer un cube, placement d'Événement) | `js/secteurService.js` |
| Coût/Effet d'une carte Focus (ce qui est automatisé) | `js/focusEngine.js` (moteur pur) |
| Catalogue Focus (cartes par maison/héroïque) | `js/focusService.js` |
| Écran Plat. maison / Focus / la modale de choix générique (`demanderChoix`) | `js/strategieService.js` (2100+ lignes — le plus gros fichier) |
| Combat (calculateur Envahir/Escarmouche) | `js/combatService.js` (pur) + `js/combatVueService.js` (DOM) |
| Pistes de Civilisation | `js/civilisationService.js` |
| Annulation d'action Focus | `js/annulationService.js` |
| Fin de partie / Historique | `js/scoreService.js` + `js/scoreVueService.js` / `js/historiqueVueService.js` |
| Création de partie | `js/setupService.js` |
| Écrans/nav/App/modale (markup + orchestration) | `index.html` (~1900 lignes, tout est dans un `<script>` embarqué) |
| Style | `css/style.css` (pas de media queries, mobile = scroll horizontal de la nav) |
| Données de règles (maisons, technos, focus, événements, secteurs...) | `data/catalogue/*.json` — voir §3 de la doc archi pour le schéma de chacun |
| Schéma IndexedDB | `js/db.js` (`STORES`, source de vérité) |

## Workflow attendu pour une évolution

1. Lire la section pertinente de `docs/docs-architecture-pwa.md` (table des
   matières en tête) plutôt que d'explorer le code à l'aveugle.
2. Repérer le module "pur" concerné (s'il existe) vs son écran DOM — la
   logique de calcul va dans le pur, le rendu/les listeners dans l'écran.
3. Implémenter en suivant le pattern déjà en place pour un cas similaire
   (ex. un nouveau type de `contexte.type` pour `demanderChoix` : copier un
   cas existant proche — `placement_secteur_neant_adjacent` ou
   `confirmation` sont de bons modèles récents et simples).
4. Si un fichier caché par le Service Worker a changé → incrémenter
   `APP_VERSION` (`version.js`) et ajouter une entrée au changelog en tête
   de ce fichier (convention systématique du projet).
5. Tester dans le Browser pane (voir Piège n°1 pour éviter le cache).
6. Si le module touché est pur et a un fichier `*.test.js`, lancer
   `node <fichier>.test.js` avant de livrer.

## Tests

`node --test` ou `node <fichier>.test.js` directement — zéro dépendance
npm, charge les vrais fichiers sources via `vm` avec une IndexedDB factice.
Fichiers existants : `js/focusEngine.test.js`,
`js/gameService_cycle_focus_technologie.test.js`,
`js/gameService_evenements_technologie.test.js`,
`js/gameService_technologies_avancees_test.js`,
`js/secteurService_actions.test.js`, `js/civilisationService_test.js` et
plusieurs autres `*_test.js`/`test_*.js` (convention de nommage pas
encore unifiée — `node --test` seul ne matche que `*.test.js`, lancer les
autres individuellement). Pas de test pour `combatService.js`/
`scoreService.js` (dette connue, `combatService.js` en priorité vu la
complexité de sa logique de résolution).

## Tests E2E (Playwright)

Complète les tests ci-dessus (moteur pur, IndexedDB factice) par un
parcours dans un **vrai navigateur** : DOM réel, `index.html`,
`service-worker.js`, tous les écrans. Seul moyen d'attraper les bugs de
rendu/navigation (Piège n°2, écran qui reste vide après un clic) qu'un
test de moteur pur ne peut pas voir.

- `devDependencies` uniquement (`package.json`, `node_modules/` — jamais
  livrés, jamais dans le cache du Service Worker). `npm install` puis
  `npx playwright install chromium` pour l'installation initiale.
- `npm run test:e2e` (ou `npm run test:e2e:ui` en mode interactif) lance
  les scénarios de `e2e/*.spec.js` contre le serveur de dev
  (`python -m http.server`, démarré automatiquement par
  `playwright.config.js` si besoin).
- Chaque test démarre avec un contexte navigateur neuf (IndexedDB/cache
  vides, aucun Service Worker déjà enregistré) — pas besoin de gérer le
  Piège n°1 manuellement dans ces tests.
- `e2e/partie-complete.spec.js` : smoke test léger (création de partie +
  navigation sur tous les écrans), fait partie de `npm run test:e2e`.
- `e2e/partie-aleatoire.spec.js` (`npm run test:e2e:aleatoire`, ~2-3 min
  pour les 14 maisons) : joue une partie complète semi-aléatoire (3
  cycles + fin de partie — Événement, Cadres, 3 Focus héroïques, 1
  technologie, 2 actions Focus par cycle) pour chaque maison du
  catalogue, en cliquant réellement dans le DOM. Seeds déterministes
  (voir en-tête du fichier) — un run est toujours reproductible, y
  compris entre deux process Playwright différents. Génère un rapport
  Markdown par (maison, seed) dans `e2e/rapports/` (généré, ignoré par
  git) — a déjà trouvé un vrai bug (`#modal-choix-valider` restant
  bloqué entre deux popups, voir `docs/docs-rapport.md` BUG-3). Ne vise
  pas l'exhaustivité combinatoire (irréaliste vu le nombre de
  combinaisons maisons × événements × technologies × focus) : c'est du
  fuzzing seedé, pas une énumération.

## Serveur de dev

`.claude/launch.json` (config `voidfall-static`) sert le repo tel quel via
`python -m http.server` — pas de build, aucune étape de compilation.
