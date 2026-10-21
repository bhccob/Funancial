import type { RawTables } from '../migrations';

/**
 * The v10 upgrade: accounts replace the cash, savings and passive buckets and the credit-card
 * debts, and the tables of three retired features go. It is the one upgrade that looks across
 * tables, because it builds accounts out of the profile and the debts.
 *
 * It runs before validation, on rows as they were stored, so it reads every field defensively: a
 * row it cannot read passes through as it was, and it never throws. A card id that names no card
 * is kept as the account id, so the row still validates and its history keeps the name.
 */

export const MAIN_ACCOUNT_ID = 'acct-main';
export const SAVINGS_ACCOUNT_ID = 'acct-savings';
export const PASSIVE_ACCOUNT_ID = 'acct-passive';

/** The tables of Salary freeze, "Should I buy it?" and About you, whose rows v10 drops. */
export const V10_DROPPED_TABLES = ['salaryFreeze', 'buyDecision', 'aboutYou'] as const;

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

const rowsOf = (tables: RawTables, table: string): Row[] => {
  const rows: unknown = tables[table];
  return Array.isArray(rows) ? rows.filter(isRow) : [];
};

const omit = (row: Row, ...keys: string[]): Row => {
  const out = { ...row };
  for (const key of keys) delete out[key];
  return out;
};

/** The account a v9 bucket became; null for no bucket, or anything that is not one. */
function bucketAccount(bucket: unknown): string | null {
  switch (bucket) {
    case 'cash':
      return MAIN_ACCOUNT_ID;
    case 'savings':
      return SAVINGS_ACCOUNT_ID;
    case 'passive':
      return PASSIVE_ACCOUNT_ID;
    default:
      return null;
  }
}

const isCard = (debt: unknown): debt is Row => isRow(debt) && debt.kind === 'credit_card';

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Oldest card first, then by id: stored rows come back in the storage's order and an account copy
 * in its own, so the cards' order must not come from either.
 */
const byCreation = (a: Row, b: Row): number =>
  compare(text(a.createdAt), text(b.createdAt)) || compare(text(a.id), text(b.id));

/** Whether anything was ever paid into or out of the passive bucket. */
function namesPassive(tables: RawTables): boolean {
  return (
    rowsOf(tables, 'transaction').some((t) => t.from === 'passive' || t.to === 'passive') ||
    rowsOf(tables, 'dividend').some((d) => d.bucket === 'passive') ||
    rowsOf(tables, 'sale').some((s) => s.to === 'passive')
  );
}

/**
 * Main account and Savings from the profile's openings, and Passive income when something names
 * it, each opened when the profile was. None without a profile.
 */
function bucketAccounts(profile: Row | undefined, passive: boolean): Row[] {
  if (!profile) return [];
  const account = (
    id: string,
    name: string,
    kind: 'debit' | 'savings',
    skin: string,
    openingBalance: unknown,
    inAvailable: boolean,
    order: number,
  ): Row => ({
    id,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    name,
    kind,
    skin,
    last4: null,
    openingBalance,
    openingDate: profile.openingDate,
    inAvailable,
    frozen: false,
    order,
    credit: null,
  });
  return [
    account(MAIN_ACCOUNT_ID, 'Main account', 'debit', 'midnight', profile.openingCash, true, 0),
    account(SAVINGS_ACCOUNT_ID, 'Savings', 'savings', 'mint', profile.openingSavings, false, 1),
    ...(passive
      ? [account(PASSIVE_ACCOUNT_ID, 'Passive income', 'savings', 'amber', 0, false, 2)]
      : []),
  ];
}

/** A credit-card debt as a credit account with the same id, after the bucket accounts. */
function cardAccount(debt: Row, i: number): Row {
  return {
    id: debt.id,
    createdAt: debt.createdAt,
    updatedAt: debt.updatedAt,
    name: debt.name,
    kind: 'credit',
    skin: 'violet',
    last4: null,
    openingBalance: debt.openingBalance,
    openingDate: debt.openingDate,
    inAvailable: false,
    frozen: false,
    order: 3 + i,
    ...(debt.archivedOn !== undefined ? { archivedOn: debt.archivedOn } : {}),
    credit: {
      limit: debt.creditLimit,
      statementDay: debt.statementDay,
      dueDay: debt.dueDay,
      payInFull: debt.payInFull,
      minimumPayment: debt.minimumPayment,
      interestRate: debt.interestRate,
    },
  };
}

/** An expense or subscription: on its card when paid by credit card, else on Main account. */
const paidWith = (r: Row): Row => ({
  ...omit(r, 'paymentMethod', 'cardId'),
  accountId: r.paymentMethod === 'credit_card' ? r.cardId : MAIN_ACCOUNT_ID,
});

const income = (r: Row): Row => ({
  ...omit(r, 'bucket'),
  accountId: r.bucket === 'savings' ? SAVINGS_ACCOUNT_ID : MAIN_ACCOUNT_ID,
});

/** Buckets become accounts; a card payment goes into the card's account and names no debt. */
function transaction(r: Row): Row {
  const out: Row = {
    ...omit(r, 'from', 'to'),
    fromAccountId: bucketAccount(r.from),
    toAccountId: bucketAccount(r.to),
  };
  if (r.type === 'card_payment') {
    out.toAccountId = r.debtId ?? null;
    out.debtId = null;
  }
  return out;
}

const dividend = (r: Row): Row => ({
  ...omit(r, 'bucket'),
  accountId: bucketAccount(r.bucket),
  reinvested: r.bucket === 'reinvest',
});

const sale = (r: Row): Row => ({ ...omit(r, 'to'), toAccountId: bucketAccount(r.to) });

/** The default account is Main when there is one; the retired reminder switches go. */
const settings =
  (hasProfile: boolean) =>
  (r: Row): Row => ({
    ...r,
    ...(isRow(r.reminders) ? { reminders: omit(r.reminders, 'freeze', 'buyIt') } : {}),
    defaultAccountId: hasProfile ? MAIN_ACCOUNT_ID : null,
  });

/** `table`'s rows through `upgrade`; a table that is not a list, or a row that is not a record, stays. */
function mapRows(tables: RawTables, table: string, upgrade: (r: Row) => Row): void {
  const rows: unknown = tables[table];
  if (Array.isArray(rows)) tables[table] = rows.map((r) => (isRow(r) ? upgrade(r) : r));
}

export function upgradeToV10(tables: RawTables): RawTables {
  const profile = rowsOf(tables, 'profile')[0];
  const debts: unknown = tables.debt;
  const cards = Array.isArray(debts) ? debts.filter(isCard).sort(byCreation) : [];

  const out: RawTables = { ...tables };
  for (const table of V10_DROPPED_TABLES) delete out[table];
  out.account = [...bucketAccounts(profile, namesPassive(tables)), ...cards.map(cardAccount)];
  if (Array.isArray(debts)) out.debt = debts.filter((d) => !isCard(d));

  mapRows(out, 'profile', (p) => omit(p, 'openingCash', 'openingSavings'));
  mapRows(out, 'settings', settings(profile !== undefined));
  mapRows(out, 'expense', paidWith);
  mapRows(out, 'subscription', paidWith);
  mapRows(out, 'income', income);
  mapRows(out, 'transaction', transaction);
  mapRows(out, 'dividend', dividend);
  mapRows(out, 'sale', sale);
  return out;
}
