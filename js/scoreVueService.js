/**
 * scoreVueService.js
 * Écran Fin de partie — Voidfall Companion PWA
 *
 * La logique de calcul vit dans js/scoreService.js (pur, testable en
 * Node) — ce fichier ne fait que lire les champs, afficher un total en
 * direct (aperçu, le calcul faisant foi étant fait par
 * ScoreService.enregistrerFinDePartie), et appeler l'API.
 *
 * Simplification : le résultat final s'affiche via window.alert() (pas
 * de modal-info générique dans cette PWA, même choix pour
 * combatVueService.js).
 *
 * Dépend de : js/scoreService.js (à charger avant ce fichier) et de
 * l'objet global App défini dans index.html (App.getPartieCourante).
 */

var ScoreVueService = (function () {
  'use strict';

  var CHAMPS_INFLUENCE = [
    { cle: 'secteursFaille', label: 'Secteurs de Faille sur le plateau' },
    { cle: 'refugesIncomplets', label: 'Refuges incomplets' },
    { cle: 'catastrophes', label: 'Jetons Catastrophe (plateau Crise, côté droit)' },
    { cle: 'gardiens', label: 'Jetons Gardien (plateau central)' },
    { cle: 'technologiesConsommees', label: 'Cartes Technologie Consumée' },
    { cle: 'crisesPermanentes', label: 'Cartes Crise permanente (plateau Crise)' },
    { cle: 'maisonsDechues', label: 'Cartes Maison Déchue sur des secteurs' },
    { cle: 'corruption', label: 'Jetons Corruption (tous emplacements)' },
    { cle: 'populationNeant', label: 'Population dans les secteurs du Néant' }
  ];

  var LIBELLES_VAINQUEUR = { joueur: 'Victoire du joueur', neant: 'Victoire du Néant', egalite: 'Égalité' };

  function lireCompteurs_() {
    var compteurs = { difficulteBase: Number(document.getElementById('influence-difficulte').value) || 0 };
    CHAMPS_INFLUENCE.forEach(function (champ) {
      var el = document.getElementById('influence-' + champ.cle);
      compteurs[champ.cle] = el ? (Number(el.value) || 0) : 0;
    });
    return compteurs;
  }

  function majTotalAffiche_() {
    document.getElementById('influence-total').textContent = ScoreService.calculerInfluence(lireCompteurs_()).total;
  }

  function construireFormulaire_() {
    var container = document.getElementById('influence-champs');
    container.innerHTML = CHAMPS_INFLUENCE.map(function (champ) {
      var estAutomatisable = ScoreService.CLES_COMPTEURS_AUTOMATISABLES.indexOf(champ.cle) !== -1;
      return '<div class="field"><label for="influence-' + champ.cle + '">' + champ.label +
        ' <span class="field-points">(' + ScoreService.BAREME[champ.cle] + ' pts)</span>' +
        (estAutomatisable ? ' <span class="field-auto">pré-rempli, à vérifier</span>' : '') +
        '</label>' +
        '<input type="number" min="0" step="1" value="0" id="influence-' + champ.cle + '" class="influence-input"></div>';
    }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.influence-input'), function (input) {
      input.addEventListener('input', majTotalAffiche_);
    });
  }

  // Pré-remplit les compteurs automatisables (secteurs de Faille,
  // Gardiens, Maisons Déchues, Population du Néant, Corruption connue de
  // l'app) depuis l'état de la partie — les champs restent modifiables,
  // le joueur ajuste selon le plateau physique (catastrophes, crises
  // permanentes, refuges, technologies consumées, difficulté de base :
  // aucune trace en base, restent à saisir entièrement à la main).
  function preremplirCompteursAutomatiques_(partieId) {
    return ScoreService.calculerCompteursAutomatiques(partieId).then(function (compteurs) {
      Object.keys(compteurs).forEach(function (cle) {
        var el = document.getElementById('influence-' + cle);
        if (el) el.value = compteurs[cle];
      });
      majTotalAffiche_();
    }).catch(function (erreur) {
      console.warn('ScoreVueService : échec du pré-remplissage automatique des compteurs d\'Influence :', erreur);
    });
  }

  // Le score du joueur EST l'Influence accumulée sur Plat. maison (seule
  // utilité de l'Influence, docs-rules-Influence-et-ressources.md §1 —
  // tout gain de score en cours de partie, y compris l'évaluation des
  // Objectifs/Programmes, passe par ce même cadran). Pré-rempli depuis un
  // rechargement frais (pas partieCourante en mémoire, potentiellement
  // périmé après une action Focus) — champ laissé modifiable.
  function preremplirScoreFinal_(partieId) {
    return GameService.obtenirPartie(partieId).then(function (partie) {
      var influence = partie && partie.plateauMaison ? partie.plateauMaison.ressources.influence : null;
      if (influence !== null && influence !== undefined) {
        document.getElementById('fin-score-final').value = influence;
      }
    }).catch(function (erreur) {
      console.warn('ScoreVueService : échec du pré-remplissage du score final :', erreur);
    });
  }

  function ouvrirEcranFin_() {
    var partie = App.getPartieCourante();
    if (!partie) return;
    document.getElementById('fin-score-final').value = '';
    document.getElementById('influence-difficulte').value = '';
    construireFormulaire_();
    majTotalAffiche_();
    App.afficherEcran('fin');
    preremplirScoreFinal_(partie.id);
    preremplirCompteursAutomatiques_(partie.id);
  }

  function enregistrer_() {
    var partie = App.getPartieCourante();
    if (!partie) { App.afficherEcran('home'); return; }

    var btn = document.getElementById('btn-enregistrer-fin');
    if (btn.disabled) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    var scoreFinal = document.getElementById('fin-score-final').value;
    var compteurs = lireCompteurs_();

    ScoreService.enregistrerFinDePartie(partie.id, scoreFinal, compteurs)
      .then(function (partieMaj) {
        var fin = partieMaj.finDePartie;
        window.alert(
          LIBELLES_VAINQUEUR[fin.vainqueur] + '\n\n' +
          'Score joueur : ' + fin.scoreFinal + '\n' +
          'Influence du Néant : ' + fin.influence.total
        );
        document.dispatchEvent(new Event('voidfall:retour-accueil'));
      })
      .catch(function (erreur) {
        window.alert('Échec de l\'enregistrement : ' + erreur.message);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  document.getElementById('btn-terminer-partie').addEventListener('click', ouvrirEcranFin_);
  document.getElementById('btn-retour-fin').addEventListener('click', function () { App.afficherEcran('plateau-galactique'); });
  document.getElementById('btn-enregistrer-fin').addEventListener('click', enregistrer_);
  // Le total affiché doit aussi se mettre à jour quand la difficulté
  // change, pas seulement via les champs du barème.
  document.getElementById('influence-difficulte').addEventListener('change', majTotalAffiche_);

  return {};
})();
