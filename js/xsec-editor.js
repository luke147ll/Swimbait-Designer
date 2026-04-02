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

  // ── Viewport for zoom/pan ──
  const vp = {
    vx: 0, vy: 0, vw: VW, vh: VH,
    viewBox() { return `${this.vx} ${this.vy} ${this.vw} ${this.vh}`; },
    get zoom() { return VW / this.vw; },
    applyZoom(delta, px, py, rect) {
      const f = delta > 0 ? 1.12 : 1 / 1.12;
      const nw = Math.max(VW * 0.1, Math.min(VW * 4, this.vw * f));
      const nh = Math.max(VH * 0.1, Math.min(VH * 4, this.vh * f));
      const mx = this.vx + (px / rect.width) * this.vw;
      const my = this.vy + (py / rect.height) * this.vh;
      const rx = (mx - this.vx) / this.vw, ry = (my - this.vy) / this.vh;
      this.vx = mx - rx * nw; this.vy = my - ry * nh;
      this.vw = nw; this.vh = nh;
    },
    applyPan(dx, dy, rect) {
      this.vx -= (dx / rect.width) * this.vw;
      this.vy -= (dy / rect.height) * this.vh;
    },
    reset() { this.vx = 0; this.vy = 0; this.vw = VW; this.vh = VH; }
  };

  // ── SVG setup ──
  const svg = svgEl('svg', { viewBox: vp.viewBox(), class: 'pe-svg', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.width = '100%';
  svg.style.height = `${VH}px`;

  // Dot overlay for screen-space dots
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  container.insertBefore(wrap, container.lastChild || null);

  const dotOverlay = document.createElement('div');
  dotOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden';

  const gridG = svgEl('g');
  const refPoly = svgEl('polygon', { class: 'xsec-ref' });
  const shapePoly = svgEl('polygon', { class: 'xsec-shape' });
  const fillPoly = svgEl('polygon', { class: 'xsec-fill' });
  const centerH = svgEl('line', { class: 'pe-center' });
  const centerV = svgEl('line', { class: 'pe-center' });
  const label = svgEl('text', { x: 6, y: 14, class: 'pe-zoom' });
  svg.append(gridG, fillPoly, refPoly, centerH, centerV, shapePoly, label);

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
  wrap.appendChild(svg);
  wrap.appendChild(dotOverlay);
  container.appendChild(wrap);

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

  // Screen-space helpers
  function dataToScreen(z, y) {
    const ctm = svg.getScreenCTM();
    const rect = svg.getBoundingClientRect();
    if (!ctm) return { x: 0, y: 0 };
    const sx = toSX(z), sy = toSY(y);
    return { x: ctm.a * sx + ctm.e - rect.left, y: ctm.d * sy + ctm.f - rect.top };
  }

  function screenToSvg(px, py) {
    const ctm = svg.getScreenCTM();
    const rect = svg.getBoundingClientRect();
    if (!ctm) return { x: 0, y: 0 };
    return { x: (px + rect.left - ctm.e) / ctm.a, y: (py + rect.top - ctm.f) / ctm.d };
  }

  function drawPoints() {
    dotOverlay.innerHTML = '';
    const shape = getShape() || getDefaultPoly();
    const dims = getStationDims();
    const DOT_PX = Math.min(70, Math.max(4, 5 * Math.sqrt(vp.zoom)));
    shape.forEach((p, i) => {
      if (i === shape.length - 1) return;
      const y = p.y >= 0 ? p.y * dims.dH : p.y * dims.vH;
      const z = p.z * dims.hW;
      const scr = dataToScreen(z, y);
      const dot = document.createElement('div');
      dot.className = `pe-html-dot dorsal${p.locked ? ' locked' : ''}`;
      dot.style.cssText = `position:absolute;left:${scr.x - DOT_PX/2}px;top:${scr.y - DOT_PX/2}px;width:${DOT_PX}px;height:${DOT_PX}px;pointer-events:none`;
      dotOverlay.appendChild(dot);
    });
  }

  function refresh() {
    const dims = getStationDims();
    viewSpan = Math.max(dims.dH, dims.vH, dims.hW, 0.01) * 1.3;
    scrubEl.value = station;
    svg.setAttribute('viewBox', vp.viewBox());
    drawGrid(); draw(); drawPoints();
  }

  // Reposition dots when the SVG element resizes (panel drag, window resize)
  new ResizeObserver(() => drawPoints()).observe(svg);

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

  const HIT_RADIUS = 20; // screen pixels
  function findNearest(mouseX, mouseY) {
    const shape = getShape() || getDefaultPoly();
    const dims = getStationDims();
    const rect = svg.getBoundingClientRect();
    const mx = mouseX - rect.left, my = mouseY - rect.top;
    let best = null, bestD = HIT_RADIUS;
    shape.forEach((p, i) => {
      if (i === shape.length - 1) return;
      const y = p.y >= 0 ? p.y * dims.dH : p.y * dims.vH;
      const z = p.z * dims.hW;
      const scr = dataToScreen(z, y);
      const d = Math.hypot(mx - scr.x, my - scr.y);
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

  const BRUSH_RADIUS = 6;
  let useBrush = false; // Shift key enables soft brush mode

  function moveDrag(cx, cy, shiftKey) {
    if (drag === null) return;
    const shape = getShape();
    if (!shape) return;
    useBrush = !!shiftKey;
    const dims = getStationDims();
    const rect = svg.getBoundingClientRect();
    const svgPt = screenToSvg(cx - rect.left, cy - rect.top);
    const worldZ = fromSX(svgPt.x);
    const worldY = fromSY(svgPt.y);
    const newZ = dims.hW > 0.001 ? Math.max(-1.5, Math.min(1.5, worldZ / dims.hW)) : 0;
    const hRef = worldY >= 0 ? dims.dH : dims.vH;
    const newY = hRef > 0.001 ? Math.max(-1.5, Math.min(1.5, worldY / hRef)) : 0;

    const isTopCenter = drag === 0;
    const isBotCenter = drag === Math.round(RS / 2);
    const dz = (isTopCenter || isBotCenter) ? 0 : newZ - shape[drag].z;
    const dy = newY - shape[drag].y;

    const N = shape.length - 1;

    if (useBrush) {
      // Shift held: soft brush affects neighbors
      function applyBrush(centerIdx, deltaY, deltaZ) {
        for (let offset = -BRUSH_RADIUS; offset <= BRUSH_RADIUS; offset++) {
          const idx = ((centerIdx + offset) % N + N) % N;
          if (shape[idx].locked) continue;
          const t = Math.abs(offset) / (BRUSH_RADIUS + 1);
          const w = 1 - t * t;
          shape[idx].y = Math.max(-1.5, Math.min(1.5, shape[idx].y + deltaY * w));
          shape[idx].z = Math.max(-1.5, Math.min(1.5, shape[idx].z + deltaZ * w));
        }
        shape[N] = { ...shape[0] };
      }
      applyBrush(drag, dy, dz);
      const mirrorIdx = (N - drag) % N;
      if (mirrorIdx !== drag) applyBrush(mirrorIdx, dy, -dz);
    } else {
      // Default: move only the dragged point + its mirror
      if (!shape[drag].locked) {
        shape[drag].y = newY;
        shape[drag].z = (isTopCenter || isBotCenter) ? shape[drag].z : newZ;
      }
      const mirrorIdx = (N - drag) % N;
      if (mirrorIdx !== drag && !shape[mirrorIdx].locked) {
        shape[mirrorIdx].y = newY;
        shape[mirrorIdx].z = (isTopCenter || isBotCenter) ? shape[mirrorIdx].z : -newZ;
      }
      shape[N] = { ...shape[0] };
    }

    draw(); drawPoints(); onEdit();
  }

  function endDrag() { drag = null; }

  // ── Mouse ──
  let panState = null;
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.altKey || e.button === 1) {
      panState = { lx: e.clientX, ly: e.clientY };
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (startDrag(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); }
  });
  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (panState) {
      vp.applyPan(e.clientX - panState.lx, e.clientY - panState.ly, svg.getBoundingClientRect());
      panState.lx = e.clientX; panState.ly = e.clientY;
      svg.setAttribute('viewBox', vp.viewBox());
      drawGrid(); draw(); drawPoints();
      e.stopPropagation(); return;
    }
    if (drag !== null) { moveDrag(e.clientX, e.clientY, e.shiftKey); e.stopPropagation(); }
  });
  svg.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') { panState = null; endDrag(); }
  });

  // ── Scroll to zoom ──
  svg.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    const r = svg.getBoundingClientRect();
    vp.applyZoom(e.deltaY, e.clientX - r.left, e.clientY - r.top, r);
    svg.setAttribute('viewBox', vp.viewBox());
    drawGrid(); draw(); drawPoints();
  }, { passive: false });

  // ── Touch ──
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag !== null) moveDrag(e.touches[0].clientX, e.touches[0].clientY, false);
  }, { passive: false });
  svg.addEventListener('touchend', () => endDrag());

  // ── Double-click: toggle lock on nearest point, or reset view if zoomed ──
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    // If zoomed, check if clicking on empty space to reset view
    const idx = findNearest(e.clientX, e.clientY);
    if (idx === null && Math.abs(vp.zoom - 1) > 0.05) {
      vp.reset();
      svg.setAttribute('viewBox', vp.viewBox());
      drawGrid(); draw(); drawPoints();
      return;
    }
    // Auto-create keyframe if needed
    if (!profileState.xsecKeyframes[station]) {
      profileState.xsecKeyframes[station] = getDefaultPoly();
    }
    const shape = getShape();
    if (!shape) return;
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
