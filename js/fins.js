/**
 * @file fins.js
 * Fin data model, preset outlines, and 3D mesh generation.
 * Fin outlines are defined in the X-Y plane (side view):
 *   x = rearward distance from stalk tip
 *   y = vertical extent (dorsal +, ventral -)
 * The fin is extruded thin in Z (lateral), controlled by thickness.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { sampleClosedLoop } from './splines.js';

const FIN_SAMPLES = 64;

// ── Preset outlines (normalized, side view) ─────────────────────────
// x = rearward from attachment, y = vertical

export const FIN_PRESETS = {
  paddle: {
    outline: (function() {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        pts.push({ x: 0.5 + Math.cos(a) * 0.5, y: Math.sin(a) * 1.0 });
      }
      return pts;
    })(),
    thickness: 0.06,
  },
  wedge: {
    outline: [
      { x: 0.0, y: 0.3 }, { x: 0.3, y: 0.6 }, { x: 0.7, y: 0.8 },
      { x: 1.0, y: 0.4 }, { x: 1.0, y: -0.4 }, { x: 0.7, y: -0.8 },
      { x: 0.3, y: -0.6 }, { x: 0.0, y: -0.3 },
    ],
    thickness: 0.06,
  },
  boot: {
    outline: [
      { x: 0.0, y: 0.2 }, { x: 0.2, y: 0.15 }, { x: 0.4, y: 0.08 },
      { x: 0.5, y: -0.1 }, { x: 0.6, y: -0.5 }, { x: 0.8, y: -0.9 },
      { x: 1.0, y: -1.0 }, { x: 0.9, y: -1.15 }, { x: 0.5, y: -0.7 },
      { x: 0.3, y: -0.3 }, { x: 0.0, y: -0.2 },
    ],
    thickness: 0.06,
  },
  split: {
    outline: [
      { x: 0.0, y: 0.2 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.9 },
      { x: 1.0, y: 0.7 }, { x: 0.7, y: 0.3 }, { x: 0.4, y: 0.0 },
      { x: 0.7, y: -0.3 }, { x: 1.0, y: -0.7 }, { x: 0.7, y: -0.9 },
      { x: 0.3, y: -0.7 }, { x: 0.0, y: -0.2 },
    ],
    thickness: 0.05,
  },
  fork: {
    outline: [
      { x: 0.0, y: 0.15 }, { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.9 },
      { x: 0.8, y: 1.1 }, { x: 1.0, y: 1.0 }, { x: 0.7, y: 0.5 },
      { x: 0.4, y: 0.0 }, { x: 0.7, y: -0.5 }, { x: 1.0, y: -1.0 },
      { x: 0.8, y: -1.1 }, { x: 0.5, y: -0.9 }, { x: 0.2, y: -0.5 },
      { x: 0.0, y: -0.15 },
    ],
    thickness: 0.04,
  },
};

export function createFinState(type = 'paddle') {
  const preset = FIN_PRESETS[type] || FIN_PRESETS.paddle;
  return {
    type,
    outline: preset.outline.map(p => ({ ...p })),
    thickness: preset.thickness,
    scale: 1.0,
  };
}

/**
 * Generate a fin mesh from a fin state (side-view outline extruded in Z).
 */
export function genFinMesh(fin, L, profiles, ts, tt, material) {
  const hL = L / 2;

  // Body cross-section at stalk tip for vertical centering
  const tipDY = profiles.dorsalCache[profiles.dorsalCache.length - 1] * L;
  const tipVY = profiles.ventralCache[profiles.ventralCache.length - 1] * L;
  const tipCY = (tipDY + tipVY) / 2;

  // Fin scale
  const finSize = L * 0.12 * ts * fin.scale;
  const halfThick = fin.thickness * L * tt * 0.5;

  // Sample the closed outline
  const ring = [];
  for (let i = 0; i < FIN_SAMPLES; i++) {
    const pt = sampleClosedLoop(fin.outline, i / FIN_SAMPLES);
    ring.push({ x: pt.x * finSize, y: pt.y * finSize });
  }

  const pos = [], idx = [];

  // Attachment X position (body tip at t=1.0)
  const xBase = hL;

  // Two layers: +Z and -Z (the thin extrusion)
  for (let i = 0; i < FIN_SAMPLES; i++) {
    pos.push(xBase + ring[i].x, ring[i].y + tipCY, halfThick);
  }
  for (let i = 0; i < FIN_SAMPLES; i++) {
    pos.push(xBase + ring[i].x, ring[i].y + tipCY, -halfThick);
  }

  // Edge surface (quad strip between +Z and -Z layers)
  for (let i = 0; i < FIN_SAMPLES; i++) {
    const a = i, b = (i + 1) % FIN_SAMPLES;
    const c = a + FIN_SAMPLES, d = b + FIN_SAMPLES;
    idx.push(a, b, c, c, b, d);
  }

  // +Z face cap
  const capA = pos.length / 3;
  let cx = 0, cy = 0;
  for (let i = 0; i < FIN_SAMPLES; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; }
  pos.push(cx / FIN_SAMPLES, cy / FIN_SAMPLES, halfThick);
  for (let i = 0; i < FIN_SAMPLES; i++) {
    idx.push(capA, i, (i + 1) % FIN_SAMPLES);
  }

  // -Z face cap
  const capB = pos.length / 3;
  pos.push(cx / FIN_SAMPLES, cy / FIN_SAMPLES, -halfThick);
  for (let i = 0; i < FIN_SAMPLES; i++) {
    const a = i + FIN_SAMPLES, b = ((i + 1) % FIN_SAMPLES) + FIN_SAMPLES;
    idx.push(capB, b, a);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
