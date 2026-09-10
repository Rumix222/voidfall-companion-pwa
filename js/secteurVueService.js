/**
 * secteurVueService.js
 * Écran Galaxie — rendu hexagonal visuel du plateau des secteurs
 * (Voidfall Companion PWA)
 *
 * Port de poc-rendu-secteurs.html / poc-rendu-secteurs-notes.md (racine du
 * repo, POC autonome non intégré) vers de VRAIES données de partie —
 * lecture seule, aucune écriture IndexedDB ici (les actions restent sur
 * l'onglet Secteurs : SecteurService.construire/rappelerCube via
 * index.html). Dépend de js/db.js, js/secteurService.js (données +
 * SecteurService.CHAMP_PN_PAR_TYPE) et js/strategieService.js (libellés
 * TYPES_INSTALLATION_CONSTRUIRE_/TYPES_GUILDE_CONSTRUIRE_/TYPES_VAISSEAU,
 * pour ne pas dupliquer une 3e fois les mêmes libellés déjà réutilisés par
 * index.html) — à charger APRÈS ces deux fichiers.
 *
 * Écarts connus par rapport au POC (voir poc-rendu-secteurs-notes.md
 * "Questions ouvertes" pour le détail) :
 * - Emplacements Installation/Guilde : le POC simulait un ordre figé via
 *   des tableaux de démonstration (installationsDemo/guildesDemo).
 *   secteursPartie ne connaît que des COMPTEURS par type (installation
 *   Defense/ChantierNaval/BaseStellaire, guildeFermiers/.../guilde
 *   Scientifiques) — jamais un ordre de pose. `listeDepuisComptes_`
 *   aplatit ces compteurs en une liste ordonnée par TYPE (pas par ordre de
 *   pose réel, inconnu) : suffisant pour un rendu de lecture (même
 *   principe déjà accepté par le POC — l'emplacement est générique,
 *   n'importe quel type peut occuper n'importe quelle position).
 * - Nombre d'emplacements affichés : typesSecteur.nombreInstallationMax/
 *   nombreGuildeMax compte les emplacements CONSTRUCTIBLES (0 pour le
 *   Secteur-Mère), pas le contenu imprimé fixe (ex. le Chantier Naval
 *   toujours présent sur le Secteur-Mère, maisons.json
 *   secteurMereInstallationChantierNaval=1 chez toutes les maisons). Le
 *   nombre de slots dessinés est donc `Math.max(nombreMax, comptés)` —
 *   couvre les deux cas sans branche spéciale par type de secteur.
 * - Coordonnées (q,r) : reconstruites à la main pour le scénario 'solo_1'
 *   uniquement (aucune coordonnée dans les données du projet, voir
 *   COORDS_PAR_SCENARIO_ ci-dessous) — un scénario sans entrée dans cette
 *   table affiche un message de repli plutôt que de deviner.
 * - Orientation du plateau : figée au réglage validé en session POC
 *   (rotation 60° + miroir horizontal + miroir vertical), pas de contrôle
 *   utilisateur ici (le POC en avait un pour la phase d'exploration
 *   uniquement, plus nécessaire une fois le réglage arrêté).
 * - Flotte de Puissance Navale : le POC démontrait le système de lettres
 *   de type via un champ de démonstration (flottesDemo, secteur #11
 *   uniquement). secteursPartie a en réalité un compteur par type
 *   (pnCorvette/pnSentinelle/pnDestroyer/pnCuirasse/pnPorteVaisseau) sur
 *   TOUS les secteurs : utilisé ici directement, sans donnée de démo.
 */

