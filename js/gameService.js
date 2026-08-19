/**
 * gameService.js
 * Cycle de vie de partie — Voidfall Companion PWA
 * Version 14 — 19/08/2026 (Construire une Installation / Établir une Guilde portées)
 *
 * 19/08/2026 (Construire une Installation / Établir une Guilde portées —
 * retour utilisateur : "on a dû perdre cette possibilité lors du portage
 * en PWA, il y a des actions de focus qui placent des guildes ou des
 * installations aussi") : cleFocusEnginePourOptionCadre_ reconnaît
 * désormais { cle: 'etablir_guilde' } / { cle: 'construire_installation' }
 * (identité — FocusEngine.resoudreCle_ les gère nativement, voir
 * focusEngine.js v5, CLES_CONSTRUIRE). appliquerCadreChoixCube renommée
 * appliquerCadreChoixFocusEngine (ne concernait plus que les cubes) — le
 * mécanisme (délègue à FocusEngine.resoudreEffet) est inchangé, sert
 * maintenant aussi la construction. Événement C Cycle 1 Cadre 2
 * ("Etablissez une Guilde OU construisez une Installation", ajouté la
 * session précédente avec une résolution manuelle de repli) passe ainsi
 * automatiquement par ce mécanisme, sans changement propre à ce cadre.
 * appliquerCadreChoixManuel (session précédente) reste en place comme
 * filet de sécurité générique pour toute future option de cadre "choix"
 * réellement non automatisable. js/focusEngine.js (v5), js/strategieService.js
 * (v19 — nouveau contexte 'construire'), index.html.
 *
 * 19/08/2026 (Événement galactique C, Cycle 1 "Vestiges du Domineum") :
 * deux nouvelles méthodes pour les 2 Cadres de cet événement.
 * appliquerCadrePlacementMultiple(partieId, cycle, ordreCadre,
 * ciblesParGroupe) — Cadre 1, nouveau type de cadre "placement_multiple"
 * (data/catalogue/evenements.json) — délègue tout le calcul/la
 * revalidation à SecteurService.appliquerPlacementMultipleNeantAdjacent
 * (secteurService.js v4, voir son en-tête) ; `ciblesParGroupe` vient de
 * l'appelant (IHM) mais n'est jamais cru sur parole (revalidé côté
 * SecteurService, même principe qu'appliquerCadrePlacement). Stocke
 * `{ secteurs: [...], le }` (dédupliqué — le cas particulier "un seul
 * secteur du Néant adjacent" fusionne tous les jetons sur un seul
 * secteur). appliquerCadreChoixManuel(partieId, cycle, ordreCadre,
 * indexOption, resume) — Cadre 2 ("Établissez une Guilde OU construisez
 * une Installation") : les deux options sont hors périmètre (aucune
 * mécanique de construction de Guilde/Installation automatisée par
 * l'app, mêmes clés déjà signalées hors périmètre côté Focus/
 * focusEngine.js) — enregistre juste l'option choisie comme résolue
 * manuellement (`resume`, texte au passé fourni par l'appelant, ex.
 * "Guilde établie manuellement"), aucun delta plateauMaison/secteursPartie.
 * index.html (nouveaux data-placement-multiple/gestion actionsCadre_ pour
 * les options non automatisables).
 *
 * 18/08/2026 (Simplification UI Événement galactique — Cadre 3 générique,
 * Événement B Cycle 1 : "activer 1 cube / déployer 1 cube sur le
 * Secteur-Mère") : nouvelle méthode appliquerCadreChoixCube(partieId,
 * cycle, ordreCadre, indexOption, demanderChoix) — pour une option de
 * cadre "choix" portant sur les cubes de Puissance Navale
 * (cleFocusEnginePourOptionCadre_ reconnaît activer_cube/deployer_cube),
 * délègue à FocusEngine.resoudreEffet (moteur pur déjà utilisé par
 * l'écran Focus pour ces mêmes clés) plutôt que de dupliquer une
 * deuxième logique de débit de cubeActif — FocusEngine reste la SEULE
 * source de vérité pour cette mécanique. `demanderChoix` est le seul
 * paramètre IHM que GameService accepte (comme FocusEngine.
 * jouerActionEtPersister le fait déjà) : nécessaire pour la popup
 * imbriquée "Déployer des cubes" (choix du type de Flotte) côté option
 * "déployer". Une annulation de cette popup imbriquée résout avec
 * { annule: true } (pas une erreur — le joueur peut réessayer). GameService
 * dépend désormais de FocusEngine (référence globale paresseuse, résolue
 * seulement à l'appel — focusEngine.js peut être chargé après
 * gameService.js dans index.html, l'inverse de sa propre dépendance
 * documentée sur GameService pour son orchestrateur jouerActionEtPersister).
 * index.html (v32 — actionsCadre_ reconnaît les options cube,
 * appliquerCadreCubeEtRafraichir_ nouvelle), css/style.css inchangé.
 * Tests fumée dédiés : test_gameService_cadreChoixCube.js (node --test,
 * charge le VRAI focusEngine.js + mock DB en mémoire via vm, 4
 * scénarios : activer, déployer validé, déployer annulé, option inconnue).
 *
 * 18/08/2026 (Simplification UI Événement galactique — Cadre 1 générique) :
 * appliquerCadrePlacement ne délègue plus à une fonction SecteurService
 * dédiée à un seul jeu d'éléments (Défense de Secteur + Guilde de
 * Scientifiques) — elle retrouve le cadre `ordreCadre` dans
 * evenementCycle.cadres (déjà chargé en mémoire, catalogue complet
 * persisté par choisirEvenement) et transmet son `effet.elements` tel
 * quel à SecteurService.placerElementsNeantAdjacent (générique, voir son
 * en-tête). Permet de porter le Cadre 1 de l'Événement B Cycle 1 (jeton
 * Libération + Défense de Secteur) sans aucune nouvelle fonction dédiée.
 * secteurService.js (v4), js/strategieService.js (v18), index.html (v30).
 *
 * 17/08/2026 (Lot F — corrections mineures) : technologiesObtenues passe
 * de 6 à 5 emplacements (les 3 occurrences du tableau par défaut) — avec
 * la Technologie de départ (fixe), cela fait 6 technologies maximum au
 * total (décision utilisateur, voir index.html/renderTechnologiesObtenues_).
 * Une partie déjà en cours avec une technologie au 6e emplacement (index
 * 5) la conserve en base (colonne dédiée, jamais tronquée ici) — seul
 * index.html limite l'affichage/l'édition à 5, hors périmètre signalé.
 *
 * 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) : nouvelle
 * mécanique confirmée par l'utilisateur (session du 17/08), sans
 * équivalent legacy (GAS) ni RPC Postgres existante — écrite entièrement
 * à partir de la règle telle que décrite en session, pas d'un SQL/JS
 * legacy à porter (contrairement au reste de ce fichier). Ajout de :
 *   - 2 colonnes dédiées de plateauMaison (jamais dans etatJson, même
 *     principe que technologiesObtenues) : technologiesAvanceesChoisies
 *     (les 4 choisies au cycle 1, 4 emplacements) et
 *     technologiesAvanceesAmeliorees (map {nom: bool}, couvre les 8) ;
 *   - choisirTechnologieAvancee(partieId, slot, nom) : choix d'une des 4,
 *     cycle 1 uniquement, rejette les doublons entre emplacements ;
 *   - definirTechnologieAvanceeAmelioree(partieId, nom, amelioree) :
 *     rejette si la technologie n'est pas dans le groupe actif du cycle
 *     en cours ;
 *   - obtenirTechnologiesAvanceesGroupes(partie) : fonction PURE (pas
 *     d'accès DB), calcule groupeA (les 4 du cycle 1)/groupeB (le
 *     complément, actif au cycle 3)/actif (améliorable ce cycle-ci),
 *     appelée à la fois en interne (definirTechnologieAvanceeAmelioree)
 *     et par index.html (rendu de l'écran Plat. Galactique) — un seul
 *     endroit pour cette logique, affichage et persistance ne peuvent
 *     pas diverger.
 * Règle du groupe actif (groupeActifTechnologiesAvancees_, privée) :
 * aucune amélioration possible au cycle 1 ; les 4 choisies au cycle 1
 * (groupeA) sont améliorables au cycle 2 ; le complément (groupeB, calculé
 * — jamais choisi manuellement) devient améliorable au cycle 3, à la
 * place de groupeA (pas en plus). Testé par
 * gameService_technologies_avancees_test.js (nouveau fichier, 17/08/2026).
 *
 * 17/08/2026 (Lot 1 — maisons déchues, suite à l'audit UI/UX du 17/08) :
 * ajout du champ "texte" (déjà présent dans la table catalogue
 * "technologies", jusqu'ici jamais remonté) sur les technologies de
 * obtenirMaisonsCatalogue_/formatMaison_ — nécessaire au tooltip des
 * badges technologie sur l'écran Partie (portage de carteMaisonHTML,
 * app-2.html GAS). Changement additif (nouvelle clé sur des objets déjà
 * en place) : n'affecte pas les parties déjà créées (technologies
 * stockées telles quelles à la création, "texte" restera vide pour elles
 * — pas de migration nécessaire) ; les 18 tests fumée existants
 * (gameService_cycle_focus_technologie_test.js/
 * gameService_evenements_technologie_test.js) passent sans modification,
 * aucun des deux ne construit ses fixtures via obtenirMaisonsCatalogue_/
 * formatMaison_.
 *
 * 17/08/2026 (Session 12 — SQL RPC récupéré)
 *
 * 17/08/2026 (Session 12) : ajout de avancerCycle, choisirFocusHeroique et
 * choisirTechnologieObtenue — portage ligne à ligne des RPC Postgres
 * correspondantes (avancer_cycle, choisir_focus_heroique,
 * choisir_technologie_obtenue), dont le SQL a été fourni par
 * l'utilisateur (rpc.json). Ces 3 fonctions étaient jusqu'ici hors
 * périmètre faute de code source. Correctif inclus : cycleActuel (champ
 * dérivé, jamais stocké) doit être recalculé après mutation de
 * cycleNum/cycleTermine dans avancerCycle — repéré par le test fumée
 * dédié (gameService_cycle_focus_technologie.test.js, 12 cas). Voir aussi
 * secteurService.js (v2, même session — les 8 actions secteur).
 *
 * 17/08/2026 (Session 11) : ajout de getEvenementsParCycle, choisirEvenement
 * et definirTechnologieAmelioree — portage direct de leurs équivalents
 * GameService.js (GAS). Ni l'une ni l'autre n'est une RPC Postgres
 * (contrairement à avancerCycle/choisirFocusHeroique/
 * choisirTechnologieObtenue/secteur_*, qui restent hors périmètre faute de
 * code SQL récupéré) : ce sont de simples lectures/écritures JS, déjà
 * visibles dans le code legacy fourni, donc portables sans attendre
 * l'extraction SQL en cours. Voir aussi index.html (écran Partie —
 * sélection d'événement galactique par cycle, case "Technologie de départ
 * améliorée").
 *
 * 17/08/2026 (Session 5, Phase 5 — Civilisation) : ajout de
 * majCivilisation(partieId, champs) — seul changement de cette version.
 * civilisationService.js (nouveau ce jour) en est l'unique appelant
 * prévu. Le reste du fichier est inchangé.
 *
 * 17/08/2026 (Phase 4, partielle) : creerPartie remplit désormais
 * partie.focusJoueur avec la vraie mise en place (voir
 * FocusService.obtenirMiseEnPlace, focusService.js) au lieu d'un tableau
 * vide — tolérant (garde typeof, comme SecteurService). Dépend désormais
 * aussi de focusService.js, à charger AVANT ce fichier (même principe
 * que secteurService.js).
 * [Nettoyage Session 9] Les cartes SONT jouables depuis la Session 4 —
 * voir js/focusEngine.js/js/strategieService.js. Ce commentaire disait
 * encore le contraire (rédigé avant l'existence de focusEngine.js) :
 * corrigé ici, aucune conséquence fonctionnelle, juste une note obsolète.
 *
 * 17/08/2026 (Phase 3) : creerPartie appelle désormais
 * SecteurService.instancierSecteurs(partie) après la sauvegarde
 * (tolérant — voir secteurService.js, ne bloque jamais la création de
 * partie) ; scenarioId se défaut sur SecteurService.SCENARIO_PAR_DEFAUT
 * si non fourni (comme côté GAS), au lieu de rester null. Dépend
 * désormais de secteurService.js, à charger AVANT ce fichier — via un
 * garde `typeof SecteurService !== 'undefined'`, gameService.js reste
 * utilisable seul (tests) si secteurService.js n'est pas chargé.
 *
 * 17/08/2026 (suite Session 3) : obtenirMaisonsCatalogue exposée
 * publiquement (était privée) — utilisée par js/setupService.js (portage
 * de l'écran de création de partie, setup.html GAS).
 *
 * Session 3 (Phase 2 du plan de migration) : remplace GameService.js (GAS)
 * + la partie "état de jeu" de DataService.js. Écriture directe dans les
 * stores IndexedDB `parties` / `plateauMaison` / `historique` via js/db.js
 * (DB.get/getAll/put/supprimer) — plus de RPC Supabase, plus de
 * google.script.run.
 *
 * PÉRIMÈTRE VOLONTAIREMENT RÉDUIT à cette session (confirmé en session) :
 * créer / lire / lister / sauvegarder / archiver / supprimer une partie,
 * + mise à jour partielle du plateau maison (majPlateauMaison). Restent
 * HORS PÉRIMÈTRE (repoussés aux phases correspondantes du plan) :
 *   - choisirEvenement, choisirFocusHeroique, choisirTechnologieObtenue,
 *     définirTechnologieAmelioree, avancerCycle : plusieurs de ces
 *     fonctions étaient des RPC Postgres dont le SQL source n'a jamais
 *     été récupéré côté GAS (voir en-tête de DataService.js) — rien à
 *     porter, à réécrire depuis les règles.
 *   - [Nettoyage Session 9] avancerCivilisation* retiré de cette liste :
 *     PORTÉ depuis, mais PAS comme fonction de gameService.js — voir
 *     civilisationService.js (Session 5), qui avance les pistes via le
 *     nouveau majCivilisation ci-dessous, sans passer par une RPC du même
 *     nom que côté GAS.
 *   - focusJoueur (mise en place Focus, FocusService — Phase 4) et les
 *     secteurs (SecteurService — Phase 3) : creerPartie amorce les champs
 *     correspondants à vide/null, dans la forme attendue, pour ne pas
 *     casser l'écran une fois ces phases livrées.
 *
 * Identifiant de partie : crypto.randomUUID() (généré une seule fois à la
 * création, confirmé en session — remplace Utilities.getUuid() de GAS ;
 * plus de Postgres pour garantir l'unicité, sans enjeu ici, stockage
 * local par appareil).
 *
 * Séparation de colonnes (règle projet, section 2 du plan de migration) :
 * civilisation / cycleActuel / technologiesObtenues / plateauMaison ne
 * sont JAMAIS sérialisés dans `parties.etatJson` — ils vivent dans leurs
 * clés dédiées (record `plateauMaison`, ou colonnes cycleNum/cycleTermine
 * de `parties`). Voir pourEtatJson_/assemblerPartie_ ci-dessous, portage
 * direct de pourEtatJson_/construirePartieDepuisLigne_ (DataService.js GAS).
 *
 * Précision par rapport au schéma "brouillon" de la section 2 du plan :
 * `cycleActuel` n'est PAS stocké comme un troisième champ redondant en
 * plus de cycleNum/cycleTermine — il est recalculé à la lecture
 * (assemblerPartie_), exactement comme le fait déjà construirePartieDepuisLigne_
 * côté GAS (`cycle_termine ? 'termine' : cycle_num`). cycleNum/cycleTermine
 * restent la paire autoritaire, ce qui évite une source de vérité en trop
 * à garder synchronisée par les futures fonctions de cycle (Phase 2+).
 *
 * `parties.etatJson` ne contient QUE les champs sans colonne dédiée :
 * joueur (sans technologieDepart, autoritaire dans plateauMaison),
 * adversaires, evenements, technologiesAcquises, focusJoueur,
 * focusHeroiques, focusHeroiquesPioches — id/dateCreation/archivee/
 * scenarioId/cycleNum/cycleTermine vivent en colonnes top-level du record
 * `parties`, jamais dupliqués dans le blob (léger nettoyage volontaire par
 * rapport à pourEtatJson_ côté GAS, qui les y laissait par héritage de
 * l'ancien format Sheets — signalé explicitement ici).
 *
 * Dépend de db.js (objet global DB, avec DB.supprimer ajouté cette
 * session) : à charger avant ce fichier.
 */

