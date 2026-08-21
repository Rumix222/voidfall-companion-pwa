// Test fumée node --test pour CivilisationService.avancerPiste — mock DB/
// GameService/AnnulationService minimal en mémoire, pas de dépendance npm
// (vm + fixtures), même principe que les autres tests du projet
// (test_secteurService_placement.js, focusEngine_test.js). Charge les
// vrais fichiers sources (civilisationService.js + focusEngine.js, dont
// dépend directement CivilisationService.avancerPiste) via vm.
//
// 20/08/2026 (EVOLUTION 4 — rappel manuel + journal simplifié pour un
// effet "à appliquer manuellement" déclenché par l'avancement d'une piste
// de Civilisation, voir TODO.md) : premier fichier de test pour ce module
// (civilisationService.js n'en avait aucun jusqu'ici — dette connue,
// signalée dans CLAUDE.md). Couvre uniquement le comportement ajouté par
// cette évolution (le reste du module — avancerPisteMoinsAvancee/
// definirCorruption/avancerPisteCorrompue/obtenirDetailPistes — reste
// hors périmètre de ce lot, non testé ici).
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');
const test = require('node:test');

var PARTIE_ID = 'p1';

function creerContexte_(pistes) {
  var stores = { plateauMaison: {}, pileAnnulation: {} };
  var appelsAnnulation = [];
  var appelsMajPlateauMaison = [];

  var DB = {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cle] || null); },
    getAll: function (nom) { return Promise.resolve(nom === 'pistesCivilisation' ? pistes : []); },
    put: function (nom, valeur) { stores[nom][valeur.partieId] = valeur; return Promise.resolve(valeur); }
  };

  var sandbox = { console: console, DB: DB, Promise: Promise, Object: Object, Number: Number, Date: Date, Error: Error, JSON: JSON, String: String, Array: Array };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/focusEngine.js', 'utf8'), sandbox, { filename: 'focusEngine.js' });

  sandbox.__stores = stores;
  vm.runInContext(
    'var GameService = {' +
    '  majCivilisation: function (id, champs) { Object.assign(__stores.plateauMaison[id], champs); return Promise.resolve(); },' +
    '  majPlateauMaison: function (id, champs) { Object.assign(__stores.plateauMaison[id], champs); return Promise.resolve(); }' +
    '};',
    sandbox
  );
  sandbox.__appelsAnnulation = appelsAnnulation;
  vm.runInContext('var AnnulationService = { empiler: function (id, entree) { __appelsAnnulation.push(entree); return Promise.resolve(); } };', sandbox);

  vm.runInContext(fs.readFileSync(__dirname + '/civilisationService.js', 'utf8'), sandbox, { filename: 'civilisationService.js' });

  return { sandbox: sandbox, stores: stores, appelsAnnulation: appelsAnnulation };
}

function plateauBase_(champsNiveau) {
  return Object.assign({
    partieId: PARTIE_ID,
    civSociete: 0, civGouvernement: 0, civEconomie: 0,
    ressourceNourriture: 0, ressourceEnergie: 0, ressourceMateriel: 0, ressourceCredit: 0, ressourceScience: 0,
    influence: 0, cubeActif: 0, jetonPrime: 0, jetonLiberation: 0
  }, champsNiveau || {});
}

test('effet simple (influence) : aucun rappel, demanderChoix jamais appelé', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Société', caseNumero: 1, texte: 'Gagnez 20 Influence.', effet: JSON.stringify({ influence: 20 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_();

  var demanderChoix = function () { throw new Error('demanderChoix ne devrait pas être appelé pour cet effet automatisé.'); };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'societe', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.effetSucces, true);
    assert.strictEqual(resultat.nouveauNiveau, 1);
    assert.ok(resultat.effetJournal.some(function (l) { return l.indexOf('+20 influence') !== -1; }));
  });
});

