/**
 * e2e/helpers/rapport.js
 * Écrit un rapport Markdown lisible pour chaque run du scénario aléatoire
 * (e2e/partie-aleatoire.spec.js), sous e2e/rapports/ (généré, ignoré par
 * git — voir .gitignore). Un fichier par (maison, seed), pour pouvoir
 * inspecter après coup ce qui a été testé et dans quel ordre, et
 * reproduire un run en échec via son seed.
 */
var fs = require('fs');
var path = require('path');

var DOSSIER_RAPPORTS = path.join(__dirname, '..', 'rapports');

function slug_(texte) {
  return String(texte).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function ligneEtape_(etape) {
  return '  - ' + etape;
}

function ecrireRapport(journal) {
  if (!fs.existsSync(DOSSIER_RAPPORTS)) fs.mkdirSync(DOSSIER_RAPPORTS, { recursive: true });

  var nomFichier = slug_(journal.maison) + '-seed' + journal.seed + '.md';
  var cheminFichier = path.join(DOSSIER_RAPPORTS, nomFichier);

  var lignes = [];
  lignes.push('# Rapport de partie aléatoire — ' + journal.maison + ' (seed ' + journal.seed + ')');
  lignes.push('');
  lignes.push('Date : ' + journal.dateDebut);
  lignes.push('Résultat : **' + journal.resultat + '**');
  if (journal.erreurFatale) lignes.push('Erreur fatale : ' + journal.erreurFatale);
  lignes.push('Erreurs JS console/page : ' + (journal.erreursConsole.length ? journal.erreursConsole.length : 'aucune'));
  journal.erreursConsole.forEach(function (e) { lignes.push('  - ' + e); });
  lignes.push('');
  lignes.push('Pour rejouer exactement ce run : `E2E_MAISON="' + journal.maison + '" E2E_SEED=' + journal.seed + ' npm run test:e2e:aleatoire`');
  lignes.push('');

  journal.cycles.forEach(function (cycle) {
    lignes.push('## Cycle ' + cycle.numero);
    lignes.push('- Événement choisi : ' + (cycle.evenement || '(aucun disponible)'));
    lignes.push('- Cadres résolus : ' + cycle.cadresResolus + (cycle.cadresRestants ? ' (' + cycle.cadresRestants + ' non résolus, voir avertissements)' : ''));
    lignes.push('- Focus héroïques choisis : ' + (cycle.focusHeroiques.length ? cycle.focusHeroiques.join(', ') : '(aucun disponible)'));
    lignes.push('- Technologie obtenue choisie : ' + (cycle.technologie || '(aucune disponible)'));
    lignes.push('- Actions Focus jouées : ' + (cycle.actionsFocus.length ? '' : '(aucune jouable)'));
    cycle.actionsFocus.forEach(function (a) { lignes.push(ligneEtape_(a)); });
    if (cycle.avertissements.length) {
      lignes.push('- ⚠️ Avertissements :');
      cycle.avertissements.forEach(function (a) { lignes.push(ligneEtape_(a)); });
    }
    lignes.push('');
  });

  lignes.push('## Fin de partie');
  lignes.push('- Écran de score atteint : ' + (journal.ecranScoreAtteint ? 'oui' : 'non'));
  lignes.push('');

  fs.writeFileSync(cheminFichier, lignes.join('\n'), 'utf8');

  // Une ligne par run dans un journal agrégé (append), pour un coup d'œil
  // rapide sur toute une campagne (plusieurs maisons/seeds d'affilée).
  var ligneResume = [
    journal.dateDebut, journal.maison, 'seed=' + journal.seed, journal.resultat,
    journal.erreursConsole.length + ' erreur(s) JS'
  ].join(' | ') + '\n';
  fs.appendFileSync(path.join(DOSSIER_RAPPORTS, '_resume.log'), ligneResume, 'utf8');

  return cheminFichier;
}

module.exports = { ecrireRapport: ecrireRapport };
