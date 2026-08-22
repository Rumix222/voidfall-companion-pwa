/**
 * Test fumée — combatService.js
 * Exécution : node combatService.test.js (ou node --test js/combatService.test.js)
 *
 * Module 100% pur (aucune dépendance DB/DOM) : pas besoin de mock, chargé
 * directement via vm comme le reste de la suite.
 *
 * Chaque valeur numérique attendue ci-dessous a été vérifiée par
 * exécution réelle de la fonction testée (pas de calcul à la main) avant
 * d'être figée en assertion — ce sont donc des tests de non-régression
 * sur le comportement actuel (documenté par les commentaires de
 * combatService.js), pas une resimulation indépendante des règles
 * Voidfall (aucun docs-rules-combat.md dédié dans ce dépôt).
 */

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var test = require('node:test');

function creerContexte_() {
  var ctx = { console: console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/combatService.js', 'utf8'), ctx, { filename: 'combatService.js' });
  return ctx;
}

// ------------------------------------------------------------
// vaisseauxDebloques
// ------------------------------------------------------------

test('vaisseauxDebloques : technologie de départ + technologies obtenues, normalisation (casse/espaces)', function () {
  var CS = creerContexte_().CombatService;
  var partie = {
    joueur: { technologieDepart: { nom: 'destroyers' } }, // casse volontairement différente
    technologiesObtenues: [{ nom: 'Cuirassés ' }, null, { nom: 'Sentinelles' }, null, null] // espace de fin volontaire
  };
  var vaisseaux = CS.vaisseauxDebloques(partie);
  // Tableau issu du contexte vm — pas du même realm que ce fichier de test,
  // deepStrictEqual le jugerait à tort non égal malgré une structure
  // identique (voir focusEngine.test.js) : comparaison via JSON.stringify.
  assert.strictEqual(JSON.stringify(vaisseaux), JSON.stringify(['Destroyers', 'Cuirassés', 'Sentinelles']));
});

test('vaisseauxDebloques : aucune technologie pertinente -> tableau vide (Corvette toujours dispo, hors de cette liste)', function () {
  var CS = creerContexte_().CombatService;
  var partie = { joueur: {}, technologiesObtenues: [] };
  assert.strictEqual(JSON.stringify(CS.vaisseauxDebloques(partie)), '[]');
});

// ------------------------------------------------------------
// construireCamp
// ------------------------------------------------------------

test('construireCamp : quantités manquantes -> 0, absorptionSalveDisponible initialisée à 0', function () {
  var CS = creerContexte_().CombatService;
  var camp = CS.construireCamp('Test', undefined, undefined, undefined, undefined, undefined, undefined, false, {});
  assert.strictEqual(camp.corvette, 0);
  assert.strictEqual(camp.destroyer, 0);
  assert.strictEqual(camp.cuirasse, 0);
  assert.strictEqual(camp.sentinelle, 0);
  assert.strictEqual(camp.portevaisseau, 0);
  assert.strictEqual(camp.defenseSecteur, 0);
  assert.strictEqual(camp.absorptionSalveDisponible, 0);
});

test('construireCamp : estJoueur=false -> techs neutres même si `partie` porte des technologies (camp Néant)', function () {
  var CS = creerContexte_().CombatService;
  var partieAvecBoucliers = { joueur: { technologieDepart: { nom: 'Boucliers' } }, technologiesObtenues: [] };
  var camp = CS.construireCamp('Le Néant', 1, 0, 0, 0, 0, 0, false, partieAvecBoucliers);
  assert.strictEqual(camp.techs.hasBoucliers, false);
});

test('construireCamp : estJoueur=true -> techs lues depuis technologieDepart + technologiesObtenues (amelioree incluse)', function () {
  var CS = creerContexte_().CombatService;
  var partie = {
    joueur: { technologieDepart: { nom: 'Ciblage' } },
    technologiesObtenues: [{ nom: 'Torpilles', amelioree: true }]
  };
  var camp = CS.construireCamp('Joueur', 1, 0, 0, 0, 0, 0, true, partie);
  assert.strictEqual(camp.techs.hasCiblage, true);
  assert.strictEqual(camp.techs.hasCiblageAmeliore, false);
  assert.strictEqual(camp.techs.hasTorpilles, true);
  assert.strictEqual(camp.techs.hasTorpillesAmeliore, true);
  assert.strictEqual(camp.techs.hasBoucliers, false);
});

// ------------------------------------------------------------
// resoudreCombat — cas de base (aucune Technologie)
// ------------------------------------------------------------

test('resoudreCombat : défenseur sans aucune unité -> victoire immédiate, aucune étape de Salve', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, false, {});
  var d = CS.construireCamp('Defenseur', 0, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  assert.strictEqual(r.vainqueur, a);
  assert.strictEqual(r.cubesRestants, 3);
  assert.strictEqual(a.corvette, 3);
  assert.ok(r.log.indexOf('--- Salve 1 ---') === -1, 'aucune étape de Salve ne doit avoir lieu');
});

