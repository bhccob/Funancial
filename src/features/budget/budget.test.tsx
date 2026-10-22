import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDemoSnapshot } from '@/data/demoSeed';
import { limitStatus } from '@/domain/budget';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDate } from '@/lib/format';
import {
  localIso,
  makeExpense,
  makeGoal,
  makeLimit,
  makeProfile,
  makeSettings,
} from '@/test/fixtures';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { BudgetScreen } from './BudgetScreen';

const actions = vi.hoisted(() => ({
  saveLimit: vi.fn(async () => ({})),
  deleteLimit: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

/** A Thursday: with weeks starting Monday the week runs 10-12 to 10-18; October is 15/31 through. */
const TODAY = '2026-10-15';
// Expected text is built with the app's formatter: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });

beforeEach(() => {
  actions.saveLimit.mockClear();
  actions.deleteLimit.mockClear();
});

/**
 * Rent 1,200 in both months, fun 30 and food 70 (this week) in October, food 90 in September.
 * October is 1,300 spent; September 1,290. Limits: food weekly 50 (140%), fun monthly 35 (86%),
 * overall monthly 2,000 (65%).
 */
function ledger({ limits = true, weekStartsOn }: { limits?: boolean; weekStartsOn?: 0 | 1 } = {}) {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ openingDate: '2026-08-01' })];
  if (weekStartsOn !== undefined) data.tables.settings = [makeSettings({ weekStartsOn })];
  data.tables.expense = [
    ['2026-09-01', 'rent', 1_200_00],
    ['2026-09-20', 'food', 90_00],
    ['2026-10-01', 'rent', 1_200_00],
    ['2026-10-05', 'entertainment', 30_00],
    ['2026-10-13', 'food', 70_00],
  ].map(([date, category, amount]) =>
    makeExpense({
      date: date as string,
      category: category as 'rent',
      amount: amount as number,
      createdAt: localIso(date as string),
    }),
  );
  if (limits) {
    data.tables.budgetLimit = [
      makeLimit({ id: 'food', category: 'food', period: 'weekly', amount: 50_00 }),
      makeLimit({ id: 'fun', category: 'entertainment', period: 'monthly', amount: 35_00 }),
      makeLimit({
        id: 'overall',
        scope: 'overall',
        category: null,
        period: 'monthly',
        amount: 2_000_00,
      }),
    ];
  }
  return data;
}

function renderBudget(data: DataSnapshot = buildDemoSnapshot(TODAY), today = TODAY) {
  renderWithStore(
    <MemoryRouter>
      <BudgetScreen />
    </MemoryRouter>,
    createStubStore({ data, today, namespace: 'demo' }),
  );
  return data;
}

const previousMonth = () => userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
const nextMonth = () => userEvent.click(screen.getByRole('button', { name: 'Next month' }));

/** A limit's row, found from its bar's name ("Food · weekly"). */
const row = (name: string) => screen.getByRole('progressbar', { name }).closest('li')!;
/** The detail line of a row, matched on how it starts: the pace word at its end is checked apart. */
const startsWith = (text: string) => (_content: string, el: Element | null) =>
  el?.tagName === 'P' && (el.textContent ?? '').startsWith(text);
const paceMark = (name: string) => row(name).querySelector<HTMLElement>('[data-pace-mark]');
const fill = (name: string) => screen.getByRole('progressbar', { name }).firstElementChild;

async function openNewLimit() {
  await userEvent.click(screen.getByRole('button', { name: 'Add a limit' }));
  return screen.getByRole('dialog', { name: 'Add a limit' });
}

