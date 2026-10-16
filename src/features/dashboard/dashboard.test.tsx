import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderSettings } from '@/domain/entities';
import { EXAMPLES } from '@/domain/examples';
import { computeGameView } from '@/domain/game/engine';
import { levelStart } from '@/domain/game/levels';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { applyRecords, dueGenerated } from '@/domain/sync';
import { formatDay, formatMonth, formatMonthShort, formatWeekday } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { expectHelpTip } from '@/test/helpTip';
import { fakeNotifier, onPhone, type FakeNotifier } from '@/test/fakeNotifier';
import {
  localIso,
  makeCheckIn,
  makeDebt,
  makeExpense,
  makeGoal,
  makeHolding,
  makeIncome,
  makeLedgerEntry,
  makeLimit,
  makeProfile,
  makeSettings,
  makeSubscription,
} from '@/test/fixtures';
import { DashboardScreen } from './DashboardScreen';

const actions = vi.hoisted(() => ({
  confirmIncome: vi.fn(async () => {}),
  skipIncome: vi.fn(async () => {}),
  updateSettings: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));
// The real game view, counted.
vi.mock('@/domain/game/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/game/engine')>();
  return { ...actual, computeGameView: vi.fn(actual.computeGameView) };
});

beforeEach(() => Object.values(actions).forEach((a) => a.mockClear()));

function example(id: string) {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`No worked example ${id}`);
  return found;
}

function renderDashboard(data: DataSnapshot, today: string) {
  return renderWithStore(
    <MemoryRouter>
      <DashboardScreen />
    </MemoryRouter>,
    createStubStore({ data, today }),
  );
}

const region = (name: string) => screen.getByRole('region', { name });
// Expected text is built with the app's formatters: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });
const october = formatMonth('2026-10');
/** The text of a line whose bold parts split it: matched on all of it. */
const line = (text: string) => (_content: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === text;

/** A Wednesday: with weeks starting Monday the week runs 10-12 to 10-18. */
const TODAY = '2026-10-14';

/**
 * A month in progress. Spent in October: rent 1,200, food 90 (all of it this week), fun 30.
 * Bills to come: Streamflix 15.99 (10-20), the Visa 230 (10-21), FitHub 39 (10-28).
 * Limits: food weekly 60 (150%), overall monthly 1,500 (88%), fun monthly 100 (30%).
 */
function monthData({ income = 0 }: { income?: number } = {}): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [
    makeProfile({
      name: 'Test Player',
      openingDate: '2026-09-01',
      openingCash: 5_000_00,
      openingSavings: 3_000_00,
    }),
  ];
  data.tables.debt = [
    makeDebt({
      id: 'visa',
      name: 'Visa',
      openingBalance: 230_00,
      openingDate: '2026-09-01',
      dueDay: 21,
    }),
  ];
  data.tables.expense = [
    ['2026-10-01', 'rent', 1_200_00],
    ['2026-10-05', 'entertainment', 30_00],
    ['2026-10-12', 'food', 20_00],
    ['2026-10-13', 'food', 50_00],
    ['2026-10-14', 'food', 20_00],
  ].map(([date, category, amount]) =>
    makeExpense({
      date: date as string,
      category: category as 'rent',
      amount: amount as number,
      createdAt: localIso(date as string),
    }),
  );
  data.tables.subscription = [
    makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
    makeSubscription({ name: 'FitHub Gym', amount: 39_00, nextRenewal: '2026-10-28' }),
  ];
  data.tables.budgetLimit = [
    makeLimit({ id: 'food', category: 'food', period: 'weekly', amount: 60_00 }),
    makeLimit({
      id: 'overall',
      scope: 'overall',
      category: null,
      period: 'monthly',
      amount: 1_500_00,
    }),
    makeLimit({ id: 'fun', category: 'entertainment', period: 'monthly', amount: 100_00 }),
  ];
  data.tables.goal = [
    makeGoal({ name: 'Vacation', target: 5_000_00, current: 100_00 }),
    makeGoal({ name: 'Emergency fund', target: 10_000_00, current: 3_000_00 }),
    makeGoal({ name: 'New bike', target: 1_200_00, current: 450_00 }),
  ];
  data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 250, coins: 40 })];
  if (income > 0) {
    data.tables.income = [makeIncome({ amount: income, date: '2026-10-02', bucket: 'cash' })];
  }
  return data;
}

