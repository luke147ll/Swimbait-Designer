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
let partsIndex = null;
const partCache = {};

export function initComponents(sceneRef, onChange) {
  scene = sceneRef;
  onChangeCallback = onChange;
  loadPartsIndex();
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

  // Apply defaults from part data (position, rotation, scale)
  if (partData.autoPosition) Object.assign(comp.position, partData.autoPosition);
  if (partData.autoRotation) Object.assign(comp.rotation, partData.autoRotation);
  if (partData.autoScale) Object.assign(comp.scale, partData.autoScale);

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

async function rebuildDisplayMesh(comp) {
  if (comp.displayMesh) { scene.remove(comp.displayMesh); comp.displayMesh.geometry.dispose(); }
  if (!comp.meshData) { console.warn('[Components] No meshData for', comp.label); return; }

  const vp = comp.meshData.vertProperties;
  const tv = comp.meshData.triVerts;
  console.log(`[Components] Building mesh for ${comp.label}: ${vp.length / 3} verts, ${tv.length / 3} tris`);

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
        nuBtn.style.cssText = 'margin-top:2px';
        nuBtn.innerHTML = `<span style="font-size:8px;color:var(--mu);cursor:pointer;text-decoration:underline" onclick="event.stopPropagation();toggleComponentSection('${comp.id}','scaleXYZ')">${comp._openSections.scaleXYZ ? '▾ Per-axis' : '▸ Per-axis'}</span>`;
        inner.appendChild(nuBtn);
        if (comp._openSections.scaleXYZ) {
          inner.appendChild(makeSlider('X', comp.scale.x, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { x: v } })));
          inner.appendChild(makeSlider('Y', comp.scale.y, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { y: v } })));
          inner.appendChild(makeSlider('Z', comp.scale.z, 0.01, 3.0, 0.01, v => updateComponent(comp.id, { scale: { z: v } })));
        }
      }));

      // Position (collapsed by default)
      body.appendChild(collapsibleSection('Position', 'position', inner => {
        inner.appendChild(makeSlider('X', comp.position.x, -8, 8, 0.02, v => updateComponent(comp.id, { position: { x: v } })));
        inner.appendChild(makeSlider('Y', comp.position.y, -8, 8, 0.02, v => updateComponent(comp.id, { position: { y: v } })));
        inner.appendChild(makeSlider('Z', comp.position.z, -4, 4, 0.02, v => updateComponent(comp.id, { position: { z: v } })));
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
          const slider = makeSlider(axis.toUpperCase(), val, -180, 180, 1, v => updateComponent(comp.id, { rotation: { [axis]: v } }));
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

  const vp = new Float32Array(meshData.vertProperties);
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

  html += `<div style="text-align:right;margin-top:8px"><button class="tb" style="padding:4px 10px;font-size:9px" onclick="document.getElementById('partPickerDialog').remove()">Cancel</button></div>`;

  dialog.innerHTML = html;
  document.body.appendChild(dialog);
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
