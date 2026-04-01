/**
 * @file splines.js
 * Spline data model, Catmull-Rom profile sampling, profile cache, and
 * slider-driven profile generation using tuned baseline values.
 */

const NS = 96; // must match engine.js slice count

/** Catmull-Rom interpolation between four values at local t. */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Sample a profile at parametric position t using Catmull-Rom.
 * @param {Array<{t: number, v: number}>} pts - sorted control points
 * @param {number} t - query position [0,1]
 * @returns {number} interpolated value
 */
export function sampleProfile(pts, t) {
  if (pts.length < 2) return pts.length ? pts[0].v : 0;
  t = Math.max(pts[0].t, Math.min(pts[pts.length - 1].t, t));

  let i = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    if (t >= pts[k].t) i = k;
  }
  const i0 = Math.max(0, i - 1), i1 = i;
  const i2 = Math.min(pts.length - 1, i + 1);
  const i3 = Math.min(pts.length - 1, i + 2);
  const range = pts[i2].t - pts[i1].t;
  const lt = range > 0.0001 ? (t - pts[i1].t) / range : 0;
  return catmullRom(pts[i0].v, pts[i1].v, pts[i2].v, pts[i3].v, lt);
}

/** Compute n-exponent profile from CS slider and head length. */
function computeNProfile(CS, headEnd) {
  return [
    { t: 0.00, v: 2.0 },
    { t: 0.02, v: 2.0 },
    { t: 0.06, v: 2.02 },
    { t: headEnd, v: CS * 0.97 },
    { t: Math.min(headEnd + 0.12, 0.45), v: CS },
    { t: 0.60, v: CS * 0.98 },
    { t: 0.75, v: CS * 0.95 },
    { t: 0.87, v: 2.3 },
    { t: 0.94, v: 2.0 },
  ];
}

/** Create a fresh profileState object with allocated caches. */
export function createProfileState() {
  return {
    source: 'sliders',
    dorsal: [],
    ventral: [],
    width: [],
    nProfile: [],
    dorsalCache: new Float32Array(NS + 1),
    ventralCache: new Float32Array(NS + 1),
    widthCache: new Float32Array(NS + 1),
    nCache: new Float32Array(NS + 1),
  };
}

/**
 * Pre-sample all profiles at NS+1 positions into Float32Arrays.
 * Computes the n-exponent cache from CS and HL sliders.
 */
export function rebuildProfileCache(state, CS, HL) {
  state.nProfile = computeNProfile(CS, HL);
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    state.dorsalCache[i] = sampleProfile(state.dorsal, t);
    state.ventralCache[i] = sampleProfile(state.ventral, t);
    state.widthCache[i] = sampleProfile(state.width, t);
    state.nCache[i] = sampleProfile(state.nProfile, t);
  }
}

// ── Tuned baseline profiles (8" shad at default slider values) ──
// Hand-sculpted in the 2D editor and exported via dumpProfiles().

const BASE_D = [
  { t: 0.0000, v: 0.006528 },
  { t: 0.0080, v: 0.030392 },
  { t: 0.0200, v: 0.045129 },
  { t: 0.0450, v: 0.066047 },
  { t: 0.0800, v: 0.086490 },
  { t: 0.2400, v: 0.133824 },
  { t: 0.3400, v: 0.133824 },
  { t: 0.5600, v: 0.090488 },
  { t: 0.7400, v: 0.056054 },
  { t: 0.8700, v: 0.035200 },
  { t: 0.9400, v: 0.031110 },
];

const BASE_V = [
  { t: 0.0000, v: -0.008832 },
  { t: 0.0080, v: -0.015470 },
  { t: 0.0200, v: -0.036747 },
  { t: 0.0450, v: -0.056562 },
  { t: 0.0800, v: -0.076954 },
  { t: 0.2400, v: -0.122177 },
  { t: 0.3400, v: -0.125123 },
  { t: 0.5600, v: -0.088222 },
  { t: 0.7400, v: -0.069052 },
  { t: 0.8700, v: -0.035200 },
  { t: 0.9400, v: -0.025237 },
];