describe('BudgetScreen', () => {
  it('titles the page at the 28px of every page title', () => {
    renderBudget(ledger());
    const title = screen.getByRole('heading', { level: 1, name: 'Budget' });
    expect(title).toHaveClass('text-page');
    expect(title).not.toHaveClass('text-[34px]');
  });

  it('starts on this month and cannot go past it', async () => {
    renderBudget(ledger());
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();

    await previousMonth();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();

    await nextMonth();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('crosses a year boundary in both directions', async () => {
    renderBudget(ledger(), '2027-01-10');
    expect(screen.getByText('January 2027')).toBeInTheDocument();
    await previousMonth();
    expect(screen.getByText('December 2026')).toBeInTheDocument();
    await nextMonth();
    expect(screen.getByText('January 2027')).toBeInTheDocument();
  });

  it('shows the previous month’s categories after Previous month', async () => {
    renderBudget(ledger());
    expect(screen.getByRole('button', { name: /^Fun, / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Rent, ${usd(1_200_00)}, 92%` })).toBeInTheDocument();

    await previousMonth();
    expect(screen.queryByRole('button', { name: /^Fun, / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Rent, ${usd(1_200_00)}, 93%` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Food, ${usd(90_00)}, 7%` })).toBeInTheDocument();
  });

  it('shows spent of the overall limit in the centre for this month only', async () => {
    renderBudget(ledger());
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText(usd(1_300_00))).toBeInTheDocument();
    expect(screen.getByText(`of ${usd(2_000_00)} · 65%`)).toBeInTheDocument();

    await previousMonth();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText(usd(1_290_00))).toBeInTheDocument();
    expect(screen.getByText('September')).toBeInTheDocument();
    expect(screen.queryByText(/^of /)).not.toBeInTheDocument();
  });

  it('names the month in the centre when there is no overall monthly limit', () => {
    const data = ledger();
    data.tables.budgetLimit = data.tables.budgetLimit.filter((l) => l.scope !== 'overall');
    renderBudget(data);
    expect(screen.getByText(usd(1_300_00))).toBeInTheDocument();
    expect(screen.getByText('October')).toBeInTheDocument();
    expect(screen.queryByText(/^of /)).not.toBeInTheDocument();
  });

  it('shows a tapped category in the centre and clears it when the month changes', async () => {
    renderBudget(ledger());
    await userEvent.click(screen.getByRole('button', { name: /^Rent\b.*\$1,200/, pressed: false }));
    expect(screen.getByText('Rent · 92%')).toBeInTheDocument();

    await previousMonth();
    // September also has Rent first, so a selection that survived would read "Rent · 93%".
    expect(screen.queryByText(/· \d+%/)).not.toBeInTheDocument();
    expect(screen.getByText('September')).toBeInTheDocument();
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  });

  it('says so when a month has no spending', async () => {
    renderBudget(ledger());
    await previousMonth();
    await previousMonth();
    expect(screen.getByText('No spending in August')).toBeInTheDocument();
    expect(screen.queryByText('Rent')).not.toBeInTheDocument();
    expect(screen.getByText(usd(0))).toBeInTheDocument();
  });

  it('lists every limit with what is left and what is spent', () => {
    const data = renderBudget();
    expect(screen.getByRole('heading', { level: 2, name: 'Limits' })).toBeInTheDocument();
    expect(screen.getByText("Line shows today's pace")).toBeInTheDocument();
    for (const [name, label, category, period] of [
      ['Food · weekly', 'Food', 'food', 'Weekly'],
      ['Fun · monthly', 'Fun', 'entertainment', 'Monthly'],
      ['Overall · monthly', 'Overall', null, 'Monthly'],
    ] as const) {
      const limit = data.tables.budgetLimit.find((l) => l.category === category);
      if (!limit) throw new Error(`demo has no ${name} limit`);
      const s = limitStatus(limit, data, TODAY, 1);
      const left = s.remaining >= 0 ? `${usd(s.remaining)} left` : `${usd(-s.remaining)} over`;
      const r = within(row(name));
      expect(r.getByText(label)).toBeInTheDocument();
      expect(r.getByText(left)).toBeInTheDocument();
      expect(
        r.getByText(startsWith(`${period} · ${usd(s.spent)} of ${usd(limit.amount)} · `)),
      ).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name })).toHaveAttribute(
        'aria-valuenow',
        String(Math.min(100, s.pct)),
      );
    }
  });

  it('draws a pace mark and names the pace', () => {
    const data = renderBudget();
    // Today is October 15th: 15 of 31 days (48%) into the month and 4 of 7 (57%) into the week.
    const overall = limitStatus(
      data.tables.budgetLimit.find((l) => l.scope === 'overall')!,
      data,
      TODAY,
      1,
    );
    expect(overall.pct).toBe(72);
    expect(
      within(row('Overall · monthly')).getByText(
        `Monthly · ${usd(overall.spent)} of ${usd(2_600_00)} · ahead of pace`,
      ),
    ).toBeInTheDocument();
    expect(paceMark('Overall · monthly')).toHaveStyle({ left: '48%' });
    expect(paceMark('Overall · monthly')).toHaveAttribute('aria-hidden', 'true');

    const food = limitStatus(
      data.tables.budgetLimit.find((l) => l.category === 'food')!,
      data,
      TODAY,
      1,
    );
    expect(food.pct).toBeLessThan(50);
    expect(
      within(row('Food · weekly')).getByText(/^Weekly · .* · under pace$/),
    ).toBeInTheDocument();
    expect(paceMark('Food · weekly')).toHaveStyle({ left: '57%' });
  });

  it('lets taps pass through the pace mark, which reaches past the bar toward the Edit button', () => {
    renderBudget();
    expect(paceMark('Overall · monthly')).toHaveClass('pointer-events-none');
    expect(paceMark('Food · weekly')).toHaveClass('pointer-events-none');
  });

  it('says on pace when use is within five points of the period', () => {
    const data = ledger();
    data.tables.budgetLimit = [
      // 1,300 of 2,700 is 48%: the month is 48% through.
      makeLimit({
        id: 'overall',
        scope: 'overall',
        category: null,
        period: 'monthly',
        amount: 2_700_00,
      }),
    ];
    renderBudget(data);
    expect(within(row('Overall · monthly')).getByText(/ · on pace$/)).toBeInTheDocument();
  });

  it('puts the weekly pace mark where the person’s week has reached', () => {
    // A week starting Sunday runs 10-11 to 10-17: Thursday is 5 of 7 days in.
    renderBudget(ledger({ weekStartsOn: 0 }));
    expect(paceMark('Food · weekly')).toHaveStyle({ left: '71%' });
  });

  it('colours each bar by its limit state and says what is left or over', () => {
    renderBudget(ledger());
    // Food 140%: danger and "over"; fun 86%: warning; overall 65%: accent.
    const food = within(row('Food · weekly'));
    expect(food.getByText(`${usd(20_00)} over`)).toBeInTheDocument();
    expect(
      food.getByText(`Weekly · ${usd(70_00)} of ${usd(50_00)} · ahead of pace`),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Food · weekly' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getByRole('progressbar', { name: 'Food · weekly' })).toHaveAttribute(
      'aria-valuetext',
      '140% used',
    );
    expect(fill('Food · weekly')).toHaveClass('bg-danger');
    expect(within(row('Fun · monthly')).getByText(`${usd(5_00)} left`)).toBeInTheDocument();
    expect(fill('Fun · monthly')).toHaveClass('bg-warning');
    expect(within(row('Overall · monthly')).getByText(`${usd(700_00)} left`)).toBeInTheDocument();
    expect(fill('Overall · monthly')).toHaveClass('bg-accent');
  });

  it('reads over for a limit past 100%', () => {
    renderBudget(ledger());
    const food = row('Food · weekly');
    expect(within(food).getByText(`${usd(20_00)} over`)).toHaveClass('text-danger');
    expect(within(food).queryByText(/ left$/)).not.toBeInTheDocument();
  });

  it('marks a reserved limit', () => {
    const data = ledger();
    data.tables.budgetLimit = [makeLimit({ category: 'food', period: 'weekly', reserve: true })];
    renderBudget(data);
    expect(within(row('Food · weekly')).getByText('Reserved')).toBeInTheDocument();
  });

  it('says so and still offers a limit when there are none', async () => {
    renderBudget(ledger({ limits: false }));
    expect(screen.getByText('No limits yet. Add one to see your pace.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const dialog = await openNewLimit();
    expect(dialog).toBeInTheDocument();
  });

  it('opens the limit dialog from Add a limit and from Edit', async () => {
    const data = renderBudget();
    const fun = data.tables.budgetLimit.find((l) => l.category === 'entertainment');

    const dialog = await openNewLimit();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Fun limit' }));
    const edit = screen.getByRole('dialog', { name: 'Edit limit' });
    expect(within(edit).getByLabelText('Limit')).toHaveValue('100.00');
    await userEvent.click(within(edit).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteLimit).toHaveBeenCalledWith(fun?.id);
  });

  it('tells two limits on one category apart for a screen reader', () => {
    const data = ledger();
    data.tables.budgetLimit = [
      makeLimit({ id: 'w', category: 'food', period: 'weekly', amount: 50_00 }),
      makeLimit({ id: 'm', category: 'food', period: 'monthly', amount: 300_00 }),
    ];
    renderBudget(data);
    const [weekly, monthly] = screen.getAllByRole('button', { name: 'Edit Food limit' });
    expect(weekly).toHaveAccessibleDescription(/^Weekly · /);
    expect(monthly).toHaveAccessibleDescription(/^Monthly · /);
  });

  it('creates a weekly food limit with exactly what was entered', async () => {
    renderWithStore(
      <MemoryRouter>
        <BudgetScreen />
      </MemoryRouter>,
      createStubStore({ today: TODAY }),
    );
    expect(screen.getByText('No limits yet. Add one to see your pace.')).toBeInTheDocument();
    const dialog = await openNewLimit();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'One category' }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'Food');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Weekly' }));
    await userEvent.type(within(dialog).getByLabelText('Limit'), '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveLimit).toHaveBeenCalledWith({
      scope: 'category',
      category: 'food',
      period: 'weekly',
      amount: 120_00,
      reserve: false,
    });
  });

  it('refuses a second limit for the same thing', async () => {
    renderBudget();
    const dialog = await openNewLimit();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'One category' }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'Food');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Weekly' }));
    await userEvent.type(within(dialog).getByLabelText('Limit'), '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('You already have this limit.')).toBeInTheDocument();
    expect(actions.saveLimit).not.toHaveBeenCalled();
  });
});

describe('Spending in glass', () => {
  it('puts the donut and its legend in one glass tile, still named Spending', () => {
    renderBudget(ledger());
    const tile = screen.getByRole('region', { name: 'Spending' });
    expect(tile).toHaveClass('glass', 'rounded-[24px]', 'p-4');
    expect(within(tile).getByRole('button', { name: /^Rent\b/ })).toBeInTheDocument();
  });

  it('lists the limits as plain rows, with the hairline of every plain list', () => {
    renderBudget(ledger());
    const limits = screen.getByRole('region', { name: 'Limits' });
    expect(within(limits).getByRole('list')).toHaveClass('divide-y', 'divide-black/7');
    expect(limits).not.toHaveClass('glass');
  });
});

describe('Goals on Spending', () => {
  const goals = () => screen.getByRole('region', { name: 'Goals' });

  it('lists the demo goals as plain rows, each with its ring and saved of target', () => {
    renderBudget();
    const section = goals();
    expect(within(section).getByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument();
    expect(within(section).getByRole('list')).toHaveClass('divide-y', 'divide-black/7');
    // A deadline first (the bike's, 120 days out), then the goal with none.
    const rows = within(section).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      `New bike37% saved · by ${formatDate('2027-02-12')}${usdWhole(450_00)}of ${usdWhole(1_200_00)}`,
      `Emergency fund30% saved${usdWhole(3_000_00)}of ${usdWhole(10_000_00)}`,
    ]);
    expect(within(rows[0]!).getByRole('img', { name: 'New bike: 37% saved' })).toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole('img', { name: 'Emergency fund: 30% saved' }),
    ).toBeInTheDocument();
  });

  it('opens the Goals page from View all', () => {
    renderBudget();
    expect(within(goals()).getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/goals',
    );
  });

  it('sits under the limits', () => {
    renderBudget();
    const limits = screen.getByRole('region', { name: 'Limits' });
    expect(limits.compareDocumentPosition(goals()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows three goals at most: soonest deadline first, then the closest to done', () => {
    const data = ledger();
    const goal = (name: string, current: number, deadline: string | null = null) =>
      makeGoal({ name, target: 100_00, current, deadline });
    data.tables.goal = [
      goal('Far', 10_00),
      goal('Near done', 90_00),
      goal('Later', 50_00, '2027-03-01'),
      goal('Sooner', 20_00, '2027-01-01'),
      goal('Halfway', 50_00),
    ];
    renderBudget(data);
    const names = within(goals())
      .getAllByRole('img')
      .map((ring) => ring.getAttribute('aria-label')!.split(':')[0]);
    expect(names).toEqual(['Sooner', 'Later', 'Near done']);
  });

  it('says a reached goal is reached', () => {
    const data = ledger();
    data.tables.goal = [makeGoal({ name: 'Laptop', target: 800_00, current: 900_00 })];
    renderBudget(data);
    const row = within(goals()).getByRole('listitem');
    expect(row).toHaveTextContent(`LaptopGoal reached${usdWhole(900_00)}of ${usdWhole(800_00)}`);
    expect(within(row).getByRole('img', { name: 'Laptop: 112% saved' })).toBeInTheDocument();
  });

  it('truncates a long goal name', () => {
    const data = ledger();
    const name = 'A goal with a name that is forty chars!!';
    data.tables.goal = [makeGoal({ name })];
    renderBudget(data);
    expect(within(goals()).getByText(name)).toHaveClass('truncate');
  });

  it('offers to set a goal when there are none, with no View all beside it', () => {
    renderBudget(ledger());
    const section = goals();
    expect(within(section).getByText('No goals yet.')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Set a goal' })).toHaveAttribute(
      'href',
      '/goals',
    );
    expect(within(section).queryByRole('link', { name: 'View all' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('the limit dialog in the line style', () => {
  it('has line fields and underline tabs, and every category', async () => {
    renderBudget();
    const dialog = await openNewLimit();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'One category' }));
    const category = within(dialog).getByLabelText('Category');
    expect(category).toHaveClass('border-b', 'font-extrabold');
    expect(category).not.toHaveClass('rounded-md');
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Food', 'Transport', 'Rent', 'Utilities', 'Fun', 'Health', 'Shopping', 'Other']);
    const limit = within(dialog).getByLabelText('Limit');
    expect(limit).toHaveClass('border-b', 'font-extrabold');
    expect(limit).not.toHaveClass('rounded-md');
    // Applies to and Period are underline tabs, still radios.
    expect(within(dialog).getByText('One category')).toHaveClass('border-b-2', 'border-text');
    expect(within(dialog).getByText('Overall')).toHaveClass('border-transparent');
    expect(within(dialog).getByText('Monthly')).toHaveClass('border-b-2', 'border-text');
  });
});
