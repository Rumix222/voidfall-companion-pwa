/*
 * Pagination pour impression A4 : si le gabarit est plus grand que la zone
 * imprimable d'une page A4, on le découpe en plusieurs pages avec un léger
 * recouvrement + croix de repérage pour recoller/aligner après impression.
 */
(function (global) {
  'use strict';

  const A4 = { width: 210, height: 297 };
  const PAGE_MARGIN = 2; // marge non imprimable de sécurité (réduite : les traits de coupe visent déjà le bord réel du papier)
  const OVERLAP = 8; // recouvrement entre pages voisines (mm)

  function usable(orientation) {
    return orientation === 'landscape'
      ? { width: A4.height - 2 * PAGE_MARGIN, height: A4.width - 2 * PAGE_MARGIN }
      : { width: A4.width - 2 * PAGE_MARGIN, height: A4.height - 2 * PAGE_MARGIN };
  }

  function paginate(totalWidth, totalHeight, orientation) {
    orientation = orientation || 'portrait';
    const u = usable(orientation);

    if (totalWidth <= u.width && totalHeight <= u.height) {
      return {
        pages: [{ col: 0, row: 0, x: 0, y: 0, width: totalWidth, height: totalHeight }],
        cols: 1,
        rows: 1,
        orientation,
        singlePage: true,
      };
    }

    const stepX = u.width - OVERLAP;
    const stepY = u.height - OVERLAP;
    const cols = Math.max(1, Math.ceil((totalWidth - OVERLAP) / stepX));
    const rows = Math.max(1, Math.ceil((totalHeight - OVERLAP) / stepY));

    const pages = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * stepX;
        const y = row * stepY;
        const width = Math.min(u.width, totalWidth - x);
        const height = Math.min(u.height, totalHeight - y);
        pages.push({ col, row, x, y, width, height });
      }
    }
    return { pages, cols, rows, orientation, singlePage: false };
  }

  // Essaie de placer deux gabarits carrés/rectangulaires côte à côte, ou empilés,
  // dans la zone imprimable d'une seule page A4 portrait. Retourne null si ça ne
  // rentre pas (il faudra alors deux impressions séparées).
  // Écart assez large pour laisser la place aux traits de coupe rotary de chaque
  // gabarit (qui débordent chacun d'environ 4mm dans leur propre marge).
  const GAP = 12; // mm entre les deux gabarits sur la même feuille

  function combineOnA4(paperA, paperB, orientation) {
    const u = usable(orientation || 'portrait');
    const aw = paperA.size.width, ah = paperA.size.height;
    const bw = paperB.size.width, bh = paperB.size.height;

    if (aw + GAP + bw <= u.width && Math.max(ah, bh) <= u.height) {
      return {
        items: [
          { paper: paperA, x: 0, y: 0 },
          { paper: paperB, x: aw + GAP, y: 0 },
        ],
      };
    }
    if (ah + GAP + bh <= u.height && Math.max(aw, bw) <= u.width) {
      return {
        items: [
          { paper: paperA, x: 0, y: 0 },
          { paper: paperB, x: 0, y: ah + GAP },
        ],
      };
    }
    return null;
  }

  // Répartit `count` exemplaires identiques d'un même gabarit (taille paperW x
  // paperH, mm) sur autant de pages A4 que nécessaire, en grille. Retourne null si
  // le gabarit ne tient même pas une seule fois sur une page.
  const COPY_GAP = 10; // mm entre deux exemplaires (place pour les traits de coupe)

  function packCopies(paperW, paperH, count, orientation) {
    const u = usable(orientation || 'portrait');
    if (paperW > u.width || paperH > u.height) return null;

    const perRow = Math.max(1, Math.floor((u.width + COPY_GAP) / (paperW + COPY_GAP)));
    const perCol = Math.max(1, Math.floor((u.height + COPY_GAP) / (paperH + COPY_GAP)));
    const perPage = perRow * perCol;

    const items = [];
    for (let i = 0; i < count; i++) {
      const idxOnPage = i % perPage;
      const col = idxOnPage % perRow;
      const row = Math.floor(idxOnPage / perRow);
      items.push({
        page: Math.floor(i / perPage),
        x: col * (paperW + COPY_GAP),
        y: row * (paperH + COPY_GAP),
      });
    }
    const pageCount = Math.ceil(count / perPage);
    return { perRow, perCol, perPage, pageCount, items };
  }

  global.OrigamiPrint = { paginate, usable, combineOnA4, packCopies, A4, PAGE_MARGIN, OVERLAP };
})(window);
