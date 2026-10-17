import { cn } from '@/lib/cn';

export interface DayBarsProps {
  /** What the bars show ("Spending per day"): the name of the group of bars for screen readers. */
  label: string;
  /** One per day, oldest first. `label` is the visible caption ("Sat", "Today"). */
  days: Array<{ label: string; amount: number; isToday: boolean }>;
  selected: number | null;
  onSelect(index: number | null): void;
  formatAmount(minor: number): string;
}

/** The tallest bar's height in px; the row also holds the captions. */
const TALLEST = 100;
const SHORTEST = 6;

export function DayBars({ label, days, selected, onSelect, formatAmount }: DayBarsProps) {
  const busiest = Math.max(0, ...days.map((d) => d.amount));
  return (
    <div role="group" aria-label={label} className="flex h-[130px] items-end">
      {days.map((day, i) => {
        const on = day.isToday || i === selected;
        const height =
          busiest > 0 ? Math.max(SHORTEST, (day.amount / busiest) * TALLEST) : SHORTEST;
        return (
          <button
            key={i}
            type="button"
            aria-label={`${day.label}: ${formatAmount(day.amount)}`}
            aria-pressed={i === selected}
            onClick={() => onSelect(i === selected ? null : i)}
            className={cn(
              'flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 text-xs font-bold',
              day.isToday ? 'text-text' : 'text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'block w-2.5 rounded-full motion-safe:transition-colors motion-safe:duration-150',
                on ? 'bg-text' : 'bg-track',
              )}
              style={{ height }}
            />
            <span aria-hidden="true">{day.label}</span>
          </button>
        );
      })}
    </div>
  );
}
