import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { HelpTip } from '@/components/ui/HelpTip';
import { Section, SectionLink } from '@/components/ui/Section';
import { netWorthChangeThisMonth, netWorthSeries } from '@/domain/charts';
import type { LocalDate } from '@/domain/dates';
import { minorDigits } from '@/domain/money';
import type { DataSnapshot } from '@/domain/snapshot';
import type { FinanceView } from '@/domain/view';
import { useCurrency, useMoney } from '@/store/useFinance';
import { NetWorthSheet } from './NetWorthSheet';

export interface NetWorthSectionProps {
  data: DataSnapshot;
  view: FinanceView;
  today: LocalDate;
}

/**
 * The number (a button that opens what it is made of), how far it has moved this month, its
 * 30-day line, and the same parts as a legend.
 */
export function NetWorthSection({ data, view, today }: NetWorthSectionProps) {
  const money = useMoney();
  const currency = useCurrency();
  const whole = (minor: number) => money(minor, { whole: true });
  const [open, setOpen] = useState(false);

  const trend = useMemo(() => netWorthSeries(data, today, 30).map((p) => p.value), [data, today]);
  const change = useMemo(() => netWorthChangeThisMonth(data, today), [data, today]);

  // A move smaller than the smallest whole unit would read "▲ $0": call it no change. Decided on
  // the numbers, not on `whole`'s text, which is the same four bullets for every amount while hidden.
  const moved = Math.round(Math.abs(change) / 10 ** minorDigits(currency)) > 0;
  const changeText = !moved ? (
    <span className="text-muted text-[13.5px] font-extrabold">No change this month</span>
  ) : change > 0 ? (
    <span className="text-accent-text text-[13.5px] font-extrabold">{`▲ ${whole(change)} this month`}</span>
  ) : (
    <span className="text-danger text-[13.5px] font-extrabold">{`▼ ${whole(-change)} this month`}</span>
  );

  // Bank accounts and cash wallets, savings (passive income's account among them), investments, and
  // what the cards and loans owe: the parts of the figure, from the accounts in use.
  const bankAndCash = view.accounts
    .filter((r) => r.account.kind === 'debit' || r.account.kind === 'cash')
    .reduce((sum, r) => sum + r.balance, 0);
  const parts = [
    { label: 'Bank & cash', amount: bankAndCash, color: 'var(--color-chart-1)' },
    { label: 'Savings', amount: view.saved, color: 'var(--color-chart-3)' },
    ...(view.investments > 0
      ? [{ label: 'Investments', amount: view.investments, color: 'var(--color-chart-2)' }]
      : []),
    { label: 'Debts', amount: view.owed, color: 'var(--color-danger)' },
  ];

  return (
    <Section
      title="Net worth"
      help={<HelpTip pageId="net-worth" label="net worth" />}
      action={changeText}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-1 text-left"
        >
          <span className="text-[34px] leading-tight font-extrabold tracking-[-0.035em] tabular-nums">
            {money(view.netWorth)}
          </span>
          <ChevronRight aria-hidden="true" className="text-muted size-6 flex-none" />
          {/* Its name is the amount you see, then what it does, so the name holds the visible text. */}
          <span className="sr-only"> Net worth: see and correct</span>
        </button>
        <SectionLink to="/income">Income stats</SectionLink>
      </div>
      <NetWorthSheet open={open} view={view} onClose={() => setOpen(false)} />
      <div className="mt-3">
        <Sparkline
          values={trend}
          height={70}
          color="var(--color-accent)"
          label={`Net worth over the last 30 days, now ${money(view.netWorth)}`}
        />
      </div>
      <ul className="text-muted mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-bold tabular-nums">
        {parts.map((part) => (
          <li key={part.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-[9px] flex-none rounded-full"
              style={{ backgroundColor: part.color }}
            />
            {part.label} {whole(part.amount)}
          </li>
        ))}
      </ul>
    </Section>
  );
}