// 20/08/2026 (EVOLUTION 6 — effet "avance_rapide" de piste Civilisation,
// voir TODO.md) : "simplement incrémenter le niveau de la piste
// concernée" — la piste avance d'UN niveau supplémentaire (en plus de
// l'avancement normal), sans résoudre l'effet de la nouvelle case.
// 20/08/2026 (correctif — retour utilisateur : "l'effet avance rapide
// doit faire gagner le bonus de la case atteinte") : avance_rapide
// résout désormais l'EFFET de la case suivante (plus seulement son
// niveau).
test('avance_rapide : fait gagner le BONUS de la case atteinte (pas seulement le niveau)', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Économie', caseNumero: 1, texte: 'Avance rapide.', effet: JSON.stringify({ avance_rapide: 1 }) },
    { type: 'Standard', piste: 'Économie', caseNumero: 2, texte: 'Gagnez 3 Crédits.', effet: JSON.stringify({ credit: 3 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civEconomie: 0 });

  var demanderChoix = function () { throw new Error('demanderChoix ne devrait pas être appelé (aucune des 2 cases n\'en a besoin).'); };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'economie', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.effetSucces, true);
    assert.strictEqual(resultat.ancienNiveau, 0);
    assert.strictEqual(resultat.nouveauNiveau, 2, 'avancement normal (0->1, avance_rapide) puis case 2 (1->2, +3 Crédits)');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civEconomie, 2, 'niveau persisté en base');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].ressourceCredit, 3, 'le BONUS (+3 Crédits) de la case 2 doit être appliqué et persisté');
    assert.ok(resultat.texte.indexOf('Avance rapide') !== -1 && resultat.texte.indexOf('Gagnez 3 Crédits') !== -1, 'texte concatène les 2 cases traversées');
    assert.ok(resultat.effetJournal.some(function (l) { return l.indexOf('la piste avance encore') !== -1; }));
    assert.ok(resultat.effetJournal.some(function (l) { return l.indexOf('+3 credit') !== -1; }), 'le journal doit refléter le gain de la case 2');
  });
});

test('avance_rapide : chaîne sur 2 sauts consécutifs (case 1 et 2 toutes deux avance_rapide, bonus gagné sur la case 3)', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 1, texte: 'Avance rapide.', effet: JSON.stringify({ avance_rapide: 1 }) },
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 2, texte: 'Avance rapide.', effet: JSON.stringify({ avance_rapide: 1 }) },
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 3, texte: 'Gagnez 5 Influence.', effet: JSON.stringify({ influence: 5 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civGouvernement: 0 });

  var demanderChoix = function () { throw new Error('demanderChoix ne devrait pas être appelé.'); };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'gouvernement', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.nouveauNiveau, 3, '0 -> 1 (avance_rapide) -> 2 (avance_rapide) -> 3 (+5 Influence)');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civGouvernement, 3);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].influence, 5);
    assert.strictEqual(ctx.appelsAnnulation.length, 1);
    var mutations = ctx.appelsAnnulation[0].mutations;
    var mutationNiveau = mutations.filter(function (m) { return m.champ === 'civGouvernement'; });
    assert.strictEqual(mutationNiveau.length, 1, 'une seule mutation pour civGouvernement, même après 2 sauts');
    assert.strictEqual(mutationNiveau[0].avant, 0);
    assert.strictEqual(mutationNiveau[0].apres, 3);
  });
});

test('avance_rapide : piste déjà au niveau maximum en cours de chaîne -> s\'arrête, journal l\'indique', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Société', caseNumero: 7, texte: 'Avance rapide.', effet: JSON.stringify({ avance_rapide: 1 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civSociete: 6 });

  var demanderChoix = function () { throw new Error('demanderChoix ne devrait pas être appelé.'); };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'societe', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.nouveauNiveau, 7, 'plafonné à NIVEAU_MAX, pas 8');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civSociete, 7);
    assert.ok(resultat.effetJournal.some(function (l) { return l.indexOf('maximum') !== -1; }));
  });
});

test('gagner_technologie [base, amelioree] : rappel "de base ou avancée", journal simplifié', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 2, texte: 'Gagnez une Technologie de base ou améliorée.', effet: JSON.stringify({ gagner_technologie: ['base', 'amelioree'] }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civGouvernement: 1 });

  var popup = null;
  var demanderChoix = function (contexte) { popup = contexte; return { confirme: true }; };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'gouvernement', demanderChoix).then(function (resultat) {
    assert.ok(popup, 'la popup de rappel doit être affichée');
    assert.strictEqual(popup.type, 'confirmation');
    assert.strictEqual(popup.message, '<em>Choisir une technologie de base ou avancée manuellement</em>');
    assert.strictEqual(resultat.effetJournal.length, 1);
    assert.strictEqual(resultat.effetJournal[0], 'Case 2 — Gouvernement : technologie choisie manuellement');
  });
});

test('gagner_technologie "base" (seule) : rappel "de base", journal simplifié', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Économie', caseNumero: 2, texte: 'Gagnez une Technologie de base.', effet: JSON.stringify({ gagner_technologie: 'base' }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civEconomie: 1 });

  var popup = null;
  var demanderChoix = function (contexte) { popup = contexte; return { confirme: true }; };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'economie', demanderChoix).then(function (resultat) {
    assert.strictEqual(popup.message, '<em>Choisir une technologie de base manuellement</em>');
    assert.strictEqual(resultat.effetJournal.length, 1);
    assert.strictEqual(resultat.effetJournal[0], 'Case 2 — Économie : technologie choisie manuellement');
  });
});

