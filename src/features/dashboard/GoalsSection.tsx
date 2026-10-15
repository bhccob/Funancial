import { EmptyState } from '@/components/ui/EmptyState';
import { EmptyLink, Section, SectionLink } from '@/components/ui/Section';
import type { Goal } from '@/domain/entities';
import { useMoney } from '@/store/useFinance';

/** The colour of the progress line of the goal in each row, in the chart colours' order. */
const LINE_COLORS = ['var(--color-chart-1)', 'var(--color-chart-3)'];

function goalOrder(a: Goal, b: Goal): number {
  // Deadlines first (soonest first), then the closest to done.
  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  }
  return b.current / b.target - a.current / a.target;
}

/** Up to two goals, with a progress line each. */
export function GoalsSection({ goals }: { goals: Goal[] }) {
  const money = useMoney();
  const shown = [...goals].sort(goalOrder).slice(0, 2);

  return (
    <Section title="Goals" action={<SectionLink to="/goals">All</SectionLink>}>
      {shown.length > 0 ? (
        <ul className="divide-border divide-y">
          {shown.map((goal, i) => {
            const pct = goal.target > 0 ? Math.floor((goal.current * 100) / goal.target) : 0;
            return (
              <li key={goal.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <b className="min-w-0 truncate text-[15px] font-extrabold">{goal.name}</b>
                  <span className="text-muted flex-none text-[13.5px] font-bold tabular-nums">
                    {`${money(goal.current, { whole: true })} of ${money(goal.target, { whole: true })} · ${pct}%`}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={goal.name}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.max(0, pct))}
                  aria-valuetext={`${pct}% saved`}
                  className="bg-track mt-2.5 h-1.5 overflow-hidden rounded-full"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, pct))}%`,
                      backgroundColor: LINE_COLORS[i % LINE_COLORS.length],
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No goals yet" action={<EmptyLink to="/goals">Add a goal</EmptyLink>} />
      )}
    </Section>
  );
}
