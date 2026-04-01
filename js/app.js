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

let scene, cam, ren, bodyMesh, eyeGrpL, eyeGrpR, hsM, wpM;
let tailType = 'paddle', baitColor = 0x7a8e9a;
let drag = false, px = 0, py = 0, ot = 0.55, op = 0.42, od = 9;
let editorDragging = false;

// Profile state — source of truth for body shape
const profileState = createProfileState();
let sideEditor = null, widthEditor = null;

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
  // Regenerate profiles from sliders when in slider mode
  if (profileState.source === 'sliders') {
    const profs = buildProfilesFromSliders(p);
    profileState.dorsal = profs.dorsal;
    profileState.ventral = profs.ventral;
    profileState.width = profs.width;
  }

  // Always rebuild caches (uses current profiles + CS/HL for n-exponent)
  rebuildProfileCache(profileState, p.CS, p.HL);

  // Remove old meshes
  [bodyMesh, eyeGrpL, eyeGrpR, hsM, wpM].forEach(m => { if (m) scene.remove(m); });

  const mat = new THREE.MeshPhysicalMaterial({
    color: baitColor, metalness: 0.05, roughness: 0.42,
    clearcoat: 0.6, clearcoatRoughness: 0.2,
    side: THREE.DoubleSide
  });

  // Single unified geometry: body + face cap + tail cap
  const geo = genBody(p, profileState);
  bodyMesh = new THREE.Mesh(geo, mat);
  scene.add(bodyMesh);

  // Eyes
  const eyes = buildEyes(p, L, profileState);
  eyeGrpL = eyes.eyeGrpL;
  eyeGrpR = eyes.eyeGrpR;
  scene.add(eyeGrpL);
  scene.add(eyeGrpR);

  // Hook slot & weight pocket
  hsM = buildHookSlot(p, L);
  if (hsM) scene.add(hsM);
  wpM = buildWeightPocket(p, L);
  if (wpM) scene.add(wpM);

  // Stats — derive from profile caches
  const tailStartIdx = Math.round(0.94 * 96);
  let maxD = 0, maxW = 0;
  for (let i = 0; i <= tailStartIdx; i++) {
    const d = (profileState.dorsalCache[i] - profileState.ventralCache[i]) * L;
    const w = profileState.widthCache[i] * L * 2;
    if (d > maxD) maxD = d;
    if (w > maxW) maxW = w;
  }
  const approxVol = L * maxD * maxW * 0.35;
  const wOz = (approxVol * 1.1 * 0.035274).toFixed(1);
  document.getElementById('stats').innerHTML =
    `${L.toFixed(1)}" total length<br>${maxD.toFixed(2)}" max depth<br>${maxW.toFixed(2)}" max width<br>~${wOz} oz est.<br>${p.tail} tail`;

  // Refresh editors
  if (sideEditor) sideEditor.refresh();
  if (widthEditor) widthEditor.refresh();

  // Mode badge
  const badge = document.getElementById('profileMode');
  if (badge) {
    badge.textContent = profileState.source === 'sliders' ? 'SLIDER' : 'MANUAL';
    badge.className = 'ed-mode ' + profileState.source;
  }
}

// Called by ALL sliders — never resets profiles from slider movement.
// Profiles only regenerate on preset load or initial startup.
// Manual 2D edits are always preserved when adjusting sliders.
function onSliderInput() {
  update();
}

// Called by editor drag — forces manual mode
function onProfileEdit() {
  profileState.source = 'manual';
  update();
}

function setTailType(el) {
  document.querySelectorAll('.tb').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
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
  profileState.source = 'sliders';
  update();
}

function exportSTL() {
  generateSTL([bodyMesh].filter(Boolean));
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

  // Orbit controls
  vp.addEventListener('pointerdown', e => { drag = true; px = e.clientX; py = e.clientY; });
  window.addEventListener('pointerup', () => drag = false);
  window.addEventListener('pointermove', e => {
    if (!drag || editorDragging) return;
    ot -= (e.clientX - px) * .005;
    op = Math.max(.1, Math.min(3.0, op - (e.clientY - py) * .005));
    px = e.clientX; py = e.clientY;
    updateCamera();
  });
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    od = Math.max(3, Math.min(22, od + e.deltaY * .007));
    updateCamera();
  }, { passive: false });

  // Initialize profile editors
  const sideContainer = document.getElementById('sideEditorContainer');
  const widthContainer = document.getElementById('widthEditorContainer');
  if (sideContainer) {
    sideEditor = createSideEditor(sideContainer, profileState, onProfileEdit);
  }
  if (widthContainer) {
    widthEditor = createWidthEditor(widthContainer, profileState, onProfileEdit);
  }

  updateCamera();
  update();

  (function animate() { requestAnimationFrame(animate); ren.render(scene, cam); })();

  window.addEventListener('resize', () => {
    cam.aspect = vp.clientWidth / vp.clientHeight;
    cam.updateProjectionMatrix();
    ren.setSize(vp.clientWidth, vp.clientHeight);
  });
}

// Expose to inline HTML handlers
window.onSliderInput = onSliderInput;
window.update = update;
window.loadPreset = loadPreset;
window.setTailType = setTailType;
window.setColor = setColor;
window.exportSTL = exportSTL;
window.dumpProfiles = dumpProfiles;
window.toggleEditors = toggleEditors;

init();
