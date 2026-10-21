import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeIncome,
  makeProfile,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import type { Account, Income } from './entities';
import { emptySnapshot, type DataSnapshot } from './snapshot';
import { applyRecords, dueGenerated } from './sync';

const snapshot = (tables: Partial<DataSnapshot['tables']>): DataSnapshot => {
  const s = emptySnapshot();
  Object.assign(s.tables, tables);
  return s;
};

const card = makeAccount({
  id: 'card-x',
  name: 'Visa',
  kind: 'credit',
  skin: 'violet',
  inAvailable: false,
  order: 2,
  credit: {
    limit: null,
    statementDay: null,
    dueDay: 21,
    payInFull: true,
    minimumPayment: 0,
    interestRate: 0,
  },
});

describe('subscription renewals', () => {
  const sub = makeSubscription({
    id: 'sub-a',
    name: 'Streamflix',
    amount: 15_99,
    nextRenewal: '2026-08-31',
    anchorDay: 31,
  });

  it('charges every renewal up to today and moves the next renewal past today', () => {
    const data = snapshot({ subscription: [sub] });
    const out = dueGenerated(data, '2026-10-14');
    const expenses = out.filter((r) => r.table === 'expense').map((r) => r.record);
    expect(expenses.map((e) => [e.id, e.date, e.amount])).toEqual([
      ['sub-sub-a-2026-08-31', '2026-08-31', 15_99],
      ['sub-sub-a-2026-09-30', '2026-09-30', 15_99],
    ]);
    expect(expenses[0]).toMatchObject({
      subscriptionId: 'sub-a',
      note: 'Streamflix',
      category: 'entertainment',
      accountId: 'acct-main',
    });
    const updated = out.find((r) => r.table === 'subscription')?.record;
    expect(updated).toMatchObject({ id: 'sub-a', nextRenewal: '2026-10-31' });
  });

  it('charges each renewal to the account the subscription is paid with', () => {
    const onCard = { ...sub, accountId: 'card-x' };
    const out = dueGenerated(snapshot({ account: [card], subscription: [onCard] }), '2026-10-14');
    const expenses = out.filter((r) => r.table === 'expense').map((r) => r.record);
    expect(expenses.map((e) => e.accountId)).toEqual(['card-x', 'card-x']);
  });

  it('is idempotent', () => {
    const data = snapshot({ subscription: [sub] });
    const once = applyRecords(data, dueGenerated(data, '2026-10-14'));
    expect(dueGenerated(once, '2026-10-14')).toEqual([]);
  });

  it('ignores cancelled subscriptions', () => {
    const data = snapshot({ subscription: [{ ...sub, status: 'cancelled' }] });
    expect(dueGenerated(data, '2026-10-14')).toEqual([]);
  });
});

/** Main account, named as the default as setup and the v10 upgrade name it. */
const withMain = (accounts: Account[] = [makeAccount()]) => ({
  account: accounts,
  settings: [makeSettings({ defaultAccountId: 'acct-main' })],
});

describe('expected salary', () => {
  const profile = makeProfile({
    openingDate: '2026-08-15',
    salary: { monthlyAmount: 4_200_00, payDay: 25 },
  });
  const august = makeIncome({ amount: 4_200_00, date: '2026-08-25', period: '2026-08' });

  it('adds an expected salary for each pay day reached without one', () => {
    const data = snapshot({ ...withMain(), profile: [profile], income: [august] });
    const out = dueGenerated(data, '2026-10-14');
    expect(out.map((r) => r.record)).toEqual([
      expect.objectContaining({
        id: 'salary-2026-09',
        date: '2026-09-25',
        amount: 4_200_00,
        status: 'expected',
        source: 'salary',
        period: '2026-09',
        accountId: 'acct-main',
      }),
    ]);
  });

  it('clamps pay day 31 and waits for the first pay day after opening', () => {
    const p31 = {
      ...profile,
      openingDate: '2026-09-01',
      salary: { monthlyAmount: 100_00, payDay: 31 },
    };
    expect(
      dueGenerated(snapshot({ ...withMain(), profile: [p31] }), '2026-10-14')[0]?.record,
    ).toMatchObject({ date: '2026-09-30' });
    const late = { ...profile, openingDate: '2026-10-20' };
    expect(dueGenerated(snapshot({ ...withMain(), profile: [late] }), '2026-10-24')).toEqual([]);
  });
});

describe('expected salary: only for pay you could still be waiting for', () => {
  const salary = { monthlyAmount: 4_200_00, payDay: 25 };

  it('does not expect pay on the opening day: it is already in the opening balance', () => {
    const p = makeProfile({ openingDate: '2026-10-25', salary });
    expect(dueGenerated(snapshot({ ...withMain(), profile: [p] }), '2026-10-25')).toEqual([]);
  });

  it('does not backfill months from before the salary was set', () => {
    const p = makeProfile({
      openingDate: '2026-06-01',
      salary: { ...salary, since: '2026-10-14' },
    });
    const data = snapshot({ ...withMain(), profile: [p] });
    expect(dueGenerated(data, '2026-10-14')).toEqual([]);
    expect(dueGenerated(data, '2026-10-25').map((r) => r.record.id)).toEqual(['salary-2026-10']);
  });

  it('keeps a month marked as not arrived from coming back', () => {
    const p = makeProfile({ openingDate: '2026-09-01', salary });
    const skipped = makeIncome({
      id: 'salary-2026-09',
      amount: 4_200_00,
      date: '2026-09-25',
      status: 'skipped',
      period: '2026-09',
    });
    const out = dueGenerated(
      snapshot({ ...withMain(), profile: [p], income: [skipped] }),
      '2026-10-14',
    );
    expect(out).toEqual([]);
  });
});

describe('default account falls back', () => {
  const profile = makeProfile({
    openingDate: '2026-09-01',
    salary: { monthlyAmount: 4_200_00, payDay: 25 },
  });
  const cash = makeAccount({ id: 'acct-cash', name: 'Wallet', kind: 'cash', order: 2 });
  const savings = makeAccount({ id: 'acct-savings', kind: 'savings', order: 1 });
  const salaryTo = (data: DataSnapshot) =>
    dueGenerated(data, '2026-10-14')
      .filter((r) => r.table === 'income')
      .map((r) => (r.record as Income).accountId);

  it('an expected salary lands on the first debit or cash account in use when the default is archived', () => {
    const archived = makeAccount({ archivedOn: '2026-09-10' });
    const data = snapshot({ ...withMain([archived, savings, cash]), profile: [profile] });
    expect(salaryTo(data)).toEqual(['acct-cash']);
  });

  it('makes no salary when there is no account for it to land on', () => {
    const archived = makeAccount({ archivedOn: '2026-09-10' });
    expect(
      salaryTo(snapshot({ ...withMain([archived, savings, card]), profile: [profile] })),
    ).toEqual([]);
    expect(salaryTo(snapshot({ profile: [profile] }))).toEqual([]);
  });

  it('still charges renewals with no default account', () => {
    const sub = makeSubscription({ id: 'sub-a', nextRenewal: '2026-10-03' });
    const out = dueGenerated(snapshot({ profile: [profile], subscription: [sub] }), '2026-10-14');
    expect(out.filter((r) => r.table === 'expense').map((r) => r.record.id)).toEqual([
      'sub-sub-a-2026-10-03',
    ]);
  });
});
