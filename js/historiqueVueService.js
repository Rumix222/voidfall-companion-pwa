/**
 * historiqueVueService.js
 * Écran Historique — Voidfall Companion PWA
 * Version 3 — 21/08/2026 (docs/docs-rapport.md CM-7 — retrait de l'export ouvrirHistorique jamais appelé)
 *
 * Version 2 — 17/08/2026 (Lot G — corrections mineures, suite)
 *
 * 17/08/2026 (Lot G — corrections mineures, suite) : libellé du bouton
 * "Archiver (protéger du « Tout supprimer »)" simplifié en "Archiver"
 * (3 occurrences — rendu initial + les 2 bascules de texte après clic) ;
 * "Technologies disponibles (maisons déchues)" -> "Technologies
 * disponibles" (le "(maisons déchues)" était redondant, la seule source
 * de Technologies disponibles étant justement les maisons déchues).
 * Décisions purement textuelles, aucun changement de comportement.
 *
 * Portage DOM du bloc "Historique" de score.html (GAS) —
 * carteHistoriqueHTML/ouvrirHistorique/init (partie reprendre/archiver/
 * supprimer/tout-supprimer). La donnée enrichie (événements, technologies
 * disponibles/acquises, vainqueur) vient de ScoreService.getHistorique()
 * (pur, déjà livré et testé en Phase 5). Remplace la simple liste
 * "Parties enregistrées" (Continuer/Archiver/Supprimer) qui vivait sur
 * l'écran d'accueil depuis la Session 4 — même logique
 * archiver/supprimer, reprise ici telle quelle, enrichie de l'affichage
 * détaillé par partie.
 *
 * Simplification par rapport à score.html : les confirmations utilisent
 * window.confirm()/window.alert() (pas de modal-info/modal-confirm
 * génériques dans cette PWA — même choix déjà fait pour
 * combatVueService.js/scoreVueService.js).
 *
 * Dépend de : js/gameService.js, js/scoreService.js (à charger avant ce
 * fichier) et de l'objet global App défini dans index.html
 * (App.afficherEcran/App.ouvrirPartie).
 */

