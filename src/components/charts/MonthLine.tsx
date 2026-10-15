import { cn } from '@/lib/cn';

export interface MonthLineSegment {
  key: string;
  /** Read out for the segment, with its amount already formatted into it ("Spent so far: $1,884"). */
  label: string;
  /** Minor units; the segment's share of the line. Zero and negative segments are left out. */
  amount: number;
  /** A CSS colour, e.g. `var(--color-chart-4)`. */
  color: string;
}

export interface MonthLineProps {
  segments: MonthLineSegment[];
  selected: string | null;
  onSelect(key: string | null): void;
}

export function MonthLine({ segments, selected, onSelect }: MonthLineProps) {
  const shown = segments.filter((s) => s.amount > 0);
  if (shown.length === 0) return <div aria-hidden="true" className="bg-track h-1.5 rounded-full" />;
  return (
    <div className="flex h-1.5 gap-[3px]">
      {shown.map((segment) => (
        <button
          key={segment.key}
          type="button"
          aria-label={segment.label}
          aria-pressed={segment.key === selected}
          onClick={() => onSelect(segment.key === selected ? null : segment.key)}
          // The line is only 6px tall; the pseudo-element reaches a 44px-tall touch target.
          className={cn(
            // min-w-2: a small segment beside a big one (a $16 bill next to $2,600) stays tappable.
            'relative min-w-2 rounded-full motion-safe:transition-opacity motion-safe:duration-150',
            'before:absolute before:inset-x-0 before:-inset-y-[19px] before:content-[""]',
            selected !== null && segment.key !== selected && 'opacity-25',
          )}
          style={{ flex: segment.amount, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
}
