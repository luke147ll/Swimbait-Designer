import { useState } from 'react';
import { T } from '../../theme';

interface AccordionPanelProps {
  title: string;
  defaultExpanded?: boolean;
  locked?: boolean;
  children: React.ReactNode;
}

export function AccordionPanel({ title, defaultExpanded = false, locked = false, children }: AccordionPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div style={{ borderBottom: `1px solid ${T.borderSubtle}` }}>
      <div
        onClick={() => !locked && setExpanded(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', cursor: locked ? 'default' : 'pointer', userSelect: 'none',
          background: 'transparent',
          borderLeft: expanded && !locked ? `2px solid ${T.gold}` : '2px solid transparent' }}
      >
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: locked ? T.textDim : expanded ? T.gold : T.textMuted,
          textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          {locked && '🔒 '}{title}
        </span>
        {!locked && (
          <span style={{ color: T.textDim, fontSize: 12, transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s' }}>▼</span>
        )}
      </div>
      <div style={{ maxHeight: expanded && !locked ? 1000 : 0, overflow: 'hidden',
        transition: 'max-height 0.2s ease', padding: expanded && !locked ? '12px 16px 16px' : '0 16px' }}>
        {children}
      </div>
    </div>
  );
}