test('resoudreCombat : Défense de Secteur seule (sans Puissance Navale) inflige des Dégâts d\'Approche mais ne peut jamais gagner', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, false, {});
  var d = CS.construireCamp('Defenseur', 0, 0, 0, 0, 0, 2, false, {});
  var r = CS.resoudreCombat(a, d);
  assert.strictEqual(r.vainqueur, a);
  assert.strictEqual(r.cubesRestants, 1); // 3 corvettes - 2 Dégâts d'Approche
  assert.strictEqual(a.corvette, 1);
});

test('resoudreCombat : Initiative égale -> les 2 camps s\'infligent 1 Dégât simultané (peut finir en égalité)', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 1, 0, 0, 0, 0, 0, false, {});
  var d = CS.construireCamp('Defenseur', 1, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  assert.strictEqual(r.vainqueur, null);
  assert.strictEqual(r.cubesRestants, 0);
  assert.strictEqual(a.corvette, 0);
  assert.strictEqual(d.corvette, 0);
});

test('resoudreCombat : Cuirassé donne +1 Initiative -> départage une Initiative sinon égale', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 0, 0, 1, 0, 0, 0, false, {});
  var d = CS.construireCamp('Defenseur', 1, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  assert.strictEqual(r.vainqueur, a);
  assert.strictEqual(r.cubesRestants, 1);
  assert.strictEqual(a.cuirasse, 1);
});

test('resoudreCombat : rappel de cube suit la priorité Corvette > Sentinelle > Destroyer (ORDRE_RAPPEL)', function () {
  var CS = creerContexte_().CombatService;
  // Ni Cuirassé (donnerait de l'Absorption d'Approche, fausserait le compte de rappels)
  // ni Porte-Vaisseaux (se déploie en Corvette supplémentaire avant l'Approche, voir test dédié) :
  // isole les 3 premiers types de la priorité ORDRE_RAPPEL.
  var a = CS.construireCamp('Attaquant', 1, 1, 0, 1, 0, 0, false, {}); // 1 Corvette, 1 Destroyer, 1 Sentinelle
  var d = CS.construireCamp('Defenseur', 0, 0, 0, 0, 0, 3, false, {}); // 3 Dégâts d'Approche -> 3 rappels
  CS.resoudreCombat(a, d);
  assert.strictEqual(a.corvette, 0);
  assert.strictEqual(a.sentinelle, 0);
  assert.strictEqual(a.destroyer, 0);
});

test('resoudreCombat : Porte-Vaisseaux déploient chacun 1 Corvette AVANT l\'étape d\'Approche (sans se consommer eux-mêmes)', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 0, 0, 0, 0, 2, 0, false, {});
  var d = CS.construireCamp('Defenseur', 0, 0, 0, 0, 0, 0, false, {});
  CS.resoudreCombat(a, d);
  // Le Porte-Vaisseaux reste sur le plateau (n'est pas rappelé par son propre déploiement) : il
  // s'ajoute aux 2 Corvettes déployées, plutôt que de les remplacer.
  assert.strictEqual(a.portevaisseau, 2);
  assert.strictEqual(a.corvette, 2);
});

