import { useState } from 'react';
import type { Slice } from '@/domain/charts';
import { cn } from '@/lib/cn';
import { sliceColors } from './colors';

/** The space between neighbouring arcs, in px along the ring. */
const GAP = 3;
/** A slice gets its percentage written on the pie from this share of the pie up; smaller ones keep it to the legend. */
const LABEL_MIN_SHARE = 0.06;
/** How far a percentage stands off the ring, and the room around the donut that keeps one on the screen. */
const LABEL_GAP = 4;
const LABEL_ROOM_X = 28;
const LABEL_ROOM_Y = 16;

export interface DonutProps {
  slices: Slice[];
  size: number;
  thickness: number;
  formatAmount(minor: number): string;
  /** The centre while nothing is selected, and for an empty donut. */
  idle: { value: string; label: string };
  /** A small label over the centre figure, kept while a slice is selected ("Spent"). */
  caption?: string;
  selected: number | null;
  onSelect(index: number | null): void;
  /** Write each slice's share just outside the ring (slices of 6% or more); the donut then takes room for it. */
  showPercent?: boolean;
}

export function Donut({
  slices,
  size,
  thickness,
  formatAmount,
  idle,
  caption,
  selected,
  onSelect,
  showPercent = false,
}: DonutProps) {
  const [focused, setFocused] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.amount), 0);
  const drawn = total > 0 ? slices : [];
  const colors = sliceColors(drawn);
  const chosen = selected !== null ? drawn[selected] : undefined;
  const pct = (slice: Slice) => Math.round((Math.max(0, slice.amount) / total) * 100);

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const centre = size / 2;
  // Where each arc starts along the ring, how long it is once the gap is taken off, and where its middle points.
  const arcs = drawn.map((slice, i) => {
    const before = drawn.slice(0, i).reduce((sum, s) => sum + Math.max(0, s.amount), 0);
    const amount = Math.max(0, slice.amount);
    return {
      dash: `${Math.max(0, (amount / total) * circumference - (drawn.length > 1 ? GAP : 0))} ${circumference}`,
      offset: -(before / total) * circumference,
      share: amount / total,
      // Clockwise from the top, where the first arc starts.
      mid: ((before + amount / 2) / total) * 2 * Math.PI,
    };
  });
  const labelRadius = r + thickness / 2 + LABEL_GAP;

  const toggle = (i: number) => onSelect(i === selected ? null : i);
  const big = size >= 200;
  // The hole of a small donut (92px at 120) is too narrow for an exact amount at 19px.
  const small = size < 150;
  const focusedArc = focused !== null ? arcs[focused] : undefined;

  return (
    <div
      className="relative flex-none"
      style={{
        width: size,
        height: size,
        margin: showPercent ? `${LABEL_ROOM_Y}px ${LABEL_ROOM_X}px` : undefined,
      }}
    >
      <svg
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        className="-rotate-90 overflow-visible"
      >
        <circle
          cx={centre}
          cy={centre}
          r={r}
          fill="none"
          stroke="var(--color-track)"
          strokeWidth={thickness}
        />
        {focusedArc && (
          // The arcs are tapped with a finger; the hidden buttons below are what a keyboard reaches.
          <circle
            cx={centre}
            cy={centre}
            r={r}
            fill="none"
            stroke="var(--color-focus)"
            strokeWidth={thickness + 6}
            strokeDasharray={focusedArc.dash}
            strokeDashoffset={focusedArc.offset}
          />
        )}
        {drawn.map((slice, i) => (
          <circle
            key={slice.key}
            cx={centre}
            cy={centre}
            r={r}
            fill="none"
            stroke={colors[i]}
            strokeWidth={thickness}
            strokeDasharray={arcs[i]!.dash}
            strokeDashoffset={arcs[i]!.offset}
            className="cursor-pointer motion-safe:transition-opacity motion-safe:duration-150"
            style={{ opacity: selected === null || selected === i ? 1 : 0.25 }}
            onClick={() => toggle(i)}
          />
        ))}
      </svg>
      {showPercent &&
        drawn.map((slice, i) => {
          const { share, mid } = arcs[i]!;
          if (share < LABEL_MIN_SHARE) return null;
          const [x, y] = [Math.sin(mid), -Math.cos(mid)];
          return (
            <span
              key={slice.key}
              aria-hidden="true"
              className="text-text pointer-events-none absolute text-xs leading-none font-extrabold tabular-nums"
              style={{
                left: centre + labelRadius * x,
                top: centre + labelRadius * y,
                // The label stands on the outside of its point, so it never lands on the ring.
                transform: `translate(${-50 + 50 * x}%, ${-50 + 50 * y}%)`,
              }}
            >
              {`${pct(slice)}%`}
            </span>
          );
        })}
      <div className="pointer-events-none absolute inset-0 grid place-content-center px-2 text-center">
        {caption && (
          <span className={cn('text-muted font-bold', big ? 'text-[13px]' : 'text-xs')}>
            {caption}
          </span>
        )}
        <b
          className={cn(
            'font-extrabold',
            big ? 'text-[28px]' : small ? 'text-[15px]' : 'text-[19px]',
          )}
        >
          {chosen ? formatAmount(chosen.amount) : idle.value}
        </b>
        <span className={cn('text-muted font-bold', big ? 'text-[13px]' : 'text-xs')}>
          {chosen ? `${chosen.label} · ${pct(chosen)}%` : idle.label}
        </span>
      </div>
      <ul className="sr-only">
        {drawn.map((slice, i) => (
          <li key={slice.key}>
            <button
              type="button"
              aria-label={`${slice.label}, ${formatAmount(slice.amount)}, ${pct(slice)}%`}
              aria-pressed={i === selected}
              onClick={() => toggle(i)}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused(null)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface DonutLegendProps {
  slices: Slice[];
  formatAmount(minor: number): string;
  selected: number | null;
  onSelect(index: number | null): void;
  /** Add each slice's share of the whole, at the end of its row; the amount then sits under the name. */
  showPercent?: boolean;
}

export function DonutLegend({
  slices,
  formatAmount,
  selected,
  onSelect,
  showPercent = false,
}: DonutLegendProps) {
  const colors = sliceColors(slices);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.amount), 0);
  return (
    <ul className="min-w-0 flex-1">
      {slices.map((slice, i) => {
        const on = i === selected;
        const amountTone = on ? 'text-text font-extrabold' : 'text-muted font-bold';
        return (
          <li key={slice.key} className="border-border border-b last:border-b-0">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : i)}
              className="flex min-h-11 w-full items-center gap-2.5 py-1.5 text-left text-[13.5px]"
            >
              <span
                aria-hidden="true"
                className="size-[9px] flex-none rounded-full"
                style={{ backgroundColor: colors[i] }}
              />
              {showPercent ? (
                // Room is tight beside a donut with percentages on it, so the amount goes under the name.
                <>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', on ? 'font-extrabold' : 'font-bold')}>
                      {slice.label}
                    </span>
                    <span className={cn('block text-[12.5px]', amountTone)}>
                      {formatAmount(slice.amount)}
                    </span>
                  </span>
                  <span className="text-muted flex-none font-bold tabular-nums">
                    {`${total > 0 ? Math.round((Math.max(0, slice.amount) / total) * 100) : 0}%`}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={cn('min-w-0 flex-1 truncate', on ? 'font-extrabold' : 'font-bold')}
                  >
                    {slice.label}
                  </span>
                  <span className={cn('flex-none', amountTone)}>{formatAmount(slice.amount)}</span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
