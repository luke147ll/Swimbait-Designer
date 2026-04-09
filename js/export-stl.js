/**
 * @file export-stl.js
 * Binary STL file generation with world transform support.
 * Accepts an array of Three.js meshes, bakes their matrixWorld,
 * and exports a single merged binary STL.
 */
import * as THREE from 'https://esm.sh/three@0.162.0';

/**
 * Export meshes as a binary STL and trigger a download.
 * @param {THREE.Mesh[]} meshes - array of meshes to include
 * @param {string} filename - download filename (default: 'swimbait.stl')
 * @param {number} scale - scale factor applied to all vertices (default: 25.4, inches→mm)
 */
export function exportSTL(meshes, filename = 'swimbait.stl', scale = 25.4) {
  if (!meshes || !meshes.length) return;

  // Count total triangles
  let totalTris = 0;
  for (const mesh of meshes) {
    if (!mesh || !mesh.geometry) continue;
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry;
    const idx = g.index;
    totalTris += idx ? idx.count / 3 : g.attributes.position.count / 3;
  }

  // Binary STL: 80-byte header + 4-byte tri count + 50 bytes per triangle
  const bufSize = 84 + totalTris * 50;
  const buf = new ArrayBuffer(bufSize);
  const dv = new DataView(buf);

  // Header (80 bytes, zeroed)
  const header = 'Swimbait Designer STL';
  for (let i = 0; i < Math.min(header.length, 80); i++) dv.setUint8(i, header.charCodeAt(i));

  // Triangle count
  dv.setUint32(80, totalTris, true);

  let off = 84;
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nm = new THREE.Vector3();

  for (const mesh of meshes) {
    if (!mesh || !mesh.geometry) continue;
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const mat = mesh.matrixWorld;
    const normalMat = new THREE.Matrix3().getNormalMatrix(mat);
    const triCount = idx ? idx.count / 3 : pos.count / 3;

    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3;
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

      v0.set(pos.getX(a), pos.getY(a), pos.getZ(a)).applyMatrix4(mat).multiplyScalar(scale);
      v1.set(pos.getX(b), pos.getY(b), pos.getZ(b)).applyMatrix4(mat).multiplyScalar(scale);
      v2.set(pos.getX(c), pos.getY(c), pos.getZ(c)).applyMatrix4(mat).multiplyScalar(scale);

      e1.subVectors(v1, v0);
      e2.subVectors(v2, v0);
      nm.crossVectors(e1, e2).normalize();

      // Normal (12 bytes)
      dv.setFloat32(off, nm.x, true); off += 4;
      dv.setFloat32(off, nm.y, true); off += 4;
      dv.setFloat32(off, nm.z, true); off += 4;
      // Vertex 0 (12 bytes)
      dv.setFloat32(off, v0.x, true); off += 4;
      dv.setFloat32(off, v0.y, true); off += 4;
      dv.setFloat32(off, v0.z, true); off += 4;
      // Vertex 1 (12 bytes)
      dv.setFloat32(off, v1.x, true); off += 4;
      dv.setFloat32(off, v1.y, true); off += 4;
      dv.setFloat32(off, v1.z, true); off += 4;
      // Vertex 2 (12 bytes)
      dv.setFloat32(off, v2.x, true); off += 4;
      dv.setFloat32(off, v2.y, true); off += 4;
      dv.setFloat32(off, v2.z, true); off += 4;
      // Attribute byte count (2 bytes)
      dv.setUint16(off, 0, true); off += 2;
    }
  }

  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
