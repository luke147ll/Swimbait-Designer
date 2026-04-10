import { useEffect, useRef, useCallback } from 'react';
import { useMoldStore } from '../store/moldStore';
import { usePrinterStore } from '../store/printerStore';
import { MoldEngine } from '../core/MoldEngine';

let engine = new MoldEngine();
let consecutiveErrors = 0;

/**
 * Auto-regenerates the mold when any config changes.
 * Debounced by 400ms. Guards against overlapping generations —
 * if a generation is in progress, queues ONE follow-up with the latest state.
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
  const runningRef = useRef(false);
  const pendingRef = useRef(false);

  const runGeneration = useCallback(async () => {
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }

    const bait = useMoldStore.getState().baitMesh;
    if (!bait) return;

    runningRef.current = true;
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
      if (consecutiveErrors >= 2) {
        console.warn('[useMoldEngine] Multiple failures — resetting engine');
        engine = new MoldEngine();
        consecutiveErrors = 0;
      }
    }

    runningRef.current = false;
    setIsGenerating(false);

    // If a config change came in during generation, run again with latest state
    if (pendingRef.current) {
      pendingRef.current = false;
      // Small delay to let the UI breathe before starting the next generation
      setTimeout(runGeneration, 100);
    }
  }, [setGeneratedMold, setIsGenerating, setValidationResult]);

  useEffect(() => {
    if (!baitMesh) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runGeneration, 400);

    return () => clearTimeout(timerRef.current);
  }, [baitMesh, moldConfig, alignmentConfig, clampConfig, sprueConfig, ventConfig,
    slotConfigs, watermarkEnabled, printOrientation, runGeneration]);
}
