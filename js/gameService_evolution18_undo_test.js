/**
 * Test — EVOLUTION 18 (todo.md, retour utilisateur) : "Annuler la dernière
 * action" doit aussi défaire les effets persistés DIRECTEMENT en base par
 * une popup déléguée (ex. Focus Conquête "Planifier" : Gagnez un
 * Programme et/ou déplacez une Corruption — ni le Programme gagné ni la
 * Corruption déplacée n'étaient rétablis par une annulation avant ce
 * correctif), pas seulement les 9 champs plateauMaison suivis par
 * FocusEngine.diffChamps_.
 *
 * Intégration bout-en-bout via FocusEngine.jouerActionEtPersister, avec le
 * VRAI db.js (mécanisme d'enregistrement générique EVOLUTION 18) chargé
 * contre un faux IndexedDB minimal (voir creerIndexedDBFactice_,
 * dupliqué de db_enregistrement_test.js — chaque fichier de test reste
 * autonome, convention du projet), et un GameService factice réduit à
 * majPlateauMaison (seule fonction utilisée par jouerActionEtPersister).
 *
 * `demanderChoix` simule ici ce qu'une popup déléguée réelle de
 * strategieService.js fait (choix ET persistance directe via DB.put),
 * sans dépendre du DOM.
 *
 * Exécution : node js/gameService_evolution18_undo_test.js
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function creerRequete_() { return {}; }

// Le vrai IndexedDB applique l'algorithme de clonage structuré à CHAQUE
// get()/put() : la valeur lue (ou stockée) est TOUJOURS une copie
// indépendante, jamais la même référence qu'un appel précédent. Sans ce
// clonage ici, le pattern lecture-modification-écriture omniprésent dans
// le code de prod (`DB.get(...).then(ligne => { ligne.x = y; return
// DB.put(store, ligne); })`) muterait la valeur "stockée" AVANT même le
// put() correspondant — un artefact du faux IndexedDB, pas un bug réel.
function clonerJSON_(valeur) {
  return valeur === undefined ? undefined : JSON.parse(JSON.stringify(valeur));
}

function creerIndexedDBFactice_() {
  var stores = {};

  function creerObjectStore_(nomStore, keyPath) {
    stores[nomStore] = stores[nomStore] || {};
    return {
      keyPath: keyPath,
      createIndex: function () {},
      get: function (cle) {
        var req = creerRequete_();
        Promise.resolve().then(function () {
          req.result = clonerJSON_(stores[nomStore][JSON.stringify(cle)]) || undefined;
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      },
      getAll: function () {
        var req = creerRequete_();
        Promise.resolve().then(function () {
          req.result = Object.keys(stores[nomStore]).map(function (k) { return clonerJSON_(stores[nomStore][k]); });
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      },
      put: function (valeur) {
        var req = creerRequete_();
        var cle = Array.isArray(keyPath) ? keyPath.map(function (k) { return valeur[k]; }) : valeur[keyPath];
        Promise.resolve().then(function () {
          stores[nomStore][JSON.stringify(cle)] = clonerJSON_(valeur);
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      },
      delete: function (cle) {
        var req = creerRequete_();
        Promise.resolve().then(function () {
          delete stores[nomStore][JSON.stringify(cle)];
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      }
    };
  }

  var objectStoreNamesSet = {};
  var base = {
    objectStoreNames: { contains: function (nom) { return !!objectStoreNamesSet[nom]; } },
    createObjectStore: function (nom, options) {
      objectStoreNamesSet[nom] = true;
      return creerObjectStore_(nom, options.keyPath);
    },
    transaction: function (nomStore) {
      return { objectStore: function () { return creerObjectStore_(nomStore, base.__keyPaths[nomStore]); } };
    },
    __keyPaths: {}
  };

  return {
    open: function () {
      var req = creerRequete_();
      Promise.resolve().then(function () {
        var evenement = {
          target: {
            result: {
              objectStoreNames: base.objectStoreNames,
              createObjectStore: function (nom, options) {
                base.__keyPaths[nom] = options.keyPath;
                return base.createObjectStore(nom, options);
              }
            }
          }
        };
        if (req.onupgradeneeded) req.onupgradeneeded(evenement);
        req.result = base;
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
    __stores: stores
  };
}

function chargerDansContexte_(chemin, ctx) {
  var code = fs.readFileSync(chemin, 'utf8');
  vm.runInContext(code, ctx, { filename: chemin });
}

function creerContexte_() {
  var fakeIndexedDB = creerIndexedDBFactice_();
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, Math: Math, indexedDB: fakeIndexedDB };
  vm.createContext(ctx);
  chargerDansContexte_(__dirname + '/db.js', ctx);
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);
  chargerDansContexte_(__dirname + '/focusEngine.js', ctx);

  // GameService factice réduit à majPlateauMaison/majCivilisation (seules
  // fonctions utilisées par FocusEngine.jouerActionEtPersister/
  // CivilisationService.avancerPiste) — écrivent directement via ctx.DB.put
  // comme le vrai GameService, donc capturées par l'enregistrement
  // générique au même titre que n'importe quelle autre écriture pendant
  // l'action.
  ctx.GameService = {
    majPlateauMaison: function (partieId, champs) {
      return ctx.DB.get('plateauMaison', partieId).then(function (ligne) {
        Object.keys(champs).forEach(function (cle) { ligne[cle] = champs[cle]; });
        return ctx.DB.put('plateauMaison', ligne);
      });
    },
    majCivilisation: function (partieId, champs) {
      return ctx.DB.get('plateauMaison', partieId).then(function (ligne) {
        Object.keys(champs).forEach(function (cle) { ligne[cle] = champs[cle]; });
        return ctx.DB.put('plateauMaison', ligne);
      });
    }
  };
  chargerDansContexte_(__dirname + '/civilisationService.js', ctx);

  return ctx;
}

/**
 * Variante chargeant le VRAI gameService.js (pas le stub réduit à
 * majPlateauMaison ci-dessus) — pour tester GameService.utiliserProgramme
 * lui-même (2e orchestrateur EVOLUTION 18, voir son en-tête).
 */
