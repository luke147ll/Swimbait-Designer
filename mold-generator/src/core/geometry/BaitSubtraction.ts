import * as THREE from 'three';
import { threeToManifold, manifoldToThree, mBox, mSubtract, mTranslate, type ManifoldSolid } from '../csg';
import type { MoldConfig } from '../types';

const PARTING_OVERLAP = 0.05;
const MIN_WALL = 3; // mm — absolute minimum wall around any part of the bait

function offsetMesh(geometry: THREE.BufferGeometry, offset: number): THREE.BufferGeometry {
  const geo = geometry.clone();
  geo.computeVertexNormals();
  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    positions.setX(i, positions.getX(i) + normals.getX(i) * offset);
    positions.setY(i, positions.getY(i) + normals.getY(i) * offset);
    positions.setZ(i, positions.getZ(i) + normals.getZ(i) * offset);
  }
  positions.needsUpdate = true;
  geo.computeBoundingBox();
  return geo;
}

export interface MoldDimensions {
  boxX: number;
  boxY: number;
  boxZ: number;
}

export class BaitSubtraction {
  subtractManifold(
    baitMesh: THREE.BufferGeometry,
    moldConfig: MoldConfig,
    texturedBaitMesh: THREE.BufferGeometry | null,
    baitManifold: ManifoldSolid | null = null,
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null; dims: MoldDimensions } {
    const startTime = performance.now();

    // Get Manifold solid
    let baitM: ManifoldSolid;
    if (baitManifold && !texturedBaitMesh) {
      console.log('[BaitSubtraction] Using native Manifold solid');
      baitM = baitManifold;
    } else {
      const meshToUse = texturedBaitMesh ?? baitMesh;
      const offsetBait = moldConfig.cavityClearance > 0
        ? offsetMesh(meshToUse, moldConfig.cavityClearance)
        : meshToUse.clone();
      console.log('[BaitSubtraction] Converting Three.js mesh to Manifold...');
      baitM = threeToManifold(offsetBait);
    }

    // Get ACTUAL bait bounds from the Manifold solid (not the Three.js mesh)
    // Convert momentarily to get accurate bounds
    const tempGeo = manifoldToThree(baitM);
    tempGeo.computeBoundingBox();
    const bb = tempGeo.boundingBox!;
    const center = new THREE.Vector3();
    bb.getCenter(center);

    const baitLenX = bb.max.x - bb.min.x;
    const baitHtY = bb.max.y - bb.min.y;
    const baitWidZ = bb.max.z - bb.min.z;

    console.log(`[BaitSubtraction] Bait bounds: ${baitLenX.toFixed(1)} × ${baitHtY.toFixed(1)} × ${baitWidZ.toFixed(1)} mm, center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})`);

    // Calculate box dimensions with guaranteed minimum wall thickness
    const wallX = Math.max(moldConfig.wallMarginY, MIN_WALL);
    const wallY = Math.max(moldConfig.wallMarginX, MIN_WALL);
    const wallZ = Math.max(moldConfig.wallMarginZ, MIN_WALL);

    const boxX = baitLenX + wallX * 2;
    const boxY = baitHtY + wallY * 2 + moldConfig.clampFlange * 2;

    // Z: each half must contain the bait's extent on its side + floor + parting depth
    const baitAboveZ = bb.max.z; // how far bait extends above Z=0
    const baitBelowZ = Math.abs(bb.min.z); // how far below Z=0
    const halfAZ = Math.max(baitBelowZ, baitWidZ / 2) + wallZ + moldConfig.partingFaceDepth + PARTING_OVERLAP;
    const halfBZ = Math.max(baitAboveZ, baitWidZ / 2) + wallZ + moldConfig.partingFaceDepth + PARTING_OVERLAP;
    const boxZ = Math.max(halfAZ, halfBZ); // use the larger of the two for symmetry

    console.log(`[BaitSubtraction] Box: ${boxX.toFixed(1)} × ${boxY.toFixed(1)} × ${boxZ.toFixed(1)} mm (per half)`);

    // Build mold boxes centered on the bait's XY center (Z stays at parting plane)
    const cx = center.x;
    const cy = center.y;

    const boxAM = mTranslate(mBox(boxX, boxY, boxZ), cx, cy, -boxZ / 2 + PARTING_OVERLAP);
    const boxBM = mTranslate(mBox(boxX, boxY, boxZ), cx, cy, boxZ / 2 - PARTING_OVERLAP);

    console.log('[BaitSubtraction] Subtracting bait from halfA...');
    const halfA = mSubtract(boxAM, baitM);

    console.log('[BaitSubtraction] Subtracting bait from halfB...');
    const halfB = mSubtract(boxBM, baitM);

    const elapsed = (performance.now() - startTime).toFixed(1);
    console.log(`[BaitSubtraction] Done in ${elapsed}ms`);

    return { halfA, halfB, dims: { boxX, boxY, boxZ } };
  }
}
