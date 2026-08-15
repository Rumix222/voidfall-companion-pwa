/**
 * civilisationService.js
 * Pistes de Civilisation — Voidfall Companion PWA
 * Version 1 — 17/08/2026 (Session 5, Phase 5)
 *
 * Portage de CivilisationService.js (GAS, 206 l.) — contrairement à ce que
 * les en-têtes précédents de gameService.js/focusEngine.js laissaient
 * supposer ("fonctions dédiées, portées en Phase 3/5"), cette logique
 * s'avère PURE côté GAS (aucune RPC Postgres, juste une lecture de
 * l'onglet PisteCivilisation + une mutation en mémoire) : entièrement
 * portable telle quelle, adaptée pour lire le store catalogue
 * IndexedDB `pistesCivilisation` (voir db.js, colonnes type/piste/
 * caseNumero/texte/effet) au lieu de DataService.getPistesCivilisation().
 *
 * Avancer une piste fait deux choses successivement :
 *   1. Incrémente le niveau de la piste (persisté via
 *      GameService.majCivilisation, nouveau cette session).
 *   2. Résout l'Effet de la case atteinte, en réutilisant le moteur
 *      focusEngine.js (FocusEngine.resoudreEffet — wrapper public ajouté
 *      cette session, aucune duplication de logique coût/effet).
 * Les deux mutations (niveau de piste + effet de la case) sont empilées
 * comme UNE SEULE entrée dans la pile d'annulation (annulationService.js),
 * pour qu'"Annuler la dernière action" revienne bien sur les deux à la
 * fois — cohérent avec la sémantique "une action jouée = une entrée".
 *
 * Règle portée telle quelle (voir CivilisationService.js GAS) : en cas
 * d'égalité pour "la piste la moins avancée", ordre fixe Société >
 * Gouvernement > Économie (pas de choix proposé au joueur).
 *
 * Dépend de : db.js (DB), gameService.js (GameService.majCivilisation/
 * majPlateauMaison), focusEngine.js (FocusEngine.resoudreEffet),
 * annulationService.js (AnnulationService.empiler) — à charger avant ce
 * fichier.
 */

