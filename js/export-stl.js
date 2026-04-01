/**
 * @file export-stl.js
 * ASCII STL file generation and browser download.
 * Accepts an array of meshes to combine into a single STL.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

/** Generate an ASCII STL from one or more meshes and trigger a download. */
export function exportSTL(meshes) {
  if (!meshes || !meshes.length) return;
  let s = 'solid swimbait\n';
  for (const mesh of meshes) {
    if (!mesh) continue;
    const g = mesh.geometry, p = g.attributes.position, x = g.index;
    const n = x ? x.count / 3 : p.count / 3;
    for (let i = 0; i < n; i++) {
      const a = x ? x.getX(i * 3) : i * 3, b = x ? x.getX(i * 3 + 1) : i * 3 + 1, c = x ? x.getX(i * 3 + 2) : i * 3 + 2;
      const v0 = new THREE.Vector3(p.getX(a), p.getY(a), p.getZ(a)), v1 = new THREE.Vector3(p.getX(b), p.getY(b), p.getZ(b)), v2 = new THREE.Vector3(p.getX(c), p.getY(c), p.getZ(c));
      const nm = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(v1, v0), new THREE.Vector3().subVectors(v2, v0)).normalize();
      s += `facet normal ${nm.x} ${nm.y} ${nm.z}\n outer loop\n  vertex ${v0.x} ${v0.y} ${v0.z}\n  vertex ${v1.x} ${v1.y} ${v1.z}\n  vertex ${v2.x} ${v2.y} ${v2.z}\n endloop\nendfacet\n`;
    }
  }
  s += 'endsolid swimbait\n';
  const bl = new Blob([s], {type:'application/octet-stream'}), u = URL.createObjectURL(bl), a = document.createElement('a');
  a.href = u; a.download = 'swimbait_master.stl'; a.click(); URL.revokeObjectURL(u);
}
