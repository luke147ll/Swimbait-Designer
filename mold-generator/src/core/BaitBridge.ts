/**
 * BaitBridge — handles handoff from Swimbait Designer to Mold Generator
 * via the Worker API KV transfer endpoint.
 *
 * Flow: designer POSTs geometry → KV with token → mold generator GETs with token
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, threeToManifold } from './csg';

const INCHES_TO_MM = 25.4;
const API_BASE = 'https://swimbaitdesigner.com';

/**
 * Check URL for ?transfer= param.
 */
export function getTransferToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('transfer');
}

/**
 * Fetch geometry from the Worker API using the transfer token,
 * reconstruct BufferGeometry, scale, center, store in moldStore.
 */
export async function transferBaitFromAPI(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[BaitBridge] Fetching transfer:', token);

    const res = await fetch(`${API_BASE}/api/mold-transfer?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'Transfer expired or already used. Go back to the designer and click "Generate Mold" again.' };
      return { success: false, error: `API error: ${res.status}` };
    }

    const buffer = await res.arrayBuffer();

    // Unpack binary: [posLen:u32][idxLen:u32][normLen:u32][nameLen:u32][name bytes][positions f32][index u32][normals f32]
    const dv = new DataView(buffer);
    let off = 0;
    const posLen = dv.getUint32(off, true); off += 4;
    const idxLen = dv.getUint32(off, true); off += 4;
    const normLen = dv.getUint32(off, true); off += 4;
    const nameLen = dv.getUint32(off, true); off += 4;
    const name = new TextDecoder().decode(new Uint8Array(buffer, off, nameLen)); off += nameLen;

    const positions = new Float32Array(buffer.slice(off, off + posLen * 4)); off += posLen * 4;
    const index = idxLen > 0 ? new Uint32Array(buffer.slice(off, off + idxLen * 4)) : null; off += idxLen * 4;
    const normals = normLen > 0 ? new Float32Array(buffer.slice(off, off + normLen * 4)) : null;

    console.log(`[BaitBridge] Unpacked: ${name}, ${posLen / 3} verts, ${idxLen / 3} tris`);

    // Reconstruct BufferGeometry
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (index) geo.setIndex(new THREE.BufferAttribute(index, 1));
    if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Scale inches → mm
    geo.scale(INCHES_TO_MM, INCHES_TO_MM, INCHES_TO_MM);

    // Center at origin
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    // Recompute normals
    geo.computeVertexNormals();
    geo.computeBoundingBox();

    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    console.log(`[BaitBridge] Bait: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

    // Store in moldStore
    const store = useMoldStore.getState();
    store.setBaitMesh(geo, name);

    // Attempt Manifold conversion
    try {
      await initCSG();
      const manifold = threeToManifold(geo);
      store.setBaitManifold(manifold);
      console.log('[BaitBridge] Manifold conversion successful');
    } catch (e) {
      console.warn('[BaitBridge] Manifold conversion failed (will use fallback):', e);
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
