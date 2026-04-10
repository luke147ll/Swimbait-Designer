/**
 * Mesh decimation via progressive vertex merging.
 * Reduces triangle count while preserving overall shape.
 */
import * as THREE from 'three';

const MAX_TRIS = 50_000;

/**
 * Decimate a geometry if it exceeds the triangle budget.
 * Uses vertex quantization (mergeVertices with increasing tolerance)
 * then strips degenerate triangles.
 */
export function decimateIfNeeded(geo: THREE.BufferGeometry, budget = MAX_TRIS): THREE.BufferGeometry {
  const triCount = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  if (triCount <= budget) return geo;

  console.log(`[Decimation] Input: ${triCount} tris (budget: ${budget}), decimating...`);

  // Work on non-indexed for consistent processing
  let work = geo.index ? geo.toNonIndexed() : geo.clone();

  // Progressive merge: increase tolerance until under budget
  const tolerances = [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 2.5];
  for (const tol of tolerances) {
    const merged = mergeAndClean(work, tol);
    const mergedTris = merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
    console.log(`[Decimation] tolerance=${tol}mm → ${mergedTris} tris`);
    if (mergedTris <= budget) {
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      return merged;
    }
    work = merged;
  }

  // Still over budget — use the last result anyway
  work.computeVertexNormals();
  work.computeBoundingBox();
  const finalTris = work.index ? work.index.count / 3 : work.attributes.position.count / 3;
  console.log(`[Decimation] Final: ${finalTris} tris (target was ${budget})`);
  return work;
}

function mergeAndClean(geo: THREE.BufferGeometry, tolerance: number): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const vertCount = pos.count;

  // Quantize vertices to grid
  const invTol = 1 / tolerance;
  const vertMap = new Map<string, number>();
  const remap = new Int32Array(vertCount);
  const newPositions: number[] = [];
  let newIdx = 0;

  for (let i = 0; i < vertCount; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * invTol)},${Math.round(y * invTol)},${Math.round(z * invTol)}`;
    const existing = vertMap.get(key);
    if (existing !== undefined) {
      remap[i] = existing;
    } else {
      remap[i] = newIdx;
      vertMap.set(key, newIdx);
      newPositions.push(x, y, z);
      newIdx++;
    }
  }

  // Rebuild triangles, skip degenerate (collapsed) ones
  const srcTriCount = vertCount / 3;
  const indices: number[] = [];
  for (let t = 0; t < srcTriCount; t++) {
    const a = remap[t * 3], b = remap[t * 3 + 1], c = remap[t * 3 + 2];
    if (a === b || b === c || a === c) continue; // degenerate
    indices.push(a, b, c);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(indices);
  return result;
}
