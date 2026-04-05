import { useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../core/types';

export type FeatureType = 'pin' | 'bolt' | 'sprue' | 'vent';

const MIN_DISTANCES: Record<FeatureType, { fromCavity: number; fromSame: number; fromOther: number }> = {
  pin:   { fromCavity: 12, fromSame: 15, fromOther: 8 },
  bolt:  { fromCavity: 8,  fromSame: 12, fromOther: 8 },
  sprue: { fromCavity: 0,  fromSame: 0,  fromOther: 0 },
  vent:  { fromCavity: 0,  fromSame: 5,  fromOther: 0 },
};

export function useDragPlacement() {
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<FeatureType | null>(null);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const partingPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  const getPlaneIntersection = useCallback((
    ndcX: number, ndcY: number, camera: THREE.Camera
  ): Vec3 | null => {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(partingPlane, target);
    if (!hit) return null;
    return { x: target.x, y: target.y, z: 0 };
  }, [raycaster, partingPlane]);

  const validatePosition = useCallback((
    pos: Vec3,
    type: FeatureType,
    existingPositions: Vec3[],
    moldBoundsX: number,
    moldBoundsY: number,
  ): boolean => {
    const rules = MIN_DISTANCES[type];

    // Check within mold bounds
    if (Math.abs(pos.x) > moldBoundsX / 2 - 4) return false;
    if (Math.abs(pos.y) > moldBoundsY / 2 - 4) return false;

    // Check distance from other features
    for (const other of existingPositions) {
      const dist = Math.hypot(pos.x - other.x, pos.y - other.y);
      if (dist < rules.fromSame) return false;
    }

    return true;
  }, []);

  const startDrag = useCallback((handleId: string) => {
    setActiveHandle(handleId);
  }, []);

  const endDrag = useCallback(() => {
    setActiveHandle(null);
  }, []);

  return {
    activeHandle,
    placementMode,
    setPlacementMode,
    getPlaneIntersection,
    validatePosition,
    startDrag,
    endDrag,
  };
}
