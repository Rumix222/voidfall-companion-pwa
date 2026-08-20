// Test fumée node --test pour SecteurService.obtenirSecteursEligiblesPlacementNeantAdjacent/
// placerElementsNeantAdjacent (généralisation Cadre 1) — mock DB minimal en mémoire,
// pas de dépendance npm (vm + fixtures), conforme au principe déjà retenu pour les futurs
// tests e2e (docs-migration-pwa-plan.md).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerDB(fixtures) {
  var secteursPartie = {};
  fixtures.secteursPartie.forEach(function (s) {
    var ligne = Object.assign({ partieId: PARTIE_ID }, s);
    secteursPartie[s.numero] = ligne;
  });
  return {
    get: function (table, cle) {
      if (table === 'parties') return Promise.resolve(fixtures.parties[cle]);
      if (table === 'secteursPartie') return Promise.resolve(secteursPartie[cle[1]]);
      return Promise.resolve(null);
    },
    getAll: function (table) {
      if (table === 'scenarioSecteurs') return Promise.resolve(fixtures.scenarioSecteurs);
      if (table === 'typesSecteur') return Promise.resolve(fixtures.typesSecteur);
      if (table === 'secteursPartie') return Promise.resolve(Object.keys(secteursPartie).map(function (k) { return secteursPartie[k]; }));
      if (table === 'scenarioAdjacences') return Promise.resolve(fixtures.adjacences || []);
      return Promise.resolve([]);
    },
    put: function (table, ligne) {
      if (table === 'secteursPartie') secteursPartie[ligne.numero] = ligne;
      return Promise.resolve(ligne);
    },
    _lire: function (numero) { return secteursPartie[numero]; }
  };
}

function chargerSecteurService(db) {
  var code = fs.readFileSync(__dirname + '/secteurService.js', 'utf8');
  var sandbox = { DB: db, console: console, module: {}, Promise: Promise, Object: Object, Number: Number, Date: Date, Error: Error };
  vm.createContext(sandbox);
  // obtenirSecteurs/obtenirAdjacences dépendent d'autres tables (adjacences) —
  // on complète le mock via DB.getAll('adjacences') et obtenirSecteurs via secteursPartie
  // en interceptant les appels nécessaires (voir obtenirSecteurs/obtenirAdjacences ci-dessous).
  vm.runInContext(code, sandbox, { filename: 'secteurService.js' });
  return sandbox.SecteurService;
}

test('placement générique — Cadre 1 style Événement A (installation + guilde)', function () {
  var fixtures = {
    parties: {}, scenarioSecteurs: [], typesSecteur: [], secteursPartie: []
  };
  fixtures.parties[PARTIE_ID] = { scenarioId: 'scn1' };
  fixtures.typesSecteur = [{ id: 't1', nombreInstallationMax: 1, nombreGuildeMax: 1 }];
  fixtures.scenarioSecteurs = [
    { scenarioId: 'scn1', numero: 1, type: 't1' },
    { scenarioId: 'scn1', numero: 2, type: 't1' }
  ];
  fixtures.secteursPartie = [
    { numero: 1, pnNeant: 0, installationDefenseSecteur: 0, installationChantierNaval: 0, installationBaseStellaire: 0,
      guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      pnCorvette: 1, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0 },
    { numero: 2, pnNeant: 1, installationDefenseSecteur: 0, installationChantierNaval: 0, installationBaseStellaire: 0,
      guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      pnCorvette: 0, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0 }
  ];

  var db = creerDB(Object.assign({ adjacences: [{ scenarioId: 'scn1', numeroA: 1, numeroB: 2 }] }, fixtures));
  var SecteurService = chargerSecteurService(db);

  return SecteurService.obtenirSecteursEligiblesPlacementNeantAdjacent(PARTIE_ID, { defense_secteur: 1, guilde_scientifique: 1 })
    .then(function (eligibles) {
      assert.strictEqual(eligibles.length, 1, 'seul le secteur 2 (Néant, adjacent au joueur) doit être éligible');
      assert.strictEqual(eligibles[0].numero, 2);
      assert.strictEqual(eligibles[0].dernierEmplacement, true, 'installation ET guilde à 1 seul emplacement chacune => dernier');
      return SecteurService.placerElementsNeantAdjacent(PARTIE_ID, 2, { defense_secteur: 1, guilde_scientifique: 1 });
    })
    .then(function (secteur) {
      assert.strictEqual(secteur.installationDefenseSecteur, 1);
      assert.strictEqual(secteur.guildeScientifiques, 1);
    });
});

