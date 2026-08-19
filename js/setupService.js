/**
 * setupService.js
 * Écran "Créer une partie" — Voidfall Companion PWA
 * Version 1 — 17/08/2026
 *
 * Portage de setup.html (GAS, Version 2 — 10/08/2026) : logique de
 * l'écran de création de partie (choix manuel/aléatoire, mise en place
 * manuelle). Même logique métier, adaptée pour appeler GameService.js
 * directement (plus d'appel Api.xxx ni de google.script.run).
 *
 * Simplification par rapport à la version GAS : rafraichirTechnologieDepart_
 * et rafraichirTechnologiesSansPoint_ lisaient un sous-ensemble de maisons
 * via un aller-retour serveur dédié (Api.getDetailMaisons), pour limiter
 * le poids du payload réseau. Ici, GameService.obtenirMaisonsCatalogue()
 * a déjà tout rapatrié une fois (IndexedDB local, pas de coût réseau) et
 * reste en cache dans maisonsCache : ces deux fonctions filtrent
 * simplement ce cache, en synchrone, sans nouvel appel.
 *
 * Dépend de db.js (DB), gameService.js (GameService) et d'un petit objet
 * global `App` défini dans index.html (App.afficherEcran/App.afficherPartieCreee)
 * — remplace App.showScreen/App.renderPartie côté GAS ; le futur js/app.js
 * (orchestration complète, Phases 3+) prendra le relai quand plus
 * d'écrans existeront.
 */

