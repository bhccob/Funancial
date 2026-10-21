import { defaultsFor } from '@/domain/accounts';
import { addDays, type LocalDate } from '@/domain/dates';
import {
  defaultSettings,
  type Account,
  type Category,
  type Expense,
  type Holding,
  type Subscription,
} from '@/domain/entities';
import { toMinor } from '@/domain/portfolio';
import { planSale } from '@/domain/sales';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import {
  MAIN_ACCOUNT_ID,
  PASSIVE_ACCOUNT_ID,
  SAVINGS_ACCOUNT_ID,
} from '@/domain/upgrades/v10Accounts';

/** Fake money for demo mode. Deterministic: the same day and seed always give the same data. */

const WINDOW_DAYS = 60;
const MONTHLY_SALARY = 4_200_00;
const PAY_DAY = 25;
const CARD_ID = 'demo-card';
/** The Cash wallet. */
export const CASH_ACCOUNT_ID = 'acct-cash';
/**
 * What the Cash wallet holds on the day the demo starts. It opens with this plus everything spent
 * from it, so it ends there for any day and seed.
 */
const CASH_NOW = 186_25;
/** What Main account and Savings open with, on the first day of the window. */
const MAIN_OPENING = 2_500_00;
const SAVINGS_OPENING = 8_000_00;
/** Percent of each demo dividend withheld as tax. */
const TAX = 15;
const KO_PRICE = 68.4;
/** AAPL: of the 12 shares bought, this many were sold 20 days ago, at this price each. */
const AAPL_SOLD = 5;
const AAPL_SOLD_PRICE = 224;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Everyday = { category: Category; weight: number; min: number; max: number; notes: string[] };

const EVERYDAY: Everyday[] = [
  {
    category: 'food',
    weight: 35,
    min: 3_00,
    max: 14_00,
    notes: ['Groceries', 'Lunch', 'Coffee', 'Bakery', 'Takeout'],
  },
  {
    category: 'transport',
    weight: 15,
    min: 2_00,
    max: 9_00,
    notes: ['Bus fare', 'Fuel', 'Train', 'Parking'],
  },
  {
    category: 'shopping',
    weight: 15,
    min: 6_00,
    max: 40_00,
    notes: ['Clothes', 'Household', 'Books', 'Phone case'],
  },
  {
    category: 'entertainment',
    weight: 10,
    min: 5_00,
    max: 25_00,
    notes: ['Cinema', 'Game', 'Concert', 'Bowling'],
  },
  {
    category: 'health',
    weight: 5,
    min: 4_00,
    max: 30_00,
    notes: ['Pharmacy', 'Vitamins', 'Physio co-pay'],
  },
  { category: 'other', weight: 5, min: 2_00, max: 15_00, notes: ['Gift', 'Haircut', 'Donation'] },
];
const TOTAL_WEIGHT = EVERYDAY.reduce((sum, c) => sum + c.weight, 0);

const SUBSCRIPTIONS: Array<
  Pick<Subscription, 'name' | 'amount' | 'category' | 'accountId'> & { day: number }
> = [
  { name: 'Streamflix', amount: 15_99, category: 'entertainment', accountId: CARD_ID, day: 3 },
  { name: 'Tunely', amount: 10_99, category: 'entertainment', accountId: MAIN_ACCOUNT_ID, day: 12 },
  { name: 'CloudBox', amount: 2_99, category: 'other', accountId: MAIN_ACCOUNT_ID, day: 20 },
  { name: 'FitHub Gym', amount: 39_00, category: 'health', accountId: MAIN_ACCOUNT_ID, day: 28 },
];

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayOf = (d: LocalDate) => Number(d.slice(8, 10));
const monthOf = (d: LocalDate) => d.slice(0, 7);
const stampFor = (d: LocalDate) => {
  const at = `${d}T12:00:00.000Z`;
  return { createdAt: at, updatedAt: at };
};

