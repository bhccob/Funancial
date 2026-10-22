import { describe, expect, it } from 'vitest';
import { ACCOUNT_FROZEN, NO_ACCOUNT } from '@/domain/accounts';
import { accountBalance } from '@/domain/balances';
import type { DataSnapshot } from '@/domain/snapshot';
import { createFinanceActions } from '@/store/financeActions';
import { freshRealStore } from '@/test/realStore';
import { makeAccount, makeProfile } from '@/test/fixtures';
import { createLocalPaymentService } from './payment';

const MAIN = 'acct-main';
const VISA = 'card-1';
const TODAY = '2026-10-14';

/** Main account holding 1,000.00 and a Visa owing 100.00, both opened on Oct 1. */
async function setup() {
  const t = await freshRealStore();
  await t.store.getState().putMany([
    { table: 'profile', record: makeProfile({ openingDate: '2026-10-01', salary: null }) },
    {
      table: 'account',
      record: makeAccount({ id: MAIN, openingDate: '2026-10-01', openingBalance: 1_000_00 }),
    },
    {
      table: 'account',
      record: makeAccount({
        id: VISA,
        name: 'Visa',
        kind: 'credit',
        order: 1,
        inAvailable: false,
        openingDate: '2026-10-01',
        openingBalance: 100_00,
        credit: {
          limit: 3_000_00,
          statementDay: null,
          dueDay: 21,
          payInFull: true,
          minimumPayment: 0,
          interestRate: 0,
        },
      }),
    },
  ]);
  return { ...t, payments: createLocalPaymentService(createFinanceActions(t.store)) };
}

const balanceOf = (data: DataSnapshot, id: string) =>
  accountBalance(
    data.tables.account.find((a) => a.id === id)!,
    data,
    TODAY,
  );

const lunch = { amount: 12_50, category: 'food' as const, note: 'Lunch', date: TODAY };

describe('the local payment service', () => {
  it('pays 12.50 from Main account: its balance drops by exactly that, and the expense is returned', async () => {
    const { store, payments } = await setup();
    const expense = await payments.pay({ ...lunch, accountId: MAIN });
    expect(expense).toMatchObject({
      amount: 12_50,
      category: 'food',
      note: 'Lunch',
      date: TODAY,
      accountId: MAIN,
      recurrence: null,
      subscriptionId: null,
    });
    const data = store.getState().data;
    expect(data.tables.expense).toEqual([expense]);
    expect(balanceOf(data, MAIN)).toBe(1_000_00 - 12_50);
    // Nothing else moved, and no subscription was made.
    expect(balanceOf(data, VISA)).toBe(100_00);
    expect(data.tables.subscription).toEqual([]);
  });

  it('paying with the Visa raises what it owes by the amount', async () => {
    const { store, payments } = await setup();
    await payments.pay({ ...lunch, accountId: VISA });
    const data = store.getState().data;
    expect(balanceOf(data, VISA)).toBe(100_00 + 12_50);
    expect(balanceOf(data, MAIN)).toBe(1_000_00);
  });

  it('refuses a frozen card, and writes nothing', async () => {
    const { store, payments } = await setup();
    const visa = store.getState().data.tables.account.find((a) => a.id === VISA)!;
    await store.getState().put('account', { ...visa, frozen: true });
    await expect(payments.pay({ ...lunch, accountId: VISA })).rejects.toThrow(ACCOUNT_FROZEN);
    expect(store.getState().data.tables.expense).toEqual([]);
  });

  it('refuses an account that does not exist, and a day after today', async () => {
    const { store, payments } = await setup();
    await expect(payments.pay({ ...lunch, accountId: 'acct-gone' })).rejects.toThrow(NO_ACCOUNT);
    await expect(payments.pay({ ...lunch, accountId: MAIN, date: '2026-10-15' })).rejects.toThrow(
      'Use today or an earlier date.',
    );
    expect(store.getState().data.tables.expense).toEqual([]);
  });
});
