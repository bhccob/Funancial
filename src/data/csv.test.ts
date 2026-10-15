import { describe, expect, it } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { makeDebt, makeExpense, makeSubscription } from '@/test/fixtures';
import { expensesToCsv } from './csv';

const HEADER = 'date,amount,currency,category,payment_method,card,note,subscription\r\n';

describe('expensesToCsv', () => {
  it('writes one quoted, CRLF-separated row per expense, oldest first', () => {
    const data = emptySnapshot();
    data.tables.debt.push(makeDebt({ id: 'card-1', name: 'Visa' }));
    data.tables.subscription.push(makeSubscription({ id: 'sub-1', name: 'Streamflix' }));
    data.tables.expense.push(
      makeExpense({
        id: 'b',
        amount: 15_99,
        date: '2026-10-20',
        category: 'entertainment',
        note: 'Streamflix',
        paymentMethod: 'debit',
        subscriptionId: 'sub-1',
      }),
      makeExpense({
        id: 'a',
        amount: 12_50,
        date: '2026-10-14',
        note: 'Lunch, "big"',
        paymentMethod: 'credit_card',
        cardId: 'card-1',
      }),
    );
    expect(expensesToCsv(data, 'USD')).toBe(
      HEADER +
        '2026-10-14,12.50,USD,food,credit_card,Visa,"Lunch, ""big""",\r\n' +
        '2026-10-20,15.99,USD,entertainment,debit,,Streamflix,Streamflix\r\n',
    );
  });

  it('uses the currency’s decimals and quotes line breaks', () => {
    const data = emptySnapshot();
    data.tables.expense.push(
      makeExpense({ id: 'x', amount: 1_234, date: '2026-10-01', note: 'two\nlines' }),
    );
    expect(expensesToCsv(data, 'JPY')).toBe(
      HEADER + '2026-10-01,1234,JPY,food,cash,,"two\nlines",\r\n',
    );
  });

  it('breaks ties on the same day by id', () => {
    const data = emptySnapshot();
    data.tables.expense.push(
      makeExpense({ id: 'z', date: '2026-10-01', note: 'second' }),
      makeExpense({ id: 'm', date: '2026-10-01', note: 'first' }),
    );
    const rows = expensesToCsv(data, 'USD').split('\r\n');
    expect(rows[1]).toContain('first');
    expect(rows[2]).toContain('second');
  });
});
