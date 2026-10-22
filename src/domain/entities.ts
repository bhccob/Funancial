import { z } from 'zod';
import { IsoTimestampSchema, LocalDateSchema, YearMonthSchema } from './dates';

/** Money is always an integer count of minor units (cents). */
const Money = z.number().int();
const PositiveMoney = Money.positive();
const NonNegativeMoney = Money.nonnegative();
const DayOfMonth = z.number().int().min(1).max(31);

const base = {
  id: z.string().min(1),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
};

export const CategorySchema = z.enum([
  'food',
  'transport',
  'rent',
  'utilities',
  'entertainment',
  'health',
  'shopping',
  'other',
]);
export type Category = z.infer<typeof CategorySchema>;

export const CycleSchema = z.enum(['weekly', 'monthly', 'quarterly', 'yearly']);
export type Cycle = z.infer<typeof CycleSchema>;

export const RecurrenceSchema = z.object({ cycle: CycleSchema });
export type Recurrence = z.infer<typeof RecurrenceSchema>;

/** The id of the account a row is paid from or into. */
const AccountId = z.string().min(1);

export const AccountKindSchema = z.enum(['debit', 'credit', 'savings', 'cash']);
export type AccountKind = z.infer<typeof AccountKindSchema>;

/** What a credit card's account adds: its limit, its statement and due days, and its terms. */
export const CreditTermsSchema = z.object({
  limit: NonNegativeMoney.nullable(),
  statementDay: DayOfMonth.nullable(),
  dueDay: DayOfMonth.nullable(),
  payInFull: z.boolean(),
  minimumPayment: NonNegativeMoney,
  interestRate: z.number().nonnegative(),
});
export type CreditTerms = z.infer<typeof CreditTermsSchema>;

/**
 * Somewhere money is held or owed, shown as a card: a bank account, a credit card, savings or a
 * cash wallet. `openingBalance` is what is on it on `openingDate`, or for a credit card what is
 * owed. `last4` is for show only, never a full card number.
 */
export const AccountSchema = z
  .object({
    ...base,
    name: z.string().min(1),
    kind: AccountKindSchema,
    /** The card's look, a preset id from the design system. */
    skin: z.string().min(1),
    last4: z
      .string()
      .regex(/^\d{4}$/, 'Use the last 4 digits')
      .nullable(),
    openingBalance: Money,
    openingDate: LocalDateSchema,
    /** Whether what it holds counts in Available. */
    inAvailable: z.boolean(),
    frozen: z.boolean(),
    /** Its place in the carousel. */
    order: z.number().int().nonnegative(),
    /**
     * Set when one with history is deleted: it is kept only for the rows that name it, and from
     * this day on it is hidden and what it holds or owes no longer counts.
     */
    archivedOn: LocalDateSchema.optional(),
    credit: CreditTermsSchema.nullable(),
  })
  .refine((v) => (v.kind === 'credit') === (v.credit !== null), {
    message: 'Credit terms are set exactly for a credit card',
    path: ['credit'],
  });
export type Account = z.infer<typeof AccountSchema>;

