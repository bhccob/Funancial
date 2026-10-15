import { useMemo, useState } from 'react';
import { Donut, DonutLegend } from '@/components/charts/Donut';
import { EmptyState } from '@/components/ui/EmptyState';
import { categorySlices } from '@/domain/charts';
import type { LocalDate } from '@/domain/dates';
import type { Expense } from '@/domain/entities';
import { monthKey, monthRange, weekRange } from '@/domain/periods';
import { cn } from '@/lib/cn';
import { formatMonth } from '@/lib/format';
import { useMoney } from '@/store/useFinance';
import { HomeSection } from './HomeSection';

type Range = 'week' | 'month';

const RANGES: Array<{ id: Range; label: string }> = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export interface SpendingSectionProps {
  expenses: Expense[];
  today: LocalDate;
  weekStartsOn: 0 | 1;
}

/** Where the money went, by category, this week or this month (Month first). */
export function SpendingSection({ expenses, today, weekStartsOn }: SpendingSectionProps) {
  const money = useMoney();
  const [range, setRange] = useState<Range>('month');
  const [selected, setSelected] = useState<number | null>(null);

  const slices = useMemo(
    () =>
      categorySlices(
        expenses,
        range === 'week' ? weekRange(today, weekStartsOn) : monthRange(today),
      ),
    [expenses, range, today, weekStartsOn],
  );
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const whole = (minor: number) => money(minor, { whole: true });

  function choose(next: Range) {
    setRange(next);
    setSelected(null);
  }

  const tabs = (
    <div role="group" aria-label="Spending period" className="flex gap-[18px]">
      {RANGES.map(({ id, label }) => {
        const on = id === range;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => choose(id)}
            className={cn('-my-3 min-h-11 px-0.5 text-sm font-extrabold', !on && 'text-muted')}
          >
            <span className={cn('border-b-2 py-1', on ? 'border-text' : 'border-transparent')}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <HomeSection title="Spending" action={tabs}>
      {slices.length > 0 ? (
        <div className="flex items-center gap-[18px]">
          <Donut
            slices={slices}
            size={150}
            thickness={18}
            formatAmount={(minor) => money(minor)}
            idle={{
              value: whole(total),
              label: range === 'month' ? formatMonth(monthKey(today)) : 'This week',
            }}
            selected={selected}
            onSelect={setSelected}
          />
          <DonutLegend
            slices={slices}
            formatAmount={whole}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      ) : (
        <EmptyState title="No spending yet">Expenses you add show up here by category.</EmptyState>
      )}
    </HomeSection>
  );
}
