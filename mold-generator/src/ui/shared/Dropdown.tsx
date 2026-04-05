import { T } from '../../theme';

interface DropdownProps {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function Dropdown({ label, options, value, onChange }: DropdownProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => (e.target.style.borderColor = T.gold)}
        onBlur={e => (e.target.style.borderColor = T.border)}
        style={{ width: '100%', padding: '6px 8px', background: T.bgInput, border: `1px solid ${T.border}`,
          borderRadius: 3, color: T.text, fontFamily: 'monospace', fontSize: 12, outline: 'none',
          cursor: 'pointer' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
