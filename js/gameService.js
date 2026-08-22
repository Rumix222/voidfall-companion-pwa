/**
 * gameService.js
 * Cycle de vie de partie — Voidfall Companion PWA
 *
 * Créer / lire / lister / sauvegarder / archiver / supprimer une partie ;
 * mise à jour partielle du plateau maison (majPlateauMaison) ; Événement
 * galactique (sélection par cycle, Cadres — automatisés quand possible,
 * sinon résolution manuelle) ; avancement de cycle ; Focus héroïques ;
 * Technologies (obtenues, avancées) ; délégation à CivilisationService
 * pour les pistes de Civilisation (majCivilisation).
 *
 * Séparation de colonnes (invariant du fichier) : civilisation /
 * cycleActuel / technologiesObtenues / plateauMaison ne sont JAMAIS
 * sérialisés dans `parties.etatJson` — ils vivent dans leurs clés dédiées
 * (record `plateauMaison`, ou colonnes cycleNum/cycleTermine de
 * `parties`). Voir pourEtatJson_/assemblerPartie_ ci-dessous. `etatJson`
 * ne contient QUE les champs sans colonne dédiée : joueur (sans
 * technologieDepart, autoritaire dans plateauMaison), adversaires,
 * evenements, technologiesAcquises, focusJoueur, focusHeroiques,
 * focusHeroiquesPioches — id/dateCreation/archivee/scenarioId/cycleNum/
 * cycleTermine vivent en colonnes top-level du record `parties`, jamais
 * dupliqués dans le blob.
 *
 * `cycleActuel` n'est PAS stocké comme un champ redondant en plus de
 * cycleNum/cycleTermine : il est recalculé à chaque lecture
 * (assemblerPartie_) à partir de ces deux colonnes, qui restent seules
 * autoritaires — évite une source de vérité en trop à garder synchronisée
 * par les fonctions de cycle.
 *
 * Champ `technologiesAvanceesAmeliorees` (map {nom: bool}, sur
 * plateauMaison) : lu par focusEngine.js pour l'effet
 * "influence_par_technologie_amelioree" (voir focusEngine.test.js) — un
 * contrat actif. Sa valeur reste structurellement toujours `{}` en usage
 * réel : aucune UI ne l'alimente aujourd'hui (majPlateauMaison ne
 * l'autorise pas non plus via CHAMPS_PLATEAU_MAISON_AUTORISES) — gap
 * fonctionnel connu (UI manquante pour marquer une Technologie avancée
 * comme améliorée), pas du code mort.
 *
 * technologiesObtenues compte 5 emplacements (le tableau par défaut) ;
 * avec la Technologie de départ (fixe, hors de ce tableau), cela fait 6
 * technologies maximum au total. Une partie dont une technologie occupe
 * un 6e emplacement (ancien format) la conserve telle quelle en base
 * (colonne dédiée, jamais tronquée ici) — seul index.html limite
 * l'affichage/l'édition à 5.
 *
 * Identifiant de partie : crypto.randomUUID(), généré une seule fois à la
 * création — unicité locale par appareil, aucun serveur à consulter.
 *
 * Dépend de db.js (objet global DB) : à charger avant ce fichier.
 * secteurService.js et focusService.js sont des dépendances optionnelles
 * de creerPartie (gardées par `typeof X !== 'undefined'`) : ce fichier
 * reste utilisable seul (tests) si l'un ou l'autre n'est pas chargé.
 * FocusEngine est résolu en référence globale paresseuse (au moment de
 * l'appel, pas au chargement) par appliquerCadreChoixFocusEngine, ce qui
 * permet à focusEngine.js d'être chargé après gameService.js dans
 * index.html malgré la dépendance inverse que FocusEngine a lui-même sur
 * GameService pour son orchestrateur jouerActionEtPersister.
 */

