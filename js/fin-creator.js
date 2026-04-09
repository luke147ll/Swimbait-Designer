/**
 * @file fin-creator.js
 * 2D spline-based fin creator with transparent viewport overlay.
 * The canvas overlays the 3D viewport so the user can trace the bait shape.
 * Supports zoom (scroll), pan (right-drag), and point dragging.
 */
import { sampleClosedLoop } from './splines.js';
import { addComponent } from './components.js';

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const HIT_R = IS_TOUCH ? 28 : 12;

// ── Presets ──

const FIN_PRESETS = {
  dorsal_pointed: {
    label: 'Dorsal (pointed)',
    defaultPos: { x: 0, y: 1.3, z: 0 },
    points: [
      { x: 0, y: 0, fixed: true }, { x: 0.1, y: 0.3 }, { x: 0.3, y: 0.85 },
      { x: 0.4, y: 1.0 }, { x: 0.55, y: 0.7 }, { x: 0.75, y: 0.3 }, { x: 1, y: 0, fixed: true },
    ],
  },
  dorsal_rounded: {
    label: 'Dorsal (rounded)',
    defaultPos: { x: 0, y: 1.3, z: 0 },
    points: [
      { x: 0, y: 0, fixed: true }, { x: 0.1, y: 0.5 }, { x: 0.3, y: 0.9 },
      { x: 0.5, y: 1.0 }, { x: 0.7, y: 0.9 }, { x: 0.9, y: 0.5 }, { x: 1, y: 0, fixed: true },
    ],
  },
  dorsal_sail: {
    label: 'Dorsal (sail)',
    defaultPos: { x: 0, y: 1.3, z: 0 },
    points: [
      { x: 0, y: 0, fixed: true }, { x: 0.05, y: 0.7 }, { x: 0.15, y: 1.0 },
      { x: 0.4, y: 0.85 }, { x: 0.65, y: 0.55 }, { x: 0.85, y: 0.25 }, { x: 1, y: 0, fixed: true },
    ],
  },
  pectoral: {
    label: 'Pectoral',
    defaultPos: { x: 0, y: 0, z: 0 },
    points: [
      { x: 0, y: 0, fixed: true }, { x: 0.1, y: 0.4 }, { x: 0.3, y: 0.8 },
      { x: 0.5, y: 1.0 }, { x: 0.7, y: 0.85 }, { x: 0.85, y: 0.5 }, { x: 1, y: 0, fixed: true },
    ],
  },
  anal: {
    label: 'Anal fin',
    defaultPos: { x: 0, y: -1.0, z: 0 },
    points: [
      { x: 0, y: 0, fixed: true }, { x: 0.15, y: 0.5 }, { x: 0.35, y: 0.8 },
      { x: 0.5, y: 1.0 }, { x: 0.7, y: 0.6 }, { x: 1, y: 0, fixed: true },
    ],
  },
  caudal_fork: {
    label: 'Caudal (forked)',
    defaultPos: { x: 3.5, y: 0, z: 0 },
    points: [
      { x: 0, y: 0, fixed: true }, { x: 0.05, y: 0.7 }, { x: 0.15, y: 1.0 },
      { x: 0.3, y: 0.6 }, { x: 0.5, y: 0.3 }, { x: 0.7, y: 0.6 },
      { x: 0.85, y: 1.0 }, { x: 0.95, y: 0.7 }, { x: 1, y: 0, fixed: true },
    ],
  },
};

// ── State ──

let finPoints = [];
let baseLength = 25, maxHeight = 15, thickness = 2, tapered = false;
let currentPreset = 'dorsal_pointed';
let canvas, ctx, canvasW, canvasH;
let dragIdx = -1;
let editorContainer = null;
let onDoneCallback = null;
let overlayEl = null;

// Zoom & pan
let zoom = 1.0;
let panX = 0, panY = 0;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let panStartPanX = 0, panStartPanY = 0;

// ── Interpolation ──

