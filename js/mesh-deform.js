/**
 * @file mesh-deform.js
 * Spline-driven mesh deformation for imported STLs.
 * Vertices scale proportionally at each station based on the ratio
 * of current spline values to the original reference measurements.
 * Surface detail (fins, textures, gill shapes) is preserved.
 */

import { sampleProfile } from './splines.js';
import { getXSecAtRing, defaultXSecPoly, NS } from './engine.js';

/**
 * Analyze an imported mesh to extract the reference profile at each station.
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
    const tol = length / stationCount * 0.6;

    let maxY = -Infinity, minY = Infinity;
    let maxZ = -Infinity, minZ = Infinity;
    let count = 0;

    for (let i = 0; i < vertCount; i++) {
      if (Math.abs(pos.getX(i) - sliceX) < tol) {
        count++;
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y > maxY) maxY = y;
        if (y < minY) minY = y;
        if (z > maxZ) maxZ = z;
        if (z < minZ) minZ = z;
      }
    }

    if (count < 3) {
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
      count,
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
 * All values are in the same units (inches — the viewport display units).
 *
 * Cross-section deformation: if xsec keyframes exist, the angular position of
 * each vertex around the cross-section is also scaled by the keyframe polygon.
 */
export function deformMesh(geometry, originalPositions, analysis, profileState, OL) {
  const pos = geometry.attributes.position;
  const vertCount = pos.count;
  const ref = analysis.referenceProfile;
  const sc = analysis.stationCount;
  const len = analysis.length; // inches

  for (let i = 0; i < vertCount; i++) {
    const ox = originalPositions[i * 3];
    const oy = originalPositions[i * 3 + 1];
    const oz = originalPositions[i * 3 + 2];

    // Smooth t value (0-1 along body)
    const t = Math.max(0, Math.min(1, (ox - analysis.minX) / len));

    // Interpolate reference values using smooth t (not station-snapped)
    const sf = t * sc;
    const sLow = Math.min(Math.floor(sf), sc - 1);
    const sHigh = Math.min(sLow + 1, sc);
    const blend = sf - sLow;

    const rL = ref[sLow], rH = ref[sHigh];
    const origDorsal = rL.dorsalH + (rH.dorsalH - rL.dorsalH) * blend;
    const origVentral = rL.ventralD + (rH.ventralD - rL.ventralD) * blend;
    const origHalfW = rL.halfW + (rH.halfW - rL.halfW) * blend;
    const origCenterY = rL.centerY + (rH.centerY - rL.centerY) * blend;

    // Get NEW spline values at this t (spline values normalized to OL, multiply by OL to get inches)
    const newDorsal = sampleProfile(profileState.dorsal, t) * OL;
    const newVentral = Math.abs(sampleProfile(profileState.ventral, t)) * OL;
    const newHalfW = sampleProfile(profileState.width, t) * OL;

    // Scale ratios
    const MIN = 0.001;
    let scaleY_d = origDorsal > MIN ? newDorsal / origDorsal : 1;
    let scaleY_v = origVentral > MIN ? newVentral / origVentral : 1;
    let scaleZ = origHalfW > MIN ? newHalfW / origHalfW : 1;

    // Cross-section deformation: check for xsec keyframe influence
    const ringIdx = Math.round(t * NS);
    const xsec = getXSecAtRing(ringIdx, profileState);
    if (xsec && xsec.length > 4) {
      // Vertex's angle around the cross-section
      const relY = oy - origCenterY;
      const angle = Math.atan2(oz, relY); // angle from dorsal axis
      const normalizedAngle = ((angle / (Math.PI * 2)) + 1) % 1; // 0-1

      // Sample the xsec polygon at this angle
      const polyLen = xsec.length - 1;
      const rawIdx = normalizedAngle * polyLen;
      const idx0 = Math.floor(rawIdx) % xsec.length;
      const idx1 = (idx0 + 1) % xsec.length;
      const frac = rawIdx - Math.floor(rawIdx);
      const polyY = xsec[idx0].y + (xsec[idx1].y - xsec[idx0].y) * frac;
      const polyZ = xsec[idx0].z + (xsec[idx1].z - xsec[idx0].z) * frac;

      // Default polygon at same angle (for ratio)
      const n = profileState.nCache ? (profileState.nCache[ringIdx] || 2.2) : 2.2;
      const defPoly = defaultXSecPoly(n);
      const dIdx0 = Math.floor(rawIdx) % defPoly.length;
      const dIdx1 = (dIdx0 + 1) % defPoly.length;
      const defY = defPoly[dIdx0].y + (defPoly[dIdx1].y - defPoly[dIdx0].y) * frac;
      const defZ = defPoly[dIdx0].z + (defPoly[dIdx1].z - defPoly[dIdx0].z) * frac;

      // Apply xsec ratio on top of the profile scaling
      if (Math.abs(defY) > 0.01) scaleY_d *= polyY / defY;
      if (Math.abs(defY) > 0.01) scaleY_v *= Math.abs(polyY / defY);
      if (Math.abs(defZ) > 0.01) scaleZ *= polyZ / defZ;
    }

    // Apply deformation
    const relY = oy - origCenterY;
    const scaleY = relY >= 0 ? scaleY_d : scaleY_v;
    const newCenterShift = ((newDorsal - newVentral) - (origDorsal - origVentral)) / 2;

    pos.setXYZ(i,
      ox,
      origCenterY + relY * scaleY + newCenterShift,
      oz * scaleZ
    );
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}
