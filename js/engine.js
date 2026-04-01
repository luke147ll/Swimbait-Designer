/**
 * @file engine.js
 * Core geometry engine — profile-sampled lofting with asymmetric super-ellipse.
 * All cross-sections from nose to stalk tip driven by profile splines.
 * Nose converges to a point at ring 0. Tail cap closes the last ring.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

export const NS = 96;
export const RS = 36;

/** Asymmetric super-ellipse cross-section. */
export function superEllipse(angle, dorsalH, ventralH, w, n) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const h = ca >= 0 ? dorsalH : ventralH;
  const absCa = Math.abs(ca), absSa = Math.abs(sa);
  const seCa = Math.sign(ca) * Math.pow(absCa, 2 / n);
  const seSa = Math.sign(sa) * Math.pow(absSa, 2 / n);
  return { y: seCa * h, z: seSa * w };
}

/**
 * Generate the fish body mesh. All rings from t=0 to t=1 are profile-driven.
 * Ring 0 converges to a point (closed nose). Last ring gets a tail cap.
 */
export function genBody(p, profiles) {
  const L = p.OL;
  const hL = L / 2;
  const pos = [], idx = [];

  // ── All body rings: i=0 to NS ──
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const x = -hL + t * L;

    if (i === 0) {
      // Nose: all vertices converge to one point
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

      for (let j = 0; j <= RS; j++) {
        const angle = (j / RS) * Math.PI * 2;
        const se = superEllipse(angle, dorsalH, ventralH, halfW, Math.max(n, 1.8));
        pos.push(x, se.y + cy, se.z);
      }
    }
  }

  // ── Quad strips between all rings ──
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < RS; j++) {
      const a = i * (RS + 1) + j;
      const b = a + RS + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // ── Tail cap ──
  const tailCapIdx = pos.length / 3;
  const lastRingBase = NS * (RS + 1);
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < RS; j++) {
    const vi = (lastRingBase + j) * 3;
    cx += pos[vi]; cy += pos[vi + 1]; cz += pos[vi + 2];
  }
  cx /= RS; cy /= RS; cz /= RS;
  pos.push(cx, cy, cz);
  for (let j = 0; j < RS; j++) {
    idx.push(tailCapIdx, lastRingBase + j, lastRingBase + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
