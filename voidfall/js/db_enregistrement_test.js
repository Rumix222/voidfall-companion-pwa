/**
 * Test — db.js, mécanisme d'enregistrement générique EVOLUTION 18
 * (todo.md) : demarrerEnregistrement/arreterEnregistrement/put capturent
 * bien {store, cle, avant, apres} pour toute écriture DB.put() passée
 * pendant un enregistrement actif, quel que soit le store.
 *
 * db.js s'appuie directement sur le global `indexedDB` (aucune couche
 * d'indirection testable en isolation) — ce fichier fournit donc un FAUX
 * IndexedDB minimal (juste assez d'API pour get/put/getAll/delete +
 * l'ouverture/mise à niveau du schéma) plutôt que de mocker db.js
 * lui-même, pour exercer le VRAI code de production sans dépendance npm.
 *
 * Exécution : node js/db_enregistrement_test.js
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function creerRequete_() {
  var req = {};
  // onsuccess/onerror assignés par l'appelant APRÈS la création — le
  // déclenchement se fait via un microtask (Promise.resolve().then) pour
  // rester asynchrone comme la vraie API, sans dépendre d'un setTimeout.
  return req;
}

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
  var stores = {}; // nomStore -> { cleStr -> valeur }

  function cleStr_(keyPath, valeur) {
    if (Array.isArray(keyPath)) return JSON.stringify(keyPath.map(function (k) { return valeur[k]; }));
    return JSON.stringify(valeur[keyPath]);
  }

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
    open: function (nomBase, version) {
      var req = creerRequete_();
      Promise.resolve().then(function () {
        // Reproduit juste assez onupgradeneeded pour laisser db.js
        // déclarer tous ses stores (STORES, voir db.js) — capture les
        // keyPath déclarés pour que transaction()/objectStore() ci-dessus
        // sache comment calculer une clé composée plus tard.
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

function chargerDbAvecIndexedDBFactice_() {
  var fakeIndexedDB = creerIndexedDBFactice_();
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, indexedDB: fakeIndexedDB };
  vm.createContext(ctx);
  var code = fs.readFileSync(__dirname + '/db.js', 'utf8');
  vm.runInContext(code, ctx, { filename: __dirname + '/db.js' });
  return { DB: ctx.DB, stores: fakeIndexedDB.__stores };
}

test('put hors enregistrement : écrit normalement, rien capturé', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  return ctx.DB.put('plateauMaison', { partieId: 'p1', ressourceScience: 2 }).then(function () {
    assert.strictEqual(ctx.DB.enregistrementActif(), false);
    return ctx.DB.get('plateauMaison', 'p1');
  }).then(function (ligne) {
    assert.strictEqual(ligne.ressourceScience, 2);
  });
});

test('enregistrement : capture avant/apres sur un seul put', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  return ctx.DB.put('plateauMaison', { partieId: 'p1', ressourceScience: 2 }).then(function () {
    ctx.DB.demarrerEnregistrement();
    assert.strictEqual(ctx.DB.enregistrementActif(), true);
    return ctx.DB.put('plateauMaison', { partieId: 'p1', ressourceScience: 1 });
  }).then(function () {
    var captures = ctx.DB.arreterEnregistrement();
    assert.strictEqual(ctx.DB.enregistrementActif(), false);
    assert.strictEqual(captures.length, 1);
    assert.strictEqual(captures[0].store, 'plateauMaison');
    assert.strictEqual(captures[0].cle, 'p1');
    assert.strictEqual(captures[0].avant.ressourceScience, 2);
    assert.strictEqual(captures[0].apres.ressourceScience, 1);
  });
});

test('enregistrement : 2 puts sur la MÊME ligne -> avant du 1er, apres du dernier (état intermédiaire jamais restauré)', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  return ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 3, pnCorvette: 5 }).then(function () {
    ctx.DB.demarrerEnregistrement();
    return ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 3, pnCorvette: 3 });
  }).then(function () {
    return ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 3, pnCorvette: 1 });
  }).then(function () {
    var captures = ctx.DB.arreterEnregistrement();
    assert.strictEqual(captures.length, 1);
    assert.strictEqual(JSON.stringify(captures[0].cle), JSON.stringify(['p1', 3]));
    assert.strictEqual(captures[0].avant.pnCorvette, 5);
    assert.strictEqual(captures[0].apres.pnCorvette, 1);
  });
});

test('enregistrement : puts sur plusieurs stores/clés différentes -> une capture par clé', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  return Promise.all([
    ctx.DB.put('plateauMaison', { partieId: 'p1', ressourceScience: 2 }),
    ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 1, pnCorvette: 2 }),
    ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 2, pnCorvette: 0 })
  ]).then(function () {
    ctx.DB.demarrerEnregistrement();
    return Promise.all([
      ctx.DB.put('plateauMaison', { partieId: 'p1', ressourceScience: 1 }),
      ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 1, pnCorvette: 1 }),
      ctx.DB.put('secteursPartie', { partieId: 'p1', numero: 2, pnCorvette: 1 })
    ]);
  }).then(function () {
    var captures = ctx.DB.arreterEnregistrement();
    assert.strictEqual(captures.length, 3);
    var parStore = {};
    captures.forEach(function (c) { parStore[c.store + '|' + JSON.stringify(c.cle)] = c; });
    assert.strictEqual(parStore['plateauMaison|"p1"'].avant.ressourceScience, 2);
    assert.strictEqual(parStore['secteursPartie|["p1",1]'].avant.pnCorvette, 2);
    assert.strictEqual(parStore['secteursPartie|["p1",2]'].avant.pnCorvette, 0);
  });
});

test('enregistrement : store exclu (pileAnnulation) jamais capturé', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  ctx.DB.demarrerEnregistrement();
  return ctx.DB.put('pileAnnulation', { id: 1, partieId: 'p1', mutations: [] }).then(function () {
    var captures = ctx.DB.arreterEnregistrement();
    assert.strictEqual(captures.length, 0);
  });
});

test('arreterEnregistrement sans enregistrement actif -> [] (sûr après une erreur en amont)', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  assert.strictEqual(ctx.DB.arreterEnregistrement().length, 0);
});

test('clone défensif : muter l\'objet passé à put() après coup n\'altère pas la capture', function () {
  var ctx = chargerDbAvecIndexedDBFactice_();
  return ctx.DB.put('plateauMaison', { partieId: 'p1', ressourceScience: 2 }).then(function () {
    ctx.DB.demarrerEnregistrement();
    var valeur = { partieId: 'p1', ressourceScience: 1 };
    return ctx.DB.put('plateauMaison', valeur).then(function () {
      valeur.ressourceScience = 999; // mutation tardive côté appelant
    });
  }).then(function () {
    var captures = ctx.DB.arreterEnregistrement();
    assert.strictEqual(captures[0].apres.ressourceScience, 1);
  });
});
