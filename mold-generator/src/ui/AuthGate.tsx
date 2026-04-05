import { T } from '../theme';
import { useAuthStore } from '../store/authStore';

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0,
  backgroundColor: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};

const card: React.CSSProperties = {
  background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8,
  padding: 40, textAlign: 'center', maxWidth: 420,
};

const btnBase: React.CSSProperties = {
  padding: '10px 24px', margin: '8px 6px 0', border: 'none', borderRadius: 4,
  fontFamily: T.font, fontSize: 11, cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const setAuth = useAuthStore(s => s.setAuthenticated);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {!isAuth && (
        <div style={overlay}>
          <div style={card}>
            <h2 style={{
              color: T.textBright, fontSize: 16, fontStyle: 'italic',
              fontWeight: 400, marginBottom: 8, fontFamily: T.font,
            }}>
              Create a Free Account
            </h2>
            <p style={{
              fontSize: 11, color: T.textMuted, textTransform: 'uppercase',
              letterSpacing: 1.5, marginBottom: 24, fontFamily: T.font,
            }}>
              DESIGN • PREVIEW • EXPORT
            </p>
            <button
              style={{ ...btnBase, background: T.gold, color: T.bgDeep }}
              onClick={() => setAuth(true)}
            >
              Create Account
            </button>
            <button
              style={{ ...btnBase, background: T.bgSurface, color: T.text, border: `1px solid ${T.border}`, fontWeight: 400 }}
              onClick={() => setAuth(true)}
            >
              Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
