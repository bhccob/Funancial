import { useId } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { limitLabel, type LimitStatus } from '@/domain/budget';
import { paceStatus } from '@/domain/charts';
import { cn } from '@/lib/cn';
import { useMoney } from '@/store/useFinance';

const PERIOD = { weekly: 'Weekly', monthly: 'Monthly' } as const;
const PACE = { ahead: 'ahead of pace', on: 'on pace', under: 'under pace' } as const;

export interface LimitPaceRowProps {
  status: LimitStatus;
  /** How far through its week or month today is, 0 to 1 (`periodProgress`). */
  progress: number;
  onEdit(): void;
}

/**
 * One limit as a bar in its state colour with a thin pace mark: where the bar would stand if the
 * money were spent evenly through the period. The line under it says the same in words.
 */
export function LimitPaceRow({ status, progress, onEdit }: LimitPaceRowProps) {
  const money = useMoney();
  const detailId = useId();
  const { limit, spent, remaining, pct, level } = status;
  const name = limitLabel(limit);
  const left = remaining >= 0 ? `${money(remaining)} left` : `${money(-remaining)} over`;

  return (
    <li className="border-border border-t py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[15.5px] font-extrabold">{name}</span>
          {limit.reserve && (
            <span className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
              Reserved
            </span>
          )}
        </div>
        <span
          className={cn(
            'flex-none text-sm font-extrabold tabular-nums',
            level === 'warn' && 'text-warning',
            (level === 'over' || level === 'way-over') && 'text-danger',
          )}
        >
          {left}
        </span>
        {/* 44px tall to tap, pulled back so the row keeps its rhythm. */}
        <button
          type="button"
          aria-label={`Edit ${name} limit`}
          aria-describedby={detailId}
          onClick={onEdit}
          className="text-muted hover:text-text -my-3 -mr-2 inline-flex min-h-11 min-w-11 flex-none items-center justify-center px-2 text-[13.5px] font-extrabold"
        >
          Edit
        </button>
      </div>
      <div className="relative mt-2.5">
        <ProgressBar
          label={`${name} · ${limit.period}`}
          value={pct}
          level={level}
          valueText={`${pct}% used`}
        />
        <span
          aria-hidden="true"
          data-pace-mark
          className="bg-text pointer-events-none absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-sm opacity-45"
          style={{ left: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p id={detailId} className="text-muted mt-2 text-[13px] font-semibold tabular-nums">
        {`${PERIOD[limit.period]} · ${money(spent)} of ${money(limit.amount)} · ${PACE[paceStatus(pct, progress)]}`}
      </p>
    </li>
  );
}