describe('DashboardScreen top line', () => {
  it('greets with the name and date, and links level, streak and coins to Quests', () => {
    renderDashboard(monthData(), TODAY);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Hi, Test Player')).toBeInTheDocument();
    expect(screen.getByText(`· ${formatDay(TODAY)}`)).toBeInTheDocument();

    // 250 XP: 150 into the 264 of level 2. Three days of expenses in a row; 40 coins earned.
    const link = screen.getByRole('link', {
      name: 'Level 2, 150 of 264 XP, 3-day streak, 40 coins. Open quests',
    });
    expect(link).toHaveAttribute('href', '/quests');
    expect(within(link).getByText('3')).toBeInTheDocument();
    expect(within(link).getByText('40')).toBeInTheDocument();
    expect(within(link).getByText('2')).toBeInTheDocument();
    expect(link.querySelector('svg.lucide-flame')).toHaveClass('text-warning');
    expect(link.querySelector('svg.lucide-coins')).toBeInTheDocument();
  });

  it('draws the level ring at 40px in the XP colour, filled to the progress through the level', () => {
    renderDashboard(monthData(), TODAY);
    const link = screen.getByRole('link', { name: /Open quests$/ });
    const ring = link.querySelector<HTMLElement>('[role="img"]');
    expect(ring).toHaveStyle({ width: '40px', height: '40px' });
    const arc = [...(ring?.querySelectorAll('circle') ?? [])].at(-1);
    expect(arc).toHaveAttribute('stroke', 'var(--color-xp)');
    // 150 of 264 XP.
    const circumference = 2 * Math.PI * ((40 - 3.5) / 2);
    expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * (1 - 150 / 264),
      3,
    );
  });

  it('says Hi there without a name', () => {
    renderDashboard(emptySnapshot(), TODAY);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    renderDashboard(
      (() => {
        const data = emptySnapshot();
        data.tables.profile = [makeProfile({ name: '' })];
        return data;
      })(),
      TODAY,
    );
    expect(screen.getAllByText('Hi there')).toHaveLength(2);
  });

  it('says Max level at the top of the curve, shows no coin below 0 and says 1 coin', () => {
    const data = emptySnapshot();
    data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: levelStart(50) + 10, coins: 1 })];
    const { unmount } = renderDashboard(data, TODAY);
    expect(
      screen.getByRole('link', { name: 'Level 50, Max level, 0-day streak, 1 coin. Open quests' }),
    ).toBeInTheDocument();
    unmount();

    const owing = emptySnapshot();
    owing.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 0, coins: -30, kind: 'purchase' })];
    renderDashboard(owing, TODAY);
    expect(
      screen.getByRole('link', {
        name: 'Level 1, 0 of 100 XP, 0-day streak, 0 coins. Open quests',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/-30/)).not.toBeInTheDocument();
  });

  it('formats a large coin count like XP, in the label and on screen', () => {
    const data = emptySnapshot();
    data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 0, coins: 12_345 })];
    renderDashboard(data, TODAY);
    const coins = (12_345).toLocaleString();
    expect(coins).not.toBe('12345');
    const link = screen.getByRole('link', {
      name: `Level 1, 0 of 100 XP, 0-day streak, ${coins} coins. Open quests`,
    });
    expect(within(link).getByText(coins)).toBeInTheDocument();
  });

  it('keeps a normal name whole on a phone: the date gives way first, and only a long name is cut', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ name: 'Demo Player' })];
    renderDashboard(data, TODAY);
    const name = screen.getByText('Hi, Demo Player');
    const date = screen.getByText(`· ${formatDay(TODAY)}`);
    // The name is plain text in a line that ends in an ellipsis; nothing squeezes it ahead of the date.
    expect(name).not.toHaveClass('truncate');
    expect(name.parentElement).toHaveClass('truncate');
    // Below 400px the date is dropped altogether rather than shown as a stub.
    expect(date).toHaveClass('hidden', 'min-[400px]:inline');
  });
});

