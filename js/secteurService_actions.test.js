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
    typesSecteur: {}, scenarioAdjacences: {}, plateauMaison: {}
  };
  function cleDe_(nom, valeur) {
    if (nom === 'parties') return valeur.id;
    if (nom === 'secteursPartie') return valeur.partieId + '|' + valeur.numero;
    if (nom === 'scenarioSecteurs') return valeur.scenarioId + '|' + valeur.numero;
    if (nom === 'typesSecteur') return valeur.id;
    if (nom === 'scenarioAdjacences') return valeur.scenarioId + '|' + valeur.numeroA + '|' + valeur.numeroB;
    if (nom === 'plateauMaison') return valeur.partieId;
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
  // determinerCibleEscarmouche (chantier "Escarmouche + Plateau Crise")
  // référence le global CombatService — chargé AVANT secteurService.js
  // ici pour que ce global existe déjà au moment où le second fichier est
  // évalué (ordre inversé de index.html, sans consequence : aucun des 2
  // fichiers n'y référence l'autre à l'exécution DE SON PROPRE IIFE, seule
  // resoudreCle_/determinerCibleEscarmouche y accèdent, bien plus tard,
  // au moment d'un appel réel).
  chargerDansContexte_(__dirname + '/combatService.js', ctx);
  chargerDansContexte_(__dirname + '/secteurService.js', ctx);
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

test('rappelerCube : plateauMaison existant -> recrédite cubeActif (EVOLUTION 33)', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 2 });
  db._stores.plateauMaison['p1'] = { partieId: 'p1', cubeActif: 3 };
  var ctx = creerContexte_(db);

  return ctx.SecteurService.rappelerCube('p1', 1, 'corvette').then(function (resultat) {
    assert.strictEqual(resultat.ok, true);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 1);
    assert.strictEqual(db._stores.plateauMaison['p1'].cubeActif, 4);
  });
});

test('rappelerCube : aucun plateauMaison -> réussit quand même (pas de crédit)', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.rappelerCube('p1', 1, 'corvette').then(function (resultat) {
    assert.strictEqual(resultat.ok, true);
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

// obtenirSecteursEligiblesRetraitCorruption — seuls les secteurs
// POSSÉDÉS (appartientAuJoueur_) ET Corrompus sont éligibles.
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
// retirerGardien / obtenirSecteursEligiblesRetraitGardien — chantier
// "Refuges" (§3), miroir de retirerCorruption/
// obtenirSecteursEligiblesRetraitCorruption ci-dessus.
// ---------------------------------------------------------------

test('retirerGardien : décrémente nombreGardien de 1', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ nombreGardien: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.retirerGardien('p1', 1).then(function () {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].nombreGardien, 1);
  });
});

test('retirerGardien : aucun Gardien à retirer -> rejette', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ nombreGardien: 0 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.retirerGardien('p1', 1).then(
    function () { assert.fail('aurait dû rejeter'); },
    function (erreur) { assert.ok(erreur.message.indexOf('Aucun Gardien') !== -1); }
  );
});

test('obtenirSecteursEligiblesRetraitGardien : ne retourne que les secteurs possédés avec au moins 1 Gardien', function () {
  var db = creerDbFactice_();
  // Secteur 1 : possédé ET porte un Gardien -> éligible
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 2, nombreGardien: 1 });
  // Secteur 2 : possédé mais aucun Gardien -> non éligible
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, nombreGardien: 0 });
  // Secteur 3 : porte un Gardien mais du Néant (non possédé) -> non éligible
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 0, pnNeant: 3, nombreGardien: 1 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesRetraitGardien('p1').then(function (eligibles) {
    assert.strictEqual(eligibles.length, 1);
    assert.strictEqual(eligibles[0].numero, 1);
  });
});

// ---------------------------------------------------------------
// placerCorruption / obtenirSecteursEligiblesGainCorruption
// ---------------------------------------------------------------

test('placerCorruption : passe corrompu à true', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ corrompu: false });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.placerCorruption('p1', 1).then(function () {
    assert.strictEqual(db._stores.secteursPartie['p1|1'].corrompu, true);
  });
});

