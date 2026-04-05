import { useCallback, useRef, useState } from 'react';
import { T } from '../../theme';
import { useMoldStore } from '../../store/moldStore';
import { createSampleBait, manifoldToThree, initCSG } from '../../core/csg';
import { transferBaitToMoldGenerator, isBaitReady, getBaitDimensions } from '../../core/BaitBridge';

export function BaitLoader() {
  const setBaitMesh = useMoldStore(s => s.setBaitMesh);
  const setBaitManifold = useMoldStore(s => s.setBaitManifold);
  const baitFileName = useMoldStore(s => s.baitFileName);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const designerReady = isBaitReady();
  const dims = designerReady ? getBaitDimensions() : null;

  const handleTransfer = useCallback(async () => {
    setStatus('Transferring...');
    const result = await transferBaitToMoldGenerator();
    setStatus(result.success ? 'Bait loaded from designer' : result.error || 'Transfer failed');
    if (result.success) setTimeout(() => setStatus(null), 3000);
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

      {/* Load from designer — shown when bodyMesh is available on window */}
      {designerReady && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>
            Designed bait available
            {dims && <span style={{ color: T.text }}> — {dims.length.toFixed(1)}" × {dims.width.toFixed(1)}" × {dims.height.toFixed(1)}"</span>}
          </div>
          <button style={{ ...btnBase, background: T.gold, color: T.bgDeep }} onClick={handleTransfer}>
            ▶ Load from Designer
          </button>
        </div>
      )}

      {/* Divider */}
      {designerReady && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', color: T.textDim, fontSize: 10 }}>
          <div style={{ flex: 1, height: 1, background: T.borderSubtle }} />
          <span>or</span>
          <div style={{ flex: 1, height: 1, background: T.borderSubtle }} />
        </div>
      )}

      {/* Sample bait */}
      <button style={{ ...btnBase, background: designerReady ? T.bgSurface : T.gold, color: designerReady ? T.textMuted : T.bgDeep, border: designerReady ? `1px solid ${T.border}` : 'none' }} onClick={handleSample}>
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
