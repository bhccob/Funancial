import type { LocalDate } from './dates';
import type {
  BudgetLimit,
  Debt,
  Expense,
  Income,
  Profile,
  SalaryFreeze,
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
  freeze: (
    p: Partial<SalaryFreeze> & Pick<SalaryFreeze, 'start' | 'end' | 'lostAmount'>,
  ): SalaryFreeze => ({
    id: id('frz'),
    ...at(p.start),
    mode: 'computed',
    note: '',
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

export const EXAMPLES: WorkedExample[] = [EXP_1, BAL_1];
