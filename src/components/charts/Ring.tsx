import type { ReactNode } from 'react';

export interface RingProps {
  /** Percent; may exceed 100 (the arc stops at a full circle). */
  value: number;
  size: number;
  thickness: number;
  color: string;
  /** The circle under the arc: the page's track, or the block's glass for a ring on the block. */
  track?: string;
  /** Read out by screen readers in place of the ring and anything inside it. */
  label: string;
  /** Shown in the middle. */
  children?: ReactNode;
}

export function Ring({
  value,
  size,
  thickness,
  color,
  track = 'var(--color-track)',
  label,
  children,
}: RingProps) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const centre = size / 2;
  return (
    <div role="img" aria-label={label} className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true" focusable="false" className="-rotate-90">
        <circle cx={centre} cy={centre} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {pct > 0 && (
          <circle
            cx={centre}
            cy={centre}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
          />
        )}
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 grid place-items-center">{children}</div>
      )}
    </div>
  );
}