function interpolateOutline(pts, res = 40) {
  const outline = [];
  for (let i = 0; i < res; i++) {
    const t = i / (res - 1);
    const total = pts.length - 1;
    const raw = t * total;
    const seg = Math.min(Math.floor(raw), total - 1);
    const lt = raw - seg;
    const a = pts[seg], b = pts[seg + 1];
    outline.push({ x: a.x + (b.x - a.x) * lt, y: a.y + (b.y - a.y) * lt });
  }
  return outline;
}

function smoothOutline(pts, res = 60) {
  const outline = [];
  const n = pts.length;
  let prevX = -Infinity;
  for (let i = 0; i < res; i++) {
    const t = i / (res - 1);
    const raw = t * (n - 1);
    const seg = Math.min(Math.floor(raw), n - 2);
    const lt = raw - seg;
    const i0 = Math.max(0, seg - 1), i1 = seg, i2 = Math.min(n - 1, seg + 1), i3 = Math.min(n - 1, seg + 2);
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    let x = cr(pts[i0].x, pts[i1].x, pts[i2].x, pts[i3].x, lt);
    if (x <= prevX) x = prevX + 0.001;
    prevX = x;
    outline.push({
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, cr(pts[i0].y, pts[i1].y, pts[i2].y, pts[i3].y, lt)),
    });
  }
  return outline;
}

// ── Canvas coord transforms (with zoom & pan) ──

function toCanvas(pt) {
  // Map normalized (0-1) fin coords to canvas pixels with zoom and pan
  const drawW = canvasW * 0.7 * zoom;
  const drawH = canvasH * 0.6 * zoom;
  const cx = canvasW / 2 + panX;
  const baseY = canvasH * 0.75 + panY;
  return {
    cx: cx - drawW / 2 + pt.x * drawW,
    cy: baseY - pt.y * drawH,
  };
}

function fromCanvas(px, py) {
  const drawW = canvasW * 0.7 * zoom;
  const drawH = canvasH * 0.6 * zoom;
  const cx = canvasW / 2 + panX;
  const baseY = canvasH * 0.75 + panY;
  return {
    x: Math.max(0, Math.min(1, (px - (cx - drawW / 2)) / drawW)),
    y: Math.max(0, Math.min(1.0, (baseY - py) / drawH)),
  };
}

