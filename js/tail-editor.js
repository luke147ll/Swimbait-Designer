/**
 * @file tail-editor.js
 * 2D tail rear-view outline editor (Y/Z plane, viewed from behind).
 * Only the right half (Z >= 0) is editable — left half mirrors automatically.
 * Uses HTML dot overlay + screen-space hit detection like other editors.
 */
import { sampleClosedLoop } from './splines.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SAMPLES = 60;

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Default tail outline: teardrop/oval, right half only (Z >= 0)
// Will be mirrored for display and geometry
export function defaultTailOutline() {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI; // 0 to PI (right half: top to bottom)
    pts.push({ y: Math.cos(a) * 1.0, z: Math.sin(a) * 0.6 });
  }
  return pts;
}

// Mirror right-half points to create full closed outline
function mirrorOutline(rightHalf) {
  const full = [];
  // Right half: top to bottom (z >= 0)
  for (const p of rightHalf) full.push({ y: p.y, z: p.z });
  // Left half: bottom to top (z < 0), skip endpoints to avoid duplicates
  for (let i = rightHalf.length - 2; i >= 1; i--) {
    full.push({ y: rightHalf[i].y, z: -rightHalf[i].z });
  }
  return full;
}

// Sample the mirrored outline as a closed loop for smooth curves
function sampleFullOutline(rightHalf, numSamples) {
  const full = mirrorOutline(rightHalf);
  const pts = [];
  for (let i = 0; i <= numSamples; i++) {
    pts.push(sampleClosedLoop(full, i / numSamples));
  }
  return pts;
}

