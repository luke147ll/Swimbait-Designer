import { useCallback, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { T } from '../../theme';
import { useMoldStore } from '../../store/moldStore';
import { getTransferToken, transferBaitFromAPI } from '../../core/BaitBridge';

type ImportOrientation = 'x_length' | 'y_length' | 'z_length';

const ROTATIONS: Record<ImportOrientation, [number, number, number]> = {
  x_length: [0, 0, 0],            // X=length already — no rotation
  y_length: [0, 0, Math.PI / 2],  // Y=length → rotate 90° around Z so Y→X
  z_length: [0, -Math.PI / 2, 0], // Z=length → rotate -90° around Y so Z→X
};

export function BaitLoader() {
  const setBaitMesh = useMoldStore(s => s.setBaitMesh);
  const setBaitManifold = useMoldStore(s => s.setBaitManifold);
  const baitFileName = useMoldStore(s => s.baitFileName);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [rawGeo, setRawGeo] = useState<THREE.BufferGeometry | null>(null);
  const [rawName, setRawName] = useState<string>('');
  const [orientation, setOrientation] = useState<ImportOrientation>('x_length');

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

  const applyOrientation = useCallback((geo: THREE.BufferGeometry, orient: ImportOrientation, name: string) => {
    const clone = geo.clone();
    const rot = ROTATIONS[orient];
    const mat = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    clone.applyMatrix4(mat);
    clone.computeBoundingBox();
    clone.center();
    clone.computeVertexNormals();
    setBaitMesh(clone, name);
    setBaitManifold(null);
  }, [setBaitMesh, setBaitManifold]);

  const handleOrientChange = useCallback((orient: ImportOrientation) => {
    setOrientation(orient);
    if (rawGeo) applyOrientation(rawGeo, orient, rawName);
  }, [rawGeo, rawName, applyOrientation]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'stl') {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const buffer = await file.arrayBuffer();
      const geo = new STLLoader().parse(buffer);
      setRawGeo(geo);
      setRawName(file.name);
      applyOrientation(geo, orientation, file.name);
    }
    e.target.value = '';
  }, [orientation, applyOrientation]);

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

      {rawGeo && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Length axis in STL
          </div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
            {([['x_length', 'X'], ['y_length', 'Y'], ['z_length', 'Z']] as [ImportOrientation, string][]).map(([o, label]) => (
              <button key={o} onClick={() => handleOrientChange(o)}
                style={{ flex: 1, padding: '5px 0', fontSize: 11, cursor: 'pointer', border: 'none', borderRadius: 3,
                  fontFamily: T.font, fontWeight: orientation === o ? 700 : 400,
                  background: orientation === o ? T.gold : T.bgSurface,
                  color: orientation === o ? T.bgDeep : T.textMuted }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: T.textDim }}>
            Mold expects: X=length, Y=height, Z=width
          </div>
        </div>
      )}

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
