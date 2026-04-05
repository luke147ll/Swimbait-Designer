import type { MoldState, ValidationResult, BillOfMaterials, ClampConfig, MoldConfig, Vec3 } from './types';
import * as THREE from 'three';
import { initCSG, manifoldToThree, mDispose } from './csg';
import { BaitSubtraction } from './geometry/BaitSubtraction';
import { AlignmentFeatures } from './geometry/AlignmentFeatures';
import { ClampFeatures } from './geometry/ClampFeatures';
import { SprueCutter } from './geometry/SprueCutter';
import { VentCutter } from './geometry/VentCutter';
import { BedValidator } from './validation/BedValidator';
import { MeshValidator } from './validation/MeshValidator';
import { BOMGenerator } from './export/BOMGenerator';

/** Remove triangles with near-zero area (degenerate co-planar artifacts from CSG) */
function stripDegenerates(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position;
  const triCount = pos.count / 3;
  const keep: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i = t * 3;
    a.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    b.set(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));
    c.set(pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2));
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    const area = e1.cross(e2).length() * 0.5;
    if (area > 0.001) { // keep triangles larger than 0.001 mm²
      keep.push(
        a.x, a.y, a.z,
        b.x, b.y, b.z,
        c.x, c.y, c.z
      );
    }
  }

  const stripped = new THREE.BufferGeometry();
  stripped.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  stripped.computeVertexNormals();
  stripped.computeBoundingBox();
  return stripped;
}

export interface MoldResult {
  halfA: THREE.BufferGeometry;
  halfB: THREE.BufferGeometry | null;
  validation: ValidationResult;
  bom: BillOfMaterials | null;
  generationTimeMs: number;
}

export class MoldEngine {
  private baitSubtractor = new BaitSubtraction();
  private alignmentGen = new AlignmentFeatures();
  private clampGen = new ClampFeatures();
  private sprueGen = new SprueCutter();
  private ventGen = new VentCutter();
  private meshValidator = new MeshValidator();
  private initialized = false;

  async generate(state: MoldState): Promise<MoldResult> {
    const startTime = performance.now();

    if (!this.initialized) {
      console.log('[MoldEngine] Initializing Manifold WASM...');
      await initCSG();
      this.initialized = true;
    }

    if (!state.baitMesh) throw new Error('No bait mesh loaded');
    console.log('[MoldEngine] Step 1: Validate');
    const meshVal = this.meshValidator.validateBaitMesh(state.baitMesh);
    if (!meshVal.valid) throw new Error(`Invalid mesh: ${meshVal.issues.map(i => i.message).join(', ')}`);

    const effectiveMoldConfig = { ...state.moldConfig };
    if (state.clampConfig.mode === 'external_clamp') effectiveMoldConfig.clampFlange = 0;

    // Steps 3-4: Box + subtract — returns MANIFOLD objects
    console.log('[MoldEngine] Steps 3-4: Box + subtract (Manifold-native)');
    let { halfA, halfB, dims } = this.baitSubtractor.subtractManifold(
      state.baitMesh, effectiveMoldConfig, state.texturedBaitMesh, state.baitManifold
    );

    state.baitMesh.computeBoundingBox();
    const baitBounds = state.baitMesh.boundingBox!;

    // Pre-compute clamp bolt positions so alignment can add key clearance around them
    const clampPositions = this.computeClampPositions(state.clampConfig, baitBounds, effectiveMoldConfig, dims);

    // Step 5: Alignment — operates on Manifold objects directly
    console.log('[MoldEngine] Step 5: Alignment (Manifold-native)');
    ({ halfA, halfB } = this.alignmentGen.generateManifold(
      halfA, halfB, state.alignmentConfig, baitBounds, effectiveMoldConfig, dims, clampPositions
    ));

    // Step 6: Clamps — Manifold-native
    console.log('[MoldEngine] Step 6: Clamps (Manifold-native)');
    ({ halfA, halfB } = this.clampGen.generateManifold(
      halfA, halfB, state.clampConfig, baitBounds, effectiveMoldConfig, dims
    ));

    // Step 7: Sprue — Manifold-native
    console.log('[MoldEngine] Step 7: Sprue (Manifold-native)');
    ({ halfA, halfB } = this.sprueGen.generateManifold(
      halfA, halfB, state.sprueConfig, baitBounds, effectiveMoldConfig, dims
    ));

    // Step 8: Vents — Manifold-native
    console.log('[MoldEngine] Step 8: Vents (Manifold-native)');
    ({ halfA, halfB } = this.ventGen.generateManifold(
      halfA, halfB, state.ventConfig, state.baitMesh, baitBounds, effectiveMoldConfig, state.sprueConfig, dims
    ));

    // Step 9: FINAL CONVERSION — Manifold → Three.js (only conversion in entire pipeline)
    console.log('[MoldEngine] Step 9: Convert to Three.js');
    let halfAGeo = manifoldToThree(halfA);
    let halfBGeo = halfB ? manifoldToThree(halfB) : null;
    mDispose(halfA);
    if (halfB) mDispose(halfB);

    // Strip degenerate triangles (near-zero area) from CSG output
    halfAGeo = stripDegenerates(halfAGeo);
    if (halfBGeo) halfBGeo = stripDegenerates(halfBGeo);

    // Step 10: Validation
    console.log('[MoldEngine] Step 10: Validate');
    const validation = new BedValidator().validate(halfAGeo, halfBGeo, state.printerProfile);

    // Step 11: BOM
    const bom = new BOMGenerator().generateBOM(state);

    const generationTimeMs = performance.now() - startTime;
    console.log(`[MoldEngine] Complete in ${generationTimeMs.toFixed(1)}ms`);

    return { halfA: halfAGeo, halfB: halfBGeo, validation, bom, generationTimeMs };
  }

  /** Compute bolt positions using the same logic as ClampFeatures auto-placement. */
  private computeClampPositions(config: ClampConfig, bb: THREE.Box3, mc: MoldConfig, dims: { boxY: number }): Vec3[] {
    if (config.mode === 'external_clamp') return [];
    if (config.positions.length > 0) return config.positions;

    const cx = (bb.max.x + bb.min.x) / 2;
    const cy = (bb.max.y + bb.min.y) / 2;
    const baitLenX = bb.max.x - bb.min.x;
    const baitHtY = bb.max.y - bb.min.y;
    const boxX = baitLenX + mc.wallMarginY * 2;
    const flangeInnerEdge = baitHtY / 2 + mc.wallMarginX;
    const flangeCenter = flangeInnerEdge + mc.clampFlange * 0.35;
    const spacing = config.boltCount >= 6 ? boxX / 4 : boxX / 3;
    const offsets = config.boltCount >= 6 ? [-spacing, 0, spacing] : [-spacing / 2, spacing / 2];
    const positions: Vec3[] = [];
    for (const side of [-1, 1])
      for (const xOff of offsets)
        positions.push({ x: cx + xOff, y: cy + side * flangeCenter, z: 0 });
    return positions;
  }
}
