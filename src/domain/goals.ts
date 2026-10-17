import type { LocalDate } from './dates';
import type { Goal } from './entities';

/**
 * What to put aside each month to reach a goal by its deadline: what's left ÷ whole months to
 * the deadline's month (at least 1), rounded up. Null without a deadline or once reached.
 */
export function monthlyToReach(
  goal: Pick<Goal, 'target' | 'current' | 'deadline'>,
  today: LocalDate,
): number | null {
  const remaining = goal.target - goal.current;
  if (goal.deadline === null || remaining <= 0) return null;
  const monthIndex = (d: LocalDate) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  const monthsLeft = Math.max(1, monthIndex(goal.deadline) - monthIndex(today));
  return Math.ceil(remaining / monthsLeft);
}
