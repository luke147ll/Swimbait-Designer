import * as THREE from 'three';
import { mBox, mCylZ, mSubtract, mUnion, mTranslate, mBatchUnion, type ManifoldSolid } from '../csg';
import type { AlignmentConfig, MoldConfig, Vec3, PrintOrientation } from '../types';
import type { MoldDimensions } from './BaitSubtraction';

const EPS = 0.01;
const KEY_CLEARANCE = 2.0; // mm clearance radius around pins/bolts in the key frame

function autoPlacePositions(config: AlignmentConfig, bb: THREE.Box3, mc: MoldConfig): Vec3[] {
  const cx = (bb.max.x + bb.min.x) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const baitLenX = bb.max.x - bb.min.x;
  const baitHtY = bb.max.y - bb.min.y;
  const pinInset = 20;
  const wallCenter = baitHtY / 2 + mc.wallMarginX * 0.25;
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
    clampPositions: Vec3[] = [],
    printOrientation: PrintOrientation = 'on_edge',
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
    const positions = config.positions.length > 0
      ? config.positions : autoPlacePositions(config, baitBounds, moldConfig);
    const cx = (baitBounds.max.x + baitBounds.min.x) / 2;

    const socketDepth = config.pinLength / 2 + 1 + EPS;

    if (config.type === 'dowel_pin') {
      // Droop compensation: oversize top-edge sockets when printing on edge
      const PIN_DROOP = 0.2; // mm extra radius for top-edge pins

      // HalfA: press-fit sockets
      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        const isTopEdge = printOrientation === 'on_edge' && pos.x > cx;
        const d = (config.pinDiameter + config.pressClearance) / 2 + (isTopEdge ? PIN_DROOP : 0);
        if (isTopEdge) console.log(`[AlignmentFeatures] Pin at X=${pos.x.toFixed(1)}: +${PIN_DROOP}mm droop compensation`);
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
          const isTopEdge = printOrientation === 'on_edge' && pos.x > cx;
          const d = (config.pinDiameter + config.slipClearance) / 2 + (isTopEdge ? PIN_DROOP : 0);
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

      // Collect all positions that need clearance (pins + bolts)
      const allHolePositions = [...positions, ...clampPositions];

      // HalfA: raised lip frame with clearance cutouts
      const outer = mTranslate(mBox(outerX, outerY, keyH), cx, cy, keyH / 2);
      const inner = mTranslate(mBox(outerX - lipW * 2, outerY - lipW * 2, keyH + EPS * 2), cx, cy, keyH / 2);
      let frame = mSubtract(outer, inner);

      // On-edge: remove bottom (-X) segment of the key (sits on build plate)
      if (printOrientation === 'on_edge') {
        // Cut a wide strip across the full bottom edge of the frame
        const cutW = lipW + 4; // wide enough to fully remove the bottom lip
        const bottomCut = mTranslate(mBox(cutW, outerY + 4, keyH + 4),
          cx - outerX / 2 + lipW / 2, cy, keyH / 2);
        frame = mSubtract(frame, bottomCut);
        console.log('[AlignmentFeatures] Removed bottom key segment for on-edge printing');
      }

      // Cut clearance holes through the key frame at each pin/bolt position
      if (allHolePositions.length > 0) {
        const cutouts: ManifoldSolid[] = [];
        for (const pos of allHolePositions) {
          const r = config.pinDiameter / 2 + KEY_CLEARANCE;
          cutouts.push(mTranslate(mCylZ(r, keyH + EPS * 4), pos.x, pos.y, keyH / 2));
        }
        frame = mSubtract(frame, mBatchUnion(cutouts));
      }

      halfA = mUnion(halfA, frame);

      // HalfB: matching recess with same clearance cutouts
      if (halfB) {
        const rH = keyH + 0.15 + EPS;
        const rOuter = mTranslate(mBox(outerX + 0.3, outerY + 0.3, rH), cx, cy, rH / 2 - EPS / 2);
        const rInner = mTranslate(mBox(outerX - (lipW + 0.15) * 2, outerY - (lipW + 0.15) * 2, rH + EPS * 2), cx, cy, rH / 2 - EPS / 2);
        let recess = mSubtract(rOuter, rInner);

        // On-edge: remove bottom (-X) segment of recess too
        if (printOrientation === 'on_edge') {
          const cutW = lipW + 4;
          const bottomCut = mTranslate(mBox(cutW, outerY + 4, rH + 4),
            cx - outerX / 2 + lipW / 2, cy, rH / 2 - EPS / 2);
          recess = mSubtract(recess, bottomCut);
        }

        if (allHolePositions.length > 0) {
          const cutouts: ManifoldSolid[] = [];
          for (const pos of allHolePositions) {
            const r = config.pinDiameter / 2 + KEY_CLEARANCE;
            cutouts.push(mTranslate(mCylZ(r, rH + EPS * 4), pos.x, pos.y, rH / 2 - EPS / 2));
          }
          recess = mSubtract(recess, mBatchUnion(cutouts));
        }

        halfB = mSubtract(halfB, recess);
      }
    }

    console.log(`[AlignmentFeatures] ${positions.length} pins (${config.type}), perimeterKey=${config.perimeterKey}`);
    return { halfA, halfB };
  }
}
