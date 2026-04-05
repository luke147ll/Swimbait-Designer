import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMoldStore } from '../../store/moldStore';
import { useViewportStore } from '../../store/viewportStore';
import { T } from '../../theme';

const EXPLODE_DIST = 25;
const LERP_SPEED = 8;

function prepareForDisplay(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const display = geo.clone();
  display.computeVertexNormals();
  display.computeBoundingBox();
  return display;
}

const matA = new THREE.MeshStandardMaterial({
  color: T.modelColor,
  transparent: true,
  opacity: 0.85,
  roughness: 0.55,
  metalness: 0.15,
  flatShading: true,
  side: THREE.FrontSide,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const matB = new THREE.MeshStandardMaterial({
  color: '#6a7a85',
  transparent: true,
  opacity: 0.75,
  roughness: 0.55,
  metalness: 0.15,
  flatShading: true,
  side: THREE.FrontSide,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const edgeMat = new THREE.LineBasicMaterial({
  color: T.bgDeep,
  opacity: 0.1,
  transparent: true,
});

function MoldEdges({ geometry }: { geometry: THREE.BufferGeometry }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 15), [geometry]);
  return <lineSegments geometry={edges} material={edgeMat} />;
}

function HalfMesh({ geometry, material, targetZ, clipPlanes }: {
  geometry: THREE.BufferGeometry | null;
  material: THREE.MeshStandardMaterial;
  targetZ: number;
  clipPlanes: THREE.Plane[];
}) {
  const ref = useRef<THREE.Group>(null);

  const displayGeo = useMemo(() => {
    if (!geometry) return null;
    return prepareForDisplay(geometry);
  }, [geometry]);

  useMemo(() => { material.clippingPlanes = clipPlanes; }, [material, clipPlanes]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.z = THREE.MathUtils.lerp(ref.current.position.z, targetZ, LERP_SPEED * delta);
    }
  });

  if (!displayGeo) return null;

  return (
    <group ref={ref}>
      <mesh geometry={displayGeo} material={material} castShadow={false} receiveShadow={false} />
      <MoldEdges geometry={displayGeo} />
    </group>
  );
}

export function MoldPreview() {
  const halfA = useMoldStore(s => s.moldHalfA);
  const halfB = useMoldStore(s => s.moldHalfB);
  const explode = useViewportStore(s => s.explode);
  const sectionCut = useViewportStore(s => s.sectionCut);

  const clipPlanes = useMemo(() => {
    if (!sectionCut) return [];
    return [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  }, [sectionCut]);

  const offsetA = explode ? -EXPLODE_DIST : 0;
  const offsetB = explode ? EXPLODE_DIST : 0;

  return (
    <>
      <HalfMesh geometry={halfA} material={matA} targetZ={offsetA} clipPlanes={clipPlanes} />
      <HalfMesh geometry={halfB} material={matB} targetZ={offsetB} clipPlanes={clipPlanes} />
    </>
  );
}
