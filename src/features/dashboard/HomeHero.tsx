import { useId, useState } from 'react';
import { MonthLine } from '@/components/charts/MonthLine';
import { HelpTip } from '@/components/ui/HelpTip';
import { monthLine } from '@/domain/charts';
import type { LocalDate } from '@/domain/dates';
import { monthKey } from '@/domain/periods';
import type { FinanceView } from '@/domain/view';
import { cn } from '@/lib/cn';
import { formatMonth } from '@/lib/format';
import { useMoney } from '@/store/useFinance';

/** The month line's three parts, in the order they are drawn. */
type Part = { key: string; name: string; amount: number; color: string };

/** Amounts longer than this many characters ("$1,234,567.89") drop to the smaller size. */
const LONG_AMOUNT = 11;

/**
 * What is available to spend, huge, and under it one thin line for the month: spent so far, bills
 * still to come, and what is left of the monthly limit. Tapping a part of the line names it in the
 * left key, with its exact amount; the idle keys are in whole units.
 */
export function HomeHero({ view, today }: { view: FinanceView; today: LocalDate }) {
  const money = useMoney();
  const whole = (minor: number) => money(minor, { whole: true });
  const labelId = useId();
  const [selected, setSelected] = useState<string | null>(null);

  const line = monthLine(view);
  const parts: Part[] = [
    { key: 'spent', name: 'Spent so far', amount: line.spent, color: 'var(--color-chart-4)' },
    {
      key: 'bills',
      name: 'Bills still to come',
      amount: line.bills,
      color: 'var(--color-chart-5)',
    },
    ...(line.left === null
      ? []
      : [
          {
            key: 'left',
            name: 'Left in your monthly limit',
            amount: line.left,
            color: 'var(--color-accent)',
          },
        ]),
  ];
  const chosen = parts.find((p) => p.key === selected && p.amount > 0);

  const amount = money(view.available);
  const leftKey =
    line.left === null
      ? { value: whole(line.bills), label: 'bills to come' }
      : { value: whole(line.left), label: 'left in limit' };
  const spentKey = chosen
    ? { value: money(chosen.amount), label: chosen.name }
    : { value: whole(line.spent), label: `spent in ${formatMonth(monthKey(today))}` };

  return (
    <section aria-labelledby={labelId}>
      <div className="flex items-center gap-1">
        <h2 id={labelId} className="text-muted text-sm font-bold">
          Available to spend
        </h2>
        <HelpTip pageId="available" label="available to spend" />
      </div>
      <p
        className={cn(
          'mt-1.5 leading-[1.05] font-extrabold tracking-[-0.045em] tabular-nums',
          amount.length > LONG_AMOUNT ? 'text-[40px]' : 'text-[50px]',
        )}
      >
        {amount}
      </p>
      {/* The line is 6px tall with a 44px tap area, so it keeps 20px clear above and below. */}
      <div className="mt-6">
        <MonthLine
          label="This month's money"
          segments={parts.map((p) => ({
            key: p.key,
            label: `${p.name}: ${whole(p.amount)}`,
            amount: p.amount,
            color: p.color,
          }))}
          selected={chosen?.key ?? null}
          onSelect={setSelected}
        />
      </div>
      <div className="text-muted mt-5 flex justify-between gap-4 text-[13px] font-bold">
        <Key {...spentKey} />
        <Key {...leftKey} alignEnd />
      </div>
    </section>
  );
}

function Key({ value, label, alignEnd }: { value: string; label: string; alignEnd?: boolean }) {
  return (
    <div className={cn('min-w-0', alignEnd && 'text-right')}>
      <b className="text-text block text-[15px] font-extrabold tabular-nums">{value}</b>
      {label}
    </div>
  );
}
