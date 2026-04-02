/**
 * @file editors.js
 * SVG-based 2D profile editors with zoom/pan for dorsal/ventral and width curves.
 * Scroll to zoom (centered on mouse), Alt+drag or middle-click to pan,
 * double-click background to reset view. Drag points vertically to edit.
 */
import { sampleProfile, insertProfilePoint, removeProfilePoint, STATION_LABELS } from './splines.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SAMPLES = 150;
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const PT_HIT_R = IS_TOUCH ? 18 : 8; // larger invisible hit area on touch

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function profilePathD(profile, toX, toY) {
  let d = '';
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const v = sampleProfile(profile, t);
    d += `${i === 0 ? 'M' : 'L'}${toX(t).toFixed(1)},${toY(v).toFixed(1)} `;
  }
  return d.trim();
}

/**
 * Shared zoom/pan viewport state and coordinate helpers.
 * The SVG viewBox is dynamically updated to implement zoom/pan.
 */
function createViewport(VW, VH) {
  // View state: what portion of the "world" is visible
  return {
    // World bounds (set by data range)
    wMinX: 0, wMaxX: 1, wMinY: 0, wMaxY: 1,
    // Current view (in world coords): what the viewBox shows
    vx: 0, vy: 0, vw: VW, vh: VH,
    VW, VH,
    zoom: 1,

    resetToFit(xMin, xMax, yMin, yMax) {
      this.wMinX = xMin; this.wMaxX = xMax;
      this.wMinY = yMin; this.wMaxY = yMax;
      this.vx = 0; this.vy = 0;
      this.vw = VW; this.vh = VH;
      this.zoom = 1;
    },

    viewBox() {
      return `${this.vx} ${this.vy} ${this.vw} ${this.vh}`;
    },

    // Convert world (t, v) to SVG viewBox coords
    toSvgX(t, xMin, xMax, margin) {
      return margin + ((t - xMin) / (xMax - xMin)) * (this.VW - margin * 2);
    },
    toSvgY(v, yMin, yMax, margin) {
      return margin + ((yMax - v) / (yMax - yMin)) * (this.VH - margin * 2);
    },

    // Convert SVG pixel position to viewBox coords
    pixToVB(px, py, svgRect) {
      return {
        x: this.vx + (px / svgRect.width) * this.vw,
        y: this.vy + (py / svgRect.height) * this.vh
      };
    },

    applyZoom(delta, pivotX, pivotY, svgRect) {
      const factor = delta > 0 ? 1.12 : 1 / 1.12;
      const pivot = this.pixToVB(pivotX, pivotY, svgRect);

      const newW = Math.max(this.VW * 0.05, Math.min(this.VW * 4, this.vw * factor));
      const newH = Math.max(this.VH * 0.05, Math.min(this.VH * 4, this.vh * factor));
      const ratioX = (pivot.x - this.vx) / this.vw;
      const ratioY = (pivot.y - this.vy) / this.vh;
      this.vx = pivot.x - ratioX * newW;
      this.vy = pivot.y - ratioY * newH;
      this.vw = newW;
      this.vh = newH;
      this.zoom = this.VW / this.vw;
    },

    applyPan(dx, dy, svgRect) {
      this.vx -= (dx / svgRect.width) * this.vw;
      this.vy -= (dy / svgRect.height) * this.vh;
    }
  };
}

// ── Side Profile Editor (dorsal + ventral) ──────────────────────────

