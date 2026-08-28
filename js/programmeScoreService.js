/**
 * programmeScoreService.js
 * Points de victoire des Programmes — Voidfall Companion PWA
 *
 * Calcule l'Influence réellement rapportée par les 2 objectifs de
 * chaque carte Programme (data/catalogue/programmes.json), à partir de
 * l'état de partie déjà suivi par l'app. Chantier "Points de victoire
 * des Programmes" — avant ce module, objectif1/objectif2 n'étaient que
 * du texte affiché, jamais évalués.
 *
 * Portée : les 32 cartes de programmes.json (emplacements 1/2/3 du
 * plateau Programme) — PAS le Programme de départ (emplacement 0,
 * programmesDepart.json, forme de donnée différente, sans objectif1/
 * objectif2 structurés).
 *
 * Simplifications actées avec l'utilisateur :
 * - S1 (objectif 2) : la nuance "les emplacements de Guilde apportés
 *   par Vaisseaux-Arches ne comptent pas" est ignorée — les
 *   Vaisseaux-Arches ne sont pas un type de vaisseau modélisé dans
 *   l'app (5 types suivis : Corvette/Sentinelle/Destroyer/Cuirassé/
 *   Porte-Vaisseau, voir secteurService.js/CHAMP_PN_PAR_TYPE). Calcul
 *   fait contre le nombre total d'emplacements de Guilde du secteur —
 *   légèrement optimiste si le joueur possède des Vaisseaux-Arches.
 * - W8 (objectif 2) : formulation ambiguë dans le catalogue lui-même
 *   ("jetons Commerce et/ou jetons Prime (selon la formulation
 *   retenue)") — lecture retenue : les deux comptent, additionnés.
 * - "Entretien total" (S2/S7) : valeur BRUTE (SecteurService.getEntretien
 *   + 2 par emplacement Programme "Entretien actif"), pas ajustée par
 *   Cellules énergétiques amélioré — cette Technologie exempte le
 *   PAIEMENT de l'Entretien, pas la définition du terme de jeu utilisée
 *   par ces objectifs.
 *
 * Module pur : aucune dépendance, aucun accès DOM ni IndexedDB.
 * `etat` (voir calculerPointsProgramme) est assemblé par l'appelant
 * (js/strategieService.js, qui a accès à SecteurService/CivilisationService/
 * GameService/calculerNiveauxProduction_).
 */

