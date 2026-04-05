/**
 * CSG engine using Google Manifold WASM.
 * Guarantees manifold (watertight) output from every boolean operation.
 */
import * as THREE from 'three';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ManifoldSolid = any;

export async function initCSG(): Promise<void> {
  if (wasm) return;
  const Module = (await import('manifold-3d/manifold')).default;
  wasm = await Module({
    locateFile: ((path: string) => {
      if (path.endsWith('.wasm')) return '/manifold.wasm';
      return path;
    }) as () => string,
  });
  wasm.setup();
  console.log('[CSG] Manifold WASM initialized');
}

// ─── Primitives (always manifold) ───────────────────────────

export function mBox(sx: number, sy: number, sz: number): ManifoldSolid {
  return wasm.Manifold.cube([sx, sy, sz], true);
}

export function mCylZ(radius: number, height: number, segments = 32): ManifoldSolid {
  return wasm.Manifold.cylinder(height, radius, radius, segments, true);
}

export function mCylX(radius: number, height: number, segments = 32): ManifoldSolid {
  return mCylZ(radius, height, segments).rotate([0, 90, 0]);
}

export function mCylY(radius: number, height: number, segments = 32): ManifoldSolid {
  return mCylZ(radius, height, segments).rotate([90, 0, 0]);
}

export function mCone(radiusBottom: number, radiusTop: number, height: number, segments = 32): ManifoldSolid {
  return wasm.Manifold.cylinder(height, radiusBottom, radiusTop, segments, true);
}

export function mSphere(radius: number, segments = 32): ManifoldSolid {
  return wasm.Manifold.sphere(radius, segments);
}

export function mTranslate(solid: ManifoldSolid, x: number, y: number, z: number): ManifoldSolid {
  return solid.translate([x, y, z]);
}

export function mSubtract(a: ManifoldSolid, b: ManifoldSolid): ManifoldSolid {
  return a.subtract(b);
}

export function mUnion(a: ManifoldSolid, b: ManifoldSolid): ManifoldSolid {
  return a.add(b);
}

export function mBatchUnion(solids: ManifoldSolid[]): ManifoldSolid {
  if (solids.length === 0) return mBox(0.001, 0.001, 0.001);
  if (solids.length === 1) return solids[0];
  return wasm.Manifold.union(solids);
}

export function mDispose(solid: ManifoldSolid): void {
  try { solid.delete(); } catch { /* already deleted */ }
}

// ─── Sample bait (native Manifold, guaranteed manifold) ─────

/**
 * Create a realistic paddle-tail swimbait shape using Manifold's native constructors.
 * ~89mm (3.5") long with distinct head, body, tail taper, peduncle, and paddle.
 * Long axis along X (matching swimbait designer convention).
 */
export function createSampleBait(): ManifoldSolid {
  const M = wasm.Manifold;

  // Main body: ellipsoid ~18mm wide × 65mm long × 14mm tall
  // sphere(radius=1, segments) then scale to actual mm
  let body = M.sphere(1, 48).scale([9, 32.5, 7]);

  // Head: blunter, slightly higher than body center
  let head = M.sphere(1, 32).scale([8, 6.4, 7.2]);
  head = head.translate([0, 26, 0.5]);

  // Tail taper: narrowing cone
  let tailTaper = M.cylinder(20, 7, 2.5, 32, true).scale([1, 1, 0.65]);
  tailTaper = tailTaper.rotate([90, 0, 0]).translate([0, -30, -0.5]);

  // Caudal peduncle: narrow connector
  let peduncle = M.cylinder(6, 2.5, 2.5, 16, true).scale([1, 1, 0.6]);
  peduncle = peduncle.rotate([90, 0, 0]).translate([0, -40, -0.5]);

  // Paddle tail: wide flat kicker
  let paddle = M.sphere(1, 24).scale([7.2, 3.6, 1.8]);
  paddle = paddle.translate([0, -46, -1]);

  // Union all parts
  let bait = body.add(head).add(tailTaper).add(peduncle).add(paddle);

  // Rotate so long axis is along X (Y was build axis, X is our length convention)
  bait = bait.rotate([0, 0, 90]);

  return bait;
}

// ─── Mesh cleanup for Three.js → Manifold conversion ────────

