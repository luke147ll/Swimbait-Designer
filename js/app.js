/**
 * @file app.js
 * Entry point — scene, camera, lights, orbit, spline-driven tube mesh pipeline.
 *
 * The spline editors (side profile, width profile, cross-section) drive the shape.
 * A single watertight tube mesh is built from spline samples and displayed via Three.js.
 * The raw mesh data (vertProperties + triVerts) transfers to the mold generator where
 * it's fed directly to Manifold's constructor — guaranteed manifold, no boolean unions.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { superEllipse, NS, RS } from './engine.js';
import { buildEyes, buildHookSlot } from './anatomy.js';
import { loadPreset as applyPreset } from './presets.js';
import { createProfileState, buildProfilesFromSliders, rebuildProfileCache } from './splines.js';
import { createSideEditor, createWidthEditor } from './editors.js';
import { createXSecEditor } from './xsec-editor.js';
import { buildTubeMesh, verifyWinding } from './tube-mesh.js';

let scene, cam, ren, bodyMesh, eyeGrpL, eyeGrpR, hsM, stationRing;
let tailType = 'paddle', baitColor = 0x7a8e9a, showEyes = true;
let drag = false, px = 0, py = 0, ot = 0.55, op = 0.42, od = 9;

const profileState = createProfileState();
let sideEditor = null, widthEditor = null, xsecEditor = null;

// ── Camera ──

function updateCamera() {
  cam.position.set(od * Math.sin(op) * Math.cos(ot), od * Math.cos(op), od * Math.sin(op) * Math.sin(ot));
  cam.lookAt(0, -.15, 0);
}

// ── Slider reading ──

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
    CS: 2.2,
    SL: +document.getElementById('sSL').value,
    SD: +document.getElementById('sSD').value,
    SC: +document.getElementById('sSC').value,
    TS: 0.80,
    TT: +document.getElementById('sTT').value,
    FD: +document.getElementById('sFD').value,
    FA: +document.getElementById('sFA').value,
    EP: +document.getElementById('sEP').value,
    EV: sideEditor && sideEditor.getEyePosition ? sideEditor.getEyePosition().v : 0,
    ES: +document.getElementById('sES').value,
    EB: +document.getElementById('sEB').value,
    HS: +document.getElementById('sHS').value,
    WP: 0,
    tail: tailType,
    stationCount: +document.getElementById('sST').value,
  };
}

// ── Spline → Tube mesh ──

const bodyMat = new THREE.MeshPhysicalMaterial({
  color: baitColor, metalness: 0.05, roughness: 0.42,
  clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide,
});

// Current tube mesh data for mold transfer (raw arrays, mm units)
let currentMeshData = null;

/**
 * Spline sample functions — read cached profiles, return mm values.
 * These closures capture the current profileState and OL at call time.
 */
function makeSplineSamplers() {
  const p = getParams();
  const OL = p.OL;

  function getDorsal(t) {
    const i = Math.round(t * NS);
    return profileState.dorsalCache[Math.min(i, NS)] * OL * 25.4;
  }
  function getVentral(t) {
    const i = Math.round(t * NS);
    return Math.abs(profileState.ventralCache[Math.min(i, NS)]) * OL * 25.4;
  }
  function getWidth(t) {
    const i = Math.round(t * NS);
    return profileState.widthCache[Math.min(i, NS)] * OL * 25.4;
  }

  return { getDorsal, getVentral, getWidth, lengthMM: OL * 25.4 };
}

/**
 * Build the tube mesh from spline profiles and update the viewport.
 * Single watertight mesh — no ellipsoid union, no seam, no collapsed caps.
 */
function rebuildTubePreview() {
  const p = getParams();
  const tubeNS = p.stationCount || 40;
  const tubeRS = 32;

  const { getDorsal, getVentral, getWidth, lengthMM } = makeSplineSamplers();
  const { vertProperties, triVerts, vertCount, triCount } = buildTubeMesh(
    getDorsal, getVentral, getWidth, lengthMM, tubeNS, tubeRS
  );

  // Verify winding before display
  verifyWinding(vertProperties, triVerts);

  // Store raw mesh data for mold transfer
  currentMeshData = { vertProperties, triVerts, vertCount, triCount };

  // Convert to Three.js BufferGeometry (mm units, scaled to viewport inches)
  const positions = new Float32Array(vertCount * 3);
  const scale = 1 / 25.4; // mm → inches for viewport
  for (let i = 0; i < vertCount * 3; i++) {
    positions[i] = vertProperties[i] * scale;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(triVerts, 1));
  geo.computeVertexNormals();

  // Dispose old mesh, create new one
  if (bodyMesh) {
    if (bodyMesh.geometry) bodyMesh.geometry.dispose();
    scene.remove(bodyMesh);
  }

  bodyMat.color.set(baitColor);
  bodyMesh = new THREE.Mesh(geo, bodyMat);
  scene.add(bodyMesh);
  window.bodyMesh = bodyMesh;
}

