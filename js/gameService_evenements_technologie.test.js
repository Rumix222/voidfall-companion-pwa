/**
 * Test fumée — gameService.js (getEvenementsParCycle / choisirEvenement /
 * definirTechnologieAmelioree)
 * Exécution : node --test gameService_evenements_technologie.test.js
 *
 * Simule un DB en mémoire (même forme que DB : get/getAll/put) pour ne
 * dépendre ni du navigateur ni d'IndexedDB réel. Charge le fichier réel
 * via vm, comme focusEngine_test.js.
 *
 * ⚠️ Comparaisons de tableaux/objets renvoyés par le code chargé en vm :
 * JSON.stringify plutôt qu'assert.deepStrictEqual (voir
 * secteurService_actions.test.js pour l'explication du "realm" vm).
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
  var stores = { parties: {}, plateauMaison: {}, evenements: {}, historique: {} };
  var prochainIdHistorique = 1;
  return {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cle] || null); },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      var cle;
      if (nom === 'parties') cle = valeur.id;
      else if (nom === 'plateauMaison') cle = valeur.partieId;
      else if (nom === 'evenements') cle = valeur.code + '|' + valeur.cycle;
      else if (nom === 'historique') cle = prochainIdHistorique++;
      else cle = valeur.id;
      stores[nom][cle] = valeur;
      return Promise.resolve(valeur);
    },
    _stores: stores
  };
}

function ligneParties_(id, evenements) {
  return {
    id: id,
    dateCreation: '2026-08-17T00:00:00.000Z',
    archivee: false,
    scenarioId: 'scenario-test',
    cycleNum: 1,
    cycleTermine: false,
    statut: 'en_cours',
    etatJson: {
      joueur: { nom: 'Maison Test', technologies: [{ nom: 'TechDepart', type: 'militaire' }] },
      adversaires: [],
      evenements: evenements || { cycle1: null, cycle2: null, cycle3: null },
      focusJoueur: [],
      focusHeroiques: null
    }
  };
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

function creerContexte_(db) {
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, DB: db };
  chargerDansContexte_(__dirname + '/gameService.js', ctx);
  return ctx;
}

// Fixture alignée sur le schéma réel de data/catalogue/evenements.json
// post-migration (Supabase -> JSON local) : cadres[]/objectifs.blocs[],
// plus de texte1/texte2 à plat (voir formatEvenement_, gameService.js).
function evenementFixture_(champs) {
  return Object.assign({
    code: 'E1', cycle: 1, nom: 'Invasion', manches: 3,
    cadres: [
      { ordre: 1, obligatoire: true, resolution: 'unique', texte: 'Cadre obligatoire.',
        effet: { type: 'gain', cible: 'offre_programme', elements: { corruption: 1 } } },
      { ordre: 2, obligatoire: false, resolution: 'par_joueur', texte: 'Cadre facultatif, ressources simples.',
        effet: { type: 'choix', mode: 'exclusif', options: [
          { cout: { science: 1 }, gain: { credit: 3 } },
          { cle: 'science', valeur: 2 }
        ] } }
    ],
    objectifs: { blocs: [
      { lignes: [ { type: 'exploit', texte: 'Objectif de fin de Cycle.' } ] }
    ] }
  }, champs || {});
}

test('getEvenementsParCycle : groupe par cycle et conserve cadres/objectifs/manches', function () {
  var db = creerDbFactice_();
  db._stores.evenements['E1|1'] = evenementFixture_();
  db._stores.evenements['E2|2'] = evenementFixture_({ code: 'E2', cycle: 2, nom: 'Famine', manches: 2 });
  var ctx = creerContexte_(db);

  return ctx.GameService.getEvenementsParCycle().then(function (groupes) {
    assert.strictEqual(groupes.cycle1.length, 1);
    assert.strictEqual(groupes.cycle1[0].nom, 'Invasion');
    assert.strictEqual(groupes.cycle1[0].manches, 3);
    assert.strictEqual(groupes.cycle1[0].cadres.length, 2);
    assert.strictEqual(groupes.cycle1[0].cadres[0].texte, 'Cadre obligatoire.');
    assert.strictEqual(groupes.cycle1[0].objectifs.blocs.length, 1);
    assert.strictEqual(groupes.cycle2.length, 1);
    assert.strictEqual(groupes.cycle2[0].texte, undefined);
    assert.strictEqual(groupes.cycle3.length, 0);
  });
});

test('choisirEvenement : enregistre l\'événement du bon cycle et persiste (etatJson)', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1');
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1');
  db._stores.evenements['E1|1'] = evenementFixture_();
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirEvenement('partie-1', 1, 'Invasion').then(function (partie) {
    assert.strictEqual(partie.evenements.cycle1.nom, 'Invasion');
    assert.strictEqual(partie.evenements.cycle1.cadres.length, 2);
    assert.strictEqual(partie.evenements.cycle2, null);
    // Persisté : relecture directe du store, pas juste l'objet en mémoire renvoyé.
    var relu = db._stores.parties['partie-1'];
    assert.strictEqual(relu.etatJson.evenements.cycle1.nom, 'Invasion');
  });
});

test('choisirEvenement : rejette si l\'événement n\'existe pas pour ce cycle', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1');
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1');
  db._stores.evenements['E1|1'] = evenementFixture_();
  var ctx = creerContexte_(db);

  return ctx.GameService.choisirEvenement('partie-1', 2, 'Invasion').then(function () {
    assert.fail('aurait dû rejeter (Invasion est cycle 1, pas 2)');
  }, function (erreur) {
    assert.match(erreur.message, /introuvable/i);
  });
});

test('actionsSimplesCadre : extrait un delta ressources d\'un cadre "choix" simple', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  var cadre = evenementFixture_().cadres[1];

  var actions = ctx.GameService.actionsSimplesCadre(cadre);
  assert.strictEqual(actions.length, 2);
  assert.strictEqual(JSON.stringify(actions[0]), JSON.stringify({ index: 0, delta: { science: -1, credit: 3 } }));
  assert.strictEqual(JSON.stringify(actions[1]), JSON.stringify({ index: 1, delta: { science: 2 } }));
});

test('actionsSimplesCadre : ignore les options hors périmètre (secteur, Gloire, Technologie...)', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  var cadre = {
    ordre: 1, obligatoire: true, resolution: 'par_joueur', texte: 'Placement en secteur.',
    effet: { type: 'placement', zone: 'secteur_neant_adjacent', elements: { defense_secteur: 1 } }
  };

  assert.strictEqual(JSON.stringify(ctx.GameService.actionsSimplesCadre(cadre)), '[]');
});

test('actionsSimplesCadre : ignore les cadres permanents/collectifs/à retardement', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);
  var cadre = {
    ordre: 1, obligatoire: true, resolution: 'permanent', texte: 'Permanent.',
    effet: { type: 'choix', mode: 'exclusif', options: [ { cle: 'science', valeur: 2 } ] }
  };

  assert.strictEqual(JSON.stringify(ctx.GameService.actionsSimplesCadre(cadre)), '[]');
});

test('appliquerCadreEffet : applique le delta ressources et marque le cadre résolu', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1', { cycle1: evenementFixture_() });
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1', { ressourceScience: 5, ressourceCredit: 0 });
  var ctx = creerContexte_(db);

  return ctx.GameService.appliquerCadreEffet('partie-1', 1, 2, { science: -1, credit: 3 }).then(function (partie) {
    assert.strictEqual(partie.plateauMaison.ressources.science, 4);
    assert.strictEqual(partie.plateauMaison.ressources.credit, 3);
    assert.strictEqual(partie.evenements.cycle1.cadresAppliques[2].delta.credit, 3);

    return ctx.GameService.appliquerCadreEffet('partie-1', 1, 2, { science: -1, credit: 3 }).then(function () {
      assert.fail('aurait dû rejeter (cadre déjà appliqué)');
    }, function (erreur) {
      assert.match(erreur.message, /déjà été appliqué/i);
    });
  });
});

test('appliquerCadreEffet : rejette si la ressource nécessaire est insuffisante', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1', { cycle1: evenementFixture_() });
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1', { ressourceScience: 0 });
  var ctx = creerContexte_(db);

  return ctx.GameService.appliquerCadreEffet('partie-1', 1, 2, { science: -1, credit: 3 }).then(function () {
    assert.fail('aurait dû rejeter (Science insuffisante)');
  }, function (erreur) {
    assert.match(erreur.message, /insuffisante/i);
  });
});

test('definirTechnologieAmelioree : cible "depart" bascule technologieDepartAmelioree', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1');
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1');
  var ctx = creerContexte_(db);

  return ctx.GameService.definirTechnologieAmelioree('partie-1', 'depart', true).then(function (partie) {
    assert.strictEqual(partie.joueur.technologieDepart.amelioree, true);
    assert.strictEqual(db._stores.plateauMaison['partie-1'].technologieDepartAmelioree, true);
  });
});

test('definirTechnologieAmelioree : emplacement obtenu vide -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1');
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1');
  var ctx = creerContexte_(db);

  return ctx.GameService.definirTechnologieAmelioree('partie-1', 0, true).then(function () {
    assert.fail('aurait dû rejeter (aucune technologie à cet emplacement)');
  }, function (erreur) {
    assert.match(erreur.message, /aucune technologie/i);
  });
});

test('definirTechnologieAmelioree : emplacement obtenu occupé -> bascule sans toucher les autres slots', function () {
  var db = creerDbFactice_();
  db._stores.parties['partie-1'] = ligneParties_('partie-1');
  db._stores.plateauMaison['partie-1'] = lignePlateauMaison_('partie-1', {
    technologiesObtenues: [{ nom: 'TechAdverse', amelioree: false }, null, null, null, null, null]
  });
  var ctx = creerContexte_(db);

  return ctx.GameService.definirTechnologieAmelioree('partie-1', 0, true).then(function (partie) {
    assert.strictEqual(partie.technologiesObtenues[0].amelioree, true);
    assert.strictEqual(partie.technologiesObtenues[0].nom, 'TechAdverse');
    assert.strictEqual(partie.technologiesObtenues[1], null);
  });
});
