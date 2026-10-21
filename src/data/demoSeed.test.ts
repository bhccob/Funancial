import { describe, expect, it } from 'vitest';
import { bucketBalances } from '@/domain/balances';
import { addDays } from '@/domain/dates';
import { duePayouts, expectedPayouts } from '@/domain/dividends';
import { costForShares, portfolio } from '@/domain/portfolio';
import { profitAndLoss, realisedProfit } from '@/domain/sales';
import { SnapshotSchema } from '@/domain/snapshot';
import { buildDemoSnapshot } from './demoSeed';

const TODAY = '2026-10-14';
const START = '2026-08-15'; // today − 60 days
const demo = buildDemoSnapshot(TODAY);
const t = demo.tables;
const daily = t.expense.filter(
  (e) => e.subscriptionId === null && e.category !== 'rent' && e.category !== 'utilities',
);

describe('demo seed', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    expect(buildDemoSnapshot(TODAY)).toEqual(demo);
    expect(buildDemoSnapshot(TODAY, 7)).not.toEqual(demo);
  });

  it('is valid data', () => {
    const result = SnapshotSchema.safeParse(demo);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('dates every expense inside the 60-day window, none in the future', () => {
    expect(t.expense.every((e) => e.date >= START && e.date <= TODAY)).toBe(true);
    expect(t.profile[0]?.openingDate).toBe(START);
  });

  it('logs 2 to 4 everyday expenses on each day of the window', () => {
    const perDay = new Map<string, number>();
    for (const e of daily) perDay.set(e.date, (perDay.get(e.date) ?? 0) + 1);
    expect(perDay.size).toBe(61);
    expect([...perDay.values()].every((n) => n >= 2 && n <= 4)).toBe(true);
  });

  it('charges rent and utilities once a month', () => {
    const rent = t.expense.filter((e) => e.category === 'rent').map((e) => e.date);
    expect(rent).toEqual(['2026-09-01', '2026-10-01']);
    expect(t.expense.filter((e) => e.category === 'utilities')).toHaveLength(2);
  });

  it('puts about 30% of everyday spending on the demo card, which exists', () => {
    const cards = new Set(t.debt.filter((d) => d.kind === 'credit_card').map((d) => d.id));
    const onCard = t.expense.filter((e) => e.paymentMethod === 'credit_card');
    expect(onCard.every((e) => e.cardId !== null && cards.has(e.cardId))).toBe(true);
    const share = daily.filter((e) => e.paymentMethod === 'credit_card').length / daily.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  it('has the four subscriptions, each renewing after today', () => {
    expect(t.subscription.map((s) => [s.name, s.amount, s.category])).toEqual([
      ['Streamflix', 15_99, 'entertainment'],
      ['Tunely', 10_99, 'entertainment'],
      ['CloudBox', 2_99, 'other'],
      ['FitHub Gym', 39_00, 'health'],
    ]);
    expect(t.subscription.every((s) => s.nextRenewal > TODAY && s.cycle === 'monthly')).toBe(true);
    const charges = t.expense.filter((e) => e.subscriptionId !== null);
    expect(charges.length).toBeGreaterThanOrEqual(8);
  });

  it('has the documented limits, card and goals', () => {
    expect(t.budgetLimit.map((l) => [l.scope, l.category, l.period, l.amount])).toEqual([
      ['overall', null, 'monthly', 2_600_00],
      ['category', 'food', 'weekly', 120_00],
      ['category', 'entertainment', 'monthly', 100_00],
    ]);
    expect(t.debt).toMatchObject([
      {
        name: 'Demo Visa',
        kind: 'credit_card',
        payInFull: true,
        statementDay: 1,
        dueDay: 21,
        creditLimit: 3_000_00,
      },
    ]);
    expect(t.goal).toMatchObject([
      {
        name: 'Emergency fund',
        kind: 'emergency',
        target: 10_000_00,
        current: 3_000_00,
        deadline: null,
      },
      {
        name: 'New bike',
        kind: 'savings',
        target: 1_200_00,
        current: 450_00,
        deadline: '2027-02-11',
      },
    ]);
  });

  it('pays salary on each pay day, reduced by the past five-day freeze', () => {
    const [freeze] = t.salaryFreeze;
    expect(t.salaryFreeze).toHaveLength(1);
    expect(freeze).toMatchObject({ start: '2026-09-08', end: '2026-09-12', mode: 'computed' });
    expect(freeze?.lostAmount).toBe(Math.round((4_200_00 / 30) * 5));

    expect(t.income.map((i) => [i.date, i.period, i.amount, i.status])).toEqual([
      ['2026-08-25', '2026-08', 4_200_00, 'confirmed'],
      ['2026-09-25', '2026-09', 4_200_00 - freeze!.lostAmount, 'confirmed'],
    ]);
  });
});

describe('demo investments', () => {
  const holdingOf = (symbol: string) => t.holding.find((h) => h.symbol === symbol)!;
  const row = (symbol: string) =>
    portfolio(demo, 'USD').rows.find((r) => r.holding.symbol === symbol)!;

  it('holds four holdings, each with a stored quote, a rate and dividend info', () => {
    expect(t.holding.map((h) => [h.symbol, h.type, h.currency])).toEqual([
      ['VWRL', 'etf', 'EUR'],
      ['AAPL', 'stock', 'USD'],
      ['KO', 'stock', 'USD'],
      ['ASML', 'stock', 'EUR'],
    ]);
    expect(t.holding.map((h) => h.quote?.fxRate)).toEqual([1.08, 1, 1, 1.08]);
    expect(t.holding.every((h) => h.dividendInfo !== null && h.manualPrice === null)).toBe(true);
    // Stored the day before, so opening Invest with the price service asks for fresh prices.
    expect(
      t.holding.every((h) => Date.parse(h.quote!.asOf) < Date.parse(`${TODAY}T00:00:00Z`)),
    ).toBe(true);
  });

  it('prices every holding with no service: KO up, ASML down', () => {
    const book = portfolio(demo, 'USD');
    expect(book.unpriced).toBe(0);
    expect(row('VWRL').value).toBe(511_488); // 40 × €118.40 × 1.08
    expect(row('AAPL').value).toBe(159_950); // 7 × $228.50, after the sale of 5
    expect(row('ASML').value).toBe(400_842); // 5 × €742.30 × 1.08
    expect([book.best?.holding.symbol, book.worst?.holding.symbol]).toEqual(['KO', 'ASML']);
  });

  it('pays no dividend that is due, and has three coming in the next 60 days', () => {
    expect(duePayouts(demo, 'USD', TODAY)).toEqual([]);
    const coming = expectedPayouts(demo, 'USD', addDays(TODAY, 1), addDays(TODAY, 60), TODAY);
    expect(coming.map((p) => [p.holding.symbol, p.payDate])).toEqual([
      ['AAPL', '2026-10-29'],
      ['ASML', '2026-11-13'],
      ['VWRL', '2026-11-21'],
    ]);
  });

  it("confirmed VWRL's last payout into Passive, so it is not due", () => {
    const vwrl = holdingOf('VWRL');
    expect(t.dividend.filter((d) => d.holdingId === vwrl.id)).toMatchObject([
      {
        id: `${vwrl.id}:2026-08-22`,
        symbol: 'VWRL',
        expectedPayDate: '2026-08-22', // ex 2026-08-17, and Yahoo's 5-day gap to its pay date
        paidOn: '2026-08-22',
        status: 'confirmed',
        amount: 17_26, // 40 shares × €0.47, after 15% tax, at 1.08
        bucket: 'passive',
        sharesAdded: null,
      },
    ]);
  });

  it('confirmed two KO dividends: one reinvested, then one into Passive', () => {
    const ko = holdingOf('KO');
    const [reinvested, passive] = t.dividend.filter((d) => d.holdingId === ko.id);
    expect(t.dividend).toHaveLength(3);
    expect(reinvested).toMatchObject({
      id: `${ko.id}:2026-07-02`,
      holdingId: ko.id,
      symbol: 'KO',
      expectedPayDate: '2026-07-02',
      paidOn: '2026-07-02',
      status: 'confirmed',
      amount: 26_01, // 60 shares × $0.51, after 15% tax
      bucket: 'reinvest',
    });
    expect(passive).toMatchObject({
      id: `${ko.id}:2026-10-01`,
      expectedPayDate: '2026-10-01',
      paidOn: '2026-10-01',
      status: 'confirmed',
      bucket: 'passive',
      sharesAdded: null,
    });
    // The second payout was on the shares the first one bought too.
    expect(passive!.amount).toBe(27_20);
    // The reinvested payout is in the holding's shares and cost, as confirming it would have left them.
    expect(reinvested!.sharesAdded).toBeGreaterThan(0.38);
    expect(ko.shares).toBeCloseTo(60 + reinvested!.sharesAdded!, 9);
    expect(ko.costBasis).toBe(3_300_00 + reinvested!.amount);
  });

  it('sold 5 of the 12 AAPL shares into savings 20 days ago, at a profit', () => {
    const aapl = holdingOf('AAPL');
    const [sale] = t.sale;
    expect(t.sale).toHaveLength(1);
    expect(sale).toMatchObject({
      holdingId: aapl.id,
      symbol: 'AAPL',
      name: 'Apple',
      type: 'stock',
      shares: 5,
      proceeds: 1_120_00, // 5 × $224.00
      cost: 1_062_50, // 5 of the 12 shares, at the average of $2,550.00
      soldOn: '2026-09-24',
      to: 'savings',
      restore: null,
    });
    // The holding is as selling would have left it: 7 shares, and the cost the 5 did not carry.
    expect(aapl.shares).toBe(7);
    expect(aapl.costBasis).toBe(2_550_00 - sale!.cost);
    const bought = { ...aapl, shares: 12, costBasis: 2_550_00 };
    expect(costForShares(bought, 5)).toBe(sale!.cost);
    expect(sale!.soldOn > aapl.purchaseDate && sale!.soldOn <= TODAY).toBe(true);
  });

  it('puts the proceeds of the sale into savings from the day of the sale', () => {
    const [sale] = t.sale;
    const unsold = { ...demo, tables: { ...t, sale: [] } };
    const savings = (data: typeof demo, day: string) => bucketBalances(data, day).savings;
    expect(savings(demo, TODAY) - savings(unsold, TODAY)).toBe(1_120_00);
    expect(savings(demo, addDays(sale!.soldOn, -1))).toBe(
      savings(unsold, addDays(sale!.soldOn, -1)),
    );
    expect(bucketBalances(demo, TODAY).cash).toBe(bucketBalances(unsold, TODAY).cash);
  });

  it('shows realised profit, so Profit & loss has a From sales line', () => {
    expect(realisedProfit(demo)).toBe(1_120_00 - 1_062_50);
    const pl = profitAndLoss(demo, 'USD');
    expect(pl.sales).toBe(57_50);
    expect(pl.total).toBe(pl.held + pl.sales + pl.dividends);
  });

  it('records the purchase of AAPL inside the window, from savings', () => {
    const aapl = holdingOf('AAPL');
    expect(aapl.purchaseDate).toBe('2026-09-14');
    expect(t.transaction.filter((x) => x.type === 'investment')).toMatchObject([
      {
        amount: 2_550_00, // what the 12 shares cost, before any were sold
        date: aapl.purchaseDate,
        from: 'savings',
        to: null,
        note: 'Bought AAPL',
      },
    ]);
  });
});

describe('demo without Buy it? and About you', () => {
  it('holds no decisions and no About you record', () => {
    expect(t.buyDecision).toEqual([]);
    expect(t.aboutYou).toEqual([]);
  });
});
