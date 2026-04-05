import { T } from '../../theme';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
      opacity: disabled ? 0.4 : 1 }}>
      <span style={{ fontSize: 13, color: T.textMuted }}>{label}</span>
      <div
        onClick={() => !disabled && onChange(!checked)}
        style={{ width: 32, height: 16, borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
          background: checked ? T.goldDim : T.bgSurface, transition: 'background 0.2s', position: 'relative',
          border: '1px solid ' + (checked ? T.gold : T.border) }}
      >
        <div style={{ width: 10, height: 10, borderRadius: 5,
          background: checked ? T.gold : T.textMuted,
          position: 'absolute', top: 2, left: checked ? 18 : 2, transition: 'left 0.2s, background 0.2s' }} />
      </div>
    </div>
  );
}
