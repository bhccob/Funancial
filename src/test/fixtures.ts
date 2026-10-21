import { addDays, toLocalDate, type LocalDate } from '@/domain/dates';
import {
  defaultSettings,
  type Account,
  type BudgetLimit,
  type Challenge,
  type CheckIn,
  type Debt,
  type Dividend,
  type Expense,
  type Goal,
  type Holding,
  type Income,
  type LedgerEntry,
  type Profile,
  type Sale,
  type Settings,
  type StreakFreeze,
  type Subscription,
  type Transaction,
} from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';

const stamp = () => {
  const now = nowIso();
  return { createdAt: now, updatedAt: now };
};
const today = () => toLocalDate(new Date());

/**
 * An ISO timestamp for `hour` o'clock on the local day `day`. Built from local date parts, so
 * `toLocalDate(new Date(localIso(day)))` is `day` in every time zone.
 */
export function localIso(day: LocalDate, hour = 12): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour).toISOString();
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile',
    ...stamp(),
    name: 'Test Player',
    currency: 'USD',
    openingDate: today(),
    salary: { monthlyAmount: 420_000, payDay: 25 },
    onboardedAt: null,
    ...overrides,
  };
}

/** Settings as `defaultSettings` makes them: no default account until setup names one. */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(nowIso()), ...overrides };
}

/** Main account: a debit account the money rows below are paid from and into by default. */
export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-main',
    ...stamp(),
    name: 'Main account',
    kind: 'debit',
    skin: 'midnight',
    last4: null,
    openingBalance: 100_000,
    openingDate: today(),
    inAvailable: true,
    frozen: false,
    order: 0,
    credit: null,
    ...overrides,
  };
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: newId(),
    ...stamp(),
    amount: 12_50,
    category: 'food',
    date: today(),
    note: '',
    accountId: 'acct-main',
    recurrence: null,
    subscriptionId: null,
    ...overrides,
  };
}

export function makeIncome(overrides: Partial<Income> = {}): Income {
  return {
    id: newId(),
    ...stamp(),
    amount: 420_000,
    source: 'salary',
    label: 'Salary',
    date: today(),
    status: 'confirmed',
    accountId: 'acct-main',
    recurrence: null,
    period: today().slice(0, 7),
    note: '',
    ...overrides,
  };
}

export function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  const nextRenewal = overrides.nextRenewal ?? today();
  return {
    id: newId(),
    ...stamp(),
    name: 'Streamflix',
    amount: 15_99,
    cycle: 'monthly',
    nextRenewal,
    anchorDay: Number(nextRenewal.slice(8, 10)),
    category: 'entertainment',
    accountId: 'acct-main',
    status: 'active',
    audit: null,
    auditedAt: null,
    note: '',
    ...overrides,
  };
}

export function makeLimit(overrides: Partial<BudgetLimit> = {}): BudgetLimit {
  return {
    id: newId(),
    ...stamp(),
    scope: 'category',
    category: 'food',
    period: 'weekly',
    amount: 120_00,
    warnAt: [80, 100, 120],
    reserve: false,
    includeInvestments: false,
    ...overrides,
  };
}

/** A loan: credit cards are accounts (`makeAccount({ kind: 'credit', credit: … })`). */
export function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: newId(),
    ...stamp(),
    name: 'Car loan',
    kind: 'loan',
    openingBalance: 0,
    openingDate: today(),
    interestRate: 6.5,
    minimumPayment: 100_00,
    creditLimit: null,
    statementDay: null,
    dueDay: null,
    payInFull: false,
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: newId(),
    ...stamp(),
    name: 'Emergency fund',
    kind: 'emergency',
    target: 1_000_000,
    current: 300_000,
    deadline: null,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: newId(),
    ...stamp(),
    type: 'transfer',
    amount: 100_00,
    date: today(),
    fromAccountId: 'acct-main',
    toAccountId: 'acct-savings',
    debtId: null,
    note: '',
    ...overrides,
  };
}

export function makeLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: newId(),
    ...stamp(),
    key: 'test-award',
    kind: 'award',
    xp: 10,
    coins: 1,
    label: 'Test award',
    ...overrides,
  };
}

export function makeCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: newId(),
    ...stamp(),
    kind: 'no-spend',
    date: today(),
    ...overrides,
  };
}

export function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  const start = overrides.start ?? today();
  return {
    id: newId(),
    ...stamp(),
    kind: 'no-spend-weekend',
    start,
    end: addDays(start, 1),
    baseline: null,
    goal: null,
    status: 'active',
    ...overrides,
  };
}

export function makeStreakFreeze(overrides: Partial<StreakFreeze> = {}): StreakFreeze {
  return {
    id: newId(),
    ...stamp(),
    streak: 'logging',
    date: today(),
    ...overrides,
  };
}

export function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: newId(),
    ...stamp(),
    symbol: 'KO',
    name: 'Coca-Cola',
    type: 'stock',
    exchange: 'NYQ',
    sector: 'Consumer Defensive',
    currency: 'USD',
    shares: 10,
    costBasis: 500_00,
    purchaseDate: today(),
    withholdingPct: 15,
    manualPrice: null,
    quote: null,
    dividendInfo: null,
    checkedAt: null,
    ...overrides,
  };
}

export function makeDividend(overrides: Partial<Dividend> = {}): Dividend {
  return {
    id: newId(),
    ...stamp(),
    holdingId: 'holding-1',
    symbol: 'KO',
    expectedPayDate: today(),
    paidOn: today(),
    status: 'confirmed',
    amount: 11_20,
    accountId: 'acct-main',
    reinvested: false,
    sharesAdded: null,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: newId(),
    ...stamp(),
    holdingId: 'holding-1',
    symbol: 'KO',
    name: 'Coca-Cola',
    type: 'stock',
    shares: 5,
    proceeds: 300_00,
    cost: 250_00,
    soldOn: today(),
    toAccountId: 'acct-main',
    restore: null,
    ...overrides,
  };
}
