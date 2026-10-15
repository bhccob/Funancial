import { Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { categoryLabel } from '@/domain/budget';
import {
  CategorySchema,
  type Bucket,
  type Category,
  type Expense,
  type Income,
  type Transaction,
} from '@/domain/entities';
import { monthKey } from '@/domain/periods';
import { ExpenseForm } from '@/features/add/ExpenseForm';
import { paidWithLabel } from '@/features/shared/paidWith';
import { formatDate, formatMonthYear } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions, useMoney, useToday } from '@/store/useFinance';
import { ActualBalanceDialog } from './ActualBalanceDialog';

type Show = 'all' | 'spending' | 'income' | 'transfers';

type Entry =
  | { kind: 'expense'; item: Expense }
  | { kind: 'income'; item: Income }
  | { kind: 'transaction'; item: Transaction };

const BUCKET: Record<Bucket, string> = {
  cash: 'Cash',
  savings: 'Savings',
  passive: 'Passive income',
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...CategorySchema.options.map((c) => ({ value: c, label: categoryLabel(c) })),
];

const SHOWS: Record<Show, Entry['kind'] | null> = {
  all: null,
  spending: 'expense',
  income: 'income',
  transfers: 'transaction',
};

function Amount({ children, tone }: { children: string; tone?: 'in' | 'out' }) {
  return (
    <span
      className={`shrink-0 text-sm font-bold tabular-nums ${tone === 'in' ? 'text-success' : ''}`}
    >
      {children}
    </span>
  );
}

function Row({
  title,
  detail,
  amount,
  chip,
  onDelete,
}: {
  title: string;
  detail: string;
  amount: ReactNode;
  chip?: string;
  onDelete(): void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {chip && (
            <span className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
              {chip}
            </span>
          )}
        </p>
        {detail && <p className="text-muted truncate text-[12.5px]">{detail}</p>}
      </div>
      {amount}
      <button
        type="button"
        aria-label={`Delete ${title}`}
        onClick={onDelete}
        className="text-muted hover:text-danger hover:bg-surface-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-full"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </li>
  );
}

