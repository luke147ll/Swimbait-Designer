import { useMemo } from 'react';
import * as THREE from 'three';
import { usePrinterStore } from '../../store/printerStore';
import { useMoldStore } from '../../store/moldStore';
import { useViewportStore } from '../../store/viewportStore';

export function BedBoundsIndicator() {
  const profile = usePrinterStore(s => s.selectedProfile);
  const validation = useMoldStore(s => s.validationResult);
  const showBedBounds = useViewportStore(s => s.showBedBounds);

  const isValid = validation?.valid ?? true;
  const color = isValid ? '#c8a84e' : '#aa5555';

  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(profile.usableX, profile.usableY, profile.usableZ);
    return new THREE.EdgesGeometry(box);
  }, [profile.usableX, profile.usableY, profile.usableZ]);

  if (!showBedBounds) return null;

  return (
    <lineSegments geometry={edges} position={[0, 0, 0]}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}
