import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { soldGroups } from '@/domain/sales';
import { cn } from '@/lib/cn';
import { formatShares } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useInvestMoney } from '@/store/useInvest';

const tone = (n: number) => (n < 0 ? 'text-danger' : 'text-success');
const arrow = (n: number) => (n < 0 ? '▼' : '▲');

/**
 * What was sold, one row per symbol (see `soldGroups`): a "Sold (n)" row that opens the list, each
 * with its shares, the proceeds and the profit. Nothing, until something was sold.
 */
export function SoldList() {
  const data = useApp((s) => s.data);
  const { format } = useInvestMoney();
  const groups = useMemo(() => soldGroups(data), [data]);
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (groups.length === 0) return null;

  return (
    <div className="border-border mt-4 border-t first:mt-0 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center justify-between gap-3 text-left text-[15px] font-extrabold"
      >
        {`Sold (${groups.length})`}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'text-muted size-[18px] motion-safe:transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <ul id={listId} aria-label="Sold" hidden={!open}>
        {groups.map((g) => (
          <li
            key={g.symbol}
            className="border-border flex min-h-14 items-center gap-3 border-t py-2.5 first:border-t-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-extrabold">{`${g.symbol} · ${g.name}`}</span>
              <span className="text-muted text-[13px] font-semibold">
                {`${formatShares(g.shares)} ${g.shares === 1 ? 'share' : 'shares'} sold`}
              </span>
            </span>
            <span className="flex flex-none flex-col items-end tabular-nums">
              <span className="text-[15px] font-extrabold">{format(g.proceeds)}</span>
              <span className={cn('text-[13px] font-extrabold', tone(g.profit))}>
                {`${arrow(g.profit)} ${format(Math.abs(g.profit))}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
