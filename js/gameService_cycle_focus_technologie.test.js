/**
 * Test fumée — gameService.js (avancerCycle / choisirFocusHeroique /
 * choisirTechnologieObtenue)
 * Exécution : node --test gameService_cycle_focus_technologie.test.js
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
  var stores = { parties: {}, plateauMaison: {}, historique: {} };
  var prochainIdHistorique = 1;
  return {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cle] || null); },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      var cle;
      if (nom === 'parties') cle = valeur.id;
      else if (nom === 'plateauMaison') cle = valeur.partieId;
      else if (nom === 'historique') cle = prochainIdHistorique++;
      else cle = valeur.id;
      stores[nom][cle] = valeur;
      return Promise.resolve(valeur);
    },
    _stores: stores
  };
}

function creerFocusServiceFactice_(cartesDisponibles) {
  return {
    obtenirCarteHeroiqueParNom: function (nom) {
      var carte = cartesDisponibles.filter(function (c) { return c.focus === nom; })[0];
      if (!carte) return Promise.reject(new Error('Focus héroïque "' + nom + '" introuvable dans le pool.'));
      return Promise.resolve(carte);
    }
  };
}

function ligneParties_(id, extra) {
  var base = {
    id: id,
    dateCreation: '2026-08-17T00:00:00.000Z',
    archivee: false,
    scenarioId: 'scenario-test',
    cycleNum: 1,
    cycleTermine: false,
    statut: 'en_cours',
    etatJson: {
      joueur: { nom: 'Maison Test', technologies: [{ nom: 'TechDepart', type: 'militaire' }] },
      adversaires: [
        { nom: 'Maison Adverse', technologies: [{ nom: 'TechAdverse', type: 'commerce', sansPoint: false }] }
      ],
      evenements: { cycle1: null, cycle2: null, cycle3: null },
      focusJoueur: [],
      focusHeroiques: null
    }
  };
  return Object.assign(base, extra || {});
}

function lignePlateauMaison_(partieId, extra) {
  var base = {
    partieId: partieId,
    ressourceNourriture: 0, ressourceEnergie: 0, ressourceMateriel: 0,
    ressourceCredit: 0, ressourceScience: 0, influence: 0,
    cubeActif: 0, jetonPrime: 0, jetonLiberation: 0, jetonCommerce: [], gloire: [],
    programme1: null, programme2: null, programme3: null, programme4: null,
    technologieDepart: 'TechDepart', technologieDepartAmelioree: false,
    technologiesObtenues: [null, null, null, null, null, null],
    civSociete: 0, civGouvernement: 0, civEconomie: 0,
    civCorrompueSociete: false, civCorrompueGouvernement: false, civCorrompueEconomie: false
  };
  return Object.assign(base, extra || {});
}

function creerContexte_(db, focusService) {
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, DB: db, FocusService: focusService || creerFocusServiceFactice_([]) };
  chargerDansContexte_(__dirname + '/gameService.js', ctx);
  return ctx;
}

// ---------------------------------------------------------------
// avancerCycle
// ---------------------------------------------------------------

test('avancerCycle : 1 -> 2, amorce focusHeroiques.cycle2 et focusHeroiquesPioches', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.avancerCycle('p1').then(function (partie) {
    assert.strictEqual(partie.cycleNum, 2);
    assert.strictEqual(partie.cycleTermine, false);
    assert.strictEqual(partie.cycleActuel, 2);
    assert.strictEqual(JSON.stringify(partie.focusHeroiques.cycle2), JSON.stringify([null, null, null]));
    assert.strictEqual(JSON.stringify(partie.focusHeroiquesPioches), JSON.stringify([]));
  });
});

// EVOLUTION 12 (todo.md, retour utilisateur) — les actions Focus
// utilisées se réinitialisent à chaque changement de cycle : à la fois
// dans l'objet `partie` renvoyé EN MÉMOIRE (utilisé directement par
// index.html pour re-rendre l'écran Focus sans rechargement complet) ET
// dans la table `plateauMaison` (relecture ultérieure, ex. prochaine
// action jouée).
test('avancerCycle : réinitialise plateauMaison.actionsFocusUtilisees (mémoire ET DB)', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1', { actionsFocusUtilisees: ['Politique — Contrôler', 'Conquête — Planifier'] });
  var ctx = creerContexte_(db);

  return ctx.GameService.avancerCycle('p1').then(function (partie) {
    assert.strictEqual(JSON.stringify(partie.plateauMaison.actionsFocusUtilisees), JSON.stringify([]));
    return db.get('plateauMaison', 'p1');
  }).then(function (ligne) {
    assert.strictEqual(JSON.stringify(ligne.actionsFocusUtilisees), JSON.stringify([]));
  });
});

test('avancerCycle : 3 -> termine (ne dépasse jamais 3)', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1', { cycleNum: 3, cycleTermine: false });
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.avancerCycle('p1').then(function (partie) {
    assert.strictEqual(partie.cycleNum, 3);
    assert.strictEqual(partie.cycleTermine, true);
    assert.strictEqual(partie.cycleActuel, 'termine');
  });
});

test('avancerCycle : déjà terminée -> reste terminée (idempotent)', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1', { cycleNum: 3, cycleTermine: true });
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.avancerCycle('p1').then(function (partie) {
    assert.strictEqual(partie.cycleTermine, true);
    assert.strictEqual(partie.cycleActuel, 'termine');
  });
});

// ---------------------------------------------------------------
// choisirFocusHeroique
// ---------------------------------------------------------------

test('choisirFocusHeroique : emplacement invalide -> rejette', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  return ctx.GameService.choisirFocusHeroique('p1', 1, 5, 'X').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /invalide/i);
  });
});

test('choisirFocusHeroique : choix valide -> carte posée + pioches mise à jour', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var carte = { id: 'FAM1', focus: 'Carte Héroïque A', type: 'Héroïque', actions: [{ action: 'Jouer', cout: {}, effet: {}, texte: '' }] };
  var ctx = creerContexte_(db, creerFocusServiceFactice_([carte]));

  return ctx.GameService.choisirFocusHeroique('p1', 1, 0, 'Carte Héroïque A').then(function (partie) {
    assert.strictEqual(partie.focusHeroiques.cycle1[0].focus, 'Carte Héroïque A');
    assert.strictEqual(JSON.stringify(partie.focusHeroiquesPioches), JSON.stringify(['Carte Héroïque A']));
    // Persisté.
    var relu = db._stores.parties['p1'];
    assert.strictEqual(relu.etatJson.focusHeroiques.cycle1[0].focus, 'Carte Héroïque A');
    // Pas d'entrée d'historique (fidèle à la RPC d'origine).
    assert.strictEqual(Object.keys(db._stores.historique).length, 0);
  });
});

test('choisirFocusHeroique : déjà choisi (pioches) -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1', {
    etatJson: Object.assign({}, ligneParties_('p1').etatJson, {
      focusHeroiques: { cycle1: [{ id: 'FAM1', focus: 'Carte Héroïque A', type: 'Héroïque', actions: [] }, null, null], cycle2: [null, null, null], cycle3: [null, null, null] },
      focusHeroiquesPioches: ['Carte Héroïque A']
    })
  });
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var carte = { id: 'FAM1', focus: 'Carte Héroïque A', type: 'Héroïque', actions: [] };
  var ctx = creerContexte_(db, creerFocusServiceFactice_([carte]));

  // Tente de la reprendre à un AUTRE emplacement (slot 1) : doit rejeter car déjà piochée.
  return ctx.GameService.choisirFocusHeroique('p1', 1, 1, 'Carte Héroïque A').then(function () {
    assert.fail('aurait dû rejeter (déjà choisi)');
  }, function (erreur) {
    assert.match(erreur.message, /déjà été choisi/i);
  });
});

test('choisirFocusHeroique : remplacer un emplacement libère l\'ancien choix', function () {
  var etatInitial = ligneParties_('p1').etatJson;
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1', {
    etatJson: Object.assign({}, etatInitial, {
      focusHeroiques: { cycle1: [{ id: 'FAM1', focus: 'Carte A', type: 'Héroïque', actions: [] }, null, null], cycle2: [null, null, null], cycle3: [null, null, null] },
      focusHeroiquesPioches: ['Carte A']
    })
  });
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var carteB = { id: 'FAM2', focus: 'Carte B', type: 'Héroïque', actions: [] };
  var ctx = creerContexte_(db, creerFocusServiceFactice_([carteB]));

  return ctx.GameService.choisirFocusHeroique('p1', 1, 0, 'Carte B').then(function (partie) {
    assert.strictEqual(partie.focusHeroiques.cycle1[0].focus, 'Carte B');
    assert.strictEqual(JSON.stringify(partie.focusHeroiquesPioches), JSON.stringify(['Carte B']));
  });
});

test('choisirFocusHeroique : nom vide -> vide l\'emplacement et libère la pioche', function () {
  var etatInitial = ligneParties_('p1').etatJson;
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1', {
    etatJson: Object.assign({}, etatInitial, {
      focusHeroiques: { cycle1: [{ id: 'FAM1', focus: 'Carte A', type: 'Héroïque', actions: [] }, null, null], cycle2: [null, null, null], cycle3: [null, null, null] },
      focusHeroiquesPioches: ['Carte A']
    })
  });
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirFocusHeroique('p1', 1, 0, '').then(function (partie) {
    assert.strictEqual(partie.focusHeroiques.cycle1[0], null);
    assert.strictEqual(JSON.stringify(partie.focusHeroiquesPioches), JSON.stringify([]));
  });
});

// ---------------------------------------------------------------
// choisirTechnologieObtenue
// ---------------------------------------------------------------

test('choisirTechnologieObtenue : slot invalide -> rejette', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  return ctx.GameService.choisirTechnologieObtenue('p1', 9, 'X').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /invalide/i);
  });
});

test('choisirTechnologieObtenue : technologie trouvée chez une maison déchue -> assignée au slot', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieObtenue('p1', 0, 'TechAdverse').then(function (partie) {
    assert.strictEqual(partie.technologiesObtenues[0].nom, 'TechAdverse');
    assert.strictEqual(partie.technologiesObtenues[0].maison, 'Maison Adverse');
    assert.strictEqual(partie.technologiesObtenues[1], null);
    // Historique écrit (fidèle à la RPC d'origine, contrairement à choisirFocusHeroique).
    assert.strictEqual(Object.keys(db._stores.historique).length, 1);
  });
});

test('choisirTechnologieObtenue : technologie introuvable -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1');
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieObtenue('p1', 0, 'TechInexistante').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /introuvable/i);
  });
});

test('choisirTechnologieObtenue : nom vide -> retire la technologie du slot', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = ligneParties_('p1');
  db._stores.plateauMaison['p1'] = lignePlateauMaison_('p1', {
    technologiesObtenues: [{ nom: 'TechAdverse', type: 'commerce', sansPoint: false, maison: 'Maison Adverse' }, null, null, null, null, null]
  });
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirTechnologieObtenue('p1', 0, '').then(function (partie) {
    assert.strictEqual(partie.technologiesObtenues[0], null);
  });
});
