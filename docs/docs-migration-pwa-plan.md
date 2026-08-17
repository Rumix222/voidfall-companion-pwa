# Plan de migration PWA — Voidfall Companion

## 0. État d'avancement

Reste à faire :
- Export/Import JSON manuel
- test de bout en bout

**Test de bout en bout — option retenue** : intégration Node avec DB
IndexedDB factice en mémoire, même pattern que les `*.test.js` déjà
livrés (focusEngine/civilisationService/combatService/scoreService) — un
contexte `vm` charge les VRAIS fichiers services (`db.js` n'est PAS
chargé, sa factice le remplace ; tous les autres oui) et enchaîne un vrai
scénario de partie (création → actions Focus → annulation → Civilisation
→ Combat → fin de partie → historique). Choisie plutôt qu'un vrai
navigateur headless (Playwright/Puppeteer) pour rester cohérente avec le
principe déjà en place "zéro dépendance npm" — au prix de ne pas couvrir
le DOM/Service Worker eux-mêmes.

## 2. Schéma IndexedDB proposé

Une seule base, deux catégories d'object stores. Respecte la règle du
projet : **pas de `civ_*`, `cycle_actuel`, `technologies_obtenues` mélangés
dans un blob sérialisé** — chaque colonne Supabase devient une clé dédiée,
pas un champ noyé dans `etat_json`.

## 3. Structure de repo proposée

Contrainte : pas de build, tout doit être servi tel quel par GitHub Pages,
et éditable/poussable depuis Working Copy sur iPhone.

```
/ (racine du repo, servie par GitHub Pages)
├── index.html                  # coquille unique : tous les écrans en <div> cachés,
│                                # comme aujourd'hui dans app.html (pattern ECRANS)
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css               # contenu actuel de style.html, sans <script> ni <?!= ?>
├── js/
│   ├── db.js                   # wrapper IndexedDB — remplace DataService + api.html
│   ├── catalogueSync.js        # import Supabase -> IndexedDB (remplace SyncService)
│   ├── gameService.js
│   ├── secteurService.js
│   ├── focusEngine.js          # logique coût/effet pure, extraite du DOM
│   ├── focusService.js         # orchestration Focus + branchement DOM
│   ├── civilisationService.js
│   ├── scoreService.js
│   ├── combatService.js        # extrait de combat.html
│   ├── exportImport.js         # sauvegarde/partage JSON manuel
│   ├── app.js                  # orchestration/navigation, remplace le <script> d'app.html
│   └── version.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── data/
    └── catalogue-seed.json     # optionnel : snapshot de secours si le 1er
                                 # lancement se fait sans réseau
```

Notes de cohérence avec vos conventions :
- IIFE + suffixe `_` pour les fonctions privées, français partout :
  inchangé, transposé tel quel du `.gs`/`.js` actuel.
- `node --check` reste utilisable sur chaque fichier `js/*.js` avant
  livraison (syntaxe JS pure, aucune dépendance GAS).
- Un seul `index.html` (pas de fetch() de partiels HTML à l'exécution) :
  ça évite d'ajouter de la complexité de cache au Service Worker et
  reproduit le pattern actuel de bascule d'écrans par `display:none`/`block`.