var GameService = (function () {
  'use strict';

  // Mise en place solo — constantes du livret, identiques pour toute
  // Maison/Origine (portage direct de GameService.js GAS, 15/08/2026).
  var INFLUENCE_DEPART = 10;
  var GLOIRE_DEPART = [2, null, null, null, null];

  var CHAMPS_PLATEAU_MAISON_AUTORISES = [
    'ressourceNourriture', 'ressourceEnergie', 'ressourceMateriel',
    'ressourceCredit', 'ressourceScience', 'influence', 'cubeActif',
    'jetonPrime', 'jetonLiberation', 'jetonCommerce', 'gloire',
    'programme1', 'programme2', 'programme3', 'programme4',
    'technologiesObtenues', 'technologiesAvanceesChoisies'
  ];

  // ------------------------------------------------------------
  // Utilitaires génériques (portage direct de GameService.js GAS)
  // ------------------------------------------------------------

  function pickRandom_(tableau) {
    return tableau[Math.floor(Math.random() * tableau.length)];
  }

  function tirerMaisonsAdverses_(maisons, nomExclu, nombre) {
    var pool = maisons.filter(function (m) { return m.nom !== nomExclu; });
    var choisies = [];
    while (choisies.length < nombre && pool.length > 0) {
      var index = Math.floor(Math.random() * pool.length);
      choisies.push(pool.splice(index, 1)[0]);
    }
    return choisies;
  }

  function formatMaison_(maison) {
    return {
      nom: maison.nom,
      complexite: maison.complexite,
      technologies: maison.technologies.map(function (t) {
        return { nom: t.nom, type: t.type || '', texte: t.texte || '' };
      })
    };
  }

  function marquerTechnologiesSansPoint_(maisonsList, nombre) {
    var toutesLesTechs = [];
    maisonsList.forEach(function (m) {
      m.technologies.forEach(function (t) { toutesLesTechs.push(t); });
    });

    var indices = toutesLesTechs.map(function (_, i) { return i; });
    for (var i = indices.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    }
    var indicesSansPoint = {};
    indices.slice(0, nombre).forEach(function (idx) { indicesSansPoint[idx] = true; });

    toutesLesTechs.forEach(function (t, idx) { t.sansPoint = !!indicesSansPoint[idx]; });
  }

  function marquerTechnologiesSansPointManuel_(maisonsList, nomsSansPoint) {
    var toutesLesTechs = [];
    maisonsList.forEach(function (m) {
      m.technologies.forEach(function (t) { toutesLesTechs.push(t); });
    });

    toutesLesTechs.forEach(function (t) { t.sansPoint = false; });

    nomsSansPoint.forEach(function (nom) {
      var techno = toutesLesTechs.filter(function (t) { return t.nom === nom; })[0];
      if (!techno) {
        throw new Error('Technologie "' + nom + '" introuvable parmi les maisons déchues choisies.');
      }
      techno.sansPoint = true;
    });
  }

  // ------------------------------------------------------------
  // Accès catalogue (stores IndexedDB peuplés par catalogueSync.js,
  // Phase 1) — équivalent de DataService.getMaisonsInternal_/
  // getOrigineMaison côté GAS.
  // ------------------------------------------------------------

  /**
   * Jointure maisons + technologies (clés catalogue camelCase, voir
   * catalogueSync.js) -> [{ nom, complexite, technologies: [{nom, type,
   * texte}] }]. 17/08/2026 (Lot 1 — maisons déchues) : "texte" ajouté (déjà
   * présent dans la table catalogue "technologies", jusqu'ici jamais
   * remonté) — nécessaire au tooltip des badges technologie sur l'écran
   * Partie (title="...", portage de carteMaisonHTML, app-2.html GAS).
   */
  function obtenirMaisonsCatalogue_() {
    return Promise.all([DB.getAll('maisons'), DB.getAll('technologies')]).then(function (resultats) {
      var maisons = resultats[0];
      var technologies = resultats[1];
      var techParNom = {};
      technologies.forEach(function (t) { techParNom[t.nom] = t; });

      return maisons.map(function (m) {
        var nomsTech = [m.technologie1, m.technologie2].filter(Boolean);
        var technologiesMaison = nomsTech.map(function (nomTech) {
          var t = techParNom[nomTech];
          return { nom: nomTech, type: t ? (t.type || '') : '', texte: t ? (t.texte || '') : '' };
        });
        return { nom: m.nom, complexite: m.complexite, technologies: technologiesMaison };
      });
    });
  }

  /**
   * originesMaison est indexé par idCarte (pas par maison+technologie) —
   * lecture complète puis filtre en JS (store léger, ~28 lignes).
   */
  function obtenirOrigineMaison_(nomMaison, nomTechnologie) {
    return DB.getAll('originesMaison').then(function (origines) {
      return origines.filter(function (o) {
        return o.maison === nomMaison && o.technologie === nomTechnologie;
      })[0] || null;
    });
  }

  /**
   * Retrouve le Type d'une technologie de départ à partir des 2
   * technologies déjà connues de la maison (évite un aller IndexedDB
   * supplémentaire — technologieDepart est toujours l'une des deux).
   */
  function technologieTypeDepuis_(technologies, nom) {
    if (!nom) return null;
    var t = (technologies || []).filter(function (x) { return x.nom === nom; })[0];
    return t ? t.type : null;
  }

  /**
   * 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) : les 8
   * technologies des 4 maisons déchues (mise en place), toutes maisons
   * confondues — même liste source que choisirTechnologieObtenue (slots
   * "Technologies obtenues") et que toutesTechnologiesAdverses_
   * (index.html/strategieService.js), mais exposée ici en fonction
   * réutilisable : nécessaire aux deux nouvelles fonctions Technologies
   * avancées ci-dessous (choix + calcul du groupe actif par cycle).
   */
  function technologiesAdversesToutes_(partie) {
    var toutes = [];
    (partie.adversaires || []).forEach(function (m) {
      (m.technologies || []).forEach(function (t) {
        toutes.push({ nom: t.nom, maison: m.nom, type: t.type || '', sansPoint: !!t.sansPoint });
      });
    });
    return toutes;
  }

  /**
   * 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) : règle
   * confirmée par l'utilisateur (session du 17/08) — les 4 Technologies
   * avancées choisies au cycle 1 (partie.technologiesAvanceesChoisies)
   * sont improvable au cycle 2 ; au cycle 3, ce sont les 4 AUTRES parmi
   * les 8 (le complément, calculé, jamais choisi manuellement) qui
   * deviennent improvable. Aucune amélioration possible au cycle 1 (rien
   * n'est encore "actif"), ni une fois les 4 emplacements du cycle 1
   * incomplets (retourne [] tant que les 4 ne sont pas tous remplis :
   * le complément ne serait pas fiable). Retourne un tableau de noms
   * (string[]), pas d'objets — suffisant pour un test d'appartenance
   * (indexOf) côté définirTechnologieAvanceeAmelioree.
   */
  function groupeActifTechnologiesAvancees_(partie) {
    var choisies = (partie.technologiesAvanceesChoisies || []).filter(Boolean);
    if (choisies.length < 4) return [];
    if (partie.cycleActuel === 2) {
      return choisies.map(function (t) { return t.nom; });
    }
    if (partie.cycleActuel === 3) {
      var nomsChoisis = choisies.map(function (t) { return t.nom; });
      return technologiesAdversesToutes_(partie)
        .filter(function (t) { return nomsChoisis.indexOf(t.nom) === -1; })
        .map(function (t) { return t.nom; });
    }
    return [];
  }

  /**
   * 18/08/2026 (Refonte affichage Événement galactique — Plat. Galactique) :
   * formate un événement galactique. Remplace l'ancienne lecture
   * texte1/texte2/nom/cycle (portage direct de l'ex-formatEvenement_ GAS),
   * devenue caduque suite à la migration du catalogue Supabase -> JSON
   * local (data/catalogue/evenements.json) : ce fichier structure
   * désormais chaque événement en `cadres[]` (effets de la moitié gauche
   * de la carte, résolus en Phase Préparation, à l'ouverture du Cycle —
   * voir docs/docs-rules-cycle-de-jeu.md §1.5) et `objectifs.blocs[]`
   * (moitié droite, évalués en Phase Évaluation, §3.3), et n'a plus de
   * champs texte1/texte2/nom/cycle à plat. `manches` (haut droit de la
   * carte, §2 Introduction) est conservé tel quel.
   *
   * 19/08/2026 (retour utilisateur, principe à garder pour les prochains
   * événements) : `instruction` (champ optionnel côté catalogue, popup
   * de résolution manuelle d'un cadre "gain" — voir index.html
   * appliquerCadreManuelEtRafraichir_) ajouté à la liste blanche —
   * absent par défaut (null), jamais bloquant pour un cadre qui n'en
   * définit pas encore.
   */
  function formatEvenement_(e) {
    return {
      code: e.code,
      nom: e.nom,
      cycle: e.cycle,
      manches: e.manches,
      cadres: (e.cadres || []).map(function (c) {
        return {
          ordre: c.ordre,
          obligatoire: !!c.obligatoire,
          resolution: c.resolution || null,
          texte: c.texte,
          instruction: c.instruction || null,
          effet: c.effet || null
        };
      }),
      objectifs: e.objectifs || null
    };
  }

  // Les 5 ressources de plateauMaison déjà suivies par l'app — seule
  // "monnaie" commune assez simple pour être créditée/débitée en un clic
  // depuis un cadre d'Événement galactique (voir actionsSimplesCadre_
  // ci-dessous). Tout le reste d'un cadre (secteurs, Gloire, jetons
  // Commerce/Prime/Libération, pistes de Civilisation, Corruption...)
  // reste hors périmètre (docs-rules-cycle-de-jeu.md §1.5, la plupart des
  // sous-points sont ❌/🚫) et s'affiche en texte brut, à résoudre
  // manuellement par le joueur.
  var RESSOURCES_SIMPLES_CADRE = ['nourriture', 'energie', 'materiel', 'credit', 'science'];
  var CHAMP_RESSOURCE_PLATEAU_MAISON_ = {
    nourriture: 'ressourceNourriture', energie: 'ressourceEnergie', materiel: 'ressourceMateriel',
    credit: 'ressourceCredit', science: 'ressourceScience'
  };

  /**
   * Réduit un objet {ressource: valeur, ...} à un delta exploitable
   * seulement s'il ne porte QUE sur RESSOURCES_SIMPLES_CADRE — sinon null
   * (l'effet sort du périmètre "1 clic").
   */
  function deltaRessourcesSimple_(objet) {
    if (!objet) return null;
    var delta = {};
    var cles = Object.keys(objet);
    for (var i = 0; i < cles.length; i++) {
      var cle = cles[i];
      if (RESSOURCES_SIMPLES_CADRE.indexOf(cle) === -1) return null;
      var valeur = Number(objet[cle]);
      if (!valeur) return null;
      delta[cle] = valeur;
    }
    return Object.keys(delta).length ? delta : null;
  }

  function ajouterDelta_(base, ajout, signe) {
    var resultat = Object.assign({}, base);
    Object.keys(ajout || {}).forEach(function (cle) {
      resultat[cle] = (resultat[cle] || 0) + signe * ajout[cle];
    });
    return resultat;
  }

  /**
   * Extrait un delta ressources "1 clic" d'une option de cadre (élément
   * de effet.options, ou effet lui-même pour un échange direct) — deux
   * formes rencontrées dans evenements.json :
   *   - { cle: 'science', valeur: 3 } (gain direct)
   *   - { cout: {...}, gain: {...} } (échange)
   * Retourne null si l'option contient autre chose (secteur, Gloire,
   * Technologie, jeton...).
   */
  function deltaOptionCadre_(option) {
    if (!option) return null;
    if (option.cle && !option.cout && !option.gain) {
      if (RESSOURCES_SIMPLES_CADRE.indexOf(option.cle) === -1 || !option.valeur) return null;
      var direct = {};
      direct[option.cle] = Number(option.valeur);
      return direct;
    }
    if (option.cout || option.gain) {
      var coutSimple = deltaRessourcesSimple_(option.cout);
      var gainSimple = deltaRessourcesSimple_(option.gain);
      if ((option.cout && !coutSimple) || (option.gain && !gainSimple)) return null;
      var delta = ajouterDelta_(ajouterDelta_({}, coutSimple, -1), gainSimple, 1);
      return Object.keys(delta).length ? delta : null;
    }
    return null;
  }

  /**
   * 18/08/2026 (Simplification UI Événement galactique — Cadre 3
   * générique, Événement B Cycle 1) : correspondance entre une option
   * `effet.options[i]` d'un cadre "choix" et la clé Effet reconnue par
   * FocusEngine.resoudreCle_ — d'abord pour les cubes de Puissance Navale
   * (voir focusEngine.js, CLES_DEPLOYER_CUBE et la clé générique "cube") :
   * { cle: 'activer_cube', valeur: N } et { cle: 'deployer_cube', valeur:
   * N, cible: 'secteur_mere' | absent }.
   *
   * 19/08/2026 (Construire une Installation / Établir une Guilde portées) :
   * { cle: 'etablir_guilde', valeur: N } / { cle: 'construire_installation',
   * valeur: N } ajoutés (identité — FocusEngine.resoudreCle_ reconnaît ces
   * clés telles quelles, voir CLES_CONSTRUIRE côté focusEngine.js) — ex.
   * Événement C Cycle 1 Cadre 2 ("Etablissez une Guilde OU construisez une
   * Installation"). Retourne null si l'option ne correspond à aucune des
   * formes reconnues (jamais d'invention de clé FocusEngine à partir d'une
   * donnée non prévue).
   */
  function cleFocusEnginePourOptionCadre_(option) {
    if (!option || !option.cle) return null;
    if (option.cle === 'activer_cube') return 'activer_cube';
    if (option.cle === 'deployer_cube') {
      if (option.cible === 'secteur_mere') return 'deployer_cube_secteur_mere';
      if (!option.cible) return 'deployer_cube';
    }
    if (option.cle === 'etablir_guilde' || option.cle === 'construire_installation') return option.cle;
    return null;
  }

  /**
   * Retourne les actions "1 clic" applicables pour un cadre d'Événement
   * galactique ({index, delta}[]), ou [] si l'effet ne se prête pas à une
   * résolution automatique (nécessite un secteur, un choix de Gloire/
   * Technologie précis, une piste de Civilisation, etc.) — dans ce cas le
   * cadre reste affiché en texte seul, à résoudre manuellement. Les
   * résolutions "permanent"/"collectif"/"retardement" ne sont jamais
   * proposées en 1 clic : elles ne se résolvent pas une fois pour toutes
   * au début du Cycle (voir docs-rules-cycle-de-jeu.md §1.5.3).
   */
  function actionsSimplesCadre_(cadre) {
    if (!cadre || !cadre.effet) return [];
    if (cadre.resolution && ['permanent', 'collectif', 'retardement'].indexOf(cadre.resolution) !== -1) return [];
    var effet = cadre.effet;

    if (effet.type === 'choix' && Array.isArray(effet.options)) {
      var actions = [];
      effet.options.forEach(function (option, index) {
        var delta = deltaOptionCadre_(option);
        if (delta) actions.push({ index: index, delta: delta });
      });
      return actions;
    }

    if (effet.type === 'echange' && effet.mode === 'proportionnel' &&
        effet.cout && effet.gain && effet.gain.ratio === '1_pour_1_avec_cout' &&
        RESSOURCES_SIMPLES_CADRE.indexOf(effet.cout.cle) !== -1 &&
        RESSOURCES_SIMPLES_CADRE.indexOf(effet.gain.cle) !== -1) {
      return [{
        index: 0, proportionnel: true,
        ressourceCout: effet.cout.cle, ressourceGain: effet.gain.cle,
        plafond: Number(effet.cout.plafond) || null
      }];
    }

    if (effet.type === 'echange' && (effet.cout || effet.gain)) {
      var deltaEchange = deltaOptionCadre_(effet);
      return deltaEchange ? [{ index: 0, delta: deltaEchange }] : [];
    }

    return [];
  }

  // ------------------------------------------------------------
  // Assemblage / désassemblage entre la forme "client" (un seul objet
  // partie, civilisation/plateauMaison inclus) et les 2 records IndexedDB
  // (parties + plateauMaison) — portage direct de
  // construirePartieDepuisLigne_ / pourEtatJson_ (DataService.js GAS).
  // ------------------------------------------------------------

  function assemblerPartie_(lignePartie, lignePlateauMaison) {
    if (!lignePartie) return null;
    var pm = lignePlateauMaison || {};
    var partie = Object.assign({}, lignePartie.etatJson || {});

    partie.id = lignePartie.id;
    partie.dateCreation = lignePartie.dateCreation;
    partie.archivee = !!lignePartie.archivee;
    partie.scenarioId = lignePartie.scenarioId || null;
    partie.cycleNum = lignePartie.cycleNum || 1;
    partie.cycleTermine = !!lignePartie.cycleTermine;
    partie.cycleActuel = partie.cycleTermine ? 'termine' : partie.cycleNum;

    partie.civilisation = {
      societe: pm.civSociete || 0,
      gouvernement: pm.civGouvernement || 0,
      economie: pm.civEconomie || 0,
      corrompues: {
        societe: !!pm.civCorrompueSociete,
        gouvernement: !!pm.civCorrompueGouvernement,
        economie: !!pm.civCorrompueEconomie
      }
    };
    partie.technologiesObtenues = pm.technologiesObtenues || [null, null, null, null, null];
    // 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) :
    // technologiesAvanceesChoisies (les 4 choisies au cycle 1, parmi les
    // 8 des maisons déchues) et technologiesAvanceesAmeliorees (map
    // {nom: bool}, couvre les 8 — celles du cycle 2 ET celles du cycle
    // 3) suivent le même principe que technologiesObtenues ci-dessus :
    // colonnes dédiées de plateauMaison, jamais dans etatJson.
    partie.technologiesAvanceesChoisies = pm.technologiesAvanceesChoisies || [null, null, null, null];
    partie.technologiesAvanceesAmeliorees = pm.technologiesAvanceesAmeliorees || {};

    if (partie.joueur) {
      partie.joueur = Object.assign({}, partie.joueur, {
        technologieDepart: {
          nom: pm.technologieDepart || null,
          type: technologieTypeDepuis_(partie.joueur.technologies, pm.technologieDepart),
          amelioree: !!pm.technologieDepartAmelioree
        }
      });
    }

    partie.plateauMaison = {
      ressources: {
        nourriture: pm.ressourceNourriture || 0,
        energie: pm.ressourceEnergie || 0,
        materiel: pm.ressourceMateriel || 0,
        credit: pm.ressourceCredit || 0,
        science: pm.ressourceScience || 0,
        influence: pm.influence || 0
      },
      cubeActif: pm.cubeActif || 0,
      jetonPrime: pm.jetonPrime || 0,
      jetonLiberation: pm.jetonLiberation || 0,
      jetonCommerce: pm.jetonCommerce || [],
      gloire: pm.gloire || [],
      programmes: [pm.programme1 || null, pm.programme2 || null, pm.programme3 || null, pm.programme4 || null]
    };

    return partie;
  }

  /**
   * Retire de l'objet partie tout ce qui a une colonne/clé dédiée
   * ailleurs, avant persistance dans parties.etatJson (voir en-tête).
   */
  function pourEtatJson_(partie) {
    var copie = Object.assign({}, partie);
    delete copie.id;
    delete copie.dateCreation;
    delete copie.archivee;
    delete copie.scenarioId;
    delete copie.cycleNum;
    delete copie.cycleTermine;
    delete copie.cycleActuel;
    delete copie.civilisation;
    delete copie.technologiesObtenues;
    delete copie.plateauMaison;
    if (copie.joueur) {
      copie.joueur = Object.assign({}, copie.joueur);
      delete copie.joueur.technologieDepart;
    }
    return copie;
  }

  // ------------------------------------------------------------
  // Journal d'actions — best-effort, ne doit jamais faire échouer
  // l'action principale (même principe que DataService.logHistorique GAS).
  // ------------------------------------------------------------

  function ajouterHistorique_(partieId, action, details) {
    return DB.put('historique', {
      dateAction: new Date().toISOString(),
      partieId: partieId || null,
      action: action,
      details: details || ''
    }).catch(function (erreur) {
      console.warn('GameService : ajout historique a échoué (non bloquant) :', erreur);
    });
  }

  // ------------------------------------------------------------
  // Suppression — plateauMaison (+ secteursPartie si déjà présents,
  // prévoyance Phase 3) avant parties. Pas de contrainte FK sous
  // IndexedDB (contrairement à Postgres) : l'ordre n'est plus obligatoire,
  // conservé par cohérence/lisibilité avec deletePartieEtHistorique GAS.
  // ------------------------------------------------------------

  function supprimerSecteursPartie_(partieId) {
    return DB.getAll('secteursPartie').then(function (secteurs) {
      var aSupprimer = secteurs.filter(function (s) { return s.partieId === partieId; });
      return Promise.all(aSupprimer.map(function (s) {
        return DB.supprimer('secteursPartie', [s.partieId, s.numero]);
      }));
    });
  }

  function supprimerPartieInterne_(partieId) {
    return Promise.all([
      DB.supprimer('plateauMaison', partieId),
      supprimerSecteursPartie_(partieId)
    ]).then(function () {
      return DB.supprimer('parties', partieId);
    });
  }

  return {

    /**
     * 17/08/2026 (Session 3, suite) : exposée publiquement pour
     * setupService.js — remplace à la fois Api.getMaisonsPourSelection et
     * Api.getDetailMaisons(noms) côté GAS. Plus de distinction "légère vs
     * détaillée" : la donnée est déjà locale (IndexedDB), pas d'enjeu de
     * poids de payload réseau à optimiser ici.
     */
    obtenirMaisonsCatalogue: obtenirMaisonsCatalogue_,

    /**
     * Crée une nouvelle partie. Portage de GameService.creerPartie (GAS),
     * réduit à ce qui ne dépend pas de FocusService/SecteurService (voir
     * en-tête) : focusJoueur démarre à [] et aucun secteur n'est instancié.
     * @param {Object} options
     *   options.mode : 'manuel' | 'aleatoire'
     *   options.maison : nom de la maison (mode manuel)
     *   options.complexite : difficulté choisie (mode aléatoire, optionnel)
     *   options.miseEnPlaceManuelle : true pour reproduire une partie
     *     physique déjà en cours (mode doit être 'manuel') :
     *   options.technologieDepart, options.maisonsDechues (4 noms),
     *   options.technologiesSansPoint (3 noms parmi les 8 des maisons déchues)
     *   options.scenarioId : optionnel (mise en place des secteurs différée
     *     à la Phase 3, pas de valeur par défaut imposée ici)
     */
    creerPartie: function (options) {
      options = options || {};

      return obtenirMaisonsCatalogue_().then(function (maisons) {
        if (!maisons.length) {
          throw new Error('Aucune maison trouvée dans le catalogue local (store "maisons" vide — lancer une synchronisation).');
        }

        var maisonJoueurBrute;
        if (options.mode === 'manuel') {
          maisonJoueurBrute = maisons.filter(function (m) { return m.nom === options.maison; })[0];
          if (!maisonJoueurBrute) throw new Error('Maison "' + options.maison + '" introuvable.');
        } else {
          var pool = maisons;
          if (options.complexite) {
            pool = maisons.filter(function (m) { return String(m.complexite) === String(options.complexite); });
            if (!pool.length) throw new Error('Aucune maison ne correspond à la difficulté choisie.');
          }
          maisonJoueurBrute = pickRandom_(pool);
        }

        var maisonJoueur = formatMaison_(maisonJoueurBrute);
        var adversaires;

        if (options.miseEnPlaceManuelle) {
          if (!options.technologieDepart) throw new Error('Choisis la technologie de départ.');
          var techDepart = maisonJoueur.technologies.filter(function (t) { return t.nom === options.technologieDepart; })[0];
          if (!techDepart) throw new Error('Technologie de départ "' + options.technologieDepart + '" introuvable pour ' + maisonJoueur.nom + '.');
          maisonJoueur.technologieDepart = techDepart;

          var nomsDechues = options.maisonsDechues || [];
          if (nomsDechues.length !== 4) throw new Error('Choisis exactement 4 maisons déchues.');
          if (nomsDechues.indexOf(maisonJoueur.nom) !== -1) throw new Error('Une maison déchue ne peut pas être votre propre maison.');
          if (new Set(nomsDechues).size !== 4) throw new Error('Les 4 maisons déchues doivent être différentes.');

          adversaires = nomsDechues.map(function (nom) {
            var m = maisons.filter(function (x) { return x.nom === nom; })[0];
            if (!m) throw new Error('Maison déchue "' + nom + '" introuvable.');
            return formatMaison_(m);
          });

          var nomsSansPoint = options.technologiesSansPoint || [];
          if (nomsSansPoint.length !== 3) throw new Error('Choisis exactement 3 technologies sans gain d\'Influence.');
          if (new Set(nomsSansPoint).size !== 3) throw new Error('Les 3 technologies sans gain d\'Influence doivent être différentes.');
          marquerTechnologiesSansPointManuel_(adversaires, nomsSansPoint);

        } else {
          maisonJoueur.technologieDepart = pickRandom_(maisonJoueur.technologies);
          adversaires = tirerMaisonsAdverses_(maisons, maisonJoueurBrute.nom, 4).map(formatMaison_);
          marquerTechnologiesSansPoint_(adversaires, 3);
        }

        return Promise.all([
          obtenirOrigineMaison_(maisonJoueur.nom, maisonJoueur.technologieDepart.nom)
            .catch(function (erreur) {
              console.warn('GameService.creerPartie : lecture originesMaison a échoué (civilisation/ressources de départ à 0) :', erreur);
              return null;
            }),
          // 17/08/2026 (Phase 4, partielle) : mise en place des Focus de la
          // maison — tolérant (garde typeof, comme SecteurService), une
          // erreur ici ne doit jamais empêcher la création de la partie.
          (typeof FocusService !== 'undefined' && FocusService.obtenirMiseEnPlace)
            ? FocusService.obtenirMiseEnPlace(maisonJoueur.nom).catch(function (erreur) {
                console.warn('GameService.creerPartie : mise en place Focus échouée (partie créée quand même, sans Focus) :', erreur);
                return [];
              })
            : Promise.resolve([])
        ])
          .then(function (resultats) {
            var origineDepart = resultats[0];
            var focusJoueur = resultats[1];
            var civilisationDepart = { societe: 0, gouvernement: 0, economie: 0 };
            var ressourcesDepart = { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 };
            var cubeActifDepart = 0;

            if (origineDepart) {
              civilisationDepart = {
                societe: Number(origineDepart.civilisationSocieteDepart) || 0,
                gouvernement: Number(origineDepart.civilisationGouvernementDepart) || 0,
                economie: Number(origineDepart.civilisationEconomieDepart) || 0
              };
              ressourcesDepart = {
                nourriture: Number(origineDepart.ressourceNourriture) || 0,
                energie: Number(origineDepart.ressourceEnergie) || 0,
                materiel: Number(origineDepart.ressourceMateriel) || 0,
                credit: Number(origineDepart.ressourceCredit) || 0,
                science: Number(origineDepart.ressourceScience) || 0
              };
              cubeActifDepart = Number(origineDepart.cubeActifDepart) || 0;
            } else {
              console.warn('GameService.creerPartie : origine introuvable pour ' + maisonJoueur.nom + ' / ' + maisonJoueur.technologieDepart.nom + ' (civilisation/ressources de départ à 0).');
            }

            var id = crypto.randomUUID();
            var dateCreation = new Date().toISOString();

            var partie = {
              id: id,
              dateCreation: dateCreation,
              archivee: false,
              scenarioId: options.scenarioId || (typeof SecteurService !== 'undefined' ? SecteurService.SCENARIO_PAR_DEFAUT : null),
              cycleNum: 1,
              cycleTermine: false,
              cycleActuel: 1,
              joueur: maisonJoueur,
              adversaires: adversaires,
              evenements: { cycle1: null, cycle2: null, cycle3: null },
              technologiesAcquises: [maisonJoueur.technologieDepart],
              technologiesObtenues: [null, null, null, null, null],
              civilisation: {
                societe: civilisationDepart.societe,
                gouvernement: civilisationDepart.gouvernement,
                economie: civilisationDepart.economie,
                corrompues: { societe: false, gouvernement: false, economie: false }
              },
              // Focus héroïques / secteurs : hors périmètre de cette session
              // (Phases 3 et 4), champs prévus dans la forme attendue.
              // focusJoueur (Phase 4, partielle) : vraie mise en place
              // désormais (voir FocusService.obtenirMiseEnPlace ci-dessus).
              // [Nettoyage Session 9] Les cartes SONT jouables depuis la
              // Session 4 (js/focusEngine.js) — l'ancienne mention "pas
              // encore jouables" ici était obsolète, corrigée.
              focusHeroiques: { cycle1: [null, null, null], cycle2: [null, null, null], cycle3: [null, null, null] },
              focusHeroiquesPioches: [],
              focusJoueur: focusJoueur
            };

            var plateauMaison = {
              partieId: id,
              technologieDepart: maisonJoueur.technologieDepart.nom,
              technologieDepartAmelioree: false,
              ressourceNourriture: ressourcesDepart.nourriture,
              ressourceEnergie: ressourcesDepart.energie,
              ressourceMateriel: ressourcesDepart.materiel,
              ressourceCredit: ressourcesDepart.credit,
              ressourceScience: ressourcesDepart.science,
              influence: INFLUENCE_DEPART,
              cubeActif: cubeActifDepart,
              jetonPrime: 0,
              jetonLiberation: 0,
              jetonCommerce: [],
              gloire: GLOIRE_DEPART.slice(),
              civSociete: civilisationDepart.societe,
              civGouvernement: civilisationDepart.gouvernement,
              civEconomie: civilisationDepart.economie,
              civCorrompueSociete: false,
              civCorrompueGouvernement: false,
              civCorrompueEconomie: false,
              programme1: null,
              programme2: null,
              programme3: null,
              programme4: null,
              technologiesObtenues: [null, null, null, null, null],
              technologiesAvanceesChoisies: [null, null, null, null],
              technologiesAvanceesAmeliorees: {}
            };

            var enregistrementPartie = {
              id: id,
              dateCreation: dateCreation,
              archivee: false,
              scenarioId: partie.scenarioId,
              cycleNum: 1,
              cycleTermine: false,
              statut: 'en_cours',
              etatJson: pourEtatJson_(partie)
            };

            return Promise.all([
              DB.put('parties', enregistrementPartie),
              DB.put('plateauMaison', plateauMaison)
            ]).then(function () {
              // 17/08/2026 (Phase 3) : instanciation du plateau des secteurs
              // — après l'écriture de "parties" (secteursPartie.partieId
              // n'a pas de contrainte FK sous IndexedDB, mais on garde le
              // même ordre que côté GAS par cohérence). Tolérant en soi
              // (voir SecteurService.instancierSecteurs) : une erreur ici
              // ne remonte jamais jusqu'à la création de la partie.
              if (typeof SecteurService !== 'undefined' && SecteurService.instancierSecteurs) {
                return SecteurService.instancierSecteurs(partie);
              }
            }).then(function () {
              return ajouterHistorique_(id, 'creation_partie', maisonJoueur.nom);
            }).then(function () {
              return assemblerPartie_(enregistrementPartie, plateauMaison);
            });
          });
      });
    },

    /**
     * Récupère une partie existante par id (ou null si absente).
     */
    obtenirPartie: function (id) {
      return Promise.all([DB.get('parties', id), DB.get('plateauMaison', id)]).then(function (resultats) {
        if (!resultats[0]) return null;
        return assemblerPartie_(resultats[0], resultats[1]);
      });
    },

    /**
     * Retourne toutes les parties enregistrées (état complet), triées par
     * date de création décroissante — utilisé pour l'écran Historique.
     */
    listerParties: function () {
      return Promise.all([DB.getAll('parties'), DB.getAll('plateauMaison')]).then(function (resultats) {
        var lignesParties = resultats[0];
        var plateaux = resultats[1];
        var plateauParId = {};
        plateaux.forEach(function (p) { plateauParId[p.partieId] = p; });

        return lignesParties
          .map(function (ligne) { return assemblerPartie_(ligne, plateauParId[ligne.id]); })
          .sort(function (a, b) { return (b.dateCreation || '').localeCompare(a.dateCreation || ''); });
      });
    },

    /**
     * Sauvegarde une partie déjà créée (le client garde l'état complet en
     * mémoire, comme côté GAS) + ajoute une ligne au journal d'actions.
     */
    sauvegarderPartie: function (partie, action, details) {
      if (!partie || !partie.id) {
        return Promise.reject(new Error('Partie invalide (id manquant).'));
      }
      var enregistrementPartie = {
        id: partie.id,
        dateCreation: partie.dateCreation,
        archivee: !!partie.archivee,
        scenarioId: partie.scenarioId || null,
        cycleNum: partie.cycleNum || 1,
        cycleTermine: !!partie.cycleTermine,
        statut: partie.cycleTermine ? 'terminee' : 'en_cours',
        etatJson: pourEtatJson_(partie)
      };
      return DB.put('parties', enregistrementPartie).then(function () {
        return ajouterHistorique_(partie.id, action, details || '');
      }).then(function () {
        return partie;
      });
    },

    /**
     * Bascule/fixe le flag "archivee" d'une partie. Lecture-fusion-écriture
     * pour ne toucher QUE ce champ (règle projet : ne jamais rerender/
     * écraser les autres champs si un seul est modifié localement).
     */
    archiverPartie: function (id, archivee) {
      return DB.get('parties', id).then(function (ligne) {
        if (!ligne) throw new Error('Partie introuvable pour archivage (id : ' + id + ').');
        ligne.archivee = !!archivee;
        return DB.put('parties', ligne);
      }).then(function () { return true; });
    },

    /**
     * Supprime définitivement une partie (quel que soit son statut).
     * L'historique n'est jamais supprimé (pas de FK sous IndexedDB, comme
     * côté GAS où historique.partie_id n'a pas de contrainte).
     */
    supprimerPartie: function (id) {
      return DB.get('parties', id).then(function (ligne) {
        if (!ligne) throw new Error('Partie introuvable pour suppression (id : ' + id + ').');
        return supprimerPartieInterne_(id);
      }).then(function () {
        return ajouterHistorique_(id, 'suppression_partie', '');
      }).then(function () { return true; });
    },

    /**
     * Supprime définitivement toutes les parties NON archivées
     * (irréversible, confirmation côté client). Retourne le nombre de
     * parties supprimées.
     */
    supprimerToutesPartiesNonArchivees: function () {
      return DB.getAll('parties').then(function (lignes) {
        var aCibler = lignes.filter(function (l) { return !l.archivee; });
        return Promise.all(aCibler.map(function (l) { return supprimerPartieInterne_(l.id); }))
          .then(function () {
            return ajouterHistorique_(null, 'suppression_masse', aCibler.length + ' partie(s) non archivée(s) supprimée(s).');
          })
          .then(function () { return aCibler.length; });
      });
    },

    /**
     * Mise à jour partielle du plateau maison (ressources, influence, cube
     * actif, jetons, Gloire, Programmes, technologiesObtenues). Liste
     * blanche volontaire — un appelant ne doit pouvoir écrire QUE ces
     * champs (pas civSociete ni technologieDepart, qui ont leurs propres
     * fonctions dédiées, portées en Phase 3/5). Lecture-fusion-écriture :
     * ne touche jamais aux champs non fournis dans `champs`.
     */
    majPlateauMaison: function (partieId, champs) {
      var filtre = {};
      Object.keys(champs || {}).forEach(function (cle) {
        if (CHAMPS_PLATEAU_MAISON_AUTORISES.indexOf(cle) !== -1) filtre[cle] = champs[cle];
      });
      if (!Object.keys(filtre).length) {
        return Promise.reject(new Error('Aucun champ valide à mettre à jour.'));
      }

      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour mise à jour (partie ' + partieId + ').');
        Object.keys(filtre).forEach(function (cle) { ligne[cle] = filtre[cle]; });
        return DB.put('plateauMaison', ligne);
      });
    },

    /**
     * 17/08/2026 (Session 5, Phase 5 — Civilisation) : mise à jour
     * partielle des 6 champs Civilisation (niveaux des 3 pistes + leurs 3
     * marqueurs "Corrompue"), auparavant explicitement exclus de
     * majPlateauMaison ("leurs propres fonctions dédiées, portées en
     * Phase 3/5" — voir commentaire ci-dessus, on y est). Même principe
     * lecture-fusion-écriture, liste blanche séparée par cohérence avec le
     * découpage fonctionnel (civilisationService.js est seul appelant
     * prévu de celle-ci, comme focusEngine.js/écran Stratégie le sont de
     * majPlateauMaison).
     */
    majCivilisation: function (partieId, champs) {
      var CHAMPS_CIVILISATION_AUTORISES = [
        'civSociete', 'civGouvernement', 'civEconomie',
        'civCorrompueSociete', 'civCorrompueGouvernement', 'civCorrompueEconomie'
      ];
      var filtre = {};
      Object.keys(champs || {}).forEach(function (cle) {
        if (CHAMPS_CIVILISATION_AUTORISES.indexOf(cle) !== -1) filtre[cle] = champs[cle];
      });
      if (!Object.keys(filtre).length) {
        return Promise.reject(new Error('Aucun champ Civilisation valide à mettre à jour.'));
      }

      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour mise à jour (partie ' + partieId + ').');
        Object.keys(filtre).forEach(function (cle) { ligne[cle] = filtre[cle]; });
        return DB.put('plateauMaison', ligne);
      });
    },

    /**
     * 17/08/2026 (Session 12 — restauration IHM Partie) : liste des
     * événements galactiques du catalogue, groupés par cycle (1/2/3) —
     * portage direct de GameService.getEvenementsParCycle (GAS, fonction
     * JS pure lisant DataService.getEvenements(), jamais une RPC). Utilisé
     * pour peupler les menus déroulants de choix d'événement (voir
     * index.html, écran Partie).
     */
    getEvenementsParCycle: function () {
      return DB.getAll('evenements').then(function (lignes) {
        var evenements = lignes.map(formatEvenement_);
        return {
          cycle1: evenements.filter(function (e) { return String(e.cycle) === '1'; }),
          cycle2: evenements.filter(function (e) { return String(e.cycle) === '2'; }),
          cycle3: evenements.filter(function (e) { return String(e.cycle) === '3'; })
        };
      });
    },

    /**
     * 17/08/2026 (Session 12 — restauration IHM Partie) : enregistre le
     * choix d'un événement galactique pour un cycle donné (1, 2 ou 3) —
     * portage direct de GameService.choisirEvenement (GAS, fonction JS
     * pure : recherche l'événement dans le catalogue local + réécrit
     * partie.evenements.cycleN — jamais une RPC, contrairement à la
     * plupart des autres actions de l'écran Partie). partie.evenements vit
     * dans etatJson (pas de colonne dédiée, comme côté GAS) — sauvegarde
     * via sauvegarderPartie (lecture-fusion-écriture implicite : on relit
     * la partie complète juste avant de la réécrire).
     */
    choisirEvenement: function (partieId, cycle, nomEvenement) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId), DB.getAll('evenements')])
        .then(function (resultats) {
          var partie = assemblerPartie_(resultats[0], resultats[1]);
          if (!partie) throw new Error('Partie introuvable.');
          var evenement = resultats[2].map(formatEvenement_).filter(function (e) {
            return e.nom === nomEvenement && String(e.cycle) === String(cycle);
          })[0];
          if (!evenement) throw new Error('Événement introuvable pour ce cycle.');
          partie.evenements = partie.evenements || { cycle1: null, cycle2: null, cycle3: null };
          partie.evenements['cycle' + cycle] = evenement;
          return GameService.sauvegarderPartie(partie, 'choix_evenement_cycle' + cycle, nomEvenement);
        });
    },

    /**
     * 18/08/2026 (Refonte affichage Événement galactique — Plat.
     * Galactique) : fonction PURE (aucun accès DB), exposée pour l'IHM —
     * voir actionsSimplesCadre_ ci-dessus pour le détail de ce qui est
     * considéré "1 clic" (uniquement des deltas sur les 5 ressources
     * suivies par plateauMaison) et ce qui reste hors périmètre.
     */
    actionsSimplesCadre: actionsSimplesCadre_,

    /**
     * 18/08/2026 (Refonte affichage Événement galactique — Plat.
     * Galactique) : applique en un clic l'une des actions renvoyées par
     * actionsSimplesCadre_ pour le cadre `ordreCadre` de l'Événement
     * galactique choisi au Cycle `cycle` — crédite/débite les 5
     * ressources concernées sur plateauMaison et marque le cadre comme
     * résolu (evenements.cycleN.cadresAppliques[ordreCadre]) pour éviter
     * une double application. Même pattern lecture-fusion-écriture que
     * definirTechnologieAvanceeAmelioree : écriture directe sur la ligne
     * plateauMaison (pas de passage par majPlateauMaison, qui ne connaît
     * pas ce contexte "cadre d'Événement"), puis sauvegarderPartie pour
     * persister evenements (etatJson). `delta` doit être l'un des objets
     * `delta` renvoyés par actionsSimplesCadre_ (ou dérivé d'un `.gain`
     * proportionnel) — revalidé ici (RESSOURCES_SIMPLES_CADRE) avant
     * toute écriture, jamais fait confiance à l'appelant.
     */
    appliquerCadreEffet: function (partieId, cycle, ordreCadre, delta) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var lignePartie = resultats[0], lignePlateauMaison = resultats[1];
        var partie = assemblerPartie_(lignePartie, lignePlateauMaison);
        if (!partie) throw new Error('Partie introuvable.');

        var cleCycle = 'cycle' + cycle;
        var evenementCycle = (partie.evenements || {})[cleCycle];
        if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
        evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
        if (evenementCycle.cadresAppliques[ordreCadre]) {
          throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
        }

        var champsPlateauMaison = {};
        Object.keys(delta || {}).forEach(function (ressource) {
          if (RESSOURCES_SIMPLES_CADRE.indexOf(ressource) === -1) return;
          var stockActuel = partie.plateauMaison.ressources[ressource] || 0;
          var nouveauStock = stockActuel + Number(delta[ressource]);
          if (nouveauStock < 0) throw new Error('Ressource insuffisante pour appliquer ce cadre (' + ressource + ').');
          champsPlateauMaison[CHAMP_RESSOURCE_PLATEAU_MAISON_[ressource]] = nouveauStock;
        });
        if (!Object.keys(champsPlateauMaison).length) {
          throw new Error('Aucune ressource valide à appliquer pour ce cadre.');
        }

        evenementCycle.cadresAppliques[ordreCadre] = { delta: delta, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        Object.keys(champsPlateauMaison).forEach(function (champ) {
          lignePlateauMaison[champ] = champsPlateauMaison[champ];
        });

        return Promise.all([
          DB.put('plateauMaison', lignePlateauMaison),
          GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
        ]);
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
          return assemblerPartie_(r2[0], r2[1]);
        });
      });
    },

    /**
     * 19/08/2026 (Événement galactique B, Cycle 1 — Cadre 2 "Placez une
     * Corruption sur l'offre de Programme Domination") : applique un cadre
     * de type "gain" (voir data/catalogue/evenements.json) — hors
     * périmètre d'actionsSimplesCadre_ (ne porte sur aucune des 5
     * ressources plateauMaison, l'app ne suit pas l'offre de Programme) :
     * ne fait qu'enregistrer que le joueur a résolu l'effet à la main sur
     * le plateau physique, même garde-fou anti-double-application que
     * appliquerCadreEffet/appliquerCadrePlacement ci-dessus, mais sans
     * toucher plateauMaison (aucun delta à appliquer).
     */
    appliquerCadreManuel: function (partieId, cycle, ordreCadre) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var lignePartie = resultats[0], lignePlateauMaison = resultats[1];
        var partie = assemblerPartie_(lignePartie, lignePlateauMaison);
        if (!partie) throw new Error('Partie introuvable.');

        var cleCycle = 'cycle' + cycle;
        var evenementCycle = (partie.evenements || {})[cleCycle];
        if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
        evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
        if (evenementCycle.cadresAppliques[ordreCadre]) {
          throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
        }

        evenementCycle.cadresAppliques[ordreCadre] = { manuel: true, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
          return assemblerPartie_(r2[0], r2[1]);
        });
      });
    },

    /**
     * 18/08/2026 (Événement galactique A, Cycle 1 — Cadre 1) : applique un
     * cadre de type "placement" (zone "secteur_neant_adjacent", voir
     * data/catalogue/evenements.json) — hors périmètre d'actionsSimplesCadre_
     * (ne porte pas sur les 5 ressources simples de plateauMaison mais sur
     * secteursPartie). Place la structure sur le secteur choisi par le
     * joueur via SecteurService.placerElementsNeantAdjacent (qui
     * revalide Néant/adjacence/emplacements libres — jamais confiance à
     * l'appelant), puis marque le cadre comme résolu, même garde-fou
     * anti-double-application qu'appliquerCadreEffet ci-dessus.
     *
     * 18/08/2026 (Simplification UI Événement galactique — Cadre 1
     * générique) : retrouve le cadre `ordreCadre` dans
     * evenementCycle.cadres (catalogue complet de l'événement choisi,
     * déjà persisté par choisirEvenement) pour lire son `effet.elements`
     * et le transmettre tel quel à SecteurService.placerElementsNeantAdjacent
     * (générique) — auparavant appelait SecteurService.
     * placerDefenseGuildeNeantAdjacent, codée en dur pour Défense de
     * Secteur + Guilde de Scientifiques (seul jeu d'éléments existant à
     * l'époque). Permet à ce même point d'entrée de résoudre n'importe
     * quel cadre "placement" du catalogue, quels que soient ses éléments.
     */
    appliquerCadrePlacement: function (partieId, cycle, ordreCadre, numeroSecteur) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var lignePartie = resultats[0], lignePlateauMaison = resultats[1];
        var partie = assemblerPartie_(lignePartie, lignePlateauMaison);
        if (!partie) throw new Error('Partie introuvable.');

        var cleCycle = 'cycle' + cycle;
        var evenementCycle = (partie.evenements || {})[cleCycle];
        if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
        evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
        if (evenementCycle.cadresAppliques[ordreCadre]) {
          throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
        }

        var cadre = (evenementCycle.cadres || []).filter(function (c) { return c.ordre === ordreCadre; })[0];
        if (!cadre || !cadre.effet || cadre.effet.type !== 'placement') {
          throw new Error('Cadre de placement introuvable pour cet ordre.');
        }

        return SecteurService.placerElementsNeantAdjacent(partieId, numeroSecteur, cadre.effet.elements).then(function () {
          evenementCycle.cadresAppliques[ordreCadre] = { secteur: numeroSecteur, le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;
          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
        });
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
          return assemblerPartie_(r2[0], r2[1]);
        });
      });
    },

    /**
     * 19/08/2026 (Événement galactique C, Cycle 1 — Cadre 1 "Vestiges du
     * Domineum") : applique un cadre de type "placement_multiple" — jeux
     * d'éléments répartis sur des secteurs du Néant adjacents désignés par
     * un critère de Population (pas un libre choix comme "placement"
     * simple, voir SecteurService.resoudrePlacementMultipleNeantAdjacent).
     * `ciblesParGroupe` (un numéro de secteur par groupe, même ordre que
     * SecteurService.resoudrePlacementMultipleNeantAdjacent(...).groupes)
     * vient de l'appelant (StrategieService/index.html, secteur unique par
     * groupe ou choisi par le joueur en cas d'égalité de Population) mais
     * est intégralement revalidé côté SecteurService.
     * appliquerPlacementMultipleNeantAdjacent (jamais confiance à
     * l'appelant), même garde-fou anti-double-application que
     * appliquerCadrePlacement ci-dessus.
     */
    appliquerCadrePlacementMultiple: function (partieId, cycle, ordreCadre, ciblesParGroupe) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var lignePartie = resultats[0], lignePlateauMaison = resultats[1];
        var partie = assemblerPartie_(lignePartie, lignePlateauMaison);
        if (!partie) throw new Error('Partie introuvable.');

        var cleCycle = 'cycle' + cycle;
        var evenementCycle = (partie.evenements || {})[cleCycle];
        if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
        evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
        if (evenementCycle.cadresAppliques[ordreCadre]) {
          throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
        }

        var cadre = (evenementCycle.cadres || []).filter(function (c) { return c.ordre === ordreCadre; })[0];
        if (!cadre || !cadre.effet || cadre.effet.type !== 'placement_multiple') {
          throw new Error('Cadre de placement multiple introuvable pour cet ordre.');
        }

        return SecteurService.appliquerPlacementMultipleNeantAdjacent(partieId, cadre.effet, ciblesParGroupe).then(function (resultat) {
          var secteursUniques = [];
          (resultat.secteurs || []).forEach(function (numero) {
            if (secteursUniques.indexOf(numero) === -1) secteursUniques.push(numero);
          });
          evenementCycle.cadresAppliques[ordreCadre] = { secteurs: secteursUniques, le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;
          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
        });
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
          return assemblerPartie_(r2[0], r2[1]);
        });
      });
    },

    /**
     * 19/08/2026 (Événement galactique C, Cycle 1 — Cadre 2 "Etablissez
     * une Guilde OU construisez une Installation") : applique un cadre de
     * type "choix" (data/catalogue/evenements.json) dont l'option retenue
     * ne correspond à AUCUNE mécanique automatisée par l'app (ni cube/
     * construction — cleFocusEnginePourOptionCadre_ —, ni
     * Science->Technologie — optionTechnologieViaScience_) : fallback
     * générique — ne fait qu'enregistrer que le joueur a résolu l'option
     * choisie à la main sur le plateau physique, même garde-fou anti-
     * double-application que les autres appliquerCadre*, sans toucher ni
     * plateauMaison ni secteursPartie. `resume` (texte au passé, ex.
     * "Guilde établie manuellement") est fourni par l'appelant (IHM) —
     * GameService reste une couche de données pure, comme pour
     * appliquerCadreChoixFocusEngine (resume dérivé côté FocusEngine, ici
     * côté index.html faute de mécanique à déléguer).
     *
     * 19/08/2026 (Construire une Installation / Établir une Guilde
     * portées) : etablir_guilde/construire_installation, l'exemple
     * d'origine de cette fonction (Cadre 2 ci-dessus), sont désormais
     * automatisés (voir appliquerCadreChoixFocusEngine) — cette fonction
     * reste le filet de sécurité générique pour toute future option de
     * cadre "choix" sans mécanique automatisée derrière, pas figée sur un
     * cadre précis.
     */
    appliquerCadreChoixManuel: function (partieId, cycle, ordreCadre, indexOption, resume) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var lignePartie = resultats[0], lignePlateauMaison = resultats[1];
        var partie = assemblerPartie_(lignePartie, lignePlateauMaison);
        if (!partie) throw new Error('Partie introuvable.');

        var cleCycle = 'cycle' + cycle;
        var evenementCycle = (partie.evenements || {})[cleCycle];
        if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
        evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
        if (evenementCycle.cadresAppliques[ordreCadre]) {
          throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
        }

        var cadre = (evenementCycle.cadres || []).filter(function (c) { return c.ordre === ordreCadre; })[0];
        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        if (!option) throw new Error('Option de cadre introuvable pour cet ordre.');

        evenementCycle.cadresAppliques[ordreCadre] = { manuel: true, resume: resume, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
          return assemblerPartie_(r2[0], r2[1]);
        });
      });
    },

    /**
     * 18/08/2026 (Simplification UI Événement galactique — Cadre 3
     * générique, Événement B Cycle 1) : applique un cadre "choix" dont
     * l'option retenue (`indexOption`, dans cadre.effet.options) porte sur
     * une mécanique déjà automatisée côté FocusEngine (voir
     * cleFocusEnginePourOptionCadre_ ci-dessus) — hors périmètre
     * d'actionsSimplesCadre_ (ne porte pas sur les 5 ressources simples).
     * Réutilise FocusEngine.resoudreEffet (moteur pur déjà utilisé par
     * l'écran Focus pour ces mêmes clés — activer_cube y est une clé
     * "cube" générique, deployer_cube_secteur_mere y ouvre la popup dédiée
     * 'deployer_cube', etablir_guilde/construire_installation la popup
     * 'construire' via `demanderChoix`, voir focusEngine.js) plutôt que de
     * dupliquer une deuxième logique de résolution : seule source de
     * vérité pour ces mécaniques, qu'elles soient déclenchées depuis Focus
     * ou depuis un Cadre d'Événement galactique. Renommée (ex-
     * appliquerCadreChoixCube) le 19/08/2026 lors de l'ajout de
     * etablir_guilde/construire_installation — le nom "Cube" ne
     * correspondait plus à ce que fait la fonction.
     *
     * `demanderChoix` est fourni par l'appelant (StrategieService,
     * couche IHM) — GameService reste autrement une couche de données
     * pure ; FocusEngine.resoudreEffet est la SEULE fonction ici qui
     * accepte un callback IHM, exactement comme FocusEngine.
     * jouerActionEtPersister le fait déjà pour les actions Focus.
     *
     * Ne lève PAS d'erreur si le joueur annule la popup imbriquée
     * (déployer/construire), voir strategieService.js : ce n'est pas un
     * échec, `resultatEffet.succes === false` dans ce cas précis — résout
     * avec { annule: true } plutôt que de rejeter, pour que l'appelant
     * (index.html) réactive simplement le cadre sans message d'erreur,
     * cohérent avec le comportement d'Annuler sur les autres popups de
     * résolution de cadre. `champsPlateauMaison` reste borné aux champs
     * déjà surveillés par FocusEngine (CHAMPS_DIFF_SUIVIS) — jamais une
     * clé arbitraire (etablir_guilde/construire_installation ne touchent
     * d'ailleurs aucun de ces champs — mutations vide, l'écriture se fait
     * directement sur secteursPartie par la popup, voir strategieService.js).
     */
    appliquerCadreChoixFocusEngine: function (partieId, cycle, ordreCadre, indexOption, demanderChoix) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var lignePartie = resultats[0], lignePlateauMaison = resultats[1];
        var partie = assemblerPartie_(lignePartie, lignePlateauMaison);
        if (!partie) throw new Error('Partie introuvable.');

        var cleCycle = 'cycle' + cycle;
        var evenementCycle = (partie.evenements || {})[cleCycle];
        if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
        evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
        if (evenementCycle.cadresAppliques[ordreCadre]) {
          throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
        }

        var cadre = (evenementCycle.cadres || []).filter(function (c) { return c.ordre === ordreCadre; })[0];
        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        var cleFocusEngine = cleFocusEnginePourOptionCadre_(option);
        if (!cleFocusEngine) throw new Error('Option automatisable introuvable pour ce cadre.');
        if (typeof FocusEngine === 'undefined') throw new Error('FocusEngine indisponible.');

        var effet = {};
        effet[cleFocusEngine] = Number(option.valeur) || 1;

        var source = 'Cadre #' + ordreCadre;
        var lignePlateauMaisonAvecId = Object.assign({ partieId: partieId }, lignePlateauMaison);

        return FocusEngine.resoudreEffet(lignePlateauMaisonAvecId, effet, source, cadre.texte, demanderChoix)
          .then(function (resultatEffet) {
            if (!resultatEffet.succes) {
              return { annule: true };
            }

            var champs = {};
            resultatEffet.mutations.forEach(function (m) { champs[m.champ] = resultatEffet.etatResultat[m.champ]; });
            Object.keys(champs).forEach(function (champ) { lignePlateauMaison[champ] = champs[champ]; });

            var resume = resultatEffet.journal.map(function (ligne) {
              var prefixe = source + ' : ';
              return ligne.indexOf(prefixe) === 0 ? ligne.slice(prefixe.length) : ligne;
            }).join(' ').replace(/\.\s*$/, '');

            evenementCycle.cadresAppliques[ordreCadre] = { resume: resume, le: new Date().toISOString() };
            partie.evenements[cleCycle] = evenementCycle;

            return Promise.all([
              DB.put('plateauMaison', lignePlateauMaison),
              GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            ]).then(function () {
              return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
                return assemblerPartie_(r2[0], r2[1]);
              });
            });
          });
      });
    },

    /**
     * 17/08/2026 (Session 12 — restauration IHM Partie) : marque une
     * technologie possédée (départ, cible='depart' ; ou l'un des 5
     * emplacements obtenus, cible=index 0-4) comme améliorée ou non —
     * portage direct de GameService.definirTechnologieAmelioree (GAS,
     * PATCH JS direct sur plateau_maison, jamais une RPC). Écrit
     * directement sur le record `plateauMaison` (et non via
     * majPlateauMaison, qui exclut volontairement technologieDepart et
     * technologiesObtenues — "leurs propres fonctions dédiées", voir
     * commentaire de CHAMPS_PLATEAU_MAISON_AUTORISES).
     *
     * [Nettoyage Session 12] choisirTechnologieObtenue EST portée depuis
     * cette session (voir ci-dessous) — ce commentaire disait le
     * contraire (rédigé avant, quand le SQL de la RPC n'était pas encore
     * récupéré) : corrigé, aucune conséquence fonctionnelle.
     */
    definirTechnologieAmelioree: function (partieId, cible, amelioree) {
      amelioree = !!amelioree;
      return DB.get('plateauMaison', partieId).then(function (ligne) {
        if (!ligne) throw new Error('Plateau maison introuvable pour mise à jour (partie ' + partieId + ').');

        if (cible === 'depart') {
          ligne.technologieDepartAmelioree = amelioree;
          return DB.put('plateauMaison', ligne);
        }

        var slot = Number(cible);
        if (slot < 0 || slot > 4) throw new Error('Emplacement de technologie invalide.');
        var technologiesObtenues = ligne.technologiesObtenues || [null, null, null, null, null];
        if (!technologiesObtenues[slot]) throw new Error('Aucune technologie à cet emplacement.');
        technologiesObtenues[slot] = Object.assign({}, technologiesObtenues[slot], { amelioree: amelioree });
        ligne.technologiesObtenues = technologiesObtenues;
        return DB.put('plateauMaison', ligne);
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
          return assemblerPartie_(resultats[0], resultats[1]);
        });
      });
    },

    /**
     * 17/08/2026 (Session 12 — SQL RPC récupéré) : fait avancer la partie
     * au cycle suivant (1 -> 2 -> 3 -> 'termine') — portage direct de la
     * RPC avancer_cycle (rpc.json). cycleActuel n'est jamais stocké tel
     * quel côté PWA (calculé à la lecture, voir assemblerPartie_) : seule
     * la partie utile de la RPC compte ici — incrément de cycleNum/
     * cycleTermine + amorçage de focusHeroiques/focusHeroiquesPioches
     * pour le nouveau cycle si absents.
     */
    avancerCycle: function (partieId) {
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        if (partie.cycleTermine || partie.cycleNum >= 3) {
          partie.cycleTermine = true;
          partie.cycleActuel = 'termine';
        } else {
          partie.cycleNum = partie.cycleNum + 1;
          partie.cycleTermine = false;
          partie.cycleActuel = partie.cycleNum;

          if (!partie.focusHeroiques) {
            partie.focusHeroiques = { cycle1: [null, null, null], cycle2: [null, null, null], cycle3: [null, null, null] };
          }
          var cle = 'cycle' + partie.cycleNum;
          if (!partie.focusHeroiques[cle]) partie.focusHeroiques[cle] = [null, null, null];
          if (!partie.focusHeroiquesPioches) partie.focusHeroiquesPioches = [];
        }

        return GameService.sauvegarderPartie(partie, 'avancer_cycle', 'cycle suivant');
      });
    },

    /**
     * 17/08/2026 (Session 12 — SQL RPC récupéré) : enregistre (ou retire,
     * si nom est vide) le Focus héroïque choisi manuellement pour un
     * emplacement (0/1/2) d'un cycle donné — portage direct de la RPC
     * choisir_focus_heroique (rpc.json). Un même Focus héroïque ne peut
     * être choisi qu'une fois par partie, tous cycles confondus
     * (focusHeroiquesPioches) ; remplacer un emplacement déjà occupé
     * libère l'ancien choix. Construction de la carte (regroupement des
     * 2-3 actions du catalogue "focus") déléguée à
     * FocusService.obtenirCarteHeroiqueParNom, déjà porté et testé
     * (Session 4, focusService.js) — la RPC faisait exactement la même
     * chose (boucle sur la table focus filtrée type='Héroïque').
     *
     * ⚠️ Contrairement à avancerCycle/choisirTechnologieObtenue, la RPC
     * d'origine n'écrit PAS d'entrée d'historique pour cette action
     * (supabaseRpc_ simple côté DataService.js GAS, pas
     * supabaseRpcEtHistorique_) — reproduit ici à l'identique (écriture
     * directe dans `parties`, sans ajouterHistorique_).
     */
    choisirFocusHeroique: function (partieId, cycle, slot, nom) {
      slot = Number(slot);
      if (slot < 0 || slot > 2) return Promise.reject(new Error('Emplacement de Focus héroïque invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        if (!partie.focusHeroiques) {
          partie.focusHeroiques = { cycle1: [null, null, null], cycle2: [null, null, null], cycle3: [null, null, null] };
        }
        var cle = 'cycle' + cycle;
        if (!partie.focusHeroiques[cle]) partie.focusHeroiques[cle] = [null, null, null];

        var pioches = (partie.focusHeroiquesPioches || []).slice();
        var ancienne = partie.focusHeroiques[cle][slot];
        if (ancienne) {
          var idxAncienne = pioches.indexOf(ancienne.focus);
          if (idxAncienne !== -1) pioches.splice(idxAncienne, 1);
        }

        var suite;
        if (!nom) {
          partie.focusHeroiques[cle][slot] = null;
          suite = Promise.resolve();
        } else {
          if (pioches.indexOf(nom) !== -1) {
            return Promise.reject(new Error('"' + nom + '" a déjà été choisi ce cycle ou lors d\'un cycle précédent.'));
          }
          suite = FocusService.obtenirCarteHeroiqueParNom(nom).then(function (carte) {
            partie.focusHeroiques[cle][slot] = carte;
            pioches.push(nom);
          });
        }

        return suite.then(function () {
          partie.focusHeroiquesPioches = pioches;
          var enregistrementPartie = {
            id: partie.id,
            dateCreation: partie.dateCreation,
            archivee: !!partie.archivee,
            scenarioId: partie.scenarioId || null,
            cycleNum: partie.cycleNum || 1,
            cycleTermine: !!partie.cycleTermine,
            statut: partie.cycleTermine ? 'terminee' : 'en_cours',
            etatJson: pourEtatJson_(partie)
          };
          return DB.put('parties', enregistrementPartie).then(function () { return partie; });
        });
      });
    },

    /**
     * 17/08/2026 (Session 12 — SQL RPC récupéré) : enregistre (ou retire,
     * si nomTechnologie est vide) la technologie obtenue dans l'un des 5
     * emplacements du plateau maison, parmi les technologies des maisons
     * déchues (partie.adversaires) — portage direct de la RPC
     * choisir_technologie_obtenue (rpc.json).
     */
    choisirTechnologieObtenue: function (partieId, slot, nomTechnologie) {
      slot = Number(slot);
      if (slot < 0 || slot > 4) return Promise.reject(new Error('Emplacement de technologie invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        var technologies = (partie.technologiesObtenues || [null, null, null, null, null]).slice();

        if (!nomTechnologie) {
          technologies[slot] = null;
        } else {
          var trouvee = null;
          (partie.adversaires || []).forEach(function (maison) {
            (maison.technologies || []).forEach(function (t) {
              if (t.nom === nomTechnologie) {
                trouvee = { nom: t.nom, type: t.type || '', sansPoint: !!t.sansPoint, maison: maison.nom };
              }
            });
          });
          if (!trouvee) throw new Error('Technologie introuvable parmi les maisons déchues.');
          technologies[slot] = trouvee;
        }

        return GameService.majPlateauMaison(partieId, { technologiesObtenues: technologies }).then(function () {
          return ajouterHistorique_(partieId, 'technologie_obtenue_slot' + slot, nomTechnologie || '(retirée)');
        }).then(function () {
          return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
            return assemblerPartie_(r2[0], r2[1]);
          });
        });
      });
    },

    /**
     * 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) :
     * enregistre (ou retire, si nomTechnologie est vide) le choix d'une
     * des 4 Technologies avancées (parmi les 8 des maisons déchues) —
     * même principe que choisirTechnologieObtenue (recherche dans
     * partie.adversaires, écriture via majPlateauMaison), mais nouvelle
     * mécanique confirmée par l'utilisateur (session du 17/08) :
     *   - le choix ne se fait qu'au cycle 1 (rejette sinon — les 4
     *     emplacements sont fixés pour le reste de la partie une fois le
     *     cycle 1 passé) ;
     *   - une même technologie ne peut occuper qu'un seul des 4
     *     emplacements à la fois (contrairement à choisirTechnologieObtenue,
     *     qui ne vérifie pas ce doublon côté serveur — reproduit tel quel
     *     là-bas, mais gênant ici vu que les 4 NON choisies deviennent le
     *     groupe du cycle 3, un doublon fausserait ce complément).
     * L'amélioration (case à cocher) est gérée séparément par
     * definirTechnologieAvanceeAmelioree, jamais ici.
     */
    choisirTechnologieAvancee: function (partieId, slot, nomTechnologie) {
      slot = Number(slot);
      if (slot < 0 || slot > 3) return Promise.reject(new Error('Emplacement de technologie avancée invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');
        if (partie.cycleActuel !== 1) {
          throw new Error('Les Technologies avancées ne se choisissent qu\'au cycle 1.');
        }

        var choisies = (partie.technologiesAvanceesChoisies || [null, null, null, null]).slice();

        if (!nomTechnologie) {
          choisies[slot] = null;
        } else {
          var trouvee = technologiesAdversesToutes_(partie).filter(function (t) { return t.nom === nomTechnologie; })[0];
          if (!trouvee) throw new Error('Technologie avancée introuvable parmi les maisons déchues.');
          var dejaPriseAilleurs = choisies.some(function (t, i) { return i !== slot && t && t.nom === nomTechnologie; });
          if (dejaPriseAilleurs) throw new Error('Cette technologie est déjà choisie à un autre emplacement.');
          choisies[slot] = { nom: trouvee.nom, maison: trouvee.maison };
        }

        return GameService.majPlateauMaison(partieId, { technologiesAvanceesChoisies: choisies }).then(function () {
          return ajouterHistorique_(partieId, 'technologie_avancee_slot' + slot, nomTechnologie || '(retirée)');
        }).then(function () {
          return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
            return assemblerPartie_(r2[0], r2[1]);
          });
        });
      });
    },

    /**
     * 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) : marque
     * une Technologie avancée (identifiée par son nom, pas un slot — elle
     * peut appartenir au groupe du cycle 2 ou à celui du cycle 3) comme
     * améliorée ou non. Écrit directement sur `plateauMaison`, même
     * pattern que definirTechnologieAmelioree (pas de passage par
     * majPlateauMaison, cette technique a "sa propre fonction dédiée").
     * Rejette si la technologie n'est pas dans le groupe actif du cycle en
     * cours (groupeActifTechnologiesAvancees_) — règle confirmée par
     * l'utilisateur : le groupe du cycle 1 n'est jamais améliorable, celui
     * du cycle 2 l'est uniquement au cycle 2, celui du cycle 3
     * (complément, calculé) uniquement au cycle 3.
     */
    definirTechnologieAvanceeAmelioree: function (partieId, nomTechnologie, amelioree) {
      amelioree = !!amelioree;
      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        var groupeActif = groupeActifTechnologiesAvancees_(partie);
        if (groupeActif.indexOf(nomTechnologie) === -1) {
          throw new Error('Cette technologie avancée n\'est pas améliorable ce cycle-ci.');
        }

        return DB.get('plateauMaison', partieId).then(function (ligne) {
          var ameliorees = Object.assign({}, ligne.technologiesAvanceesAmeliorees || {});
          ameliorees[nomTechnologie] = amelioree;
          ligne.technologiesAvanceesAmeliorees = ameliorees;
          return DB.put('plateauMaison', ligne);
        });
      }).then(function () {
        return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r2) {
          return assemblerPartie_(r2[0], r2[1]);
        });
      });
    },

    /**
     * 17/08/2026 (Lot C — Plat. Galactique, Technologies avancées) :
     * fonction PURE (aucun accès DB) exposée pour l'IHM (index.html) —
     * regroupe la logique d'affichage par cycle (quelles 4 technologies
     * montrer, lesquelles sont améliorables) au même endroit que la
     * logique d'écriture ci-dessus (groupeActifTechnologiesAvancees_),
     * pour éviter toute divergence entre affichage et persistance.
     *   - toutes : les 8 technologies des maisons déchues (mise en place).
     *   - groupeA : les 4 choisies au cycle 1 (partie.technologiesAvancees
     *     Choisies, dans l'ordre des emplacements — peut contenir des null
     *     tant que le choix du cycle 1 n'est pas terminé).
     *   - groupeB : le complément des 4 autres parmi les 8 (calculé, jamais
     *     stocké) — vide tant que groupeA n'a pas ses 4 emplacements remplis.
     *   - actif : les noms améliorables CE cycle-ci (voir
     *     groupeActifTechnologiesAvancees_) — [] aux cycles 1 et 'termine'.
     */
    obtenirTechnologiesAvanceesGroupes: function (partie) {
      var toutes = technologiesAdversesToutes_(partie);
      var choisies = partie.technologiesAvanceesChoisies || [null, null, null, null];
      var nomsChoisis = choisies.filter(Boolean).map(function (t) { return t.nom; });
      var groupeB = nomsChoisis.length === 4
        ? toutes.filter(function (t) { return nomsChoisis.indexOf(t.nom) === -1; })
        : [];
      return {
        toutes: toutes,
        groupeA: choisies,
        groupeB: groupeB,
        actif: groupeActifTechnologiesAvancees_(partie)
      };
    }
  };
})();
