import * as THREE from 'three';
import { mBox, mCylZ, mSubtract, mUnion, mTranslate, mBatchUnion, type ManifoldSolid } from '../csg';
import type { AlignmentConfig, MoldConfig, Vec3 } from '../types';
import type { MoldDimensions } from './BaitSubtraction';

const EPS = 0.01;

function autoPlacePositions(config: AlignmentConfig, bb: THREE.Box3, mc: MoldConfig): Vec3[] {
  const cx = (bb.max.x + bb.min.x) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const baitLenX = bb.max.x - bb.min.x;
  const baitHtY = bb.max.y - bb.min.y;
  const pinInset = 12;
  const wallCenter = baitHtY / 2 + mc.wallMarginX * 0.5;
  const boxXHalf = baitLenX / 2 + mc.wallMarginY;

  if (config.pinCount === 4) {
    return [
      { x: cx - boxXHalf + pinInset, y: cy - wallCenter, z: 0 },
      { x: cx + boxXHalf - pinInset, y: cy - wallCenter, z: 0 },
      { x: cx - boxXHalf + pinInset, y: cy + wallCenter, z: 0 },
      { x: cx + boxXHalf - pinInset, y: cy + wallCenter, z: 0 },
    ];
  }
  return [
    { x: cx - boxXHalf + pinInset, y: cy - wallCenter, z: 0 },
    { x: cx + boxXHalf - pinInset, y: cy + wallCenter, z: 0 },
  ];
}

export class AlignmentFeatures {
  generateManifold(
    halfA: ManifoldSolid,
    halfB: ManifoldSolid | null,
    config: AlignmentConfig,
    baitBounds: THREE.Box3,
    moldConfig: MoldConfig,
    _dims: MoldDimensions,
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
    const positions = config.positions.length > 0
      ? config.positions : autoPlacePositions(config, baitBounds, moldConfig);

    const socketDepth = config.pinLength / 2 + 1 + EPS;

    if (config.type === 'dowel_pin') {
      // HalfA: press-fit sockets
      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        const d = (config.pinDiameter + config.pressClearance) / 2;
        cuttersA.push(mTranslate(mCylZ(d, socketDepth), pos.x, pos.y, -socketDepth / 2 + EPS / 2));
      }
      if (cuttersA.length > 0) {
        const compound = mBatchUnion(cuttersA);
        halfA = mSubtract(halfA, compound);
      }

      // HalfB: slip-fit sockets
      if (halfB) {
        const cuttersB: ManifoldSolid[] = [];
        for (const pos of positions) {
          const d = (config.pinDiameter + config.slipClearance) / 2;
          cuttersB.push(mTranslate(mCylZ(d, socketDepth), pos.x, pos.y, socketDepth / 2 - EPS / 2));
        }
        if (cuttersB.length > 0) {
          const compound = mBatchUnion(cuttersB);
          halfB = mSubtract(halfB, compound);
        }
      }
    } else {
      // Printed pin: bosses on halfA
      const bosses: ManifoldSolid[] = [];
      for (const pos of positions) {
        const h = config.pinLength / 2;
        bosses.push(mTranslate(mCylZ(config.pinDiameter / 2, h), pos.x, pos.y, h / 2));
      }
      if (bosses.length > 0) {
        const compound = mBatchUnion(bosses);
        halfA = mUnion(halfA, compound);
      }

      // Sockets in halfB
      if (halfB) {
        const cuttersB: ManifoldSolid[] = [];
        for (const pos of positions) {
          const d = (config.pinDiameter + 0.3) / 2;
          const h = config.pinLength / 2 + 0.5 + EPS;
          cuttersB.push(mTranslate(mCylZ(d, h), pos.x, pos.y, h / 2 - EPS / 2));
        }
        if (cuttersB.length > 0) {
          const compound = mBatchUnion(cuttersB);
          halfB = mSubtract(halfB, compound);
        }
      }
    }

    // Perimeter key
    if (config.perimeterKey) {
      const cx = (baitBounds.max.x + baitBounds.min.x) / 2;
      const cy = (baitBounds.max.y + baitBounds.min.y) / 2;
      const baitLenX = baitBounds.max.x - baitBounds.min.x;
      const baitHtY = baitBounds.max.y - baitBounds.min.y;
      const outerX = baitLenX + moldConfig.wallMarginY * 2 - 4;
      const outerY = baitHtY + moldConfig.wallMarginX * 2 + moldConfig.clampFlange * 2 - 4;
      const lipW = 1.5, keyH = config.keyHeight;

      // HalfA: raised lip frame
      const outer = mTranslate(mBox(outerX, outerY, keyH), cx, cy, keyH / 2);
      const inner = mTranslate(mBox(outerX - lipW * 2, outerY - lipW * 2, keyH + EPS * 2), cx, cy, keyH / 2);
      const frame = mSubtract(outer, inner);
      halfA = mUnion(halfA, frame);

      // HalfB: matching recess
      if (halfB) {
        const rH = keyH + 0.15 + EPS;
        const rOuter = mTranslate(mBox(outerX + 0.3, outerY + 0.3, rH), cx, cy, rH / 2 - EPS / 2);
        const rInner = mTranslate(mBox(outerX - (lipW + 0.15) * 2, outerY - (lipW + 0.15) * 2, rH + EPS * 2), cx, cy, rH / 2 - EPS / 2);
        const recess = mSubtract(rOuter, rInner);
        halfB = mSubtract(halfB, recess);
      }
    }

    console.log(`[AlignmentFeatures] ${positions.length} pins (${config.type}), perimeterKey=${config.perimeterKey}`);
    return { halfA, halfB };
  }
}
