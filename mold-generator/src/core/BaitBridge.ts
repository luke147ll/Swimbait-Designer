/**
 * BaitBridge — handles handoff from Swimbait Designer to Mold Generator.
 *
 * Two transfer modes:
 * 1. Primitives JSON (new system) — rebuilds identical Manifold solid
 * 2. Binary STL (legacy/import) — builds from profile ellipsoids
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, mSphere, type ManifoldSolid } from './csg';
import { buildBait, type BaitPrimitive } from './BaitPrimitives';

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
 * Build Manifold from profile ellipsoids (fallback for STL imports)
 */
function buildFromVertices(positions: Float32Array, vertCount: number): ManifoldSolid {
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < vertCount; i++) {
    pts.push({
      x: positions[i * 3] * INCHES_TO_MM,
      y: positions[i * 3 + 1] * INCHES_TO_MM,
      z: positions[i * 3 + 2] * INCHES_TO_MM,
    });
  }
  let minX = Infinity, maxX = -Infinity, sumY = 0, sumZ = 0;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; sumY += p.y; sumZ += p.z; }
  const cy = sumY / pts.length, cz = sumZ / pts.length;
  const cx = (minX + maxX) / 2;
  for (const p of pts) { p.x -= cx; p.y -= cy; p.z -= cz; }
  const lenX = maxX - minX;

  const stations = 48;
  const sw = lenX / stations * 0.6;
  let result: ManifoldSolid | null = null;

  for (let s = 0; s <= stations; s++) {
    const sx = -lenX / 2 + (s / stations) * lenX;
    let sMinY = Infinity, sMaxY = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity, cnt = 0;
    for (const p of pts) {
      if (Math.abs(p.x - sx) <= sw) { if (p.y < sMinY) sMinY = p.y; if (p.y > sMaxY) sMaxY = p.y; if (p.z < sMinZ) sMinZ = p.z; if (p.z > sMaxZ) sMaxZ = p.z; cnt++; }
    }
    if (cnt < 3) continue;
    const hH = (sMaxY - sMinY) / 2, hW = (sMaxZ - sMinZ) / 2, sCy = (sMinY + sMaxY) / 2;
    if (hH < 0.5 || hW < 0.5) continue;
    const xStr = Math.max(lenX / stations * 0.65, 1);
    let e = mSphere(1, 16).scale([xStr, hH, hW]).translate([sx, sCy, 0]);
    result = result ? result.add(e) : e;
  }
  if (!result) throw new Error('No cross-sections');
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

    const contentType = res.headers.get('Content-Type') || '';
    const store = useMoldStore.getState();
    await initCSG();

    // Check if it's JSON (primitives) or binary (STL)
    if (contentType.includes('application/json')) {
      // Primitives transfer — rebuild identical Manifold solid
      const data = await res.json();
      if (data.type === 'primitives' && data.primitives) {
        console.log(`[BaitBridge] Primitives transfer: ${data.primitives.length} primitives`);
        const { manifold, geometry } = await buildBait(data.primitives as BaitPrimitive[]);

        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        console.log(`[BaitBridge] Built: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

        store.setBaitMesh(geometry, data.name || 'designed_bait');
        store.setBaitManifold(manifold);

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
        return { success: true };
      }
    }

    // Binary STL transfer (legacy/import)
    const buffer = await res.arrayBuffer();
    console.log(`[BaitBridge] STL transfer: ${buffer.byteLength} bytes`);

    if (buffer.byteLength < 84) return { success: false, error: 'Invalid data' };
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const expectedSize = 80 + 4 + triCount * 50;
    if (Math.abs(buffer.byteLength - expectedSize) > 10) return { success: false, error: 'STL size mismatch' };

    const geo = parseSTL(buffer);
    geo.scale(INCHES_TO_MM, INCHES_TO_MM, INCHES_TO_MM);
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeVertexNormals();
    geo.computeBoundingBox();

    store.setBaitMesh(geo, 'designed_bait.stl');

    // Build Manifold from profile ellipsoids
    try {
      const rawPos = parseSTL(buffer).attributes.position.array as Float32Array;
      const manifold = buildFromVertices(rawPos, rawPos.length / 3);
      store.setBaitManifold(manifold);
      console.log('[BaitBridge] Built Manifold from profile ellipsoids');
    } catch (e) {
      console.warn('[BaitBridge] Manifold build failed:', e);
      store.setBaitManifold(null);
    }

    window.history.replaceState({}, '', window.location.pathname);
    return { success: true };
  } catch (e) {
    return { success: false, error: `Transfer failed: ${e}` };
  }
}
