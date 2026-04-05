import { useMemo } from 'react';
import * as THREE from 'three';
import { useMoldStore } from '../../store/moldStore';
import { useViewportStore } from '../../store/viewportStore';
import { T } from '../../theme';

export function GhostOverlay() {
  const baitMesh = useMoldStore(s => s.baitMesh);
  const texturedBaitMesh = useMoldStore(s => s.texturedBaitMesh);
  const showBait = useViewportStore(s => s.showBait);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: T.gold,
    transparent: true,
    opacity: 0.15,
    roughness: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  const geo = texturedBaitMesh ?? baitMesh;
  if (!geo || !showBait) return null;

  return <mesh geometry={geo} material={material} />;
}
