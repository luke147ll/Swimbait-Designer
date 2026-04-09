import * as THREE from 'three';
import { mBox, mCylX, mSubtract, mTranslate, mBatchUnion, type ManifoldSolid } from '../csg';
import type { SprueConfig, MoldConfig } from '../types';
import type { MoldDimensions } from './BaitSubtraction';

const OS = 4;

export class SprueCutter {
  generateManifold(
    halfA: ManifoldSolid,
    halfB: ManifoldSolid | null,
    config: SprueConfig,
    baitBounds: THREE.Box3,
    moldConfig: MoldConfig,
    _dims: MoldDimensions,
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
    if (config.preset === 'open_pour') return { halfA, halfB };

    const baitLenX = baitBounds.max.x - baitBounds.min.x;
    const cx = (baitBounds.max.x + baitBounds.min.x) / 2;
    const moldXHalf = baitLenX / 2 + moldConfig.wallMarginY;
    const wallThickness = moldConfig.wallMarginY;

    let edgeX: number, dirX: number;
    // In viewport: head = -X, tail = +X
    if (config.position === 'tail') { edgeX = cx + moldXHalf; dirX = -1; }
    else if (config.position === 'head') { edgeX = cx - moldXHalf; dirX = 1; }
    else { return { halfA, halfB }; } // side — TODO

    const entryLen = 8 + OS;
    const boreLen = wallThickness + OS;
    const gateLen = (config.gateType === 'pinch' ? 4 : config.gateType === 'fan' ? 5 : 3) + OS;

    // Z offset — shifts the injection port vertically (Y in mold coords)
    const oy = config.offsetZ || 0;

    // Build sprue parts and subtract from both halves
    // We need to build parts twice since Manifold subtract consumes context
    for (let pass = 0; pass < 2; pass++) {
      const isA = pass === 0;
      if (!isA && !halfB) continue;

      const parts: ManifoldSolid[] = [];

      if (config.entryDiameter > 0) {
        parts.push(mTranslate(mCylX(config.entryDiameter / 2, entryLen),
          edgeX + dirX * (entryLen / 2 - OS), oy, 0));
      }

      parts.push(mTranslate(mCylX(config.boreDiameter / 2, boreLen),
        edgeX + dirX * (entryLen - OS + boreLen / 2), oy, 0));

      const gateTx = edgeX + dirX * (entryLen - OS + boreLen + gateLen / 2);
      if (config.gateType === 'pinch') {
        parts.push(mTranslate(mBox(gateLen, 1.5, 3), gateTx, oy, 0));
      } else if (config.gateType === 'fan') {
        const fanH = Math.min(baitBounds.max.y - baitBounds.min.y, 25);
        parts.push(mTranslate(mBox(gateLen, fanH, 1.5), gateTx, oy, 0));
      } else {
        parts.push(mTranslate(mCylX(config.boreDiameter / 2, gateLen), gateTx, oy, 0));
      }

      const compound = mBatchUnion(parts);
      if (isA) {
        halfA = mSubtract(halfA, compound);
      } else {
        halfB = mSubtract(halfB!, compound);
      }
    }

    console.log(`[SprueCutter] ${config.preset} at ${config.position}, gate=${config.gateType}`);
    return { halfA, halfB };
  }
}
