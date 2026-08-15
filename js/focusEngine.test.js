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

test('clé secteur hors périmètre (envahir) : ne bloque pas, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Envahir', effet: { envahir: 1 }, cout: { energie: 2 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('envahir') !== -1 && l.indexOf('non automatisé') !== -1; }));
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
