import { useState } from 'react';
import type { Slice } from '@/domain/charts';
import { cn } from '@/lib/cn';
import { sliceColors } from './colors';

/** The space between neighbouring arcs, in px along the ring. */
const GAP = 3;

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
  // Where each arc starts along the ring, and how long it is once the gap is taken off.
  const arcs = drawn.map((slice, i) => {
    const before = drawn.slice(0, i).reduce((sum, s) => sum + Math.max(0, s.amount), 0);
    const share = (Math.max(0, slice.amount) / total) * circumference;
    return {
      dash: `${Math.max(0, share - (drawn.length > 1 ? GAP : 0))} ${circumference}`,
      offset: -(before / total) * circumference,
    };
  });

  const toggle = (i: number) => onSelect(i === selected ? null : i);
  const big = size >= 200;
  const focusedArc = focused !== null ? arcs[focused] : undefined;

  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
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
      <div className="pointer-events-none absolute inset-0 grid place-content-center px-2 text-center">
        {caption && (
          <span className={cn('text-muted font-bold', big ? 'text-[13px]' : 'text-xs')}>
            {caption}
          </span>
        )}
        <b className={cn('font-extrabold', big ? 'text-[28px]' : 'text-[19px]')}>
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
}

export function DonutLegend({ slices, formatAmount, selected, onSelect }: DonutLegendProps) {
  const colors = sliceColors(slices);
  return (
    <ul className="min-w-0 flex-1">
      {slices.map((slice, i) => {
        const on = i === selected;
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
              <span className={cn('min-w-0 flex-1 truncate', on ? 'font-extrabold' : 'font-bold')}>
                {slice.label}
              </span>
              <span
                className={cn(
                  'flex-none',
                  on ? 'text-text font-extrabold' : 'text-muted font-bold',
                )}
              >
                {formatAmount(slice.amount)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