// ---------------------------------------------------------------
// majSecteur — correction manuelle libre (retour utilisateur 13-13/09/2026,
// panneau détail de l'onglet Galaxie) : liste blanche des 5 champs
// autorisés, AUCUNE validation de règle (même permissivité que
// placerCorruption/retirerCorruption ci-dessus).
// ---------------------------------------------------------------

test('majSecteur : écrit les 5 champs autorisés en une seule fois', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ population: 2, corrompu: false, pnNeant: 0, jetonPrime: 0, jetonLiberation: 0 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.majSecteur('p1', 1, {
    population: 5, corrompu: true, pnNeant: 3, jetonPrime: 2, jetonLiberation: 1
  }).then(function () {
    var secteur = db._stores.secteursPartie['p1|1'];
    assert.strictEqual(secteur.population, 5);
    assert.strictEqual(secteur.corrompu, true);
    assert.strictEqual(secteur.pnNeant, 3);
    assert.strictEqual(secteur.jetonPrime, 2);
    assert.strictEqual(secteur.jetonLiberation, 1);
  });
});

test('majSecteur : ignore tout champ hors liste blanche (ex. pnCorvette, guildeFermiers)', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ pnCorvette: 1, guildeFermiers: 0 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.majSecteur('p1', 1, { pnCorvette: 99, guildeFermiers: 99, jetonPrime: 4 }).then(function () {
    var secteur = db._stores.secteursPartie['p1|1'];
    assert.strictEqual(secteur.pnCorvette, 1, 'pnCorvette hors liste blanche -> inchangé');
    assert.strictEqual(secteur.guildeFermiers, 0, 'guildeFermiers hors liste blanche -> inchangé');
    assert.strictEqual(secteur.jetonPrime, 4, 'jetonPrime whitelisté -> appliqué');
  });
});

test('majSecteur : aucun champ valide -> rejette sans toucher la base', function () {
  var db = creerDbFactice_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ jetonPrime: 1 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.majSecteur('p1', 1, { pnCorvette: 5 }).then(function () {
    assert.fail('aurait dû rejeter (aucun champ de la liste blanche)');
  }, function (erreur) {
    assert.match(erreur.message, /aucun champ valide/i);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].jetonPrime, 1);
  });
});

test('majSecteur : secteur introuvable -> rejette', function () {
  var db = creerDbFactice_();
  var ctx = creerContexte_(db);

  return ctx.SecteurService.majSecteur('p1', 99, { jetonPrime: 1 }).then(function () {
    assert.fail('aurait dû rejeter');
  }, function (erreur) {
    assert.match(erreur.message, /introuvable/i);
  });
});

// Miroir INVERSÉ d'obtenirSecteursEligiblesRetraitCorruption — secteurs
// POSSÉDÉS ET PAS Corrompus, à l'exclusion du Secteur-Mère (immunisé à
// la Corruption, voir docs-rules-corruption-gardiens-refuges-
// technoConsume.md §1 : "sauf un secteur immunisé... comme un
// Secteur-Mère standard") — seule différence structurelle avec le
// retrait, qui n'a pas besoin de cette exclusion (un Secteur-Mère ne peut
// de toute façon jamais être Corrompu).
test('obtenirSecteursEligiblesGainCorruption : ne retourne que les secteurs possédés, PAS Corrompus, hors Secteur-Mère', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioSecteurs['s1|4'] = { scenarioId: 's1', numero: 4, type: 'secteur_mere' };
  // Secteur 1 : possédé (pnCorvette > 0, pnNeant 0) ET PAS Corrompu -> éligible
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 2, corrompu: false });
  // Secteur 2 : possédé mais DÉJÀ Corrompu -> non éligible
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, corrompu: true });
  // Secteur 3 : non Corrompu mais du Néant (non possédé) -> non éligible
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 0, pnNeant: 3, corrompu: false });
  // Secteur 4 : possédé, PAS Corrompu, mais Secteur-Mère -> non éligible (immunisé)
  db._stores.secteursPartie['p1|4'] = secteurDeBase_({ numero: 4, pnCorvette: 3, corrompu: false });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesGainCorruption('p1').then(function (eligibles) {
    assert.strictEqual(eligibles.length, 1);
    assert.strictEqual(eligibles[0].numero, 1);
  });
});

