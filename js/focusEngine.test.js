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
  // EVOLUTION 18 (todo.md) : 'secteursPartie' (clé composée [partieId,
  // numero], convention join('|') identique à secteurService_actions.test.js)
  // ajouté pour tester restaurerMutations_/AnnulationService avec des
  // mutations génériques {store, cle, avant, apres} (pas seulement
  // plateauMaison legacy {champ, avant, apres}).
  var stores = { plateauMaison: {}, pileAnnulation: {}, secteursPartie: {} };
  var prochainId = 1;
  function cleStr_(nom, cle) { return Array.isArray(cle) ? cle.join('|') : cle; }
  return {
    get: function (nom, cle) { return Promise.resolve(stores[nom][cleStr_(nom, cle)] || null); },
    getAll: function (nom) { return Promise.resolve(Object.keys(stores[nom]).map(function (k) { return stores[nom][k]; })); },
    put: function (nom, valeur) {
      if (nom === 'pileAnnulation' && valeur.id === undefined) valeur.id = prochainId++;
      var cle = nom === 'pileAnnulation' ? valeur.id
        : nom === 'secteursPartie' ? [valeur.partieId, valeur.numero]
        : valeur.partieId;
      stores[nom][cleStr_(nom, cle)] = valeur;
      return Promise.resolve(valeur);
    },
    supprimer: function (nom, cle) { delete stores[nom][cleStr_(nom, cle)]; return Promise.resolve(); },
    _stores: stores
  };
}

function creerContexte_() {
  var ctx = { console: console, Promise: Promise, JSON: JSON };
  chargerDansContexte_(__dirname + '/focusEngine.js', ctx);
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

// todo.md (retour utilisateur) — docs-rules-Influence-et-ressources.md §2 :
// substitution Crédit pour un coût en Nourriture/Énergie/Matériel.
test('coût Énergie : réserve suffisante seule -> aucune popup (comportement inchangé)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { science: 1 }, cout: { energie: 3 }, texte: '' }; // PLATEAU_BASE.ressourceEnergie = 5

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 2);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceCredit, PLATEAU_BASE.ressourceCredit); // jamais touché
  });
});

test('coût Énergie : réserve insuffisante -> délègue à demanderChoix({type:"paiement_ressource"}), substitution partielle en Crédit', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { science: 1 }, cout: { energie: 7 }, texte: '' }; // PLATEAU_BASE.ressourceEnergie = 5, manque 2

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'paiement_ressource');
    assert.strictEqual(contexte.ressource, 'energie');
    assert.strictEqual(contexte.montant, 7);
    assert.strictEqual(contexte.stockRessource, 5);
    assert.strictEqual(contexte.stockCredit, 3);
    return { utiliseRessource: 5 }; // 5 Énergie (tout le stock) + 2 Crédit (le reste)
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 0);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceCredit, 1); // 3 - 2
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('dont 2 substitués par Crédit') !== -1; }));
  });
});

test('coût Énergie : le joueur choisit de préserver une partie de la ressource et de payer davantage en Crédit (pas d’obligation de l’épuiser)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  // Manque 1 (stock 5, coût 6) — le strict nécessaire serait "5 Énergie +
  // 1 Crédit", mais le joueur choisit de N'UTILISER QUE 3 Énergie (en
  // garder 2 en réserve) et de payer les 3 restants en Crédit.
  var action = { action: 'Jouer', effet: {}, cout: { energie: 6 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.stockRessource, 5);
    assert.strictEqual(contexte.stockCredit, 3);
    return { utiliseRessource: 3 };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 2); // 5 - 3, 2 préservés
    assert.strictEqual(resultat.plateauMaisonApres.ressourceCredit, 0); // 3 - 3
  });
});

test('coût Énergie : ni la ressource ni le Crédit combinés ne suffisent -> Annuler bloque le Coût (effet déjà réussi conservé)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { science: 1 }, cout: { energie: 20 }, texte: '' }; // stock 5 + crédit 3 = 8, très insuffisant

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'paiement_ressource');
    return { annule: true };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true); // règle métier : coût annulé après effet réussi -> effet conservé
    assert.strictEqual(resultat.plateauMaisonApres.ressourceScience, 3); // effet appliqué
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, PLATEAU_BASE.ressourceEnergie); // coût jamais débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('coût annulé') !== -1; }));
  });
});

test('coût Énergie : substitution jamais déclenchée pour un GAIN (Effet, signe > 0)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { energie: 4 }, cout: {}, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 9);
  });
});

test('coût Science : jamais substituable (aucune popup, clampé comme avant)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: {}, cout: { science: 10 }, texte: '' }; // stock 2, très insuffisant

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceScience, 0); // clampé, comme avant, pas de substitution
    assert.strictEqual(resultat.plateauMaisonApres.ressourceCredit, PLATEAU_BASE.ressourceCredit); // jamais touché
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

test('choix imbriqué (et/ou) : seules les options sélectionnées sont appliquées', function () {
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

test('gagner_prime : crédite jetonPrime directement (case "Gagnez un jeton Prime.")', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Prime', effet: { gagner_prime: 1 }, cout: {}, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.jetonPrime, 1);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('prime') !== -1 && l.indexOf('non automatisé') === -1; }));
  });
});

// Reproduit la chaîne complète "Avancer piste civilisation -> avance
// rapide -> gagner un jeton commerce -> gagner un jeton prime" : le
// Bonus Commerce "Gagnez un jeton Prime." (index 4 de BONUS_COMMERCE)
// doit réellement créditer jetonPrime, pas juste journaliser un rappel
// manuel.
test('gagner_commerce -> Bonus Commerce "Gagnez un jeton Prime." : crédite jetonPrime', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Commerce', effet: { gagner_commerce: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'bonus_commerce');
    return { indexChoisi: 4 }; // "Gagnez un jeton Prime."
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.jetonPrime, 1);
  });
});

