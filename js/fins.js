/**
 * @file fins.js
 * Fin data model, preset outlines, and 3D mesh generation.
 * Each fin is a closed 2D outline extruded to a thin flat surface.
 * Framework supports tail fins, dorsal, pectoral (future).
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { sampleClosedLoop } from './splines.js';

const FIN_SAMPLES = 64; // vertices around the fin outline

// ── Preset outlines (normalized, unit-scale) ────────────────────────
// Coordinate system: y = vertical (dorsal+, ventral-), z = lateral

function ovalPts(n, yR, zR) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ y: Math.sin(a) * yR, z: Math.cos(a) * zR });
  }
  return pts;
}

export const FIN_PRESETS = {
  paddle: {
    outline: ovalPts(8, 1.0, 0.12),
    thickness: 0.04,
  },
  wedge: {
    outline: [
      { y: 0.8, z: 0.0 }, { y: 0.5, z: 0.10 }, { y: 0.0, z: 0.12 },
      { y: -0.5, z: 0.10 }, { y: -0.8, z: 0.0 }, { y: -0.5, z: -0.10 },
      { y: 0.0, z: -0.12 }, { y: 0.5, z: -0.10 },
    ],
    thickness: 0.04,
  },
  boot: {
    outline: [
      { y: 0.3, z: 0.0 }, { y: 0.2, z: 0.08 }, { y: -0.2, z: 0.06 },
      { y: -0.6, z: 0.10 }, { y: -1.0, z: 0.30 }, { y: -1.1, z: 0.15 },
      { y: -0.7, z: -0.02 }, { y: -0.2, z: -0.06 },
      { y: 0.2, z: -0.08 },
    ],
    thickness: 0.04,
  },
  split: {
    outline: [
      { y: 0.9, z: 0.0 }, { y: 0.6, z: 0.08 }, { y: 0.2, z: 0.10 },
      { y: 0.0, z: 0.04 }, { y: -0.2, z: 0.10 }, { y: -0.6, z: 0.08 },
      { y: -0.9, z: 0.0 }, { y: -0.6, z: -0.08 }, { y: -0.2, z: -0.10 },
      { y: 0.0, z: -0.04 }, { y: 0.2, z: -0.10 }, { y: 0.6, z: -0.08 },
    ],
    thickness: 0.03,
  },
  fork: {
    outline: [
      { y: 1.0, z: 0.12 }, { y: 0.7, z: 0.06 }, { y: 0.3, z: 0.03 },
      { y: 0.0, z: 0.02 }, { y: -0.3, z: 0.03 }, { y: -0.7, z: 0.06 },
      { y: -1.0, z: 0.12 }, { y: -0.8, z: -0.0 }, { y: -0.4, z: -0.03 },
      { y: 0.0, z: -0.02 }, { y: 0.4, z: -0.03 }, { y: 0.8, z: -0.0 },
    ],
    thickness: 0.03,
  },
};

/**
 * Create a default fin state from a preset type.
 */
export function createFinState(type = 'paddle') {
  const preset = FIN_PRESETS[type] || FIN_PRESETS.paddle;
  return {
    type,
    outline: preset.outline.map(p => ({ ...p })), // deep copy
    thickness: preset.thickness,
    scale: 1.0,
  };
}

/**
 * Generate a fin mesh from a fin state.
 * @param {Object} fin - { outline, thickness, scale }
 * @param {number} L - body length
 * @param {Object} profiles - profile state with caches
 * @param {number} ts - tail size multiplier
 * @param {number} tt - tail thickness multiplier
 * @param {THREE.Material} material - shared body material
 * @returns {THREE.Mesh}
 */
export function genFinMesh(fin, L, profiles, ts, tt, material) {
  const hL = L / 2;

  // Body cross-section at the stalk tip (t=1.0) for scaling
  const tipDY = profiles.dorsalCache[profiles.dorsalCache.length - 1] * L;
  const tipVY = profiles.ventralCache[profiles.ventralCache.length - 1] * L;
  const tipHW = profiles.widthCache[profiles.widthCache.length - 1] * L;
  const tipH = (tipDY - tipVY) / 2;
  const tipCY = (tipDY + tipVY) / 2;

  // Scale the fin outline by body dimensions and TS
  const yScale = L * 0.15 * ts * fin.scale; // fin height scales with body + TS
  const zScale = yScale * 0.15 * tt;         // fin thickness scales with TT
  const thick = fin.thickness * L * tt;       // extrusion depth

  // Sample the closed outline at high resolution
  const ring = [];
  for (let i = 0; i < FIN_SAMPLES; i++) {
    const pt = sampleClosedLoop(fin.outline, i / FIN_SAMPLES);
    ring.push({ y: pt.y * yScale, z: pt.z * zScale });
  }

  const pos = [], idx = [];

  // Fin position: at the stalk tip, extending rearward
  const xFront = hL; // body tip (t=1.0)
  const xBack = xFront + thick;

  // Front face ring + back face ring
  for (let i = 0; i < FIN_SAMPLES; i++) {
    pos.push(xFront, ring[i].y + tipCY, ring[i].z);
  }
  for (let i = 0; i < FIN_SAMPLES; i++) {
    pos.push(xBack, ring[i].y + tipCY, ring[i].z);
  }

  // Quad strip connecting front and back rings (the fin edge surface)
  for (let i = 0; i < FIN_SAMPLES; i++) {
    const a = i, b = (i + 1) % FIN_SAMPLES;
    const c = a + FIN_SAMPLES, d = b + FIN_SAMPLES;
    idx.push(a, c, b, c, d, b);
  }

  // Front face cap (triangle fan)
  const frontCenter = pos.length / 3;
  let fcx = 0, fcy = 0, fcz = 0;
  for (let i = 0; i < FIN_SAMPLES; i++) {
    fcx += pos[i * 3]; fcy += pos[i * 3 + 1]; fcz += pos[i * 3 + 2];
  }
  pos.push(fcx / FIN_SAMPLES, fcy / FIN_SAMPLES, fcz / FIN_SAMPLES);
  for (let i = 0; i < FIN_SAMPLES; i++) {
    idx.push(frontCenter, (i + 1) % FIN_SAMPLES, i);
  }

  // Back face cap
  const backCenter = pos.length / 3;
  pos.push(fcx / FIN_SAMPLES + thick, fcy / FIN_SAMPLES, fcz / FIN_SAMPLES);
  for (let i = 0; i < FIN_SAMPLES; i++) {
    const a = i + FIN_SAMPLES, b = ((i + 1) % FIN_SAMPLES) + FIN_SAMPLES;
    idx.push(backCenter, a, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