test('resoudreCombat : Cuirassé + Porte-Vaisseaux du défenseur donnent de l\'Absorption de Salve (1 chacun)', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, false, {});
  var d = CS.construireCamp('Defenseur', 0, 0, 1, 0, 1, 0, false, {}); // 1 Cuirassé + 1 Porte-Vaisseaux (-> +1 Corvette)
  var r = CS.resoudreCombat(a, d);
  // Défenseur : 1 Cuirassé (init+1) + 1 Corvette déployée + absorption(2) -> encaisse 2 Salves sans perte avant de riposter
  assert.strictEqual(r.vainqueur, d);
  assert.ok(r.log.indexOf('Defenseur absorbe le Dégât (Attaquant riposte).') !== -1);
});

// ------------------------------------------------------------
// resoudreCombat — bonus de Technologie (joueur uniquement)
// ------------------------------------------------------------

function partieAvecTech_(nom, amelioree) {
  return { joueur: { technologieDepart: { nom: nom, amelioree: !!amelioree } }, technologiesObtenues: [] };
}

test('resoudreCombat : Ciblage (de base) donne +5 Initiative si au moins 1 Corvette', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 1, 0, 0, 0, 0, 0, true, partieAvecTech_('Ciblage'));
  var d = CS.construireCamp('Defenseur', 1, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  assert.ok(r.log.indexOf('Initiative : Attaquant 6 — Defenseur 1.') !== -1);
});

test('resoudreCombat : Ciblage amélioré garantit le premier tir même à Initiative inférieure', function () {
  var CS = creerContexte_().CombatService;
  // Défenseur : 2 Corvettes (Initiative 2) > Attaquant 1 Corvette (Initiative 1) sans Ciblage amélioré...
  var a = CS.construireCamp('Attaquant', 1, 0, 0, 0, 0, 0, true, partieAvecTech_('Ciblage', true));
  var d = CS.construireCamp('Defenseur', 2, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  // ... mais le premier tir garanti (Ciblage amélioré) le fait quand même frapper en premier.
  assert.ok(r.log.indexOf('Initiative : Attaquant 1 (premier tir garanti) — Defenseur 2.') !== -1);
  assert.ok(r.log.some(function (l) { return l === 'Defenseur rappelle 1 cube de Corvette (Attaquant frappe en premier).'; }));
});

test('resoudreCombat : Ciblage amélioré en défense NE garantit PAS le premier tir si le défenseur n\'a QUE des Sentinelles', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 0, 0, 0, 2, 0, 0, false, {});
  var d = CS.construireCamp('Defenseur', 0, 0, 0, 1, 0, 0, true, partieAvecTech_('Ciblage', true));
  var r = CS.resoudreCombat(a, d);
  // Le défenseur n'a pas d'Initiative dans ce cas précis (Initiative Défenseur = 0, la Sentinelle
  // n'apportant pas d'Initiative en défense) -> l'Attaquant frappe en premier malgré Ciblage amélioré.
  assert.ok(r.log.some(function (l) { return l.indexOf('Initiative : Attaquant 1 — Defenseur 0.') === 0; }));
  assert.ok(r.log.some(function (l) { return l === 'Defenseur rappelle 1 cube de Sentinelle (Attaquant frappe en premier).'; }));
});

test('resoudreCombat : Torpilles (de base) n\'ajoutent 1 Dégât de Salve qu\'à l\'étape 1', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, true, partieAvecTech_('Torpilles'));
  var d = CS.construireCamp('Defenseur', 3, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  var occurrences = r.log.filter(function (l) { return l === 'Attaquant inflige 1 Dégât de Salve supplémentaire (Torpilles).'; });
  assert.strictEqual(occurrences.length, 1);
  assert.ok(r.log.indexOf('--- Salve 2 ---') !== -1, 'le combat doit durer au moins 2 étapes pour ce test');
});

