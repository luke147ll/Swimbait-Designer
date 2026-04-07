/**
 * @file stl-import.js
 * Import STL files as spline starting points.
 * Parses mesh, auto-detects orientation, slices at stations,
 * extracts dorsal/ventral/width measurements, and produces
 * spline control points for the profile editors.
 */

// ── STL Parser ──

function parseSTLBinary(buffer) {
  const dv = new DataView(buffer);
  const numTris = dv.getUint32(80, true);
  const verts = [];
  let off = 84;
  for (let i = 0; i < numTris; i++) {
    off += 12; // skip normal
    for (let v = 0; v < 3; v++) {
      verts.push({
        x: dv.getFloat32(off, true),
        y: dv.getFloat32(off + 4, true),
        z: dv.getFloat32(off + 8, true),
      });
      off += 12;
    }
    off += 2; // skip attribute
  }
  return verts;
}

function parseSTLAscii(buffer) {
  const text = new TextDecoder().decode(buffer);
  const verts = [];
  const re = /vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    verts.push({ x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) });
  }
  return verts;
}

function parseSTL(buffer) {
  const header = new Uint8Array(buffer, 0, 5);
  const isAscii = String.fromCharCode(...header) === 'solid';
  // Some binary STLs start with "solid" — check if tri count is plausible
  if (isAscii) {
    const text = new TextDecoder().decode(buffer.slice(0, 256));
    if (text.includes('facet')) return parseSTLAscii(buffer);
  }
  return parseSTLBinary(buffer);
}

// ── Orientation detection ──

function analyzeOrientation(verts) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
  }
  const ext = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };

  let lengthAxis, heightAxis, widthAxis;
  if (ext.x >= ext.y && ext.x >= ext.z) { lengthAxis = 'x'; heightAxis = 'z'; widthAxis = 'y'; }
  else if (ext.y >= ext.x && ext.y >= ext.z) { lengthAxis = 'y'; heightAxis = 'z'; widthAxis = 'x'; }
  else { lengthAxis = 'z'; heightAxis = 'y'; widthAxis = 'x'; }

  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  return { lengthAxis, heightAxis, widthAxis, ext, center, length: ext[lengthAxis] };
}

// ── Unit detection ──

function detectScale(length) {
  if (length > 30) return { factor: 1 / 25.4, unit: 'mm' };
  if (length > 1 && length < 20) return { factor: 1, unit: 'inches' };
  if (length < 1) return { factor: 1000 / 25.4, unit: 'meters' };
  return { factor: 1 / 25.4, unit: 'mm' };
}

// ── Remap + Scale ──

function remapAndScale(verts, orient, scaleFactor) {
  const { lengthAxis, heightAxis, widthAxis, center } = orient;
  return verts.map(v => ({
    x: (v[lengthAxis] - center[lengthAxis]) * scaleFactor,
    y: (v[heightAxis] - center[heightAxis]) * scaleFactor,
    z: (v[widthAxis] - center[widthAxis]) * scaleFactor,
  }));
}

// ── Slice mesh at stations ──

function sliceMesh(verts, stationCount = 24) {
  let minX = Infinity, maxX = -Infinity;
  for (const v of verts) { if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x; }
  const length = maxX - minX;
  const tol = length / stationCount * 0.5;

  const stations = [];
  for (let i = 0; i <= stationCount; i++) {
    const t = i / stationCount;
    const sx = minX + t * length;
    const nearby = verts.filter(v => Math.abs(v.x - sx) < tol);

    if (nearby.length < 3) {
      stations.push({ t, dH: 0, vD: 0, hW: 0, n: 0 });
      continue;
    }

    let maxY = -Infinity, minY = Infinity, maxZ = -Infinity, minZ = Infinity;
    for (const v of nearby) {
      if (v.y > maxY) maxY = v.y; if (v.y < minY) minY = v.y;
      if (v.z > maxZ) maxZ = v.z; if (v.z < minZ) minZ = v.z;
    }
    const cy = (maxY + minY) / 2;
    stations.push({ t, dH: maxY - cy, vD: cy - minY, hW: (maxZ - minZ) / 2, n: nearby.length });
  }

  // Interpolate gaps
  for (let i = 0; i < stations.length; i++) {
    if (stations[i].n > 0) continue;
    let prev = null, next = null;
    for (let j = i - 1; j >= 0; j--) { if (stations[j].n > 0) { prev = stations[j]; break; } }
    for (let j = i + 1; j < stations.length; j++) { if (stations[j].n > 0) { next = stations[j]; break; } }
    if (prev && next) {
      const b = (stations[i].t - prev.t) / (next.t - prev.t);
      stations[i].dH = prev.dH + (next.dH - prev.dH) * b;
      stations[i].vD = prev.vD + (next.vD - prev.vD) * b;
      stations[i].hW = prev.hW + (next.hW - prev.hW) * b;
    } else if (prev) { stations[i].dH = prev.dH; stations[i].vD = prev.vD; stations[i].hW = prev.hW; }
    else if (next) { stations[i].dH = next.dH; stations[i].vD = next.vD; stations[i].hW = next.hW; }
  }

  return { stations, length };
}

