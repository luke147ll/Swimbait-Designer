import * as THREE from 'three';
import type { MoldConfig } from '../types';

/**
 * Coordinate convention (matches Swimbait Designer):
 *   X = length (nose to tail)
 *   Y = height (belly to dorsal)
 *   Z = width (left to right, symmetric about Z=0)
 *   Parting plane at Z=0 — halfA is Z<0 (left), halfB is Z>0 (right)
 *
 * Each box extends exactly to Z=0 — no overlap. Native Manifold handles
 * co-planar subtraction cleanly with the tube mesh.
 */

export class MoldBoxGenerator {
  generate(baitBounds: THREE.Box3, config: MoldConfig, halfSide: 'A' | 'B' = 'A'): THREE.BufferGeometry {
    const baitLenX = baitBounds.max.x - baitBounds.min.x;
    const baitHtY = baitBounds.max.y - baitBounds.min.y;
    const baitWidZ = baitBounds.max.z - baitBounds.min.z;

    const boxX = baitLenX + config.wallMarginY * 2;
    const boxY = baitHtY + config.wallMarginX * 2 + config.clampFlange * 2;
    const boxZ = baitWidZ / 2 + config.wallMarginZ + config.partingFaceDepth;

    const geo = new THREE.BoxGeometry(boxX, boxY, boxZ);

    if (halfSide === 'A') {
      geo.translate(0, 0, -boxZ / 2);
    } else {
      geo.translate(0, 0, boxZ / 2);
    }

    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
  }
}
