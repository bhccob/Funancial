import { categoryLabel } from '../budget';
import type { LocalDate } from '../dates';
import type { AboutYou, BuyAsk, Facts, Verdict } from '../entities';
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
  /** Lines for the person: how their About you shaped the answer, and what they said. */
  notes: string[];
};

type LimitAfter = AdvisorSnapshot['limits'][number] & { spentAfter: number };
type Goal = AdvisorSnapshot['goals'][number];

/**
 * The goal a purchase is measured against: the one the person protects while it still has a deadline
 * to meet, else (it is deleted, complete or has no deadline) the nearest unfinished deadline.
 */
function goalToWatch(
  snapshot: AdvisorSnapshot,
  about?: AboutYou,
): { goal: Goal | undefined; protectedGoal: boolean } {
  const open = snapshot.goals.filter((g) => g.deadline !== null && g.saved < g.target);
  const mine = open.find((g) => g.id === about?.protectGoalId);
  return {
    goal: mine ?? open.sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0],
    protectedGoal: mine !== undefined,
  };
}

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
  goal: Goal | undefined,
  today: LocalDate,
): Facts {
  const furthest = limits
    .filter((l) => l.spentAfter > l.limit)
    .reduce<LimitAfter | null>(
      (a, l) => (a === null || l.spentAfter - l.limit > a.spentAfter - a.limit ? l : a),
      null,
    );
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

const said = (text: string | null | undefined) => text?.trim() ?? '';

/** The reason a category the person overspends on counts against the ask, then their own words. */
function notesOf(ask: BuyAsk, overspends: boolean, about?: AboutYou): string[] {
  const [matters, situation, why] = [said(about?.matters), said(about?.situation), said(ask.why)];
  return [
    overspends && `You said you tend to overspend on ${categoryLabel(ask.category)}.`,
    matters && `You said: ${matters}`,
    situation,
    why && `You said: ${why}`,
  ].filter((n): n is string => n !== false && n !== '');
}

/**
 * Checks an ask against the totals: the facts, a 0–100 buy meter, a verdict and how sure it is.
 * `about` is what the person said about themselves: a category they overspend on takes 10 off, and
 * a goal they protect is measured first and may slip a week, not two. The guards (a purchase that
 * needs debt, overdraws the available balance, or lets a want eat into the emergency fund) come
 * last, after every adjustment, and keep the meter out of the buy zone, so the verdict is never buy.
 */
export function analyse(
  snapshot: AdvisorSnapshot,
  ask: BuyAsk,
  today: LocalDate,
  about?: AboutYou,
): Analysis {
  const total = ask.price * ask.quantity;
  const limits = snapshot.limits
    .filter((l) => l.scope === 'overall' || l.scope === ask.category)
    .map((l) => ({ ...l, spentAfter: l.spent + total }));
  const { goal, protectedGoal } = goalToWatch(snapshot, about);
  const facts = factsOf(snapshot, ask, limits, total, goal, today);

  const reasons = [
    facts.requiresDebt && "Needs money you don't have",
    facts.availableAfter < 0 && 'Leaves your available balance below zero',
    ask.urgency !== 'need' &&
      facts.emergencyAfter !== null &&
      facts.emergencyAfter < 1 &&
      'Drops your emergency fund under a month',
  ].filter((r): r is string => r !== false);
  const capAtWait = reasons.length > 0;

  const overspends = about?.overspend.includes(ask.category) ?? false;
  const baseline = baselineMeter(snapshot, ask, facts, { overspends, protectedGoal });
  const meter = capAtWait ? Math.min(baseline, WAIT_CAP) : baseline;

  // Waiting, and 60% of the price would sit inside every limit: a cheaper one would do.
  const fitsAtSixtyPercent = limits.every((l) => l.spent * 10 + total * 6 <= l.limit * 10);
  const z = zone(meter);
  const verdict: Verdict =
    z === 'wait' ? (facts.overBy > 0 && fitsAtSixtyPercent ? 'cheaper' : 'wait') : z;

  return {
    facts,
    meter,
    verdict,
    confidence: confidenceOf(meter),
    guards: { capAtWait, reasons },
    notes: notesOf(ask, overspends, about),
  };
}
