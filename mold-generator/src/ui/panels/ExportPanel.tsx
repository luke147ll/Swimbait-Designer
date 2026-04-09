import { useCallback } from 'react';
import { AccordionPanel } from '../shared/AccordionPanel';
import { useMoldStore } from '../../store/moldStore';
import { STLExporter } from '../../core/export/STLExporter';
import { BOMGenerator } from '../../core/export/BOMGenerator';
import { T } from '../../theme';

const stlExporter = new STLExporter();
const bomGenerator = new BOMGenerator();

const expBtn = (disabled: boolean): React.CSSProperties => ({
  width: '100%', padding: '8px 0', marginBottom: 6, fontSize: 11, cursor: disabled ? 'default' : 'pointer',
  background: disabled ? T.bgSurface : T.green, color: disabled ? T.textDim : T.textBright,
  border: '1px solid ' + (disabled ? T.border : T.green), borderRadius: 3,
  fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: 1,
  opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
});

export function ExportPanel() {
  const halfA = useMoldStore(s => s.moldHalfA);
  const halfB = useMoldStore(s => s.moldHalfB);
  const baitFileName = useMoldStore(s => s.baitFileName);
  const insertCards = useMoldStore(s => s.insertCards);
  const alignmentPins = useMoldStore(s => s.alignmentPins);
  const validation = useMoldStore(s => s.validationResult);

  const canExport = !!halfA && (validation?.valid !== false);

  // Strip extension from bait name for clean filenames
  const baseName = (baitFileName || 'mold').replace(/\.\w+$/, '').replace(/\s+/g, '_');

  const bom = (() => {
    const state = useMoldStore.getState();
    return bomGenerator.generateBOM(state);
  })();

  const handleExportA = useCallback(() => {
    if (halfA) stlExporter.exportBinary(halfA, `${baseName}_half_A`);
  }, [halfA, baseName]);

  const handleExportB = useCallback(() => {
    if (halfB) stlExporter.exportBinary(halfB, `${baseName}_half_B`);
  }, [halfB, baseName]);

  const handleExportAll = useCallback(() => {
    if (halfA) stlExporter.exportBinary(halfA, `${baseName}_half_A`);
    if (halfB) setTimeout(() => stlExporter.exportBinary(halfB, `${baseName}_half_B`), 200);
  }, [halfA, halfB, baseName]);

  return (
    <AccordionPanel title="Export" defaultExpanded={false}>
      <button style={expBtn(!canExport)} disabled={!canExport} onClick={handleExportA}>
        Export {baseName} Half A (.stl)
      </button>
      {halfB && (
        <button style={expBtn(!canExport)} disabled={!canExport} onClick={handleExportB}>
          Export {baseName} Half B (.stl)
        </button>
      )}
      {alignmentPins.length > 0 && alignmentPins.map((pin, i) => (
        <button key={`pin-${i}`} style={expBtn(!canExport)} disabled={!canExport}
          onClick={() => stlExporter.exportBinary(pin.geometry, `${baseName}_hex_pin_${i + 1}`)}>
          Export {pin.label} (.stl)
        </button>
      ))}
      {insertCards.length > 0 && insertCards.map((card, i) => (
        <button key={`card-${i}`} style={expBtn(!canExport)} disabled={!canExport}
          onClick={() => stlExporter.exportBinary(card.geometry, `${baseName}_insert_card_${i + 1}`)}>
          Export {card.label} (.stl)
        </button>
      ))}
      <button style={expBtn(!canExport)} disabled={!canExport} onClick={handleExportAll}>
        Export All (.stl)
      </button>

      {!canExport && halfA && (
        <div style={{ fontSize: 11, color: T.redBright, marginBottom: 8 }}>
          Fix validation errors before exporting
        </div>
      )}

      {halfA && (
        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 8, lineHeight: 1.5 }}>
          Note: Your slicer may report non-manifold edges from CSG operations.
          Most slicers (Bambu Studio, PrusaSlicer, Cura) auto-repair these on import.
          Enable "Auto-repair" or "Fix model" if prompted.
        </div>
      )}

      {/* BOM */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 8 }}>
        <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, marginBottom: 8 }}>Bill of Materials</div>
        <div style={{ fontFamily: T.font, fontSize: 11, lineHeight: 1.8 }}>
          {bom.items.map((item, i) => (
            <div key={i}>
              <span style={{ color: T.gold }}>{item.quantity}×</span>{' '}
              <span style={{ color: T.text }}>{item.name}</span>{'  '}
              <span style={{ color: T.textMuted }}>{item.size}</span>
            </div>
          ))}
          {bom.items.length === 0 && <div style={{ color: T.textMuted }}>No hardware required</div>}
        </div>

        {bom.estimatedFilamentGrams > 0 && (
          <div style={{ fontFamily: T.font, fontSize: 11, color: T.textMuted, marginTop: 8 }}>
            Filament: ~{bom.estimatedFilamentGrams}g / ~{bom.estimatedFilamentMeters}m ({bom.recommendedMaterial})
          </div>
        )}

        <div style={{ fontFamily: T.font, fontSize: 11, color: T.textMuted, marginTop: 12, lineHeight: 1.8 }}>
          <div style={{ color: T.textBright, fontWeight: 600, marginBottom: 4 }}>Print Settings</div>
          <div>Layer:  {bom.recommendedPrintSettings.layerHeight}</div>
          <div>Walls:  {bom.recommendedPrintSettings.wallCount}</div>
          <div>Infill: {bom.recommendedPrintSettings.infill}</div>
          <div>Orient: {bom.recommendedPrintSettings.orientation}</div>
        </div>
      </div>

      {/* STEP placeholder */}
      <button style={{ ...expBtn(true), marginTop: 8 }} disabled>
        Export STEP (CNC Handoff)
      </button>
      <div style={{ fontSize: 10, color: T.textDim, textAlign: 'center' }}>Coming soon</div>
    </AccordionPanel>
  );
}