describe('DashboardScreen hero', () => {
  it('leads with what is available to spend', () => {
    const avl = example('AVL-1');
    renderDashboard(avl.data, avl.today);
    const hero = region('Available to spend');
    const amount = within(hero).getByText(usd(2_654_01));
    expect(amount).toHaveClass('text-[50px]');
    expect(amount).not.toHaveClass('text-[40px]');
  });

  it('shrinks the amount to 40px when it is longer than 11 characters', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingCash: 123_456_789, openingSavings: 0 })];
    renderDashboard(data, TODAY);
    const amount = within(region('Available to spend')).getByText(usd(123_456_789));
    expect(usd(123_456_789).length).toBeGreaterThan(11);
    expect(amount).toHaveClass('text-[40px]');
    expect(amount).not.toHaveClass('text-[50px]');
  });

  it('draws the month as spent, bills to come and what is left, with two keys under it', () => {
    renderDashboard(monthData(), TODAY);
    const hero = region('Available to spend');
    // 1,200 + 90 + 30 spent; 15.99 + 230 + 39 in bills; 1,500 − 1,320 left of the monthly limit.
    const spent = within(hero).getByRole('button', {
      name: `Spent so far: ${usdWhole(1_320_00)}`,
    });
    const bills = within(hero).getByRole('button', {
      name: `Bills still to come: ${usdWhole(284_99)}`,
    });
    const left = within(hero).getByRole('button', {
      name: `Left in your monthly limit: ${usdWhole(180_00)}`,
    });
    expect(spent).toHaveStyle({ backgroundColor: 'var(--color-chart-4)' });
    expect(bills).toHaveStyle({ backgroundColor: 'var(--color-chart-5)' });
    expect(left).toHaveStyle({ backgroundColor: 'var(--color-accent)' });

    expect(within(hero).getByText(usdWhole(1_320_00))).toBeInTheDocument();
    expect(within(hero).getByText(`spent in ${october}`)).toBeInTheDocument();
    expect(within(hero).getByText(usdWhole(180_00))).toBeInTheDocument();
    expect(within(hero).getByText('left in limit')).toBeInTheDocument();
  });

  it('names a month-line segment when tapped, and restores the key when tapped again', async () => {
    renderDashboard(monthData(), TODAY);
    const hero = region('Available to spend');
    const bills = within(hero).getByRole('button', {
      name: `Bills still to come: ${usdWhole(284_99)}`,
    });

    await userEvent.click(bills);
    expect(bills).toHaveAttribute('aria-pressed', 'true');
    expect(within(hero).getByText('Bills still to come')).toBeInTheDocument();
    // A tapped segment shows its exact amount; the idle keys stay in whole units.
    expect(within(hero).getByText(usd(284_99))).toBeInTheDocument();
    expect(within(hero).queryByText(usdWhole(284_99))).not.toBeInTheDocument();
    expect(within(hero).getByText(usdWhole(180_00))).toBeInTheDocument();
    expect(within(hero).queryByText(`spent in ${october}`)).not.toBeInTheDocument();

    await userEvent.click(bills);
    expect(within(hero).getByText(`spent in ${october}`)).toBeInTheDocument();
    expect(within(hero).getByText(usdWhole(1_320_00))).toBeInTheDocument();
    expect(within(hero).queryByText('Bills still to come')).not.toBeInTheDocument();
  });

  it('keys the bills to come where there is no monthly limit, and draws no left segment', () => {
    const data = monthData();
    data.tables.budgetLimit = [];
    renderDashboard(data, TODAY);
    const hero = region('Available to spend');
    expect(within(hero).getByText(usdWhole(284_99))).toBeInTheDocument();
    expect(within(hero).getByText('bills to come')).toBeInTheDocument();
    expect(within(hero).queryByText('left in limit')).not.toBeInTheDocument();
    // The segments only: the "?" beside the title is a button too.
    expect(within(hero).getAllByRole('button', { name: /: / })).toHaveLength(2);
  });

  it('draws only the track when nothing is spent or due', () => {
    renderDashboard(emptySnapshot(), TODAY);
    const hero = region('Available to spend');
    // No segments; only the "?" beside the title is a button.
    expect(within(hero).queryAllByRole('button', { name: /: / })).toHaveLength(0);
    expect(within(hero).getByText(`spent in ${october}`)).toBeInTheDocument();
    expect(within(hero).getByText('bills to come')).toBeInTheDocument();
    expect(within(hero).getAllByText(usdWhole(0))).toHaveLength(2);
  });
});

describe('DashboardScreen actions', () => {
  it('shows four labelled actions', () => {
    renderDashboard(emptySnapshot(), TODAY);
    expect(screen.getByRole('link', { name: 'Expense' })).toHaveAttribute('href', '/add');
    expect(screen.getByRole('link', { name: 'Income' })).toHaveAttribute(
      'href',
      '/add?type=income',
    );
    expect(screen.getByRole('link', { name: 'Goals' })).toHaveAttribute('href', '/goals');
    const buy = screen.getByRole('link', { name: 'Buy it?' });
    expect(buy).toHaveAttribute('href', '/buy');
    expect(buy.querySelector('svg.lucide-shopping-bag')).toBeInTheDocument();
  });

  it("gives History's place to Buy it?; History stays one tap away in Last 7 days", () => {
    renderDashboard(emptySnapshot(), TODAY);
    expect(screen.getAllByRole('link', { name: 'History' })).toHaveLength(1);
    expect(within(region('Last 7 days')).getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/history',
    );
    expect(document.querySelector('svg.lucide-clock')).not.toBeInTheDocument();
  });

  it('makes each a 56px round icon with its word under it, and fills the first', () => {
    renderDashboard(emptySnapshot(), TODAY);
    const expense = screen.getByRole('link', { name: 'Expense' });
    const circle = expense.querySelector('span');
    expect(circle).toHaveClass('size-14', 'rounded-full', 'bg-primary');
    expect(expense.querySelector('svg.lucide-plus')).toBeInTheDocument();
    const income = screen.getByRole('link', { name: 'Income' });
    expect(income.querySelector('span')).toHaveClass('size-14', 'rounded-full');
    expect(income.querySelector('span')).not.toHaveClass('bg-primary');
    expect(income.querySelector('svg.lucide-hand-coins')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Goals' }).querySelector('svg.lucide-target'),
    ).toBeInTheDocument();
  });
});

describe('DashboardScreen sections', () => {
  it('shows the sections in order, each under a title', () => {
    renderDashboard(monthData(), TODAY);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Available to spend',
      'Spending',
      'Last 7 days',
      'Limits',
      'Coming up',
      'Net worth',
      'Goals',
      'Quests',
    ]);
  });
});

