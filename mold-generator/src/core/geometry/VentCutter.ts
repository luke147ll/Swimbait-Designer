import * as THREE from 'three';
import { mBox, mSubtract, mTranslate, mBatchUnion, type ManifoldSolid } from '../csg';
import type { VentConfig, MoldConfig, SprueConfig, Vec3 } from '../types';
import type { MoldDimensions } from './BaitSubtraction';

const OS = 4;

function autoPlaceVents(bb: THREE.Box3, mc: MoldConfig, sc: SprueConfig): Vec3[] {
  const cx = (bb.max.x + bb.min.x) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const baitLenX = bb.max.x - bb.min.x;
  const boxXHalf = baitLenX / 2 + mc.wallMarginY;
  if (sc.position === 'tail') return [{ x: cx + boxXHalf, y: cy, z: 0 }];
  if (sc.position === 'head') return [{ x: cx - boxXHalf, y: cy, z: 0 }];
  const boxYHalf = (bb.max.y - bb.min.y) / 2 + mc.wallMarginX + mc.clampFlange;
  return [{ x: cx, y: cy - boxYHalf, z: 0 }];
}

export class VentCutter {
  generateManifold(
    halfA: ManifoldSolid,
    halfB: ManifoldSolid | null,
    config: VentConfig,
    _baitMesh: THREE.BufferGeometry,
    baitBounds: THREE.Box3,
    moldConfig: MoldConfig,
    sprueConfig: SprueConfig,
    _dims: MoldDimensions,
  ): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
    const autoVents = config.autoVent ? autoPlaceVents(baitBounds, moldConfig, sprueConfig) : [];
    const manualVents = config.vents.map(v => v.position);
    const allVents = [...autoVents, ...manualVents];
    if (allVents.length === 0) return { halfA, halfB };

    const cx = (baitBounds.max.x + baitBounds.min.x) / 2;
    const cy = (baitBounds.max.y + baitBounds.min.y) / 2;
    const baitLenX = baitBounds.max.x - baitBounds.min.x;
    const baitHtY = baitBounds.max.y - baitBounds.min.y;
    const boxXHalf = baitLenX / 2 + moldConfig.wallMarginY;
    const boxYHalf = baitHtY / 2 + moldConfig.wallMarginX + moldConfig.clampFlange;

    const cutters: ManifoldSolid[] = [];

    for (const pos of allVents) {
      const distToXEdge = boxXHalf - Math.abs(pos.x - cx);
      const distToYEdge = boxYHalf - Math.abs(pos.y - cy);

      // Vent channel: shallow groove on the parting face (Z=0) of halfA,
      // running from the bait cavity to the nearest mold edge.
      // Z positioned so top face is at Z=0, channel cuts downward into halfA.
      const ventZ = -config.ventDepth / 2;

      if (distToXEdge <= distToYEdge || Math.abs(pos.x - cx) >= boxXHalf - 1) {
        // Run toward nearest X edge
        const dir = (pos.x - cx) >= 0 ? 1 : -1;
        const runLen = distToXEdge + OS;
        cutters.push(mTranslate(mBox(runLen, config.ventWidth, config.ventDepth),
          pos.x + dir * (runLen / 2), pos.y, ventZ));
      } else {
        // Run toward nearest Y edge
        const dir = (pos.y - cy) >= 0 ? 1 : -1;
        const runLen = distToYEdge + OS;
        cutters.push(mTranslate(mBox(config.ventWidth, runLen, config.ventDepth),
          pos.x, pos.y + dir * (runLen / 2), ventZ));
      }
    }

    if (cutters.length > 0) halfA = mSubtract(halfA, mBatchUnion(cutters));

    console.log(`[VentCutter] ${allVents.length} vents`);
    return { halfA, halfB };
  }
}