// "effet_secteur" sert de témoin pour les clés secteur non automatisées
// (repli générique "effet non chiffré") — "retirer_corruption" ne peut
// pas servir de témoin car elle est portée (voir tests dédiés plus bas) ;
// "rappeler_cube" est écarté aussi : depuis EVOLUTION 13 (todo.md), c'est
// un cas dédié (Coût uniquement, popup 'rappeler_cube_cout' — voir tests
// dédiés plus bas).
test('clé secteur hors périmètre (effet_secteur) : ne bloque pas, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Effet secteur', effet: { effet_secteur: 1 }, cout: { energie: 2 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('effet_secteur') !== -1 && l.indexOf('non automatisé') !== -1; }));
  });
});

// EVOLUTION 13 (todo.md) : "rappeler_cube" comme Coût (ex. Focus
// Développement "Installer" Standard) délègue à demanderChoix
// ({type:'rappeler_cube_cout'}) — PAS au repli générique "cube" (qui
// déciderait à tort de décrémenter cubeActif : un rappel de cube AJOUTE à
// la zone active, il ne consomme pas un cube déjà actif).
test('rappeler_cube (Coût) : succès — délègue à demanderChoix({type:"rappeler_cube_cout"}), journalisé, cubeActif inchangé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Installer', effet: {}, cout: { rappeler_cube: 1 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'rappeler_cube_cout');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Cube de Corvette rappelé depuis le Secteur 3.', numero: 3, type: 'corvette' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, PLATEAU_BASE.cubeActif);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Cube de Corvette rappelé depuis le Secteur 3') !== -1; }));
  });
});

test('rappeler_cube (Coût) : annulé (popup "Annuler") — coût non débité, effet déjà réussi conservé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Installer', effet: { materiel: 1 }, cout: { rappeler_cube: 1 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true); // règle métier : coût annulé après effet réussi -> effet conservé
    assert.strictEqual(resultat.plateauMaisonApres.ressourceMateriel, PLATEAU_BASE.ressourceMateriel + 1);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('coût annulé') !== -1; }));
  });
});

// todo.md (retour utilisateur) : "defausser_gloire" comme Coût (ex. Focus
// Progrès Héroïque "Restaurer") délègue à demanderChoix
// ({type:'defausser_gloire'}) — AUCUN choix utilisateur côté focusEngine
// (la popup détermine elle-même le jeton Gloire de plus petite valeur,
// voir strategieService.js).
test('defausser_gloire (Coût) : succès — délègue à demanderChoix({type:"defausser_gloire"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Restaurer', effet: { regrouper: 1 }, cout: { defausser_gloire: 1 }, texte: '' };

  var demanderChoix = function (contexte) {
    if (contexte.type === 'regrouper') return { deplacements: 1, detail: '1× Corvette 1→2' };
    assert.strictEqual(contexte.type, 'defausser_gloire');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'jeton Gloire 2 défaussé.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('jeton Gloire 2 défaussé') !== -1; }));
  });
});

test('defausser_gloire (Coût) : annulé (popup "Annuler", ex. aucun jeton posé) — coût non débité, effet déjà réussi conservé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Restaurer', effet: { materiel: 1 }, cout: { defausser_gloire: 1 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true); // règle métier : coût annulé après effet réussi -> effet conservé
    assert.strictEqual(resultat.plateauMaisonApres.ressourceMateriel, PLATEAU_BASE.ressourceMateriel + 1);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('coût annulé') !== -1; }));
  });
});

test('envahir : victoire — jetonPrime/jetonLiberation/influence crédités, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Envahir', effet: { envahir: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'envahir');
    assert.strictEqual(contexte.corrompu, false);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return {
      victoire: true, jetonPrime: 1, jetonLiberation: 1, influenceGagnee: 3,
      detail: 'Invasion du secteur 4 (Néant) — VICTOIRE.'
    };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.jetonPrime, 1);
    assert.strictEqual(resultat.plateauMaisonApres.jetonLiberation, 1);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 13); // 10 + 3
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('VICTOIRE') !== -1; }));
  });
});

// EVOLUTION 16 (todo.md) : les cubes perdus au cours d'un combat GAGNÉ
// (engagés mais non survivants) reviennent aussi en Cube actif, pas
// seulement en défaite.
test('envahir : victoire avec pertes — cubesPerdus revient en Cube actif (clampé à 14)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var plateau = Object.assign({}, PLATEAU_BASE, { cubeActif: 2 });
  var action = { action: 'Envahir', effet: { envahir: 1 }, cout: {}, texte: '' };

  var demanderChoix = function () {
    return {
      victoire: true, jetonPrime: 0, jetonLiberation: 0, influenceGagnee: 0,
      totalEngage: 3, cubesPerdus: 2,
      detail: 'Invasion du secteur 4 (Néant) — VICTOIRE, 2 cube(s) perdu(s) au combat reversé(s) en Cube actif.'
    };
  };

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, 4); // 2 + 2 perdus revenus
  });
});

test('envahir_corrompu : défaite — cubeActif restauré (clampé à 14), avertissement journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var plateau = Object.assign({}, PLATEAU_BASE, { cubeActif: 12 });
  var action = { action: 'Envahir', effet: { envahir_corrompu: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.corrompu, true);
    return {
      victoire: false, totalEngage: 5,
      detail: 'Invasion du secteur 7 (Corrompu) — ÉCHEC.',
      avertissement: 'Secteur(s) 2 repris par le Néant — défaussez un jeton Gloire.'
    };
  };

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, 14); // 12 + 5, clampé à 14
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('ÉCHEC') !== -1; }));
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('⚠️') !== -1 && l.indexOf('Gloire') !== -1; }));
  });
});

