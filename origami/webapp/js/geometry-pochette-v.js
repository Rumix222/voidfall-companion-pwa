/*
 * Géométrie Pochette V (pochette-enveloppe pour cartes de jeu de société).
 *
 * Construction donnée directement par l'utilisateur (pas de tracé dans le fichier
 * Excel d'origine pour cette pièce) :
 *   - largeur de la bande de papier = largeur de la carte
 *   - A = 0 + largeur carte                    (1er pli droit)
 *   - B = A + épaisseur paquet + 1mm            (2e pli droit)
 *   - C = B + largeur carte                     (3e pli droit)
 *   - D = C + épaisseur paquet + 0.5mm          (4e pli droit)
 *   - E = D + largeur carte                     (5e pli droit)
 *   - F = E + épaisseur paquet                  (6e pli droit)
 *   - bord réel de la feuille = F + largeur carte / 2
 *   - G = pli diagonal entre 0 et A, de bord à bord (un sens)
 *   - H = pli diagonal entre D et E, de bord à bord (l'autre sens)
 *
 * Comme pour ModaMasu, seules ces positions/plis sont tracés fidèlement ; le sens
 * exact des plis (montagne/vallée) reste à valider par un pliage réel.
 */
(function (global) {
  'use strict';

  function buildPositions(largeur, epaisseur) {
    const A = largeur;
    const B = A + epaisseur + 1;
    const C = B + largeur;
    const D = C + epaisseur + 0.5;
    const E = D + largeur;
    const F = E + epaisseur;
    return { A, B, C, D, E, F };
  }

  function buildStrip(largeur, epaisseur, color) {
    const { A, B, C, D, E, F } = buildPositions(largeur, epaisseur);
    const width = largeur;
    const total = F + largeur / 2; // marge après F jusqu'au bord réel de la feuille

    const lines = [
      {
        type: 'cut',
        points: [
          [0, 0],
          [total, 0],
          [total, width],
          [0, width],
          [0, 0],
        ],
      },
    ];

    // Plis droits (accordéon)
    [A, B, C, D, E, F].forEach((pos) => {
      lines.push({ type: 'fold', points: [[pos, 0], [pos, width]] });
    });

    // G : pli diagonal unique entre 0 et A, de bord à bord
    lines.push({ type: 'fold', points: [[0, 0], [A, width]] });

    // H : pli diagonal unique entre D et E, de bord à bord, sens opposé à G
    lines.push({ type: 'fold', points: [[D, width], [E, 0]] });

    const stagger = [A, B, C, D, E, F].map((pos, i) => ({
      pos: [pos, 0],
      color,
      value: pos,
      labelPos: [pos, i % 2 === 0 ? -3.5 : -7.5],
    }));

    return { size: { width: total, height: width }, lines, points: stagger };
  }

  function computePochetteV(largeurCarte, epaisseurPaquet, margeCote, margeEpaisseur) {
    if (!(largeurCarte > 0 && epaisseurPaquet > 0)) {
      throw new Error('Largeur carte et épaisseur doivent être positives.');
    }
    margeCote = margeCote != null ? margeCote : 2;
    margeEpaisseur = margeEpaisseur != null ? margeEpaisseur : 2;

    const box = buildStrip(largeurCarte, epaisseurPaquet, 'blue');
    const couvercle = buildStrip(largeurCarte + margeCote, epaisseurPaquet + margeEpaisseur, 'orange');

    return { box: { paper: box }, couvercle: { paper: couvercle } };
  }

  global.OrigamiGeometry = global.OrigamiGeometry || {};
  global.OrigamiGeometry.pochetteV = computePochetteV;
})(window);
