import type { LocalDate } from './dates';
import type {
  BudgetLimit,
  Debt,
  Expense,
  Income,
  Profile,
  Subscription,
  Transaction,
} from './entities';
import { emptySnapshot, type DataSnapshot } from './snapshot';

/**
 * Worked examples for every calculation rule (spec Part 4). Each one is plain data; Vitest checks
 * its `result` against the real domain functions, and the Help Center (M7) renders `steps`.
 * Amounts are minor units.
 */
export type WorkedExample = {
  id: string;
  rule: string;
  title: string;
  today: LocalDate;
  data: DataSnapshot;
  steps: string[];
  result: Record<string, number>;
};

// ───────────── tiny deterministic builders (examples only) ─────────────
const at = (d: LocalDate) => ({ createdAt: `${d}T12:00:00.000Z`, updatedAt: `${d}T12:00:00.000Z` });
let n = 0;
const id = (p: string) => `${p}-${++n}`;

export const ex = {
  profile: (p: Partial<Profile> & Pick<Profile, 'openingDate'>): Profile => ({
    id: 'profile',
    ...at(p.openingDate),
    name: '',
    currency: 'USD',
    openingCash: 0,
    openingSavings: 0,
    salary: null,
    onboardedAt: `${p.openingDate}T12:00:00.000Z`,
    ...p,
  }),
  income: (p: Partial<Income> & Pick<Income, 'amount' | 'date'>): Income => ({
    id: id('inc'),
    ...at(p.date),
    source: 'salary',
    label: 'Salary',
    status: 'confirmed',
    bucket: 'cash',
    recurrence: null,
    period: p.date.slice(0, 7),
    note: '',
    ...p,
  }),
  expense: (p: Partial<Expense> & Pick<Expense, 'amount' | 'date'>): Expense => ({
    id: id('exp'),
    ...at(p.date),
    category: 'food',
    note: '',
    paymentMethod: 'debit',
    cardId: null,
    recurrence: null,
    subscriptionId: null,
    ...p,
  }),
  transaction: (
    p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>,
  ): Transaction => ({
    id: id('tx'),
    ...at(p.date),
    from: null,
    to: null,
    debtId: null,
    note: '',
    ...p,
  }),
  card: (p: Partial<Debt> & Pick<Debt, 'id' | 'openingDate'>): Debt => ({
    ...at(p.openingDate),
    name: 'Visa',
    kind: 'credit_card',
    openingBalance: 0,
    interestRate: 22.9,
    minimumPayment: 25_00,
    creditLimit: null,
    statementDay: 1,
    dueDay: 21,
    payInFull: true,
    ...p,
  }),
  subscription: (
    p: Partial<Subscription> & Pick<Subscription, 'name' | 'amount' | 'nextRenewal'>,
  ): Subscription => ({
    id: id('sub'),
    ...at(p.nextRenewal),
    cycle: 'monthly',
    anchorDay: Number(p.nextRenewal.slice(8, 10)),
    category: 'entertainment',
    paymentMethod: 'debit',
    cardId: null,
    status: 'active',
    audit: null,
    auditedAt: null,
    note: '',
    ...p,
  }),
  limit: (p: Partial<BudgetLimit> & Pick<BudgetLimit, 'amount'>): BudgetLimit => ({
    id: id('lim'),
    ...at('2026-10-01'),
    scope: 'category',
    category: 'food',
    period: 'monthly',
    warnAt: [80, 100, 120],
    reserve: false,
    includeInvestments: false,
    ...p,
  }),
  snapshot: (tables: Partial<DataSnapshot['tables']>): DataSnapshot => {
    const s = emptySnapshot();
    Object.assign(s.tables, tables);
    return s;
  },
};

// ───────────── examples ─────────────
const BAL_1: WorkedExample = {
  id: 'BAL-1',
  rule: 'Net worth',
  title: 'Net worth = cash + savings + investments − debts',
  today: '2026-10-10',
  data: ex.snapshot({
    profile: [
      ex.profile({ openingDate: '2026-10-01', openingCash: 1_000_00, openingSavings: 5_000_00 }),
    ],
    debt: [ex.card({ id: 'card-1', openingDate: '2026-10-01' })],
    income: [
      ex.income({ amount: 3_000_00, date: '2026-10-01' }),
      ex.income({
        amount: 200_00,
        date: '2026-10-02',
        source: 'extra',
        label: 'Side gig',
        status: 'expected',
        period: null,
      }),
    ],
    expense: [
      ex.expense({ amount: 120_00, date: '2026-10-03', note: 'Groceries' }),
      ex.expense({
        amount: 80_00,
        date: '2026-10-04',
        note: 'Jacket',
        category: 'shopping',
        paymentMethod: 'credit_card',
        cardId: 'card-1',
      }),
      ex.expense({
        amount: 50_00,
        date: '2026-09-30',
        note: 'Before you started',
        paymentMethod: 'cash',
      }),
    ],
    transaction: [
      ex.transaction({
        type: 'transfer',
        amount: 500_00,
        date: '2026-10-05',
        from: 'cash',
        to: 'savings',
      }),
      ex.transaction({
        type: 'card_payment',
        amount: 30_00,
        date: '2026-10-06',
        from: 'cash',
        debtId: 'card-1',
      }),
      ex.transaction({
        type: 'adjustment',
        amount: -20_00,
        date: '2026-10-07',
        to: 'cash',
        note: 'Bank fee I forgot',
      }),
    ],
  }),
  steps: [
    'You started on Oct 1 with $1,000.00 cash and $5,000.00 savings.',
    'Salary of $3,000.00 arrived. The $200.00 side gig is still only expected, so it is not counted yet.',
    'Groceries $120.00 on debit leave cash. The $80.00 jacket went on the card, so cash is untouched and the card owes $80.00.',
    'The $50.00 expense from Sep 30 is before you started, so your opening balance already includes it.',
    'You moved $500.00 to savings, paid $30.00 off the card, and corrected cash down by $20.00.',
    'Cash $3,330.00 + savings $5,500.00 − card $50.00 = net worth $8,780.00.',
  ],
  result: { cash: 3_330_00, savings: 5_500_00, passive: 0, card: 50_00, netWorth: 8_780_00 },
};