function creerContextePourProgramme_() {
  var fakeIndexedDB = creerIndexedDBFactice_();
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, Math: Math, Array: Array, Date: Date, indexedDB: fakeIndexedDB };
  vm.createContext(ctx);
  chargerDansContexte_(__dirname + '/db.js', ctx);
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);
  chargerDansContexte_(__dirname + '/focusEngine.js', ctx);
  chargerDansContexte_(__dirname + '/gameService.js', ctx);
  return ctx;
}

var PARTIE_ID = 'partie-test';

function plateauBase_() {
  return {
    partieId: PARTIE_ID,
    ressourceNourriture: 5, ressourceEnergie: 5, ressourceMateriel: 5,
    ressourceCredit: 3, ressourceScience: 2, influence: 10, cubeActif: 2,
    jetonPrime: 0, jetonLiberation: 0, programmesEnMain: []
  };
}

test("EVOLUTION 18 — Conquête « Planifier » (et/ou) : annuler rétablit AUSSI le Programme gagné et la Corruption redéplacée (pas seulement le coût)", function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Conquête' };
  var action = {
    action: 'Planifier',
    cout: { credit: 1, energie: 1 },
    effet: { choice: ['gagner_programme', 'deplacer_corruption'] },
    texte: 'Gagnez un Programme et/ou déplacez une Corruption.'
  };

  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1]; // les 2 options
    if (contexte.type === 'gagner_programme') {
      // Simule la popup réelle : persistance DIRECTE en base (comme
      // GameService.gagnerProgramme), hors du diff plateauMaison.
      return ctx.DB.get('plateauMaison', PARTIE_ID).then(function (ligne) {
        ligne.programmesEnMain = (ligne.programmesEnMain || []).concat(['Rébellion']);
        return ctx.DB.put('plateauMaison', ligne);
      }).then(function () {
        return { detail: 'Programme "Rébellion" gagné.' };
      });
    }
    if (contexte.type === 'deplacer_corruption') {
      // Simule la popup réelle : écrit directement sur secteursPartie
      // (comme SecteurService.retirerCorruption/placerCorruption).
      return ctx.DB.put('secteursPartie', { partieId: PARTIE_ID, numero: 5, corrompu: false }).then(function () {
        return ctx.DB.put('secteursPartie', { partieId: PARTIE_ID, numero: 2, corrompu: true });
      }).then(function () {
        return { detail: 'Corruption déplacée du Secteur 5 vers le Secteur 2.' };
      });
    }
    throw new Error('demanderChoix inattendu : ' + contexte.type);
  };

  return ctx.DB.put('plateauMaison', plateauBase_()).then(function () {
    return ctx.DB.put('secteursPartie', { partieId: PARTIE_ID, numero: 5, corrompu: true });
  }).then(function () {
    return ctx.DB.put('secteursPartie', { partieId: PARTIE_ID, numero: 2, corrompu: false });
  }).then(function () {
    return ctx.FocusEngine.jouerActionEtPersister(PARTIE_ID, carte, action, demanderChoix);
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);

    // État APRÈS l'action : le Programme est en main, le coût est débité,
    // la Corruption a bien changé de secteur.
    return Promise.all([
      ctx.DB.get('plateauMaison', PARTIE_ID),
      ctx.DB.get('secteursPartie', [PARTIE_ID, 5]),
      ctx.DB.get('secteursPartie', [PARTIE_ID, 2]),
      ctx.AnnulationService.compter(PARTIE_ID)
    ]);
  }).then(function (resultats) {
    var plateau = resultats[0], secteur5 = resultats[1], secteur2 = resultats[2], compteurPile = resultats[3];
    assert.strictEqual(JSON.stringify(plateau.programmesEnMain), JSON.stringify(['Rébellion']));
    assert.strictEqual(plateau.ressourceCredit, 2); // -1
    assert.strictEqual(plateau.ressourceEnergie, 4); // -1
    assert.strictEqual(secteur5.corrompu, false);
    assert.strictEqual(secteur2.corrompu, true);
    assert.strictEqual(compteurPile, 1); // une seule entrée pour toute l'action

    return ctx.AnnulationService.annulerDerniere(PARTIE_ID);
  }).then(function (resultatAnnulation) {
    assert.strictEqual(resultatAnnulation.succes, true);
    assert.strictEqual(resultatAnnulation.source, 'Conquête — Planifier');

    return Promise.all([
      ctx.DB.get('plateauMaison', PARTIE_ID),
      ctx.DB.get('secteursPartie', [PARTIE_ID, 5]),
      ctx.DB.get('secteursPartie', [PARTIE_ID, 2]),
      ctx.AnnulationService.compter(PARTIE_ID)
    ]);
  }).then(function (resultats) {
    var plateau = resultats[0], secteur5 = resultats[1], secteur2 = resultats[2], compteurPile = resultats[3];
    // C'était le bug rapporté : avant EVOLUTION 18, ces 3 assertions
    // échouaient (seul le coût plateauMaison était rétabli).
    assert.strictEqual(JSON.stringify(plateau.programmesEnMain), JSON.stringify([]));
    assert.strictEqual(secteur5.corrompu, true);
    assert.strictEqual(secteur2.corrompu, false);
    // Le coût reste bien rétabli aussi (comportement déjà correct avant).
    assert.strictEqual(plateau.ressourceCredit, 3);
    assert.strictEqual(plateau.ressourceEnergie, 5);
    assert.strictEqual(compteurPile, 0);
  });
});

