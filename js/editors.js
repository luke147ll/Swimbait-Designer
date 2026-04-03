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

    applyZoom(delta, pivotX, pivotY, svgRect, svgEl) {
      const factor = delta > 0 ? 1.12 : 1 / 1.12;
      const ctm = svgEl && svgEl.getScreenCTM();
      const pivot = ctm
        ? { x: (pivotX + svgRect.left - ctm.e) / ctm.a, y: (pivotY + svgRect.top - ctm.f) / ctm.d }
        : this.pixToVB(pivotX, pivotY, svgRect);
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

    applyPinch(ratio, pivotX, pivotY, svgRect, svgEl) {
      const factor = 1 / ratio;
      // Use getScreenCTM for accurate pivot (handles preserveAspectRatio)
      const ctm = svgEl.getScreenCTM();
      const pivot = ctm
        ? { x: (pivotX + svgRect.left - ctm.e) / ctm.a, y: (pivotY + svgRect.top - ctm.f) / ctm.d }
        : this.pixToVB(pivotX, pivotY, svgRect);
      const newW = Math.max(this.VW * 0.05, Math.min(this.VW * 4, this.vw * factor));
      const newH = Math.max(this.VH * 0.05, Math.min(this.VH * 4, this.vh * factor));
      const rx = (pivot.x - this.vx) / this.vw;
      const ry = (pivot.y - this.vy) / this.vh;
      this.vx = pivot.x - rx * newW;
      this.vy = pivot.y - ry * newH;
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

  // Wrapper for SVG + dot overlay
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;margin-bottom:0';
  container.appendChild(wrap);

  const svg = svgEl('svg', { viewBox: vp.viewBox(), class: 'pe-svg', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = `width:100%;height:${VH}px;display:block`;
  wrap.appendChild(svg);

  const dotOverlay = document.createElement('div');

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'pe-resize-handle';
  resizeHandle.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = parseInt(svg.style.height) || VH;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const onMove = ev => {
      const newH = Math.max(80, startH + (ev.clientY - startY));
      svg.style.height = newH + 'px';
      drawPoints();
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
  wrap.after(resizeHandle);
  dotOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden';
  wrap.appendChild(dotOverlay);

  const gridG = svgEl('g');
  const fillPath = svgEl('path', { class: 'pe-fill' });
  const dorsalPath = svgEl('path', { class: 'pe-curve pe-dorsal' });
  const ventralPath = svgEl('path', { class: 'pe-curve pe-ventral' });
  const centerLine = svgEl('line', { class: 'pe-center' });
  const stationLine = svgEl('line', { class: 'pe-station-line' });
  svg.append(gridG, fillPath, centerLine, stationLine, dorsalPath, ventralPath);
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
    dotOverlay.innerHTML = '';
    const DOT_PX = Math.min(70, Math.max(4, 5 * Math.sqrt(vp.zoom))); // fixed pixel size
    function addPts(profile, cls) {
      profile.forEach((p, i) => {
        const scr = dataToScreen(p.t, p.v);
        const dot = document.createElement('div');
        dot.className = `pe-html-dot ${cls}`;
        dot.style.cssText = `position:absolute;left:${scr.x - DOT_PX/2}px;top:${scr.y - DOT_PX/2}px;width:${DOT_PX}px;height:${DOT_PX}px;pointer-events:none`;
        dotOverlay.appendChild(dot);
      });
    }
    addPts(state.dorsal, 'dorsal');
    addPts(state.ventral, 'ventral');

    // Xsec keyframe markers — small ticks on the centerline for each edited station
    if (state.xsecKeyframes) {
      const KF_H = DOT_PX * 1.2;
      for (const key of Object.keys(state.xsecKeyframes)) {
        const kfT = +key / 96;
        const scr = dataToScreen(kfT, 0);
        const dorsalScr = dataToScreen(kfT, sampleProfile(state.dorsal, kfT));
        const ventralScr = dataToScreen(kfT, sampleProfile(state.ventral, kfT));
        // Vertical tick line spanning the body at this station
        const tick = document.createElement('div');
        tick.className = 'pe-xsec-tick';
        tick.style.cssText = `position:absolute;left:${scr.x - 1}px;top:${dorsalScr.y}px;width:2px;height:${ventralScr.y - dorsalScr.y}px;pointer-events:none`;
        tick.title = `Xsec keyframe at t=${kfT.toFixed(2)}`;
        dotOverlay.appendChild(tick);
      }
    }

    // Eye marker — positioned at actual eye height (30% down from dorsal toward ventral)
    if (eyeT > 0) {
      const dorsalV = sampleProfile(state.dorsal, eyeT);
      const ventralV = sampleProfile(state.ventral, eyeT);
      const eyeBaseV = dorsalV * 0.7 + ventralV * 0.3; // 30% down from dorsal
      const scr = dataToScreen(eyeT, eyeBaseV + eyeV);
      const dot = document.createElement('div');
      dot.className = 'pe-html-dot eye';
      const eyeR = DOT_PX * 1.4;
      dot.style.cssText = `position:absolute;left:${scr.x - eyeR/2}px;top:${scr.y - eyeR/2}px;width:${eyeR}px;height:${eyeR}px;pointer-events:none`;
      dotOverlay.appendChild(dot);
    }
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

  let eyeT = 0.08, eyeV = 0;

  function redraw() {
    svg.setAttribute('viewBox', vp.viewBox());
    drawGrid();
    drawCurves();
    drawPoints();
    drawStationLine();
  }

  function refresh() {
    if (!isDragging) range = yRange();
    redraw();
  }

  new ResizeObserver(() => drawPoints()).observe(svg);

  // ── Screen-space hit detection ──────────────────────────────────────
  // Convert a data point (t, v) to screen pixels relative to the SVG element
  function dataToScreen(t, v) {
    const rect = svg.getBoundingClientRect();
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    // toX/toY give SVG user coords; CTM maps those to screen
    const sx = toX(t), sy = toY(v);
    return { x: ctm.a * sx + ctm.e - rect.left, y: ctm.d * sy + ctm.f - rect.top };
  }

  // Convert screen pixels (relative to SVG element) back to data values
  function screenToData(px, py) {
    const rect = svg.getBoundingClientRect();
    const ctm = svg.getScreenCTM();
    if (!ctm) return { t: 0, v: 0 };
    const svgX = (px + rect.left - ctm.e) / ctm.a;
    const svgY = (py + rect.top - ctm.f) / ctm.d;
    const t = (svgX - MRG) / (VW - MRG * 2);
    const v = range.mx - (svgY - MRG) / (VH - MRG * 2) * (range.mx - range.mn);
    return { t, v };
  }

  // Find the closest point across dorsal + ventral in SCREEN PIXELS
  const HIT_RADIUS = IS_TOUCH ? 12 : 20; // fixed pixels, constant regardless of zoom
  function findNearestPt(mouseX, mouseY) {
    let best = null;
    function check(profile, cls) {
      profile.forEach((p, i) => {
        const s = dataToScreen(p.t, p.v);
        const d = Math.hypot(mouseX - s.x, mouseY - s.y);
        if (d < HIT_RADIUS && (!best || d < best.dist)) {
          best = { cls, idx: i, profile: cls === 'dorsal' ? state.dorsal : state.ventral, dist: d };
        }
      });
    }
    check(state.dorsal, 'dorsal');
    check(state.ventral, 'ventral');
    // Also check eye marker
    if (eyeT > 0) {
      const dorsalV = sampleProfile(state.dorsal, eyeT);
      const ventralV = sampleProfile(state.ventral, eyeT);
      const eyeBaseV = dorsalV * 0.7 + ventralV * 0.3;
      const s = dataToScreen(eyeT, eyeBaseV + eyeV);
      const d = Math.hypot(mouseX - s.x, mouseY - s.y);
      if (d < HIT_RADIUS && (!best || d < best.dist)) {
        best = { cls: 'eye', idx: -1, profile: null, dist: d };
      }
    }
    return best;
  }

  function startDrag(mouseX, mouseY) {
    const hit = findNearestPt(mouseX, mouseY);
    if (!hit) return false;
    if (hit.cls === 'eye') { drag = hit; isDragging = true; return true; }
    drag = hit;
    isDragging = true;
    return true;
  }

  function moveDrag(mouseX, mouseY, shiftKey) {
    if (!drag) return;
    if (drag.cls === 'eye') {
      const data = screenToData(mouseX, mouseY);
      eyeT = Math.max(0.02, Math.min(0.25, data.t));
      // Vertical offset from the eye baseline (30% down from dorsal)
      const dorsalV = sampleProfile(state.dorsal, eyeT);
      const ventralV = sampleProfile(state.ventral, eyeT);
      const eyeBaseV = dorsalV * 0.7 + ventralV * 0.3;
      eyeV = data.v - eyeBaseV;
      // Update slider
      const epSlider = document.getElementById('sEP');
      if (epSlider) epSlider.value = eyeT;
      const epLabel = document.getElementById('vEP');
      if (epLabel) epLabel.textContent = (eyeT * 100).toFixed(0) + '%';
      onEdit();
      return;
    }
    const data = screenToData(mouseX, mouseY);
    drag.profile[drag.idx].v = data.v;
    // Always allow horizontal movement (clamped between neighbors)
    const prev = drag.idx > 0 ? drag.profile[drag.idx - 1].t + 0.002 : 0;
    const next = drag.idx < drag.profile.length - 1 ? drag.profile[drag.idx + 1].t - 0.002 : 1;
    drag.profile[drag.idx].t = Math.max(prev, Math.min(next, data.t));
    drawCurves();
    drawPoints();
    onEdit();
  }

  function endDrag() {
    drag = null;
    isDragging = false;
    range = yRange();
  }

  // Helper: get mouse position relative to SVG element
  function localXY(e) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ── Pointer events (mouse + stylus) ──
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.altKey || e.button === 1) {
      panState = { lastX: e.clientX, lastY: e.clientY };
      e.preventDefault(); e.stopPropagation();
      return;
    }
    const m = localXY(e);
    if (startDrag(m.x, m.y)) { e.preventDefault(); e.stopPropagation(); }
  });

  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (panState) {
      vp.applyPan(e.clientX - panState.lastX, e.clientY - panState.lastY, svg.getBoundingClientRect());
      panState.lastX = e.clientX; panState.lastY = e.clientY;
      redraw(); e.stopPropagation(); return;
    }
    if (drag) { const m = localXY(e); moveDrag(m.x, m.y, e.shiftKey); e.stopPropagation(); }
  });

  svg.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (panState) { panState = null; return; }
    endDrag();
  });

  // ── Touch: hit point = drag, miss = pan, 2-finger = pinch zoom ──
  let touchPan = null, pinchDist = 0;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      endDrag(); touchPan = null;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (!startDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top)) {
        touchPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinchDist > 0) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = svg.getBoundingClientRect();
      vp.applyPinch(dist / pinchDist, cx - rect.left, cy2 - rect.top, rect, svg);
      pinchDist = dist;
      redraw();
    } else if (e.touches.length === 1) {
      e.preventDefault();
      if (drag) {
        const r = svg.getBoundingClientRect();
        moveDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top, false);
      } else if (touchPan) {
        vp.applyPan(e.touches[0].clientX - touchPan.x, e.touches[0].clientY - touchPan.y, svg.getBoundingClientRect());
        touchPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        redraw();
      }
    }
  }, { passive: false });

  svg.addEventListener('touchend', e => {
    endDrag(); touchPan = null;
    if (e.touches.length < 2) pinchDist = 0;
  });

  // ── Zoom (desktop scroll wheel) ──
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    const r = svg.getBoundingClientRect();
    vp.applyZoom(e.deltaY, e.clientX - r.left, e.clientY - r.top, r, svg);
    redraw();
  }, { passive: false });

  // ── Double-click: always add a point ──
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    const m = localXY(e);
    const data = screenToData(m.x, m.y);
    const t = Math.max(0.005, Math.min(0.995, data.t));
    const dV = sampleProfile(state.dorsal, t);
    const vV = sampleProfile(state.ventral, t);
    const midV = (dV + vV) / 2;
    const profile = data.v > midV ? state.dorsal : state.ventral;
    insertProfilePoint(profile, t);
    refresh();
    onEdit();
  });

  // ── Right-click delete ──
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    const tgt = e.target;
    if (!tgt.classList.contains('pe-pt') ) return;
    const cls = tgt.dataset.cls;
    const idx = +tgt.dataset.idx;
    const profile = cls === 'dorsal' ? state.dorsal : state.ventral;
    if (removeProfilePoint(profile, idx)) { refresh(); onEdit(); }
  });

  refresh();
  return {
    refresh,
    setStationMarker(t) { stationT = t; redraw(); },
    setEyePosition(t, v) { eyeT = t; if (v !== undefined) eyeV = v; drawPoints(); },
    getEyePosition() { return { t: eyeT, v: eyeV }; }
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

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;margin-bottom:0';
  container.appendChild(wrap);

  const svg = svgEl('svg', { viewBox: vp.viewBox(), class: 'pe-svg', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = `width:100%;height:${VH}px;display:block`;
  wrap.appendChild(svg);

  const dotOverlay = document.createElement('div');
  dotOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden';
  wrap.appendChild(dotOverlay);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'pe-resize-handle';
  resizeHandle.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = parseInt(svg.style.height) || VH;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const onMove = ev => {
      const newH = Math.max(60, startH + (ev.clientY - startY));
      svg.style.height = newH + 'px';
      drawPoints();
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
  wrap.after(resizeHandle);

  const gridG = svgEl('g');
  const fillPath = svgEl('path', { class: 'pe-fill pe-wfill' });
  const upperPath = svgEl('path', { class: 'pe-curve pe-width' });
  const lowerPath = svgEl('path', { class: 'pe-curve pe-width pe-mirror' });
  const centerLine = svgEl('line', {
    x1: MRG, y1: VH / 2, x2: VW - MRG, y2: VH / 2, class: 'pe-center'
  });
  const stationLine = svgEl('line', { class: 'pe-station-line' });
  let stationT = -1;
  svg.append(gridG, fillPath, centerLine, stationLine, upperPath, lowerPath);

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
    dotOverlay.innerHTML = '';
    const DOT_PX = Math.min(70, Math.max(4, 5 * Math.sqrt(vp.zoom)));
    state.width.forEach((p, i) => {
      const scr = dataToScreen(p.t, p.v);
      const dot = document.createElement('div');
      dot.className = `pe-html-dot width`;
      dot.style.cssText = `position:absolute;left:${scr.x - DOT_PX/2}px;top:${scr.y - DOT_PX/2}px;width:${DOT_PX}px;height:${DOT_PX}px;pointer-events:none`;
      dotOverlay.appendChild(dot);
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
    drawGrid();
    drawCurves();
    drawPoints();
    drawStationLine();
  }

  function refresh() {
    if (!isDragging) wr = wMax();
    redraw();
  }

  new ResizeObserver(() => drawPoints()).observe(svg);

  // ── Screen-space hit detection for width editor ──
  function dataToScreen(t, v) {
    const rect = svg.getBoundingClientRect();
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const sx = toX(t), sy = toYUp(v);
    return { x: ctm.a * sx + ctm.e - rect.left, y: ctm.d * sy + ctm.f - rect.top };
  }

  function screenToData(px, py) {
    const rect = svg.getBoundingClientRect();
    const ctm = svg.getScreenCTM();
    if (!ctm) return { t: 0, v: 0 };
    const svgX = (px + rect.left - ctm.e) / ctm.a;
    const svgY = (py + rect.top - ctm.f) / ctm.d;
    const t = (svgX - MRG) / (VW - MRG * 2);
    const v = Math.max(0, (VH / 2 - svgY) / ((VH - MRG * 2) / 2) * wr);
    return { t, v };
  }

  function localXY(e) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const HIT_RADIUS = IS_TOUCH ? 12 : 20;
  function findNearestPt(mouseX, mouseY) {
    let best = null;
    state.width.forEach((p, i) => {
      const s = dataToScreen(p.t, p.v);
      const d = Math.hypot(mouseX - s.x, mouseY - s.y);
      if (d < HIT_RADIUS && (!best || d < best.dist)) {
        best = { idx: i, dist: d };
      }
    });
    return best;
  }

  function startDrag(mouseX, mouseY) {
    const hit = findNearestPt(mouseX, mouseY);    if (!hit) return false;
    drag = hit;
    isDragging = true;
    return true;
  }

  function moveDrag(mouseX, mouseY, shiftKey) {
    if (!drag) return;
    const data = screenToData(mouseX, mouseY);
    state.width[drag.idx].v = data.v;
    const prev = drag.idx > 0 ? state.width[drag.idx - 1].t + 0.002 : 0;
    const next = drag.idx < state.width.length - 1 ? state.width[drag.idx + 1].t - 0.002 : 1;
    state.width[drag.idx].t = Math.max(prev, Math.min(next, data.t));
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
      e.preventDefault(); e.stopPropagation(); return;
    }
    const m = localXY(e);
    if (startDrag(m.x, m.y)) { e.preventDefault(); e.stopPropagation(); }
  });

  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (panState) {
      vp.applyPan(e.clientX - panState.lastX, e.clientY - panState.lastY, svg.getBoundingClientRect());
      panState.lastX = e.clientX; panState.lastY = e.clientY;
      redraw(); e.stopPropagation(); return;
    }
    if (drag) { const m = localXY(e); moveDrag(m.x, m.y, e.shiftKey); e.stopPropagation(); }
  });

  svg.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    if (panState) { panState = null; return; }
    endDrag();
  });

  // ── Touch: hit point = drag, miss = pan, 2-finger = pinch zoom ──
  let touchPan = null, pinchDist = 0;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      endDrag(); touchPan = null;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (!startDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top)) {
        touchPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinchDist > 0) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = svg.getBoundingClientRect();
      vp.applyPinch(dist / pinchDist, cx - rect.left, cy2 - rect.top, rect, svg);
      pinchDist = dist;
      redraw();
    } else if (e.touches.length === 1) {
      e.preventDefault();
      if (drag) {
        const r = svg.getBoundingClientRect();
        moveDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top, false);
      } else if (touchPan) {
        vp.applyPan(e.touches[0].clientX - touchPan.x, e.touches[0].clientY - touchPan.y, svg.getBoundingClientRect());
        touchPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        redraw();
      }
    }
  }, { passive: false });

  svg.addEventListener('touchend', e => {
    endDrag(); touchPan = null;
    if (e.touches.length < 2) pinchDist = 0;
  });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    const r = svg.getBoundingClientRect();
    vp.applyZoom(e.deltaY, e.clientX - r.left, e.clientY - r.top, r, svg);
    redraw();
  }, { passive: false });

  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    const m = localXY(e);
    const data = screenToData(m.x, m.y);
    const t = Math.max(0.005, Math.min(0.995, data.t));
    insertProfilePoint(state.width, t);
    refresh();
    onEdit();
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    const tgt = e.target;
    if (!tgt.classList.contains('pe-pt') ) return;
    if (removeProfilePoint(state.width, +tgt.dataset.idx)) { refresh(); onEdit(); }
  });

  refresh();
  return {
    refresh,
    setStationMarker(t) { stationT = t; redraw(); }
  };
}
