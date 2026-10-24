import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SectionLink } from '@/components/ui/Section';
import { lineLabel } from '@/components/ui/lineField';
import { type Category, type Expense } from '@/domain/entities';
import { entryDate, historyEntries, type Entry } from '@/domain/history';
import { monthKey } from '@/domain/periods';
import { ExpenseForm } from '@/features/add/ExpenseForm';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { EntryChip, EntryDetail } from '@/features/shared/EntryParts';
import { entryLine, type EntryLine } from '@/features/shared/entryLine';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
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
      className={`shrink-0 text-[14.5px] font-extrabold tabular-nums ${line.tone === 'in' ? 'text-success' : ''}`}
    >
      {`${line.sign}${money(line.amount)}`}
    </span>
  );
}

/** What an entry is called, a chip beside it for income not counted yet, and the line under it. */
function EntryText({ line }: { line: EntryLine }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-2">
        <b className="truncate text-[14.5px] font-extrabold">{line.title}</b>
        <EntryChip line={line} />
      </span>
      {(line.detail || line.profit !== undefined) && (
        <span className="text-muted block truncate text-[12px] font-semibold">
          <EntryDetail line={line} />
        </span>
      )}
    </span>
  );
}

/**
 * One entry as a plain row (under `ROWS`): its words and its amount, then a 44px place for what
 * can be done with it. With `onOpen` the whole row is the button that does it (an expense opens its
 * edit form) and the place holds a chevron; with `onDelete` the place holds a delete button. The
 * row knows nothing of what opening or deleting does: that is the caller's.
 */
function EntryRow({
  line,
  onOpen,
  onDelete,
}: {
  line: EntryLine;
  onOpen?(): void;
  onDelete?(): void;
}) {
  if (onOpen) {
    return (
      <li>
        <button
          type="button"
          onClick={onOpen}
          className="hover:bg-surface-2 -mx-2 flex min-h-[54px] w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left"
        >
          <EntryText line={line} />
          <Amount line={line} />
          <span
            aria-hidden="true"
            className="text-muted -mr-2 grid size-11 shrink-0 place-items-center"
          >
            <ChevronRight className="size-[18px]" />
          </span>
        </button>
      </li>
    );
  }
  return (
    <li className="flex min-h-[54px] items-center gap-3 py-2">
      <EntryText line={line} />
      <Amount line={line} />
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${line.title}`}
          onClick={onDelete}
          className="text-muted hover:text-danger hover:bg-surface-2 press -mr-2 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      )}
    </li>
  );
}

/** What the person is asked before an entry is deleted, and what deleting it does. */
interface Removal {
  title: string;
  /** Said in place of the usual "removed from your history", when deleting does more. */
  description?: string;
  remove(): Promise<unknown>;
}

/** The actions that delete the entries History lists, bar an expense, which is deleted from its edit form. */
interface RemovalActions {
  deleteIncome(id: string): Promise<unknown>;
  deleteTransaction(id: string): Promise<unknown>;
  deleteDividend(id: string): Promise<unknown>;
  undoSale(id: string): Promise<unknown>;
}

/** What deleting `entry` asks and does: a sale is undone, its shares going back to the holding. */
function removalOf(
  entry: Exclude<Entry, { kind: 'expense' }>,
  title: string,
  actions: RemovalActions,
): Removal {
  switch (entry.kind) {
    case 'income':
      return { title, remove: () => actions.deleteIncome(entry.item.id) };
    case 'dividend':
      return { title, remove: () => actions.deleteDividend(entry.item.id) };
    case 'sale':
      return {
        title,
        description: `${title} will be removed from your history, and its shares go back to your ${entry.item.symbol} holding.`,
        remove: () => actions.undoSale(entry.item.id),
      };
    case 'transaction':
      return { title, remove: () => actions.deleteTransaction(entry.item.id) };
  }
}

/**
 * A choice among a few (a month, a category) as a glass pill saying what is chosen, with its label
 * above it as the pills of a `RadioGroup` have theirs. The select is the real control, laid
 * invisibly over the pill and 44px tall, so it opens and speaks as any select does.
 */
function PillSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={cn(lineLabel, 'mb-0.5')}>
        {label}
      </label>
      <div className="glass press has-[:focus-visible]:outline-focus relative inline-flex h-8 max-w-full items-center gap-1.5 self-start rounded-full pr-2.5 pl-3 text-[12.5px] font-extrabold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
        <span aria-hidden="true" className="truncate">
          {options.find((o) => o.value === value)?.label}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 flex-none" />
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute top-1/2 left-1/2 m-0 h-11 w-full min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer appearance-none rounded-full opacity-0"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
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
  const [deleting, setDeleting] = useState<Removal | null>(null);
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
      return <EntryRow key={e.id} line={line} onOpen={() => setEditing(e)} />;
    }
    return (
      <EntryRow
        key={entry.item.id}
        line={line}
        onDelete={() =>
          setDeleting(
            removalOf(entry, line.title, {
              deleteIncome,
              deleteTransaction,
              deleteDividend,
              undoSale,
            }),
          )
        }
      />
    );
  }

  return (
    <div className="max-w-3xl">
      {/* History is a row of Profile's menu: where Back goes when the app has no history to go back through. */}
      <PageHeader
        title="History"
        back
        backTo="/profile"
        action={
          <Button size="sm" variant="secondary" onClick={() => setCorrecting(true)}>
            Set actual balance
          </Button>
        }
      >
        {/* Income has no row of its own in the menus: its page is one tap from here. */}
        <SectionLink to="/income">Income stats</SectionLink>
      </PageHeader>

      {/* The filters are glass pills, as the add forms' choices are. */}
      <div className="flex flex-col gap-4 pt-4 pb-1">
        <PillSelect
          label="Month"
          value={month}
          onChange={setMonth}
          options={months.map((m) => ({ value: m, label: formatMonthYear(m) }))}
        />
        <RadioGroup<Show>
          variant="pills"
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
          <PillSelect
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as 'all' | Category)}
            options={CATEGORY_FILTER}
          />
        )}
      </div>

      {days.length > 0 ? (
        days.map(([date, entries]) => (
          <section key={date} className="pt-5">
            <h2 className="text-muted mx-1 mb-1 text-[13px] font-bold">{formatDate(date)}</h2>
            <ul className={cn('px-1', ROWS)}>{entries.map(renderEntry)}</ul>
          </section>
        ))
      ) : (
        <div className="pt-4">
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
