/**
 * @file mesh-deform.js
 * Spline-driven mesh deformation for imported STLs.
 * Vertices scale proportionally at each station based on the ratio
 * of current spline values to the original reference measurements.
 * Surface detail (fins, textures, gill shapes) is preserved.
 */

import { sampleProfile } from './splines.js';

/**
 * Analyze an imported mesh to extract the reference profile at each station.
 * @param {THREE.BufferGeometry} geometry - centered, oriented geometry
 * @param {number} stationCount - how many stations to slice at
 * @returns {object} analysis with referenceProfile, stationCount, length, etc.
 */
export function analyzeMesh(geometry, stationCount = 40) {
  const pos = geometry.attributes.position;
  const vertCount = pos.count;

  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const x = pos.getX(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  const length = maxX - minX;
  if (length < 0.001) return null;

  const referenceProfile = [];

  for (let s = 0; s <= stationCount; s++) {
    const t = s / stationCount;
    const sliceX = minX + t * length;
    const tol = length / stationCount * 0.5;

    let maxY = -Infinity, minY = Infinity;
    let maxZ = -Infinity, minZ = Infinity;
    const indices = [];

    for (let i = 0; i < vertCount; i++) {
      if (Math.abs(pos.getX(i) - sliceX) < tol) {
        indices.push(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y > maxY) maxY = y;
        if (y < minY) minY = y;
        if (z > maxZ) maxZ = z;
        if (z < minZ) minZ = z;
      }
    }

    if (indices.length < 3) {
      referenceProfile.push({ t, dorsalH: 0, ventralD: 0, halfW: 0, centerY: 0, count: 0 });
      continue;
    }

    const centerY = (maxY + minY) / 2;
    referenceProfile.push({
      t,
      dorsalH: maxY - centerY,
      ventralD: centerY - minY,
      halfW: (maxZ - minZ) / 2,
      centerY,
      count: indices.length,
    });
  }

  // Interpolate empty stations
  for (let s = 0; s <= stationCount; s++) {
    if (referenceProfile[s].count > 0) continue;
    let prev = null, next = null;
    for (let j = s - 1; j >= 0; j--) { if (referenceProfile[j].count > 0) { prev = referenceProfile[j]; break; } }
    for (let j = s + 1; j <= stationCount; j++) { if (referenceProfile[j].count > 0) { next = referenceProfile[j]; break; } }
    if (prev && next) {
      const b = (referenceProfile[s].t - prev.t) / (next.t - prev.t);
      referenceProfile[s].dorsalH = prev.dorsalH + (next.dorsalH - prev.dorsalH) * b;
      referenceProfile[s].ventralD = prev.ventralD + (next.ventralD - prev.ventralD) * b;
      referenceProfile[s].halfW = prev.halfW + (next.halfW - prev.halfW) * b;
      referenceProfile[s].centerY = prev.centerY + (next.centerY - prev.centerY) * b;
    } else if (prev) { referenceProfile[s].dorsalH = prev.dorsalH; referenceProfile[s].ventralD = prev.ventralD; referenceProfile[s].halfW = prev.halfW; referenceProfile[s].centerY = prev.centerY; }
    else if (next) { referenceProfile[s].dorsalH = next.dorsalH; referenceProfile[s].ventralD = next.ventralD; referenceProfile[s].halfW = next.halfW; referenceProfile[s].centerY = next.centerY; }
  }

  return { referenceProfile, stationCount, length, minX, maxX };
}

/**
 * Deform mesh vertices based on ratio of current spline values to reference profile.
 * @param {THREE.BufferGeometry} geometry - the geometry to deform (modified in place)
 * @param {Float32Array} originalPositions - original undeformed positions
 * @param {object} analysis - from analyzeMesh
 * @param {object} profileState - current spline profile state
 * @param {number} OL - overall length in inches (from the OL slider)
 */
export function deformMesh(geometry, originalPositions, analysis, profileState, OL) {
  const pos = geometry.attributes.position;
  const vertCount = pos.count;
  const ref = analysis.referenceProfile;
  const sc = analysis.stationCount;
  const origLen = analysis.length;

  // Length scale (if OL changed)
  const lengthMM = OL * 25.4;
  const isMM = origLen > 30;
  const origLenNorm = isMM ? origLen : origLen * 25.4;
  const lenScale = lengthMM / origLenNorm;

  for (let i = 0; i < vertCount; i++) {
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    // Find station (interpolated)
    const t = Math.max(0, Math.min(1, (ox - analysis.minX) / analysis.length));
    const sf = t * sc;
    const sLow = Math.min(Math.floor(sf), sc - 1);
    const sHigh = Math.min(sLow + 1, sc);
    const blend = sf - sLow;

    // Interpolate reference values at this vertex's position
    const rL = ref[sLow], rH = ref[sHigh];
    const origDorsal = rL.dorsalH + (rH.dorsalH - rL.dorsalH) * blend;
    const origVentral = rL.ventralD + (rH.ventralD - rL.ventralD) * blend;
    const origHalfW = rL.halfW + (rH.halfW - rL.halfW) * blend;
    const origCenterY = rL.centerY + (rH.centerY - rL.centerY) * blend;

    // Get NEW spline values at this t
    // Spline values are normalized to OL (fraction of body length)
    // Multiply by OL to get inches, then by 25.4 if mesh is in mm
    const unitScale = isMM ? OL * 25.4 : OL;
    const newDorsal = sampleProfile(profileState.dorsal, t) * unitScale;
    const newVentral = Math.abs(sampleProfile(profileState.ventral, t)) * unitScale;
    const newHalfW = sampleProfile(profileState.width, t) * unitScale;

    // Compute scale ratios
    const MIN = 0.01;
    const scaleY_dorsal = origDorsal > MIN ? newDorsal / origDorsal : 1;
    const scaleY_ventral = origVentral > MIN ? newVentral / origVentral : 1;
    const scaleZ = origHalfW > MIN ? newHalfW / origHalfW : 1;

    // Apply
    const relY = oy - origCenterY;
    const scaleY = relY >= 0 ? scaleY_dorsal : scaleY_ventral;
    const newCenterShift = ((newDorsal - newVentral) - (origDorsal - origVentral)) / 2;

    pos.setXYZ(i,
      ox,                                        // X unchanged (length)
      origCenterY + relY * scaleY + newCenterShift,  // Y scaled from center
      oz * scaleZ                                    // Z scaled symmetrically
    );
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}
