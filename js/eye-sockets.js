/**
 * @file eye-sockets.js
 * Eye socket component — paired cylinders that subtract from the bait,
 * creating flat-bottomed recesses for stick-on 3D eyes.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { recordChange } from './undo.js';

const EYE_SIZES = [
  { id: '3mm',  d: 3,  label: '3mm (1/8")' },
  { id: '4mm',  d: 4,  label: '4mm (5/32")' },
  { id: '5mm',  d: 5,  label: '5mm (3/16")' },
  { id: '6mm',  d: 6,  label: '6mm (1/4")' },
  { id: '7mm',  d: 7,  label: '7mm (9/32")' },
  { id: '8mm',  d: 8,  label: '8mm (11/32")' },
  { id: '9mm',  d: 9,  label: '9mm (23/64")' },
  { id: '10mm', d: 10, label: '10mm (3/8")' },
  { id: '12mm', d: 12, label: '12mm (15/32")' },
];

function suggestSize(ol) {
  if (ol <= 2.5) return '3mm'; if (ol <= 3) return '4mm'; if (ol <= 3.5) return '5mm';
  if (ol <= 4.5) return '5mm'; if (ol <= 5.5) return '6mm'; if (ol <= 7) return '7mm';
  if (ol <= 9) return '8mm'; if (ol <= 11) return '9mm'; return '10mm';
}

// ── State ──

export const eyeConfig = {
  enabled: false,
  sizeId: 'auto',
  stationT: 0.12,
  verticalOffset: 0.5,
  recessDepth: 0.5,
  clearance: 0.2,
};

let scene = null;
let indicators = [];

export function initEyeSockets(sceneRef) { scene = sceneRef; }

// ── Viewport Indicators ──

export function updateEyeIndicators(OL, getWidthFn) {
  // Remove old
  for (const m of indicators) { scene.remove(m); if (m.geometry) m.geometry.dispose(); }
  indicators = [];
  if (!eyeConfig.enabled || !scene) return;

  const sizeId = eyeConfig.sizeId === 'auto' ? suggestSize(OL) : eyeConfig.sizeId;
  const size = EYE_SIZES.find(s => s.id === sizeId);
  if (!size) return;

  const r = (size.d + eyeConfig.clearance) / 2 / 25.4; // mm → inches
  const halfLen = OL / 2;
  const stationX = -halfLen + eyeConfig.stationT * OL; // X = body axis in viewport
  const halfW = getWidthFn ? getWidthFn(eyeConfig.stationT) : 0.5;
  const vOff = eyeConfig.verticalOffset / 25.4;

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8a84e, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const discMat = new THREE.MeshBasicMaterial({ color: 0xc8a84e, side: THREE.DoubleSide, transparent: true, opacity: 0.15 });

  for (const side of [1, -1]) {
    // Ring outline — default XY plane faces along Z (width axis) — no rotation needed
    const ringGeo = new THREE.RingGeometry(r - 0.015, r, 32);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(stationX, vOff, side * (halfW + 0.01));
    ring.userData.isEyeIndicator = true;
    scene.add(ring);
    indicators.push(ring);

    // Filled disc
    const discGeo = new THREE.CircleGeometry(r, 32);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(stationX, vOff, side * (halfW + 0.005));
    disc.userData.isEyeIndicator = true;
    scene.add(disc);
    indicators.push(disc);
  }
}

// ── Build cylinder mesh data for transfer ──

export function buildEyeCylinderData(OL) {
  if (!eyeConfig.enabled) return null;

  const sizeId = eyeConfig.sizeId === 'auto' ? suggestSize(OL) : eyeConfig.sizeId;
  const size = EYE_SIZES.find(s => s.id === sizeId);
  if (!size) return null;

  const r = (size.d + eyeConfig.clearance) / 2; // mm
  const cylLen = 20; // mm — oversized, subtraction trims it
  const segs = 32;

  // Build a cylinder along Z axis, then we'll rotate to X for each eye
  const verts = [];
  const tris = [];

  // Top cap center + bottom cap center
  // Ring verts: segs * 2 (top ring + bottom ring)
  // Cap centers: 2
  const topCenter = segs * 2;
  const botCenter = segs * 2 + 1;

  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    verts.push(x, y, cylLen / 2);   // top ring
    verts.push(x, y, -cylLen / 2);  // bottom ring
  }
  verts.push(0, 0, cylLen / 2);   // top center
  verts.push(0, 0, -cylLen / 2);  // bottom center

  // Side quads
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    const t0 = i * 2, t1 = ni * 2, b0 = i * 2 + 1, b1 = ni * 2 + 1;
    tris.push(t0, t1, b0); tris.push(t1, b1, b0);
  }
  // Top cap
  for (let i = 0; i < segs; i++) { const ni = (i + 1) % segs; tris.push(topCenter, i * 2, ni * 2); }
  // Bottom cap
  for (let i = 0; i < segs; i++) { const ni = (i + 1) % segs; tris.push(botCenter, ni * 2 + 1, i * 2 + 1); }

  // Now create two positioned copies (right eye + left eye)
  // Rotate cylinder from Z-axis to Z-axis (width axis — punches in from the sides)
  // In mold coords: X=length, Y=height, Z=width
  // Cylinder axis should be along Z (width) to punch into the bait from each side
  const baitLenMM = OL * 25.4;
  const stationX = (-baitLenMM / 2) + eyeConfig.stationT * baitLenMM;
  const vOff = eyeConfig.verticalOffset;

  const allVerts = [];
  const allTris = [];

  // Cylinder base verts are: (cos*r, sin*r, ±cylLen/2) — circle in XY, axis along Z.
  // In mold coords: X=length, Y=height, Z=width.
  // We want the cylinder axis along Z (punching into bait from sides).
  // Circle coords (x,y of cylinder) map to (X,Y of bait) — body length + height.
  // Z of cylinder maps to Z of bait — width/depth into bait.

  for (const side of [1, -1]) {
    const offset = allVerts.length / 3;
    for (let i = 0; i < verts.length; i += 3) {
      allVerts.push(
        stationX + verts[i],       // X = body position + circle X (spreads the circle along body axis)
        vOff + verts[i + 1],       // Y = height offset + circle Y (spreads circle vertically)
        side * verts[i + 2]        // Z = cylinder depth (positive = right side, negative = left)
      );
    }

    for (let i = 0; i < tris.length; i++) {
      allTris.push(tris[i] + offset);
    }
    // Flip winding for the negative side (geometry is mirrored)
    if (side < 0) {
      const start = allTris.length - tris.length;
      for (let i = start; i < allTris.length; i += 3) {
        const tmp = allTris[i + 1]; allTris[i + 1] = allTris[i + 2]; allTris[i + 2] = tmp;
      }
    }
  }

  return {
    vertProperties: allVerts,
    triVerts: allTris,
    sizeLabel: size.label,
  };
}

// ── UI Controls ──

export function renderEyeControls(container) {
  container.innerHTML = '';
  const OL = parseFloat(document.getElementById('sOL')?.value || 8);
  const suggested = suggestSize(OL);
  const currentSize = eyeConfig.sizeId === 'auto' ? suggested : eyeConfig.sizeId;

  function slider(label, val, min, max, step, unit, onChange) {
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

  // Size selector
  const sizeLabel = document.createElement('div');
  sizeLabel.style.cssText = 'font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu);margin-bottom:4px';
  sizeLabel.textContent = 'Eye size';
  container.appendChild(sizeLabel);

  const sel = document.createElement('select');
  sel.style.cssText = 'width:100%;padding:5px;background:var(--sf2);border:1px solid var(--bd);color:var(--tx);font-family:inherit;font-size:10px;border-radius:3px;margin-bottom:8px';
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto'; autoOpt.textContent = `Auto (${suggested} for ${OL.toFixed(1)}" bait)`;
  if (eyeConfig.sizeId === 'auto') autoOpt.selected = true;
  sel.appendChild(autoOpt);
  for (const s of EYE_SIZES) {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.label;
    if (eyeConfig.sizeId === s.id) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => { eyeConfig.sizeId = sel.value; onEyeChange(); };
  container.appendChild(sel);

  container.appendChild(slider('Recess depth', eyeConfig.recessDepth, 0.2, 1.5, 0.1, 'mm', v => { eyeConfig.recessDepth = v; onEyeChange(); }));
  container.appendChild(slider('Along body', (eyeConfig.stationT * 100).toFixed(0), 5, 40, 1, '%', v => { eyeConfig.stationT = v / 100; onEyeChange(); }));
  container.appendChild(slider('Height offset', eyeConfig.verticalOffset, -3, 5, 0.1, 'mm', v => { eyeConfig.verticalOffset = v; onEyeChange(); }));
  container.appendChild(slider('Clearance', eyeConfig.clearance, 0, 0.5, 0.05, 'mm', v => { eyeConfig.clearance = v; onEyeChange(); }));
}

function onEyeChange() {
  if (window._sbd_eyeChanged) window._sbd_eyeChanged();
  recordChange();
}
