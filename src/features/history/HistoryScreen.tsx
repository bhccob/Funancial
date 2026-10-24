import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { SectionLink } from '@/components/ui/Section';
import { lineLabel } from '@/components/ui/lineField';
import { type Category } from '@/domain/entities';
import { entryDate, historyEntries, type Entry } from '@/domain/history';
import { monthKey } from '@/domain/periods';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { entryLine } from '@/features/shared/entryLine';
import { EntryRow } from '@/features/shared/EntryRow';
import { ROWS } from '@/features/shared/PlainSection';
import { useEntryActions } from '@/features/shared/useEntryActions';
import { cn } from '@/lib/cn';
import { formatDate, formatMonthYear } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useToday } from '@/store/useFinance';
import { ActualBalanceDialog } from './ActualBalanceDialog';

type Show = 'all' | 'spending' | 'income' | 'transfers';

const CATEGORY_FILTER = [{ value: 'all', label: 'All categories' }, ...CATEGORY_OPTIONS];

const SHOWS: Record<Show, Array<Entry['kind']> | null> = {
  all: null,
  spending: ['expense'],
  income: ['income', 'dividend', 'sale'],
  transfers: ['transaction'],
};

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
  const { actionsOf, dialogs } = useEntryActions();

  const [month, setMonth] = useState(() => monthKey(today));
  const [show, setShow] = useState<Show>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [correcting, setCorrecting] = useState(false);

  const { expense, income, transaction, dividend, sale, debt, account } = data.tables;

  const months = useMemo(() => {
    // The month picked stays among them: its last entry may have been deleted just now, and the
    // pill would otherwise have nothing to say.
    const keys = new Set([monthKey(today), month]);
    for (const r of [...expense, ...income, ...transaction]) keys.add(monthKey(r.date));
    for (const d of dividend) keys.add(monthKey(d.paidOn));
    for (const s of sale) keys.add(monthKey(s.soldOn));
    return [...keys].sort().reverse();
  }, [expense, income, transaction, dividend, sale, today, month]);

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
    return <EntryRow key={entry.item.id} line={line} {...actionsOf(entry, line.title)} />;
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

      {dialogs}

      <ActualBalanceDialog open={correcting} onClose={() => setCorrecting(false)} />
    </div>
  );
}
