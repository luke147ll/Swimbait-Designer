/**
 * @file fin-editor.js
 * 2D closed-outline SVG editor for fin shapes, shown in SIDE VIEW.
 * Coordinates: x = rearward from stalk, y = vertical (dorsal+, ventral-).
 * Points drag freely in both X and Y. Same zoom/pan/touch as body editors.
 */
import { sampleClosedLoop } from './splines.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SAMPLES = 80;
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PT_HIT_R = IS_TOUCH ? 22 : 10;

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function createViewport(VW, VH) {
  return {
    vx: 0, vy: 0, vw: VW, vh: VH, VW, VH, zoom: 1,
    viewBox() { return `${this.vx} ${this.vy} ${this.vw} ${this.vh}`; },
    pixToVB(px, py, rect) {
      return { x: this.vx + (px / rect.width) * this.vw, y: this.vy + (py / rect.height) * this.vh };
    },
    applyZoom(delta, px, py, rect) {
      const f = delta > 0 ? 1.12 : 1 / 1.12;
      const nw = Math.max(this.VW * 0.05, Math.min(this.VW * 4, this.vw * f));
      const nh = Math.max(this.VH * 0.05, Math.min(this.VH * 4, this.vh * f));
      const p = this.pixToVB(px, py, rect);
      const rx = (p.x - this.vx) / this.vw, ry = (p.y - this.vy) / this.vh;
      this.vx = p.x - rx * nw; this.vy = p.y - ry * nh;
      this.vw = nw; this.vh = nh; this.zoom = this.VW / this.vw;
    },
    applyPan(dx, dy, rect) {
      this.vx -= (dx / rect.width) * this.vw;
      this.vy -= (dy / rect.height) * this.vh;
    }
  };
}

/**
 * Create a 2D side-view editor for a fin outline.
 * @param {HTMLElement} container
 * @param {Object} finState - { outline: [{x,y}], ... }
 * @param {Function} onEdit
 */
