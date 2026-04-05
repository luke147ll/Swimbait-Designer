/**
 * BaitBridge — handles the complete handoff from the Swimbait Designer
 * to the Mold Generator.
 *
 * Transfer pipeline:
 * 1. Get geometry from designer (window.bodyMesh or localStorage)
 * 2. Scale from inches to mm (×25.4)
 * 3. Remap axes: designer X,Y,Z → mold generator X,Y,Z
 * 4. Center at origin
 * 5. Shift parting plane to widest cross-section
 * 6. Store in moldStore
 * 7. Attempt Manifold conversion
 */
import * as THREE from 'three';
import { useMoldStore } from '../store/moldStore';
import { initCSG, threeToManifold } from './csg';

const INCHES_TO_MM = 25.4;

/**
 * Transfer the bait geometry from the designer to the mold generator.
 */
export async function transferBaitToMoldGenerator(): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get geometry — try window.bodyMesh first, then localStorage
    let geo: THREE.BufferGeometry | null = null;
    let fileName = 'designed_bait.sbd';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wBodyMesh = (window as any).bodyMesh as THREE.Mesh | undefined;
    if (wBodyMesh && wBodyMesh.geometry && wBodyMesh.geometry.attributes.position.count > 0) {
      console.log('[BaitBridge] Found bodyMesh on window');
      geo = wBodyMesh.geometry.clone() as THREE.BufferGeometry;
      if (wBodyMesh.matrixWorldNeedsUpdate) wBodyMesh.updateMatrixWorld();
      geo.applyMatrix4(wBodyMesh.matrixWorld);
    } else {
      // Try localStorage (cross-page transfer)
      const stored = localStorage.getItem('sbd_bait_geometry');
      if (stored) {
        console.log('[BaitBridge] Found bait in localStorage');
        const data = JSON.parse(stored);
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
        if (data.index) geo.setIndex(data.index);
        fileName = data.name || fileName;
        localStorage.removeItem('sbd_bait_geometry');
      }
    }

    if (!geo) {
      return { success: false, error: 'No bait geometry found. Design a bait first.' };
    }

    // 2. Scale inches → mm
    geo.scale(INCHES_TO_MM, INCHES_TO_MM, INCHES_TO_MM);

    // 3. Remap axes
    // Designer: X = length (nose→tail), Y = height (belly→dorsal), Z = width (L→R)
    // Mold gen: X = length (nose→tail), Y = height (belly→dorsal), Z = width (L→R)
    // Actually these ARE the same convention! Both use X=length, Y=height, Z=width.
    // No axis remap needed.

    // 4. Center at origin
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    // 5. Shift parting plane to widest cross-section (Z=0)
    geo.computeBoundingBox();
    const positions = geo.attributes.position;
    const zBuckets = new Map<number, number>();
    for (let i = 0; i < positions.count; i++) {
      const z = Math.round(positions.getZ(i) * 10) / 10;
      const x = Math.abs(positions.getX(i));
      if (!zBuckets.has(z) || x > zBuckets.get(z)!) {
        zBuckets.set(z, x);
      }
    }
    // Actually for the mold, Z is width (left/right symmetric about Z=0)
    // The parting plane IS at Z=0 which splits left/right — this is already correct
    // since the bait is symmetric about Z=0 (mirrored halves in the designer)

    // 6. Recompute normals
    geo.computeVertexNormals();
    geo.computeBoundingBox();

    // 7. Log dimensions
    const size = new THREE.Vector3();
    geo.boundingBox!.getSize(size);
    console.log('[BaitBridge] Transferred bait geometry:');
    console.log(`  Length (X): ${size.x.toFixed(1)} mm`);
    console.log(`  Height (Y): ${size.y.toFixed(1)} mm`);
    console.log(`  Width (Z):  ${size.z.toFixed(1)} mm`);
    console.log(`  Vertices:   ${positions.count}`);

    // 8. Store in moldStore
    const store = useMoldStore.getState();
    store.setBaitMesh(geo, fileName);

    // 9. Attempt Manifold conversion
    try {
      await initCSG();
      const manifold = threeToManifold(geo);
      store.setBaitManifold(manifold);
      console.log('[BaitBridge] Manifold conversion successful');
    } catch (e) {
      console.warn('[BaitBridge] Manifold conversion failed (will use fallback):', e);
      store.setBaitManifold(null);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: `Transfer failed: ${e}` };
  }
}

/**
 * Check if a bait is available from the designer.
 */
export function isBaitReady(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wBodyMesh = (window as any).bodyMesh as THREE.Mesh | undefined;
  if (wBodyMesh && wBodyMesh.geometry && wBodyMesh.geometry.attributes.position.count > 0) return true;
  return !!localStorage.getItem('sbd_bait_geometry');
}

/**
 * Get bait dimensions in inches (for display before transfer).
 */
export function getBaitDimensions(): { length: number; width: number; height: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wBodyMesh = (window as any).bodyMesh as THREE.Mesh | undefined;
  if (!wBodyMesh?.geometry) return null;
  const geo = wBodyMesh.geometry;
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);
  return { length: size.x, height: size.y, width: size.z };
}

/**
 * Save bait geometry to localStorage for cross-page transfer.
 * Call this from the designer before navigating to the mold generator.
 */
export function saveBaitToStorage(geometry: THREE.BufferGeometry, name: string): void {
  const positions = Array.from(geometry.attributes.position.array);
  const index = geometry.index ? Array.from(geometry.index.array) : null;
  localStorage.setItem('sbd_bait_geometry', JSON.stringify({ positions, index, name, timestamp: Date.now() }));
  console.log('[BaitBridge] Saved bait to localStorage');
}