test('envahir : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Envahir', effet: { envahir: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('regrouper : succès — délègue à demanderChoix({type:"regrouper"}), journalisé, coût débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Regrouper', effet: { regrouper: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'regrouper');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { deplacements: 3, detail: '3× Corvette 1→2' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 3); // coût quand même débité
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Regrouper') !== -1 && l.indexOf('3 déplacement(s)') !== -1; }));
  });
});

test('regrouper : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Regrouper', effet: { regrouper: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "augmenter_population" (SANS "_pure") est la clé utilisée par
// data/catalogue/pistesCivilisation.json et focus.json — à distinguer de
// "augmenter_population_pure" (evenements.json, même mécanique). Même
// gabarit de test que "regrouper" ci-dessus.
test('augmenter_population (piste Civilisation/Focus, sans "_pure") : succès — délègue à demanderChoix({type:"augmenter_population_pure"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { augmenter_population: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'augmenter_population_pure');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Population du Secteur 3 augmentée de 1.', numero: 3 };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Population du Secteur 3 augmentée de 1') !== -1; }));
  });
});

test('augmenter_population : annulé (popup "Annuler") — bloque toute l\u2019action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { augmenter_population: 1 }, cout: {}, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
  });
});

test('augmenter_population et augmenter_population_pure : même comportement (choice inclusif "et/ou")', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  // texte contient "et/ou" -> choice inclusif (options_inclusives), les 2 clés résolues à tour de rôle
  var action = {
    action: 'Jouer',
    effet: { choice: ['augmenter_population', 'augmenter_population_pure'] },
    cout: {},
    texte: 'Augmentez une Population Pure et/ou augmentez une Population Pure.'
  };

  var appelsPopup = 0;
  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1]; // les 2 options
    appelsPopup++;
    assert.strictEqual(contexte.type, 'augmenter_population_pure');
    return { detail: 'Population du Secteur ' + appelsPopup + ' augmentée de 1.', numero: appelsPopup };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(appelsPopup, 2, 'les 2 clés (population/population_pure) doivent chacune ouvrir la popup');
  });
});

// "retirer_corruption" délègue à demanderChoix({type:'retirer_corruption'})
// — la popup (strategieService.js) fait le choix ET la persistance (comme
// "regrouper"/"augmenter_population_pure" ci-dessus), resoudreCle_ ne fait
// que relayer reponse.detail.
test('retirer_corruption : succès — délègue à demanderChoix({type:"retirer_corruption"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { retirer_corruption: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'retirer_corruption');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Corruption retirée du Secteur 4.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Corruption retirée du Secteur 4') !== -1; }));
  });
});

test('retirer_corruption : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { retirer_corruption: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "gain_corruption" délègue à demanderChoix({type:'gagner_corruption'})
// (voir docs-rules-corruption-gardiens-refuges-technoConsume.md) — miroir
// exact de retirer_corruption ci-dessus, même contrat (la popup fait le
// choix ET la persistance, resoudreCle_ ne fait que relayer
// reponse.detail).
test('gain_corruption : succès — délègue à demanderChoix({type:"gagner_corruption"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gain_corruption: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_corruption');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Corruption placée sur le Secteur 4.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Corruption placée sur le Secteur 4') !== -1; }));
  });
});

test('gain_corruption : annulé (popup "Annuler") — bloque toute l’action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gain_corruption: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// EVOLUTION 10 — "deplacer_corruption" délègue à
// demanderChoix({type:'deplacer_corruption'}) — même contrat que
// retirer_corruption/gain_corruption ci-dessus (la popup, strategieService.js,
// fait le choix ET la persistance des 2 étapes — source ET destination —
// resoudreCle_ ne fait que relayer reponse.detail).
test('deplacer_corruption : succès — délègue à demanderChoix({type:"deplacer_corruption"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { deplacer_corruption: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'deplacer_corruption');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Corruption déplacée de Secteur 4 vers Secteur 7.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Corruption déplacée de Secteur 4 vers Secteur 7') !== -1; }));
  });
});

test('deplacer_corruption : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { deplacer_corruption: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('deplacer_corruption et/ou augmenter_population (choice inclusif) : les 2 clés ouvrent chacune leur popup', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  // Reproduit focus.json id 81 (Zenor — "Répliquer") : { choice: [
  // "deplacer_corruption", "augmenter_population" ] }, texte "et/ou" ->
  // choice inclusif (options_inclusives), les 2 clés résolues à tour de rôle.
  var action = {
    action: 'Jouer',
    effet: { choice: ['deplacer_corruption', 'augmenter_population'] },
    cout: {},
    texte: 'Déplacez une Corruption et/ou augmentez une Population Pure.'
  };

  var appelsPopup = 0;
  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1]; // les 2 options
    appelsPopup++;
    if (contexte.type === 'deplacer_corruption') return { detail: 'Corruption déplacée de Secteur 4 vers Secteur 7.' };
    assert.strictEqual(contexte.type, 'augmenter_population_pure');
    return { detail: 'Population du Secteur 2 augmentée de 1.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(appelsPopup, 2, 'les 2 clés (deplacer_corruption/augmenter_population) doivent chacune ouvrir la popup');
  });
});

