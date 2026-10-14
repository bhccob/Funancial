import { describe, expect, it } from 'vitest';
import { ex } from './examples';
import { applyRecords, dueGenerated } from './sync';

describe('subscription renewals', () => {
  const sub = ex.subscription({
    id: 'sub-a',
    name: 'Streamflix',
    amount: 15_99,
    nextRenewal: '2026-08-31',
    anchorDay: 31,
  });

  it('charges every renewal up to today and moves the next renewal past today', () => {
    const data = ex.snapshot({ subscription: [sub] });
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
      paymentMethod: 'debit',
    });
    const updated = out.find((r) => r.table === 'subscription')?.record;
    expect(updated).toMatchObject({ id: 'sub-a', nextRenewal: '2026-10-31' });
  });

  it('is idempotent', () => {
    const data = ex.snapshot({ subscription: [sub] });
    const once = applyRecords(data, dueGenerated(data, '2026-10-14'));
    expect(dueGenerated(once, '2026-10-14')).toEqual([]);
  });

  it('ignores cancelled subscriptions', () => {
    const data = ex.snapshot({ subscription: [{ ...sub, status: 'cancelled' }] });
    expect(dueGenerated(data, '2026-10-14')).toEqual([]);
  });
});

describe('expected salary', () => {
  const profile = ex.profile({
    openingDate: '2026-08-15',
    salary: { monthlyAmount: 4_200_00, payDay: 25 },
  });
  const august = ex.income({ amount: 4_200_00, date: '2026-08-25', period: '2026-08' });

  it('adds an expected salary for each pay day reached without one', () => {
    const data = ex.snapshot({ profile: [profile], income: [august] });
    const out = dueGenerated(data, '2026-10-14');
    expect(out.map((r) => r.record)).toEqual([
      expect.objectContaining({
        id: 'salary-2026-09',
        date: '2026-09-25',
        amount: 4_200_00,
        status: 'expected',
        source: 'salary',
        period: '2026-09',
        bucket: 'cash',
      }),
    ]);
  });

  it('reduces the expected amount by a freeze in that month', () => {
    const freeze = ex.freeze({ start: '2026-09-08', end: '2026-09-12', lostAmount: 700_00 });
    const data = ex.snapshot({ profile: [profile], income: [august], salaryFreeze: [freeze] });
    expect(dueGenerated(data, '2026-10-14')[0]?.record).toMatchObject({ amount: 3_500_00 });
  });

  it('clamps pay day 31 and waits for the first pay day after opening', () => {
    const p31 = {
      ...profile,
      openingDate: '2026-09-01',
      salary: { monthlyAmount: 100_00, payDay: 31 },
    };
    expect(dueGenerated(ex.snapshot({ profile: [p31] }), '2026-10-14')[0]?.record).toMatchObject({
      date: '2026-09-30',
    });
    const late = { ...profile, openingDate: '2026-10-20' };
    expect(dueGenerated(ex.snapshot({ profile: [late] }), '2026-10-24')).toEqual([]);
  });
});
