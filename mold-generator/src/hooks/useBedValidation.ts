import { useEffect, useRef } from 'react';
import { useMoldStore } from '../store/moldStore';
import { usePrinterStore } from '../store/printerStore';
import { BedValidator } from '../core/validation/BedValidator';

export function useBedValidation() {
  const moldHalfA = useMoldStore(s => s.moldHalfA);
  const moldHalfB = useMoldStore(s => s.moldHalfB);
  const setValidationResult = useMoldStore(s => s.setValidationResult);
  const printer = usePrinterStore(s => s.selectedProfile);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!moldHalfA) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const validator = new BedValidator();
      const result = validator.validate(moldHalfA, moldHalfB, printer);
      setValidationResult(result);
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [moldHalfA, moldHalfB, printer, setValidationResult]);
}
