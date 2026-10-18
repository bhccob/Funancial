import type { LocalDate } from './dates';
import { dividendTotals, monthlyIncome } from './dividends';
import { monthKey } from './periods';
import type { DataSnapshot } from './snapshot';

/** One calendar month of income that has arrived, in minor units of the profile currency. */
export type IncomeMonth = {
  month: string;
  salary: number;
  extra: number;
  dividends: number;
  total: number;
};

/** Where income came from: an income label, or a dividend's symbol. */
export type IncomeSource = { name: string; amount: number };

const DEFAULT_LABEL = { salary: 'Salary', extra: 'Extra income' } as const;
const sum = (items: Array<{ amount: number }>) => items.reduce((total, i) => total + i.amount, 0);

/**
 * What arrived in each of the last `months` calendar months, oldest first, the newest being
 * `today`'s. Only confirmed income counts (an expected or skipped salary never does), and
 * confirmed dividends by the day they were paid, whichever bucket they went to, reinvested ones
 * included. Moving money and balance corrections are not income and are never looked at.
 *
 * shortcut: dividends come from `monthlyIncome`, whose window is twelve months, so `months` is
 * capped at 12; upgrade `monthlyIncome` if a longer view is wanted.
 */
export function incomeByMonth(data: DataSnapshot, today: LocalDate, months: number): IncomeMonth[] {
  const currency = data.tables.profile[0]?.currency ?? 'USD';
  const confirmed = data.tables.income.filter((i) => i.status === 'confirmed');
  return monthlyIncome(data, currency, today, 'past')
    .slice(-Math.min(Math.max(Math.floor(months), 1), 12))
    .map(({ month, amount: dividends }) => {
      const of = (source: 'salary' | 'extra') =>
        sum(confirmed.filter((i) => i.source === source && monthKey(i.date) === month));
      const [salary, extra] = [of('salary'), of('extra')];
      return { month, salary, extra, dividends, total: salary + extra + dividends };
    });
}

/**
 * The monthly average of the months given, from the first one with income on: the months before
 * the person started using the app are not months of no pay. Rounded to a whole minor unit; 0
 * with no income at all.
 */
export function averageIncome(rows: IncomeMonth[]): number {
  const first = rows.findIndex((r) => r.total > 0);
  if (first < 0) return 0;
  const counted = rows.slice(first);
  return Math.round(counted.reduce((total, r) => total + r.total, 0) / counted.length);
}

/**
 * Income that arrived this calendar year (1 January through 31 December of `today`'s year), split
 * into salary, extra and dividends, with the five biggest sources: income by label (a blank label
 * by its source's name), dividends by symbol, biggest first.
 */
export function incomeThisYear(
  data: DataSnapshot,
  today: LocalDate,
): { salary: number; extra: number; dividends: number; total: number; top: IncomeSource[] } {
  const year = today.slice(0, 4);
  const bySource = new Map<string, IncomeSource>();
  const add = (kind: 'income' | 'dividend', name: string, amount: number) => {
    const key = `${kind}:${name}`;
    bySource.set(key, { name, amount: (bySource.get(key)?.amount ?? 0) + amount });
  };

  let salary = 0;
  let extra = 0;
  for (const i of data.tables.income) {
    if (i.status !== 'confirmed' || i.date.slice(0, 4) !== year) continue;
    if (i.source === 'salary') salary += i.amount;
    else extra += i.amount;
    add('income', i.label.trim() || DEFAULT_LABEL[i.source], i.amount);
  }
  for (const d of data.tables.dividend) {
    if (d.status === 'confirmed' && d.paidOn.slice(0, 4) === year)
      add('dividend', d.symbol, d.amount);
  }

  const dividends = dividendTotals(data, today).year;
  const top = [...bySource.values()]
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 5);
  return { salary, extra, dividends, total: salary + extra + dividends, top };
}

/**
 * Whole percentages of `parts` that add up to exactly 100: each is rounded down, and the points
 * still missing go to the biggest remainders (the bigger part first on a tie). All 0 with no total.
 */
export function wholePercents(parts: number[]): number[] {
  const total = parts.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return parts.map(() => 0);
  // Minor units are integers, so `% total` keeps the remainders exact.
  const remainders = parts.map((p) => (p * 100) % total);
  const out = parts.map((p, i) => (p * 100 - remainders[i]!) / total);
  const missing = 100 - out.reduce((sum, p) => sum + p, 0);
  const order = parts
    .map((_, i) => i)
    .sort((a, b) => remainders[b]! - remainders[a]! || parts[b]! - parts[a]!);
  for (const i of order.slice(0, missing)) out[i]! += 1;
  return out;
}
