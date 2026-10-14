import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import { categoryBreakdown, categoryLabel, limitLabel, type LimitStatus } from '@/domain/budget';
import type { BudgetLimit } from '@/domain/entities';
import { monthRange } from '@/domain/periods';
import { cn } from '@/lib/cn';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { LimitDialog } from './LimitDialog';

function LimitRow({ status, onEdit }: { status: LimitStatus; onEdit(): void }) {
  const money = useMoney();
  const { limit, spent, remaining, pct, level } = status;
  const label = `${limitLabel(limit)} · ${limit.period}`;
  const left = remaining >= 0 ? `${money(remaining)} left` : `${money(-remaining)} over`;
  return (
    <li className="py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-bold">{label}</span>
          {limit.reserve && (
            <span className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
              Reserved
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" aria-label={`Edit ${label}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
      <ProgressBar label={label} value={pct} level={level} valueText={`${pct}% used`} />
      <p
        className={cn(
          'mt-1.5 text-sm font-semibold tabular-nums',
          level === 'ok' ? 'text-muted' : level === 'warn' ? 'text-warning' : 'text-danger',
        )}
      >
        {`${money(spent)} of ${money(limit.amount)} · ${left}`}
      </p>
    </li>
  );
}

export function BudgetScreen() {
  const view = useFinanceView();
  const money = useMoney();
  const today = useToday();
  const expenses = useApp((s) => s.data.tables.expense);
  // undefined = dialog closed, null = adding a new limit.
  const [editing, setEditing] = useState<BudgetLimit | null | undefined>(undefined);

  const byCategory = categoryBreakdown(expenses, monthRange(today));
  const largest = byCategory[0]?.amount ?? 0;

  return (
    <div>
      <PageHeader
        title="Budget"
        action={
          <Button size="sm" onClick={() => setEditing(null)}>
            Add limit
          </Button>
        }
      />
      <div className="grid lg:grid-cols-[7fr_5fr]">
        <Section title="Limits" className="last:border-b lg:pr-6">
          {view.limits.length > 0 ? (
            <ul className="divide-border -my-4 divide-y">
              {view.limits.map((s) => (
                <LimitRow key={s.limit.id} status={s} onEdit={() => setEditing(s.limit)} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No limits yet"
              action={
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                  Set a limit
                </Button>
              }
            >
              Limits warn you at 80%, 100% and 120% so you can adjust before it hurts.
            </EmptyState>
          )}
        </Section>

        <Section
          title="This month by category"
          className="lg:border-border last:border-b lg:border-l lg:pl-6"
        >
          {byCategory.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {byCategory.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-sm font-semibold">
                    <span>{categoryLabel(c.category)}</span>
                    <span className="tabular-nums">{money(c.amount)}</span>
                  </div>
                  <div aria-hidden className="bg-track h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-chart-1 h-full rounded-full"
                      style={{ width: `${Math.max(2, (c.amount / largest) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No spending yet this month">
              Expenses you add show up here by category.
            </EmptyState>
          )}
        </Section>
      </div>
      <LimitDialog limit={editing} onClose={() => setEditing(undefined)} />
    </div>
  );
}
