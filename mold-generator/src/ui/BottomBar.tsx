import { T } from '../theme';
import { useMoldStore } from '../store/moldStore';

export function BottomBar() {
  const validation = useMoldStore(s => s.validationResult);
  const lastGen = useMoldStore(s => s.lastGeneratedAt);
  const isGenerating = useMoldStore(s => s.isGenerating);

  const errors = validation?.errors.length ?? 0;
  const warnings = validation?.warnings.length ?? 0;
  const valid = validation?.valid ?? true;

  const dotColor = !validation
    ? T.textDim
    : valid
      ? (warnings > 0 ? T.yellow : T.greenBright)
      : T.redBright;

  const statusText = !validation
    ? 'Idle'
    : valid
      ? (warnings > 0 ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'Ready')
      : `${errors} error${errors > 1 ? 's' : ''} — fix before export`;

  return (
    <div style={{
      height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', background: T.bgDeep, borderTop: `1px solid ${T.border}`,
      flexShrink: 0, fontSize: 11, color: T.textDim, fontFamily: T.font,
    }}>

      {/* Left: status dot + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: dotColor, flexShrink: 0 }} />
        <span>{statusText}</span>
      </div>

      {/* Right: generation time */}
      <span style={{ color: T.textDim }}>
        {isGenerating ? 'Generating...' : lastGen ? 'Generated' : ''}
      </span>

    </div>
  );
}
