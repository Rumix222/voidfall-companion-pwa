/**
 * e2e/partie-aleatoire.spec.js
 * Scénario de bout en bout SEMI-ALÉATOIRE : joue une partie complète (3
 * cycles + fin de partie) en cliquant réellement dans le DOM, pour une
 * maison donnée. À chaque cycle : choix de l'Événement galactique,
 * résolution de tous les Cadres cliquables, choix des 3 Focus héroïques,
 * choix d'1 technologie obtenue, 2 actions de Focus jouées.
 *
 * Ne vise PAS l'exhaustivité combinatoire (irréaliste : maisons ×
 * événements × technologies × focus × ordre des actions) mais une large
 * couverture *reproductible* : chaque run est piloté par un seed (voir
 * e2e/helpers/aleatoire.js) journalisé dans son rapport
 * (e2e/rapports/<maison>-seed<seed>.md, voir e2e/helpers/rapport.js) —
 * un run en échec peut donc être rejoué à l'identique pour debugger.
 *
 * Paramétrage (variables d'environnement) :
 * - E2E_MAISON=<nom>          ne teste qu'une seule maison (sinon : toutes
 *                             celles de data/catalogue/maisons.json).
 * - E2E_SEEDS=<n>             nombre de seeds par maison (défaut 1).
 * - E2E_SEED=<n>              force un seed précis (avec E2E_MAISON, pour
 *                             rejouer exactement un run en échec — ignore
 *                             E2E_SEEDS et E2E_CAMPAGNE_SEED).
 * - E2E_CAMPAGNE_SEED=<n>     fait varier l'exploration par défaut d'une
 *                             campagne à l'autre (défaut 1, donc campagne
 *                             stable/reproductible tant qu'on ne le
 *                             change pas — voir note déterminisme).
 *
 * Note déterminisme : les seeds par défaut sont dérivés uniquement de
 * (maison, E2E_CAMPAGNE_SEED, index de répétition) — PAS de Math.random()
 * ni Date.now(). Nécessaire : Playwright charge ce fichier une fois pour
 * lister les tests puis une seconde fois par worker pour les exécuter —
 * un titre de test dépendant d'un aléa non seedé change entre les deux
 * passes ("Test not found in the worker process").
 *
 * Exemples :
 *   npm run test:e2e:aleatoire                                    (14 maisons × 1 seed, déterministe)
 *   E2E_SEEDS=3 npm run test:e2e:aleatoire                        (14 maisons × 3 seeds)
 *   E2E_CAMPAGNE_SEED=2 npm run test:e2e:aleatoire                (autre campagne déterministe)
 *   E2E_MAISON=Fenrax npm run test:e2e:aleatoire                  (1 maison × 1 seed)
 *   E2E_MAISON=Fenrax E2E_SEED=123456 npm run test:e2e:aleatoire  (rejoue un run précis)
 */
var test = require('@playwright/test').test;
var expect = require('@playwright/test').expect;
var maisonsCatalogue = require('../data/catalogue/maisons.json');
var creerRng = require('./helpers/aleatoire').creerRng;
var ecrireRapport = require('./helpers/rapport').ecrireRapport;
var interactions = require('./helpers/interactions');

var NB_CYCLES = 3;
var NB_ACTIONS_FOCUS_PAR_CYCLE = 2;

var toutesLesMaisons = maisonsCatalogue.map(function (m) { return m.nom; });
var maisonsATester = process.env.E2E_MAISON ? [process.env.E2E_MAISON] : toutesLesMaisons;
var nbSeeds = process.env.E2E_SEED ? 1 : (Number(process.env.E2E_SEEDS) || 1);
var graineCampagne = Number(process.env.E2E_CAMPAGNE_SEED) || 1;

