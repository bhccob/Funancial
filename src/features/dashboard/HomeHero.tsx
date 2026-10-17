import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { MonthLine } from '@/components/charts/MonthLine';
import { HelpTip } from '@/components/ui/HelpTip';
import { monthLine } from '@/domain/charts';
import type { LocalDate } from '@/domain/dates';
import { monthKey } from '@/domain/periods';
import type { FinanceView } from '@/domain/view';
import { cn } from '@/lib/cn';
import { formatMonth } from '@/lib/format';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { useMoney } from '@/store/useFinance';
import { AvailableSheet } from './AvailableSheet';
import { HideAmountsButton } from './HideAmountsButton';

/** The month line's three parts, in the order they are drawn. */
type Part = { key: string; name: string; amount: number; color: string };

/** Amounts longer than this many characters ("$1,234,567.89") drop to the smaller size. */
const LONG_AMOUNT = 11;

/**
 * What is available to spend, huge, and under it one thin line for the month: spent so far, bills
 * still to come, and what is left of the monthly limit. The amount is a button that opens what it
 * is made of, and its cover takes in the label too. Tapping a part of the line names it in the
 * left key, with its exact amount; the idle keys are in whole units. While amounts are hidden the
 * line is one plain grey track, as the lengths of its parts would give the amounts away.
 */
export function HomeHero({ view, today }: { view: FinanceView; today: LocalDate }) {
  const money = useMoney();
  const hidden = useAmountsHidden((s) => s.hidden);
  const whole = (minor: number) => money(minor, { whole: true });
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Hiding clears the selection, so a part tapped before does not come back when amounts are shown.
  const [wasHidden, setWasHidden] = useState(hidden);
  if (hidden !== wasHidden) {
    setWasHidden(hidden);
    setSelected(null);
  }

  const line = monthLine(view);
  const parts: Part[] = [
    { key: 'spent', name: 'Spent so far', amount: line.spent, color: 'var(--color-chart-4)' },
    {
      key: 'bills',
      name: 'Bills still to come',
      amount: line.bills,
      color: 'var(--color-chart-5)',
    },
    ...(line.left === null
      ? []
      : [
          {
            key: 'left',
            name: 'Left in your monthly limit',
            amount: line.left,
            color: 'var(--color-accent)',
          },
        ]),
  ];
  const chosen = hidden ? undefined : parts.find((p) => p.key === selected && p.amount > 0);

  const amount = money(view.available);
  const leftKey =
    line.left === null
      ? { value: whole(line.bills), label: 'bills to come' }
      : { value: whole(line.left), label: 'left in limit' };
  const spentKey = chosen
    ? { value: money(chosen.amount), label: chosen.name }
    : { value: whole(line.spent), label: `spent in ${formatMonth(monthKey(today))}` };

  return (
    <section aria-labelledby={labelId}>
      {/* The button's ::after covers this block, label row and amount. The "?" and the eye are
          buttons of their own and sit above it, as a button cannot hold a button. */}
      <div className="relative">
        <div className="flex items-center gap-1 [&>button]:z-10">
          <h2 id={labelId} className="text-muted text-sm font-bold">
            Available to spend
          </h2>
          <HelpTip pageId="available" label="available to spend" />
          {/* -my-3: the 44px target overhangs the label row instead of pushing the amount down. */}
          <span className="relative z-10 -my-3 ml-auto">
            <HideAmountsButton />
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 flex items-center gap-1 text-left after:absolute after:inset-0 after:max-w-xs"
        >
          <span
            className={cn(
              'leading-[1.05] font-extrabold tracking-[-0.045em] tabular-nums',
              amount.length > LONG_AMOUNT ? 'text-[40px]' : 'text-[50px]',
            )}
          >
            {amount}
          </span>
          <ChevronRight aria-hidden="true" className="text-muted size-7 flex-none" />
          {/* Its name is the amount you see, then what it does, so the name holds the visible text. */}
          <span className="sr-only"> Available to spend: see and correct</span>
        </button>
      </div>
      <AvailableSheet open={open} view={view} onClose={() => setOpen(false)} />
      {/* The line is 6px tall with a 44px tap area, so it keeps 20px clear above and below. */}
      <div className="mt-6">
        <MonthLine
          label="This month's money"
          segments={(hidden ? [] : parts).map((p) => ({
            key: p.key,
            label: `${p.name}: ${whole(p.amount)}`,
            amount: p.amount,
            color: p.color,
          }))}
          selected={chosen?.key ?? null}
          onSelect={setSelected}
        />
      </div>
      <div className="text-muted mt-5 flex justify-between gap-4 text-[13px] font-bold">
        <Key {...spentKey} />
        <Key {...leftKey} alignEnd />
      </div>
    </section>
  );
}

function Key({ value, label, alignEnd }: { value: string; label: string; alignEnd?: boolean }) {
  return (
    <div className={cn('min-w-0', alignEnd && 'text-right')}>
      <b className="text-text block text-[15px] font-extrabold tabular-nums">{value}</b>
      {label}
    </div>
  );
}
