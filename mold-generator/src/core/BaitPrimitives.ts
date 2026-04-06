/**
 * BaitPrimitives — primitive-based bait design system.
 * Uses the SAME Manifold WASM instance as csg.ts (critical — can't mix instances).
 */
import { initCSG, mSphere, mCylZ, mCone, mBox, mFromMesh, manifoldToThree, type ManifoldSolid } from './csg';
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

// ─── Station-based Build (spline-driven ellipsoids) ────────

export interface StationData {
  t: number;
  positionY: number;      // mm, centered at origin
  dorsalHeight: number;   // mm
  ventralDepth: number;   // mm
  halfWidth: number;      // mm
}

/**
 * Build a Manifold bait solid from sampled station data.
 * Each station becomes an ellipsoid. All ellipsoids are unioned.
 * The ellipsoids overlap with neighbors for a smooth continuous shape.
 */
export async function buildBaitFromStations(stations: StationData[]): Promise<ManifoldSolid> {
  await initCSG();

  // Calculate spacing for overlap
  const totalLength = Math.abs(stations[stations.length - 1].positionY - stations[0].positionY);
  const spacing = stations.length > 1 ? totalLength / (stations.length - 1) : 1;
  const yRadius = spacing * 0.75; // 50% overlap between adjacent ellipsoids

  let bait: ManifoldSolid | null = null;

  for (const station of stations) {
    const totalHeight = station.dorsalHeight + station.ventralDepth;
    const halfHeight = totalHeight / 2;
    const halfWidth = station.halfWidth;

    // Skip degenerate stations (nose/tail tips)
    if (halfHeight < 0.3 || halfWidth < 0.3) continue;

    // Vertical center offset for dorsal/ventral asymmetry
    const zOffset = (station.dorsalHeight - station.ventralDepth) / 2;

    // Create ellipsoid: sphere scaled to station dimensions
    let section = mSphere(1, 48);
    section = section.scale([halfWidth, yRadius, halfHeight]);
    section = section.translate([0, station.positionY, zOffset]);

    if (bait === null) {
      bait = section;
    } else {
      bait = bait.add(section);
    }
  }

  if (!bait) throw new Error('No valid stations — bait has zero cross-section everywhere');

  // Rotate 90° CCW around Z so length axis (Y in stations) aligns with X (mold convention)
  bait = bait.rotate([0, 0, 90]);

  return bait;
}

/**
 * Build from stations and return both Manifold solid and Three.js geometry.
 */
export async function buildBaitFromStationData(stations: StationData[]): Promise<{
  manifold: ManifoldSolid;
  geometry: THREE.BufferGeometry;
}> {
  const manifold = await buildBaitFromStations(stations);
  const geometry = manifoldToThree(manifold);
  return { manifold, geometry };
}

// ─── Mesh Data Build (tube mesh from designer) ─────────────

/**
 * Build a Manifold solid directly from raw mesh arrays (vertProperties + triVerts).
 * This is the preferred transfer path: the designer builds a watertight tube mesh
 * and sends the raw arrays. We feed them straight to Manifold's constructor.
 * No boolean unions, no conversion — just validation.
 */
export async function buildBaitFromMeshData(
  vertProperties: number[],
  triVerts: number[],
): Promise<{ manifold: ManifoldSolid; geometry: THREE.BufferGeometry }> {
  await initCSG();

  const vp = new Float32Array(vertProperties);
  const tv = new Uint32Array(triVerts);

  console.log(`[BaitPrimitives] Mesh data: ${vp.length / 3} verts, ${tv.length / 3} tris`);

  // Create Manifold from raw arrays — the mesh was built for this
  // Tube mesh already has length along X (mold convention), no rotation needed
  const manifold = mFromMesh(vp, tv);

  const geometry = manifoldToThree(manifold);
  return { manifold, geometry };
}

// ─── Slot Subtraction and Insert Card Generation ───────────

import type { SlotConfig } from './types';

/**
 * Subtract slot boxes from a bait Manifold solid.
 * Tube mesh convention: X=length(body), Y=height, Z=width.
 * Slot convention from designer: positionY=body axis, positionZ=height, positionX=width.
 * slot.length → X, slot depth → Y, slot.width → Z.
 */
export function subtractSlots(bait: ManifoldSolid, slotsData: SlotConfig[]): ManifoldSolid {
  for (const slot of slotsData) {
    let depthMM: number;
    if (slot.depth === 'through') {
      const mesh = bait.getMesh();
      const vp = mesh.vertProperties;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 1; i < vp.length; i += 3) {
        if (vp[i] < minY) minY = vp[i];
        if (vp[i] > maxY) maxY = vp[i];
      }
      depthMM = (maxY - minY) + 4;
    } else {
      depthMM = slot.depth as number;
    }

    const slotBox = mBox(slot.length, depthMM, slot.width)
      .translate([slot.positionY, slot.positionZ, slot.positionX]);

    bait = bait.subtract(slotBox);
    console.log(`[BaitPrimitives] Subtracted slot: ${slot.width}×${slot.length}×${depthMM}mm at Y=${slot.positionY}`);
  }
  return bait;
}

/**
 * Generate a simple insert card for a slot.
 * Slightly smaller than the slot for friction fit (0.15mm clearance per side).
 */
export function generateInsertCard(
  slot: SlotConfig,
  baitHeightMM: number,
): { manifold: ManifoldSolid; geometry: THREE.BufferGeometry } {
  const clearance = 0.15;
  const cardLength = slot.length - clearance * 2;
  const cardWidth = slot.width - clearance * 2;
  const cardDepth = slot.depth === 'through'
    ? baitHeightMM - clearance
    : (slot.depth as number) - clearance;

  const card = mBox(cardLength, cardDepth, cardWidth)
    .translate([slot.positionY, slot.positionZ, slot.positionX]);

  const geometry = manifoldToThree(card);
  return { manifold: card, geometry };
}

/**
 * Subtract slot boxes from MOLD halves (not from bait).
 * The slot creates a pocket in the mold cavity that the insert card fills.
 */
export function subtractSlotsFromMold(
  halfA: ManifoldSolid,
  halfB: ManifoldSolid | null,
  slotsData: SlotConfig[],
): { halfA: ManifoldSolid; halfB: ManifoldSolid | null } {
  for (const slot of slotsData) {
    // For 'through' depth, use a large value to cut through both halves
    const depthMM = slot.depth === 'through' ? 200 : (slot.depth as number);

    const slotBox = mBox(slot.length, depthMM, slot.width)
      .translate([slot.positionY, slot.positionZ, slot.positionX]);

    halfA = halfA.subtract(slotBox);
    if (halfB) halfB = halfB.subtract(slotBox);

    console.log(`[BaitPrimitives] Slot subtracted from mold: ${slot.width}×${slot.length}×${depthMM}mm`);
  }
  return { halfA, halfB };
}