test('resoudreCombat : Torpilles améliorées ajoutent 1 Dégât de Salve à CHAQUE étape', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, true, partieAvecTech_('Torpilles', true));
  var d = CS.construireCamp('Defenseur', 3, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  var occurrences = r.log.filter(function (l) { return l === 'Attaquant inflige 1 Dégât de Salve supplémentaire (Torpilles).'; });
  assert.ok(occurrences.length >= 2, 'attendu au moins 2 étapes avec bonus Torpilles, obtenu ' + occurrences.length);
});

test('resoudreCombat : Cellules énergétiques ajoutent 1 Dégât d\'Approche, mais SEULEMENT si le défenseur en inflige déjà', function () {
  var CS = creerContexte_().CombatService;
  var partieCellules = partieAvecTech_('Cellules énergétiques');

  var a1 = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, false, {});
  var d1 = CS.construireCamp('Defenseur', 0, 0, 0, 0, 0, 1, true, partieCellules); // defenseSecteur=1 -> bonus s'applique
  var r1 = CS.resoudreCombat(a1, d1);
  assert.ok(r1.log.indexOf('Defenseur inflige 1 Dégât d\'Approche supplémentaire (Cellules énergétiques).') !== -1);
  assert.strictEqual(a1.corvette, 1); // 3 - (1 defenseSecteur + 1 bonus) = 1

  var a2 = CS.construireCamp('Attaquant', 3, 0, 0, 0, 0, 0, false, {});
  var d2 = CS.construireCamp('Defenseur', 0, 0, 0, 0, 0, 0, true, partieCellules); // aucun Dégât de base -> pas de bonus
  var r2 = CS.resoudreCombat(a2, d2);
  assert.strictEqual(r2.log.indexOf('Defenseur inflige 1 Dégât d\'Approche supplémentaire (Cellules énergétiques).'), -1);
  assert.strictEqual(a2.corvette, 3);
});

test('resoudreCombat : Destroyers améliorés (attaquant) -> +1 Dégât d\'Approche et une salve de Dégâts égale au nombre de Destroyers à l\'étape 1', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 0, 2, 0, 0, 0, 0, true, partieAvecTech_('Destroyers', true));
  var d = CS.construireCamp('Defenseur', 5, 0, 0, 0, 0, 0, false, {});
  var r = CS.resoudreCombat(a, d);
  assert.ok(r.log.indexOf('Attaquant inflige 1 Dégât d\'Approche (Destroyers améliorés).') !== -1);
  assert.ok(r.log.indexOf('Attaquant inflige 2 Dégât(s) de Salve supplémentaire(s) (Destroyers améliorés).') !== -1);
  // 1 (Approche) + 2 (rafale Destroyers améliorés) = 3 Corvettes perdues sur les 5 avant même
  // l'Initiative normale de l'étape 1 (qui en coûte au moins 1 de plus au défenseur).
  assert.ok(d.corvette <= 5 - 3 - 1, 'le défenseur doit avoir perdu au moins 4 Corvettes sur 5');
  assert.strictEqual(r.vainqueur, a);
});

test('resoudreCombat : Boucliers (attaquant, joueur) absorbe 1 Dégât de Salve même sans Corvette', function () {
  var CS = creerContexte_().CombatService;
  var a = CS.construireCamp('Attaquant', 0, 0, 1, 0, 0, 0, true, partieAvecTech_('Boucliers')); // 1 Cuirassé seul, pas de Corvette
  var d = CS.construireCamp('Defenseur', 2, 0, 0, 0, 0, 0, false, {});
  // Initiative attaquant = 1 (cuirasse) + 1 (bonus cuirasse) = 2 ; défenseur = 2 (2 corvettes) -> égalité -> dégât simultané.
  var r = CS.resoudreCombat(a, d);
  assert.ok(r.log.indexOf('Attaquant absorbe le Dégât (Defenseur (simultané)).') !== -1);
  assert.strictEqual(a.cuirasse, 1, 'le Cuirassé ne doit pas avoir été rappelé, absorbé par Boucliers');
});

