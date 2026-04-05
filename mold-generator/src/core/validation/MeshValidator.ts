import * as THREE from 'three';
import type { MeshValidationResult, ValidationError } from '../types';

export class MeshValidator {
  validateBaitMesh(mesh: THREE.BufferGeometry): MeshValidationResult {
    const issues: ValidationError[] = [];
    const vertexCount = mesh.attributes.position.count;

    if (vertexCount === 0) {
      issues.push({ code: 'MESH_EMPTY', severity: 'error', message: 'Mesh has no vertices' });
    }
    if (vertexCount > 2_000_000) {
      issues.push({ code: 'MESH_TOO_DENSE', severity: 'error',
        message: `Mesh has ${vertexCount.toLocaleString()} vertices (max 2M). Decimate before importing.` });
    } else if (vertexCount > 500_000) {
      issues.push({ code: 'MESH_DENSE', severity: 'warning',
        message: `Mesh has ${vertexCount.toLocaleString()} vertices. Generation may be slow.` });
    }

    mesh.computeBoundingBox();
    const bounds = mesh.boundingBox!;
    const size = new THREE.Vector3();
    bounds.getSize(size);

    if (size.x === 0 || size.y === 0 || size.z === 0) {
      issues.push({ code: 'MESH_FLAT', severity: 'error', message: 'Mesh is flat (zero volume)' });
    }
    if (size.x > 500 || size.y > 500 || size.z > 500) {
      issues.push({ code: 'MESH_HUGE', severity: 'warning',
        message: `Mesh is very large (${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)} mm). Verify units are mm.` });
    }
    if (size.x < 5 && size.y < 5 && size.z < 5) {
      issues.push({ code: 'MESH_TINY', severity: 'warning',
        message: `Mesh is very small (${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm). May be in meters.` });
    }

    const positions = mesh.attributes.position.array;
    let hasNaN = false;
    for (let i = 0; i < positions.length; i++) {
      if (isNaN(positions[i])) { hasNaN = true; break; }
    }
    if (hasNaN) {
      issues.push({ code: 'MESH_NAN', severity: 'error', message: 'Mesh contains NaN values' });
    }

    const isManifold = mesh.index !== null;
    if (!isManifold) {
      issues.push({ code: 'MESH_NON_INDEXED', severity: 'warning',
        message: 'Mesh is non-indexed. CSG may produce artifacts.' });
    }

    mesh.computeVertexNormals();
    const hasConsistentNormals = mesh.attributes.normal !== undefined;

    return {
      valid: !issues.some(i => i.severity === 'error'),
      issues, vertexCount, isManifold, hasConsistentNormals,
    };
  }
}
