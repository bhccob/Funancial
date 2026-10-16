import type { BuyAsk, Facts } from '../entities';
import type { AdvisorSnapshot } from './snapshot';

export type Zone = 'skip' | 'wait' | 'buy';
export type Confidence = 'low' | 'medium' | 'high';

/** Skip 0–33, wait 34–66, buy 67–100. */
export function zone(meter: number): Zone {
  const m = Math.round(meter);
  return m <= 33 ? 'skip' : m <= 66 ? 'wait' : 'buy';
}

/** How sure the meter is: far from the middle, sure. */
export function confidenceOf(meter: number): Confidence {
  const away = Math.abs(meter - 50);
  return away >= 30 ? 'high' : away >= 15 ? 'medium' : 'low';
}

const URGENCY = { need: 20, want: 0, treat: -10 } as const;

/**
 * The meter before the guards: 50, moved by the kind of purchase and by what it does to the
 * person's limits, available balance, emergency fund and goals, then kept within 0–100.
 */
export function baselineMeter(snapshot: AdvisorSnapshot, ask: BuyAsk, facts: Facts): number {
  const { categoryAfter, overallAfter, goalDelay } = facts;
  const lines = [categoryAfter, overallAfter].filter((l) => l !== null);
  const over = (l: Facts['overallAfter']) => l !== null && l.spentAfter > l.limit;
  const rated = (test: (usage: number) => boolean) =>
    snapshot.similar.some((s) => s.usage !== null && test(s.usage));

  let m = 50 + URGENCY[ask.urgency];
  if (ask.howSoon === 'norush') m += 5;
  if (ask.howSoon === 'today' && ask.urgency !== 'need') m -= 10;
  // Every limit that applies must be comfortable, and there must be one.
  if (lines.length > 0 && lines.every((l) => l.spentAfter * 100 <= l.limit * 80)) m += 10;
  if (over(categoryAfter)) m -= 15;
  if (over(overallAfter)) m -= 20;
  if (facts.availableAfter * 10 < snapshot.monthIncome) m -= 10;
  if (facts.emergencyAfter !== null)
    m += facts.emergencyAfter >= 3 ? 10 : facts.emergencyAfter < 1 ? -15 : 0;
  if (goalDelay !== null && goalDelay.days > 14) m -= 10;
  if (rated((u) => u <= 2)) m -= 10;
  if (rated((u) => u >= 4)) m += 5;
  return Math.min(100, Math.max(0, m));
}