// ── Reduce to control points ──

function reduceToControlPoints(samples, maxPts = 12) {
  if (samples.length <= maxPts) return samples;
  const result = [samples[0]];

  const curvatures = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const c = Math.abs(samples[i - 1].v - 2 * samples[i].v + samples[i + 1].v);
    curvatures.push({ i, c });
  }
  curvatures.sort((a, b) => b.c - a.c);
  const picks = curvatures.slice(0, maxPts - 2).map(c => c.i).sort((a, b) => a - b);
  for (const idx of picks) result.push(samples[idx]);
  result.push(samples[samples.length - 1]);
  return result;
}

// ── Main import function ──

/**
 * Import an STL file and populate spline control points.
 * @param {ArrayBuffer} buffer - STL file contents
 * @param {object} profileState - the app's profileState object
 * @param {Function} rebuildProfileCache - from splines.js
 * @param {Function} rebuildScene - app's rebuildScene
 * @returns {{ lengthInches: number, ghostVerts: Float32Array, stationCount: number }}
 */
export function importSTL(buffer, profileState, rebuildProfileCache, rebuildScene) {
  const rawVerts = parseSTL(buffer);
  console.log(`[STL Import] Parsed ${rawVerts.length} vertices`);

  const orient = analyzeOrientation(rawVerts);
  console.log(`[STL Import] Length axis: ${orient.lengthAxis}, size: ${orient.length.toFixed(1)}`);

  const { factor, unit } = detectScale(orient.length);
  console.log(`[STL Import] Units: ${unit}, scale factor: ${factor.toFixed(4)}`);

  const scaled = remapAndScale(rawVerts, orient, factor);
  const { stations, length: lengthInches } = sliceMesh(scaled, 24);
  console.log(`[STL Import] ${stations.length} stations, length: ${lengthInches.toFixed(2)}"`);

  // Build spline control point arrays (normalized to OL)
  const dorsalSamples = stations.map(s => ({ t: s.t, v: s.dH / lengthInches }));
  const ventralSamples = stations.map(s => ({ t: s.t, v: -s.vD / lengthInches })); // negative
  const widthSamples = stations.map(s => ({ t: s.t, v: s.hW / lengthInches }));

  const dorsalPts = reduceToControlPoints(dorsalSamples, 13);
  const ventralPts = reduceToControlPoints(ventralSamples, 13);
  const widthPts = reduceToControlPoints(widthSamples, 13);

  // Lock endpoints
  dorsalPts[0].locked = true; dorsalPts[dorsalPts.length - 1].locked = true;
  ventralPts[0].locked = true; ventralPts[ventralPts.length - 1].locked = true;
  widthPts[0].locked = true; widthPts[widthPts.length - 1].locked = true;

  // Set spline control points
  profileState.dorsal = dorsalPts;
  profileState.ventral = ventralPts;
  profileState.width = widthPts;
  profileState.dDelta = [];
  profileState.vDelta = [];
  profileState.wDelta = [];

  // Rebuild
  rebuildProfileCache(profileState, 2.2, 0.24);
  rebuildScene();

  // Build ghost overlay vertex array (in inches, matching viewport)
  const ghostVerts = new Float32Array(scaled.length * 3);
  for (let i = 0; i < scaled.length; i++) {
    ghostVerts[i * 3] = scaled[i].x;
    ghostVerts[i * 3 + 1] = scaled[i].y;
    ghostVerts[i * 3 + 2] = scaled[i].z;
  }

  return { lengthInches, ghostVerts, stationCount: stations.length };
}