describe('DashboardScreen spending donut', () => {
  /** The legend row of a category: the row's button holds its name and its amount. */
  const legendRow = (spending: HTMLElement, name: string) =>
    within(spending).getByText(name).closest('button')!;

  it('switches the donut between week and month, and shows a slice when tapped', async () => {
    renderDashboard(monthData(), TODAY);
    const spending = region('Spending');
    const month = within(spending).getByRole('button', { name: 'Month' });
    const week = within(spending).getByRole('button', { name: 'Week' });
    expect(month).toHaveAttribute('aria-pressed', 'true');
    expect(week).toHaveAttribute('aria-pressed', 'false');

    // October: rent, food and fun, biggest first, in whole units in the legend.
    expect(within(spending).getByText(usdWhole(1_320_00))).toBeInTheDocument();
    expect(within(spending).getByText(october)).toBeInTheDocument();
    // (The donut's own list of arcs is only read out, so it has no text.)
    expect(
      within(spending)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
        .filter(Boolean),
    ).toEqual([`Rent${usdWhole(1_200_00)}`, `Food${usdWhole(90_00)}`, `Fun${usdWhole(30_00)}`]);

    // A tap shows the exact amount and the share in the middle.
    await userEvent.click(legendRow(spending, 'Rent'));
    expect(legendRow(spending, 'Rent')).toHaveAttribute('aria-pressed', 'true');
    expect(within(spending).getByText(usd(1_200_00))).toBeInTheDocument();
    expect(within(spending).getByText('Rent · 91%')).toBeInTheDocument();
    await userEvent.click(legendRow(spending, 'Rent'));
    expect(within(spending).getByText(october)).toBeInTheDocument();

    // This week: food only.
    await userEvent.click(week);
    expect(week).toHaveAttribute('aria-pressed', 'true');
    expect(month).toHaveAttribute('aria-pressed', 'false');
    expect(within(spending).getByText('This week')).toBeInTheDocument();
    expect(within(spending).getAllByText(usdWhole(90_00))).toHaveLength(2); // centre and legend
    expect(within(spending).queryByText('Rent')).not.toBeInTheDocument();
  });

  it('writes no percentages on the donut or in its legend', () => {
    renderDashboard(monthData(), TODAY);
    expect(within(region('Spending')).queryAllByText(/^\d+%$/)).toHaveLength(0);
  });

  it('shows a slice when its arc is read out and tapped by a keyboard or screen reader', async () => {
    renderDashboard(monthData(), TODAY);
    const spending = region('Spending');
    await userEvent.click(
      within(spending).getByRole('button', { name: `Food, ${usd(90_00)}, 7%` }),
    );
    expect(within(spending).getByText('Food · 7%')).toBeInTheDocument();
  });

  describe('with nothing to show', () => {
    /** Spent only on the 1st of October: this week is empty, the month is not. */
    function spentEarlierInTheMonth() {
      const data = emptySnapshot();
      data.tables.expense = [
        makeExpense({ date: '2026-10-01', category: 'rent', amount: 1_200_00 }),
      ];
      return data;
    }

    it('says Nothing spent this week on the Week tab when only earlier weeks have spending', async () => {
      renderDashboard(spentEarlierInTheMonth(), TODAY);
      const spending = region('Spending');
      expect(within(spending).queryByText('No spending yet')).not.toBeInTheDocument();
      expect(within(spending).queryByText('Nothing spent this week')).not.toBeInTheDocument();

      await userEvent.click(within(spending).getByRole('button', { name: 'Week' }));
      expect(within(spending).getByText('Nothing spent this week')).toBeInTheDocument();
      expect(within(spending).queryByText('No spending yet')).not.toBeInTheDocument();

      await userEvent.click(within(spending).getByRole('button', { name: 'Month' }));
      expect(within(spending).queryByText('Nothing spent this week')).not.toBeInTheDocument();
    });

    it('keeps No spending yet for a brand-new account, on either tab', async () => {
      renderDashboard(emptySnapshot(), TODAY);
      const spending = region('Spending');
      expect(within(spending).getByText('No spending yet')).toBeInTheDocument();
      await userEvent.click(within(spending).getByRole('button', { name: 'Week' }));
      expect(within(spending).getByText('No spending yet')).toBeInTheDocument();
      expect(within(spending).queryByText('Nothing spent this week')).not.toBeInTheDocument();
    });

    it('keeps No spending yet on the Month tab of a month with nothing in it', () => {
      // Spending exists, but in October; today is in November.
      renderDashboard(spentEarlierInTheMonth(), '2026-11-18');
      expect(within(region('Spending')).getByText('No spending yet')).toBeInTheDocument();
    });
  });

  it('clears a tapped slice when the range changes', async () => {
    // A transport expense this week, so the week has two slices: Food and Transport.
    const data = monthData();
    data.tables.expense.push(
      makeExpense({ date: '2026-10-13', category: 'transport', amount: 10_00 }),
    );
    renderDashboard(data, TODAY);
    const spending = region('Spending');
    const arcOpacities = () =>
      [...spending.querySelectorAll('circle')].map((c) => (c as SVGElement).style.opacity);

    // Tap the first slice (Rent in the month). Index 0 is still a slice in the week (Food).
    await userEvent.click(legendRow(spending, 'Rent'));
    expect(within(spending).getByText(/· \d+%/)).toHaveTextContent('Rent · 90%');
    expect(arcOpacities()).toContain('0.25');

    await userEvent.click(within(spending).getByRole('button', { name: 'Week' }));
    expect(within(spending).getByText('This week')).toBeInTheDocument();
    expect(within(spending).queryByText(/· \d+%/)).not.toBeInTheDocument();
    expect(arcOpacities()).not.toContain('0.25');
    expect(legendRow(spending, 'Food')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('DashboardScreen last 7 days', () => {
  it('shows the last 7 days and a tapped day', async () => {
    renderDashboard(monthData(), TODAY);
    const week = region('Last 7 days');
    expect(within(week).getByRole('link', { name: 'History' })).toHaveAttribute('href', '/history');
    expect(within(week).getAllByRole('button')).toHaveLength(7);
    expect(within(week).getByRole('button', { name: `Today: ${usd(20_00)}` })).toBeInTheDocument();
    expect(
      within(week).getByRole('button', { name: `${formatWeekday('2026-10-08')}: ${usd(0)}` }),
    ).toBeInTheDocument();
    expect(
      within(week).getByText(line(`This week so far ${usd(90_00)} · tap a day`)),
    ).toBeInTheDocument();

    const tuesday = formatWeekday('2026-10-13');
    await userEvent.click(within(week).getByRole('button', { name: `${tuesday}: ${usd(50_00)}` }));
    expect(within(week).getByText(line(`${tuesday} · spent ${usd(50_00)}`))).toBeInTheDocument();

    const saturday = formatWeekday('2026-10-10');
    await userEvent.click(within(week).getByRole('button', { name: `${saturday}: ${usd(0)}` }));
    expect(within(week).getByText(line(`${saturday} · nothing spent`))).toBeInTheDocument();

    await userEvent.click(within(week).getByRole('button', { name: `${saturday}: ${usd(0)}` }));
    expect(
      within(week).getByText(line(`This week so far ${usd(90_00)} · tap a day`)),
    ).toBeInTheDocument();
  });
});

describe('DashboardScreen limits', () => {
  it('rings the top three limits with left or over text', () => {
    renderDashboard(monthData(), TODAY);
    const limits = region('Limits');
    expect(within(limits).getByRole('link', { name: 'Budget' })).toHaveAttribute('href', '/budget');
    // Highest use first: food at 150%, overall at 88%, fun at 30%.
    const rings = within(limits).getAllByRole('img');
    expect(rings.map((r) => r.getAttribute('aria-label'))).toEqual([
      `Food · week: 150% used, ${usdWhole(30_00)} over`,
      `Overall: 88% used, ${usdWhole(180_00)} left`,
      `Fun: 30% used, ${usdWhole(70_00)} left`,
    ]);
    const stroke = (ring: HTMLElement) =>
      [...ring.querySelectorAll('circle')].at(-1)?.getAttribute('stroke');
    expect(stroke(rings[0]!)).toBe('var(--color-danger)');
    expect(stroke(rings[1]!)).toBe('var(--color-warning)');
    expect(stroke(rings[2]!)).toBe('var(--color-accent)');
    for (const ring of rings) expect(ring).toHaveStyle({ width: '86px', height: '86px' });

    expect(within(limits).getByText('150%')).toBeInTheDocument();
    expect(within(limits).getByText('Food · week')).toBeInTheDocument();
    expect(within(limits).getByText(`${usdWhole(30_00)} over`)).toBeInTheDocument();
    expect(within(limits).getByText(`${usdWhole(180_00)} left`)).toBeInTheDocument();
  });

  it('shows no more than three rings', () => {
    const data = monthData();
    data.tables.budgetLimit.push(
      makeLimit({ id: 'transport', category: 'transport', period: 'monthly', amount: 50_00 }),
    );
    renderDashboard(data, TODAY);
    expect(within(region('Limits')).getAllByRole('img')).toHaveLength(3);
  });

  it('shows the food limit at 83% for a worked example', () => {
    const avl = example('AVL-1');
    renderDashboard(avl.data, avl.today);
    const limits = region('Limits');
    expect(
      within(limits).getByRole('img', {
        name: `Food · week: 83% used, ${usdWhole(20_00)} left`,
      }),
    ).toBeInTheDocument();
    expect(within(limits).getByText('83%')).toBeInTheDocument();
  });
});

describe('DashboardScreen coming up', () => {
  it('lists the coming bills with date blocks', () => {
    renderDashboard(monthData(), TODAY);
    const bills = region('Coming up');
    // 15.99 + 230 + 39
    expect(within(bills).getByRole('link', { name: usd(284_99) })).toHaveAttribute(
      'href',
      '/subscriptions',
    );
    const rows = within(bills).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      `${formatMonthShort('2026-10-20')}20StreamflixSubscription · in 6 days${usd(15_99)}`,
      `${formatMonthShort('2026-10-21')}21VisaCard · in 7 days${usd(230_00)}`,
      `${formatMonthShort('2026-10-28')}28FitHub GymSubscription · in 14 days${usd(39_00)}`,
    ]);
  });

  it('shows no more than four bills', () => {
    const data = monthData();
    data.tables.subscription = ['A', 'B', 'C', 'D', 'E'].map((name, i) =>
      makeSubscription({ name, amount: 5_00, nextRenewal: `2026-10-${20 + i}` }),
    );
    renderDashboard(data, TODAY);
    expect(within(region('Coming up')).getAllByRole('listitem')).toHaveLength(4);
  });

  it('keeps a long bill name on one line', () => {
    const data = monthData();
    const name = 'Extremely long subscription name that keeps going';
    data.tables.subscription = [makeSubscription({ name, nextRenewal: '2026-10-20' })];
    renderDashboard(data, TODAY);
    expect(within(region('Coming up')).getByText(name)).toHaveClass('truncate');
  });
});

describe('DashboardScreen net worth', () => {
  it('shows net worth with its monthly change and trend', () => {
    renderDashboard(monthData({ income: 2_000_00 }), TODAY);
    const worth = region('Net worth');
    // 3,680 + 2,000 cash + 3,000 savings − 230 card; 7,770 at the end of September.
    expect(within(worth).getByText(usd(8_450_00))).toBeInTheDocument();
    const rise = screen.getByText(`▲ ${usdWhole(680_00)} this month`);
    expect(rise).toHaveClass('text-accent-text');
    expect(
      within(worth).getByRole('img', {
        name: `Net worth over the last 30 days, now ${usd(8_450_00)}`,
      }),
    ).toBeInTheDocument();
    expect(within(worth).getByText(`Cash ${usdWhole(5_680_00)}`)).toBeInTheDocument();
    expect(within(worth).getByText(`Savings ${usdWhole(3_000_00)}`)).toBeInTheDocument();
    expect(within(worth).getByText(`Debts ${usdWhole(230_00)}`)).toBeInTheDocument();
  });

  it('shows a fall with a down arrow in the danger colour', () => {
    renderDashboard(monthData(), TODAY);
    const fall = screen.getByText(`▼ ${usdWhole(1_320_00)} this month`);
    expect(fall).toHaveClass('text-danger');
    expect(within(region('Net worth')).getByText(usd(6_450_00))).toBeInTheDocument();
  });

  it('says there is no change when net worth has not moved this month', () => {
    renderDashboard(emptySnapshot(), TODAY);
    expect(screen.getByText('No change this month')).toHaveClass('text-muted');
  });

  it('adds Investments to the legend, in the second chart colour, once they are worth something', () => {
    const data = monthData();
    data.tables.holding = [
      makeHolding({
        shares: 10,
        quote: { price: 100, previousClose: 99, fxRate: 1, asOf: '2026-10-14T10:00:00.000Z' },
      }),
    ];
    renderDashboard(data, TODAY);
    const worth = region('Net worth');
    const item = within(worth).getByText(`Investments ${usdWhole(1_000_00)}`);
    expect(item.firstElementChild).toHaveStyle({ backgroundColor: 'var(--color-chart-2)' });
    // Between Savings and Debts, and part of the figure: 6,450 plus the 1,000 held.
    expect(
      within(worth)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      `Cash ${usdWhole(3_680_00)}`,
      `Savings ${usdWhole(3_000_00)}`,
      `Investments ${usdWhole(1_000_00)}`,
      `Debts ${usdWhole(230_00)}`,
    ]);
    expect(within(worth).getByText(usd(7_450_00))).toBeInTheDocument();
  });

  it('leaves Investments out of the legend when there are none, or none are priced', () => {
    const data = monthData();
    renderDashboard(data, TODAY);
    expect(within(region('Net worth')).queryByText(/^Investments/)).not.toBeInTheDocument();
    cleanup();
    data.tables.holding = [makeHolding()];
    renderDashboard(data, TODAY);
    expect(within(region('Net worth')).queryByText(/^Investments/)).not.toBeInTheDocument();
  });

  it('shows 34px net worth', () => {
    renderDashboard(monthData(), TODAY);
    expect(within(region('Net worth')).getByText(usd(6_450_00))).toHaveClass('text-[34px]');
  });
});

describe('DashboardScreen goals', () => {
  it('shows two goals in the usual order, with their progress', () => {
    renderDashboard(monthData(), TODAY);
    const goals = region('Goals');
    expect(within(goals).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/goals');
    // No deadlines: the closest to done first. Vacation (2%) is third and is left out.
    const rows = within(goals).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      `New bike${usdWhole(450_00)} of ${usdWhole(1_200_00)} · 37%`,
      `Emergency fund${usdWhole(3_000_00)} of ${usdWhole(10_000_00)} · 30%`,
    ]);
    const bars = within(goals).getAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuenow', '37');
    expect(bars[0]!.firstElementChild).toHaveStyle({ backgroundColor: 'var(--color-chart-1)' });
    expect(bars[1]!.firstElementChild).toHaveStyle({ backgroundColor: 'var(--color-chart-3)' });
  });

  it('truncates a 40-character goal name', () => {
    const data = emptySnapshot();
    const name = 'A goal with a name that is forty chars!!';
    expect(name).toHaveLength(40);
    data.tables.goal = [makeGoal({ name })];
    renderDashboard(data, TODAY);
    expect(within(region('Goals')).getByText(name)).toHaveClass('truncate');
  });
});

describe('DashboardScreen with nothing set up', () => {
  it('shows friendly empty states on a brand-new account', () => {
    const { container } = renderDashboard(emptySnapshot(), TODAY);
    expect(within(region('Spending')).getByText('No spending yet')).toBeInTheDocument();
    expect(
      within(region('Spending')).getByText('Expenses you add show up here by category.'),
    ).toBeInTheDocument();

    expect(within(region('Limits')).getByText('No limits yet')).toBeInTheDocument();
    expect(within(region('Limits')).getByRole('link', { name: 'Set a limit' })).toHaveAttribute(
      'href',
      '/budget',
    );
    expect(within(region('Coming up')).getByText('Nothing due this month')).toBeInTheDocument();
    expect(within(region('Goals')).getByText('No goals yet')).toBeInTheDocument();
    expect(within(region('Goals')).getByRole('link', { name: 'Add a goal' })).toHaveAttribute(
      'href',
      '/goals',
    );
    expect(within(region('Available to spend')).getByText(usd(0))).toBeInTheDocument();
    expect(
      within(region('Last 7 days')).getByText(line(`This week so far ${usd(0)} · tap a day`)),
    ).toBeInTheDocument();

    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe('DashboardScreen salary and freeze', () => {
  const sal = example('SAL-1');

  it('asks whether an expected salary arrived and confirms the amount', async () => {
    const today = '2026-10-25';
    renderDashboard(applyRecords(sal.data, dueGenerated(sal.data, today)), today);
    expect(
      screen.getByText(`Your ${october} salary is expected: ${usd(2_709_68)}. Did it arrive?`),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    expect(within(dialog).getByLabelText('Amount received')).toHaveValue('2,709.68');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(actions.confirmIncome).toHaveBeenCalledWith('salary-2026-10', 270968);
  });

  it('lets a salary that never came be marked as not arrived', async () => {
    const today = '2026-10-25';
    renderDashboard(applyRecords(sal.data, dueGenerated(sal.data, today)), today);
    await userEvent.click(
      screen.getByRole('button', { name: `Didn't arrive (${october} salary)` }),
    );
    expect(actions.skipIncome).toHaveBeenCalledWith('salary-2026-10');
  });

  it('explains an active freeze', () => {
    renderDashboard(sal.data, '2026-10-02');
    expect(
      screen.getByText(
        `Salary freeze until ${formatDay('2026-10-03')}. Bills and subscriptions still apply.`,
      ),
    ).toBeInTheDocument();
  });

  it('puts the banners between the top line and the amount', () => {
    const today = '2026-10-25';
    renderDashboard(applyRecords(sal.data, dueGenerated(sal.data, today)), today);
    const [banner] = screen.getAllByText(/salary is expected/);
    const top = screen.getByRole('link', { name: /Open quests$/ });
    const hero = region('Available to spend');
    expect(top.compareDocumentPosition(banner!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner!.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('DashboardScreen reminders invitation', () => {
  const INVITE = 'Get reminders for bills, renewals and a daily nudge to log spending.';
  const BLOCKED =
    'Notifications are blocked for Funancial. Turn them on in Android Settings → Apps → Funancial → Notifications.';
  /** Nobody has been asked yet: off, and not prompted. */
  const fresh = makeSettings().reminders;

  function dataWith(reminders: ReminderSettings) {
    const data = emptySnapshot();
    data.tables.settings = [makeSettings({ reminders })];
    return data;
  }

  function renderOnPhone(
    notifier: FakeNotifier | null,
    reminders = fresh,
    namespace: 'real' | 'demo' = 'real',
  ) {
    return renderWithStore(
      onPhone(
        notifier,
        <MemoryRouter>
          <DashboardScreen />
        </MemoryRouter>,
      ),
      createStubStore({ data: dataWith(reminders), namespace, today: '2026-10-14' }),
    );
  }

  it('offers reminders once and remembers Not now', async () => {
    const notifier = fakeNotifier();
    const { store } = renderOnPhone(notifier);
    expect(screen.getByText(INVITE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(actions.updateSettings).toHaveBeenCalledExactlyOnceWith({
      reminders: { ...fresh, prompted: true },
    });
    expect(notifier.request).not.toHaveBeenCalled();

    // Saved, so it is not offered again.
    act(() => store.setState({ data: dataWith({ ...fresh, prompted: true }) }));
    expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
  });

  it('does not offer reminders on the web, in the demo, or once they are on or answered', () => {
    const web = renderWithStore(
      <MemoryRouter>
        <DashboardScreen />
      </MemoryRouter>,
      createStubStore({ data: dataWith(fresh), today: '2026-10-14' }),
    );
    expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
    web.unmount();

    const cases: Array<[ReminderSettings, 'real' | 'demo']> = [
      [fresh, 'demo'],
      [{ ...fresh, enabled: true }, 'real'],
      [{ ...fresh, prompted: true }, 'real'],
      [{ ...fresh, enabled: true, prompted: true }, 'real'],
    ];
    for (const [reminders, namespace] of cases) {
      const view = renderOnPhone(fakeNotifier(), reminders, namespace);
      expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('asks Android on Turn on, then saves reminders as on', async () => {
    const notifier = fakeNotifier();
    renderOnPhone(notifier);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(notifier.request).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(actions.updateSettings).toHaveBeenCalledExactlyOnceWith({
        reminders: { ...fresh, enabled: true, prompted: true },
      }),
    );
  });

  it('explains how to unblock notifications when Android refuses, and saves nothing', async () => {
    const notifier = fakeNotifier({ request: async () => false });
    renderOnPhone(notifier);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(actions.updateSettings).not.toHaveBeenCalled();
    // Still on offer: they can fix it in Android's settings and try again, or dismiss it.
    expect(screen.getByText(INVITE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });
});

describe('DashboardScreen quests', () => {
  it('shows up to three quests on Home, with a link to all of them', () => {
    renderDashboard(emptySnapshot(), '2026-10-14');

    const quests = region('Quests');
    expect(within(quests).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/quests');
    expect(
      within(quests)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')?.textContent),
    ).toEqual(["Log today's spending", 'Do your weekly check-in', 'Back up your data']);
  });

  it('puts the quests still to do first, daily before weekly before monthly', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile()];
    data.tables.budgetLimit = [makeLimit()];
    data.tables.checkIn = [makeCheckIn({ kind: 'no-spend', date: '2026-10-14' })];
    renderDashboard(data, '2026-10-14');

    // Five quests apply and today's is done: it drops out of the three shown.
    const rows = within(region('Quests')).getAllByRole('listitem');
    expect(rows.map((li) => li.querySelector('p')?.textContent)).toEqual([
      'Stay within your limits this week',
      'Do your weekly check-in',
      "Reconcile this month's salary",
    ]);
  });

  it('works out the game once for the top line and the quests together', () => {
    vi.mocked(computeGameView).mockClear();
    renderDashboard(emptySnapshot(), '2026-10-14');
    expect(computeGameView).toHaveBeenCalledTimes(1);
  });

  it('records Nothing spent from Home', async () => {
    const { store } = renderDashboard(emptySnapshot(), '2026-10-14');
    await userEvent.click(within(region('Quests')).getByRole('button', { name: 'Nothing spent' }));
    expect(store.getState().put).toHaveBeenCalledExactlyOnceWith(
      'checkIn',
      expect.objectContaining({ id: 'checkin:no-spend:2026-10-14', kind: 'no-spend' }),
    );
  });
});

describe('DashboardScreen help tips', () => {
  it('explains Available to spend, beside its title', async () => {
    renderDashboard(monthData(), TODAY);
    await expectHelpTip(region('Available to spend'), 'available to spend', 'available');
  });

  it('sets the "?" 4px after the Available to spend title', () => {
    renderDashboard(monthData(), TODAY);
    const tip = within(region('Available to spend')).getByRole('button', {
      name: 'What is available to spend?',
    });
    expect(tip.parentElement).toHaveClass('gap-1');
  });

  it('leaves the month line to its own taps', async () => {
    renderDashboard(monthData(), TODAY);
    const hero = region('Available to spend');
    await userEvent.click(
      within(hero).getByRole('button', { name: 'What is available to spend?' }),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      within(hero).getByRole('button', { name: `Bills still to come: ${usdWhole(284_99)}` }),
    );
    expect(within(hero).getByText('Bills still to come')).toBeInTheDocument();
  });

  it('explains limits once, on the Limits title and not on each ring', async () => {
    renderDashboard(monthData(), TODAY);
    const limits = region('Limits');
    expect(within(limits).getAllByRole('button', { name: /^What is/ })).toHaveLength(1);
    await expectHelpTip(limits, 'a limit', 'limits');
  });

  it('explains Net worth, beside its title', async () => {
    renderDashboard(monthData(), TODAY);
    await expectHelpTip(region('Net worth'), 'net worth', 'net-worth');
  });
});