export const ProfileSchema = z.object({
  ...base,
  id: z.literal('profile'),
  name: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  openingDate: LocalDateSchema,
  salary: z
    .object({
      monthlyAmount: NonNegativeMoney,
      payDay: DayOfMonth,
      /** Set when the salary is added or changed: earlier pay days are never expected. */
      since: LocalDateSchema.optional(),
    })
    .nullable(),
  onboardedAt: IsoTimestampSchema.nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Which reminders the phone may show. `enabled` is the master switch; the rest pick rules. */
export const ReminderSettingsSchema = z.object({
  enabled: z.boolean(),
  dailyLog: z.boolean(),
  /** Local time of the daily nudge, `HH:MM` on a 24-hour clock. */
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time as HH:MM'),
  bills: z.boolean(),
  reviews: z.boolean(),
  /** Kept so older data still loads. */
  backup: z.boolean(),
  dividends: z.boolean(),
  /** Set once the person has been asked about reminders, so the ask is not repeated. */
  prompted: z.boolean(),
});
export type ReminderSettings = z.infer<typeof ReminderSettingsSchema>;

/** The shop items the person has equipped: one id per slot, each naming a catalog item. */
export const CosmeticsSchema = z.object({
  theme: z.string().min(1),
  avatar: z.string().min(1),
  frame: z.string().min(1),
});
export type Cosmetics = z.infer<typeof CosmeticsSchema>;

/**
 * What the inbox has been told is read: every reminder up to `readBefore` ("Mark all as read"), and
 * the keys read one by one since, at most 200 of them (the store drops the oldest).
 */
export const InboxSchema = z.object({
  readBefore: IsoTimestampSchema.nullable(),
  read: z.array(z.string()),
});
export type Inbox = z.infer<typeof InboxSchema>;

export const SettingsSchema = z.object({
  ...base,
  id: z.literal('settings'),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  warningTone: z.enum(['gentle', 'motivational', 'strict']),
  autoLockMinutes: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(5),
    z.literal(15),
    z.literal(30),
  ]),
  /** Kept so older data still loads. */
  lastBackupAt: IsoTimestampSchema.nullable(),
  reminders: ReminderSettingsSchema,
  cosmetics: CosmeticsSchema,
  /** What Invest is shown in; null is the profile currency. Display only: amounts stay stored in the profile's. */
  investCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')
    .nullable(),
  /** The latest rate from the profile currency to the one Invest was last shown in. */
  investFx: z
    .object({
      currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
      /** Units of `currency` for one unit of the profile currency. */
      rate: z.number().positive(),
      asOf: IsoTimestampSchema,
    })
    .nullable(),
  inbox: InboxSchema,
  /** The account a new expense starts on, and where an expected salary lands; null for none. */
  defaultAccountId: AccountId.nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type AutoLockMinutes = Settings['autoLockMinutes'];

export function defaultSettings(now: string): Settings {
  return {
    id: 'settings',
    createdAt: now,
    updatedAt: now,
    weekStartsOn: 1,
    warningTone: 'motivational',
    autoLockMinutes: 5,
    lastBackupAt: null,
    reminders: {
      enabled: false,
      dailyLog: true,
      dailyTime: '20:00',
      bills: true,
      reviews: true,
      backup: true,
      dividends: true,
      prompted: false,
    },
    cosmetics: { theme: 'theme-mono', avatar: 'avatar-sprout', frame: 'frame-none' },
    investCurrency: null,
    investFx: null,
    inbox: { readBefore: null, read: [] },
    defaultAccountId: null,
  };
}

export const IncomeSchema = z.object({
  ...base,
  amount: PositiveMoney,
  source: z.enum(['salary', 'extra']),
  label: z.string(),
  date: LocalDateSchema,
  /** `skipped`: an expected salary marked as never arrived; it never counts and never returns. */
  status: z.enum(['expected', 'confirmed', 'skipped']),
  /** The account it is paid into. */
  accountId: AccountId,
  recurrence: RecurrenceSchema.nullable(),
  period: YearMonthSchema.nullable(),
  note: z.string(),
});
export type Income = z.infer<typeof IncomeSchema>;

export const ExpenseSchema = z.object({
  ...base,
  amount: PositiveMoney,
  category: CategorySchema,
  date: LocalDateSchema,
  note: z.string(),
  /** The account it was paid with: on a credit card it raises what is owed. */
  accountId: AccountId,
  recurrence: RecurrenceSchema.nullable(),
  subscriptionId: z.string().min(1).nullable(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const SubscriptionSchema = z.object({
  ...base,
  name: z.string().min(1),
  amount: PositiveMoney,
  cycle: CycleSchema,
  nextRenewal: LocalDateSchema,
  /** Day of month renewals return to (a 31st sub renews on Feb 28, then Mar 31). */
  anchorDay: DayOfMonth,
  category: CategorySchema,
  /** The account each renewal is paid with. */
  accountId: AccountId,
  status: z.enum(['active', 'cancelled']),
  audit: z.enum(['keep', 'review', 'cancel']).nullable(),
  /** When `audit` was last set; `null` when there is no mark, or when the mark predates v4. */
  auditedAt: IsoTimestampSchema.nullable(),
  note: z.string(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const BudgetLimitSchema = z
  .object({
    ...base,
    scope: z.enum(['category', 'overall']),
    category: CategorySchema.nullable(),
    period: z.enum(['weekly', 'monthly']),
    amount: PositiveMoney,
    warnAt: z
      .array(z.number().int().positive())
      .min(1)
      .refine((xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]!), 'Thresholds must ascend'),
    reserve: z.boolean(),
    includeInvestments: z.boolean(),
  })
  .refine((v) => (v.scope === 'category') === (v.category !== null), {
    message: 'Category limits need a category; the overall limit has none',
    path: ['category'],
  });
export type BudgetLimit = z.infer<typeof BudgetLimitSchema>;

/**
 * Money moving, not spending. A card payment moves money from an account into a credit card's
 * account; a debt payment pays a loan (`debtId`) from an account; an adjustment corrects one
 * account by a signed amount.
 */
export const TransactionSchema = z
  .object({
    ...base,
    type: z.enum(['transfer', 'adjustment', 'card_payment', 'debt_payment', 'investment']),
    amount: Money,
    date: LocalDateSchema,
    fromAccountId: AccountId.nullable(),
    toAccountId: AccountId.nullable(),
    /** The loan a debt payment pays. */
    debtId: z.string().min(1).nullable(),
    note: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (v.type === 'adjustment') {
      if (v.amount === 0) issue('An adjustment must change the balance', 'amount');
      if (v.toAccountId === null)
        issue('An adjustment names the account it corrects', 'toAccountId');
    } else if (v.amount <= 0) {
      issue('Amount must be positive', 'amount');
    }
    if (
      v.type === 'transfer' &&
      (v.fromAccountId === null || v.toAccountId === null || v.fromAccountId === v.toAccountId)
    ) {
      issue('A transfer moves money between two different accounts', 'toAccountId');
    }
    if (v.type === 'card_payment') {
      if (v.fromAccountId === null) issue('A payment must come from an account', 'fromAccountId');
      if (v.toAccountId === null) issue('A card payment names the card it pays', 'toAccountId');
      if (v.debtId !== null) issue('A card payment names no loan', 'debtId');
    }
    if (v.type === 'debt_payment') {
      if (v.debtId === null) issue('A payment must name the loan', 'debtId');
      if (v.fromAccountId === null) issue('A payment must come from an account', 'fromAccountId');
    }
    if (v.type === 'investment' && v.fromAccountId === null) {
      issue('An investment must come from an account', 'fromAccountId');
    }
  });
export type Transaction = z.infer<typeof TransactionSchema>;

export const GoalSchema = z.object({
  ...base,
  name: z.string().min(1),
  kind: z.enum(['savings', 'emergency', 'custom']),
  target: PositiveMoney,
  current: NonNegativeMoney,
  deadline: LocalDateSchema.nullable(),
});
export type Goal = z.infer<typeof GoalSchema>;

/** A loan. Credit cards are accounts (`kind: 'credit'`). */
export const DebtSchema = z.object({
  ...base,
  name: z.string().min(1),
  kind: z.literal('loan'),
  openingBalance: NonNegativeMoney,
  openingDate: LocalDateSchema,
  interestRate: z.number().nonnegative(),
  minimumPayment: NonNegativeMoney,
  creditLimit: NonNegativeMoney.nullable(),
  statementDay: DayOfMonth.nullable(),
  dueDay: DayOfMonth.nullable(),
  payInFull: z.boolean(),
  /**
   * Set when one with history is deleted: it is kept only for the payments that name it, and from
   * this day on it is hidden and what it owes no longer counts.
   */
  archivedOn: LocalDateSchema.optional(),
});
export type Debt = z.infer<typeof DebtSchema>;

/**
 * One line of the XP and coin ledger. XP and coins are whole numbers; a reversal and a purchase
 * carry negative amounts. The id is derived from `key` (`key#n`).
 */
export const LedgerEntrySchema = z.object({
  ...base,
  key: z.string().min(1),
  kind: z.enum(['award', 'reversal', 'purchase']),
  xp: z.number().int(),
  coins: z.number().int(),
  label: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

/** A check-in for a day (`no-spend`) or for a week (`weekly`, dated by the week's start). */
export const CheckInSchema = z.object({
  ...base,
  kind: z.enum(['no-spend', 'weekly']),
  date: LocalDateSchema,
});
export type CheckIn = z.infer<typeof CheckInSchema>;

export const ChallengeKindSchema = z.enum([
  'no-spend-weekend',
  'subscription-audit',
  'budget-30',
  'emergency-sprint',
  'portfolio-checkup',
]);
export type ChallengeKind = z.infer<typeof ChallengeKindSchema>;

export const ChallengeSchema = z
  .object({
    ...base,
    kind: ChallengeKindSchema,
    start: LocalDateSchema,
    end: LocalDateSchema,
    baseline: Money.nullable(),
    goal: PositiveMoney.nullable(),
    status: z.enum(['active', 'abandoned']),
  })
  .refine((v) => v.end >= v.start, { message: 'End must be on or after start', path: ['end'] });
export type Challenge = z.infer<typeof ChallengeSchema>;

/** A day on which a streak was held by a freeze instead of an action. */
export const StreakFreezeSchema = z.object({
  ...base,
  streak: z.enum(['logging', 'checkin']),
  date: LocalDateSchema,
});
export type StreakFreeze = z.infer<typeof StreakFreezeSchema>;

/**
 * A stock, ETF or other holding. `costBasis` is money in the profile currency; shares, prices and
 * rates are plain numbers. `quote` and `dividendInfo` are the last copy fetched from the price
 * service, kept so the screens work offline; `manualPrice` wins over the quote.
 */
export const HoldingSchema = z.object({
  ...base,
  symbol: z.string().regex(/^[A-Z0-9.^=-]{1,15}$/, 'Use an upper-case symbol'),
  name: z.string().min(1),
  type: z.enum(['stock', 'etf', 'other']),
  exchange: z.string().nullable(),
  sector: z.string().nullable(),
  /** What the holding trades in. */
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  shares: z.number().positive(),
  costBasis: NonNegativeMoney,
  purchaseDate: LocalDateSchema,
  /** Percent of each dividend withheld as tax, 0 to 100. */
  withholdingPct: z.number().min(0).max(100),
  manualPrice: z.number().nonnegative().nullable(),
  quote: z
    .object({
      price: z.number().nonnegative(),
      previousClose: z.number().nonnegative().nullable(),
      /** Profile currency per unit of the holding's currency; null when unknown. */
      fxRate: z.number().positive().nullable(),
      asOf: IsoTimestampSchema,
    })
    .nullable(),
  dividendInfo: z
    .object({
      /** Ex-dates and per-share amounts in the holding's currency, oldest first. */
      history: z.array(z.object({ date: LocalDateSchema, amount: z.number().nonnegative() })),
      nextExDate: LocalDateSchema.nullable(),
      nextPayDate: LocalDateSchema.nullable(),
      nextAmount: z.number().nonnegative().nullable(),
      fetchedAt: IsoTimestampSchema,
    })
    .nullable(),
  checkedAt: IsoTimestampSchema.nullable(),
});
export type Holding = z.infer<typeof HoldingSchema>;

/** A dividend payout the person confirmed or skipped. `(holdingId, expectedPayDate)` names the payout it settles. */
export const DividendSchema = z
  .object({
    ...base,
    holdingId: z.string().min(1),
    symbol: z.string().min(1),
    expectedPayDate: LocalDateSchema,
    paidOn: LocalDateSchema,
    status: z.enum(['confirmed', 'skipped']),
    /** What arrived, after tax; 0 when skipped. */
    amount: NonNegativeMoney,
    /** The account it was paid into; null when skipped or reinvested. */
    accountId: AccountId.nullable(),
    /** Whether it bought more shares instead. */
    reinvested: z.boolean(),
    sharesAdded: z.number().nonnegative().nullable(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (v.status === 'skipped') {
      if (v.amount !== 0) issue('A skipped payout received nothing', 'amount');
      if (v.accountId !== null) issue('A skipped payout went nowhere', 'accountId');
      if (v.reinvested) issue('A skipped payout was not reinvested', 'reinvested');
      if (v.sharesAdded !== null) issue('A skipped payout added no shares', 'sharesAdded');
    } else if (v.reinvested === (v.accountId !== null)) {
      issue('A confirmed payout is either reinvested or paid into an account', 'accountId');
    }
  });
export type Dividend = z.infer<typeof DividendSchema>;

/**
 * Shares the person sold. `proceeds` is what they got and `cost` the part of the holding's cost basis
 * those shares carried, both in the profile currency, so the profit is `proceeds - cost`. The
 * holding's own fields are copied here so the sale reads the same after the holding is gone.
 * `restore` is the holding exactly as it was just before a sale of its last shares, which removes it,
 * so the sale can be undone; it is null when shares were left.
 */
export const SaleSchema = z.object({
  ...base,
  holdingId: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  type: HoldingSchema.shape.type,
  shares: z.number().positive(),
  proceeds: PositiveMoney,
  cost: NonNegativeMoney,
  soldOn: LocalDateSchema,
  /** The account the money went into. */
  toAccountId: AccountId,
  restore: HoldingSchema.nullable(),
});
export type Sale = z.infer<typeof SaleSchema>;
