import { addDays, type LocalDate } from './dates';
import type { Cycle } from './entities';
import { daysInMonth } from './periods';

const MONTHS: Record<Exclude<Cycle, 'weekly'>, number> = { monthly: 1, quarterly: 3, yearly: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The next date in a cycle. Month-based cycles land on `anchorDay` (clamped to short months),
 * so a subscription on the 31st renews Feb 28, then Mar 31 — it never drifts.
 */
export function nextOccurrence(d: LocalDate, cycle: Cycle, anchorDay: number): LocalDate {
  if (cycle === 'weekly') return addDays(d, 7);
  const total = Number(d.slice(0, 4)) * 12 + (Number(d.slice(5, 7)) - 1) + MONTHS[cycle];
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(anchorDay, daysInMonth(y, m)))}`;
}

export function monthlyEquivalent(amount: number, cycle: Cycle): number {
  switch (cycle) {
    case 'weekly':
      return Math.round((amount * 52) / 12);
    case 'monthly':
      return amount;
    case 'quarterly':
      return Math.round(amount / 3);
    case 'yearly':
      return Math.round(amount / 12);
  }
}
