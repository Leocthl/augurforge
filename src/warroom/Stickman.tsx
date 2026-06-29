/**
 * Stickman.tsx — a minimal SVG stick figure for a war-room agent. [OWNER: B / warroom]
 * No sprites; state drives the CSS (idle dim, thinking bob+glow, done settled).
 */
interface Props {
  color: string;
  state: 'idle' | 'thinking' | 'done';
}

export function Stickman({ color, state }: Props) {
  return (
    <svg className={`stickman stickman-${state}`} viewBox="0 0 44 74" width="44" height="74" aria-hidden>
      <circle cx="22" cy="11" r="8.5" fill="none" stroke={color} strokeWidth="2.6" />
      <line x1="22" y1="19.5" x2="22" y2="46" stroke={color} strokeWidth="2.6" />
      <line x1="22" y1="26" x2="9" y2="36" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <line x1="22" y1="26" x2="35" y2="36" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <line x1="22" y1="46" x2="11" y2="66" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <line x1="22" y1="46" x2="33" y2="66" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}