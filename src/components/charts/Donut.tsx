import { useState, type ReactNode } from 'react';
import type { Slice } from '@/domain/charts';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { sliceColors } from './colors';
import { BADGE, badgeWidth, LABEL, layoutLabels } from './labelLayout';

/** The space between neighbouring arcs, in px along the ring. */
const GAP = 3;

/**
 * A badge-style label: strong glass in the text colour, the share in 12px bold. The share is held at
 * 4.5:1 on the glass over the page and every shape behind it, in every theme and both modes
 * (tests/unit/tokens.test.ts reads this string). Its size is the layout's (`BADGE`), set inline.
 */
const PILL =
  'glass-strong text-text pointer-events-none absolute flex items-center rounded-full pr-[7px] pl-0.5 text-xs leading-none font-bold tabular-nums';

/** What stands outside the ring for the slice with this key: a logo over a short text such as "27%". */
export interface OutsideLabel {
  key: string;
  logo: ReactNode;
  text: string;
}

export interface DonutProps {
  /** What the donut shows ("Spending by category"): the name of its list of slices for screen readers. */
  label: string;
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
  /**
   * A label for slices (matched by key), just outside the ring at the middle of the slice with a
   * leader line to it. A label that would overlap another is left out, the smaller slice's first.
   * The donut then takes room around it for the labels. With `labelStyle="badge"` they are instead
   * pills with no leader line, and none is left out.
   */
  outsideLabels?: OutsideLabel[];
  /**
   * How the outside labels look. Unset, each is a logo over its text with a leader line to the ring.
   * `"badge"`: a glass pill with the label's `logo` as a 24px round badge and the `text` after it, just
   * outside the slice with no leader line; pills that would meet are nudged apart along the ring.
   */
  labelStyle?: 'badge';
  /** The colour of each slice, by position, in place of the chart series (a CSS colour; see `sliceColors`). */
  colors?: readonly string[];
}

export function Donut({
  label,
  slices,
  size,
  thickness,
  formatAmount,
  idle,
  caption,
  selected,
  onSelect,
  outsideLabels,
  labelStyle,
  colors: given,
}: DonutProps) {
  const [focused, setFocused] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.amount), 0);
  const drawn = total > 0 ? slices : [];
  const series = sliceColors(drawn);
  const colors = drawn.map((_, i) => given?.[i] ?? series[i]!);
  const chosen = selected !== null ? drawn[selected] : undefined;
  const pct = (slice: Slice) => Math.round((Math.max(0, slice.amount) / total) * 100);

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const centre = size / 2;
  // Where each arc starts along the ring, and how long it is once the gap is taken off.
  const arcs = drawn.map((slice, i) => {
    const before = drawn.slice(0, i).reduce((sum, s) => sum + Math.max(0, s.amount), 0);
    const amount = Math.max(0, slice.amount);
    return {
      dash: `${Math.max(0, (amount / total) * circumference - (drawn.length > 1 ? GAP : 0))} ${circumference}`,
      offset: -(before / total) * circumference,
    };
  });
  const labelFor = new Map((outsideLabels ?? []).map((l) => [l.key, l]));
  const shares = drawn.map((s) => Math.max(0, s.amount) / total);
  const asked = new Set(drawn.flatMap((s, i) => (labelFor.has(s.key) ? [i] : [])));
  const badge = labelStyle === 'badge';
  const placed = badge ? [] : layoutLabels(shares, size, asked);
  const pills = badge
    ? layoutLabels(shares, size, asked, {
        widths: drawn.map((s) => badgeWidth(labelFor.get(s.key)?.text ?? '')),
      })
    : [];

  const toggle = (i: number) => onSelect(i === selected ? null : i);
  const big = size >= 200;
  // The hole of a small donut (96px at 120, thickness 12) is too narrow for an exact amount at
  // 19px.
  const small = size < 150;
  const focusedArc = focused !== null ? arcs[focused] : undefined;

  return (
    <div
      className="relative flex-none"
      style={{
        width: size,
        height: size,
        margin: !outsideLabels
          ? undefined
          : badge
            ? `${BADGE.lead + BADGE.height}px ${BADGE.reach}px`
            : `${LABEL.lead + LABEL.height}px ${LABEL.lead + LABEL.width}px`,
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
      {placed.length > 0 && (
        // Not under the arcs' rotation, so the lines are in the same px as the label boxes.
        <svg
          width={size}
          height={size}
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          {placed.map(({ index, line }) => (
            <line
              key={drawn[index]!.key}
              {...line}
              stroke="var(--color-text-muted)"
              strokeOpacity={0.6}
              strokeWidth={1.25}
            />
          ))}
        </svg>
      )}
      {pills.map(({ index, box }) => {
        const key = drawn[index]!.key;
        const { logo, text } = labelFor.get(key)!;
        return (
          <div
            key={key}
            data-label={key}
            aria-hidden="true"
            className={PILL}
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          >
            {logo}
            <span className="ml-1">{text}</span>
          </div>
        );
      })}
      {placed.map(({ index, box, above }) => {
        const key = drawn[index]!.key;
        const { logo, text } = labelFor.get(key)!;
        return (
          <div
            key={key}
            data-label={key}
            aria-hidden="true"
            className="text-text pointer-events-none absolute flex flex-col items-center justify-between text-xs leading-none font-extrabold tabular-nums"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          >
            {/* The logo is the part the leader line meets, so it faces the ring. */}
            {above ? (
              <>
                <span>{text}</span>
                {logo}
              </>
            ) : (
              <>
                {logo}
                <span>{text}</span>
              </>
            )}
          </div>
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
      <ul aria-label={label} className="sr-only">
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
  /** A logo, by slice key, that starts its row in place of the colour dot. */
  logos?: Record<string, ReactNode>;
}

export function DonutLegend({
  slices,
  formatAmount,
  selected,
  onSelect,
  showPercent = false,
  logos,
}: DonutLegendProps) {
  const colors = sliceColors(slices);
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.amount), 0);
  return (
    <ul className={cn('min-w-0 flex-1', ROWS)}>
      {slices.map((slice, i) => {
        const on = i === selected;
        const amountTone = on ? 'text-text font-extrabold' : 'text-muted font-bold';
        return (
          <li key={slice.key}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : i)}
              className="flex min-h-11 w-full items-center gap-2.5 py-1.5 text-left text-[13.5px]"
            >
              {logos?.[slice.key] ?? (
                <span
                  aria-hidden="true"
                  className="size-[9px] flex-none rounded-full"
                  style={{ backgroundColor: colors[i] }}
                />
              )}
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
