/**
 * @file engine.js
 * Core geometry engine — two mirrored half-shells (right + left).
 * Each cross-section is a half-ring from dorsal (angle=0) to ventral (angle=PI).
 * The left half mirrors across Z=0 with shared midline vertices.
 * Enables forked tails via per-vertex X offset in the tail zone.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

export const NS = 96;
export const RS = 36;
const HRS = RS / 2; // half-ring segments: 18 vertices from dorsal to ventral

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

const BLEND_RADIUS = 8;

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

/**
 * Compute the Y and Z for a half-ring vertex at index j (0..HRS).
 * angle goes from 0 (dorsal, Z=0) to PI (ventral, Z=0).
 * Z is always >= 0 (right side). Left side mirrors Z.
 */
function halfRingVertex(j, dorsalH, ventralH, halfW, n, xsec) {
  const angle = (j / HRS) * Math.PI;
  if (xsec && xsec.length === RS + 1) {
    // Map half-ring j to full-ring index: j maps to first half of the full ring
    const fullIdx = j; // 0..HRS maps to 0..HRS of the full RS+1 ring
    const pt = xsec[fullIdx];
    const y = pt.y >= 0 ? pt.y * dorsalH : pt.y * ventralH;
    const z = Math.abs(pt.z * halfW); // force right side positive
    return { y, z };
  }
  const se = superEllipse(angle, dorsalH, ventralH, halfW, Math.max(n, 1.8));
  return { y: se.y, z: Math.abs(se.z) }; // force positive Z for right half
}

/**
 * Generate the fish body as two mirrored half-shells.
 */
export function genBody(p, profiles) {
  const L = p.OL;
  const hL = L / 2;
  const pos = [], idx = [];

  const forkDepth = p.FD || 0;      // 0 to 1
  const forkAsym = p.FA || 0;       // -1 to 1
  const TAIL_ZONE = 0.85;           // where fork X-offset begins

  // ═══════════════════════════════════════════════════════════
  // RIGHT HALF-SHELL: vertices at angles 0 to PI (Z >= 0)
  // Each ring has HRS+1 vertices (19 points from dorsal to ventral)
  // ═══════════════════════════════════════════════════════════

  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    let x = -hL + t * L;

    if (i === 0) {
      // Nose: all vertices converge to a point
      const dY = profiles.dorsalCache[0] * L;
      const vY = profiles.ventralCache[0] * L;
      const tipY = (dY + vY) / 2;
      for (let j = 0; j <= HRS; j++) pos.push(x, tipY, 0);
    } else {
      const dorsalY = profiles.dorsalCache[i] * L;
      const ventralY = profiles.ventralCache[i] * L;
      let halfW = Math.max(profiles.widthCache[i] * L, 0.004);


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
          // lobeExtension: 1 at dorsal (ca=1) and ventral (ca=-1), 0 at sides (ca=0)
          const lobe = ca * ca;
          // Asymmetry: bias toward dorsal or ventral
          const dorsalBias = ca >= 0 ? (1 + forkAsym) : (1 - forkAsym);
          const xOff = tailT * tailT * forkDepth * (dorsalH + ventralH) * lobe * Math.max(0, dorsalBias) * 0.5;
          vx += xOff;
        }

        pos.push(vx, v.y + cy, v.z);
      }
    }
  }

  // Right half-shell quad strips
  const ringsR = NS + 1;
  const vertsPerRing = HRS + 1;
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < HRS; j++) {
      const a = i * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEFT HALF-SHELL: mirror of right across Z=0
  // Dorsal (j=0) and ventral (j=HRS) vertices are SHARED
  // All other vertices are new with Z negated
  // ═══════════════════════════════════════════════════════════

  const rightVertCount = pos.length / 3;
  const leftMap = new Int32Array(ringsR * vertsPerRing); // maps left (i,j) to vertex index

  for (let i = 0; i < ringsR; i++) {
    for (let j = 0; j <= HRS; j++) {
      const rightIdx = i * vertsPerRing + j;
      if (j === 0 || j === HRS) {
        // Shared midline vertex — reuse right side index
        leftMap[i * vertsPerRing + j] = rightIdx;
      } else {
        // Mirrored vertex — new vertex with negated Z
        const vi = rightIdx * 3;
        pos.push(pos[vi], pos[vi + 1], -pos[vi + 2]); // same X, same Y, negate Z
        leftMap[i * vertsPerRing + j] = (pos.length / 3) - 1;
      }
    }
  }

  // Left half-shell quad strips (reversed winding for outward normals)
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < HRS; j++) {
      const a = leftMap[i * vertsPerRing + j];
      const b = leftMap[(i + 1) * vertsPerRing + j];
      const a1 = leftMap[i * vertsPerRing + j + 1];
      const b1 = leftMap[(i + 1) * vertsPerRing + j + 1];
      idx.push(b, a, a1, b1, b, a1); // reversed winding
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TRAILING EDGE CAP — only when no fork (flat tail needs cap)
  // With a fork, the space between lobes is intentionally open
  // ═══════════════════════════════════════════════════════════

  if (forkDepth < 0.01) {
    const lastRingStart = NS * vertsPerRing;
    for (let j = 0; j < HRS - 1; j++) {
      idx.push(lastRingStart, lastRingStart + j + 1, lastRingStart + j + 2);
    }
    for (let j = 0; j < HRS - 1; j++) {
      const a = leftMap[NS * vertsPerRing];
      const b = leftMap[NS * vertsPerRing + j + 1];
      const c = leftMap[NS * vertsPerRing + j + 2];
      idx.push(a, c, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
