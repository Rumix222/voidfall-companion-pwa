/**
 * civilisationService.js
 * Pistes de Civilisation — Voidfall Companion PWA
 * Version 3 — 20/08/2026 (EVOLUTION 6 — effet "avance_rapide" automatisé, incrément supplémentaire de la piste concernée)
 *
 * 20/08/2026 (EVOLUTION 6 — effet "avance_rapide" de piste Civilisation,
 * voir TODO.md) : avancerPiste incrémente désormais AUTOMATIQUEMENT la
 * piste d'un niveau supplémentaire quand l'effet de la case résolue est
 * "avance_rapide" (voir appliquerAvanceRapideSiPresent_) — "simplement
 * incrémenter le niveau de la piste concernée" (TODO.md), SANS résoudre
 * l'effet de la nouvelle case atteinte (même principe qu'
 * avancerPisteCorrompue, qui avance aussi sans bénéfice de case). Clé
 * détectée via le même signal qu'EVOLUTION 4 (suffixe "à appliquer
 * manuellement." du journal FocusEngine, "avance_rapide" restant dans
 * CLES_CIVILISATION_HORS_PERIMETRE côté focusEngine.js — AUCUNE mutation
 * de piste ne pourrait de toute façon transiter par son diff générique,
 * limité aux ressources/cubeActif/jetons, voir focusEngine.js en-tête) :
 * scope strictement limité à avancerPiste (piste Civilisation) —
 * "avance_rapide" n'apparaît d'ailleurs QUE dans data/catalogue/
 * pistesCivilisation.json (jamais evenements.json/focus.json, vérifié),
 * donc aucun risque de régression côté Focus/Événements. Si la piste est
 * déjà au niveau maximum au moment de l'avance_rapide, aucune écriture
 * supplémentaire (journal le signale simplement). Une SEULE mutation de
 * champNiveau empilée dans la pile d'annulation (ancien -> niveau final,
 * l'étape intermédiaire `nouveau` n'y apparaît jamais) pour qu'"Annuler"
 * revienne correctement en un coup, même avec 2 écritures DB successives.
 * `nouveauNiveau` du résultat reflète désormais le niveau final (après
 * avance_rapide éventuel) — aucun changement nécessaire côté appelant
 * (strategieService.js, déjà générique sur ce champ). Nouveaux tests
 * dans civilisationService_test.js (incrément simple, cumul avec piste
 * déjà proche du maximum, déjà au maximum).
 *
 * 20/08/2026 (EVOLUTION 4 — effet manuel de piste Civilisation, voir
 * TODO.md) : avancerPiste affiche désormais un rappel temporaire (popup
 * `demanderChoix({type:'confirmation'})`, même mécanisme déjà utilisé
 * côté Cadre "gain" d'Événement galactique — index.html,
 * appliquerCadreManuelEtRafraichir_) quand l'Effet résolu par
 * FocusEngine.resoudreEffet retombe sur une clé non automatisée. Texte
 * dédié pour gagner_technologie ("Choisir une technologie [de base ou
 * avancée] manuellement") et gagner_programme ("Choisir un programme
 * [<type>] manuellement", type omis pour la valeur numérique générique) ;
 * repli générique (texte imprimé de la case) pour toute autre clé non
 * automatisée. Le journal Focus ("Actions réalisées") est simplifié
 * UNIQUEMENT pour ces 2 clés ("technologie choisie manuellement"/
 * "programme choisi manuellement" — pas de rappel du choix base/avancée
 * ni du type de Programme, comme demandé) ; toute autre clé garde son
 * texte technique existant ("⚠️ ... non automatisé..."), inchangé. Aucune
 * modification de focusEngine.js (seule source de vérité sur ce qui est
 * automatisé) : le rappel est détecté après coup, via le suffixe commun
 * "— à appliquer manuellement." des lignes de journal concernées — donc
 * strictement propre à avancerPiste, sans aucun effet sur les actions
 * Focus (qui appellent le même moteur mais n'affichent jamais ce rappel).
 * Purement informatif : n'affecte jamais la persistance déjà faite
 * (avancement de piste + mutations de l'Effet). Nouveau fichier de test
 * dédié (civilisationService_test.js — le module en était jusqu'ici
 * dépourvu, dette connue signalée dans CLAUDE.md).
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

  // ------------------------------------------------------------
  // 20/08/2026 (EVOLUTION 4 — effet manuel de piste Civilisation, voir
  // TODO.md) : quand l'Effet d'une case résolue par FocusEngine.
  // resoudreEffet retombe sur une clé "hors périmètre"/non reconnue (voir
  // focusEngine.js — CLES_SECTEUR_HORS_PERIMETRE/CLES_CIVILISATION_
  // HORS_PERIMETRE/produire_*/repli générique), la ligne de journal
  // correspondante se termine TOUJOURS par "— à appliquer manuellement."
  // (les 4 branches concernées partagent ce même suffixe) — c'est le seul
  // signal utilisé ici pour détecter qu'un rappel est nécessaire, plutôt
  // que de dupliquer la liste des clés non automatisées de focusEngine.js
  // (qui reste ainsi la SEULE source de vérité sur ce qui est automatisé
  // ou non). focusEngine.js n'est PAS modifié par cette évolution :
  // aucune régression possible côté Focus (qui appelle le même
  // resoudreCle_ mais n'affiche jamais ce rappel, propre à avancerPiste
  // ci-dessous).
  // ------------------------------------------------------------

  var SUFFIXE_MANUEL_ = '\u2014 \u00e0 appliquer manuellement.';

  /**
   * Extrait le nom de clé Effet ("gagner_technologie", "retirer_corruption",
   * ...) d'une ligne de journal FocusEngine "manuelle" — reconnaît les 2
   * gabarits produits par focusEngine.js : '⚠️ "cle" non automatisé (...)'
   * (CLES_SECTEUR_HORS_PERIMETRE/CLES_CIVILISATION_HORS_PERIMETRE/
   * produire_*) et 'effet non chiffré (cle...)' (repli générique). `null`
   * si la ligne ne correspond à aucun des deux (ne devrait pas arriver
   * pour une ligne qui se termine par SUFFIXE_MANUEL_, mais robuste par
   * prudence plutôt que de lever une erreur sur un futur gabarit).
   */
  function extraireCleManuelle_(ligneJournal) {
    var mGuillemets = /"([a-z_]+)"\s+non automatis\u00e9/.exec(ligneJournal);
    if (mGuillemets) return mGuillemets[1];
    var mGenerique = /effet non chiffr\u00e9 \(([a-z_]+)/.exec(ligneJournal);
    if (mGenerique) return mGenerique[1];
    return null;
  }

  /**
   * Repère, dans `journal` (résultat de FocusEngine.resoudreEffet), les
   * lignes correspondant à une clé Effet non automatisée — {index, cle}
   * pour chacune (index = position dans le tableau, pour pouvoir
   * remplacer PRÉCISÉMENT cette ligne plus bas sans toucher aux autres).
   */
  function extraireLignesManuelles_(journal) {
    var resultat = [];
    (journal || []).forEach(function (ligne, index) {
      if (typeof ligne !== 'string' || ligne.indexOf(SUFFIXE_MANUEL_) === -1) return;
      var cle = extraireCleManuelle_(ligne);
      if (cle) resultat.push({ index: index, cle: cle });
    });
    return resultat;
  }

  /**
   * Cherche récursivement la valeur associée à `cle` dans le JSON Effet
   * BRUT (avant résolution) d'une case — traverse objets, tableaux
   * `choice`/`choice_repeat.options`, et les chaînes "nues" d'un tableau
   * `choice` (ex. ["gagner_programme", "gagner_commerce"], voir
   * focusEngine.js/resoudreOption_ : une option-chaîne équivaut à
   * {cle: 1}). Vérifié sur tout data/catalogue/pistesCivilisation.json :
   * "gagner_technologie"/"gagner_programme" n'apparaissent jamais plus
   * d'une fois dans l'Effet d'une même case — la première correspondance
   * trouvée est donc toujours la bonne, même si elle est nichée dans un
   * "choice" dont une AUTRE option a finalement été résolue (le journal,
   * lui, dit fiablement QUELLE clé a réellement été appliquée — voir
   * extraireLignesManuelles_ ci-dessus).
   */
  function trouverValeurCle_(effet, cle) {
    if (effet == null) return undefined;
    if (typeof effet === 'string') return effet === cle ? 1 : undefined;
    if (Array.isArray(effet)) {
      for (var i = 0; i < effet.length; i++) {
        var v = trouverValeurCle_(effet[i], cle);
        if (v !== undefined) return v;
      }
      return undefined;
    }
    if (typeof effet !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(effet, cle)) return effet[cle];
    var cles = Object.keys(effet);
    for (var j = 0; j < cles.length; j++) {
      var trouve = trouverValeurCle_(effet[cles[j]], cle);
      if (trouve !== undefined) return trouve;
    }
    return undefined;
  }

  // Types de Programme reconnus par le catalogue (pistesCivilisation.json,
  // gagner_programme: "force"/"soutien"/"domination"/"richesse" — la
  // valeur numérique 1, elle, signifie "un Programme au choix", sans type
  // imposé).
  var TYPES_PROGRAMME_CONNUS_ = ['force', 'soutien', 'domination', 'richesse'];

  /**
   * Construit le texte de rappel (popup) ET, pour les 2 clés explicitement
   * demandées par TODO.md (EVOLUTION 4), le libellé simplifié à écrire à
   * la place de la ligne de journal technique — `journal: null` pour
   * toute autre clé (générique) signifie "garder la ligne de journal
   * telle quelle" (TODO.md ne demande la simplification que pour
   * gagner_technologie/gagner_programme). Le repli générique réutilise le
   * texte imprimé de la case (`texteCase`, déjà lisible), même principe
   * que le rappel manuel déjà en place côté Cadre d'Événement galactique
   * "gain" (index.html, appliquerCadreManuelEtRafraichir_ :
   * cadre.instruction || cadre.texte).
   */
  function texteRappelPourCle_(cle, valeur, texteCase) {
    if (cle === 'gagner_technologie') {
      var estArray = Array.isArray(valeur);
      var aBase = estArray ? valeur.indexOf('base') !== -1 : valeur === 'base';
      var aAmelioree = estArray ? valeur.indexOf('amelioree') !== -1 : valeur === 'amelioree';
      var precisionTech = (aBase && aAmelioree) ? ' de base ou avanc\u00e9e' : (aBase ? ' de base' : (aAmelioree ? ' avanc\u00e9e' : ''));
      return { rappel: 'Choisir une technologie' + precisionTech + ' manuellement', journal: 'technologie choisie manuellement' };
    }
    if (cle === 'gagner_programme') {
      var type = (typeof valeur === 'string' && TYPES_PROGRAMME_CONNUS_.indexOf(valeur) !== -1) ? valeur : '';
      return { rappel: 'Choisir un programme' + (type ? ' ' + type : '') + ' manuellement', journal: 'programme choisi manuellement' };
    }
    return { rappel: texteCase || 'Effet \u00e0 r\u00e9soudre manuellement.', journal: null };
  }

  /**
   * Affiche, le cas échéant, un rappel temporaire (popup `demanderChoix`,
   * contexte 'confirmation' — déjà utilisé pour le même besoin côté Cadre
   * "gain" d'Événement galactique, voir index.html) pour tout effet de
   * case résolu manuellement, et renvoie le journal éventuellement
   * simplifié (gagner_technologie/gagner_programme uniquement). Ne bloque
   * jamais l'avancement de la piste (déjà persisté à ce stade) : la
   * popup est purement informative, son résultat (Valider/Annuler) n'est
   * pas exploité. `demanderChoix` optionnel (repli silencieux si absent,
   * ex. contexte de test sans IHM) — cohérent avec le reste du fichier,
   * qui accepte déjà un `demanderChoix` fourni par l'appelant.
   */
  function afficherRappelsManuelsEtAjusterJournal_(journal, effet, texteCase, source, demanderChoix) {
    var lignesManuelles = extraireLignesManuelles_(journal);
    if (!lignesManuelles.length || typeof demanderChoix !== 'function') {
      return Promise.resolve(journal);
    }

    var journalAjuste = journal.slice();
    var rappels = lignesManuelles.map(function (lm) {
      var valeur = trouverValeurCle_(effet, lm.cle);
      var info = texteRappelPourCle_(lm.cle, valeur, texteCase);
      if (info.journal) journalAjuste[lm.index] = source + ' : ' + info.journal;
      return info.rappel;
    });

    return Promise.resolve(demanderChoix({
      type: 'confirmation',
      titre: 'Effet \u00e0 r\u00e9soudre manuellement',
      message: '<em>' + rappels.join('<br>') + '</em>',
      texteValider: 'Valider'
    })).then(function () { return journalAjuste; });
  }

  /**
   * 20/08/2026 (EVOLUTION 6 — effet "avance_rapide" de piste Civilisation,
   * voir TODO.md) : "simplement incrémenter le niveau de la piste
   * concernée" — SANS résoudre l'effet de la nouvelle case atteinte (même
   * principe que CivilisationService.avancerPisteCorrompue, qui avance
   * aussi sans bénéfice de case). Cette clé n'apparaît QUE dans
   * data/catalogue/pistesCivilisation.json (jamais evenements.json/
   * focus.json — vérifié), toujours seule (jamais nichée dans un
   * "choice"), toujours sur la piste en cours d'avancement elle-même
   * ("la piste concernée", TODO.md) : repérée ici via le même signal
   * qu'EVOLUTION 4 (extraireLignesManuelles_, ligne de journal
   * "à appliquer manuellement." pour la clé "avance_rapide", puisque
   * focusEngine.js la laisse volontairement dans
   * CLES_CIVILISATION_HORS_PERIMETRE — aucune mutation de piste n'y
   * transiterait de toute façon, hors du diff générique de focusEngine.js,
   * voir son en-tête). Si la piste est déjà au niveau maximum, aucun
   * incrément supplémentaire n'est possible : le journal le signale
   * simplement, sans écriture. Retourne { niveauFinal, journal } —
   * `journal` a la ligne "avance_rapide" remplacée par un texte clair, le
   * reste inchangé (pour un éventuel effet manuel resté sur la MÊME
   * case, cf. EVOLUTION 4, résolu séparément par l'appelant).
   */
  function appliquerAvanceRapideSiPresent_(partieId, champNiveau, niveauApresAvancementNormal, journal) {
    var lignesManuelles = extraireLignesManuelles_(journal);
    var ligneAvanceRapide = lignesManuelles.filter(function (lm) { return lm.cle === 'avance_rapide'; })[0];
    if (!ligneAvanceRapide) return Promise.resolve({ niveauFinal: niveauApresAvancementNormal, journal: journal });

    var journalAjuste = journal.slice();
    var niveauSupplementaire = Math.min(NIVEAU_MAX, niveauApresAvancementNormal + 1);

    if (niveauSupplementaire === niveauApresAvancementNormal) {
      journalAjuste[ligneAvanceRapide.index] = 'Avance rapide \u2014 piste d\u00e9j\u00e0 au niveau maximum.';
      return Promise.resolve({ niveauFinal: niveauApresAvancementNormal, journal: journalAjuste });
    }

    var champs = {};
    champs[champNiveau] = niveauSupplementaire;
    return GameService.majCivilisation(partieId, champs).then(function () {
      journalAjuste[ligneAvanceRapide.index] = 'Avance rapide \u2014 piste avanc\u00e9e jusqu\u2019au niveau ' + niveauSupplementaire + '.';
      return { niveauFinal: niveauSupplementaire, journal: journalAjuste };
    });
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

            return persisterRessources.then(function () {
              if (!resultatEffet.succes) {
                var journalEchec = [source + ' : effet annul\u00e9 (choix refus\u00e9) — seul l\u2019avancement de piste est conserv\u00e9.'];
                return AnnulationService.empiler(partieId, { source: source, mutations: mutations }).then(function () {
                  return {
                    piste: piste, ancienNiveau: ancien, nouveauNiveau: nouveau, texte: ligne.texte || '',
                    effetJournal: journalEchec, effetSucces: false
                  };
                });
              }

              // 20/08/2026 (EVOLUTION 6 — voir TODO.md) : "avance_rapide"
              // résolu AVANT d'empiler l'annulation — une seule mutation
              // de champNiveau (mutations[0], `avant: ancien`) porte
              // directement le niveau FINAL en `apres` (ancien -> niveau
              // final, en sautant l'étape intermédiaire `nouveau`) : un
              // "Annuler" applique bien mutations[0].avant en une seule
              // écriture (AnnulationService.annulerDerniere_ fait un
              // simple forEach, sans ordre inverse — 2 mutations
              // successives sur le MÊME champ s'écraseraient l'une
              // l'autre au lieu de revenir correctement à `ancien`).
              return appliquerAvanceRapideSiPresent_(partieId, champNiveau, nouveau, resultatEffet.journal)
                .then(function (resultatAvanceRapide) {
                  var niveauFinal = resultatAvanceRapide.niveauFinal;
                  mutations[0].apres = niveauFinal;
                  var journalBrut = resultatAvanceRapide.journal;

                  return AnnulationService.empiler(partieId, { source: source, mutations: mutations }).then(function () {
                    // 20/08/2026 (EVOLUTION 4 — voir TODO.md) : rappel manuel
                    // (popup) + simplification du journal pour gagner_technologie/
                    // gagner_programme, voir afficherRappelsManuelsEtAjusterJournal_
                    // ci-dessus — purement informatif, n'affecte jamais succes/
                    // mutations (déjà persistées juste au-dessus).
                    return afficherRappelsManuelsEtAjusterJournal_(journalBrut, effet, ligne.texte || '', source, demanderChoix)
                      .then(function (journalAjuste) {
                        return {
                          piste: piste,
                          ancienNiveau: ancien,
                          nouveauNiveau: niveauFinal,
                          texte: ligne.texte || '',
                          effetJournal: journalAjuste,
                          effetSucces: resultatEffet.succes
                        };
                      });
                  });
                });
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