// ── Drawing ──

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Subtle base line
  const bl = toCanvas({ x: 0, y: 0 });
  const br = toCanvas({ x: 1, y: 0 });
  ctx.strokeStyle = 'rgba(200,168,78,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(bl.cx, bl.cy); ctx.lineTo(br.cx, br.cy); ctx.stroke();
  ctx.setLineDash([]);

  // Dimensions label
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(200,168,78,0.4)';
  ctx.fillText(`${baseLength}×${maxHeight}mm`, bl.cx, bl.cy + 14);

  // Smooth outline
  const outline = smoothOutline(finPoints, 60);
  if (outline.length > 1) {
    ctx.strokeStyle = '#c8a84e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const f = toCanvas(outline[0]);
    ctx.moveTo(f.cx, f.cy);
    for (let i = 1; i < outline.length; i++) { const p = toCanvas(outline[i]); ctx.lineTo(p.cx, p.cy); }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,168,78,0.08)';
    ctx.fill();
  }

  // Control points
  for (let i = 0; i < finPoints.length; i++) {
    const cp = toCanvas(finPoints[i]);
    const r = (finPoints[i].fixed ? 5 : 7) * Math.min(zoom, 2);
    ctx.beginPath();
    ctx.arc(cp.cx, cp.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = finPoints[i].fixed ? '#8a7535' : '#c8a84e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Zoom indicator
  ctx.fillStyle = 'rgba(200,168,78,0.3)';
  ctx.font = '10px monospace';
  ctx.fillText(`${Math.round(zoom * 100)}%`, 8, canvasH - 8);
}

// ── Interaction ──

function getCanvasXY(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { cx: (clientX - rect.left) * sx, cy: (clientY - rect.top) * sy };
}

function findNearest(cx, cy) {
  let best = -1, bestD = HIT_R * Math.max(zoom, 1);
  for (let i = 0; i < finPoints.length; i++) {
    const cp = toCanvas(finPoints[i]);
    const d = Math.hypot(cx - cp.cx, cy - cp.cy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function onPointerDown(e) {
  // Right-click or Ctrl+click → start pan
  if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
    isPanning = true;
    const { cx, cy } = getCanvasXY(e);
    panStartX = cx; panStartY = cy;
    panStartPanX = panX; panStartPanY = panY;
    e.preventDefault();
    return;
  }
  const { cx, cy } = getCanvasXY(e);
  dragIdx = findNearest(cx, cy);
  if (e.touches) e.preventDefault();
}

function onPointerMove(e) {
  if (isPanning) {
    const { cx, cy } = getCanvasXY(e);
    panX = panStartPanX + (cx - panStartX);
    panY = panStartPanY + (cy - panStartY);
    draw();
    if (e.touches) e.preventDefault();
    return;
  }
  if (dragIdx < 0) return;
  const { cx, cy } = getCanvasXY(e);
  const pt = fromCanvas(cx, cy);
  const minX = dragIdx > 0 ? finPoints[dragIdx - 1].x + 0.02 : 0;
  const maxX = dragIdx < finPoints.length - 1 ? finPoints[dragIdx + 1].x - 0.02 : 1;
  pt.x = Math.max(minX, Math.min(maxX, pt.x));
  if (finPoints[dragIdx].fixed) {
    finPoints[dragIdx].x = pt.x;
  } else {
    finPoints[dragIdx].x = pt.x;
    finPoints[dragIdx].y = pt.y;
  }
  draw();
  if (e.touches) e.preventDefault();
}

function onPointerUp() { dragIdx = -1; isPanning = false; }

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoom = Math.max(0.3, Math.min(5, zoom * factor));
  draw();
}

function onContextMenu(e) { e.preventDefault(); }

// ── Mesh Building ──

function buildFinMesh() {
  const rawOutline = smoothOutline(finPoints, 30);
  const S = 1 / 25.4;
  const MIN_H = 0.3 * S;

  const outline = [];
  for (let i = 0; i < rawOutline.length; i++) {
    const h = rawOutline[i].y * maxHeight * S;
    if (h >= MIN_H || i === 0 || i === rawOutline.length - 1) {
      outline.push({ x: rawOutline[i].x, y: rawOutline[i].y, h: Math.max(h, MIN_H) });
    }
  }
  const NS = outline.length;

  const totalVerts = NS * 4;
  const vp = new Float32Array(totalVerts * 3);
  const tris = [];

  for (let i = 0; i < NS; i++) {
    const px = (outline[i].x * baseLength - baseLength / 2) * S;
    const h = outline[i].h;
    const t = tapered ? thickness * Math.max(0.15, outline[i].y) * S : thickness * S;
    const hz = t / 2;
    const base = i * 4;
    vp[(base + 0) * 3] = px; vp[(base + 0) * 3 + 1] = h; vp[(base + 0) * 3 + 2] = hz;
    vp[(base + 1) * 3] = px; vp[(base + 1) * 3 + 1] = h; vp[(base + 1) * 3 + 2] = -hz;
    vp[(base + 2) * 3] = px; vp[(base + 2) * 3 + 1] = 0; vp[(base + 2) * 3 + 2] = hz;
    vp[(base + 3) * 3] = px; vp[(base + 3) * 3 + 1] = 0; vp[(base + 3) * 3 + 2] = -hz;
  }

  for (let i = 0; i < NS - 1; i++) {
    const a = i * 4, b = (i + 1) * 4;
    tris.push(a + 0, a + 2, b + 0); tris.push(a + 2, b + 2, b + 0);
    tris.push(a + 1, b + 1, a + 3); tris.push(a + 3, b + 1, b + 3);
    tris.push(a + 0, b + 0, a + 1); tris.push(a + 1, b + 0, b + 1);
    tris.push(a + 2, a + 3, b + 2); tris.push(a + 3, b + 3, b + 2);
  }
  tris.push(0, 1, 2); tris.push(1, 3, 2);
  const e = (NS - 1) * 4;
  tris.push(e + 0, e + 2, e + 1); tris.push(e + 1, e + 2, e + 3);

  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity;
  for (let i = 0; i < vp.length; i += 3) {
    if (vp[i] < mnX) mnX = vp[i]; if (vp[i] > mxX) mxX = vp[i];
    if (vp[i+1] < mnY) mnY = vp[i+1]; if (vp[i+1] > mxY) mxY = vp[i+1];
    if (vp[i+2] < mnZ) mnZ = vp[i+2]; if (vp[i+2] > mxZ) mxZ = vp[i+2];
  }
  const offX = (mnX + mxX) / 2, offY = (mnY + mxY) / 2, offZ = (mnZ + mxZ) / 2;
  for (let i = 0; i < vp.length; i += 3) { vp[i] -= offX; vp[i+1] -= offY; vp[i+2] -= offZ; }

  return { vertProperties: Array.from(vp), triVerts: tris, vertCount: NS * 4, triCount: tris.length / 3 };
}

// ── UI ──

function removeOverlay() {
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  canvas = null; ctx = null;
}

export function openFinCreator(container, done) {
  editorContainer = container;
  onDoneCallback = done;
  finPoints = FIN_PRESETS[currentPreset].points.map(p => ({ ...p }));
  zoom = 1.0; panX = 0; panY = 0;

  container.innerHTML = '';
  container.style.cssText = 'padding:8px 12px';

  // Preset selector
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'margin-bottom:8px';
  const sel = document.createElement('select');
  sel.style.cssText = 'width:100%;padding:5px;background:var(--sf2);border:1px solid var(--bd);color:var(--tx);font-family:inherit;font-size:10px;border-radius:3px';
  for (const [k, v] of Object.entries(FIN_PRESETS)) {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.label;
    if (k === currentPreset) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => { currentPreset = sel.value; finPoints = FIN_PRESETS[currentPreset].points.map(p => ({ ...p })); draw(); };
  presetRow.appendChild(sel);
  container.appendChild(presetRow);

  // Hint
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:9px;color:var(--mu);margin-bottom:8px;line-height:1.5';
  hint.textContent = 'Draw on viewport overlay. Scroll to zoom, right-drag to pan.';
  container.appendChild(hint);

  // Point add/remove
  const ptBtns = document.createElement('div');
  ptBtns.style.cssText = 'display:flex;gap:4px;margin:6px 0';
  ptBtns.innerHTML = `
    <button class="tb" style="padding:4px 8px;font-size:9px;flex:1" onclick="window._finAddPoint()">+ Point</button>
    <button class="tb" style="padding:4px 8px;font-size:9px;flex:1" onclick="window._finRemovePoint()">- Point</button>
    <button class="tb" style="padding:4px 8px;font-size:9px;flex:1" onclick="window._finReset()">Reset</button>
  `;
  container.appendChild(ptBtns);

  // Dimension sliders
  function dimSlider(label, val, min, max, step, unit, onChange) {
    const d = document.createElement('div');
    d.style.cssText = 'margin-bottom:4px';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--mu)"><span>${label}</span><span style="font-family:monospace;color:var(--tx)">${val}${unit}</span></div>`;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
    inp.style.cssText = 'width:100%';
    const span = d.querySelector('span:last-child');
    inp.oninput = () => { const v = parseFloat(inp.value); span.textContent = v + unit; onChange(v); };
    d.appendChild(inp);
    return d;
  }

  const dimLabel = document.createElement('div');
  dimLabel.style.cssText = 'font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu);margin:8px 0 4px';
  dimLabel.textContent = 'Dimensions';
  container.appendChild(dimLabel);

  container.appendChild(dimSlider('Base length', baseLength, 5, 80, 0.5, 'mm', v => { baseLength = v; }));
  container.appendChild(dimSlider('Max height', maxHeight, 3, 50, 0.5, 'mm', v => { maxHeight = v; }));
  container.appendChild(dimSlider('Thickness', thickness, 0.8, 6, 0.1, 'mm', v => { thickness = v; }));

  // Taper toggle
  const taperRow = document.createElement('div');
  taperRow.style.cssText = 'margin:6px 0;display:flex;gap:8px;align-items:center;font-size:10px;color:var(--mu)';
  taperRow.innerHTML = `
    <label><input type="radio" name="finTaper" value="uniform" ${!tapered ? 'checked' : ''} onchange="window._finSetTaper(false)"> Uniform</label>
    <label><input type="radio" name="finTaper" value="tapered" ${tapered ? 'checked' : ''} onchange="window._finSetTaper(true)"> Tapered</label>
  `;
  container.appendChild(taperRow);

  // Done button
  const doneBtn = document.createElement('button');
  doneBtn.className = 'tb on';
  doneBtn.style.cssText = 'width:100%;padding:10px;margin-top:8px;background:var(--ac);color:var(--bg);font-weight:700';
  doneBtn.textContent = 'Done — Add to Design';
  doneBtn.onclick = () => { finalize(); removeOverlay(); };
  container.appendChild(doneBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tb';
  cancelBtn.style.cssText = 'width:100%;padding:8px;margin-top:4px;color:var(--mu)';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => { removeOverlay(); if (onDoneCallback) onDoneCallback(); };
  container.appendChild(cancelBtn);

  // Create transparent overlay canvas on the viewport
  removeOverlay();
  const vp = document.getElementById('vp');
  if (!vp) return;

  overlayEl = document.createElement('div');
  overlayEl.style.cssText = 'position:absolute;inset:0;z-index:15;pointer-events:auto;';

  canvas = document.createElement('canvas');
  const rect = vp.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvasW = rect.width * dpr;
  canvasH = rect.height * dpr;
  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.style.cssText = 'width:100%;height:100%;cursor:crosshair;touch-action:none;';
  ctx = canvas.getContext('2d');
  ctx.scale(1, 1); // canvas coords = pixel coords (dpr accounted for in size)

  overlayEl.appendChild(canvas);
  vp.appendChild(overlayEl);

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  canvas.addEventListener('touchend', onPointerUp);

  draw();
}

function finalize() {
  const mesh = buildFinMesh();
  const outline = smoothOutline(finPoints, 40);
  console.log(`[FinCreator] Built: ${mesh.vertCount} verts, ${mesh.triCount} tris, ${baseLength}×${maxHeight}×${thickness}mm`);

  const preset = FIN_PRESETS[currentPreset];
  addComponent({
    label: preset?.label || 'Custom Fin',
    category: 'fin',
    meshData: { numProp: 3, vertProperties: mesh.vertProperties, triVerts: mesh.triVerts },
    autoPosition: preset?.defaultPos || { x: 0, y: 0, z: 0 },
    _finParams: {
      outline: outline.map(p => ({ x: p.x * baseLength - baseLength / 2, y: p.y * maxHeight })),
      thickness,
      tapered,
    },
  });

  if (onDoneCallback) onDoneCallback();
}

// Global handlers
window._finAddPoint = function() {
  let maxD = 0, idx = 1;
  for (let i = 0; i < finPoints.length - 1; i++) {
    const d = Math.hypot(finPoints[i + 1].x - finPoints[i].x, finPoints[i + 1].y - finPoints[i].y);
    if (d > maxD) { maxD = d; idx = i + 1; }
  }
  const a = finPoints[idx - 1], b = finPoints[idx];
  finPoints.splice(idx, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, fixed: false });
  draw();
};

window._finRemovePoint = function() {
  for (let i = finPoints.length - 2; i >= 1; i--) {
    if (!finPoints[i].fixed) { finPoints.splice(i, 1); draw(); return; }
  }
};

window._finReset = function() {
  finPoints = FIN_PRESETS[currentPreset].points.map(p => ({ ...p }));
  zoom = 1.0; panX = 0; panY = 0;
  draw();
};

window._finSetTaper = function(v) { tapered = v; };
