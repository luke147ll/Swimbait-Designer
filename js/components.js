/**
 * @file components.js
 * Component system for bait parts (heads, tails, fins, features).
 * The body (spline tube or imported mesh) is always the base.
 * Components are additional parts that union with the bait and
 * transfer to the mold generator as separate subtractions.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

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
let onChangeCallback = null;

export function initComponents(sceneRef, onChange) {
  scene = sceneRef;
  onChangeCallback = onChange;
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

export function addComponent(partData) {
  if (components.length >= MAX_COMPONENTS) {
    alert(`Maximum ${MAX_COMPONENTS} components`);
    return null;
  }

  const comp = {
    id: partData.category + '_' + Date.now().toString(36),
    partId: partData.partId || null,
    label: partData.label || 'Component',
    category: partData.category || 'custom',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    mirrorX: false, mirrorY: false, mirrorZ: false,
    autoMirror: false,
    visible: true, enabled: true, collapsed: true, selected: false,
    meshData: partData.meshData || null,
    displayMesh: null,
    _mirrorMesh: null,
  };

  // Auto-position based on category
  if (partData.autoPosition) {
    Object.assign(comp.position, partData.autoPosition);
  }

  components.push(comp);
  rebuildDisplayMesh(comp);
  renderComponentList();
  notify();
  return comp;
}

export function removeComponent(id) {
  const idx = components.findIndex(c => c.id === id);
  if (idx === -1) return;
  const comp = components[idx];
  if (comp.displayMesh) { scene.remove(comp.displayMesh); comp.displayMesh.geometry.dispose(); }
  if (comp._mirrorMesh) { scene.remove(comp._mirrorMesh); comp._mirrorMesh.geometry.dispose(); }
  components.splice(idx, 1);
  renderComponentList();
  notify();
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

  updateDisplayTransform(comp);
  notify();
}

export function selectComponent(id) {
  components.forEach(c => { c.selected = false; c.collapsed = true; });
  const comp = components.find(c => c.id === id);
  if (comp) { comp.selected = true; comp.collapsed = false; }
  renderComponentList();
}

// ── Display ──

function rebuildDisplayMesh(comp) {
  if (comp.displayMesh) { scene.remove(comp.displayMesh); comp.displayMesh.geometry.dispose(); }
  if (!comp.meshData) return;

  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(comp.meshData.vertProperties);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  if (comp.meshData.triVerts) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(comp.meshData.triVerts), 1));
  }
  geo.computeBoundingBox();
  geo.center();

  // Auto-detect mm vs inches and scale to viewport inches
  const bb = geo.boundingBox;
  const maxDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  if (maxDim > 30) geo.scale(1 / 25.4, 1 / 25.4, 1 / 25.4); // mm → inches
  geo.computeVertexNormals();

  comp.displayMesh = new THREE.Mesh(geo, createMaterial(comp.category));
  updateDisplayTransform(comp);
  if (comp.visible) scene.add(comp.displayMesh);
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
    if (!comp._mirrorMesh) {
      comp._mirrorMesh = m.clone();
      scene.add(comp._mirrorMesh);
    }
    comp._mirrorMesh.position.set(-comp.position.x, comp.position.y, comp.position.z);
    comp._mirrorMesh.rotation.copy(m.rotation);
    comp._mirrorMesh.scale.set(-m.scale.x, m.scale.y, m.scale.z);
    comp._mirrorMesh.visible = comp.visible;
  } else if (comp._mirrorMesh) {
    scene.remove(comp._mirrorMesh);
    comp._mirrorMesh.geometry.dispose();
    comp._mirrorMesh = null;
  }
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

  for (const comp of components) {
    const section = document.createElement('div');
    section.style.cssText = `border-bottom:1px solid var(--bd);${comp.selected ? 'border-left:2px solid var(--ac);' : ''}`;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:6px 8px;cursor:pointer;gap:6px';
    header.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;border:1.5px solid ${comp.selected ? 'var(--ac)' : 'var(--mu)'};background:${comp.selected ? 'var(--ac)' : 'transparent'};flex-shrink:0"></span>
      <span style="flex:1;font-size:11px;color:var(--tx)">${comp.label} <span style="font-size:8px;color:var(--mu)">${comp.category}</span></span>
      <span style="font-size:10px;cursor:pointer;color:${comp.visible ? 'var(--ac)' : 'var(--mu)'}" onclick="event.stopPropagation();toggleComponentVisibility('${comp.id}')">${comp.visible ? '👁' : '◌'}</span>
      <span style="font-size:10px;cursor:pointer;color:var(--mu)" onclick="event.stopPropagation();deleteComponent('${comp.id}')">✕</span>
    `;
    header.onclick = () => { selectComponent(comp.id); renderComponentList(); };
    section.appendChild(header);

    // Expanded controls
    if (!comp.collapsed && comp.selected) {
      const body = document.createElement('div');
      body.style.cssText = 'padding:6px 10px 10px';

      const lbl = (t) => { const d = document.createElement('div'); d.style.cssText = 'font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu);margin:8px 0 4px'; d.textContent = t; return d; };

      body.appendChild(lbl('Position (inches)'));
      body.appendChild(makeSlider('X', comp.position.x, -4, 4, 0.02, v => updateComponent(comp.id, { position: { x: v } })));
      body.appendChild(makeSlider('Y', comp.position.y, -8, 8, 0.02, v => updateComponent(comp.id, { position: { y: v } })));
      body.appendChild(makeSlider('Z', comp.position.z, -3, 3, 0.02, v => updateComponent(comp.id, { position: { z: v } })));

      body.appendChild(lbl('Scale'));
      body.appendChild(makeSlider('Uniform', comp.scale.x, 0.1, 3.0, 0.01, v => updateComponent(comp.id, { scale: { x: v, y: v, z: v } })));

      body.appendChild(lbl('Rotation'));
      body.appendChild(makeSlider('X°', comp.rotation.x, -180, 180, 1, v => updateComponent(comp.id, { rotation: { x: v } })));
      body.appendChild(makeSlider('Y°', comp.rotation.y, -180, 180, 1, v => updateComponent(comp.id, { rotation: { y: v } })));
      body.appendChild(makeSlider('Z°', comp.rotation.z, -180, 180, 1, v => updateComponent(comp.id, { rotation: { z: v } })));

      // Mirror + auto-pair
      const mirrorDiv = document.createElement('div');
      mirrorDiv.style.cssText = 'display:flex;gap:4px;margin-top:8px;flex-wrap:wrap';
      mirrorDiv.innerHTML = `
        <button class="tb${comp.mirrorX ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','mirrorX')">↔X</button>
        <button class="tb${comp.mirrorY ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','mirrorY')">↔Y</button>
        <button class="tb${comp.mirrorZ ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','mirrorZ')">↔Z</button>
        <button class="tb${comp.autoMirror ? ' on' : ''}" style="padding:4px 8px;font-size:9px" onclick="toggleComponentMirror('${comp.id}','autoMirror')">Auto-pair</button>
      `;
      body.appendChild(mirrorDiv);

      section.appendChild(body);
    }

    container.appendChild(section);
  }
}

// ── Transfer ──

export function buildComponentTransferData() {
  const result = [];

  for (const comp of components) {
    if (!comp.enabled || !comp.meshData) continue;

    const transformed = applyTransform(comp.meshData, comp);
    result.push({
      id: comp.id, label: comp.label,
      numProp: 3,
      vertProperties: transformed.vp,
      triVerts: transformed.tv,
    });

    if (comp.autoMirror) {
      const mirror = { ...comp, position: { x: -comp.position.x, y: comp.position.y, z: comp.position.z }, mirrorX: !comp.mirrorX };
      const mirrored = applyTransform(comp.meshData, mirror);
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
  mat.compose(
    new THREE.Vector3(comp.position.x, comp.position.y, comp.position.z),
    new THREE.Quaternion().setFromEuler(euler),
    s
  );

  const vp = new Float32Array(meshData.vertProperties);
  const v = new THREE.Vector3();
  for (let i = 0; i < vp.length; i += 3) {
    v.set(vp[i], vp[i + 1], vp[i + 2]).applyMatrix4(mat);
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

window.addComponentFromSTL = function(category) {
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
