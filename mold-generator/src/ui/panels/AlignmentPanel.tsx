import { Slider } from '../shared/Slider';
import { Toggle } from '../shared/Toggle';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import type { AlignmentType } from '../../core/types';
import { T } from '../../theme';

const segBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '6px 0', textAlign: 'center', fontSize: 11, cursor: 'pointer',
  background: active ? T.bgElevated : T.bgSurface, color: active ? T.textBright : T.textMuted,
  border: '1px solid ' + (active ? T.goldDim : T.border),
  fontFamily: 'inherit', borderRadius: 0, transition: 'all 0.15s',
});

export function AlignmentPanel() {
  const config = useMoldStore(s => s.alignmentConfig);
  const update = useMoldStore(s => s.updateAlignmentConfig);

  const clearanceA = config.type === 'dowel_pin'
    ? (config.pinDiameter + config.pressClearance).toFixed(1)
    : config.type === 'hex_printed'
    ? (config.pinDiameter + 0.3).toFixed(1)
    : config.pinDiameter.toFixed(1);
  const clearanceB = config.type === 'dowel_pin'
    ? (config.pinDiameter + config.slipClearance).toFixed(1)
    : (config.pinDiameter + 0.3).toFixed(1);
  const labelA = config.type === 'dowel_pin' ? 'Press' : 'Socket A';
  const labelB = config.type === 'dowel_pin' ? 'Slip' : 'Socket B';

  return (
    <AccordionPanel title="Alignment" defaultExpanded={true}>
      {/* Type selector */}
      <div style={{ display: 'flex', marginBottom: 12, borderRadius: 3, overflow: 'hidden' }}>
        <button style={segBtn(config.type === 'dowel_pin')}
          onClick={() => update({ type: 'dowel_pin' as AlignmentType })}>Dowel</button>
        <button style={segBtn(config.type === 'printed_pin')}
          onClick={() => update({ type: 'printed_pin' as AlignmentType })}>Printed</button>
        <button style={segBtn(config.type === 'hex_printed')}
          onClick={() => update({ type: 'hex_printed' as AlignmentType })}>Hex</button>
      </div>

      <Slider label="Pin Diameter" value={config.pinDiameter} min={3} max={6} step={0.5} unit="mm"
        onChange={v => update({ pinDiameter: v })} />
      <Slider label="Pin Length" value={config.pinLength} min={10} max={25} step={1} unit="mm"
        onChange={v => update({ pinLength: v })} />

      {/* Pin count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: T.text }}>Pin Count</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[2, 4].map(n => (
            <button key={n} onClick={() => update({ pinCount: n })}
              style={{ ...segBtn(config.pinCount === n), borderRadius: 3, padding: '4px 12px', flex: 'none' }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Clearances */}
      <div style={{ fontFamily: T.font, fontSize: 11, color: T.textMuted, marginBottom: 12 }}>
        {labelA}: {clearanceA}mm | {labelB}: {clearanceB}mm
      </div>

      {/* Info */}
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>
        {config.type === 'dowel_pin'
          ? 'Use stainless steel dowel pins. Available at any hardware store or Amazon.'
          : config.type === 'hex_printed'
          ? 'Hex pins print as separate STL files. Anti-rotation, 0.15mm clearance. No hardware needed.'
          : 'Printed pins wear faster. Expect replacement after ~20 uses. No additional hardware needed.'}
      </div>

      {/* Perimeter key */}
      <Toggle label="Perimeter Key" checked={config.perimeterKey}
        onChange={v => update({ perimeterKey: v })} />
      {config.perimeterKey && (
        <Slider label="Key Height" value={config.keyHeight} min={0.5} max={1.5} step={0.1} unit="mm"
          onChange={v => update({ keyHeight: v })} />
      )}
      {config.perimeterKey && (
        <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
          Raised lip around parting face for secondary alignment. Recommended.
        </div>
      )}

      {/* Position list */}
      {config.positions.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          {config.positions.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11, fontFamily: T.font, color: T.textMuted, marginBottom: 4 }}>
              <span>Pin {i + 1}: ({p.x.toFixed(1)}, {p.y.toFixed(1)})</span>
              <span style={{ color: T.redBright, cursor: 'pointer' }}
                onClick={() => update({ positions: config.positions.filter((_, j) => j !== i) })}>×</span>
            </div>
          ))}
        </div>
      )}
    </AccordionPanel>
  );
}