// ---------------------------------------------------------------
// obtenirAgregatsInfluenceSecteursPurs
// ---------------------------------------------------------------

// Agrégats calculés UNIQUEMENT sur les secteurs "Purs" (possédés ET pas
// Corrompus) — utilisés par le gain d'Influence variable "N par
// Guilde/Installation/cube/secteur Pur" (voir focusEngine.js). Un
// secteur Corrompu ou du Néant (non possédé) ne doit compter dans AUCUN
// agrégat, même s'il porte des Guildes/Installations/cubes.
test('obtenirAgregatsInfluenceSecteursPurs : agrège Guildes/Installations/cubes/secteurs sur les secteurs Purs uniquement', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  // Secteur 1 : Pur, avec Guildes (2 Fermiers, 1 Scientifique), 1 Installation, population 6.
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({
    numero: 1, pnCorvette: 2, corrompu: false, population: 6,
    guildeFermiers: 2, guildeScientifiques: 1, installationDefenseSecteur: 1
  });
  // Secteur 2 : Pur, sans Guilde, population 3 (pas 6).
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 3, corrompu: false, population: 3 });
  // Secteur 3 : possédé mais Corrompu -> ignoré malgré ses Guildes/cubes.
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 5, corrompu: true, guildeBanquiers: 3 });
  // Secteur 4 : du Néant (non possédé) -> ignoré.
  db._stores.secteursPartie['p1|4'] = secteurDeBase_({ numero: 4, pnCorvette: 0, pnNeant: 4, corrompu: false, guildeMineurs: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirAgregatsInfluenceSecteursPurs('p1').then(function (agregats) {
    assert.strictEqual(agregats.nombreSecteurPur, 2); // secteurs 1 et 2
    assert.strictEqual(agregats.nombreSecteurPurAvecGuilde, 1); // secteur 1 seulement
    assert.strictEqual(agregats.nombreSecteurPurPopulation6, 1); // secteur 1 seulement
    assert.strictEqual(agregats.guildesPures.fermiers, 2);
    assert.strictEqual(agregats.guildesPures.scientifiques, 1);
    assert.strictEqual(agregats.guildesPures.banquiers, 0); // secteur 3 (Corrompu) exclu
    assert.strictEqual(agregats.guildesPures.total, 3);
    assert.strictEqual(agregats.installationsPuresTotal, 1);
    assert.strictEqual(agregats.cubesSecteurPurTotal, 5); // 2 (secteur 1) + 3 (secteur 2)

    // Chantier "Objectifs galactiques" (13/09/2026) — champs étendus.
    assert.strictEqual(agregats.populationPureTotale, 9); // 6 (secteur 1) + 3 (secteur 2)
    assert.strictEqual(agregats.defenseOuBaseStellairePureTotal, 1); // secteur 1 seulement
    assert.strictEqual(agregats.guildeBanquierPureTotal, 0);
    assert.strictEqual(agregats.guildeScientifiquePureTotal, 1);
    assert.strictEqual(JSON.stringify(agregats.secteursPurs), JSON.stringify([
      { population: 6, guildeBanquiers: 0, guildeFermiers: 2, guildeIngenieurs: 0, guildeMineurs: 0, guildeScientifiques: 1, guildesTotal: 3, cubes: 2 },
      { population: 3, guildeBanquiers: 0, guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeScientifiques: 0, guildesTotal: 0, cubes: 3 }
    ]));
    // secteursPossedes : Purs ET Corrompus (secteurs 1/2/3), le secteur 4
    // (du Néant, non possédé) reste exclu.
    var numerosPossedes = agregats.secteursPossedes.map(function (s) { return s.cubes; }).sort(function (a, b) { return a - b; });
    assert.strictEqual(agregats.secteursPossedes.length, 3);
    assert.strictEqual(JSON.stringify(numerosPossedes), JSON.stringify([2, 3, 5]));
    assert.strictEqual(agregats.secteursPossedes.filter(function (s) { return s.corrompu; }).length, 1);
    // Aucune scenarioSecteurs/typesSecteur configurée dans ce fixture ->
    // type introuvable pour chaque secteur -> entretien 0 partout,
    // emplacementsGuildeVidesTotal 0 (voir test dédié ci-dessous pour le
    // cas où le type EST configuré).
    assert.ok(agregats.secteursPossedes.every(function (s) { return s.entretien === 0; }));
    assert.strictEqual(agregats.emplacementsGuildeVidesTotal, 0);
  });
});

