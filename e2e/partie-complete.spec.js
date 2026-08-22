/**
 * e2e/partie-complete.spec.js
 * Parcours de bout en bout dans un vrai navigateur (Playwright), rejouable
 * via `npm run test:e2e`. Contrairement aux tests js/*.test.js (moteur pur,
 * IndexedDB factice via vm), ceci exerce le DOM réel : index.html,
 * service-worker.js, App.afficherEcran, et tous les écrans de rendu.
 *
 * Chaque test tourne dans un contexte navigateur neuf (stockage/IndexedDB
 * vide, aucun Service Worker déjà enregistré) — pas besoin de gérer le
 * Piège n°1 manuellement.
 *
 * Capture aussi toute erreur JS console/page pendant tout le parcours : ce
 * test aurait détecté le Piège n°2 (ReferenceError silencieux sur un appel
 * cross-fichier à une fonction de rendu privée) et le bug de navigation de
 * scoreVueService.js documentés dans docs/docs-rapport.md.
 */
var test = require('@playwright/test').test;
var expect = require('@playwright/test').expect;

test.describe('Parcours complet : création de partie et navigation', function () {
  test('crée une partie et navigue sur tous les écrans sans erreur JS', async function ({ page }) {
    var erreursConsole = [];
    page.on('pageerror', function (erreur) { erreursConsole.push(erreur.message); });
    page.on('console', function (msg) {
      if (msg.type() === 'error') erreursConsole.push(msg.text());
    });

    await page.goto('/');
    await expect(page.locator('#screen-home')).toBeVisible();

    // Étape obligatoire avant toute création de partie : le catalogue
    // (data/catalogue/*.json) doit être importé en IndexedDB.
    await page.click('#btn-sync-catalogue');
    await expect(page.locator('#btn-sync-catalogue')).toHaveText('Synchroniser le catalogue', { timeout: 15000 });
    await expect(page.locator('#etat-catalogue')).toContainText('maisons :');

    // Création d'une partie en mode manuel simple : maison par défaut
    // (première option, triée par complexité), sans mise en place manuelle.
    await page.click('#btn-nouvelle-partie');
    await expect(page.locator('#screen-setup')).toBeVisible();
    await expect(page.locator('#select-maison')).toBeEnabled({ timeout: 10000 });
    await page.click('#btn-lancer-partie');

    // La création atterrit sur Plat. Galactique (cycle 1).
    await expect(page.locator('#screen-plateau-galactique')).toBeVisible();
    await expect(page.locator('#nav-plateau-galactique')).toHaveClass(/active/);
    await expect(page.locator('#plateau-galactique-cycle')).toHaveText('1');

    // Parcourt tous les écrans de la partie (nav) : chacun doit s'afficher
    // sans laisser l'écran précédent visible ni lever d'erreur JS.
    var onglets = ['mise-en-place', 'plateau-maison', 'focus', 'secteurs', 'combat', 'plateau-galactique'];
    for (var i = 0; i < onglets.length; i++) {
      var nom = onglets[i];
      await page.click('#nav-' + nom);
      await expect(page.locator('#screen-' + nom)).toBeVisible();
    }

    expect(erreursConsole, 'Aucune erreur JS ne doit survenir pendant tout le parcours : ' + erreursConsole.join(' | ')).toEqual([]);
  });
});
