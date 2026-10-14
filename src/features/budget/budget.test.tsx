import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDemoSnapshot } from '@/data/demoSeed';
import { limitStatus } from '@/domain/budget';
import { formatMoney } from '@/domain/money';
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

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

beforeEach(() => {
  actions.saveLimit.mockClear();
  actions.deleteLimit.mockClear();
});

function renderBudget() {
  const data = buildDemoSnapshot(TODAY);
  renderWithStore(
    <MemoryRouter>
      <BudgetScreen />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY, namespace: 'demo' }),
  );
  return data;
}

async function openNewLimit() {
  await userEvent.click(screen.getByRole('button', { name: 'Add limit' }));
  return screen.getByRole('dialog', { name: 'Add a limit' });
}

describe('BudgetScreen', () => {
  it('lists every limit with what is spent and what is left', () => {
    const data = renderBudget();
    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    for (const [name, category] of [
      ['Food · weekly', 'food'],
      ['Fun · monthly', 'entertainment'],
      ['Overall · monthly', null],
    ] as const) {
      const limit = data.tables.budgetLimit.find((l) => l.category === category);
      if (!limit) throw new Error(`demo has no ${name} limit`);
      const s = limitStatus(limit, data, TODAY, 1);
      const left = s.remaining >= 0 ? `${usd(s.remaining)} left` : `${usd(-s.remaining)} over`;
      expect(screen.getByRole('progressbar', { name })).toHaveAttribute(
        'aria-valuenow',
        String(Math.min(100, s.pct)),
      );
      expect(
        screen.getByText(`${usd(s.spent)} of ${usd(limit.amount)} · ${left}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole('region', { name: 'This month by category' })).toBeInTheDocument();
  });

  it('creates a weekly food limit with exactly what was entered', async () => {
    renderWithStore(
      <MemoryRouter>
        <BudgetScreen />
      </MemoryRouter>,
      createStubStore({ today: TODAY }),
    );
    expect(screen.getByText('No limits yet')).toBeInTheDocument();
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

  it('edits and deletes an existing limit', async () => {
    const data = renderBudget();
    const fun = data.tables.budgetLimit.find((l) => l.category === 'entertainment');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Fun · monthly' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit limit' });
    expect(within(dialog).getByLabelText('Limit')).toHaveValue('100.00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteLimit).toHaveBeenCalledWith(fun?.id);
  });
});
