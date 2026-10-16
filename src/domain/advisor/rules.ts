import type { LocalDate } from '../dates';
import type { BuyAsk, Facts, Verdict } from '../entities';
import { monthlyToReach } from '../goals';
import { baselineMeter, confidenceOf, zone, type Confidence } from './meter';
import type { AdvisorSnapshot } from './snapshot';

/** The most a guard lets the meter reach: the top of the wait zone. */
const WAIT_CAP = 66;

export type Analysis = {
  facts: Facts;
  meter: number;
  verdict: Verdict;
  confidence: Confidence;
  guards: { capAtWait: boolean; reasons: string[] };
};

type LimitAfter = AdvisorSnapshot['limits'][number] & { spentAfter: number };

/** The limit of the rows that the purchase takes closest to (or furthest over) its limit. */
function tightest(rows: LimitAfter[]): Facts['overallAfter'] {
  const t = rows.reduce<LimitAfter | null>(
    (a, l) => (a === null || l.spentAfter / l.limit > a.spentAfter / a.limit ? l : a),
    null,
  );
  return (
    t && {
      limit: t.limit,
      spentAfter: t.spentAfter,
      pct: Math.round((t.spentAfter * 100) / t.limit),
    }
  );
}

function factsOf(
  snapshot: AdvisorSnapshot,
  ask: BuyAsk,
  limits: LimitAfter[],
  total: number,
  today: LocalDate,
): Facts {
  const furthest = limits
    .filter((l) => l.spentAfter > l.limit)
    .reduce<LimitAfter | null>(
      (a, l) => (a === null || l.spentAfter - l.limit > a.spentAfter - a.limit ? l : a),
      null,
    );
  const goal = snapshot.goals
    .filter((g) => g.deadline !== null && g.saved < g.target)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
  const monthly = goal
    ? monthlyToReach({ target: goal.target, current: goal.saved, deadline: goal.deadline }, today)
    : null;

  return {
    total,
    categoryAfter: tightest(limits.filter((l) => l.scope === ask.category)),
    overallAfter: tightest(limits.filter((l) => l.scope === 'overall')),
    overBy: furthest ? furthest.spentAfter - furthest.limit : 0,
    availableAfter: snapshot.available - total,
    emergencyBefore: snapshot.emergencyMonths,
    emergencyAfter:
      snapshot.emergencyMonths === null
        ? null
        : Math.max(0, snapshot.emergencyFund - total) / snapshot.avgMonthlySpend,
    goalDelay:
      goal && monthly ? { name: goal.name, days: Math.ceil((total * 30) / monthly) } : null,
    requiresDebt:
      (ask.payWith === 'credit_card' && (snapshot.cardBalance ?? 0) > 0) ||
      total > snapshot.cash + snapshot.savings - snapshot.billsTotal,
    resetsOn: furthest?.resetsOn ?? null,
  };
}

/**
 * Checks an ask against the totals: the facts, a 0–100 buy meter, a verdict and how sure it is.
 * The guards (a purchase that needs debt, overdraws the available balance, or lets a want eat
 * into the emergency fund) keep the meter out of the buy zone, so the verdict is never buy then.
 */
export function analyse(snapshot: AdvisorSnapshot, ask: BuyAsk, today: LocalDate): Analysis {
  const total = ask.price * ask.quantity;
  const limits = snapshot.limits
    .filter((l) => l.scope === 'overall' || l.scope === ask.category)
    .map((l) => ({ ...l, spentAfter: l.spent + total }));
  const facts = factsOf(snapshot, ask, limits, total, today);

  const reasons = [
    facts.requiresDebt && "Needs money you don't have",
    facts.availableAfter < 0 && 'Leaves your available balance below zero',
    ask.urgency !== 'need' &&
      facts.emergencyAfter !== null &&
      facts.emergencyAfter < 1 &&
      'Drops your emergency fund under a month',
  ].filter((r): r is string => r !== false);
  const capAtWait = reasons.length > 0;

  const baseline = baselineMeter(snapshot, ask, facts);
  const meter = capAtWait ? Math.min(baseline, WAIT_CAP) : baseline;

  // Waiting, and 60% of the price would sit inside every limit: a cheaper one would do.
  const fitsAtSixtyPercent = limits.every((l) => l.spent * 10 + total * 6 <= l.limit * 10);
  const z = zone(meter);
  const verdict: Verdict =
    z === 'wait' ? (facts.overBy > 0 && fitsAtSixtyPercent ? 'cheaper' : 'wait') : z;

  return { facts, meter, verdict, confidence: confidenceOf(meter), guards: { capAtWait, reasons } };
}
