(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CARD_FORMATS = {
    petit: { L: 44, H: 68 },
    standard: { L: 63.5, H: 88 },
    tarot: { L: 70, H: 120 },
  };

  const els = {
    navButtons: $$('.box-type-btn'),
    modamasuParams: $('#modamasu-params'),
    modamasuLidParams: $('#modamasu-lid-params'),
    modamasuLidImageParams: $('#modamasu-lid-image-params'),
    pochetteParams: $('#pochette-params'),
    pochetteThicknessParams: $('#pochette-thickness-params'),
    pochetteCoverParams: $('#pochette-cover-params'),

    L: $('#lg'),
    W: $('#lr'),
    H: $('#ht'),
    lidToggle: $('#lid-toggle'),
    lidFields: $('#lid-fields'),
    lidSide: $('#lid-side'),
    lidHeight: $('#lid-height'),
    lidImageInput: $('#lid-image-input'),
    lidImageControls: $('#lid-image-controls'),
    lidImageZoom: $('#lid-image-zoom'),
    lidImageRemove: $('#lid-image-remove'),

    pvLargeur: $('#pv-largeur'),
    pvCount: $('#pv-count'),
    pvMmPerCard: $('#pv-mm-per-card'),
    pvThicknessDirect: $('#pv-thickness-direct'),
    pvThicknessComputed: $('#pv-thickness-computed'),
    pvMargeCote: $('#pv-marge-cote'),
    pvMargeEpaisseur: $('#pv-marge-epaisseur'),
    thickCountFields: $('#thick-count-fields'),
    thickDirectFields: $('#thick-direct-fields'),

    previewBox: $('#preview-box'),
    previewLid: $('#preview-lid'),
    lidPreviewWrap: $('#lid-preview-wrap'),
    infoBox: $('#info-box'),
    infoLid: $('#info-lid'),
    previewA4: $('#preview-a4'),
    infoA4: $('#info-a4'),
    printArea: $('#print-area'),
    copies: $('#copies'),
    copiesWarning: $('#copies-warning'),
    btnPrintBox: $('#btn-print-box'),
    btnPrintLid: $('#btn-print-lid'),
    combinedWrap: $('#combined-print-wrap'),
    btnPrintCombined: $('#btn-print-combined'),
    form: $('#params-form'),
    warning: $('#geometry-warning'),
  };

  const state = { boxType: 'modamasu', lidImage: null };

  function setBoxType(type) {
    state.boxType = type;
    els.navButtons.forEach((b) => b.classList.toggle('active', b.dataset.type === type));

    const isModa = type === 'modamasu';
    els.modamasuParams.style.display = isModa ? '' : 'none';
    els.modamasuLidParams.style.display = isModa ? '' : 'none';
    els.modamasuLidImageParams.style.display = isModa ? '' : 'none';
    els.pochetteParams.style.display = isModa ? 'none' : '';
    els.pochetteThicknessParams.style.display = isModa ? 'none' : '';
    els.pochetteCoverParams.style.display = isModa ? 'none' : '';

    const boxHeading = isModa ? 'Boîte' : 'Pochette';
    const boxButton = isModa ? 'la boîte' : 'la pochette';
    const lidHeading = 'Couvercle';
    const lidButton = isModa ? 'le couvercle' : 'la variante couvercle';
    document.querySelectorAll('.box-label').forEach((el) => (el.textContent = boxHeading));
    document.querySelectorAll('.btn-box-label').forEach((el) => (el.textContent = boxButton));
    document.querySelectorAll('.lid-label').forEach((el) => (el.textContent = lidHeading));
    document.querySelectorAll('.btn-lid-label').forEach((el) => (el.textContent = lidButton));

    update();
  }

  els.navButtons.forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => setBoxType(btn.dataset.type));
  });

  // --- Illustration du couvercle ModaMasu ---
  els.lidImageInput.addEventListener('change', () => {
    const file = els.lidImageInput.files && els.lidImageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.lidImage = {
          href: reader.result,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          zoom: parseFloat(els.lidImageZoom.value) || 1,
        };
        els.lidImageControls.style.display = '';
        update();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  els.lidImageZoom.addEventListener('input', () => {
    if (!state.lidImage) return;
    state.lidImage.zoom = parseFloat(els.lidImageZoom.value) || 1;
    update();
  });

  $$('.zoom-preset-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (!state.lidImage) return;
      const zoom = parseFloat(btn.dataset.zoom);
      state.lidImage.zoom = zoom;
      els.lidImageZoom.value = zoom;
      update();
    })
  );

  els.lidImageRemove.addEventListener('click', () => {
    state.lidImage = null;
    els.lidImageInput.value = '';
    els.lidImageZoom.value = 1;
    els.lidImageControls.style.display = 'none';
    update();
  });

  // Rectangle image (coordonnées locales du papier) qui recouvre tout le carré
  // ("cover", comme background-size:cover), centré, avec un facteur de zoom pour
  // recadrer davantage. rotateDeg (optionnel) tourne l'image autour du centre du
  // papier — utilisé pour aligner l'image sur la diagonale bleue plutôt que sur
  // les bords de la feuille ; dans ce cas on couvre un carré agrandi (côté x√2)
  // pour que la couverture reste totale après rotation (sinon les coins du
  // papier resteraient blancs).
  function computeImageRect(imgState, size, rotateDeg) {
    const coverSize = rotateDeg ? { width: size.width * Math.SQRT2, height: size.height * Math.SQRT2 } : size;
    const coverScale = Math.max(coverSize.width / imgState.naturalWidth, coverSize.height / imgState.naturalHeight);
    const scale = coverScale * (imgState.zoom || 1);
    const width = imgState.naturalWidth * scale;
    const height = imgState.naturalHeight * scale;
    const rect = {
      href: imgState.href,
      x: (size.width - width) / 2,
      y: (size.height - height) / 2,
      width,
      height,
    };
    if (rotateDeg) {
      rect.rotate = rotateDeg;
      rect.cx = size.width / 2;
      rect.cy = size.height / 2;
    }
    return rect;
  }

  // --- Préréglages format carte (Pochette V) ---
  $$('input[name="card-format"]').forEach((r) =>
    r.addEventListener('change', () => {
      const fmt = CARD_FORMATS[r.value];
      if (fmt && r.checked) {
        els.pvLargeur.value = fmt.L;
        update();
      }
    })
  );
  function markCustomFormat() {
    const custom = document.querySelector('input[name="card-format"][value="custom"]');
    if (custom) custom.checked = true;
  }
  els.pvLargeur.addEventListener('input', markCustomFormat);

  // --- Mode épaisseur (nombre de cartes vs direct) ---
  $$('input[name="thick-mode"]').forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) {
        els.thickCountFields.style.display = r.value === 'count' ? '' : 'none';
        els.thickDirectFields.style.display = r.value === 'direct' ? '' : 'none';
        update();
      }
    })
  );

  function getThicknessMode() {
    const el = document.querySelector('input[name="thick-mode"]:checked');
    return el ? el.value : 'count';
  }

  // +2mm de jeu/tolérance, uniquement quand l'épaisseur est calculée à partir du
  // nombre de cartes (pas en saisie directe de l'épaisseur).
  const THICKNESS_SLACK = 2;

  function getPaquetThickness() {
    if (getThicknessMode() === 'direct') {
      return parseFloat(els.pvThicknessDirect.value) || 0;
    }
    const count = parseFloat(els.pvCount.value) || 0;
    const perCard = parseFloat(els.pvMmPerCard.value) || 0;
    return count * perCard + THICKNESS_SLACK;
  }

  const MARGIN_INSET = 5; // doit correspondre au marginInset par défaut de buildA4PageSvg

  // La Pochette V est plus large que haute : on imprime en A4 paysage par défaut
  // pour permettre des boîtes de taille maximale sur une seule feuille (le
  // ModaMasu reste en portrait, plus adapté à ses proportions habituelles).
  function getPieceOrientation() {
    return state.boxType === 'modamasu' ? 'portrait' : 'landscape';
  }

  // Centre un groupe d'items (déjà positionnés les uns par rapport aux autres,
  // ex. sortie de combineOnA4/packCopies) sur la page A4 entière, pour que les
  // traits de coupe rotary débordent jusqu'au bord réel du papier des 4 côtés
  // (et pas seulement dans un coin, avec un grand vide ailleurs sur la page).
  function centerItemsOnA4(items, orientation) {
    const landscape = orientation === 'landscape';
    const pageW = landscape ? OrigamiRender.A4.height : OrigamiRender.A4.width;
    const pageH = landscape ? OrigamiRender.A4.width : OrigamiRender.A4.height;
    let maxX = 0, maxY = 0;
    items.forEach((it) => {
      maxX = Math.max(maxX, it.x + it.paper.size.width);
      maxY = Math.max(maxY, it.y + it.paper.size.height);
    });
    const offsetX = (pageW - maxX) / 2 - MARGIN_INSET;
    const offsetY = (pageH - maxY) / 2 - MARGIN_INSET;
    return items.map((it) => Object.assign({}, it, { x: it.x + offsetX, y: it.y + offsetY }));
  }

  function regMarks(size, step) {
    const marks = [];
    for (let x = 0; x <= size; x += step) {
      for (let y = 0; y <= size; y += step) marks.push([x, y]);
    }
    return marks;
  }

  function paginateForPrint(paper) {
    return OrigamiPrint.paginate(paper.size.width, paper.size.height, getPieceOrientation());
  }

  function describePages(pag) {
    if (pag.singlePage) return 'Tient sur 1 feuille A4.';
    return `Ne tient pas sur 1 feuille A4 : découpé en ${pag.pages.length} feuilles (${pag.cols} x ${pag.rows}), à recoller (recouvrement ${OrigamiPrint.OVERLAP}mm, croix de repérage grises).`;
  }

  function renderPreviewInto(container, infoEl, paper) {
    container.innerHTML = '';
    const svg = OrigamiRender.buildSvg(paper, { margin: 10, showDimLabel: true });
    svg.classList.add('preview-svg');
    container.appendChild(svg);
    const pag = paginateForPrint(paper);
    infoEl.textContent = `Papier requis : ${paper.size.width.toFixed(1)} x ${paper.size.height.toFixed(1)} mm — ${describePages(pag)}`;
  }

  function computeGeometry() {
    if (state.boxType === 'modamasu') {
      const L = parseFloat(els.L.value), W = parseFloat(els.W.value), H = parseFloat(els.H.value);
      if (!(L > 0 && W > 0 && H > 0)) throw new Error('Renseignez des dimensions positives.');
      const box = OrigamiGeometry.modamasu(L, W, H).paper;

      const lidOn = els.lidToggle.checked;
      let lid = null;
      if (lidOn) {
        const side = parseFloat(els.lidSide.value) || 0;
        const heightDelta = parseFloat(els.lidHeight.value) || 0;
        const lidL = L + side, lidW = W + side, lidH = H + heightDelta;
        if (!(lidL > 0 && lidW > 0 && lidH > 0)) {
          throw new Error("Les dimensions du couvercle doivent rester positives (vérifiez l'écart en hauteur).");
        }
        lid = OrigamiGeometry.modamasu(lidL, lidW, lidH).paper;
      }
      return { box, lid };
    }

    // Pochette V
    const largeur = parseFloat(els.pvLargeur.value);
    const epaisseur = getPaquetThickness();
    const margeCote = parseFloat(els.pvMargeCote.value) || 0;
    const margeEpaisseur = parseFloat(els.pvMargeEpaisseur.value) || 0;

    if (getThicknessMode() === 'count') {
      els.pvThicknessComputed.textContent = `Épaisseur calculée : ${epaisseur.toFixed(2)} mm (${els.pvCount.value} x ${els.pvMmPerCard.value} mm/carte + ${THICKNESS_SLACK}mm de jeu).`;
    } else {
      els.pvThicknessComputed.textContent = '';
    }

    if (!(largeur > 0 && epaisseur > 0)) {
      throw new Error('Renseignez une largeur et une épaisseur positives.');
    }

    const result = OrigamiGeometry.pochetteV(largeur, epaisseur, margeCote, margeEpaisseur);
    return { box: result.box.paper, lid: result.couvercle.paper };
  }

  // Construit l'aperçu "feuille A4" : combiné (les deux pièces sur la même page)
  // si ça rentre, sinon une page A4 par pièce (ou une note si une pièce a besoin
  // de plusieurs feuilles).
  function renderA4Preview(boxPaper, lidPaper) {
    els.previewA4.innerHTML = '';
    els.combinedWrap.style.display = 'none';
    window.__combinedLayout = null;

    const boxLabel = state.boxType === 'modamasu' ? 'Boîte' : 'Pochette';
    const lidLabel = 'Couvercle';

    const orientation = getPieceOrientation();
    const pagBox = paginateForPrint(boxPaper);
    const pagLid = lidPaper ? paginateForPrint(lidPaper) : null;

    if (lidPaper && pagBox.singlePage && pagLid.singlePage) {
      const combo = OrigamiPrint.combineOnA4(boxPaper, lidPaper, orientation);
      if (combo) {
        const items = [
          { paper: boxPaper, x: combo.items[0].x, y: combo.items[0].y, label: boxLabel },
          { paper: lidPaper, x: combo.items[1].x, y: combo.items[1].y, label: lidLabel },
        ];
        const svg = OrigamiRender.buildA4PageSvg(items, { showDimLabel: false, orientation });
        els.previewA4.appendChild(svg);
        els.infoA4.textContent = 'Les deux pièces tiennent sur une seule feuille A4.';
        els.combinedWrap.style.display = '';
        window.__combinedLayout = items;
        return;
      }
    }

    const wrap = document.createElement('div');
    wrap.className = 'a4-multi';
    els.previewA4.appendChild(wrap);

    const addPage = (paper, pag, label) => {
      const cell = document.createElement('div');
      cell.className = 'a4-cell';
      const h = document.createElement('div');
      h.className = 'a4-cell-title';
      h.textContent = label;
      cell.appendChild(h);
      if (pag.singlePage) {
        const svg = OrigamiRender.buildA4PageSvg([{ paper, x: 0, y: 0 }], { showDimLabel: false, orientation });
        cell.appendChild(svg);
      } else {
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = `Ne tient pas sur 1 feuille A4 (${paper.size.width.toFixed(1)}mm) — sera imprimé sur ${pag.pages.length} feuilles à recoller.`;
        cell.appendChild(note);
      }
      wrap.appendChild(cell);
    };

    addPage(boxPaper, pagBox, boxLabel);
    if (lidPaper) addPage(lidPaper, pagLid, lidLabel);

    els.infoA4.textContent = lidPaper ? 'Les deux pièces ne tiennent pas ensemble sur une seule feuille A4 : impressions séparées.' : '';
  }

  function update() {
    els.warning.textContent = '';
    let geo;
    try {
      geo = computeGeometry();
    } catch (e) {
      els.warning.textContent = e.message;
      return;
    }

    renderPreviewInto(els.previewBox, els.infoBox, geo.box);
    window.__lastResult = { box: { paper: geo.box } };

    els.lidPreviewWrap.style.display = geo.lid ? '' : 'none';
    if (geo.lid) {
      if (state.boxType === 'modamasu' && state.lidImage) {
        // -45° aligne l'image sur la diagonale bleue (BL->TR) plutôt que sur
        // les bords de la feuille.
        geo.lid.image = computeImageRect(state.lidImage, geo.lid.size, -45);
      }
      renderPreviewInto(els.previewLid, els.infoLid, geo.lid);
      window.__lastResult.lid = { paper: geo.lid };
    }

    renderA4Preview(geo.box, geo.lid || null);
  }

  // Impression d'une seule pièce sur une page A4 pleine (le gabarit est placé sur
  // le contour exact de la feuille physique) : les traits de coupe rotary
  // débordent alors jusqu'au bord réel du papier, pas juste dans une petite marge.
  // Si le gabarit est plus grand qu'une page A4, on le découpe en plusieurs
  // feuilles à recoller (pas de traits de coupe rotary dans ce cas : les bords de
  // tuile ne sont pas les vrais bords du papier).
  function buildPrintPages(paper, title) {
    els.printArea.innerHTML = '';
    const orientation = getPieceOrientation();
    const pag = paginateForPrint(paper);

    if (pag.singlePage) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'print-page';
      const items = centerItemsOnA4([{ paper, x: 0, y: 0, label: title }], orientation);
      const svg = OrigamiRender.buildA4PageSvg(items, { printMode: true, showPageFrame: false, orientation });
      pageDiv.appendChild(svg);
      els.printArea.appendChild(pageDiv);
      return;
    }

    // Chaque tuile est rendue sur un canevas exactement à la taille A4 (marge de
    // 5mm incluse dans le SVG lui-même) : la marge @page CSS est à 0 pour que les
    // impressions pleine page (traits de coupe) touchent le vrai bord du papier,
    // donc la sécurité de marge doit être portée par le contenu ici.
    const marks = regMarks(Math.max(paper.size.width, paper.size.height), 40);
    pag.pages.forEach((page, idx) => {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'print-page';
      const svg = OrigamiRender.buildSvg(paper, {
        margin: OrigamiPrint.PAGE_MARGIN,
        printMode: true,
        showCutTicks: false,
        viewBox: { x: page.x, y: page.y, w: page.width, h: page.height },
        registrationMarks: marks,
        pageLabel: `Feuille ${idx + 1}/${pag.pages.length} (col ${page.col + 1}, ligne ${page.row + 1})`,
      });
      pageDiv.appendChild(svg);
      els.printArea.appendChild(pageDiv);
    });
  }

  function buildCombinedPrintPage(items, title) {
    els.printArea.innerHTML = '';
    const orientation = getPieceOrientation();
    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page';
    const svg = OrigamiRender.buildA4PageSvg(centerItemsOnA4(items, orientation), { printMode: true, showPageFrame: false, orientation });
    pageDiv.appendChild(svg);
    els.printArea.appendChild(pageDiv);
  }

  // Imprime N exemplaires identiques d'une même pièce, répartis en grille sur
  // autant de feuilles A4 que nécessaire (pleine page, traits de coupe rotary
  // débordant jusqu'au bord réel du papier).
  function buildCopiesPrintPages(paper, title, count) {
    els.printArea.innerHTML = '';
    const orientation = getPieceOrientation();
    const packed = OrigamiPrint.packCopies(paper.size.width, paper.size.height, count, orientation);
    if (!packed) return false;

    for (let p = 0; p < packed.pageCount; p++) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'print-page';
      const items = packed.items
        .filter((it) => it.page === p)
        .map((it) => ({ paper, x: it.x, y: it.y }));
      const svg = OrigamiRender.buildA4PageSvg(centerItemsOnA4(items, orientation), { printMode: true, showPageFrame: false, orientation });
      pageDiv.appendChild(svg);
      els.printArea.appendChild(pageDiv);
    }
    return true;
  }

  // Le format physique de la feuille A4 (@page) doit suivre l'orientation
  // utilisée pour calculer/positionner les gabarits, sinon le papier imprimé ne
  // correspond pas à la mise en page (paysage par défaut pour la Pochette V).
  function setPageOrientation(orientation) {
    let styleEl = document.getElementById('page-orientation-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'page-orientation-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 0; } }`;
  }

  function doPrint() {
    setPageOrientation(getPieceOrientation());
    document.body.classList.add('printing');
    window.setTimeout(() => {
      window.print();
      document.body.classList.remove('printing');
    }, 50);
  }

  function getCopyCount() {
    const n = parseInt(els.copies.value, 10);
    return n > 1 ? n : 1;
  }

  function pieceTitle(which) {
    const type = state.boxType === 'modamasu' ? 'ModaMasu' : 'Pochette V';
    const piece = which === 'box' ? (state.boxType === 'modamasu' ? 'Boîte' : 'Pochette') : 'Couvercle';
    return `${type} — ${piece}`;
  }

  function printPiece(which) {
    const last = window.__lastResult;
    if (!last || !last[which]) return;
    const title = pieceTitle(which);
    const count = getCopyCount();

    els.copiesWarning.textContent = '';
    if (count > 1) {
      const ok = buildCopiesPrintPages(last[which].paper, title, count);
      if (!ok) {
        els.copiesWarning.textContent =
          'Ce gabarit est trop grand pour tenir plusieurs fois sur une page A4 : impression à 1 exemplaire.';
        buildPrintPages(last[which].paper, title);
      }
    } else {
      buildPrintPages(last[which].paper, title);
    }
    doPrint();
  }

  function printCombined() {
    if (!window.__combinedLayout) return;
    const type = state.boxType === 'modamasu' ? 'ModaMasu' : 'Pochette V';
    buildCombinedPrintPage(window.__combinedLayout, `${type} — Boîte + Couvercle`);
    doPrint();
  }

  els.form.addEventListener('input', update);
  els.lidToggle.addEventListener('change', update);
  els.btnPrintBox.addEventListener('click', () => printPiece('box'));
  els.btnPrintLid.addEventListener('click', () => printPiece('lid'));
  els.btnPrintCombined.addEventListener('click', printCombined);

  setBoxType('modamasu');
})();