// EVOLUTION 11 (todo.md, retour utilisateur — bug reproduit avec Focus
// Conquête "Planifier" — focus.json id 2 : { choice: ["gagner_programme",
// "deplacer_corruption"] }, texte "et/ou") : sélectionner les 2 options
// via options_inclusives PUIS Annuler la popup nichée de l'UNE d'elles
// (ici gagner_programme, la 1re résolue) doit bloquer TOUTE l'action —
// le Coût ne doit JAMAIS être débité. Avant correctif, la branche
// inclusive de resoudreCle_ ignorait délibérément ("tolérant") le
// résultat `false` d'une option nichée annulée et retournait toujours
// `true`, donc l'Effet était considéré réussi et le Coût débité malgré
// l'annulation — bug corrigé (voir focusEngine.js, commentaire EVOLUTION 11).
test('choice et/ou : Annuler UNE option nichée parmi 2 sélectionnées bloque TOUTE l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Conquête' };
  var action = {
    action: 'Planifier',
    effet: { choice: ['gagner_programme', 'deplacer_corruption'] },
    cout: { credit: 1, energie: 1 },
    texte: 'Gagnez un Programme et/ou déplacez une Corruption.'
  };

  var appelDeplacerCorruption = false;
  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1]; // les 2 options
    if (contexte.type === 'gagner_programme') return { annule: true }; // 1re option annulée
    if (contexte.type === 'deplacer_corruption') appelDeplacerCorruption = true;
    return { detail: 'ne devrait jamais être atteint' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false, 'toute l\u2019action doit être bloquée, pas seulement la 1re option');
    assert.strictEqual(resultat.mutations.length, 0, 'aucune mutation, y compris le Coût (credit/energie)');
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE, 'état renvoyé inchangé (référence identique)');
    assert.strictEqual(appelDeplacerCorruption, false, '2e option (deplacer_corruption) jamais résolue après l\u2019annulation de la 1re');
  });
});

test('choice et/ou : Annuler la 2e option nichée (après succès de la 1re) bloque aussi TOUTE l\u2019action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Conquête' };
  var action = {
    action: 'Planifier',
    effet: { choice: ['gagner_programme', 'deplacer_corruption'] },
    cout: { credit: 1, energie: 1 },
    texte: 'Gagnez un Programme et/ou déplacez une Corruption.'
  };

  var demanderChoix = function (contexte) {
    if (contexte.type === 'options_inclusives') return [0, 1];
    if (contexte.type === 'gagner_programme') return { detail: 'Programme Domination obtenu.' };
    if (contexte.type === 'deplacer_corruption') return { annule: true }; // 2e option annulée
    return { detail: 'ne devrait jamais être atteint' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0, 'le succès de la 1re option seule ne doit rien persister si la 2e est annulée');
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "gagner_programme" délègue à demanderChoix({type:'gagner_programme'}) —
// même contrat que gain_corruption/retirer_corruption ci-dessus (la popup,
// strategieService.js, fait le choix ET la persistance via
// GameService.gagnerProgramme). `typeImpose` distingue une valeur
// numérique générique (1, tous types ouverts, null transmis) d'une valeur
// de type imposée (chaîne "force"/"soutien"/"domination"/"richesse",
// capitalisée pour matcher data/catalogue/programmes.json).
test('gagner_programme (valeur 1) : délègue à demanderChoix({type:"gagner_programme", typeImpose:null}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gagner_programme: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_programme');
    assert.strictEqual(contexte.partieId, 'partie-test');
    assert.strictEqual(contexte.typeImpose, null);
    return { detail: 'Programme "Haute Société" (Domination) obtenu.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Programme "Haute Société" (Domination) obtenu') !== -1; }));
  });
});

test('gagner_programme "force" : délègue à demanderChoix avec typeImpose:"Force" (capitalisé)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gagner_programme: 'force' }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_programme');
    assert.strictEqual(contexte.typeImpose, 'Force');
    return { detail: 'Programme "Poigne de Fer" (Force) obtenu.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Poigne de Fer') !== -1; }));
  });
});

// Vocabulaire alternatif rencontré dans focus.json : une clé bare
// "programme_force"/"programme_richesse"/etc. (au lieu de
// "gagner_programme":"force") — même résolution, type imposé dérivé de la
// CLÉ plutôt que de la valeur.
test('programme_force (clé bare) : délègue à demanderChoix avec typeImpose:"Force"', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { programme_force: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'gagner_programme');
    assert.strictEqual(contexte.typeImpose, 'Force');
    return { detail: 'Programme "Poigne de Fer" (Force) obtenu.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
  });
});

test('gagner_programme : annulé (popup "Annuler") — bloque toute l’action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { gagner_programme: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "avancer_civilisation_moins_avancee" (action de Programme de type
// Force, voir gameService.js EFFET_PROGRAMME_PAR_TYPE_) délègue à la MÊME
// popup 'avancer_civilisation' que ci-dessus, avec un flag
// `moinsAvancee:true` plutôt qu'une `piste` imposée — c'est la popup
// (strategieService.js) qui calcule quelle piste est la moins avancée,
// pas focusEngine.js.
test('avancer_civilisation_moins_avancee : succès — délègue à demanderChoix avec piste:null, moinsAvancee:true', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_moins_avancee: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.piste, null);
    assert.strictEqual(contexte.moinsAvancee, true);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Piste Économie : niveau 0 -> 1.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('niveau 0') !== -1; }));
  });
});

