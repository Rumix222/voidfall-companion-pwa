/**
 * strategieService.js
 * Écran Stratégie — Voidfall Companion PWA
 * Version 2 — 17/08/2026 (Session 5, Phase 5 — Civilisation)
 *
 * 17/08/2026 (Session 5) : Pistes de Civilisation devenues INTERACTIVES —
 * bouton "Avancer" par piste (résout aussi l'effet de la case atteinte),
 * case à cocher "Corrompue", boutons "Avancer la moins avancée"/"Avancer
 * la piste Corrompue", branchés sur js/civilisationService.js (nouveau ce
 * jour). Remplace l'affichage lecture seule de la session précédente.
 *
 * Rebranche l'écran Stratégie (ressources, cartes Focus, annulation,
 * Civilisation) sur js/focusEngine.js (moteur pur), js/annulationService.js
 * (pile LIFO) et js/civilisationService.js, portage/adaptation des parties
 * DOM de strategie.html (GAS) qui restent dans le périmètre de cette PWA
 * (voir focusEngine.js en-tête pour la liste des clés Coût/Effet
 * volontairement hors périmètre — non jouables automatiquement,
 * journalisées "à appliquer manuellement").
 *
 * PÉRIMÈTRE VOLONTAIREMENT RÉDUIT (cohérent avec l'état réel de
 * gameService.js/secteurService.js — rien à porter faute de RPC source
 * côté GAS) :
 *   - Focus héroïques : AFFICHAGE SEUL (choisirFocusHeroique hors
 *     périmètre côté gameService.js — les 3 emplacements du cycle restent
 *     toujours à null pour l'instant, rien à sélectionner).
 *   - Scratchpad manuel (édition directe des ressources par l'utilisateur,
 *     indépendante des actions Focus, présent dans strategie.html GAS) :
 *     toujours pas porté — hors sujet des sessions Focus/Civilisation.
 *   - Les clés avancer_civilisation_* À L'INTÉRIEUR d'une carte Focus
 *     restent journalisées "non automatisé" par focusEngine.js (pas de
 *     pont Focus -> CivilisationService cette session, voir focusEngine.js
 *     en-tête) — seuls les boutons dédiés de cette page font avancer les
 *     pistes.
 *
 * demanderChoix(contexte) est l'implémentation DOM (modale #modal-choix)
 * du callback attendu par focusEngine.js — voir focusEngine.js pour le
 * contrat exact de chaque contexte.type. Réutilisée telle quelle par
 * CivilisationService.avancerPiste (résolution de l'effet de case).
 *
 * Dépend de : db.js, gameService.js, focusEngine.js, annulationService.js,
 * civilisationService.js (à charger avant ce fichier), et de l'objet
 * global App défini dans index.html (App.getPartieCourante/
 * App.rafraichirPartieCourante).
 */

