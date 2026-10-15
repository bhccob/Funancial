import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeCheckIn,
  makeExpense,
  makeIncome,
  makeLimit,
  makeSubscription,
} from '@/test/fixtures';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import { activeDays, createSpendIndex, loggedEntries, localDay } from './activity';

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

describe('localDay', () => {
  it('reads a timestamp as its local day', () => {
    expect(localDay(localIso('2026-10-15', 23))).toBe('2026-10-15');
    expect(localDay(localIso('2026-10-16', 0))).toBe('2026-10-16');
  });
});

describe('loggedEntries', () => {
  it('logs what the person entered, not subscription charges or salary', () => {
    const data = snap({
      expense: [
        makeExpense({ id: 'e1', createdAt: localIso('2026-10-15', 9) }),
        makeExpense({ id: 'e2', subscriptionId: 'sub1', createdAt: localIso('2026-10-15', 10) }),
      ],
      income: [
        makeIncome({ id: 'i1', source: 'extra', createdAt: localIso('2026-10-15', 11) }),
        makeIncome({ id: 'i2', source: 'salary', createdAt: localIso('2026-10-15', 12) }),
      ],
      subscription: [makeSubscription({ id: 'sub1' })],
    });
    expect(loggedEntries(data)).toEqual([
      { table: 'expense', id: 'e1', createdAt: localIso('2026-10-15', 9), day: '2026-10-15' },
      { table: 'income', id: 'i1', createdAt: localIso('2026-10-15', 11), day: '2026-10-15' },
    ]);
  });

  it('sorts by creation time, then by id', () => {
    const at = localIso('2026-10-15', 9);
    const data = snap({
      expense: [
        makeExpense({ id: 'b', createdAt: at }),
        makeExpense({ id: 'z', createdAt: localIso('2026-10-14', 20) }),
        makeExpense({ id: 'a', createdAt: at }),
      ],
      income: [makeIncome({ id: 'c', source: 'extra', createdAt: at })],
    });
    expect(loggedEntries(data).map((e) => e.id)).toEqual(['z', 'a', 'b', 'c']);
  });

  it('puts an entry on the day it was created, not the day it is dated', () => {
    const data = snap({
      expense: [makeExpense({ id: 'e1', date: '2026-10-01', createdAt: localIso('2026-10-15') })],
    });
    expect(loggedEntries(data)[0]!.day).toBe('2026-10-15');
  });
});

describe('activeDays', () => {
  it('counts a no-spend check-in as an active day', () => {
    const data = snap({
      expense: [makeExpense({ createdAt: localIso('2026-10-14') })],
      checkIn: [makeCheckIn({ kind: 'no-spend', date: '2026-10-15' })],
    });
    expect(activeDays(data)).toEqual(new Set(['2026-10-14', '2026-10-15']));
  });

  it('ignores a weekly check-in and a subscription charge', () => {
    const data = snap({
      expense: [makeExpense({ subscriptionId: 'sub1', createdAt: localIso('2026-10-14') })],
      checkIn: [makeCheckIn({ kind: 'weekly', date: '2026-10-12' })],
    });
    expect(activeDays(data).size).toBe(0);
  });
});

describe('createSpendIndex', () => {
  const foodLimit = makeLimit({
    id: 'l1',
    scope: 'category',
    category: 'food',
    period: 'monthly',
    amount: 100_00,
    createdAt: localIso('2026-10-01'),
  });
  const spending = [
    makeExpense({ category: 'food', amount: 60_00, date: '2026-10-05' }),
    makeExpense({ category: 'food', amount: 50_00, date: '2026-10-20' }),
  ];

  it('is over only past the amount, within the period, and only for limits that existed', () => {
    const index = createSpendIndex(snap({ budgetLimit: [foodLimit], expense: spending }), 1);
    expect(index.overOn('2026-10-19')).toBe(false);
    expect(index.overOn('2026-10-20')).toBe(true);
    expect(index.overOn('2026-11-01')).toBe(false);
    expect(index.overOn('2026-09-30')).toBe(false);
  });

  it('is not over when spending exactly the amount', () => {
    const index = createSpendIndex(
      snap({
        budgetLimit: [foodLimit],
        expense: [
          makeExpense({ category: 'food', amount: 60_00, date: '2026-10-05' }),
          makeExpense({ category: 'food', amount: 40_00, date: '2026-10-20' }),
        ],
      }),
      1,
    );
    expect(index.overOn('2026-10-20')).toBe(false);
  });

  it('counts only the category of a category limit, and every category for an overall limit', () => {
    const overall = makeLimit({
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 100_00,
      createdAt: localIso('2026-10-01'),
    });
    const mixed = [
      makeExpense({ category: 'food', amount: 60_00, date: '2026-10-05' }),
      makeExpense({ category: 'transport', amount: 50_00, date: '2026-10-06' }),
    ];
    const food = createSpendIndex(snap({ budgetLimit: [foodLimit], expense: mixed }), 1);
    const all = createSpendIndex(snap({ budgetLimit: [overall], expense: mixed }), 1);
    expect(food.overOn('2026-10-06')).toBe(false);
    expect(all.overOn('2026-10-06')).toBe(true);
  });

  it('counts a subscription charge and a card purchase toward a limit', () => {
    const index = createSpendIndex(
      snap({
        budgetLimit: [foodLimit],
        expense: [
          makeExpense({
            category: 'food',
            amount: 60_00,
            date: '2026-10-05',
            subscriptionId: 'sub1',
          }),
          makeExpense({
            category: 'food',
            amount: 50_00,
            date: '2026-10-06',
            paymentMethod: 'credit_card',
            cardId: 'card1',
          }),
        ],
      }),
      1,
    );
    expect(index.overOn('2026-10-06')).toBe(true);
  });

  it('starts a weekly limit over again on the week start the caller chose', () => {
    const weekly = makeLimit({
      category: 'food',
      period: 'weekly',
      amount: 100_00,
      createdAt: localIso('2026-10-01'),
    });
    const expense = [
      makeExpense({ category: 'food', amount: 80_00, date: '2026-10-17' }), // Saturday
      makeExpense({ category: 'food', amount: 30_00, date: '2026-10-18' }), // Sunday
    ];
    const data = snap({ budgetLimit: [weekly], expense });
    expect(createSpendIndex(data, 1).overOn('2026-10-18')).toBe(true); // Monday-to-Sunday week
    expect(createSpendIndex(data, 0).overOn('2026-10-18')).toBe(false); // Sunday begins a new week
  });

  it('knows the days a limit has existed', () => {
    const second = makeLimit({
      id: 'l2',
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 50_00,
      createdAt: localIso('2026-10-21'),
    });
    const both = createSpendIndex(snap({ budgetLimit: [foodLimit, second], expense: spending }), 1);
    expect(both.limitsOn('2026-09-30')).toBe(false);
    expect(both.limitsOn('2026-10-01')).toBe(true);
    expect(both.limitsOn('2026-10-20')).toBe(true);

    // On 10-20 the second limit does not exist yet, so only the first one makes the day count.
    const onlySecond = createSpendIndex(snap({ budgetLimit: [second], expense: spending }), 1);
    expect(onlySecond.limitsOn('2026-10-20')).toBe(false);
    expect(onlySecond.overOn('2026-10-20')).toBe(false);
    expect(onlySecond.overOn('2026-10-21')).toBe(true);
  });

  it('is never over, and has no limits, without any limit', () => {
    const index = createSpendIndex(snap({ expense: spending }), 1);
    expect(index.limitsOn('2026-10-20')).toBe(false);
    expect(index.overOn('2026-10-20')).toBe(false);
  });
});