// Chantier "Objectifs galactiques", lignes hors périmètre restantes
// (13/09/2026) : secteur_pur_ou_corrompu_entretien_min_2 (Entretien PAR
// secteur, Purs ET Corrompus), secteurs_avec_guildes_specifiques_min
// (Guildes Fermiers/Ingénieurs/Mineurs, Purs ET Corrompus) et
// emplacements_guilde_vides_max (total, tous secteurs possédés) ont
// besoin de typesSecteur/scenarioSecteurs — non couvert par le test
// ci-dessus (fixture sans type de secteur).
test('obtenirAgregatsInfluenceSecteursPurs : entretien par secteur + guildes Fermiers/Ingénieurs/Mineurs + emplacements de Guilde vides (Purs ET Corrompus)', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.typesSecteur['standard'] = { id: 'standard', nombreGuildeMax: 3, nombreInstallationMax: 3 };
  // Secteur 1 : Pur, 3 Guildes (plein -> Entretien Guilde 1), 1 Installation (pas plein -> 0), 0 emplacement Guilde vide.
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'standard' };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({
    numero: 1, pnCorvette: 1, corrompu: false,
    guildeFermiers: 2, guildeIngenieurs: 1, installationDefenseSecteur: 1
  });
  // Secteur 2 : Corrompu (mais possédé), 1 seule Guilde Mineurs -> Entretien 0, 2 emplacements Guilde vides.
  db._stores.scenarioSecteurs['s1|2'] = { scenarioId: 's1', numero: 2, type: 'standard' };
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, corrompu: true, guildeMineurs: 1 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirAgregatsInfluenceSecteursPurs('p1').then(function (agregats) {
    var s1 = agregats.secteursPossedes.filter(function (s) { return !s.corrompu; })[0];
    var s2 = agregats.secteursPossedes.filter(function (s) { return s.corrompu; })[0];
    assert.strictEqual(s1.entretien, 1); // 3 Guildes / 3 max -> plein ; 1 Installation / 3 max -> pas plein
    assert.strictEqual(s1.guildeFermiers, 2);
    assert.strictEqual(s1.guildeIngenieurs, 1);
    assert.strictEqual(s1.guildeMineurs, 0);
    assert.strictEqual(s2.entretien, 0);
    assert.strictEqual(s2.guildeMineurs, 1);
    // emplacements vides : secteur 1 (3 max - 3 utilisées = 0) + secteur 2 (3 max - 1 utilisée = 2) = 2.
    assert.strictEqual(agregats.emplacementsGuildeVidesTotal, 2);
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

// EVOLUTION 15 (todo.md) : le Secteur-Mère vous appartient TOUJOURS, même
// à 0 Puissance Navale (jamais repris par le Néant) — reste une
// destination valide même vide.
test('regrouper : le Secteur-Mère est une destination valide même à 0 Puissance Navale', function () {
  var db = dbBaseRegroupement_();
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'secteur_mere' };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 0 }); // Secteur-Mère, vide
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 3 }); // laisse 2 derrière (pas de Secteur-Mère)
  var ctx = creerContexte_(db);

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 2, arrivee: 1, quantite: 1 }]).then(function (resultat) {
    assert.strictEqual(resultat.ok, true);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 1);
    assert.strictEqual(db._stores.secteursPartie['p1|2'].pnCorvette, 2);
  });
});

