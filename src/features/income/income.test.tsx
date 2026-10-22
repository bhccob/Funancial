import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDividend, makeIncome, makeProfile } from '@/test/fixtures';
import { IncomeScreen } from './IncomeScreen';

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });

afterEach(() => useAmountsHidden.setState({ hidden: false }));

const salary = (date: string, amount: number) =>
  makeIncome({ source: 'salary', label: 'Salary', date, amount });
const extra = (date: string, amount: number, label: string) =>
  makeIncome({ source: 'extra', label, date, amount });
/** A confirmed payout, into an account (Main account unless named) or reinvested. */
const paid = (paidOn: string, amount: number, symbol: string, to = 'acct-main') =>
  makeDividend({
    paidOn,
    expectedPayDate: paidOn,
    amount,
    symbol,
    accountId: to === 'reinvest' ? null : to,
    reinvested: to === 'reinvest',
  });

/**
 * Twelve months, November 2025 to October 2026, adding up to 12,000.00 (an average of 1,000.00).
 * This year (to 14 October) is 10,000.00: salary 6,000.00 (60%), extra 2,500.00 (25%) and
 * dividends 1,500.00 (15%). October alone is 4,013.00.
 */
function filled(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ currency: 'USD' }));
  data.tables.income.push(
    salary('2025-11-25', 2_000_00), // last year: in the bars, not in this year
    salary('2026-01-25', 3_000_00),
    extra('2026-03-08', 1_000_00, 'Gift'),
    extra('2026-08-12', 500_00, 'Freelance'),
    salary('2026-10-05', 3_000_00),
    extra('2026-10-10', 1_000_00, 'Freelance'),
    // Never arrived, or not yet: not income.
    makeIncome({ source: 'salary', date: '2026-10-25', amount: 9_999_00, status: 'expected' }),
    makeIncome({ source: 'salary', date: '2026-09-25', amount: 9_999_00, status: 'skipped' }),
  );
  data.tables.dividend.push(
    paid('2026-05-20', 1_487_00, 'VWRL', 'acct-passive'),
    paid('2026-10-03', 13_00, 'KO', 'reinvest'),
  );
  return data;
}

function renderIncome(data: DataSnapshot) {
  return renderWithStore(
    <MemoryRouter>
      <IncomeScreen />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY }),
  );
}

const region = (name: string) => screen.getByRole('region', { name });