// EVOLUTION todo.md (retour utilisateur, Focus Héroïque Renfort
// "Accélérer", focus.json id 106) : quand "avancer_civilisation_moins_
// avancee" est nichée dans un objet {tie_break:"au_choix",
// avancer_civilisation_moins_avancee:1} (clé SŒUR, même objet), la popup
// doit être informée (contexte.tieBreakAuChoix:true) pour proposer un
// choix parmi les pistes à égalité plutôt que l'ordre fixe silencieux.
test('avancer_civilisation_moins_avancee avec clé sœur tie_break:"au_choix" -> contexte.tieBreakAuChoix:true', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Renfort' };
  var action = {
    action: 'Accélérer',
    cout: {},
    effet: { tie_break: 'au_choix', avancer_civilisation_moins_avancee: 1 },
    texte: ''
  };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.moinsAvancee, true);
    assert.strictEqual(contexte.tieBreakAuChoix, true);
    return { detail: 'Piste Économie : niveau 0 -> 1.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
  });
});

test('avancer_civilisation_moins_avancee SANS tie_break -> contexte.tieBreakAuChoix:false (comportement par défaut inchangé)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_moins_avancee: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.tieBreakAuChoix, false);
    return { detail: 'Piste Économie : niveau 0 -> 1.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
  });
});

test('avancer_civilisation_moins_avancee : annulé -> bloque toute l\'action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_moins_avancee: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "influence_valeur_gloire" résolue entièrement en pur (voir
// docs-architecture-pwa.md) — aucun demanderChoix appelé
// (demanderChoixSansPopup_ jetterait si c'était le cas), somme des
// jetons Gloire (null ignorés).
test('influence_valeur_gloire : somme des jetons Gloire créditée, résolue en pur (aucun demanderChoix)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_valeur_gloire: 1 }, cout: {}, texte: '' };
  var plateau = Object.assign({}, PLATEAU_BASE, { gloire: [3, null, 5, null, 2] });

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 20); // 10 (initial) + 10 (3+5+2)
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('+10 influence') !== -1 && l.indexOf('Gloire') !== -1; }));
  });
});

// "influence_par_technologie_amelioree" résolue entièrement en pur —
// combine les 3 sources de Technologies possédées (départ, emplacements
// obtenus, avancées choisies).
test('influence_par_technologie_amelioree : combine les 3 sources, résolue en pur (aucun demanderChoix)', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_technologie_amelioree: 6 }, cout: {}, texte: '' };
  var plateau = Object.assign({}, PLATEAU_BASE, {
    technologieDepart: 'Chambres de décontamination', technologieDepartAmelioree: true,
    technologiesObtenues: [{ nom: 'Cuirassés', amelioree: true }, null, { nom: 'Boucliers', amelioree: false }, null, null],
    technologiesAvanceesChoisies: ['Torpilles', null, null, null],
    technologiesAvanceesAmeliorees: { Torpilles: true }
  });

  return ctx.FocusEngine.resoudreAction(plateau, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    // 3 améliorées : départ + Cuirassés (obtenue) + Torpilles (avancée) ; Boucliers non améliorée ignorée.
    assert.strictEqual(resultat.plateauMaisonApres.influence, 28); // 10 (initial) + 18 (3 × 6)
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('+18 influence') !== -1 && l.indexOf('3 technologie(s) améliorée(s)') !== -1; }));
  });
});

// Les 9 clés "influence_par_*" nécessitant un comptage sur les secteurs
// délèguent à demanderChoix({type:'influence_secteur'}) — calcul
// déterministe, aucun choix utilisateur, la popup (strategieService.js)
// fait le calcul ET résout {montant, detail}.
test('influence_par_guilde_pure : délègue à demanderChoix({type:"influence_secteur"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_guilde_pure: 2 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'influence_secteur');
    assert.strictEqual(contexte.formule, 'influence_par_guilde_pure');
    assert.strictEqual(contexte.valeur, 2);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { montant: 8, detail: '8 Influence (4 Guilde(s) Pure(s) × 2).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 18); // 10 + 8
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('4 Guilde(s) Pure(s)') !== -1; }));
  });
});

// "influence_par_guilde" a une forme différente (tableau de clés Guilde,
// pas un nombre) — transmis tel quel à la popup via contexte.valeur.
test('influence_par_guilde : transmet le tableau de clés Guilde tel quel', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_guilde: ['scientifique_pur', 'banquier_pur'] }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.formule, 'influence_par_guilde');
    assert.strictEqual(JSON.stringify(contexte.valeur), JSON.stringify(['scientifique_pur', 'banquier_pur']));
    return { montant: 3, detail: '3 Influence (Guildes Pures de Scientifiques/Banquiers — 3 au total).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.influence, 13); // 10 + 3
  });
});

test('influence_par_secteur_pur : annulé (popup "Annuler") — bloque toute l’action', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { influence_par_secteur_pur: 2 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "produire_<ressource>" (ressource imposée par le nom de la clé, ex.
// Focus Production "Ravitailler" — produire_energie/materiel/nourriture)
// délègue à demanderChoix({type:'produire_revenu'}) — calcul déterministe
// (revenu de production actuel), aucun choix utilisateur, la popup
// (strategieService.js) fait le calcul ET résout {montant, detail}. Même
// contrat que influence_secteur ci-dessus.
test('produire_energie : délègue à demanderChoix({type:"produire_revenu", ressource:"energie"}), journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Production' };
  var action = { action: 'Ravitailler', effet: { produire_energie: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'produire_revenu');
    assert.strictEqual(contexte.ressource, 'energie');
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { montant: 4, detail: '+4 Énergie (Production, Niveau 6).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 9); // 5 + 4
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('+4 Énergie') !== -1; }));
  });
});

