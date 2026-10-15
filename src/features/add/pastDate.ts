import type { LocalDate } from '@/domain/dates';

export const FUTURE_DATE = 'Use today or an earlier date.';

/** Problem with a date for something that already happened, or null. */
export function pastDateProblem(date: string, today: LocalDate): string | null {
  if (!date) return 'Pick a date.';
  return date > today ? FUTURE_DATE : null;
}
