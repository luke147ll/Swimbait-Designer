import { Slider } from '../shared/Slider';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import { T } from '../../theme';

export function SlotPanel() {
  const slotConfigs = useMoldStore(s => s.slotConfigs);
  const updateSlot = useMoldStore(s => s.updateSlotConfig);

  if (slotConfigs.length === 0) return null;

  return (
    <AccordionPanel title="Hook Slots" defaultExpanded>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>
        Adjust slot positions to avoid bolt holes. Positions are in mm from bait center.
      </div>

      {slotConfigs.map((slot, i) => (
        <div key={i} style={{ borderBottom: i < slotConfigs.length - 1 ? `1px solid ${T.border}` : 'none',
          paddingBottom: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: T.textBright, marginBottom: 8 }}>
            Slot {i + 1}
          </div>

          <Slider label="Position (Body Axis)" value={slot.positionY} min={-150} max={150} step={0.5} unit="mm"
            onChange={v => updateSlot(i, { positionY: v })} />
          <Slider label="Position (Height)" value={slot.positionZ} min={-30} max={30} step={0.5} unit="mm"
            onChange={v => updateSlot(i, { positionZ: v })} />
          <Slider label="Slot Length" value={slot.length} min={1} max={30} step={0.5} unit="mm"
            onChange={v => updateSlot(i, { length: v })} />
          <Slider label="Slot Width" value={slot.width} min={0.5} max={10} step={0.25} unit="mm"
            onChange={v => updateSlot(i, { width: v })} />
        </div>
      ))}
    </AccordionPanel>
  );
}