// Ravitailler combine 3 clés produire_* dans la même option "choice" —
// chacune est résolue indépendamment (son propre appel à demanderChoix),
// toutes les 3 doivent créditer la bonne ressource.
test('Ravitailler (produire_energie + produire_materiel + produire_nourriture ensemble) : crédite les 3 ressources', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Production' };
  var action = {
    action: 'Ravitailler',
    effet: { produire_energie: 1, produire_materiel: 1, produire_nourriture: 1 },
    cout: {}, texte: ''
  };

  var montantParRessource = { energie: 4, materiel: 3, nourriture: 2 };
  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'produire_revenu');
    var montant = montantParRessource[contexte.ressource];
    return { montant: montant, detail: '+' + montant + ' ' + contexte.ressource + ' (Production).' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.ressourceEnergie, 9); // 5 + 4
    assert.strictEqual(resultat.plateauMaisonApres.ressourceMateriel, 8); // 5 + 3
    assert.strictEqual(resultat.plateauMaisonApres.ressourceNourriture, 7); // 5 + 2
  });
});

test('produire_credit : annulé (popup "Annuler") — bloque toute l’action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { produire_credit: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

// "produire_ressource"/"produire_deux_ressources" (CHOIX du joueur parmi
// les 5 ressources) restent hors périmètre — pas de popup de sélection
// construite, contrairement à produire_<ressource> (ressource imposée)
// ci-dessus.
test('produire_ressource (choix du joueur) : reste hors périmètre, ne bloque pas, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { produire_ressource: 1 }, cout: {}, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('non automatisé') !== -1; }));
    // EVOLUTION 12 : l'action a réussi (succes:true) malgré l'effet hors
    // périmètre — elle est donc marquée utilisée (actionsFocusUtilisees),
    // seule mutation produite ici (aucune ressource n'est réellement
    // modifiée par cet effet non automatisé).
    assert.strictEqual(resultat.mutations.length, 1);
    assert.strictEqual(resultat.mutations[0].champ, 'actionsFocusUtilisees');
    assert.strictEqual(JSON.stringify(resultat.plateauMaisonApres.actionsFocusUtilisees), JSON.stringify(['Test — Jouer']));
  });
});

// "avancer_civilisation" (piste au choix) et les 3 variantes
// "avancer_civilisation_<piste>" (piste imposée) délèguent à
// demanderChoix({type:'avancer_civilisation', piste}) — la popup
// (strategieService.js) fait le choix ET la persistance (comme
// "regrouper"/"retirer_corruption" ci-dessus), resoudreCle_ ne fait que
// relayer reponse.detail.
test('avancer_civilisation (piste au choix) : succès — délègue à demanderChoix avec piste:null, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.piste, null);
    assert.strictEqual(contexte.partieId, 'partie-test');
    return { detail: 'Piste Gouvernement : niveau 1 \u2192 2 \u2014 Gagnez un Programme.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Piste Gouvernement : niveau 1') !== -1; }));
  });
});

test('avancer_civilisation_gouvernement (piste imposée) : succès — délègue à demanderChoix avec piste:"gouvernement"', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation_gouvernement: 1 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'avancer_civilisation');
    assert.strictEqual(contexte.piste, 'gouvernement');
    return { detail: 'Piste Gouvernement : niveau 2 \u2192 3.' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('niveau 2 \u2192 3') !== -1; }));
  });
});

test('avancer_civilisation_societe / avancer_civilisation_economie : piste imposée correcte pour chacune', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var pistesRecues = [];
  var demanderChoix = function (contexte) { pistesRecues.push(contexte.piste); return { detail: 'ok' }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, { action: 'Jouer', effet: { avancer_civilisation_societe: 1 }, cout: {}, texte: '' }, demanderChoix)
    .then(function () {
      return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, { action: 'Jouer', effet: { avancer_civilisation_economie: 1 }, cout: {}, texte: '' }, demanderChoix);
    })
    .then(function () {
      assert.deepStrictEqual(pistesRecues, ['societe', 'economie']);
    });
});

test('avancer_civilisation : annulé (popup "Annuler") — bloque toute l\u2019action, coût jamais débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Jouer', effet: { avancer_civilisation: 1 }, cout: { energie: 2 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('deployer_cube (mode libre) : succès — cubeActif ET coût ressource débités, journalisé', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Déployer', effet: { deployer_cube: 2 }, cout: {}, texte: '' };

  var demanderChoix = function (contexte) {
    assert.strictEqual(contexte.type, 'deployer_cube');
    assert.strictEqual(contexte.mode, 'libre');
    assert.strictEqual(contexte.quantiteDemandee, 2);
    assert.strictEqual(contexte.cubeActif, PLATEAU_BASE.cubeActif);
    assert.strictEqual(contexte.ressourceMateriel, PLATEAU_BASE.ressourceMateriel);
    // 1 Corvette (gratuite) + 1 Cuirassé (1 Matériel/cube, voir
    // COUT_DEPLOIEMENT_PAR_TYPE côté strategieService.js)
    return { totalCubes: 2, coutParRessource: { materiel: 1 }, detail: '1× Corvette → secteur 3, 1× Cuirasse → secteur 3' };
  };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, 0); // 2 - 2
    assert.strictEqual(resultat.plateauMaisonApres.ressourceMateriel, 4); // 5 - 1
    assert.ok(resultat.journal.some(function (l) { return l.indexOf('Déployer') !== -1 && l.indexOf('coût : 1 materiel') !== -1; }));
  });
});

