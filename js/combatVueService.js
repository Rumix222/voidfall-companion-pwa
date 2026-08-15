/**
 * combatVueService.js
 * Écran Combat — Voidfall Companion PWA
 * Version 1 — 17/08/2026 (Session 6, Phase 5 — Combat/Invasion)
 *
 * Portage DOM de la partie interface de combat.html (GAS, render_/setMode_/
 * simuler_/afficherDetails_/init/chargerPartie) — la logique de résolution
 * elle-même vit dans js/combatService.js (pur, testable en Node). Séparé
 * de js/strategieService.js : écran indépendant, pas de dépendance à
 * focusEngine.js/annulationService.js (le combat ne touche aucun champ
 * persisté — c'est un calculateur, le joueur applique le résultat
 * manuellement sur le plateau physique/l'écran Secteurs, comme prévu tant
 * que les actions secteur restent hors périmètre — voir combatService.js
 * en-tête).
 *
 * Simplification par rapport à combat.html : "Détails" utilise
 * window.alert() (le composant modal-info générique de strategie.html/
 * index-2.html GAS n'existe pas dans cette PWA — pas construit cette
 * session, aurait élargi le périmètre au-delà de Combat/Invasion).
 *
 * Dépend de : js/combatService.js (moteur pur, à charger avant ce
 * fichier) et de l'objet global App défini dans index.html
 * (App.getPartieCourante).
 */

var CombatVueService = (function () {
  'use strict';

  var modeCombat = 'envahir';
  var dernierLog = [];

  function champHTML_(id, label) {
    return '<div class="combat-champ"><label for="' + id + '">' + label + '</label>' +
      '<input type="number" id="' + id + '" min="0" value="0" inputmode="numeric"></div>';
  }

  function idVaisseau_(prefixe, vaisseau) {
    return prefixe + '-' + vaisseau.trim().toLowerCase().replace(/\s+/g, '-');
  }

  function champsFlotteHTML_(prefixe, vaisseaux) {
    var html = champHTML_(prefixe + '-corvette', 'Corvette');
    vaisseaux.forEach(function (vaisseau) {
      html += champHTML_(idVaisseau_(prefixe, vaisseau), vaisseau);
    });
    return html;
  }

  function lireEntier_(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    return Math.max(0, parseInt(el.value, 10) || 0);
  }

  function render_() {
    var partie = App.getPartieCourante();
    if (!partie) return;

    var vaisseaux = CombatService.vaisseauxDebloques(partie);
    var champsAttaquant = document.getElementById('combat-champs-attaquant');
    var champsDefenseur = document.getElementById('combat-champs-defenseur');

    if (modeCombat === 'envahir') {
      champsAttaquant.innerHTML = champsFlotteHTML_('combat-attaquant', vaisseaux);
      champsDefenseur.innerHTML =
        champHTML_('combat-defenseur-neant', 'Force du néant') +
        champHTML_('combat-defenseur-defense-secteur', 'Défense de secteur');
    } else {
      champsAttaquant.innerHTML = champHTML_('combat-attaquant-neant', 'Force du néant');
      champsDefenseur.innerHTML =
        champsFlotteHTML_('combat-defenseur', vaisseaux) +
        champHTML_('combat-defenseur-defense-secteur', 'Défense de secteur');
    }

    document.getElementById('combat-resultat').innerHTML = '';
  }

  function setMode_(mode) {
    modeCombat = mode;
    document.getElementById('mode-envahir').classList.toggle('active', mode === 'envahir');
    document.getElementById('mode-escarmouche').classList.toggle('active', mode === 'escarmouche');
    render_();
  }

  function simuler_() {
    var partie = App.getPartieCourante();
    if (!partie) return;

    var nomJoueur = partie.joueur.nom;
    var attaquant, defenseur;

    if (modeCombat === 'envahir') {
      attaquant = CombatService.construireCamp(
        nomJoueur,
        lireEntier_(idVaisseau_('combat-attaquant', 'Corvette')),
        lireEntier_(idVaisseau_('combat-attaquant', 'Destroyers')),
        lireEntier_(idVaisseau_('combat-attaquant', 'Cuirassés')),
        lireEntier_(idVaisseau_('combat-attaquant', 'Sentinelles')),
        lireEntier_(idVaisseau_('combat-attaquant', 'Porte-Vaisseaux')),
        0,
        true, partie
      );
      defenseur = CombatService.construireCamp(
        'Le Néant',
        lireEntier_('combat-defenseur-neant'), 0, 0, 0, 0,
        lireEntier_('combat-defenseur-defense-secteur'),
        false, partie
      );
    } else {
      attaquant = CombatService.construireCamp(
        'Le Néant',
        lireEntier_('combat-attaquant-neant'), 0, 0, 0, 0, 0,
        false, partie
      );
      defenseur = CombatService.construireCamp(
        nomJoueur,
        lireEntier_(idVaisseau_('combat-defenseur', 'Corvette')),
        lireEntier_(idVaisseau_('combat-defenseur', 'Destroyers')),
        lireEntier_(idVaisseau_('combat-defenseur', 'Cuirassés')),
        lireEntier_(idVaisseau_('combat-defenseur', 'Sentinelles')),
        lireEntier_(idVaisseau_('combat-defenseur', 'Porte-Vaisseaux')),
        lireEntier_('combat-defenseur-defense-secteur'),
        true, partie
      );
    }

    var resultat = CombatService.resoudreCombat(attaquant, defenseur);
    dernierLog = resultat.log;

    document.getElementById('combat-resultat').innerHTML = resultat.vainqueur
      ? '<div class="card"><h3 style="margin:0 0 6px;">' + resultat.vainqueur.nom + ' gagne</h3>' +
        '<p class="hint" style="margin:0;">' + resultat.cubesRestants + ' cube(s) de Puissance Navale restant(s).</p></div>'
      : '<div class="card"><h3 style="margin:0 0 6px;">Égalité</h3><p class="hint" style="margin:0;">Aucun survivant des deux côtés.</p></div>';
  }

  function afficherDetails_() {
    if (!dernierLog.length) {
      window.alert('Aucun détail disponible pour le moment. Lancez d\'abord une simulation.');
      return;
    }
    window.alert(dernierLog.join('\n'));
  }

  /**
   * (Ré)initialise l'écran pour la partie courante — appelée par
   * App.ouvrirPartie (voir index.html), comme StrategieService.afficher.
   */
  function afficher(partie) {
    setMode_(modeCombat);
  }

  document.getElementById('mode-envahir').addEventListener('click', function () { setMode_('envahir'); });
  document.getElementById('mode-escarmouche').addEventListener('click', function () { setMode_('escarmouche'); });
  document.getElementById('btn-simuler-combat').addEventListener('click', simuler_);
  document.getElementById('btn-details-combat').addEventListener('click', afficherDetails_);

  return { afficher: afficher };
})();
