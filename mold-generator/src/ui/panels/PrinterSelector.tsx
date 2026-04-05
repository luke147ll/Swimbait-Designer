import { Dropdown } from '../shared/Dropdown';
import { Slider } from '../shared/Slider';
import { AccordionPanel } from '../shared/AccordionPanel';
import { usePrinterStore } from '../../store/printerStore';
import { useMoldStore } from '../../store/moldStore';
import { PRINTER_PROFILES } from '../../core/constants';
import { T } from '../../theme';

export function PrinterSelector() {
  const { selectedProfile, setProfile, setCustomDimensions } = usePrinterStore();
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
