/**
 * e2e/helpers/interactions.js
 * Helpers d'interaction DOM pour le scénario aléatoire (e2e/partie-aleatoire.spec.js).
 * Principe général : ne jamais réimplémenter les règles du jeu. La modale
 * générique #modal-choix (js/strategieService.js, demanderChoix) ne
 * propose déjà que des options valides — il suffit de choisir au hasard
 * parmi ce que le DOM expose comme actionnable (bouton présent, <option>
 * non vide, absence de la classe -insuffisant).
 *
 * Chaque helper est tolérant à l'absence de choix possible (ex. aucune
 * action Focus jouable ce tour) : il consigne un avertissement dans le
 * cycle du journal plutôt que d'échouer — l'objectif est d'avancer le
 * plus loin possible dans la partie et de rapporter ce qui a été (ou
 * n'a pas pu être) testé, pas de bloquer tout le run sur un cas limite.
 */

var TIMEOUT_COURT = 5000;

function modaleOuverte_(page) {
  return page.locator('#modal-choix').isVisible().catch(function () { return false; });
}

/**
 * Résout une seule étape de la modale #modal-choix si elle est ouverte.
 * Retourne true si une action a été effectuée (la modale peut rester
 * ouverte pour une étape suivante — cas des choix en cascade), false si
 * rien n'était ouvert.
 */
async function resoudreUneEtapeModale_(page, rng, avertissements) {
  if (!(await modaleOuverte_(page))) return false;

  var contenu = page.locator('#modal-choix-contenu');

  // 1. Liste de boutons (le clic résout directement le choix).
  var boutonsListe = contenu.locator('.btn-choix-liste, .btn-choix-liste-proportionnel');
  var nbBoutons = await boutonsListe.count();
  if (nbBoutons > 0) {
    var i = rng.entierEntre(0, nbBoutons - 1);
    await boutonsListe.nth(i).click();
    return true;
  }

  // 2. Select(s) — on renseigne tous ceux visibles avec une valeur
  // aléatoire parmi les options non vides, puis on valide si possible
  // (certains flux affichent le bouton Valider seulement une fois tous
  // les selects renseignés).
  var selects = contenu.locator('select');
  var nbSelects = await selects.count();
  if (nbSelects > 0) {
    var auMoinsUnChoix = false;
    for (var s = 0; s < nbSelects; s++) {
      var select = selects.nth(s);
      var valeurs = await select.locator('option:not([disabled])').evaluateAll(function (options) {
        return options.map(function (o) { return o.value; }).filter(function (v) { return v; });
      });
      if (valeurs.length) {
        await select.selectOption(rng.choisirParmi(valeurs));
        auMoinsUnChoix = true;
      }
    }
    var btnValider = page.locator('#modal-choix-valider');
    if (await btnValider.isVisible().catch(function () { return false; })) {
      var desactive = await btnValider.isDisabled().catch(function () { return false; });
      if (!desactive) {
        await btnValider.click();
        return true;
      }
    }
    if (auMoinsUnChoix) return true; // laisse une chance à la cascade de se stabiliser
  }

  // 3. Confirmation / texte seul.
  var btnValider2 = page.locator('#modal-choix-valider');
  if (await btnValider2.isVisible().catch(function () { return false; })) {
    await btnValider2.click();
    return true;
  }

  // 4. Rien d'exploitable : on n'abandonne pas la partie pour autant.
  avertissements.push('Modale ouverte sans option exploitable détectée — Annuler.');
  await page.locator('#modal-choix-annuler').click();
  return true;
}

/**
 * Vide toute chaîne de popups ouvertes (une résolution peut en enchaîner
 * une autre — ex. avancée de piste en cascade). Plafonné pour ne jamais
 * boucler indéfiniment sur un cas imprévu.
 */
async function viderModalesOuvertes(page, rng, avertissements) {
  var MAX_ETAPES = 15;
  for (var i = 0; i < MAX_ETAPES; i++) {
    var aAgi = await resoudreUneEtapeModale_(page, rng, avertissements);
    if (!aAgi) return;
    await page.waitForTimeout(80);
  }
  if (await modaleOuverte_(page)) {
    avertissements.push('Modale encore ouverte après ' + MAX_ETAPES + ' étapes — abandon (forcé via Annuler).');
    await page.locator('#modal-choix-annuler').click().catch(function () {});
  }
}

/**
 * Choisit un Événement galactique au hasard pour le cycle en cours, si le
 * <select> dédié propose au moins une option (peut être verrouillé si un
 * Cadre a déjà été appliqué — appeler ce helper avant de résoudre les
 * Cadres).
 */
async function choisirEvenementAleatoire(page, rng) {
  var select = page.locator('#select-evenement-cycle');
  if (!(await select.isVisible().catch(function () { return false; }))) return null;
  if (await select.isDisabled().catch(function () { return false; })) return null;

  var valeurs = await select.locator('option').evaluateAll(function (options) {
    return options.map(function (o) { return { valeur: o.value, texte: o.textContent }; }).filter(function (o) { return o.valeur; });
  });
  if (!valeurs.length) return null;

  var choix = rng.choisirParmi(valeurs);
  await select.selectOption(choix.valeur);
  await page.waitForTimeout(150);
  return choix.texte.trim();
}

