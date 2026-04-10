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
 * Sample a closed loop of points at parametric t (0-1 wraps around).
 * Works with any point format - interpolates all numeric properties.
 */
export function sampleClosedLoop(pts, t) {
  const N = pts.length;
  if (N < 3) return pts[0] ? { ...pts[0] } : {};
  t = ((t % 1) + 1) % 1;
  const raw = t * N;
  const seg = Math.floor(raw) % N;
  const lt = raw - Math.floor(raw);
  const i0 = (seg - 1 + N) % N, i1 = seg;
  const i2 = (seg + 1) % N, i3 = (seg + 2) % N;
  const result = {};
  for (const key of Object.keys(pts[0])) {
    if (typeof pts[0][key] === 'number') {
      result[key] = catmullRom(pts[i0][key], pts[i1][key], pts[i2][key], pts[i3][key], lt);
    }
  }
  return result;
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
    xsecKeyframes: {},
    xsecBlendRadii: {}, // per-keyframe blend radius: { stationIdx: radius }
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

// -- Baseline profiles from user-approved torpedo shape --

const BASE_D = [
  { t: 0.0000, v: 0.023626 }, { t: 0.0252, v: 0.039358 },
  { t: 0.0500, v: 0.052583 }, { t: 0.0782, v: 0.064411 },
  { t: 0.1037, v: 0.071344 }, { t: 0.1623, v: 0.078206 },
  { t: 0.2364, v: 0.077094 }, { t: 0.5686, v: 0.062209 },
  { t: 0.8065, v: 0.048133 }, { t: 0.9100, v: 0.047575 },
  { t: 0.9492, v: 0.043065 }, { t: 0.9752, v: 0.039823 },
  { t: 1.0000, v: 0.035517 },
];

const BASE_V = [
  { t: 0.0000, v: -0.015515 }, { t: 0.0190, v: -0.027178 },
  { t: 0.0358, v: -0.033228 }, { t: 0.0707, v: -0.038708 },
  { t: 0.1041, v: -0.040008 }, { t: 0.1612, v: -0.040198 },
  { t: 0.2388, v: -0.040297 }, { t: 0.6100, v: -0.041419 },
  { t: 0.8200, v: -0.032536 }, { t: 0.8739, v: -0.030417 },
  { t: 0.9258, v: -0.029326 }, { t: 0.9616, v: -0.027181 },
  { t: 1.0000, v: -0.010664 },
];

const BASE_W = [
  { t: 0.0000, v: 0.015171 }, { t: 0.0181, v: 0.044894 },
  { t: 0.0500, v: 0.059010 }, { t: 0.0764, v: 0.066018 },
  { t: 0.1116, v: 0.067920 }, { t: 0.1767, v: 0.065820 },
  { t: 0.2983, v: 0.061608 }, { t: 0.5933, v: 0.043687 },
  { t: 0.7856, v: 0.037258 }, { t: 0.8638, v: 0.030350 },
  { t: 0.9141, v: 0.025360 }, { t: 0.9584, v: 0.022438 },
  { t: 1.0000, v: 0.017616 },
];

const DEF = { BD: 0.28, WR: 1.0, DA: 0.15, BF: 0.24, SB: 0.80, BT: 0.65,
              SL: 0.06, SD: 0.28, SC: 0.70, HL: 0.14, GP: 0.22 };

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
    [pedDR,            pedDR,                     pedWR,            null],
    [pedDR,            pedDR,                     pedWR,            null],
    [pedDR,            pedDR,                     pedWR,            null],
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
  'Mouth', 'Lip', 'Snout', 'Bridge', 'Eye',
  'Cheek', 'Max girth', 'Mid-body', 'Pre-ped',
  'Peduncle', 'Tail base', 'Tail mid', 'Tail tip'
];
