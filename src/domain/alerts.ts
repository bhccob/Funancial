import { limitLabel, limitStatus, type LimitLevel, type LimitStatus } from './budget';
import type { LocalDate } from './dates';
import type { Expense, Settings } from './entities';
import type { DataSnapshot } from './snapshot';
import { applyRecords } from './sync';

const RANK: Record<LimitLevel, number> = { ok: 0, warn: 1, over: 2, 'way-over': 3 };

function statuses(data: DataSnapshot, today: LocalDate, weekStartsOn: 0 | 1) {
  return new Map(
    data.tables.budgetLimit.map((l) => [l.id, limitStatus(l, data, today, weekStartsOn)]),
  );
}

/**
 * Limits whose level rose between two states of the data (e.g. before/after saving an expense).
 * Levels are for the period containing today, so last month's expenses never alert.
 */
export function limitAlerts(
  before: DataSnapshot,
  after: DataSnapshot,
  today: LocalDate,
  weekStartsOn: 0 | 1,
): LimitStatus[] {
  const was = statuses(before, today, weekStartsOn);
  return [...statuses(after, today, weekStartsOn).values()].filter(
    (s) => RANK[s.level] > RANK[was.get(s.limit.id)?.level ?? 'ok'],
  );
}

/** Limits that adding this expense would take from under 100% to 100% or more. */
export function crossesOver(
  data: DataSnapshot,
  expense: Expense,
  today: LocalDate,
  weekStartsOn: 0 | 1,
): LimitStatus[] {
  const after = applyRecords(data, [{ table: 'expense', record: expense }]);
  return limitAlerts(data, after, today, weekStartsOn).filter((s) => RANK[s.level] >= RANK.over);
}

type Tone = Settings['warningTone'];

const COPY: Record<Tone, Record<Exclude<LimitLevel, 'ok'>, string>> = {
  gentle: {
    warn: 'Heads up: {name} is at {pct}% of its limit.',
    over: '{name} has reached its limit for this {period}.',
    'way-over': '{name} is well past its limit ({pct}%).',
  },
  motivational: {
    warn: "{name} is at {pct}%. A few careful days and you've got this!",
    over: "{name} hit its limit. Let's hold the line for the rest of the {period}.",
    'way-over': "{name} is at {pct}%. Let's regroup and get back on track.",
  },
  strict: {
    warn: '{name}: {pct}% used.',
    over: '{name} limit reached.',
    'way-over': '{name} limit exceeded: {pct}%.',
  },
};

export function limitMessage(tone: Tone, status: LimitStatus): string {
  if (status.level === 'ok') return '';
  return COPY[tone][status.level]
    .replace('{name}', limitLabel(status.limit))
    .replace('{pct}', String(status.pct))
    .replace('{period}', status.limit.period === 'weekly' ? 'week' : 'month');
}
