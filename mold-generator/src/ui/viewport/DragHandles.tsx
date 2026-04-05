import { useState, useCallback } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useMoldStore } from '../../store/moldStore';
import { useDragPlacement } from '../../hooks/useDragPlacement';
import type { Vec3 } from '../../core/types';

type HandleType = 'pin' | 'bolt' | 'sprue' | 'vent';

const COLORS: Record<HandleType, string> = {
  pin: '#c8a84e',
  bolt: '#c8a84e',
  sprue: '#c8a84e',
  vent: '#c8a84e',
};

function FeatureHandle({ position, type, id, onDragEnd }: {
  position: Vec3;
  type: HandleType;
  id: string;
  onDragEnd: (id: string, pos: Vec3) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localPos, setLocalPos] = useState<[number, number, number]>([position.x, position.y, position.z]);
  const { camera, gl } = useThree();
  const { getPlaneIntersection } = useDragPlacement();

  const color = COLORS[type];

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(true);
    gl.domElement.style.cursor = 'grabbing';
    gl.domElement.setPointerCapture(e.nativeEvent.pointerId);
  }, [gl]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    const rect = gl.domElement.getBoundingClientRect();
    const ndcX = ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1;
    const hit = getPlaneIntersection(ndcX, ndcY, camera);
    if (hit) setLocalPos([hit.x, hit.y, 0]);
  }, [dragging, camera, gl, getPlaneIntersection]);

  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    setDragging(false);
    gl.domElement.style.cursor = '';
    onDragEnd(id, { x: localPos[0], y: localPos[1], z: 0 });
  }, [dragging, gl, id, localPos, onDragEnd]);

  return (
    <group position={localPos}>
      <mesh
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => { setHovered(false); if (!dragging) gl.domElement.style.cursor = ''; }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {type === 'pin' && <sphereGeometry args={[3, 16, 16]} />}
        {type === 'bolt' && <cylinderGeometry args={[3, 3, 4, 6]} />}
        {type === 'sprue' && <coneGeometry args={[5, 8, 16]} />}
        {type === 'vent' && <coneGeometry args={[2, 5, 8]} />}
        <meshStandardMaterial
          color={color}
          emissive={hovered || dragging ? color : '#000000'}
          emissiveIntensity={hovered || dragging ? 0.4 : 0}
        />
      </mesh>
    </group>
  );
}

export function DragHandles() {
  const alignConfig = useMoldStore(s => s.alignmentConfig);
  const clampConfig = useMoldStore(s => s.clampConfig);
  const baitMesh = useMoldStore(s => s.baitMesh);

  // All hooks must be called before any conditional return
  const handleDragEnd = useCallback((_id: string, _pos: Vec3) => {
    console.log('[DragHandles] drag end', _id, _pos);
  }, []);

  if (!baitMesh) return null;

  return (
    <>
      {alignConfig.positions.map((pos, i) => (
        <FeatureHandle key={`pin-${i}`} id={`pin-${i}`} position={pos} type="pin" onDragEnd={handleDragEnd} />
      ))}
      {clampConfig.positions.map((pos, i) => (
        <FeatureHandle key={`bolt-${i}`} id={`bolt-${i}`} position={pos} type="bolt" onDragEnd={handleDragEnd} />
      ))}
    </>
  );
}
