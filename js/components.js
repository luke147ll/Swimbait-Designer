/**
 * @file components.js
 * Component system for bait parts (heads, tails, fins, features).
 * The body (spline tube or imported mesh) is always the base.
 * Components are additional parts that union with the bait and
 * transfer to the mold generator as separate subtractions.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { openFinCreator } from './fin-creator.js';
import { recordChange, recordChangeNow } from './undo.js';
import { eyeConfig, renderEyeControls } from './eye-sockets.js';

const CATEGORY_COLORS = {
  head:    0x8a9aaa,
  tail:    0x7a8a7a,
  fin:     0x9a8a7a,
  feature: 0x8a7a9a,
  custom:  0x8a8a8a,
};

const MAX_COMPONENTS = 12;

let components = [];
let scene = null;
let cam = null;
let domElement = null;
let onChangeCallback = null;
let partsIndex = null;
const partCache = {};
let gizmo = null;
let gizmoTarget = null;

export function initComponents(sceneRef, onChange, cameraRef, rendererDom) {
  scene = sceneRef;
  cam = cameraRef;
  domElement = rendererDom;
  onChangeCallback = onChange;
  loadPartsIndex();
  initGizmo();
}

// ── Gizmo ──

async function initGizmo() {
  if (!cam || !domElement) return;
  try {
    const { TransformControls } = await import('https://esm.sh/three@0.162.0/examples/jsm/controls/TransformControls.js');
    gizmo = new TransformControls(cam, domElement);
    gizmo.setMode('translate');
    gizmo.setSize(('ontouchstart' in window) ? 1.2 : 0.8);
    gizmo.setSpace('local');
    gizmo.showZ = false; // lock Z in translate mode by default

    // Disable orbit while dragging gizmo
    gizmo.addEventListener('dragging-changed', e => {
      if (window._sbd_orbitEnabled !== undefined) window._sbd_orbitEnabled = !e.value;
    });

    // Sync gizmo → state on drag
    gizmo.addEventListener('change', () => {
      if (!gizmoTarget || !gizmoTarget.displayMesh) return;
      const m = gizmoTarget.displayMesh;

      // Slot sync
      if (gizmoTarget._isSlot) {
        if (window._sbd_syncSlotFromGizmo) window._sbd_syncSlotFromGizmo(m);
        return;
      }

      // Component sync
      gizmoTarget.position.x = +m.position.x.toFixed(3);
      gizmoTarget.position.y = +m.position.y.toFixed(3);
      gizmoTarget.position.z = +m.position.z.toFixed(3);
      gizmoTarget.rotation.x = +(m.rotation.x * 180 / Math.PI).toFixed(1);
      gizmoTarget.rotation.y = +(m.rotation.y * 180 / Math.PI).toFixed(1);
      gizmoTarget.rotation.z = +(m.rotation.z * 180 / Math.PI).toFixed(1);
      gizmoTarget.scale.x = +Math.abs(m.scale.x).toFixed(3);
      gizmoTarget.scale.y = +Math.abs(m.scale.y).toFixed(3);
      gizmoTarget.scale.z = +Math.abs(m.scale.z).toFixed(3);
      updateDisplayTransform(gizmoTarget); // update mirror
    });

    gizmo.addEventListener('mouseUp', () => { renderComponentList(); recordChangeNow(); });

    scene.add(gizmo);
    gizmo.visible = false;
    gizmo.enabled = false;
    console.log('[Gizmo] Initialized');
  } catch (e) {
    console.warn('[Gizmo] Failed to load TransformControls:', e);
  }
}

function attachGizmo(comp) {
  if (!gizmo || !comp.displayMesh) return;
  gizmoTarget = comp;
  gizmo.attach(comp.displayMesh);
  gizmo.visible = true;
  gizmo.enabled = true;
  const tb = document.getElementById('gizmoToolbar');
  if (tb) tb.style.display = 'flex';
}

function detachGizmo() {
  if (!gizmo) return;
  gizmo.detach();
  gizmo.visible = false;
  gizmo.enabled = false;
  gizmoTarget = null;
  const tb = document.getElementById('gizmoToolbar');
  if (tb) tb.style.display = 'none';
}

// Expose for keyboard shortcuts + toolbar
window.setGizmoMode = function(mode) {
  if (!gizmo) return;
  if (mode === 'snap') {
    const on = !gizmo.translationSnap;
    gizmo.setTranslationSnap(on ? 0.05 : null);
    gizmo.setRotationSnap(on ? Math.PI / 12 : null);
    gizmo.setScaleSnap(on ? 0.1 : null);
    document.querySelectorAll('.gizmo-btn[data-mode="snap"]').forEach(b => b.classList.toggle('on', on));
    return;
  }
  if (mode === 'space') {
    const isLocal = gizmo.space === 'local';
    gizmo.setSpace(isLocal ? 'world' : 'local');
    const btn = document.querySelector('.gizmo-btn[data-mode="space"]');
    if (btn) { btn.textContent = isLocal ? 'W' : 'L'; btn.title = isLocal ? 'World Space — click for Local (W)' : 'Local Space — click for World (W)'; }
    return;
  }
  gizmo.setMode(mode);
  // Lock Z axis in translate mode — prevents accidental off-center movement.
  // Z positioning is available via the component's slider controls.
  gizmo.showZ = mode !== 'translate';
  document.querySelectorAll('.gizmo-btn').forEach(b => {
    if (b.dataset.mode !== 'snap' && b.dataset.mode !== 'space') b.classList.toggle('on', b.dataset.mode === mode);
  });
};

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  // F — focus camera on selected component
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
    if (gizmoTarget && gizmoTarget.displayMesh && window._sbd_focusOnPoint) {
      const pos = gizmoTarget.displayMesh.position;
      window._sbd_focusOnPoint(pos.x, pos.y, pos.z);
    }
    return;
  }

  // Ctrl+D — duplicate selected component
  if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (gizmoTarget) duplicateComponent(gizmoTarget.id);
    return;
  }

  // Delete/Backspace — remove selected component
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (gizmoTarget) {
      const id = gizmoTarget.id;
      detachGizmo();
      removeComponent(id);
    }
    return;
  }

  if (!gizmoTarget) return;
  if (e.key === 'g' || e.key === 'G') window.setGizmoMode('translate');
  if (e.key === 'r' || e.key === 'R') window.setGizmoMode('rotate');
  if (e.key === 's' || e.key === 'S') window.setGizmoMode('scale');
  if (e.key === 'w' || e.key === 'W') window.setGizmoMode('space');
  if (e.key === 'Escape') { selectComponent(null); detachGizmo(); renderComponentList(); }
});

// Click viewport → select component
export function onViewportClick(event) {
  if (gizmo && gizmo.dragging) return;
  if (!cam) return;
  const rect = domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, cam);

  // Check components
  const compMeshes = components.filter(c => c.visible && c.displayMesh).map(c => c.displayMesh);
  // Check slot meshes
  const slotMeshes = window._sbd_getSlotMeshes ? window._sbd_getSlotMeshes() : [];
  const allMeshes = [...compMeshes, ...slotMeshes];

  const hits = ray.intersectObjects(allMeshes);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    // Is it a component?
    const comp = components.find(c => c.displayMesh === hitObj);
    if (comp) { selectComponent(comp.id, event.shiftKey); return; }
    // Is it a slot?
    if (hitObj.userData.isSlot && gizmo) {
      selectComponent(null);
      gizmoTarget = { _isSlot: true, displayMesh: hitObj };
      gizmo.attach(hitObj);
      gizmo.visible = true;
      gizmo.enabled = true;
      gizmo.setMode('translate'); // slots only translate
      const tb = document.getElementById('gizmoToolbar');
      if (tb) tb.style.display = 'flex';
      renderComponentList();
      return;
    }
  }
  // Clicked empty space
  selectComponent(null);
  detachGizmo();
  renderComponentList();
}

async function loadPartsIndex() {
  try {
    const res = await fetch('/parts/index.json');
    if (!res.ok) { console.warn('[Parts] Index not found'); return; }
    partsIndex = await res.json();
    console.log('[Parts] Library loaded:', partsIndex.parts.length, 'parts');
  } catch (e) {
    console.warn('[Parts] Failed to load index:', e);
  }
}

export function getComponents() { return components; }

function notify() { if (onChangeCallback) onChangeCallback(); }

function createMaterial(category) {
  return new THREE.MeshStandardMaterial({
    color: CATEGORY_COLORS[category] || CATEGORY_COLORS.custom,
    transparent: true, opacity: 0.85, roughness: 0.6, metalness: 0.1,
    side: THREE.DoubleSide,
  });
}

// ── CRUD ──

let compCounter = 0;

export function addComponent(partData) {
  if (components.length >= MAX_COMPONENTS) {
    alert(`Maximum ${MAX_COMPONENTS} components`);
    return null;
  }

  compCounter++;
  const comp = {
    id: (partData.category || 'comp') + '_' + compCounter + '_' + Math.random().toString(36).slice(2, 6),
    partId: partData.partId || null,
    label: partData.label || 'Component',
    category: partData.category || 'custom',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    mirrorX: false, mirrorY: false, mirrorZ: false,
    autoMirror: false,
    skew: { enabled: false, axis: 'y', direction: 1, amount: 0, falloff: 'linear' },
    visible: true, enabled: true, collapsed: true, selected: false,
    meshData: partData.meshData || null,
    displayMesh: null,
    _mirrorMesh: null,
    _isEye: partData._isEye || false,
    _finParams: partData._finParams || null,
  };

  // Apply defaults from part data (position, rotation, scale, skew)
  if (partData.autoPosition) Object.assign(comp.position, partData.autoPosition);
  if (partData.autoRotation) Object.assign(comp.rotation, partData.autoRotation);
  if (partData.autoScale) Object.assign(comp.scale, partData.autoScale);
  if (partData.skew) comp.skew = { ...comp.skew, ...partData.skew };

  components.push(comp);
  const meshReady = rebuildDisplayMesh(comp).then(() => {
    // Auto-select new component to show gizmo at its position (skip during batch load)
    if (!partData._skipAutoSelect) selectComponent(comp.id);
  });
  comp._meshReady = meshReady;
  renderComponentList();
  notify();
  recordChangeNow();
  return comp;
}

export function duplicateComponent(id) {
  const src = components.find(c => c.id === id);
  if (!src) return;
  const comp = addComponent({
    partId: src.partId,
    label: src.label + ' copy',
    category: src.category,
    meshData: src.meshData ? { numProp: 3, vertProperties: [...src.meshData.vertProperties], triVerts: [...src.meshData.triVerts] } : null,
    _finParams: src._finParams ? { ...src._finParams } : null,
    _isEye: src._isEye,
    skew: src.skew?.enabled ? { ...src.skew } : null,
    autoPosition: { x: src.position.x + 0.3, y: src.position.y, z: src.position.z },
    autoRotation: { ...src.rotation },
    autoScale: { ...src.scale },
  });
  if (comp) {
    comp.mirrorX = src.mirrorX;
    comp.mirrorY = src.mirrorY;
    comp.mirrorZ = src.mirrorZ;
    comp.autoMirror = src.autoMirror;
  }
}

// ── Boolean Operations (lazy-load Manifold WASM) ──

function compToWorldGeo(comp) {
  if (!comp.displayMesh) return null;
  const m = comp.displayMesh;
  m.updateMatrixWorld(true);
  const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  geo.applyMatrix4(m.matrixWorld);
  return geo;
}

function geoToMeshData(geo) {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  const pos = ni.attributes.position;
  const vp = [];
  const tv = [];
  for (let i = 0; i < pos.count; i++) {
    vp.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    tv.push(i);
  }
  return { numProp: 3, vertProperties: vp, triVerts: tv };
}

function mergeGeometries(geos) {
  // Simple geometry concatenation — combine all vertices and triangles
  const allPos = [];
  const allTri = [];
  let offset = 0;
  for (const geo of geos) {
    const ni = geo.index ? geo.toNonIndexed() : geo;
    const pos = ni.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      allPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    for (let i = 0; i < pos.count; i++) {
      allTri.push(offset + i);
    }
    offset += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
  merged.setIndex(allTri);
  merged.computeVertexNormals();
  return merged;
}

// Subtract using Manifold via the mold generator's WASM (fetched from same origin)
let manifoldReady = null;
async function getManifold() {
  if (manifoldReady) return manifoldReady;
  // Load manifold WASM from the mold generator's public directory
  const Module = (await import('https://esm.sh/manifold-3d@3.0.0/manifold.js?bundle')).default;
  manifoldReady = await Module();
  manifoldReady.setup();
  console.log('[Boolean] Manifold WASM loaded');
  return manifoldReady;
}

function geoToManifold(wasm, geo) {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  const pos = ni.attributes.position;
  const vp = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    vp[i * 3] = pos.getX(i); vp[i * 3 + 1] = pos.getY(i); vp[i * 3 + 2] = pos.getZ(i);
  }
  const tv = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) tv[i] = i;

  try {
    return new wasm.Manifold({ numProp: 3, vertProperties: vp, triVerts: tv });
  } catch {
    // Fallback: merge vectors
    const tol = 0.001, vertMap = new Map(), mergeFrom = [], mergeTo = [];
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(vp[i*3]/tol)},${Math.round(vp[i*3+1]/tol)},${Math.round(vp[i*3+2]/tol)}`;
      const ex = vertMap.get(key);
      if (ex !== undefined) { mergeFrom.push(i); mergeTo.push(ex); } else vertMap.set(key, i);
    }
    return new wasm.Manifold({ numProp: 3, vertProperties: vp, triVerts: tv,
      mergeFromVert: new Uint32Array(mergeFrom), mergeToVert: new Uint32Array(mergeTo) });
  }
}

function manifoldToGeo(wasm, solid) {
  const mesh = solid.getMesh();
  const np = mesh.numProp, vc = mesh.vertProperties.length / np;
  const pos = new Float32Array(vc * 3);
  for (let i = 0; i < vc; i++) { pos[i*3] = mesh.vertProperties[i*np]; pos[i*3+1] = mesh.vertProperties[i*np+1]; pos[i*3+2] = mesh.vertProperties[i*np+2]; }
  const idx = [];
  for (let i = 0; i < mesh.numTri * 3; i++) idx.push(mesh.triVerts[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

async function booleanOp(op) {
  const sel = getSelectedComponents();
  if (sel.length < 2) { alert('Select 2 components (Shift+click)'); return; }

  const geos = [];
  for (const c of sel) {
    const geo = compToWorldGeo(c);
    if (!geo) { alert(`No geometry for "${c.label}"`); return; }
    geos.push(geo);
  }

  let resultGeo;
  try {
    if (op === 'merge') {
      // Simple geometry concatenation — fast, no CSG library needed
      resultGeo = mergeGeometries(geos);
    } else {
      // Subtract requires real CSG — use Manifold WASM
      const wasm = await getManifold();
      const solids = geos.map(g => geoToManifold(wasm, g));
      let result = solids[0];
      for (let i = 1; i < solids.length; i++) result = result.subtract(solids[i]);
      resultGeo = manifoldToGeo(wasm, result);
    }
  } catch (e) {
    alert('Boolean operation failed: ' + e.message);
    console.error('[Boolean]', e);
    return;
  }

  const meshData = geoToMeshData(resultGeo);
  const label = op === 'merge'
    ? sel.map(c => c.label).join(' + ')
    : sel[0].label + ' − ' + sel.slice(1).map(c => c.label).join(', ');

  // Remove source components
  for (const c of sel) removeComponent(c.id);

  // Add result
  addComponent({
    label,
    category: sel[0].category,
    meshData,
  });
}

window.mergeComponents = () => booleanOp('merge');
window.subtractComponents = () => booleanOp('subtract');

export function removeComponent(id) {
  const idx = components.findIndex(c => c.id === id);
  if (idx === -1) return;
  const comp = components[idx];
  if (comp._isEye) { eyeConfig.enabled = false; if (window._sbd_eyeChanged) window._sbd_eyeChanged(); }
  if (comp.displayMesh) { scene.remove(comp.displayMesh); comp.displayMesh.geometry.dispose(); comp.displayMesh = null; }
  if (comp._mirrorMesh) { scene.remove(comp._mirrorMesh); comp._mirrorMesh.geometry.dispose(); comp._mirrorMesh = null; }
  // Also clean up any orphaned mirror meshes in the scene (safety net)
  scene.children.filter(c => c === comp._mirrorMesh).forEach(c => scene.remove(c));
  if (gizmo && gizmo.object === comp.displayMesh) detachGizmo();
  components.splice(idx, 1);
  renderComponentList();
  notify();
  recordChangeNow();
}

export function updateComponent(id, changes) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;

  for (const [k, v] of Object.entries(changes)) {
    if (typeof v === 'object' && comp[k] && typeof comp[k] === 'object') {
      Object.assign(comp[k], v);
    } else {
      comp[k] = v;
    }
  }

  if ('skew' in changes) updateSkewDisplay(comp);
  updateDisplayTransform(comp);
  notify();
  recordChange(); // debounced — rapid slider drags collapse into one undo step
}

export function selectComponent(id, addToSelection = false) {
  if (!addToSelection) {
    components.forEach(c => { c.selected = false; c.collapsed = true; });
  }
  const comp = components.find(c => c.id === id);
  if (comp) {
    comp.selected = !addToSelection || !comp.selected; // toggle if shift-clicking
    comp.collapsed = !comp.selected;
    if (comp.selected) attachGizmo(comp); else if (!components.some(c => c.selected)) detachGizmo();
  } else {
    detachGizmo();
  }
  renderComponentList();
}

export function getSelectedComponents() {
  return components.filter(c => c.selected);
}

// ── Display ──

async function rebuildDisplayMesh(comp) {
  if (comp.displayMesh) { scene.remove(comp.displayMesh); comp.displayMesh.geometry.dispose(); }
  if (!comp.meshData) { if (!comp._isEye) console.warn('[Components] No meshData for', comp.label); return; }

  // Use skewed vertices if skew is active, otherwise original
  const vp = (comp.skew && comp.skew.enabled && comp.skew.amount > 0)
    ? applySkew(comp.meshData.vertProperties, comp.skew)
    : comp.meshData.vertProperties;
  const tv = comp.meshData.triVerts;
  console.log(`[Components] Building mesh for ${comp.label}: ${vp.length / 3} verts, ${tv.length / 3} tris${comp.skew?.enabled ? ' (skewed)' : ''}`);

  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(vp), 3));
  if (tv && tv.length > 0) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tv), 1));
  }

  // Merge nearby vertices for smooth normals — STL meshes often have
  // duplicated vertices at shared edges, causing faceted appearance
  try {
    const { mergeVertices } = await import('https://esm.sh/three@0.162.0/examples/jsm/utils/BufferGeometryUtils.js');
    const before = geo.attributes.position.count;
    geo = mergeVertices(geo, 0.01);
    const after = geo.attributes.position.count;
    if (after < before) console.log(`[Components] Merged vertices: ${before} → ${after}`);
  } catch (e) { /* mergeVertices not available — use as-is */ }

  geo.computeBoundingBox();
  geo.center();

  // Auto-detect mm vs inches and scale to viewport inches
  geo.computeBoundingBox();
  const bb2 = geo.boundingBox;
  const maxDim = Math.max(bb2.max.x - bb2.min.x, bb2.max.y - bb2.min.y, bb2.max.z - bb2.min.z);
  if (maxDim > 30) { geo.scale(1 / 25.4, 1 / 25.4, 1 / 25.4); console.log('[Components] Scaled mm → inches'); }
  geo.computeVertexNormals();

  // Guard: component may have been removed during async mesh build
  if (!components.includes(comp)) return;

  comp.displayMesh = new THREE.Mesh(geo, createMaterial(comp.category));
  updateDisplayTransform(comp);
  if (comp.visible) scene.add(comp.displayMesh);
  console.log(`[Components] Mesh added to scene for ${comp.label}, visible=${comp.visible}`);
}

