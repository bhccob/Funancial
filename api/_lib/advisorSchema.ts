import { z } from 'zod';

// The advisor's contract, as a standalone copy: the api tsconfig cannot import src (its aliases).
// It mirrors src/domain/entities.ts (BuyAskSchema, FactsSchema, VerdictSchema, ConfidenceSchema),
// src/domain/advisor/snapshot.ts (AdvisorSnapshot) and rules.ts (Analysis). Task 5 adds a test under
// src that parses the body the client builds with it, so a drift shows up there.

/** The longest fact About you holds, and so the longest the advisor may offer to remember. */
const MAX_FACT = 200;

const Money = z.number().int();
const Category = z.enum([
  'food',
  'transport',
  'rent',
  'utilities',
  'entertainment',
  'health',
  'shopping',
  'other',
]);
const Verdict = z.enum(['buy', 'wait', 'cheaper', 'skip']);
const Confidence = z.enum(['low', 'medium', 'high']);

// `new Date('2026-02-31T00:00:00Z')` rolls over to March 3, so the day has to come back unchanged.
const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Expected a date as YYYY-MM-DD');

/** The dearest single item an ask takes: 10,000,000.00 in a currency with two decimals. */
const MAX_ASK_PRICE = 1_000_000_000;

const BuyAskSchema = z.object({
  item: z.string().min(1).max(80),
  price: Money.positive().max(MAX_ASK_PRICE),
  quantity: z.number().int().min(1).max(99),
  category: Category,
  urgency: z.enum(['need', 'want', 'treat']),
  howSoon: z.enum(['today', 'month', 'norush']),
  payWith: z.enum(['cash', 'debit', 'credit_card', 'other']),
  cardId: z.string().min(1).nullable(),
  link: z.string().max(2048).nullable(),
  why: z.string().max(200).nullable(),
});

/** What Claude is shown of the ask: not the card's id, which it has no use for. */
export const AdvisorAskSchema = BuyAskSchema.omit({ cardId: true });

const LimitAfter = z.object({
  limit: Money.positive(),
  spentAfter: Money.nonnegative(),
  pct: z.number().int().nonnegative(),
});

const FactsSchema = z.object({
  total: Money.positive(),
  categoryAfter: LimitAfter.nullable(),
  overallAfter: LimitAfter.nullable(),
  overBy: Money.nonnegative(),
  availableAfter: Money,
  emergencyBefore: z.number().nonnegative().nullable(),
  emergencyAfter: z.number().nonnegative().nullable(),
  goalDelay: z.object({ name: z.string(), days: z.number().int().nonnegative() }).nullable(),
  requiresDebt: z.boolean(),
  resetsOn: LocalDate.nullable(),
});

// Totals only: no expense, income or transaction, no note, no id and no date of a past one.
const SnapshotSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  monthIncome: Money,
  monthSpent: Money,
  spentByCategory: z.record(Category, Money),
  limits: z.array(
    z.object({
      scope: z.union([Category, z.literal('overall')]),
      period: z.enum(['week', 'month']),
      limit: Money.positive(),
      spent: Money,
      resetsOn: LocalDate,
    }),
  ),
  cash: Money,
  available: Money,
  billsTotal: Money,
  freeze: z.object({ active: z.boolean(), until: LocalDate.nullable() }),
  savings: Money,
  emergencyFund: Money,
  avgMonthlySpend: Money,
  emergencyMonths: z.number().nonnegative().nullable(),
  goals: z.array(
    z.object({ name: z.string(), target: Money, saved: Money, deadline: LocalDate.nullable() }),
  ),
  debts: z.object({ total: Money, cardsDue: Money }),
  cardBalance: Money.nullable(),
  investments: z.object({
    value: Money,
    byType: z.object({ stock: Money, etf: Money, other: Money }),
  }),
  dividendsYear: Money,
  similar: z
    .array(
      z.object({
        item: z.string().max(80),
        price: Money,
        verdict: Verdict,
        status: z.enum(['open', 'waiting', 'bought', 'skipped']),
        usage: z.number().int().min(1).max(5).nullable(),
      }),
    )
    .max(10),
});

const RulesSchema = z.object({
  /** A whole number, 0–100: what the rules engine said, guards applied. */
  meter: z.number().int().min(0).max(100),
  verdict: Verdict,
  confidence: Confidence,
  guards: z.object({
    capAtWait: z.boolean(),
    reasons: z.array(z.string().max(200)).max(10),
  }),
});

const AboutSchema = z.object({
  situation: z.string().max(500),
  matters: z.string().max(500),
  overspend: z.string().max(500),
  facts: z.array(z.string().max(MAX_FACT)).max(50),
});

// An advisor turn is its reply and question, and max_tokens (4000, about 16,000 characters) lets one
// run past this, so the client clips a turn to 8000 when it builds the body. The 64 KB limit on the
// body is what bounds the whole.
const Turn = z.object({ role: z.enum(['advisor', 'you']), text: z.string().max(8000) });

export const AdvisorRequestSchema = z.object({
  snapshot: SnapshotSchema,
  ask: BuyAskSchema,
  facts: FactsSchema,
  rules: RulesSchema,
  about: AboutSchema,
  debate: z.array(Turn).max(40),
});
export type AdvisorRequest = z.infer<typeof AdvisorRequestSchema>;

/** What Claude is shown: the request, less the card's id, and the newest turns of the debate. */
export type AdvisorInput = Omit<AdvisorRequest, 'ask'> & {
  ask: z.infer<typeof AdvisorAskSchema>;
};

const answerShape = {
  recommendation: Verdict,
  /** 0 (skip it) to 100 (buy it); the route holds it within the guards. */
  meter: z.number(),
  confidence: Confidence,
  summary: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  alternatives: z.array(z.string()),
  /** Hours to wait before deciding; null when none. */
  coolingOffHours: z.number().nullable(),
  /** Empty on the first ask. */
  reply: z.string(),
  question: z.string(),
  /** A new, durable fact the person stated about themselves; null when there is none. */
  remember: z.string().nullable(),
};

/** What Claude is asked to return, as a JSON schema. Kept free of what structured output refuses (min length). */
export const AdvisorAnswerFormat = z.object(answerShape);

/**
 * What is accepted back. The same, except that hours which are no number read as none and negative
 * hours as zero (a decision is stored with them, and a bad one would make the save throw), and a
 * fact to remember of more than 200 characters reads as none (an About-you fact holds 200, and a
 * longer one would make the next ask fail the request schema).
 */
export const AdvisorAnswerSchema = z.object({
  ...answerShape,
  // The question is the debate's next turn, so an empty one is no answer.
  question: z.string().min(1),
  coolingOffHours: z.preprocess(
    (h) => (typeof h === 'number' && Number.isFinite(h) ? Math.max(0, h) : null),
    z.number().nullable(),
  ),
  remember: z.preprocess(
    (r) => (typeof r === 'string' && r.length > MAX_FACT ? null : r),
    z.string().nullable(),
  ),
});
export type AdvisorAnswer = z.infer<typeof AdvisorAnswerSchema>;
