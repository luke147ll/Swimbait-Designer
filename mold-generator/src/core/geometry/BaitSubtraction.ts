import * as THREE from 'three';
import { threeToManifold, mBox, mSubtract, mTranslate, type ManifoldSolid } from '../csg';
import type { MoldConfig } from '../types';

const MIN_WALL = 3;

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

    const meshToUse = texturedBaitMesh ?? baitMesh;

    const prepared = meshToUse.clone();

    const offsetBait = moldConfig.cavityClearance > 0
      ? offsetMesh(prepared, moldConfig.cavityClearance)
      : prepared;

    // Get bounds from Three.js mesh
    offsetBait.computeBoundingBox();
    const bb = offsetBait.boundingBox!;
    const center = new THREE.Vector3();
    bb.getCenter(center);

    const baitLenX = bb.max.x - bb.min.x;
    const baitHtY = bb.max.y - bb.min.y;
    const baitWidZ = bb.max.z - bb.min.z;

    console.log(`[BaitSubtraction] Bait bounds: ${baitLenX.toFixed(1)} × ${baitHtY.toFixed(1)} × ${baitWidZ.toFixed(1)} mm`);

    // Calculate box dimensions
    const wallX = Math.max(moldConfig.wallMarginY, MIN_WALL);
    const wallY = Math.max(moldConfig.wallMarginX, MIN_WALL);
    const wallZ = Math.max(moldConfig.wallMarginZ, MIN_WALL);

    const boxX = baitLenX + wallX * 2;
    const boxY = baitHtY + wallY * 2 + moldConfig.clampFlange * 2;
    const baitAboveZ = bb.max.z;
    const baitBelowZ = Math.abs(bb.min.z);
    const halfZ = Math.max(baitAboveZ, baitBelowZ, baitWidZ / 2) + wallZ + moldConfig.partingFaceDepth;

    console.log(`[BaitSubtraction] Box: ${boxX.toFixed(1)} × ${boxY.toFixed(1)} × ${halfZ.toFixed(1)} mm per half`);

    // Get Manifold solid and shift 0.1mm in +Z so no bait faces
    // sit exactly on the Z=0 parting plane (prevents co-planar membrane)
    let baitM: ManifoldSolid;
    if (baitManifold && !texturedBaitMesh) {
      console.log('[BaitSubtraction] Using native Manifold solid (+0.1mm Z shift)');
      baitM = baitManifold.translate([0, 0, 0.1]);
    } else {
      console.log('[BaitSubtraction] Converting Three.js mesh to Manifold...');
      baitM = threeToManifold(offsetBait).translate([0, 0, 0.1]);
    }

    // Build mold boxes — parting face at Z=0
    const cx = center.x;
    const cy = center.y;

    const boxAM = mTranslate(mBox(boxX, boxY, halfZ), cx, cy, -halfZ / 2);
    const boxBM = mTranslate(mBox(boxX, boxY, halfZ), cx, cy, halfZ / 2);

    console.log('[BaitSubtraction] Subtracting bait from halfA...');
    const halfA = mSubtract(boxAM, baitM);

    console.log('[BaitSubtraction] Subtracting bait from halfB...');
    const halfB = mSubtract(boxBM, baitM);

    const elapsed = (performance.now() - startTime).toFixed(1);
    console.log(`[BaitSubtraction] Done in ${elapsed}ms`);

    return { halfA, halfB, dims: { boxX, boxY, boxZ: halfZ } };
  }
}