test("EVOLUTION 18 — Effet finalement annulé APRÈS qu'une popup déléguée ait déjà écrit en base : l'écriture est immédiatement défaite, rien n'est empilé", function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Conquête' };
  var action = {
    action: 'Planifier',
    cout: { credit: 1 },
    effet: { choice: ['gagner_programme', 'deplacer_corruption'] },
    texte: 'Gagnez un Programme et/ou déplacez une Corruption.'
  };

  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1];
    if (contexte.type === 'gagner_programme') {
      return ctx.DB.get('plateauMaison', PARTIE_ID).then(function (ligne) {
        ligne.programmesEnMain = (ligne.programmesEnMain || []).concat(['Rébellion']);
        return ctx.DB.put('plateauMaison', ligne);
      }).then(function () {
        return { detail: 'Programme "Rébellion" gagné.' };
      });
    }
    if (contexte.type === 'deplacer_corruption') {
      // Cette 2e option (nichée dans le choix inclusif) est ANNULÉE par le
      // joueur -> toute l'action doit échouer, y COMPRIS défaire le
      // Programme déjà gagné par la 1re option (RÈGLE MÉTIER de
      // focusEngine.js : un Effet en échec ne laisse AUCUNE trace).
      return { annule: true };
    }
    throw new Error('demanderChoix inattendu : ' + contexte.type);
  };

  return ctx.DB.put('plateauMaison', plateauBase_()).then(function () {
    return ctx.FocusEngine.jouerActionEtPersister(PARTIE_ID, carte, action, demanderChoix);
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);

    return Promise.all([
      ctx.DB.get('plateauMaison', PARTIE_ID),
      ctx.AnnulationService.compter(PARTIE_ID)
    ]);
  }).then(function (resultats) {
    var plateau = resultats[0], compteurPile = resultats[1];
    // Le Programme gagné par l'option annulée n'a jamais existé du point
    // de vue de l'utilisateur, ET le coût n'a jamais été débité.
    assert.strictEqual(JSON.stringify(plateau.programmesEnMain), JSON.stringify([]));
    assert.strictEqual(plateau.ressourceCredit, 3);
    assert.strictEqual(compteurPile, 0);
  });
});

