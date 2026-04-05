import { useMemo } from 'react';
import * as THREE from 'three';
import { useMoldStore } from '../../store/moldStore';
import { useViewportStore } from '../../store/viewportStore';
import { T } from '../../theme';

export function GhostOverlay() {
  const baitMesh = useMoldStore(s => s.baitMesh);
  const texturedBaitMesh = useMoldStore(s => s.texturedBaitMesh);
  const moldHalfA = useMoldStore(s => s.moldHalfA);
  const showBait = useViewportStore(s => s.showBait);
  const explode = useViewportStore(s => s.explode);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: T.gold,
    transparent: true,
    opacity: 0.2,
    roughness: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  const wireframeMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: T.gold,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  }), []);

  const geo = texturedBaitMesh ?? baitMesh;
  if (!geo || !showBait) return null;

  // When mold is generated and NOT exploded, show wireframe only
  // (solid ghost z-fights with cavity walls)
  // When exploded or no mold, show solid translucent
  const hasMold = !!moldHalfA;
  const useWireframe = hasMold && !explode;

  return <mesh geometry={geo} material={useWireframe ? wireframeMaterial : material} />;
}