// EVOLUTION 15 : interdit de retirer la DERNIÈRE Puissance Navale d'un
// secteur de départ qui N'EST PAS le Secteur-Mère (docs-rules-flottes.md
// §1.5 : "vous ne pouvez pas déplacer le dernier cube d'un secteur si cela
// conduit à son abandon, sauf Secteur-Mère").
test('regrouper : interdit de vider un secteur hors Secteur-Mère (dernière Puissance Navale)', function () {
  var db = dbBaseRegroupement_(); // secteur 1 : pnCorvette 3, PAS Secteur-Mère (aucune scenarioSecteurs configurée)
  var ctx = creerContexte_(db);

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 1, arrivee: 2, quantite: 3 }]).then(function () {
    assert.fail('aurait dû rejeter (secteur 1 se retrouverait sans Puissance Navale)');
  }, function (erreur) {
    assert.match(erreur.message, /sans puissance navale/i);
    // Rien n'a été modifié malgré le rejet.
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 3);
    assert.strictEqual(db._stores.secteursPartie['p1|2'].pnCorvette, 1);
  });
});

// EVOLUTION 15 : à l'inverse, le Secteur-Mère PEUT être entièrement vidé
// (aucune règle du "dernier cube" ne s'applique à lui).
test('regrouper : le Secteur-Mère peut être entièrement vidé', function () {
  var db = dbBaseRegroupement_();
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'secteur_mere' };
  var ctx = creerContexte_(db); // secteur 1 (Secteur-Mère) : pnCorvette 3

  return ctx.SecteurService.regrouper('p1', [{ type: 'corvette', depart: 1, arrivee: 2, quantite: 3 }]).then(function (resultat) {
    assert.strictEqual(resultat.ok, true);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 0);
    assert.strictEqual(db._stores.secteursPartie['p1|2'].pnCorvette, 4);
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

// Chantier "effets permanents" des Technologies — Réplicateurs de combat
// (Novaris) : `garderInstallations` (posé par strategieService.js, via
// confirmerReplicateursDeCombat_) préserve les Installations au lieu de
// les remettre à zéro ; le reste (Gardien/jetons Prime-Libération-Gloire)
// est retiré comme d'habitude, le texte de la carte ne concernant QUE
// les Installations.
test('envahirResoudre : garderInstallations=true préserve les Installations, retire le reste comme d\'habitude', function () {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'type_a' };
  db._stores.scenarioSecteurs['s1|9'] = { scenarioId: 's1', numero: 9, type: 'type_a' };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 3 });
  db._stores.secteursPartie['p1|9'] = secteurDeBase_({
    numero: 9, pnCorvette: 0, pnNeant: 2, installationChantierNaval: 1, installationDefenseSecteur: 1,
    installationBaseStellaire: 1, nombreGardien: 1, jetonPrime: 1
  });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.envahirResoudre('p1', 9, [{ type: 'corvette', secteur: 1, quantite: 2 }], true, { corvette: 2 }, true).then(function (resultat) {
    assert.strictEqual(resultat.jetonPrime, 1, 'jeton retiré renvoyé à l\'appelant, comme sans garderInstallations');
    var cible = db._stores.secteursPartie['p1|9'];
    assert.strictEqual(cible.pnCorvette, 2, 'survivants déposés, inchangé');
    assert.strictEqual(cible.installationChantierNaval, 1, 'Installation préservée');
    assert.strictEqual(cible.installationDefenseSecteur, 1, 'Installation préservée');
    assert.strictEqual(cible.installationBaseStellaire, 1, 'Installation préservée');
    assert.strictEqual(cible.nombreGardien, 0, 'Gardien retiré comme d\'habitude (pas une Installation)');
    assert.strictEqual(cible.jetonPrime, 0, 'jeton Prime retiré du secteur comme d\'habitude');
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

// ---------------------------------------------------------------
// obtenirSecteursEligiblesPlacementEnMasse / placerElementsEnMasse —
// chantier "Cadres placement en masse" (14/09/2026, §1.5 docs-rules-
// cycle-de-jeu.md) : cadres "placement" à zone GALAXIE ENTIÈRE (ex.
// "chaque secteur de Faille"), jamais possession/adjacence au joueur.
// ---------------------------------------------------------------

function dbBaseMasse_() {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  return db;
}

test('obtenirSecteursEligiblesPlacementEnMasse : zone inconnue -> []', function () {
  var db = dbBaseMasse_();
  var ctx = creerContexte_(db);
  return ctx.SecteurService.obtenirSecteursEligiblesPlacementEnMasse('p1', 'zone_jamais_vue').then(function (numeros) {
    assert.strictEqual(numeros.length, 0);
  });
});

test('obtenirSecteursEligiblesPlacementEnMasse : chaque_faille -> secteurs de type "faille", pnNeant indifférent', function () {
  var db = dbBaseMasse_();
  db._stores.scenarioSecteurs['s1|40'] = { scenarioId: 's1', numero: 40, type: 'faille', sousType: null };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'standard', sousType: null };
  db._stores.secteursPartie['p1|40'] = secteurDeBase_({ numero: 40, pnCorvette: 0, pnNeant: 0 }); // Faille SANS pnNeant -> reste éligible
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1 }); // standard -> non éligible
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesPlacementEnMasse('p1', 'chaque_faille').then(function (numeros) {
    assert.strictEqual(JSON.stringify(numeros), JSON.stringify([40]));
  });
});