function cleanGeometryForManifold(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  // ALWAYS explode to non-indexed first — this breaks shared vertices
  // that create non-manifold edges (e.g. designer's midline vertices
  // shared between left and right half-shells)
  let work = geo.index ? geo.toNonIndexed() : geo.clone();

  // Nudge vertices off Z=0 — the designer mesh has its midline exactly
  // at Z=0 which creates co-planar faces with the mold box parting plane.
  // Shifting by 0.01mm is invisible but prevents CSG artifacts.
  const pos = work.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (Math.abs(z) < 0.02) {
      pos.setZ(i, z >= 0 ? 0.02 : -0.02);
    }
  }
  pos.needsUpdate = true;

  // Remove NaN vertices
  for (let i = 0; i < pos.count; i++) {
    if (isNaN(pos.getX(i)) || isNaN(pos.getY(i)) || isNaN(pos.getZ(i))) {
      pos.setXYZ(i, 0, 0, 0);
    }
  }

  // Remove degenerate triangles (work is non-indexed, 3 verts per tri)
  const triCount = pos.count / 3;
  const cleanPositions: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();

  for (let tri = 0; tri < triCount; tri++) {
    const i = tri * 3;
    a.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    b.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
    c.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).lengthSq() > 1e-10) {
      cleanPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', new THREE.Float32BufferAttribute(cleanPositions, 3));

  // Re-index by merging coincident vertices
  const merged = mergeVerts(clean, 0.001);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

// ─── Three.js ↔ Manifold conversion ────────────────────────

export function threeToManifold(geometry: THREE.BufferGeometry): ManifoldSolid {
  const geo = cleanGeometryForManifold(geometry);

  const positions = geo.attributes.position;
  const index = geo.index!;
  const numVerts = positions.count;

  const vertProperties = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    vertProperties[i * 3] = positions.getX(i);
    vertProperties[i * 3 + 1] = positions.getY(i);
    vertProperties[i * 3 + 2] = positions.getZ(i);
  }

  const triVerts = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) triVerts[i] = index.getX(i);

  // Attempt 1: direct import
  try {
    return new wasm.Manifold({ numProp: 3, vertProperties, triVerts });
  } catch (e1) {
    console.warn('[CSG] Direct import failed:', e1);
  }

  // Attempt 2-4: merge vectors at increasing tolerances
  for (const tolerance of [0.001, 0.01, 0.1]) {
    try {
      console.log(`[CSG] Trying merge vectors at tolerance ${tolerance}...`);
      const vertexMap = new Map<string, number>();
      const mergeFrom: number[] = [];
      const mergeTo: number[] = [];

      for (let i = 0; i < numVerts; i++) {
        const key = `${Math.round(vertProperties[i * 3] / tolerance)},${Math.round(vertProperties[i * 3 + 1] / tolerance)},${Math.round(vertProperties[i * 3 + 2] / tolerance)}`;
        const existing = vertexMap.get(key);
        if (existing !== undefined && existing !== i) {
          mergeFrom.push(i);
          mergeTo.push(existing);
        } else {
          vertexMap.set(key, i);
        }
      }

      console.log(`[CSG] Merge vectors: ${mergeFrom.length} pairs`);
      const result = new wasm.Manifold({
        numProp: 3, vertProperties, triVerts,
        mergeFromVert: new Uint32Array(mergeFrom),
        mergeToVert: new Uint32Array(mergeTo),
      });
      console.log(`[CSG] Merge succeeded at tolerance ${tolerance}`);
      return result;
    } catch (e) {
      console.warn(`[CSG] Merge at tolerance ${tolerance} failed:`, e);
    }
  }

  throw new Error('Could not create Manifold from mesh. The mesh may not be watertight. Try repairing in MeshLab or export as STL from the designer.');
}

export function manifoldToThree(manifold: ManifoldSolid): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp;
  const numVerts = mesh.vertProperties.length / numProp;

  const positions = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    positions[i * 3] = mesh.vertProperties[i * numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * numProp + 2];
  }

  const indices: number[] = [];
  for (let i = 0; i < mesh.numTri * 3; i++) indices.push(mesh.triVerts[i]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

// ─── Internal vertex merge ──────────────────────────────────

function mergeVerts(geometry: THREE.BufferGeometry, tolerance: number): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const vertexMap = new Map<string, number>();
  const newPositions: number[] = [];
  const indexMap: number[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
    let idx = vertexMap.get(key);
    if (idx === undefined) {
      idx = newPositions.length / 3;
      vertexMap.set(key, idx);
      newPositions.push(x, y, z);
    }
    indexMap.push(idx);
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  newGeo.setIndex(indexMap);
  return newGeo;
}
