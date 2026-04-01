/**
 * @file splines.js
 * Spline data model, Catmull-Rom profile sampling, closed-loop sampling,
 * profile cache, and slider-driven profile generation.
 */

const NS = 96;

/** Catmull-Rom interpolation between four values at local t. */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Sample an open profile at parametric position t using Catmull-Rom.
 */
export function sampleProfile(pts, t) {
  if (pts.length < 2) return pts.length ? pts[0].v : 0;
  t = Math.max(pts[0].t, Math.min(pts[pts.length - 1].t, t));
  let i = 0;
  for (let k = 0; k < pts.length - 1; k++) { if (t >= pts[k].t) i = k; }
  const i0 = Math.max(0, i - 1), i1 = i;
  const i2 = Math.min(pts.length - 1, i + 1);
  const i3 = Math.min(pts.length - 1, i + 2);
  const range = pts[i2].t - pts[i1].t;
  const lt = range > 0.0001 ? (t - pts[i1].t) / range : 0;
  return catmullRom(pts[i0].v, pts[i1].v, pts[i2].v, pts[i3].v, lt);
}

/**
 * Sample a closed loop of {y, z} points at parametric t (0-1 wraps around).
 */
export function sampleClosedLoop(pts, t) {
  const N = pts.length;
  if (N < 3) return pts[0] || { y: 0, z: 0 };
  t = ((t % 1) + 1) % 1; // wrap to [0,1)
  const raw = t * N;
  const seg = Math.floor(raw) % N;
  const lt = raw - Math.floor(raw);
  const i0 = (seg - 1 + N) % N, i1 = seg;
  const i2 = (seg + 1) % N, i3 = (seg + 2) % N;
  return {
    y: catmullRom(pts[i0].y, pts[i1].y, pts[i2].y, pts[i3].y, lt),
    z: catmullRom(pts[i0].z, pts[i1].z, pts[i2].z, pts[i3].z, lt),
  };
}

/** Compute n-exponent profile from CS slider and head length. */
function computeNProfile(CS, headEnd) {
  return [
    { t: 0.00, v: 2.0 }, { t: 0.02, v: 2.0 }, { t: 0.06, v: 2.02 },
    { t: headEnd, v: CS * 0.97 },
    { t: Math.min(headEnd + 0.12, 0.45), v: CS },
    { t: 0.60, v: CS * 0.98 }, { t: 0.75, v: CS * 0.95 },
    { t: 0.87, v: 2.3 }, { t: 0.94, v: 2.1 }, { t: 1.0, v: 2.0 },
  ];
}

export function createProfileState() {
  return {
    dorsal: [], ventral: [], width: [],
    dDelta: [], vDelta: [], wDelta: [],
    nProfile: [],
    dorsalCache: new Float32Array(NS + 1),
    ventralCache: new Float32Array(NS + 1),
    widthCache: new Float32Array(NS + 1),
    nCache: new Float32Array(NS + 1),
    // Cross-section keyframes: sparse map of ring index → normalized polygon
    xsecKeyframes: {}, // e.g. { 24: [{y,z}, ...], 48: [{y,z}, ...] }
  };
}

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

// ── Tuned baseline profiles (13 points, t=0 to t=1.0) ──

const BASE_D = [
  { t: 0.0000, v: 0.007116 }, { t: 0.0080, v: 0.033132 },
  { t: 0.0200, v: 0.049197 }, { t: 0.0450, v: 0.072001 },
  { t: 0.0800, v: 0.094287 }, { t: 0.2400, v: 0.132774 },
  { t: 0.3400, v: 0.129455 }, { t: 0.5600, v: 0.081319 },
  { t: 0.7400, v: 0.050822 }, { t: 0.8700, v: 0.037547 },
  { t: 0.9400, v: 0.033184 }, { t: 0.9700, v: 0.032098 },
  { t: 1.0000, v: 0.035448 },
];

const BASE_V = [
  { t: 0.0000, v: -0.010591 }, { t: 0.0080, v: -0.018551 },
  { t: 0.0200, v: -0.044066 }, { t: 0.0450, v: -0.067827 },
  { t: 0.0800, v: -0.092280 }, { t: 0.2400, v: -0.113960 },
  { t: 0.3400, v: -0.110244 }, { t: 0.5600, v: -0.079282 },
  { t: 0.7400, v: -0.062607 }, { t: 0.8700, v: -0.037547 },
  { t: 0.9400, v: -0.026919 }, { t: 0.9700, v: -0.016145 },
  { t: 1.0000, v: -0.008104 },
];

