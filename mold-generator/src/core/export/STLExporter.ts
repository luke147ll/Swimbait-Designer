import * as THREE from 'three';

export class STLExporter {
  exportBinary(geometry: THREE.BufferGeometry, filename: string): void {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

    const positions = geo.attributes.position;
    const triangleCount = positions.count / 3;

    const bufferLength = 80 + 4 + (triangleCount * 50);
    const buffer = new ArrayBuffer(bufferLength);
    const view = new DataView(buffer);

    const header = `SBD Mold Generator - ${filename}`;
    for (let i = 0; i < 80; i++) {
      view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
    }

    view.setUint32(80, triangleCount, true);

    // Temp vectors for geometric face normal computation
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();

    let offset = 84;
    for (let tri = 0; tri < triangleCount; tri++) {
      const i = tri * 3;

      // Get triangle vertices
      vA.set(positions.getX(i), positions.getY(i), positions.getZ(i));
      vB.set(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
      vC.set(positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2));

      // Compute geometric face normal from cross product
      edge1.subVectors(vB, vA);
      edge2.subVectors(vC, vA);
      faceNormal.crossVectors(edge1, edge2).normalize();

      // Write face normal
      view.setFloat32(offset, faceNormal.x, true); offset += 4;
      view.setFloat32(offset, faceNormal.y, true); offset += 4;
      view.setFloat32(offset, faceNormal.z, true); offset += 4;

      // Write three vertices
      view.setFloat32(offset, vA.x, true); offset += 4;
      view.setFloat32(offset, vA.y, true); offset += 4;
      view.setFloat32(offset, vA.z, true); offset += 4;
      view.setFloat32(offset, vB.x, true); offset += 4;
      view.setFloat32(offset, vB.y, true); offset += 4;
      view.setFloat32(offset, vB.z, true); offset += 4;
      view.setFloat32(offset, vC.x, true); offset += 4;
      view.setFloat32(offset, vC.y, true); offset += 4;
      view.setFloat32(offset, vC.z, true); offset += 4;

      // Attribute byte count
      view.setUint16(offset, 0, true); offset += 2;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
