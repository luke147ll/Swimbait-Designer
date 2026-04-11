import * as THREE from 'three';
import { mCylZ, mSubtract, mTranslate, mBatchUnion, type ManifoldSolid } from '../csg';
import type { ClampConfig, MoldConfig, Vec3, PrintOrientation } from '../types';
import type { MoldDimensions } from './BaitSubtraction';
import { BOLT_CLEARANCE_HOLES } from '../constants';


function autoPlacePositions(config: ClampConfig, bb: THREE.Box3, mc: MoldConfig, _dims: MoldDimensions): Vec3[] {
  const cx = (bb.max.x + bb.min.x) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const baitLenX = bb.max.x - bb.min.x;
  const baitHtY = bb.max.y - bb.min.y;
  const boxX = baitLenX + mc.wallMarginY * 2;
  const flangeInnerEdge = baitHtY / 2 + mc.wallMarginX;
  const flangeCenter = flangeInnerEdge + mc.clampFlange * 0.35 - (config.boltInset || 0);
  const baseInset = 12; // mm base inset from the corner along X
  const headExtra = config.headInset || 0; // extra inset for head end (negative X)
  const tailExtra = config.tailInset || 0; // extra inset for tail end (positive X)
  const positions: Vec3[] = [];

  // 4 corner bolts with independent head/tail insets
  // Head end is at -X (negative), tail end is at +X (positive)
  const headX = -(boxX / 2 - baseInset - headExtra);
  const tailX = boxX / 2 - baseInset - tailExtra;
  for (const sy of [-1, 1]) {
    positions.push({ x: cx + headX, y: cy + sy * flangeCenter, z: 0 }); // head bolts
    positions.push({ x: cx + tailX, y: cy + sy * flangeCenter, z: 0 }); // tail bolts
  }

  // Add mid-span bolts if bolt count > 4
  if (config.boltCount >= 6) {
    // Add center bolt on each flange
    for (const sy of [-1, 1])
      positions.push({ x: cx, y: cy + sy * flangeCenter, z: 0 });
  }
  if (config.boltCount >= 8) {
    // Add quarter-span bolts
    const midX = tailX / 2;
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
    _printOrientation: PrintOrientation = 'on_edge',
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
    console.log(`[ClampFeatures] mode=${config.mode}, boltCount=${config.boltCount}, boltSize=${config.boltSize}, manualPositions=${config.positions.length}`);

    if (config.mode === 'external_clamp') {
      console.log('[ClampFeatures] External clamp — skipping');
      return { halfA, halfB };
    }

    const positions = config.positions.length > 0
      ? config.positions : autoPlacePositions(config, baitBounds, moldConfig, dims);
    const bs = config.boltSize;

    {
      // Through-bolt — both halves get full through-holes
      const clr = BOLT_CLEARANCE_HOLES[bs];
      const cutterH = dims.boxZ + 2;
      console.log(`[ClampFeatures] Through-bolt: cutterH=${cutterH.toFixed(1)}mm`);

      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        cuttersA.push(mTranslate(mCylZ(clr.clearanceDiameter / 2, cutterH), pos.x, pos.y, -dims.boxZ / 2));
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
