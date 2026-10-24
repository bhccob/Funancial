import { useState, type ReactNode } from 'react';
import type { Slice } from '@/domain/charts';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { sliceColors } from './colors';
import { BADGE, badgeWidth, layoutBadges } from './labelLayout';

/** The space between neighbouring arcs, in px along the ring. */
const GAP = 3;

/**
 * An outside label: strong glass in the text colour, the share in 12px bold. The share is held at
 * 4.5:1 on the glass over the page and every shape behind it, in every theme and both modes
 * (tests/unit/tokens.test.ts reads this string). Its box is the layout's, set inline. `pl-0.5`,
 * `pr-[7px]` and the share's `ml-1`, with the 1px edge, are the 3, 8 and 4 of `PILL` in labelLayout.ts.
 */
const PILL =
  'glass-strong text-text pointer-events-none absolute flex items-center rounded-full pr-[7px] pl-0.5 text-xs leading-none font-bold tabular-nums';

/** The centre figure's sizes as classes, written out so that Tailwind finds them. */
const FIGURE_CLASS: Record<number, string> = {
  28: 'text-[28px]',
  24: 'text-[24px]',
  20: 'text-[20px]',
  19: 'text-[19px]',
  15: 'text-[15px]',
};

/** The space either side of the centre figure, in px, that it keeps clear of the ring. */
const FIGURE_MARGIN = 4;

/**
 * The width of a centre figure in em, as the app's font sets it extra-bold (measured at 28px: a digit
 * or a currency sign 0.665em, a point, comma or space 0.28em, a lowercase letter taken as 0.5em). The
 * figure is a string, so a hidden amount, which is one mask whatever it hides, is one width.
 */
function figureEm(text: string): number {
  let em = 0;
  for (const ch of text) em += /[.,\s]/.test(ch) ? 0.28 : /\p{Ll}/u.test(ch) ? 0.5 : 0.665;
  return em;
}

/**
 * The size for the centre figure: the first of `sizes` (biggest first) at which it fits `hole` px
 * with `FIGURE_MARGIN` to spare each side, else the last. It is worked out from the text, as Home's
 * hero does from its amount, so it is the same on every render and in a test.
 */
function fitFigure(text: string, sizes: readonly number[], hole: number): number {
  const em = figureEm(text);
  return sizes.find((px) => em * px <= hole - 2 * FIGURE_MARGIN) ?? sizes[sizes.length - 1]!;
}

/** What stands outside the ring for the slice with this key: a 24px round badge and a short text such as "27%". */
export interface OutsideLabel {
  key: string;
  /** The round badge (`BADGE.disc` px): a company's logo, or its ticker on the slice's colour. */
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
   * A label for slices (matched by key): a glass pill with the label's `logo` as a round badge and
   * its `text` after it, just outside the ring at the middle of the slice, with no leader line.
   * Pills that would meet are nudged apart along the ring and none is left out. The donut then takes
   * room around it for them (`BADGE.reach` at each side, a pill's height above and below).
   */
  outsideLabels?: OutsideLabel[];
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
  const pills = layoutBadges(
    shares,
    size,
    drawn.map((s) => badgeWidth(labelFor.get(s.key)?.text ?? '')),
    asked,
  );

  const toggle = (i: number) => onSelect(i === selected ? null : i);
  const big = size >= 200;
  // The hole of a small donut (96px at 120, thickness 12) is too narrow for an exact amount at
  // 19px.
  const small = size < 150;
  const figure = chosen ? formatAmount(chosen.amount) : idle.value;
  const figurePx = fitFigure(
    figure,
    big ? [28, 24, 20] : small ? [15] : [19],
    size - 2 * thickness,
  );
  const focusedArc = focused !== null ? arcs[focused] : undefined;

  return (
    <div
      className="relative flex-none"
      style={{
        width: size,
        height: size,
        margin: outsideLabels ? `${BADGE.lead + BADGE.height}px ${BADGE.reach}px` : undefined,
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
      <div className="pointer-events-none absolute inset-0 grid place-content-center px-2 text-center">
        {caption && (
          <span className={cn('text-muted font-bold', big ? 'text-[13px]' : 'text-xs')}>
            {caption}
          </span>
        )}
        <b className={cn('font-extrabold', FIGURE_CLASS[figurePx])}>{figure}</b>
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
