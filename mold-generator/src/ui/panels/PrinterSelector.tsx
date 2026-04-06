import { Dropdown } from '../shared/Dropdown';
import { Slider } from '../shared/Slider';
import { AccordionPanel } from '../shared/AccordionPanel';
import { usePrinterStore } from '../../store/printerStore';
import { useMoldStore } from '../../store/moldStore';
import { PRINTER_PROFILES } from '../../core/constants';
import { T } from '../../theme';

const orientationInfo = {
  on_edge: 'Best cavity finish. Layer lines along bait length.',
  flat_down: 'Easiest print. Rougher cavity surface.',
  flat_up: 'Good finish. Needs support for deep cavities.',
};

export function PrinterSelector() {
  const { selectedProfile, setProfile, setCustomDimensions, printOrientation, setPrintOrientation } = usePrinterStore();
  const validation = useMoldStore(s => s.validationResult);

  const options = [
    ...PRINTER_PROFILES.map(p => ({ value: p.id, label: p.name })),
    { value: 'custom', label: 'Custom' },
  ];

  const handleChange = (id: string) => {
    if (id === 'custom') {
      setCustomDimensions(250, 250, 250);
    } else {
      const p = PRINTER_PROFILES.find(pr => pr.id === id);
      if (p) setProfile(p);
    }
  };

  return (
    <AccordionPanel title="Printer" defaultExpanded={true}>
      <Dropdown label="Printer" options={options} value={selectedProfile.id} onChange={handleChange} />

      {selectedProfile.isCustom && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Slider label="X" value={selectedProfile.bedX} min={100} max={500} step={5} unit="mm"
              onChange={v => setCustomDimensions(v, selectedProfile.bedY, selectedProfile.bedZ)} />
          </div>
          <div style={{ flex: 1 }}>
            <Slider label="Y" value={selectedProfile.bedY} min={100} max={500} step={5} unit="mm"
              onChange={v => setCustomDimensions(selectedProfile.bedX, v, selectedProfile.bedZ)} />
          </div>
          <div style={{ flex: 1 }}>
            <Slider label="Z" value={selectedProfile.bedZ} min={100} max={500} step={5} unit="mm"
              onChange={v => setCustomDimensions(selectedProfile.bedX, selectedProfile.bedY, v)} />
          </div>
        </div>
      )}

      <div style={{ fontFamily: T.font, fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
        Usable: {selectedProfile.usableX} × {selectedProfile.usableY} × {selectedProfile.usableZ} mm
      </div>

      <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, marginBottom: 6, marginTop: 8 }}>Print Orientation</div>
      {(['on_edge', 'flat_down', 'flat_up'] as const).map(o => (
        <label key={o} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6, cursor: 'pointer', fontSize: 11, color: printOrientation === o ? T.textBright : T.textMuted }}>
          <input type="radio" name="orientation" checked={printOrientation === o}
            onChange={() => setPrintOrientation(o)}
            style={{ marginTop: 2 }} />
          <span>
            <span style={{ fontWeight: printOrientation === o ? 600 : 400 }}>
              {o === 'on_edge' ? 'On Edge' : o === 'flat_down' ? 'Flat (face down)' : 'Flat (face up)'}
            </span>
            {o === 'on_edge' && <span style={{ color: T.gold, fontSize: 9, marginLeft: 4 }}>RECOMMENDED</span>}
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{orientationInfo[o]}</div>
          </span>
        </label>
      ))}

      {validation && !validation.valid && (
        <div style={{ background: T.bgSurface, border: `1px solid ${T.redBright}`, borderRadius: 4, padding: 10,
          fontSize: 12, color: T.redBright, marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ Mold exceeds printer bed</div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ color: T.text, fontSize: 11 }}>{e.message}</div>
          ))}
          {validation.suggestions.map((s, i) => (
            <div key={i} style={{ color: T.gold, fontSize: 11, marginTop: 4, cursor: 'pointer' }}>{s}</div>
          ))}
        </div>
      )}
    </AccordionPanel>
  );
}