function updateDisplayTransform(comp) {
  const m = comp.displayMesh;
  if (!m) return;

  m.position.set(comp.position.x, comp.position.y, comp.position.z);
  m.rotation.set(
    comp.rotation.x * Math.PI / 180,
    comp.rotation.y * Math.PI / 180,
    comp.rotation.z * Math.PI / 180
  );
  m.scale.set(
    comp.scale.x * (comp.mirrorX ? -1 : 1),
    comp.scale.y * (comp.mirrorY ? -1 : 1),
    comp.scale.z * (comp.mirrorZ ? -1 : 1)
  );

  m.visible = comp.visible;

  // Auto-mirror
  if (comp.autoMirror) {
    // True mirror in WORLD space: transform vertices to world coords,
    // negate Z, create new mesh at identity. This handles any rotation.
    if (comp._mirrorMesh) { scene.remove(comp._mirrorMesh); comp._mirrorMesh.geometry.dispose(); }

    m.updateMatrixWorld(true);
    const srcPos = m.geometry.attributes.position;
    const mirrorGeo = m.geometry.clone();
    const dstPos = mirrorGeo.attributes.position;
    const v = new THREE.Vector3();

    for (let vi = 0; vi < srcPos.count; vi++) {
      v.set(srcPos.getX(vi), srcPos.getY(vi), srcPos.getZ(vi));
      v.applyMatrix4(m.matrixWorld); // local → world
      v.z = -v.z; // mirror across Z=0 in world space
      dstPos.setXYZ(vi, v.x, v.y, v.z);
    }
    dstPos.needsUpdate = true;

    // Flip winding order (mirror reverses face orientation)
    if (mirrorGeo.index) {
      const idx = mirrorGeo.index.array;
      for (let fi = 0; fi < idx.length; fi += 3) { const tmp = idx[fi + 1]; idx[fi + 1] = idx[fi + 2]; idx[fi + 2] = tmp; }
      mirrorGeo.index.needsUpdate = true;
    }
    mirrorGeo.computeVertexNormals();

    comp._mirrorMesh = new THREE.Mesh(mirrorGeo, m.material);
    // Identity transform — vertices are already in world space
    comp._mirrorMesh.visible = comp.visible;
    scene.add(comp._mirrorMesh);
  } else if (comp._mirrorMesh) {
    scene.remove(comp._mirrorMesh);
    comp._mirrorMesh.geometry.dispose();
    comp._mirrorMesh = null;
  }
}

