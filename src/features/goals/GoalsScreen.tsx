import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import type { Goal } from '@/domain/entities';
import { monthlyToReach } from '@/domain/goals';
import { formatDate } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';
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

export function GoalsScreen() {
  const goals = useApp((s) => s.data.tables.goal);
  // undefined = closed, null = adding a new goal.
  const [goalEdit, setGoalEdit] = useState<Goal | null | undefined>(undefined);
  const [pay, setPay] = useState<PayTarget | null>(null);

  const sortedGoals = [...goals].sort(
    (a, b) =>
      (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.name.localeCompare(b.name),
  );

  return (
    <div>
      <PageHeader
        title="Goals"
        action={
          <Button size="sm" variant="secondary" onClick={() => setGoalEdit(null)}>
            Add goal
          </Button>
        }
      />
      <Section>
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

      <GoalDialog goal={goalEdit} onClose={() => setGoalEdit(undefined)} />
      <PayDialog target={pay} onClose={() => setPay(null)} />
    </div>
  );
}
