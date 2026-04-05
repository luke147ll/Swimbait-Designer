import { useEffect, useRef } from 'react';
import { useMoldStore } from '../store/moldStore';
import { MoldEngine } from '../core/MoldEngine';

const engine = new MoldEngine();

/**
 * Auto-regenerates the mold when any config changes.
 * Debounced by 400ms to avoid excessive CSG during slider drags.
 */
export function useMoldEngine() {
  const baitMesh = useMoldStore(s => s.baitMesh);
  const moldConfig = useMoldStore(s => s.moldConfig);
  const alignmentConfig = useMoldStore(s => s.alignmentConfig);
  const clampConfig = useMoldStore(s => s.clampConfig);
  const sprueConfig = useMoldStore(s => s.sprueConfig);
  const ventConfig = useMoldStore(s => s.ventConfig);
  const setGeneratedMold = useMoldStore(s => s.setGeneratedMold);
  const setIsGenerating = useMoldStore(s => s.setIsGenerating);
  const setValidationResult = useMoldStore(s => s.setValidationResult);

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
      } catch (err) {
        console.error('[useMoldEngine] Generation failed:', err);
      }
      setIsGenerating(false);
    }, 400);

    return () => clearTimeout(timerRef.current);
  }, [baitMesh, moldConfig, alignmentConfig, clampConfig, sprueConfig, ventConfig,
    setGeneratedMold, setIsGenerating, setValidationResult]);
}
