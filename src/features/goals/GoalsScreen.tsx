import { Target } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import type { Goal } from '@/domain/entities';
import { monthlyToReach } from '@/domain/goals';
import { IconRow, ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useMoney, useToday } from '@/store/useFinance';
import { EditButton } from './EditButton';
import { GoalDialog } from './GoalDialog';
import { PayDialog, type PayTarget } from './PayDialog';

/** A goal: what it is, how much of it is saved, and Add money (the pill) and Edit (the pencil). */
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
    <li>
      <IconRow icon={Target} top>
        <p className={cn(ROW_TITLE, 'truncate')}>{goal.name}</p>
        <p className={cn(ROW_SUB, 'tabular-nums')}>
          {`${money(goal.current)} of ${money(goal.target)}`}
        </p>
        <ProgressBar
          className="mt-2.5"
          label={goal.name}
          value={pct}
          level="ok"
          valueText={`${pct}% saved`}
        />
        {line && <p className={cn(ROW_SUB, 'mt-1.5 tabular-nums')}>{line}</p>}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onAdd}>
            Add money
          </Button>
          <EditButton name={goal.name} onClick={onEdit} />
        </div>
      </IconRow>
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
    <div className="max-w-3xl">
      {/* Goals are listed on Spending: where Back goes when the app has no history to go back through. */}
      <PageHeader
        title="Goals"
        back
        backTo="/budget"
        action={
          <Button size="sm" variant="secondary" onClick={() => setGoalEdit(null)}>
            Add goal
          </Button>
        }
      />
      <Section>
        {sortedGoals.length > 0 ? (
          <ul className={cn('px-1', ROWS)}>
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