var ProgrammeScoreService = (function () {
  'use strict';

  // --- Petits helpers partagés par plusieurs objectifs (formes récurrentes) ---

  function nombreSecteursPursAvec_(etat, predicat) {
    return (etat.secteursPurs || []).filter(predicat).length;
  }

  function sommeSecteursPurs_(etat, champFn) {
    return (etat.secteursPurs || []).reduce(function (total, s) { return total + champFn(s); }, 0);
  }

  function pnTotalSecteur_(s) {
    return s.pn.corvette + s.pn.sentinelle + s.pn.destroyer + s.pn.cuirasse + s.pn.porteVaisseau;
  }

  function nombreTypesFlotteDistincts_(s) {
    return ['corvette', 'sentinelle', 'destroyer', 'cuirasse', 'porteVaisseau']
      .filter(function (type) { return s.pn[type] > 0; }).length;
  }

  function nombreTypesGuildeDistincts_(s) {
    return ['guildeFermiers', 'guildeIngenieurs', 'guildeMineurs', 'guildeBanquiers', 'guildeScientifiques']
      .filter(function (champ) { return s[champ] > 0; }).length;
  }

  function seuil_(valeur, min) {
    return valeur >= min;
  }

  function paire_(n) {
    return Math.floor(n / 2);
  }

  // Piste "Pure" = suivie par civilisation.niveaux ET pas dans civilisation.corrompues.
  function niveauPistePure_(etat, piste) {
    var civ = etat.civilisation || {};
    if (civ.corrompues && civ.corrompues[piste]) return 0;
    return (civ.niveaux && civ.niveaux[piste]) || 0;
  }

  function pisteEstCorrompue_(etat, piste) {
    var civ = etat.civilisation || {};
    return !!(civ.corrompues && civ.corrompues[piste]);
  }

  var BAREME_NIVEAU_4_8_12_16 = [0, 4, 8, 12, 16];
  var BAREME_NIVEAU_0_2_4_6_8 = [0, 2, 4, 6, 8];

  // --- Table des 32 cartes — traçable 1:1 contre data/catalogue/programmes.json ---

  var PROGRAMME_OBJECTIFS_ = {
    D1: {
      objectif1: function (e) { return seuil_(nombreSecteursPursAvec_(e, function (s) { return s.population >= 6; }), 1) ? 5 : 0; },
      objectif2: function (e) { return BAREME_NIVEAU_4_8_12_16[niveauPistePure_(e, 'societe')] || 0; }
    },
    D2: {
      objectif1: function (e) { return seuil_(nombreSecteursPursAvec_(e, function (s) { return s.population >= 3; }), 4) ? 5 : 0; },
      objectif2: function (e) { return BAREME_NIVEAU_4_8_12_16[niveauPistePure_(e, 'economie')] || 0; }
    },
    D3: {
      objectif1: function (e) { return seuil_(nombreSecteursPursAvec_(e, function (s) { return s.population >= 5; }), 2) ? 5 : 0; },
      objectif2: function (e) { return BAREME_NIVEAU_4_8_12_16[niveauPistePure_(e, 'gouvernement')] || 0; }
    },
    D4: {
      objectif1: function (e) { return niveauPistePure_(e, 'gouvernement') >= 2 ? 5 : 0; },
      objectif2: function (e) {
        var r = e.ressources || {};
        var total = (r.nourriture || 0) + (r.energie || 0) + (r.materiel || 0);
        return paire_(total) * 1;
      }
    },
    D5: {
      objectif1: function (e) { return niveauPistePure_(e, 'societe') >= 2 ? 5 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.entretien >= 2; }) * 5; }
    },
    D6: {
      objectif1: function (e) { return niveauPistePure_(e, 'economie') >= 2 ? 5 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population >= 4; }) * 4; }
    },
    D7: {
      objectif1: function (e) {
        var pistes = ['societe', 'gouvernement', 'economie'];
        var auMoinsUne = pistes.some(function (p) { return niveauPistePure_(e, p) >= 3; });
        return auMoinsUne ? 4 : 0;
      },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population >= 3; }) * 3; }
    },
    D8: {
      objectif1: function (e) { return sommeSecteursPurs_(e, function (s) { return s.population; }) >= 10 ? 4 : 0; },
      objectif2: function (e) {
        var pistes = ['societe', 'gouvernement', 'economie'];
        return pistes.reduce(function (total, p) { return total + (BAREME_NIVEAU_0_2_4_6_8[niveauPistePure_(e, p)] || 0); }, 0);
      }
    },
    M1: {
      objectif1: function (e) { return ((e.revenu || {}).materiel || 0) >= 8 ? 5 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return pnTotalSecteur_(s) >= 2; }) * 5; }
    },
    M2: {
      objectif1: function (e) { return ((e.revenu || {}).energie || 0) >= 8 ? 5 : 0; },
      objectif2: function (e) { return sommeSecteursPurs_(e, pnTotalSecteur_) * 2; }
    },
    M3: {
      objectif1: function (e) {
        var total = sommeSecteursPurs_(e, function (s) { return s.installationChantierNaval + s.installationBaseStellaire; });
        return total >= 3 ? 6 : 0;
      },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return pnTotalSecteur_(s) >= 3; }) * 7; }
    },
    M4: {
      objectif1: function (e) { return ((e.revenu || {}).credit || 0) >= 4 ? 7 : 0; },
      objectif2: function (e) {
        return nombreSecteursPursAvec_(e, function (s) { return (s.installationChantierNaval + s.installationBaseStellaire) >= 1; }) * 2;
      }
    },
    M5: {
      objectif1: function (e) {
        var total = sommeSecteursPurs_(e, function (s) { return s.installationDefenseSecteur + s.installationBaseStellaire; });
        return total >= 3 ? 5 : 0;
      },
      objectif2: function (e) { return sommeSecteursPurs_(e, pnTotalSecteur_) * 2; }
    },
    M6: {
      objectif1: function (e) { return ((e.revenu || {}).nourriture || 0) >= 8 ? 7 : 0; },
      objectif2: function (e) { return sommeSecteursPurs_(e, function (s) { return s.installationChantierNaval + s.installationBaseStellaire; }) * 2; }
    },
    M7: {
      objectif1: function (e) { return ((e.ressources || {}).science || 0) >= 8 ? 7 : 0; },
      objectif2: function (e) {
        return nombreSecteursPursAvec_(e, function (s) {
          return (s.installationChantierNaval + s.installationDefenseSecteur + s.installationBaseStellaire) >= 3;
        }) * 6;
      }
    },
    M8: {
      objectif1: function (e) { return ((e.revenu || {}).science || 0) >= 8 ? 5 : 0; },
      objectif2: function (e) {
        return nombreSecteursPursAvec_(e, function (s) { return (s.installationDefenseSecteur + s.installationBaseStellaire) >= 1; }) * 3;
      }
    },
    S1: {
      objectif1: function (e) { return e.nombreSecteurTotal > 0 && (e.secteursPurs || []).length === e.nombreSecteurTotal ? 7 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return !s.guildeVacante; }) * 4; }
    },
    S2: {
      objectif1: function (e) { return (e.entretienTotal || 0) >= 10 ? 6 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return nombreTypesGuildeDistincts_(s) >= 3; }) * 5; }
    },
    S3: {
      objectif1: function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers; }) >= 3 ? 7 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.guildeScientifiques >= 1; }) * 4; }
    },
    S4: {
      objectif1: function (e) {
        var ingenieurs = sommeSecteursPurs_(e, function (s) { return s.guildeIngenieurs; });
        var mineurs = sommeSecteursPurs_(e, function (s) { return s.guildeMineurs; });
        return ingenieurs >= 2 && mineurs >= 2 ? 6 : 0;
      },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.guildeBanquiers >= 1; }) * 3; }
    },
    S5: {
      objectif1: function (e) {
        var pistes = ['societe', 'gouvernement', 'economie'];
        return pistes.some(function (p) { return pisteEstCorrompue_(e, p); }) ? 7 : 0;
      },
      objectif2: function (e) { return paire_(sommeSecteursPurs_(e, function (s) { return s.guildeMineurs; })) * 5; }
    },
    S6: {
      objectif1: function (e) { return ((e.corruptionSecteurs || 0) + (e.corruptionMaison || 0)) <= 1 ? 6 : 0; },
      objectif2: function (e) { return paire_(sommeSecteursPurs_(e, function (s) { return s.guildeFermiers; })) * 5; }
    },
    S7: {
      objectif1: function (e) { return (e.entretienTotal || 0) <= 6 ? 5 : 0; },
      objectif2: function (e) { return paire_(sommeSecteursPurs_(e, function (s) { return s.guildeIngenieurs; })) * 5; }
    },
    S8: {
      objectif1: function (e) {
        var types = {};
        (e.secteursPurs || []).forEach(function (s) {
          ['corvette', 'sentinelle', 'destroyer', 'cuirasse', 'porteVaisseau'].forEach(function (type) {
            if (s.pn[type] > 0) types[type] = true;
          });
        });
        return Object.keys(types).length >= 2 ? 4 : 0;
      },
      objectif2: function (e) { return (e.jetonLiberation || 0) * 2; }
    },
    W1: {
      objectif1: function (e) { return (e.jetonCommerce || 0) >= 2 ? 4 : 0; },
      objectif2: function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.entretien === 0; }) * 3; }
    },
    W2: {
      objectif1: function (e) { return (e.jetonLiberation || 0) >= 2 ? 4 : 0; },
      objectif2: function (e) { return (e.gloire || []).reduce(function (t, v) { return t + v; }, 0); }
    },
    W3: {
      objectif1: function (e) { return (e.gloire || []).length >= 3 ? 4 : 0; },
      objectif2: function (e) { return Math.floor(((e.ressources && e.ressources.credit) || 0) / 3) * 4; }
    },
    W4: {
      objectif1: function (e) { return (e.gloire || []).some(function (v) { return v >= 5; }) ? 6 : 0; },
      objectif2: function (e) { return (e.nbTechAmelioree || 0) * 4; }
    },
    W5: {
      objectif1: function (e) { return (e.secteursPurs || []).length >= 4 ? 4 : 0; },
      objectif2: function (e) { return (e.nbTechBase || 0) * 2 + (e.nbTechAmelioree || 0) * 3; }
    },
    W6: {
      objectif1: function (e) { return (e.nbTechAmelioree || 0) >= 2 ? 4 : 0; },
      objectif2: function (e) { return paire_(e.jetonPrime || 0) * 3; }
    },
    W7: {
      objectif1: function (e) { return ((e.nbTechBase || 0) + (e.nbTechAmelioree || 0)) >= 4 ? 4 : 0; },
      objectif2: function (e) { return paire_((e.secteursPurs || []).length) * 5; }
    },
    W8: {
      // Pas de seuil : "Gagnez 4 Influence POUR CHACUNE de vos Technologies
      // améliorées" — multiplicateur direct, sans condition.
      objectif1: function (e) { return (e.nbTechAmelioree || 0) * 4; },
      // Ambigu dans le catalogue lui-même ("selon la formulation retenue") —
      // lecture retenue, actée avec l'utilisateur : les deux comptent.
      objectif2: function (e) { return ((e.jetonCommerce || 0) + (e.jetonPrime || 0)) * 2; }
    }
  };

  /**
   * Calcule les points d'Influence des 2 objectifs d'une carte Programme
   * (par son `code`, ex. "D1") pour un `etat` de partie donné. Retourne
   * `{objectif1, objectif2, total}` (0 partout si le code est inconnu —
   * jamais d'exception, cohérent avec le reste de l'app qui ne bloque
   * jamais sur du vocabulaire non reconnu).
   *
   * `etat` attendu : { secteursPurs[], nombreSecteurTotal, civilisation:
   * {niveaux:{societe,gouvernement,economie}, corrompues:{...}},
   * ressources: {nourriture,energie,materiel,credit,science}, revenu:
   * {nourriture,energie,materiel,credit,science}, entretienTotal,
   * jetonPrime, jetonLiberation, jetonCommerce (nombre), gloire
   * (tableau de valeurs), corruptionSecteurs, corruptionMaison,
   * nbTechBase, nbTechAmelioree } — assemblé par l'appelant
   * (js/strategieService.js), ce module reste pur (aucun accès DB/DOM).
   */
  function calculerPointsProgramme(code, etat) {
    var regles = PROGRAMME_OBJECTIFS_[code];
    if (!regles) return { objectif1: 0, objectif2: 0, total: 0 };
    var etatSur = etat || {};
    var p1 = Math.max(0, Math.round(regles.objectif1(etatSur) || 0));
    var p2 = Math.max(0, Math.round(regles.objectif2(etatSur) || 0));
    return { objectif1: p1, objectif2: p2, total: p1 + p2 };
  }

  return {
    calculerPointsProgramme: calculerPointsProgramme
  };
})();