/** The date with the given day in the month after `d`'s month (clamped to month length). */
function nextMonthDay(d: LocalDate, day: number): LocalDate {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${ny}-${pad(nm)}-${pad(Math.min(day, daysInMonth(ny, nm)))}`;
}

export function buildDemoSnapshot(today: LocalDate, seed = 42): DataSnapshot {
  const rand = mulberry32(seed);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

  const start = addDays(today, -WINDOW_DAYS);
  const days: LocalDate[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);

  const snap = emptySnapshot();
  const t = snap.tables;
  const counters = new Map<string, number>();
  const id = (kind: string) => {
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    return `demo-${kind}-${String(n).padStart(3, '0')}`;
  };

  t.profile.push({
    id: 'profile',
    ...stampFor(start),
    name: 'Demo Player',
    currency: 'USD',
    openingDate: start,
    salary: { monthlyAmount: MONTHLY_SALARY, payDay: PAY_DAY },
    onboardedAt: `${start}T12:00:00.000Z`,
  });
  t.settings.push({
    ...defaultSettings(`${start}T12:00:00.000Z`),
    defaultAccountId: MAIN_ACCOUNT_ID,
  });

  const expense = (
    date: LocalDate,
    category: Category,
    amount: number,
    note: string,
    accountId: string,
    subscriptionId: string | null = null,
  ): Expense => ({
    id: id('expense'),
    ...stampFor(date),
    amount,
    category,
    date,
    note,
    accountId,
    recurrence: null,
    subscriptionId,
  });

  const subscriptionIds = SUBSCRIPTIONS.map(() => id('subscription'));

  for (const date of days) {
    const day = dayOf(date);
    if (day === 1) t.expense.push(expense(date, 'rent', 1_200_00, 'Rent', MAIN_ACCOUNT_ID));
    if (day === 10)
      t.expense.push(
        expense(date, 'utilities', between(110_00, 170_00), 'Power & water', MAIN_ACCOUNT_ID),
      );
    SUBSCRIPTIONS.forEach((s, i) => {
      if (day === s.day)
        t.expense.push(
          expense(date, s.category, s.amount, s.name, s.accountId, subscriptionIds[i]!),
        );
    });

    const count = between(2, 4);
    for (let n = 0; n < count; n++) {
      let roll = rand() * TOTAL_WEIGHT;
      const kind = EVERYDAY.find((c) => (roll -= c.weight) < 0) ?? EVERYDAY[0]!;
      const r = rand();
      // About 30% on the card, 20% from the Cash wallet, the rest from Main account.
      const accountId = r < 0.3 ? CARD_ID : r < 0.5 ? CASH_ACCOUNT_ID : MAIN_ACCOUNT_ID;
      t.expense.push(
        expense(date, kind.category, between(kind.min, kind.max), pick(kind.notes), accountId),
      );
    }

    if (day === PAY_DAY) {
      const period = monthOf(date);
      t.income.push({
        id: id('income'),
        ...stampFor(date),
        amount: MONTHLY_SALARY,
        source: 'salary',
        label: 'Salary',
        date,
        status: 'confirmed',
        accountId: MAIN_ACCOUNT_ID,
        recurrence: null,
        period,
        note: '',
      });
      t.transaction.push({
        id: id('transaction'),
        ...stampFor(date),
        type: 'transfer',
        amount: 300_00,
        date,
        fromAccountId: MAIN_ACCOUNT_ID,
        toAccountId: SAVINGS_ACCOUNT_ID,
        debtId: null,
        note: 'Pay yourself first',
      });
    }

    // Pay the card in full on its due day for the previous statement (statement day 1).
    if (day === 21) {
      const statementMonth = monthOf(addDays(`${monthOf(date)}-01`, -1));
      const owed = t.expense
        .filter((e) => e.accountId === CARD_ID && monthOf(e.date) === statementMonth)
        .reduce((sum, e) => sum + e.amount, 0);
      if (owed > 0) {
        t.transaction.push({
          id: id('transaction'),
          ...stampFor(date),
          type: 'card_payment',
          amount: owed,
          date,
          fromAccountId: MAIN_ACCOUNT_ID,
          toAccountId: CARD_ID,
          debtId: null,
          note: 'Demo Visa statement',
        });
      }
    }
  }

  SUBSCRIPTIONS.forEach((s, i) => {
    const thisMonth = `${monthOf(today)}-${pad(s.day)}`;
    t.subscription.push({
      id: subscriptionIds[i]!,
      ...stampFor(start),
      name: s.name,
      amount: s.amount,
      cycle: 'monthly',
      nextRenewal: thisMonth > today ? thisMonth : nextMonthDay(today, s.day),
      anchorDay: s.day,
      category: s.category,
      accountId: s.accountId,
      status: 'active',
      audit: null,
      auditedAt: null,
      note: '',
    });
  });

  const limit = (
    scope: 'overall' | 'category',
    category: Category | null,
    period: 'weekly' | 'monthly',
    amount: number,
  ) => ({
    id: id('limit'),
    ...stampFor(start),
    scope,
    category,
    period,
    amount,
    warnAt: [80, 100, 120],
    reserve: false,
    includeInvestments: false,
  });
  t.budgetLimit.push(
    limit('overall', null, 'monthly', 2_600_00),
    limit('category', 'food', 'weekly', 120_00),
    limit('category', 'entertainment', 'monthly', 100_00),
  );

  t.goal.push(
    {
      id: id('goal'),
      ...stampFor(start),
      name: 'Emergency fund',
      kind: 'emergency',
      target: 10_000_00,
      current: 3_000_00,
      deadline: null,
    },
    {
      id: id('goal'),
      ...stampFor(start),
      name: 'New bike',
      kind: 'savings',
      target: 1_200_00,
      current: 450_00,
      deadline: addDays(today, 120),
    },
  );

  // Investments as the price service last left them, so Invest works with no service. The stored
  // prices are a day old: opening Invest with a service asks for fresh ones.
  const quotedAt = `${addDays(today, -1)}T09:00:00.000Z`;
  const quote = (price: number, previousClose: number, fxRate: number) => ({
    price,
    previousClose,
    fxRate,
    asOf: quotedAt,
  });
  // Quarterly ex-dates 91 days apart, the last `lastEx` days from today; the next payout is given
  // by ex-date and pay date (days from today), with the last paid amount standing in for its own.
  const quarterly = (lastEx: number, amounts: number[], nextEx: number, nextPay: number) => ({
    history: amounts.map((amount, i) => ({
      date: addDays(today, lastEx - 91 * (amounts.length - 1 - i)),
      amount,
    })),
    nextExDate: addDays(today, nextEx),
    nextPayDate: addDays(today, nextPay),
    nextAmount: amounts[amounts.length - 1]!,
    fetchedAt: quotedAt,
  });
  const holding = (
    h: Pick<
      Holding,
      | 'symbol'
      | 'name'
      | 'type'
      | 'exchange'
      | 'sector'
      | 'currency'
      | 'shares'
      | 'costBasis'
      | 'purchaseDate'
      | 'quote'
      | 'dividendInfo'
    >,
  ): Holding => ({
    id: id('holding'),
    ...stampFor(h.purchaseDate > start ? h.purchaseDate : start),
    withholdingPct: TAX,
    manualPrice: null,
    checkedAt: null,
    ...h,
  });

  // KO's first payout was reinvested at today's stored price, the second went to Passive, on the
  // shares the first one bought.
  const koFirst = toMinor(60 * 0.51 * (1 - TAX / 100), 1, 'USD');
  const koAdded = koFirst / (KO_PRICE * 100);
  const koSecond = toMinor((60 + koAdded) * 0.53 * (1 - TAX / 100), 1, 'USD');

  const aapl = holding({
    symbol: 'AAPL',
    name: 'Apple',
    type: 'stock',
    exchange: 'NMS',
    sector: 'Technology',
    currency: 'USD',
    shares: 12,
    costBasis: 2_550_00,
    purchaseDate: addDays(today, -30),
    quote: quote(228.5, 229.8, 1),
    dividendInfo: quarterly(-79, [0.24, 0.25, 0.25, 0.26], 12, 15),
  });
  const ko = holding({
    symbol: 'KO',
    name: 'Coca-Cola',
    type: 'stock',
    exchange: 'NYQ',
    sector: 'Consumer Defensive',
    currency: 'USD',
    shares: 60 + koAdded,
    costBasis: 3_300_00 + koFirst,
    purchaseDate: addDays(today, -400),
    quote: quote(KO_PRICE, 67.9, 1),
    // The announced payout is already past (ex 29 days ago, paid 13 days ago), as Yahoo gives it.
    dividendInfo: quarterly(-29, [0.5, 0.5, 0.51, 0.53], -29, -13),
  });
  // VWRL's last payout (ex 58 days ago, paid 53 days ago) went to Passive, so nothing is due.
  const vwrl = holding({
    symbol: 'VWRL',
    name: 'Vanguard All-World ETF',
    type: 'etf',
    exchange: 'AMS',
    sector: null,
    currency: 'EUR',
    shares: 40,
    costBasis: 4_600_00,
    purchaseDate: addDays(today, -200),
    quote: quote(118.4, 117.9, 1.08),
    dividendInfo: quarterly(-58, [0.38, 0.52, 0.41, 0.47], 33, 38),
  });
  const vwrlLast = toMinor(40 * 0.47 * (1 - TAX / 100), 1.08, 'USD');
  // Five of the twelve AAPL shares were sold into savings, at a profit. It is written as `sellHolding`
  // writes it: the sale on its own, and the holding left with the shares and cost the five did not carry.
  const soldOn = addDays(today, -20);
  const plan = planSale(aapl, AAPL_SOLD, toMinor(AAPL_SOLD_PRICE, 1, 'USD'));
  const aaplLeft: Holding = {
    ...aapl,
    shares: aapl.shares - plan.shares,
    costBasis: aapl.costBasis - plan.cost,
    updatedAt: stampFor(soldOn).updatedAt,
  };
  t.sale.push({
    id: id('sale'),
    ...stampFor(soldOn),
    holdingId: aapl.id,
    symbol: aapl.symbol,
    name: aapl.name,
    type: aapl.type,
    shares: plan.shares,
    proceeds: plan.proceeds,
    cost: plan.cost,
    soldOn,
    toAccountId: SAVINGS_ACCOUNT_ID,
    restore: null,
  });
  t.holding.push(
    vwrl,
    aaplLeft,
    ko,
    holding({
      symbol: 'ASML',
      name: 'ASML Holding',
      type: 'stock',
      exchange: 'AMS',
      sector: 'Technology',
      currency: 'EUR',
      shares: 5,
      costBasis: 4_300_00,
      purchaseDate: addDays(today, -300),
      quote: quote(742.3, 748.1, 1.08),
      dividendInfo: quarterly(-70, [1.52, 1.52, 1.52, 1.6], 21, 30),
    }),
  );
  const paid = (h: Holding, payDays: number, amount: number, to: 'reinvest' | 'passive') => {
    const payDate = addDays(today, -payDays);
    t.dividend.push({
      id: `${h.id}:${payDate}`,
      ...stampFor(payDate),
      holdingId: h.id,
      symbol: h.symbol,
      expectedPayDate: payDate,
      paidOn: payDate,
      status: 'confirmed',
      amount,
      accountId: to === 'passive' ? PASSIVE_ACCOUNT_ID : null,
      reinvested: to === 'reinvest',
      sharesAdded: to === 'reinvest' ? koAdded : null,
    });
  };
  paid(ko, 104, koFirst, 'reinvest');
  paid(ko, 13, koSecond, 'passive');
  paid(vwrl, 53, vwrlLast, 'passive');
  t.transaction.push({
    id: id('transaction'),
    ...stampFor(aapl.purchaseDate),
    type: 'investment',
    amount: aapl.costBasis,
    date: aapl.purchaseDate,
    fromAccountId: SAVINGS_ACCOUNT_ID,
    toAccountId: null,
    debtId: null,
    note: 'Bought AAPL',
  });

  // The accounts, after the spending, because the Cash wallet opens with whatever leaves it
  // plus what it holds on the day the demo starts.
  const cashSpent = t.expense
    .filter((e) => e.accountId === CASH_ACCOUNT_ID)
    .reduce((sum, e) => sum + e.amount, 0);
  const account = (
    a: Pick<Account, 'id' | 'name' | 'kind' | 'openingBalance' | 'order'> & Partial<Account>,
  ): Account => ({
    ...stampFor(start),
    ...defaultsFor(a.kind),
    last4: null,
    openingDate: start,
    frozen: false,
    credit: null,
    ...a,
  });
  t.account.push(
    account({
      id: MAIN_ACCOUNT_ID,
      name: 'Main account',
      kind: 'debit',
      openingBalance: MAIN_OPENING,
      order: 0,
    }),
    account({
      id: CARD_ID,
      name: 'Demo Visa',
      kind: 'credit',
      openingBalance: 0,
      order: 1,
      credit: {
        limit: 3_000_00,
        statementDay: 1,
        dueDay: 21,
        payInFull: true,
        minimumPayment: 25_00,
        interestRate: 22.9,
      },
    }),
    account({
      id: SAVINGS_ACCOUNT_ID,
      name: 'Savings',
      kind: 'savings',
      openingBalance: SAVINGS_OPENING,
      order: 2,
    }),
    account({
      id: CASH_ACCOUNT_ID,
      name: 'Cash wallet',
      kind: 'cash',
      openingBalance: CASH_NOW + cashSpent,
      order: 3,
    }),
    // Both dividends paid out went here, as the upgrade names it.
    account({
      id: PASSIVE_ACCOUNT_ID,
      name: 'Passive income',
      kind: 'savings',
      skin: 'amber',
      openingBalance: 0,
      order: 4,
    }),
  );

  return snap;
}