describe('Income page', () => {
  it('is titled Income', () => {
    renderIncome(filled());
    expect(screen.getByRole('heading', { level: 1, name: 'Income' })).toBeInTheDocument();
  });

  it('shows this month large, with the average and how far it is from it', () => {
    renderIncome(filled());
    const month = region('This month');
    expect(within(month).getByText(usd(4_013_00))).toHaveClass('text-[34px]');
    expect(within(month).getByText(`Average: ${usdWhole(1_000_00)} a month`)).toBeInTheDocument();
    // 4,013 - 1,000, in the style of Home's net worth change.
    expect(within(month).getByText(`▲ ${usdWhole(3_013_00)} vs average`)).toHaveClass(
      'text-accent-text',
    );
  });

  it('shows a month under the average with a down arrow in the danger colour', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ currency: 'USD' }));
    data.tables.income.push(salary('2026-08-25', 6_000_00));
    renderIncome(data);
    const month = region('This month');
    // August, September and October: 6,000 / 3, and nothing has come in this month.
    expect(within(month).getByText(usd(0))).toBeInTheDocument();
    expect(within(month).getByText(`Average: ${usdWhole(2_000_00)} a month`)).toBeInTheDocument();
    expect(within(month).getByText(`▼ ${usdWhole(2_000_00)} vs average`)).toHaveClass(
      'text-danger',
    );
  });

  it('says so when this month is at the average, as Home does when net worth has not moved', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ currency: 'USD' }));
    data.tables.income.push(
      salary('2026-08-25', 1_000_00),
      salary('2026-09-25', 1_000_00),
      salary('2026-10-05', 1_000_00),
    );
    renderIncome(data);
    expect(screen.getByText('About average')).toHaveClass('text-muted');
    expect(screen.queryByText(/vs average/)).toBeNull();
  });

  it('draws twelve bars, oldest to newest, the last this month, with a legend in a fixed order', () => {
    renderIncome(filled());
    const chart = region('Last 12 months');
    const bars = within(
      within(chart).getByRole('group', { name: 'Income per month' }),
    ).getAllByRole('button');
    expect(bars).toHaveLength(12);
    expect(bars[0]).toHaveAccessibleName(`November 2025: ${usd(2_000_00)}`);
    expect(bars[11]).toHaveAccessibleName(`October 2026: ${usd(4_013_00)}`);
    expect(bars[10]).toHaveAccessibleName(`September 2026: ${usd(0)}`);

    const legend = within(chart).getAllByRole('listitem');
    expect(legend.map((li) => li.textContent)).toEqual(['Salary', 'Extra', 'Dividends']);
    const dot = (li: HTMLElement) => li.firstElementChild as HTMLElement;
    expect(legend.map((li) => dot(li).style.backgroundColor)).toEqual([
      'var(--color-chart-1)',
      'var(--color-chart-2)',
      'var(--color-chart-3)',
    ]);
    // The October bar is stacked in the same colours, salary at the bottom.
    const parts = [...(bars[11]!.firstElementChild as HTMLElement).children] as HTMLElement[];
    expect(parts.map((p) => p.style.backgroundColor)).toEqual([
      'var(--color-chart-1)',
      'var(--color-chart-2)',
      'var(--color-chart-3)',
    ]);
  });

  it('tells a month’s three amounts when its bar is tapped, and asks for a tap before', async () => {
    renderIncome(filled());
    const chart = region('Last 12 months');
    const status = within(chart).getByRole('status');
    expect(status).toHaveTextContent('Tap a month to see where it came from');

    await userEvent.click(within(chart).getByRole('button', { name: /^October 2026/ }));
    expect(status).toHaveTextContent(
      `October 2026 · Salary ${usd(3_000_00)} · Extra ${usd(1_000_00)} · Dividends ${usd(13_00)}`,
    );
    expect(within(chart).getByRole('button', { name: /^October 2026/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(chart).getByRole('button', { name: /^May 2026/ }));
    expect(status).toHaveTextContent(
      `May 2026 · Salary ${usd(0)} · Extra ${usd(0)} · Dividends ${usd(1_487_00)}`,
    );

    await userEvent.click(within(chart).getByRole('button', { name: /^May 2026/ }));
    expect(status).toHaveTextContent('Tap a month to see where it came from');
  });

  it('splits this year into the same three sources, each with its share', () => {
    renderIncome(filled());
    const year = region('This year');
    // 6,000 + 2,500 + 1,500; last year's November salary and the salaries that did not arrive are not in it.
    expect(within(year).getByText(usd(10_000_00))).toBeInTheDocument();
    const rows = within(year).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      `Salary${usd(6_000_00)}60%`,
      `Extra${usd(2_500_00)}25%`,
      `Dividends${usd(1_500_00)}15%`,
    ]);
  });

  it('lists the five biggest sources this year, income by label and dividends by symbol', () => {
    renderIncome(filled());
    const biggest = region('Biggest sources');
    expect(
      within(biggest)
        .getAllByRole('listitem')
        .map((r) => r.textContent),
    ).toEqual([
      `Salary${usd(6_000_00)}`,
      `Freelance${usd(1_500_00)}`,
      `VWRL${usd(1_487_00)}`,
      `Gift${usd(1_000_00)}`,
      `KO${usd(13_00)}`,
    ]);
  });

  it('shows no sources, and no share of nothing, in a year that has had no income yet', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ currency: 'USD' }));
    data.tables.income.push(salary('2025-12-25', 3_000_00));
    renderIncome(data);
    expect(within(region('This year')).getByText('Nothing yet this year')).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Biggest sources' })).toBeNull();
    expect(region('Last 12 months')).toBeInTheDocument();
  });

  it('hides every amount with the eye, and leaves the bars as tall as they were', async () => {
    renderIncome(filled());
    const heights = () =>
      [...screen.getByRole('button', { name: /^October 2026/ }).firstElementChild!.children].map(
        (p) => (p as HTMLElement).style.height,
      );
    const shown = heights();
    expect(shown).toHaveLength(3);
    cleanup();

    useAmountsHidden.setState({ hidden: true });
    renderIncome(filled());
    expect(heights()).toEqual(shown);
    await userEvent.click(screen.getByRole('button', { name: /^October 2026/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'October 2026 · Salary •••• · Extra •••• · Dividends ••••',
    );
    expect(document.body.textContent).not.toMatch(/\$|\d,\d/);
    expect(region('This month')).toHaveTextContent('Average: •••• a month');
    // The shares are proportions, not amounts: they stay.
    expect(region('This year')).toHaveTextContent('60%');
  });
});

describe('Income page with nothing yet', () => {
  it('says there is no income yet and links to adding some', () => {
    renderIncome(emptySnapshot());
    expect(screen.getByRole('heading', { level: 1, name: 'Income' })).toBeInTheDocument();
    expect(screen.getByText('No income yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add income' })).toHaveAttribute(
      'href',
      '/add?type=income',
    );
    expect(screen.queryByRole('group', { name: 'Income per month' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'This year' })).toBeNull();
  });

  it('counts a salary that is only expected, or was skipped, as no income', () => {
    const data = emptySnapshot();
    data.tables.profile.push(makeProfile({ currency: 'USD' }));
    data.tables.income.push(
      makeIncome({ source: 'salary', date: '2026-10-25', status: 'expected' }),
      makeIncome({ source: 'salary', date: '2026-09-25', status: 'skipped' }),
    );
    data.tables.dividend.push(
      makeDividend({ status: 'skipped', amount: 0, accountId: null, paidOn: '2026-10-01' }),
    );
    renderIncome(data);
    expect(screen.getByText('No income yet')).toBeInTheDocument();
  });
});