// ── Scene rebuild ──

function rebuildScene() {
  const p = getParams();
  const L = p.OL;

  // Remove old accessories
  [eyeGrpL, eyeGrpR, hsM].forEach(m => { if (m) scene.remove(m); });

  // Rebuild tube mesh body
  rebuildTubePreview();

  // Eyes
  if (showEyes) {
    const eyes = buildEyes(p, L, profileState);
    eyeGrpL = eyes.eyeGrpL;
    eyeGrpR = eyes.eyeGrpR;
    scene.add(eyeGrpL);
    scene.add(eyeGrpR);
  } else {
    eyeGrpL = null;
    eyeGrpR = null;
  }

  // Hook slot
  hsM = buildHookSlot(p, L);
  if (hsM) scene.add(hsM);

  // Stats
  let maxD = 0, maxW = 0;
  for (let i = 0; i <= 96; i++) {
    const d = (profileState.dorsalCache[i] - profileState.ventralCache[i]) * L;
    const w = profileState.widthCache[i] * L * 2;
    if (d > maxD) maxD = d;
    if (w > maxW) maxW = w;
  }
  const approxVol = L * maxD * maxW * 0.35;
  const wOz = (approxVol * 1.1 * 0.035274).toFixed(1);
  const stCount = p.stationCount || 20;
  document.getElementById('stats').innerHTML =
    `${L.toFixed(1)}" length<br>${maxD.toFixed(2)}" depth<br>${maxW.toFixed(2)}" width<br>~${wOz} oz<br>${stCount} stations`;

  // Refresh editors
  if (sideEditor) {
    sideEditor.setEyePosition(p.EP || p.HL * 0.6);
    sideEditor.refresh();
  }
  if (widthEditor) widthEditor.refresh();
  if (xsecEditor) xsecEditor.refresh();

  // Profile mode badge
  const badge = document.getElementById('profileMode');
  if (badge) {
    const hasDeltas = profileState.dDelta.some(d => Math.abs(d) > 0.0001) ||
                      profileState.vDelta.some(d => Math.abs(d) > 0.0001) ||
                      profileState.wDelta.some(d => Math.abs(d) > 0.0001);
    badge.textContent = hasDeltas ? 'EDITED' : 'BASE';
    badge.className = 'ed-mode ' + (hasDeltas ? 'manual' : 'sliders');
  }
}

// ── Update (slider change) ──

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
  document.getElementById('vSL').textContent = Math.round(p.SL * 100) + '%';
  document.getElementById('vSD').textContent = p.SD.toFixed(2);
  document.getElementById('vSC').textContent = p.SC.toFixed(2);
  document.getElementById('vTT').textContent = p.TT.toFixed(2);
  document.getElementById('vFD').textContent = p.FD.toFixed(2);
  document.getElementById('vFA').textContent = p.FA.toFixed(2);
  document.getElementById('vEP').textContent = (p.EP * 100).toFixed(0) + '%';
  document.getElementById('vES').textContent = p.ES.toFixed(2);
  document.getElementById('vEB').textContent = p.EB.toFixed(2);
  document.getElementById('vHS').textContent = p.HS.toFixed(2);
  document.getElementById('vST').textContent = p.stationCount;

  // Regenerate profiles from sliders + manual deltas
  const base = buildProfilesFromSliders(p);
  while (profileState.dDelta.length < base.dorsal.length) profileState.dDelta.push(0);
  while (profileState.vDelta.length < base.ventral.length) profileState.vDelta.push(0);
  while (profileState.wDelta.length < base.width.length) profileState.wDelta.push(0);

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

function onXSecEdit() {
  rebuildScene();
}

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

  const bump = 1.03;
  const pts = [];
  for (let j = 0; j <= RS; j++) {
    const angle = (j / RS) * Math.PI * 2;
    const se = superEllipse(angle, dH * bump, vH * bump, hW * bump, Math.max(n, 1.8));
    pts.push(new THREE.Vector3(x, se.y + cy, se.z));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0xc4a04a, depthTest: false, transparent: true, opacity: 0.8 });
  stationRing = new THREE.LineLoop(geo, mat);
  stationRing.renderOrder = 999;
  scene.add(stationRing);
}

