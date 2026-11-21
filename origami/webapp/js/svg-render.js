/*
 * Rendu SVG partagé : dessine un gabarit (paper.size en mm, paper.lines, paper.points)
 * dans un <svg> avec 1 unité utilisateur = 1 mm, pour une impression fidèle.
 */
(function (global) {
  'use strict';

  const LINE_STYLES = {
    cut: { stroke: '#000', width: 0.5, dash: null, label: 'Découpe (bord papier)' },
    diagonal: { stroke: '#555', width: 0.3, dash: null, label: 'Diagonale (1er pli)' },
    fold: { stroke: '#555', width: 0.3, dash: '2,1.5', label: 'Pli accordéon' },
  };

  const POINT_COLORS = {
    blue: '#1257c4',
    green: '#1a8a3d',
    orange: '#d1691a',
  };

  const POINT_LEGEND = {
    blue: 'Repère — série A (ModaMasu : diagonale L · Pochette V : boîte)',
    green: 'Centre',
    orange: 'Repère — série B (ModaMasu : diagonale W · Pochette V : couvercle)',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const A4 = { width: 210, height: 297 };

  function fmt(n) {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  let clipIdCounter = 0;

  // Dessine l'illustration éventuelle (paper.image = {href,x,y,width,height} en
  // coordonnées locales du papier), rognée au contour du papier, sous les traits.
  function drawPaperImage(g, paper) {
    const img = paper.image;
    if (!img || !img.href) return;
    const size = paper.size;
    const clipId = `origami-clip-${++clipIdCounter}`;

    const defs = document.createElementNS(SVG_NS, 'defs');
    const clipPath = document.createElementNS(SVG_NS, 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS(SVG_NS, 'rect');
    clipRect.setAttribute('x', 0);
    clipRect.setAttribute('y', 0);
    clipRect.setAttribute('width', size.width);
    clipRect.setAttribute('height', size.height);
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    g.appendChild(defs);

    const image = document.createElementNS(SVG_NS, 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', img.href);
    image.setAttribute('href', img.href);
    image.setAttribute('x', img.x);
    image.setAttribute('y', img.y);
    image.setAttribute('width', img.width);
    image.setAttribute('height', img.height);
    image.setAttribute('preserveAspectRatio', 'none');
    if (img.rotate) {
      image.setAttribute('transform', `rotate(${img.rotate} ${img.cx} ${img.cy})`);
    }
    image.setAttribute('clip-path', `url(#${clipId})`);
    g.appendChild(image);
  }

  // Dessine le contour + les repères d'un gabarit dans le groupe `g` (déjà positionné
  // à l'origine locale du papier, coordonnées 0..paper.size.width/height).
  function drawPaperContent(g, paper, opts) {
    opts = opts || {};
    const printMode = !!opts.printMode;
    const size = paper.size;

    drawPaperImage(g, paper);

    (paper.lines || []).forEach((line) => {
      const style = LINE_STYLES[line.type] || LINE_STYLES.cut;
      const el = document.createElementNS(SVG_NS, 'polyline');
      el.setAttribute('points', line.points.map((p) => p.join(',')).join(' '));
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', style.stroke);
      el.setAttribute('stroke-width', printMode && line.type !== 'cut' ? 0.25 : style.width);
      const dash = printMode && line.type === 'diagonal' ? '0.4,1.4' : style.dash;
      if (dash) el.setAttribute('stroke-dasharray', dash);
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(el);
    });

    const showLabels = printMode ? false : opts.showPointLabels !== false;

    (paper.points || []).forEach((pt) => {
      // Le repère du centre de la feuille n'est pas utile au pliage et gêne une
      // éventuelle illustration : on ne l'imprime pas (gardé à l'écran).
      if (printMode && pt.color === 'green') return;
      const [x, y] = pt.pos;
      const color = printMode ? '#000' : POINT_COLORS[pt.color] || '#333';

      if (printMode) {
        const r = 1.6;
        const cross = document.createElementNS(SVG_NS, 'path');
        cross.setAttribute('d', `M ${x - r} ${y} L ${x + r} ${y} M ${x} ${y - r} L ${x} ${y + r}`);
        cross.setAttribute('stroke', color);
        cross.setAttribute('stroke-width', 0.25);
        cross.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(cross);
      } else {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', 1.1);
        dot.setAttribute('fill', color);
        g.appendChild(dot);
      }

      if (showLabels) {
        let lx, ly;
        if (pt.labelPos) {
          [lx, ly] = pt.labelPos;
        } else {
          const cx = size.width / 2, cy = size.height / 2;
          const isCenter = Math.hypot(x - cx, y - cy) < 0.01;
          const ang = isCenter ? Math.PI / 4 : Math.atan2(y - cy, x - cx);
          const dist = isCenter ? 8 : 6.5;
          lx = x + Math.cos(ang) * dist;
          ly = y + Math.sin(ang) * dist;
        }
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', lx);
        t.setAttribute('y', ly);
        t.setAttribute('font-size', '3.4');
        t.setAttribute('fill', color);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.textContent = fmt(pt.value);
        g.appendChild(t);
      }
    });

    if (opts.showDimLabel) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', 1);
      t.setAttribute('y', size.height - 1);
      t.setAttribute('font-size', '3');
      t.setAttribute('fill', '#666');
      t.textContent = `${fmt(size.width)} x ${fmt(size.height)} mm`;
      g.appendChild(t);
    }

    if (opts.showCutTicks !== false) drawCutTicks(g, paper, printMode);
  }

  // Traits dans le prolongement de chaque segment de découpe droit : permettent
  // d'aligner une règle et couper au cutter rotatif sans suivre le trait imprimé
  // (qui disparaît sous la lame/la règle). Le trait est volontairement bien plus
  // long que n'importe quel support (page ou aperçu) : il va jusqu'au bord réel du
  // support, qui le rogne naturellement (clipping SVG par défaut sur le viewBox).
  const TICK_GAP = 1; // espace laissé vide entre le bord de la découpe et le trait
  const TICK_LEN = 500; // longueur "infinie" : rognée au bord du support par le SVG

  function drawCutTicks(g, paper, printMode) {
    (paper.lines || []).forEach((line) => {
      if (line.type !== 'cut') return;
      const pts = line.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const ux = dx / len, uy = dy / len;
        addTick(x1, y1, -ux, -uy);
        addTick(x2, y2, ux, uy);
      }
    });

    function addTick(x, y, dx, dy) {
      const el = document.createElementNS(SVG_NS, 'line');
      el.setAttribute('x1', x + dx * TICK_GAP);
      el.setAttribute('y1', y + dy * TICK_GAP);
      el.setAttribute('x2', x + dx * (TICK_GAP + TICK_LEN));
      el.setAttribute('y2', y + dy * (TICK_GAP + TICK_LEN));
      el.setAttribute('stroke', '#000');
      el.setAttribute('stroke-width', printMode ? 0.3 : 0.35);
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(el);
    }
  }

  function buildSvg(paper, opts) {
    opts = opts || {};
    const margin = opts.margin != null ? opts.margin : 4;
    const vb = opts.viewBox || { x: 0, y: 0, w: paper.size.width, h: paper.size.height };

    const w = vb.w + margin * 2;
    const h = vb.h + margin * 2;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', `${w}mm`);
    svg.setAttribute('height', `${h}mm`);
    svg.setAttribute('class', 'origami-svg');

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${margin - vb.x},${margin - vb.y})`);
    svg.appendChild(g);

    drawPaperContent(g, paper, opts);

    if (opts.registrationMarks) {
      const crossR = 2.5;
      opts.registrationMarks.forEach(([mx, my]) => {
        if (mx < vb.x - 1 || mx > vb.x + vb.w + 1 || my < vb.y - 1 || my > vb.y + vb.h + 1) return;
        const cross = document.createElementNS(SVG_NS, 'path');
        cross.setAttribute(
          'd',
          `M ${mx - crossR} ${my} L ${mx + crossR} ${my} M ${mx} ${my - crossR} L ${mx} ${my + crossR}`
        );
        cross.setAttribute('stroke', '#999');
        cross.setAttribute('stroke-width', '0.2');
        g.appendChild(cross);
      });
    }

    if (opts.pageLabel) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', w - 1);
      t.setAttribute('y', h - 1);
      t.setAttribute('font-size', '3');
      t.setAttribute('fill', '#666');
      t.setAttribute('text-anchor', 'end');
      t.textContent = opts.pageLabel;
      svg.appendChild(t);
    }

    return svg;
  }

  // Aperçu/impression d'une page A4 entière avec un ou plusieurs gabarits positionnés
  // dessus. items = [{ paper, x, y }] où x,y = position en mm dans la zone imprimable
  // (déjà décalée de la marge de sécurité si besoin par l'appelant).
  function buildA4PageSvg(items, opts) {
    opts = opts || {};
    const printMode = !!opts.printMode; // aperçu écran = coloré/légendé par défaut, plus lisible
    const showPageFrame = opts.showPageFrame !== false;
    const marginInset = opts.marginInset != null ? opts.marginInset : 5;
    const landscape = opts.orientation === 'landscape';
    const pageW = landscape ? A4.height : A4.width;
    const pageH = landscape ? A4.width : A4.height;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${pageW} ${pageH}`);
    svg.setAttribute('width', `${pageW}mm`);
    svg.setAttribute('height', `${pageH}mm`);
    svg.setAttribute('class', 'origami-svg origami-a4-page');

    if (showPageFrame) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', 0);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', pageW);
      rect.setAttribute('height', pageH);
      rect.setAttribute('fill', '#fff');
      rect.setAttribute('stroke', '#bbb');
      rect.setAttribute('stroke-width', 0.4);
      svg.appendChild(rect);

      const safe = document.createElementNS(SVG_NS, 'rect');
      safe.setAttribute('x', marginInset);
      safe.setAttribute('y', marginInset);
      safe.setAttribute('width', pageW - 2 * marginInset);
      safe.setAttribute('height', pageH - 2 * marginInset);
      safe.setAttribute('fill', 'none');
      safe.setAttribute('stroke', '#ddd');
      safe.setAttribute('stroke-width', 0.25);
      safe.setAttribute('stroke-dasharray', '1.5,1.5');
      svg.appendChild(safe);
    }

    items.forEach((item) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${marginInset + item.x},${marginInset + item.y})`);
      drawPaperContent(g, item.paper, { printMode, showDimLabel: opts.showDimLabel, showPointLabels: opts.showPointLabels });
      svg.appendChild(g);
      if (item.label) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', marginInset + item.x);
        t.setAttribute('y', marginInset + item.y - 1.5);
        t.setAttribute('font-size', '3.2');
        t.setAttribute('fill', '#888');
        t.textContent = item.label;
        svg.appendChild(t);
      }
    });

    return svg;
  }

  // Rendu compact (pas de cadre de page) de plusieurs gabarits positionnés côte à
  // côte : utilisé pour l'impression combinée (boîte + couvercle sur 1 feuille).
  function buildMultiSvg(items, opts) {
    opts = opts || {};
    const margin = opts.margin != null ? opts.margin : 0;
    let maxX = 0, maxY = 0;
    items.forEach((it) => {
      maxX = Math.max(maxX, it.x + it.paper.size.width);
      maxY = Math.max(maxY, it.y + it.paper.size.height);
    });
    const w = maxX + margin * 2, h = maxY + margin * 2;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', `${w}mm`);
    svg.setAttribute('height', `${h}mm`);
    svg.setAttribute('class', 'origami-svg');

    items.forEach((it) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${margin + it.x},${margin + it.y})`);
      drawPaperContent(g, it.paper, { printMode: opts.printMode !== false });
      svg.appendChild(g);
    });

    return svg;
  }

  function legendHtml() {
    const lineItems = Object.keys(LINE_STYLES)
      .map((k) => {
        const s = LINE_STYLES[k];
        return `<span class="legend-item"><svg width="24" height="10"><line x1="1" y1="5" x2="23" y2="5" stroke="${s.stroke}" stroke-width="2"/></svg> ${s.label}</span>`;
      })
      .join('');
    const pointItems = Object.keys(POINT_COLORS)
      .map(
        (k) =>
          `<span class="legend-item"><svg width="12" height="10"><circle cx="6" cy="5" r="4" fill="${POINT_COLORS[k]}"/></svg> ${POINT_LEGEND[k]}</span>`
      )
      .join('');
    return lineItems + pointItems;
  }

  global.OrigamiRender = {
    buildSvg,
    buildA4PageSvg,
    buildMultiSvg,
    legendHtml,
    LINE_STYLES,
    POINT_COLORS,
    A4,
    TICK_MARGIN: TICK_GAP + TICK_LEN,
  };
})(window);