const BASE_W = [
  { t: 0.0000, v: 0.000835 }, { t: 0.0080, v: 0.022372 },
  { t: 0.0200, v: 0.030371 }, { t: 0.0450, v: 0.044534 },
  { t: 0.0800, v: 0.054201 }, { t: 0.2400, v: 0.069534 },
  { t: 0.3400, v: 0.069111 }, { t: 0.5600, v: 0.045852 },
  { t: 0.7400, v: 0.022691 }, { t: 0.8700, v: 0.019524 },
  { t: 0.9400, v: 0.010385 }, { t: 0.9700, v: 0.008928 },
  { t: 1.0000, v: 0.007203 },
];

const DEF = { BD: 0.30, WR: 0.58, DA: 0.15, BF: 0.25, SB: 0.48, BT: 0.55,
              SL: 0.14, SD: 0.22, SC: 0.55, HL: 0.24, GP: 0.34 };

export function buildProfilesFromSliders(p) {
  const depthR = p.BD / DEF.BD;
  const widthR = (p.BD * p.WR) / (DEF.BD * DEF.WR);
  const archR = 1 + (p.DA - DEF.DA) * 2.5;
  const bellyR = 1 + (p.BF - DEF.BF) * 2.0;
  const snoutR = (0.3 + p.SB * 0.7) / (0.3 + DEF.SB * 0.7);
  const pedDR = (p.BD * p.SD) / (DEF.BD * DEF.SD);
  const pedWR = (p.BD * p.SD * p.SC) / (DEF.BD * DEF.SD * DEF.SC);

  const girthPos = p.GP, headEnd = p.HL;
  const stalkStart = 1.0 - p.SL - 0.12;
  const stalkMid = 1.0 - p.SL * 0.5 - 0.06;
  const s7t = girthPos + (stalkStart - girthPos) * p.BT;
  const taperF = 0.65 + p.BT * 0.35;

  const scales = [
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [snoutR * depthR,  snoutR * depthR * bellyR,  snoutR * widthR,  null],
    [depthR * archR,   depthR * bellyR,           widthR,           headEnd],
    [depthR * archR,   depthR * bellyR,           widthR,           girthPos],
    [depthR * taperF,  depthR * taperF,           widthR * taperF,  s7t],
    [depthR * 0.85,    depthR * 0.85,             widthR * 0.75,    stalkStart],
    [pedDR,            pedDR,                     pedWR,            stalkMid],
    [pedDR,            pedDR,                     pedWR * 0.6,      1.0 - 0.06],
    [pedDR * 0.5,      pedDR * 0.5,              pedWR * 0.25,     0.97],
    [pedDR * 0.18,     pedDR * 0.18,             pedWR * 0.08,     1.0],
  ];

  const dorsal = [], ventral = [], width = [];
  for (let i = 0; i < BASE_D.length; i++) {
    const [ds, vs, ws, tOverride] = scales[i];
    const t = tOverride !== null ? tOverride : BASE_D[i].t;
    const locked = i === 0 || i === BASE_D.length - 1;
    dorsal.push({ t, v: BASE_D[i].v * ds, locked });
    ventral.push({ t, v: BASE_V[i].v * vs, locked });
    width.push({ t, v: BASE_W[i].v * ws, locked });
  }
  return { dorsal, ventral, width };
}

export function insertProfilePoint(profile, t) {
  const v = sampleProfile(profile, t);
  let idx = profile.length;
  for (let i = 0; i < profile.length; i++) { if (profile[i].t > t) { idx = i; break; } }
  profile.splice(idx, 0, { t, v, locked: false });
  return idx;
}

export function removeProfilePoint(profile, index) {
  if (profile[index].locked || profile.length <= 4) return false;
  profile.splice(index, 1);
  return true;
}

export const STATION_LABELS = [
  'Mouth slit', 'Lip edge', 'Snout', 'Nose bridge', 'Eye',
  'Cheek/operculum', 'Max girth', 'Mid-body', 'Pre-peduncle',
  'Peduncle', 'Tail base', 'Mid-stalk', 'Stalk tip'
];
