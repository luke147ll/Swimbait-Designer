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
import { superEllipse, getXSecAtRing, defaultXSecPoly, NS, RS } from './engine.js';
import { buildEyes, buildHookSlot } from './anatomy.js';
import { loadPreset as applyPreset } from './presets.js';
import { createProfileState, buildProfilesFromSliders, rebuildProfileCache } from './splines.js';
import { createSideEditor, createWidthEditor } from './editors.js';
import { createXSecEditor } from './xsec-editor.js';
import { buildTubeMesh, verifyWinding, RESOLUTION_PRESETS } from './tube-mesh.js';
import { importSTL } from './stl-import.js';

let scene, cam, ren, bodyMesh, eyeGrpL, eyeGrpR, hsM, stationRing;
let ghostMesh = null;
let importedMeshData = null;
let importedFileName = '';
let importedRawVerts = null; // raw parsed vertices for re-extracting after flip/rotate
let tailType = 'paddle', baitColor = 0x7a8e9a, showEyes = true;
let drag = false, px = 0, py = 0, ot = 0.55, op = 0.42, od = 9;
let currentResolution = 'high';
let hiResTimer = null;

const profileState = createProfileState();
let sideEditor = null, widthEditor = null, xsecEditor = null;

// ── Slot insert system ──

let slots = [
  { id: 'slot_1', label: 'Slot 1', enabled: false, width: 2.5, length: 20, depth: 'through', positionX: 0, positionY: 0, positionZ: 0 },
];
let slotMeshes = []; // Three.js preview meshes

const slotMat = new THREE.MeshBasicMaterial({
  color: 0xcc6644, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false,
});

function rebuildSlotPreview() {
  // Remove old slot meshes
  for (const m of slotMeshes) { if (m.geometry) m.geometry.dispose(); scene.remove(m); }
  slotMeshes = [];

  const p = getParams();
  const OL_mm = p.OL * 25.4;
  const scale = 1 / 25.4;

  for (const slot of slots) {
    if (!slot.enabled) continue;

    // Determine depth in mm
    let depthMM = 50; // through — oversized
    if (slot.depth !== 'through') depthMM = slot.depth;

    // Box: width(X-viewport=Z-mesh) × length(Y-viewport=X-mesh) × depth(Z-viewport=Y-mesh)
    // Mesh convention: X=length, Y=height, Z=width
    // Slot: thin in Z (width axis), long in X (body axis), tall in Y (depth)
    const geo = new THREE.BoxGeometry(
      slot.length * scale,  // X — along body
      depthMM * scale,      // Y — vertical (depth)
      slot.width * scale    // Z — across bait (thin)
    );

    const mesh = new THREE.Mesh(geo, slotMat);
    mesh.position.set(
      slot.positionY * scale,  // body axis position
      slot.positionZ * scale,  // vertical offset
      slot.positionX * scale   // lateral offset
    );
    mesh.renderOrder = 10;
    scene.add(mesh);
    slotMeshes.push(mesh);
  }
}

