import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeDividend,
  makeExpense,
  makeIncome,
  makeSale,
  makeSettings,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import {
  ACCOUNT_ARCHIVED,
  accountInUse,
  accountRemoval,
  activeAccounts,
  archivedBy,
  CREDIT_CANT_PAY,
  defaultAccount,
  defaultsFor,
  NO_ACCOUNT,
  payingAccount,
} from './accounts';
import type { Account } from './entities';
import { emptySnapshot, type DataSnapshot } from './snapshot';

describe('archivedBy', () => {
  it('is true from the day it was archived on, and never without one', () => {
    const card = makeAccount({ id: 'card-b', archivedOn: '2026-09-01' });
    expect(archivedBy(card, '2026-08-31')).toBe(false);
    expect(archivedBy(card, '2026-09-01')).toBe(true);
    expect(archivedBy(card, '2026-10-20')).toBe(true);
    expect(archivedBy(makeAccount(), '2099-12-31')).toBe(false);
  });
});

describe('activeAccounts', () => {
  it('leaves out the archived ones and sorts the rest by order', () => {
    const accounts = [
      makeAccount({ id: 'c', order: 2 }),
      makeAccount({ id: 'gone', order: 0, archivedOn: '2026-09-01' }),
      makeAccount({ id: 'a', order: 0 }),
      makeAccount({ id: 'b', order: 1 }),
    ];
    const before = accounts.map((a) => a.id);
    expect(activeAccounts(accounts, '2026-10-20').map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(activeAccounts(accounts, '2026-08-31').map((a) => a.id)).toEqual([
      'gone',
      'a',
      'b',
      'c',
    ]);
    expect(accounts.map((a) => a.id)).toEqual(before);
  });
});

describe('defaultsFor', () => {
  it('gives each kind its look and whether it counts in Available', () => {
    expect(defaultsFor('debit')).toEqual({ skin: 'midnight', inAvailable: true });
    expect(defaultsFor('cash')).toEqual({ skin: 'amber', inAvailable: true });
    expect(defaultsFor('savings')).toEqual({ skin: 'mint', inAvailable: false });
    expect(defaultsFor('credit')).toEqual({ skin: 'violet', inAvailable: false });
  });

  it('hands each caller its own copy', () => {
    const a = defaultsFor('debit');
    a.skin = 'changed';
    expect(defaultsFor('debit').skin).toBe('midnight');
  });
});

describe('accountRemoval', () => {
  const ID = 'acct-x';
  const data = (tables: Partial<DataSnapshot['tables']> = {}): DataSnapshot => {
    const s = emptySnapshot();
    s.tables = { ...s.tables, account: [makeAccount({ id: ID })], ...tables };
    return s;
  };

  it('finds the subscriptions it pays, and removes an account without history', () => {
    const subs = [
      makeSubscription({ id: 's1', accountId: ID }),
      makeSubscription({ id: 's2', accountId: ID, status: 'cancelled' }),
      makeSubscription({ id: 's3', accountId: 'acct-main' }),
    ];
    const out = accountRemoval(data({ subscription: subs }), ID);
    expect(out.subscriptions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(out.archive).toBe(false);
  });

  it('archives an account that history names', () => {
    const named: Array<[string, Partial<DataSnapshot['tables']>]> = [
      ['an expense', { expense: [makeExpense({ accountId: ID })] }],
      ['an income', { income: [makeIncome({ accountId: ID })] }],
      ['a transfer out', { transaction: [makeTransaction({ fromAccountId: ID })] }],
      ['a transfer in', { transaction: [makeTransaction({ toAccountId: ID })] }],
      ['a dividend', { dividend: [makeDividend({ accountId: ID })] }],
      ['a sale', { sale: [makeSale({ toAccountId: ID })] }],
    ];
    for (const [what, tables] of named) {
      expect(accountRemoval(data(tables), ID).archive, what).toBe(true);
    }
  });

  it('does not archive for history on another account', () => {
    const tables = {
      expense: [makeExpense()],
      income: [makeIncome()],
      transaction: [makeTransaction()],
      dividend: [makeDividend()],
      sale: [makeSale()],
    };
    expect(accountRemoval(data(tables), ID)).toEqual({ subscriptions: [], archive: false });
  });
});

describe('defaultAccount', () => {
  const DAY = '2026-10-20';
  const main = makeAccount({ id: 'acct-main', order: 0 });
  const savings = makeAccount({ id: 'acct-savings', kind: 'savings', order: 1 });
  const cash = makeAccount({ id: 'acct-cash', kind: 'cash', order: 2 });
  const card = makeAccount({
    id: 'card-1',
    kind: 'credit',
    order: 3,
    credit: {
      limit: null,
      statementDay: null,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 0,
      interestRate: 0,
    },
  });
  const data = (accounts: Account[], defaultAccountId: string | null): DataSnapshot => {
    const s = emptySnapshot();
    s.tables.account = accounts;
    s.tables.settings = [makeSettings({ defaultAccountId })];
    return s;
  };
  const idOf = (d: DataSnapshot) => defaultAccount(d, DAY)?.id ?? null;

  it("is the settings' default while it is in use and not a credit card", () => {
    expect(idOf(data([main, savings, cash], 'acct-main'))).toBe('acct-main');
    expect(idOf(data([main, savings, cash], 'acct-savings'))).toBe('acct-savings');
  });

  it('default account falls back', () => {
    const archivedMain = { ...main, archivedOn: '2026-10-01' };
    // The default archived, or gone: the first debit or cash account still in use, by order.
    expect(idOf(data([cash, savings, archivedMain], 'acct-main'))).toBe('acct-cash');
    expect(idOf(data([savings, cash], 'acct-main'))).toBe('acct-cash');
    // Archived only from a later day: still the default today.
    expect(idOf(data([{ ...main, archivedOn: '2026-10-21' }, cash], 'acct-main'))).toBe(
      'acct-main',
    );
    // None named, or a credit card named: by order, never savings or a card.
    expect(idOf(data([{ ...cash, order: 5 }, savings, main], null))).toBe('acct-main');
    expect(idOf(data([card, savings, cash], 'card-1'))).toBe('acct-cash');
    // Nothing to fall back to.
    expect(idOf(data([archivedMain, savings, card], 'acct-main'))).toBeNull();
    expect(idOf(data([], null))).toBeNull();
  });

  it('works without settings', () => {
    const s = data([savings, cash], null);
    s.tables.settings = [];
    expect(defaultAccount(s, DAY)?.id).toBe('acct-cash');
  });
});

describe('accountInUse and payingAccount', () => {
  const DAY = '2026-10-20';
  const main = makeAccount({ id: 'acct-main' });
  const savings = makeAccount({ id: 'acct-savings', kind: 'savings' });
  const cash = makeAccount({ id: 'acct-cash', kind: 'cash' });
  const card = makeAccount({ id: 'card-1', kind: 'credit' });
  const old = makeAccount({ id: 'acct-old', archivedOn: '2026-10-01' });
  const oldCard = makeAccount({ id: 'card-old', kind: 'credit', archivedOn: '2026-10-01' });
  const later = makeAccount({ id: 'acct-later', archivedOn: '2026-10-21' });
  const data = (): DataSnapshot => {
    const s = emptySnapshot();
    s.tables.account = [main, savings, cash, card, old, oldCard, later];
    return s;
  };

  it('has the messages the actions say', () => {
    expect(NO_ACCOUNT).toBe("That account doesn't exist.");
    expect(ACCOUNT_ARCHIVED).toBe('That account is no longer in use.');
    expect(CREDIT_CANT_PAY).toBe('Only a bank account, cash or savings can pay.');
  });

  it('accountInUse returns an account that exists and is not archived by the day', () => {
    for (const a of [main, savings, cash, card, later]) {
      expect(accountInUse(data(), a.id, DAY)).toBe(a);
    }
  });

  it('accountInUse refuses one that is gone, or archived by the day, a card included', () => {
    expect(() => accountInUse(data(), 'acct-gone', DAY)).toThrow(NO_ACCOUNT);
    expect(() => accountInUse(data(), 'acct-old', DAY)).toThrow(ACCOUNT_ARCHIVED);
    expect(() => accountInUse(data(), 'card-old', DAY)).toThrow(ACCOUNT_ARCHIVED);
    // Archived on the day itself counts as archived.
    expect(() => accountInUse(data(), 'acct-later', '2026-10-21')).toThrow(ACCOUNT_ARCHIVED);
  });

  it('payingAccount returns a bank account, cash or savings in use', () => {
    for (const a of [main, savings, cash, later]) {
      expect(payingAccount(data(), a.id, DAY)).toBe(a);
    }
  });

  it('payingAccount refuses a credit card, then what accountInUse refuses', () => {
    expect(() => payingAccount(data(), 'card-1', DAY)).toThrow(CREDIT_CANT_PAY);
    expect(() => payingAccount(data(), 'acct-gone', DAY)).toThrow(NO_ACCOUNT);
    expect(() => payingAccount(data(), 'acct-old', DAY)).toThrow(ACCOUNT_ARCHIVED);
    // An archived card is told it is archived, as accountInUse says, before it is told it is a card.
    expect(() => payingAccount(data(), 'card-old', DAY)).toThrow(ACCOUNT_ARCHIVED);
  });
});
