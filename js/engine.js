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

const DEFAULT_BLEND_RADIUS = 4;

export function getXSecAtRing(i, profiles) {
  const kf = profiles.xsecKeyframes;
  const keys = Object.keys(kf).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return null;

  const radii = profiles.xsecBlendRadii || {};

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

  // Smoothstep fade: 0 at keyframe, 1 at edge of blend radius
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  // Collect contributions from all keyframes within their blend radius
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

  // Start from default shape, blend each keyframe's edit on top
  const def = getDefPoly();
  const result = def.map(p => ({ y: p.y, z: p.z }));

  for (const { poly, weight } of contributions) {
    const len = Math.min(result.length, poly.length);
    for (let j = 0; j < len; j++) {
      // Blend: move from current result toward this keyframe's shape
      result[j].y += (poly[j].y - def[j].y) * weight;
      result[j].z += (poly[j].z - def[j].z) * weight;
    }
  }

  return result;
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
    // ALWAYS create separate vertices for left half — no sharing.
    // Shared midline vertices create non-manifold edges (4 faces per edge)
    // which Manifold CSG rejects. Separate vertices = 2 faces per edge.
    pos.push(pos[vi * 3], pos[vi * 3 + 1], -z);
    leftIdx[vi] = (pos.length / 3) - 1;
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
  // NOSE CAP: converge to a single point ahead of ring 0
  // This closes the mesh without internal flat faces
  // ═══════════════════════════════════════════════════════════

  {
    // Create a nose point slightly ahead of ring 0
    const noseX = -hL - 0.01; // just ahead of the nose ring
    const noseCy = (profiles.dorsalCache[0] * L + profiles.ventralCache[0] * L) / 2;
    const noseIdx = pos.length / 3;
    pos.push(noseX, noseCy, 0); // right nose point (Z=0+)
    const noseIdxL = pos.length / 3;
    pos.push(noseX, noseCy, 0); // left nose point (Z=0-, but at 0 it's same pos, different idx)

    // Right nose: fan from nose point to ring 0
    for (let j = 0; j < HRS; j++) {
      idx.push(noseIdx, j, j + 1);
    }
    // Left nose: fan from left nose point to left ring 0
    for (let j = 0; j < HRS; j++) {
      idx.push(noseIdxL, leftIdx[j + 1], leftIdx[j]);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAIL CAP: converge to a single point behind last ring
  // ═══════════════════════════════════════════════════════════

  {
    const lastRing = NS * vertsPerRing;
    const tailX = hL + 0.01; // just behind the tail ring
    const tailCy = (profiles.dorsalCache[NS] * L + profiles.ventralCache[NS] * L) / 2;
    const tailIdx = pos.length / 3;
    pos.push(tailX, tailCy, 0);
    const tailIdxL = pos.length / 3;
    pos.push(tailX, tailCy, 0);

    // Right tail
    for (let j = 0; j < HRS; j++) {
      idx.push(tailIdx, lastRing + j + 1, lastRing + j);
    }
    // Left tail
    for (let j = 0; j < HRS; j++) {
      idx.push(tailIdxL, leftIdx[lastRing + j], leftIdx[lastRing + j + 1]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