var SecteurVueService = (function () {
  'use strict';

  // ⚠️ Coordonnées axiales (q,r) reconstruites à la main à partir de
  // scenarioAdjacences.json (les 18 paires du scénario 'solo_1'), faute de
  // coordonnées existantes dans les données du projet — voir
  // poc-rendu-secteurs-notes.md §"Décisions clés" point 1. Un scénario
  // absent de cette table n'a pas de vue Galaxie (repli géré par
  // `afficher` ci-dessous).
  var COORDS_PAR_SCENARIO_ = {
    solo_1: {
      1: { q: 0, r: 0 },
      11: { q: 1, r: 0 },
      12: { q: 0, r: 1 },
      21: { q: 2, r: 0 },
      22: { q: 1, r: 1 },
      23: { q: 0, r: 2 },
      24: { q: -1, r: 2 },
      31: { q: 2, r: 1 },
      32: { q: 1, r: 2 },
      40: { q: 2, r: 2 }
    }
  };

  var TAILLE_HEX = 66; // rayon du centre au sommet

  function axialVersPixel_(q, r) {
    return {
      x: TAILLE_HEX * 1.5 * q,
      y: TAILLE_HEX * Math.sqrt(3) * (r + q / 2)
    };
  }

  // Orientation figée (voir en-tête du fichier) — le plateau entier est
  // pivoté/retourné en bloc (position des hexagones), jamais le contenu de
  // chaque hexagone (icônes toujours lisibles à l'endroit).
  function orienterPoint_(x, y) {
    var rad = 60 * Math.PI / 180;
    var xr = x * Math.cos(rad) - y * Math.sin(rad);
    var yr = x * Math.sin(rad) + y * Math.cos(rad);
    return { x: -xr, y: -yr }; // miroir horizontal + miroir vertical
  }

  function pointsHexPlat_(cx, cy, taille) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var angle = Math.PI / 180 * (60 * i);
      pts.push((cx + taille * Math.cos(angle)).toFixed(1) + ',' + (cy + taille * Math.sin(angle)).toFixed(1));
    }
    return pts.join(' ');
  }

  function creerSvgEl_(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) { el.setAttribute(k, attrs[k]); }
    return el;
  }

  // ---- Icônes (formes simplifiées, cf. poc-rendu-secteurs-notes.md
  // §"Mapping icône <-> donnée") ----

  function dessinerCubeIsometrique_(cx, cy, taille, remplissage, trait) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    var sommets = [];
    for (var i = 0; i < 6; i++) {
      var angle = Math.PI / 180 * (60 * i - 90);
      sommets.push([taille * Math.cos(angle), taille * Math.sin(angle)]);
    }
    var contour = sommets.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    g.appendChild(creerSvgEl_('polygon', { points: contour, fill: remplissage, stroke: trait, 'stroke-width': 2 }));
    [0, 2, 4].forEach(function (i) {
      g.appendChild(creerSvgEl_('line', { x1: 0, y1: 0, x2: sommets[i][0], y2: sommets[i][1], stroke: trait, 'stroke-width': 1.3, opacity: 0.7 }));
    });
    return g;
  }

  function icoTexte_(cx, cy, texte, taille, poids, couleur) {
    var t = creerSvgEl_('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': taille, 'font-weight': poids || 600, fill: couleur || '#fff' });
    t.textContent = texte;
    return t;
  }

  function icoGardien_(cx, cy) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    g.appendChild(creerSvgEl_('circle', { cx: 0, cy: -6, r: 5, fill: 'var(--galaxie-orange)' }));
    g.appendChild(creerSvgEl_('path', { d: 'M -8,9 C -8,-4.3 8,-4.3 8,9 Z', fill: 'var(--galaxie-orange)' }));
    return g;
  }

  function icoCubeNaval_(cx, cy, remplissage, trait, valeur) {
    var g = dessinerCubeIsometrique_(cx, cy, 13, remplissage, trait);
    if (valeur) { g.appendChild(icoTexte_(0, 1, String(valeur), 12, 800, '#fff')); }
    return g;
  }

  // --- Types de vaisseaux (empile jusqu'à 3 par cube, répartition
  // automatique au-delà — voir SecteurService.CHAMP_PN_PAR_TYPE pour les
  // clés réelles de secteursPartie). ---
  var LETTRE_VAISSEAU_ = { corvette: '', sentinelle: 'S', destroyer: 'D', cuirasse: 'C', porte_vaisseau: 'P' };
  var MAX_PAR_CUBE_ = 3;

  function decouperEnCubes_(nombre, maxParCube) {
    var cubes = [];
    var reste = nombre;
    while (reste > 0) {
      var n = Math.min(reste, maxParCube);
      cubes.push(n);
      reste -= n;
    }
    return cubes;
  }

  function construireFlotte_(g, flottes, remplissage, trait, cx, cy) {
    var etiquettes = [];
    flottes.forEach(function (f) {
      var lettre = LETTRE_VAISSEAU_[f.type] || '';
      decouperEnCubes_(f.nombre, MAX_PAR_CUBE_).forEach(function (n) { etiquettes.push(n + lettre); });
    });
    var ecart = 30;
    var depart = -(etiquettes.length - 1) / 2;
    etiquettes.forEach(function (texte, i) {
      g.appendChild(icoCubeNaval_(cx + (depart + i) * ecart, cy, remplissage, trait, texte));
    });
  }

  // Construit [{type, nombre}] à partir des compteurs réels de secteurs
  // Partie (SecteurService.CHAMP_PN_PAR_TYPE : type de vaisseau -> champ).
  function flottesDepuisSecteur_(secteur) {
    var flottes = [];
    Object.keys(SecteurService.CHAMP_PN_PAR_TYPE).forEach(function (type) {
      var champ = SecteurService.CHAMP_PN_PAR_TYPE[type];
      var nombre = secteur[champ] || 0;
      if (nombre > 0) flottes.push({ type: type, nombre: nombre });
    });
    return flottes;
  }

  function totalPn_(secteur) {
    return Object.keys(SecteurService.CHAMP_PN_PAR_TYPE).reduce(function (total, type) {
      return total + (secteur[SecteurService.CHAMP_PN_PAR_TYPE[type]] || 0);
    }, 0);
  }

  function icoDePopulation_(cx, cy, valeur, corrompu) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    if (corrompu) {
      var pointes = [[-11, -11, -13, -13], [11, -11, 13, -13], [-11, 11, -13, 13], [11, 11, 13, 13], [0, -11, 0, -13], [0, 11, 0, 13], [-11, 0, -13, 0], [11, 0, 13, 0]];
      pointes.forEach(function (p) {
        g.appendChild(creerSvgEl_('line', { x1: p[0], y1: p[1], x2: p[2], y2: p[3], stroke: 'var(--galaxie-orange)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      });
    }
    g.appendChild(creerSvgEl_('rect', { x: -11, y: -11, width: 22, height: 22, rx: 4, fill: '#2a2450', stroke: corrompu ? 'var(--galaxie-orange)' : '#7d6bc4', 'stroke-width': 2 }));
    var motifs = {
      1: [[0, 0]], 2: [[-5, -5], [5, 5]], 3: [[-5, -5], [0, 0], [5, 5]],
      4: [[-5, -5], [5, -5], [-5, 5], [5, 5]], 5: [[-5, -5], [5, -5], [0, 0], [-5, 5], [5, 5]],
      6: [[-5, -5.5], [5, -5.5], [-5, 0], [5, 0], [-5, 5.5], [5, 5.5]]
    };
    if (motifs[valeur]) {
      motifs[valeur].forEach(function (p) { g.appendChild(creerSvgEl_('circle', { cx: p[0], cy: p[1], r: 1.9, fill: '#bcd8ff' })); });
    } else {
      // Valeur hors 1-6 (jamais rencontrée en pratique) : repli numéral.
      g.appendChild(icoTexte_(0, 1, String(valeur), 11, 700, '#bcd8ff'));
    }
    return g;
  }

  // --- Emplacements d'Installation (triangles, orientation haut/bas
  // alternée selon la position du slot — motif imprimé sur la tuile,
  // indépendant du type qui l'occupe, cf. en-tête du fichier). ---

  function icoTriangleInstallation_(cx, cy, versHaut, remplie, couleurFond, couleurContour, dessinerIcone) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    var pts = versHaut ? '0,-13 14,13 -14,13' : '0,13 14,-13 -14,-13';
    var attrsTri = { points: pts, fill: remplie ? couleurFond : 'none', stroke: remplie ? couleurContour : '#5a5578', 'stroke-width': 1.6 };
    if (!remplie) { attrsTri['stroke-dasharray'] = '3,2'; }
    g.appendChild(creerSvgEl_('polygon', attrsTri));
    if (remplie && dessinerIcone) { dessinerIcone(g); }
    return g;
  }

  var INFOS_INSTALLATION_ = {
    defense_secteur: {
      fond: '#8a4a6a', contour: '#c98aa8',
      dessiner: function (g) {
        var hexPts = [];
        for (var i = 0; i < 6; i++) {
          var a = Math.PI / 180 * (60 * i);
          hexPts.push((4.8 * Math.cos(a)).toFixed(1) + ',' + (4.8 * Math.sin(a) + 1.5).toFixed(1));
        }
        g.appendChild(creerSvgEl_('polygon', { points: hexPts.join(' '), fill: '#d8b978', stroke: '#8a4a6a', 'stroke-width': 1 }));
      }
    },
    chantier_naval: {
      fond: '#3a5f47', contour: '#6a9a7a',
      dessiner: function (g) {
        g.appendChild(creerSvgEl_('rect', { x: -1.2, y: -6, width: 2.4, height: 12, fill: '#1f3a2a' }));
        g.appendChild(creerSvgEl_('circle', { cx: 0, cy: -6.5, r: 2.6, fill: 'none', stroke: '#1f3a2a', 'stroke-width': 1.8 }));
        g.appendChild(creerSvgEl_('circle', { cx: 0, cy: 6.5, r: 2.6, fill: 'none', stroke: '#1f3a2a', 'stroke-width': 1.8 }));
      }
    },
    base_stellaire: {
      fond: '#3b2f7a', contour: '#6a5aa8',
      dessiner: function (g) {
        g.appendChild(creerSvgEl_('circle', { cx: 0, cy: 1, r: 6.5, fill: 'none', stroke: '#c9a86a', 'stroke-width': 1.3 }));
        g.appendChild(creerSvgEl_('ellipse', { cx: 0, cy: 1, rx: 2.6, ry: 6.5, fill: 'none', stroke: '#c9a86a', 'stroke-width': 1.1 }));
        g.appendChild(creerSvgEl_('line', { x1: -6.5, y1: 1, x2: 6.5, y2: 1, stroke: '#c9a86a', 'stroke-width': 1.1 }));
      }
    }
  };

  function icoInstallation_(cx, cy, versHaut, type) {
    var infos = INFOS_INSTALLATION_[type];
    if (!infos) return icoTriangleInstallation_(cx, cy, versHaut, false, null, null, null);
    return icoTriangleInstallation_(cx, cy, versHaut, true, infos.fond, infos.contour, infos.dessiner);
  }

  function construireLigneInstallations_(g, liste, nombre, cx, y) {
    if (nombre <= 0) return;
    var ecart = 27;
    var depart = -(nombre - 1) / 2;
    for (var i = 0; i < nombre; i++) {
      var dx = (depart + i) * ecart;
      var versHaut = (i % 2 === 0);
      var type = liste[i];
      g.appendChild(type ? icoInstallation_(cx + dx, y, versHaut, type) : icoTriangleInstallation_(cx + dx, y, versHaut, false, null, null, null));
    }
  }

  // --- Emplacements de Guilde (roues crantées) ---

  var GUILDES_ = {
    fermiers: { couleur: '#4a9d5f' },
    ingenieurs: { couleur: '#e0932b' },
    mineurs: { couleur: '#d1497a' },
    scientifiques: { couleur: '#4aa8d8' },
    banquiers: { couleur: '#a67c4a' }
  };

  function dessinerRoueDentee_(cx, cy, rayon, remplissage, trait) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    for (var i = 0; i < 8; i++) {
      var angle = i * 45;
      g.appendChild(creerSvgEl_('rect', { x: -2, y: -(rayon + 4), width: 4, height: 5, fill: trait, transform: 'rotate(' + angle + ')' }));
    }
    g.appendChild(creerSvgEl_('circle', { cx: 0, cy: 0, r: rayon, fill: remplissage, stroke: trait, 'stroke-width': 1.4 }));
    return g;
  }

  function dessinerSymboleGuilde_(g, idGuilde) {
    if (idGuilde === 'fermiers') {
      g.appendChild(creerSvgEl_('path', { d: 'M 0,-6 C 3,-3 3,3 0,6 C -3,3 -3,-3 0,-6 Z', fill: '#fff' }));
      g.appendChild(creerSvgEl_('line', { x1: 0, y1: -6, x2: 0, y2: 6, stroke: '#4a9d5f', 'stroke-width': 0.8 }));
    } else if (idGuilde === 'ingenieurs') {
      g.appendChild(creerSvgEl_('polygon', { points: '1,-7 -4,1 -0.5,1 -2,7 4,-1 0.5,-1', fill: '#fff' }));
    } else if (idGuilde === 'mineurs') {
      [-4, 0, 4].forEach(function (dy) {
        g.appendChild(creerSvgEl_('path', { d: 'M -6,' + dy + ' Q 0,' + (dy - 3) + ' 6,' + dy, fill: 'none', stroke: '#fff', 'stroke-width': 1.5 }));
      });
    } else if (idGuilde === 'scientifiques') {
      var rot = creerSvgEl_('g', { transform: 'rotate(-30)' });
      rot.appendChild(creerSvgEl_('ellipse', { cx: -2, cy: -2, rx: 5, ry: 2.4, fill: '#fff' }));
      rot.appendChild(creerSvgEl_('ellipse', { cx: 2, cy: 2, rx: 5, ry: 2.4, fill: '#fff' }));
      g.appendChild(rot);
    } else if (idGuilde === 'banquiers') {
      g.appendChild(creerSvgEl_('polygon', { points: '0,-7 3,0 0,3 -3,0', fill: '#fff' }));
      g.appendChild(creerSvgEl_('polygon', { points: '0,7 3,0 0,-3 -3,0', fill: '#fff', opacity: '0.6' }));
    }
  }

  function icoGuilde_(cx, cy, idGuilde) {
    var infos = GUILDES_[idGuilde];
    if (!infos) return dessinerRoueDentee_(cx, cy, 10, 'none', '#5a5578');
    var g = dessinerRoueDentee_(cx, cy, 10, infos.couleur, '#2a2a2a');
    dessinerSymboleGuilde_(g, idGuilde);
    return g;
  }

  function construireLigneGuildes_(g, liste, nombre, cx, y) {
    if (nombre <= 0) return;
    var ecart = 24;
    var depart = -(nombre - 1) / 2;
    for (var i = 0; i < nombre; i++) {
      var dx = (depart + i) * ecart;
      var idGuilde = liste[i];
      g.appendChild(idGuilde ? icoGuilde_(cx + dx, y, idGuilde) : dessinerRoueDentee_(cx + dx, y, 10, 'none', '#5a5578'));
    }
  }

  function icoGloire_(cx, cy, valeur) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    g.appendChild(creerSvgEl_('path', { d: 'M -13,4 A 13,13 0 1 1 13,4 Z', fill: '#eceafd', stroke: '#9a90c2', 'stroke-width': 1.5 }));
    [-9, -4.5, 0, 4.5, 9].forEach(function (dx) {
      g.appendChild(creerSvgEl_('line', { x1: dx, y1: -13.5, x2: dx * 0.7, y2: -9.5, stroke: '#9a90c2', 'stroke-width': 1 }));
    });
    g.appendChild(icoTexte_(0, 2, String(valeur), 13, 800, '#6a6489'));
    return g;
  }

  function icoJetonLiberation_(cx, cy) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    var hexPts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i);
      hexPts.push((11 * Math.cos(a)).toFixed(1) + ',' + (11 * Math.sin(a)).toFixed(1));
    }
    g.appendChild(creerSvgEl_('polygon', { points: hexPts.join(' '), fill: '#3a2e42', stroke: '#5fc8e0', 'stroke-width': 1.5 }));
    g.appendChild(creerSvgEl_('path', { d: 'M -5,-7 L 5,-7 L 5,8 L 0,4 L -5,8 Z', fill: 'var(--galaxie-jaune)', stroke: '#7a5a1a', 'stroke-width': 1 }));
    return g;
  }

  function icoJetonPrime_(cx, cy) {
    var g = creerSvgEl_('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    g.appendChild(creerSvgEl_('path', { d: 'M -13,-6 C -13,-14 -6,-15 0,-13 C 8,-15 14,-9 13,-2 C 15,4 10,12 2,13 C -6,15 -14,9 -13,-6 Z', fill: '#2a1a1e', stroke: '#5fc8e0', 'stroke-width': 1.8 }));
    g.appendChild(creerSvgEl_('polygon', { points: '-6,-8 -1,-9 1,-3 -4,-2', fill: '#c0392b', stroke: '#7a1f18', 'stroke-width': 0.8 }));
    g.appendChild(creerSvgEl_('polygon', { points: '1,-9 6,-7 5,0 0,-2', fill: '#e0743a', stroke: '#7a1f18', 'stroke-width': 0.8 }));
    g.appendChild(creerSvgEl_('polygon', { points: '-5,0 1,-1 3,6 -3,7', fill: '#e0b23d', stroke: '#7a5a1a', 'stroke-width': 0.8 }));
    g.appendChild(creerSvgEl_('polygon', { points: '1,1 6,2 5,8 0,7', fill: '#c0392b', stroke: '#7a1f18', 'stroke-width': 0.8 }));
    return g;
  }

  // ---- Aplatissement des compteurs réels en listes ordonnées ----
  // (voir en-tête du fichier — ordre par TYPE, pas par ordre de pose réel,
  // inconnu de secteursPartie).

  var CHAMP_INSTALLATION_ = [
    { champ: 'installationDefenseSecteur', cle: 'defense_secteur' },
    { champ: 'installationChantierNaval', cle: 'chantier_naval' },
    { champ: 'installationBaseStellaire', cle: 'base_stellaire' }
  ];
  var CHAMP_GUILDE_ = [
    { champ: 'guildeFermiers', cle: 'fermiers' },
    { champ: 'guildeIngenieurs', cle: 'ingenieurs' },
    { champ: 'guildeMineurs', cle: 'mineurs' },
    { champ: 'guildeBanquiers', cle: 'banquiers' },
    { champ: 'guildeScientifiques', cle: 'scientifiques' }
  ];

  function listeDepuisComptes_(secteur, table) {
    var liste = [];
    table.forEach(function (t) {
      for (var i = 0; i < (secteur[t.champ] || 0); i++) liste.push(t.cle);
    });
    return liste;
  }

  function sommeComptes_(secteur, table) {
    return table.reduce(function (total, t) { return total + (secteur[t.champ] || 0); }, 0);
  }

  // ---- Construction d'un secteur ----

  function couleurSecteur_(type) {
    if (type === 'secteur_mere') return { fond: 'var(--galaxie-mere)', bord: 'var(--galaxie-mere-bord)' };
    if (type === 'faille') return { fond: 'var(--galaxie-faille)', bord: 'var(--galaxie-faille-bord)' };
    return { fond: 'var(--galaxie-standard)', bord: 'var(--galaxie-standard-bord)' };
  }

  function construireHexagone_(item, cx, cy, onSelect) {
    var secteur = item.secteur;
    var couleurs = couleurSecteur_(item.type);
    var g = creerSvgEl_('g', { class: 'hex-secteur', 'data-numero': secteur.numero });

    var hex = creerSvgEl_('polygon', { points: pointsHexPlat_(cx, cy, TAILLE_HEX), class: 'fond-hex', fill: couleurs.fond, stroke: couleurs.bord });
    g.appendChild(hex);

    if (item.type === 'faille') {
      if (secteur.pnNeant > 0) {
        g.appendChild(icoCubeNaval_(cx, cy, 'var(--galaxie-orange)', '#7a4a1a', secteur.pnNeant));
      }
      g.addEventListener('click', function () { onSelect(item); });
      return g;
    }

    // Nombre de slots dessinés = max(emplacements constructibles,
    // emplacements réellement occupés) — voir en-tête du fichier (cas du
    // Chantier Naval fixe du Secteur-Mère, hors nombreInstallationMax).
    var maxInstallation = item.typeInfo ? (item.typeInfo.nombreInstallationMax || 0) : 0;
    var maxGuilde = item.typeInfo ? (item.typeInfo.nombreGuildeMax || 0) : 0;
    var nombreInstallation = Math.max(maxInstallation, sommeComptes_(secteur, CHAMP_INSTALLATION_));
    var nombreGuilde = Math.max(maxGuilde, sommeComptes_(secteur, CHAMP_GUILDE_));

    var yHaut = cy - TAILLE_HEX * 0.58;
    var yMilieu = cy;
    var yGardien = cy - 9;
    var yBas = cy + TAILLE_HEX * 0.58;

    construireLigneInstallations_(g, listeDepuisComptes_(secteur, CHAMP_INSTALLATION_), nombreInstallation, cx, yHaut);

    if (secteur.population != null) {
      g.appendChild(icoDePopulation_(cx - 46, yMilieu, secteur.population, !!secteur.corrompu));
    }

    if (secteur.pnNeant > 0) {
      g.appendChild(icoCubeNaval_(cx, yMilieu, 'var(--galaxie-orange)', '#7a4a1a', secteur.pnNeant));
    } else if (totalPn_(secteur) > 0) {
      construireFlotte_(g, flottesDepuisSecteur_(secteur), 'var(--galaxie-bleu)', 'var(--galaxie-bleu-clair)', cx, yMilieu);
    }

    var listeGloire = Array.isArray(secteur.jetonGloire) ? secteur.jetonGloire : (secteur.jetonGloire ? [secteur.jetonGloire] : []);
    var aDesRecompenses = (secteur.jetonPrime > 0) || listeGloire.length > 0 || (secteur.jetonLiberation > 0);

    if (secteur.nombreGardien > 0) {
      g.appendChild(icoGardien_(cx + 46, yGardien));
    }
    if (aDesRecompenses) {
      g.appendChild(creerSvgEl_('circle', { cx: cx + 46, cy: yGardien + 18, r: 4, fill: 'var(--galaxie-jaune)', stroke: '#7a5a1a', 'stroke-width': 1 }));
    }

    construireLigneGuildes_(g, listeDepuisComptes_(secteur, CHAMP_GUILDE_), nombreGuilde, cx, yBas);

    if (secteur.corrompu) { hex.setAttribute('stroke-dasharray', '6,3'); }

    g.addEventListener('click', function () { onSelect(item); });
    return g;
  }

  // ---- Rendu du plateau complet ----

  function calculerViewBox_(pixels) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pixels.forEach(function (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    var marge = TAILLE_HEX * 1.2;
    return { x: minX - marge, y: minY - marge, w: (maxX - minX) + marge * 2, h: (maxY - minY) + marge * 2 };
  }

  function construireSvgRecompenses_(secteur) {
    var items = [];
    if (secteur.jetonPrime > 0) items.push({ icone: icoJetonPrime_, valeur: secteur.jetonPrime });
    var listeGloire = Array.isArray(secteur.jetonGloire) ? secteur.jetonGloire : (secteur.jetonGloire ? [secteur.jetonGloire] : []);
    listeGloire.forEach(function (v) {
      if (v == null) return;
      items.push({ icone: function (cx, cy) { return icoGloire_(cx, cy, v); }, valeur: null });
    });
    if (secteur.jetonLiberation > 0) items.push({ icone: icoJetonLiberation_, valeur: secteur.jetonLiberation });
    if (!items.length) return null;

    var svg = creerSvgEl_('svg', { viewBox: '0 0 ' + (items.length * 60) + ' 50', width: '100%', height: '50', style: 'display:block;margin-top:8px' });
    items.forEach(function (item, i) {
      var cx = 30 + i * 60, cy = 25;
      if (item.valeur != null) {
        svg.appendChild(icoTexte_(cx - 14, cy, '×' + item.valeur, 13, 700, '#cdbfff'));
        svg.appendChild(item.icone(cx + 10, cy));
      } else {
        svg.appendChild(item.icone(cx, cy));
      }
    });
    return svg;
  }

  var NOM_SOUS_TYPE_ = { avant_poste: 'Avant-poste', maison_dechue: 'Maison déchue' };

  function labelParCle_(liste, cle) {
    var t = (liste || []).filter(function (x) { return x.cle === cle; })[0];
    return t ? t.label : cle;
  }

  function afficherDetail_(item) {
    var secteur = item.secteur;
    var panneau = document.getElementById('galaxie-detail');
    if (!panneau) return;
    var typeNom = item.typeInfo ? item.typeInfo.nom : item.type;

    var installations = listeDepuisComptes_(secteur, CHAMP_INSTALLATION_)
      .map(function (cle) { return labelParCle_(StrategieService.TYPES_INSTALLATION_CONSTRUIRE_, cle); });
    var guildes = listeDepuisComptes_(secteur, CHAMP_GUILDE_)
      .map(function (cle) { return labelParCle_(StrategieService.TYPES_GUILDE_CONSTRUIRE_, cle); });

    var flotteTexte;
    if (secteur.pnNeant > 0) {
      flotteTexte = secteur.pnNeant + '× Puissance du Néant';
    } else {
      flotteTexte = flottesDepuisSecteur_(secteur)
        .map(function (f) { return f.nombre + ' ' + labelParCle_(StrategieService.TYPES_VAISSEAU, f.type); })
        .join(', ');
    }

    var listeGloire = Array.isArray(secteur.jetonGloire) ? secteur.jetonGloire : (secteur.jetonGloire ? [secteur.jetonGloire] : []);

    var sousTypeTexte = item.sousType ? (NOM_SOUS_TYPE_[item.sousType] || item.sousType) : null;
    if (sousTypeTexte && secteur.maisonAssociee) { sousTypeTexte += ' (' + secteur.maisonAssociee + ')'; }

    var lignes = [
      ['Numéro', secteur.numero],
      ['Type', typeNom],
      ['Sous-type', sousTypeTexte || '—'],
      ['Population', secteur.population == null ? '—' : secteur.population],
      ['Corrompu', secteur.corrompu ? 'Oui' : 'Non'],
      ['Gardiens', secteur.nombreGardien || 0],
      ['Installations (emplacements)', installations.length ? installations.join(', ') : '—'],
      ['Guildes (emplacements)', guildes.length ? guildes.join(', ') : '—'],
      ['Flotte', flotteTexte || '—'],
      ['Jeton Prime', secteur.jetonPrime || 0],
      ['Jeton Gloire', listeGloire.length ? listeGloire.join(', ') : '—'],
      ['Jeton Libération', secteur.jetonLiberation || 0]
    ];

    var html = '<h3>Secteur #' + secteur.numero + ' — ' + typeNom + '</h3>';
    panneau.innerHTML = html;
    var svgRecompenses = construireSvgRecompenses_(secteur);
    if (svgRecompenses) { panneau.appendChild(svgRecompenses); }
    var suite = '';
    lignes.forEach(function (l) {
      suite += '<div class="ligne"><span class="cle">' + l[0] + '</span><span>' + l[1] + '</span></div>';
    });
    panneau.insertAdjacentHTML('beforeend', suite);
  }

  function rendrePlateau_(conteneur, items) {
    conteneur.innerHTML = '';
    var pixels = items.map(function (item) {
      var brut = axialVersPixel_(item.q, item.r);
      return orienterPoint_(brut.x, brut.y);
    });
    var vb = calculerViewBox_(pixels);

    var svg = creerSvgEl_('svg', { viewBox: vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h, width: '100%', height: 'auto', style: 'display:block' });

    items.forEach(function (item, i) {
      svg.appendChild(construireHexagone_(item, pixels[i].x, pixels[i].y, afficherDetail_));
    });

    conteneur.appendChild(svg);
  }

  /**
   * Point d'entrée public — appelé à l'ouverture d'une partie (ouvrirPartie,
   * index.html) et à chaque clic sur l'onglet Galaxie (afficherEcran,
   * même principe que l'onglet Secteurs, voir CLAUDE.md Piège n°2).
   */
  function afficher(partie) {
    var conteneur = document.getElementById('galaxie-conteneur');
    var panneau = document.getElementById('galaxie-detail');
    if (!conteneur || !panneau || !partie) return;

    var coords = COORDS_PAR_SCENARIO_[partie.scenarioId];
    if (!coords) {
      conteneur.innerHTML = '<p class="hint">Vue Galaxie indisponible pour ce scénario ("' + partie.scenarioId + '") — coordonnées non définies. Utilise l’onglet Secteurs.</p>';
      return;
    }

    conteneur.innerHTML = '<p class="hint">Chargement des secteurs…</p>';

    Promise.all([
      SecteurService.obtenirSecteurs(partie.id),
      DB.getAll('scenarioSecteurs'),
      DB.getAll('typesSecteur')
    ]).then(function (resultats) {
      var secteurs = resultats[0];
      if (!secteurs.length) {
        conteneur.innerHTML = '<p class="hint">Aucun secteur instancié (scénario "' + partie.scenarioId + '" introuvable dans le catalogue — resynchronise si besoin).</p>';
        return;
      }

      var scenarioSecteursParNumero = {};
      resultats[1].filter(function (l) { return l.scenarioId === partie.scenarioId; })
        .forEach(function (l) { scenarioSecteursParNumero[l.numero] = l; });
      var typesSecteurParId = {};
      resultats[2].forEach(function (t) { typesSecteurParId[t.id] = t; });

      var items = secteurs
        .filter(function (s) { return coords[s.numero]; })
        .map(function (s) {
          var ligneScenario = scenarioSecteursParNumero[s.numero] || {};
          return {
            secteur: s,
            type: ligneScenario.type || 'standard',
            sousType: ligneScenario.sousType || null,
            typeInfo: typesSecteurParId[ligneScenario.type] || null,
            q: coords[s.numero].q,
            r: coords[s.numero].r
          };
        });

      if (!items.length) {
        conteneur.innerHTML = '<p class="hint">Aucune coordonnée connue pour les secteurs de cette partie.</p>';
        return;
      }

      rendrePlateau_(conteneur, items);
      panneau.innerHTML = '<h3>Détail</h3><div class="vide">Sélectionnez un secteur ci-dessus.</div>';
    }).catch(function (erreur) {
      conteneur.innerHTML = '<p class="hint">Erreur de chargement des secteurs : ' + erreur.message + '</p>';
    });
  }

  return {
    afficher: afficher
  };
})();
