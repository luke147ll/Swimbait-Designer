import * as THREE from 'three';
import { mBox, mCylZ, mSubtract, mUnion, mTranslate, mBatchUnion, manifoldToThree, type ManifoldSolid } from '../csg';
import type { AlignmentConfig, AlignmentPin, MoldConfig, Vec3, PrintOrientation } from '../types';
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
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null; pins: AlignmentPin[] } {
    const positions = config.positions.length > 0
      ? config.positions : autoPlacePositions(config, baitBounds, moldConfig);
    let generatedPins: AlignmentPin[] = [];

    const socketDepth = config.pinLength / 2 + 1 + EPS;

    if (config.type === 'dowel_pin') {
      // Droop compensation: oversize top-edge sockets when printing on edge
      const PIN_DROOP = 0.3; // mm extra radius for top-edge pins

      // HalfA: press-fit sockets
      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        const isTopEdge = printOrientation === 'on_edge' && pos.y > (baitBounds.max.y + baitBounds.min.y) / 2;
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
          const isTopEdge = printOrientation === 'on_edge' && pos.y > (baitBounds.max.y + baitBounds.min.y) / 2;
          const d = (config.pinDiameter + config.slipClearance) / 2 + (isTopEdge ? PIN_DROOP : 0);
          cuttersB.push(mTranslate(mCylZ(d, socketDepth), pos.x, pos.y, socketDepth / 2 - EPS / 2));
        }
        if (cuttersB.length > 0) {
          const compound = mBatchUnion(cuttersB);
          halfB = mSubtract(halfB, compound);
        }
      }
    } else if (config.type === 'hex_printed') {
      // Hex printed pins: hex sockets in BOTH halves, separate printable hex pins.
      // Hex = 6-segment cylinder. Socket has 0.15mm clearance per side.
      const HEX_CLEARANCE = 0.15;
      const pinR = config.pinDiameter / 2;
      const socketR = pinR + HEX_CLEARANCE;
      const halfDepth = config.pinLength / 2 + 0.5 + EPS;

      // Hex sockets in halfA (extending into -Z)
      const cuttersA: ManifoldSolid[] = [];
      for (const pos of positions) {
        cuttersA.push(mTranslate(mCylZ(socketR, halfDepth, 6), pos.x, pos.y, -halfDepth / 2 + EPS / 2));
      }
      if (cuttersA.length > 0) halfA = mSubtract(halfA, mBatchUnion(cuttersA));

      // Hex sockets in halfB (extending into +Z)
      if (halfB) {
        const cuttersB: ManifoldSolid[] = [];
        for (const pos of positions) {
          cuttersB.push(mTranslate(mCylZ(socketR, halfDepth, 6), pos.x, pos.y, halfDepth / 2 - EPS / 2));
        }
        if (cuttersB.length > 0) halfB = mSubtract(halfB, mBatchUnion(cuttersB));
      }

      // Generate printable hex pins (separate STL exports)
      const pins: AlignmentPin[] = [];
      for (let i = 0; i < positions.length; i++) {
        const pinSolid = mCylZ(pinR, config.pinLength, 6);
        const pinGeo = manifoldToThree(pinSolid);
        pinGeo.computeVertexNormals();
        pins.push({ label: `Hex Pin ${i + 1}`, geometry: pinGeo });
      }
      generatedPins = pins;
      console.log(`[AlignmentFeatures] ${positions.length} hex sockets (${socketR.toFixed(2)}mm radius, ${HEX_CLEARANCE}mm clearance)`);
    } else {
      // Printed pin (round): bosses on halfA
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
      const lipW = 2.0;
      // On-edge: key extends in Z → horizontal in print. Keep it ≤1mm so
      // the overhang is just a single-layer bridge (trivial for FDM).
      const keyH = printOrientation === 'on_edge' ? Math.min(config.keyHeight, 1.0) : config.keyHeight;

      // Collect all positions that need clearance (pins + bolts)
      const allHolePositions = [...positions, ...clampPositions];

      // Build key frame
      const outer = mTranslate(mBox(outerX, outerY, keyH), cx, cy, keyH / 2);
      const inner = mTranslate(mBox(outerX - lipW * 2, outerY - lipW * 2, keyH + EPS * 2), cx, cy, keyH / 2);
      let frame = mSubtract(outer, inner);

      // On-edge: remove horizontal segments, chamfer male key top faces.
      // When on-edge, Z is the print depth axis — the key top face (at Z=keyH)
      // is a horizontal shelf that sags. A 45° chamfer makes it self-supporting.
      if (printOrientation === 'on_edge') {
        const cutH = lipW + 4;
        // Remove bottom (-Y) segment
        const bottomCut = mTranslate(mBox(outerX + 4, cutH, keyH + 4),
          cx, cy - outerY / 2 + lipW / 2, keyH / 2);
        frame = mSubtract(frame, bottomCut);
        // Remove top (+Y) segment
        const topCut = mTranslate(mBox(outerX + 4, cutH, keyH + 4),
          cx, cy + outerY / 2 - lipW / 2, keyH / 2);
        frame = mSubtract(frame, topCut);

        // Male key top face is only lipW (2mm) wide — prints as a short bridge,
        // no chamfer needed. The recess ceiling is the real sag issue (handled below).
        console.log('[AlignmentFeatures] On-edge: 2-sided key (vertical rails only)');
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

      // HalfB: matching recess (slightly deeper than key for clearance)
      if (halfB) {
        const rH = keyH + 0.15 + EPS;
        const rOuter = mTranslate(mBox(outerX + 0.3, outerY + 0.3, rH), cx, cy, rH / 2 - EPS / 2);
        const rInner = mTranslate(mBox(outerX - (lipW + 0.15) * 2, outerY - (lipW + 0.15) * 2, rH + EPS * 2), cx, cy, rH / 2 - EPS / 2);
        let recess = mSubtract(rOuter, rInner);

        // On-edge: remove both horizontal segments of recess
        if (printOrientation === 'on_edge') {
          const cutH = lipW + 4;
          const bottomCut = mTranslate(mBox(outerX + 4, cutH, rH + 4),
            cx, cy - outerY / 2 + lipW / 2, rH / 2 - EPS / 2);
          const topCut = mTranslate(mBox(outerX + 4, cutH, rH + 4),
            cx, cy + outerY / 2 - lipW / 2, rH / 2 - EPS / 2);
          recess = mSubtract(recess, mBatchUnion([bottomCut, topCut]));
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
    return { halfA, halfB, pins: generatedPins };
  }
}
