/**
 * BaitBridge — handles handoff from Swimbait Designer to Mold Generator
 * via the Worker API KV transfer endpoint.
 *
 * Transfer format: binary STL (clean non-indexed triangle soup)
 * This avoids the topology issues from the designer's indexed mesh.
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, threeToManifold } from './csg';

const INCHES_TO_MM = 25.4;
const API_BASE = 'https://swimbaitdesigner.com';

export function getTransferToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('transfer');
}

/**
 * Parse a binary STL ArrayBuffer into a BufferGeometry.
 */
function parseSTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(buffer);
  const triCount = dv.getUint32(80, true);
  const positions = new Float32Array(triCount * 9);

  let off = 84;
  for (let t = 0; t < triCount; t++) {
    off += 12; // skip normal (3 floats)
    for (let v = 0; v < 3; v++) {
      positions[t * 9 + v * 3] = dv.getFloat32(off, true); off += 4;
      positions[t * 9 + v * 3 + 1] = dv.getFloat32(off, true); off += 4;
      positions[t * 9 + v * 3 + 2] = dv.getFloat32(off, true); off += 4;
    }
    off += 2; // skip attribute byte count
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export async function transferBaitFromAPI(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[BaitBridge] Fetching transfer:', token);

    const res = await fetch(`${API_BASE}/api/mold-transfer?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'Transfer expired or already used. Click "Generate Mold" again.' };
      return { success: false, error: `API error: ${res.status}` };
    }

    const buffer = await res.arrayBuffer();
    console.log(`[BaitBridge] Received ${buffer.byteLength} bytes`);

    // Validate STL format
    if (buffer.byteLength < 84) {
      return { success: false, error: `Invalid transfer data (${buffer.byteLength} bytes, expected STL)` };
    }
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const expectedSize = 80 + 4 + triCount * 50;
    console.log(`[BaitBridge] STL header: ${triCount} triangles, expected ${expectedSize} bytes`);
    if (Math.abs(buffer.byteLength - expectedSize) > 10) {
      return { success: false, error: `STL size mismatch: got ${buffer.byteLength} bytes, expected ${expectedSize} for ${triCount} triangles` };
    }

    // Parse as binary STL
    const geo = parseSTL(buffer);
    const vertCount = geo.attributes.position.count;
    console.log(`[BaitBridge] Parsed STL: ${vertCount} verts, ${vertCount / 3} tris`);

    // Scale inches → mm
    geo.scale(INCHES_TO_MM, INCHES_TO_MM, INCHES_TO_MM);

    // Center at origin
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    geo.computeVertexNormals();
    geo.computeBoundingBox();

    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    console.log(`[BaitBridge] Bait: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

    // Store in moldStore
    const store = useMoldStore.getState();
    store.setBaitMesh(geo, 'designed_bait.stl');

    // Attempt Manifold conversion
    try {
      await initCSG();
      const manifold = threeToManifold(geo);
      store.setBaitManifold(manifold);
      console.log('[BaitBridge] Manifold conversion successful');
    } catch (e) {
      console.warn('[BaitBridge] Manifold conversion failed (will retry in subtraction):', e);
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