// ── Skew/Pinch ──

function applySkew(verts, skew) {
  if (!skew || !skew.enabled || skew.amount === 0) return verts;
  const ai = skew.axis === 'x' ? 0 : skew.axis === 'y' ? 1 : 2;
  const oi = [0, 1, 2].filter(i => i !== ai);

  let mn = Infinity, mx = -Infinity;
  for (let i = ai; i < verts.length; i += 3) { if (verts[i] < mn) mn = verts[i]; if (verts[i] > mx) mx = verts[i]; }
  const range = mx - mn;
  if (range < 0.001) return verts;

  // Centers of the other two axes
  let c0 = 0, c1 = 0, n = verts.length / 3;
  for (let i = 0; i < verts.length; i += 3) { c0 += verts[i + oi[0]]; c1 += verts[i + oi[1]]; }
  c0 /= n; c1 /= n;

  const out = new Array(verts.length);
  for (let i = 0; i < verts.length; i += 3) {
    const v = verts[i + ai];
    const t = skew.direction > 0 ? (v - mn) / range : (mx - v) / range;
    let sf;
    if (skew.falloff === 'smooth') { const st = t * t * (3 - 2 * t); sf = 1 - st * skew.amount; }
    else if (skew.falloff === 'sharp') { sf = 1 - (t * t) * skew.amount; }
    else { sf = 1 - t * skew.amount; }
    sf = Math.max(0.01, sf);

    out[i + ai] = v;
    out[i + oi[0]] = c0 + (verts[i + oi[0]] - c0) * sf;
    out[i + oi[1]] = c1 + (verts[i + oi[1]] - c1) * sf;
  }
  return out;
}

