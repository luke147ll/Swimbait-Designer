import { Dropdown } from '../shared/Dropdown';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import type { ClampMode, BoltSize } from '../../core/types';
import { T } from '../../theme';

const segBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '6px 0', textAlign: 'center', fontSize: 10, cursor: 'pointer',
  background: active ? T.bgElevated : T.bgSurface, color: active ? T.textBright : T.textMuted,
  border: '1px solid ' + (active ? T.goldDim : T.border),
  fontFamily: 'inherit', borderRadius: 0, transition: 'all 0.15s',
});

const modeInfo: Record<ClampMode, string> = {
  heat_set_insert: 'Use brass knurled heat-set inserts. Press into halfA with a soldering iron at 220°C.',
  through_bolt: 'Use socket head cap screws with washers and wing nuts.',
  external_clamp: 'No bolt holes generated. Use C-clamps, toggle clamps, or rubber bands. More compact mold.',
};

export function ClampPanel() {
  const config = useMoldStore(s => s.clampConfig);
  const update = useMoldStore(s => s.updateClampConfig);

  const handleMode = (mode: ClampMode) => {
    update({ mode });
    // Engine handles clampFlange=0 for external_clamp — no need to modify moldConfig here
  };

  const showBoltControls = config.mode !== 'external_clamp';

  return (
    <AccordionPanel title="Clamping" defaultExpanded={false}>
      <div style={{ display: 'flex', marginBottom: 12, borderRadius: 3, overflow: 'hidden' }}>
        {([
          ['heat_set_insert', 'Heat-Set'],
          ['through_bolt', 'Through-Bolt'],
          ['external_clamp', 'External'],
        ] as [ClampMode, string][]).map(([m, label]) => (
          <button key={m} style={segBtn(config.mode === m)} onClick={() => handleMode(m)}>{label}</button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>
        {modeInfo[config.mode]}
      </div>

      {config.mode === 'external_clamp' && (
        <div style={{ fontSize: 11, color: T.gold, marginBottom: 8 }}>
          Clamp flange removed. Mold width reduced.
        </div>
      )}

      {showBoltControls && (
        <>
          <Dropdown label="Bolt Size"
            options={[
              { value: 'M4', label: 'M4' },
              { value: 'M5', label: 'M5' },
              { value: 'M6', label: 'M6' },
            ]}
            value={config.boltSize}
            onChange={v => update({ boltSize: v as BoltSize })}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: T.text }}>Bolt Count</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[2, 4, 6, 8].map(n => (
                <button key={n} onClick={() => update({ boltCount: n })}
                  style={{ ...segBtn(config.boltCount === n), borderRadius: 3, padding: '4px 10px', flex: 'none' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {config.positions.length > 0 && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
              {config.positions.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 11, fontFamily: T.font, color: T.textMuted, marginBottom: 4 }}>
                  <span>Bolt {i + 1}: ({p.x.toFixed(1)}, {p.y.toFixed(1)})</span>
                  <span style={{ color: T.redBright, cursor: 'pointer' }}
                    onClick={() => update({ positions: config.positions.filter((_, j) => j !== i) })}>×</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AccordionPanel>
  );
}
