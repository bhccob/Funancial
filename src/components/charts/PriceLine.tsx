import { useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';

export interface PricePoint {
  date: string;
  /** In any one unit (the holding's page uses minor units of the profile currency). */
  value: number;
}

export interface PriceLineProps {
  /** Oldest first, at least two. */
  points: PricePoint[];
  /** What was paid for one share, in the same unit as the points; drawn as a dashed line. */
  paid: number;
  formatValue(value: number): string;
  formatDate(date: string): string;
  /** Read out by screen readers in place of the chart. */
  label: string;
}

/** Room in percent above the line for the latest price, and below it for the dot and the labels. */
const TOP = 18;
const BOTTOM = 12;

/**
 * A price over time with a dashed line at what was paid and a dot where it starts. Touching or
 * hovering the chart reads out a close's day and price; a keyboard walks the closes with the arrows.
 * The drawing stretches to its box, so only the text (labels, read-out) is outside the SVG.
 */
export function PriceLine({ points, paid, formatValue, formatDate, label }: PriceLineProps) {
  const [active, setActive] = useState<number | null>(null);
  const last = points.length - 1;
  const values = points.map((p) => p.value);
  const low = Math.min(...values, paid);
  const span = Math.max(...values, paid) - low;
  const round = (n: number) => Math.round(n * 100) / 100;
  // Percent of the box from the top; a flat series sits in the middle.
  const yOf = (value: number) =>
    round(TOP + (span === 0 ? 0.5 : 1 - (value - low) / span) * (100 - TOP - BOTTOM));
  const xOf = (i: number) => round((i / last) * 100);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)} ${yOf(p.value)}`).join(' ');
  const paidY = yOf(paid);
  const startY = yOf(values[0]!);

  function point(e: PointerEvent<HTMLElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const i = Math.round(((e.clientX - box.left) / box.width) * last);
    setActive(Math.min(last, Math.max(0, i)));
  }

  const shown = active === null ? undefined : points[active];
  const at = active ?? last;
  const [markX, markY] = [xOf(at), yOf(values[at]!)];

  return (
    <div className="has-[:focus-visible]:outline-focus rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4">
      <p className="text-text min-h-5 text-[13.5px] font-extrabold tabular-nums">
        {shown && `${formatDate(shown.date)} · ${formatValue(shown.value)}`}
      </p>
      <div
        role="img"
        aria-label={label}
        className="relative mt-1 h-40 touch-pan-y"
        onPointerDown={point}
        onPointerMove={point}
        onPointerLeave={(e) => {
          // A finger that lifts leaves its price on show; a mouse that moves away takes it off.
          if (e.pointerType === 'mouse') setActive(null);
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          <line
            x1={0}
            x2={100}
            y1={paidY}
            y2={paidY}
            stroke="var(--color-text-muted)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* A zero-length stroke with round caps is a dot that stays round when the box stretches. */}
          <path
            d={`M0 ${startY} L0 ${startY}`}
            stroke="var(--color-text)"
            strokeWidth={9}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {active !== null && (
            <>
              <path
                d={`M${markX} 0 L${markX} 100`}
                stroke="var(--color-border-strong)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M${markX} ${markY} L${markX} ${markY}`}
                stroke="var(--color-text)"
                strokeWidth={12}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        <span
          aria-hidden="true"
          className={cn(
            'text-muted absolute left-0 text-xs font-bold',
            // On the side of the dashed line the chart does not start on, so it stays off the line.
            values[0]! >= paid ? 'translate-y-1.5' : '-translate-y-[calc(100%+6px)]',
          )}
          style={{ top: `${paidY}%` }}
        >
          {`You bought · ${formatValue(paid)}`}
        </span>
        <span
          aria-hidden="true"
          className="text-text absolute right-0 -translate-y-[calc(100%+8px)] text-xs font-extrabold tabular-nums"
          style={{ top: `${yOf(values[last]!)}%` }}
        >
          {formatValue(values[last]!)}
        </span>
      </div>
      <input
        type="range"
        className="sr-only"
        aria-label="Price on a day"
        min={0}
        max={last}
        step={1}
        value={at}
        aria-valuetext={`${formatDate(points[at]!.date)}: ${formatValue(values[at]!)}`}
        onChange={(e) => setActive(Number(e.target.value))}
        onFocus={() => setActive((a) => a ?? last)}
        onBlur={() => setActive(null)}
      />
    </div>
  );
}
