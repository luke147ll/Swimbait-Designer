/**
 * @file engine.js
 * Core geometry engine — two mirrored half-shells (right + left).
 * Each cross-section is a half-ring from dorsal (angle=0) to ventral (angle=PI).
 * The left half mirrors across Z=0 with shared midline vertices.
 * No special nose geometry — ring 0 uses profile values (small oval, not a point).
 * Fork tail via per-vertex X offset in the tail zone.
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

let BLEND_RADIUS = 4; // default, can be overridden per-call

function getXSecAtRing(i, profiles) {
  const kf = profiles.xsecKeyframes;
  const keys = Object.keys(kf).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return null;

  let lo = -1, hi = -1;
  for (const k of keys) {
    if (k <= i) lo = k;
    if (k >= i && hi < 0) hi = k;
  }
  if (lo < 0 && hi < 0) return null;

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

  if (lo >= 0 && hi >= 0 && lo !== hi && kf[lo] && kf[hi]) {
    return lerpPoly(kf[lo], kf[hi], (i - lo) / (hi - lo));
  }

  const nearest = (lo >= 0 && kf[lo]) ? lo : hi;
  if (nearest < 0 || !kf[nearest]) return null;
  const dist = Math.abs(i - nearest);
  if (dist === 0) return kf[nearest];
  if (dist > BLEND_RADIUS) return null;
  const t = dist / BLEND_RADIUS;
  return lerpPoly(kf[nearest], getDefPoly(), t * t * (3 - 2 * t));
}

function halfRingVertex(j, dorsalH, ventralH, halfW, n, xsec) {
  const angle = (j / HRS) * Math.PI;
  if (xsec && xsec.length === RS + 1) {
    const pt = xsec[j];
    const y = pt.y >= 0 ? pt.y * dorsalH : pt.y * ventralH;
    const z = Math.abs(pt.z * halfW);
    return { y, z };
  }
  const se = superEllipse(angle, dorsalH, ventralH, halfW, Math.max(n, 1.8));
  return { y: se.y, z: Math.abs(se.z) };
}

/**
 * Generate the fish body as two mirrored half-shells.
 * Ring 0 uses actual profile values (small oval) — no convergence to a point.
 */
export function genBody(p, profiles) {
  const L = p.OL;
  const hL = L / 2;
  const pos = [], idx = [];
  const vertsPerRing = HRS + 1;

  BLEND_RADIUS = p.BR || 4; // blend radius from xsec editor
  const forkDepth = p.FD || 0;
  const forkAsym = p.FA || 0;
  const TAIL_ZONE = 0.85;

  // ═══════════════════════════════════════════════════════════
  // RIGHT HALF-SHELL: all rings from i=0 to NS
  // Ring 0 is NOT a point — it's a small oval from the profiles
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

    for (let j = 0; j <= HRS; j++) {
      const v = halfRingVertex(j, dorsalH, ventralH, halfW, n, xsec);

      // Fork X-offset in tail zone
      let vx = x;
      if (t > TAIL_ZONE && forkDepth > 0) {
        const tailT = (t - TAIL_ZONE) / (1.0 - TAIL_ZONE);
        const angle = (j / HRS) * Math.PI;
        const ca = Math.cos(angle);
        const lobe = ca * ca;
        const dorsalBias = ca >= 0 ? (1 + forkAsym) : (1 - forkAsym);
        vx += tailT * tailT * forkDepth * (dorsalH + ventralH) * lobe * Math.max(0, dorsalBias) * 0.5;
      }

      pos.push(vx, v.y + cy, v.z);
    }
  }

  // Right half-shell quad strips
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < HRS; j++) {
      const a = i * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEFT HALF-SHELL: mirror all right vertices across Z=0
  // Midline vertices (Z ≈ 0) are shared
  // ═══════════════════════════════════════════════════════════

  const rightVertCount = pos.length / 3;
  const leftIdx = new Int32Array(rightVertCount);

  for (let vi = 0; vi < rightVertCount; vi++) {
    const z = pos[vi * 3 + 2];
    if (Math.abs(z) < 0.0005) {
      leftIdx[vi] = vi;
    } else {
      pos.push(pos[vi * 3], pos[vi * 3 + 1], -z);
      leftIdx[vi] = (pos.length / 3) - 1;
    }
  }

  // Left half-shell quad strips (reversed winding)
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < HRS; j++) {
      const a = i * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(leftIdx[b], leftIdx[a], leftIdx[a + 1]);
      idx.push(leftIdx[b + 1], leftIdx[b], leftIdx[a + 1]);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NOSE CAP: fan from ring 0's dorsal vertex to close the front
  // ═══════════════════════════════════════════════════════════

  // Right nose cap
  for (let j = 0; j < HRS - 1; j++) {
    idx.push(0, j + 1, j + 2);
  }
  // Left nose cap
  for (let j = 0; j < HRS - 1; j++) {
    idx.push(leftIdx[0], leftIdx[j + 2], leftIdx[j + 1]);
  }

  // ═══════════════════════════════════════════════════════════
  // TAIL CAP: only when no fork
  // ═══════════════════════════════════════════════════════════

  if (forkDepth < 0.01) {
    const lastRing = NS * vertsPerRing;
    for (let j = 0; j < HRS - 1; j++) {
      idx.push(lastRing, lastRing + j + 1, lastRing + j + 2);
    }
    for (let j = 0; j < HRS - 1; j++) {
      idx.push(leftIdx[lastRing], leftIdx[lastRing + j + 2], leftIdx[lastRing + j + 1]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
