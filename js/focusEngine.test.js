/**
 * Test fumée — focusEngine.js + annulationService.js
 * Exécution : node focusEngine.test.js
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
  chargerDansContexte_(__dirname + '/focusEngine.js', ctx);
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

test('gagner_prime : crédite jetonPrime directement (case "Gagnez un jeton Prime.")', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Prime', effet: { gagner_prime: 1 }, cout: {}, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.jetonPrime, 1);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('prime') !== -1 && l.indexOf('non automatisé') === -1; }));
  });
});

// Reproduit la chaîne complète "Avancer piste civilisation -> avance
// rapide -> gagner un jeton commerce -> gagner un jeton prime" : le
// Bonus Commerce "Gagnez un jeton Prime." (index 4 de BONUS_COMMERCE)
// doit réellement créditer jetonPrime, pas juste journaliser un rappel
// manuel.
test('gagner_commerce -> Bonus Commerce "Gagnez un jeton Prime." : crédite jetonPrime', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Commerce', effet: { gagner_commerce: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'bonus_commerce');
    return { indexChoisi: 4 }; // "Gagnez un jeton Prime."
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.jetonPrime, 1);
  });
});

// "effet_secteur" sert de témoin pour les clés secteur non automatisées
// (repli générique "effet non chiffré") — "retirer_corruption" ne peut
// pas servir de témoin car elle est portée (voir tests dédiés plus bas) ;
// "rappeler_cube" est écarté aussi : son nom contient "cube" et tombe
// dans le repli générique dédié aux clés Cube, pas dans celui des clés
// secteur.
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

// "augmenter_population" (SANS "_pure") est la clé utilisée par
// data/catalogue/pistesCivilisation.json et focus.json — à distinguer de
// "augmenter_population_pure" (evenements.json, même mécanique). Même
// gabarit de test que "regrouper" ci-dessus.
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

// "retirer_corruption" délègue à demanderChoix({type:'retirer_corruption'})
// — la popup (strategieService.js) fait le choix ET la persistance (comme
// "regrouper"/"augmenter_population_pure" ci-dessus), resoudreCle_ ne fait
// que relayer reponse.detail.
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

// "gain_corruption" délègue à demanderChoix({type:'gagner_corruption'})
// (voir docs-rules-corruption-gardiens-refuges-technoConsume.md) — miroir
// exact de retirer_corruption ci-dessus, même contrat (la popup fait le
// choix ET la persistance, resoudreCle_ ne fait que relayer
// reponse.detail).
test('gain_corruption : succès — délègue à demanderChoix({type:"gagner_corruption"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gain_corruption: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_corruption');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Corruption placée sur le Secteur 4.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Corruption placée sur le Secteur 4') !== -1; }));
  });
});

test('gain_corruption : annulé (popup "Annuler") — bloque toute l’action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gain_corruption: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "gagner_programme" délègue à demanderChoix({type:'gagner_programme'}) —
// même contrat que gain_corruption/retirer_corruption ci-dessus (la popup,
// strategieService.js, fait le choix ET la persistance via
// GameService.gagnerProgramme). `typeImpose` distingue une valeur
// numérique générique (1, tous types ouverts, null transmis) d'une valeur
// de type imposée (chaîne "force"/"soutien"/"domination"/"richesse",
// capitalisée pour matcher data/catalogue/programmes.json).
test('gagner_programme (valeur 1) : délègue à demanderChoix({type:"gagner_programme", typeImpose:null}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gagner_programme: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_programme');
    assert.strictEqual(contexte.partieId, 'partie-test');
    assert.strictEqual(contexte.typeImpose, null);
    return { detail: 'Programme "Haute Société" (Domination) obtenu.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Programme "Haute Société" (Domination) obtenu') !== -1; }));
  });
});

test('gagner_programme "force" : délègue à demanderChoix avec typeImpose:"Force" (capitalisé)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gagner_programme: 'force' }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_programme');
    assert.strictEqual(contexte.typeImpose, 'Force');
    return { detail: 'Programme "Poigne de Fer" (Force) obtenu.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Poigne de Fer') !== -1; }));
  });
});

// Vocabulaire alternatif rencontré dans focus.json : une clé bare
// "programme_force"/"programme_richesse"/etc. (au lieu de
// "gagner_programme":"force") — même résolution, type imposé dérivé de la
// CLÉ plutôt que de la valeur.
test('programme_force (clé bare) : délègue à demanderChoix avec typeImpose:"Force"', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { programme_force: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_programme');
    assert.strictEqual(contexte.typeImpose, 'Force');
    return { detail: 'Programme "Poigne de Fer" (Force) obtenu.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
  });
});

test('gagner_programme : annulé (popup "Annuler") — bloque toute l’action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gagner_programme: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "avancer_civilisation_moins_avancee" (action de Programme de type
// Force, voir gameService.js EFFET_PROGRAMME_PAR_TYPE_) délègue à la MÊME
// popup 'avancer_civilisation' que ci-dessus, avec un flag
// `moinsAvancee:true` plutôt qu'une `piste` imposée — c'est la popup
// (strategieService.js) qui calcule quelle piste est la moins avancée,
// pas focusEngine.js.
test('avancer_civilisation_moins_avancee : succès — délègue à demanderChoix avec piste:null, moinsAvancee:true', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_moins_avancee: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.piste, null);
    assert.strictEqual(contexte.moinsAvancee, true);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Piste Économie : niveau 0 -> 1.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('niveau 0') !== -1; }));
  });
});

test('avancer_civilisation_moins_avancee : annulé -> bloque toute l\'action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_moins_avancee: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "influence_valeur_gloire" résolue entièrement en pur (voir
// docs-architecture-pwa.md) — aucun demanderChoix appelé
// (demanderChoixSansPopup_ jetterait si c'était le cas), somme des
// jetons Gloire (null ignorés).
test('influence_valeur_gloire : somme des jetons Gloire créditée, résolue en pur (aucun demanderChoix)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_valeur_gloire: 1 }, cout: {}, texte: '' };
  var plateau = Object.assign({}, PLATEAU_BASE, { gloire: [3, null, 5, null, 2] });

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 20); // 10 (initial) + 10 (3+5+2)
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('+10 influence') !== -1 && l.indexOf('Gloire') !== -1; }));
  });
});

// "influence_par_technologie_amelioree" résolue entièrement en pur —
// combine les 3 sources de Technologies possédées (départ, emplacements
// obtenus, avancées choisies).
test('influence_par_technologie_amelioree : combine les 3 sources, résolue en pur (aucun demanderChoix)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_technologie_amelioree: 6 }, cout: {}, texte: '' };
  var plateau = Object.assign({}, PLATEAU_BASE, {
    technologieDepart: 'Chambres de décontamination', technologieDepartAmelioree: true,
    technologiesObtenues: [{ nom: 'Cuirassés', amelioree: true }, null, { nom: 'Boucliers', amelioree: false }, null, null],
    technologiesAvanceesChoisies: ['Torpilles', null, null, null],
    technologiesAvanceesAmeliorees: { Torpilles: true }
  });

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    // 3 améliorées : départ + Cuirassés (obtenue) + Torpilles (avancée) ; Boucliers non améliorée ignorée.
    assert.strictEqual(resultat.plateauMaisonApres.influence, 28); // 10 (initial) + 18 (3 × 6)
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('+18 influence') !== -1 && l.indexOf('3 technologie(s) améliorée(s)') !== -1; }));
  });
});

// Les 9 clés "influence_par_*" nécessitant un comptage sur les secteurs
// délèguent à demanderChoix({type:'influence_secteur'}) — calcul
// déterministe, aucun choix utilisateur, la popup (strategieService.js)
// fait le calcul ET résout {montant, detail}.
test('influence_par_guilde_pure : délègue à demanderChoix({type:"influence_secteur"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_guilde_pure: 2 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'influence_secteur');
    assert.strictEqual(contexte.formule, 'influence_par_guilde_pure');
    assert.strictEqual(contexte.valeur, 2);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { montant: 8, detail: '8 Influence (4 Guilde(s) Pure(s) × 2).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 18); // 10 + 8
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('4 Guilde(s) Pure(s)') !== -1; }));
  });
});

// "influence_par_guilde" a une forme différente (tableau de clés Guilde,
// pas un nombre) — transmis tel quel à la popup via contexte.valeur.
test('influence_par_guilde : transmet le tableau de clés Guilde tel quel', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_guilde: ['scientifique_pur', 'banquier_pur'] }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.formule, 'influence_par_guilde');
    assert.strictEqual(JSON.stringify(contexte.valeur), JSON.stringify(['scientifique_pur', 'banquier_pur']));
    return { montant: 3, detail: '3 Influence (Guildes Pures de Scientifiques/Banquiers — 3 au total).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 13); // 10 + 3
  });
});

test('influence_par_secteur_pur : annulé (popup "Annuler") — bloque toute l’action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_secteur_pur: 2 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "produire_<ressource>" (ressource imposée par le nom de la clé, ex.
// Focus Production "Ravitailler" — produire_energie/materiel/nourriture)
// délègue à demanderChoix({type:'produire_revenu'}) — calcul déterministe
// (revenu de production actuel), aucun choix utilisateur, la popup
// (strategieService.js) fait le calcul ET résout {montant, detail}. Même
// contrat que influence_secteur ci-dessus.
test('produire_energie : délègue à demanderChoix({type:"produire_revenu", ressource:"energie"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Production' };
  var action = { action: 'Ravitailler', effet: { produire_energie: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'produire_revenu');
    assert.strictEqual(contexte.ressource, 'energie');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { montant: 4, detail: '+4 Énergie (Production, Niveau 6).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 9); // 5 + 4
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('+4 Énergie') !== -1; }));
  });
});

// Ravitailler combine 3 clés produire_* dans la même option "choice" —
// chacune est résolue indépendamment (son propre appel à demanderChoix),
// toutes les 3 doivent créditer la bonne ressource.
test('Ravitailler (produire_energie + produire_materiel + produire_nourriture ensemble) : crédite les 3 ressources', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Production' };
  var action = {
    action: 'Ravitailler',
    effet: { produire_energie: 1, produire_materiel: 1, produire_nourriture: 1 },
    cout: {}, texte: ''
  };

  var montantParRessource = { energie: 4, materiel: 3, nourriture: 2 };
  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'produire_revenu');
    var montant = montantParRessource[contexte.ressource];
    return { montant: montant, detail: '+' + montant + ' ' + contexte.ressource + ' (Production).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 9); // 5 + 4
    assert.strictEqual(resultat.plateauMaisonApres.ressourceMateriel, 8); // 5 + 3
    assert.strictEqual(resultat.plateauMaisonApres.ressourceNourriture, 7); // 5 + 2
  });
});

test('produire_credit : annulé (popup "Annuler") — bloque toute l’action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { produire_credit: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "produire_ressource"/"produire_deux_ressources" (CHOIX du joueur parmi
// les 5 ressources) restent hors périmètre — pas de popup de sélection
// construite, contrairement à produire_<ressource> (ressource imposée)
// ci-dessus.
test('produire_ressource (choix du joueur) : reste hors périmètre, ne bloque pas, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { produire_ressource: 1 }, cout: {}, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('non automatisé') !== -1; }));
    assert.strictEqual(resultat.mutations.length, 0);
  });
});

// "avancer_civilisation" (piste au choix) et les 3 variantes
// "avancer_civilisation_<piste>" (piste imposée) délèguent à
// demanderChoix({type:'avancer_civilisation', piste}) — la popup
// (strategieService.js) fait le choix ET la persistance (comme
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
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

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
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

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