function updateSkewDisplay(comp) {
  if (!comp.meshData) return;

  // Apply skew to get new vertex positions
  const vp = (comp.skew && comp.skew.enabled && comp.skew.amount > 0)
    ? applySkew(comp.meshData.vertProperties, comp.skew)
    : comp.meshData.vertProperties;

  // If no display mesh yet, do a full async rebuild
  if (!comp.displayMesh) { rebuildDisplayMesh(comp); return; }

  // Fast path: rebuild geometry in place without async merge
  // (avoids duplication from async timing issues)
  const geo = comp.displayMesh.geometry;
  const oldCount = geo.attributes.position.count;
  const newCount = vp.length / 3;

  if (oldCount === newCount) {
    // Same vertex count — update in place
    const pos = geo.attributes.position;
    for (let i = 0; i < newCount; i++) pos.setXYZ(i, vp[i * 3], vp[i * 3 + 1], vp[i * 3 + 2]);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingBox();
  } else {
    // Different count (first skew on a merged mesh) — replace geometry
    const wasGizmoTarget = gizmoTarget === comp;
    if (wasGizmoTarget && gizmo) gizmo.detach();

    if (geo) geo.dispose();
    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(vp), 3));
    const tv = comp.meshData.triVerts;
    if (tv && tv.length > 0) newGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(tv), 1));
    newGeo.computeVertexNormals();
    newGeo.computeBoundingBox();
    newGeo.center();
    // Scale if needed
    const bb = newGeo.boundingBox;
    const mx = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    if (mx > 30) newGeo.scale(1 / 25.4, 1 / 25.4, 1 / 25.4);

    comp.displayMesh.geometry = newGeo;

    if (wasGizmoTarget && gizmo) gizmo.attach(comp.displayMesh);
  }

  updateDisplayTransform(comp);
}

// ── UI Rendering ──