test('obtenirSecteursEligiblesPlacementEnMasse : chaque_secteur_neant_population_min_4 -> pnNeant>0 ET population>=4', function () {
  var db = dbBaseMasse_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 0, pnNeant: 2, population: 4 }); // éligible
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 0, pnNeant: 2, population: 3 }); // population insuffisante
  db._stores.secteursPartie['p1|3'] = secteurDeBase_({ numero: 3, pnCorvette: 0, pnNeant: 0, population: 6 }); // pas un secteur du Néant (pnNeant=0)
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesPlacementEnMasse('p1', 'chaque_secteur_neant_population_min_4').then(function (numeros) {
    assert.strictEqual(JSON.stringify(numeros), JSON.stringify([1]));
  });
});

test('obtenirSecteursEligiblesPlacementEnMasse : chaque_secteur_neant_adjacent_a_une_faille', function () {
  var db = dbBaseMasse_();
  db._stores.scenarioSecteurs['s1|40'] = { scenarioId: 's1', numero: 40, type: 'faille', sousType: null };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'standard', sousType: null };
  db._stores.scenarioSecteurs['s1|2'] = { scenarioId: 's1', numero: 2, type: 'standard', sousType: null };
  db._stores.scenarioAdjacences['s1|1|40'] = { scenarioId: 's1', numeroA: 1, numeroB: 40 };
  // Secteur 1 : secteur du Néant, adjacent à la Faille (40) -> éligible.
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 0, pnNeant: 1 });
  // Secteur 2 : secteur du Néant mais PAS adjacent à une Faille -> non éligible.
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 0, pnNeant: 1 });
  db._stores.secteursPartie['p1|40'] = secteurDeBase_({ numero: 40, pnCorvette: 0, pnNeant: 3 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.obtenirSecteursEligiblesPlacementEnMasse('p1', 'chaque_secteur_neant_adjacent_a_une_faille').then(function (numeros) {
    assert.strictEqual(JSON.stringify(numeros), JSON.stringify([1]));
  });
});

test('placerElementsEnMasse : incrémente les éléments (dont "gardien") sur chaque secteur éligible, aucun autre', function () {
  var db = dbBaseMasse_();
  db._stores.scenarioSecteurs['s1|40'] = { scenarioId: 's1', numero: 40, type: 'faille', sousType: null };
  db._stores.scenarioSecteurs['s1|1'] = { scenarioId: 's1', numero: 1, type: 'standard', sousType: null };
  db._stores.secteursPartie['p1|40'] = secteurDeBase_({ numero: 40, pnCorvette: 0, pnNeant: 3, nombreGardien: 0 });
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, nombreGardien: 0 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.placerElementsEnMasse('p1', 'chaque_faille', { gardien: 1 }).then(function (numeros) {
    assert.strictEqual(JSON.stringify(numeros), JSON.stringify([40]));
    assert.strictEqual(db._stores.secteursPartie['p1|40'].nombreGardien, 1);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].nombreGardien, 0, 'le secteur non éligible ne doit jamais être touché');
  });
});

test('placerElementsEnMasse : aucun secteur éligible -> [], aucune écriture', function () {
  var db = dbBaseMasse_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 0, pnNeant: 0, installationDefenseSecteur: 5 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.placerElementsEnMasse('p1', 'chaque_secteur_neant_avec_defense_secteur_min_1', { prime: 1 }).then(function (numeros) {
    assert.strictEqual(numeros.length, 0);
    assert.strictEqual(db._stores.secteursPartie['p1|1'].jetonPrime, 0);
  });
});