/**
 * Résout tous les Cadres d'Événement actuellement cliquables, un par un
 * (chaque clic peut ouvrir #modal-choix). Retourne { resolus, restants }.
 */
async function resoudreCadresDisponibles(page, rng, avertissements) {
  var MAX_CADRES = 10;
  var resolus = 0;

  for (var i = 0; i < MAX_CADRES; i++) {
    var cartes = page.locator('#evenement-cadres .cadre-carte-cliquable');
    var nb = await cartes.count();
    if (!nb) break;

    var index = rng.entierEntre(0, nb - 1);
    await cartes.nth(index).click();
    await page.waitForTimeout(120);
    await viderModalesOuvertes(page, rng, avertissements);
    resolus++;

    // Sécurité anti-boucle : si le nombre de cartes cliquables n'a pas
    // diminué après résolution, on arrête pour ne pas boucler sans fin.
    var nbApres = await page.locator('#evenement-cadres .cadre-carte-cliquable').count();
    if (nbApres >= nb) {
      avertissements.push('Un Cadre est resté cliquable après résolution — arrêt de la boucle Cadres.');
      break;
    }
  }

  var restants = await page.locator('#evenement-cadres .cadre-carte-cliquable').count();
  return { resolus: resolus, restants: restants };
}

/**
 * Choisit un Focus héroïque au hasard pour chacun des 3 emplacements non
 * encore choisis (#plateau-galactique-focus-heroiques). Le DOM est
 * ré-interrogé à chaque itération (chaque choix déclenche un re-rendu
 * complet du conteneur, voir renderFocusHeroiques_).
 */
async function choisirFocusHeroiquesAleatoire(page, rng) {
  var choisis = [];
  for (var slot = 0; slot < 3; slot++) {
    var select = page.locator('.select-focus-heroique[data-slot="' + slot + '"]');
    if (!(await select.count())) continue;
    if (await select.inputValue().catch(function () { return ''; })) continue; // déjà choisi

    var valeurs = await select.locator('option').evaluateAll(function (options) {
      return options.map(function (o) { return o.value; }).filter(function (v) { return v; });
    });
    if (!valeurs.length) continue;

    var choix = rng.choisirParmi(valeurs);
    await select.selectOption(choix);
    await page.waitForTimeout(150);
    choisis.push(choix);
  }
  return choisis;
}

/**
 * Choisit UNE technologie obtenue au hasard, parmi les emplacements
 * encore vides (#technologies-obtenues-liste, écran Plat. maison).
 */
async function choisirUneTechnologieAleatoire(page, rng) {
  var selects = page.locator('.select-technologie-obtenue');
  var nb = await selects.count();
  var slotsVides = [];
  for (var i = 0; i < nb; i++) {
    var valeur = await selects.nth(i).inputValue().catch(function () { return ''; });
    if (!valeur) slotsVides.push(i);
  }
  if (!slotsVides.length) return null;

  var slotChoisi = rng.choisirParmi(slotsVides);
  var select = selects.nth(slotChoisi);
  var valeurs = await select.locator('option').evaluateAll(function (options) {
    return options.map(function (o) { return o.value; }).filter(function (v) { return v; });
  });
  if (!valeurs.length) return null;

  var choix = rng.choisirParmi(valeurs);
  await select.selectOption(choix);
  await page.waitForTimeout(150);
  return choix;
}

/**
 * Joue UNE action Focus jouable au hasard (carte Focus joueur ou Focus
 * héroïque du cycle, écran #screen-focus), résout la popup éventuelle.
 * Retourne un libellé décrivant l'action jouée, ou null si aucune action
 * n'était jouable (coûts insuffisants partout).
 */
async function jouerUneActionFocusAleatoire(page, rng, avertissements) {
  var boutons = page.locator('#screen-focus .focus-action:not(.focus-action-insuffisant) .btn-jouer-action');
  var nb = await boutons.count();
  if (!nb) return null;

  var index = rng.entierEntre(0, nb - 1);
  var bouton = boutons.nth(index);
  var carte = await bouton.evaluate(function (btn) {
    var carteEl = btn.closest('.focus-card');
    var nomAction = btn.closest('.focus-action').querySelector('.focus-action-nom');
    return (carteEl ? carteEl.querySelector('h3').textContent : '?') + ' — ' + (nomAction ? nomAction.textContent : '?');
  });

  await bouton.click();
  await page.waitForTimeout(120);
  await viderModalesOuvertes(page, rng, avertissements);
  return carte;
}

module.exports = {
  viderModalesOuvertes: viderModalesOuvertes,
  choisirEvenementAleatoire: choisirEvenementAleatoire,
  resoudreCadresDisponibles: resoudreCadresDisponibles,
  choisirFocusHeroiquesAleatoire: choisirFocusHeroiquesAleatoire,
  choisirUneTechnologieAleatoire: choisirUneTechnologieAleatoire,
  jouerUneActionFocusAleatoire: jouerUneActionFocusAleatoire,
  TIMEOUT_COURT: TIMEOUT_COURT
};
