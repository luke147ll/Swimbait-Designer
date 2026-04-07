import { useCallback, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { T } from '../../theme';
import { useMoldStore } from '../../store/moldStore';
import { getTransferToken, transferBaitFromAPI } from '../../core/BaitBridge';

type LengthAxis = 'x' | 'y' | 'z';

const AXIS_ROTATIONS: Record<LengthAxis, [number, number, number]> = {
  x: [0, 0, 0],
  y: [0, 0, Math.PI / 2],
  z: [0, -Math.PI / 2, 0],
};

export function BaitLoader() {
  const setBaitMesh = useMoldStore(s => s.setBaitMesh);
  const setBaitManifold = useMoldStore(s => s.setBaitManifold);
  const baitFileName = useMoldStore(s => s.baitFileName);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [rawGeo, setRawGeo] = useState<THREE.BufferGeometry | null>(null);
  const [rawName, setRawName] = useState<string>('');

  // Transform state
  const [lengthAxis, setLengthAxis] = useState<LengthAxis>('x');
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);
  const [scale, setScale] = useState(1.0);

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

  const applyTransform = useCallback((geo: THREE.BufferGeometry, axis: LengthAxis, rx: number, ry: number, rz: number, s: number, name: string) => {
    const clone = geo.clone();
    const mat = new THREE.Matrix4();

    // 1. Axis alignment rotation
    const ar = AXIS_ROTATIONS[axis];
    mat.makeRotationFromEuler(new THREE.Euler(ar[0], ar[1], ar[2]));
    clone.applyMatrix4(mat);

    // 2. Custom rotation (degrees → radians)
    if (rx || ry || rz) {
      mat.makeRotationFromEuler(new THREE.Euler(rx * Math.PI / 180, ry * Math.PI / 180, rz * Math.PI / 180));
      clone.applyMatrix4(mat);
    }

    // 3. Scale
    if (s !== 1.0) {
      clone.scale(s, s, s);
    }

    clone.computeBoundingBox();
    clone.center();
    clone.computeVertexNormals();
    setBaitMesh(clone, name);
    setBaitManifold(null);
  }, [setBaitMesh, setBaitManifold]);

  const refresh = useCallback((axis?: LengthAxis, rx?: number, ry?: number, rz?: number, s?: number) => {
    if (!rawGeo) return;
    applyTransform(rawGeo, axis ?? lengthAxis, rx ?? rotX, ry ?? rotY, rz ?? rotZ, s ?? scale, rawName);
  }, [rawGeo, rawName, lengthAxis, rotX, rotY, rotZ, scale, applyTransform]);

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
      setRotX(0); setRotY(0); setRotZ(0); setScale(1.0);
      applyTransform(geo, lengthAxis, 0, 0, 0, 1.0, file.name);
    }
    e.target.value = '';
  }, [lengthAxis, applyTransform]);

  const btnBase: React.CSSProperties = {
    width: '100%', padding: '8px 0', marginBottom: 6,
    fontSize: 11, cursor: 'pointer', border: 'none', borderRadius: 3,
    fontFamily: T.font, textTransform: 'uppercase', letterSpacing: 1,
    fontWeight: 600, transition: 'background 0.15s',
  };

  const segBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '5px 0', fontSize: 11, cursor: 'pointer', border: 'none', borderRadius: 3,
    fontFamily: T.font, fontWeight: active ? 700 : 400,
    background: active ? T.gold : T.bgSurface,
    color: active ? T.bgDeep : T.textMuted,
  });

  const sliderRow = (label: string, value: number, min: number, max: number, step: number, unit: string, onChange: (v: number) => void) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textMuted, marginBottom: 2 }}>
        <span>{label}</span><span style={{ fontFamily: 'monospace' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ width: '100%' }}
        onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))} />
    </div>
  );

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
        <div style={{ marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Length axis
          </div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {(['x', 'y', 'z'] as LengthAxis[]).map(a => (
              <button key={a} style={segBtn(lengthAxis === a)}
                onClick={() => { setLengthAxis(a); refresh(a); }}>
                {a.toUpperCase()}
              </button>
            ))}
          </div>

          {sliderRow('Rotate X', rotX, -180, 180, 5, '°', v => { setRotX(v); refresh(undefined, v); })}
          {sliderRow('Rotate Y', rotY, -180, 180, 5, '°', v => { setRotY(v); refresh(undefined, undefined, v); })}
          {sliderRow('Rotate Z', rotZ, -180, 180, 5, '°', v => { setRotZ(v); refresh(undefined, undefined, undefined, v); })}
          {sliderRow('Scale', scale, 0.1, 10.0, 0.1, '×', v => { setScale(v); refresh(undefined, undefined, undefined, undefined, v); })}

          <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
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