test('EVOLUTION 18 — action sans aucune popup déléguée (scalaires plateauMaison uniquement) : toujours annulable comme avant', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { science: 2 }, cout: { credit: 1 }, texte: '' };

  return ctx.DB.put('plateauMaison', plateauBase_()).then(function () {
    return ctx.FocusEngine.jouerActionEtPersister(PARTIE_ID, carte, action, function () {
      throw new Error('demanderChoix ne devrait pas être appelé.');
    });
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    return ctx.DB.get('plateauMaison', PARTIE_ID);
  }).then(function (plateau) {
    assert.strictEqual(plateau.ressourceScience, 4);
    assert.strictEqual(plateau.ressourceCredit, 2);
    return ctx.AnnulationService.annulerDerniere(PARTIE_ID);
  }).then(function (resultatAnnulation) {
    assert.strictEqual(resultatAnnulation.succes, true);
    return ctx.DB.get('plateauMaison', PARTIE_ID);
  }).then(function (plateau) {
    assert.strictEqual(plateau.ressourceScience, 2);
    assert.strictEqual(plateau.ressourceCredit, 3);
  });
});

test("EVOLUTION 18 — GameService.utiliserProgramme (2e orchestrateur) : une popup déléguée pendant l'action gratuite d'un Programme est aussi annulable", function () {
  var ctx = creerContextePourProgramme_();
  var CATALOGUE_PROGRAMMES = [{ code: 'S1', nom: 'Front Uni', type: 'Soutien' }];

  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [1]; // seulement "construire_installation"
    if (contexte.type === 'construire') {
      // Simule la popup réelle 'construire' (strategieService.js) :
      // persistance DIRECTE sur secteursPartie, hors du diff plateauMaison.
      return ctx.DB.put('secteursPartie', { partieId: PARTIE_ID, numero: 6, installationChantierNaval: 1 }).then(function () {
        return { detail: 'Chantier Naval construit sur le Secteur 6.' };
      });
    }
    throw new Error('demanderChoix inattendu : ' + contexte.type);
  };

  return Promise.all([
    ctx.DB.put('plateauMaison', Object.assign(plateauBase_(), { programmesEnMain: ['Front Uni'], programmesUtilises: [null, { nom: null, entretienActif: false, corrompu: false }, { nom: null, entretienActif: false, corrompu: false }, { nom: null, entretienActif: false, corrompu: false }] })),
    ctx.DB.put('secteursPartie', { partieId: PARTIE_ID, numero: 6, installationChantierNaval: 0 }),
    ctx.DB.put('programmes', CATALOGUE_PROGRAMMES[0])
  ]).then(function () {
    return ctx.GameService.utiliserProgramme(PARTIE_ID, 'Front Uni', demanderChoix);
  }).then(function (resultat) {
    assert.strictEqual(resultat.place, true);
    return Promise.all([
      ctx.DB.get('secteursPartie', [PARTIE_ID, 6]),
      ctx.AnnulationService.compter(PARTIE_ID)
    ]);
  }).then(function (resultats) {
    assert.strictEqual(resultats[0].installationChantierNaval, 1);
    assert.strictEqual(resultats[1], 1);
    return ctx.AnnulationService.annulerDerniere(PARTIE_ID);
  }).then(function (resultatAnnulation) {
    assert.strictEqual(resultatAnnulation.succes, true);
    assert.strictEqual(resultatAnnulation.source, 'Programme — Front Uni');
    return Promise.all([
      ctx.DB.get('secteursPartie', [PARTIE_ID, 6]),
      ctx.DB.get('plateauMaison', PARTIE_ID)
    ]);
  }).then(function (resultats) {
    var secteur = resultats[0], plateau = resultats[1];
    assert.strictEqual(secteur.installationChantierNaval, 0); // popup déléguée bien défaite
    assert.strictEqual(JSON.stringify(plateau.programmesEnMain), JSON.stringify(['Front Uni'])); // Programme revenu en main
  });
});