function onProfileEdit() {
  const base = buildProfilesFromSliders(getParams());
  for (let i = 0; i < base.dorsal.length; i++) {
    profileState.dDelta[i] = (profileState.dorsal[i]?.v ?? base.dorsal[i].v) - base.dorsal[i].v;
    profileState.vDelta[i] = (profileState.ventral[i]?.v ?? base.ventral[i].v) - base.ventral[i].v;
    profileState.wDelta[i] = (profileState.width[i]?.v ?? base.width[i].v) - base.width[i].v;
  }
  rebuildProfileCache(profileState, 2.2, +document.getElementById('sHL').value);
  rebuildScene();
}

// ── UI handlers ──

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
  profileState.dDelta = [];
  profileState.vDelta = [];
  profileState.wDelta = [];
  update();
}

function snapView(view) {
  if (view === 'side')  { ot = Math.PI / 2; op = Math.PI / 2; }
  if (view === 'top')   { ot = 0; op = 0.01; }
  if (view === 'front') { ot = Math.PI; op = Math.PI / 2; }
  updateCamera();
}

function toggleEditors() {
  const el = document.getElementById('editors');
  const arrow = document.getElementById('edToggleArrow');
  const visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : 'block';
  arrow.textContent = visible ? '▸' : '▾';
}

function switchTab(btn) {
  const viewId = btn.dataset.view;
  const pnl = document.getElementById('pnlControls');
  document.querySelectorAll('.mob-view').forEach(el => el.classList.remove('active'));
  if (viewId === 'home') {
    if (pnl) pnl.style.display = 'flex';
  } else {
    if (pnl) pnl.style.display = 'none';
    if (window._initMobEditors) window._initMobEditors();
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  setTimeout(() => {
    const vp = document.getElementById('vp');
    if (vp && vp.clientWidth > 0) {
      cam.aspect = vp.clientWidth / vp.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(vp.clientWidth, vp.clientHeight);
    }
  }, 50);
}

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
      if (sideEditor) sideEditor.refresh();
      if (widthEditor) widthEditor.refresh();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
}

// ── Init ──

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const d1 = new THREE.DirectionalLight(0xfff0dd, 0.9); d1.position.set(4, 10, 6); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x99aacc, 0.4); d2.position.set(-5, 3, -4); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xffffff, 0.25); d3.position.set(0, -4, 2); scene.add(d3);

  const g = new THREE.GridHelper(16, 32, 0x252522, 0x1a1a17); g.position.y = -2.2; scene.add(g);

  // ── Orbit controls: mouse ──
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
    if (e.target.closest('.view-btns')) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      drag = true; px = e.touches[0].clientX; py = e.touches[0].clientY;
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

  // Touch hints
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hint = document.getElementById('rhHint');
  if (hint && isTouch) hint.textContent = 'Drag to orbit / pinch to zoom';
  const edHint = document.getElementById('edHint');
  if (edHint && isTouch) edHint.textContent = 'Tap point to drag / pinch to zoom';

  // ── Initialize spline editors ──
  const isMobile = window.innerWidth <= 480;

  if (!isMobile) {
    const sideContainer = document.getElementById('sideEditorContainer');
    const widthContainer = document.getElementById('widthEditorContainer');
    if (sideContainer) sideEditor = createSideEditor(sideContainer, profileState, onProfileEdit);
    if (widthContainer) widthEditor = createWidthEditor(widthContainer, profileState, onProfileEdit);
    const xsecContainer = document.getElementById('xsecEditorContainer');
    if (xsecContainer) xsecEditor = createXSecEditor(xsecContainer, profileState, onXSecEdit, showStationRing);
    initPanelResize();
  }

  // Phone: create editors lazily
  let mobEditorsCreated = false;
  window._initMobEditors = function() {
    if (mobEditorsCreated) return;
    const sideMob = document.getElementById('sideEditorMob');
    const widthMob = document.getElementById('widthEditorMob');
    if (sideMob && !sideMob.querySelector('svg')) sideEditor = createSideEditor(sideMob, profileState, onProfileEdit);
    if (widthMob && !widthMob.querySelector('svg')) widthEditor = createWidthEditor(widthMob, profileState, onProfileEdit);
    const xsecMob = document.getElementById('xsecEditorMob');
    if (xsecMob && !xsecMob.querySelector('svg')) xsecEditor = createXSecEditor(xsecMob, profileState, onXSecEdit, showStationRing);
    mobEditorsCreated = true;
  };

  updateCamera();
  update(); // initial build from default slider values

  if (xsecEditor) {
    const defaultStation = xsecEditor.getStation ? xsecEditor.getStation() : 33;
    showStationRing(defaultStation);
  }

  // Check auth
  initAuth();

  (function animate() { requestAnimationFrame(animate); ren.render(scene, cam); })();

  window.addEventListener('resize', () => {
    if (vp.clientWidth > 0 && vp.clientHeight > 0) {
      cam.aspect = vp.clientWidth / vp.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(vp.clientWidth, vp.clientHeight);
    }
  });
}

