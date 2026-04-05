/**
 * BaitPrimitives — primitive-based bait design system.
 * The bait is a tree of Manifold boolean operations on native primitives.
 * This is the single source of truth for both rendering and mold CSG.
 */
import { initCSG, manifoldToThree, type ManifoldSolid } from './csg';
import * as THREE from 'three';

// ─── Data Model ─────────────────────────────────────────────

export type PrimitiveType = 'sphere' | 'cylinder' | 'cone';

export interface Vec3 { x: number; y: number; z: number; }

export interface BaitPrimitive {
  id: string;
  type: PrimitiveType;
  label: string;
  position: Vec3;
  rotation: Vec3;  // degrees
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
      {
        id: 'body', type: 'sphere', label: 'Body',
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 9, y: 32, z: 7 },
        params: { radius: 1, segments: 32 },
        operation: 'union', visible: true,
      },
      {
        id: 'head', type: 'sphere', label: 'Head',
        position: { x: 0, y: 26, z: 0.5 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 8, y: 6, z: 7 },
        params: { radius: 1, segments: 32 },
        operation: 'union', visible: true,
      },
      {
        id: 'tail_taper', type: 'cone', label: 'Tail Taper',
        position: { x: 0, y: -30, z: -0.5 }, rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 0.65 },
        params: { radiusBottom: 7, height: 20, segments: 32 },
        operation: 'union', visible: true,
      },
      {
        id: 'peduncle', type: 'cylinder', label: 'Peduncle',
        position: { x: 0, y: -40, z: -0.5 }, rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 0.6 },
        params: { radiusTop: 2.5, radiusBottom: 2.5, height: 6, segments: 16 },
        operation: 'union', visible: true,
      },
      {
        id: 'paddle', type: 'sphere', label: 'Paddle Tail',
        position: { x: 0, y: -46, z: -1 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 7, y: 3.5, z: 1.8 },
        params: { radius: 1, segments: 24 },
        operation: 'union', visible: true,
      },
    ],
  },

  stick: {
    name: 'Stick Bait',
    primitives: [
      {
        id: 'body', type: 'cylinder', label: 'Body',
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 0.85 },
        params: { radiusTop: 6, radiusBottom: 6, height: 80, segments: 32 },
        operation: 'union', visible: true,
      },
      {
        id: 'nose', type: 'sphere', label: 'Nose',
        position: { x: 0, y: 40, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 6, y: 4, z: 5 },
        params: { radius: 1, segments: 24 },
        operation: 'union', visible: true,
      },
      {
        id: 'tail', type: 'cone', label: 'Tail',
        position: { x: 0, y: -40, z: 0 }, rotation: { x: 90, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 0.85 },
        params: { radiusBottom: 6, height: 15, segments: 24 },
        operation: 'union', visible: true,
      },
    ],
  },

  blank: {
    name: 'Blank',
    primitives: [
      {
        id: 'body', type: 'sphere', label: 'Body',
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 8, y: 25, z: 6 },
        params: { radius: 1, segments: 32 },
        operation: 'union', visible: true,
      },
    ],
  },
};

// ─── Build Function ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: any = null;

async function getWasm() {
  if (!wasm) {
    await initCSG();
    const Module = (await import('manifold-3d/manifold')).default;
    wasm = await Module({
      locateFile: ((path: string) => {
        if (path.endsWith('.wasm')) return '/manifold.wasm';
        return path;
      }) as () => string,
    });
    wasm.setup();
  }
  return wasm;
}

/**
 * Build a Manifold solid from a list of primitives.
 * Guaranteed manifold output — all primitives are native Manifold.
 */
export async function buildBaitSolid(primitives: BaitPrimitive[]): Promise<ManifoldSolid> {
  const w = await getWasm();
  const M = w.Manifold;

  let bait: ManifoldSolid | null = null;

  for (const prim of primitives) {
    if (!prim.visible) continue;

    let solid: ManifoldSolid;
    const segs = prim.params.segments || 24;

    switch (prim.type) {
      case 'sphere':
        solid = M.sphere(prim.params.radius || 1, segs);
        solid = solid.scale([prim.scale.x, prim.scale.y, prim.scale.z]);
        break;

      case 'cylinder':
        solid = M.cylinder(
          prim.params.height || 10,
          prim.params.radiusBottom || 5,
          prim.params.radiusTop ?? prim.params.radiusBottom ?? 5,
          segs, true
        );
        solid = solid.scale([prim.scale.x, prim.scale.y, prim.scale.z]);
        break;

      case 'cone':
        solid = M.cylinder(
          prim.params.height || 10,
          prim.params.radiusBottom || 5,
          0, segs, true
        );
        solid = solid.scale([prim.scale.x, prim.scale.y, prim.scale.z]);
        break;

      default:
        continue;
    }

    // Rotation (degrees)
    if (prim.rotation.x || prim.rotation.y || prim.rotation.z) {
      solid = solid.rotate([prim.rotation.x, prim.rotation.y, prim.rotation.z]);
    }

    // Position
    solid = solid.translate([prim.position.x, prim.position.y, prim.position.z]);

    // Boolean
    if (bait === null) {
      bait = solid;
    } else if (prim.operation === 'union') {
      bait = bait.add(solid);
    } else {
      bait = bait.subtract(solid);
    }
  }

  if (!bait) throw new Error('No visible primitives');
  return bait;
}

/**
 * Build and return both the Manifold solid and the Three.js display geometry.
 */
export async function buildBait(primitives: BaitPrimitive[]): Promise<{
  manifold: ManifoldSolid;
  geometry: THREE.BufferGeometry;
}> {
  const manifold = await buildBaitSolid(primitives);
  const geometry = manifoldToThree(manifold);
  return { manifold, geometry };
}
