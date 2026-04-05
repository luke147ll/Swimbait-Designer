/**
 * @file primitives.js
 * Primitive-based bait editor. Replaces the spline profile system.
 * Each primitive is a sphere/cylinder/cone with position, rotation, scale.
 * The 3D preview is built by unioning Manifold primitives via the mold generator's build function.
 * For the designer viewport, we approximate with Three.js primitives (no Manifold needed here).
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

const PRESETS = {
  paddletail: [
    { id:'body', type:'sphere', label:'Body', position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:9,y:32,z:7}, params:{radius:1,segments:32}, operation:'union', visible:true },
    { id:'head', type:'sphere', label:'Head', position:{x:0,y:26,z:0.5}, rotation:{x:0,y:0,z:0}, scale:{x:8,y:6,z:7}, params:{radius:1,segments:32}, operation:'union', visible:true },
    { id:'tail', type:'cone', label:'Tail Taper', position:{x:0,y:-30,z:-0.5}, rotation:{x:90,y:0,z:0}, scale:{x:1,y:1,z:0.65}, params:{radiusBottom:7,height:20,segments:32}, operation:'union', visible:true },
    { id:'ped', type:'cylinder', label:'Peduncle', position:{x:0,y:-40,z:-0.5}, rotation:{x:90,y:0,z:0}, scale:{x:1,y:1,z:0.6}, params:{radiusTop:2.5,radiusBottom:2.5,height:6,segments:16}, operation:'union', visible:true },
    { id:'paddle', type:'sphere', label:'Paddle', position:{x:0,y:-46,z:-1}, rotation:{x:0,y:0,z:0}, scale:{x:7,y:3.5,z:1.8}, params:{radius:1,segments:24}, operation:'union', visible:true },
  ],
  stick: [
    { id:'body', type:'cylinder', label:'Body', position:{x:0,y:0,z:0}, rotation:{x:90,y:0,z:0}, scale:{x:1,y:1,z:0.85}, params:{radiusTop:6,radiusBottom:6,height:80,segments:32}, operation:'union', visible:true },
    { id:'nose', type:'sphere', label:'Nose', position:{x:0,y:40,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:6,y:4,z:5}, params:{radius:1,segments:24}, operation:'union', visible:true },
    { id:'tail', type:'cone', label:'Tail', position:{x:0,y:-40,z:0}, rotation:{x:90,y:0,z:0}, scale:{x:1,y:1,z:0.85}, params:{radiusBottom:6,height:15,segments:24}, operation:'union', visible:true },
  ],
  blank: [
    { id:'body', type:'sphere', label:'Body', position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:8,y:25,z:6}, params:{radius:1,segments:32}, operation:'union', visible:true },
  ],
};

let primitives = JSON.parse(JSON.stringify(PRESETS.paddletail));
let scene = null;
let previewGroup = null;
let baitColor = 0x7a8e9a;

export function initPrimitiveEditor(sceneRef) {
  scene = sceneRef;
  previewGroup = new THREE.Group();
  scene.add(previewGroup);
  renderPrimitiveList();
  rebuildPreview();
}

export function setPrimitiveColor(color) {
  baitColor = color;
  rebuildPreview();
}

export function getPrimitives() {
  return primitives;
}

function renderPrimitiveList() {
  const container = document.getElementById('primitiveList');
  if (!container) return;
  container.innerHTML = '';

  primitives.forEach((prim, index) => {
    const section = document.createElement('div');
    section.style.cssText = 'border-bottom:1px solid var(--bd);padding:8px 0';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;cursor:pointer;margin-bottom:4px';
    header.innerHTML = `<span style="font-size:10px;color:var(--ac);text-transform:uppercase;letter-spacing:1px">${prim.label} <span style="color:var(--mu);font-size:8px">${prim.type}</span></span>
      <span style="color:var(--mu);font-size:10px;cursor:pointer" onclick="removePrimitive(${index})">×</span>`;

    const controls = document.createElement('div');
    controls.id = `prim-controls-${index}`;

    // Position sliders
    controls.appendChild(makeSlider(`Pos X`, prim.position.x, -60, 60, 0.5, v => { prim.position.x = v; rebuildPreview(); }));
    controls.appendChild(makeSlider(`Pos Y`, prim.position.y, -60, 60, 0.5, v => { prim.position.y = v; rebuildPreview(); }));
    controls.appendChild(makeSlider(`Pos Z`, prim.position.z, -20, 20, 0.5, v => { prim.position.z = v; rebuildPreview(); }));

    // Scale sliders
    controls.appendChild(makeSlider(`Scale X`, prim.scale.x, 0.5, 30, 0.5, v => { prim.scale.x = v; rebuildPreview(); }));
    controls.appendChild(makeSlider(`Scale Y`, prim.scale.y, 0.5, 50, 0.5, v => { prim.scale.y = v; rebuildPreview(); }));
    controls.appendChild(makeSlider(`Scale Z`, prim.scale.z, 0.5, 20, 0.5, v => { prim.scale.z = v; rebuildPreview(); }));

    // Rotation Y (most useful for cones/cylinders)
    if (prim.type !== 'sphere') {
      controls.appendChild(makeSlider(`Rot X`, prim.rotation.x, -180, 180, 5, v => { prim.rotation.x = v; rebuildPreview(); }));
    }

    section.appendChild(header);
    section.appendChild(controls);
    container.appendChild(section);
  });

  // Update window.baitPrimitives for the mold generator transfer
  window.baitPrimitives = primitives;
}

function makeSlider(label, value, min, max, step, onChange) {
  const div = document.createElement('div');
  div.style.cssText = 'margin-bottom:6px';
  div.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:2px">
    <span style="font-size:9px;color:var(--mu)">${label}</span>
    <span style="font-size:9px;color:var(--tx);font-family:monospace" id="v-${label.replace(/\s/g,'')}-${Math.random().toString(36).slice(2,6)}">${value}</span>
  </div>`;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = step; input.value = value;
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

function rebuildPreview() {
  if (!previewGroup) return;

  // Clear old preview
  while (previewGroup.children.length) {
    const child = previewGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    previewGroup.remove(child);
  }

  const mat = new THREE.MeshPhysicalMaterial({
    color: baitColor, metalness: 0.05, roughness: 0.42,
    clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide,
  });

  // Build each primitive as Three.js geometry for viewport preview
  // (Actual Manifold union happens in the mold generator)
  for (const prim of primitives) {
    if (!prim.visible) continue;

    let geo;
    const segs = prim.params.segments || 24;

    switch (prim.type) {
      case 'sphere':
        geo = new THREE.SphereGeometry(prim.params.radius || 1, segs, segs / 2);
        geo.scale(prim.scale.x, prim.scale.y, prim.scale.z);
        break;
      case 'cylinder':
        geo = new THREE.CylinderGeometry(
          (prim.params.radiusTop || 5) * prim.scale.x,
          (prim.params.radiusBottom || 5) * prim.scale.x,
          (prim.params.height || 10) * prim.scale.y, segs
        );
        geo.scale(1, 1, prim.scale.z);
        break;
      case 'cone':
        geo = new THREE.ConeGeometry(
          (prim.params.radiusBottom || 5) * prim.scale.x,
          (prim.params.height || 10) * prim.scale.y, segs
        );
        geo.scale(1, 1, prim.scale.z);
        break;
    }

    if (!geo) continue;

    const mesh = new THREE.Mesh(geo, mat);

    // Apply rotation (degrees → radians)
    mesh.rotation.set(
      prim.rotation.x * Math.PI / 180,
      prim.rotation.y * Math.PI / 180,
      prim.rotation.z * Math.PI / 180
    );

    mesh.position.set(prim.position.x, prim.position.z, prim.position.y);

    previewGroup.add(mesh);
  }

  // Scale mm → viewport inches (primitives are in mm, viewport is ~inches)
  previewGroup.scale.setScalar(1 / 25.4);

  // Expose for mold transfer
  window.baitPrimitives = primitives;
  window.bodyMesh = previewGroup.children[0] || null;
}

// Global functions called from HTML
window.loadPreset = function(name) {
  if (PRESETS[name]) {
    primitives = JSON.parse(JSON.stringify(PRESETS[name]));
    renderPrimitiveList();
    rebuildPreview();
  }
};

window.addPrimitive = function(type) {
  const id = type + '_' + Date.now().toString(36);
  const prim = {
    id, type, label: type.charAt(0).toUpperCase() + type.slice(1),
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 5, y: 5, z: 5 },
    params: type === 'sphere' ? { radius: 1, segments: 24 }
          : type === 'cylinder' ? { radiusTop: 3, radiusBottom: 3, height: 10, segments: 24 }
          : { radiusBottom: 3, height: 10, segments: 24 },
    operation: 'union', visible: true,
  };
  primitives.push(prim);
  renderPrimitiveList();
  rebuildPreview();
};

window.removePrimitive = function(index) {
  if (primitives.length <= 1) return;
  primitives.splice(index, 1);
  renderPrimitiveList();
  rebuildPreview();
};
