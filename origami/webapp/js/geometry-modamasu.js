/*
 * Géométrie ModaMasu (boîte masu en diagonale, dimensions L x W x H indépendantes).
 *
 * Reproduit fidèlement le gabarit du fichier "Origami V11.1.xlsx" (feuille ModaMasu) :
 * une feuille carrée, ses deux diagonales tracées, et 7 points de repère par diagonale
 * (une couleur par diagonale, vert au centre) à reporter au crayon sur le papier avant
 * pliage. Le pliage lui-même (séquence, montagne/vallée) n'est pas dans le fichier
 * Excel — il suit le tutoriel vidéo de l'auteur, pas un tracé généré ici.
 *
 * Dérivé algébriquement des formules Excel (E15, C18..H26) — vérifié avec un exemple
 * asymétrique (L=61, W=40, H=20 -> S=128mm) :
 *   d = L + W + 4H            (longueur totale de chaque diagonale)
 *   S = d / sqrt(2)           (côté de la feuille carrée)
 *
 * Chaque diagonale est entièrement gouvernée par UNE SEULE dimension (pas de
 * mélange L/W entre le début et la fin d'une même diagonale) :
 *   Diagonale "/" (coin bas-gauche -> coin haut-droit), distances cumulées
 *   depuis le coin bas-gauche : W/2, +H, +H, (centre), +H, +H, +W/2 (= coin)
 *   Diagonale "\" (coin haut-gauche -> coin bas-droit), distances cumulées
 *   depuis le coin haut-gauche : L/2, +H, +H, (centre), +H, +H, +L/2 (= coin)
 */
(function (global) {
  'use strict';

  function markPositions(corner1, corner2, offset, H, color) {
    // 7 points le long du segment corner1->corner2, tous de la même couleur
    // (une diagonale = une couleur = une seule dimension, L ou W), sauf le
    // centre (vert). Symétrique : mêmes distances aux deux coins.
    const dx = corner2[0] - corner1[0];
    const dy = corner2[1] - corner1[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const at = (dist) => [corner1[0] + ux * dist, corner1[1] + uy * dist];

    const distances = [
      offset,
      offset + H,
      offset + 2 * H,
      len / 2,
      len - (offset + 2 * H),
      len - (offset + H),
      len - offset,
    ];
    return distances.map((dist, i) => ({
      pos: at(dist),
      dist,
      color: i === 3 ? 'green' : color,
      value: dist,
    }));
  }

  function computeModaMasu(L, W, H) {
    if (!(L > 0 && W > 0 && H > 0)) {
      throw new Error('Longueur, largeur et hauteur doivent être positives.');
    }

    const d = L + W + 4 * H;
    const S = d / Math.SQRT2;

    const TL = [0, 0];
    const TR = [S, 0];
    const BL = [0, S];
    const BR = [S, S];

    const lines = [
      { type: 'cut', points: [TL, TR, BR, BL, TL] },
      { type: 'diagonal', points: [BL, TR] }, // "/" : gouvernée par W
      { type: 'diagonal', points: [TL, BR] }, // "\" : gouvernée par L
    ];

    const pointsDiag1 = markPositions(BL, TR, W / 2, H, 'blue');
    const pointsDiag2 = markPositions(TL, BR, L / 2, H, 'orange');

    // le centre est partagé par les deux diagonales : on ne le garde qu'une fois
    const points = [...pointsDiag1, ...pointsDiag2.filter((p) => p.color !== 'green')];

    return {
      L, W, H, d, S,
      paper: { size: { width: S, height: S }, lines, points },
    };
  }

  global.OrigamiGeometry = global.OrigamiGeometry || {};
  global.OrigamiGeometry.modamasu = computeModaMasu;
})(window);
