import * as THREE from 'three';
import { mBox, mCylZ, mSubtract, mUnion, mTranslate, mBatchUnion, type ManifoldSolid } from '../csg';
import type { ClampConfig, MoldConfig, Vec3, PrintOrientation } from '../types';
import type { MoldDimensions } from './BaitSubtraction';
import { HEAT_SET_INSERT_HOLES, BOLT_CLEARANCE_HOLES } from '../constants';

const EPS = 0.01;

function autoPlacePositions(config: ClampConfig, bb: THREE.Box3, mc: MoldConfig, _dims: MoldDimensions): Vec3[] {
  const cx = (bb.max.x + bb.min.x) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const baitLenX = bb.max.x - bb.min.x;
  const baitHtY = bb.max.y - bb.min.y;
  const boxX = baitLenX + mc.wallMarginY * 2;
  const flangeInnerEdge = baitHtY / 2 + mc.wallMarginX;
  const flangeCenter = flangeInnerEdge + mc.clampFlange * 0.35;
  const cornerInset = 12; // mm from the corner along X
  const positions: Vec3[] = [];

  // Always place bolts at the 4 corners — most important for clamping
  const cornerX = boxX / 2 - cornerInset;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      positions.push({ x: cx + sx * cornerX, y: cy + sy * flangeCenter, z: 0 });

  // Add mid-span bolts if bolt count > 4
  if (config.boltCount >= 6) {
    // Add center bolt on each flange
    for (const sy of [-1, 1])
      positions.push({ x: cx, y: cy + sy * flangeCenter, z: 0 });
  }
  if (config.boltCount >= 8) {
    // Add quarter-span bolts
    const midX = cornerX / 2;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        positions.push({ x: cx + sx * midX, y: cy + sy * flangeCenter, z: 0 });
  }

  console.log(`[ClampFeatures] Auto-placed ${positions.length} bolts (corners + ${positions.length - 4} mid-span), flangeCenter=${flangeCenter.toFixed(1)}, boxX=${boxX.toFixed(1)}`);
  for (const p of positions) console.log(`  Bolt at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);

  return positions;
}

export class ClampFeatures {
  generateManifold(
    halfA: ManifoldSolid,
    halfB: ManifoldSolid | null,
    config: ClampConfig,
    baitBounds: THREE.Box3,
    moldConfig: MoldConfig,
    dims: MoldDimensions,
    printOrientation: PrintOrientation = 'on_edge',
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
    console.log(`[ClampFeatures] mode=${config.mode}, boltCount=${config.boltCount}, boltSize=${config.boltSize}, manualPositions=${config.positions.length}`);

    if (config.mode === 'external_clamp') {
      console.log('[ClampFeatures] External clamp — skipping');
      return { halfA, halfB };
    }

    const positions = config.positions.length > 0
      ? config.positions : autoPlacePositions(config, baitBounds, moldConfig, dims);
    const bs = config.boltSize;
    const BOLT_DROOP = 0.45; // mm extra diameter for top-edge bolt holes

    if (config.mode === 'heat_set_insert') {
      const ins = HEAT_SET_INSERT_HOLES[bs];
      const clr = BOLT_CLEARANCE_HOLES[bs];
      console.log(`[ClampFeatures] Insert hole: d=${ins.holeDiameter}mm, depth=${ins.depth}mm | Clearance: d=${clr.clearanceDiameter}mm, head=${clr.headDiameter}mm`);

      // HalfA: insert holes going down from Z=0
      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        const depth = ins.depth + EPS;
        const isTopEdge = printOrientation === 'on_edge' && pos.y > (baitBounds.max.y + baitBounds.min.y) / 2;
        const r = ins.holeDiameter / 2 + (isTopEdge ? BOLT_DROOP / 2 : 0);
        if (isTopEdge) console.log(`[ClampFeatures] Bolt at X=${pos.x.toFixed(1)}: +${BOLT_DROOP}mm droop compensation`);
        cuttersA.push(mTranslate(mCylZ(r, depth), pos.x, pos.y, -depth / 2 + EPS));
      }
      if (cuttersA.length > 0) {
        const compound = mBatchUnion(cuttersA);
        halfA = mSubtract(halfA, compound);
        console.log(`[ClampFeatures] Subtracted ${cuttersA.length} insert holes from halfA`);
      }

      // HalfB: clearance through-holes + countersinks going up from Z=0
      if (halfB) {
        const cutterH = dims.boxZ + 2; // extend 1mm past each face
        console.log(`[ClampFeatures] HalfB through-hole: cutterH=${cutterH.toFixed(1)}mm, moldHalfH=${dims.boxZ.toFixed(1)}mm`);
        const cuttersB: ManifoldSolid[] = [];
        for (const pos of positions) {
          const isTopEdge = printOrientation === 'on_edge' && pos.y > (baitBounds.max.y + baitBounds.min.y) / 2;
          const clrR = clr.clearanceDiameter / 2 + (isTopEdge ? BOLT_DROOP / 2 : 0);
          const through = mTranslate(mCylZ(clrR, cutterH), pos.x, pos.y, dims.boxZ / 2);
          const csink = mTranslate(mCylZ(clr.headDiameter / 2, clr.countersinkDepth + 1), pos.x, pos.y, dims.boxZ - clr.countersinkDepth / 2 + 0.5);
          cuttersB.push(mUnion(through, csink));
        }
        if (cuttersB.length > 0) {
          const compound = mBatchUnion(cuttersB);
          halfB = mSubtract(halfB, compound);
          console.log(`[ClampFeatures] Subtracted ${cuttersB.length} clearance holes from halfB`);
        }
      }
    } else {
      // Through-bolt — both halves get full through-holes
      const clr = BOLT_CLEARANCE_HOLES[bs];
      const cutterH = dims.boxZ + 2;
      console.log(`[ClampFeatures] Through-bolt: cutterH=${cutterH.toFixed(1)}mm`);

      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        cuttersA.push(mTranslate(mCylZ(clr.clearanceDiameter / 2, cutterH), pos.x, pos.y, -dims.boxZ / 2));
        cuttersA.push(mTranslate(mBox(16, 16, 5 + 1), pos.x, pos.y, -dims.boxZ + (5 + 1) / 2));
      }
      if (cuttersA.length > 0) halfA = mSubtract(halfA, mBatchUnion(cuttersA));

      if (halfB) {
        const cuttersB: ManifoldSolid[] = [];
        for (const pos of positions) {
          cuttersB.push(mTranslate(mCylZ(clr.clearanceDiameter / 2, cutterH), pos.x, pos.y, dims.boxZ / 2));
        }
        if (cuttersB.length > 0) halfB = mSubtract(halfB, mBatchUnion(cuttersB));
      }
    }

    console.log(`[ClampFeatures] Done — ${positions.length} bolts (${config.mode}, ${bs})`);
    return { halfA, halfB };
  }
}
