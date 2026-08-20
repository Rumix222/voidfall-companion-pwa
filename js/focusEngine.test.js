/**
 * Test fumée — focusEngine.js + annulationService.js
 * Exécution : node focusEngine.test.js
 *
 * 17/08/2026 (Session 14 fin) : ajout des tests "envahir"/"envahir_corrompu"
 * (victoire, défaite, annulé) — le témoin "hors périmètre" utilise
 * désormais "retirer_corruption" (envahir étant porté, il ne peut plus
 * servir de témoin ; "rappeler_cube" est écarté aussi : son nom contient
 * "cube" et tombe dans le repli générique dédié aux clés Cube, pas dans
 * celui des clés secteur).
 * 17/08/2026 (Session 14 suite) : ajout des tests "deployer_cube" (mode
 * libre + coût ressource, mode transmis pour par_chantier/secteur_mere,
 * annulé, et le cas Coût signe<0 qui retombe sur le repli générique
 * "cube").
 * 17/08/2026 (Session 14) : ajout des tests "regrouper" (succès + annulé)
 * — le cas hors périmètre "envahir" reste inchangé et sert toujours de
 * témoin pour les clés secteur NON portées cette session.
 *
 * Simule un DB en mémoire (même forme que DB : get/getAll/put/supprimer)
 * pour ne dépendre ni du navigateur ni d'IndexedDB réel. Charge les
 * fichiers réels via vm, comme le reste de la suite du projet.
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function chargerDansContexte_(chemin, contexte) {
  var code = fs.readFileSync(chemin, 'utf8');
  vm.createContext(contexte);
  vm.runInContext(code, contexte, { filename: chemin });
}

function creerDbFactice_() {
  var stores = { plateauMaison: {}, pileAnnulation: {} };
  var prochainId = 1;
  return {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cle] || null); },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      if (nom === 'pileAnnulation' && valeur.id === undefined) valeur.id = prochainId++;
      var cle = nom === 'pileAnnulation' ? valeur.id : valeur.partieId;
      stores[nom][cle] = valeur;
      return Promise.resolve(valeur);
    },
    supprimer: function (nom, cle) { delete stores[nom][cle]; return Promise.resolve(); },
    _stores: stores
  };
}

function creerContexte_() {
  var ctx = { console: console, Promise: Promise, JSON: JSON };
  chargerDansContexte_('/home/claude/focusEngine.js', ctx);
  return ctx;
}

var PLATEAU_BASE = {
  partieId: 'partie-test',
  ressourceNourriture: 5,
  ressourceEnergie: 5,
  ressourceMateriel: 5,
  ressourceCredit: 3,
  ressourceScience: 2,
  influence: 10,
  cubeActif: 2,
  jetonPrime: 0,
  jetonLiberation: 0
};

function demanderChoixSansPopup_() {
  throw new Error('demanderChoix ne devrait pas être appelé pour cette action.');
}

test('action simple : effet crédite, coût débite, mutations correctes', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { science: 2 }, cout: { credit: 3 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceScience, 4);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceCredit, 0);
    // plateau original non muté (pur)
    assert.strictEqual(PLATEAU_BASE.ressourceScience, 2);
    var mutScience = resultat.mutations.filter(function (m) { return m.champ === 'ressourceScience'; })[0];
    var mutCredit = resultat.mutations.filter(function (m) { return m.champ === 'ressourceCredit'; })[0];
    // Comparaison champ à champ (objets issus du contexte vm — pas du même
    // realm que ce fichier de test, deepStrictEqual les jugerait à tort
    // non égaux malgré une structure identique).
    assert.strictEqual(mutScience.avant, 2);
    assert.strictEqual(mutScience.apres, 4);
    assert.strictEqual(mutCredit.avant, 3);
    assert.strictEqual(mutCredit.apres, 0);
  });
});

test('effet annulé (choix refusé) : aucune mutation, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Envahir', effet: { choice: [{ credit: 5 }, { science: 5 }] }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'option_exclusive');
    return { annule: true };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
    assert.ok(resultat.journal[0].indexOf('annulée') !== -1);
  });
});

test('choix imbriqué (et/ou) : deux options appliquées, tolérant', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = {
    action: 'Bonus',
    effet: { choice: [{ credit: 1 }, { science: 1 }, { energie: 1 }] },
    cout: {},
    texte: 'et/ou'
  };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'options_inclusives');
    return [0, 2]; // credit + energie choisis, science ignoré
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceCredit, 4);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 6);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceScience, 2); // inchangé
  });
});

test('gagner_commerce : bonus choisi résolu récursivement (choice_repeat)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Commerce', effet: { gagner_commerce: 1 }, cout: {}, texte: '' };

  var appelsChoixRepete = 0;
  var demanderChoix = function (contexte) {
    if (contexte.type === 'bonus_commerce') {
      // index 3 = "Gagnez 2 ressources (Nourriture, Énergie et/ou Matériel)"
      return { indexChoisi: 3 };
    }
    if (contexte.type === 'option_exclusive') {
      appelsChoixRepete++;
      return { indexChoisi: 0 }; // 'nourriture' à chaque tour
    }
    throw new Error('type inattendu : ' + contexte.type);
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(appelsChoixRepete, 2);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceNourriture, 7); // +1 deux fois
  });
});

// 20/08/2026 (EVOLUTION 5 — voir TODO.md) : "retirer_corruption" est
// désormais portée (voir tests dédiés plus bas) — "effet_secteur" la
// remplace comme témoin des clés secteur restant hors périmètre
// ("rappeler_cube" écarté aussi : son nom contient "cube" et tombe dans
// le repli générique dédié aux clés Cube, pas dans celui des clés
// secteur — même remarque déjà faite pour "envahir" avant son portage).
test('clé secteur hors périmètre (effet_secteur) : ne bloque pas, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Effet secteur', effet: { effet_secteur: 1 }, cout: { energie: 2 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('effet_secteur') !== -1 && l.indexOf('non automatisé') !== -1; }));
  });
});

test('envahir : victoire — jetonPrime/jetonLiberation/influence crédités, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Envahir', effet: { envahir: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'envahir');
    assert.strictEqual(contexte.corrompu, false);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return {
      victoire: true, jetonPrime: 1, jetonLiberation: 1, influenceGagnee: 3,
      detail: 'Invasion du secteur 4 (Néant) — VICTOIRE.'
    };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.jetonPrime, 1);
    assert.strictEqual(resultat.plateauMaisonApres.jetonLiberation, 1);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 13); // 10 + 3
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('VICTOIRE') !== -1; }));
  });
});

test('envahir_corrompu : défaite — cubeActif restauré (clampé à 14), avertissement journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var plateau = Object.assign({}, PLATEAU_BASE, { cubeActif: 12 });
  var action = { action: 'Envahir', effet: { envahir_corrompu: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.corrompu, true);
    return {
      victoire: false, totalEngage: 5,
      detail: 'Invasion du secteur 7 (Corrompu) — ÉCHEC.',
      avertissement: 'Secteur(s) 2 repris par le Néant — défaussez un jeton Gloire.'
    };
  };

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, 14); // 12 + 5, clampé à 14
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('ÉCHEC') !== -1; }));
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('⚠️') !== -1 && l.indexOf('Gloire') !== -1; }));
  });
});

test('envahir : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Envahir', effet: { envahir: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('regrouper : succès — délègue à demanderChoix({type:"regrouper"}), journalisé, coût débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Regrouper', effet: { regrouper: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'regrouper');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { deplacements: 3, detail: '3× Corvette 1→2' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Regrouper') !== -1 && l.indexOf('3 déplacement(s)') !== -1; }));
  });
});

test('regrouper : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Regrouper', effet: { regrouper: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// 20/08/2026 (EVOLUTION 3 — voir TODO.md) : "augmenter_population" (SANS
// "_pure") — clé utilisée par data/catalogue/pistesCivilisation.json et
// focus.json, jusqu'ici NON reconnue (repli générique "effet non chiffré",
// aucune popup) alors que "augmenter_population_pure" (evenements.json,
// même mécanique) l'était déjà. Même gabarit de test que "regrouper"
// ci-dessus.
test('augmenter_population (piste Civilisation/Focus, sans "_pure") : succès — délègue à demanderChoix({type:"augmenter_population_pure"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { augmenter_population: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'augmenter_population_pure');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Population du Secteur 3 augmentée de 1.', numero: 3 };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Population du Secteur 3 augmentée de 1') !== -1; }));
  });
});

test('augmenter_population : annulé (popup "Annuler") — bloque toute l\u2019action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { augmenter_population: 1 }, cout: {}, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
  });
});

test('augmenter_population et augmenter_population_pure : même comportement (choice inclusif "et/ou")', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  // texte contient "et/ou" -> choice inclusif (options_inclusives), les 2 clés résolues à tour de rôle
  var action = {
    action: 'Jouer',
    effet: { choice: ['augmenter_population', 'augmenter_population_pure'] },
    cout: {},
    texte: 'Augmentez une Population Pure et/ou augmentez une Population Pure.'
  };

  var appelsPopup = 0;
  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1]; // les 2 options
    appelsPopup++;
    assert.strictEqual(contexte.type, 'augmenter_population_pure');
    return { detail: 'Population du Secteur ' + appelsPopup + ' augmentée de 1.', numero: appelsPopup };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(appelsPopup, 2, 'les 2 clés (population/population_pure) doivent chacune ouvrir la popup');
  });
});

// 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
// TODO.md) : "retirer_corruption" délègue désormais à demanderChoix
// ({type:'retirer_corruption'}) — la popup (strategieService.js) fait le
// choix ET la persistance (comme "regrouper"/"augmenter_population_pure"
// ci-dessus), resoudreCle_ ne fait que relayer reponse.detail.
test('retirer_corruption : succès — délègue à demanderChoix({type:"retirer_corruption"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { retirer_corruption: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'retirer_corruption');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Corruption retirée du Secteur 4.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Corruption retirée du Secteur 4') !== -1; }));
  });
});

test('retirer_corruption : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { retirer_corruption: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// 20/08/2026 (EVOLUTION 7 — effet "avancer sur piste de Civilisation",
// voir TODO.md) : "avancer_civilisation" (piste au choix) et les 3
// variantes "avancer_civilisation_<piste>" (piste imposée) délèguent
// désormais à demanderChoix({type:'avancer_civilisation', piste}) — la
// popup (strategieService.js) fait le choix ET la persistance (comme
// "regrouper"/"retirer_corruption" ci-dessus), resoudreCle_ ne fait que
// relayer reponse.detail.
test('avancer_civilisation (piste au choix) : succès — délègue à demanderChoix avec piste:null, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.piste, null);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Piste Gouvernement : niveau 1 \u2192 2 \u2014 Gagnez un Programme.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Piste Gouvernement : niveau 1') !== -1; }));
  });
});

test('avancer_civilisation_gouvernement (piste imposée) : succès — délègue à demanderChoix avec piste:"gouvernement"', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_gouvernement: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.piste, 'gouvernement');
    return { detail: 'Piste Gouvernement : niveau 2 \u2192 3.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('niveau 2 \u2192 3') !== -1; }));
  });
});

test('avancer_civilisation_societe / avancer_civilisation_economie : piste imposée correcte pour chacune', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var pistesRecues = [];
  var demanderChoix = function (contexte) { pistesRecues.push(contexte.piste); return { detail: 'ok' }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, { action: 'Jouer', effet: { avancer_civilisation_societe: 1 }, cout: {}, texte: '' }, demanderChoix)
    .then(function () {
      return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, { action: 'Jouer', effet: { avancer_civilisation_economie: 1 }, cout: {}, texte: '' }, demanderChoix);
    })
    .then(function () {
      assert.deepStrictEqual(pistesRecues, ['societe', 'economie']);
    });
});

test('avancer_civilisation : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('deployer_cube (mode libre) : succès — cubeActif ET coût ressource débités, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Déployer', effet: { deployer_cube: 2 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'deployer_cube');
    assert.strictEqual(contexte.mode, 'libre');
    assert.strictEqual(contexte.quantiteDemandee, 2);
    assert.strictEqual(contexte.cubeActif, PLATEAU_BASE.cubeActif);
    assert.strictEqual(contexte.ressourceMateriel, PLATEAU_BASE.ressourceMateriel);
    // 1 Corvette (gratuite) + 1 Cuirassé (1 Matériel/cube, voir
    // COUT_DEPLOIEMENT_PAR_TYPE côté strategieService.js)
    return { totalCubes: 2, coutParRessource: { materiel: 1 }, detail: '1× Corvette → secteur 3, 1× Cuirasse → secteur 3' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, 0); // 2 - 2
    assert.strictEqual(resultat.plateauMaisonApres.ressourceMateriel, 4); // 5 - 1
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Déployer') !== -1 && l.indexOf('coût : 1 materiel') !== -1; }));
  });
});

test('deployer_cube_par_chantier : mode transmis, "deployer_cube_secteur_mere" idem', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };

  var actionChantier = { action: 'Déployer', effet: { deployer_cube_par_chantier: 1 }, cout: {}, texte: '' };
  var demanderChoixChantier = function (contexte) {
    assert.strictEqual(contexte.mode, 'par_chantier');
    return { totalCubes: 1, coutParRessource: {}, detail: '1× Corvette → secteur 5' };
  };
  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, actionChantier, demanderChoixChantier).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);

    var actionMere = { action: 'Déployer', effet: { deployer_cube_secteur_mere: 1 }, cout: {}, texte: '' };
    var demanderChoixMere = function (contexte) {
      assert.strictEqual(contexte.mode, 'secteur_mere');
      return { totalCubes: 1, coutParRessource: {}, detail: '1× Corvette → secteur 1' };
    };
    return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, actionMere, demanderChoixMere);
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
  });
});

test('deployer_cube : annulé (popup "Annuler") — bloque toute l\u2019action, rien débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Déployer', effet: { deployer_cube: 2 }, cout: { energie: 1 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('deployer_cube côté Coût (signe < 0, cas non prévu par le livret) : retombe sur le traitement générique "cube"', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Test', effet: {}, cout: { deployer_cube: 1 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    // Pas de popup ouverte (demanderChoixSansPopup_ jetterait) : la clé
    // est traitée par le repli générique "cube" (consomme cubeActif).
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, PLATEAU_BASE.cubeActif - 1);
  });
});

test('cube : activation clampée à 14, consommation clampée à 0', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var plateau = Object.assign({}, PLATEAU_BASE, { cubeActif: 13 });
  var action = { action: 'Cube', effet: { activer_cube: 5 }, cout: { activer_cube: 20 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    // effet : 13 + 5 = 18, clampé à 14
    // coût : consomme jusqu'à 14 -> 0, reste 6 non couvert (signalé, non bloquant)
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, 0);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('restant') !== -1; }));
  });
});

test("annulation en chaîne : dernière puis avant-dernière", function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_('/home/claude/annulationService.js', ctx);

  return dbFactice.put('plateauMaison', Object.assign({}, PLATEAU_BASE)).then(function () {
    return ctx.AnnulationService.empiler('partie-test', {
      source: 'Action A',
      mutations: [{ champ: 'ressourceCredit', avant: 3, apres: 6 }]
    });
  }).then(function () {
    return ctx.AnnulationService.empiler('partie-test', {
      source: 'Action B',
      mutations: [{ champ: 'ressourceCredit', avant: 6, apres: 9 }]
    });
  }).then(function () {
    return ctx.AnnulationService.compter('partie-test');
  }).then(function (nb) {
    assert.strictEqual(nb, 2);
    return ctx.AnnulationService.annulerDerniere('partie-test');
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.source, 'Action B');
    return dbFactice.get('plateauMaison', 'partie-test');
  }).then(function (ligne) {
    assert.strictEqual(ligne.ressourceCredit, 6); // retour à l'état avant Action B
    return ctx.AnnulationService.annulerDerniere('partie-test');
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.source, 'Action A');
    return dbFactice.get('plateauMaison', 'partie-test');
  }).then(function (ligne) {
    assert.strictEqual(ligne.ressourceCredit, 3); // retour à l'état initial
    return ctx.AnnulationService.annulerDerniere('partie-test');
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.raison, 'pile_vide');
  });
});

test('pile limitée à 10 entrées par partie', function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_('/home/claude/annulationService.js', ctx);

  var chaine = dbFactice.put('plateauMaison', Object.assign({}, PLATEAU_BASE));
  for (var i = 0; i < 13; i++) {
    (function (index) {
      chaine = chaine.then(function () {
        return ctx.AnnulationService.empiler('partie-test', {
          source: 'Action ' + index,
          mutations: [{ champ: 'ressourceCredit', avant: index, apres: index + 1 }]
        });
      });
    })(i);
  }
  return chaine.then(function () {
    return ctx.AnnulationService.compter('partie-test');
  }).then(function (nb) {
    assert.strictEqual(nb, 10);
    return ctx.AnnulationService.obtenirPile('partie-test');
  }).then(function (pile) {
    assert.strictEqual(pile[0].source, 'Action 3'); // les 3 plus anciennes (0,1,2) purgées
    assert.strictEqual(pile[9].source, 'Action 12');
  });
});
