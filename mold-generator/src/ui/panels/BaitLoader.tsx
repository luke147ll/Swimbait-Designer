import { useCallback, useRef, useState, useEffect } from 'react';
import { T } from '../../theme';
import { useMoldStore } from '../../store/moldStore';
import { getTransferToken, transferBaitFromAPI } from '../../core/BaitBridge';

export function BaitLoader() {
  const setBaitMesh = useMoldStore(s => s.setBaitMesh);
  const setBaitManifold = useMoldStore(s => s.setBaitManifold);
  const baitFileName = useMoldStore(s => s.baitFileName);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Auto-load from transfer token on mount
  useEffect(() => {
    const token = getTransferToken();
    if (token) {
      setStatus('Loading from designer...');
      transferBaitFromAPI(token).then(result => {
        if (result.success) {
          setStatus('Bait loaded from designer');
          setTimeout(() => setStatus(null), 3000);
        } else {
          setStatus(result.error || 'Transfer failed');
        }
      });
    }
  }, []);

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

      <button style={{ ...btnBase, background: T.bgSurface, color: T.textMuted, border: `1px solid ${T.border}` }}
        onClick={() => fileRef.current?.click()}>
        Import STL
      </button>
      <input ref={fileRef} type="file" accept=".stl" style={{ display: 'none' }} onChange={handleFile} />

      {status && (
        <div style={{ fontSize: 11, marginTop: 4,
          color: status.includes('failed') || status.includes('error') || status.includes('expired')
            ? T.redBright : status.includes('Loading') ? T.gold : T.greenBright }}>
          {status}
        </div>
      )}
    </div>
  );
}
