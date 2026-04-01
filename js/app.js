/**
 * @file app.js
 * Entry point — scene init, renderer, camera, lights, grid, orbit controls,
 * render loop, resize handler, profile state management, and UI wiring.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { genBody } from './engine.js';

import { buildEyes, buildHookSlot, buildWeightPocket } from './anatomy.js';
import { loadPreset as applyPreset } from './presets.js';
import { exportSTL as generateSTL } from './export-stl.js';
import { createProfileState, buildProfilesFromSliders, rebuildProfileCache } from './splines.js';
import { createSideEditor, createWidthEditor } from './editors.js';
import { createFinState, genFinMesh, FIN_PRESETS } from './fins.js';
import { createFinEditor } from './fin-editor.js';

let scene, cam, ren, bodyMesh, tailFinMesh, eyeGrpL, eyeGrpR, hsM, wpM;
let tailType = 'paddle', baitColor = 0x7a8e9a;
let drag = false, px = 0, py = 0, ot = 0.55, op = 0.42, od = 9;
let editorDragging = false;

// Profile state — source of truth for body shape
const profileState = createProfileState();
const finState = createFinState('paddle');
let sideEditor = null, widthEditor = null, finEditor = null;

function updateCamera() {
  cam.position.set(od * Math.sin(op) * Math.cos(ot), od * Math.cos(op), od * Math.sin(op) * Math.sin(ot));
  cam.lookAt(0, -.15, 0);
}

function getParams() {
  return {
    OL: +document.getElementById('sOL').value,
    BD: +document.getElementById('sBD').value,
    WR: +document.getElementById('sWR').value,
    GP: +document.getElementById('sGP').value,
    HL: +document.getElementById('sHL').value,
    SB: +document.getElementById('sSB').value,
    HW: +document.getElementById('sHW').value,
    DA: +document.getElementById('sDA').value,
    BF: +document.getElementById('sBF').value,
    BT: +document.getElementById('sBT').value,
    CS: +document.getElementById('sCS').value,
    SL: +document.getElementById('sSL').value,
    SD: +document.getElementById('sSD').value,
    SC: +document.getElementById('sSC').value,
    TS: +document.getElementById('sTS').value,
    TT: +document.getElementById('sTT').value,
    ES: +document.getElementById('sES').value,
    EB: +document.getElementById('sEB').value,
    HS: +document.getElementById('sHS').value,
    WP: +document.getElementById('sWP').value,
    tail: tailType
  };
}

function rebuildScene() {
  const p = getParams();
  const L = p.OL;

  [bodyMesh, tailFinMesh, eyeGrpL, eyeGrpR, hsM, wpM].forEach(m => { if (m) scene.remove(m); });

  const mat = new THREE.MeshPhysicalMaterial({
    color: baitColor, metalness: 0.05, roughness: 0.42,
    clearcoat: 0.6, clearcoatRoughness: 0.2,
    side: THREE.DoubleSide
  });

  const geo = genBody(p, profileState);
  bodyMesh = new THREE.Mesh(geo, mat);
  scene.add(bodyMesh);

  // Tail fin
  tailFinMesh = genFinMesh(finState, L, profileState, p.TS, p.TT, mat);
  scene.add(tailFinMesh);

  const eyes = buildEyes(p, L, profileState);
  eyeGrpL = eyes.eyeGrpL;
  eyeGrpR = eyes.eyeGrpR;
  scene.add(eyeGrpL);
  scene.add(eyeGrpR);

  hsM = buildHookSlot(p, L);
  if (hsM) scene.add(hsM);
  wpM = buildWeightPocket(p, L);
  if (wpM) scene.add(wpM);

  let maxD = 0, maxW = 0;
  for (let i = 0; i <= 96; i++) {
    const d = (profileState.dorsalCache[i] - profileState.ventralCache[i]) * L;
    const w = profileState.widthCache[i] * L * 2;
    if (d > maxD) maxD = d;
    if (w > maxW) maxW = w;
  }
  const approxVol = L * maxD * maxW * 0.35;
  const wOz = (approxVol * 1.1 * 0.035274).toFixed(1);
  document.getElementById('stats').innerHTML =
    `${L.toFixed(1)}" total length<br>${maxD.toFixed(2)}" max depth<br>${maxW.toFixed(2)}" max width<br>~${wOz} oz est.<br>${p.tail} tail`;

  if (sideEditor) sideEditor.refresh();
  if (widthEditor) widthEditor.refresh();

  const badge = document.getElementById('profileMode');
  if (badge) {
    const hasDeltas = profileState.dDelta.some(d => Math.abs(d) > 0.0001) ||
                      profileState.vDelta.some(d => Math.abs(d) > 0.0001) ||
                      profileState.wDelta.some(d => Math.abs(d) > 0.0001);
    badge.textContent = hasDeltas ? 'EDITED' : 'BASE';
    badge.className = 'ed-mode ' + (hasDeltas ? 'manual' : 'sliders');
  }
}

function update() {
  const p = getParams();
  const L = p.OL;

  // Display values
  document.getElementById('vOL').textContent = L.toFixed(1) + '"';
  document.getElementById('vBD').textContent = p.BD.toFixed(2);
  document.getElementById('vWR').textContent = p.WR.toFixed(2);
  document.getElementById('vGP').textContent = Math.round(p.GP * 100) + '%';
  document.getElementById('vHL').textContent = Math.round(p.HL * 100) + '%';
  document.getElementById('vSB').textContent = p.SB.toFixed(2);
  document.getElementById('vHW').textContent = p.HW.toFixed(2);
  document.getElementById('vDA').textContent = p.DA.toFixed(2);
  document.getElementById('vBF').textContent = p.BF.toFixed(2);
  document.getElementById('vBT').textContent = p.BT.toFixed(2);
  document.getElementById('vCS').textContent = p.CS.toFixed(1);
  document.getElementById('vSL').textContent = Math.round(p.SL * 100) + '%';
  document.getElementById('vSD').textContent = p.SD.toFixed(2);
  document.getElementById('vSC').textContent = p.SC.toFixed(2);
  document.getElementById('vTS').textContent = p.TS.toFixed(2);
  document.getElementById('vTT').textContent = p.TT.toFixed(2);
  document.getElementById('vES').textContent = p.ES.toFixed(2);
  document.getElementById('vEB').textContent = p.EB.toFixed(2);
  document.getElementById('vHS').textContent = p.HS.toFixed(2);
  document.getElementById('vWP').textContent = p.WP.toFixed(2);
  // Always regenerate base profiles from sliders, then apply manual deltas
  const base = buildProfilesFromSliders(p);

  // Ensure delta arrays match base length (pad with zeros if needed)
  while (profileState.dDelta.length < base.dorsal.length) profileState.dDelta.push(0);
  while (profileState.vDelta.length < base.ventral.length) profileState.vDelta.push(0);
  while (profileState.wDelta.length < base.width.length) profileState.wDelta.push(0);

  // Final profiles = base + manual deltas
  profileState.dorsal = base.dorsal.map((pt, i) => ({
    ...pt, v: pt.v + profileState.dDelta[i]
  }));
  profileState.ventral = base.ventral.map((pt, i) => ({
    ...pt, v: pt.v + profileState.vDelta[i]
  }));
  profileState.width = base.width.map((pt, i) => ({
    ...pt, v: pt.v + profileState.wDelta[i]
  }));

  lastBase = base; // cache for onProfileEdit to avoid recomputing
  rebuildProfileCache(profileState, p.CS, p.HL);
  rebuildScene();
}

function onSliderInput() {
  update();
}

// Called when the fin outline editor changes a point — only rebuild the fin mesh
function onFinEdit() {
  const p = getParams();
  const mat = bodyMesh ? bodyMesh.material : new THREE.MeshPhysicalMaterial({
    color: baitColor, metalness: 0.05, roughness: 0.42,
    clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide
  });
  if (tailFinMesh) scene.remove(tailFinMesh);
  tailFinMesh = genFinMesh(finState, p.OL, profileState, p.TS, p.TT, mat);
  if (tailFinMesh) scene.add(tailFinMesh);
}

// Called by editor drag — snapshot deltas, then do a lightweight update
// (skips regenerating base since we just need to rebuild caches + mesh)
let lastBase = null;
function onProfileEdit() {
  if (!lastBase) lastBase = buildProfilesFromSliders(getParams());
  for (let i = 0; i < profileState.dorsal.length && i < lastBase.dorsal.length; i++) {
    profileState.dDelta[i] = profileState.dorsal[i].v - lastBase.dorsal[i].v;
  }
  for (let i = 0; i < profileState.ventral.length && i < lastBase.ventral.length; i++) {
    profileState.vDelta[i] = profileState.ventral[i].v - lastBase.ventral[i].v;
  }
  for (let i = 0; i < profileState.width.length && i < lastBase.width.length; i++) {
    profileState.wDelta[i] = profileState.width[i].v - lastBase.width[i].v;
  }
  // Lightweight: skip base regeneration, just rebuild caches + mesh
  rebuildProfileCache(profileState, +document.getElementById('sCS').value, +document.getElementById('sHL').value);
  rebuildScene();
}

function setTailType(el) {
  document.querySelectorAll('.tb').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  tailType = el.dataset.t;
  // Load fin preset outline
  const preset = FIN_PRESETS[tailType];
  if (preset) {
    finState.type = tailType;
    finState.outline = preset.outline.map(p => ({ ...p }));
    finState.thickness = preset.thickness;
  }
  if (finEditor) finEditor.refresh();
  update();
}

function setColor(el) {
  document.querySelectorAll('.cs').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  baitColor = parseInt(el.dataset.c);
  update();
}

function loadPreset(name) {
  const newTail = applyPreset(name);
  if (newTail === null) return;
  tailType = newTail;
  document.querySelectorAll('.tb').forEach(e => e.classList.toggle('on', e.dataset.t === newTail));
  // Reset manual deltas — preset gives a clean baseline
  profileState.dDelta = [];
  profileState.vDelta = [];
  profileState.wDelta = [];
  update();
}

function exportSTL() {
  generateSTL([bodyMesh, tailFinMesh].filter(Boolean));
}

function dumpProfiles() {
  function fmt(arr) {
    return '[\n' + arr.map(p =>
      `  { t: ${p.t.toFixed(4)}, v: ${p.v.toFixed(6)} }`
    ).join(',\n') + '\n]';
  }
  const out = `// ── Current profile spline data ──
// Copy these arrays into splines.js buildProfilesFromSliders() or use as preset overrides

const dorsal = ${fmt(profileState.dorsal)};

const ventral = ${fmt(profileState.ventral)};

const width = ${fmt(profileState.width)};
`;
  console.log(out);

  // Also copy to clipboard if available
  if (navigator.clipboard) {
    navigator.clipboard.writeText(out).then(() => {
      console.log('✓ Copied to clipboard');
    });
  }
}

function switchTab(btn) {
  const viewId = btn.dataset.view;
  const pnl = document.getElementById('pnlControls');

  // Close all editor views
  document.querySelectorAll('.mob-view').forEach(el => el.classList.remove('active'));

  if (viewId === 'home') {
    // Show controls panel
    if (pnl) pnl.style.display = 'flex';
  } else {
    // Hide controls, show editor in the same bottom grid cell
    if (pnl) pnl.style.display = 'none';
    if (window._initMobEditors) window._initMobEditors();
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  }

  // Update tab active state
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');

  // Resize 3D viewport (always visible)
  setTimeout(() => {
    const vp = document.getElementById('vp');
    if (vp && vp.clientWidth > 0) {
      cam.aspect = vp.clientWidth / vp.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(vp.clientWidth, vp.clientHeight);
    }
  }, 50);
}

function snapView(view) {
  if (view === 'side')  { ot = 0; op = Math.PI / 2; }       // looking from +Z, level
  if (view === 'top')   { ot = 0; op = 0.01; }               // looking straight down
  if (view === 'front') { ot = -Math.PI / 2; op = Math.PI / 2; } // looking from -X (head-on)
  updateCamera();
}

function toggleEditors() {
  const el = document.getElementById('editors');
  const arrow = document.getElementById('edToggleArrow');
  const visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : 'block';
  arrow.textContent = visible ? '▸' : '▾';
}

function init() {
  const vp = document.getElementById('vp');
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, vp.clientWidth / vp.clientHeight, 0.1, 100);
  ren = new THREE.WebGLRenderer({ antialias: true });
  ren.setSize(vp.clientWidth, vp.clientHeight);
  ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ren.setClearColor(0x0e0e0d);
  ren.toneMapping = THREE.ACESFilmicToneMapping;
  ren.toneMappingExposure = 1.2;
  vp.appendChild(ren.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const d1 = new THREE.DirectionalLight(0xfff0dd, 0.85); d1.position.set(4, 10, 6); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x99aacc, 0.3); d2.position.set(-5, 3, -4); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xffffff, 0.15); d3.position.set(0, -4, 2); scene.add(d3);

  const g = new THREE.GridHelper(16, 32, 0x252522, 0x1a1a17); g.position.y = -2.2; scene.add(g);

  // ── Orbit controls: mouse ──
  // Only orbit when dragging started on the viewport canvas itself
  vp.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.target === ren.domElement || e.target === vp) {
      drag = true; px = e.clientX; py = e.clientY;
    }
  });
  vp.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') drag = false;
  });
  vp.addEventListener('pointermove', e => {
    if (!drag || e.pointerType === 'touch') return;
    ot -= (e.clientX - px) * .005;
    op = Math.max(.1, Math.min(3.0, op - (e.clientY - py) * .005));
    px = e.clientX; py = e.clientY;
    updateCamera();
  });
  // Stop orbit if pointer leaves the viewport
  vp.addEventListener('pointerleave', () => { drag = false; });
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    od = Math.max(3, Math.min(22, od + e.deltaY * .007));
    updateCamera();
  }, { passive: false });

  // ── Orbit controls: touch ──
  let touchStartDist = 0;
  let touchStartOd = od;

  vp.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      drag = true;
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      drag = false;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchStartDist = Math.sqrt(dx * dx + dy * dy);
      touchStartOd = od;
    }
  }, { passive: false });

  vp.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag) {
      const cx = e.touches[0].clientX, cy2 = e.touches[0].clientY;
      ot -= (cx - px) * .005;
      op = Math.max(.1, Math.min(3.0, op - (cy2 - py) * .005));
      px = cx; py = cy2;
      updateCamera();
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (touchStartDist > 0) {
        od = Math.max(3, Math.min(22, touchStartOd * (touchStartDist / dist)));
        updateCamera();
      }
    }
  }, { passive: false });

  vp.addEventListener('touchend', () => { drag = false; });

  // ── Touch hints ──
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hint = document.getElementById('rhHint');
  if (hint && isTouch) hint.textContent = 'Drag to orbit / pinch to zoom';
  const edHint = document.getElementById('edHint');
  if (edHint && isTouch) edHint.textContent = 'Tap point to drag / pinch to zoom';

  // ── Initialize editors (only one set — desktop OR mobile, not both) ──
  const isMobile = window.innerWidth <= 480;

  if (!isMobile) {
    const sideContainer = document.getElementById('sideEditorContainer');
    const widthContainer = document.getElementById('widthEditorContainer');
    const finContainer = document.getElementById('finEditorContainer');
    if (sideContainer) sideEditor = createSideEditor(sideContainer, profileState, onProfileEdit);
    if (widthContainer) widthEditor = createWidthEditor(widthContainer, profileState, onProfileEdit);
    if (finContainer) finEditor = createFinEditor(finContainer, finState, onFinEdit);
  }

  // Phone: create editors lazily on first tab open
  let mobEditorsCreated = false;
  window._initMobEditors = function() {
    if (mobEditorsCreated) return;
    const sideMob = document.getElementById('sideEditorMob');
    const widthMob = document.getElementById('widthEditorMob');
    const finMob = document.getElementById('finEditorMob');
    if (sideMob && !sideMob.querySelector('svg')) sideEditor = createSideEditor(sideMob, profileState, onProfileEdit);
    if (widthMob && !widthMob.querySelector('svg')) widthEditor = createWidthEditor(widthMob, profileState, onProfileEdit);
    if (finMob && !finMob.querySelector('svg')) finEditor = createFinEditor(finMob, finState, onFinEdit);
    mobEditorsCreated = true;
  };

  updateCamera();
  update();

  (function animate() { requestAnimationFrame(animate); ren.render(scene, cam); })();

  function onResize() {
    if (vp.clientWidth > 0 && vp.clientHeight > 0) {
      cam.aspect = vp.clientWidth / vp.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(vp.clientWidth, vp.clientHeight);
    }
  }
  window.addEventListener('resize', onResize);
}

// Expose to inline HTML handlers
window.onSliderInput = onSliderInput;
window.update = update;
window.loadPreset = loadPreset;
window.setTailType = setTailType;
window.setColor = setColor;
window.exportSTL = exportSTL;
window.snapView = snapView;
window.switchTab = switchTab;
window.dumpProfiles = dumpProfiles;
window.toggleEditors = toggleEditors;

init();
