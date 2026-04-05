import { useCallback, useRef, useState, useEffect } from 'react';
import { T } from '../../theme';
import { useMoldStore } from '../../store/moldStore';
import { createSampleBait, manifoldToThree, initCSG } from '../../core/csg';
import { isBaitInIDB, transferBaitFromIDB } from '../../core/BaitBridge';

export function BaitLoader() {
  const setBaitMesh = useMoldStore(s => s.setBaitMesh);
  const setBaitManifold = useMoldStore(s => s.setBaitManifold);
  const baitFileName = useMoldStore(s => s.baitFileName);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [idbReady, setIdbReady] = useState(false);

  // Check IndexedDB on mount for a pending bait transfer
  useEffect(() => {
    isBaitInIDB().then(ready => {
      setIdbReady(ready);
      // Auto-load if bait is waiting and nothing is loaded yet
      if (ready && !useMoldStore.getState().baitMesh) {
        handleTransfer();
      }
    });
  }, []);

  const handleTransfer = useCallback(async () => {
    setStatus('Loading from designer...');
    const result = await transferBaitFromIDB();
    if (result.success) {
      setStatus('Bait loaded from designer');
      setIdbReady(false);
      setTimeout(() => setStatus(null), 3000);
    } else {
      setStatus(result.error || 'Transfer failed');
    }
  }, []);

  const handleSample = useCallback(async () => {
    await initCSG();
    const baitM = createSampleBait();
    const baitGeo = manifoldToThree(baitM);
    setBaitMesh(baitGeo, 'sample-bait.stl');
    setBaitManifold(baitM);
  }, [setBaitMesh, setBaitManifold]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'stl') {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const buffer = await file.arrayBuffer();
      const geo = new STLLoader().parse(buffer);
      geo.computeBoundingBox();
      geo.center();
      setBaitMesh(geo, file.name);
      setBaitManifold(null);
    }
    e.target.value = '';
  }, [setBaitMesh, setBaitManifold]);

  const btnBase: React.CSSProperties = {
    width: '100%', padding: '8px 0', marginBottom: 6,
    fontSize: 11, cursor: 'pointer', border: 'none', borderRadius: 3,
    fontFamily: T.font, textTransform: 'uppercase', letterSpacing: 1,
    fontWeight: 600, transition: 'background 0.15s',
  };

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
      <div style={{
        fontSize: 11, color: T.gold, textTransform: 'uppercase',
        letterSpacing: 1.5, fontWeight: 700, fontFamily: T.font, marginBottom: 8,
      }}>
        BAIT MESH
      </div>

      {baitFileName && (
        <div style={{ fontSize: 12, color: T.text, fontFamily: T.font, marginBottom: 8, wordBreak: 'break-all' }}>
          {baitFileName}
        </div>
      )}

      {/* Transfer from designer via IndexedDB */}
      {idbReady && (
        <button style={{ ...btnBase, background: T.gold, color: T.bgDeep }} onClick={handleTransfer}>
          ▶ Load from Designer
        </button>
      )}

      {/* Sample bait */}
      <button style={{ ...btnBase, background: idbReady ? T.bgSurface : T.gold, color: idbReady ? T.textMuted : T.bgDeep, border: idbReady ? `1px solid ${T.border}` : 'none' }} onClick={handleSample}>
        Load Sample Bait
      </button>

      {/* Upload STL */}
      <button style={{ ...btnBase, background: T.bgSurface, color: T.textMuted, border: `1px solid ${T.border}` }}
        onClick={() => fileRef.current?.click()}>
        Import STL
      </button>
      <input ref={fileRef} type="file" accept=".stl" style={{ display: 'none' }} onChange={handleFile} />

      {/* Status */}
      {status && (
        <div style={{ fontSize: 11, color: status.includes('failed') || status.includes('error') ? T.redBright : T.greenBright, marginTop: 4 }}>
          {status}
        </div>
      )}
    </div>
  );
}
