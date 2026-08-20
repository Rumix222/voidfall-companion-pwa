/**
 * Test fumée — secteurService.js (construire / deployerCube /
 * rappelerCube / retirerCorruption / regrouper / envahirResoudre /
 * obtenirSecteursEligiblesConstruction / getEntretien)
 * Exécution : node --test secteurService_actions.test.js
 *
 * ⚠️ Toutes les comparaisons de tableaux/objets renvoyés par le code
 * chargé en vm utilisent JSON.stringify plutôt qu'assert.deepStrictEqual
 * : les littéraux [] / {} créés PENDANT l'exécution du code en vm
 * appartiennent au "realm" du contexte vm, distinct de celui du test —
 * deepStrictEqual les considère comme non égaux malgré un contenu
 * identique (message Node "same structure but are not reference-equal").
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
  var stores = {
    parties: {}, secteursPartie: {}, scenarioSecteurs: {},
    typesSecteur: {}, scenarioAdjacences: {}
  };
  function cleDe_(nom, valeur) {
    if (nom === 'parties') return valeur.id;
    if (nom === 'secteursPartie') return valeur.partieId + '|' + valeur.numero;
    if (nom === 'scenarioSecteurs') return valeur.scenarioId + '|' + valeur.numero;
    if (nom === 'typesSecteur') return valeur.id;
    if (nom === 'scenarioAdjacences') return valeur.scenarioId + '|' + valeur.numeroA + '|' + valeur.numeroB;
    return valeur.id;
  }
  return {
    get: function (nom, cle) {
      var cleStr = Array.isArray(cle) ? cle.join('|') : cle;
      return Promise.resolve(stores[nom][cleStr] || null);
    },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      stores[nom][cleDe_(nom, valeur)] = valeur;
      return Promise.resolve(valeur);
    },
    _stores: stores
  };
}

function secteurDeBase_(extra) {
  return Object.assign({
    partieId: 'p1', numero: 1, maisonAssociee: null, population: 3, corrompu: false, nombreGardien: 0,
    guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
    installationChantierNaval: 0, installationDefenseSecteur: 0, installationBaseStellaire: 0,
    pnNeant: 0, pnCorvette: 1, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0,
    jetonPrime: 0, jetonGloire: 0, jetonLiberation: 0
  }, extra || {});
}

function creerContexte_(db) {
  var ctx = { console: console, Promise: Promise, JSON: JSON, Object: Object, Math: Math, DB: db };
  chargerDansContexte_('/home/claude/work/secteurService.js', ctx);
  return ctx;
}

function dbBaseConstruction_() {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'type_a', sousType: null };
  db._stores.typesSecteur['type_a'] = {
    id: 'type_a', nom: 'Type A', nombreInstallationMax: 1, nombreGuildeMax: 1,
    installationChantierNaval: 0, installationDefenseSecteur: 0, installationBaseStellaire: 0,
    guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0
  };
  return db;
}

// ---------------------------------------------------------------
// construire
// ---------------------------------------------------------------

test('construire : emplacement libre -> incrémente la bonne colonne', function () {
  var db = dbBaseConstruction_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_();
  var ctx = creerContexte_(db);

  return ctx.SecteurService.construire('p1', 1, 'installation', 'chantier_naval').then(function (secteur) {
    assert.strictEqual(secteur.installationChantierNaval, 1);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].installationChantierNaval, 1);
  });
});

test('construire : aucun emplacement libre -> rejette', function () {
  var db = dbBaseConstruction_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ installationChantierNaval: 1 }); // max=1, déjà plein
  var ctx = creerContexte_(db);

  return ctx.SecteurService.construire('p1', 1, 'installation', 'defense_secteur').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /aucun emplacement libre/i);
  });
});

test('construire : secteur ne vous appartient pas -> rejette', function () {
  var db = dbBaseConstruction_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 0 }); // aucune PN = pas au joueur
  var ctx = creerContexte_(db);

  return ctx.SecteurService.construire('p1', 1, 'installation', 'chantier_naval').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /ne vous appartient pas/i);
  });
});

// ---------------------------------------------------------------
// deployerCube / rappelerCube
// ---------------------------------------------------------------

test('deployerCube : incrémente pn_corvette', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.deployerCube('p1', 1, 'corvette', 3).then(function () {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 5);
  });
});

test('deployerCube : type inconnu -> no-op silencieux (fidèle à la RPC)', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.deployerCube('p1', 1, 'inconnu', 3).then(function () {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 2);
  });
});

test('rappelerCube : stock suffisant -> décrémente', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.rappelerCube('p1', 1, 'corvette').then(function (resultat) {
    assert.strictEqual(resultat.ok, true);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 1);
  });
});

test('rappelerCube : stock à 0 -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 0 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.rappelerCube('p1', 1, 'corvette').then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /aucun corvette/i);
  });
});

// ---------------------------------------------------------------
// retirerCorruption
// ---------------------------------------------------------------

test('retirerCorruption : passe corrompu à false', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ corrompu: true });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.retirerCorruption('p1', 1).then(function () {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].corrompu, false);
  });
});

// 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
// TODO.md) : obtenirSecteursEligiblesRetraitCorruption — seuls les
// secteurs POSSÉDÉS (appartientAuJoueur_) ET Corrompus sont éligibles.
test('obtenirSecteursEligiblesRetraitCorruption : ne retourne que les secteurs possédés ET Corrompus', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  // Secteur 1 : possédé (pnCorvette > 0, pnNeant 0) ET Corrompu -> éligible
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 2, corrompu: true });
  // Secteur 2 : possédé mais PAS Corrompu -> non éligible
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, corrompu: false });
  // Secteur 3 : Corrompu mais du Néant (non possédé) -> non éligible
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 0, pnNeant: 3, corrompu: true });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesRetraitCorruption('p1').then(function (eligibles) {
    assert.strictEqual(eligibles.length, 1);
    assert.strictEqual(eligibles[0].numero, 1);
  });
});

// ---------------------------------------------------------------
// regrouper
// ---------------------------------------------------------------

function dbBaseRegroupement_() {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioAdjacences['s1|1|2'] = { scenarioId: 's1', numeroA: 1, numeroB: 2 };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 3 });
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1 });
  return db;
}

test('regrouper : mouvement valide entre secteurs adjacents et possédés', function () {
  var db = dbBaseRegroupement_();
  var ctx = creerContexte_(db);

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 1, arrivee: 2, quantite: 2 }]).then(function (resultat) {
    assert.strictEqual(resultat.ok, true);
    assert.strictEqual(resultat.deplacements, 2);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 1);
    assert.strictEqual(db._stores.secteursPartie['p1|2'].pnCorvette, 3);
  });
});

test('regrouper : secteurs non adjacents -> rejette', function () {
  var db = dbBaseRegroupement_();
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 1 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 1, arrivee: 3, quantite: 1 }]).then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /pas adjacents/i);
  });
});

test('regrouper : plus de 5 déplacements -> rejette', function () {
  var db = dbBaseRegroupement_();
  var ctx = creerContexte_(db);

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 1, arrivee: 2, quantite: 6 }]).then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /5 maximum/i);
  });
});

test('regrouper : stock insuffisant -> rejette sans rien modifier', function () {
  var db = dbBaseRegroupement_();
  var ctx = creerContexte_(db);

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 1, arrivee: 2, quantite: 5 }]).then(function () {
    assert.fail('aurait dû rejeter (stock insuffisant : 3 dispo, 5 demandés)');
  }, function (erreur) {
    assert.match(erreur.message, /stock insuffisant/i);
    // Rien n'a été modifié malgré le rejet.
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 3);
  });
});

// ---------------------------------------------------------------
// envahirResoudre
// ---------------------------------------------------------------

test('envahirResoudre : défaite -> retire les unités engagées, secteur source vidé repris par le Néant', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'type_a' };
  db._stores.scenarioSecteurs['s1|9'] = { scenarioId: 's1', numero: 9, type: 'type_a' };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 2 });
  db._stores.secteursPartie['p1|9'] = secteurDeBase_({ numero: 9, pnCorvette: 0, pnNeant: 3 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.envahirResoudre('p1', 9, [{ type: 'corvette', secteur: 1, quantite: 2 }], false, {}).then(function (resultat) {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 0);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnNeant, 2, 'secteur source vidé -> repris par le Néant à 2 cubes');
    assert.strictEqual(JSON.stringify(resultat.secteursAbandonnes), JSON.stringify([1]));
    // Pas de victoire -> cible inchangée (toujours au Néant).
    assert.strictEqual(db._stores.secteursPartie['p1|9'].pnNeant, 3);
  });
});

test('envahirResoudre : victoire -> dépose les survivants, retire Installations/jetons de la cible', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'type_a' };
  db._stores.scenarioSecteurs['s1|9'] = { scenarioId: 's1', numero: 9, type: 'type_a' };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 3 });
  db._stores.secteursPartie['p1|9'] = secteurDeBase_({
    numero: 9, pnCorvette: 0, pnNeant: 2, installationChantierNaval: 1, nombreGardien: 1, jetonPrime: 1
  });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.envahirResoudre('p1', 9, [{ type: 'corvette', secteur: 1, quantite: 2 }], true, { corvette: 2 }).then(function (resultat) {
    assert.strictEqual(resultat.jetonPrime, 1, 'jeton retiré renvoyé à l\'appelant');
    var cible = db._stores.secteursPartie['p1|9'];
    assert.strictEqual(cible.pnNeant, 0);
    assert.strictEqual(cible.pnCorvette, 2, 'survivants déposés');
    assert.strictEqual(cible.installationChantierNaval, 0);
    assert.strictEqual(cible.nombreGardien, 0);
    assert.strictEqual(cible.jetonPrime, 0);
  });
});

test('envahirResoudre : Secteur-Mère jamais repris par le Néant même vidé', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'secteur_mere', };
  db._stores.scenarioSecteurs['s1|1'].type = 'type_a';
  db._stores.scenarioSecteurs['s1|1'].type = 'secteur_mere';
  db._stores.scenarioSecteurs['s1|9'] = { scenarioId: 's1', numero: 9, type: 'type_a' };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 2 });
  db._stores.secteursPartie['p1|9'] = secteurDeBase_({ numero: 9, pnCorvette: 0, pnNeant: 3 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.envahirResoudre('p1', 9, [{ type: 'corvette', secteur: 1, quantite: 2 }], false, {}).then(function (resultat) {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnNeant, 0, 'Secteur-Mère jamais repris par le Néant');
    assert.strictEqual(JSON.stringify(resultat.secteursAbandonnes), JSON.stringify([]));
  });
});

// ---------------------------------------------------------------
// obtenirSecteursEligiblesConstruction / getEntretien
// ---------------------------------------------------------------

test('obtenirSecteursEligiblesConstruction : ne retourne que les secteurs possédés avec emplacement libre', function () {
  var db = dbBaseConstruction_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, installationChantierNaval: 0 }); // possédé, libre
  db._stores.scenarioSecteurs['s1|2'] = { scenarioId: 's1', numero: 2, type: 'type_a' };
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, installationChantierNaval: 1 }); // possédé, plein
  db._stores.scenarioSecteurs['s1|3'] = { scenarioId: 's1', numero: 3, type: 'type_a' };
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 0 }); // pas possédé
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesConstruction('p1', 'installation').then(function (resultat) {
    assert.strictEqual(resultat.length, 1);
    assert.strictEqual(resultat[0].numero, 1);
    assert.strictEqual(resultat[0].emplacementsLibres, 1);
  });
});

test('getEntretien : compte 1 par emplacement (Guilde ou Installation) totalement occupé', function () {
  var db = dbBaseConstruction_();
  // Secteur 1 : Installations pleines (max 1, 1 occupé) ET Guildes pleines (max 1, 1 occupé) -> 2.
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, installationChantierNaval: 1, guildeFermiers: 1 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.getEntretien('p1').then(function (total) {
    assert.strictEqual(total, 2);
  });
});

test('getEntretien : aucun secteur plein -> 0', function () {
  var db = dbBaseConstruction_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.getEntretien('p1').then(function (total) {
    assert.strictEqual(total, 0);
  });
});
