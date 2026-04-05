import type { MoldState, ValidationResult, BillOfMaterials } from './types';
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

    // Step 5: Alignment — operates on Manifold objects directly
    console.log('[MoldEngine] Step 5: Alignment (Manifold-native)');
    ({ halfA, halfB } = this.alignmentGen.generateManifold(
      halfA, halfB, state.alignmentConfig, baitBounds, effectiveMoldConfig, dims
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
    const halfAGeo = manifoldToThree(halfA);
    const halfBGeo = halfB ? manifoldToThree(halfB) : null;
    mDispose(halfA);
    if (halfB) mDispose(halfB);

    // Step 10: Validation
    console.log('[MoldEngine] Step 10: Validate');
    const validation = new BedValidator().validate(halfAGeo, halfBGeo, state.printerProfile);

    // Step 11: BOM
    const bom = new BOMGenerator().generateBOM(state);

    const generationTimeMs = performance.now() - startTime;
    console.log(`[MoldEngine] Complete in ${generationTimeMs.toFixed(1)}ms`);

    return { halfA: halfAGeo, halfB: halfBGeo, validation, bom, generationTimeMs };
  }
}
