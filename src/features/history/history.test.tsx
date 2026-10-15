import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { formatMoney } from '@/domain/money';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { HistoryScreen } from './HistoryScreen';

const actions = vi.hoisted(() => ({
  updateExpense: vi.fn(async () => {}),
  deleteExpense: vi.fn(async () => {}),
  deleteIncome: vi.fn(async () => {}),
  deleteTransaction: vi.fn(async () => {}),
  setActualBalance: vi.fn(async () => null),
  addExpense: vi.fn(),
  wouldCrossOver: vi.fn(() => []),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const usd = (minor: number) => formatMoney(minor, 'USD');
const bal = EXAMPLES.find((e) => e.id === 'BAL-1');
if (!bal) throw new Error('BAL-1 missing');

beforeEach(() => Object.values(actions).forEach((a) => a.mockClear()));

function renderHistory() {
  renderWithStore(
    <MemoryRouter>
      <HistoryScreen />
    </MemoryRouter>,
    createStubStore({ data: bal?.data, today: bal?.today }),
  );
}

const row = (text: string) => {
  const item = screen.getByText(text).closest('li');
  if (!item) throw new Error(`no row for ${text}`);
  return within(item);
};

describe('HistoryScreen', () => {
  it('lists every kind of entry for the month (BAL-1)', () => {
    renderHistory();
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
    expect(row('Cash → Savings').getByText(usd(500_00))).toBeInTheDocument();
    expect(row('Balance correction').getByText(`−${usd(20_00)}`)).toBeInTheDocument();
    expect(row('Groceries').getByText(`−${usd(120_00)}`)).toBeInTheDocument();
    expect(row('Side gig').getByText('Expected')).toBeInTheDocument();
    expect(row('Paid Visa').getByText(`−${usd(30_00)}`)).toBeInTheDocument();
    // Before the month shown: September's expense is not in October.
    expect(screen.queryByText('Before you started')).not.toBeInTheDocument();
  });

  it('shows only spending when asked', async () => {
    renderHistory();
    await userEvent.click(screen.getByRole('radio', { name: 'Spending' }));
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Side gig')).not.toBeInTheDocument();
    expect(screen.queryByText('Cash → Savings')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Shopping');
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
    expect(screen.getByText('Jacket')).toBeInTheDocument();
  });

  it('edits an expense', async () => {
    renderHistory();
    const groceries = bal?.data.tables.expense.find((e) => e.note === 'Groceries');
    await userEvent.click(screen.getByRole('button', { name: /^Groceries/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit expense' });
    const amount = within(dialog).getByLabelText('Amount');
    expect(amount).toHaveValue('120.00');
    await userEvent.clear(amount);
    await userEvent.type(amount, '130');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.updateExpense).toHaveBeenCalledWith(
      groceries?.id,
      expect.objectContaining({ amount: 130_00, category: 'food', note: 'Groceries' }),
    );
    expect(actions.addExpense).not.toHaveBeenCalled();
  });

  it('deletes an income after asking', async () => {
    renderHistory();
    const gig = bal?.data.tables.income.find((i) => i.label === 'Side gig');
    await userEvent.click(row('Side gig').getByRole('button', { name: 'Delete Side gig' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this entry?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteIncome).toHaveBeenCalledWith(gig?.id);
  });

  it('sets the actual cash balance', async () => {
    renderHistory();
    await userEvent.click(screen.getByRole('button', { name: 'Set actual balance' }));
    const dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    // 1,000 + 3,000 − 120 − 500 − 30 − 20
    expect(within(dialog).getByText(`Funancial thinks: ${usd(3_330_00)}`)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Actual balance'), '3,342.34');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.setActualBalance).toHaveBeenCalledWith('cash', 3_342_34, '2026-10-10');
  });

  it('says when the balance already matches', async () => {
    renderHistory();
    await userEvent.click(screen.getByRole('button', { name: 'Set actual balance' }));
    const dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Savings' }));
    await userEvent.type(within(dialog).getByLabelText('Actual balance'), '5500');
    expect(within(dialog).getByText('Already matches.')).toBeInTheDocument();
  });
});
