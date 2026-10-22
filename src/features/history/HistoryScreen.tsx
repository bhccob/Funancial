import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SectionLink } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { type Category, type Expense } from '@/domain/entities';
import { entryDate, historyEntries, type Entry } from '@/domain/history';
import { monthKey } from '@/domain/periods';
import { ExpenseForm } from '@/features/add/ExpenseForm';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { EntryChip, EntryDetail } from '@/features/shared/EntryParts';
import { entryLine, type EntryLine } from '@/features/shared/entryLine';
import { formatDate, formatMonthYear } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions, useMoney, useToday } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';
import { ActualBalanceDialog } from './ActualBalanceDialog';

type Show = 'all' | 'spending' | 'income' | 'transfers';

const CATEGORY_FILTER = [{ value: 'all', label: 'All categories' }, ...CATEGORY_OPTIONS];

const SHOWS: Record<Show, Array<Entry['kind']> | null> = {
  all: null,
  spending: ['expense'],
  income: ['income', 'dividend', 'sale'],
  transfers: ['transaction'],
};

/** An entry's amount, with its sign; money in reads in the success color. */
function Amount({ line }: { line: EntryLine }) {
  const money = useMoney();
  return (
    <span
      className={`shrink-0 text-sm font-bold tabular-nums ${line.tone === 'in' ? 'text-success' : ''}`}
    >
      {`${line.sign}${money(line.amount)}`}
    </span>
  );
}

function Row({ line, onDelete }: { line: EntryLine; onDelete(): void }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{line.title}</span>
          <EntryChip line={line} />
        </p>
        {(line.detail || line.profit !== undefined) && (
          <p className="text-muted truncate text-[12.5px]">
            <EntryDetail line={line} />
          </p>
        )}
      </div>
      <Amount line={line} />
      <button
        type="button"
        aria-label={`Delete ${line.title}`}
        onClick={onDelete}
        className="text-muted hover:text-danger hover:bg-surface-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </li>
  );
}

export function HistoryScreen() {
  const data = useApp((s) => s.data);
  const today = useToday();
  const { deleteIncome, deleteTransaction } = useFinanceActions();
  const { deleteDividend, undoSale } = useInvestActions();
  const run = useAction();

  const [month, setMonth] = useState(() => monthKey(today));
  const [show, setShow] = useState<Show>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<{
    title: string;
    /** Said in place of the usual "removed from your history", when deleting does more. */
    description?: string;
    remove(): Promise<unknown>;
  } | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const { expense, income, transaction, dividend, sale, debt, account } = data.tables;

  const months = useMemo(() => {
    const keys = new Set([monthKey(today)]);
    for (const r of [...expense, ...income, ...transaction]) keys.add(monthKey(r.date));
    for (const d of dividend) keys.add(monthKey(d.paidOn));
    for (const s of sale) keys.add(monthKey(s.soldOn));
    return [...keys].sort().reverse();
  }, [expense, income, transaction, dividend, sale, today]);

  const everything = useMemo(() => historyEntries(data), [data]);

  const days = useMemo(() => {
    const entries = everything.filter(
      (e) =>
        monthKey(entryDate(e)) === month &&
        (SHOWS[show]?.includes(e.kind) ?? true) &&
        (show !== 'spending' ||
          category === 'all' ||
          (e.kind === 'expense' && e.item.category === category)),
    );
    const grouped = new Map<string, Entry[]>();
    for (const e of entries) grouped.set(entryDate(e), [...(grouped.get(entryDate(e)) ?? []), e]);
    return [...grouped];
  }, [everything, month, show, category]);

  function renderEntry(entry: Entry) {
    // Archived accounts are in the table too, so old rows keep their names.
    const line = entryLine(entry, { accounts: account, debts: debt });
    if (entry.kind === 'expense') {
      const e = entry.item;
      return (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => setEditing(e)}
            className="hover:bg-surface-2 -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{line.title}</span>
              <span className="text-muted block truncate text-[12.5px]">{line.detail}</span>
            </span>
            <Amount line={line} />
          </button>
        </li>
      );
    }
    const { title } = line;
    const remove =
      entry.kind === 'income'
        ? () => setDeleting({ title, remove: () => deleteIncome(entry.item.id) })
        : entry.kind === 'dividend'
          ? () => setDeleting({ title, remove: () => deleteDividend(entry.item.id) })
          : entry.kind === 'sale'
            ? () =>
                setDeleting({
                  title,
                  description: `${title} will be removed from your history, and its shares go back to your ${entry.item.symbol} holding.`,
                  remove: () => undoSale(entry.item.id),
                })
            : () => setDeleting({ title, remove: () => deleteTransaction(entry.item.id) });
    return <Row key={entry.item.id} line={line} onDelete={remove} />;
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
      >
        {/* Income has no row of its own in the menus: its page is one tap from here. */}
        <SectionLink to="/income">Income stats</SectionLink>
      </PageHeader>

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
            options={CATEGORY_FILTER}
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
        description={
          deleting
            ? (deleting.description ?? `${deleting.title} will be removed from your history.`)
            : undefined
        }
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
