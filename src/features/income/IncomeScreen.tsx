import { useMemo, useState } from 'react';
import { sliceColors } from '@/components/charts/colors';
import { StackedBars } from '@/components/charts/StackedBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyLink, Section } from '@/components/ui/Section';
import { averageIncome, incomeByMonth, incomeThisYear, wholePercents } from '@/domain/income';
import { minorDigits } from '@/domain/money';
import { formatMonthShort, formatMonthYear } from '@/lib/format';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useMoney, useToday } from '@/store/useFinance';

/** The three places income comes from, in the fixed order the bars stack and the legend reads. */
const SOURCES: Array<{ key: 'salary' | 'extra' | 'dividends'; label: string }> = [
  { key: 'salary', label: 'Salary' },
  { key: 'extra', label: 'Extra' },
  { key: 'dividends', label: 'Dividends' },
];
const COLORS = sliceColors(SOURCES);

const MONTHS = 12;
const BIG_NUMBER = 'text-[34px] leading-tight font-extrabold tracking-[-0.035em] tabular-nums';

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-[9px] flex-none rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/** What came in: this month against the average, the last 12 months by source, this year, and the biggest sources. */
export function IncomeScreen() {
  const money = useMoney();
  const currency = useCurrency();
  const data = useApp((s) => s.data);
  const today = useToday();
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo(() => incomeByMonth(data, today, MONTHS), [data, today]);
  const year = useMemo(() => incomeThisYear(data, today), [data, today]);

  if (rows.every((r) => r.total === 0)) {
    return (
      <div>
        <PageHeader title="Income" />
        <Section>
          <EmptyState
            title="No income yet"
            action={<EmptyLink to="/add?type=income">Add income</EmptyLink>}
          >
            Salary, extra income and dividends you receive show up here.
          </EmptyState>
        </Section>
      </div>
    );
  }

  const whole = (minor: number) => money(minor, { whole: true });
  const thisMonth = rows[rows.length - 1]!;
  const average = averageIncome(rows);
  const diff = thisMonth.total - average;
  // Decided on the numbers, as Home's net worth line is: hidden, every amount reads the same.
  const moved = Math.round(Math.abs(diff) / 10 ** minorDigits(currency)) > 0;
  const change = !moved ? (
    <span className="text-muted text-[13.5px] font-extrabold">About average</span>
  ) : diff > 0 ? (
    <span className="text-accent-text text-[13.5px] font-extrabold">{`▲ ${whole(diff)} vs average`}</span>
  ) : (
    <span className="text-danger text-[13.5px] font-extrabold">{`▼ ${whole(-diff)} vs average`}</span>
  );

  const picked = selected === null ? undefined : rows[selected];
  const shares = wholePercents(SOURCES.map((s) => year[s.key]));

  return (
    <div>
      <PageHeader title="Income" />

      <Section title="This month" action={change}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={BIG_NUMBER}>{money(thisMonth.total)}</span>
          <span className="text-muted text-sm font-bold">{`Average: ${whole(average)} a month`}</span>
        </div>
      </Section>

      <Section title="Last 12 months">
        <StackedBars
          label="Income per month"
          bars={rows.map((row, i) => ({
            label: formatMonthShort(`${row.month}-01`),
            name: formatMonthYear(row.month),
            current: i === rows.length - 1,
            parts: SOURCES.map((s, k) => ({ key: s.key, amount: row[s.key], color: COLORS[k]! })),
          }))}
          selected={selected}
          onSelect={setSelected}
          formatAmount={(minor) => money(minor)}
        />
        <ul className="text-muted mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-bold">
          {SOURCES.map((s, k) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <Dot color={COLORS[k]!} />
              {s.label}
            </li>
          ))}
        </ul>
        {/* Two lines tall, so a long month line does not push what is below down when a bar is tapped. */}
        <p role="status" className="text-muted mt-3 min-h-10 text-sm font-bold">
          {picked ? (
            <>
              <b className="text-text">{formatMonthYear(picked.month)}</b>
              {SOURCES.map((s) => ` · ${s.label} ${money(picked[s.key])}`).join('')}
            </>
          ) : (
            'Tap a month to see where it came from'
          )}
        </p>
      </Section>

      <Section title="This year">
        {year.total > 0 ? (
          <>
            <p className={BIG_NUMBER}>{money(year.total)}</p>
            <div aria-hidden="true" className="mt-3 flex h-1.5 gap-[3px]">
              {SOURCES.map((s, k) => (
                <span
                  key={s.key}
                  className="rounded-full"
                  style={{ flex: year[s.key], backgroundColor: COLORS[k] }}
                />
              ))}
            </div>
            <ul className="mt-2">
              {SOURCES.map((s, k) => (
                <li key={s.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    <Dot color={COLORS[k]!} />
                    {s.label}
                  </span>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-extrabold">{money(year[s.key])}</span>
                    <span className="text-muted w-10 text-right text-sm font-bold">
                      {`${shares[k]}%`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState title="Nothing yet this year">
            Income that arrives this year shows up here.
          </EmptyState>
        )}
      </Section>

      {year.top.length > 0 && (
        <Section title="Biggest sources" action="This year">
          <ol>
            {year.top.map((source, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 font-bold">
                <span className="min-w-0 truncate">{source.name}</span>
                <span className="font-extrabold tabular-nums">{money(source.amount)}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