var StrategieService = (function () {
  'use strict';

  var CHAMP_RESSOURCE = {
    nourriture: { champ: 'nourriture', label: 'Nourriture' },
    energie: { champ: 'energie', label: 'Énergie' },
    materiel: { champ: 'materiel', label: 'Matériel' },
    credit: { champ: 'credit', label: 'Crédit' },
    science: { champ: 'science', label: 'Science' }
  };
  var RESSOURCES_PRODUCTION = ['nourriture', 'energie', 'materiel', 'credit', 'science'];

  var LABEL_PISTE = { societe: 'Société', gouvernement: 'Gouvernement', economie: 'Économie' };
  var PISTES_ORDRE = ['societe', 'gouvernement', 'economie'];
  // Cache du détail des 7 cases par maison (référence statique, une seule
  // lecture catalogue par maison — voir CivilisationService.obtenirDetailPistes).
  var detailPistesCache = {};

  // Portage direct de LIBELLES_OPTIONS (strategie.html GAS) — clés brutes
  // -> texte lisible pour les popups de choix. Repli sur la clé brute si
  // absente d'ici (vocabulaire déjà en français, reste lisible).
  var LIBELLES_OPTIONS = {
    envahir: 'Envahir un secteur',
    envahir_corrompu: 'Envahir un secteur Corrompu',
    regrouper: 'Regrouper',
    regroupe: 'Regrouper',
    installation: 'Construire une Installation',
    construire_installation: 'Construire une Installation',
    guilde: 'Établir une Guilde',
    etablir_guilde: 'Établir une Guilde',
    retirer_corruption: 'Retirer une Corruption',
    activer_cube: 'Activer 1 cube',
    deployer_cube: 'Déployer 1 cube',
    deploy_cube: 'Déployer 1 cube',
    deployer_cube_par_chantier: 'Déployer 1 cube par Chantier Naval',
    deployer_cube_secteur_mere: 'Déployer 1 cube dans le Secteur-Mère',
    gagner_programme: 'Gagner un Programme',
    gagner_commerce: 'Gagner un jeton Commerce',
    gagner_prime: 'Gagner un jeton Prime',
    produire_ressource: 'Produire un type de ressource',
    produire_deux_ressources: 'Produire deux types de ressources différentes',
    avancer_civilisation: 'Avancer sur une piste de Civilisation au choix',
    avancer_civilisation_societe: 'Avancer sur la piste Société',
    avancer_civilisation_gouvernement: 'Avancer sur la piste Gouvernement',
    avancer_civilisation_economie: 'Avancer sur la piste Économie',
    avancer_civilisation_moins_avancee: 'Avancer sur votre piste la moins avancée',
    avance_rapide: 'Avancer librement sur une piste de Civilisation',
    nourriture: 'Nourriture', energie: 'Énergie', materiel: 'Matériel',
    credit: 'Crédit', science: 'Science', influence: 'Influence'
  };

  var partieAffichee = null;
  var journal = [];

  // ------------------------------------------------------------
  // Rendu ressources
  // ------------------------------------------------------------

  function renderRessources_(partie) {
    var pm = partie.plateauMaison || {};
    var ressources = pm.ressources || {};

    var principales = document.getElementById('ressources-principales');
    principales.innerHTML = RESSOURCES_PRODUCTION.map(function (cle) {
      return '<div class="ressource-case"><div class="ressource-case-label">' + CHAMP_RESSOURCE[cle].label + '</div>' +
        '<div class="ressource-case-valeur">' + (ressources[cle] || 0) + '</div></div>';
    }).join('') +
      '<div class="ressource-case"><div class="ressource-case-label">Influence</div>' +
      '<div class="ressource-case-valeur">' + (ressources.influence || 0) + '</div></div>';

    var jetons = document.getElementById('ressources-jetons');
    jetons.innerHTML =
      '<div class="ressource-case"><div class="ressource-case-label">Cube actif</div><div class="ressource-case-valeur">' + (pm.cubeActif || 0) + '</div></div>' +
      '<div class="ressource-case"><div class="ressource-case-label">Prime</div><div class="ressource-case-valeur">' + (pm.jetonPrime || 0) + '</div></div>' +
      '<div class="ressource-case"><div class="ressource-case-label">Libération</div><div class="ressource-case-valeur">' + (pm.jetonLiberation || 0) + '</div></div>';
  }

  function renderJournal_() {
    var container = document.getElementById('ressources-journal');
    if (!journal.length) {
      container.innerHTML = '<p class="hint">Aucune action jouée pour l\'instant.</p>';
      return;
    }
    container.innerHTML = '<ul class="journal-liste">' +
      journal.slice().reverse().map(function (ligne) {
        var estAvertissement = ligne.indexOf('⚠️') !== -1 || ligne.indexOf('annulée') !== -1 || ligne.indexOf('↩️') !== -1;
        return '<li' + (estAvertissement ? ' class="journal-avertissement"' : '') + '>' + ligne + '</li>';
      }).join('') +
      '</ul>';
  }

  /**
   * 17/08/2026 (Session 5, Phase 5 — Civilisation) : chaque piste gagne un
   * bouton "Avancer" (résout aussi l'effet de la case atteinte, via
   * CivilisationService.avancerPiste) et une case "Corrompue" — remplace
   * l'affichage lecture-seule de la session précédente.
   */
  function renderPistesCivilisation_(partie) {
    var civ = partie.civilisation || { societe: 0, gouvernement: 0, economie: 0, corrompues: {} };
    var corrompues = civ.corrompues || {};
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    var container = document.getElementById('pistes-civilisation-liste');

    container.innerHTML = PISTES_ORDRE.map(function (piste) {
      var niveau = civ[piste] || 0;
      var auMax = niveau >= CivilisationService.NIVEAU_MAX;
      return '<div class="piste-civilisation-case">' +
        '<div class="piste-civilisation-nom">' + LABEL_PISTE[piste] + '</div>' +
        '<div class="piste-civilisation-niveau">' + niveau + ' / ' + CivilisationService.NIVEAU_MAX + '</div>' +
        '<p class="hint piste-civilisation-texte-prochaine" id="piste-texte-' + piste + '" style="margin:4px 0;"></p>' +
        '<button class="btn btn-secondary btn-avancer-piste" data-piste="' + piste + '"' + (auMax ? ' disabled' : '') + '>Avancer</button>' +
        '<label class="piste-civilisation-corrompue"><input type="checkbox" class="check-corrompue" data-piste="' + piste + '"' + (corrompues[piste] ? ' checked' : '') + '> Corrompue</label>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.btn-avancer-piste'), function (btn) {
      btn.addEventListener('click', function () { avancerPiste_(btn.dataset.piste, btn); });
    });
    Array.prototype.forEach.call(container.querySelectorAll('.check-corrompue'), function (cb) {
      cb.addEventListener('change', function () { toggleCorruption_(cb.dataset.piste, cb.checked, cb); });
    });

    document.getElementById('btn-avancer-corrompue').disabled = !PISTES_ORDRE.some(function (p) { return corrompues[p]; });

    if (nomMaison) {
      obtenirDetailPistesCache_(nomMaison).then(function (detail) {
        PISTES_ORDRE.forEach(function (piste) {
          var niveau = civ[piste] || 0;
          var el = document.getElementById('piste-texte-' + piste);
          if (!el) return; // l'écran a pu être re-rendu entre-temps
          if (niveau >= CivilisationService.NIVEAU_MAX) { el.textContent = 'Piste au maximum.'; return; }
          var prochaine = (detail[piste] || [])[niveau]; // case niveau+1, index 0-based
          el.textContent = prochaine ? ('Prochaine case : ' + prochaine.texte) : '';
        });
      }).catch(function (erreur) {
        console.warn('StrategieService : détail des pistes indisponible :', erreur);
      });
    }
  }

  function obtenirDetailPistesCache_(nomMaison) {
    if (detailPistesCache[nomMaison]) return Promise.resolve(detailPistesCache[nomMaison]);
    return CivilisationService.obtenirDetailPistes(nomMaison).then(function (detail) {
      detailPistesCache[nomMaison] = detail;
      return detail;
    });
  }

  function avancerPiste_(piste, btn) {
    if (btn.disabled) return;
    var partie = partieAffichee;
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    if (!nomMaison) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    CivilisationService.avancerPiste(partie.id, nomMaison, piste, demanderChoix)
      .then(function (resultat) {
        if (resultat.dejaMaximum) {
          journal.push('Piste ' + LABEL_PISTE[piste] + ' : déjà au maximum.');
        } else {
          journal.push('Piste ' + LABEL_PISTE[piste] + ' : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau +
            ' — ' + (resultat.texte || 'aucun effet de case.'));
          journal = journal.concat(resultat.effetJournal || []);
        }
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec de l\'avancement : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  function avancerMoinsAvancee_() {
    var btn = document.getElementById('btn-avancer-moins-avancee');
    if (btn.disabled) return;
    var partie = partieAffichee;
    var nomMaison = partie.joueur ? partie.joueur.nom : null;
    if (!nomMaison) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    CivilisationService.avancerPisteMoinsAvancee(partie.id, nomMaison, demanderChoix)
      .then(function (resultat) {
        journal.push('Piste la moins avancée (' + LABEL_PISTE[resultat.piste] + ') : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau +
          ' — ' + (resultat.texte || 'aucun effet de case.'));
        journal = journal.concat(resultat.effetJournal || []);
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec de l\'avancement : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  function avancerCorrompue_() {
    var btn = document.getElementById('btn-avancer-corrompue');
    if (btn.disabled) return;
    var partie = partieAffichee;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    CivilisationService.avancerPisteCorrompue(partie.id)
      .then(function (resultat) {
        journal.push('Piste Corrompue (' + LABEL_PISTE[resultat.piste] + ') : niveau ' + resultat.ancienNiveau + ' → ' + resultat.nouveauNiveau + ' (sans bénéfice de case).');
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  function toggleCorruption_(piste, valeur, cb) {
    cb.disabled = true;
    CivilisationService.definirCorruption(partieAffichee.id, piste, valeur)
      .then(function () { return App.rafraichirPartieCourante(); })
      .then(function (partieFraiche) { afficher(partieFraiche); })
      .catch(function (erreur) {
        window.alert('Échec : ' + erreur.message);
        cb.checked = !valeur;
        cb.disabled = false;
      });
  }

  // ------------------------------------------------------------
  // Rendu cartes Focus (joueur + héroïques)
  // ------------------------------------------------------------

  function badgeType_(type) {
    var classe = 'badge';
    if (type === 'Standard') classe += ' badge-type-standard';
    else if (type === 'Héroïque') classe += ' badge-type-heroique';
    else classe += ' badge-type-maison';
    return '<span class="' + classe + '">' + (type || '?') + '</span>';
  }

  function pastillesCoutHTML_(cout) {
    if (!cout || typeof cout !== 'object' || cout.brut) return '';
    var cles = Object.keys(cout);
    if (!cles.length) return '';
    return '<div class="focus-action-cout">' + cles.map(function (cle) {
      var valeur = cout[cle];
      var texte = (typeof valeur === 'number') ? valeur : (LIBELLES_OPTIONS[cle] || cle).slice(0, 12);
      return '<span class="pastille-cout" title="' + cle + (typeof valeur === 'number' ? ' : ' + valeur : '') + '">' + texte + '</span>';
    }).join('') + '</div>';
  }

  function coutSuffisant_(cout, ressources) {
    if (!cout || typeof cout !== 'object' || cout.brut) return true;
    var suffisant = true;
    Object.keys(cout).forEach(function (cle) {
      if (CHAMP_RESSOURCE[cle] && typeof cout[cle] === 'number' && (ressources[cle] || 0) < cout[cle]) {
        suffisant = false;
      }
    });
    return suffisant;
  }

  function carteFocusJoueurHTML_(carte, carteIndex) {
    var ressources = (partieAffichee.plateauMaison || {}).ressources || {};
    var actionsHtml = carte.actions.map(function (action, actionIndex) {
      var jouable = coutSuffisant_(action.cout, ressources);
      return '<div class="focus-action' + (jouable ? '' : ' focus-action-insuffisant') + '">' +
        '<div class="focus-action-titre">' + (action.action || 'Action') + '</div>' +
        (action.texte ? '<div class="focus-action-texte">' + action.texte + '</div>' : '') +
        pastillesCoutHTML_(action.cout) +
        '<button class="btn btn-primary btn-jouer-action" data-carte="' + carteIndex + '" data-action="' + actionIndex + '">Jouer cette action</button>' +
        '</div>';
    }).join('');

    return '<div class="card">' +
      badgeType_(carte.type) +
      '<div style="font-weight:600;margin-bottom:4px;">' + carte.focus + '</div>' +
      actionsHtml +
      '</div>';
  }

  function renderFocusJoueur_(partie) {
    var container = document.getElementById('strategie-focus-joueur');
    var cartes = partie.focusJoueur || [];

    if (!cartes.length) {
      container.innerHTML = '<p class="hint">Aucun Focus configuré pour cette partie (créée avant cette fonctionnalité, ou mise en place Focus indisponible à la création).</p>';
      return;
    }

    container.innerHTML = cartes.map(function (c, i) { return carteFocusJoueurHTML_(c, i); }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.btn-jouer-action'), function (btn) {
      btn.addEventListener('click', function () {
        jouerAction_(Number(btn.dataset.carte), Number(btn.dataset.action), btn);
      });
    });
  }

  function renderFocusHeroiques_(partie) {
    var container = document.getElementById('strategie-focus-heroiques');
    var cycle = partie.cycleActuel;
    var cartes = [];
    if (partie.focusHeroiques) {
      cartes = (cycle === 'termine') ? (partie.focusHeroiques.cycle3 || []) : (partie.focusHeroiques['cycle' + cycle] || []);
    }

    container.innerHTML = cartes.map(function (carte, i) {
      if (!carte) {
        return '<div class="card"><p class="hint" style="margin:0;">Emplacement ' + (i + 1) + ' : non choisi.</p></div>';
      }
      return '<div class="card">' + badgeType_(carte.type) +
        '<div style="font-weight:600;">' + carte.focus + '</div>' +
        (carte.actions || []).map(function (a) {
          return '<div class="hint" style="margin:4px 0 0;">' + (a.action || '—') + (a.texte ? ' — ' + a.texte : '') + '</div>';
        }).join('') +
        '</div>';
    }).join('') || '<p class="hint">Aucun emplacement pour ce cycle.</p>';
  }

  // ------------------------------------------------------------
  // Jouer une action Focus
  // ------------------------------------------------------------

  function jouerAction_(carteIndex, actionIndex, btn) {
    if (btn.disabled) return; // sécurité anti double-clic
    var partie = partieAffichee;
    var carte = (partie.focusJoueur || [])[carteIndex];
    var action = carte ? carte.actions[actionIndex] : null;
    if (!carte || !action) return;

    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    FocusEngine.jouerActionEtPersister(partie.id, carte, action, demanderChoix)
      .then(function (resultat) {
        journal = journal.concat(resultat.journal);
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) {
        afficher(partieFraiche);
      })
      .catch(function (erreur) {
        window.alert('Échec de l\'action : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  // ------------------------------------------------------------
  // Annulation
  // ------------------------------------------------------------

  function majBoutonAnnuler_(partieId) {
    var btn = document.getElementById('btn-annuler-action');
    var compteur = document.getElementById('annulation-compteur');
    AnnulationService.compter(partieId).then(function (nb) {
      btn.disabled = (nb === 0);
      compteur.textContent = nb ? nb + ' action(s) annulable(s)' : '';
    });
  }

  function annulerDerniereAction_() {
    var partie = partieAffichee;
    if (!partie) return;
    var btn = document.getElementById('btn-annuler-action');
    if (btn.disabled) return;
    var texteOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Passage en cours…';

    AnnulationService.annulerDerniere(partie.id)
      .then(function (resultat) {
        journal.push(resultat.succes ? ('↩️ Action annulée : ' + resultat.source + '.') : 'Aucune action à annuler.');
        return App.rafraichirPartieCourante();
      })
      .then(function (partieFraiche) {
        afficher(partieFraiche);
      })
      .catch(function (erreur) {
        window.alert('Échec de l\'annulation : ' + erreur.message);
        btn.disabled = false;
        btn.textContent = texteOriginal;
      });
  }

  // ------------------------------------------------------------
  // Modale de choix générique (demanderChoix)
  // ------------------------------------------------------------

  function libelleOption_(opt) {
    if (typeof opt === 'string') return LIBELLES_OPTIONS[opt] || opt;
    return Object.keys(opt).map(function (k) {
      var v = opt[k];
      return (LIBELLES_OPTIONS[k] || k) + (typeof v === 'number' ? ' (' + v + ')' : '');
    }).join(' + ');
  }

  function fermerModale_() {
    document.getElementById('modal-choix').hidden = true;
  }

  function demanderChoix(contexte) {
    var modal = document.getElementById('modal-choix');
    var titre = document.getElementById('modal-choix-titre');
    var contenu = document.getElementById('modal-choix-contenu');
    var btnValider = document.getElementById('modal-choix-valider');
    var btnAnnuler = document.getElementById('modal-choix-annuler');

    return new Promise(function (resolve) {

      if (contexte.type === 'option_exclusive') {
        titre.textContent = 'Choisissez une option';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        contenu.innerHTML = '<div class="modal-choix-boutons">' +
          contexte.options.map(function (opt, i) {
            return '<button class="btn btn-secondary btn-choix-liste" data-index="' + i + '">' + libelleOption_(opt) + '</button>';
          }).join('') + '</div>';
        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
          btn.addEventListener('click', function () {
            fermerModale_();
            resolve({ indexChoisi: Number(btn.dataset.index) });
          });
        });
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

      } else if (contexte.type === 'options_inclusives') {
        titre.textContent = 'Choisissez une ou plusieurs options (et/ou)';
        btnAnnuler.hidden = true;
        btnValider.hidden = false;
        btnValider.textContent = 'Valider';
        contenu.innerHTML = '<div class="modal-choix-cases">' +
          contexte.options.map(function (opt, i) {
            return '<label class="modal-choix-case"><input type="checkbox" data-index="' + i + '"> ' + libelleOption_(opt) + '</label>';
          }).join('') + '</div>';
        btnValider.onclick = function () {
          var indices = Array.prototype.filter.call(contenu.querySelectorAll('input[type="checkbox"]'), function (cb) { return cb.checked; })
            .map(function (cb) { return Number(cb.dataset.index); });
          fermerModale_();
          resolve(indices);
        };

      } else if (contexte.type === 'ressource_choix') {
        var restant = contexte.nombre;
        var choisies = [];
        titre.textContent = (contexte.signe > 0 ? 'Choisissez ' : 'Dépensez ') + contexte.nombre + ' ressource(s) au choix';
        btnAnnuler.hidden = true;
        btnValider.hidden = false;
        btnValider.textContent = 'Valider (arrêter ici)';
        btnValider.onclick = function () { fermerModale_(); resolve(choisies); };

        function render() {
          contenu.innerHTML = '<p class="hint">Il reste ' + restant + ' à choisir (ou "Valider" pour arrêter avant).</p>' +
            '<div class="modal-choix-boutons">' + RESSOURCES_PRODUCTION.map(function (cle) {
              return '<button class="btn btn-secondary btn-choix-ressource" data-ressource="' + cle + '">' + CHAMP_RESSOURCE[cle].label + '</button>';
            }).join('') + '</div>';
          Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-ressource'), function (btn) {
            btn.addEventListener('click', function () {
              choisies.push(btn.dataset.ressource);
              restant--;
              if (restant <= 0) { fermerModale_(); resolve(choisies); } else { render(); }
            });
          });
        }
        render();

      } else if (contexte.type === 'bonus_commerce') {
        titre.textContent = 'Bonus Commerce — choisissez un bonus';
        btnValider.hidden = true;
        btnAnnuler.hidden = false;
        contenu.innerHTML = '<div class="modal-choix-boutons">' +
          contexte.options.map(function (label, i) {
            return '<button class="btn btn-secondary btn-choix-liste" data-index="' + i + '">' + label + '</button>';
          }).join('') + '</div>';
        Array.prototype.forEach.call(contenu.querySelectorAll('.btn-choix-liste'), function (btn) {
          btn.addEventListener('click', function () {
            fermerModale_();
            resolve({ indexChoisi: Number(btn.dataset.index) });
          });
        });
        btnAnnuler.onclick = function () { fermerModale_(); resolve({ annule: true }); };

      } else {
        // Type de contexte inconnu — ne devrait pas arriver (tous les
        // types possibles sont produits par focusEngine.js ci-dessus).
        // Résolution non bloquante par défaut plutôt que de bloquer l'UI.
        console.warn('StrategieService.demanderChoix : type de contexte inconnu :', contexte.type);
        resolve({ annule: true });
        return;
      }

      modal.hidden = false;
    });
  }

  // ------------------------------------------------------------
  // API publique
  // ------------------------------------------------------------

  function afficher(partie) {
    if (!partieAffichee || partieAffichee.id !== partie.id) journal = [];
    partieAffichee = partie;
    renderRessources_(partie);
    renderPistesCivilisation_(partie);
    renderFocusJoueur_(partie);
    renderFocusHeroiques_(partie);
    renderJournal_();
    majBoutonAnnuler_(partie.id);
  }

  document.getElementById('btn-annuler-action').addEventListener('click', annulerDerniereAction_);
  document.getElementById('btn-avancer-moins-avancee').addEventListener('click', avancerMoinsAvancee_);
  document.getElementById('btn-avancer-corrompue').addEventListener('click', avancerCorrompue_);

  return {
    afficher: afficher,
    demanderChoix: demanderChoix
  };
})();
