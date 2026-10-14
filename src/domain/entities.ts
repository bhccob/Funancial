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
  salary: z.object({ monthlyAmount: NonNegativeMoney, payDay: DayOfMonth }).nullable(),
  onboardedAt: IsoTimestampSchema.nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

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
  };
}

export const IncomeSchema = z.object({
  ...base,
  amount: PositiveMoney,
  source: z.enum(['salary', 'extra']),
  label: z.string(),
  date: LocalDateSchema,
  status: z.enum(['expected', 'confirmed']),
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
    category: CategorySchema,
    paymentMethod: PaymentMethodSchema,
    cardId: z.string().min(1).nullable(),
    status: z.enum(['active', 'cancelled']),
    audit: z.enum(['keep', 'review', 'cancel']).nullable(),
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
    type: z.enum(['transfer', 'adjustment', 'card_payment', 'debt_payment']),
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
