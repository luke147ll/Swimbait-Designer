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

  const forkDepth = p.FD || 0;
  const forkAsym = p.FA || 0;
  const TAIL_ZONE = 0.85;

  const HEMI_RINGS = 6;       // latitude rings in the nose hemisphere
  const HEMI_ATTACH = 3;      // body ring index where hemisphere attaches
  const vertsPerRing = HRS + 1;

  // ═══════════════════════════════════════════════════════════
  // NOSE HEMISPHERE (right half): pill-shaped cap from pole to attach ring
  // ═══════════════════════════════════════════════════════════

  // Sample the attachment ring's cross-section
  const aDY = profiles.dorsalCache[HEMI_ATTACH] * L;
  const aVY = profiles.ventralCache[HEMI_ATTACH] * L;
  const aHW = Math.max(profiles.widthCache[HEMI_ATTACH] * L, 0.004);
  const aN = Math.max(profiles.nCache[HEMI_ATTACH] || 2, 1.8);
  const aCY = (aDY + aVY) / 2;
  const aDH = Math.max(aDY - aCY, 0.003);
  const aVH = Math.max(aCY - aVY, 0.003);
  const xAttach = -hL + (HEMI_ATTACH / NS) * L;
  const hemiDepth = (aDH + aVH) * 0.5; // how far forward the hemisphere extends

  // Pole vertex (frontmost point)
  pos.push(xAttach - hemiDepth, aCY, 0);
  // That's vertex 0 — shared by both halves

  // Hemisphere latitude rings (1 to HEMI_RINGS), shrinking from pole to equator
  for (let hr = 1; hr <= HEMI_RINGS; hr++) {
    const phi = (hr / HEMI_RINGS) * Math.PI * 0.5; // 0 at pole, PI/2 at equator
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const scale = sinPhi; // 0 at pole, 1 at equator
    const xRing = xAttach - hemiDepth * cosPhi; // sweeps from pole back to attach

    for (let j = 0; j <= HRS; j++) {
      const se = superEllipse((j / HRS) * Math.PI, aDH * scale, aVH * scale, aHW * scale, aN);
      pos.push(xRing, se.y + aCY, Math.abs(se.z));
    }
  }

  // Hemisphere faces: pole fan + latitude strips
  // Pole fan: pole vertex (0) to first latitude ring
  const firstHemiRing = 1; // vertex index start of first latitude ring
  for (let j = 0; j < HRS; j++) {
    idx.push(0, firstHemiRing + j, firstHemiRing + j + 1);
  }
  // Latitude strips between hemisphere rings
  for (let hr = 0; hr < HEMI_RINGS - 1; hr++) {
    for (let j = 0; j < HRS; j++) {
      const a = 1 + hr * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RIGHT HALF-SHELL BODY: from attach ring onward
  // The hemisphere's last ring IS the body's first real ring,
  // but they may not match exactly. We start body rings at
  // HEMI_ATTACH and connect to the hemisphere's equator ring.
  // ═══════════════════════════════════════════════════════════

  const bodyVertStart = pos.length / 3; // where body rings begin
  const hemiEquatorStart = 1 + (HEMI_RINGS - 1) * vertsPerRing; // last hemi ring

  for (let i = HEMI_ATTACH; i <= NS; i++) {
    const t = i / NS;
    let x = -hL + t * L;

    {
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

  // Right half-shell: connect hemisphere equator → first body ring
  for (let j = 0; j < HRS; j++) {
    const a = hemiEquatorStart + j; // last hemisphere ring
    const b = bodyVertStart + j;    // first body ring (i=HEMI_ATTACH)
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }

  // Right half-shell: body ring quad strips
  const bodyRingCount = NS - HEMI_ATTACH + 1;
  for (let bi = 0; bi < bodyRingCount - 1; bi++) {
    for (let j = 0; j < HRS; j++) {
      const a = bodyVertStart + bi * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEFT HALF-SHELL: mirror all right-side vertices across Z=0
  // Vertices on the midline (Z ≈ 0) are shared, others are new
  // ═══════════════════════════════════════════════════════════

  const rightVertCount = pos.length / 3;
  const leftIdx = new Int32Array(rightVertCount); // maps right vert index → left vert index

  for (let vi = 0; vi < rightVertCount; vi++) {
    const z = pos[vi * 3 + 2];
    if (Math.abs(z) < 0.0005) {
      // On the midline — share the vertex
      leftIdx[vi] = vi;
    } else {
      // Mirror: new vertex with negated Z
      pos.push(pos[vi * 3], pos[vi * 3 + 1], -z);
      leftIdx[vi] = (pos.length / 3) - 1;
    }
  }

  // Left hemisphere pole fan (reversed winding)
  for (let j = 0; j < HRS; j++) {
    idx.push(leftIdx[0], leftIdx[firstHemiRing + j + 1], leftIdx[firstHemiRing + j]);
  }
  // Left hemisphere latitude strips
  for (let hr = 0; hr < HEMI_RINGS - 1; hr++) {
    for (let j = 0; j < HRS; j++) {
      const a = 1 + hr * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(leftIdx[b], leftIdx[a], leftIdx[a + 1], leftIdx[b + 1], leftIdx[b], leftIdx[a + 1]);
    }
  }
  // Left: hemisphere equator → first body ring
  for (let j = 0; j < HRS; j++) {
    const a = hemiEquatorStart + j;
    const b = bodyVertStart + j;
    idx.push(leftIdx[b], leftIdx[a], leftIdx[a + 1], leftIdx[b + 1], leftIdx[b], leftIdx[a + 1]);
  }
  // Left body ring strips
  for (let bi = 0; bi < bodyRingCount - 1; bi++) {
    for (let j = 0; j < HRS; j++) {
      const a = bodyVertStart + bi * vertsPerRing + j;
      const b = a + vertsPerRing;
      idx.push(leftIdx[b], leftIdx[a], leftIdx[a + 1], leftIdx[b + 1], leftIdx[b], leftIdx[a + 1]);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TRAILING EDGE CAP — only when no fork (flat tail needs cap)
  // With a fork, the space between lobes is intentionally open
  // ═══════════════════════════════════════════════════════════

  if (forkDepth < 0.01) {
    const lastBodyRing = bodyVertStart + (bodyRingCount - 1) * vertsPerRing;
    // Right cap
    for (let j = 0; j < HRS - 1; j++) {
      idx.push(lastBodyRing, lastBodyRing + j + 1, lastBodyRing + j + 2);
    }
    // Left cap
    for (let j = 0; j < HRS - 1; j++) {
      idx.push(leftIdx[lastBodyRing], leftIdx[lastBodyRing + j + 2], leftIdx[lastBodyRing + j + 1]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