const BASE_W = [
  { t: 0.0000, v: 0.000740 },
  { t: 0.0080, v: 0.019838 },
  { t: 0.0200, v: 0.026931 },
  { t: 0.0450, v: 0.039490 },
  { t: 0.0800, v: 0.048062 },
  { t: 0.2400, v: 0.063015 },
  { t: 0.3400, v: 0.062632 },
  { t: 0.5600, v: 0.049321 },
  { t: 0.7400, v: 0.027418 },
  { t: 0.8700, v: 0.018304 },
  { t: 0.9400, v: 0.008054 },
];

// Default slider values the baseline was tuned at
const DEF = { BD: 0.30, WR: 0.58, DA: 0.15, BF: 0.25, SB: 0.48, BT: 0.55,
              SL: 0.14, SD: 0.22, SC: 0.55, HL: 0.24, GP: 0.34 };

/**
 * Generate profiles by scaling the tuned baseline with current slider ratios.
 * Head points (indices 0-4) scale with SB + depth.
 * Body points scale with BD/WR/DA/BF.
 * Peduncle/tail points scale with SD/SC.
 */
export function buildProfilesFromSliders(p) {
  const depthR = p.BD / DEF.BD;
  const widthR = (p.BD * p.WR) / (DEF.BD * DEF.WR);
  const archR = 1 + (p.DA - DEF.DA) * 2.5;
  const bellyR = 1 + (p.BF - DEF.BF) * 2.0;
  const snoutR = (0.3 + p.SB * 0.7) / (0.3 + DEF.SB * 0.7);
  const pedDR = (p.BD * p.SD) / (DEF.BD * DEF.SD);
  const pedWR = (p.BD * p.SD * p.SC) / (DEF.BD * DEF.SD * DEF.SC);

  const girthPos = p.GP;
  const headEnd = p.HL;
  const stalkStart = 1.0 - p.SL - 0.12;
  const stalkMid = 1.0 - p.SL * 0.5 - 0.06;
  const tailStart = 1.0 - 0.06;
  const s7t = girthPos + (stalkStart - girthPos) * p.BT;
  const taperF = 0.65 + p.BT * 0.35;

  const dorsal = [], ventral = [], width = [];

  // Scale factors per point index: [dScale, vScale, wScale, t-override]
  const scales = [
    // 0-4: Head region -- snout + depth
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    // 5: Operculum
    [depthR * archR,   depthR * bellyR,           widthR,           headEnd],
    // 6: Max girth
    [depthR * archR,   depthR * bellyR,           widthR,           girthPos],
    // 7: Mid-body
    [depthR * taperF,  depthR * taperF,           widthR * taperF,  s7t],
    // 8: Pre-peduncle
    [depthR * 0.85,    depthR * 0.85,             widthR * 0.75,    stalkStart],
    // 9: Peduncle
    [pedDR,            pedDR,                     pedWR,            stalkMid],
    // 10: Tail base
    [pedDR,            pedDR,                     pedWR * 0.6,      tailStart],
  ];

  for (let i = 0; i < BASE_D.length; i++) {
    const [ds, vs, ws, tOverride] = scales[i];
    const t = tOverride !== null ? tOverride : BASE_D[i].t;
    const locked = i === 0 || i === BASE_D.length - 1;
    dorsal.push({  t, v: BASE_D[i].v * ds, locked });
    ventral.push({ t, v: BASE_V[i].v * vs, locked });
    width.push({   t, v: BASE_W[i].v * ws, locked });
  }

  return { dorsal, ventral, width };
}

/** Insert a new control point at t, with value interpolated from the spline. */
export function insertProfilePoint(profile, t) {
  const v = sampleProfile(profile, t);
  let idx = profile.length;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i].t > t) { idx = i; break; }
  }
  profile.splice(idx, 0, { t, v, locked: false });
  return idx;
}

/** Remove a control point by index. Cannot remove locked points or go below 4. */
export function removeProfilePoint(profile, index) {
  if (profile[index].locked || profile.length <= 4) return false;
  profile.splice(index, 1);
  return true;
}

export const STATION_LABELS = [
  'Mouth slit', 'Lip edge', 'Snout', 'Nose bridge', 'Eye',
  'Cheek/operculum', 'Max girth', 'Mid-body', 'Pre-peduncle',
  'Peduncle', 'Tail base'
];
