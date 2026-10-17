import { cn } from '@/lib/cn';

export interface StackedBarsProps {
  /** What the bars show ("Income per month"): the name of the group of bars for screen readers. */
  label: string;
  /**
   * One per period, oldest first. `label` is the visible caption ("OCT"), `name` what a screen
   * reader hears ("October 2026"). `parts` stack from the bottom up in the order given, each in
   * its own CSS colour; a part of nothing is left out.
   */
  bars: Array<{
    label: string;
    name: string;
    current: boolean;
    parts: Array<{ key: string; amount: number; color: string }>;
  }>;
  selected: number | null;
  onSelect(index: number | null): void;
  formatAmount(minor: number): string;
}

/** The tallest bar's height in px; the row also holds the captions (11px: twelve fit a 375px phone). */
const TALLEST = 100;
const SHORTEST = 6;
/** A part shrinks no further than this, so a $13 dividend beside a $4,200 salary still shows. */
const THINNEST = 4;
/** The space between stacked parts. */
const GAP = 2;

export function StackedBars({ label, bars, selected, onSelect, formatAmount }: StackedBarsProps) {
  const totals = bars.map((b) => b.parts.reduce((sum, p) => sum + p.amount, 0));
  const biggest = Math.max(0, ...totals);
  return (
    <div role="group" aria-label={label} className="flex h-[130px] items-end">
      {bars.map((bar, i) => {
        const total = totals[i]!;
        const shown = bar.parts.filter((p) => p.amount > 0);
        // The gaps come out of the bar's height, so the tallest bar is TALLEST tall, parts and gaps.
        const room = (total / biggest) * TALLEST - GAP * (shown.length - 1);
        return (
          <button
            key={i}
            type="button"
            aria-label={`${bar.name}: ${formatAmount(total)}`}
            aria-pressed={i === selected}
            onClick={() => onSelect(i === selected ? null : i)}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 text-[11px] font-bold"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex w-3.5 flex-col-reverse gap-0.5 motion-safe:transition-opacity motion-safe:duration-150',
                selected !== null && i !== selected && 'opacity-40',
                total === 0 && 'bg-track rounded-full',
              )}
              style={total === 0 ? { height: SHORTEST } : undefined}
            >
              {shown.map((part) => (
                <span
                  key={part.key}
                  className="block rounded-full"
                  style={{
                    backgroundColor: part.color,
                    height: Math.max(THINNEST, (part.amount / total) * room),
                  }}
                />
              ))}
            </span>
            <span aria-hidden="true" className={bar.current ? 'text-text' : 'text-muted'}>
              {bar.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
