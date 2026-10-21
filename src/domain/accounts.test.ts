import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeDividend,
  makeExpense,
  makeIncome,
  makeSale,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { accountRemoval, activeAccounts, archivedBy, defaultsFor } from './accounts';
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
