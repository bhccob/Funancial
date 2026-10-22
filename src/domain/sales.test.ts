import { describe, expect, it } from 'vitest';
import { makeDividend, makeHolding, makeProfile, makeSale } from '@/test/fixtures';
import { formatShares } from '@/lib/format';
import type { Holding } from './entities';
import { planSale, profitAndLoss, realisedProfit, soldGroups } from './sales';
import { emptySnapshot } from './snapshot';

const ko = makeHolding({ id: 'ko', shares: 10, costBasis: 500_00 });

function dataOf(partial: Partial<ReturnType<typeof emptySnapshot>['tables']> = {}) {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'USD' })];
  Object.assign(data.tables, partial);
  return data;
}

const quoted = (price: number, over: Partial<Holding> = {}) =>
  makeHolding({
    currency: 'USD',
    quote: { price, previousClose: null, fxRate: 1, asOf: '2026-10-16T10:00:00.000Z' },
    ...over,
  });

describe('planSale', () => {
  it('sells half: proceeds at the price, the cost those shares carried, and the profit', () => {
    expect(planSale(ko, 5, 60_00)).toEqual({
      shares: 5,
      proceeds: 300_00,
      cost: 250_00,
      profit: 50_00,
      all: false,
    });
  });

  it('rounds the proceeds once, and the cost once', () => {
    const three = makeHolding({ shares: 3, costBasis: 100_00 });
    // 1 × 1234.5 = 1234.5 → 1235; 100.00 ÷ 3 = 33.33
    expect(planSale(three, 1, 1234.5)).toEqual({
      shares: 1,
      proceeds: 1235,
      cost: 3_333,
      profit: 1235 - 3_333,
      all: false,
    });
  });

  it('sells all: the cost is the cost basis exactly, and a loss is a negative profit', () => {
    const plan = planSale(ko, 10, 40_00);
    expect(plan).toEqual({
      shares: 10,
      proceeds: 400_00,
      cost: 500_00,
      profit: -100_00,
      all: true,
    });
  });

  it('treats a hair below all as all, selling exactly the shares held', () => {
    const plan = planSale(ko, 10 - 1e-10, 60_00);
    expect(plan.all).toBe(true);
    expect(plan.shares).toBe(10);
    expect(plan.cost).toBe(500_00);
    expect(plan.proceeds).toBe(600_00);
  });

  it('treats a hair above all as all too', () => {
    const plan = planSale(ko, 10 + 5e-10, 60_00);
    expect(plan).toMatchObject({ all: true, shares: 10, cost: 500_00 });
  });

  it('sells all when the count typed is the one shown, to four decimals', () => {
    // Shown as 10.0709: selling that many would leave 0.0000064 of a share, too little to sell.
    const odd = makeHolding({ shares: 10.070906432748538, costBasis: 500_00 });
    expect(formatShares(odd.shares, 'en-US')).toBe('10.0709');
    expect(planSale(odd, 10.0709, 60_00)).toMatchObject({
      all: true,
      shares: odd.shares,
      cost: 500_00,
    });
    // Shown as 10.071, a hair more than is held.
    const up = makeHolding({ shares: 10.07096, costBasis: 500_00 });
    expect(formatShares(up.shares, 'en-US')).toBe('10.071');
    expect(planSale(up, 10.071, 60_00)).toMatchObject({ all: true, shares: up.shares });
  });

  it('never leaves less than half the last shown digit of a share', () => {
    const plan = (sold: number) => planSale(ko, sold, 60_00);
    expect(plan(10 - 4.9e-5)).toMatchObject({ all: true, shares: 10 });
    expect(plan(10 - 6e-5)).toMatchObject({ all: false, shares: 10 - 6e-5 });
    expect(plan(10 + 4.9e-5)).toMatchObject({ all: true, shares: 10 });
    expect(() => plan(10 + 6e-5)).toThrow('You only have 10 shares.');
  });

  it('sells fractions of a share', () => {
    const plan = planSale(makeHolding({ shares: 2.5, costBasis: 100_00 }), 0.5, 10_00);
    expect(plan).toMatchObject({ shares: 0.5, proceeds: 5_00, cost: 20_00, profit: -15_00 });
  });

  it('refuses nothing, or less than nothing', () => {
    expect(() => planSale(ko, 0, 60_00)).toThrow('Sell at least a part of a share.');
    expect(() => planSale(ko, -1, 60_00)).toThrow('Sell at least a part of a share.');
  });

  it('refuses a price that makes the proceeds nothing', () => {
    const message = 'Enter a price above 0.';
    expect(() => planSale(ko, 5, 0)).toThrow(message);
    expect(() => planSale(ko, 5, -60_00)).toThrow(message);
    expect(() => planSale(ko, 5, NaN)).toThrow(message);
    // 0.4 of a share at 1 cent rounds to nothing.
    expect(() => planSale(ko, 0.4, 1)).toThrow(message);
    expect(planSale(ko, 0.5, 1).proceeds).toBe(1);
  });

  it('names the shares before the price when both are wrong', () => {
    expect(() => planSale(ko, 0, 0)).toThrow('Sell at least a part of a share.');
    expect(() => planSale(ko, 11, 0)).toThrow('You only have 10 shares.');
  });

  it('refuses more than is held, naming how many are', () => {
    expect(() => planSale(ko, 11, 60_00)).toThrow('You only have 10 shares.');
    expect(() => planSale(ko, 10.001, 60_00)).toThrow('You only have 10 shares.');
    const odd = makeHolding({ shares: 1234.56789 });
    expect(() => planSale(odd, 2000, 1_00)).toThrow(
      `You only have ${formatShares(1234.56789)} shares.`,
    );
    // One share is "1 share".
    expect(() => planSale(makeHolding({ shares: 1 }), 2, 1_00)).toThrow('You only have 1 share.');
  });
});

