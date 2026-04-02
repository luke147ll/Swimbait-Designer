/**
 * @file fins.js
 * Fin data model, preset outlines, and 3D mesh generation.
 * Control points define fin shape, Catmull-Rom spline smooths the outline.
 * The fin is extruded thin in Z (lateral).
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { sampleClosedLoop } from './splines.js';

const FIN_MESH_SAMPLES = 48; // vertices around the smooth fin outline

// ── Preset outlines (side view: x = rearward, y = vertical) ────────

export const FIN_PRESETS = {
  paddle: {
    outline: [
      { x: -0.1748, y: 0.2121 }, { x: 0.1500, y: 0.8000 },
      { x: 0.3842, y: 1.3904 }, { x: 1.1258, y: 1.8045 },
      { x: 0.7743, y: 0.6236 }, { x: 0.8550, y: -0.3932 },
      { x: 1.1148, y: -1.6421 }, { x: 0.5051, y: -0.8726 },
      { x: 0.2478, y: -0.5824 }, { x: -0.1628, y: -0.2229 },
    ],
    thickness: 0.05,
  },
  wedge: {
    outline: [
      { x: 0.0, y: 0.2 }, { x: 0.4, y: 0.6 }, { x: 0.8, y: 0.7 },
      { x: 1.0, y: 0.3 }, { x: 1.0, y: -0.3 }, { x: 0.8, y: -0.7 },
      { x: 0.4, y: -0.6 }, { x: 0.0, y: -0.2 },
    ],
    thickness: 0.05,
  },
  boot: {
    outline: [
      { x: 0.0, y: 0.15 }, { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.05 },
      { x: 0.5, y: -0.2 }, { x: 0.7, y: -0.6 }, { x: 1.0, y: -0.9 },
      { x: 1.0, y: -1.1 }, { x: 0.7, y: -0.8 }, { x: 0.4, y: -0.4 },
      { x: 0.1, y: -0.15 }, { x: 0.0, y: -0.15 },
    ],
    thickness: 0.05,
  },
  split: {
    outline: [
      { x: 0.0, y: 0.1 }, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.8 },
      { x: 1.0, y: 0.6 }, { x: 0.6, y: 0.15 }, { x: 0.5, y: 0.0 },
      { x: 0.6, y: -0.15 }, { x: 1.0, y: -0.6 }, { x: 0.7, y: -0.8 },
      { x: 0.3, y: -0.5 }, { x: 0.0, y: -0.1 },
    ],
    thickness: 0.04,
  },
  fork: {
    outline: [
      { x: 0.0, y: 0.1 }, { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.7 },
      { x: 0.8, y: 1.0 }, { x: 1.0, y: 0.9 }, { x: 0.6, y: 0.4 },
      { x: 0.4, y: 0.0 }, { x: 0.6, y: -0.4 }, { x: 1.0, y: -0.9 },
      { x: 0.8, y: -1.0 }, { x: 0.5, y: -0.7 }, { x: 0.2, y: -0.3 },
      { x: 0.0, y: -0.1 },
    ],
    thickness: 0.03,
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
 * Generate fin mesh: closed polygon extruded thin in Z.
 * Uses the raw outline points directly — no spline interpolation.
 */
export function genFinMesh(fin, L, profiles, ts, tt, material) {
  const hL = L / 2;
  const tipDY = profiles.dorsalCache[profiles.dorsalCache.length - 1] * L;
  const tipVY = profiles.ventralCache[profiles.ventralCache.length - 1] * L;
  const tipCY = (tipDY + tipVY) / 2;

  const finSize = L * 0.12 * ts * fin.scale;
  const halfZ = fin.thickness * L * tt * 0.5;
  const xBase = hL; // body tip

  if (fin.outline.length < 3) return null;

  // Sample the outline with Catmull-Rom for smooth curves
  const N = FIN_MESH_SAMPLES;
  const ring = [];
  for (let i = 0; i < N; i++) {
    const pt = sampleClosedLoop(fin.outline, i / N);
    ring.push({ x: pt.x * finSize, y: pt.y * finSize });
  }

  const pos = [], idx = [];

  // +Z face vertices (front)
  for (let i = 0; i < N; i++) {
    pos.push(xBase + ring[i].x, ring[i].y + tipCY, halfZ);
  }
  // -Z face vertices (back)
  for (let i = 0; i < N; i++) {
    pos.push(xBase + ring[i].x, ring[i].y + tipCY, -halfZ);
  }

  // Edge surface: quad strip
  for (let i = 0; i < N; i++) {
    const a = i, b = (i + 1) % N;
    const c = a + N, d = b + N;
    idx.push(a, b, c, c, b, d);
  }

  // Flat face caps using triangle fan from vertex 0 (no centroid needed)
  // +Z face
  for (let i = 1; i < N - 1; i++) {
    idx.push(0, i, i + 1);
  }
  // -Z face (reversed winding for outward normal)
  for (let i = 1; i < N - 1; i++) {
    idx.push(N, N + i + 1, N + i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