export function createSideEditor(container, state, onEdit) {
  const VW = 300, VH = 170;
  const MRG = 10;
  const vp = createViewport(VW, VH);

  function yRange() {
    let mn = 0, mx = 0;
    for (const p of state.dorsal) mx = Math.max(mx, p.v);
    for (const p of state.ventral) mn = Math.min(mn, p.v);
    const pad = Math.max((mx - mn) * 0.18, 0.01);
    return { mn: mn - pad, mx: mx + pad };
  }

  let range = yRange();
  const toX = t => vp.toSvgX(t, 0, 1, MRG);
  const toY = v => vp.toSvgY(v, range.mn, range.mx, MRG);
  const fromY = sy => range.mx - (sy - MRG) / (VH - MRG * 2) * (range.mx - range.mn);

  const svg = svgEl('svg', { viewBox: vp.viewBox(), class: 'pe-svg', preserveAspectRatio: 'none' });
  svg.style.width = '100%';
  svg.style.height = `${VH}px`;
  container.appendChild(svg);

  const gridG = svgEl('g');
  const fillPath = svgEl('path', { class: 'pe-fill' });
  const dorsalPath = svgEl('path', { class: 'pe-curve pe-dorsal' });
  const ventralPath = svgEl('path', { class: 'pe-curve pe-ventral' });
  const centerLine = svgEl('line', { class: 'pe-center' });
  const stationLine = svgEl('line', { class: 'pe-station-line' });
  const dotsG = svgEl('g');
  const zoomLabel = svgEl('text', { x: VW - 4, y: VH - 3, class: 'pe-zoom', 'text-anchor': 'end' });
  zoomLabel.textContent = '1.0x';
  svg.append(gridG, fillPath, centerLine, stationLine, dorsalPath, ventralPath, dotsG, zoomLabel);
  let stationT = -1;

  let drag = null, isDragging = false;
  let panState = null;

  function drawGrid() {
    gridG.innerHTML = '';
    for (let t = 0; t <= 1; t += 0.25) {
      gridG.appendChild(svgEl('line', { x1: toX(t), y1: MRG, x2: toX(t), y2: VH - MRG, class: 'pe-grid' }));
    }
    const step = (range.mx - range.mn) / 5;
    for (let v = range.mn; v <= range.mx + step * 0.1; v += step) {
      gridG.appendChild(svgEl('line', { x1: MRG, y1: toY(v), x2: VW - MRG, y2: toY(v), class: 'pe-grid' }));
    }
  }

  function drawCurves() {
    dorsalPath.setAttribute('d', profilePathD(state.dorsal, toX, toY));
    ventralPath.setAttribute('d', profilePathD(state.ventral, toX, toY));
    let fd = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      fd += `${i === 0 ? 'M' : 'L'}${toX(t).toFixed(1)},${toY(sampleProfile(state.dorsal, t)).toFixed(1)} `;
    }
    for (let i = SAMPLES; i >= 0; i--) {
      const t = i / SAMPLES;
      fd += `L${toX(t).toFixed(1)},${toY(sampleProfile(state.ventral, t)).toFixed(1)} `;
    }
    fillPath.setAttribute('d', fd + 'Z');
    centerLine.setAttribute('x1', MRG);
    centerLine.setAttribute('y1', toY(0));
    centerLine.setAttribute('x2', VW - MRG);
    centerLine.setAttribute('y2', toY(0));
  }

  function drawPoints() {
    dotsG.innerHTML = '';
    const ptR = 4.5 * (vp.vw / vp.VW); // visual radius
    const hitR = Math.max(ptR, 10 * (vp.vw / vp.VW)); // larger hit target
    function addPts(profile, cls) {
      profile.forEach((p, i) => {
        const cx = toX(p.t), cy = toY(p.v);
        // Invisible hit target (larger)
        dotsG.appendChild(svgEl('circle', {
          cx, cy, r: hitR, fill: 'transparent', class: `pe-pt ${cls}${p.locked ? ' locked' : ''}`,
          'data-cls': cls, 'data-idx': i, style: 'pointer-events:all'
        }));
        // Visible dot (smaller, no pointer events)
        dotsG.appendChild(svgEl('circle', {
          cx, cy, r: ptR, class: `pe-dot ${cls}${p.locked ? ' locked' : ''}`,
          style: 'pointer-events:none'
        }));
      });
    }
    addPts(state.dorsal, 'dorsal');
    addPts(state.ventral, 'ventral');
  }

  // Station line + xsec indicators on the side profile
  const stationDotsG = svgEl('g');
  svg.appendChild(stationDotsG);

  function drawStationLine() {
    stationDotsG.innerHTML = '';
    if (stationT < 0) { stationLine.setAttribute('visibility', 'hidden'); return; }
    stationLine.setAttribute('visibility', 'visible');
    const sx = toX(stationT);
    stationLine.setAttribute('x1', sx); stationLine.setAttribute('x2', sx);
    stationLine.setAttribute('y1', MRG); stationLine.setAttribute('y2', VH - MRG);

    // Show xsec keyframe indicators: top/bottom ticks on the station line
    const stationIdx = Math.round(stationT * 96);
    const kf = state.xsecKeyframes && state.xsecKeyframes[stationIdx];
    if (kf && kf.length > 0) {
      // Find actual top/bottom of the keyframe polygon
      const dY = sampleProfile(state.dorsal, stationT);
      const vY = sampleProfile(state.ventral, stationT);
      const cy = (dY + vY) / 2;
      const dH = dY - cy, vH = cy - vY;
      let topY = -Infinity, botY = Infinity;
      for (const p of kf) {
        const y = p.y >= 0 ? p.y * dH + cy : p.y * vH + cy;
        topY = Math.max(topY, y);
        botY = Math.min(botY, y);
      }
      // Draw diamond markers at top and bottom
      const r = 3 * (vp.vw / vp.VW);
      for (const yVal of [topY, botY]) {
        const sy = toY(yVal);
        stationDotsG.appendChild(svgEl('circle', {
          cx: sx, cy: sy, r, class: 'pe-station-dot'
        }));
      }
    }
  }

  function redraw() {
    svg.setAttribute('viewBox', vp.viewBox());
    zoomLabel.textContent = vp.zoom.toFixed(1) + 'x';
    zoomLabel.setAttribute('x', vp.vx + vp.vw - 4);
    zoomLabel.setAttribute('y', vp.vy + vp.vh - 3);
    drawGrid();
    drawCurves();
    drawPoints();
    drawStationLine();
  }

  function refresh() {
    if (!isDragging) range = yRange();
    redraw();
  }

  // Coordinate helpers for events
  function evtLocalPx(e) {
    const r = svg.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top, rect: r };
  }
  function evtToVB(e) {
    const { px, py, rect } = evtLocalPx(e);
    return vp.pixToVB(px, py, rect);
  }

  // ── Find control point from the actual SVG element under the pointer ──
  function findNearestPt(clientX, clientY) {
    // Use elementFromPoint to find which dot the pointer is over/near
    const el = document.elementFromPoint(clientX, clientY);
    if (el && el.classList.contains('pe-pt')) {
      const cls = el.dataset.cls;
      const idx = +el.dataset.idx;
      return { cls, idx, profile: cls === 'dorsal' ? state.dorsal : state.ventral };
    }
    // Fallback: check nearby elements by expanding search area
    const offsets = [[-6,0],[6,0],[0,-6],[0,6],[-4,-4],[4,-4],[-4,4],[4,4]];
    for (const [ox, oy] of offsets) {
      const el2 = document.elementFromPoint(clientX + ox, clientY + oy);
      if (el2 && el2.classList.contains('pe-pt')) {
        const cls = el2.dataset.cls;
        const idx = +el2.dataset.idx;
        return { cls, idx, profile: cls === 'dorsal' ? state.dorsal : state.ventral };
      }
    }
    return null;
  }

  function startDrag(clientX, clientY, e) {
    const hit = findNearestPt(clientX, clientY);
    if (!hit) return false;
    drag = hit;
    isDragging = true;
    if (e && e.pointerId != null) {
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    }
    return true;
  }

  function clientToSvg(cx, cy) {
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
  }

  function moveDrag(clientX, clientY, shiftKey) {
    if (!drag) return;
    if (drag.profile[drag.idx].locked) return;
    const svgPt = clientToSvg(clientX, clientY);
    drag.profile[drag.idx].v = range.mx - (svgPt.y - MRG) / (VH - MRG * 2) * (range.mx - range.mn);
    if (shiftKey) {
      const newT = (svgPt.x - MRG) / (VW - MRG * 2);
      const prev = drag.idx > 0 ? drag.profile[drag.idx - 1].t + 0.002 : 0;
      const next = drag.idx < drag.profile.length - 1 ? drag.profile[drag.idx + 1].t - 0.002 : 1;
      drag.profile[drag.idx].t = Math.max(prev, Math.min(next, newT));
    }
    drawCurves();
    drawPoints();
    onEdit();
  }

  function endDrag() {
    drag = null;
    isDragging = false;
    range = yRange();
  }

  // ── Pointer events (mouse + stylus) ──
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return; // handled by touch events
    if (e.altKey || e.button === 1) {
      panState = { lastX: e.clientX, lastY: e.clientY };
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (startDrag(e.clientX, e.clientY, e)) { e.preventDefault(); e.stopPropagation(); }
  });

  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (panState) {
      vp.applyPan(e.clientX - panState.lastX, e.clientY - panState.lastY, svg.getBoundingClientRect());
      panState.lastX = e.clientX; panState.lastY = e.clientY;
      redraw(); e.stopPropagation(); return;
    }
    if (drag) { moveDrag(e.clientX, e.clientY, e.shiftKey); e.stopPropagation(); }
  });

  svg.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (panState) { panState = null; return; }
    endDrag();
  });

  // ── Touch: 1 finger = drag point, 2 fingers = pan + pinch zoom ──
  let touchPinchDist = 0, touchPanStart = null;
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY, null);
    } else if (e.touches.length === 2) {
      endDrag();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchPinchDist = Math.sqrt(dx * dx + dy * dy);
      touchPanStart = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) {
      moveDrag(e.touches[0].clientX, e.touches[0].clientY, false);
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      // Pinch zoom
      if (touchPinchDist > 0) {
        const rect = svg.getBoundingClientRect();
        vp.applyZoom(touchPinchDist - dist, cx - rect.left, cy2 - rect.top, rect);
        touchPinchDist = dist;
      }
      // Two-finger pan
      if (touchPanStart) {
        vp.applyPan(cx - touchPanStart.x, cy2 - touchPanStart.y, svg.getBoundingClientRect());
        touchPanStart = { x: cx, y: cy2 };
      }
      redraw();
    }
  }, { passive: false });

  svg.addEventListener('touchend', e => {
    if (e.touches.length === 0) { endDrag(); touchPanStart = null; }
    if (e.touches.length < 2) { touchPinchDist = 0; touchPanStart = null; }
  });

  // ── Zoom ──
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    const { px, py, rect } = evtLocalPx(e);
    vp.applyZoom(e.deltaY, px, py, rect);
    redraw();
  }, { passive: false });

  // ── Double-click: toggle lock on point, add point, or reset view ──
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    // Check if double-clicking on an existing point — toggle lock
    const hit = findNearestPt(e.clientX, e.clientY);
    if (hit) {
      hit.profile[hit.idx].locked = !hit.profile[hit.idx].locked;
      drawPoints();
      return;
    }
    if (e.target === svg || e.target.classList.contains('pe-grid') || e.target === fillPath || e.target === dorsalPath || e.target === ventralPath || e.target === centerLine) {
      if (Math.abs(vp.zoom - 1) > 0.05) {
        vp.vx = 0; vp.vy = 0; vp.vw = VW; vp.vh = VH; vp.zoom = 1;
        redraw();
        return;
      }
      const pt = evtToVB(e);
      const t = Math.max(0.005, Math.min(0.93, (pt.x - MRG) / (VW - MRG * 2)));
      const dV = sampleProfile(state.dorsal, t);
      const vV = sampleProfile(state.ventral, t);
      const midV = (dV + vV) / 2;
      const clickV = range.mx - (pt.y - MRG) / (VH - MRG * 2) * (range.mx - range.mn);
      const profile = clickV > midV ? state.dorsal : state.ventral;
      insertProfilePoint(profile, t);
      refresh();
      onEdit();
    }
  });

  // ── Right-click delete ──
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    const tgt = e.target;
    if (!tgt.classList.contains('pe-pt') || tgt.classList.contains('locked')) return;
    const cls = tgt.dataset.cls;
    const idx = +tgt.dataset.idx;
    const profile = cls === 'dorsal' ? state.dorsal : state.ventral;
    if (removeProfilePoint(profile, idx)) { refresh(); onEdit(); }
  });

  refresh();
  return {
    refresh,
    setStationMarker(t) { stationT = t; redraw(); }
  };
}