describe('realisedProfit', () => {
  it('is proceeds less cost, added up over every sale', () => {
    const data = dataOf({
      sale: [
        makeSale({ proceeds: 300_00, cost: 250_00 }),
        makeSale({ proceeds: 90_00, cost: 120_00 }),
      ],
    });
    expect(realisedProfit(data)).toBe(20_00);
  });

  it('is zero with no sales', () => {
    expect(realisedProfit(dataOf())).toBe(0);
  });
});

describe('profitAndLoss', () => {
  it('adds up what is held, what was sold and what was paid out', () => {
    const data = dataOf({
      // 10 × $60 − $500 = +$100
      holding: [quoted(60, { id: 'ko', shares: 10, costBasis: 500_00 })],
      sale: [
        makeSale({ proceeds: 300_00, cost: 250_00 }),
        makeSale({ proceeds: 80_00, cost: 100_00 }),
      ],
      dividend: [
        makeDividend({ amount: 11_20 }),
        makeDividend({ amount: 8_50, accountId: null, reinvested: true, sharesAdded: 0.1 }),
        makeDividend({ status: 'skipped', amount: 0, accountId: null }),
      ],
    });
    const pl = profitAndLoss(data, 'USD');
    expect(pl).toEqual({ held: 100_00, sales: 30_00, dividends: 19_70, total: 149_70 });
    expect(pl.total).toBe(pl.held + pl.sales + pl.dividends);
  });

  it('adds up a loss', () => {
    const data = dataOf({
      holding: [quoted(40, { id: 'ko', shares: 10, costBasis: 500_00 })],
      sale: [makeSale({ proceeds: 80_00, cost: 100_00 })],
      dividend: [makeDividend({ amount: 5_00 })],
    });
    const pl = profitAndLoss(data, 'USD');
    expect(pl).toEqual({ held: -100_00, sales: -20_00, dividends: 5_00, total: -115_00 });
  });

  it('leaves a holding with no price out of what is held', () => {
    const data = dataOf({
      holding: [quoted(60, { shares: 10, costBasis: 500_00 }), makeHolding({ quote: null })],
    });
    expect(profitAndLoss(data, 'USD')).toEqual({
      held: 100_00,
      sales: 0,
      dividends: 0,
      total: 100_00,
    });
  });

  it('is all zeros with nothing', () => {
    expect(profitAndLoss(dataOf(), 'USD')).toEqual({ held: 0, sales: 0, dividends: 0, total: 0 });
  });
});

describe('soldGroups', () => {
  const sales = [
    makeSale({
      symbol: 'KO',
      name: 'Coca-Cola',
      shares: 5,
      proceeds: 300_00,
      cost: 250_00,
      soldOn: '2026-10-02',
    }),
    makeSale({
      symbol: 'AAPL',
      name: 'Apple',
      shares: 2,
      proceeds: 440_00,
      cost: 500_00,
      soldOn: '2026-10-05',
    }),
    makeSale({
      symbol: 'KO',
      name: 'Coca-Cola Co',
      shares: 3.5,
      proceeds: 200_00,
      cost: 150_00,
      soldOn: '2026-10-09',
    }),
  ];

  it('groups the sales by symbol, newest first', () => {
    expect(soldGroups(dataOf({ sale: sales }))).toEqual([
      {
        symbol: 'KO',
        name: 'Coca-Cola Co',
        type: 'stock',
        shares: 8.5,
        proceeds: 500_00,
        cost: 400_00,
        profit: 100_00,
        lastSoldOn: '2026-10-09',
      },
      {
        symbol: 'AAPL',
        name: 'Apple',
        type: 'stock',
        shares: 2,
        proceeds: 440_00,
        cost: 500_00,
        profit: -60_00,
        lastSoldOn: '2026-10-05',
      },
    ]);
  });

  it('is empty with no sales', () => {
    expect(soldGroups(dataOf())).toEqual([]);
  });
});
