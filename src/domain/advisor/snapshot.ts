import { categoryBreakdown } from '../budget';
import { addDays, type LocalDate } from '../dates';
import { addMonths, projectedAnnual } from '../dividends';
import {
  CategorySchema,
  type BuyAsk,
  type BuyDecision,
  type Category,
  type Verdict,
} from '../entities';
import { inRange, monthKey, monthRange } from '../periods';
import { portfolio } from '../portfolio';
import type { DataSnapshot } from '../snapshot';
import { computeFinanceView } from '../view';

/**
 * Everything about the person's money that the advisor is told, as totals. No individual expense,
 * income or transaction, no note, no id and no date of a past one: only sums, balances and limits.
 * Money is integer minor units of `currency`; `emergencyMonths` is a count of months.
 *
 * Beyond what the plan listed it also carries what the rules need and cannot find elsewhere: `cash`,
 * `emergencyFund`, `avgMonthlySpend`, `cardBalance` and each limit's `resetsOn`.
 */
export type AdvisorSnapshot = {
  currency: string;
  /** Salary and other income of this month that has arrived or is expected, never a skipped one. */
  monthIncome: number;
  monthSpent: number;
  spentByCategory: Record<Category, number>;
  limits: Array<{
    scope: Category | 'overall';
    period: 'week' | 'month';
    limit: number;
    /** So far this period, before the purchase. */
    spent: number;
    /** First day of the next period. */
    resetsOn: LocalDate;
  }>;
  cash: number;
  available: number;
  billsTotal: number;
  freeze: { active: boolean; until: LocalDate | null };
  savings: number;
  /** What counts as the emergency fund: the first emergency goal's savings, else the savings bucket. */
  emergencyFund: number;
  /** Spending a month over the last 3 full months. */
  avgMonthlySpend: number;
  /** `emergencyFund` over `avgMonthlySpend`; null when nothing was spent. */
  emergencyMonths: number | null;
  goals: Array<{ name: string; target: number; saved: number; deadline: LocalDate | null }>;
  debts: { total: number; cardsDue: number };
  /** Owed on the card the ask pays with; null when it is paid another way or the card is unknown. */
  cardBalance: number | null;
  investments: { value: number; byType: Record<'stock' | 'etf' | 'other', number> };
  /** What the holdings are expected to pay over the next 365 days, net. */
  dividendsYear: number;
  similar: Array<{
    item: string;
    /** What the whole purchase came to: price times quantity. */
    price: number;
    verdict: Verdict;
    status: BuyDecision['status'];
    usage: number | null;
  }>;
};

/** A decision made before, as much of it as the snapshot needs. */
export type PastDecision = {
  ask: BuyAsk;
  verdict: Verdict;
  status: BuyDecision['status'];
  usage: number | null;
  createdAt: string;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const words = (text: string) => new Set(text.toLowerCase().match(/\p{L}{3,}/gu) ?? []);

/** The last 10 decisions that share a word of 3 letters or more with the item, or its category. */
function similarTo(ask: BuyAsk, past: PastDecision[]): AdvisorSnapshot['similar'] {
  const mine = words(ask.item);
  return past
    .filter(
      (p) => p.ask.category === ask.category || [...words(p.ask.item)].some((w) => mine.has(w)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((p) => ({
      item: p.ask.item,
      price: p.ask.price * p.ask.quantity,
      verdict: p.verdict,
      status: p.status,
      usage: p.usage,
    }));
}

/**
 * The totals of `data` as of `today` that the advisor weighs `ask` against. `past` is the person's
 * earlier decisions, for the similar ones.
 */
export function buildSnapshot(
  data: DataSnapshot,
  today: LocalDate,
  ask: BuyAsk,
  past: PastDecision[] = [],
): AdvisorSnapshot {
  const currency = data.tables.profile[0]?.currency ?? 'USD';
  const view = computeFinanceView(data, today, data.tables.settings[0]?.weekStartsOn ?? 1);
  const month = monthRange(today);

  const spentByCategory = Object.fromEntries(CategorySchema.options.map((c) => [c, 0])) as Record<
    Category,
    number
  >;
  for (const { category, amount } of categoryBreakdown(data.tables.expense, month)) {
    spentByCategory[category] = amount;
  }

  const lastThree = new Set([1, 2, 3].map((n) => monthKey(addMonths(`${monthKey(today)}-01`, -n))));
  const avgMonthlySpend = Math.round(
    sum(data.tables.expense.filter((e) => lastThree.has(monthKey(e.date))).map((e) => e.amount)) /
      3,
  );
  const emergencyGoal = data.tables.goal.find((g) => g.kind === 'emergency');
  const emergencyFund = Math.max(0, emergencyGoal ? emergencyGoal.current : view.buckets.savings);

  const byType = { stock: 0, etf: 0, other: 0 };
  for (const row of portfolio(data, currency).rows) byType[row.holding.type] += row.value ?? 0;

  const card =
    ask.payWith === 'credit_card' ? view.debts.find((d) => d.debt.id === ask.cardId) : undefined;

  return {
    currency,
    monthIncome: sum(
      data.tables.income
        .filter((i) => i.status !== 'skipped' && inRange(i.date, month))
        .map((i) => i.amount),
    ),
    monthSpent: view.spending.month,
    spentByCategory,
    limits: view.limits.map(({ limit, range, spent }) => ({
      scope: limit.category ?? 'overall',
      period: limit.period === 'weekly' ? 'week' : 'month',
      limit: limit.amount,
      spent,
      resetsOn: addDays(range.end, 1),
    })),
    cash: view.buckets.cash,
    available: view.available,
    billsTotal: view.billsTotal,
    freeze: { active: view.activeFreeze !== null, until: view.activeFreeze?.end ?? null },
    savings: view.buckets.savings,
    emergencyFund,
    avgMonthlySpend,
    emergencyMonths: avgMonthlySpend === 0 ? null : emergencyFund / avgMonthlySpend,
    goals: data.tables.goal.map((g) => ({
      name: g.name,
      target: g.target,
      saved: g.current,
      deadline: g.deadline,
    })),
    debts: {
      total: view.debtTotal,
      cardsDue: sum(view.bills.filter((b) => b.kind === 'card').map((b) => b.amount)),
    },
    cardBalance: card?.debt.kind === 'credit_card' ? card.balance : null,
    investments: { value: view.investments, byType },
    dividendsYear: projectedAnnual(data, currency, today),
    similar: similarTo(ask, past),
  };
}
