import * as THREE from 'three';
import type { MoldConfig } from '../types';

/**
 * Coordinate convention (matches Swimbait Designer):
 *   X = length (nose to tail)
 *   Y = height (belly to dorsal)
 *   Z = width (left to right, symmetric about Z=0)
 *   Parting plane at Z=0 — halfA is Z<0 (left), halfB is Z>0 (right)
 *
 * CSG fix: each box extends 0.05mm past Z=0 to avoid co-planar face artifacts.
 * The tiny overlap is invisible but gives the CSG evaluator clean geometry.
 */

const PARTING_OVERLAP = 0.05;

export class MoldBoxGenerator {
  generate(baitBounds: THREE.Box3, config: MoldConfig, halfSide: 'A' | 'B' = 'A'): THREE.BufferGeometry {
    const baitLenX = baitBounds.max.x - baitBounds.min.x;
    const baitHtY = baitBounds.max.y - baitBounds.min.y;
    const baitWidZ = baitBounds.max.z - baitBounds.min.z;

    const boxX = baitLenX + config.wallMarginY * 2;
    const boxY = baitHtY + config.wallMarginX * 2 + config.clampFlange * 2;
    const boxZ = baitWidZ / 2 + config.wallMarginZ + config.partingFaceDepth + PARTING_OVERLAP;

    // Use plain BoxGeometry for reliable CSG
    const geo = new THREE.BoxGeometry(boxX, boxY, boxZ);

    if (halfSide === 'A') {
      // Parting face extends to Z=+PARTING_OVERLAP, outer face at Z=-(boxZ - OVERLAP)
      geo.translate(0, 0, -boxZ / 2 + PARTING_OVERLAP);
    } else {
      // Parting face extends to Z=-PARTING_OVERLAP, outer face at Z=+(boxZ - OVERLAP)
      geo.translate(0, 0, boxZ / 2 - PARTING_OVERLAP);
    }

    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
  }
}