test('deployer_cube_par_chantier : mode transmis, "deployer_cube_secteur_mere" idem', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };

  var actionChantier = { action: 'Déployer', effet: { deployer_cube_par_chantier: 1 }, cout: {}, texte: '' };
  var demanderChoixChantier = function (contexte) {
    assert.strictEqual(contexte.mode, 'par_chantier');
    return { totalCubes: 1, coutParRessource: {}, detail: '1× Corvette → secteur 5' };
  };
  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, actionChantier, demanderChoixChantier).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);

    var actionMere = { action: 'Déployer', effet: { deployer_cube_secteur_mere: 1 }, cout: {}, texte: '' };
    var demanderChoixMere = function (contexte) {
      assert.strictEqual(contexte.mode, 'secteur_mere');
      return { totalCubes: 1, coutParRessource: {}, detail: '1× Corvette → secteur 1' };
    };
    return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, actionMere, demanderChoixMere);
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
  });
});

test('deployer_cube : annulé (popup "Annuler") — bloque toute l\u2019action, rien débité', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Déployer', effet: { deployer_cube: 2 }, cout: { energie: 1 }, texte: '' };

  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.mutations.length, 0);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
  });
});

test('deployer_cube côté Coût (signe < 0, cas non prévu par le livret) : retombe sur le traitement générique "cube"', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Test' };
  var action = { action: 'Test', effet: {}, cout: { deployer_cube: 1 }, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    // Pas de popup ouverte (demanderChoixSansPopup_ jetterait) : la clé
    // est traitée par le repli générique "cube" (consomme cubeActif).
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(resultat.plateauMaisonApres.cubeActif, PLATEAU_BASE.cubeActif - 1);
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

// ------------------------------------------------------------
// EVOLUTION 12 — Limite d'utilisation d'une action Focus par cycle
// (todo.md, retour utilisateur) : plateauMaison.actionsFocusUtilisees
// (voir focusEngine.js — CHAMPS_DIFF_SUIVIS/resoudreAction) accumule la
// clé "Focus — Action" de chaque action Focus jouée avec succès CE
// cycle ; strategieService.js s'en sert pour griser le bouton et
// signaler le Focus concerné (au moins 1 action utilisée). Réinitialisé
// à chaque changement de cycle par GameService.avancerCycle. Passe par
// le même mécanisme diff/undo que le reste du plateau : annuler la
// dernière action retire AUTOMATIQUEMENT sa clé, sans code dédié côté
// AnnulationService — vérifié ci-dessous par une intégration complète
// resoudreAction + AnnulationService.
// ------------------------------------------------------------

test('EVOLUTION 12 — une action réussie est ajoutée à actionsFocusUtilisees (clé "Focus — Action")', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Politique' };
  var action = { action: 'Contrôler', effet: { credit: 1 }, cout: {}, texte: '' };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(JSON.stringify(resultat.plateauMaisonApres.actionsFocusUtilisees), JSON.stringify(['Politique — Contrôler']));
    assert.ok(resultat.mutations.some(function (m) { return m.champ === 'actionsFocusUtilisees'; }));
  });
});

test('EVOLUTION 12 — une action annulée (Effet refusé) n\u2019est PAS marquée utilisée', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Politique' };
  var action = { action: 'Contrôler', effet: { retirer_corruption: 1 }, cout: {}, texte: '' };
  var demanderChoix = function () { return { annule: true }; };

  return ctx.FocusEngine.resoudreAction(PLATEAU_BASE, carte, action, demanderChoix).then(function (resultat) {
    assert.strictEqual(resultat.succes, false);
    assert.strictEqual(resultat.plateauMaisonApres, PLATEAU_BASE);
    assert.strictEqual(resultat.plateauMaisonApres.actionsFocusUtilisees, undefined);
  });
});

test('EVOLUTION 12 — rejouer la MÊME action (déjà marquée) ne duplique pas la clé, aucune mutation superflue', function () {
  var ctx = creerContexte_();
  var carte = { focus: 'Politique' };
  var action = { action: 'Contrôler', effet: { credit: 1 }, cout: {}, texte: '' };
  var plateauAvecActionDejaUtilisee = Object.assign({}, PLATEAU_BASE, { actionsFocusUtilisees: ['Politique — Contrôler'] });

  return ctx.FocusEngine.resoudreAction(plateauAvecActionDejaUtilisee, carte, action, demanderChoixSansPopup_).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    assert.strictEqual(JSON.stringify(resultat.plateauMaisonApres.actionsFocusUtilisees), JSON.stringify(['Politique — Contrôler']));
    // Contenu inchangé (même référence de clé) -> diffChamps_ (comparaison
    // par CONTENU, pas par référence) ne doit PAS remonter de mutation.
    assert.strictEqual(resultat.mutations.some(function (m) { return m.champ === 'actionsFocusUtilisees'; }), false);
  });
});

