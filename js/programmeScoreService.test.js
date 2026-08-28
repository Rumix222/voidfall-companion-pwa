/**
 * Test fumée — programmeScoreService.js
 * Exécution : node programmeScoreService.test.js (ou node --test js/programmeScoreService.test.js)
 *
 * Module 100% pur (aucune dépendance DB/DOM) : chargé directement via vm.
 * Vérifie les 32 cartes de data/catalogue/programmes.json, objectif1 ET
 * objectif2 chacun — condition NON remplie (0 point) et condition remplie
 * (points attendus), pour chaque forme de règle rencontrée dans le
 * mapping du chantier (seuil fixe, "par unité", "par paire", niveau de
 * Civilisation, Revenu/Réserve/Entretien, corruption).
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function creerContexte_() {
  var ctx = { console: console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/programmeScoreService.js', 'utf8'), ctx, { filename: 'programmeScoreService.js' });
  return ctx;
}

function secteurPur_(champs) {
  return Object.assign({
    population: 0, entretien: 0,
    guildeFermiers: 0, guildeIngenieurs: 0, guildeMineurs: 0, guildeBanquiers: 0, guildeScientifiques: 0,
    installationChantierNaval: 0, installationDefenseSecteur: 0, installationBaseStellaire: 0,
    pn: { corvette: 0, sentinelle: 0, destroyer: 0, cuirasse: 0, porteVaisseau: 0 },
    guildeVacante: true
  }, champs || {});
}

// Objet retourné issu du contexte vm — pas du même realm que ce fichier
// de test, deepStrictEqual le jugerait à tort non égal malgré une
// structure identique (voir combatService.test.js/focusEngine.test.js) :
// comparaison via JSON.stringify.
function assertPoints_(resultat, attendu) {
  assert.strictEqual(JSON.stringify(resultat), JSON.stringify(attendu));
}

function etatVide_() {
  return {
    secteursPurs: [],
    nombreSecteurTotal: 0,
    civilisation: { niveaux: { societe: 0, gouvernement: 0, economie: 0 }, corrompues: {} },
    ressources: { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 },
    revenu: { nourriture: 0, energie: 0, materiel: 0, credit: 0, science: 0 },
    entretienTotal: 0,
    jetonPrime: 0, jetonLiberation: 0, jetonCommerce: 0, gloire: [],
    corruptionSecteurs: 0, corruptionMaison: 0,
    nbTechBase: 0, nbTechAmelioree: 0
  };
}

test('code inconnu -> {0,0,0}, jamais d\'exception', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  assertPoints_(PS.calculerPointsProgramme('ZZZ', etatVide_()), { objectif1: 0, objectif2: 0, total: 0 });
});

// ------------------------------------------------------------
// Domination
// ------------------------------------------------------------

test('D1 : secteur Pur pop>=6 (seuil "au moins N secteurs") + niveau Civilisation Pure (barème 4/8/12/16)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var vide = etatVide_();
  assertPoints_(PS.calculerPointsProgramme('D1', vide), { objectif1: 0, objectif2: 0, total: 0 });

  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ population: 6 })];
  etat.civilisation.niveaux.societe = 3;
  assertPoints_(PS.calculerPointsProgramme('D1', etat), { objectif1: 5, objectif2: 12, total: 17 });
});

test('D1 : piste Corrompue -> objectif2 à 0 même si niveau > 0', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.civilisation.niveaux.societe = 4;
  etat.civilisation.corrompues.societe = true;
  assert.strictEqual(PS.calculerPointsProgramme('D1', etat).objectif2, 0);
});

test('D2 : 4 secteurs Purs pop>=3', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ population: 3 }), secteurPur_({ population: 4 }), secteurPur_({ population: 3 }), secteurPur_({ population: 2 })];
  assert.strictEqual(PS.calculerPointsProgramme('D2', etat).objectif1, 0); // seulement 3 qualifient (pop>=3)
  etat.secteursPurs.push(secteurPur_({ population: 3 }));
  assert.strictEqual(PS.calculerPointsProgramme('D2', etat).objectif1, 5);
});

test('D4 : niveau Gouvernement Pure>=2 + 1 Influence toutes les 2 ressources (N/E/M)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.civilisation.niveaux.gouvernement = 2;
  etat.ressources = { nourriture: 3, energie: 2, materiel: 1, credit: 0, science: 0 };
  assertPoints_(PS.calculerPointsProgramme('D4', etat), { objectif1: 5, objectif2: 3, total: 8 }); // (3+2+1)=6 -> floor(6/2)=3
});

test('D5 : secteur Pur entretien>=2', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ entretien: 2 }), secteurPur_({ entretien: 1 }), secteurPur_({ entretien: 2 })];
  assert.strictEqual(PS.calculerPointsProgramme('D5', etat).objectif2, 10);
});

test('D7 : au moins UNE piste Pure niveau>=3 (n\'importe laquelle)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.civilisation.niveaux.economie = 3;
  assert.strictEqual(PS.calculerPointsProgramme('D7', etat).objectif1, 4);
});

test('D8 : population Pure totale + somme des 3 pistes (barème 0/2/4/6/8)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ population: 5 }), secteurPur_({ population: 5 })];
  etat.civilisation.niveaux = { societe: 1, gouvernement: 2, economie: 0 };
  assertPoints_(PS.calculerPointsProgramme('D8', etat), { objectif1: 4, objectif2: 2 + 4 + 0, total: 10 });
});

// ------------------------------------------------------------
// Force
// ------------------------------------------------------------

test('M1 : Revenu Matériel (seuil) + secteurs Purs avec >=2 cubes PN', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.revenu.materiel = 8;
  etat.secteursPurs = [secteurPur_({ pn: { corvette: 2, sentinelle: 0, destroyer: 0, cuirasse: 0, porteVaisseau: 0 } })];
  assertPoints_(PS.calculerPointsProgramme('M1', etat), { objectif1: 5, objectif2: 5, total: 10 });
});

test('M2 : Revenu Énergie + Influence PAR CUBE (pas par secteur) sur secteurs Purs', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ pn: { corvette: 3, sentinelle: 1, destroyer: 0, cuirasse: 0, porteVaisseau: 0 } })];
  assert.strictEqual(PS.calculerPointsProgramme('M2', etat).objectif2, 8); // 4 cubes * 2
});

test('M3 : total structures (CN+BS, tous secteurs Purs confondus) + secteurs pnTotal>=3', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [
    secteurPur_({ installationChantierNaval: 1 }),
    secteurPur_({ installationBaseStellaire: 1 }),
    secteurPur_({ installationChantierNaval: 1 })
  ];
  assert.strictEqual(PS.calculerPointsProgramme('M3', etat).objectif1, 6);
});

test('M4 : secteurs Purs AVEC (CN ou BS) — par secteur, pas par structure', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ installationChantierNaval: 1, installationBaseStellaire: 1 }), secteurPur_({ installationChantierNaval: 1 })];
  assert.strictEqual(PS.calculerPointsProgramme('M4', etat).objectif2, 4); // 2 secteurs * 2, pas 3 structures
});

test('M7 : Réserve Science + secteur Pur avec >=3 Installations (somme des 3 types)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.ressources.science = 8;
  etat.secteursPurs = [secteurPur_({ installationChantierNaval: 1, installationDefenseSecteur: 1, installationBaseStellaire: 1 })];
  assertPoints_(PS.calculerPointsProgramme('M7', etat), { objectif1: 7, objectif2: 6, total: 13 });
});

// ------------------------------------------------------------
// Soutien
// ------------------------------------------------------------

test('S1 : tous secteurs Purs (nombreSecteurTotal) + secteurs sans emplacement Guilde vide', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ guildeVacante: false }), secteurPur_({ guildeVacante: true })];
  etat.nombreSecteurTotal = 2;
  assertPoints_(PS.calculerPointsProgramme('S1', etat), { objectif1: 7, objectif2: 4, total: 11 });

  etat.nombreSecteurTotal = 3; // un secteur Corrompu quelque part -> plus "tous Purs"
  assert.strictEqual(PS.calculerPointsProgramme('S1', etat).objectif1, 0);
});

test('S2 : Entretien total (seuil haut) + secteurs Purs avec >=3 types de Guilde distincts', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.entretienTotal = 10;
  etat.secteursPurs = [secteurPur_({ guildeFermiers: 1, guildeIngenieurs: 1, guildeMineurs: 1 })];
  assertPoints_(PS.calculerPointsProgramme('S2', etat), { objectif1: 6, objectif2: 5, total: 11 });
});

test('S4 : DEUX conditions ET (Ingénieurs>=2 ET Mineurs>=2)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ guildeIngenieurs: 2, guildeMineurs: 1 })];
  assert.strictEqual(PS.calculerPointsProgramme('S4', etat).objectif1, 0); // Mineurs insuffisant
  etat.secteursPurs = [secteurPur_({ guildeIngenieurs: 2, guildeMineurs: 2 })];
  assert.strictEqual(PS.calculerPointsProgramme('S4', etat).objectif1, 6);
});

test('S5 : au moins une piste Corrompue (booléen) + paires de Guildes Mineurs', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.civilisation.corrompues.economie = true;
  etat.secteursPurs = [secteurPur_({ guildeMineurs: 5 })];
  assertPoints_(PS.calculerPointsProgramme('S5', etat), { objectif1: 7, objectif2: 10, total: 17 }); // floor(5/2)=2 paires * 5
});

test('S6 : corruption totale (secteurs+fiche Maison) <=1, Chambres de décontamination JAMAIS comptées (pas dans etat)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.corruptionSecteurs = 1;
  etat.corruptionMaison = 0;
  assert.strictEqual(PS.calculerPointsProgramme('S6', etat).objectif1, 6);
  etat.corruptionMaison = 1;
  assert.strictEqual(PS.calculerPointsProgramme('S6', etat).objectif1, 0);
});

test('S7 : Entretien total (seuil bas, <=)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.entretienTotal = 6;
  assert.strictEqual(PS.calculerPointsProgramme('S7', etat).objectif1, 5);
  etat.entretienTotal = 7;
  assert.strictEqual(PS.calculerPointsProgramme('S7', etat).objectif1, 0);
});

test('S8 : au moins 2 types de Flotte distincts déployés sur secteurs Purs + jetonLiberation', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ pn: { corvette: 3, sentinelle: 0, destroyer: 0, cuirasse: 0, porteVaisseau: 0 } })];
  assert.strictEqual(PS.calculerPointsProgramme('S8', etat).objectif1, 0); // 1 seul type
  etat.secteursPurs.push(secteurPur_({ pn: { corvette: 0, sentinelle: 1, destroyer: 0, cuirasse: 0, porteVaisseau: 0 } }));
  etat.jetonLiberation = 3;
  assertPoints_(PS.calculerPointsProgramme('S8', etat), { objectif1: 4, objectif2: 6, total: 10 });
});

// ------------------------------------------------------------
// Richesse
// ------------------------------------------------------------

test('W1 : jetonCommerce (nombre) + secteurs Purs SANS Entretien', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.jetonCommerce = 2;
  etat.secteursPurs = [secteurPur_({ entretien: 0 }), secteurPur_({ entretien: 1 })];
  assertPoints_(PS.calculerPointsProgramme('W1', etat), { objectif1: 4, objectif2: 3, total: 7 });
});

test('W2 : jetonLiberation (seuil) + somme des VALEURS de Gloire (pas le compte)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.jetonLiberation = 2;
  etat.gloire = [3, 5, 2];
  assertPoints_(PS.calculerPointsProgramme('W2', etat), { objectif1: 4, objectif2: 10, total: 14 });
});

test('W3 : nombre de jetons Gloire (peu importe leur valeur) + série de 3 Crédits', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.gloire = [1, 1, 1];
  etat.ressources.credit = 10;
  assertPoints_(PS.calculerPointsProgramme('W3', etat), { objectif1: 4, objectif2: 12, total: 16 }); // floor(10/3)=3*4
});

test('W4 : au moins un jeton Gloire de valeur >=5', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.gloire = [3, 4];
  assert.strictEqual(PS.calculerPointsProgramme('W4', etat).objectif1, 0);
  etat.gloire = [3, 5];
  assert.strictEqual(PS.calculerPointsProgramme('W4', etat).objectif1, 6);
});

test('W5 : secteurs Purs>=4 + technologies de base ET améliorées (montants différents)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.nbTechBase = 2;
  etat.nbTechAmelioree = 1;
  assert.strictEqual(PS.calculerPointsProgramme('W5', etat).objectif2, 2 * 2 + 1 * 3);
});

test('W7 : total Technologies (base OU améliorées confondues) + paires de secteurs Purs', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.nbTechBase = 2;
  etat.nbTechAmelioree = 2;
  etat.secteursPurs = [secteurPur_(), secteurPur_(), secteurPur_()];
  assertPoints_(PS.calculerPointsProgramme('W7', etat), { objectif1: 4, objectif2: 5, total: 9 }); // floor(3/2)=1*5
});

test('W8 : objectif1 SANS seuil (multiplicateur pur) + objectif2 ambigu (Commerce ET Prime additionnés, décision actée)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.nbTechAmelioree = 3;
  etat.jetonCommerce = 2;
  etat.jetonPrime = 1;
  assertPoints_(PS.calculerPointsProgramme('W8', etat), { objectif1: 12, objectif2: 6, total: 18 });
});

test('W8 : objectif1 vaut 0 sans Technologie améliorée (pas de plancher/plafond caché)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  assert.strictEqual(PS.calculerPointsProgramme('W8', etatVide_()).objectif1, 0);
});

// ------------------------------------------------------------
// Programme de DÉPART (programmesDepart.json, emplacement 0) —
// calculerPointsProgrammeDepart, forme différente (tableau `lignes` de
// longueur variable, total pouvant être négatif — malus Corruption).
// ------------------------------------------------------------

test('code inconnu (Programme de départ) -> {lignes:[], total:0}', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  assertPoints_(PS.calculerPointsProgrammeDepart('ZZZ', etatVide_()), { lignes: [], total: 0 });
});

test('H13-A2/H13-B2 (Marqualos, supplementaire) : codes volontairement absents de la table', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  assertPoints_(PS.calculerPointsProgrammeDepart('H13-A2', etatVide_()), { lignes: [], total: 0 });
  assertPoints_(PS.calculerPointsProgrammeDepart('H13-B2', etatVide_()), { lignes: [], total: 0 });
});

test('H1-A (motif "A", 3 lignes) : secteurs Purs / avec Défense de Secteur / avec Chantier Naval', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ installationDefenseSecteur: 1 }), secteurPur_({ installationChantierNaval: 1 })];
  assertPoints_(PS.calculerPointsProgrammeDepart('H1-A', etat), { lignes: [6, 1, 2], total: 9 }); // 2 secteurs*3, 1*1, 1*2
});

test('H3-A/H4-A/H13-A/H2-A partagent EXACTEMENT le motif "A" de H1-A (même texte au catalogue)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ installationDefenseSecteur: 1 })];
  var attendu = PS.calculerPointsProgrammeDepart('H1-A', etat);
  ['H3-A', 'H4-A', 'H13-A', 'H2-A'].forEach(function (code) {
    assertPoints_(PS.calculerPointsProgrammeDepart(code, etat), attendu);
  });
});

test('H1-B (motif "B", 4 lignes) : population EXACTEMENT 5 vs EXACTEMENT 6 (pas des seuils "au moins")', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ population: 5 }), secteurPur_({ population: 6 }), secteurPur_({ population: 4, guildeBanquiers: 2, guildeFermiers: 1 })];
  // pop=4 ne compte dans AUCUNE des 2 premières lignes (ni 5 ni 6 pile)
  assertPoints_(PS.calculerPointsProgrammeDepart('H1-B', etat), { lignes: [3, 6, 2, 3], total: 14 });
});

test('H12-A : Entretien total (pas par secteur) + secteur Pur avec au moins une Installation (les 3 types)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.entretienTotal = 4;
  etat.secteursPurs = [secteurPur_({ installationBaseStellaire: 1 })];
  assertPoints_(PS.calculerPointsProgrammeDepart('H12-A', etat), { lignes: [8, 1], total: 9 });
});

test('H12-B/H6-B : barème Niveau Civilisation Pure 0/3/6/9/12 (distinct du 0/4/8/12/16 du catalogue principal)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.civilisation.niveaux.economie = 4;
  assert.strictEqual(PS.calculerPointsProgrammeDepart('H12-B', etat).lignes[2], 12);
});

test('H7-A : "1 Influence toutes les 2 Populations Pures" (floor global, pas par secteur)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.secteursPurs = [secteurPur_({ population: 3 }), secteurPur_({ population: 2 })]; // total 5 -> floor(5/2)=2
  assert.strictEqual(PS.calculerPointsProgrammeDepart('H7-A', etat).lignes[0], 2);
});

test('H10-A : MALUS Corruption fiche Maison (négatif, jamais clampé à 0 ligne par ligne)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.corruptionMaison = 3;
  var resultat = PS.calculerPointsProgrammeDepart('H10-A', etat);
  assert.strictEqual(resultat.lignes[3], -3);
  assert.strictEqual(resultat.total, -3); // aucune autre ligne active dans cet état vide
});

test('H10-B : malus Corruption à -2/Corruption (coefficient différent de H10-A) + passthrough Population Pure totale', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.corruptionMaison = 2;
  etat.secteursPurs = [secteurPur_({ population: 4 })];
  var resultat = PS.calculerPointsProgrammeDepart('H10-B', etat);
  assert.strictEqual(resultat.lignes[0], 4); // passthrough population, pas un multiplicateur
  assert.strictEqual(resultat.lignes[3], -4); // -2 * 2
});

test('H14-B : total peut être NÉGATIF si le malus dépasse les gains', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.corruptionMaison = 10; // malus -10, aucun secteur Pur/Guilde pour compenser
  var resultat = PS.calculerPointsProgrammeDepart('H14-B', etat);
  assert.strictEqual(resultat.total, -10);
});

test('H9-B/H6-A : nombre de TYPES de ressource en réserve >=8 (pas la quantité elle-même)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.ressources = { nourriture: 8, energie: 9, materiel: 3, credit: 0, science: 8 }; // 3 types >=8
  assert.strictEqual(PS.calculerPointsProgrammeDepart('H9-B', etat).lignes[0], 9); // 3 types * 3
});

test('H11-A : réserve du type le MOINS abondant (pas un compte de types à égalité)', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.ressources = { nourriture: 5, energie: 2, materiel: 2, credit: 9, science: 7 }; // min = 2
  assert.strictEqual(PS.calculerPointsProgrammeDepart('H11-A', etat).lignes[0], 4); // 2 * 2
});

test('H11-B : "série de 3 cubes" TOUS secteurs Purs confondus (pas par secteur) + valeur totale de Gloire', function () {
  var PS = creerContexte_().ProgrammeScoreService;
  var etat = etatVide_();
  etat.gloire = [3, 4];
  etat.secteursPurs = [secteurPur_({ pn: { corvette: 5, sentinelle: 0, destroyer: 0, cuirasse: 0, porteVaisseau: 0 } }), secteurPur_({ pn: { corvette: 2, sentinelle: 0, destroyer: 0, cuirasse: 0, porteVaisseau: 0 } })];
  var resultat = PS.calculerPointsProgrammeDepart('H11-B', etat);
  assert.strictEqual(resultat.lignes[0], 7); // Gloire 3+4
  assert.strictEqual(resultat.lignes[2], 6); // 7 cubes -> floor(7/3)=2 séries * 3
});
