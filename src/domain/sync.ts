import type { LocalDate } from './dates';
import type { Expense, Income, Subscription } from './entities';
import { monthKey, monthsBetween } from './periods';
import { nextOccurrence } from './recurrence';
import { expectedSalary, payDate } from './salary';
import type { DataSnapshot, TableName, TableRecord } from './snapshot';

const stamp = (d: LocalDate) => ({
  createdAt: `${d}T12:00:00.000Z`,
  updatedAt: `${d}T12:00:00.000Z`,
});

/**
 * Records that should exist by `today` but don't yet: one expense per subscription renewal
 * that has come due (with the subscription moved past today), and an *expected* salary for each
 * pay day reached. Deterministic ids make it safe to run on every open.
 */
export function dueGenerated(data: DataSnapshot, today: LocalDate): TableRecord[] {
  const out: TableRecord[] = [];
  const expenseIds = new Set(data.tables.expense.map((e) => e.id));

  for (const sub of data.tables.subscription) {
    if (sub.status !== 'active' || sub.nextRenewal > today) continue;
    let d = sub.nextRenewal;
    while (d <= today) {
      const id = `sub-${sub.id}-${d}`;
      if (!expenseIds.has(id)) {
        const expense: Expense = {
          id,
          ...stamp(d),
          amount: sub.amount,
          category: sub.category,
          date: d,
          note: sub.name,
          paymentMethod: sub.paymentMethod,
          cardId: sub.cardId,
          recurrence: null,
          subscriptionId: sub.id,
        };
        out.push({ table: 'expense', record: expense });
      }
      d = nextOccurrence(d, sub.cycle, sub.anchorDay);
    }
    const moved: Subscription = { ...sub, nextRenewal: d, updatedAt: stamp(today).updatedAt };
    out.push({ table: 'subscription', record: moved });
  }

  const profile = data.tables.profile[0];
  const salary = profile?.salary;
  if (profile && salary && salary.monthlyAmount > 0) {
    const paid = new Set(
      data.tables.income.filter((i) => i.source === 'salary' && i.period).map((i) => i.period),
    );
    for (const month of monthsBetween(monthKey(profile.openingDate), monthKey(today))) {
      const date = payDate(month, salary.payDay);
      // Pay on the opening day is already in the opening cash; pay before `since` predates the salary.
      if (date <= profile.openingDate || (salary.since && date <= salary.since)) continue;
      if (date > today || paid.has(month)) continue;
      const amount = expectedSalary(profile, data.tables.salaryFreeze, month);
      if (amount <= 0) continue;
      const income: Income = {
        id: `salary-${month}`,
        ...stamp(date),
        amount,
        source: 'salary',
        label: 'Salary',
        date,
        status: 'expected',
        bucket: 'cash',
        recurrence: null,
        period: month,
        note: '',
      };
      out.push({ table: 'income', record: income });
    }
  }
  return out;
}

/** The snapshot with records added or replaced by id (pure; for previews and tests). */
export function applyRecords(data: DataSnapshot, items: TableRecord[]): DataSnapshot {
  const tables = { ...data.tables } as Record<TableName, Array<{ id: string }>>;
  for (const { table, record } of items) {
    const rows = tables[table];
    tables[table] = rows.some((r) => r.id === record.id)
      ? rows.map((r) => (r.id === record.id ? record : r))
      : [...rows, record];
  }
  return { ...data, tables: tables as DataSnapshot['tables'] };
}