export function createFinEditor(container, finState, onEdit) {
  const VW = 300, VH = 200, MRG = 12;
  const vp = createViewport(VW, VH);

  function getRange() {
    let xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    for (const p of finState.outline) {
      xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    }
    const pad = Math.max(xMax - xMin, yMax - yMin, 0.1) * 0.2;
    return { xMin: xMin - pad, xMax: xMax + pad, yMin: yMin - pad, yMax: yMax + pad };
  }

  let range = getRange();
  // Side view: x → SVG X (rearward = right), y → SVG Y (inverted, dorsal = up)
  const toSX = x => MRG + ((x - range.xMin) / (range.xMax - range.xMin)) * (VW - MRG * 2);
  const toSY = y => MRG + ((range.yMax - y) / (range.yMax - range.yMin)) * (VH - MRG * 2);
  const fromSX = sx => range.xMin + (sx - MRG) / (VW - MRG * 2) * (range.xMax - range.xMin);
  const fromSY = sy => range.yMax - (sy - MRG) / (VH - MRG * 2) * (range.yMax - range.yMin);

  const svg = svgEl('svg', { viewBox: vp.viewBox(), class: 'pe-svg' });
  svg.style.width = '100%';
  svg.style.height = `${VH}px`;
  container.appendChild(svg);

  const gridG = svgEl('g');
  const fillPath = svgEl('path', { class: 'pe-outline-fill' });
  const outlinePath = svgEl('path', { class: 'pe-outline-stroke' });
  const centerLine = svgEl('line', { class: 'pe-center' });
  const attachLine = svgEl('line', { class: 'pe-center', 'stroke-dasharray': '2,2' });
  const dotsG = svgEl('g');
  const zoomLabel = svgEl('text', { x: VW - 4, y: VH - 3, class: 'pe-zoom', 'text-anchor': 'end' });
  zoomLabel.textContent = '1.0x';
  svg.append(gridG, fillPath, centerLine, attachLine, outlinePath, dotsG, zoomLabel);

  let drag = null, isDragging = false;

  function drawGrid() {
    gridG.innerHTML = '';
    const sx = (range.xMax - range.xMin) / 5;
    for (let x = range.xMin; x <= range.xMax + sx * 0.1; x += sx) {
      gridG.appendChild(svgEl('line', { x1: toSX(x), y1: MRG, x2: toSX(x), y2: VH - MRG, class: 'pe-grid' }));
    }
    const sy = (range.yMax - range.yMin) / 5;
    for (let y = range.yMin; y <= range.yMax + sy * 0.1; y += sy) {
      gridG.appendChild(svgEl('line', { x1: MRG, y1: toSY(y), x2: VW - MRG, y2: toSY(y), class: 'pe-grid' }));
    }
    // Center Y line (y=0)
    centerLine.setAttribute('x1', MRG); centerLine.setAttribute('x2', VW - MRG);
    centerLine.setAttribute('y1', toSY(0)); centerLine.setAttribute('y2', toSY(0));
    // Attachment line (x=0, the stalk tip)
    attachLine.setAttribute('x1', toSX(0)); attachLine.setAttribute('x2', toSX(0));
    attachLine.setAttribute('y1', MRG); attachLine.setAttribute('y2', VH - MRG);
  }

  function outlinePathD() {
    let d = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const pt = sampleClosedLoop(finState.outline, i / SAMPLES);
      d += `${i === 0 ? 'M' : 'L'}${toSX(pt.x).toFixed(1)},${toSY(pt.y).toFixed(1)} `;
    }
    return d + 'Z';
  }

  function drawOutline() {
    const d = outlinePathD();
    outlinePath.setAttribute('d', d);
    fillPath.setAttribute('d', d);
  }

  function drawPoints() {
    dotsG.innerHTML = '';
    const ptR = 4.5 * (vp.vw / vp.VW);
    finState.outline.forEach((p, i) => {
      const c = svgEl('circle', {
        cx: toSX(p.x), cy: toSY(p.y), r: ptR,
        class: 'pe-pt dorsal', 'data-idx': i
      });
      const title = svgEl('title');
      title.textContent = `Point ${i}`;
      c.appendChild(title);
      dotsG.appendChild(c);
    });
  }

  function redraw() {
    svg.setAttribute('viewBox', vp.viewBox());
    zoomLabel.textContent = vp.zoom.toFixed(1) + 'x';
    zoomLabel.setAttribute('x', vp.vx + vp.vw - 4);
    zoomLabel.setAttribute('y', vp.vy + vp.vh - 3);
    drawGrid(); drawOutline(); drawPoints();
  }

  function refresh() {
    if (!isDragging) range = getRange();
    redraw();
  }

  // ── Hit detection ──
  function findNearest(cx, cy) {
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) * (VW / rect.width);
    const sy = (cy - rect.top) * (VH / rect.height);
    const hitR = PT_HIT_R * (vp.vw / vp.VW);
    let best = null, bestD = hitR;
    finState.outline.forEach((p, i) => {
      const d = Math.sqrt((toSX(p.x) - sx) ** 2 + (toSY(p.y) - sy) ** 2);
      if (d < bestD) { bestD = d; best = { idx: i }; }
    });
    return best;
  }

  function startDrag(cx, cy, e) {
    const hit = findNearest(cx, cy);
    if (!hit) return false;
    drag = hit; isDragging = true;
    if (e && e.pointerId != null) { try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
    return true;
  }

  function moveDrag(cx, cy) {
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    const vb = vp.pixToVB(cx - rect.left, cy - rect.top, rect);
    finState.outline[drag.idx].x = fromSX(vb.x);
    finState.outline[drag.idx].y = fromSY(vb.y);
    drawOutline(); drawPoints(); onEdit();
  }

  function endDrag() { drag = null; isDragging = false; range = getRange(); }

  // ── Pointer (mouse) ──
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.altKey || e.button === 1) {
      const ps = { lx: e.clientX, ly: e.clientY };
      const onM = ev => { vp.applyPan(ev.clientX - ps.lx, ev.clientY - ps.ly, svg.getBoundingClientRect()); ps.lx = ev.clientX; ps.ly = ev.clientY; redraw(); };
      const onU = () => { window.removeEventListener('pointermove', onM); window.removeEventListener('pointerup', onU); };
      window.addEventListener('pointermove', onM); window.addEventListener('pointerup', onU);
      e.preventDefault(); return;
    }
    if (startDrag(e.clientX, e.clientY, e)) { e.preventDefault(); e.stopPropagation(); }
  });
  svg.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' && drag) { moveDrag(e.clientX, e.clientY); e.stopPropagation(); } });
  svg.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') endDrag(); });

  // ── Touch: 1 finger = drag, 2 fingers = pan + pinch ──
  let tpDist = 0, tpPan = null;
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY, null);
    else if (e.touches.length === 2) {
      endDrag();
      const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
      tpDist = Math.sqrt(dx * dx + dy * dy);
      tpPan = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    }
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (tpDist > 0) { const r = svg.getBoundingClientRect(); vp.applyZoom(tpDist - dist, cx - r.left, cy - r.top, r); tpDist = dist; }
      if (tpPan) { vp.applyPan(cx - tpPan.x, cy - tpPan.y, svg.getBoundingClientRect()); tpPan = { x: cx, y: cy }; }
      redraw();
    }
  }, { passive: false });
  svg.addEventListener('touchend', e => {
    if (e.touches.length === 0) { endDrag(); tpPan = null; }
    if (e.touches.length < 2) { tpDist = 0; tpPan = null; }
  });

  // ── Zoom ──
  svg.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    const r = svg.getBoundingClientRect();
    vp.applyZoom(e.deltaY, e.clientX - r.left, e.clientY - r.top, r);
    redraw();
  }, { passive: false });

  // ── Double-click: add point or reset view ──
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    if (Math.abs(vp.zoom - 1) > 0.05) { vp.vx = 0; vp.vy = 0; vp.vw = VW; vp.vh = VH; vp.zoom = 1; redraw(); return; }
    const rect = svg.getBoundingClientRect();
    const vb = vp.pixToVB(e.clientX - rect.left, e.clientY - rect.top, rect);
    const clickX = fromSX(vb.x), clickY = fromSY(vb.y);
    let bestSeg = 0, bestD = Infinity;
    const pts = finState.outline;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = (clickX - (a.x + b.x) / 2) ** 2 + (clickY - (a.y + b.y) / 2) ** 2;
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
    const hit = findNearest(e.clientX, e.clientY);
    if (hit) { finState.outline.splice(hit.idx, 1); refresh(); onEdit(); }
  });

  refresh();
  return { refresh };
}
