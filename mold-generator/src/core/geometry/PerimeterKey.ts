import * as THREE from 'three';
import type { AlignmentConfig } from '../types';

export class PerimeterKey {
  addKey(halfA: THREE.BufferGeometry, halfB: THREE.BufferGeometry, _config: AlignmentConfig, _moldBounds: THREE.Box3): { halfA: THREE.BufferGeometry; halfB: THREE.BufferGeometry } {
    console.log('[PerimeterKey] addKey — stub');
    return { halfA, halfB };
  }
}
