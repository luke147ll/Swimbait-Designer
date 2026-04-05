/**
 * BaitBridge — handles handoff from Swimbait Designer to Mold Generator.
 *
 * Transfer: binary STL via Worker API KV.
 * Manifold solid: built from profile ellipsoids (same as sample bait),
 * NOT from Three.js mesh conversion. This guarantees manifold output.
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, mSphere, type ManifoldSolid } from './csg';

const INCHES_TO_MM = 25.4;
const API_BASE = 'https://swimbaitdesigner.com';

export function getTransferToken(): string | null {
  return new URLSearchParams(window.location.search).get('transfer');
}

function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(buffer);
  const triCount = dv.getUint32(80, true);
  const positions = new Float32Array(triCount * 9);
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    off += 12;
    for (let v = 0; v < 3; v++) {
      positions[t * 9 + v * 3] = dv.getFloat32(off, true); off += 4;
      positions[t * 9 + v * 3 + 1] = dv.getFloat32(off, true); off += 4;
      positions[t * 9 + v * 3 + 2] = dv.getFloat32(off, true); off += 4;
    }
    off += 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build a Manifold solid from vertex positions by creating overlapping
 * ellipsoids at cross-section stations — same technique as createSampleBait.
 * Guaranteed manifold, no Three.js→Manifold conversion needed.
 */
function buildManifoldFromVertices(positions: Float32Array, vertCount: number): ManifoldSolid {
  // Scale inches → mm
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < vertCount; i++) {
    pts.push({
      x: positions[i * 3] * INCHES_TO_MM,
      y: positions[i * 3 + 1] * INCHES_TO_MM,
      z: positions[i * 3 + 2] * INCHES_TO_MM,
    });
  }

  // Find X extent
  let minX = Infinity, maxX = -Infinity;
  let centerY = 0, centerZ = 0;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    centerY += p.y;
    centerZ += p.z;
  }
  centerY /= pts.length;
  centerZ /= pts.length;
  const lenX = maxX - minX;

  // Center the points
  for (const p of pts) {
    p.x -= (minX + maxX) / 2;
    p.y -= centerY;
    p.z -= centerZ;
  }
  minX -= (minX + maxX) / 2;
  maxX = -minX;

  // Sample cross-sections
  const stations = 48;
  const sliceWidth = lenX / stations * 0.6;
  let result: ManifoldSolid | null = null;

  for (let s = 0; s <= stations; s++) {
    const stationX = minX + (s / stations) * lenX;

    let sMinY = Infinity, sMaxY = -Infinity;
    let sMinZ = Infinity, sMaxZ = -Infinity;
    let count = 0;

    for (const p of pts) {
      if (Math.abs(p.x - stationX) <= sliceWidth) {
        if (p.y < sMinY) sMinY = p.y;
        if (p.y > sMaxY) sMaxY = p.y;
        if (p.z < sMinZ) sMinZ = p.z;
        if (p.z > sMaxZ) sMaxZ = p.z;
        count++;
      }
    }

    if (count < 3) continue;

    const halfH = (sMaxY - sMinY) / 2;
    const halfW = (sMaxZ - sMinZ) / 2;
    const cy = (sMinY + sMaxY) / 2;

    if (halfH < 0.5 || halfW < 0.5) continue;

    // Create ellipsoid: sphere(1) scaled to cross-section dims
    const xStretch = Math.max(lenX / stations * 0.65, 1);
    let ellipsoid = mSphere(1, 16).scale([xStretch, halfH, halfW]);
    ellipsoid = ellipsoid.translate([stationX, cy, 0]);

    if (result === null) {
      result = ellipsoid;
    } else {
      result = result.add(ellipsoid);
    }
  }

  if (!result) throw new Error('No valid cross-sections found');

  console.log(`[BaitBridge] Built Manifold from ${stations} profile ellipsoids: ${result.numVert()} verts, ${result.numTri()} tris`);
  return result;
}

export async function transferBaitFromAPI(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[BaitBridge] Fetching transfer:', token);

    const res = await fetch(`${API_BASE}/api/mold-transfer?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'Transfer expired. Click "Generate Mold" again.' };
      return { success: false, error: `API error: ${res.status}` };
    }

    const buffer = await res.arrayBuffer();
    console.log(`[BaitBridge] Received ${buffer.byteLength} bytes`);

    if (buffer.byteLength < 84) {
      return { success: false, error: `Invalid transfer data (${buffer.byteLength} bytes)` };
    }
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const expectedSize = 80 + 4 + triCount * 50;
    console.log(`[BaitBridge] STL: ${triCount} triangles, expected ${expectedSize} bytes`);
    if (Math.abs(buffer.byteLength - expectedSize) > 10) {
      return { success: false, error: `STL size mismatch` };
    }

    // Parse STL for Three.js display (ghost overlay)
    const geo = parseSTL(buffer);
    geo.scale(INCHES_TO_MM, INCHES_TO_MM, INCHES_TO_MM);
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeVertexNormals();
    geo.computeBoundingBox();

    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    console.log(`[BaitBridge] Bait: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

    const store = useMoldStore.getState();
    store.setBaitMesh(geo, 'designed_bait.stl');

    // Build Manifold solid from profile ellipsoids — NOT from Three.js mesh
    // Same technique as the working sample bait
    try {
      await initCSG();
      const rawPositions = parseSTL(buffer).attributes.position.array as Float32Array;
      const manifold = buildManifoldFromVertices(rawPositions, rawPositions.length / 3);
      store.setBaitManifold(manifold);
      console.log('[BaitBridge] Manifold solid built from profile ellipsoids');
    } catch (e) {
      console.warn('[BaitBridge] Manifold build failed:', e);
      store.setBaitManifold(null);
    }

    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('transfer');
    window.history.replaceState({}, '', url.pathname);

    return { success: true };
  } catch (e) {
    return { success: false, error: `Transfer failed: ${e}` };
  }
}
