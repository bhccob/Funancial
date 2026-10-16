import type { LocalDate } from './dates';
import type { Debt } from './entities';
import type { DataSnapshot } from './snapshot';

export type Buckets = { cash: number; savings: number; passive: number };

/**
 * Cash, savings and passive-income balances as of a day: the opening amounts plus every event
 * dated from the opening date through `asOf`. Card expenses don't touch cash (they raise the card).
 * An investment takes money out of its bucket, and a confirmed dividend puts it into the bucket it
 * went to (a reinvested one went into shares, so no bucket).
 */
export function bucketBalances(data: DataSnapshot, asOf: LocalDate): Buckets {
  const profile = data.tables.profile[0];
  const opening = profile?.openingDate ?? '0000-01-01';
  const counts = (d: LocalDate) => d >= opening && d <= asOf;
  const b: Buckets = {
    cash: profile?.openingCash ?? 0,
    savings: profile?.openingSavings ?? 0,
    passive: 0,
  };

  for (const i of data.tables.income) {
    if (i.status === 'confirmed' && counts(i.date)) b[i.bucket] += i.amount;
  }
  for (const e of data.tables.expense) {
    if (e.paymentMethod !== 'credit_card' && counts(e.date)) b.cash -= e.amount;
  }
  for (const t of data.tables.transaction) {
    if (!counts(t.date)) continue;
    switch (t.type) {
      case 'transfer':
        if (t.from) b[t.from] -= t.amount;
        if (t.to) b[t.to] += t.amount;
        break;
      case 'adjustment':
        if (t.to) b[t.to] += t.amount;
        break;
      case 'card_payment':
      case 'debt_payment':
      case 'investment':
        if (t.from) b[t.from] -= t.amount;
        break;
    }
  }
  for (const d of data.tables.dividend) {
    if (d.status === 'confirmed' && d.bucket && d.bucket !== 'reinvest' && counts(d.paidOn)) {
      b[d.bucket] += d.amount;
    }
  }
  return b;
}

/** What is owed on a card or loan as of a day. Negative means overpaid (a credit). */
export function debtBalance(debt: Debt, data: DataSnapshot, asOf: LocalDate): number {
  const counts = (d: LocalDate) => d >= debt.openingDate && d <= asOf;
  let balance = debt.openingBalance;
  if (debt.kind === 'credit_card') {
    for (const e of data.tables.expense) {
      if (e.paymentMethod === 'credit_card' && e.cardId === debt.id && counts(e.date)) {
        balance += e.amount;
      }
    }
  }
  for (const t of data.tables.transaction) {
    if (
      (t.type === 'card_payment' || t.type === 'debt_payment') &&
      t.debtId === debt.id &&
      counts(t.date)
    ) {
      balance -= t.amount;
    }
  }
  return balance;
}

export function netWorth(buckets: Buckets, debtTotal: number, investments = 0): number {
  return buckets.cash + buckets.savings + buckets.passive + investments - debtTotal;
}
