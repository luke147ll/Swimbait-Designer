/**
 * @file anatomy.js
 * Fish anatomy features — eyes, hook slot, weight pocket.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';
import { sampleProfile } from './splines.js';
import { superEllipse } from './engine.js';

// ── Eyes ─────────────────────────────────────────────────────────────

/** Build left and right eye groups, positioned on the actual body surface. */
export function buildEyes(p, L, profiles) {
  const eyeT = p.EP || p.HL * 0.6;

  const dY = sampleProfile(profiles.dorsal, eyeT) * L;
  const vY = sampleProfile(profiles.ventral, eyeT) * L;
  const hW = Math.max(sampleProfile(profiles.width, eyeT) * L, 0.004);
  const nv = sampleProfile(profiles.nProfile, eyeT);

  const cy = (dY + vY) / 2;
  const dH = Math.max(dY - cy, 0.005);
  const vH = Math.max(cy - vY, 0.005);

  const eyeVertOffset = (p.EV || 0) * L; // vertical offset from dorsal surface
  const eyeAngle = 1.05;
  const nVal = Math.max(nv, 1.8);
  const surf = superEllipse(eyeAngle, dH, vH, hW, nVal);

  // Compute true outward surface normal numerically (finite difference)
  const da = 0.005;
  const s1 = superEllipse(eyeAngle - da, dH, vH, hW, nVal);
  const s2 = superEllipse(eyeAngle + da, dH, vH, hW, nVal);
  // Tangent along the cross-section curve
  const tY = s2.y - s1.y, tZ = s2.z - s1.z;
  // Normal is perpendicular to tangent in YZ plane (rotated 90deg)
  // and perpendicular to X axis. Cross product: tangent x X-axis = normal
  // tangent = (0, tY, tZ), X = (1, 0, 0) => cross = (0*0-tZ*0, tZ*1-0*0, 0*0-tY*1) = (0, tZ, -tY)
  // Wait, we want outward, which is (0, tZ, -tY) or (0, -tZ, tY) depending on winding.
  // The cross-section goes counterclockwise, so tangent direction at angle ~1.05 points
  // from upper-right toward lower-right. Normal should point outward (away from center).
  // Use: outward = perpendicular pointing away from (0,0) center
  let ny = tZ, nz = -tY; // perpendicular to tangent
  // Ensure it points outward (same side as surf point relative to center)
  if (ny * surf.y + nz * surf.z < 0) { ny = -ny; nz = -nz; }
  const nLen = Math.sqrt(ny * ny + nz * nz) || 1;
  ny /= nLen; nz /= nLen;

  // Eye radius: ~25% of head height, ES scales it
  const headHAtEye = dH + vH;
  const eR = headHAtEye * 0.125 * (0.6 + p.ES * 0.8);
  const eX = -L / 2 + eyeT * L;

  // EB controls how much the eye protrudes: 0 = flush/embedded, 1.0 = bug-eyed
  // Invert the sense: high EB = more outward protrusion
  const embed = eR * (0.50 - p.EB * 0.65);
  const surfY = surf.y + cy - ny * embed + eyeVertOffset;
  const surfZL = surf.z - nz * embed;
  const surfZR = -(surf.z - nz * embed);

  const eyeGeo = new THREE.SphereGeometry(eR, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const pupilGeo = new THREE.SphereGeometry(eR * 0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const eM = new THREE.MeshPhysicalMaterial({ color: 0xeedd44, metalness: 0.3, roughness: 0.15, clearcoat: 0.9 });
  const pM = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.3 });

  function makeEye(eyeY, eyeZ, outNY, outNZ) {
    const grp = new THREE.Group();

    // Hemisphere: default pole is +Y. We need the dome (pole) to point
    // along the outward surface normal, and the flat base to sit on the body.
    const eyeMesh = new THREE.Mesh(eyeGeo, eM);
    grp.add(eyeMesh);

    // Pupil hemisphere sits on top of the eye dome
    const pupilMesh = new THREE.Mesh(pupilGeo, pM);
    pupilMesh.position.y = eR * 0.10; // offset outward along local +Y (dome direction)
    grp.add(pupilMesh);

    // Position the group on the body surface
    grp.position.set(eX, eyeY, eyeZ);

    // Orient: we need local +Y to point along the outward normal (outNY, outNZ)
    // Use a manual quaternion: rotate from (0,1,0) to (0, outNY, outNZ)
    const outDir = new THREE.Vector3(0, outNY, outNZ).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, outDir);
    grp.quaternion.copy(quat);

    return grp;
  }

  const eyeGrpL = makeEye(surfY, surfZL, ny, nz);
  const eyeGrpR = makeEye(surfY, surfZR, ny, -nz);

  return { eyeGrpL, eyeGrpR };
}

// ── Hook slot / weight pocket ────────────────────────────────────────

export function buildHookSlot(p, L) {
  const maxD = L * p.BD, maxW = maxD * p.WR;
  if (p.HS <= 0.05) return null;
  const sg = new THREE.BoxGeometry(L * 0.012, maxD * p.HS * 0.3, maxW * 0.35);
  const sm = new THREE.MeshBasicMaterial({ color: 0xc4a04a, transparent: true, opacity: 0.3 });
  const m = new THREE.Mesh(sg, sm);
  m.position.set(L * 0.05, -maxD * 0.22, 0);
  return m;
}

export function buildWeightPocket(p, L) {
  const maxD = L * p.BD, maxW = maxD * p.WR;
  if (p.WP <= 0.05) return null;
  const wg = new THREE.CylinderGeometry(p.WP * 0.08, p.WP * 0.08, maxW * 0.25, 10);
  const wm = new THREE.MeshBasicMaterial({ color: 0x5a9a6b, transparent: true, opacity: 0.3 });
  const m = new THREE.Mesh(wg, wm);
  m.rotation.x = Math.PI / 2;
  m.position.set(-L * 0.06, -maxD * 0.28, 0);
  return m;
}
