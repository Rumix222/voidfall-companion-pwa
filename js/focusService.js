/**
 * focusService.js
 * Cartes Focus — Voidfall Companion PWA
 * Version 2 — 21/08/2026 (docs/docs-rapport.md CM-2 — retrait de 3 exports publics jamais appelés)
 *
 * 21/08/2026 (docs/docs-rapport.md CM-2) : obtenirCartesFocus/
 * obtenirFocusParFamille/obtenirPoolHeroique retirés de l'API publique
 * (zéro appelant dans tout le repo). Aucun changement de comportement
 * pour les fonctions restantes.
 *
 * Phase 4 (partielle) du plan de migration : portage de FocusService.js
 * (GAS, 263 l.), UNIQUEMENT la partie catalogue (regroupement des lignes
 * "focus" en cartes, mise en place par maison, pool héroïque). Aucune
 * dépendance RPC ni DOM ici.
 *
 * HORS PÉRIMÈTRE (volontairement, voir docs-migration-pwa-plan.md
 * section 1, remarque Phase 4) : le moteur coût/effet (jouerAction_/
 * appliquerJson_, ~3405 l. embarquées dans strategie.html côté GAS) —
 * c'est la plus grosse pièce du portage, fortement couplée au DOM et
 * explicitement signalée comme à traiter en session dédiée (extraction
 * d'un focusEngine.js pur d'abord, puis rebranchement DOM). Cette
 * session se limite à ce qui permet de remplir partie.focusJoueur à la
 * création (GameService.creerPartie) — les cartes ne sont pas encore
 * jouables.
 *
 * tirerFocusHeroiques (GAS) n'est PAS porté : déjà noté comme mort côté
 * GAS ("plus utilisée depuis le passage au choix manuel des Focus
 * héroïques... aucun code du projet ne l'appelle plus").
 *
 * Dépend de db.js (DB, store catalogue "focus", peuplé par
 * catalogueSync.js — Phase 1) : à charger avant ce fichier.
 */

var FocusService = (function () {
  'use strict';

  var TYPE_STANDARD_NORM = 'standard';
  var TYPE_HEROIQUE_NORM = 'heroique';

  /**
   * cout/effet sont des colonnes jsonb Supabase : déjà des objets JS une
   * fois passés par catalogueSync.js (PostgREST les renvoie déjà
   * parsés). Ce filet de sécurité gère quand même le cas d'une chaîne
   * (ex. import manuel futur d'un JSON de secours) sans jamais bloquer
   * l'affichage — même principe que parseJsonSafe_ côté GAS.
   */
  function parseJsonSafe_(valeur) {
    if (!valeur) return {};
    if (typeof valeur !== 'string') return valeur;
    try {
      return JSON.parse(valeur);
    } catch (e) {
      return { brut: valeur };
    }
  }

  /**
   * Normalise une chaîne pour comparaison tolérante (sans accents, en
   * minuscules) — les données de la colonne "type" ("Standard",
   * "Héroïque", ou un nom de maison) ne sont pas garanties uniformes.
   */
  function normaliser_(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Regroupe les lignes brutes du store "focus" en cartes (clé
   * Focus+Type), chaque carte portant la liste de ses 2-3 actions
   * (Action/Coût/Effet/Texte). Ignore les lignes sans focus ou sans type
   * (données incomplètes, tolérant comme côté GAS).
   */
  function obtenirCartesFocus_() {
    return DB.getAll('focus').then(function (lignes) {
      var groupes = {};
      var ordre = [];

      lignes.forEach(function (l) {
        var focus = String(l.focus || '').trim();
        var type = String(l.type || '').trim();
        if (!focus || !type) return;

        var cle = focus + '||' + type;
        if (!groupes[cle]) {
          groupes[cle] = { id: '', focus: focus, type: type, actions: [] };
          ordre.push(cle);
        }
        if (!groupes[cle].id && l.id) groupes[cle].id = String(l.id).trim();

        groupes[cle].actions.push({
          action: l.action || '',
          cout: parseJsonSafe_(l.cout),
          effet: parseJsonSafe_(l.effet),
          texte: l.texte || ''
        });
      });

      return ordre.map(function (cle) { return groupes[cle]; });
    });
  }

  function familles_(cartes) {
    var vues = {};
    cartes.forEach(function (c) { vues[c.focus] = true; });
    return Object.keys(vues).sort();
  }

  /**
   * Mise en place des Focus pour une maison donnée : pour chaque
   * famille, la carte spécifique à la maison remplace la carte Standard
   * si elle existe, sinon la carte Standard est utilisée. Le nombre de
   * cartes retournées dépend entièrement des données présentes (pas de
   * nombre figé en dur).
   */
  function obtenirMiseEnPlace_(nomMaison) {
    return obtenirCartesFocus_().then(function (cartes) {
      var nomMaisonNorm = normaliser_(nomMaison);
      var familles = familles_(cartes);
      var resultat = [];

      familles.forEach(function (focus) {
        var cartesFamille = cartes.filter(function (c) { return c.focus === focus; });
        var carteMaison = cartesFamille.filter(function (c) { return normaliser_(c.type) === nomMaisonNorm; })[0];
        var carteStandard = cartesFamille.filter(function (c) { return normaliser_(c.type) === TYPE_STANDARD_NORM; })[0];
        var carte = carteMaison || carteStandard;
        if (carte) resultat.push(carte);
      });

      return resultat;
    });
  }

  /**
   * Pool complet des cartes Focus héroïques (type "Héroïque"), une par
   * famille normalement, trié par nom de famille.
   */
  function obtenirPoolHeroique_() {
    return obtenirCartesFocus_().then(function (cartes) {
      return cartes
        .filter(function (c) { return normaliser_(c.type) === TYPE_HEROIQUE_NORM; })
        .sort(function (a, b) { return a.focus.localeCompare(b.focus); });
    });
  }

  /**
   * Noms des Focus héroïques disponibles (pour peupler les listes
   * déroulantes de choix manuel en cours de partie — Phase 4 suite,
   * choisirFocusHeroique reste hors périmètre pour l'instant, voir
   * gameService.js).
   */
  function obtenirNomsPoolHeroique_() {
    return obtenirPoolHeroique_().then(function (cartes) {
      return cartes.map(function (c) { return c.focus; });
    });
  }

  /**
   * Retrouve une carte Focus héroïque complète par son nom de famille.
   */
  function obtenirCarteHeroiqueParNom_(nom) {
    return obtenirPoolHeroique_().then(function (cartes) {
      var carte = cartes.filter(function (c) { return c.focus === nom; })[0];
      if (!carte) throw new Error('Focus héroïque "' + nom + '" introuvable dans le pool.');
      return carte;
    });
  }

  // 21/08/2026 (docs/docs-rapport.md CM-2) : obtenirCartesFocus/
  // obtenirFocusParFamille/obtenirPoolHeroique retirés de l'API publique
  // (zéro appelant dans tout le repo, confirmé par recherche globale) —
  // obtenirCartesFocus_/obtenirPoolHeroique_ restent des fonctions
  // privées, toujours utilisées en interne par obtenirMiseEnPlace_/
  // obtenirNomsPoolHeroique_/obtenirCarteHeroiqueParNom_ ci-dessous.
  return {
    obtenirMiseEnPlace: obtenirMiseEnPlace_,
    obtenirNomsPoolHeroique: obtenirNomsPoolHeroique_,
    obtenirCarteHeroiqueParNom: obtenirCarteHeroiqueParNom_
  };
})();