test('EVOLUTION 12 — undo de la DERNIÈRE action rétablit SEULEMENT l\u2019utilisabilité de celle-ci, pas des autres', function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

  var carte = { focus: 'Politique' };
  var actionControler = { action: 'Contrôler', effet: { credit: 1 }, cout: {}, texte: '' };
  var actionImposer = { action: 'S\u2019imposer', effet: { credit: 1 }, cout: {}, texte: '' };

  return dbFactice.put('plateauMaison', Object.assign({}, PLATEAU_BASE)).then(function () {
    return ctx.FocusEngine.resoudreAction(dbFactice._stores.plateauMaison['partie-test'], carte, actionControler, demanderChoixSansPopup_);
  }).then(function (resultat1) {
    assert.strictEqual(resultat1.succes, true);
    return dbFactice.put('plateauMaison', resultat1.plateauMaisonApres).then(function () {
      return ctx.AnnulationService.empiler('partie-test', { source: 'Politique — Contrôler', mutations: resultat1.mutations });
    });
  }).then(function () {
    return ctx.FocusEngine.resoudreAction(dbFactice._stores.plateauMaison['partie-test'], carte, actionImposer, demanderChoixSansPopup_);
  }).then(function (resultat2) {
    assert.strictEqual(resultat2.succes, true);
    // Les 2 actions accumulées après la 2e.
    assert.strictEqual(
      JSON.stringify(resultat2.plateauMaisonApres.actionsFocusUtilisees),
      JSON.stringify(['Politique — Contrôler', 'Politique — S\u2019imposer'])
    );
    return dbFactice.put('plateauMaison', resultat2.plateauMaisonApres).then(function () {
      return ctx.AnnulationService.empiler('partie-test', { source: 'Politique — S\u2019imposer', mutations: resultat2.mutations });
    });
  }).then(function () {
    return ctx.AnnulationService.annulerDerniere('partie-test');
  }).then(function (resultatAnnulation) {
    assert.strictEqual(resultatAnnulation.succes, true);
    assert.strictEqual(resultatAnnulation.source, 'Politique — S\u2019imposer');
    return dbFactice.get('plateauMaison', 'partie-test');
  }).then(function (ligne) {
    // "Contrôler" reste marqué utilisé (le Focus garde son picto),
    // "S'imposer" a retrouvé son utilisabilité (bouton non grisé) —
    // reproduit exactement le test demandé (todo.md EVOLUTION 12).
    assert.strictEqual(JSON.stringify(ligne.actionsFocusUtilisees), JSON.stringify(['Politique — Contrôler']));
  });
});

test("annulation en chaîne : dernière puis avant-dernière", function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

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
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

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

// EVOLUTION 18 (todo.md, retour utilisateur) : format générique {store,
// cle, avant, apres} (db.js, DB.demarrerEnregistrement/put) — restaure la
// ligne COMPLÈTE d'un store autre que plateauMaison (ex. secteursPartie),
// pas juste un champ. Vérifie aussi la cohabitation avec le format legacy
// {champ, avant, apres} dans une MÊME entrée de pile.
test('annulerDerniere : mutation générique {store, cle, avant, apres} restaure la ligne complète (secteursPartie)', function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

  return dbFactice.put('secteursPartie', { partieId: 'partie-test', numero: 3, pnCorvette: 5, corrompu: false }).then(function () {
    return dbFactice.put('secteursPartie', { partieId: 'partie-test', numero: 3, pnCorvette: 2, corrompu: true });
  }).then(function () {
    return ctx.AnnulationService.empiler('partie-test', {
      source: 'Conquête — Planifier',
      mutations: [{ store: 'secteursPartie', cle: ['partie-test', 3], avant: { partieId: 'partie-test', numero: 3, pnCorvette: 5, corrompu: false }, apres: { partieId: 'partie-test', numero: 3, pnCorvette: 2, corrompu: true } }]
    });
  }).then(function () {
    return ctx.AnnulationService.annulerDerniere('partie-test');
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    return dbFactice.get('secteursPartie', ['partie-test', 3]);
  }).then(function (secteur) {
    assert.strictEqual(secteur.pnCorvette, 5);
    assert.strictEqual(secteur.corrompu, false);
  });
});

test('annulerDerniere : mutations mixtes (plateauMaison legacy + secteursPartie générique) dans la même entrée', function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

  return dbFactice.put('plateauMaison', Object.assign({}, PLATEAU_BASE, { programmesEnMain: [] })).then(function () {
    return dbFactice.put('secteursPartie', { partieId: 'partie-test', numero: 4, corrompu: false });
  }).then(function () {
    return dbFactice.put('plateauMaison', Object.assign({}, PLATEAU_BASE, { programmesEnMain: ['Rebellion'] }));
  }).then(function () {
    return dbFactice.put('secteursPartie', { partieId: 'partie-test', numero: 4, corrompu: true });
  }).then(function () {
    return ctx.AnnulationService.empiler('partie-test', {
      source: 'Conquête — Planifier',
      mutations: [
        { champ: 'programmesEnMain', avant: [], apres: ['Rebellion'] },
        { store: 'secteursPartie', cle: ['partie-test', 4], avant: { partieId: 'partie-test', numero: 4, corrompu: false }, apres: { partieId: 'partie-test', numero: 4, corrompu: true } }
      ]
    });
  }).then(function () {
    return ctx.AnnulationService.annulerDerniere('partie-test');
  }).then(function (resultat) {
    assert.strictEqual(resultat.succes, true);
    return Promise.all([
      dbFactice.get('plateauMaison', 'partie-test'),
      dbFactice.get('secteursPartie', ['partie-test', 4])
    ]);
  }).then(function (resultats) {
    assert.strictEqual(JSON.stringify(resultats[0].programmesEnMain), JSON.stringify([]));
    assert.strictEqual(resultats[1].corrompu, false);
  });
});

test('AnnulationService.restaurerMutations : ligne inexistante avant l’action (avant=null) -> supprimée par l’annulation', function () {
  var ctx = creerContexte_();
  var dbFactice = creerDbFactice_();
  ctx.DB = dbFactice;
  chargerDansContexte_(__dirname + '/annulationService.js', ctx);

  return dbFactice.put('secteursPartie', { partieId: 'partie-test', numero: 7, corrompu: true }).then(function () {
    return ctx.AnnulationService.restaurerMutations('partie-test', [
      { store: 'secteursPartie', cle: ['partie-test', 7], avant: null, apres: { partieId: 'partie-test', numero: 7, corrompu: true } }
    ]);
  }).then(function () {
    return dbFactice.get('secteursPartie', ['partie-test', 7]);
  }).then(function (secteur) {
    assert.strictEqual(secteur, null);
  });
});
