import { Target } from 'lucide-react';
import { Ring } from '@/components/charts/Ring';
import { EmptyLink } from '@/components/ui/Section';
import type { Goal } from '@/domain/entities';
import { EmptyRows, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useMoney } from '@/store/useFinance';

/** How many goals Spending lists; View all has the rest. */
const SHOWN = 3;

/** How much of a goal is saved, as a share of 1, for ordering. */
const share = (goal: Goal) => (goal.target > 0 ? goal.current / goal.target : 0);

/** Whole percent saved, as the Goals page counts it. */
const percent = (goal: Goal) =>
  goal.target > 0 ? Math.floor((goal.current * 100) / goal.target) : 0;

function goalOrder(a: Goal, b: Goal): number {
  // Deadlines first (soonest first), then the closest to done.
  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  }
  return share(b) - share(a);
}

/**
 * The goals on Spending, as plain rows: a ring of what is saved, the name with how far along it is
 * (and its deadline), and the saved and target amounts. View all opens the Goals page, where they
 * are added to and edited.
 */
export function GoalsSection({ goals }: { goals: Goal[] }) {
  const money = useMoney();
  const shown = [...goals].sort(goalOrder).slice(0, SHOWN);

  return (
    <PlainSection title="Goals" to={goals.length > 0 ? '/goals' : undefined}>
      {shown.length > 0 ? (
        <ul className={cn('px-1', ROWS)}>
          {shown.map((goal) => {
            const pct = percent(goal);
            const reached = goal.current >= goal.target;
            const progress = reached
              ? 'Goal reached'
              : `${pct}% saved${goal.deadline ? ` · by ${formatDate(goal.deadline)}` : ''}`;
            return (
              <li key={goal.id} className="flex min-h-[62px] items-center gap-3 py-[9px]">
                <Ring
                  value={pct}
                  size={44}
                  thickness={4}
                  color="var(--color-accent)"
                  label={`${goal.name}: ${pct}% saved`}
                >
                  <Target aria-hidden="true" className="size-4" />
                </Ring>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px] font-extrabold">{goal.name}</b>
                  <span className="text-muted block truncate text-[12px] font-semibold">
                    {progress}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[14.5px] font-extrabold tabular-nums">
                    {money(goal.current, { whole: true })}
                  </span>
                  <span className="text-muted block text-[11.5px] font-bold tabular-nums">
                    {`of ${money(goal.target, { whole: true })}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <EmptyRows>No goals yet.</EmptyRows>
          <div className="mx-1">
            <EmptyLink to="/goals">Set a goal</EmptyLink>
          </div>
        </>
      )}
    </PlainSection>
  );
}