test("EVOLUTION 18 — Focus effet \"avancer_civilisation\" : UNE seule entrée de pile pour toute l'action (pas une pour l'action + une pour CivilisationService.avancerPiste)", function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Consolider', effet: { avancer_civilisation_societe: 1 }, cout: { credit: 1 }, texte: '' };

  var demanderChoix = function (contexte) {
    if (contexte.type === 'avancer_civilisation') {
      // Simule la popup réelle (strategieService.js) : appelle directement
      // CivilisationService.avancerPiste, comme le vrai code.
      return ctx.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'societe', demanderChoix)
        .then(function (resultat) { return { detail: 'Piste Société : niveau ' + resultat.nouveauNiveau + '.' }; });
    }
    throw new Error('demanderChoix inattendu : ' + contexte.type);
  };

  return ctx.DB.put('plateauMaison', Object.assign(plateauBase_(), { civSociete: 0 })).then(function () {
    return ctx.DB.put('pistesCivilisation', { type: 'Standard', piste: 'Société', caseNumero: 1, texte: 'Gagnez 5 Influence.', effet: JSON.stringify({ influence: 5 }) });
  }).then(function () {
    return ctx.FocusEngine.jouerActionEtPersister(PARTIE_ID, carte, action, demanderChoix);
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    return Promise.all([
      ctx.DB.get('plateauMaison', PARTIE_ID),
      ctx.AnnulationService.compter(PARTIE_ID)
    ]);
  }).then(function (resultats) {
    var plateau = resultats[0], compteurPile = resultats[1];
    assert.strictEqual(plateau.civSociete, 1);
    assert.strictEqual(plateau.influence, 15); // 10 (plateauBase_) + 5 (bonus de la case 1)
    assert.strictEqual(plateau.ressourceCredit, 2); // coût débité
    // C'était le risque du double-empile : SANS empilerSiAutonome_
    // (civilisationService.js), compteurPile vaudrait 2 ici.
    assert.strictEqual(compteurPile, 1);

    return ctx.AnnulationService.annulerDerniere(PARTIE_ID);
  }).then(function (resultatAnnulation) {
    assert.strictEqual(resultatAnnulation.succes, true);
    return Promise.all([
      ctx.DB.get('plateauMaison', PARTIE_ID),
      ctx.AnnulationService.compter(PARTIE_ID)
    ]);
  }).then(function (resultats) {
    var plateau = resultats[0], compteurPile = resultats[1];
    // UN SEUL "Annuler" doit tout défaire (niveau de piste + bonus + coût).
    assert.strictEqual(plateau.civSociete, 0);
    assert.strictEqual(plateau.influence, 10);
    assert.strictEqual(plateau.ressourceCredit, 3);
    assert.strictEqual(compteurPile, 0);
  });
});