/** Hash de chaîne déterministe (FNV-1a) — aucun aléa, même résultat à chaque chargement du fichier. */
function hashChaine_(texte) {
  var h = 2166136261;
  for (var i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedsPour_(maison) {
  if (process.env.E2E_SEED) return [Number(process.env.E2E_SEED)];
  var base = (hashChaine_(maison) ^ Math.imul(graineCampagne, 0x9E3779B1)) >>> 0;
  var seeds = [];
  for (var i = 0; i < nbSeeds; i++) seeds.push((base + i * 2654435761) >>> 0);
  return seeds;
}

test.describe('Partie aléatoire complète (3 cycles + fin de partie)', function () {
  maisonsATester.forEach(function (maison) {
    seedsPour_(maison).forEach(function (seed) {

      test('Maison ' + maison + ' — seed ' + seed, async function ({ page }) {
        test.setTimeout(120000);

        var rng = creerRng(seed);
        var journal = {
          maison: maison,
          seed: seed,
          dateDebut: new Date().toISOString(),
          resultat: 'échec (interrompu)',
          erreurFatale: null,
          erreursConsole: [],
          ecranScoreAtteint: false,
          cycles: []
        };

        page.on('pageerror', function (erreur) { journal.erreursConsole.push(erreur.message); });
        page.on('console', function (msg) {
          if (msg.type() === 'error') journal.erreursConsole.push(msg.text());
        });

        try {
          await page.goto('/');

          // Étape obligatoire : importer le catalogue en IndexedDB.
          await page.click('#btn-sync-catalogue');
          await expect(page.locator('#btn-sync-catalogue')).toHaveText('Synchroniser le catalogue', { timeout: 15000 });

          // Création de partie : maison ciblée, mode manuel simple (pas
          // de mise en place manuelle — technologie de départ et
          // maisons déchues tirées par le moteur).
          await page.click('#btn-nouvelle-partie');
          await expect(page.locator('#select-maison')).toBeEnabled({ timeout: 10000 });
          await page.selectOption('#select-maison', maison);
          await page.click('#btn-lancer-partie');
          await expect(page.locator('#screen-plateau-galactique')).toBeVisible();

          for (var cycle = 1; cycle <= NB_CYCLES; cycle++) {
            var cycleLog = {
              numero: cycle,
              evenement: null,
              cadresResolus: 0,
              cadresRestants: 0,
              focusHeroiques: [],
              technologie: null,
              actionsFocus: [],
              avertissements: []
            };

            await page.click('#nav-plateau-galactique');
            await expect(page.locator('#screen-plateau-galactique')).toBeVisible();

            cycleLog.evenement = await interactions.choisirEvenementAleatoire(page, rng);

            var resultatCadres = await interactions.resoudreCadresDisponibles(page, rng, cycleLog.avertissements);
            cycleLog.cadresResolus = resultatCadres.resolus;
            cycleLog.cadresRestants = resultatCadres.restants;

            cycleLog.focusHeroiques = await interactions.choisirFocusHeroiquesAleatoire(page, rng);

            await page.click('#nav-plateau-maison');
            await expect(page.locator('#screen-plateau-maison')).toBeVisible();
            cycleLog.technologie = await interactions.choisirUneTechnologieAleatoire(page, rng);

            await page.click('#nav-focus');
            await expect(page.locator('#screen-focus')).toBeVisible();
            for (var a = 0; a < NB_ACTIONS_FOCUS_PAR_CYCLE; a++) {
              var actionJouee = await interactions.jouerUneActionFocusAleatoire(page, rng, cycleLog.avertissements);
              if (actionJouee) {
                cycleLog.actionsFocus.push(actionJouee);
              } else {
                cycleLog.avertissements.push('Aucune action Focus jouable (action ' + (a + 1) + '/' + NB_ACTIONS_FOCUS_PAR_CYCLE + ').');
                break;
              }
            }

            journal.cycles.push(cycleLog);

            await page.click('#nav-plateau-galactique');
            await expect(page.locator('#screen-plateau-galactique')).toBeVisible();
            await page.click('#btn-fin-cycle');
            // #btn-fin-cycle ouvre désormais la popup "Phase Évaluation"
            // (paiement de l'Entretien) avant d'avancer le cycle — voir
            // interactions.resoudrePhaseEvaluation.
            await interactions.resoudrePhaseEvaluation(page);
            // Cycle 3 déclenche automatiquement l'écran de fin (voir
            // listener #btn-fin-cycle, index.html) — attente large.
            await page.waitForTimeout(400);
          }

          await expect(page.locator('#screen-fin')).toBeVisible({ timeout: 10000 });
          journal.ecranScoreAtteint = true;

          expect(journal.erreursConsole, 'Aucune erreur JS ne doit survenir pendant tout le parcours : ' + journal.erreursConsole.join(' | ')).toEqual([]);

          journal.resultat = 'ok';
        } catch (erreur) {
          journal.erreurFatale = erreur.message;
          throw erreur;
        } finally {
          var cheminRapport = ecrireRapport(journal);
          await test.info().attach('rapport-partie-aleatoire', { path: cheminRapport, contentType: 'text/markdown' });
        }
      });

    });
  });
});
