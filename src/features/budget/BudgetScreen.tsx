import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import type { BudgetLimit } from '@/domain/entities';
import { categorySlices, periodProgress } from '@/domain/charts';
import { addDays } from '@/domain/dates';
import { monthKey, monthRange } from '@/domain/periods';
import { EmptyRows, GlassTile, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatMonth, formatMonthYear } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { GoalsSection } from './GoalsSection';
import { LimitDialog } from './LimitDialog';
import { LimitPaceRow } from './LimitPaceRow';

/** The month key a month before (-1) or after (1) `key`. */
function shiftMonth(key: string, by: -1 | 1): string {
  const { start, end } = monthRange(`${key}-01`);
  return monthKey(addDays(by < 0 ? start : end, by));
}

const arrow =
  'text-text hover:bg-surface-2 grid size-11 place-items-center rounded-full disabled:pointer-events-none disabled:opacity-45';

/**
 * Budget, the Spending tab: the month's spending as a big donut with its legend in a glass tile,
 * then the limits of the current week and month as plain rows of bars with a pace mark, then the
 * goals. The month can go back, never past this one.
 */
export function BudgetScreen() {
  const view = useFinanceView();
  const money = useMoney();
  const today = useToday();
  const expenses = useApp((s) => s.data.tables.expense);
  const goals = useApp((s) => s.data.tables.goal);
  const weekStartsOn = useApp((s) => s.data.tables.settings[0]?.weekStartsOn ?? 1);
  const spendingId = useId();

  const current = monthKey(today);
  const [month, setMonth] = useState(current);
  const selected = month > current ? current : month;
  const [slice, setSlice] = useState<number | null>(null);
  // undefined = dialog closed, null = adding a new limit.
  const [editing, setEditing] = useState<BudgetLimit | null | undefined>(undefined);

  const slices = useMemo(
    () => categorySlices(expenses, monthRange(`${selected}-01`)),
    [expenses, selected],
  );
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const overall = view.limits.find(
    (l) => l.limit.scope === 'overall' && l.limit.period === 'monthly',
  );
  const monthName = formatMonth(selected);

  function go(by: -1 | 1) {
    setMonth(shiftMonth(selected, by));
    setSlice(null);
  }

  let centre = monthName;
  if (slices.length === 0) centre = `No spending in ${monthName}`;
  else if (selected === current && overall) {
    centre = `of ${money(overall.limit.amount)} · ${overall.pct}%`;
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-x-3">
        <h1 className="text-page">Budget</h1>
        <div role="group" aria-label="Month" className="-mr-2.5 inline-flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => go(-1)}
            className={arrow}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <span aria-live="polite" className="text-[15px] font-extrabold">
            {formatMonthYear(selected)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            disabled={selected >= current}
            onClick={() => go(1)}
            className={arrow}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
        <GlassTile as="section" aria-labelledby={spendingId} className="mt-3.5 min-w-0">
          <h2 id={spendingId} className="sr-only">
            Spending
          </h2>
          <div className="mb-[18px] flex justify-center">
            <Donut
              label="Spending by category"
              slices={slices}
              size={240}
              thickness={22}
              formatAmount={(minor) => money(minor)}
              caption="Spent"
              idle={{ value: money(total), label: centre }}
              selected={slice}
              onSelect={setSlice}
            />
          </div>
          {slices.length > 0 && (
            <DonutLegend
              slices={slices}
              formatAmount={(minor) => money(minor, { whole: true })}
              selected={slice}
              onSelect={setSlice}
            />
          )}
        </GlassTile>

        <div className="min-w-0 lg:[&>section:first-child]:pt-3.5">
          <PlainSection
            title="Limits"
            action={
              <span className="text-muted text-[12.5px] font-bold">
                {"Line shows today's pace"}
              </span>
            }
          >
            {view.limits.length > 0 ? (
              <ul className={cn('px-1', ROWS)}>
                {view.limits.map((status) => (
                  <LimitPaceRow
                    key={status.limit.id}
                    status={status}
                    progress={periodProgress(status.limit.period, today, weekStartsOn)}
                    onEdit={() => setEditing(status.limit)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyRows>No limits yet. Add one to see your pace.</EmptyRows>
            )}
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="mx-1 mt-2 -mb-1 inline-flex min-h-11 items-center gap-2 text-[15px] font-extrabold"
            >
              <Plus aria-hidden="true" className="size-[18px]" />
              Add a limit
            </button>
          </PlainSection>
          <GoalsSection goals={goals} />
        </div>
      </div>

      <LimitDialog limit={editing} onClose={() => setEditing(undefined)} />
    </div>
  );
}
