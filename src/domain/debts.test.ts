import { describe, expect, it } from 'vitest';
import { makeDebt, makeTransaction } from '@/test/fixtures';
import { activeDebts, archivedBy, loanRemoval } from './debts';
import { emptySnapshot } from './snapshot';

describe('loans', () => {
  it('are archived from the day they were archived on', () => {
    const loan = makeDebt({ archivedOn: '2026-09-01' });
    expect(archivedBy(loan, '2026-08-31')).toBe(false);
    expect(archivedBy(loan, '2026-09-01')).toBe(true);
    expect(archivedBy(makeDebt(), '2099-12-31')).toBe(false);
  });

  it('in use are the ones not archived', () => {
    const debts = [makeDebt({ id: 'a' }), makeDebt({ id: 'b', archivedOn: '2026-09-01' })];
    expect(activeDebts(debts).map((d) => d.id)).toEqual(['a']);
  });

  it('are archived on removal only when a payment names them', () => {
    const data = emptySnapshot();
    data.tables.debt = [makeDebt({ id: 'loan-1' })];
    expect(loanRemoval(data, 'loan-1')).toEqual({ archive: false });

    data.tables.transaction = [
      makeTransaction({
        type: 'debt_payment',
        fromAccountId: 'acct-main',
        toAccountId: null,
        debtId: 'loan-2',
      }),
    ];
    expect(loanRemoval(data, 'loan-1')).toEqual({ archive: false });

    data.tables.transaction.push(
      makeTransaction({
        type: 'debt_payment',
        fromAccountId: 'acct-main',
        toAccountId: null,
        debtId: 'loan-1',
      }),
    );
    expect(loanRemoval(data, 'loan-1')).toEqual({ archive: true });
  });
});