export function HistoryScreen() {
  const data = useApp((s) => s.data);
  const today = useToday();
  const money = useMoney();
  const { deleteIncome, deleteTransaction } = useFinanceActions();
  const run = useAction();

  const [month, setMonth] = useState(() => monthKey(today));
  const [show, setShow] = useState<Show>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<{ title: string; remove(): Promise<unknown> } | null>(
    null,
  );
  const [correcting, setCorrecting] = useState(false);

  const { expense, income, transaction, debt } = data.tables;

  const months = useMemo(() => {
    const keys = new Set([monthKey(today)]);
    for (const r of [...expense, ...income, ...transaction]) keys.add(monthKey(r.date));
    return [...keys].sort().reverse();
  }, [expense, income, transaction, today]);

  const days = useMemo(() => {
    const entries: Entry[] = [
      ...expense.map((item) => ({ kind: 'expense' as const, item })),
      ...income.map((item) => ({ kind: 'income' as const, item })),
      ...transaction.map((item) => ({ kind: 'transaction' as const, item })),
    ].filter(
      (e) =>
        monthKey(e.item.date) === month &&
        (SHOWS[show] === null || e.kind === SHOWS[show]) &&
        (show !== 'spending' ||
          category === 'all' ||
          (e.kind === 'expense' && e.item.category === category)),
    );
    entries.sort(
      (a, b) =>
        b.item.date.localeCompare(a.item.date) || b.item.createdAt.localeCompare(a.item.createdAt),
    );
    const grouped = new Map<string, Entry[]>();
    for (const e of entries) grouped.set(e.item.date, [...(grouped.get(e.item.date) ?? []), e]);
    return [...grouped];
  }, [expense, income, transaction, month, show, category]);

  const debtName = (id: string | null) => debt.find((d) => d.id === id)?.name ?? 'a card or loan';

  function renderEntry(entry: Entry) {
    if (entry.kind === 'expense') {
      const e = entry.item;
      const title = e.note || categoryLabel(e.category);
      return (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => setEditing(e)}
            className="hover:bg-surface-2 -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{title}</span>
              <span className="text-muted block truncate text-[12.5px]">
                {`${categoryLabel(e.category)} · ${paidWithLabel(e.paymentMethod, e.cardId, debt)}${e.subscriptionId ? ' · Subscription' : ''}`}
              </span>
            </span>
            <Amount>{`−${money(e.amount)}`}</Amount>
          </button>
        </li>
      );
    }
    if (entry.kind === 'income') {
      const i = entry.item;
      return (
        <Row
          key={i.id}
          title={i.label}
          detail={`${i.source === 'salary' ? 'Salary' : 'Extra income'} · to ${BUCKET[i.bucket]}`}
          chip={
            i.status === 'expected'
              ? 'Expected'
              : i.status === 'skipped'
                ? "Didn't arrive"
                : undefined
          }
          amount={
            i.status === 'skipped' ? (
              <Amount>{money(0)}</Amount>
            ) : (
              <Amount tone="in">{`+${money(i.amount)}`}</Amount>
            )
          }
          onDelete={() => setDeleting({ title: i.label, remove: () => deleteIncome(i.id) })}
        />
      );
    }
    const t = entry.item;
    let title: string;
    let detail = t.note;
    let amount: string;
    if (t.type === 'transfer') {
      title = `${BUCKET[t.from ?? 'cash']} → ${BUCKET[t.to ?? 'savings']}`;
      amount = money(t.amount);
    } else if (t.type === 'adjustment') {
      title = 'Balance correction';
      detail = [BUCKET[t.to ?? 'cash'], t.note === title ? '' : t.note].filter(Boolean).join(' · ');
      amount = t.amount < 0 ? `−${money(-t.amount)}` : `+${money(t.amount)}`;
    } else {
      title = `Paid ${debtName(t.debtId)}`;
      detail = t.from ? `From ${BUCKET[t.from].toLowerCase()}` : '';
      amount = `−${money(t.amount)}`;
    }
    return (
      <Row
        key={t.id}
        title={title}
        detail={detail}
        amount={<Amount>{amount}</Amount>}
        onDelete={() => setDeleting({ title, remove: () => deleteTransaction(t.id) })}
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="History"
        action={
          <Button size="sm" variant="secondary" onClick={() => setCorrecting(true)}>
            Set actual balance
          </Button>
        }
      />

      <div className="border-border flex flex-col gap-4 border-b py-5 sm:flex-row sm:flex-wrap sm:items-end">
        <Select
          label="Month"
          value={month}
          onChange={setMonth}
          options={months.map((m) => ({ value: m, label: formatMonthYear(m) }))}
          className="sm:w-52"
        />
        <RadioGroup<Show>
          legend="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All' },
            { value: 'spending', label: 'Spending' },
            { value: 'income', label: 'Income' },
            { value: 'transfers', label: 'Transfers' },
          ]}
        />
        {show === 'spending' && (
          <Select
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as 'all' | Category)}
            options={CATEGORY_OPTIONS}
            className="sm:w-48"
          />
        )}
      </div>

      {days.length > 0 ? (
        days.map(([date, entries]) => (
          <section key={date} className="border-border border-b py-4 last:border-b-0">
            <h2 className="text-muted mb-1 text-xs font-bold">{formatDate(date)}</h2>
            <ul className="divide-border divide-y">{entries.map(renderEntry)}</ul>
          </section>
        ))
      ) : (
        <div className="py-6">
          <EmptyState title="Nothing here">
            No entries match for {formatMonthYear(month)}.
          </EmptyState>
        </div>
      )}

      <Dialog open={editing !== null} title="Edit expense" onClose={() => setEditing(null)}>
        {editing && (
          <ExpenseForm key={editing.id} expense={editing} onDone={() => setEditing(null)} />
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        title="Delete this entry?"
        description={deleting ? `${deleting.title} will be removed from your history.` : undefined}
        onClose={() => setDeleting(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const target = deleting;
                setDeleting(null);
                if (target) await run(target.remove, { success: 'Deleted.' });
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <ActualBalanceDialog open={correcting} onClose={() => setCorrecting(false)} />
    </div>
  );
}
