/**
 * BaitBridge — handles handoff from Swimbait Designer to Mold Generator.
 *
 * Uses IndexedDB for cross-subdomain transfer (swimbaitdesigner.com → mold.swimbaitdesigner.com).
 * Both subdomains share the same IndexedDB since they share the registrable domain.
 *
 * Pipeline: read IDB → reconstruct BufferGeometry → scale inches→mm → center → store in moldStore
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, threeToManifold } from './csg';

const INCHES_TO_MM = 25.4;
const DB_NAME = 'sbd';
const STORE_NAME = 'transfers';
const KEY = 'current_bait';

interface BaitTransfer {
  positions: ArrayBuffer;
  index: ArrayBuffer | null;
  normals: ArrayBuffer | null;
  meta: {
    name: string;
    vertCount: number;
    units: string;
    timestamp: number;
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Check if a bait transfer is waiting in IndexedDB.
 */
export async function isBaitInIDB(): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const data = await new Promise<BaitTransfer | undefined>((resolve) => {
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    db.close();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Transfer the bait geometry from IndexedDB to the mold generator.
 */
export async function transferBaitFromIDB(): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await openDB();

    // Read from IDB
    const tx = db.transaction(STORE_NAME, 'readonly');
    const data = await new Promise<BaitTransfer | undefined>((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!data) {
      db.close();
      return { success: false, error: 'No bait found. Design a bait first and click "Generate Mold".' };
    }

    // Reconstruct BufferGeometry
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(data.positions);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    if (data.index) {
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(data.index), 1));
    }
    if (data.normals) {
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
    }

    console.log(`[BaitBridge] Loaded from IDB: ${data.meta.name}, ${data.meta.vertCount} verts, ${data.meta.units}`);

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

    // Log dimensions
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    console.log(`[BaitBridge] Bait: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

    // Store in moldStore
    const store = useMoldStore.getState();
    store.setBaitMesh(geo, data.meta.name);

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

    // Delete the IDB entry after successful load
    const delTx = db.transaction(STORE_NAME, 'readwrite');
    delTx.objectStore(STORE_NAME).delete(KEY);
    await new Promise<void>((resolve) => { delTx.oncomplete = () => resolve(); });
    db.close();

    console.log('[BaitBridge] Transfer complete, IDB entry deleted');
    return { success: true };
  } catch (e) {
    return { success: false, error: `Transfer failed: ${e}` };
  }
}