var HistoriqueVueService = (function () {
  'use strict';

  var LIBELLES_VAINQUEUR = { joueur: 'Victoire du joueur', neant: 'Victoire du Néant', egalite: 'Égalité' };

  function formaterDate_(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function blocEvenementsHTML_(evenements) {
    if (!evenements || !evenements.length) {
      return '<p class="historique-souscategorie">Événements galactiques : <span class="hint-inline">aucun choisi</span></p>';
    }
    var items = evenements.map(function (e) { return '<li>Cycle ' + e.cycle + ' — ' + e.nom + '</li>'; }).join('');
    return '<p class="historique-souscategorie">Événements galactiques</p><ul class="historique-liste">' + items + '</ul>';
  }

  function blocTechnologiesDisponiblesHTML_(technologies) {
    if (!technologies || !technologies.length) {
      return '<p class="historique-souscategorie">Technologies disponibles : <span class="hint-inline">aucune</span></p>';
    }
    var badges = technologies.map(function (t) {
      return '<span class="badge' + (t.sansPoint ? ' badge-sans-point' : '') + '">' + t.nom + '</span>';
    }).join('');
    return '<p class="historique-souscategorie">Technologies disponibles</p><div class="historique-badges">' + badges + '</div>';
  }

  function blocTechnologiesAcquisesHTML_(technologies) {
    if (!technologies || !technologies.length) {
      return '<p class="historique-souscategorie">Technologies acquises : <span class="hint-inline">aucune</span></p>';
    }
    var badges = technologies.map(function (t) {
      var suffixe = t.amelioree ? ' <span class="badge-tag">améliorée</span>' : '';
      return '<span class="badge">' + t.nom + suffixe + '</span>';
    }).join('');
    return '<p class="historique-souscategorie">Technologies acquises</p><div class="historique-badges">' + badges + '</div>';
  }

  function blocVainqueurHTML_(vainqueur) {
    if (!vainqueur) return '';
    return '<span class="badge-vainqueur badge-vainqueur-' + vainqueur + '">' + LIBELLES_VAINQUEUR[vainqueur] + '</span>';
  }

  function carteHistoriqueHTML_(item) {
    var dateAffichee = formaterDate_(item.date);
    var statut = item.terminee ? ('Score ' + item.scoreFinal + ' / Influence Néant ' + item.influenceTotal) : 'En cours';

    var boutonReprendre = !item.terminee
      ? '<button class="btn btn-secondary btn-reprendre-partie" data-id="' + item.id + '" style="width:100%;margin-top:10px;">Reprendre cette partie</button>'
      : '';

    var boutonSupprimer = '<button class="btn btn-danger btn-supprimer-partie" data-id="' + item.id + '" style="width:100%;margin-top:8px;">Supprimer cette partie</button>';

    var boutonArchiver = item.archivee
      ? '<button class="btn btn-secondary btn-archiver-partie" data-id="' + item.id + '" data-archivee="1" style="width:100%;margin-top:8px;">Désarchiver</button>'
      : '<button class="btn btn-secondary btn-archiver-partie" data-id="' + item.id + '" data-archivee="0" style="width:100%;margin-top:8px;">Archiver</button>';

    var badgeArchivee = item.archivee ? '<span class="badge badge-tag">Archivée</span>' : '';

    return '<div class="card historique-item" data-archivee="' + (item.archivee ? '1' : '0') + '">' +
      '<h3 style="margin:0 0 4px;">' + (item.maisonJoueur || 'Partie') + ' ' + badgeArchivee + '</h3>' +
      '<p>' + dateAffichee + '</p>' +
      '<p>' + statut + '</p>' +
      (item.terminee ? blocVainqueurHTML_(item.vainqueur) : '') +
      blocEvenementsHTML_(item.evenements) +
      blocTechnologiesDisponiblesHTML_(item.technologiesDisponibles) +
      blocTechnologiesAcquisesHTML_(item.technologiesAcquises) +
      boutonReprendre + boutonArchiver + boutonSupprimer +
      '</div>';
  }

  function brancherActions_(liste) {
    Array.prototype.forEach.call(liste.querySelectorAll('.btn-reprendre-partie'), function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = 'Passage en cours…';
        GameService.obtenirPartie(btn.dataset.id)
          .then(function (partie) { App.ouvrirPartie(partie); })
          .catch(function (erreur) {
            window.alert('Échec : ' + erreur.message);
            btn.disabled = false;
            btn.textContent = 'Reprendre cette partie';
          });
      });
    });

    Array.prototype.forEach.call(liste.querySelectorAll('.btn-archiver-partie'), function (btn) {
      btn.addEventListener('click', function () {
        var archiverMaintenant = btn.dataset.archivee === '0'; // 0 = pas encore archivée -> on archive
        btn.disabled = true;
        btn.textContent = archiverMaintenant ? 'Archivage…' : 'Désarchivage…';
        GameService.archiverPartie(btn.dataset.id, archiverMaintenant)
          .then(function () {
            btn.dataset.archivee = archiverMaintenant ? '1' : '0';
            btn.textContent = archiverMaintenant ? 'Désarchiver' : 'Archiver';
            btn.disabled = false;
            var carte = btn.closest('.historique-item');
            carte.dataset.archivee = archiverMaintenant ? '1' : '0';
            var badge = carte.querySelector('.badge-tag');
            if (archiverMaintenant && !badge) {
              carte.querySelector('h3').insertAdjacentHTML('beforeend', ' <span class="badge badge-tag">Archivée</span>');
            } else if (!archiverMaintenant && badge) {
              badge.remove();
            }
          })
          .catch(function (erreur) {
            window.alert('Échec : ' + erreur.message);
            btn.disabled = false;
            btn.textContent = archiverMaintenant ? 'Archiver' : 'Désarchiver';
          });
      });
    });

    Array.prototype.forEach.call(liste.querySelectorAll('.btn-supprimer-partie'), function (btn) {
      btn.addEventListener('click', function () {
        var carte = btn.closest('.historique-item');
        var nom = carte.querySelector('h3').textContent;
        if (!window.confirm('Supprimer définitivement la partie "' + nom + '" ? Cette action est irréversible.')) return;

        btn.disabled = true;
        btn.textContent = 'Suppression…';
        GameService.supprimerPartie(btn.dataset.id)
          .then(function () {
            carte.remove();
            if (!liste.querySelector('.historique-item')) {
              liste.innerHTML = '<p class="hint">Aucune partie enregistrée pour le moment.</p>';
            }
          })
          .catch(function (erreur) {
            window.alert('Échec : ' + erreur.message);
            btn.disabled = false;
            btn.textContent = 'Supprimer cette partie';
          });
      });
    });
  }

  function ouvrirHistorique_() {
    var liste = document.getElementById('liste-historique');
    liste.innerHTML = '<p class="hint">Chargement…</p>';
    App.afficherEcran('historique');

    ScoreService.getHistorique()
      .then(function (parties) {
        liste.innerHTML = parties.length ? parties.map(carteHistoriqueHTML_).join('') : '<p class="hint">Aucune partie enregistrée pour le moment.</p>';
        brancherActions_(liste);
      })
      .catch(function (erreur) {
        liste.innerHTML = '<p class="hint">Erreur de chargement : ' + erreur.message + '</p>';
      });
  }

  document.getElementById('btn-historique').addEventListener('click', ouvrirHistorique_);
  document.getElementById('btn-retour-historique').addEventListener('click', function () { App.afficherEcran('home'); });

  document.getElementById('btn-supprimer-non-archivees').addEventListener('click', function () {
    if (!window.confirm('Supprimer définitivement TOUTES les parties non archivées ? Les parties archivées seront conservées. Cette action est irréversible.')) return;

    var btn = document.getElementById('btn-supprimer-non-archivees');
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Suppression en cours…';

    GameService.supprimerToutesPartiesNonArchivees()
      .then(function (nombreSupprimees) {
        btn.disabled = false;
        btn.textContent = texteOriginal;
        var liste = document.getElementById('liste-historique');
        Array.prototype.forEach.call(liste.querySelectorAll('.historique-item[data-archivee="0"]'), function (carte) { carte.remove(); });
        if (!liste.querySelector('.historique-item')) {
          liste.innerHTML = '<p class="hint">Aucune partie enregistrée pour le moment.</p>';
        }
        window.alert(nombreSupprimees + ' partie(s) supprimée(s).');
      })
      .catch(function (erreur) {
        btn.disabled = false;
        btn.textContent = texteOriginal;
        window.alert('Échec : ' + erreur.message);
      });
  });

  // 21/08/2026 (docs/docs-rapport.md CM-7) : export ouvrirHistorique
  // retiré (zéro appelant — le listener #btn-historique ci-dessus est
  // déjà branché en interne, le module n'a besoin d'exposer aucune API).
  return {};
})();
