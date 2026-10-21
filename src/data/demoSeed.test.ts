import { describe, expect, it } from 'vitest';
import { accountBalance } from '@/domain/balances';
import { addDays } from '@/domain/dates';
import { duePayouts, expectedPayouts } from '@/domain/dividends';
import { costForShares, portfolio } from '@/domain/portfolio';
import { profitAndLoss, realisedProfit } from '@/domain/sales';
import { SnapshotSchema } from '@/domain/snapshot';
import {
  MAIN_ACCOUNT_ID,
  PASSIVE_ACCOUNT_ID,
  SAVINGS_ACCOUNT_ID,
} from '@/domain/upgrades/v10Accounts';
import { computeFinanceView } from '@/domain/view';
import { buildDemoSnapshot } from './demoSeed';

const TODAY = '2026-10-14';
const START = '2026-08-15'; // today − 60 days
const demo = buildDemoSnapshot(TODAY);
const t = demo.tables;
const daily = t.expense.filter(
  (e) => e.subscriptionId === null && e.category !== 'rent' && e.category !== 'utilities',
);
const CASH_ID = 'acct-cash';
const CARD = t.account.find((a) => a.kind === 'credit')!;
const accountOf = (data: typeof demo, id: string) => data.tables.account.find((a) => a.id === id)!;