test('gagner_programme (valeur numérique générique) : rappel sans type, journal simplifié', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 3, texte: 'Gagnez un Programme.', effet: JSON.stringify({ gagner_programme: 1 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civGouvernement: 2 });

  var popup = null;
  var demanderChoix = function (contexte) { popup = contexte; return { confirme: true }; };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'gouvernement', demanderChoix).then(function (resultat) {
    assert.strictEqual(popup.message, '<em>Choisir un programme manuellement</em>');
    assert.strictEqual(resultat.effetJournal.length, 1);
    assert.strictEqual(resultat.effetJournal[0], 'Case 3 — Gouvernement : programme choisi manuellement');
  });
});

test('gagner_programme "force" (type imposé) : rappel avec type, journal simplifié', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Société', caseNumero: 5, texte: 'Gagnez un Programme Force.', effet: JSON.stringify({ gagner_programme: 'force' }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civSociete: 4 });

  var popup = null;
  var demanderChoix = function (contexte) { popup = contexte; return { confirme: true }; };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'societe', demanderChoix).then(function (resultat) {
    assert.strictEqual(popup.message, '<em>Choisir un programme force manuellement</em>');
    assert.strictEqual(resultat.effetJournal.length, 1);
    assert.strictEqual(resultat.effetJournal[0], 'Case 5 — Société : programme choisi manuellement');
  });
});

// 20/08/2026 (EVOLUTION 5 — voir TODO.md) : "retirer_corruption" est
// désormais portée par focusEngine.js (nouveau cas dédié, plus dans
// CLES_SECTEUR_HORS_PERIMETRE) — "effet_secteur" la remplace comme
// témoin d'une clé générique hors périmètre pour CE test (même choix que
// focusEngine_test.js).
test('clé hors périmètre autre que technologie/programme (effet_secteur) : rappel générique (texte de la case), journal INCHANGÉ', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 4, texte: 'Effet de secteur non automatisé.', effet: JSON.stringify({ effet_secteur: 1 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civGouvernement: 3 });

  var popup = null;
  var demanderChoix = function (contexte) { popup = contexte; return { confirme: true }; };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'gouvernement', demanderChoix).then(function (resultat) {
    assert.strictEqual(popup.message, '<em>Effet de secteur non automatisé.</em>');
    assert.strictEqual(resultat.effetJournal.length, 1);
    assert.ok(resultat.effetJournal[0].indexOf('non automatis\u00e9') !== -1, 'le journal générique doit rester inchangé pour cette clé');
  });
});

// 20/08/2026 (EVOLUTION 5 — effet "Retirer une Corruption", voir
// TODO.md) : depuis une piste de Civilisation, "retirer_corruption" est
// désormais automatisée via la popup dédiée (strategieService.js,
// contexte 'retirer_corruption') au lieu du rappel manuel générique —
// AUCUNE popup de rappel EVOLUTION 4 ne doit apparaître ici (seul le
// contexte 'retirer_corruption' est appelé, jamais 'confirmation').
test('retirer_corruption (piste Civilisation) : délègue à demanderChoix({type:"retirer_corruption"}), pas de rappel manuel', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Économie', caseNumero: 6, texte: 'Retirez une Corruption.', effet: JSON.stringify({ retirer_corruption: 1 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civEconomie: 5 });

  var typesAppeles = [];
  var demanderChoix = function (contexte) {
    typesAppeles.push(contexte.type);
    assert.strictEqual(contexte.type, 'retirer_corruption');
    return { detail: 'Corruption retirée du Secteur 2.' };
  };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'economie', demanderChoix).then(function (resultat) {
    assert.deepStrictEqual(typesAppeles, ['retirer_corruption']);
    assert.strictEqual(resultat.effetJournal.length, 1);
    assert.strictEqual(resultat.effetJournal[0], 'Case 6 — Économie : Corruption retirée du Secteur 2.');
  });
});

test('choice inclusif "et/ou" où seule une option automatisée est choisie : aucun rappel', function () {
  var ctx = creerContexte_([
    {
      type: 'Standard', piste: 'Économie', caseNumero: 6, texte: 'Gagnez un Programme et/ou un jeton Commerce.',
      effet: JSON.stringify({ choice: ['gagner_programme', 'gagner_commerce'] })
    }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civEconomie: 5 });

  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [1]; // seulement "gagner_commerce" (indice 1)
    if (contexte.type === 'bonus_commerce') return { indexChoisi: 5 }; // "Gagnez 1 Science."
    throw new Error('demanderChoix ne devrait pas être appelé pour un rappel manuel ici : ' + contexte.type);
  };

  return ctx.sandbox.CivilisationService.avancerPiste(PARTIE_ID, 'MaMaison', 'economie', demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.effetSucces, true);
    assert.ok(!resultat.effetJournal.some(function (l) { return l.indexOf('à appliquer manuellement') !== -1; }));
  });
});

