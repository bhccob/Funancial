import { Sparkline } from '@/components/charts/Sparkline';
import type { NetWorthSummary } from '@/domain/overview';
import { cn } from '@/lib/cn';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { useMoney } from '@/store/useFinance';

/**
 * Net worth as one glass tile: the figure, and beside it how far it has moved this month and its line
 * (both only when the data reaches the start of the month), then a bar of what you have against what
 * you owe, with the two amounts under it. It opens the Net worth sheet. While amounts are hidden the
 * bar is one plain track, as its two lengths would give the share away.
 */
export function NetWorthTile({ summary, onOpen }: { summary: NetWorthSummary; onOpen(): void }) {
  const money = useMoney();
  const hidden = useAmountsHidden((s) => s.hidden);
  const whole = (minor: number) => money(minor, { whole: true });
  const { total, have, owe, change, series } = summary;
  const tone = change === null || change === 0 ? '' : change > 0 ? 'success' : 'danger';
  const split = hidden ? [] : [Math.max(0, have), Math.max(0, owe)];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass press block w-full rounded-[22px] p-4 text-left"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span
            data-testid="net-worth-total"
            className="block text-[24px] leading-tight font-extrabold tracking-[-0.03em] whitespace-nowrap tabular-nums"
          >
            {money(total)}
          </span>
          {change !== null && (
            <span
              className={cn(
                'mt-0.5 block text-[12px] font-bold whitespace-nowrap tabular-nums',
                tone === 'success' && 'text-success',
                tone === 'danger' && 'text-danger',
                tone === '' && 'text-muted',
              )}
            >
              {change === 0
                ? 'No change this month'
                : `${change > 0 ? '+' : '−'}${money(Math.abs(change))} this month`}
            </span>
          )}
        </span>
        {series !== null && (
          <span data-testid="net-worth-line" className="block h-[34px] w-[110px] flex-none">
            <Sparkline
              values={series}
              height={34}
              color={`var(--color-${tone || 'text-muted'})`}
              dot
            />
          </span>
        )}
      </span>
      {/* The share each has, as two lengths: what you have in the accent, what you owe in grey. */}
      <span data-testid="split" aria-hidden="true" className="mt-3.5 flex h-2 gap-[3px]">
        {split.length === 2 && split[0]! + split[1]! > 0 ? (
          <>
            <i className="bg-accent block rounded-full" style={{ flexGrow: split[0] }} />
            <i className="bg-track block rounded-full" style={{ flexGrow: split[1] }} />
          </>
        ) : (
          <i className="bg-track block flex-1 rounded-full" />
        )}
      </span>
      <span className="text-muted mt-2 flex justify-between gap-2 text-[12px] font-semibold">
        <span>
          You have{' '}
          <b className="text-text font-extrabold whitespace-nowrap tabular-nums">{whole(have)}</b>
        </span>
        <span>
          You owe{' '}
          <b className="text-text font-extrabold whitespace-nowrap tabular-nums">{whole(owe)}</b>
        </span>
      </span>
      {/* Its name is what it shows, then what it does. */}
      <span className="sr-only"> Net worth: see and correct</span>
    </button>
  );
}
