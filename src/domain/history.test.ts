import { describe, expect, it } from 'vitest';
import { makeDividend, makeExpense, makeIncome, makeSale, makeTransaction } from '@/test/fixtures';
import { entryDate, historyEntries, movesMoneyOn, type Entry } from './history';
import { emptySnapshot } from './snapshot';

/** An ISO timestamp `minute` minutes into 1 Oct, to order rows made on the same day. */
const at = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

describe('historyEntries', () => {
  it('is empty with nothing recorded', () => {
    expect(historyEntries(emptySnapshot())).toEqual([]);
  });

  it('holds every kind of entry, the row itself with its kind', () => {
    const data = emptySnapshot();
    const expense = makeExpense({ id: 'e', date: '2026-10-05' });
    const income = makeIncome({ id: 'i', date: '2026-10-04' });
    const transaction = makeTransaction({ id: 't', date: '2026-10-03' });
    const dividend = makeDividend({ id: 'd', paidOn: '2026-10-02' });
    const sale = makeSale({ id: 's', soldOn: '2026-10-01' });
    data.tables.sale.push(sale);
    data.tables.dividend.push(dividend);
    data.tables.transaction.push(transaction);
    data.tables.income.push(income);
    data.tables.expense.push(expense);
    expect(historyEntries(data)).toEqual([
      { kind: 'expense', item: expense },
      { kind: 'income', item: income },
      { kind: 'transaction', item: transaction },
      { kind: 'dividend', item: dividend },
      { kind: 'sale', item: sale },
    ]);
  });

  it('puts the newest day first, a dividend by when it was paid and a sale by when it was sold', () => {
    const data = emptySnapshot();
    data.tables.expense.push(makeExpense({ id: 'old', date: '2026-09-30' }));
    data.tables.dividend.push(makeDividend({ id: 'div', paidOn: '2026-10-08' }));
    data.tables.sale.push(makeSale({ id: 'sale', soldOn: '2026-10-06' }));
    data.tables.income.push(makeIncome({ id: 'inc', date: '2026-10-07' }));
    expect(historyEntries(data).map((e) => e.item.id)).toEqual(['div', 'inc', 'sale', 'old']);
  });

  it('puts the one made last first within a day', () => {
    const data = emptySnapshot();
    data.tables.expense.push(
      makeExpense({ id: 'first', date: '2026-10-05', createdAt: at(1) }),
      makeExpense({ id: 'third', date: '2026-10-05', createdAt: at(30) }),
    );
    data.tables.income.push(makeIncome({ id: 'second', date: '2026-10-05', createdAt: at(15) }));
    expect(historyEntries(data).map((e) => e.item.id)).toEqual(['third', 'second', 'first']);
  });

  it('keeps expenses, income, transfers, dividends and sales in that order when day and time match', () => {
    const data = emptySnapshot();
    const same = { createdAt: at(0), updatedAt: at(0) };
    data.tables.sale.push(makeSale({ id: 's', soldOn: '2026-10-05', ...same }));
    data.tables.dividend.push(makeDividend({ id: 'd', paidOn: '2026-10-05', ...same }));
    data.tables.transaction.push(makeTransaction({ id: 't', date: '2026-10-05', ...same }));
    data.tables.income.push(makeIncome({ id: 'i', date: '2026-10-05', ...same }));
    data.tables.expense.push(makeExpense({ id: 'e', date: '2026-10-05', ...same }));
    expect(historyEntries(data).map((e) => e.item.id)).toEqual(['e', 'i', 't', 'd', 's']);
  });

  it('leaves the tables as they were', () => {
    const data = emptySnapshot();
    data.tables.expense.push(
      makeExpense({ id: 'a', date: '2026-10-01' }),
      makeExpense({ id: 'b', date: '2026-10-09' }),
    );
    historyEntries(data);
    expect(data.tables.expense.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('entryDate', () => {
  it('is the day the entry belongs to', () => {
    expect(entryDate({ kind: 'expense', item: makeExpense({ date: '2026-10-05' }) })).toBe(
      '2026-10-05',
    );
    expect(entryDate({ kind: 'income', item: makeIncome({ date: '2026-10-04' }) })).toBe(
      '2026-10-04',
    );
    expect(entryDate({ kind: 'transaction', item: makeTransaction({ date: '2026-10-03' }) })).toBe(
      '2026-10-03',
    );
    expect(entryDate({ kind: 'dividend', item: makeDividend({ paidOn: '2026-10-02' }) })).toBe(
      '2026-10-02',
    );
    expect(entryDate({ kind: 'sale', item: makeSale({ soldOn: '2026-10-01' }) })).toBe(
      '2026-10-01',
    );
  });
});

describe('movesMoneyOn', () => {
  const on = (entry: Entry) => ['a', 'b'].filter((id) => movesMoneyOn(entry, id));

  it('is the account an expense, an income or a dividend is on', () => {
    expect(on({ kind: 'expense', item: makeExpense({ accountId: 'a' }) })).toEqual(['a']);
    expect(on({ kind: 'income', item: makeIncome({ accountId: 'b' }) })).toEqual(['b']);
    expect(on({ kind: 'dividend', item: makeDividend({ accountId: 'a' }) })).toEqual(['a']);
    expect(on({ kind: 'dividend', item: makeDividend({ accountId: null }) })).toEqual([]);
  });

  it('is the account a sale was paid into', () => {
    expect(on({ kind: 'sale', item: makeSale({ toAccountId: 'b' }) })).toEqual(['b']);
  });

  it('is both ends of a transaction, and the one end a purchase or a correction has', () => {
    const move = (fromAccountId: string | null, toAccountId: string | null) =>
      on({ kind: 'transaction', item: makeTransaction({ fromAccountId, toAccountId }) });
    expect(move('a', 'b')).toEqual(['a', 'b']);
    expect(move(null, 'b')).toEqual(['b']);
    expect(move('a', null)).toEqual(['a']);
  });
});
