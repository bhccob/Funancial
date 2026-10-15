import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import type { Debt, Goal } from '@/domain/entities';
import { monthlyToReach } from '@/domain/goals';
import { formatDate, ordinal } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { DebtDialog, type DebtTarget } from './DebtDialog';
import { GoalDialog } from './GoalDialog';
import { PayDialog, type PayTarget } from './PayDialog';

function GoalRow({ goal, onAdd, onEdit }: { goal: Goal; onAdd(): void; onEdit(): void }) {
  const money = useMoney();
  const today = useToday();
  const pct = Math.floor((goal.current * 100) / goal.target);
  const monthly = monthlyToReach(goal, today);
  let line: string | null = null;
  if (goal.current >= goal.target) line = 'Goal reached!';
  else if (goal.deadline && goal.deadline < today)
    line = `Deadline passed · ${money(goal.target - goal.current)} to go`;
  else if (monthly !== null && goal.deadline)
    line = `${money(monthly)} a month to reach it by ${formatDate(goal.deadline)}`;

  return (
    <li className="py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="truncate font-bold">{goal.name}</p>
        <p className="text-muted shrink-0 text-sm font-semibold tabular-nums">
          {`${money(goal.current)} of ${money(goal.target)}`}
        </p>
      </div>
      <ProgressBar label={goal.name} value={pct} level="ok" valueText={`${pct}% saved`} />
      {line && <p className="text-muted mt-1.5 text-sm font-semibold tabular-nums">{line}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onAdd}>
          Add money
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Edit ${goal.name}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}

function DebtRow({
  debt,
  balance,
  onPay,
  onEdit,
}: {
  debt: Debt;
  balance: number;
  onPay(): void;
  onEdit(): void;
}) {
  const money = useMoney();
  const card = debt.kind === 'credit_card';
  const details: string[] = [];
  if (card) {
    if (debt.creditLimit)
      details.push(`${Math.round((balance * 100) / debt.creditLimit)}% of limit`);
    if (debt.dueDay) details.push(`Due on the ${ordinal(debt.dueDay)}`);
  } else if (debt.minimumPayment > 0) {
    details.push(`${money(debt.minimumPayment)} minimum a month`);
  }
  const paidPct =
    debt.openingBalance > 0
      ? Math.max(0, Math.floor(((debt.openingBalance - balance) * 100) / debt.openingBalance))
      : 100;

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{debt.name}</p>
          <p className="text-muted text-sm font-semibold">
            {details.length > 0 ? details.join(' · ') : card ? 'Credit card' : 'Loan'}
          </p>
        </div>
        <p className="shrink-0 text-lg font-extrabold tabular-nums">{money(balance)}</p>
      </div>
      {!card && (
        <ProgressBar
          className="mt-3"
          label={`${debt.name} paid off`}
          value={paidPct}
          level="ok"
          valueText={`${paidPct}% paid off`}
        />
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={balance <= 0} onClick={onPay}>
          {card ? 'Pay card' : 'Make a payment'}
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Edit ${debt.name}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}

export function GoalsScreen() {
  const goals = useApp((s) => s.data.tables.goal);
  const { debts } = useFinanceView();
  // undefined = closed, null = adding a new goal.
  const [goalEdit, setGoalEdit] = useState<Goal | null | undefined>(undefined);
  const [debtEdit, setDebtEdit] = useState<DebtTarget | null>(null);
  const [pay, setPay] = useState<PayTarget | null>(null);

  const sortedGoals = [...goals].sort(
    (a, b) =>
      (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.name.localeCompare(b.name),
  );
  const sortedDebts = [...debts].sort(
    (a, b) => a.debt.kind.localeCompare(b.debt.kind) || a.debt.name.localeCompare(b.debt.name),
  );

  return (
    <div>
      <PageHeader title="Goals & debts" />
      <div className="grid lg:grid-cols-2">
        <Section
          title="Goals"
          className="lg:border-b-0 lg:pr-6"
          action={
            <Button size="sm" variant="secondary" onClick={() => setGoalEdit(null)}>
              Add goal
            </Button>
          }
        >
          {sortedGoals.length > 0 ? (
            <ul className="divide-border -my-4 divide-y">
              {sortedGoals.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  onAdd={() => setPay({ kind: 'goal', goal: g })}
                  onEdit={() => setGoalEdit(g)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState title="No goals yet">
              A trip, a laptop, three months of expenses: name it and watch it fill up.
            </EmptyState>
          )}
        </Section>

        <Section
          title="Debts"
          className="lg:border-border lg:border-l lg:pl-6"
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDebtEdit({ kind: 'credit_card', debt: null })}
              >
                Add card
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDebtEdit({ kind: 'loan', debt: null })}
              >
                Add loan
              </Button>
            </div>
          }
        >
          {sortedDebts.length > 0 ? (
            <ul className="divide-border -my-4 divide-y">
              {sortedDebts.map(({ debt, balance }) => (
                <DebtRow
                  key={debt.id}
                  debt={debt}
                  balance={balance}
                  onPay={() => setPay({ kind: 'debt', debt, balance })}
                  onEdit={() => setDebtEdit({ kind: debt.kind, debt })}
                />
              ))}
            </ul>
          ) : (
            <EmptyState title="No cards or loans">
              Add a credit card to track what you owe on it and when it's due.
            </EmptyState>
          )}
        </Section>
      </div>

      <GoalDialog goal={goalEdit} onClose={() => setGoalEdit(undefined)} />
      <DebtDialog target={debtEdit} onClose={() => setDebtEdit(null)} />
      <PayDialog target={pay} onClose={() => setPay(null)} />
    </div>
  );
}