test('placement générique — Cadre 1 style Événement B (jeton + installation, guilde non concernée)', function () {
  var fixtures = { parties: {}, scenarioSecteurs: [], typesSecteur: [], secteursPartie: [] };
  fixtures.parties[PARTIE_ID] = { scenarioId: 'scn1' };
  fixtures.typesSecteur = [{ id: 't1', nombreInstallationMax: 2, nombreGuildeMax: 2 }];
  fixtures.scenarioSecteurs = [
    { scenarioId: 'scn1', numero: 1, type: 't1' },
    { scenarioId: 'scn1', numero: 2, type: 't1' }
  ];
  fixtures.secteursPartie = [
    { numero: 1, pnNeant: 0, installationDefenseSecteur: 0, installationChantierNaval: 0, installationBaseStellaire: 0,
      guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      pnCorvette: 1, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0, jetonLiberation: 0 },
    // secteur 2 : guilde déjà à son dernier emplacement (1/2 utilisés), installation libre (0/1)
    { numero: 2, pnNeant: 1, installationDefenseSecteur: 0, installationChantierNaval: 0, installationBaseStellaire: 0,
      guildeFermiers: 1, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      pnCorvette: 0, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0, jetonLiberation: 0 }
  ];

  var db = creerDB(Object.assign({ adjacences: [{ scenarioId: 'scn1', numeroA: 1, numeroB: 2 }] }, fixtures));
  var SecteurService = chargerSecteurService(db);

  // Cadre "Événement B, Cycle 1, Cadre 1" : liberation (jeton, pas d'emplacement) +
  // defense_secteur (installation). La Guilde étant à son dernier emplacement libre,
  // mais N'ÉTANT PAS demandée par ce cadre, dernierEmplacement doit rester false.
  return SecteurService.obtenirSecteursEligiblesPlacementNeantAdjacent(PARTIE_ID, { liberation: 1, defense_secteur: 1 })
    .then(function (eligibles) {
      assert.strictEqual(eligibles.length, 1);
      assert.strictEqual(eligibles[0].numero, 2);
      assert.strictEqual(eligibles[0].dernierEmplacement, false,
        'la Guilde est à son dernier emplacement mais ce cadre ne pose pas de Guilde => pas d\'alerte');
      return SecteurService.placerElementsNeantAdjacent(PARTIE_ID, 2, { liberation: 1, defense_secteur: 1 });
    })
    .then(function (secteur) {
      assert.strictEqual(secteur.installationDefenseSecteur, 1);
      assert.strictEqual(secteur.jetonLiberation, 1);
      assert.strictEqual(secteur.guildeFermiers, 1, 'la Guilde de Fermiers déjà posée ne doit pas être touchée');
    });
});

// 20/08/2026 (correctif — anomalie mise à jour Guilde Secteur, voir
// TODO.md EVOLUTION 2) : régression pour le bug constaté sur l'Événement
// E Cycle 1 Cadre 1 ("Placez une Guilde de Banquiers et 1 cube du
// Néant..."). Root cause réelle : data/catalogue/evenements.json
// écrivait "guilde_banquier" (SINGULIER, coquille) alors que
// CHAMP_ELEMENT_PLACEMENT_ (secteurService.js) n'a jamais reconnu que la
// forme au PLURIEL ("guilde_banquiers", cohérente avec guilde_fermiers/
// guilde_ingenieurs/guilde_mineurs) : le cube (clé reconnue) s'appliquait
// tandis que la Guilde (clé inconnue, ignorée silencieusement par
// placerElementsNeantAdjacent) était perdue sans erreur. Corrigé côté
// DONNÉE (les 3 occurrences fautives d'evenements.json renommées en
// "guilde_banquiers" — retour utilisateur : préférence pour corriger la
// donnée plutôt que le code face à un écart de convention de nommage) ;
// secteurService.js est resté/est revenu à sa forme d'origine (plurielle).
// Ce test reflète donc désormais la clé CORRIGÉE du catalogue.
test('placement générique — Événement E Cycle 1 Cadre 1 (guilde_banquiers + cube_neant)', function () {
  var fixtures = { parties: {}, scenarioSecteurs: [], typesSecteur: [], secteursPartie: [] };
  fixtures.parties[PARTIE_ID] = { scenarioId: 'scn1' };
  fixtures.typesSecteur = [{ id: 't1', nombreInstallationMax: 1, nombreGuildeMax: 1 }];
  fixtures.scenarioSecteurs = [
    { scenarioId: 'scn1', numero: 1, type: 't1' },
    { scenarioId: 'scn1', numero: 2, type: 't1' }
  ];
  fixtures.secteursPartie = [
    { numero: 1, pnNeant: 0, installationDefenseSecteur: 0, installationChantierNaval: 0, installationBaseStellaire: 0,
      guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      pnCorvette: 1, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0 },
    { numero: 2, pnNeant: 1, installationDefenseSecteur: 0, installationChantierNaval: 0, installationBaseStellaire: 0,
      guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
      pnCorvette: 0, pnSentinelle: 0, pnDestroyer: 0, pnCuirasse: 0, pnPorteVaisseau: 0 }
  ];

  var db = creerDB(Object.assign({ adjacences: [{ scenarioId: 'scn1', numeroA: 1, numeroB: 2 }] }, fixtures));
  var SecteurService = chargerSecteurService(db);

  return SecteurService.placerElementsNeantAdjacent(PARTIE_ID, 2, { guilde_banquiers: 1, cube_neant: 1 })
    .then(function (secteur) {
      assert.strictEqual(secteur.guildeBanquiers, 1, 'la Guilde de Banquiers doit être posée (bug : était ignorée)');
      assert.strictEqual(secteur.pnNeant, 2, 'le cube du Néant (1 déjà présent + 1 posé) doit être 2');
    });
});