// ---------------------------------------------------------------
// determinerCibleEscarmouche / appliquerResultatEscarmouche
// (chantier "Escarmouche + Plateau Crise", 14/09/2026)
// ---------------------------------------------------------------

function dbBaseEscarmouche_() {
  var db = creerDbFactice_();
  db._stores.parties['p1'] = { id: 'p1', scenarioId: 's1' };
  db._stores.plateauMaison['p1'] = { partieId: 'p1', technologiesObtenues: [null, null, null, null, null] };
  return db;
}

test('determinerCibleEscarmouche : éligibilité — possédé + adjacent à un secteur du Néant, JAMAIS le Secteur-Mère', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioSecteurs['s1|99'] = { scenarioId: 's1', numero: 99, type: 'secteur_mere', sousType: null };
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|99|10'] = { scenarioId: 's1', numeroA: 99, numeroB: 10 };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 1 }); // possédé, adjacent au Néant -> éligible
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1 }); // possédé, PAS adjacent -> non éligible
  db._stores.secteursPartie['p1|99'] = secteurDeBase_({ numero: 99, pnCorvette: 5 }); // Secteur-Mère, adjacent -> jamais ciblé
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 }); // secteur du Néant
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 3).then(function (cible) {
    assert.strictEqual(cible.numero, 1);
  });
});

test('determinerCibleEscarmouche : aucun secteur éligible -> null', function () {
  var db = dbBaseEscarmouche_();
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1 }); // possédé mais pas adjacent au Néant
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 3).then(function (cible) {
    assert.strictEqual(cible, null);
  });
});

test('determinerCibleEscarmouche : préfère un secteur où le Néant gagne ou égalise (jamais un où le joueur gagne, si un autre choix existe)', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|2|10'] = { scenarioId: 's1', numeroA: 2, numeroB: 10 };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 10 }); // le joueur gagnerait largement
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1 }); // possédé (>=1 PN), mais le joueur perd face à la puissance 3
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 3).then(function (cible) {
    assert.strictEqual(cible.numero, 2);
    assert.strictEqual(cible.resultatCombat.victoireJoueur, false);
  });
});

test('determinerCibleEscarmouche : le joueur gagne partout -> retombe sur tous les candidats, puis préfère celui qui rappelle le plus de PN', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|2|10'] = { scenarioId: 's1', numeroA: 2, numeroB: 10 };
  // Les 2 secteurs font gagner le joueur (vérifié par exécution réelle,
  // voir combatService.js) : secteur 1 (3 Corvette + Défense de Secteur 2)
  // ne perd AUCUN cube (victoire "propre", pnRappele=0) ; secteur 2 (10
  // Corvette, aucune Défense) en perd 2 (pnRappele=2, combat plus long).
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 3, installationDefenseSecteur: 2 });
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 10 });
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 3).then(function (cible) {
    assert.strictEqual(cible.numero, 2);
    assert.strictEqual(cible.resultatCombat.victoireJoueur, true);
  });
});

test('determinerCibleEscarmouche : ex-aequo (victoire/égalité + PN rappelé) -> préfère un secteur Pur', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|2|10'] = { scenarioId: 's1', numeroA: 2, numeroB: 10 };
  // Les 2 secteurs sont IDENTIQUES au combat (1 Corvette chacun — le
  // minimum pour rester "possédé", appartientAuJoueur_ exige totalPn>0 —
  // écrasée par une puissance du Néant à 5, défaite totale des deux
  // côtés, pnRappele=1 des deux côtés) — seul `corrompu` diffère.
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 1, corrompu: true });
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, corrompu: false });
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 5).then(function (cible) {
    assert.strictEqual(cible.numero, 2, 'le secteur Pur (numéro 2) doit être préféré au Corrompu');
  });
});

