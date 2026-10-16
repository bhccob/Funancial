import { zone, type Zone } from '@/domain/advisor';

const ZONE_NAME: Record<Zone, string> = { skip: 'Skip', wait: 'Wait', buy: 'Buy' };

// The gauge is a half circle of radius R about (C, C), read from the left (0) over the top to the right (100).
const C = 100;
const R = 80;
const WIDTH = 14;
/** The point on the arc at a reading of `v`. */
const at = (v: number) => {
  const a = Math.PI * (1 - v / 100);
  return `${(C + R * Math.cos(a)).toFixed(2)} ${(C - R * Math.sin(a)).toFixed(2)}`;
};
// Skip is 0–33, Wait 34–66, Buy 67–100: each zone's arc ends halfway to the next, with a hairline gap.
const ARCS: Array<{ zone: Zone; from: number; to: number; color: string }> = [
  { zone: 'skip', from: 0, to: 33.5, color: 'var(--color-danger)' },
  { zone: 'wait', from: 33.5, to: 66.5, color: 'var(--color-warning)' },
  { zone: 'buy', from: 66.5, to: 100, color: 'var(--color-accent)' },
];

/**
 * How much of a buy it is, 0 (skip it) to 100 (buy it): a gauge in three zones with a marker, and
 * the reading under it. It is a `meter` for assistive tech, which hears the zone as well.
 */
export function BuyMeter({ meter }: { meter: number }) {
  const z = zone(meter);
  return (
    <div
      role="meter"
      aria-label="Buy meter"
      aria-valuenow={meter}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${meter}% a buy, ${ZONE_NAME[z]} zone`}
      className="mx-auto w-full max-w-72"
    >
      <div className="relative">
        <svg viewBox="0 0 200 112" aria-hidden="true" focusable="false" className="block w-full">
          {ARCS.map((a) => (
            <path
              key={a.zone}
              d={`M ${at(a.from)} A ${R} ${R} 0 0 1 ${at(a.to)}`}
              fill="none"
              stroke={a.color}
              strokeWidth={WIDTH}
              opacity={a.zone === z ? 1 : 0.35}
            />
          ))}
          {/* Drawn at 0, then turned about the centre to the reading. */}
          <g
            data-testid="meter-marker"
            className="motion-safe:animate-meter-sweep"
            style={{ transform: `rotate(${meter * 1.8}deg)`, transformOrigin: `${C}px ${C}px` }}
          >
            <circle
              cx={C - R}
              cy={C}
              r={WIDTH / 2 + 3}
              fill="var(--color-bg)"
              stroke="var(--color-text)"
              strokeWidth={3}
            />
          </g>
        </svg>
        <p className="absolute inset-x-0 bottom-0 text-center leading-none">
          <span className="block text-[34px] font-extrabold tracking-[-0.035em] tabular-nums">
            {meter}%
          </span>{' '}
          <span className="text-muted text-[13px] font-bold">a buy</span>
        </p>
      </div>
      <div
        data-zones
        aria-hidden="true"
        className="text-muted mt-1 flex justify-between text-[13px] font-bold"
      >
        <span>Skip</span>
        <span>Wait</span>
        <span>Buy</span>
      </div>
    </div>
  );
}
