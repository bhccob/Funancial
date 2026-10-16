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

export const PaymentMethodSchema = z.enum(['cash', 'debit', 'credit_card', 'other']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const BucketSchema = z.enum(['cash', 'savings', 'passive']);
export type Bucket = z.infer<typeof BucketSchema>;

export const CycleSchema = z.enum(['weekly', 'monthly', 'quarterly', 'yearly']);
export type Cycle = z.infer<typeof CycleSchema>;

export const RecurrenceSchema = z.object({ cycle: CycleSchema });
export type Recurrence = z.infer<typeof RecurrenceSchema>;

const cardMatchesMethod = (v: { paymentMethod: PaymentMethod; cardId: string | null }) =>
  (v.paymentMethod === 'credit_card') === (v.cardId !== null);
const cardMessage = {
  message: 'A card is required exactly when paying by credit card',
  path: ['cardId'],
};

export const ProfileSchema = z.object({
  ...base,
  id: z.literal('profile'),
  name: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  openingDate: LocalDateSchema,
  openingCash: NonNegativeMoney,
  openingSavings: NonNegativeMoney,
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
  freeze: z.boolean(),
  reviews: z.boolean(),
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
      freeze: true,
      reviews: true,
      backup: true,
      dividends: true,
      prompted: false,
    },
    cosmetics: { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' },
    investCurrency: null,
    investFx: null,
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
  bucket: z.enum(['cash', 'savings']),
  recurrence: RecurrenceSchema.nullable(),
  period: YearMonthSchema.nullable(),
  note: z.string(),
});
export type Income = z.infer<typeof IncomeSchema>;

export const ExpenseSchema = z
  .object({
    ...base,
    amount: PositiveMoney,
    category: CategorySchema,
    date: LocalDateSchema,
    note: z.string(),
    paymentMethod: PaymentMethodSchema,
    cardId: z.string().min(1).nullable(),
    recurrence: RecurrenceSchema.nullable(),
    subscriptionId: z.string().min(1).nullable(),
  })
  .refine(cardMatchesMethod, cardMessage);
export type Expense = z.infer<typeof ExpenseSchema>;

export const SubscriptionSchema = z
  .object({
    ...base,
    name: z.string().min(1),
    amount: PositiveMoney,
    cycle: CycleSchema,
    nextRenewal: LocalDateSchema,
    /** Day of month renewals return to (a 31st sub renews on Feb 28, then Mar 31). */
    anchorDay: DayOfMonth,
    category: CategorySchema,
    paymentMethod: PaymentMethodSchema,
    cardId: z.string().min(1).nullable(),
    status: z.enum(['active', 'cancelled']),
    audit: z.enum(['keep', 'review', 'cancel']).nullable(),
    /** When `audit` was last set; `null` when there is no mark, or when the mark predates v4. */
    auditedAt: IsoTimestampSchema.nullable(),
    note: z.string(),
  })
  .refine(cardMatchesMethod, cardMessage);
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

export const SalaryFreezeSchema = z
  .object({
    ...base,
    start: LocalDateSchema,
    end: LocalDateSchema,
    lostAmount: NonNegativeMoney,
    mode: z.enum(['manual', 'computed']),
    note: z.string(),
  })
  .refine((v) => v.end >= v.start, { message: 'End must be on or after start', path: ['end'] });
export type SalaryFreeze = z.infer<typeof SalaryFreezeSchema>;

export const TransactionSchema = z
  .object({
    ...base,
    type: z.enum(['transfer', 'adjustment', 'card_payment', 'debt_payment', 'investment']),
    amount: Money,
    date: LocalDateSchema,
    from: BucketSchema.nullable(),
    to: BucketSchema.nullable(),
    debtId: z.string().min(1).nullable(),
    note: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (v.type === 'adjustment') {
      if (v.amount === 0) issue('An adjustment must change the balance', 'amount');
      if (v.to === null) issue('An adjustment names the bucket it corrects', 'to');
    } else if (v.amount <= 0) {
      issue('Amount must be positive', 'amount');
    }
    if (v.type === 'transfer' && (v.from === null || v.to === null || v.from === v.to)) {
      issue('A transfer moves money between two different buckets', 'to');
    }
    if (v.type === 'card_payment' || v.type === 'debt_payment') {
      if (v.debtId === null) issue('A payment must name the card or debt', 'debtId');
      if (v.from === null) issue('A payment must come from a bucket', 'from');
    }
    if (v.type === 'investment' && v.from === null) {
      issue('An investment must come from a bucket', 'from');
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

export const DebtSchema = z.object({
  ...base,
  name: z.string().min(1),
  kind: z.enum(['loan', 'credit_card']),
  openingBalance: NonNegativeMoney,
  openingDate: LocalDateSchema,
  interestRate: z.number().nonnegative(),
  minimumPayment: NonNegativeMoney,
  creditLimit: NonNegativeMoney.nullable(),
  statementDay: DayOfMonth.nullable(),
  dueDay: DayOfMonth.nullable(),
  payInFull: z.boolean(),
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
    /** Where it went; `reinvest` bought more shares. Null when skipped. */
    bucket: z.enum(['cash', 'savings', 'passive', 'reinvest']).nullable(),
    sharesAdded: z.number().nonnegative().nullable(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (v.status === 'skipped') {
      if (v.amount !== 0) issue('A skipped payout received nothing', 'amount');
      if (v.bucket !== null) issue('A skipped payout went nowhere', 'bucket');
      if (v.sharesAdded !== null) issue('A skipped payout added no shares', 'sharesAdded');
    } else if (v.bucket === null) {
      issue('A confirmed payout names where it went', 'bucket');
    }
  });
export type Dividend = z.infer<typeof DividendSchema>;
