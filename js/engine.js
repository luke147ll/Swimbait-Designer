/**
 * @file engine.js
 * Core geometry engine — single continuous tube (full ring per cross-section).
 * Each ring goes 0→2π around the cross-section. No seam, no mirroring.
 * Nose and tail close by converging to single points.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

export const NS = 96;
export const RS = 36;
const HRS = RS / 2; // 18 half-ring segments

/** Asymmetric super-ellipse cross-section. */
export function superEllipse(angle, dorsalH, ventralH, w, n) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const h = ca >= 0 ? dorsalH : ventralH;
  const absCa = Math.abs(ca), absSa = Math.abs(sa);
  const seCa = Math.sign(ca) * Math.pow(absCa, 2 / n);
  const seSa = Math.sign(sa) * Math.pow(absSa, 2 / n);
  return { y: seCa * h, z: seSa * w };
}

/** Generate a default normalized cross-section polygon (full ring, RS+1 points). */
export function defaultXSecPoly(n) {
  const pts = [];
  for (let j = 0; j <= RS; j++) {
    const angle = (j / RS) * Math.PI * 2;
    const se = superEllipse(angle, 1, 1, 1, Math.max(n, 1.8));
    pts.push({ y: se.y, z: se.z });
  }
  return pts;
}

const DEFAULT_BLEND_RADIUS = 4;

export function getXSecAtRing(i, profiles) {
  const kf = profiles.xsecKeyframes;
  const keys = Object.keys(kf).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return null;

  function lerpPoly(a, b, t) {
    const len = Math.min(a.length, b.length);
    const r = [];
    for (let j = 0; j < len; j++) {
      r.push({ y: a[j].y + (b[j].y - a[j].y) * t, z: a[j].z + (b[j].z - a[j].z) * t });
    }
    return r;
  }

  function getDefPoly() {
    const n = (profiles.nCache && profiles.nCache[i]) ? profiles.nCache[i] : 2.2;
    return defaultXSecPoly(n);
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  const radii = profiles.xsecBlendRadii || {};
  const contributions = [];
  for (const k of keys) {
    if (!kf[k]) continue;
    const dist = Math.abs(i - k);
    const br = radii[k] || DEFAULT_BLEND_RADIUS;
    if (dist > br) continue;
    if (dist === 0) {
      contributions.push({ poly: kf[k], weight: 1.0 });
    } else {
      const fade = 1 - smoothstep(dist / br);
      contributions.push({ poly: kf[k], weight: fade });
    }
  }

  if (contributions.length === 0) return null;

  const def = getDefPoly();
  const result = def.map(p => ({ y: p.y, z: p.z }));

  for (const { poly, weight } of contributions) {
    const len = Math.min(result.length, poly.length);
    for (let j = 0; j < len; j++) {
      result[j].y += (poly[j].y - def[j].y) * weight;
      result[j].z += (poly[j].z - def[j].z) * weight;
    }
  }

  return result;
}

function fullRingVertex(j, dorsalH, ventralH, halfW, n, xsec) {
  const angle = (j / RS) * Math.PI * 2;
  if (xsec && xsec.length === RS + 1) {
    const pt = xsec[j];
    const y = pt.y >= 0 ? pt.y * dorsalH : pt.y * ventralH;
    const z = pt.z * halfW;
    return { y, z };
  }
  const se = superEllipse(angle, dorsalH, ventralH, halfW, Math.max(n, 1.8));
  return { y: se.y, z: se.z };
}

/**
 * Generate the fish body as a single continuous tube with full-ring cross-sections.
 * No mirroring, no seam at Z=0. Nose and tail converge to single points.
 */
export function genBody(p, profiles) {
  const L = p.OL;
  const hL = L / 2;
  const pos = [], idx = [];
  const vertsPerRing = RS; // full ring, last vertex wraps to first

  const forkDepth = p.FD || 0;
  const forkAsym = p.FA || 0;
  const TAIL_ZONE = 0.85;

  // ═══════════════════════════════════════════════════════════
  // NOSE POINT: single vertex at the front
  // ═══════════════════════════════════════════════════════════
  const noseCy = (profiles.dorsalCache[0] * L + profiles.ventralCache[0] * L) / 2;
  const noseIdx = 0;
  pos.push(-hL - 0.01, noseCy, 0);

  // ═══════════════════════════════════════════════════════════
  // BODY RINGS: full 360° cross-sections from ring 0 to NS
  // ═══════════════════════════════════════════════════════════

  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    let x = -hL + t * L;

    const dorsalY = profiles.dorsalCache[i] * L;
    const ventralY = profiles.ventralCache[i] * L;
    const halfW = Math.max(profiles.widthCache[i] * L, 0.004);
    const n = profiles.nCache[i];
    const cy = (dorsalY + ventralY) / 2;
    const dorsalH = Math.max(dorsalY - cy, 0.003);
    const ventralH = Math.max(cy - ventralY, 0.003);
    const xsec = getXSecAtRing(i, profiles);

    for (let j = 0; j < RS; j++) {
      const v = fullRingVertex(j, dorsalH, ventralH, halfW, n, xsec);

      // Fork X-offset in tail zone
      let vx = x;
      if (t > TAIL_ZONE && forkDepth > 0) {
        const tailT = (t - TAIL_ZONE) / (1.0 - TAIL_ZONE);
        const angle = (j / RS) * Math.PI * 2;
        const ca = Math.cos(angle);
        const lobe = ca * ca;
        const dorsalBias = ca >= 0 ? (1 + forkAsym) : (1 - forkAsym);
        vx += tailT * tailT * forkDepth * (dorsalH + ventralH) * lobe * Math.max(0, dorsalBias) * 0.5;
      }

      pos.push(vx, v.y + cy, v.z);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAIL POINT: single vertex at the back
  // ═══════════════════════════════════════════════════════════
  const tailCy = (profiles.dorsalCache[NS] * L + profiles.ventralCache[NS] * L) / 2;
  const tailPtIdx = pos.length / 3;
  pos.push(hL + 0.01, tailCy, 0);

  // ═══════════════════════════════════════════════════════════
  // NOSE CAP: fan from nose point to first ring
  // ═══════════════════════════════════════════════════════════
  const ring0Start = 1; // ring 0 starts at vertex index 1 (after nose point)
  for (let j = 0; j < RS; j++) {
    const j1 = ring0Start + j;
    const j2 = ring0Start + (j + 1) % RS;
    idx.push(noseIdx, j2, j1);
  }

  // ═══════════════════════════════════════════════════════════
  // BODY QUAD STRIPS: connect adjacent rings
  // ═══════════════════════════════════════════════════════════
  for (let i = 0; i < NS; i++) {
    const ringA = 1 + i * vertsPerRing;
    const ringB = 1 + (i + 1) * vertsPerRing;
    for (let j = 0; j < RS; j++) {
      const a = ringA + j;
      const b = ringB + j;
      const a1 = ringA + (j + 1) % RS;
      const b1 = ringB + (j + 1) % RS;
      idx.push(a, b, a1);
      idx.push(b, b1, a1);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAIL CAP: fan from tail point to last ring
  // ═══════════════════════════════════════════════════════════
  const lastRingStart = 1 + NS * vertsPerRing;
  for (let j = 0; j < RS; j++) {
    const j1 = lastRingStart + j;
    const j2 = lastRingStart + (j + 1) % RS;
    idx.push(tailPtIdx, j1, j2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
