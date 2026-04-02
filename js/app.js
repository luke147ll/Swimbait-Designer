/**
 * @file app.js
 * Entry point — scene init, renderer, camera, lights, grid, orbit controls,
 * render loop, resize handler, profile state management, and UI wiring.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { genBody, superEllipse, NS } from './engine.js';

import { buildEyes, buildHookSlot, buildWeightPocket } from './anatomy.js';
import { loadPreset as applyPreset } from './presets.js';
import { exportSTL as generateSTL } from './export-stl.js';
import { createProfileState, buildProfilesFromSliders, rebuildProfileCache } from './splines.js';
import { createSideEditor, createWidthEditor } from './editors.js';
import { createXSecEditor } from './xsec-editor.js';

let scene, cam, ren, bodyMesh, eyeGrpL, eyeGrpR, hsM, wpM, stationRing;
let tailType = 'paddle', baitColor = 0x7a8e9a;
let drag = false, px = 0, py = 0, ot = 0.55, op = 0.42, od = 9;
let editorDragging = false;

// Profile state — source of truth for body shape
const profileState = createProfileState();
let sideEditor = null, widthEditor = null, xsecEditor = null;

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
    FD: +document.getElementById('sFD').value,
    FA: +document.getElementById('sFA').value,
    EP: +document.getElementById('sEP').value,
    EV: sideEditor && sideEditor.getEyePosition ? sideEditor.getEyePosition().v : 0,
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

  [bodyMesh, eyeGrpL, eyeGrpR, hsM, wpM].forEach(m => { if (m) scene.remove(m); });

  const mat = new THREE.MeshPhysicalMaterial({
    color: baitColor, metalness: 0.05, roughness: 0.42,
    clearcoat: 0.6, clearcoatRoughness: 0.2,
    side: THREE.DoubleSide
  });

  const geo = genBody(p, profileState);
  bodyMesh = new THREE.Mesh(geo, mat);
  scene.add(bodyMesh);

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

  if (sideEditor) {
    sideEditor.setEyePosition(p.EP || p.HL * 0.6);
    sideEditor.refresh();
  }
  if (widthEditor) widthEditor.refresh();
  if (xsecEditor) xsecEditor.refresh();

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
  document.getElementById('vFD').textContent = p.FD.toFixed(2);
  document.getElementById('vFA').textContent = p.FA.toFixed(2);
  document.getElementById('vEP').textContent = (p.EP * 100).toFixed(0) + '%';
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

  rebuildProfileCache(profileState, p.CS, p.HL);
  rebuildScene();
}

function onSliderInput() {
  update();
}

// Called when cross-section keyframe changes — just rebuild the mesh
function onXSecEdit() {
  rebuildScene();
}

// Show a ring on the 3D model + marker lines on 2D editors at the given station
function showStationRing(stationIdx) {
  const tNorm = stationIdx / NS;
  if (sideEditor && sideEditor.setStationMarker) sideEditor.setStationMarker(tNorm);
  if (widthEditor && widthEditor.setStationMarker) widthEditor.setStationMarker(tNorm);
  if (stationRing) scene.remove(stationRing);
  if (stationIdx < 1 || stationIdx > NS) { stationRing = null; return; }

  const p = getParams();
  const L = p.OL, hL = L / 2;
  const x = -hL + tNorm * L;
  const dY = profileState.dorsalCache[stationIdx] * L;
  const vY = profileState.ventralCache[stationIdx] * L;
  const hW = Math.max(profileState.widthCache[stationIdx] * L, 0.004);
  const cy = (dY + vY) / 2;
  const dH = Math.max(dY - cy, 0.003);
  const vH = Math.max(cy - vY, 0.003);
  const n = profileState.nCache[stationIdx];

  // Build a line loop following the cross-section
  const pts = [];
  for (let j = 0; j <= RS; j++) {
    const angle = (j / RS) * Math.PI * 2;
    const se = superEllipse(angle, dH, vH, hW, Math.max(n, 1.8));
    pts.push(new THREE.Vector3(x, se.y + cy, se.z));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  stationRing = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xc4a04a, linewidth: 2 }));
  scene.add(stationRing);
}


// Called by editor drag — just rebuild caches from current profile data
function onProfileEdit() {
  rebuildProfileCache(profileState, +document.getElementById('sCS').value, +document.getElementById('sHL').value);
  rebuildScene();
}

function setTailType(el) {
  document.querySelectorAll(".tb").forEach(e => e.classList.remove("on"));
  el.classList.add("on");
  tailType = el.dataset.t;
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
  generateSTL([bodyMesh].filter(Boolean));
}

function dumpAll() {
  function fmtProfile(arr) {
    return '[\n' + arr.map(p =>
      `  { t: ${p.t.toFixed(4)}, v: ${p.v.toFixed(6)} }`
    ).join(',\n') + '\n]';
  }
  function fmtFin(arr) {
    return '[\n' + arr.map(p =>
      `  { x: ${p.x.toFixed(4)}, y: ${p.y.toFixed(4)} }`
    ).join(',\n') + '\n]';
  }
  const p = getParams();
  const sliders = `// ── Slider values ──
const sliders = ${JSON.stringify({
    OL: p.OL, BD: p.BD, WR: p.WR, GP: p.GP, HL: p.HL, SB: p.SB, HW: p.HW,
    DA: p.DA, BF: p.BF, BT: p.BT, CS: p.CS, SL: p.SL, SD: p.SD, SC: p.SC,
    TS: p.TS, TT: p.TT, ES: p.ES, EB: p.EB, HS: p.HS, WP: p.WP
  }, null, 2)};`;

  const out = `${sliders}

// ── Body profiles (copy into BASE_D/V/W in splines.js) ──
const dorsal = ${fmtProfile(profileState.dorsal)};
const ventral = ${fmtProfile(profileState.ventral)};
const width = ${fmtProfile(profileState.width)};

`;
  console.log(out);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(out).then(() => console.log('Copied to clipboard'));
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

// ── Panel resize drag ──
function initPanelResize() {
  const handle = document.getElementById('pnlResize');
  if (!handle) return;

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const onMove = ev => {
      const w = Math.max(260, Math.min(600, ev.clientX));
      document.documentElement.style.setProperty('--pnl-w', w + 'px');
      const vp = document.getElementById('vp');
      if (vp && vp.clientWidth > 0) {
        cam.aspect = vp.clientWidth / vp.clientHeight;
        cam.updateProjectionMatrix();
        ren.setSize(vp.clientWidth, vp.clientHeight);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Refresh editors so their hit detection uses updated bounding rects
      if (sideEditor) sideEditor.refresh();
      if (widthEditor) widthEditor.refresh();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
}

function snapView(view) {
  if (view === 'side')  { ot = Math.PI / 2; op = Math.PI / 2; }   // from +Z, level side profile
  if (view === 'top')   { ot = 0; op = 0.01; }                     // straight down
  if (view === 'front') { ot = Math.PI; op = Math.PI / 2; }        // from -X, head-on face
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
    const xsecContainer = document.getElementById('xsecEditorContainer');
    if (xsecContainer) xsecEditor = createXSecEditor(xsecContainer, profileState, onXSecEdit, showStationRing);
    initPanelResize();
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
    const xsecMob = document.getElementById('xsecEditorMob');
    if (xsecMob && !xsecMob.querySelector('svg')) xsecEditor = createXSecEditor(xsecMob, profileState, onXSecEdit, showStationRing);
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
window.dumpAll = dumpAll;
window.snapView = snapView;
window.switchTab = switchTab;
window.toggleEditors = toggleEditors;

init();
