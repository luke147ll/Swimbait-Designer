/**
 * @file tube-mesh.js
 * Builds a single watertight tube mesh from spline profile sample functions.
 *
 * Vertex layout:
 *   Ring vertices:  (NS+1) rings × RS vertices each
 *   Nose cap center: 1 vertex
 *   Tail cap center: 1 vertex
 *   Total: (NS+1) * RS + 2
 *
 * Triangle layout:
 *   Body quads: NS * RS * 2 triangles
 *   Nose fan:   RS triangles
 *   Tail fan:   RS triangles
 *   Total: NS * RS * 2 + RS * 2
 *
 * No Manifold or Three.js dependency — pure typed arrays.
 * Feed vertProperties + triVerts to:
 *   - Three.js BufferGeometry (designer viewport)
 *   - new Manifold(new Mesh({...})) (mold generator)
 */

/**
 * Build a single watertight tube mesh from spline profile data.
 *
 * @param {Function} getDorsal  - getDorsal(t) → dorsal height in mm at t∈[0,1]
 * @param {Function} getVentral - getVentral(t) → ventral depth in mm (positive) at t∈[0,1]
 * @param {Function} getWidth   - getWidth(t) → half-width in mm at t∈[0,1]
 * @param {number} lengthMM     - overall length in mm
 * @param {number} NS           - stations along the body (default 40)
 * @param {number} RS           - segments per ring (default 32)
 * @returns {{ vertProperties: Float32Array, triVerts: Uint32Array, vertCount: number, triCount: number }}
 */
export function buildTubeMesh(getDorsal, getVentral, getWidth, lengthMM, NS = 40, RS = 32) {
  const vertCount = (NS + 1) * RS + 2;
  const triCount = NS * RS * 2 + RS * 2;
  const vertProperties = new Float32Array(vertCount * 3);
  const triIndices = new Uint32Array(triCount * 3);

  const MIN_R = 0.05; // mm — tiny minimum to avoid degenerate geometry
  let vi = 0;

  // ── Ring vertices ──
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const y = (-lengthMM / 2) + t * lengthMM;

    const dorsal  = Math.max(getDorsal(t),  MIN_R);
    const ventral = Math.max(getVentral(t), MIN_R);
    const halfW   = Math.max(getWidth(t),   MIN_R);

    const zCenter = (dorsal - ventral) / 2;
    const halfH   = (dorsal + ventral) / 2;

    for (let j = 0; j < RS; j++) {
      const angle = (j / RS) * Math.PI * 2;
      const idx = vi * 3;
      vertProperties[idx]     = y;                                   // X — length (body axis)
      vertProperties[idx + 1] = Math.sin(angle) * halfH + zCenter;  // Y — height + offset
      vertProperties[idx + 2] = Math.cos(angle) * halfW;            // Z — width
      vi++;
    }
  }

  // ── Nose cap center ──
  const noseCenterIdx = vi;
  const noseDorsal  = Math.max(getDorsal(0),  MIN_R);
  const noseVentral = Math.max(getVentral(0), MIN_R);
  vertProperties[vi * 3]     = -lengthMM / 2 - 0.1;             // X — length
  vertProperties[vi * 3 + 1] = (noseDorsal - noseVentral) / 2;  // Y — height offset
  vertProperties[vi * 3 + 2] = 0;                                // Z — width center
  vi++;

  // ── Tail cap center ──
  const tailCenterIdx = vi;
  const tailDorsal  = Math.max(getDorsal(1),  MIN_R);
  const tailVentral = Math.max(getVentral(1), MIN_R);
  vertProperties[vi * 3]     = lengthMM / 2 + 0.1;              // X — length
  vertProperties[vi * 3 + 1] = (tailDorsal - tailVentral) / 2;  // Y — height offset
  vertProperties[vi * 3 + 2] = 0;                                // Z — width center
  vi++;

  // ── Body quad strips ──
  let ti = 0;
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < RS; j++) {
      const nj = (j + 1) % RS; // wraps ring — no seam

      const curr     = i * RS + j;
      const currNext = i * RS + nj;
      const next     = (i + 1) * RS + j;
      const nextNext = (i + 1) * RS + nj;

      triIndices[ti++] = curr;
      triIndices[ti++] = currNext;
      triIndices[ti++] = next;

      triIndices[ti++] = currNext;
      triIndices[ti++] = nextNext;
      triIndices[ti++] = next;
    }
  }

  // ── Nose cap fan ──
  for (let j = 0; j < RS; j++) {
    const nj = (j + 1) % RS;
    triIndices[ti++] = noseCenterIdx;
    triIndices[ti++] = nj;      // CCW from -Y view
    triIndices[ti++] = j;
  }

  // ── Tail cap fan ──
  const lastRing = NS * RS;
  for (let j = 0; j < RS; j++) {
    const nj = (j + 1) % RS;
    triIndices[ti++] = tailCenterIdx;
    triIndices[ti++] = lastRing + j;   // CCW from +Y view
    triIndices[ti++] = lastRing + nj;
  }

  return { vertProperties, triVerts: triIndices, vertCount, triCount };
}

/**
 * Verify winding order — all face normals should point outward.
 * If majority are inward, flips ALL triangles.
 * Mutates triVerts in place.
 */
export function verifyWinding(vertProperties, triVerts) {
  let wrongCount = 0;
  const triCount = triVerts.length / 3;

  for (let i = 0; i < triVerts.length; i += 3) {
    const i0 = triVerts[i], i1 = triVerts[i + 1], i2 = triVerts[i + 2];

    const ax = vertProperties[i0 * 3], ay = vertProperties[i0 * 3 + 1], az = vertProperties[i0 * 3 + 2];
    const bx = vertProperties[i1 * 3], by = vertProperties[i1 * 3 + 1], bz = vertProperties[i1 * 3 + 2];
    const cx = vertProperties[i2 * 3], cy = vertProperties[i2 * 3 + 1], cz = vertProperties[i2 * 3 + 2];

    // face center
    const fcx = (ax + bx + cx) / 3, fcy = (ay + by + cy) / 3, fcz = (az + bz + cz) / 3;

    // face normal (cross product of edges)
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // dot with direction from origin to face center
    if (nx * fcx + ny * fcy + nz * fcz < 0) wrongCount++;
  }

  if (wrongCount > triCount / 2) {
    console.warn(`[TubeMesh] Flipping winding: ${wrongCount}/${triCount} faces had inward normals`);
    for (let i = 0; i < triVerts.length; i += 3) {
      const tmp = triVerts[i + 1];
      triVerts[i + 1] = triVerts[i + 2];
      triVerts[i + 2] = tmp;
    }
  }

  return triVerts;
}
