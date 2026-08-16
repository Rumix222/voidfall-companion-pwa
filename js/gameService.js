/**
 * gameService.js
 * Cycle de vie de partie — Voidfall Companion PWA
 * Version 7 — 17/08/2026 (Session 12 — SQL RPC récupéré)
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
    'technologiesObtenues'
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
        return { nom: t.nom, type: t.type || '' };
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
   * catalogueSync.js) -> [{ nom, complexite, technologies: [{nom, type}] }].
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
          return { nom: nomTech, type: t ? (t.type || '') : '' };
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
   * 17/08/2026 (Session 12 — restauration IHM Partie) : formate un
   * événement galactique — portage direct de formatEvenement_
   * (GameService.js GAS), adapté aux clés camelCase du store IndexedDB
   * `evenements` (CatalogueSync convertit systématiquement les colonnes
   * Supabase snake_case en camelCase — voir catalogueSync.js — alors que
   * la version GAS lisait directement des en-têtes Google Sheets tels
   * quels : e['Nom']/e['Cycle']/e['Texte1']/e['Texte2']).
   */
  function formatEvenement_(e) {
    return {
      nom: e.nom,
      cycle: e.cycle,
      texte: [e.texte1, e.texte2].filter(Boolean).join(' ')
    };
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
    partie.technologiesObtenues = pm.technologiesObtenues || [null, null, null, null, null, null];

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
              technologiesObtenues: [null, null, null, null, null, null],
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
              technologiesObtenues: [null, null, null, null, null, null]
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
     * 17/08/2026 (Session 12 — restauration IHM Partie) : marque une
     * technologie possédée (départ, cible='depart' ; ou l'un des 6
     * emplacements obtenus, cible=index 0-5) comme améliorée ou non —
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
        if (slot < 0 || slot > 5) throw new Error('Emplacement de technologie invalide.');
        var technologiesObtenues = ligne.technologiesObtenues || [null, null, null, null, null, null];
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
     * si nomTechnologie est vide) la technologie obtenue dans l'un des 6
     * emplacements du plateau maison, parmi les technologies des maisons
     * déchues (partie.adversaires) — portage direct de la RPC
     * choisir_technologie_obtenue (rpc.json).
     */
    choisirTechnologieObtenue: function (partieId, slot, nomTechnologie) {
      slot = Number(slot);
      if (slot < 0 || slot > 5) return Promise.reject(new Error('Emplacement de technologie invalide.'));

      return Promise.all([DB.get('parties', partieId), DB.get('plateauMaison', partieId)]).then(function (resultats) {
        var partie = assemblerPartie_(resultats[0], resultats[1]);
        if (!partie) throw new Error('Partie introuvable.');

        var technologies = (partie.technologiesObtenues || [null, null, null, null, null, null]).slice();

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
    }
  };
})();
