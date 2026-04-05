/**
 * BaitPrimitives — primitive-based bait design system.
 * Uses the SAME Manifold WASM instance as csg.ts (critical — can't mix instances).
 */
import { initCSG, mSphere, mCylZ, mCone, manifoldToThree, type ManifoldSolid } from './csg';
import * as THREE from 'three';

// ─── Data Model ─────────────────────────────────────────────

export type PrimitiveType = 'sphere' | 'cylinder' | 'cone';

export interface Vec3 { x: number; y: number; z: number; }

export interface BaitPrimitive {
  id: string;
  type: PrimitiveType;
  label: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  params: {
    radius?: number;
    radiusTop?: number;
    radiusBottom?: number;
    height?: number;
    segments?: number;
  };
  operation: 'union' | 'subtract';
  visible: boolean;
}

export interface BaitDesign {
  name: string;
  primitives: BaitPrimitive[];
}

// ─── Presets ─────────────────────────────────────────────────

export const PRESETS: Record<string, BaitDesign> = {
  paddletail: {
    name: 'Paddletail Shad',
    primitives: [
      { id: 'body', type: 'sphere', label: 'Body', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 9, y: 32, z: 7 }, params: { radius: 1, segments: 32 }, operation: 'union', visible: true },
      { id: 'head', type: 'sphere', label: 'Head', position: { x: 0, y: 26, z: 0.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 8, y: 6, z: 7 }, params: { radius: 1, segments: 32 }, operation: 'union', visible: true },
      { id: 'tail_taper', type: 'cone', label: 'Tail Taper', position: { x: 0, y: -30, z: -0.5 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 0.65 }, params: { radiusBottom: 7, height: 20, segments: 32 }, operation: 'union', visible: true },
      { id: 'peduncle', type: 'cylinder', label: 'Peduncle', position: { x: 0, y: -40, z: -0.5 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 0.6 }, params: { radiusTop: 2.5, radiusBottom: 2.5, height: 6, segments: 16 }, operation: 'union', visible: true },
      { id: 'paddle', type: 'sphere', label: 'Paddle Tail', position: { x: 0, y: -46, z: -1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 7, y: 3.5, z: 1.8 }, params: { radius: 1, segments: 24 }, operation: 'union', visible: true },
    ],
  },
  stick: {
    name: 'Stick Bait',
    primitives: [
      { id: 'body', type: 'cylinder', label: 'Body', position: { x: 0, y: 0, z: 0 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 0.85 }, params: { radiusTop: 6, radiusBottom: 6, height: 80, segments: 32 }, operation: 'union', visible: true },
      { id: 'nose', type: 'sphere', label: 'Nose', position: { x: 0, y: 40, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 6, y: 4, z: 5 }, params: { radius: 1, segments: 24 }, operation: 'union', visible: true },
      { id: 'tail', type: 'cone', label: 'Tail', position: { x: 0, y: -40, z: 0 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 0.85 }, params: { radiusBottom: 6, height: 15, segments: 24 }, operation: 'union', visible: true },
    ],
  },
  blank: {
    name: 'Blank',
    primitives: [
      { id: 'body', type: 'sphere', label: 'Body', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 8, y: 25, z: 6 }, params: { radius: 1, segments: 32 }, operation: 'union', visible: true },
    ],
  },
};

// ─── Build Function (uses csg.ts WASM instance) ─────────────

/**
 * Build a Manifold solid from primitives using csg.ts functions.
 * This ensures the result is compatible with BaitSubtraction.
 */
export async function buildBaitSolid(primitives: BaitPrimitive[]): Promise<ManifoldSolid> {
  await initCSG();

  let bait: ManifoldSolid | null = null;

  for (const prim of primitives) {
    if (!prim.visible) continue;

    const segs = prim.params.segments || 24;
    let solid: ManifoldSolid;

    switch (prim.type) {
      case 'sphere':
        solid = mSphere(prim.params.radius || 1, segs);
        solid = solid.scale([prim.scale.x, prim.scale.y, prim.scale.z]);
        break;

      case 'cylinder':
        solid = mCylZ(
          prim.params.radiusBottom || 5,
          prim.params.height || 10,
          segs
        );
        // mCylZ creates with the given radius — scale to match radiusTop if different
        solid = solid.scale([prim.scale.x, prim.scale.y, prim.scale.z]);
        break;

      case 'cone':
        solid = mCone(
          prim.params.radiusBottom || 5,
          0,
          prim.params.height || 10,
          segs
        );
        solid = solid.scale([prim.scale.x, prim.scale.y, prim.scale.z]);
        break;

      default:
        continue;
    }

    if (prim.rotation.x || prim.rotation.y || prim.rotation.z) {
      solid = solid.rotate([prim.rotation.x, prim.rotation.y, prim.rotation.z]);
    }

    solid = solid.translate([prim.position.x, prim.position.y, prim.position.z]);

    if (bait === null) {
      bait = solid;
    } else if (prim.operation === 'union') {
      bait = bait.add(solid);
    } else {
      bait = bait.subtract(solid);
    }
  }

  if (!bait) throw new Error('No visible primitives');

  // Rotate 90° CCW around Z so the length axis (Y in primitives) aligns with X (mold convention)
  bait = bait.rotate([0, 0, 90]);

  return bait;
}

/**
 * Build and return both Manifold solid and Three.js display geometry.
 */
export async function buildBait(primitives: BaitPrimitive[]): Promise<{
  manifold: ManifoldSolid;
  geometry: THREE.BufferGeometry;
}> {
  const manifold = await buildBaitSolid(primitives);
  const geometry = manifoldToThree(manifold);
  return { manifold, geometry };
}
