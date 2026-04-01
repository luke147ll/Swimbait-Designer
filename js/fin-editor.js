/**
 * @file fin-editor.js
 * 2D closed-polygon editor for fin shapes (side view).
 * Points are the polygon vertices — drag freely in X and Y.
 * No spline interpolation. What you see is what you get.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PT_HIT_R = IS_TOUCH ? 22 : 10;

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function createFinEditor(container, finState, onEdit) {
  const VW = 300, VH = 200, MRG = 14;

  function getRange() {
    let xMn = 0, xMx = 0, yMn = 0, yMx = 0;
    for (const p of finState.outline) {
      xMn = Math.min(xMn, p.x); xMx = Math.max(xMx, p.x);
      yMn = Math.min(yMn, p.y); yMx = Math.max(yMx, p.y);
    }
    const span = Math.max(xMx - xMn, yMx - yMn, 0.5);
    const pad = span * 0.2;
    return { xMn: xMn - pad, xMx: xMx + pad, yMn: yMn - pad, yMx: yMx + pad };
  }

  let range = getRange();
  const pw = () => VW - MRG * 2, ph = () => VH - MRG * 2;
  const toSX = x => MRG + ((x - range.xMn) / (range.xMx - range.xMn)) * pw();
  const toSY = y => MRG + ((range.yMx - y) / (range.yMx - range.yMn)) * ph();
  const fromSX = sx => range.xMn + (sx - MRG) / pw() * (range.xMx - range.xMn);
  const fromSY = sy => range.yMx - (sy - MRG) / ph() * (range.yMx - range.yMn);

  const svg = svgEl('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'pe-svg' });
  svg.style.width = '100%';
  svg.style.height = `${VH}px`;
  container.appendChild(svg);

  const gridG = svgEl('g');
  const fillPoly = svgEl('polygon', { class: 'pe-outline-fill' });
  const strokePoly = svgEl('polygon', { class: 'pe-outline-stroke' });
  const centerH = svgEl('line', { class: 'pe-center' });
  const attachV = svgEl('line', { class: 'pe-center' });
  const dotsG = svgEl('g');
  svg.append(gridG, fillPoly, centerH, attachV, strokePoly, dotsG);

  let drag = null, isDragging = false;

  function polyPoints() {
    return finState.outline.map(p => `${toSX(p.x).toFixed(1)},${toSY(p.y).toFixed(1)}`).join(' ');
  }

  function drawGrid() {
    gridG.innerHTML = '';
    const sx = (range.xMx - range.xMn) / 5;
    for (let x = range.xMn; x <= range.xMx + sx * 0.1; x += sx)
      gridG.appendChild(svgEl('line', { x1: toSX(x), y1: MRG, x2: toSX(x), y2: VH - MRG, class: 'pe-grid' }));
    const sy = (range.yMx - range.yMn) / 5;
    for (let y = range.yMn; y <= range.yMx + sy * 0.1; y += sy)
      gridG.appendChild(svgEl('line', { x1: MRG, y1: toSY(y), x2: VW - MRG, y2: toSY(y), class: 'pe-grid' }));
    centerH.setAttribute('x1', MRG); centerH.setAttribute('x2', VW - MRG);
    centerH.setAttribute('y1', toSY(0)); centerH.setAttribute('y2', toSY(0));
    attachV.setAttribute('x1', toSX(0)); attachV.setAttribute('x2', toSX(0));
    attachV.setAttribute('y1', MRG); attachV.setAttribute('y2', VH - MRG);
  }

  function draw() {
    const pts = polyPoints();
    fillPoly.setAttribute('points', pts);
    strokePoly.setAttribute('points', pts);
  }

  function drawPoints() {
    dotsG.innerHTML = '';
    finState.outline.forEach((p, i) => {
      const c = svgEl('circle', {
        cx: toSX(p.x), cy: toSY(p.y), r: 5,
        class: 'pe-pt dorsal', 'data-idx': i
      });
      c.appendChild(svgEl('title'));
      c.lastChild.textContent = `Pt ${i}`;
      dotsG.appendChild(c);
    });
  }

  function refresh() {
    if (!isDragging) range = getRange();
    drawGrid(); draw(); drawPoints();
  }

  // ── Hit detection ──
  function findNearest(cx, cy) {
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width * VW;
    const sy = (cy - rect.top) / rect.height * VH;
    let best = null, bestD = PT_HIT_R;
    finState.outline.forEach((p, i) => {
      const d = Math.sqrt((toSX(p.x) - sx) ** 2 + (toSY(p.y) - sy) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function startDrag(cx, cy) {
    const idx = findNearest(cx, cy);
    if (idx === null) return false;
    drag = idx; isDragging = true;
    return true;
  }

  function moveDrag(cx, cy) {
    if (drag === null) return;
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width * VW;
    const sy = (cy - rect.top) / rect.height * VH;
    finState.outline[drag].x = fromSX(sx);
    finState.outline[drag].y = fromSY(sy);
    draw(); drawPoints(); onEdit();
  }

  function endDrag() { drag = null; isDragging = false; range = getRange(); }

  // ── Mouse ──
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (startDrag(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); }
  });
  svg.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' && drag !== null) { moveDrag(e.clientX, e.clientY); e.stopPropagation(); }
  });
  svg.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') endDrag(); });

  // ── Touch ──
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag !== null) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  svg.addEventListener('touchend', () => endDrag());

  // ── Double-click: add point ��─
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * VW;
    const sy = (e.clientY - rect.top) / rect.height * VH;
    const cx = fromSX(sx), cy = fromSY(sy);
    // Insert between nearest two adjacent points
    const pts = finState.outline;
    let bestSeg = 0, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = (cx - (a.x + b.x) / 2) ** 2 + (cy - (a.y + b.y) / 2) ** 2;
      if (d < bestD) { bestD = d; bestSeg = i; }
    }
    const a = pts[bestSeg], b = pts[(bestSeg + 1) % pts.length];
    pts.splice(bestSeg + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    refresh(); onEdit();
  });

  // ── Right-click: delete ──
  svg.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    if (finState.outline.length <= 3) return;
    const idx = findNearest(e.clientX, e.clientY);
    if (idx !== null) { finState.outline.splice(idx, 1); refresh(); onEdit(); }
  });

  refresh();
  return { refresh };
}
