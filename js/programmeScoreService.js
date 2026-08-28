/**
 * programmeScoreService.js
 * Points de victoire des Programmes — Voidfall Companion PWA
 *
 * Calcule l'Influence réellement rapportée par les objectifs de chaque
 * carte Programme, à partir de l'état de partie déjà suivi par l'app.
 * Chantier "Points de victoire des Programmes" — avant ce module,
 * ces objectifs n'étaient que du texte affiché, jamais évalués.
 *
 * Portée : les 32 cartes de data/catalogue/programmes.json (emplacements
 * 1/2/3 du plateau Programme, `calculerPointsProgramme`) ET les 28
 * cartes pertinentes de data/catalogue/programmesDepart.json
 * (emplacement 0 "Programme de départ", `calculerPointsProgrammeDepart`
 * — forme de donnée différente, tableau `objectifs` de longueur
 * variable au lieu d'objectif1/objectif2 fixes ; les 2 entrées
 * `supplementaire:true` de Marqualos, H13-A2/H13-B2, sont EXCLUES —
 * jamais câblées sur l'emplacement 0 par GameService.creerPartie).
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
  // Programme de départ (Purificateur H12-B/Matrice neuronale H6-B) —
  // même principe que les barèmes ci-dessus, valeurs propres à ces 2 cartes.
  var BAREME_NIVEAU_0_3_6_9_12 = [0, 3, 6, 9, 12];

  var CLES_RESSOURCES_ = ['nourriture', 'energie', 'materiel', 'credit', 'science'];

  // Programme de départ — "Gagnez N Influence pour chaque type de
  // ressource dont vous avez au moins X unités en réserve" (H9-B/H6-B) :
  // nombre de TYPES (parmi les 5) dont la réserve atteint le seuil.
  function nombreTypesRessourceAvecReserveAuMoins_(etat, seuil) {
    var r = etat.ressources || {};
    return CLES_RESSOURCES_.filter(function (cle) { return (r[cle] || 0) >= seuil; }).length;
  }

  // Programme de départ — "Gagnez N Influence pour chaque ressource du
  // type que vous possédez le moins. En cas d'égalité, ne marquez qu'un
  // seul type." (H11-A/H13-B2) : littéralement la valeur du type le
  // MOINS abondant (pas un compte de types à égalité — la phrase
  // "un seul type" élimine explicitement ce doublage).
  function reserveMinimale_(etat) {
    var r = etat.ressources || {};
    return CLES_RESSOURCES_.reduce(function (min, cle) { return Math.min(min, r[cle] || 0); }, Infinity);
  }

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

  // --- Table du Programme de DÉPART (data/catalogue/programmesDepart.json,
  // emplacement 0) — 30 cartes au catalogue, 28 pertinentes ici (2
  // "supplémentaire" : true, H13-A2/H13-B2, bonus de Marqualos JAMAIS
  // câblées sur l'emplacement 0 par GameService.creerPartie — voir
  // obtenirProgrammeDepart_, gameService.js — donc jamais atteintes en
  // pratique, non incluses). Forme différente du catalogue principal :
  // un tableau `objectifs` de longueur VARIABLE (2 à 4 lignes selon la
  // carte), pas 2 champs fixes — chaque entrée ci-dessous est donc un
  // TABLEAU de fonctions (une par ligne, dans le même ordre que le
  // catalogue), pas un objectif1/objectif2. Contrairement à
  // PROGRAMME_OBJECTIFS_ ci-dessus, certaines lignes sont un MALUS
  // (perte d'Influence par Corruption sur la fiche Maison — H10-A/
  // H10-B/H14-A/H14-B) : retournent un nombre NÉGATIF, jamais clampé à 0
  // ligne par ligne (seul le total final d'Influence du joueur, toutes
  // sources combinées, est plancher à 0 côté strategieService.js).
  // "Corruption de votre fiche Maison" = `etat.corruptionMaison`
  // UNIQUEMENT (texte du catalogue explicite : ignore les secteurs ET
  // les Chambres de Décontamination) — DIFFÉRENT du S6 du catalogue
  // principal, qui combine secteurs+fiche Maison.
  var PROGRAMME_DEPART_OBJECTIFS_ = {
    // --- Motif "A" (3 lignes, secteurs Purs) : H1-A/H3-A/H4-A/H13-A/H2-A ---
    'H1-A': [
      function (e) { return nombreSecteursPursAvec_(e, function () { return true; }) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.installationDefenseSecteur >= 1; }) * 1; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.installationChantierNaval >= 1; }) * 2; }
    ],
    // --- Motif "B" (4 lignes, population/guildes) : H1-B/H3-B/H4-B/H13-B/H2-B ---
    'H1-B': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population === 5; }) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population === 6; }) * 6; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeBanquiers; }) * 1; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques; }) * 1; }
    ],
    'H12-A': [
      function (e) { return (e.entretienTotal || 0) * 2; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return (s.installationChantierNaval + s.installationDefenseSecteur + s.installationBaseStellaire) >= 1; }) * 1; }
    ],
    'H12-B': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population === 5; }) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population === 6; }) * 6; },
      function (e) { return BAREME_NIVEAU_0_3_6_9_12[niveauPistePure_(e, 'economie')] || 0; }
    ],
    'H7-A': [
      function (e) { return paire_(sommeSecteursPurs_(e, function (s) { return s.population; })) * 1; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.installationChantierNaval >= 1; }) * 3; }
    ],
    'H7-B': [
      function (e) { return nombreSecteursPursAvec_(e, function () { return true; }) * 2; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques; }) * 1; }
    ],
    'H10-A': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.installationChantierNaval >= 1; }) * 4; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeIngenieurs; }) * 1; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeMineurs; }) * 1; },
      function (e) { return -(e.corruptionMaison || 0) * 1; }
    ],
    'H10-B': [
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.population; }); },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.pn.sentinelle >= 1; }) * 2; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.installationDefenseSecteur >= 1; }) * 3; },
      function (e) { return -(e.corruptionMaison || 0) * 2; }
    ],
    'H5-A': [
      function (e) { return (e.nbTechBase || 0) * 1; },
      function (e) { return (e.nbTechAmelioree || 0) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function () { return true; }) * 3; }
    ],
    'H5-B': [
      function (e) { return (e.nbTechBase || 0) * 2; },
      function (e) { return (e.nbTechAmelioree || 0) * 4; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques; }) * 1; }
    ],
    'H9-A': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return !s.guildeVacante; }) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return (s.installationChantierNaval + s.installationDefenseSecteur + s.installationBaseStellaire) >= 3; }) * 2; },
      function (e) {
        var pistes = ['societe', 'gouvernement', 'economie'];
        return pistes.reduce(function (total, p) { return total + (BAREME_NIVEAU_0_2_4_6_8[niveauPistePure_(e, p)] || 0); }, 0);
      }
    ],
    'H9-B': [
      function (e) { return nombreTypesRessourceAvecReserveAuMoins_(e, 8) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return nombreTypesGuildeDistincts_(s) >= 3; }) * 5; }
    ],
    'H8-A': [
      function (e) { return nombreSecteursPursAvec_(e, function () { return true; }) * 3; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeIngenieurs; }) * 1; },
      function (e) { return (e.jetonLiberation || 0) * 1; },
      function (e) { return paire_(e.jetonPrime || 0) * 1; }
    ],
    'H8-B': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return pnTotalSecteur_(s) >= 2; }) * 3; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population >= 4; }) * 3; },
      function (e) { return (e.jetonLiberation || 0) * 1; },
      function (e) { return paire_(e.jetonPrime || 0) * 1; }
    ],
    'H11-A': [
      function (e) { return reserveMinimale_(e) * 2; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.pn.porteVaisseau >= 1; }) * 3; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs + s.guildeBanquiers + s.guildeScientifiques; }) * 1; }
    ],
    'H11-B': [
      function (e) { return (e.gloire || []).reduce(function (t, v) { return t + v; }, 0); },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return (s.installationChantierNaval + s.installationBaseStellaire) >= 1; }) * 1; },
      function (e) { return Math.floor(sommeSecteursPurs_(e, pnTotalSecteur_) / 3) * 3; }
    ],
    'H14-A': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return pnTotalSecteur_(s) >= 2; }) * 4; },
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.installationChantierNaval >= 1; }) * 3; },
      function (e) { return -(e.corruptionMaison || 0) * 2; }
    ],
    'H14-B': [
      function (e) { return nombreSecteursPursAvec_(e, function (s) { return s.population >= 4; }) * 3; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers + s.guildeIngenieurs + s.guildeMineurs; }) * 1; },
      function (e) { return -(e.corruptionMaison || 0) * 1; }
    ],
    'H6-A': [
      function (e) { return nombreSecteursPursAvec_(e, function () { return true; }) * 2; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeFermiers; }) * 2; }
    ],
    'H6-B': [
      function (e) { return nombreTypesRessourceAvecReserveAuMoins_(e, 8) * 3; },
      function (e) { return BAREME_NIVEAU_0_3_6_9_12[niveauPistePure_(e, 'gouvernement')] || 0; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeBanquiers; }) * 1; },
      function (e) { return sommeSecteursPurs_(e, function (s) { return s.guildeScientifiques; }) * 1; }
    ]
  };
  // Motif "A"/"B" partagé tel quel (texte IDENTIQUE au catalogue) par
  // plusieurs cartes — référence directe plutôt que dupliquer le tableau.
  PROGRAMME_DEPART_OBJECTIFS_['H3-A'] = PROGRAMME_DEPART_OBJECTIFS_['H4-A'] = PROGRAMME_DEPART_OBJECTIFS_['H13-A'] = PROGRAMME_DEPART_OBJECTIFS_['H2-A'] = PROGRAMME_DEPART_OBJECTIFS_['H1-A'];
  PROGRAMME_DEPART_OBJECTIFS_['H3-B'] = PROGRAMME_DEPART_OBJECTIFS_['H4-B'] = PROGRAMME_DEPART_OBJECTIFS_['H13-B'] = PROGRAMME_DEPART_OBJECTIFS_['H2-B'] = PROGRAMME_DEPART_OBJECTIFS_['H1-B'];

  /**
   * Calcule les points d'Influence du Programme de DÉPART (`code` type
   * "H1-A", `etat` — même contrat que calculerPointsProgramme ci-dessous).
   * Retourne `{lignes: [n1, n2, ...], total}` — `lignes` a la MÊME
   * longueur que `objectifs` au catalogue (2 à 4), dans le même ordre ;
   * `total` peut être négatif (malus Corruption), jamais clampé ici — le
   * plancher à 0 s'applique au total d'Influence du joueur, pas ligne
   * par ligne. `{lignes: [], total: 0}` si le code est inconnu (jamais
   * d'exception).
   */
  function calculerPointsProgrammeDepart(code, etat) {
    var lignes = PROGRAMME_DEPART_OBJECTIFS_[code];
    if (!lignes) return { lignes: [], total: 0 };
    var etatSur = etat || {};
    var valeurs = lignes.map(function (fn) { return Math.round(fn(etatSur) || 0); });
    var total = valeurs.reduce(function (t, v) { return t + v; }, 0);
    return { lignes: valeurs, total: total };
  }

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
    calculerPointsProgramme: calculerPointsProgramme,
    calculerPointsProgrammeDepart: calculerPointsProgrammeDepart
  };
})();