describe('demo accounts', () => {
  it('has Main account, Savings, a Cash wallet, the Demo Visa and Passive income', () => {
    expect(
      [...t.account]
        .sort((a, b) => a.order - b.order)
        .map((a) => [a.id, a.name, a.kind, a.inAvailable]),
    ).toEqual([
      [MAIN_ACCOUNT_ID, 'Main account', 'debit', true],
      [CARD.id, 'Demo Visa', 'credit', false],
      [SAVINGS_ACCOUNT_ID, 'Savings', 'savings', false],
      [CASH_ID, 'Cash wallet', 'cash', true],
      [PASSIVE_ACCOUNT_ID, 'Passive income', 'savings', false],
    ]);
    expect(new Set(t.account.map((a) => a.order)).size).toBe(5);
    expect(t.account.every((a) => a.openingDate === START && a.archivedOn === undefined)).toBe(
      true,
    );
    expect(t.settings[0]?.defaultAccountId).toBe(MAIN_ACCOUNT_ID);
    expect(t.debt).toEqual([]);
  });

  it('names one of them on every expense, income, subscription, transfer, dividend and sale', () => {
    const ids = new Set(t.account.map((a) => a.id));
    const named = [
      ...t.expense.map((e) => e.accountId),
      ...t.income.map((i) => i.accountId),
      ...t.subscription.map((s) => s.accountId),
      ...t.transaction.flatMap((x) => [x.fromAccountId, x.toAccountId]),
      ...t.dividend.map((d) => d.accountId),
      ...t.sale.map((s) => s.toAccountId),
    ].filter((id): id is string => id !== null);
    expect(named.length).toBeGreaterThan(200);
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
    expect(new Set(t.expense.map((e) => e.accountId))).toEqual(
      new Set([MAIN_ACCOUNT_ID, CASH_ID, CARD.id]),
    );
  });

  it('gives the card its terms: a limit, statement on the 1st, due on the 21st, paid in full', () => {
    expect(CARD).toMatchObject({
      name: 'Demo Visa',
      skin: 'violet',
      openingBalance: 0,
      credit: {
        limit: 3_000_00,
        statementDay: 1,
        dueDay: 21,
        payInFull: true,
        minimumPayment: 25_00,
        interestRate: 22.9,
      },
    });
  });

  describe('on 2026-10-20', () => {
    const NOW = '2026-10-20';
    const now = buildDemoSnapshot(NOW);
    const view = computeFinanceView(now, NOW, 1);
    const nonCredit = view.accounts.filter((r) => r.account.kind !== 'credit');

    it('holds 186.25 in the Cash wallet', () => {
      expect(accountBalance(accountOf(now, CASH_ID), now, NOW)).toBe(186_25);
      expect(view.cash).toBe(186_25);
    });

    it('keeps Available and every non-credit balance at or above zero', () => {
      expect(nonCredit.map((r) => r.account.id).sort()).toEqual(
        [CASH_ID, MAIN_ACCOUNT_ID, PASSIVE_ACCOUNT_ID, SAVINGS_ACCOUNT_ID].sort(),
      );
      expect(nonCredit.filter((r) => r.balance < 0)).toEqual([]);
      expect(view.available).toBeGreaterThanOrEqual(0);
    });

    it('owes only the card what was charged since it was last paid', () => {
      // Paid in full on 09-21 for August; on 10-20 September and October are owed, and due tomorrow.
      const card = accountOf(now, CARD.id);
      const charged = now.tables.expense
        .filter((e) => e.accountId === CARD.id && e.date >= '2026-09-01')
        .reduce((sum, e) => sum + e.amount, 0);
      expect(accountBalance(card, now, NOW)).toBe(charged);
      expect(view.accounts.find((r) => r.account.id === CARD.id)?.balance).toBe(charged);
      expect(view.bills.find((b) => b.kind === 'card')).toMatchObject({
        amount: charged,
        date: '2026-10-21',
        inFull: true,
      });
      expect(charged).toBeGreaterThan(0);
      expect(charged).toBeLessThan(card.credit!.limit!);
    });

    it('keeps the money story: salary in, 300.00 to Savings, a bought and sold holding', () => {
      const main = accountOf(now, MAIN_ACCOUNT_ID);
      const salaries = now.tables.income.filter((i) => i.accountId === MAIN_ACCOUNT_ID);
      expect(salaries).toHaveLength(2);
      expect(
        now.tables.transaction.filter(
          (x) =>
            x.type === 'transfer' &&
            x.fromAccountId === MAIN_ACCOUNT_ID &&
            x.toAccountId === SAVINGS_ACCOUNT_ID,
        ),
      ).toHaveLength(2);
      expect(accountBalance(main, now, NOW)).toBeGreaterThan(0);
      // 8,000.00 + 2 × 300.00, less the AAPL purchase of 2,550.00, plus its sale for 1,120.00.
      expect(accountBalance(accountOf(now, SAVINGS_ACCOUNT_ID), now, NOW)).toBe(
        8_000_00 + 600_00 - 2_550_00 + 1_120_00,
      );
      // Both dividends paid out landed in Passive income: KO's 27.20 and VWRL's 17.26.
      expect(accountBalance(accountOf(now, PASSIVE_ACCOUNT_ID), now, NOW)).toBe(27_20 + 17_26);
    });
  });

  it('keeps every non-credit balance and Available at or above zero on any day it is started', () => {
    const lows: string[] = [];
    for (const [today, seed] of [
      ['2026-10-14', 42],
      ['2026-10-20', 7],
      ['2026-10-24', 42],
      ['2026-11-02', 42],
      ['2026-11-21', 42],
      ['2027-01-30', 3],
      ['2027-03-01', 42],
      ['2027-03-31', 11],
    ] as const) {
      const data = buildDemoSnapshot(today, seed);
      for (let day = addDays(today, -60); day <= today; day = addDays(day, 1)) {
        const view = computeFinanceView(data, day, 1);
        for (const r of view.accounts) {
          if (r.account.kind !== 'credit' && r.balance < 0)
            lows.push(`${today}/${seed} ${day} ${r.account.id}`);
        }
        if (day === today && view.available < 0) lows.push(`${today}/${seed} available`);
      }
    }
    expect(lows).toEqual([]);
  });
});

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

  it('puts about 30% of everyday spending on the demo card and 20% in the Cash wallet', () => {
    const share = (id: string) => daily.filter((e) => e.accountId === id).length / daily.length;
    expect(share(CARD.id)).toBeGreaterThan(0.2);
    expect(share(CARD.id)).toBeLessThan(0.4);
    expect(share(CASH_ID)).toBeGreaterThan(0.1);
    expect(share(CASH_ID)).toBeLessThan(0.3);
    // The rest, and rent, utilities and every bill but Streamflix, is paid from Main account.
    expect(share(MAIN_ACCOUNT_ID)).toBeGreaterThan(0.4);
    expect(
      t.expense.filter((e) => e.category === 'rent').every((e) => e.accountId === MAIN_ACCOUNT_ID),
    ).toBe(true);
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

  it('has the documented limits and goals', () => {
    expect(t.budgetLimit.map((l) => [l.scope, l.category, l.period, l.amount])).toEqual([
      ['overall', null, 'monthly', 2_600_00],
      ['category', 'food', 'weekly', 120_00],
      ['category', 'entertainment', 'monthly', 100_00],
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

  it('pays the full salary on each pay day', () => {
    expect(t.income.map((i) => [i.date, i.period, i.amount, i.status])).toEqual([
      ['2026-08-25', '2026-08', 4_200_00, 'confirmed'],
      ['2026-09-25', '2026-09', 4_200_00, 'confirmed'],
    ]);
    expect(t.income.map((i) => i.note)).toEqual(['', '']);
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
        accountId: PASSIVE_ACCOUNT_ID,
        reinvested: false,
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
      accountId: null,
      reinvested: true,
    });
    expect(passive).toMatchObject({
      id: `${ko.id}:2026-10-01`,
      expectedPayDate: '2026-10-01',
      paidOn: '2026-10-01',
      status: 'confirmed',
      accountId: PASSIVE_ACCOUNT_ID,
      reinvested: false,
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
      toAccountId: SAVINGS_ACCOUNT_ID,
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
    const savings = (data: typeof demo, day: string) =>
      accountBalance(accountOf(data, SAVINGS_ACCOUNT_ID), data, day);
    const cash = (data: typeof demo, day: string) =>
      accountBalance(accountOf(data, MAIN_ACCOUNT_ID), data, day);
    expect(sale!.toAccountId).toBe(SAVINGS_ACCOUNT_ID);
    expect(savings(demo, TODAY) - savings(unsold, TODAY)).toBe(1_120_00);
    expect(savings(demo, addDays(sale!.soldOn, -1))).toBe(
      savings(unsold, addDays(sale!.soldOn, -1)),
    );
    expect(cash(demo, TODAY)).toBe(cash(unsold, TODAY));
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
        fromAccountId: SAVINGS_ACCOUNT_ID,
        toAccountId: null,
        note: 'Bought AAPL',
      },
    ]);
  });
});
