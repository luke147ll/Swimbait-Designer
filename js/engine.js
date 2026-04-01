/**
 * @file engine.js
 * Core geometry engine — profile-sampled lofting with asymmetric super-ellipse.
 * All cross-sections perpendicular to X axis. Nose closes by converging ring 0
 * to a single point. Shape fully controlled by profile splines + 2D editor.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { generateTailSection } from './tails.js';

export const NS = 96;
export const RS = 36;

/**
 * Asymmetric super-ellipse cross-section.
 */
export function superEllipse(angle, dorsalH, ventralH, w, n) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const h = ca >= 0 ? dorsalH : ventralH;
  const absCa = Math.abs(ca), absSa = Math.abs(sa);
  const seCa = Math.sign(ca) * Math.pow(absCa, 2 / n);
  const seSa = Math.sign(sa) * Math.pow(absSa, 2 / n);
  return { y: seCa * h, z: seSa * w };
}

/**
 * Generate the complete fish mesh. Every cross-section faces Y/Z.
 * Ring 0 converges to a point (closed nose). Tail gets a cap fan.
 * What you drag in the 2D editor is exactly what you see in 3D.
 */
export function genBody(p, profiles) {
  const L = p.OL;
  const hL = L / 2;
  const tailStart = 1.0 - 0.06;
  const tailStartIdx = Math.round(tailStart * NS);

  // Derive tail dimensions
  const pedIdx = Math.round(0.87 * NS);
  const pedD = (profiles.dorsalCache[pedIdx] - profiles.ventralCache[pedIdx]) * L;
  const pedW = profiles.widthCache[pedIdx] * L * 2;
  let maxD = 0, maxW = 0;
  for (let i = 0; i <= tailStartIdx; i++) {
    const d = (profiles.dorsalCache[i] - profiles.ventralCache[i]) * L;
    const w = profiles.widthCache[i] * L * 2;
    if (d > maxD) maxD = d;
    if (w > maxW) maxW = w;
  }

  const pos = [], idx = [];

  // ── All body rings: i=0 to NS ──
  // Ring 0 converges to a single point (nose tip).
  // Rings 1+ are normal cross-sections that grow based on profiles.
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const x = -hL + t * L;

    if (i === 0) {
      // Nose tip: all RS+1 vertices at the same position → closed mesh
      const dY = profiles.dorsalCache[0] * L;
      const vY = profiles.ventralCache[0] * L;
      const tipY = (dY + vY) / 2;
      for (let j = 0; j <= RS; j++) {
        pos.push(x, tipY, 0);
      }
    } else if (i <= tailStartIdx) {
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
    } else {
      const lt = (t - tailStart) / (1.0 - tailStart);
      const profile = generateTailSection(p.tail, lt, pedD, pedW, maxD, maxW, p.TS, p.TT);
      const th = Math.max(profile.th, 0.008);
      const tw = Math.max(profile.tw, 0.005);

      for (let j = 0; j <= RS; j++) {
        const angle = (j / RS) * Math.PI * 2;
        const se = superEllipse(angle, th, th, tw, 2.0);
        pos.push(x, se.y, se.z);
      }
    }
  }

  // ── Quad strips between all adjacent rings ──
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
  let tailCX = 0, tailCY = 0, tailCZ = 0;
  for (let j = 0; j < RS; j++) {
    const vi = (lastRingBase + j) * 3;
    tailCX += pos[vi]; tailCY += pos[vi + 1]; tailCZ += pos[vi + 2];
  }
  tailCX /= RS; tailCY /= RS; tailCZ /= RS;
  pos.push(tailCX, tailCY, tailCZ);

  for (let j = 0; j < RS; j++) {
    idx.push(tailCapIdx, lastRingBase + j, lastRingBase + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
