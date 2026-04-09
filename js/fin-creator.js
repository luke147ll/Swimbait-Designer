/**
 * @file fin-creator.js
 * 2D spline-based fin creator. User draws a fin outline using draggable
 * control points, sets dimensions, and gets a watertight extruded solid
 * added as a component.
 */
import { sampleClosedLoop } from './splines.js';
import { addComponent } from './components.js';

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const HIT_R = IS_TOUCH ? 22 : 10;

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
let canvas, ctx, canvasW = 280, canvasH = 200;
let dragIdx = -1;
let editorContainer = null;
let onDoneCallback = null;

// ── Interpolation ──

function interpolateOutline(pts, res = 40) {
  const outline = [];
  for (let i = 0; i < res; i++) {
    const t = i / (res - 1);
    // Linear interpolation between control points (find segment)
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
  // Catmull-Rom through control points for smooth curve
  const outline = [];
  const n = pts.length;
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
    outline.push({
      x: cr(pts[i0].x, pts[i1].x, pts[i2].x, pts[i3].x, lt),
      y: Math.max(0, cr(pts[i0].y, pts[i1].y, pts[i2].y, pts[i3].y, lt)),
    });
  }
  return outline;
}

// ── Canvas Drawing ──

function toCanvas(pt) {
  const m = 25;
  const dw = canvasW - m * 2, dh = canvasH - m - 20;
  const baseY = canvasH - 20;
  return { cx: m + pt.x * dw, cy: baseY - pt.y * dh };
}

function fromCanvas(cx, cy) {
  const m = 25;
  const dw = canvasW - m * 2, dh = canvasH - m - 20;
  const baseY = canvasH - 20;
  return {
    x: Math.max(0, Math.min(1, (cx - m) / dw)),
    y: Math.max(0, Math.min(1.2, (baseY - cy) / dh)),
  };
}

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Grid
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < canvasW; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke(); }
  for (let y = 0; y < canvasH; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke(); }

  // Base line
  const baseY = canvasH - 20;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(25, baseY); ctx.lineTo(canvasW - 25, baseY); ctx.stroke();
  ctx.setLineDash([]);

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
    ctx.fillStyle = 'rgba(200,168,78,0.06)';
    ctx.fill();
  }

  // Control points
  for (let i = 0; i < finPoints.length; i++) {
    const cp = toCanvas(finPoints[i]);
    const r = finPoints[i].fixed ? 5 : 7;
    ctx.beginPath();
    ctx.arc(cp.cx, cp.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = finPoints[i].fixed ? '#8a7535' : '#c8a84e';
    ctx.fill();
    if (IS_TOUCH) {
      ctx.beginPath(); ctx.arc(cp.cx, cp.cy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,168,78,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
}

// ── Interaction ──

function findNearest(cx, cy) {
  let best = -1, bestD = HIT_R;
  for (let i = 0; i < finPoints.length; i++) {
    const cp = toCanvas(finPoints[i]);
    const d = Math.hypot(cx - cp.cx, cy - cp.cy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function onPointerDown(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  dragIdx = findNearest(cx, cy);
  if (e.touches) e.preventDefault();
}

function onPointerMove(e) {
  if (dragIdx < 0) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  const pt = fromCanvas(cx, cy);
  if (finPoints[dragIdx].fixed) {
    finPoints[dragIdx].x = pt.x; // can move horizontally only
  } else {
    finPoints[dragIdx].x = pt.x;
    finPoints[dragIdx].y = pt.y;
  }
  draw();
  if (e.touches) e.preventDefault();
}

function onPointerUp() { dragIdx = -1; }

// ── Mesh Building ──

function buildFinMesh() {
  const outline = smoothOutline(finPoints, 40);
  const N = outline.length;
  // Vertex layout: N front + N back + 2 cap centers (front + back)
  const frontCenter = N * 2;
  const backCenter = N * 2 + 1;
  const totalVerts = N * 2 + 2;
  const vp = new Float32Array(totalVerts * 3);
  const tris = [];

  const S = 1 / 25.4; // mm → inches for viewport

  // Compute centroid for cap fan centers
  let cx = 0, cy = 0;
  for (let i = 0; i < N; i++) {
    cx += (outline[i].x * baseLength - baseLength / 2) * S;
    cy += outline[i].y * maxHeight * S;
  }
  cx /= N; cy /= N;
  const centerHt = (tapered ? thickness * (1 - (cy / (maxHeight * S)) * 0.7) : thickness) * S;

  for (let i = 0; i < N; i++) {
    const px = (outline[i].x * baseLength - baseLength / 2) * S;
    const py = outline[i].y * maxHeight * S;
    const ht = (tapered ? thickness * (1 - outline[i].y * 0.7) : thickness) * S;
    const hz = ht / 2;

    vp[i * 3] = px;
    vp[i * 3 + 1] = py;
    vp[i * 3 + 2] = hz;

    vp[(N + i) * 3] = px;
    vp[(N + i) * 3 + 1] = py;
    vp[(N + i) * 3 + 2] = -hz;
  }
  // Cap centers
  vp[frontCenter * 3] = cx; vp[frontCenter * 3 + 1] = cy; vp[frontCenter * 3 + 2] = centerHt / 2;
  vp[backCenter * 3] = cx; vp[backCenter * 3 + 1] = cy; vp[backCenter * 3 + 2] = -centerHt / 2;

  // Front face fan from centroid
  for (let i = 0; i < N; i++) { const ni = (i + 1) % N; tris.push(frontCenter, i, ni); }
  // Back face fan from centroid (reversed winding)
  for (let i = 0; i < N; i++) { const ni = (i + 1) % N; tris.push(backCenter, N + ni, N + i); }
  // Side walls
  for (let i = 0; i < N; i++) {
    const ni = (i + 1) % N;
    tris.push(i, ni, N + i);
    tris.push(ni, N + ni, N + i);
  }

  return { vertProperties: Array.from(vp), triVerts: tris, vertCount: N * 2, triCount: tris.length / 3 };
}

// ── UI ──

export function openFinCreator(container, done) {
  editorContainer = container;
  onDoneCallback = done;
  finPoints = FIN_PRESETS[currentPreset].points.map(p => ({ ...p }));

  container.innerHTML = '';
  container.style.cssText = 'padding:8px 12px';

  // Preset
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

  // Canvas
  canvas = document.createElement('canvas');
  canvas.width = canvasW; canvas.height = canvasH;
  canvas.style.cssText = 'width:100%;height:auto;background:#111;border:1px solid var(--bd);border-radius:4px;touch-action:none;cursor:crosshair';
  ctx = canvas.getContext('2d');
  container.appendChild(canvas);

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  canvas.addEventListener('touchend', onPointerUp);

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
  doneBtn.onclick = finalize;
  container.appendChild(doneBtn);

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
    // Store fin parameters for native Manifold extrusion in mold generator
    _finParams: {
      outline: outline.map(p => ({ x: p.x * baseLength - baseLength / 2, y: p.y * maxHeight })),
      thickness,
      tapered,
    },
  });

  if (onDoneCallback) onDoneCallback();
}

// Global handlers for inline onclick
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
  draw();
};

window._finSetTaper = function(v) { tapered = v; };
