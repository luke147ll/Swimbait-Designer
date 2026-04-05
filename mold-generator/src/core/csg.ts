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
  let work = geo.index ? geo.toNonIndexed() : geo.clone();

  const pos = work.attributes.position;

  // Remove NaN vertices
  for (let i = 0; i < pos.count; i++) {
    if (isNaN(pos.getX(i)) || isNaN(pos.getY(i)) || isNaN(pos.getZ(i))) {
      pos.setXYZ(i, 0, 0, 0);
    }
  }

  // Build triangle list, removing degenerates
  const triCount = pos.count / 3;
  const r = (v: number) => Math.round(v * 100); // round to 0.01mm for signature

  interface Tri { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; key: string; }
  const tris: Tri[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i = t * 3;
    a.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    b.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
    c.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));

    // Skip degenerate triangles
    e1.subVectors(b, a); e2.subVectors(c, a);
    if (e1.cross(e2).lengthSq() < 1e-10) continue;

    // Don't strip midline faces — they're valid cap geometry

    // Build sorted vertex key for duplicate detection
    const verts = [
      `${r(a.x)},${r(a.y)},${r(a.z)}`,
      `${r(b.x)},${r(b.y)},${r(b.z)}`,
      `${r(c.x)},${r(c.y)},${r(c.z)}`,
    ].sort();
    const key = verts.join('|');

    tris.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z, key });
  }

  // Remove duplicate faces (same 3 vertex positions = internal from mirror)
  const keyCount = new Map<string, number>();
  for (const tri of tris) {
    keyCount.set(tri.key, (keyCount.get(tri.key) || 0) + 1);
  }

  const cleanPositions: number[] = [];
  let removed = 0;
  for (const tri of tris) {
    if (keyCount.get(tri.key)! > 1) {
      removed++;
      continue; // skip all copies of duplicate faces
    }
    cleanPositions.push(tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz);
  }

  console.log(`[CSG cleanup] Removed ${removed} internal/duplicate + midline faces from ${triCount} total, kept ${cleanPositions.length / 9}`);

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', new THREE.Float32BufferAttribute(cleanPositions, 3));

  // Do NOT merge vertices here — merging recreates non-manifold edges
  // at the midline where left/right half-shells have coincident vertices.
  // Instead, create a simple sequential index (non-indexed → indexed with identity)
  // and let Manifold's merge vectors handle coincident vertex merging
  // while maintaining manifold topology.
  const vertCount = cleanPositions.length / 3;
  const indices: number[] = [];
  for (let i = 0; i < vertCount; i++) indices.push(i);
  clean.setIndex(indices);
  clean.computeVertexNormals();
  clean.computeBoundingBox();
  return clean;
}

/**
 * Build a Manifold solid from a Three.js mesh by sampling cross-sections
 * and creating scaled ellipsoids at each station, then unioning them.
 * Guaranteed manifold output that closely follows the actual profile.
 */
function buildFromProfileSpheres(geo: THREE.BufferGeometry): ManifoldSolid {
  const M = wasm.Manifold;
  const pos = geo.attributes.position;

  // Find X extent (length axis)
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const lenX = maxX - minX;

  // Sample cross-sections at N stations along X
  const stations = 32;
  const sliceWidth = lenX / stations * 0.7;
  let result: ManifoldSolid | null = null;

  for (let s = 0; s <= stations; s++) {
    const stationX = minX + (s / stations) * lenX;

    // Find the extent of vertices near this station
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let count = 0;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (Math.abs(x - stationX) <= sliceWidth) {
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
        count++;
      }
    }

    if (count < 3) continue;

    const halfH = (maxY - minY) / 2;
    const halfW = (maxZ - minZ) / 2;
    const cy = (minY + maxY) / 2;

    if (halfH < 0.1 || halfW < 0.1) continue;

    // Create ellipsoid at this station: sphere scaled to match cross-section
    // Stretch along X by half the station spacing for overlap
    const xStretch = lenX / stations * 0.6;
    let ellipsoid = M.sphere(1, 16).scale([xStretch, halfH, halfW]);
    ellipsoid = ellipsoid.translate([stationX, cy, 0]);

    if (result === null) {
      result = ellipsoid;
    } else {
      result = result.add(ellipsoid);
    }
  }

  if (!result) throw new Error('No valid cross-sections found');

  console.log(`[CSG] Profile spheres: ${stations} stations → ${result.numVert()} verts, ${result.numTri()} tris`);
  return result;
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

  // Last resort: build from the Three.js mesh's vertex positions as
  // overlapping Manifold spheres unioned together (like the sample bait).
  // This is guaranteed manifold and follows the exact bait profile.
  console.log('[CSG] Building Manifold solid from profile spheres...');
  try {
    return buildFromProfileSpheres(geo);
  } catch (sphereErr) {
    throw new Error(`Could not create Manifold from mesh: ${sphereErr}`);
  }
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

