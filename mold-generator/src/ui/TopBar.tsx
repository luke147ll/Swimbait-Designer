import { T } from '../theme';
import { useMoldStore } from '../store/moldStore';

export function TopBar() {
  const fileName = useMoldStore(s => s.baitFileName);

  return (
    <div style={{
      height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', background: T.bgPanel, borderBottom: `1px solid ${T.border}`,
      flexShrink: 0,
    }}>

      {/* Left: app label */}
      <div style={{
        fontSize: 11, color: T.textMuted, textTransform: 'uppercase',
        letterSpacing: 1.5, fontFamily: T.font,
      }}>
        MOLD GENERATOR V1.0
      </div>

      {/* Center: title + optional filename */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{
          fontSize: 16, fontStyle: 'italic', color: T.textBright, fontFamily: T.font,
        }}>
          Swimbait Designer
        </span>
        {fileName && (
          <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.font }}>
            {fileName}
          </span>
        )}
      </div>

      {/* Right: placeholder */}
      <div style={{ width: 48 }} />

    </div>
  );
}