var GameService = (function () {
  'use strict';

  // Mise en place solo — constantes du livret, identiques pour toute
  // Maison/Origine.
  var INFLUENCE_DEPART = 10;
  var GLOIRE_DEPART = [2, null, null, null, null];

  var CHAMPS_PLATEAU_MAISON_AUTORISES = [
    'ressourceNourriture', 'ressourceEnergie', 'ressourceMateriel',
    'ressourceCredit', 'ressourceScience', 'influence', 'cubeActif',
    'jetonPrime', 'jetonLiberation', 'jetonCommerce', 'gloire',
    'programme1', 'programme2', 'programme3', 'programme4',
    'technologiesObtenues', 'technologiesAvanceesChoisies',
    // Compteur manuel des Corruptions actuellement stockées sur la
    // Technologie "Chambres de décontamination" (jeton simple, même
    // principe que jetonPrime/jetonLiberation — voir strategieService.js,
    // jetonInputHTML_/persisterJeton_). Le jeu ne gagne PAS automatiquement
    // de Corruption sur cette case (mécanique de stockage non automatisée) :
    // l'incrémenter reste manuel, le décrémenter peut se faire via l'effet
    // retirer_corruption (FocusEngine.js) si le joueur possède la
    // Technologie.
    'corruptionChambreDecontamination',
    // Compteur générique du nombre de Corruptions actuellement sur la
    // fiche Maison — tenu à jour automatiquement par
    // CivilisationService.definirCorruption pour les pistes de
    // Civilisation (via majCivilisation, voir CHAMPS_CIVILISATION_
    // AUTORISES ci-dessous) ; whitelisté ICI en plus pour permettre la
    // saisie manuelle directe (Programmes/Chambres de décontamination,
    // non automatisées — champ éditable, strategieService.js).
    'corruptionMaison'
  ];

  // ------------------------------------------------------------
  // Utilitaires génériques
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
        return { nom: t.nom, type: t.type || '', texte: t.texte || '', texteAmeliore: t.texteAmeliore || '' };
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
  // Accès catalogue (stores IndexedDB peuplés par catalogueSync.js).
  // ------------------------------------------------------------

  /**
   * Jointure maisons + technologies (clés catalogue camelCase, voir
   * catalogueSync.js) -> [{ nom, complexite, technologies: [{nom, type,
   * texte, texteAmeliore}] }]. "texte" alimente le tooltip des badges
   * technologie sur l'écran Partie ; "texteAmeliore" celui de la case
   * "Améliorée" (Plat. maison, voir index.html
   * renderTechnologiesObtenues_/renderEcranPlateauMaison_).
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
          return { nom: nomTech, type: t ? (t.type || '') : '', texte: t ? (t.texte || '') : '', texteAmeliore: t ? (t.texteAmeliore || '') : '' };
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
   * Les 8 technologies des 4 maisons déchues (mise en place), toutes
   * maisons confondues — même liste source que choisirTechnologieObtenue
   * (slots "Technologies obtenues") et que toutesTechnologiesAdverses_
   * (index.html/strategieService.js), exposée ici en fonction réutilisable
   * pour les fonctions Technologies avancées ci-dessous (choix + calcul du
   * groupe actif par cycle).
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
   * Règle du groupe actif : les 4 Technologies avancées choisies au
   * cycle 1 (partie.technologiesAvanceesChoisies) sont améliorables au
   * cycle 2 ; au cycle 3, ce sont les 4 AUTRES parmi les 8 (le complément,
   * calculé, jamais choisi manuellement) qui deviennent améliorables, à la
   * place des 4 premières (pas en plus). Aucune amélioration possible au
   * cycle 1 (rien
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
   * Formate un événement galactique. data/catalogue/evenements.json
   * structure chaque événement en `cadres[]` (effets de la moitié gauche
   * de la carte, résolus en Phase Préparation, à l'ouverture du Cycle —
   * voir docs/docs-rules-cycle-de-jeu.md §1.5) et `objectifs.blocs[]`
   * (moitié droite, évalués en Phase Évaluation, §3.3). `manches` (haut
   * droit de la carte, §2 Introduction) est conservé tel quel.
   * `instruction` (champ optionnel côté catalogue, popup de résolution
   * manuelle d'un cadre "gain" — voir index.html
   * appliquerCadreManuelEtRafraichir_) est absent par défaut (null),
   * jamais bloquant pour un cadre qui n'en définit pas.
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
  // RESSOURCES_SIMPLES_CADRE est identique à FocusEngine.RESSOURCES_
  // PRODUCTION, et CHAMP_RESSOURCE_PLATEAU_MAISON_ est un sous-ensemble
  // exact de FocusEngine.CHAMP_PAR_CLE (les 5 premières entrées) — PAS
  // fusionnées : gameService.js charge avant focusEngine.js (index.html)
  // et reste volontairement utilisable sans lui (seule exception déjà
  // existante : appliquerCadreChoixFocusEngine, qui vérifie `typeof
  // FocusEngine` avant utilisation). Si l'une de ces 5 ressources change
  // ici, vérifier l'autre copie côté focusEngine.js.
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
   * Correspondance entre une option `effet.options[i]` d'un cadre "choix"
   * et la clé Effet reconnue par FocusEngine.resoudreCle_ : d'abord pour
   * les cubes de Puissance Navale (voir focusEngine.js,
   * CLES_DEPLOYER_CUBE et la clé générique "cube") — { cle: 'activer_cube',
   * valeur: N } et { cle: 'deployer_cube', valeur: N, cible: 'secteur_mere'
   * | absent } — puis pour construction/établissement — { cle:
   * 'etablir_guilde', valeur: N } / { cle: 'construire_installation',
   * valeur: N } (identité — FocusEngine.resoudreCle_ reconnaît ces clés
   * telles quelles, voir CLES_CONSTRUIRE côté focusEngine.js). Retourne
   * null si l'option ne correspond à aucune des formes reconnues (jamais
   * d'invention de clé FocusEngine à partir d'une donnée non prévue).
   */
  function cleFocusEnginePourOptionCadre_(option) {
    if (!option || !option.cle) return null;
    if (option.cle === 'activer_cube') return 'activer_cube';
    if (option.cle === 'deployer_cube') {
      if (option.cible === 'secteur_mere') return 'deployer_cube_secteur_mere';
      if (!option.cible) return 'deployer_cube';
    }
    if (option.cle === 'etablir_guilde' || option.cle === 'construire_installation') return option.cle;
    if (option.cle === 'etablir_guilde_banquier' || option.cle === 'augmenter_population_pure') return option.cle;
    // Même mécanisme générique — FocusEngine.resoudreCle_ reconnaît
    // nativement 'retirer_corruption', identité comme les autres clés
    // ci-dessus.
    if (option.cle === 'retirer_corruption') return option.cle;
    // Même mécanisme générique — FocusEngine.resoudreCle_ reconnaît
    // nativement 'avancer_civilisation' (piste au choix) et
    // 'avancer_civilisation_societe'/'_gouvernement'/'_economie' (piste
    // imposée).
    if (option.cle === 'avancer_civilisation' || option.cle === 'avancer_civilisation_societe' ||
      option.cle === 'avancer_civilisation_gouvernement' || option.cle === 'avancer_civilisation_economie') {
      return option.cle;
    }
    // Même mécanisme générique — FocusEngine.resoudreCle_ reconnaît
    // nativement 'ameliorer_gloire', résolue sans popup (déterministe).
    if (option.cle === 'ameliorer_gloire') return option.cle;
    return null;
  }

  // ------------------------------------------------------------
  // Effet "Gagner une Corruption" d'un Cadre d'Événement galactique — type
  // "gain", data/catalogue/evenements.json (voir
  // docs-rules-corruption-gardiens-refuges-technoConsume.md §1) :
  // resoudreCiblesCadreGainCorruption_ traduit le vocabulaire de cible du
  // catalogue ("cible"/"cible_options"/"repli"/"restriction") vers les 4
  // cibles concrètes reconnues par la popup 'gagner_corruption'
  // (strategieService.js) — 'secteur'/'piste'/'programme'/'techno'. Volon-
  // tairement CONSERVATEUR : retourne `null` (cadre non automatisable, la
  // main appelante (index.html) reste alors sur l'existant appliquerCadreManuel,
  // AUCUNE régression) dès que :
  // - `effet.elements` contient autre chose que "corruption" seule (cadre
  //   composé, ex. "Augmentez la Population... Ensuite placez une
  //   Corruption sur CE secteur" — cible contextuelle non modélisable ici) ;
  // - `effet.effet_conditionnel` est présent ET ne correspond PAS
  //   exactement au gabarit reconnu par conditionAvancerPisteSiCorrompue_
  //   ci-dessous (Événement G Cycle 1 Cadre 1 — "si la Corruption est
  //   placée sur une piste... le joueur doit avancer sur cette piste [en
  //   ignorant le bénéfice de la case atteinte]" — SEUL effet_conditionnel
  //   automatisé à ce jour, via CivilisationService.avancerPisteSansEffet,
  //   civilisationService.js v5 — qui n'a PAS la sémantique de
  //   avancerPisteCorrompue, laquelle décoche la piste en avançant ; tout
  //   AUTRE effet_conditionnel reste hors périmètre, laissé manuel) ;
  // - une cible (primaire OU de repli) ne correspond à aucune entrée
  //   connue — notamment "offre_programme" (case précise du plateau des
  //   Programmes, jamais suivie en base — reste manuel, comme demandé) et
  //   "chaque_offre_programme_non_corrompue"/"meme_secteur_que_etape_
  //   precedente" (effets sur plusieurs cibles/contextuels, hors périmètre).
  // Vérifié sur tout evenements.json : ce filtre couvre exactement les
  // Cadres "gain" corruption dont la cible est un choix personnel du
  // joueur parmi secteur/piste/Programme/Technologie (avec repli éventuel),
  // et exclut tout le reste — aucune automatisation approximative.
  // ------------------------------------------------------------
  var CIBLE_KIND_MAP_GAIN_CORRUPTION_ = {
    piste_civilisation: ['piste'],
    secteur_au_choix: ['secteur'],
    emplacement_programme: ['programme'],
    fiche_maison: ['piste', 'programme'],
    carte_technologie_chambres_decontamination: ['techno']
  };

  function traduireCiblesGainCorruption_(cibles) {
    var resultat = [];
    for (var i = 0; i < cibles.length; i++) {
      var mappees = CIBLE_KIND_MAP_GAIN_CORRUPTION_[cibles[i]];
      if (!mappees) return null;
      resultat = resultat.concat(mappees);
    }
    return resultat;
  }

  // Reconnaît EXACTEMENT le gabarit imprimé sur la carte de l'Événement
  // galactique G, Cycle 1, Cadre 1 — "si_cible":"piste_civilisation",
  // "condition":"marqueur_pas_case_la_plus_a_droite",
  // "consequence":{"cle":"avancer_piste_civilisation","valeur":1,...} (voir
  // data/catalogue/evenements.json) — et rien d'autre, pour ne prendre
  // AUCUN risque sur un futur Cadre au vocabulaire similaire mais à la
  // sémantique différente (aucune autre carte du catalogue n'utilise
  // "effet_conditionnel" à ce jour, vérifié sur tout evenements.json).
  function conditionAvancerPisteSiCorrompue_(effetConditionnel) {
    return !!effetConditionnel &&
      effetConditionnel.si_cible === 'piste_civilisation' &&
      effetConditionnel.condition === 'marqueur_pas_case_la_plus_a_droite' &&
      !!effetConditionnel.consequence &&
      effetConditionnel.consequence.cle === 'avancer_piste_civilisation' &&
      Number(effetConditionnel.consequence.valeur) === 1;
  }

  function resoudreCiblesCadreGainCorruption_(effet) {
    if (!effet || effet.type !== 'gain') return null;
    var avancerPisteApresPlacement = conditionAvancerPisteSiCorrompue_(effet.effet_conditionnel);
    if (effet.effet_conditionnel && !avancerPisteApresPlacement) return null;
    var elements = effet.elements || {};
    var clesElements = Object.keys(elements);
    if (clesElements.length !== 1 || clesElements[0] !== 'corruption' || typeof elements.corruption !== 'number' || elements.corruption < 1) {
      return null;
    }

    var ciblesPrimaires = effet.cible ? [effet.cible] : (Array.isArray(effet.cible_options) ? effet.cible_options : null);
    if (!ciblesPrimaires || !ciblesPrimaires.length) return null;
    var tier1 = traduireCiblesGainCorruption_(ciblesPrimaires);
    if (!tier1) return null;

    var tier2 = [];
    if (effet.repli && Array.isArray(effet.repli.cibles_possibles)) {
      var tier2Traduit = traduireCiblesGainCorruption_(effet.repli.cibles_possibles);
      if (!tier2Traduit) return null;
      tier2 = tier2Traduit;
    }

    return {
      quantite: elements.corruption,
      ciblesAutorisees: tier1,
      ciblesRepli: tier2,
      exclureTechno: effet.restriction === 'stockage_chambres_decontamination_interdit',
      avancerPisteApresPlacement: avancerPisteApresPlacement
    };
  }

  /**
   * Construit le texte "✓ Appliqué (...)" pour
   * GameService.appliquerCadreChoixPlacement ci-dessous — `elements` est
   * le dict RÉSOLU (jamais la clé générique "guilde", toujours
   * "guilde_<type>" une fois le type choisi). Pas de réutilisation
   * d'abregerResumeCadre_ (index.html) : ses gabarits reconnus
   * ("Population du Secteur N augmentée de...", "Guilde X établie sur...")
   * ne correspondent pas à ce cas (plusieurs éléments combinés en un seul
   * placement) — texte déjà concis nativement, laissé tel quel
   * (abregerResumeCadre_ le laisse de toute façon passer inchangé si
   * aucun de ses gabarits ne correspond).
   */
  var LABEL_TYPE_GUILDE_RESUME_ = {
    fermiers: 'Fermiers', ingenieurs: 'Ingénieurs', mineurs: 'Mineurs', banquiers: 'Banquiers', scientifiques: 'Scientifiques'
  };
  function construireResumePlacementChoix_(elements, numero) {
    var parties = Object.keys(elements || {}).map(function (cle) {
      var valeur = Number(elements[cle]) || 0;
      if (cle.indexOf('guilde_') === 0) {
        var type = cle.slice('guilde_'.length);
        return 'Guilde ' + (LABEL_TYPE_GUILDE_RESUME_[type] || type);
      }
      if (cle === 'cube_neant') return valeur + ' cube' + (valeur > 1 ? 's' : '') + ' du Néant';
      if (cle === 'gloire') return 'jeton Gloire ' + valeur;
      if (cle === 'defense_secteur') return 'Défense de Secteur';
      if (cle === 'chantier_naval') return 'Chantier Naval';
      if (cle === 'base_stellaire') return 'Base Stellaire';
      if (cle === 'liberation') return valeur + ' jeton(s) Libération';
      if (cle === 'prime') return valeur + ' jeton(s) Prime';
      return cle;
    });
    return parties.join(' + ') + ' \u2192 Secteur ' + numero + '.';
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
  // (parties + plateauMaison).
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
      programmes: [pm.programme1 || null, pm.programme2 || null, pm.programme3 || null, pm.programme4 || null],
      // Jeton manuel (Corruption(s) actuellement stockée(s) sur la
      // Technologie "Chambres de décontamination") — voir
      // CHAMPS_PLATEAU_MAISON_AUTORISES ci-dessus.
      corruptionChambreDecontamination: pm.corruptionChambreDecontamination || 0,
      // Compteur de Corruption sur la fiche Maison.
      corruptionMaison: pm.corruptionMaison || 0
    };

    return partie;
  }

  /**
   * Relit parties+plateauMaison et réassemble une `partie` à jour —
   * dernière étape de quasiment toute mutation de ce fichier (une
   * écriture ne renvoie jamais l'objet persisté directement, toujours un
   * aller-retour DB frais : assemblerPartie_ recalcule des champs dérivés
   * et applique des valeurs par défaut que l'objet muté en mémoire n'a
   * pas nécessairement à jour). Factorisée ici plutôt que dupliquée à
   * chaque fonction.
   */
  function rechargerPartie_(partieId) {
    return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (r) {
      return assemblerPartie_(r[0], r[1]);
    });
  }

  /**
   * Boilerplate commun aux fonctions `appliquerCadre*` (résolution d'un
   * Cadre d'Événement galactique) — lit parties+plateauMaison, assemble
   * la `partie`,
   * retrouve l'Événement galactique du cycle, applique le garde-fou
   * anti-double-application (un Cadre déjà résolu ne peut pas l'être une
   * seconde fois), et retrouve le `cadre` lui-même dans le catalogue de
   * l'Événement (`evenementCycle.cadres`) — présent même pour les
   * appelants qui n'en ont pas besoin (appliquerCadreEffet/
   * appliquerCadreManuel), le coût d'un `.filter` sur un tableau de
   * quelques éléments est négligeable face à la duplication qu'il évite.
   * Chaque appelant reste responsable de sa propre validation métier
   * (type de cadre attendu, option, etc.) et de la persistance finale
   * (`evenementCycle.cadresAppliques[ordreCadre] = ...` puis
   * `sauvegarderPartie`) — cette fonction ne fait que le chargement.
   */
  function chargerCadreOuvrable_(partieId, cycle, ordreCadre) {
    return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
      var lignePlateauMaison = resultats[1];
      var partie = assemblerPartie_(resultats[0], lignePlateauMaison);
      if (!partie) throw new Error('Partie introuvable.');

      var cleCycle = 'cycle' + cycle;
      var evenementCycle = (partie.evenements || {})[cleCycle];
      if (!evenementCycle) throw new Error('Aucun événement galactique choisi pour ce cycle.');
      evenementCycle.cadresAppliques = evenementCycle.cadresAppliques || {};
      if (evenementCycle.cadresAppliques[ordreCadre]) {
        throw new Error('Ce cadre a déjà été appliqué pour ce cycle.');
      }

      var cadre = (evenementCycle.cadres || []).filter(function (c) { return c.ordre === ordreCadre; })[0];

      return {
        partie: partie,
        lignePlateauMaison: lignePlateauMaison,
        cleCycle: cleCycle,
        evenementCycle: evenementCycle,
        cadre: cadre
      };
    });
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
  // l'action principale.
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
  // Suppression — plateauMaison (+ secteursPartie) avant parties. Pas de
  // contrainte FK sous IndexedDB : l'ordre n'est pas obligatoire, conservé
  // par cohérence/lisibilité.
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
     * Exposée publiquement pour setupService.js. Pas de distinction
     * "légère vs détaillée" : la donnée est déjà locale (IndexedDB), pas
     * d'enjeu de poids de payload réseau à optimiser ici.
     */
    obtenirMaisonsCatalogue: obtenirMaisonsCatalogue_,

    /**
     * Exposée publiquement pour index.html, qui lit directement cette
     * fonction pour savoir si un bouton d'option de Cadre doit être
     * cliquable, plutôt que de dupliquer la logique localement (une
     * source de vérité unique évite un désync entre les deux copies).
     */
    cleFocusEnginePourOptionCadre: cleFocusEnginePourOptionCadre_,

    /**
     * Crée une nouvelle partie : tire une maison (ou utilise celle choisie
     * en mode manuel) et ses adversaires, calcule les ressources/
     * civilisation de départ depuis originesMaison, met en place les
     * Focus de la maison (FocusService) et instancie le plateau des
     * secteurs (SecteurService) si ces modules sont chargés.
     * @param {Object} options
     *   options.mode : 'manuel' | 'aleatoire'
     *   options.maison : nom de la maison (mode manuel)
     *   options.complexite : difficulté choisie (mode aléatoire, optionnel)
     *   options.miseEnPlaceManuelle : true pour reproduire une partie
     *     physique déjà en cours (mode doit être 'manuel') :
     *   options.technologieDepart, options.maisonsDechues (4 noms),
     *   options.technologiesSansPoint (3 noms parmi les 8 des maisons déchues)
     *   options.scenarioId : optionnel (mise en place des secteurs
     *     déléguée à SecteurService.instancierSecteurs, pas de valeur par
     *     défaut imposée ici)
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
          // Mise en place des Focus de la maison — tolérant (garde
          // typeof, comme SecteurService), une erreur ici ne doit jamais
          // empêcher la création de la partie.
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
              // focusHeroiques : emplacements vides par cycle, remplis en
              // cours de partie (voir choisirFocusHeroique/avancerCycle
              // plus bas). focusJoueur : mise en place réelle via
              // FocusService.obtenirMiseEnPlace ci-dessus, jouable via
              // js/focusEngine.js.
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
              // Instanciation du plateau des secteurs après l'écriture de
              // "parties" (secteursPartie.partieId n'a pas de contrainte
              // FK sous IndexedDB, mais on garde cet ordre par cohérence).
              // Tolérant en soi (voir SecteurService.instancierSecteurs) :
              // une erreur ici ne remonte jamais jusqu'à la création de la
              // partie.
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
     * mémoire) + ajoute une ligne au journal d'actions.
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
     * L'historique n'est jamais supprimé (pas de contrainte FK sous
     * IndexedDB sur historique.partieId).
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
     * fonctions dédiées — voir majCivilisation ci-dessous et
     * definirTechnologieAmelioree plus bas). Lecture-fusion-écriture :
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
     * Mise à jour partielle des 6 champs Civilisation (niveaux des 3
     * pistes + leurs 3 marqueurs "Corrompue"), volontairement exclus de
     * majPlateauMaison (voir commentaire ci-dessus). Même principe
     * lecture-fusion-écriture, liste blanche séparée par cohérence avec le
     * découpage fonctionnel (civilisationService.js est seul appelant
     * prévu de celle-ci, comme focusEngine.js/écran Stratégie le sont de
     * majPlateauMaison).
     */
    majCivilisation: function (partieId, champs) {
      var CHAMPS_CIVILISATION_AUTORISES = [
        'civSociete', 'civGouvernement', 'civEconomie',
        'civCorrompueSociete', 'civCorrompueGouvernement', 'civCorrompueEconomie',
        // CivilisationService.definirCorruption ajuste corruptionMaison
        // dans le MÊME appel que le marqueur Corrompue qui vient de
        // changer (une seule écriture) — whitelisté ici en plus de
        // CHAMPS_PLATEAU_MAISON_AUTORISES (saisie manuelle).
        'corruptionMaison'
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
     * Liste des événements galactiques du catalogue, groupés par cycle
     * (1/2/3). Utilisé pour peupler les menus déroulants de choix
     * d'événement (voir index.html, écran Partie).
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
     * Enregistre le choix d'un événement galactique pour un cycle donné
     * (1, 2 ou 3). partie.evenements vit dans etatJson (pas de colonne
     * dédiée) — sauvegarde via sauvegarderPartie (lecture-fusion-écriture
     * implicite : on relit la partie complète juste avant de la
     * réécrire).
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
     * Fonction PURE (aucun accès DB), exposée pour l'IHM — voir
     * actionsSimplesCadre_ ci-dessus pour le détail de ce qui est
     * considéré "1 clic" (uniquement des deltas sur les 5 ressources
     * suivies par plateauMaison) et ce qui reste hors périmètre.
     */
    actionsSimplesCadre: actionsSimplesCadre_,

    /**
     * Applique en un clic l'une des actions renvoyées par
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
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, lignePlateauMaison = ctx.lignePlateauMaison, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle;

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
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "gain" (voir data/catalogue/evenements.
     * json) — hors périmètre d'actionsSimplesCadre_ (ne porte sur aucune
     * des 5 ressources plateauMaison ; typiquement une ressource que
     * l'app ne suit pas, comme l'offre de Programme Domination) : ne fait
     * qu'enregistrer que le joueur a résolu l'effet à la main sur le
     * plateau physique, même garde-fou anti-double-application que
     * appliquerCadreEffet/appliquerCadrePlacement ci-dessus, mais sans
     * toucher plateauMaison (aucun delta à appliquer).
     */
    appliquerCadreManuel: function (partieId, cycle, ordreCadre) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle;

        evenementCycle.cadresAppliques[ordreCadre] = { manuel: true, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "placement" (zone
     * "secteur_neant_adjacent", voir data/catalogue/evenements.json) —
     * hors périmètre d'actionsSimplesCadre_ (ne porte pas sur les 5
     * ressources simples de plateauMaison mais sur secteursPartie). Place
     * la structure sur le secteur choisi par le joueur via
     * SecteurService.placerElementsNeantAdjacent (qui revalide Néant/
     * adjacence/emplacements libres — jamais confiance à l'appelant),
     * puis marque le cadre comme résolu, même garde-fou anti-double-
     * application qu'appliquerCadreEffet ci-dessus.
     *
     * Retrouve le cadre `ordreCadre` dans evenementCycle.cadres (catalogue
     * complet de l'événement choisi, déjà persisté par choisirEvenement)
     * pour lire son `effet.elements` et le transmettre tel quel à
     * SecteurService.placerElementsNeantAdjacent (générique) : ce point
     * d'entrée résout ainsi n'importe quel cadre "placement" du
     * catalogue, quels que soient ses éléments.
     */
    appliquerCadrePlacement: function (partieId, cycle, ordreCadre, numeroSecteur) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        if (!cadre || !cadre.effet || cadre.effet.type !== 'placement') {
          throw new Error('Cadre de placement introuvable pour cet ordre.');
        }

        return SecteurService.placerElementsNeantAdjacent(partieId, numeroSecteur, cadre.effet.elements).then(function () {
          evenementCycle.cadresAppliques[ordreCadre] = { secteur: numeroSecteur, le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;
          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
        });
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "placement_multiple" — jeux d'éléments
     * répartis sur des secteurs du Néant adjacents désignés par un
     * critère de Population (pas un libre choix comme "placement"
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
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

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
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique UNE option d'un cadre `type: 'choix'` dont chaque option
     * est elle-même `type: 'placement'` (avec un `critere` de Population
     * — data/catalogue/evenements.json, PAS un flat {cle, valeur} comme
     * les options automatisées par FocusEngine, voir
     * cleFocusEnginePourOptionCadre_ ci-dessus) — hors périmètre de
     * "placement"/"placement_multiple" (ceux-ci n'offrent jamais de CHOIX
     * entre plusieurs placements alternatifs, toujours un seul ou
     * plusieurs SIMULTANÉS).
     *
     * `typeGuildeChoisi` (optionnel, une des clés de TYPES_GUILDE_CONSTRUIRE_
     * côté strategieService.js — 'fermiers'/'ingenieurs'/'mineurs'/
     * 'banquiers'/'scientifiques') résout la clé GÉNÉRIQUE "guilde" de
     * l'option (type au choix du joueur, voir CHAMP_ELEMENT_PLACEMENT_,
     * secteurService.js) en "guilde_<type>" avant tout appel à
     * SecteurService.placerElementsNeantAdjacent — qui ne reçoit donc
     * jamais la clé générique. Revalide intégralement le `numeroSecteur`
     * reçu (jamais confiance à l'appelant, même principe qu'
     * appliquerCadrePlacement/appliquerCadrePlacementMultiple ci-dessus) :
     * recalcule les candidats pour CE critère via SecteurService.
     * resoudrePlacementMultipleNeantAdjacent (réutilisée telle quelle, en
     * enveloppant l'unique option dans un `placements` à 1 entrée — aucune
     * duplication de la logique de calcul des candidats par critère de
     * Population).
     */
    appliquerCadreChoixPlacement: function (partieId, cycle, ordreCadre, indexOption, numeroSecteur, typeGuildeChoisi) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        if (!option || option.type !== 'placement' || !option.elements) {
          throw new Error('Option de placement introuvable pour ce cadre.');
        }
        if (typeof SecteurService === 'undefined') throw new Error('SecteurService indisponible.');

        var elementsResolus = Object.assign({}, option.elements);
        if (Object.prototype.hasOwnProperty.call(elementsResolus, 'guilde')) {
          if (!typeGuildeChoisi) throw new Error('Type de Guilde manquant pour ce placement.');
          elementsResolus['guilde_' + typeGuildeChoisi] = elementsResolus.guilde;
          delete elementsResolus.guilde;
        }

        return SecteurService.resoudrePlacementMultipleNeantAdjacent(partieId, { type: 'placement_multiple', placements: [option] })
          .then(function (resultatCandidats) {
            var groupe = (resultatCandidats.groupes || [])[0];
            if (!groupe || groupe.candidats.indexOf(numeroSecteur) === -1) {
              throw new Error('Secteur ' + numeroSecteur + ' non éligible pour ce placement (Population).');
            }

            return SecteurService.placerElementsNeantAdjacent(partieId, numeroSecteur, elementsResolus).then(function () {
              evenementCycle.cadresAppliques[ordreCadre] = {
                resume: construireResumePlacementChoix_(elementsResolus, numeroSecteur),
                le: new Date().toISOString()
              };
              partie.evenements[cleCycle] = evenementCycle;
              return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
            });
          });
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre de type "choix" (data/catalogue/evenements.json)
     * dont l'option retenue ne correspond à AUCUNE mécanique automatisée
     * par l'app (ni cube/construction — cleFocusEnginePourOptionCadre_ —,
     * ni Science->Technologie — optionTechnologieViaScience_) : fallback
     * générique — ne fait qu'enregistrer que le joueur a résolu l'option
     * choisie à la main sur le plateau physique, même garde-fou anti-
     * double-application que les autres appliquerCadre*, sans toucher ni
     * plateauMaison ni secteursPartie. `resume` (texte au passé, ex.
     * "Guilde établie manuellement") est fourni par l'appelant (IHM) —
     * GameService reste une couche de données pure, comme pour
     * appliquerCadreChoixFocusEngine (resume dérivé côté FocusEngine, ici
     * côté index.html faute de mécanique à déléguer).
     *
     * Reste le filet de sécurité générique pour toute future option de
     * cadre "choix" sans mécanique automatisée derrière — n'est pas figée
     * sur un cadre précis (etablir_guilde/construire_installation, par
     * exemple, sont désormais automatisés via appliquerCadreChoixFocusEngine
     * plutôt que de passer par ici).
     */
    appliquerCadreChoixManuel: function (partieId, cycle, ordreCadre, indexOption, resume) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var option = cadre && cadre.effet && cadre.effet.type === 'choix' && Array.isArray(cadre.effet.options)
          ? cadre.effet.options[indexOption] : null;
        if (!option) throw new Error('Option de cadre introuvable pour cet ordre.');

        evenementCycle.cadresAppliques[ordreCadre] = { manuel: true, resume: resume, le: new Date().toISOString() };
        partie.evenements[cleCycle] = evenementCycle;

        return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre);
      }).then(function () {
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Applique un cadre "choix" dont l'option retenue (`indexOption`,
     * dans cadre.effet.options) porte sur une mécanique déjà automatisée
     * côté FocusEngine (voir cleFocusEnginePourOptionCadre_ ci-dessus) —
     * hors périmètre d'actionsSimplesCadre_ (ne porte pas sur les 5
     * ressources simples). Réutilise FocusEngine.resoudreEffet (moteur
     * pur déjà utilisé par l'écran Focus pour ces mêmes clés — activer_cube
     * y est une clé "cube" générique, deployer_cube_secteur_mere y ouvre
     * la popup dédiée 'deployer_cube', etablir_guilde/
     * construire_installation la popup 'construire' via `demanderChoix`,
     * voir focusEngine.js) plutôt que de dupliquer une deuxième logique
     * de résolution : seule source de vérité pour ces mécaniques, qu'elles
     * soient déclenchées depuis Focus ou depuis un Cadre d'Événement
     * galactique.
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
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, lignePlateauMaison = ctx.lignePlateauMaison, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

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

            var resume = resultatEffet.journal.map(function (ligne) {
              var prefixe = source + ' : ';
              return ligne.indexOf(prefixe) === 0 ? ligne.slice(prefixe.length) : ligne;
            }).join(' ').replace(/\.\s*$/, '');

            evenementCycle.cadresAppliques[ordreCadre] = { resume: resume, le: new Date().toISOString() };
            partie.evenements[cleCycle] = evenementCycle;

            // NE PAS réutiliser `lignePlateauMaison` (capturée tout en
            // haut, AVANT FocusEngine.resoudreEffet) pour l'écriture
            // finale. Certaines options (avancer_civilisation ;
            // retirer_corruption, option Technologie) écrivent
            // DIRECTEMENT sur plateauMaison PENDANT la résolution, via
            // une popup imbriquée qui appelle elle-même
            // GameService.majPlateauMaison/majCivilisation (toutes deux
            // lecture-fusion-écriture, sûres) — un DB.put bâti sur le
            // snapshot périmé de `lignePlateauMaison` écraserait ces
            // écritures avec les anciennes valeurs (violation de la
            // règle #1 du projet, "lecture-fusion-écriture systématique :
            // ne jamais écraser un champ non concerné par la modification
            // en cours" — voir CLAUDE.md). On relit donc une ligne
            // FRAÎCHE juste avant de fusionner uniquement `champs` (les
            // mutations suivies par focusEngine.js pour L'ACTION DIRECTE
            // du cadre — cube/ressources — jamais celles d'une popup
            // imbriquée, qui persiste déjà elle-même). Si `champs` est
            // vide (rien à écrire côté focusEngine, ex. avancer_civilisation
            // seule sans coût), aucune écriture superflue.
            var ecrirePlateauMaison = Object.keys(champs).length
              ? DB.get('plateauMaison', partieId).then(function (ligneFraiche) {
                Object.keys(champs).forEach(function (champ) { ligneFraiche[champ] = champs[champ]; });
                return DB.put('plateauMaison', ligneFraiche);
              })
              : Promise.resolve();

            return Promise.all([
              ecrirePlateauMaison,
              GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            ]).then(function () {
              return rechargerPartie_(partieId);
            });
          });
      });
    },

    /**
     * true si le Cadre est automatisable pour ce gain (secteur/piste/
     * Programme/Technologie, avec repli éventuel — voir
     * resoudreCiblesCadreGainCorruption_ ci-dessus) — utilisée par
     * index.html pour décider si ce Cadre "gain" doit ouvrir la popup
     * dédiée (appliquerCadreGainCorruption ci-dessous) ou rester sur
     * l'existant appliquerCadreManuel (offre_programme, cadre composé,
     * effet_conditionnel — voir JSDoc de resoudreCiblesCadreGainCorruption_).
     */
    cadreGainCorruptionAutomatisable: function (cadre) {
      return !!resoudreCiblesCadreGainCorruption_(cadre && cadre.effet);
    },

    /**
     * Applique un cadre "type":"gain" dont l'effet ne porte QUE sur
     * "corruption" (voir resoudreCiblesCadreGainCorruption_ ci-dessus et
     * docs-rules-corruption-gardiens-refuges-technoConsume.md §1) et dont
     * la cible est automatisable (sinon, cadreGainCorruptionAutomatisable
     * renvoie false et l'appelant — index.html — reste sur
     * GameService.appliquerCadreManuel, cette fonction n'est même pas
     * invoquée). Répète `quantite` fois l'appel à
     * demanderChoix({type:'gagner_corruption', ...}) — chaque popup fait
     * SA PROPRE persistance (secteur/piste/Technologie — comme
     * appliquerCadreChoixFocusEngine/retirer_corruption ci-dessus,
     * focusEngine.js) ; cette fonction ne fait qu'accumuler les résumés et
     * marquer le cadre appliqué à la fin (même garde-fou anti-double-
     * application que les autres appliquerCadre* de ce fichier).
     *
     * Un "Annuler" sur la TOUTE PREMIÈRE popup (rien encore placé) résout
     * `{annule:true}` — le cadre n'est PAS marqué appliqué, cohérent avec
     * appliquerCadreChoixFocusEngine. Un "Annuler" APRÈS au moins une
     * Corruption déjà placée (`quantite` > 1 — un seul Cadre du catalogue
     * à ce jour, "Gagnez deux Corruption... sur des emplacements de
     * Programme") marque le cadre appliqué avec le résumé PARTIEL obtenu
     * plutôt que de rejeter : les Corruptions déjà placées sont réellement
     * sur le plateau (persistées par la/les popup(s) déjà résolue(s)) —
     * les laisser sans marquer le cadre permettrait au joueur de rouvrir
     * le Cadre et d'en placer au-delà de ce que la carte autorise.
     */
    appliquerCadreGainCorruption: function (partieId, cycle, ordreCadre, demanderChoix) {
      return chargerCadreOuvrable_(partieId, cycle, ordreCadre).then(function (ctx) {
        var partie = ctx.partie, cleCycle = ctx.cleCycle, evenementCycle = ctx.evenementCycle, cadre = ctx.cadre;

        var config = resoudreCiblesCadreGainCorruption_(cadre && cadre.effet);
        if (!config) throw new Error('Ce cadre n’est pas automatisable pour le gain de Corruption.');

        var source = 'Cadre #' + ordreCadre;
        var details = [];
        var annuleSansRien = false;
        var repetitions = [];
        for (var i = 0; i < config.quantite; i++) repetitions.push(i);

        return repetitions.reduce(function (promesse) {
          return promesse.then(function (arreter) {
            if (arreter) return true;
            return Promise.resolve(demanderChoix({
              type: 'gagner_corruption',
              source: source,
              partieId: partieId,
              ciblesAutorisees: config.ciblesAutorisees,
              ciblesRepli: config.ciblesRepli,
              exclureTechno: config.exclureTechno,
              avancerPisteApresPlacement: config.avancerPisteApresPlacement
            })).then(function (reponse) {
              if (!reponse || reponse.annule) {
                if (!details.length) annuleSansRien = true;
                return true;
              }
              details.push(reponse.detail);
              return false;
            });
          });
        }, Promise.resolve(false)).then(function () {
          if (annuleSansRien) return { annule: true };

          evenementCycle.cadresAppliques[ordreCadre] = { resume: details.join(' '), le: new Date().toISOString() };
          partie.evenements[cleCycle] = evenementCycle;

          return GameService.sauvegarderPartie(partie, 'cadre_evenement_applique', cleCycle + ' — cadre #' + ordreCadre)
            .then(function () {
              return rechargerPartie_(partieId);
            });
        });
      });
    },

    /**
     * Marque une technologie possédée (départ, cible='depart' ; ou l'un
     * des 5 emplacements obtenus, cible=index 0-4) comme améliorée ou
     * non. Écrit directement sur le record `plateauMaison` (et non via
     * majPlateauMaison, qui exclut volontairement technologieDepart et
     * technologiesObtenues — "leurs propres fonctions dédiées", voir
     * commentaire de CHAMPS_PLATEAU_MAISON_AUTORISES).
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
        return rechargerPartie_(partieId);
      });
    },

    /**
     * Fait avancer la partie au cycle suivant (1 -> 2 -> 3 -> 'termine').
     * cycleActuel n'est jamais stocké tel quel (calculé à la lecture, voir
     * assemblerPartie_) : incrémente cycleNum/cycleTermine et amorce
     * focusHeroiques/focusHeroiquesPioches pour le nouveau cycle si
     * absents.
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
     * Enregistre (ou retire, si nom est vide) le Focus héroïque choisi
     * manuellement pour un emplacement (0/1/2) d'un cycle donné. Un même
     * Focus héroïque ne peut être choisi qu'une fois par partie, tous
     * cycles confondus (focusHeroiquesPioches) ; remplacer un emplacement
     * déjà occupé libère l'ancien choix. Construction de la carte
     * (regroupement des 2-3 actions du catalogue "focus") déléguée à
     * FocusService.obtenirCarteHeroiqueParNom.
     *
     * ⚠️ Contrairement à avancerCycle/choisirTechnologieObtenue, cette
     * action n'écrit pas d'entrée d'historique (écriture directe dans
     * `parties`, sans ajouterHistorique_).
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
     * Enregistre (ou retire, si nomTechnologie est vide) la technologie
     * obtenue dans l'un des 5 emplacements du plateau maison, parmi les
     * technologies des maisons déchues (partie.adversaires).
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
          return rechargerPartie_(partieId);
        });
      });
    },

    /**
     * Enregistre (ou retire, si nomTechnologie est vide) le choix d'une
     * des 4 Technologies avancées (parmi les 8 des maisons déchues) —
     * même principe que choisirTechnologieObtenue (recherche dans
     * partie.adversaires, écriture via majPlateauMaison), avec deux
     * règles propres à cette mécanique :
     *   - le choix ne se fait qu'au cycle 1 (rejette sinon — les 4
     *     emplacements sont fixés pour le reste de la partie une fois le
     *     cycle 1 passé) ;
     *   - une même technologie ne peut occuper qu'un seul des 4
     *     emplacements à la fois (contrairement à choisirTechnologieObtenue,
     *     qui ne vérifie pas ce doublon — gênant ici vu que les 4 NON
     *     choisies deviennent le groupe du cycle 3, un doublon fausserait
     *     ce complément).
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
          return rechargerPartie_(partieId);
        });
      });
    },

    /**
     * Fonction PURE (aucun accès DB) exposée pour l'IHM (index.html) —
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
