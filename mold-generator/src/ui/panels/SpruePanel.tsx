import { Slider } from '../shared/Slider';
import { Dropdown } from '../shared/Dropdown';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import { INJECTOR_PRESETS } from '../../core/constants';
import type { SpruePreset, GateType, SpruePosition } from '../../core/types';
import { T } from '../../theme';

const segBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '6px 0', textAlign: 'center', fontSize: 11, cursor: 'pointer',
  background: active ? T.bgElevated : T.bgSurface, color: active ? T.textBright : T.textMuted,
  border: '1px solid ' + (active ? T.goldDim : T.border),
  fontFamily: 'inherit', borderRadius: 0, transition: 'all 0.15s',
});

const gateInfo: Record<GateType, string> = {
  direct: 'Full bore opens into cavity. Fast fill. Trim sprue nub after demolding.',
  pinch: 'Narrow gate creates clean break point. Minimal trimming needed.',
  fan: 'Wide gate distributes flow evenly. Best for broad-body baits.',
};

export function SpruePanel() {
  const config = useMoldStore(s => s.sprueConfig);
  const update = useMoldStore(s => s.updateSprueConfig);

  const presetOptions = [
    { value: 'standard_5_8', label: 'Standard 5/8" Injector' },
    { value: 'jacobs_press', label: 'Jacobs Injection Press' },
    { value: 'open_pour', label: 'Open Pour' },
    { value: 'custom', label: 'Custom' },
  ];

  const handlePreset = (v: string) => {
    const preset = v as SpruePreset;
    const p = INJECTOR_PRESETS[preset as keyof typeof INJECTOR_PRESETS];
    if (p) {
      update({ preset, entryDiameter: p.entryDiameter, boreDiameter: p.boreDiameter, taper: p.taper });
    } else {
      update({ preset });
    }
  };

  const compatibility = INJECTOR_PRESETS[config.preset as keyof typeof INJECTOR_PRESETS]?.compatibility;
  const showDims = config.preset !== 'open_pour';

  return (
    <AccordionPanel title="Injection Port" defaultExpanded={false}>
      <Dropdown label="Preset" options={presetOptions} value={config.preset} onChange={handlePreset} />

      {compatibility && (
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>{compatibility}</div>
      )}

      {showDims && (
        <>
          <Slider label="Entry Diameter" value={config.entryDiameter} min={10} max={25} step={0.1} unit="mm"
            onChange={v => update({ entryDiameter: v })} />
          <Slider label="Bore Diameter" value={config.boreDiameter} min={1} max={15} step={0.5} unit="mm"
            onChange={v => update({ boreDiameter: v })} />

          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Gate Type</div>
          <div style={{ display: 'flex', marginBottom: 8, borderRadius: 3, overflow: 'hidden' }}>
            {(['direct', 'pinch', 'fan'] as GateType[]).map(g => (
              <button key={g} style={segBtn(config.gateType === g)}
                onClick={() => update({ gateType: g })}>{g}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>
            {gateInfo[config.gateType]}
          </div>
        </>
      )}

      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Position</div>
      <div style={{ display: 'flex', marginBottom: 12, borderRadius: 3, overflow: 'hidden' }}>
        {(['head', 'tail'] as SpruePosition[]).map(p => (
          <button key={p} style={segBtn(config.position === p)}
            onClick={() => update({ position: p })}>{p}</button>
        ))}
      </div>

      <Slider label="Height Offset" value={config.offsetZ} min={-20} max={20} step={0.5} unit="mm"
        onChange={v => update({ offsetZ: v })} />
    </AccordionPanel>
  );
}
