import { Slider } from '../shared/Slider';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import { T } from '../../theme';

export function MoldConfigPanel() {
  const config = useMoldStore(s => s.moldConfig);
  const update = useMoldStore(s => s.updateMoldConfig);
  const baitMesh = useMoldStore(s => s.baitMesh);
  const clampMode = useMoldStore(s => s.clampConfig.mode);
  const watermarkEnabled = useMoldStore(s => s.watermarkEnabled);
  const setWatermarkEnabled = useMoldStore(s => s.setWatermarkEnabled);

  // Calculate mold dimensions
  let moldDims = null;
  if (baitMesh) {
    baitMesh.computeBoundingBox();
    const bb = baitMesh.boundingBox!;
    const baitX = bb.max.x - bb.min.x;
    const baitY = bb.max.y - bb.min.y;
    const baitZ = bb.max.z - bb.min.z;
    const flange = clampMode === 'external_clamp' ? 0 : config.clampFlange;
    const moldX = baitX + config.wallMarginY * 2;
    const moldY = baitY + config.wallMarginX * 2 + flange * 2;
    const halfZ = baitZ / 2 + config.wallMarginZ + config.partingFaceDepth;
    moldDims = { x: moldX, y: moldY, halfZ, totalZ: halfZ * 2,
      vol: (moldX * moldY * halfZ / 1000).toFixed(0) };
  }

  return (
    <AccordionPanel title="Mold Body" defaultExpanded={true}>
      <Slider label="Side Walls" value={config.wallMarginX} min={5} max={25} step={0.5} unit="mm"
        onChange={v => update({ wallMarginX: v })} />
      <Slider label="End Walls" value={config.wallMarginY} min={5} max={25} step={0.5} unit="mm"
        onChange={v => update({ wallMarginY: v })} />
      <Slider label="Floor Thickness" value={config.wallMarginZ} min={4} max={20} step={0.5} unit="mm"
        onChange={v => update({ wallMarginZ: v })} />
      <Slider label="Clamp Flange" value={config.clampFlange} min={8} max={20} step={1} unit="mm"
        disabled={clampMode === 'external_clamp'}
        onChange={v => update({ clampFlange: v })} />
      <Slider label="Pry Slot Width" value={config.cavityClearance} min={0} max={5} step={0.5} unit="mm"
        onChange={v => update({ cavityClearance: v })} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: T.textMuted }}>Watermark</span>
        <button
          style={{ padding: '4px 10px', fontSize: 10, cursor: 'pointer', border: `1px solid ${T.border}`,
            borderRadius: 3, fontFamily: 'inherit', textTransform: 'uppercase',
            background: watermarkEnabled ? T.gold : T.bgSurface,
            color: watermarkEnabled ? T.bgDeep : T.textMuted }}
          onClick={() => setWatermarkEnabled(!watermarkEnabled)}>
          {watermarkEnabled ? 'On' : 'Off'}
        </button>
      </div>
      {watermarkEnabled && (
        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 8 }}>
          A: "SWIMBAIT" &middot; B: "DESIGNER" &middot; 1.5mm void depth
        </div>
      )}

      {clampMode === 'external_clamp' && (
        <div style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic', marginBottom: 8 }}>
          Clamp flange disabled — external clamp mode
        </div>
      )}

      {moldDims && (
        <div style={{ fontFamily: T.font, fontSize: 11, color: T.textMuted, marginTop: 8,
          borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <div>Per half: {moldDims.x.toFixed(1)} × {moldDims.y.toFixed(1)} × {moldDims.halfZ.toFixed(1)} mm</div>
          <div>Closed: {moldDims.totalZ.toFixed(1)} mm height</div>
          <div>Volume: ~{moldDims.vol} cm³ per half</div>
        </div>
      )}
    </AccordionPanel>
  );
}
