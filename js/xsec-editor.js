/**
 * @file xsec-editor.js
 * 2D cross-section shape editor. Shows one cross-section (front view: Y vs Z).
 * A station scrubber selects which ring to view/edit. Keyframe stations get
 * editable polygons; others show the default super-ellipse as a preview.
 */
import { superEllipse, defaultXSecPoly, RS } from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PT_HIT_R = IS_TOUCH ? 22 : 10;

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/**
 * Create a cross-section editor.
 * @param {HTMLElement} container - DOM element to append into
 * @param {Object} profileState - must have xsecKeyframes, nCache
 * @param {Function} onEdit - called when cross-section changes
 * @returns {{ refresh(), setStation(i) }}
 */
export function createXSecEditor(container, profileState, onEdit) {
  const VW = 250, VH = 250, MRG = 14;

  let station = 48; // default: mid-body (t=0.5)
  let isEditing = false; // true if current station has a keyframe

  // ── SVG setup ──
  const svg = svgEl('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'pe-svg', preserveAspectRatio: 'none' });
  svg.style.width = '100%';
  svg.style.height = `${VH}px`;

  const gridG = svgEl('g');
  const refPoly = svgEl('polygon', { class: 'xsec-ref' }); // default super-ellipse reference
  const shapePoly = svgEl('polygon', { class: 'xsec-shape' }); // current shape (editable or preview)
  const fillPoly = svgEl('polygon', { class: 'xsec-fill' });
  const centerH = svgEl('line', { class: 'pe-center' });
  const centerV = svgEl('line', { class: 'pe-center' });
  const dotsG = svgEl('g');
  const label = svgEl('text', { x: 6, y: 14, class: 'pe-zoom' });
  svg.append(gridG, fillPoly, refPoly, centerH, centerV, shapePoly, dotsG, label);

  // ── Controls bar ──
  const bar = document.createElement('div');
  bar.className = 'xsec-bar';
  bar.innerHTML = `
    <input type="range" id="xsecScrub" min="1" max="96" value="${station}" class="xsec-scrub">
    <div class="xsec-btns">
      <span class="xsec-label" id="xsecLabel">t=0.50</span>
      <button class="xsec-btn" id="xsecEdit">Edit</button>
      <button class="xsec-btn" id="xsecReset">Reset</button>
    </div>
  `;

  container.appendChild(bar);
  container.appendChild(svg);

  const scrubEl = bar.querySelector('#xsecScrub');
  const labelEl = bar.querySelector('#xsecLabel');
  const editBtn = bar.querySelector('#xsecEdit');
  const resetBtn = bar.querySelector('#xsecReset');

  // ── Coordinate transforms (normalized -1..1 → SVG) ──
  const toSX = z => MRG + ((z + 1.2) / 2.4) * (VW - MRG * 2);
  const toSY = y => MRG + ((1.2 - y) / 2.4) * (VH - MRG * 2);
  const fromSX = sx => (sx - MRG) / (VW - MRG * 2) * 2.4 - 1.2;
  const fromSY = sy => 1.2 - (sy - MRG) / (VH - MRG * 2) * 2.4;

  function getShape() {
    return profileState.xsecKeyframes[station] || null;
  }

  function getDefaultPoly() {
    const n = profileState.nCache ? profileState.nCache[station] : 2.2;
    return defaultXSecPoly(n);
  }

  function polyToSvgPoints(pts) {
    return pts.map(p => `${toSX(p.z).toFixed(1)},${toSY(p.y).toFixed(1)}`).join(' ');
  }

  // ── Drawing ──
  function drawGrid() {
    gridG.innerHTML = '';
    for (let v = -1; v <= 1; v += 0.5) {
      gridG.appendChild(svgEl('line', { x1: toSX(v), y1: MRG, x2: toSX(v), y2: VH - MRG, class: 'pe-grid' }));
      gridG.appendChild(svgEl('line', { x1: MRG, y1: toSY(v), x2: VW - MRG, y2: toSY(v), class: 'pe-grid' }));
    }
    centerH.setAttribute('x1', MRG); centerH.setAttribute('x2', VW - MRG);
    centerH.setAttribute('y1', toSY(0)); centerH.setAttribute('y2', toSY(0));
    centerV.setAttribute('x1', toSX(0)); centerV.setAttribute('x2', toSX(0));
    centerV.setAttribute('y1', MRG); centerV.setAttribute('y2', VH - MRG);
  }

  function draw() {
    const shape = getShape();
    const defPoly = getDefaultPoly();
    isEditing = !!shape;

    // Reference ellipse (always shown, dashed)
    refPoly.setAttribute('points', polyToSvgPoints(defPoly));

    // Active shape
    const activePts = shape || defPoly;
    shapePoly.setAttribute('points', polyToSvgPoints(activePts));
    fillPoly.setAttribute('points', polyToSvgPoints(activePts));

    // Label
    const t = (station / 96).toFixed(2);
    labelEl.textContent = `t=${t}${isEditing ? ' (edited)' : ''}`;
    editBtn.textContent = isEditing ? 'Editing' : 'Edit';
    editBtn.disabled = isEditing;
    resetBtn.disabled = !isEditing;
  }

  function drawPoints() {
    dotsG.innerHTML = '';
    if (!isEditing) return; // only show points when editing
    const shape = getShape();
    if (!shape) return;
    shape.forEach((p, i) => {
      // Only show every other point to reduce clutter (37 is a lot)
      if (i % 2 !== 0 && i !== shape.length - 1) return;
      const c = svgEl('circle', {
        cx: toSX(p.z), cy: toSY(p.y), r: 4,
        class: 'pe-pt dorsal', 'data-idx': i
      });
      dotsG.appendChild(c);
    });
  }

  function refresh() {
    drawGrid(); draw(); drawPoints();
  }

  function setStation(i) {
    station = Math.max(1, Math.min(96, i));
    scrubEl.value = station;
    refresh();
  }

  // ── Scrubber ──
  scrubEl.addEventListener('input', () => {
    station = +scrubEl.value;
    refresh();
  });

  // ── Edit / Reset buttons ──
  editBtn.addEventListener('click', () => {
    if (!profileState.xsecKeyframes[station]) {
      profileState.xsecKeyframes[station] = getDefaultPoly();
      refresh();
      onEdit();
    }
  });

  resetBtn.addEventListener('click', () => {
    delete profileState.xsecKeyframes[station];
    refresh();
    onEdit();
  });

  // ── Point dragging ──
  let drag = null;

  function findNearest(cx, cy) {
    const shape = getShape();
    if (!shape) return null;
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width * VW;
    const sy = (cy - rect.top) / rect.height * VH;
    let best = null, bestD = PT_HIT_R;
    shape.forEach((p, i) => {
      const d = Math.sqrt((toSX(p.z) - sx) ** 2 + (toSY(p.y) - sy) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function startDrag(cx, cy) {
    if (!isEditing) return false;
    const idx = findNearest(cx, cy);
    if (idx === null) return false;
    drag = idx;
    return true;
  }

  function moveDrag(cx, cy) {
    if (drag === null) return;
    const shape = getShape();
    if (!shape) return;
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width * VW;
    const sy = (cy - rect.top) / rect.height * VH;
    shape[drag].z = Math.max(-1.5, Math.min(1.5, fromSX(sx)));
    shape[drag].y = Math.max(-1.5, Math.min(1.5, fromSY(sy)));
    draw(); drawPoints(); onEdit();
  }

  function endDrag() { drag = null; }

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

  refresh();
  return { refresh, setStation };
}