function renderSlotUI() {
  const container = document.getElementById('slotList');
  if (!container) return;
  container.innerHTML = '';

  slots.forEach((slot, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'border-bottom:1px solid var(--bd);padding:8px 0';

    const p = getParams();
    const halfLen = (p.OL * 25.4) / 2;

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:10px;color:var(--ac);text-transform:uppercase;letter-spacing:1px">${slot.label}</span>
        <span style="display:flex;gap:6px;align-items:center">
          <button class="tb${slot.enabled ? ' on' : ''}" style="padding:3px 8px;font-size:9px"
            onclick="toggleSlot(${idx})">${slot.enabled ? 'On' : 'Off'}</button>
          ${slots.length > 1 ? `<span style="color:var(--mu);font-size:10px;cursor:pointer" onclick="removeSlot(${idx})">×</span>` : ''}
        </span>
      </div>
    `;

    if (slot.enabled) {
      const controls = document.createElement('div');
      controls.innerHTML = `
        <div class="c"><div class="cr"><label>Width</label><span class="v">${slot.width.toFixed(1)}</span></div>
          <input type="range" min="1.0" max="8.0" step="0.1" value="${slot.width}" oninput="updateSlot(${idx},'width',this.value)"></div>
        <div class="c"><div class="cr"><label>Length</label><span class="v">${slot.length.toFixed(1)}</span></div>
          <input type="range" min="5" max="80" step="0.5" value="${slot.length}" oninput="updateSlot(${idx},'length',this.value)"></div>
        <div class="c"><div class="cr"><label>Depth</label><span class="v">${slot.depth === 'through' ? 'Through' : slot.depth.toFixed(1)}</span></div>
          <select onchange="updateSlot(${idx},'depth',this.value)" style="width:100%;padding:4px;background:var(--sf2);border:1px solid var(--bd);color:var(--tx);font-family:'DM Mono',monospace;font-size:10px;border-radius:3px">
            <option value="through" ${slot.depth === 'through' ? 'selected' : ''}>Through</option>
            <option value="5" ${slot.depth === 5 ? 'selected' : ''}>Custom</option>
          </select></div>
        ${slot.depth !== 'through' ? `<div class="c"><div class="cr"><label>Depth mm</label><span class="v">${slot.depth}</span></div>
          <input type="range" min="2" max="30" step="0.5" value="${slot.depth}" oninput="updateSlot(${idx},'depth',this.value)"></div>` : ''}
        <div class="c"><div class="cr"><label>Position Y</label><span class="v">${slot.positionY.toFixed(1)}</span></div>
          <input type="range" min="${-halfLen}" max="${halfLen}" step="0.5" value="${slot.positionY}" oninput="updateSlot(${idx},'positionY',this.value)"></div>
        <div class="c"><div class="cr"><label>Position Z</label><span class="v">${slot.positionZ.toFixed(1)}</span></div>
          <input type="range" min="-15" max="15" step="0.5" value="${slot.positionZ}" oninput="updateSlot(${idx},'positionZ',this.value)"></div>
      `;
      div.appendChild(controls);
    }

    container.appendChild(div);
  });
}

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
    HS: 0,
    WP: 0,
    tail: tailType,
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
function rebuildTubePreview(resolution) {
  const res = RESOLUTION_PRESETS[resolution || currentResolution] || RESOLUTION_PRESETS.high;
  const tubeNS = res.NS;
  const tubeRS = res.RS;

  // Cross-section callback: always returns a polygon.
  // Uses keyframe blend when available, otherwise the default super-ellipse.
  const getXSec = (ringIndex96) => {
    const kf = getXSecAtRing(ringIndex96, profileState);
    if (kf) return kf;
    const n = profileState.nCache[ringIndex96] || 2.2;
    return defaultXSecPoly(n);
  };

  const { getDorsal, getVentral, getWidth, lengthMM } = makeSplineSamplers();
  const { vertProperties, triVerts, vertCount, triCount } = buildTubeMesh(
    getDorsal, getVentral, getWidth, lengthMM, tubeNS, tubeRS, getXSec
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

function rebuildScene(resolution) {
  const p = getParams();
  const L = p.OL;

  // Remove old accessories
  [eyeGrpL, eyeGrpR, hsM].forEach(m => { if (m) scene.remove(m); });

  // Rebuild tube mesh body
  rebuildTubePreview(resolution);

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

  // Hook slot (legacy — replaced by slot insert system)
  // hsM = buildHookSlot(p, L);
  // if (hsM) scene.add(hsM);

  // Slot inserts
  rebuildSlotPreview();

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
  const res = RESOLUTION_PRESETS[currentResolution] || RESOLUTION_PRESETS.high;
  document.getElementById('stats').innerHTML =
    `${L.toFixed(1)}" length<br>${maxD.toFixed(2)}" depth<br>${maxW.toFixed(2)}" width<br>~${wOz} oz<br>${currentResolution} (${res.NS}×${res.RS})`;

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

function update(resolution) {
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
  rebuildScene(resolution);
  if (resolution === 'draft') rebuildDraftThenUpgrade();
}

/** Rebuild at draft resolution immediately, then upgrade to user's chosen resolution after 1s idle. */
function rebuildDraftThenUpgrade() {
  clearTimeout(hiResTimer);
  // Use draft resolution for responsive editing
  rebuildTubePreview('draft');
  // Schedule hi-res rebuild after editing stops
  hiResTimer = setTimeout(() => {
    rebuildTubePreview(currentResolution);
  }, 1000);
}

function onSliderInput() {
  update('draft');
}

function onXSecEdit() {
  rebuildScene('draft');
  rebuildDraftThenUpgrade();
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
  rebuildScene('draft');
  rebuildDraftThenUpgrade();
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
  renderSlotUI();

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
    slots,
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
  if (state.slots) { slots = state.slots; renderSlotUI(); }
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

  const enabledSlots = slots.filter(s => s.enabled).map(s => ({
    width: s.width, length: s.length, depth: s.depth,
    positionX: s.positionX, positionY: s.positionY, positionZ: s.positionZ,
  }));

  const payload = JSON.stringify({
    type: 'manifold_mesh',
    name: currentDesignName || 'designed_bait',
    numProp: 3,
    vertProperties: Array.from(currentMeshData.vertProperties),
    triVerts: Array.from(currentMeshData.triVerts),
    slots: enabledSlots,
  });

  // Open window immediately (before async fetch) to satisfy mobile popup blocker
  const moldBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5173'
    : 'https://mold.swimbaitdesigner.com';
  const moldWindow = window.open(moldBase + '/loading', '_blank');

  try {
    const res = await fetch('/api/mold-transfer', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error('Upload failed: ' + res.status);
    const data = await res.json();
    console.log('[SBD] Mesh uploaded, token:', data.token);

    const moldUrl = moldBase + '?transfer=' + data.token;
    if (moldWindow) {
      moldWindow.location.href = moldUrl;
    } else {
      // Fallback if popup was still blocked — navigate current tab
      window.location.href = moldUrl;
    }
  } catch (e) {
    console.error('[SBD] Transfer failed:', e);
    if (moldWindow) moldWindow.close();
    alert('Failed to transfer bait.');
  }
}

// ── Slot handlers ──

window.toggleSlot = function(idx) {
  slots[idx].enabled = !slots[idx].enabled;
  renderSlotUI();
  rebuildSlotPreview();
};
window.updateSlot = function(idx, key, val) {
  if (key === 'depth' && val === 'through') {
    slots[idx].depth = 'through';
    renderSlotUI(); // structural change — rebuild DOM
  } else if (key === 'depth' && slots[idx].depth === 'through') {
    slots[idx].depth = parseFloat(val) || 5;
    renderSlotUI(); // switching from through to custom — rebuild DOM
  } else {
    if (key === 'depth') {
      slots[idx].depth = parseFloat(val);
    } else {
      slots[idx][key] = parseFloat(val);
    }
    // Update display span without rebuilding DOM (preserves slider drag)
    const input = event && event.target;
    if (input && input.parentElement) {
      const span = input.parentElement.querySelector('.v');
      if (span) span.textContent = key === 'depth' ? parseFloat(val).toFixed(1) : parseFloat(val).toFixed(1);
    }
  }
  rebuildSlotPreview();
};
window.addSlot = function() {
  const id = 'slot_' + Date.now().toString(36);
  slots.push({ id, label: 'Slot ' + (slots.length + 1), enabled: true, width: 2.5, length: 20, depth: 'through', positionX: 0, positionY: 0, positionZ: 0 });
  renderSlotUI();
  rebuildSlotPreview();
};
window.removeSlot = function(idx) {
  if (slots.length <= 1) return;
  slots.splice(idx, 1);
  slots.forEach((s, i) => s.label = 'Slot ' + (i + 1));
  renderSlotUI();
  rebuildSlotPreview();
};

// ── STL import — unified: extract splines + ghost overlay ──

/** Run spline extraction on importedRawVerts and rebuild everything. */
function runSplineExtraction() {
  if (!importedRawVerts || importedRawVerts.length === 0) return;

  // Build a buffer from the raw verts for importSTL
  // importSTL expects an ArrayBuffer (STL file), but we already have parsed verts.
  // Call the extraction logic directly instead.
  const verts = importedRawVerts;

  // Find bounds (verts are already in inches, remapped)
  let minX = Infinity, maxX = -Infinity;
  for (const v of verts) { if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x; }
  const lengthInches = maxX - minX;

  // Slice at stations
  const stationCount = 24;
  const tol = lengthInches / stationCount * 0.5;
  const stations = [];
  for (let i = 0; i <= stationCount; i++) {
    const t = i / stationCount;
    const sx = minX + t * lengthInches;
    const nearby = verts.filter(v => Math.abs(v.x - sx) < tol);
    if (nearby.length < 3) { stations.push({ t, dH: 0, vD: 0, hW: 0, n: 0 }); continue; }
    let maxY = -Infinity, minY = Infinity, maxZ = -Infinity, minZ = Infinity;
    for (const v of nearby) { if (v.y > maxY) maxY = v.y; if (v.y < minY) minY = v.y; if (v.z > maxZ) maxZ = v.z; if (v.z < minZ) minZ = v.z; }
    const cy = (maxY + minY) / 2;
    stations.push({ t, dH: maxY - cy, vD: cy - minY, hW: (maxZ - minZ) / 2, n: nearby.length });
  }
  // Interpolate gaps
  for (let i = 0; i < stations.length; i++) {
    if (stations[i].n > 0) continue;
    let prev = null, next = null;
    for (let j = i - 1; j >= 0; j--) { if (stations[j].n > 0) { prev = stations[j]; break; } }
    for (let j = i + 1; j < stations.length; j++) { if (stations[j].n > 0) { next = stations[j]; break; } }
    if (prev && next) { const b = (stations[i].t - prev.t) / (next.t - prev.t); stations[i].dH = prev.dH + (next.dH - prev.dH) * b; stations[i].vD = prev.vD + (next.vD - prev.vD) * b; stations[i].hW = prev.hW + (next.hW - prev.hW) * b; }
    else if (prev) { stations[i].dH = prev.dH; stations[i].vD = prev.vD; stations[i].hW = prev.hW; }
    else if (next) { stations[i].dH = next.dH; stations[i].vD = next.vD; stations[i].hW = next.hW; }
  }

  // Build control points (reduce by curvature)
  function reduce(samples, maxPts) {
    if (samples.length <= maxPts) return samples;
    const result = [samples[0]];
    const curvatures = [];
    for (let i = 1; i < samples.length - 1; i++) curvatures.push({ i, c: Math.abs(samples[i - 1].v - 2 * samples[i].v + samples[i + 1].v) });
    curvatures.sort((a, b) => b.c - a.c);
    for (const idx of curvatures.slice(0, maxPts - 2).map(c => c.i).sort((a, b) => a - b)) result.push(samples[idx]);
    result.push(samples[samples.length - 1]);
    return result;
  }

  const dPts = reduce(stations.map(s => ({ t: s.t, v: s.dH / lengthInches })), 13);
  const vPts = reduce(stations.map(s => ({ t: s.t, v: -s.vD / lengthInches })), 13);
  const wPts = reduce(stations.map(s => ({ t: s.t, v: s.hW / lengthInches })), 13);
  dPts[0].locked = true; dPts[dPts.length - 1].locked = true;
  vPts[0].locked = true; vPts[vPts.length - 1].locked = true;
  wPts[0].locked = true; wPts[wPts.length - 1].locked = true;

  profileState.dorsal = dPts;
  profileState.ventral = vPts;
  profileState.width = wPts;
  profileState.dDelta = [];
  profileState.vDelta = [];
  profileState.wDelta = [];

  // Set OL slider
  const olSlider = document.getElementById('sOL');
  if (olSlider) olSlider.value = Math.min(14, Math.max(3, lengthInches)).toFixed(2);

  // Ghost overlay from raw verts
  if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.geometry.dispose(); }
  const ghostVerts = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) { ghostVerts[i * 3] = verts[i].x; ghostVerts[i * 3 + 1] = verts[i].y; ghostVerts[i * 3 + 2] = verts[i].z; }
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute('position', new THREE.Float32BufferAttribute(ghostVerts, 3));
  ghostGeo.computeVertexNormals();
  ghostMesh = new THREE.Mesh(ghostGeo, new THREE.MeshStandardMaterial({
    color: 0xcc6644, transparent: true, opacity: 0.2, roughness: 0.8, depthWrite: false, side: THREE.DoubleSide,
  }));
  scene.add(ghostMesh);

  const ghostBtn = document.getElementById('ghostToggle');
  if (ghostBtn) { ghostBtn.style.display = 'inline-block'; ghostBtn.textContent = 'Ghost: On'; ghostBtn.classList.add('on'); }
  const badge = document.getElementById('profileMode');
  if (badge) { badge.textContent = 'IMPORTED'; badge.className = 'ed-mode manual'; }

  rebuildProfileCache(profileState, 2.2, 0.24);
  update();
  if (sideEditor) sideEditor.refresh();
  if (widthEditor) widthEditor.refresh();
}

window.importSTLFile = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.stl';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const result = importSTL(buffer, profileState, rebuildProfileCache, rebuildScene);

    // Store raw verts for flip/rotate re-extraction
    importedRawVerts = result._rawVerts || [];
    importedFileName = file.name;

    // Set OL slider
    const olSlider = document.getElementById('sOL');
    if (olSlider) olSlider.value = Math.min(14, Math.max(3, result.lengthInches)).toFixed(2);

    // Ghost overlay
    if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.geometry.dispose(); }
    const ghostGeo = new THREE.BufferGeometry();
    ghostGeo.setAttribute('position', new THREE.Float32BufferAttribute(result.ghostVerts, 3));
    ghostGeo.computeVertexNormals();
    ghostMesh = new THREE.Mesh(ghostGeo, new THREE.MeshStandardMaterial({
      color: 0xcc6644, transparent: true, opacity: 0.2, roughness: 0.8, depthWrite: false, side: THREE.DoubleSide,
    }));
    scene.add(ghostMesh);

    const badge = document.getElementById('profileMode');
    if (badge) { badge.textContent = 'IMPORTED'; badge.className = 'ed-mode manual'; }
    const ghostBtn = document.getElementById('ghostToggle');
    if (ghostBtn) { ghostBtn.style.display = 'inline-block'; ghostBtn.textContent = 'Ghost: On'; ghostBtn.classList.add('on'); }
    const orientCtrl = document.getElementById('importOrientControls');
    if (orientCtrl) orientCtrl.style.display = 'block';

    update();
    if (sideEditor) sideEditor.refresh();
    if (widthEditor) widthEditor.refresh();
    console.log(`[STL Import] Done — ${result.lengthInches.toFixed(1)}" bait from ${file.name}`);
  };
  input.click();
};

window.flipImport = function(axis) {
  if (!importedRawVerts) return;
  for (const v of importedRawVerts) {
    if (axis === 'x') v.x = -v.x;
    else if (axis === 'y') v.y = -v.y;
    else v.z = -v.z;
  }
  runSplineExtraction();
};

window.rotateImport = function(axis) {
  if (!importedRawVerts) return;
  for (const v of importedRawVerts) {
    let t;
    if (axis === 'x') { t = v.y; v.y = -v.z; v.z = t; }
    else if (axis === 'y') { t = v.x; v.x = v.z; v.z = -t; }
    else { t = v.x; v.x = -v.y; v.y = t; }
  }
  runSplineExtraction();
};

window.toggleGhost = function(btn) {
  if (!ghostMesh) return;
  ghostMesh.visible = !ghostMesh.visible;
  btn.textContent = ghostMesh.visible ? 'Ghost: On' : 'Ghost: Off';
  btn.classList.toggle('on', ghostMesh.visible);
};

// ── Expose to HTML ──

window.onSliderInput = onSliderInput;
window.setColor = setColor;
window.setResolution = function(val) {
  currentResolution = val;
  rebuildScene();
};
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
window.addEventListener('load', () => window.scrollTo(0, 0));
