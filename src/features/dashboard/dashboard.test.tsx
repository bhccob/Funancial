import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { applyRecords, dueGenerated } from '@/domain/sync';
import { formatDay, formatMonth } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { DashboardScreen } from './DashboardScreen';

const actions = vi.hoisted(() => ({
  confirmIncome: vi.fn(async () => {}),
  skipIncome: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

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
const october = formatMonth('2026-10');

describe('DashboardScreen with AVL-1', () => {
  const avl = example('AVL-1');
  beforeEach(() => renderDashboard(avl.data, avl.today));

  it('leads with what is available to spend', () => {
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    const kpi = region('Available to spend');
    expect(within(kpi).getByText(usd(2_654_01))).toBeInTheDocument();
    expect(
      within(kpi).getByText('Cash + savings − upcoming bills − reserved limits'),
    ).toBeInTheDocument();
    expect(within(kpi).getByRole('link', { name: 'Add expense' })).toHaveAttribute('href', '/add');
    expect(within(kpi).getByRole('link', { name: 'Income' })).toHaveAttribute(
      'href',
      '/add?type=income',
    );
  });

  it('shows net worth with its parts and this month’s spending', () => {
    const worth = region('Net worth');
    // 1,100 cash + 3,000 savings − 230 card
    expect(within(worth).getByText(usd(3_870_00))).toBeInTheDocument();
    expect(
      within(worth).getByText(
        `Cash ${usd(1_100_00)} · Savings ${usd(3_000_00)} · Debts ${usd(230_00)}`,
      ),
    ).toBeInTheDocument();
    const spent = region(`Spent in ${october}`);
    expect(within(spent).getByText(usd(100_00))).toBeInTheDocument();
    expect(within(spent).getByText(`This year ${usd(100_00)}`)).toBeInTheDocument();
  });

  it('shows the food limit at 83%', () => {
    const bar = screen.getByRole('progressbar', { name: 'Food · this week' });
    expect(bar).toHaveAttribute('aria-valuenow', '83');
    expect(bar).toHaveAttribute('aria-valuetext', '83% used');
    expect(within(region('Limits')).getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/budget',
    );
  });

  it('lists the bills still due this month with their total', () => {
    const bills = region('Upcoming bills');
    expect(within(bills).getByText('Streamflix')).toBeInTheDocument();
    expect(within(bills).getByText('Visa')).toBeInTheDocument();
    expect(within(bills).queryByText('FitHub Gym')).not.toBeInTheDocument();
    expect(within(bills).getByText(`${usd(245_99)} this month`)).toBeInTheDocument();
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
});

describe('DashboardScreen with nothing set up', () => {
  it('invites the first limit and says nothing is due', () => {
    renderDashboard(emptySnapshot(), '2026-10-14');
    expect(within(region('Limits')).getByText('No limits yet')).toBeInTheDocument();
    expect(within(region('Limits')).getByRole('link', { name: 'Set a limit' })).toHaveAttribute(
      'href',
      '/budget',
    );
    expect(
      within(region('Upcoming bills')).getByText('Nothing due this month'),
    ).toBeInTheDocument();
    expect(within(region('Available to spend')).getByText(usd(0))).toBeInTheDocument();
  });
});
