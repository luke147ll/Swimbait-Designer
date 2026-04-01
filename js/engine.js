/**
 * @file engine.js
 * Core geometry engine — profile-sampled lofting with per-station cross-section
 * keyframes. Default cross-sections use asymmetric super-ellipse. Stations with
 * keyframes use user-defined polygons. Intermediate stations interpolate.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

export const NS = 96;
export const RS = 36;

/** Asymmetric super-ellipse cross-section (default when no keyframe). */
export function superEllipse(angle, dorsalH, ventralH, w, n) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const h = ca >= 0 ? dorsalH : ventralH;
  const absCa = Math.abs(ca), absSa = Math.abs(sa);
  const seCa = Math.sign(ca) * Math.pow(absCa, 2 / n);
  const seSa = Math.sign(sa) * Math.pow(absSa, 2 / n);
  return { y: seCa * h, z: seSa * w };
}

/** Generate a default normalized cross-section polygon from super-ellipse. */
export function defaultXSecPoly(n) {
  const pts = [];
  for (let j = 0; j <= RS; j++) {
    const angle = (j / RS) * Math.PI * 2;
    const se = superEllipse(angle, 1, 1, 1, Math.max(n, 1.8));
    pts.push({ y: se.y, z: se.z });
  }
  return pts;
}

const BLEND_RADIUS = 8; // rings over which a keyframe eases in/out to default

/**
 * Get the cross-section polygon for ring i, accounting for keyframes.
 * Keyframes blend smoothly into the default super-ellipse over BLEND_RADIUS rings.
 * Returns null if ring should use default super-ellipse, or RS+1 {y,z} points.
 */
function getXSecAtRing(i, profiles) {
  const kf = profiles.xsecKeyframes;
  const keys = Object.keys(kf).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return null;

  // Find nearest keyframes on each side
  let lo = -1, hi = -1;
  for (const k of keys) {
    if (k <= i) lo = k;
    if (k >= i && hi < 0) hi = k;
  }

  // No keyframes in range — check if we're in a blend zone
  if (lo < 0 && hi < 0) return null;

  // Helper: get keyframe shape or generate default
  function getKfOrDefault(k) {
    return kf[k] || null;
  }

  // Helper: blend between two polygons
  function lerpPoly(a, b, t) {
    const len = Math.min(a.length, b.length);
    const r = [];
    for (let j = 0; j < len; j++) {
      r.push({ y: a[j].y + (b[j].y - a[j].y) * t, z: a[j].z + (b[j].z - a[j].z) * t });
    }
    return r;
  }

  // Get the default super-ellipse polygon for blending
  const n = profiles.nCache ? profiles.nCache[i] : 2.2;
  const defPoly = defaultXSecPoly(n);

  // Case: between two keyframes — interpolate directly
  if (lo >= 0 && hi >= 0 && lo !== hi && kf[lo] && kf[hi]) {
    const t = (i - lo) / (hi - lo);
    return lerpPoly(kf[lo], kf[hi], t);
  }

  // Case: at or near a single keyframe — blend into default
  const nearest = (lo >= 0 && kf[lo]) ? lo : hi;
  if (nearest < 0 || !kf[nearest]) return null;

  const dist = Math.abs(i - nearest);
  if (dist === 0) return kf[nearest]; // exact keyframe
  if (dist > BLEND_RADIUS) return null; // too far, use default

  // Smooth blend from keyframe to default using smoothstep
  const t = dist / BLEND_RADIUS;
  const ease = t * t * (3 - 2 * t); // 0 at keyframe, 1 at edge of blend zone
  return lerpPoly(kf[nearest], defPoly, ease);
}

/**
 * Generate the fish body mesh. Rings use keyframe polygons when available,
 * interpolated polygons between keyframes, or default super-ellipse.
 */
export function genBody(p, profiles) {
  const L = p.OL;
  const hL = L / 2;
  const pos = [], idx = [];

  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const x = -hL + t * L;

    if (i === 0) {
      const dY = profiles.dorsalCache[0] * L;
      const vY = profiles.ventralCache[0] * L;
      for (let j = 0; j <= RS; j++) pos.push(x, (dY + vY) / 2, 0);
    } else {
      const dorsalY = profiles.dorsalCache[i] * L;
      const ventralY = profiles.ventralCache[i] * L;
      const halfW = Math.max(profiles.widthCache[i] * L, 0.004);
      const n = profiles.nCache[i];
      const cy = (dorsalY + ventralY) / 2;
      const dorsalH = Math.max(dorsalY - cy, 0.003);
      const ventralH = Math.max(cy - ventralY, 0.003);

      // Check for cross-section keyframe
      const xsec = getXSecAtRing(i, profiles);

      if (xsec && xsec.length === RS + 1) {
        // Use keyframe polygon — scale normalized coords by actual dimensions
        for (let j = 0; j <= RS; j++) {
          const pt = xsec[j];
          const y = pt.y >= 0 ? pt.y * dorsalH : pt.y * ventralH;
          const z = pt.z * halfW;
          pos.push(x, y + cy, z);
        }
      } else {
        // Default super-ellipse
        for (let j = 0; j <= RS; j++) {
          const angle = (j / RS) * Math.PI * 2;
          const se = superEllipse(angle, dorsalH, ventralH, halfW, Math.max(n, 1.8));
          pos.push(x, se.y + cy, se.z);
        }
      }
    }
  }

  // Quad strips
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < RS; j++) {
      const a = i * (RS + 1) + j;
      const b = a + RS + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // Tail cap
  const tailCapIdx = pos.length / 3;
  const lastRingBase = NS * (RS + 1);
  let cx = 0, cy2 = 0, cz = 0;
  for (let j = 0; j < RS; j++) {
    const vi = (lastRingBase + j) * 3;
    cx += pos[vi]; cy2 += pos[vi + 1]; cz += pos[vi + 2];
  }
  cx /= RS; cy2 /= RS; cz /= RS;
  pos.push(cx, cy2, cz);
  for (let j = 0; j < RS; j++) {
    idx.push(tailCapIdx, lastRingBase + j, lastRingBase + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