test('resoudreCombat : Boucliers (défenseur, joueur) n\'absorbe QUE si le défenseur a encore au moins 1 Corvette', function () {
  var CS = creerContexte_().CombatService;
  var partieBoucliers = partieAvecTech_('Boucliers');

  // Avec 1 Corvette : Boucliers actif -> le Dégât simultané est absorbé, le défenseur gagne.
  var aAvecCorvette = CS.construireCamp('Attaquant', 1, 0, 0, 0, 0, 0, false, {});
  var dAvecCorvette = CS.construireCamp('Defenseur', 1, 0, 0, 0, 0, 0, true, partieBoucliers);
  var rAvecCorvette = CS.resoudreCombat(aAvecCorvette, dAvecCorvette);
  assert.strictEqual(dAvecCorvette.corvette, 1, 'la Corvette du défenseur ne doit pas être rappelée, absorbée par Boucliers');
  assert.strictEqual(rAvecCorvette.vainqueur, dAvecCorvette);

  // Même Initiative (1 vs 1), mais le défenseur n'a qu'un Destroyer, pas de Corvette : Boucliers
  // inactif -> le Dégât simultané n'est PAS absorbé, le Destroyer est rappelé, combat nul.
  var aSansCorvette = CS.construireCamp('Attaquant', 1, 0, 0, 0, 0, 0, false, {});
  var dSansCorvette = CS.construireCamp('Defenseur', 0, 1, 0, 0, 0, 0, true, partieBoucliers);
  var rSansCorvette = CS.resoudreCombat(aSansCorvette, dSansCorvette);
  assert.strictEqual(dSansCorvette.destroyer, 0);
  assert.strictEqual(rSansCorvette.vainqueur, null);
});

// ------------------------------------------------------------
// resoudreInvasion
// ------------------------------------------------------------

test('resoudreInvasion : construit les 2 camps depuis partie/unitesAttaquant/secteurCible et renvoie survivantsAttaquant', function () {
  var CS = creerContexte_().CombatService;
  var partie = { joueur: { nom: 'Rumix', technologieDepart: null }, technologiesObtenues: [] };
  var secteur = { pnNeant: 2, installationDefenseSecteur: 1, installationBaseStellaire: 1 };
  var r = CS.resoudreInvasion(partie, { corvette: 3 }, secteur);

  assert.strictEqual(r.vainqueur.nom, 'Le Néant');
  // JSON.stringify plutôt que deepStrictEqual : r.survivantsAttaquant vient
  // du contexte vm, pas du même realm que ce fichier de test (voir plus
  // haut vaisseauxDebloques).
  assert.strictEqual(JSON.stringify(r.survivantsAttaquant), JSON.stringify({
    corvette: 0, destroyer: 0, cuirasse: 0, sentinelle: 0, portevaisseau: 0
  }));
});

test('resoudreInvasion : unitesAttaquant/secteurCible absents -> traités comme vides (aucune exception)', function () {
  var CS = creerContexte_().CombatService;
  var partie = { joueur: { nom: 'Rumix', technologieDepart: null }, technologiesObtenues: [] };
  var r = CS.resoudreInvasion(partie, undefined, undefined);
  assert.strictEqual(r.vainqueur, null); // aucune unité des deux côtés -> égalité (aucun survivant nulle part)
  assert.strictEqual(JSON.stringify(r.survivantsAttaquant), JSON.stringify({
    corvette: 0, destroyer: 0, cuirasse: 0, sentinelle: 0, portevaisseau: 0
  }));
});

test('resoudreInvasion : victoire de l\'attaquant -> survivantsAttaquant reflète les cubes réellement restants', function () {
  var CS = creerContexte_().CombatService;
  var partie = { joueur: { nom: 'Rumix', technologieDepart: null }, technologiesObtenues: [] };
  var secteur = { pnNeant: 0, installationDefenseSecteur: 0, installationBaseStellaire: 0 };
  var r = CS.resoudreInvasion(partie, { corvette: 2, cuirasse: 1 }, secteur);
  assert.strictEqual(r.vainqueur.nom, 'Rumix');
  assert.strictEqual(JSON.stringify(r.survivantsAttaquant), JSON.stringify({
    corvette: 2, destroyer: 0, cuirasse: 1, sentinelle: 0, portevaisseau: 0
  }));
});
