import { useState, useRef, useCallback, useEffect } from 'react';
import { T } from '../../theme';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step, unit, disabled, onChange }: SliderProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(value));
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setInputVal(String(value)); }, [value]);

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setInputVal(String(v));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 300);
  }, [onChange]);

  const commitInput = useCallback(() => {
    setEditing(false);
    const v = Math.min(max, Math.max(min, parseFloat(inputVal) || min));
    setInputVal(String(v));
    onChange(v);
  }, [inputVal, min, max, onChange]);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ marginBottom: 12, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: T.textMuted }}>{label}</span>
        {editing ? (
          <input
            type="number"
            value={inputVal}
            min={min} max={max} step={step}
            onChange={e => setInputVal(e.target.value)}
            onBlur={commitInput}
            onKeyDown={e => e.key === 'Enter' && commitInput()}
            autoFocus
            style={{ width: 60, background: T.bgInput, border: `1px solid ${T.gold}`, borderRadius: 3,
              color: T.text, fontFamily: 'monospace', fontSize: 12, padding: '1px 4px', textAlign: 'right' }}
          />
        ) : (
          <span
            onClick={() => !disabled && setEditing(true)}
            style={{ fontFamily: 'monospace', fontSize: 12, color: T.text, cursor: 'pointer' }}
          >
            {value % 1 === 0 ? value : value.toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)} {unit}
          </span>
        )}
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={handleSlider} disabled={disabled}
        style={{ width: '100%', height: 4, appearance: 'none', background:
          `linear-gradient(to right, ${T.gold} ${pct}%, ${T.bgSurface} ${pct}%)`,
          borderRadius: 2, outline: 'none', cursor: 'pointer' }}
      />
    </div>
  );
}
