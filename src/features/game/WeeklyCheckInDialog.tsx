import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { limitLabel } from '@/domain/budget';
import { addDays } from '@/domain/dates';
import { monthKey } from '@/domain/periods';
import { formatMonth } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { useGameActions } from '@/store/useGame';

const BILLS_WITHIN_DAYS = 7;

function CheckInForm({ onDone }: { onDone(): void }) {
  const view = useFinanceView();
  const money = useMoney();
  const today = useToday();
  const { checkInWeek } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const limitsId = useId();

  const month = formatMonth(monthKey(today));
  const limits = view.limits.slice(0, 3);
  const bills = view.bills.filter((b) => b.date <= addDays(today, BILLS_WITHIN_DAYS));
  const billsTotal = bills.reduce((sum, b) => sum + b.amount, 0);

  async function checkIn() {
    setBusy(true);
    const saved = await run(() => checkInWeek());
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="divide-border divide-y">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <p className="text-muted text-sm font-semibold">Spent this week</p>
          <p className="text-lg font-extrabold tabular-nums">{money(view.spending.week)}</p>
        </div>

        <div className="py-3">
          <h3 id={limitsId} className="text-muted mb-2 text-sm font-semibold">
            Limits
          </h3>
          {limits.length > 0 ? (
            <ul aria-labelledby={limitsId} className="flex flex-col gap-1.5">
              {limits.map(({ limit, pct }) => (
                <li
                  key={limit.id}
                  className="flex items-baseline justify-between gap-3 text-sm font-semibold"
                >
                  <span className="truncate">
                    {`${limitLabel(limit)} · ${limit.period === 'weekly' ? 'this week' : month}`}
                  </span>
                  <span className="shrink-0 tabular-nums">{pct}% used</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-semibold">No limits set yet</p>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-3 pt-3">
          <p className="text-muted text-sm font-semibold">Bills in the next 7 days</p>
          <p className="text-sm font-semibold tabular-nums">
            {bills.length > 0
              ? `${bills.length} ${bills.length === 1 ? 'bill' : 'bills'} · ${money(billsTotal)}`
              : 'Nothing due'}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Not now
        </Button>
        <Button disabled={busy} onClick={() => void checkIn()}>
          Check in
        </Button>
      </div>
    </div>
  );
}

/** The weekly check-in: a look back at the week, then one tap to check in. */
export function WeeklyCheckInDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} title="Weekly check-in" onClose={onClose}>
      {open && <CheckInForm onDone={onClose} />}
    </Dialog>
  );
}