function makeSlider(label, value, min, max, step, onChange) {
  const div = document.createElement('div');
  div.style.cssText = 'margin-bottom:4px';
  div.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--mu)">
    <span>${label}</span><span style="font-family:monospace;color:var(--tx)">${typeof value === 'number' ? value.toFixed(1) : value}</span>
  </div>`;
  const input = document.createElement('input');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  input.style.cssText = 'width:100%';
  const valSpan = div.querySelector('span:last-child');
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valSpan.textContent = v.toFixed(1);
    onChange(v);
  });
  div.appendChild(input);
  return div;
}

export function renderComponentList() {
  const container = document.getElementById('componentList');
  if (!container) return;
  container.innerHTML = '';

  // Boolean operation buttons when 2+ components selected
  const sel = getSelectedComponents();
  if (sel.length >= 2) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--ac);background:rgba(200,168,78,0.05)';
    bar.innerHTML = `
      <span style="font-size:9px;color:var(--ac);align-self:center;margin-right:auto">${sel.length} selected</span>
      <button class="tb on" style="padding:4px 10px;font-size:9px;background:var(--ac);color:var(--bg)" onclick="mergeComponents()">Merge</button>
      <button class="tb" style="padding:4px 10px;font-size:9px" onclick="subtractComponents()">Subtract</button>
    `;
    container.appendChild(bar);
  }

  for (const comp of components) {
    const section = document.createElement('div');
    section.style.cssText = `border-bottom:1px solid var(--bd);${comp.selected ? 'border-left:2px solid var(--ac);' : ''}`;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:8px 10px;cursor:pointer;gap:6px';
    const isExpanded = !comp.collapsed && comp.selected;
    header.innerHTML = `
      <span style="font-size:10px;color:var(--mu);flex-shrink:0">${isExpanded ? '▾' : '▸'}</span>
      <span style="flex:1;font-size:11px;color:${comp.selected ? 'var(--ac)' : 'var(--tx)'}">${comp.label} <span style="font-size:8px;color:var(--mu)">${comp.category}</span></span>
      <span style="font-size:12px;cursor:pointer;color:${comp.visible ? 'var(--ac)' : 'var(--mu)'}; padding:2px 4px" onclick="event.stopPropagation();toggleComponentVisibility('${comp.id}')" title="Toggle visibility">${comp.visible ? '👁' : '◌'}</span>
      <span style="font-size:12px;cursor:pointer;color:${comp._deleteConfirm ? '#e55' : 'var(--mu)'};padding:2px 4px" onclick="event.stopPropagation();deleteComponent('${comp.id}')" title="Delete component">🗑</span>
    `;
    header.onclick = () => {
      if (comp.selected) {
        comp.collapsed = !comp.collapsed;
      } else {
        selectComponent(comp.id);
      }
      renderComponentList();
    };
    section.appendChild(header);

    // Expanded controls
    if (!comp.collapsed && comp.selected) {
      const body = document.createElement('div');
      body.style.cssText = 'padding:6px 10px 10px';

      // Eye components get their own specialized controls
      if (comp._isEye) {
        renderEyeControls(body);
        section.appendChild(body);
        container.appendChild(section);
        continue;
      }

      // Track which sub-sections are open per component
      if (!comp._openSections) comp._openSections = { scale: true };

      function collapsibleSection(title, key, content) {
        const isOpen = comp._openSections[key];
        const wrap = document.createElement('div');
        const hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu);margin:6px 0 4px;cursor:pointer;user-select:none';
        hdr.textContent = (isOpen ? '▾ ' : '▸ ') + title;
        hdr.onclick = (e) => { e.stopPropagation(); comp._openSections[key] = !comp._openSections[key]; renderComponentList(); };
        wrap.appendChild(hdr);
        if (isOpen) {
          const inner = document.createElement('div');
          content(inner);
          wrap.appendChild(inner);
        }
        return wrap;
      }

      // Scale (always visible — most used)
      body.appendChild(collapsibleSection('Scale', 'scale', inner => {
        inner.appendChild(makeSlider('Uniform', comp.scale.x, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { x: v, y: v, z: v } })));
        // Non-uniform toggle
        const nuBtn = document.createElement('div');
        nuBtn.style.cssText = 'margin-top:4px';
        nuBtn.innerHTML = `<span style="font-size:10px;color:var(--ac);cursor:pointer;letter-spacing:0.5px" onclick="event.stopPropagation();toggleComponentSection('${comp.id}','scaleXYZ')">${comp._openSections.scaleXYZ ? '▾ Per-axis scale' : '▸ Per-axis scale'}</span>`;
        inner.appendChild(nuBtn);
        if (comp._openSections.scaleXYZ) {
          inner.appendChild(makeSlider('Length', comp.scale.x, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { x: v } })));
          inner.appendChild(makeSlider('Height', comp.scale.y, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { y: v } })));
          inner.appendChild(makeSlider('Width', comp.scale.z, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { z: v } })));
        }
      }));

      // Position (collapsed by default, Z locked by default)
      body.appendChild(collapsibleSection('Position', 'position', inner => {
        inner.appendChild(makeSlider('Along Body', comp.position.x, -8, 8, 0.02, v => updateComponent(comp.id, { position: { x: v } })));
        inner.appendChild(makeSlider('Height', comp.position.y, -8, 8, 0.02, v => updateComponent(comp.id, { position: { y: v } })));
        // Width locked by default — unlock to adjust
        if (!comp._openSections) comp._openSections = { scale: true };
        const wLocked = !comp._openSections.zUnlocked;
        const wRow = document.createElement('div');
        wRow.style.cssText = 'display:flex;align-items:center;gap:4px';
        const lockBtn = document.createElement('button');
        lockBtn.className = 'tb' + (wLocked ? '' : ' on');
        lockBtn.style.cssText = 'padding:2px 6px;font-size:9px;flex-shrink:0';
        lockBtn.textContent = wLocked ? '🔒 Width' : '🔓 Width';
        lockBtn.title = wLocked ? 'Width locked at center — click to unlock' : 'Width unlocked — click to lock';
        lockBtn.onclick = (e) => { e.stopPropagation(); comp._openSections.zUnlocked = !comp._openSections.zUnlocked; renderComponentList(); };
        wRow.appendChild(lockBtn);
        if (!wLocked) {
          const wSlider = makeSlider('Width', comp.position.z, -4, 4, 0.02, v => updateComponent(comp.id, { position: { z: v } }));
          wSlider.style.flex = '1';
          wRow.appendChild(wSlider);
        } else {
          const wLabel = document.createElement('span');
          wLabel.style.cssText = 'font-size:9px;color:var(--mu)';
          wLabel.textContent = 'Width locked at center';
          wRow.appendChild(wLabel);
        }
        inner.appendChild(wRow);
      }));

      // Rotation (collapsed by default) with 90° snap buttons
      body.appendChild(collapsibleSection('Rotation', 'rotation', inner => {
        function rotRow(axis, val) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px';
          // Snap buttons
          const snapBtns = document.createElement('div');
          snapBtns.style.cssText = 'display:flex;gap:2px;flex-shrink:0';
          for (const deg of [-90, 0, 90, 180]) {
            const btn = document.createElement('button');
            btn.className = 'tb' + (Math.round(val) === deg ? ' on' : '');
            btn.style.cssText = 'padding:2px 5px;font-size:8px;min-width:28px';
            btn.textContent = deg + '°';
            btn.onclick = () => updateComponent(comp.id, { rotation: { [axis]: deg } });
            snapBtns.appendChild(btn);
          }
          row.appendChild(snapBtns);
          // Fine slider
          const axisLabel = axis === 'x' ? 'Pitch' : axis === 'y' ? 'Yaw' : 'Roll';
          const slider = makeSlider(axisLabel, val, -180, 180, 1, v => updateComponent(comp.id, { rotation: { [axis]: v } }));
          slider.style.flex = '1';
          row.appendChild(slider);
          return row;
        }
        inner.appendChild(rotRow('x', comp.rotation.x));
        inner.appendChild(rotRow('y', comp.rotation.y));
        inner.appendChild(rotRow('z', comp.rotation.z));
      }));

      // Mirror + auto-pair
      const mirrorDiv = document.createElement('div');
      mirrorDiv.style.cssText = 'display:flex;gap:4px;margin-top:8px;flex-wrap:wrap';
      mirrorDiv.innerHTML = `
        <button class="tb${comp.mirrorX ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','mirrorX')">↔ Length</button>
        <button class="tb${comp.mirrorY ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','mirrorY')">↔ Height</button>
        <button class="tb${comp.mirrorZ ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','mirrorZ')">↔ Width</button>
        <button class="tb${comp.autoMirror ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','autoMirror')">Auto-pair</button>
      `;
      body.appendChild(mirrorDiv);

      // Skew / Pinch (not for eyes)
      if (!comp._isEye) {
        const sk = comp.skew || { enabled: false, axis: 'y', direction: 1, amount: 0, falloff: 'linear' };
        body.appendChild(collapsibleSection('Skew / Pinch', 'skew', inner => {
          // Enable toggle
          const toggleRow = document.createElement('div');
          toggleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px';
          toggleRow.innerHTML = `<span style="font-size:10px;color:var(--mu)">Enable</span>
            <button class="tb${sk.enabled ? ' on' : ''}" style="padding:3px 8px;font-size:9px" onclick="toggleCompSkew('${comp.id}')">${sk.enabled ? 'On' : 'Off'}</button>`;
          inner.appendChild(toggleRow);

          if (sk.enabled) {
            // Taper direction — named by what happens visually
            const axisLabels = {
              x: { name: 'Length', pos: 'Taper toward tail', neg: 'Taper toward head' },
              y: { name: 'Height', pos: 'Taper toward top', neg: 'Taper toward belly' },
              z: { name: 'Width', pos: 'Taper toward right', neg: 'Taper toward left' },
            };

            const lbl2 = document.createElement('div');
            lbl2.style.cssText = 'font-size:9px;color:var(--mu);margin-bottom:4px';
            lbl2.textContent = 'Taper along:';
            inner.appendChild(lbl2);

            const axisRow = document.createElement('div');
            axisRow.style.cssText = 'display:flex;gap:2px;margin-bottom:6px';
            for (const a of ['x', 'y', 'z']) {
              const btn = document.createElement('button');
              btn.className = 'tb' + (sk.axis === a ? ' on' : '');
              btn.style.cssText = 'flex:1;padding:4px;font-size:9px';
              btn.textContent = axisLabels[a].name;
              btn.onclick = () => { comp.skew.axis = a; updateSkewDisplay(comp); renderComponentList(); recordChange(); };
              axisRow.appendChild(btn);
            }
            inner.appendChild(axisRow);

            // Direction — plain language
            const al = axisLabels[sk.axis];
            const dirRow = document.createElement('div');
            dirRow.style.cssText = 'display:flex;gap:2px;margin-bottom:6px';
            for (const [d, lbl] of [[1, al.pos], [-1, al.neg]]) {
              const btn = document.createElement('button');
              btn.className = 'tb' + (sk.direction === d ? ' on' : '');
              btn.style.cssText = 'flex:1;padding:4px;font-size:8px';
              btn.textContent = lbl;
              btn.onclick = () => { comp.skew.direction = d; updateSkewDisplay(comp); renderComponentList(); recordChange(); };
              dirRow.appendChild(btn);
            }
            inner.appendChild(dirRow);

            // Amount slider
            inner.appendChild(makeSlider('Amount', (sk.amount * 100).toFixed(0) + '%', 0, 100, 1, v => {
              comp.skew.amount = v / 100; updateSkewDisplay(comp);
            }));

            // Falloff — with descriptions
            const lbl3 = document.createElement('div');
            lbl3.style.cssText = 'font-size:9px;color:var(--mu);margin-top:6px;margin-bottom:4px';
            lbl3.textContent = 'Taper curve:';
            inner.appendChild(lbl3);

            const ffRow = document.createElement('div');
            ffRow.style.cssText = 'display:flex;gap:2px';
            const ffLabels = { linear: 'Even', smooth: 'Smooth', sharp: 'Sharp tip' };
            for (const f of ['linear', 'smooth', 'sharp']) {
              const btn = document.createElement('button');
              btn.className = 'tb' + (sk.falloff === f ? ' on' : '');
              btn.style.cssText = 'flex:1;padding:4px;font-size:8px';
              btn.textContent = ffLabels[f];
              btn.onclick = () => { comp.skew.falloff = f; updateSkewDisplay(comp); renderComponentList(); recordChange(); };
              ffRow.appendChild(btn);
            }
            inner.appendChild(ffRow);
          }
        }));
      }

      section.appendChild(body);
    }

    container.appendChild(section);
  }
}

// ── Transfer ──

export function buildComponentTransferData() {
  const result = [];

  for (const comp of components) {
    if (!comp.enabled || !comp.meshData) { console.log(`[Transfer] Skip ${comp.label}: enabled=${comp.enabled}, hasMesh=${!!comp.meshData}`); continue; }
    console.log(`[Transfer] Including ${comp.label}: ${comp.meshData.vertProperties.length / 3} verts`);

    const transformed = applyTransform(comp.meshData, comp);
    result.push({
      id: comp.id, label: comp.label,
      numProp: 3,
      vertProperties: transformed.vp,
      triVerts: transformed.tv,
      finParams: comp._finParams || null,
      // Send transform for fins (mold generator builds native extrusion + applies transform)
      transform: comp._finParams ? {
        position: { x: comp.position.x * 25.4, y: comp.position.y * 25.4, z: comp.position.z * 25.4 },
        rotation: { x: comp.rotation.x, y: comp.rotation.y, z: comp.rotation.z },
        scale: { x: comp.scale.x, y: comp.scale.y, z: comp.scale.z },
      } : null,
    });

    if (comp.autoMirror) {
      // Mirror across Z=0: use the same world-space approach as the viewport.
      // 1. Apply full transform to original mesh (gives correct world-space vertices)
      // 2. Negate Z on the result (mirrors across the body centerline)
      // 3. Use mirrorZ scale flag so applyTransform handles winding correctly
      const mirrorComp = {
        ...comp,
        mirrorZ: !comp.mirrorZ, // toggle Z mirror — applyTransform will negate Z scale and fix winding
      };
      const mirrored = applyTransform(comp.meshData, mirrorComp);
      result.push({
        id: comp.id + '_mirror', label: comp.label + ' (mirror)',
        numProp: 3,
        vertProperties: mirrored.vp,
        triVerts: mirrored.tv,
      });
    }
  }

  return result;
}

function applyTransform(meshData, comp) {
  // Mesh vertices have library defaults already baked in (viewport inches).
  // User transform (position/rotation/scale from sliders) is applied on top.
  // Position slider is in inches. Final output must be in mm for mold generator.
  //
  // Strategy: apply user rotation+scale around origin, then add user position,
  // then convert everything to mm.
  const mat = new THREE.Matrix4();
  const euler = new THREE.Euler(
    comp.rotation.x * Math.PI / 180,
    comp.rotation.y * Math.PI / 180,
    comp.rotation.z * Math.PI / 180
  );
  const s = new THREE.Vector3(
    comp.scale.x * (comp.mirrorX ? -1 : 1),
    comp.scale.y * (comp.mirrorY ? -1 : 1),
    comp.scale.z * (comp.mirrorZ ? -1 : 1)
  );
  // Slider value IS the real position — convert inches to mm
  mat.compose(
    new THREE.Vector3(comp.position.x * 25.4, comp.position.y * 25.4, comp.position.z * 25.4),
    new THREE.Quaternion().setFromEuler(euler),
    s
  );

  // Apply skew before position/rotation/scale transform
  const srcVerts = (comp.skew && comp.skew.enabled) ? applySkew(meshData.vertProperties, comp.skew) : meshData.vertProperties;
  const vp = new Float32Array(srcVerts);
  const v = new THREE.Vector3();
  for (let i = 0; i < vp.length; i += 3) {
    // Vertices are in viewport inches (baked) — convert to mm first, then apply transform
    v.set(vp[i] * 25.4, vp[i + 1] * 25.4, vp[i + 2] * 25.4).applyMatrix4(mat);
    vp[i] = v.x; vp[i + 1] = v.y; vp[i + 2] = v.z;
  }

  const tv = Array.from(meshData.triVerts);
  if (s.x * s.y * s.z < 0) {
    for (let i = 0; i < tv.length; i += 3) { const tmp = tv[i + 1]; tv[i + 1] = tv[i + 2]; tv[i + 2] = tmp; }
  }

  return { vp: Array.from(vp), tv };
}

// ── Global handlers ──

window.toggleComponentVisibility = function(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.visible = !comp.visible;
  if (comp.displayMesh) comp.displayMesh.visible = comp.visible;
  if (comp._mirrorMesh) comp._mirrorMesh.visible = comp.visible;
  renderComponentList();
};

window.toggleComponentMirror = function(id, key) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp[key] = !comp[key];
  updateDisplayTransform(comp);
  renderComponentList();
};

window.toggleComponentSection = function(id, key) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  if (!comp._openSections) comp._openSections = {};
  comp._openSections[key] = !comp._openSections[key];
  renderComponentList();
};

window.toggleCompSkew = function(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  if (!comp.skew) comp.skew = { enabled: false, axis: 'y', direction: 1, amount: 0.5, falloff: 'linear' };
  comp.skew.enabled = !comp.skew.enabled;
  updateSkewDisplay(comp);
  renderComponentList();
  recordChangeNow();
};

window.addEyeSockets = function() {
  eyeConfig.enabled = true;
  const OL = parseFloat(document.getElementById('sOL')?.value || 8);
  addComponent({
    label: 'Eye Sockets',
    category: 'feature',
    _isEye: true,
    meshData: null, // eyes don't have their own mesh — they subtract via transfer
  });
  if (window._sbd_eyeChanged) window._sbd_eyeChanged();
};

window.deleteComponent = function(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  if (comp._deleteConfirm) {
    removeComponent(id);
  } else {
    comp._deleteConfirm = true;
    renderComponentList();
    setTimeout(() => { if (comp) comp._deleteConfirm = false; renderComponentList(); }, 2000);
  }
};

// Show part picker dialog for a category
window.addComponentFromSTL = function(category) {
  // Feature category — show eye sockets option
  if (category === 'feature') {
    const existing = document.getElementById('partPickerDialog');
    if (existing) existing.remove();
    const dialog = document.createElement('div');
    dialog.id = 'partPickerDialog';
    dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--sf);border:1px solid var(--bd);border-radius:6px;padding:12px;width:280px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.5)';
    dialog.innerHTML = `
      <div style="font-size:11px;color:var(--ac);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">Features</div>
      <div class="tb on" style="display:block;padding:8px;margin-bottom:4px;cursor:pointer;text-align:left;background:var(--ac);color:var(--bg)" onclick="document.getElementById('partPickerDialog').remove();addEyeSockets()">
        <div style="font-size:11px;font-weight:700">Eye Sockets</div>
        <div style="font-size:9px;opacity:0.7">Paired cylinder recesses for stick-on 3D eyes</div>
      </div>
      <div class="tb" style="display:block;padding:8px;margin-bottom:4px;cursor:pointer;text-align:left;border-style:dashed" onclick="importComponentSTL('feature');document.getElementById('partPickerDialog').remove()">
        <div style="font-size:11px;color:var(--mu)">+ Import custom STL</div>
      </div>
      <div style="text-align:right;margin-top:8px"><button class="tb" style="padding:4px 10px;font-size:9px" onclick="document.getElementById('partPickerDialog').remove()">Cancel</button></div>
    `;
    document.body.appendChild(dialog);
    return;
  }

  // Fin category with no library parts — go straight to fin creator
  if (category === 'fin') {
    const libraryFins = partsIndex ? partsIndex.parts.filter(p => p.category === 'fin') : [];
    if (libraryFins.length === 0) {
      openFinCreatorDialog();
      return;
    }
  }

  // Check if library has parts for this category
  const libraryParts = partsIndex ? partsIndex.parts.filter(p => p.category === category) : [];

  if (libraryParts.length === 0) {
    // No library parts — go straight to file import
    importComponentSTL(category);
    return;
  }

  // Show picker dialog
  const existing = document.getElementById('partPickerDialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'partPickerDialog';
  dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--sf);border:1px solid var(--bd);border-radius:6px;padding:12px;width:280px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.5)';

  let html = `<div style="font-size:11px;color:var(--ac);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">${category} parts</div>`;

  for (const entry of libraryParts) {
    html += `<div class="tb" style="display:block;padding:8px;margin-bottom:4px;cursor:pointer;text-align:left" onclick="loadLibraryPart('${entry.id}','${entry.fileUrl}','${category}')">
      <div style="font-size:11px;color:var(--tx)">${entry.name}</div>
      <div style="font-size:9px;color:var(--mu)">${entry.description || ''} · ${entry.fileSizeKB}KB</div>
    </div>`;
  }

  html += `<div class="tb" style="display:block;padding:8px;margin-bottom:4px;cursor:pointer;text-align:left;border-style:dashed" onclick="importComponentSTL('${category}');document.getElementById('partPickerDialog').remove()">
    <div style="font-size:11px;color:var(--mu)">+ Import custom STL</div>
  </div>`;

  // Fin creator option for fin category
  if (category === 'fin') {
    html += `<div class="tb on" style="display:block;padding:8px;margin-bottom:4px;cursor:pointer;text-align:left;background:var(--ac);color:var(--bg)" onclick="document.getElementById('partPickerDialog').remove();openFinCreatorDialog()">
      <div style="font-size:11px;font-weight:700">Create Custom Fin</div>
      <div style="font-size:9px;opacity:0.7">Draw a fin outline with spline controls</div>
    </div>`;
  }

  html += `<div style="text-align:right;margin-top:8px"><button class="tb" style="padding:4px 10px;font-size:9px" onclick="document.getElementById('partPickerDialog').remove()">Cancel</button></div>`;

  dialog.innerHTML = html;
  document.body.appendChild(dialog);
};

// Open fin creator in a modal dialog
window.openFinCreatorDialog = function() {
  const existing = document.getElementById('finCreatorDialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'finCreatorDialog';
  dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--sf);border:1px solid var(--bd);border-radius:6px;padding:0;width:320px;max-height:90vh;overflow-y:auto;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.5)';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--bd)';
  header.innerHTML = `<span style="font-size:11px;color:var(--ac);text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Fin Creator</span>
    <span style="cursor:pointer;color:var(--mu);font-size:14px" onclick="document.getElementById('finCreatorDialog').remove()">✕</span>`;
  dialog.appendChild(header);

  const body = document.createElement('div');
  dialog.appendChild(body);
  document.body.appendChild(dialog);

  openFinCreator(body, () => {
    dialog.remove();
    renderComponentList();
  });
};

// Load a part from the library
window.loadLibraryPart = async function(partId, fileUrl, category) {
  const dialog = document.getElementById('partPickerDialog');
  if (dialog) dialog.remove();

  try {
    let partData;
    if (partCache[partId]) {
      partData = partCache[partId];
    } else {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error('Fetch failed: ' + res.status);
      partData = await res.json();
      partCache[partId] = partData;
    }

    console.log('[Parts] Loaded:', partData.name, '— verts:', partData.mesh.vertProperties.length / 3);

    // Bake only rotation and scale into mesh vertices.
    // Position stays as a UI value so it transfers correctly to mm.
    const d = partData.defaults;
    const s = partData.sizing.defaultScale || 1;
    const mat = new THREE.Matrix4();
    const euler = new THREE.Euler(
      (d.rotationX || 0) * Math.PI / 180,
      (d.rotationY || 0) * Math.PI / 180,
      (d.rotationZ || 0) * Math.PI / 180
    );
    // No position in the bake — only rotation + scale
    mat.compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion().setFromEuler(euler),
      new THREE.Vector3(s, s, s)
    );

    const srcVerts = partData.mesh.vertProperties;
    const bakedVerts = new Array(srcVerts.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < srcVerts.length; i += 3) {
      v.set(srcVerts[i], srcVerts[i + 1], srcVerts[i + 2]).applyMatrix4(mat);
      bakedVerts[i] = v.x; bakedVerts[i + 1] = v.y; bakedVerts[i + 2] = v.z;
    }

    // Flip winding if negative scale determinant
    const bakedTris = Array.from(partData.mesh.triVerts);
    if (s < 0) {
      for (let i = 0; i < bakedTris.length; i += 3) {
        const tmp = bakedTris[i + 1]; bakedTris[i + 1] = bakedTris[i + 2]; bakedTris[i + 2] = tmp;
      }
    }

    addComponent({
      partId: partId,
      label: partData.name,
      category: category || partData.category || 'custom',
      meshData: { numProp: 3, vertProperties: bakedVerts, triVerts: bakedTris },
      // Position sets the slider starting value — what you see is what you get
      autoPosition: { x: d.positionX || 0, y: d.positionY || 0, z: d.positionZ || 0 },
    });
  } catch (e) {
    console.error('[Parts] Load failed:', e);
    alert('Failed to load part: ' + e.message);
  }
};

// Import STL as component (direct file picker)
window.importComponentSTL = function(category) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.stl';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { STLLoader } = await import('https://esm.sh/three@0.162.0/examples/jsm/loaders/STLLoader.js');
    const buffer = await file.arrayBuffer();
    const geo = new STLLoader().parse(buffer);
    geo.computeBoundingBox();
    geo.center();

    const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
    const pos = nonIndexed.attributes.position;
    const vp = []; const tv = [];
    for (let i = 0; i < pos.count; i++) { vp.push(pos.getX(i), pos.getY(i), pos.getZ(i)); tv.push(i); }

    addComponent({
      label: file.name.replace('.stl', ''),
      category: category || 'custom',
      meshData: { numProp: 3, vertProperties: vp, triVerts: tv },
    });
  };
  input.click();
};
