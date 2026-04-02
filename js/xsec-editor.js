/**
 * @file xsec-editor.js
 * 2D cross-section shape editor. Shows one cross-section (front view: Y vs Z).
 * A station scrubber selects which ring to view/edit. Keyframe stations get
 * editable polygons; others show the default super-ellipse as a preview.
 */
import { superEllipse, defaultXSecPoly, RS } from './engine.js';
import { STATION_LABELS as LABELS } from './splines.js';

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
export function createXSecEditor(container, profileState, onEdit, onStationChange) {
  const VW = 250, VH = 250, MRG = 14;

  // Default to the first non-zero profile point's station
  let station = profileState.dorsal && profileState.dorsal.length > 1
    ? Math.round(profileState.dorsal[Math.min(6, profileState.dorsal.length - 1)].t * 96)
    : 33;
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
    <input type="range" min="1" max="96" value="${station}" step="1" class="xsec-scrub">
    <div class="xsec-btns">
      <span class="xsec-label" id="xsecLabel"></span>
      <button class="xsec-btn" id="xsecLockAll">Lock All</button>
      <button class="xsec-btn" id="xsecReset">Reset</button>
    </div>
  `;

  container.appendChild(bar);
  container.appendChild(svg);

  const scrubEl = bar.querySelector('.xsec-scrub');
  const labelEl = bar.querySelector('#xsecLabel');
  const resetBtn = bar.querySelector('#xsecReset');
  const lockAllBtn = bar.querySelector('#xsecLockAll');

  lockAllBtn.addEventListener('click', () => {
    const shape = getShape();
    if (!shape) return;
    // If any unlocked, lock all. If all locked, unlock all.
    const allLocked = shape.every(p => p.locked);
    for (const p of shape) p.locked = !allLocked;
    lockAllBtn.textContent = allLocked ? 'Lock All' : 'Unlock All';
    drawPoints();
  });

  // Get sorted snap positions from profile control points
  function getSnapPositions() {
    const pts = profileState.dorsal || [];
    return pts.map(p => Math.round(p.t * 96)).filter(v => v >= 1);
  }

  // Snap a raw slider value to the nearest profile control point station
  function snapToNearest(raw) {
    const snaps = getSnapPositions();
    if (snaps.length === 0) return raw;
    let best = snaps[0], bestD = Math.abs(raw - snaps[0]);
    for (const s of snaps) {
      const d = Math.abs(raw - s);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  scrubEl.addEventListener('input', () => {
    const snapped = snapToNearest(+scrubEl.value);
    station = snapped;
    scrubEl.value = snapped;
    refresh();
    if (onStationChange) onStationChange(station);
  });

  // ── Coordinate transforms (normalized -1..1 → SVG) ──
  let viewSpan = 0.15; // half-range in world units (auto-updated)
  const toSX = z => MRG + ((z + viewSpan) / (2 * viewSpan)) * (VW - MRG * 2);
  const toSY = y => MRG + ((viewSpan - y) / (2 * viewSpan)) * (VH - MRG * 2);
  const fromSX = sx => (sx - MRG) / (VW - MRG * 2) * (2 * viewSpan) - viewSpan;
  const fromSY = sy => viewSpan - (sy - MRG) / (VH - MRG * 2) * (2 * viewSpan);

  function getShape() {
    return profileState.xsecKeyframes[station] || null;
  }

  function getDefaultPoly() {
    const n = (profileState.nCache && profileState.nCache[station]) ? profileState.nCache[station] : 2.2;
    return defaultXSecPoly(n);
  }

  // Get actual dimensions at current station for scaling the preview
  function getStationDims() {
    if (!profileState.dorsalCache || station < 0 || station > 96) return { dH: 1, vH: 1, hW: 1 };
    const dY = profileState.dorsalCache[station] || 0;
    const vY = profileState.ventralCache[station] || 0;
    const hW = profileState.widthCache[station] || 0;
    const cy = (dY + vY) / 2;
    return {
      dH: Math.max(dY - cy, 0.003),
      vH: Math.max(cy - vY, 0.003),
      hW: Math.max(hW, 0.002)
    };
  }

  // Convert normalized polygon to actual-proportioned SVG points
  function polyToSvgPoints(pts, dims) {
    return pts.map(p => {
      const y = p.y >= 0 ? p.y * dims.dH : p.y * dims.vH;
      const z = p.z * dims.hW;
      return `${toSX(z).toFixed(1)},${toSY(y).toFixed(1)}`;
    }).join(' ');
  }

  // Auto-fit the coordinate range to the actual station dimensions
  function fitRange() {
    const dims = getStationDims();
    const maxY = Math.max(dims.dH, dims.vH) * 1.3;
    const maxZ = dims.hW * 1.3;
    const span = Math.max(maxY, maxZ, 0.01);
    return span;
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
    const dims = getStationDims();
    isEditing = !!shape;

    // Update coordinate range to fit actual proportions
    const span = fitRange();
    // Redefine toSX/toSY based on actual range
    const rng = span;

    // Reference ellipse (always shown, dashed) — shows actual proportioned shape
    refPoly.setAttribute('points', polyToSvgPoints(defPoly, dims));

    // Active shape
    const activePts = shape || defPoly;
    shapePoly.setAttribute('points', polyToSvgPoints(activePts, dims));
    fillPoly.setAttribute('points', polyToSvgPoints(activePts, dims));

    // Label — find matching station name
    const snaps = getSnapPositions();
    const pts = profileState.dorsal || [];
    let name = `t=${(station / 96).toFixed(2)}`;
    for (let i = 0; i < pts.length; i++) {
      if (Math.round(pts[i].t * 96) === station) { name = LABELS[i] || name; break; }
    }
    labelEl.textContent = name + (isEditing ? ' *' : '');
    resetBtn.disabled = !isEditing;
    if (shape) {
      const allLocked = shape.every(p => p.locked);
      lockAllBtn.textContent = allLocked ? 'Unlock All' : 'Lock All';
    }
  }

  function drawPoints() {
    dotsG.innerHTML = '';
    // Always show points — auto-create keyframe on first drag
    const shape = getShape() || getDefaultPoly();
    const dims = getStationDims();
    shape.forEach((p, i) => {
      if (i === shape.length - 1) return; // skip duplicate closing vertex
      const y = p.y >= 0 ? p.y * dims.dH : p.y * dims.vH;
      const z = p.z * dims.hW;
      const c = svgEl('circle', {
        cx: toSX(z), cy: toSY(y), r: 3,
        class: `pe-pt dorsal${p.locked ? ' locked' : ''}`, 'data-idx': i
      });
      dotsG.appendChild(c);
    });
  }

  function refresh() {
    const dims = getStationDims();
    viewSpan = Math.max(dims.dH, dims.vH, dims.hW, 0.01) * 1.3;
    scrubEl.value = station;
    drawGrid(); draw(); drawPoints();
  }

  function setStation(i) {
    station = Math.max(1, Math.min(96, i));
    refresh();
    if (onStationChange) onStationChange(station);
  }

  // ── Reset button ──
  resetBtn.addEventListener('click', () => {
    delete profileState.xsecKeyframes[station];
    refresh();
    onEdit();
  });

  // ── Point dragging ──
  let drag = null;

  function findNearest(cx, cy) {
    const shape = getShape() || getDefaultPoly();
    const dims = getStationDims();
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width * VW;
    const sy = (cy - rect.top) / rect.height * VH;
    let best = null, bestD = PT_HIT_R;
    shape.forEach((p, i) => {
      const y = p.y >= 0 ? p.y * dims.dH : p.y * dims.vH;
      const z = p.z * dims.hW;
      const d = Math.sqrt((toSX(z) - sx) ** 2 + (toSY(y) - sy) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function startDrag(cx, cy) {
    // Auto-create keyframe on first drag if none exists
    if (!profileState.xsecKeyframes[station]) {
      profileState.xsecKeyframes[station] = getDefaultPoly();
      isEditing = true;
    }
    const idx = findNearest(cx, cy);
    if (idx === null) return false;
    const shape = getShape();
    if (shape && shape[idx] && shape[idx].locked) return false; // can't drag locked
    drag = idx;
    return true;
  }

  const BRUSH_RADIUS = 6; // how many neighbors on each side get smoothly affected

  function moveDrag(cx, cy) {
    if (drag === null) return;
    const shape = getShape();
    if (!shape) return;
    const dims = getStationDims();
    const rect = svg.getBoundingClientRect();
    const sx = (cx - rect.left) / rect.width * VW;
    const sy = (cy - rect.top) / rect.height * VH;
    const worldZ = fromSX(sx);
    const worldY = fromSY(sy);
    const newZ = dims.hW > 0.001 ? Math.max(-1.5, Math.min(1.5, worldZ / dims.hW)) : 0;
    const hRef = worldY >= 0 ? dims.dH : dims.vH;
    const newY = hRef > 0.001 ? Math.max(-1.5, Math.min(1.5, worldY / hRef)) : 0;

    // Lock top center (vertex 0) and bottom center (vertex RS/2) to vertical only
    const isTopCenter = drag === 0;
    const isBotCenter = drag === Math.round(RS / 2);
    const dz = (isTopCenter || isBotCenter) ? 0 : newZ - shape[drag].z;
    const dy = newY - shape[drag].y;

    // Apply delta with soft falloff to neighbors (wrapping around the loop)
    // Also mirror: vertex j's mirror is vertex (N-1 - j) since the polygon
    // goes 0→2PI and the mirror across Z=0 is at the opposite angular position.
    const N = shape.length - 1; // last vertex == first (closed loop), so N = RS
    function applyBrush(centerIdx, deltaY, deltaZ) {
      for (let offset = -BRUSH_RADIUS; offset <= BRUSH_RADIUS; offset++) {
        const idx = ((centerIdx + offset) % N + N) % N;
        if (shape[idx].locked) continue; // skip locked points
        const t = Math.abs(offset) / (BRUSH_RADIUS + 1);
        const w = 1 - t * t;
        shape[idx].y = Math.max(-1.5, Math.min(1.5, shape[idx].y + deltaY * w));
        shape[idx].z = Math.max(-1.5, Math.min(1.5, shape[idx].z + deltaZ * w));
      }
      shape[N] = { ...shape[0] };
    }

    // Primary side
    applyBrush(drag, dy, dz);
    // Mirror side: same Y delta, negated Z delta
    const mirrorIdx = (N - drag) % N;
    if (mirrorIdx !== drag) {
      applyBrush(mirrorIdx, dy, -dz);
    }

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

  // ── Double-click: toggle lock on nearest point ──
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    // Auto-create keyframe if needed
    if (!profileState.xsecKeyframes[station]) {
      profileState.xsecKeyframes[station] = getDefaultPoly();
    }
    const shape = getShape();
    if (!shape) return;
    const idx = findNearest(e.clientX, e.clientY);
    if (idx !== null) {
      const newLocked = !shape[idx].locked;
      shape[idx].locked = newLocked;
      // Mirror: lock the corresponding point on the other side
      const N = shape.length - 1; // last vertex == first (closed loop)
      const mirrorIdx = (N - idx) % N;
      if (mirrorIdx !== idx) shape[mirrorIdx].locked = newLocked;
      drawPoints();
    }
  });

  refresh();
  // Don't call onStationChange during init — scene may not be ready yet
  return { refresh, setStation };
}