const EXP_1: WorkedExample = {
  id: 'EXP-1',
  rule: 'Expense',
  title: 'An expense is money spent and not recovered',
  today: '2026-10-02',
  data: ex.snapshot({
    profile: [ex.profile({ openingDate: '2026-10-01', openingCash: 500_00 })],
    debt: [ex.card({ id: 'card-1', openingDate: '2026-10-01' })],
    expense: [
      ex.expense({ amount: 12_50, date: '2026-10-02', note: 'Lunch' }),
      ex.expense({
        amount: 60_00,
        date: '2026-10-02',
        note: 'Headphones',
        category: 'shopping',
        paymentMethod: 'credit_card',
        cardId: 'card-1',
      }),
    ],
  }),
  steps: [
    'Lunch for $12.50 on debit lowers cash from $500.00 to $487.50.',
    'Headphones for $60.00 on the card leave cash alone, but you now owe $60.00 on the card.',
    'Both count as spending in their category for your limits.',
    'Net worth: $487.50 cash − $60.00 card = $427.50.',
  ],
  result: { cash: 487_50, card: 60_00, netWorth: 427_50 },
};

const AVL_1: WorkedExample = {
  id: 'AVL-1',
  rule: 'Available balance',
  title: 'Available = cash + savings − upcoming bills − reserved limits',
  today: '2026-10-14',
  data: ex.snapshot({
    profile: [
      ex.profile({ openingDate: '2026-10-01', openingCash: 1_200_00, openingSavings: 3_000_00 }),
    ],
    debt: [
      ex.card({
        id: 'card-1',
        name: 'Visa',
        openingDate: '2026-10-01',
        openingBalance: 230_00,
        dueDay: 21,
      }),
    ],
    expense: [ex.expense({ amount: 100_00, date: '2026-10-13', note: 'Groceries' })],
    subscription: [
      ex.subscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
      ex.subscription({
        name: 'FitHub Gym',
        amount: 39_00,
        nextRenewal: '2026-11-02',
        category: 'health',
      }),
    ],
    budgetLimit: [
      ex.limit({ category: 'rent', period: 'monthly', amount: 1_200_00, reserve: true }),
      ex.limit({ category: 'food', period: 'weekly', amount: 120_00 }),
    ],
  }),
  steps: [
    'Cash is $1,100.00 after $100.00 of groceries; savings are $3,000.00.',
    'Bills still due this month: Streamflix $15.99 on Oct 20 and the Visa balance of $230.00 on Oct 21. The gym renews in November, so it waits.',
    'Your rent limit of $1,200.00 is reserved and nothing is spent yet, so $1,200.00 is held back.',
    '$1,100.00 + $3,000.00 − $245.99 − $1,200.00 = $2,654.01 available to spend.',
  ],
  result: {
    billsTotal: 245_99,
    reserved: 1_200_00,
    available: 2_654_01,
    foodSpent: 100_00,
    foodPct: 83,
  },
};

const LIM_1: WorkedExample = {
  id: 'LIM-1',
  rule: 'Spending limit',
  title: 'Limits warn at 80%, 100% and 120%',
  today: '2026-10-14',
  data: ex.snapshot({
    budgetLimit: [ex.limit({ category: 'food', period: 'monthly', amount: 100_00 })],
    expense: [
      ex.expense({ amount: 60_00, date: '2026-10-05', note: 'Groceries' }),
      ex.expense({ amount: 25_00, date: '2026-10-09', note: 'Takeout' }),
    ],
  }),
  steps: [
    'Your Food limit is $100.00 for October.',
    'You have spent $85.00, which is 85%: past the 80% warning, so Funcial gives you a heads-up.',
    'A $20.00 lunch would take you to $105.00, which is 105%: over the limit.',
    'Past 120% Funcial tells you the limit is well exceeded. Subscriptions and card purchases count too.',
  ],
  result: { spent: 85_00, pct: 85, levelRank: 1, pctAfterLunch: 105, levelRankAfterLunch: 2 },
};

const SUB_1: WorkedExample = {
  id: 'SUB-1',
  rule: 'Subscription',
  title: 'A subscription is a recurring expense taken from your available balance',
  today: '2026-10-19',
  data: ex.snapshot({
    profile: [ex.profile({ openingDate: '2026-10-01', openingCash: 1_000_00 })],
    subscription: [
      ex.subscription({
        id: 'sub-streamflix',
        name: 'Streamflix',
        amount: 15_99,
        nextRenewal: '2026-10-20',
        anchorDay: 20,
      }),
    ],
  }),
  steps: [
    'Streamflix costs $15.99 and renews on the 20th.',
    'On Oct 19 it is an upcoming bill: cash is still $1,000.00 but only $984.01 is available to spend.',
    'On Oct 20 Funcial records the $15.99 charge as an expense, so cash drops to $984.01.',
    'The next renewal moves to Nov 20, so nothing more is due this month.',
  ],
  result: {
    billsBefore: 15_99,
    availableBefore: 984_01,
    cashBefore: 1_000_00,
    cashAfter: 984_01,
    billsAfter: 0,
    nextRenewalMonth: 11,
    nextRenewalDay: 20,
  },
};

export const EXAMPLES: WorkedExample[] = [EXP_1, SUB_1, LIM_1, BAL_1, AVL_1];