// ---------------------------------------------------------------
// 21/08/2026 (Événement galactique G, Cycle 1 — Cadres 1 et 2, "Le visage
// du mal", voir en-tête de fichier) : definirCorruption/avancerPisteSansEffet
// — jusqu'ici entièrement hors périmètre de ce fichier de test (voir
// commentaire d'en-tête d'origine).
// ---------------------------------------------------------------

test('definirCorruption : place une Corruption -> +1 sur corruptionMaison', function () {
  var ctx = creerContexte_([]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ corruptionMaison: 2 });

  return ctx.sandbox.CivilisationService.definirCorruption(PARTIE_ID, 'gouvernement', true).then(function (resultat) {
    assert.strictEqual(resultat.corrompue, true);
    assert.strictEqual(resultat.corruptionMaison, 3);
    assert.strictEqual(resultat.corruptionMaisonConservee, false);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civCorrompueGouvernement, true);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].corruptionMaison, 3);
  });
});

test('definirCorruption : retire une Corruption -> -1 sur corruptionMaison (sans option)', function () {
  var ctx = creerContexte_([]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ corruptionMaison: 2, civCorrompueSociete: true });

  return ctx.sandbox.CivilisationService.definirCorruption(PARTIE_ID, 'societe', false).then(function (resultat) {
    assert.strictEqual(resultat.corrompue, false);
    assert.strictEqual(resultat.corruptionMaison, 1);
    assert.strictEqual(resultat.corruptionMaisonConservee, false);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].corruptionMaison, 1);
  });
});

// 21/08/2026 (Événement galactique G, Cycle 1, Cadre 2, permanent : "chaque
// fois que vous retirez une Corruption... gardez-la dans votre zone de jeu
// personnelle... jusqu'à la phase Évaluation") : options.conserverCorruptionRetiree
// (fourni par l'appelant — strategieService.js — quand ce Cadre est actif
// pour le cycle en cours) empêche la décrémentation du compteur.
test('definirCorruption : retrait + conserverCorruptionRetiree -> corruptionMaison INCHANGÉ, corruptionMaisonConservee=true', function () {
  var ctx = creerContexte_([]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ corruptionMaison: 2, civCorrompueEconomie: true });

  return ctx.sandbox.CivilisationService.definirCorruption(PARTIE_ID, 'economie', false, { conserverCorruptionRetiree: true }).then(function (resultat) {
    assert.strictEqual(resultat.corrompue, false);
    assert.strictEqual(resultat.corruptionMaisonConservee, true);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].corruptionMaison, 2, 'le compteur ne doit PAS être décrémenté');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civCorrompueEconomie, false, 'la piste cesse néanmoins d’être marquée Corrompue');
  });
});

test('definirCorruption : idempotent (même état demandé deux fois) -> corruptionMaison ne bouge pas la 2e fois', function () {
  var ctx = creerContexte_([]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ corruptionMaison: 1, civCorrompueSociete: true });

  return ctx.sandbox.CivilisationService.definirCorruption(PARTIE_ID, 'societe', true).then(function (resultat) {
    assert.strictEqual(resultat.corruptionMaison, 1, 'déjà Corrompue -> aucune mutation du compteur');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].corruptionMaison, 1);
  });
});

test('avancerPisteSansEffet : avance d’une case, ne résout AUCUN effet de case, ne touche pas au marqueur Corrompue', function () {
  var ctx = creerContexte_([
    { type: 'Standard', piste: 'Gouvernement', caseNumero: 2, texte: 'Gagnez 20 Influence.', effet: JSON.stringify({ influence: 20 }) }
  ]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civGouvernement: 1, civCorrompueGouvernement: true });

  return ctx.sandbox.CivilisationService.avancerPisteSansEffet(PARTIE_ID, 'gouvernement').then(function (resultat) {
    assert.strictEqual(resultat.ancienNiveau, 1);
    assert.strictEqual(resultat.nouveauNiveau, 2);
    assert.strictEqual(resultat.dejaMaximum, false);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civGouvernement, 2);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].influence, 0, 'le bénéfice de la case 2 (+20 Influence) ne doit PAS être appliqué');
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civCorrompueGouvernement, true, 'le marqueur Corrompue doit rester tel quel (contrairement à avancerPisteCorrompue)');
  });
});

test('avancerPisteSansEffet : piste déjà au maximum -> no-op, dejaMaximum=true', function () {
  var ctx = creerContexte_([]);
  ctx.stores.plateauMaison[PARTIE_ID] = plateauBase_({ civEconomie: 7 });

  return ctx.sandbox.CivilisationService.avancerPisteSansEffet(PARTIE_ID, 'economie').then(function (resultat) {
    assert.strictEqual(resultat.dejaMaximum, true);
    assert.strictEqual(resultat.nouveauNiveau, 7);
    assert.strictEqual(ctx.stores.plateauMaison[PARTIE_ID].civEconomie, 7);
  });
});