// ── Auth + save/load ──

let currentUser = null;
let currentDesignId = null;
let currentDesignName = '';
let isReadOnly = false;

function showLoggedInUI(user) {
  currentUser = user;
  const mono = (user.displayName || user.username).slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('phAvatar');
  const monoEl = document.getElementById('phMonogram');
  const signinEl = document.getElementById('authSignin');
  const userEl = document.getElementById('authUser');
  const usernameEl = document.getElementById('authUsername');
  if (avatarEl) avatarEl.style.display = 'flex';
  if (monoEl) monoEl.textContent = mono;
  if (signinEl) signinEl.style.display = 'none';
  if (userEl) userEl.style.display = 'block';
  if (usernameEl) usernameEl.textContent = 'Signed in as ' + user.username;
}

function showLoggedOutUI() {
  const avatarEl = document.getElementById('phAvatar');
  const signinEl = document.getElementById('authSignin');
  const userEl = document.getElementById('authUser');
  if (avatarEl) avatarEl.style.display = 'none';
  if (signinEl) signinEl.style.display = 'block';
  if (userEl) userEl.style.display = 'none';
}

function showReadOnlyMode() {
  isReadOnly = true;
  const banner = document.getElementById('readonlyBanner');
  if (banner) banner.style.display = 'flex';
  document.getElementById('authSignin')?.style && (document.getElementById('authSignin').style.display = 'none');
  document.getElementById('authUser')?.style && (document.getElementById('authUser').style.display = 'none');
}

function toggleDesignerMenu() {
  document.getElementById('phAvatarMenu').classList.toggle('open');
}
document.addEventListener('click', e => {
  const menu = document.getElementById('phAvatarMenu');
  if (menu && !e.target.closest('.ph-avatar')) menu.classList.remove('open');
});

async function logoutDesigner() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.reload();
}

// ── Design state ──

function getDesignState() {
  const p = getParams();
  return JSON.stringify({
    sliders: p,
    dorsal: profileState.dorsal,
    ventral: profileState.ventral,
    width: profileState.width,
    dDelta: profileState.dDelta,
    vDelta: profileState.vDelta,
    wDelta: profileState.wDelta,
    xsecKeyframes: profileState.xsecKeyframes,
    xsecBlendRadii: profileState.xsecBlendRadii,
    tailType,
    baitColor,
  });
}

function loadDesignState(state) {
  if (state.sliders) {
    for (const [key, val] of Object.entries(state.sliders)) {
      const el = document.getElementById('s' + key);
      if (el) el.value = val;
    }
  }
  if (state.tailType) tailType = state.tailType;
  if (state.baitColor) baitColor = state.baitColor;
  if (state.dDelta) profileState.dDelta = state.dDelta;
  if (state.vDelta) profileState.vDelta = state.vDelta;
  if (state.wDelta) profileState.wDelta = state.wDelta;
  if (state.xsecKeyframes) profileState.xsecKeyframes = state.xsecKeyframes;
  if (state.xsecBlendRadii) profileState.xsecBlendRadii = state.xsecBlendRadii;
  update();
}

async function initAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      showLoggedInUI(user);
    } else {
      showLoggedOutUI();
    }
  } catch {
    showLoggedOutUI();
  }

  if (currentUser) {
    const stashed = localStorage.getItem('sd_pending_design');
    if (stashed) {
      localStorage.removeItem('sd_pending_design');
      try {
        const state = JSON.parse(stashed);
        loadDesignState(state);
        const nameInput = document.getElementById('designNameInput');
        if (nameInput && !nameInput.value) nameInput.value = 'Untitled design';
      } catch {}
    }
  }

  const shareMatch = window.location.pathname.match(/^\/d\/([\w-]+)$/);
  if (shareMatch) {
    await loadSharedDesign(shareMatch[1]);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const designId = params.get('design');
  if (designId) await loadDesignFromAPI(designId);
}

