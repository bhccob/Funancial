import { useMemo, useState } from 'react';
import { DayBars } from '@/components/charts/DayBars';
import { Section, SectionLink } from '@/components/ui/Section';
import { spendingByDay } from '@/domain/charts';
import type { LocalDate } from '@/domain/dates';
import type { Expense } from '@/domain/entities';
import { formatWeekday } from '@/lib/format';
import { useMoney } from '@/store/useFinance';

export interface WeekSectionProps {
  expenses: Expense[];
  today: LocalDate;
  /** What has been spent so far this week, for the line under the bars. */
  weekTotal: number;
}

/** Slim bars for the 7 days ending today; tapping a day says what was spent on it. */
export function WeekSection({ expenses, today, weekTotal }: WeekSectionProps) {
  const money = useMoney();
  const [selected, setSelected] = useState<number | null>(null);

  const days = useMemo(
    () =>
      spendingByDay(expenses, today, 7).map(({ day, amount }, i, all) => {
        const isToday = i === all.length - 1;
        return { label: isToday ? 'Today' : formatWeekday(day), amount, isToday };
      }),
    [expenses, today],
  );
  const picked = selected === null ? undefined : days[selected];

  return (
    <Section title="Last 7 days" action={<SectionLink to="/history">History</SectionLink>}>
      <DayBars
        days={days}
        selected={selected}
        onSelect={setSelected}
        formatAmount={(minor) => money(minor)}
      />
      <p aria-live="polite" className="text-muted mt-3.5 text-sm font-bold">
        {picked ? (
          picked.amount > 0 ? (
            <>
              <b className="text-text">{picked.label}</b> · spent{' '}
              <b className="text-text">{money(picked.amount)}</b>
            </>
          ) : (
            <>
              <b className="text-text">{picked.label}</b> · nothing spent
            </>
          )
        ) : (
          <>
            This week so far <b className="text-text">{money(weekTotal)}</b> · tap a day
          </>
        )}
      </p>
    </Section>
  );
}