var SetupService = (function () {
  'use strict';

  var mode = 'manuel';
  var maisonsCache = [];
  var NB_MAISONS_DECHUES = 4;
  var NB_TECH_SANS_POINT = 3;

  function afficherErreur_(erreur) {
    window.alert(erreur && erreur.message ? erreur.message : String(erreur));
  }

  function afficherModeManuel_() {
    mode = 'manuel';
    document.getElementById('mode-manuel').classList.add('active');
    document.getElementById('mode-aleatoire').classList.remove('active');
    document.getElementById('bloc-manuel').hidden = false;
    document.getElementById('bloc-aleatoire').hidden = true;
  }

  function afficherModeAleatoire_() {
    mode = 'aleatoire';
    document.getElementById('mode-aleatoire').classList.add('active');
    document.getElementById('mode-manuel').classList.remove('active');
    document.getElementById('bloc-aleatoire').hidden = false;
    document.getElementById('bloc-manuel').hidden = true;

    // La mise en place manuelle exige de connaître sa maison : pas de sens
    // en mode aléatoire, on la referme si elle était ouverte.
    var checkbox = document.getElementById('check-mise-en-place-manuelle');
    checkbox.checked = false;
    document.getElementById('bloc-mise-en-place-manuelle').hidden = true;
  }

  function peuplerListes_(maisons) {
    maisonsCache = maisons;

    var selectMaison = document.getElementById('select-maison');
    selectMaison.innerHTML = maisons.map(function (m) {
      var niveau = Number(m.complexite) || 0;
      var etoiles = '⭐'.repeat(niveau) + '☆'.repeat(Math.max(0, 4 - niveau));
      return '<option value="' + m.nom + '">' + etoiles + '  ' + m.nom + '</option>';
    }).join('');

    var difficultes = Array.from(new Set(maisons.map(function (m) { return m.complexite; })))
      .filter(function (d) { return d !== '' && d !== null && d !== undefined; })
      .sort(function (a, b) { return a - b; });

    var selectComplexite = document.getElementById('select-complexite');
    selectComplexite.innerHTML = '<option value="">Toutes difficultés</option>' + difficultes.map(function (d) {
      return '<option value="' + d + '">Difficulté ' + d + '</option>';
    }).join('');

    peuplerSelectsMaisonsDechues_();
  }

  // -----------------------------------------------------------------
  // Mise en place manuelle
  // -----------------------------------------------------------------

  function selectsMaisonsDechues_() {
    return Array.prototype.slice.call(document.querySelectorAll('.select-maison-dechue'));
  }

  /**
   * (Re)peuple les 4 <select> de maisons déchues, en excluant la maison du
   * joueur et les valeurs déjà choisies dans les 3 AUTRES selects, pour
   * empêcher les doublons. Conserve la sélection en cours de chaque select
   * quand elle reste valide.
   */
  function peuplerSelectsMaisonsDechues_() {
    var nomJoueur = document.getElementById('select-maison').value;
    var selects = selectsMaisonsDechues_();
    var valeursActuelles = selects.map(function (s) { return s.value; });

    selects.forEach(function (select, i) {
      var valeurActuelle = valeursActuelles[i];
      var exclues = valeursActuelles.filter(function (v, j) { return j !== i && v; });

      var options = maisonsCache
        .filter(function (m) { return m.nom !== nomJoueur && exclues.indexOf(m.nom) === -1; })
        .map(function (m) { return m.nom; });

      if (valeurActuelle && options.indexOf(valeurActuelle) === -1) {
        options.unshift(valeurActuelle);
      }

      select.innerHTML = '<option value="">— Choisir —</option>' +
        options.map(function (nom) { return '<option value="' + nom + '">' + nom + '</option>'; }).join('');
      select.value = valeurActuelle || '';
    });
  }

  function maisonsDechuesChoisies_() {
    return selectsMaisonsDechues_().map(function (s) { return s.value; }).filter(Boolean);
  }

  /**
   * Sous-ensemble de maisonsCache correspondant aux noms fournis, dans le
   * même ordre — équivalent local de Api.getDetailMaisons(noms).
   */
  function detailMaisons_(noms) {
    return noms.map(function (nom) {
      return maisonsCache.filter(function (m) { return m.nom === nom; })[0];
    }).filter(Boolean);
  }

  /**
   * Recharge la liste des technologies "sans gain d'Influence" à cocher,
   * dès que les 4 maisons déchues sont toutes choisies (et distinctes,
   * garanti par peuplerSelectsMaisonsDechues_). Tant que ce n'est pas le
   * cas, affiche un message d'attente à la place.
   */
  function rafraichirTechnologiesSansPoint_() {
    var container = document.getElementById('liste-technologies-sans-point');
    var noms = maisonsDechuesChoisies_();

    if (noms.length !== NB_MAISONS_DECHUES) {
      container.innerHTML = '<p class="hint">Choisissez d\'abord les 4 maisons déchues ci-dessus.</p>';
      majCompteurSansPoint_();
      return;
    }

    var maisons = detailMaisons_(noms);
    container.innerHTML = maisons.map(function (m) {
      return '<div class="techno-sans-point-groupe">' +
        '<p class="techno-sans-point-maison">' + m.nom + '</p>' +
        m.technologies.map(function (t) {
          return '<label class="techno-sans-point-item">' +
            '<input type="checkbox" class="check-sans-point" value="' + t.nom + '">' +
            t.nom + (t.type ? ' <span class="hint-inline">(' + t.type + ')</span>' : '') +
            '</label>';
        }).join('') +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.check-sans-point'), function (cb) {
      cb.addEventListener('change', onChangeCheckboxSansPoint_);
    });

    majCompteurSansPoint_();
  }

  function checkboxesSansPoint_() {
    return Array.prototype.slice.call(document.querySelectorAll('.check-sans-point'));
  }

  function techSansPointChoisies_() {
    return checkboxesSansPoint_().filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
  }

  /**
   * Met en surbrillance les technologies cochées, met à jour le
   * compteur "X / 3", et désactive les cases non cochées une fois les
   * 3 atteintes (pour éviter d'en cocher une 4ᵉ par erreur).
   */
  function onChangeCheckboxSansPoint_() {
    var cases = checkboxesSansPoint_();
    var nbCoches = cases.filter(function (cb) { return cb.checked; }).length;

    cases.forEach(function (cb) {
      cb.closest('.techno-sans-point-item').classList.toggle('techno-sans-point-item-actif', cb.checked);
      cb.disabled = !cb.checked && nbCoches >= NB_TECH_SANS_POINT;
    });

    majCompteurSansPoint_();
  }

  function majCompteurSansPoint_() {
    var nb = techSansPointChoisies_().length;
    document.getElementById('compteur-sans-point').textContent = nb + ' / ' + NB_TECH_SANS_POINT + ' sélectionnée(s)';
  }

  function rafraichirTechnologieDepart_() {
    var select = document.getElementById('select-techno-depart-manuelle');
    var nomMaison = document.getElementById('select-maison').value;

    if (!nomMaison) {
      select.innerHTML = '<option value="">— Choisissez une maison ci-dessus —</option>';
      return;
    }

    var maison = detailMaisons_([nomMaison])[0];
    if (!maison) {
      select.innerHTML = '<option value="">— Maison introuvable —</option>';
      return;
    }

    select.innerHTML = '<option value="">— Choisir —</option>' +
      maison.technologies.map(function (t) {
        return '<option value="' + t.nom + '">' + t.nom + (t.type ? ' (' + t.type + ')' : '') + '</option>';
      }).join('');
  }

  function onToggleMiseEnPlaceManuelle_() {
    var actif = document.getElementById('check-mise-en-place-manuelle').checked;
    document.getElementById('bloc-mise-en-place-manuelle').hidden = !actif;
    if (actif) {
      rafraichirTechnologieDepart_();
      peuplerSelectsMaisonsDechues_();
      rafraichirTechnologiesSansPoint_();
    }
  }

  /**
   * Construit les options de mise en place manuelle et vérifie que tout
   * est renseigné avant de lancer la partie. Retourne null (et affiche
   * l'erreur) si quelque chose manque.
   */
  function construireOptionsManuelles_(maison) {
    var technologieDepart = document.getElementById('select-techno-depart-manuelle').value;
    var maisonsDechues = maisonsDechuesChoisies_();
    var technologiesSansPoint = techSansPointChoisies_();

    if (!technologieDepart) {
      afficherErreur_(new Error('Choisis la technologie de départ.'));
      return null;
    }
    if (maisonsDechues.length !== NB_MAISONS_DECHUES) {
      afficherErreur_(new Error('Choisis les ' + NB_MAISONS_DECHUES + ' maisons déchues.'));
      return null;
    }
    if (technologiesSansPoint.length !== NB_TECH_SANS_POINT) {
      afficherErreur_(new Error('Choisis exactement ' + NB_TECH_SANS_POINT + ' technologies sans gain d\'Influence (actuellement ' + technologiesSansPoint.length + ').'));
      return null;
    }

    return {
      mode: 'manuel',
      maison: maison,
      miseEnPlaceManuelle: true,
      technologieDepart: technologieDepart,
      maisonsDechues: maisonsDechues,
      technologiesSansPoint: technologiesSansPoint
    };
  }

  function init() {
    document.getElementById('mode-manuel').addEventListener('click', afficherModeManuel_);
    document.getElementById('mode-aleatoire').addEventListener('click', afficherModeAleatoire_);

    document.getElementById('check-mise-en-place-manuelle').addEventListener('change', onToggleMiseEnPlaceManuelle_);

    document.getElementById('select-maison').addEventListener('change', function () {
      if (!document.getElementById('check-mise-en-place-manuelle').checked) return;
      rafraichirTechnologieDepart_();
      peuplerSelectsMaisonsDechues_();
      rafraichirTechnologiesSansPoint_();
    });

    selectsMaisonsDechues_().forEach(function (select) {
      select.addEventListener('change', function () {
        peuplerSelectsMaisonsDechues_();
        rafraichirTechnologiesSansPoint_();
      });
    });

    document.getElementById('btn-nouvelle-partie').addEventListener('click', function () {
      App.afficherEcran('setup');

      // Indicateur de chargement immédiat — le temps que
      // GameService.obtenirMaisonsCatalogue() rende la main (lecture
      // IndexedDB, quasi instantané mais asynchrone).
      var selectMaison = document.getElementById('select-maison');
      var btnLancer = document.getElementById('btn-lancer-partie');
      selectMaison.innerHTML = '<option>Chargement des maisons…</option>';
      selectMaison.disabled = true;
      btnLancer.disabled = true;

      GameService.obtenirMaisonsCatalogue()
        .then(function (maisons) {
          if (!maisons.length) {
            throw new Error('Catalogue vide — synchronise-le depuis l\'accueil avant de créer une partie.');
          }
          peuplerListes_(maisons);
          selectMaison.disabled = false;
          btnLancer.disabled = false;
        })
        .catch(function (erreur) {
          selectMaison.disabled = false;
          btnLancer.disabled = false;
          afficherErreur_(erreur);
        });
    });

    document.getElementById('btn-retour-home').addEventListener('click', function () {
      App.afficherEcran('home');
    });

    document.getElementById('btn-lancer-partie').addEventListener('click', function () {
      var btn = document.getElementById('btn-lancer-partie');
      if (btn.disabled) return; // sécurité anti double-clic

      var options;

      if (mode === 'manuel' && document.getElementById('check-mise-en-place-manuelle').checked) {
        options = construireOptionsManuelles_(document.getElementById('select-maison').value);
        if (!options) return; // erreur déjà affichée par construireOptionsManuelles_
      } else if (mode === 'manuel') {
        options = { mode: 'manuel', maison: document.getElementById('select-maison').value };
      } else {
        options = { mode: 'aleatoire', complexite: document.getElementById('select-complexite').value };
      }

      var texteOriginal = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Création de la partie…';

      GameService.creerPartie(options)
        .then(function (partie) {
          btn.disabled = false;
          btn.textContent = texteOriginal;
          App.afficherPartieCreee(partie);
        })
        .catch(function (erreur) {
          btn.disabled = false;
          btn.textContent = texteOriginal;
          afficherErreur_(erreur);
        });
    });
  }

  return { init: init };
})();
