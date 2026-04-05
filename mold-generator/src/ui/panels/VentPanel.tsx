import { Slider } from '../shared/Slider';
import { Toggle } from '../shared/Toggle';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import { T } from '../../theme';

export function VentPanel() {
  const config = useMoldStore(s => s.ventConfig);
  const update = useMoldStore(s => s.updateVentConfig);

  return (
    <AccordionPanel title="Venting" defaultExpanded={false}>
      <Toggle label="Auto Vent" checked={config.autoVent} onChange={v => update({ autoVent: v })} />

      <Slider label="Vent Width" value={config.ventWidth} min={1} max={4} step={0.5} unit="mm"
        onChange={v => update({ ventWidth: v })} />
      <Slider label="Vent Depth" value={config.ventDepth} min={0.1} max={0.8} step={0.05} unit="mm"
        onChange={v => update({ ventDepth: v })} />

      <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5, marginBottom: 12 }}>
        Depth should be ≤0.5mm. Plastisol won't fill shallow channels but air escapes freely.
      </div>

      {config.vents.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Manual vents:</div>
          {config.vents.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11, fontFamily: T.font, color: T.textMuted, marginBottom: 4 }}>
              <span>V{i + 1}: ({v.position.x.toFixed(1)}, {v.position.y.toFixed(1)})</span>
              <span style={{ color: T.redBright, cursor: 'pointer' }}
                onClick={() => update({ vents: config.vents.filter((_, j) => j !== i) })}>×</span>
            </div>
          ))}
        </div>
      )}
    </AccordionPanel>
  );
}
