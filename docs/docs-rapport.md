# Rapport de relecture complète — 21/08/2026

Relecture exhaustive du code (js/*.js, index.html, css/style.css,
data/catalogue/*.json) à la recherche de code mort, mutualisation
possible, données dupliquées et améliorations d'architecture. Ce fichier
sert de suivi : chaque point est mis à jour avec `✅ Traité (date) — ...`
au fur et à mesure (même convention que `docs/TODO.md`).

Statuts : ⬜ à traiter · 🔶 en cours · ✅ traité · ❌ écarté (avec raison)

## Bugs réels (priorité haute)

- ✅ **BUG-1** (traité 21/08/2026) — `js/scoreVueService.js:108` : le
  bouton "Retour" de l'écran Fin de partie appelait
  `App.afficherEcran('game')`, écran renommé depuis en
  `screen-plateau-galactique` → écran vide au clic. Fix :
  `App.afficherEcran('plateau-galactique')` (v20260821.11).
- ✅ **BUG-3** (traité 21/08/2026) — `js/strategieService.js:demanderChoix`
  ne réinitialisait jamais `#modal-choix-valider.disabled` à l'ouverture
  d'une nouvelle popup (`fermerModale_` ne fait que masquer la modale).
  ~10 branches désactivent ce bouton pendant un appel async et le
  réactivent dans leur `.then`/`.catch` ; un chemin de sortie oublié
  laissait le bouton bloqué pour **toute popup suivante**, y compris un
  simple `'confirmation'` qui ne touche jamais lui-même à `.disabled`
  (aucun style ne distingue visuellement un bouton disabled ici — bug
  invisible pour un joueur jusqu'à un clic qui ne fait plus rien). Trouvé
  par `e2e/partie-aleatoire.spec.js` (maison Novaris, seed 369487578,
  timeout sur `#modal-choix-valider` pendant une action Focus qui
  suivait un Cadre "à résoudre manuellement"). Fix : reset défensif
  `btnValider.disabled = false` en tête de `demanderChoix`, plutôt que
  de traquer laquelle des branches a la fuite (v20260821.10).
- ✅ **BUG-2** (traité 21/08/2026) — `cleFocusEnginePourOptionCadre_`
  dupliquée entre `gameService.js:672` et `index.html:1458`, à
  resynchroniser à la main à chaque nouvelle clé Focus/Cadre (a déjà
  causé un Cadre non cliquable par le passé, cf. commentaire
  `index.html:1471-1474`). Fix : fonction exposée publiquement
  (`GameService.cleFocusEnginePourOptionCadre`), copie locale
  d'`index.html` supprimée — un seul appelant restant, mis à jour pour
  lire directement `GameService` (v20260821.11).

## Code mort

- ✅ **CM-1** (traité 21/08/2026, corrigé par rapport à l'analyse
  initiale) — `gameService.js` : seule `definirTechnologieAvanceeAmelioree`
  a été supprimée (zéro appelant réel). Le champ
  `technologiesAvanceesAmeliorees` qu'elle écrivait a été **conservé** :
  il est lu par un effet récent et testé de `focusEngine.js`
  (`influence_par_technologie_amelioree`, voir `focusEngine.test.js`) —
  ce n'était pas un chantier abandonné mais un gap fonctionnel (UI
  manquante pour marquer une Technologie avancée améliorée). Non traité,
  à ajouter comme nouveau point si une UI dédiée est souhaitée.
- ✅ **CM-2** (traité 21/08/2026) — `focusService.js` : `obtenirCartesFocus`,
  `obtenirFocusParFamille`, `obtenirPoolHeroique` retirés de l'API
  publique (zéro appelant).
- ✅ **CM-3** (traité 21/08/2026) — `strategieService.js` :
  `avancerMoinsAvancee_`/`avancerCorrompue_` supprimées (~50 lignes,
  boutons DOM retirés d'`index.html` depuis le Lot F).
- ✅ **CM-4** (traité 21/08/2026) — `combatService.js` : `NOMS_VAISSEAUX`,
  `totalNavale` retirés de l'API publique.
- ✅ **CM-5** (traité 21/08/2026) — `css/style.css` :
  `.resultat-partie-creee`, `.carte-partie-actions` retirées.
- ✅ **CM-6** (traité 21/08/2026) — `db.js` : `DB.ouvrir`, `DB.vider`
  (supprimée entièrement, zéro appelant même en interne),
  `DB.NOMS_STORES` retirés de l'API publique.
- ✅ **CM-7** (traité 21/08/2026) — `historiqueVueService.js` : export
  `ouvrirHistorique` retiré.
- ✅ **CM-8** (traité 21/08/2026) — `annulationService.js` :
  `LIMITE_PAR_PARTIE` retiré de l'API publique.
- ⬜ **CM-9** — `data/catalogue/scenarioTrousDeVer.json` : fichier vide,
  store créé/synchronisé mais jamais lu par aucun service. **Non traité
  — décision produit nécessaire** (fonctionnalité "trous de ver" prévue
  ou fichier/store à retirer), pas une suppression mécanique.
- ✅ **CM-10** (traité 21/08/2026) — `data/catalogue/technologies.json`
  champ `idSheet` (résidu d'export Google Sheets) retiré des 28
  entrées.

## Gap fonctionnel (feature manquante, pas du code mort)

- ⬜ **GAP-1** — `data/catalogue/technologies.json` champ `texteAmeliore`
  (rempli sur les 28 technos) jamais affiché en UI : le joueur coche
  "Améliorée" sans jamais voir le texte de l'effet amélioré. À afficher
  dans le tooltip/fiche technologie (`badgeTechnologie_`, `index.html`)
  quand `amelioree === true`.

## Mutualisation

- ✅ **MUT-1** (traité 21/08/2026) — `gameService.js` : les 8 fonctions
  `appliquerCadre*` répétaient ~15 lignes de boilerplate identique (fetch
  partie + garde-fous) et le refetch final réapparaissait 11 fois dans
  le fichier. Factorisés en `chargerCadreOuvrable_(partieId, cycle,
  ordreCadre)` + `rechargerPartie_(partieId)`. Validé par les 5 fichiers
  de test dédiés aux Cadres + les 14 maisons du scénario E2E aléatoire.
- ✅ **MUT-2** (traité 21/08/2026) — `focusEngine.js:resoudreCle_` :
  motif `demanderChoix → journal.push → return true/false` répété 7 fois
  factorisé en `demanderChoixEtJournaliser_` (formatteur de message
  optionnel pour "regrouper", dont le résumé diffère des 6 autres).
- ✅ **MUT-3** (traité 21/08/2026) — `strategieService.js` (popups
  `regrouper`/`deployer_cube`/`envahir`) : vérification "secteur
  possédé" réimplémentée 3 fois factorisée en `secteurEstPossede_(secteur)`.
- ✅ **MUT-4** (traité 21/08/2026) — `strategieService.js` :
  `secteurParNumero_` factorisé en `creerSecteurParNumero_(secteurs)`.
- ✅ **MUT-5** (traité 21/08/2026) — `strategieService.js` : construction
  d'`adjacenceMap` factorisée en `construireAdjacenceMap_(adjacences)`.
- ✅ **MUT-6** (traité 21/08/2026) — `strategieService.js` : lookup
  `TYPES_VAISSEAU.filter(...).label` (4 occurrences) factorisé en
  `labelVaisseau_(cle)`.
- ✅ **MUT-7** (traité 21/08/2026) — `secteurService.js` : calcul
  "emplacements installations/guildes utilisés" (8 occurrences au total)
  factorisé en `installationsUtilisees_`/`guildesUtilisees_`, même
  principe que `totalPn_` déjà en place.
- ✅ **MUT-8** (traité 21/08/2026) — `secteurService.js:regrouper` :
  clé composite `depart + ':' + type` remplacée par un objet imbriqué
  `{depart: {type: quantite}}`.

## Données dupliquées

- ⬜ **DUP-1** — `index.html` duplique `strategieService.js` (déjà noté
  dans `docs/docs-architecture-pwa.md` §13) : `LABEL_RESSOURCE_CADRE_`,
  `COULEUR_RESSOURCE_CADRE_`, `LABEL_GUILDE`, `LABEL_INSTALLATION`,
  `LABEL_PN`, `TYPES_INSTALLATION`, `TYPES_GUILDE`, `TYPES_VAISSEAU`
  côté `index.html` vs `CHAMP_RESSOURCE`/`RESSOURCES_TOUTES`/
  `TYPES_VAISSEAU` côté `strategieService.js` (non exportés).
  `index.html:1266` ajoute une 3ᵉ copie du mapping Guilde→couleur
  (`COULEUR_PAR_GUILDE_CADRE_`). **Non traité — plus lourd et plus
  risqué que les autres DUP** : 8 tables à exposer/dédupliquer, de
  nombreux points de rendu à vérifier dans `index.html` (Plat.
  Galactique/Focus/Secteurs). À faire en session dédiée avec plus de
  marge de vérification manuelle.
- ✅ **DUP-2** (traité 21/08/2026) — `secteurService.js`
  (`CHAMP_PN_PAR_TYPE`, non exporté) vs `strategieService.js`
  (`CHAMP_PN_PAR_TYPE_VUE`) : tables identiques. `CHAMP_PN_PAR_TYPE`
  exposée publiquement, copie locale supprimée.
- ✅ **DUP-3** (traité 21/08/2026, fix allégé) — `gameService.js`
  (`RESSOURCES_SIMPLES_CADRE`, `CHAMP_RESSOURCE_PLATEAU_MAISON_`) vs
  `focusEngine.js` (`RESSOURCES_PRODUCTION`, `CHAMP_PAR_CLE`) : tableaux
  identiques / sous-ensemble exact. **Pas fusionnées** : gameService.js
  charge avant focusEngine.js (index.html) et doit rester utilisable
  sans lui — fusionner aurait introduit une dépendance dure entre les
  deux fichiers pour 5 lignes de données stables. Commentaires croisés
  ajoutés dans les deux fichiers à la place (chaque copie renvoie
  explicitement vers l'autre).
- ⬜ **DUP-4** — `strategieService.js` : `CHAMP_RESSOURCE` vs
  `RESSOURCES_TOUTES` recopient les 5 mêmes couleurs ;
  `TYPES_INSTALLATION_CONSTRUIRE_`/`TYPES_GUILDE_CONSTRUIRE_` dupliquent
  `TYPES_INSTALLATION`/`TYPES_GUILDE` d'`index.html` ; mapping
  Guilde→Ressource éclaté sur 3 tables à clés différentes
  (`GUILDE_VERS_RESSOURCE`, `CHAMP_GUILDE_PAR_CLE_INFLUENCE_`,
  `LABEL_GUILDE_INFLUENCE_`).

Aucune duplication détectée dans les catalogues JSON eux-mêmes (schémas
homogènes, aucun id en double, aucune référence cassée) — la dette est
entièrement côté JS.

## Architecture

- ⬜ **ARCH-1** — `strategieService.js` (3423 lignes, le plus gros
  fichier) : la modale générique `demanderChoix` (L.1660-3350) = la
  moitié du fichier, fonctionnellement indépendante du rendu Focus/Plat.
  maison → candidat à extraction (`modaleChoixService.js`). Ses 18
  branches `contexte.type` gagneraient à passer d'un `if/else` géant à
  un dispatch par table.
- ⬜ **ARCH-2** — `index.html` : ~900 lignes (L.929-2280) constituent un
  moteur de résolution des Cadres d'Événement galactique, cassant la
  convention "1 fichier dédié par écran" → candidat à extraction vers
  `js/evenementVueService.js`.
- ⬜ **ARCH-3** — `gameService.js` : pattern systématique lire→muter→
  sauvegarder→**relire** pour reconstruire le retour (~11 fonctions),
  alors que l'objet muté en mémoire est déjà dans la forme attendue.
  Pas un bug, juste redondant.
- ⬜ **ARCH-4** — Dette de tests mal ciblée : `combatService.js`
  (résolution de combat complexe) n'a **aucun test** — zone la plus
  risquée du projet. `civilisationService_test.js` existe déjà et couvre
  bien le module → mettre à jour `CLAUDE.md` qui liste encore
  civilisationService.js comme non testé.
- ⬜ **ARCH-5** — Convention de nommage des fichiers de test incohérente :
  `*.test.js` / `*_test.js` / `test_*.js` coexistent. `node --test` sans
  argument ne matche que `*.test.js` — vérifier que les deux autres
  familles sont bien lancées individuellement.
- ⬜ **ARCH-6** — Détails mineurs : commentaire obsolète `index.html:720`
  ("`obtenirSecteurMere` n'est plus appelé" — faux, utilisé
  `strategieService.js:2088`) ; classe CSS `.subsection-title` utilisée
  5× en HTML mais jamais stylée ; `civilisationService.js` mélange
  caractères accentués directs et échappements `\uXXXX`.

## Ordre de traitement suggéré

1. ✅ BUG-1, BUG-2 (traités 21/08/2026)
2. ✅ MUT-1 (traité 21/08/2026)
3. ✅ Code mort — CM-1 à CM-8, CM-10 traités (21/08/2026) ; CM-9 laissé
   en attente d'une décision produit
4. ✅ Mutualisation restante — MUT-2 à MUT-8 traités (21/08/2026)
5. 🔶 Données dupliquées — DUP-2/DUP-3 traités (21/08/2026) ; **DUP-1 et
   DUP-4 restent à faire**, en session dédiée (plus gros volume,
   plusieurs écrans de rendu à revérifier manuellement)
6. ⬜ ARCH-1/ARCH-2 et ARCH-4 (tests `combatService.js`) — seulement si
   une refonte de fond est planifiée, gros volume de code sans filet de
   sécurité — non commencés

Chaque point traité a été validé par : les 80 tests `*.test.js` + les 51
tests `*_test.js`/`test_*.js` (`node --test`) + `e2e/partie-complete.spec.js`
+ `e2e/partie-aleatoire.spec.js` sur les 14 maisons du catalogue (et 10
seeds supplémentaires sur une maison pour MUT-3 à MUT-6).