// ── Width Profile Editor (top-down, mirrored) ───────────────────────

export function createWidthEditor(container, state, onEdit) {
  const VW = 300, VH = 110;
  const MRG = 10;
  const vp = createViewport(VW, VH);

  function wMax() {
    let mx = 0;
    for (const p of state.width) mx = Math.max(mx, p.v);
    return Math.max(mx * 1.3, 0.01);
  }

  let wr = wMax();
  const toX = t => vp.toSvgX(t, 0, 1, MRG);
  const toYUp = v => VH / 2 - (v / wr) * ((VH - MRG * 2) / 2);
  const toYDn = v => VH / 2 + (v / wr) * ((VH - MRG * 2) / 2);
  const fromYUp = sy => (VH / 2 - sy) / ((VH - MRG * 2) / 2) * wr;

  const svg = svgEl('svg', { viewBox: vp.viewBox(), class: 'pe-svg', preserveAspectRatio: 'none' });
  svg.style.width = '100%';
  svg.style.height = `${VH}px`;
  container.appendChild(svg);

  const gridG = svgEl('g');
  const fillPath = svgEl('path', { class: 'pe-fill pe-wfill' });
  const upperPath = svgEl('path', { class: 'pe-curve pe-width' });
  const lowerPath = svgEl('path', { class: 'pe-curve pe-width pe-mirror' });
  const centerLine = svgEl('line', {
    x1: MRG, y1: VH / 2, x2: VW - MRG, y2: VH / 2, class: 'pe-center'
  });
  const stationLine = svgEl('line', { class: 'pe-station-line' });
  let stationT = -1;
  const dotsG = svgEl('g');
  const zoomLabel = svgEl('text', { x: VW - 4, y: VH - 3, class: 'pe-zoom', 'text-anchor': 'end' });
  zoomLabel.textContent = '1.0x';
  svg.append(gridG, fillPath, centerLine, stationLine, upperPath, lowerPath, dotsG, zoomLabel);

  let drag = null, isDragging = false;
  let panState = null;

  function drawGrid() {
    gridG.innerHTML = '';
    for (let t = 0; t <= 1; t += 0.25) {
      gridG.appendChild(svgEl('line', { x1: toX(t), y1: MRG, x2: toX(t), y2: VH - MRG, class: 'pe-grid' }));
    }
  }

  function drawCurves() {
    upperPath.setAttribute('d', profilePathD(state.width, toX, toYUp));
    lowerPath.setAttribute('d', profilePathD(state.width, toX, toYDn));
    let fd = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES, v = sampleProfile(state.width, t);
      fd += `${i === 0 ? 'M' : 'L'}${toX(t).toFixed(1)},${toYUp(v).toFixed(1)} `;
    }
    for (let i = SAMPLES; i >= 0; i--) {
      const t = i / SAMPLES, v = sampleProfile(state.width, t);
      fd += `L${toX(t).toFixed(1)},${toYDn(v).toFixed(1)} `;
    }
    fillPath.setAttribute('d', fd + 'Z');
  }

  function drawPoints() {
    dotsG.innerHTML = '';
    const ptR = 4.5 * (vp.vw / vp.VW);
    const hitR = Math.max(ptR, 10 * (vp.vw / vp.VW));
    state.width.forEach((p, i) => {
      const cx = toX(p.t), cy = toYUp(p.v);
      // Hit target (larger, invisible)
      dotsG.appendChild(svgEl('circle', {
        cx, cy, r: hitR, fill: 'transparent', class: `pe-pt width${p.locked ? ' locked' : ''}`,
        'data-idx': i, style: 'pointer-events:all'
      }));
      // Visual dot (smaller, no pointer events)
      dotsG.appendChild(svgEl('circle', {
        cx, cy, r: ptR, class: `pe-dot width${p.locked ? ' locked' : ''}`,
        style: 'pointer-events:none'
      }));
    });
  }

  const stationDotsG = svgEl('g');
  svg.appendChild(stationDotsG);

  function drawStationLine() {
    stationDotsG.innerHTML = '';
    if (stationT < 0) { stationLine.setAttribute('visibility', 'hidden'); return; }
    stationLine.setAttribute('visibility', 'visible');
    const sx = toX(stationT);
    stationLine.setAttribute('x1', sx); stationLine.setAttribute('x2', sx);
    stationLine.setAttribute('y1', MRG); stationLine.setAttribute('y2', VH - MRG);

    // Show xsec keyframe width indicator
    const stationIdx = Math.round(stationT * 96);
    const kf = state.xsecKeyframes && state.xsecKeyframes[stationIdx];
    if (kf && kf.length > 0) {
      const hW = sampleProfile(state.width, stationT);
      let maxZ = 0;
      for (const p of kf) maxZ = Math.max(maxZ, Math.abs(p.z) * hW);
      const r = 3 * (vp.vw / vp.VW);
      stationDotsG.appendChild(svgEl('circle', { cx: sx, cy: toYUp(maxZ), r, class: 'pe-station-dot' }));
      stationDotsG.appendChild(svgEl('circle', { cx: sx, cy: toYDn(maxZ), r, class: 'pe-station-dot' }));
    }
  }

  function redraw() {
    svg.setAttribute('viewBox', vp.viewBox());
    zoomLabel.textContent = vp.zoom.toFixed(1) + 'x';
    zoomLabel.setAttribute('x', vp.vx + vp.vw - 4);
    zoomLabel.setAttribute('y', vp.vy + vp.vh - 3);
    drawGrid();
    drawCurves();
    drawPoints();
    drawStationLine();
  }

  function refresh() {
    if (!isDragging) wr = wMax();
    redraw();
  }

  function evtLocalPx(e) {
    const r = svg.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top, rect: r };
  }
  function evtToVB(e) {
    const { px, py, rect } = evtLocalPx(e);
    return vp.pixToVB(px, py, rect);
  }

  // ── Find width control point from element under pointer ──
  function findNearestPt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (el && el.classList.contains('pe-pt')) return { idx: +el.dataset.idx };
    const offsets = [[-6,0],[6,0],[0,-6],[0,6],[-4,-4],[4,-4],[-4,4],[4,4]];
    for (const [ox, oy] of offsets) {
      const el2 = document.elementFromPoint(clientX + ox, clientY + oy);
      if (el2 && el2.classList.contains('pe-pt')) return { idx: +el2.dataset.idx };
    }
    return null;
  }

  function startDrag(clientX, clientY, e) {
    const hit = findNearestPt(clientX, clientY);
    if (!hit) return false;
    drag = hit;
    isDragging = true;
    if (e && e.pointerId != null) {
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    }
    return true;
  }

  function clientToSvg(cx, cy) {
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
  }

  function moveDrag(clientX, clientY, shiftKey) {
    if (!drag) return;
    if (state.width[drag.idx].locked) return;
    const svgPt = clientToSvg(clientX, clientY);
    state.width[drag.idx].v = Math.max(0, (VH / 2 - svgPt.y) / ((VH - MRG * 2) / 2) * wr);
    if (shiftKey) {
      const newT = (svgPt.x - MRG) / (VW - MRG * 2);
      const prev = drag.idx > 0 ? state.width[drag.idx - 1].t + 0.002 : 0;
      const next = drag.idx < state.width.length - 1 ? state.width[drag.idx + 1].t - 0.002 : 1;
      state.width[drag.idx].t = Math.max(prev, Math.min(next, newT));
    }
    drawCurves();
    drawPoints();
    onEdit();
  }

  function endDrag() {
    drag = null;
    isDragging = false;
    wr = wMax();
  }

  // ── Pointer events (mouse) ──
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.altKey || e.button === 1) {
      panState = { lastX: e.clientX, lastY: e.clientY };
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (startDrag(e.clientX, e.clientY, e)) { e.preventDefault(); e.stopPropagation(); }
  });

  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (panState) {
      vp.applyPan(e.clientX - panState.lastX, e.clientY - panState.lastY, svg.getBoundingClientRect());
      panState.lastX = e.clientX; panState.lastY = e.clientY;
      redraw(); e.stopPropagation(); return;
    }
    if (drag) { moveDrag(e.clientX, e.clientY, e.shiftKey); e.stopPropagation(); }
  });

  svg.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (panState) { panState = null; return; }
    endDrag();
  });

  // ── Touch: 1 finger = drag point, 2 fingers = pan + pinch zoom ──
  let touchPinchDist = 0, touchPanStart = null;
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY, null);
    } else if (e.touches.length === 2) {
      endDrag();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchPinchDist = Math.sqrt(dx * dx + dy * dy);
      touchPanStart = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) {
      moveDrag(e.touches[0].clientX, e.touches[0].clientY, false);
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (touchPinchDist > 0) {
        const rect = svg.getBoundingClientRect();
        vp.applyZoom(touchPinchDist - dist, cx - rect.left, cy2 - rect.top, rect);
        touchPinchDist = dist;
      }
      if (touchPanStart) {
        vp.applyPan(cx - touchPanStart.x, cy2 - touchPanStart.y, svg.getBoundingClientRect());
        touchPanStart = { x: cx, y: cy2 };
      }
      redraw();
    }
  }, { passive: false });

  svg.addEventListener('touchend', e => {
    if (e.touches.length === 0) { endDrag(); touchPanStart = null; }
    if (e.touches.length < 2) { touchPinchDist = 0; touchPanStart = null; }
  });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    const { px, py, rect } = evtLocalPx(e);
    vp.applyZoom(e.deltaY, px, py, rect);
    redraw();
  }, { passive: false });

  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    // Check if double-clicking on a point — toggle lock
    const hit = findNearestPt(e.clientX, e.clientY);
    if (hit) {
      state.width[hit.idx].locked = !state.width[hit.idx].locked;
      drawPoints();
      return;
    }
    if (Math.abs(vp.zoom - 1) > 0.05) {
      vp.vx = 0; vp.vy = 0; vp.vw = VW; vp.vh = VH; vp.zoom = 1;
      redraw();
      return;
    }
    const pt = evtToVB(e);
    const t = Math.max(0.005, Math.min(0.93, (pt.x - MRG) / (VW - MRG * 2)));
    insertProfilePoint(state.width, t);
    refresh();
    onEdit();
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    const tgt = e.target;
    if (!tgt.classList.contains('pe-pt') || tgt.classList.contains('locked')) return;
    if (removeProfilePoint(state.width, +tgt.dataset.idx)) { refresh(); onEdit(); }
  });

  refresh();
  return {
    refresh,
    setStationMarker(t) { stationT = t; redraw(); }
  };
}