export function createTailEditor(container, tailState, onEdit) {
  const VW = 250, VH = 250, MRG = 14;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;margin-bottom:0';
  container.appendChild(wrap);

  const svg = svgEl('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'pe-svg', preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = `width:100%;height:${VH}px;display:block`;
  wrap.appendChild(svg);

  const dotOverlay = document.createElement('div');
  dotOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden';
  wrap.appendChild(dotOverlay);

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'pe-resize-handle';
  resizeHandle.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY, startH = parseInt(svg.style.height) || VH;
    document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none';
    const onMove = ev => { svg.style.height = Math.max(100, startH + ev.clientY - startY) + 'px'; drawPoints(); };
    const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
  });
  wrap.after(resizeHandle);

  const gridG = svgEl('g');
  const fillPath = svgEl('path', { class: 'pe-outline-fill' });
  const outlinePath = svgEl('path', { class: 'pe-outline-stroke' });
  const centerV = svgEl('line', { class: 'pe-center' });
  const centerH = svgEl('line', { class: 'pe-center' });
  svg.append(gridG, fillPath, centerV, centerH, outlinePath);

  // Coordinate mapping: fixed range showing the tail outline
  const span = 1.4;
  const toSX = z => MRG + ((z + span) / (2 * span)) * (VW - MRG * 2);
  const toSY = y => MRG + ((span - y) / (2 * span)) * (VH - MRG * 2);

  function dataToScreen(z, y) {
    const ctm = svg.getScreenCTM();
    const rect = svg.getBoundingClientRect();
    if (!ctm) return { x: 0, y: 0 };
    return { x: ctm.a * toSX(z) + ctm.e - rect.left, y: ctm.d * toSY(y) + ctm.f - rect.top };
  }

  function screenToData(px, py) {
    const ctm = svg.getScreenCTM();
    const rect = svg.getBoundingClientRect();
    if (!ctm) return { z: 0, y: 0 };
    const svgX = (px + rect.left - ctm.e) / ctm.a;
    const svgY = (py + rect.top - ctm.f) / ctm.d;
    const z = (svgX - MRG) / (VW - MRG * 2) * (2 * span) - span;
    const y = span - (svgY - MRG) / (VH - MRG * 2) * (2 * span);
    return { z, y };
  }

  function localXY(e) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function drawGrid() {
    gridG.innerHTML = '';
    for (let v = -1; v <= 1; v += 0.5) {
      gridG.appendChild(svgEl('line', { x1: toSX(v), y1: MRG, x2: toSX(v), y2: VH - MRG, class: 'pe-grid' }));
      gridG.appendChild(svgEl('line', { x1: MRG, y1: toSY(v), x2: VW - MRG, y2: toSY(v), class: 'pe-grid' }));
    }
    centerV.setAttribute('x1', toSX(0)); centerV.setAttribute('x2', toSX(0));
    centerV.setAttribute('y1', MRG); centerV.setAttribute('y2', VH - MRG);
    centerH.setAttribute('x1', MRG); centerH.setAttribute('x2', VW - MRG);
    centerH.setAttribute('y1', toSY(0)); centerH.setAttribute('y2', toSY(0));
  }

  function draw() {
    // Sample the full mirrored outline for smooth curve display
    const sampled = sampleFullOutline(tailState.tailOutline, SAMPLES);
    let d = '';
    for (let i = 0; i < sampled.length; i++) {
      d += `${i === 0 ? 'M' : 'L'}${toSX(sampled[i].z).toFixed(1)},${toSY(sampled[i].y).toFixed(1)} `;
    }
    d += 'Z';
    outlinePath.setAttribute('d', d);
    fillPath.setAttribute('d', d);
  }

  function drawPoints() {
    dotOverlay.innerHTML = '';
    const DOT_PX = Math.min(70, Math.max(4, 7));
    // Only show right-half points (editable)
    tailState.tailOutline.forEach((p, i) => {
      const scr = dataToScreen(p.z, p.y);
      const dot = document.createElement('div');
      dot.className = 'pe-html-dot dorsal';
      dot.style.cssText = `position:absolute;left:${scr.x - DOT_PX/2}px;top:${scr.y - DOT_PX/2}px;width:${DOT_PX}px;height:${DOT_PX}px;pointer-events:none`;
      dotOverlay.appendChild(dot);
    });
  }

  function refresh() {
    drawGrid(); draw(); drawPoints();
  }

  // Resize observer
  new ResizeObserver(() => drawPoints()).observe(svg);

  // Hit detection in screen space
  const HIT_RADIUS = 20;
  let drag = null;

  function findNearest(mx, my) {
    let best = null;
    tailState.tailOutline.forEach((p, i) => {
      const scr = dataToScreen(p.z, p.y);
      const d = Math.hypot(mx - scr.x, my - scr.y);
      if (d < HIT_RADIUS && (!best || d < best.dist)) {
        best = { idx: i, dist: d };
      }
    });
    return best;
  }

  function startDrag(mx, my) {
    const hit = findNearest(mx, my);
    if (!hit) return false;
    drag = hit.idx;
    return true;
  }

  function moveDrag(mx, my) {
    if (drag === null) return;
    const data = screenToData(mx, my);
    tailState.tailOutline[drag].y = data.y;
    tailState.tailOutline[drag].z = Math.max(0, data.z); // right half only: z >= 0
    draw(); drawPoints(); onEdit();
  }

  function endDrag() { drag = null; }

  // Pointer events
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    const m = localXY(e);
    if (startDrag(m.x, m.y)) { e.preventDefault(); e.stopPropagation(); }
  });
  svg.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' && drag !== null) { const m = localXY(e); moveDrag(m.x, m.y); e.stopPropagation(); }
  });
  svg.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') endDrag(); });

  // Touch
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) { const r = svg.getBoundingClientRect(); startDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); }
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag !== null) { const r = svg.getBoundingClientRect(); moveDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); }
  }, { passive: false });
  svg.addEventListener('touchend', () => endDrag());

  // Double-click: add point
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    const m = localXY(e);
    const data = screenToData(m.x, m.y);
    if (data.z < 0) return; // only add on right half
    // Find nearest segment to insert between
    const pts = tailState.tailOutline;
    let bestSeg = 0, bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const mz = (pts[i].z + pts[i+1].z) / 2, my2 = (pts[i].y + pts[i+1].y) / 2;
      const d = (data.z - mz) ** 2 + (data.y - my2) ** 2;
      if (d < bestD) { bestD = d; bestSeg = i; }
    }
    const a = pts[bestSeg], b = pts[bestSeg + 1] || pts[0];
    pts.splice(bestSeg + 1, 0, { y: (a.y + b.y) / 2, z: Math.max(0, (a.z + b.z) / 2) });
    refresh(); onEdit();
  });

  // Right-click: delete point
  svg.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    if (tailState.tailOutline.length <= 6) return;
    const m = localXY(e);
    const hit = findNearest(m.x, m.y);
    if (hit) { tailState.tailOutline.splice(hit.idx, 1); refresh(); onEdit(); }
  });

  refresh();
  return { refresh };
}
