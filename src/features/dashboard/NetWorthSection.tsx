import { useMemo } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { Section } from '@/components/ui/Section';
import { netWorthChangeThisMonth, netWorthSeries } from '@/domain/charts';
import type { LocalDate } from '@/domain/dates';
import type { DataSnapshot } from '@/domain/snapshot';
import type { FinanceView } from '@/domain/view';
import { useMoney } from '@/store/useFinance';

export interface NetWorthSectionProps {
  data: DataSnapshot;
  view: FinanceView;
  today: LocalDate;
}

/** The number, how far it has moved this month, its 30-day line, and what it is made of. */
export function NetWorthSection({ data, view, today }: NetWorthSectionProps) {
  const money = useMoney();
  const whole = (minor: number) => money(minor, { whole: true });

  const trend = useMemo(() => netWorthSeries(data, today, 30).map((p) => p.value), [data, today]);
  const change = useMemo(() => netWorthChangeThisMonth(data, today), [data, today]);

  // A move smaller than the smallest whole unit would read "▲ $0": call it no change.
  const moved = whole(Math.abs(change)) !== whole(0);
  const changeText = !moved ? (
    <span className="text-muted text-[13.5px] font-extrabold">No change this month</span>
  ) : change > 0 ? (
    <span className="text-accent-text text-[13.5px] font-extrabold">{`▲ ${whole(change)} this month`}</span>
  ) : (
    <span className="text-danger text-[13.5px] font-extrabold">{`▼ ${whole(-change)} this month`}</span>
  );

  const parts = [
    { label: 'Cash', amount: view.buckets.cash, color: 'var(--color-chart-1)' },
    { label: 'Savings', amount: view.buckets.savings, color: 'var(--color-chart-3)' },
    ...(view.investments > 0
      ? [{ label: 'Investments', amount: view.investments, color: 'var(--color-chart-2)' }]
      : []),
    { label: 'Debts', amount: view.debtTotal, color: 'var(--color-danger)' },
  ];

  return (
    <Section title="Net worth" action={changeText}>
      <p className="text-[34px] leading-tight font-extrabold tracking-[-0.035em] tabular-nums">
        {money(view.netWorth)}
      </p>
      <div className="mt-3">
        <Sparkline
          values={trend}
          height={70}
          color="var(--color-accent)"
          label={`Net worth over the last 30 days, now ${money(view.netWorth)}`}
        />
      </div>
      <ul className="text-muted mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-bold tabular-nums">
        {parts.map((part) => (
          <li key={part.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-[9px] flex-none rounded-full"
              style={{ backgroundColor: part.color }}
            />
            {part.label} {whole(part.amount)}
          </li>
        ))}
      </ul>
    </Section>
  );
}