async function saveDesign() {
  if (!currentUser) {
    try { localStorage.setItem('sd_pending_design', getDesignState()); } catch {}
    window.location = '/login';
    return;
  }
  const btn = document.getElementById('saveBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    ren.render(scene, cam);
    const thumbnail = ren.domElement.toDataURL('image/jpeg', 0.7);
    const p = getParams();
    const nameInput = document.getElementById('designNameInput');
    const name = nameInput.value.trim() || 'Untitled design';
    const body = {
      name,
      species: 'custom',
      tailType,
      length: p.OL,
      stateJSON: getDesignState(),
      thumbnail,
    };
    const url = currentDesignId ? `/api/designs/${currentDesignId}` : '/api/designs';
    const method = currentDesignId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      const data = await res.json();
      currentDesignId = data.id;
      currentDesignName = name;
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save design'; }, 1500);
    } else {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Save design'; }, 2000);
    }
  } catch {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Save design'; }, 2000);
  }
  btn.disabled = false;
}

async function loadDesignFromAPI(designId) {
  try {
    const res = await fetch(`/api/designs/${designId}`, { credentials: 'include' });
    if (!res.ok) { window.history.replaceState({}, '', '/'); return; }
    const design = await res.json();
    const state = JSON.parse(design.stateJSON);
    loadDesignState(state);
    currentDesignId = design.id;
    currentDesignName = design.name;
    const nameInput = document.getElementById('designNameInput');
    if (nameInput) nameInput.value = design.name;
  } catch {
    window.history.replaceState({}, '', '/');
  }
}

async function loadSharedDesign(designId) {
  try {
    const res = await fetch(`/api/public/${designId}`);
    if (!res.ok) return;
    const design = await res.json();
    const state = JSON.parse(design.stateJSON);
    loadDesignState(state);
    showReadOnlyMode();
    window._sharedDesignState = design;
  } catch {}
}

async function forkDesign() {
  if (!currentUser) { window.location = '/login'; return; }
  const shared = window._sharedDesignState;
  if (!shared) return;
  const body = {
    name: (shared.name || 'Shared design') + ' (fork)',
    species: shared.species || 'custom',
    tailType: shared.tailType || 'paddle',
    length: shared.length || 8,
    stateJSON: shared.stateJSON,
  };
  const res = await fetch('/api/designs', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) {
    const data = await res.json();
    window.location = `/?design=${data.id}`;
  }
}

// ── Mold generator transfer — sends station data ──

async function sendToMoldGenerator() {
  if (!currentMeshData) {
    alert('No mesh data — adjust sliders first.');
    return;
  }

  const payload = JSON.stringify({
    type: 'manifold_mesh',
    name: currentDesignName || 'designed_bait',
    numProp: 3,
    vertProperties: Array.from(currentMeshData.vertProperties),
    triVerts: Array.from(currentMeshData.triVerts),
  });

  try {
    const res = await fetch('/api/mold-transfer', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error('Upload failed: ' + res.status);
    const data = await res.json();
    console.log('[SBD] Mesh uploaded, token:', data.token);

    const moldUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? `http://localhost:5173?transfer=${data.token}`
      : `https://mold.swimbaitdesigner.com?transfer=${data.token}`;
    window.open(moldUrl, '_blank');
  } catch (e) {
    console.error('[SBD] Transfer failed:', e);
    alert('Failed to transfer bait.');
  }
}

// ── Expose to HTML ──

window.onSliderInput = onSliderInput;
window.setColor = setColor;
window.loadPreset = loadPreset;
window.snapView = snapView;
window.switchTab = switchTab;
window.toggleEditors = toggleEditors;
window.saveDesign = saveDesign;
window.sendToMoldGenerator = sendToMoldGenerator;
window.toggleDesignerMenu = toggleDesignerMenu;
window.logoutDesigner = logoutDesigner;
window.forkDesign = forkDesign;
window.toggleEyes = function(btn) {
  showEyes = !showEyes;
  btn.textContent = showEyes ? 'On' : 'Off';
  btn.classList.toggle('on', showEyes);
  document.getElementById('eyeSliders').style.display = showEyes ? 'block' : 'none';
  rebuildScene();
};
window.stashAndLogin = function(e) {
  e.preventDefault();
  try { localStorage.setItem('sd_pending_design', getDesignState()); } catch {}
  window.location = '/login';
};
window.profileState = profileState;

init();
