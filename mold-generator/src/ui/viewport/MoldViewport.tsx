import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { MoldPreview } from './MoldPreview';
import { GhostOverlay } from './GhostOverlay';
import { BedBoundsIndicator } from './BedBoundsIndicator';
import { DragHandles } from './DragHandles';
import { useViewportStore } from '../../store/viewportStore';
import { useMoldStore } from '../../store/moldStore';
import { T } from '../../theme';

function SceneGrid() {
  return (
    <gridHelper
      args={[300, 30, T.gridMajor, T.gridMinor]}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, -40, 0]}
    />
  );
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  background: active ? T.bgElevated : T.bgSurface,
  color: active ? T.textBright : T.textMuted,
  border: '1px solid ' + (active ? T.goldDim : T.border),
  borderRadius: 3,
  fontFamily: T.font,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  cursor: 'pointer',
  transition: 'all 0.15s',
});

export function MoldViewport() {
  const { explode, sectionCut, showBait, showBedBounds,
    toggleExplode, toggleSectionCut, toggleShowBait, toggleShowBedBounds } = useViewportStore();
  const isGenerating = useMoldStore(s => s.isGenerating);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: T.bgDeep }}>
      {/* Controls overlay */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', gap: 2, alignItems: 'center',
      }}>
        <button style={btnStyle(explode)} onClick={toggleExplode}>Explode</button>
        <button style={btnStyle(sectionCut)} onClick={toggleSectionCut}>Section</button>
        <button style={btnStyle(showBait)} onClick={toggleShowBait}>Bait</button>
        <button style={btnStyle(showBedBounds)} onClick={toggleShowBedBounds}>Bed</button>
        {isGenerating && (
          <span style={{ fontSize: 11, color: T.gold, marginLeft: 8 }}>Generating...</span>
        )}
      </div>

      <Canvas
        camera={{ position: [150, 100, 100], fov: 50, near: 0.1, far: 2000 }}
        gl={{ localClippingEnabled: true }}
      >
        <color attach="background" args={[T.bgDeep]} />

        <ambientLight intensity={0.7} color="#ffffff" />
        <directionalLight position={[100, 150, 100]} intensity={0.4} castShadow={false} />
        <directionalLight position={[-80, 60, -50]} intensity={0.25} castShadow={false} />
        <directionalLight position={[0, 0, 200]} intensity={0.3} castShadow={false} />
        <directionalLight position={[0, 0, -100]} intensity={0.15} castShadow={false} />

        <SceneGrid />

        <MoldPreview />
        <GhostOverlay />
        <BedBoundsIndicator />
        <DragHandles />
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} minDistance={50} maxDistance={500} />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