var CivilisationService = (function () {
  'use strict';

  var PISTES = ['societe', 'gouvernement', 'economie'];
  var NOM_PISTE = { societe: 'Société', gouvernement: 'Gouvernement', economie: 'Économie' };
  var CHAMP_NIVEAU = { societe: 'civSociete', gouvernement: 'civGouvernement', economie: 'civEconomie' };
  var CHAMP_CORROMPUE = { societe: 'civCorrompueSociete', gouvernement: 'civCorrompueGouvernement', economie: 'civCorrompueEconomie' };
  var NIVEAU_MAX = 7;

  function normaliser_(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function parseEffetSafe_(valeur) {
    if (!valeur) return {};
    if (typeof valeur !== 'string') return valeur;
    try {
      return JSON.parse(valeur);
    } catch (e) {
      return {};
    }
  }

  /**
   * Trouve la ligne de pistesCivilisation pour une maison/piste/case
   * donnée (fallback Type -> "Standard", comme FocusService.obtenirMiseEnPlace).
   */
  function trouverCase_(nomMaison, piste, numeroCase) {
    var nomPiste = NOM_PISTE[piste];
    if (!nomPiste) return Promise.reject(new Error('Piste de Civilisation inconnue : ' + piste));

    return DB.getAll('pistesCivilisation').then(function (lignes) {
      var nomMaisonNorm = normaliser_(nomMaison);
      var correspondantes = lignes.filter(function (l) {
        return normaliser_(l.piste) === normaliser_(nomPiste) && Number(l.caseNumero) === Number(numeroCase);
      });
      var ligne = correspondantes.filter(function (l) { return normaliser_(l.type) === nomMaisonNorm; })[0]
        || correspondantes.filter(function (l) { return normaliser_(l.type) === 'standard'; })[0];

      if (!ligne) {
        throw new Error('Case ' + numeroCase + ' introuvable pour la piste ' + nomPiste + ' (maison ' + nomMaison + ').');
      }
      return ligne;
    });
  }

  /**
   * Avance une piste précise d'une case (aucun effet, pas d'écriture, ne
   * fait rien si déjà au maximum) : {piste, ancienNiveau, nouveauNiveau,
   * texte, effetJournal, effetSucces, dejaMaximum}.
   */
  function avancerPiste(partieId, nomMaison, piste, demanderChoix) {
    if (PISTES.indexOf(piste) === -1) return Promise.reject(new Error('Piste de Civilisation inconnue : ' + piste));

    return DB.get('plateauMaison', partieId).then(function (pm) {
      if (!pm) throw new Error('Plateau maison introuvable (partie ' + partieId + ').');

      var champNiveau = CHAMP_NIVEAU[piste];
      var ancien = pm[champNiveau] || 0;
      if (ancien >= NIVEAU_MAX) {
        return { piste: piste, ancienNiveau: ancien, nouveauNiveau: ancien, texte: '', effetJournal: [], effetSucces: true, dejaMaximum: true };
      }
      var nouveau = ancien + 1;

      return trouverCase_(nomMaison, piste, nouveau).then(function (ligne) {
        var champsNiveau = {};
        champsNiveau[champNiveau] = nouveau;

        return GameService.majCivilisation(partieId, champsNiveau).then(function () {
          var effet = parseEffetSafe_(ligne.effet);
          var source = 'Case ' + nouveau + ' — ' + NOM_PISTE[piste];
          var etatPourEffet = Object.assign({}, pm);
          etatPourEffet[champNiveau] = nouveau;

          return FocusEngine.resoudreEffet(etatPourEffet, effet, source, ligne.texte || '', demanderChoix).then(function (resultatEffet) {
            var mutations = [{ champ: champNiveau, avant: ancien, apres: nouveau }];
            var persisterRessources = Promise.resolve();

            if (resultatEffet.succes && resultatEffet.mutations.length) {
              var champsEffet = {};
              resultatEffet.mutations.forEach(function (m) {
                champsEffet[m.champ] = resultatEffet.etatResultat[m.champ];
                mutations.push(m);
              });
              persisterRessources = GameService.majPlateauMaison(partieId, champsEffet);
            }

            return persisterRessources
              .then(function () { return AnnulationService.empiler(partieId, { source: source, mutations: mutations }); })
              .then(function () {
                return {
                  piste: piste,
                  ancienNiveau: ancien,
                  nouveauNiveau: nouveau,
                  texte: ligne.texte || '',
                  effetJournal: resultatEffet.succes ? resultatEffet.journal : [source + ' : effet annulé (choix refusé) — seul l\u2019avancement de piste est conservé.'],
                  effetSucces: resultatEffet.succes
                };
              });
          });
        });
      });
    });
  }

  /**
   * Avance la piste la moins avancée (égalité : ordre fixe Société >
   * Gouvernement > Économie).
   */
  function avancerPisteMoinsAvancee(partieId, nomMaison, demanderChoix) {
    return DB.get('plateauMaison', partieId).then(function (pm) {
      if (!pm) throw new Error('Plateau maison introuvable (partie ' + partieId + ').');
      var pisteChoisie = PISTES.slice().sort(function (a, b) {
        return (pm[CHAMP_NIVEAU[a]] || 0) - (pm[CHAMP_NIVEAU[b]] || 0);
      })[0];
      return avancerPiste(partieId, nomMaison, pisteChoisie, demanderChoix);
    });
  }

  /**
   * Coche/décoche la piste "Corrompue" — marqueur manuel, aucun effet.
   */
  function definirCorruption(partieId, piste, valeur) {
    if (PISTES.indexOf(piste) === -1) return Promise.reject(new Error('Piste de Civilisation inconnue : ' + piste));
    var champs = {};
    champs[CHAMP_CORROMPUE[piste]] = !!valeur;
    return GameService.majCivilisation(partieId, champs);
  }

  /**
   * Avance d'une case la piste marquée Corrompue, SANS résoudre l'effet
   * de la case ("sans gagner le bénéfice de la case"), puis décoche
   * automatiquement. S'il y a plusieurs pistes cochées à la fois (ne
   * devrait pas arriver en jeu normal), seule la première dans l'ordre
   * fixe Société > Gouvernement > Économie est résolue.
   */
  function avancerPisteCorrompue(partieId) {
    return DB.get('plateauMaison', partieId).then(function (pm) {
      if (!pm) throw new Error('Plateau maison introuvable (partie ' + partieId + ').');
      var piste = PISTES.filter(function (p) { return pm[CHAMP_CORROMPUE[p]]; })[0];
      if (!piste) throw new Error('Aucune piste n\'est actuellement marquée Corrompue.');

      var champNiveau = CHAMP_NIVEAU[piste];
      var champCorrompue = CHAMP_CORROMPUE[piste];
      var ancien = pm[champNiveau] || 0;
      var nouveau = Math.min(NIVEAU_MAX, ancien + 1);

      var champs = {};
      champs[champNiveau] = nouveau;
      champs[champCorrompue] = false;

      return GameService.majCivilisation(partieId, champs).then(function () {
        var mutations = [
          { champ: champNiveau, avant: ancien, apres: nouveau },
          { champ: champCorrompue, avant: true, apres: false }
        ];
        return AnnulationService.empiler(partieId, { source: 'Piste Corrompue — ' + NOM_PISTE[piste], mutations: mutations });
      }).then(function () {
        return { piste: piste, ancienNiveau: ancien, nouveauNiveau: nouveau };
      });
    });
  }

  /**
   * Détail complet (texte des 7 cases) des 3 pistes pour une maison —
   * donnée de référence statique, une seule lecture du store catalogue
   * pour les 21 cases (même optimisation que côté GAS).
   */
  function obtenirDetailPistes(nomMaison) {
    return DB.getAll('pistesCivilisation').then(function (lignes) {
      var nomMaisonNorm = normaliser_(nomMaison);
      var resultat = {};
      PISTES.forEach(function (piste) {
        var nomPisteNorm = normaliser_(NOM_PISTE[piste]);
        resultat[piste] = [];
        for (var c = 1; c <= 7; c++) {
          var correspondantes = lignes.filter(function (l) {
            return normaliser_(l.piste) === nomPisteNorm && Number(l.caseNumero) === c;
          });
          var ligne = correspondantes.filter(function (l) { return normaliser_(l.type) === nomMaisonNorm; })[0]
            || correspondantes.filter(function (l) { return normaliser_(l.type) === 'standard'; })[0];
          resultat[piste].push({ case: c, texte: ligne ? (ligne.texte || '') : '' });
        }
      });
      return resultat;
    });
  }

  return {
    PISTES: PISTES,
    NOM_PISTE: NOM_PISTE,
    NIVEAU_MAX: NIVEAU_MAX,
    avancerPiste: avancerPiste,
    avancerPisteMoinsAvancee: avancerPisteMoinsAvancee,
    definirCorruption: definirCorruption,
    avancerPisteCorrompue: avancerPisteCorrompue,
    obtenirDetailPistes: obtenirDetailPistes
  };
})();
