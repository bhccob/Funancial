import type { LimitLevel } from '@/domain/budget';
import { cn } from '@/lib/cn';

const fills: Record<LimitLevel, string> = {
  ok: 'bg-accent',
  warn: 'bg-warning',
  over: 'bg-danger',
  'way-over': 'bg-danger',
};

export interface ProgressBarProps {
  label: string;
  /** Percent; may exceed 100. */
  value: number;
  level: LimitLevel;
  valueText: string;
  className?: string;
}

export function ProgressBar({ label, value, level, valueText, className }: ProgressBarProps) {
  const shown = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      className={cn('bg-track h-2 overflow-hidden rounded-full', className)}
    >
      <div
        className={cn(
          'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300',
          fills[level],
        )}
        style={{ width: `${shown}%` }}
      />
    </div>
  );
}
