import { useEffect, useRef } from 'react';
import { useMoldStore } from '../store/moldStore';
import { usePrinterStore } from '../store/printerStore';
import { MoldEngine } from '../core/MoldEngine';

let engine = new MoldEngine();
let consecutiveErrors = 0;

/**
 * Auto-regenerates the mold when any config changes.
 * Debounced by 400ms to avoid excessive CSG during slider drags.
 * Auto-recovers from WASM errors by creating a fresh engine.
 */
export function useMoldEngine() {
  const baitMesh = useMoldStore(s => s.baitMesh);
  const moldConfig = useMoldStore(s => s.moldConfig);
  const alignmentConfig = useMoldStore(s => s.alignmentConfig);
  const clampConfig = useMoldStore(s => s.clampConfig);
  const sprueConfig = useMoldStore(s => s.sprueConfig);
  const ventConfig = useMoldStore(s => s.ventConfig);
  const slotConfigs = useMoldStore(s => s.slotConfigs);
  const watermarkEnabled = useMoldStore(s => s.watermarkEnabled);
  const setGeneratedMold = useMoldStore(s => s.setGeneratedMold);
  const setIsGenerating = useMoldStore(s => s.setIsGenerating);
  const setValidationResult = useMoldStore(s => s.setValidationResult);
  const printOrientation = usePrinterStore(s => s.printOrientation);

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!baitMesh) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setIsGenerating(true);
      try {
        const state = useMoldStore.getState();
        const result = await engine.generate(state);
        setGeneratedMold(result.halfA, result.halfB);
        setValidationResult(result.validation);
        consecutiveErrors = 0;
      } catch (err) {
        console.error('[useMoldEngine] Generation failed:', err);
        consecutiveErrors++;

        // After 2 consecutive errors, create a fresh engine instance
        // to recover from corrupted WASM state
        if (consecutiveErrors >= 2) {
          console.warn('[useMoldEngine] Multiple failures — resetting engine');
          engine = new MoldEngine();
          consecutiveErrors = 0;
        }

        // Retry once with the fresh engine on the next config change
        // (the useEffect will fire again since we're already in the dep cycle)
      }
      setIsGenerating(false);
    }, 400);

    return () => clearTimeout(timerRef.current);
  }, [baitMesh, moldConfig, alignmentConfig, clampConfig, sprueConfig, ventConfig,
    slotConfigs, watermarkEnabled, printOrientation,
    setGeneratedMold, setIsGenerating, setValidationResult]);
}
