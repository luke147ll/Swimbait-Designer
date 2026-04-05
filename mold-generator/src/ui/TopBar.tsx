import { T } from '../theme';
import { useMoldStore } from '../store/moldStore';
import { useAuthStore } from '../store/authStore';

export function TopBar() {
  const fileName = useMoldStore(s => s.baitFileName);
  const isAuth = useAuthStore(s => s.isAuthenticated);

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

      {/* Right: avatar (authenticated) or empty placeholder */}
      <div style={{ width: 48, display: 'flex', justifyContent: 'flex-end' }}>
        {isAuth && (
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: T.bgSurface, border: `1px solid ${T.goldDim}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: T.textMuted, fontFamily: T.font,
            flexShrink: 0,
          }}>
            LU
          </div>
        )}
      </div>

    </div>
  );
}
