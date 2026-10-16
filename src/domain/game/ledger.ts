import type { LedgerEntry } from '../entities';
import type { DataSnapshot } from '../snapshot';
import { loggedEntries, type LoggedEntry } from './activity';
import { LOG_CAP_PER_DAY, LOG_XP } from './rules';
import type { Award, Reward } from './types';

const LOG_LABELS: Record<LoggedEntry['table'], string> = {
  expense: 'Logged an expense',
  income: 'Logged income',
  dividend: 'Logged a dividend',
};

/** `-n`, but never `-0`: a reversal of 0 coins carries 0, not negative zero. */
const negate = (n: number): number => (n === 0 ? 0 : -n);

/** The id of the `n`th ledger entry for `key`, so one entry is never written twice. */
export function ledgerId(key: string, n: number): string {
  return `${key}#${n}`;
}

/** What each key has earned in total: its awards, less its reversals and purchases. */
export function netByKey(ledger: readonly LedgerEntry[]): Map<string, Reward> {
  const net = new Map<string, Reward>();
  for (const e of ledger) {
    const prev = net.get(e.key) ?? { xp: 0, coins: 0 };
    net.set(e.key, { xp: prev.xp + e.xp, coins: prev.coins + e.coins });
  }
  return net;
}

/** The XP and coins the ledger adds up to. */
export function ledgerTotals(ledger: readonly LedgerEntry[]): Reward {
  return ledger.reduce((sum, e) => ({ xp: sum.xp + e.xp, coins: sum.coins + e.coins }), {
    xp: 0,
    coins: 0,
  });
}

/**
 * The logging awards that stand: the first `LOG_CAP_PER_DAY` things logged on each local day, by
 * when they were created. Removing one hands its place to a later entry that day.
 */
export function loggingAwards(data: DataSnapshot): Award[] {
  const perDay = new Map<string, number>();
  const awards: Award[] = [];
  for (const entry of loggedEntries(data)) {
    const count = perDay.get(entry.day) ?? 0;
    if (count >= LOG_CAP_PER_DAY) continue;
    perDay.set(entry.day, count + 1);
    const label = LOG_LABELS[entry.table];
    awards.push({
      key: `log:${entry.table}:${entry.id}`,
      kind: 'log',
      title: label,
      label,
      xp: LOG_XP,
      coins: 0,
    });
  }
  return awards;
}

/**
 * The ledger entries still owed so that the ledger matches `awards`, and nothing else.
 *
 * - `reversible` awards stand while they are earned: one with nothing netted gets an `award`, and a
 *   `log:` key that is no longer earned gets a `reversal` that takes back what it netted.
 * - `oneTime` awards are granted once and never taken back.
 * - Purchases are never touched.
 *
 * Applying the result to `ledger` makes the next call return nothing.
 */
export function reconcileLedger(
  ledger: readonly LedgerEntry[],
  awards: { reversible: readonly Award[]; oneTime: readonly Award[] },
  now: string,
): LedgerEntry[] {
  const net = netByKey(ledger);
  const counts = new Map<string, number>();
  const awardLabel = new Map<string, string>();
  for (const e of ledger) {
    counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
    if (e.kind === 'award') awardLabel.set(e.key, e.label);
  }

  const out: LedgerEntry[] = [];
  const emit = (
    key: string,
    kind: LedgerEntry['kind'],
    xp: number,
    coins: number,
    label: string,
  ) => {
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    const prev = net.get(key) ?? { xp: 0, coins: 0 };
    net.set(key, { xp: prev.xp + xp, coins: prev.coins + coins });
    out.push({ id: ledgerId(key, n), createdAt: now, updatedAt: now, key, kind, xp, coins, label });
  };

  const earned = new Set<string>();
  for (const a of awards.reversible) {
    earned.add(a.key);
    const prev = net.get(a.key);
    if (!prev || (prev.xp === 0 && prev.coins === 0)) emit(a.key, 'award', a.xp, a.coins, a.label);
  }

  for (const [key, total] of [...net]) {
    if (!key.startsWith('log:') || earned.has(key) || total.xp === 0) continue;
    emit(
      key,
      'reversal',
      negate(total.xp),
      negate(total.coins),
      `Removed: ${awardLabel.get(key) ?? key}`,
    );
  }

  for (const a of awards.oneTime) {
    if (!counts.has(a.key)) emit(a.key, 'award', a.xp, a.coins, a.label);
  }

  return out;
}