test('determinerCibleEscarmouche : ex-aequo (Pur/Corrompu identiques) -> préfère la Population la plus élevée', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|2|10'] = { scenarioId: 's1', numeroA: 2, numeroB: 10 };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 1, population: 3 });
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, population: 6 });
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 5).then(function (cible) {
    assert.strictEqual(cible.numero, 2, 'la Population la plus élevée (6) doit être préférée');
  });
});

test('determinerCibleEscarmouche : ex-aequo (même Population) -> préfère le plus de Guildes', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|2|10'] = { scenarioId: 's1', numeroA: 2, numeroB: 10 };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 1, population: 4, guildeFermiers: 1 });
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, population: 4, guildeFermiers: 1, guildeMineurs: 1 });
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 5).then(function (cible) {
    assert.strictEqual(cible.numero, 2, 'le secteur avec 2 Guildes doit être préféré à celui avec 1 seule');
  });
});

test('determinerCibleEscarmouche : ex-aequo total -> choisit aléatoirement parmi les candidats restants', function () {
  var db = dbBaseEscarmouche_();
  db._stores.scenarioAdjacences['s1|1|10'] = { scenarioId: 's1', numeroA: 1, numeroB: 10 };
  db._stores.scenarioAdjacences['s1|2|10'] = { scenarioId: 's1', numeroA: 2, numeroB: 10 };
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 1, population: 4 });
  db._stores.secteursPartie['p1|2'] = secteurDeBase_({ numero: 2, pnCorvette: 1, population: 4 });
  db._stores.secteursPartie['p1|10'] = secteurDeBase_({ numero: 10, pnCorvette: 0, pnNeant: 2 });
  var ctx = creerContexte_(db);

  return ctx.SecteurService.determinerCibleEscarmouche('p1', 5).then(function (cible) {
    assert.ok(cible.numero === 1 || cible.numero === 2);
  });
});

test('appliquerResultatEscarmouche : victoire du joueur -> écrit uniquement les survivants', function () {
  var db = dbBaseEscarmouche_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({ numero: 1, pnCorvette: 3, installationDefenseSecteur: 1 });
  var ctx = creerContexte_(db);
  var resultatCombat = { victoireJoueur: true, survivantsJoueur: { corvette: 2, destroyer: 1, cuirasse: 0, sentinelle: 0, portevaisseau: 0 } };

  return ctx.SecteurService.appliquerResultatEscarmouche('p1', 1, resultatCombat).then(function (secteur) {
    assert.strictEqual(secteur.pnCorvette, 2);
    assert.strictEqual(secteur.pnDestroyer, 1);
    assert.strictEqual(secteur.installationDefenseSecteur, 1, 'les Installations ne sont jamais touchées en cas de victoire');
    assert.strictEqual(db._stores.secteursPartie['p1|1'].pnCorvette, 2);
  });
});

test('appliquerResultatEscarmouche : défaite -> abandon complet du secteur (docs-rules-flottes.md §4.1-4.4)', function () {
  var db = dbBaseEscarmouche_();
  db._stores.secteursPartie['p1|1'] = secteurDeBase_({
    numero: 1, pnCorvette: 3, installationDefenseSecteur: 1, installationChantierNaval: 1,
    installationBaseStellaire: 1, guildeFermiers: 2, jetonPrime: 0, corrompu: false
  });
  var ctx = creerContexte_(db);
  var resultatCombat = { victoireJoueur: false, survivantsJoueur: { corvette: 0, destroyer: 0, cuirasse: 0, sentinelle: 0, portevaisseau: 0 } };

  return ctx.SecteurService.appliquerResultatEscarmouche('p1', 1, resultatCombat).then(function (secteur) {
    assert.strictEqual(secteur.pnCorvette, 0);
    assert.strictEqual(secteur.installationChantierNaval, 0);
    assert.strictEqual(secteur.installationDefenseSecteur, 0);
    assert.strictEqual(secteur.installationBaseStellaire, 0);
    assert.strictEqual(secteur.guildeFermiers, 2, 'les Guildes ne sont JAMAIS retirées (§4.1 — "mais pas les Guildes")');
    assert.strictEqual(secteur.corrompu, true);
    assert.strictEqual(secteur.pnNeant, 2);
    assert.strictEqual(secteur.jetonPrime, 1);
  });
});
