import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { formatMoney } from '@/domain/money';
import type { DataSnapshot } from '@/domain/snapshot';
import { formatMonthYear } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDividend } from '@/test/fixtures';
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
const invest = vi.hoisted(() => ({ deleteDividend: vi.fn(async () => {}) }));
vi.mock('@/store/useInvest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useInvest')>()),
  useInvestActions: () => invest,
}));

const usd = (minor: number) => formatMoney(minor, 'USD');
const bal = EXAMPLES.find((e) => e.id === 'BAL-1');
if (!bal) throw new Error('BAL-1 missing');

beforeEach(() => [...Object.values(actions), invest.deleteDividend].forEach((a) => a.mockClear()));

function renderHistory(data = bal?.data) {
  renderWithStore(
    <MemoryRouter>
      <HistoryScreen />
    </MemoryRouter>,
    createStubStore({ data, today: bal?.today }),
  );
}

/** BAL-1 with dividends of October (into cash, reinvested, skipped) and one of August. */
function withDividends(): DataSnapshot {
  const data = structuredClone(bal!.data);
  data.tables.dividend = [
    makeDividend({ id: 'd-ko', symbol: 'KO', paidOn: '2026-10-08', amount: 11_20, bucket: 'cash' }),
    makeDividend({
      id: 'd-vwrl',
      symbol: 'VWRL',
      paidOn: '2026-10-06',
      amount: 8_50,
      bucket: 'reinvest',
      sharesAdded: 0.07,
    }),
    makeDividend({
      id: 'd-aapl',
      symbol: 'AAPL',
      paidOn: '2026-10-05',
      status: 'skipped',
      amount: 0,
      bucket: null,
    }),
    makeDividend({ id: 'd-aug', symbol: 'MSFT', paidOn: '2026-08-20', bucket: 'savings' }),
  ];
  return data;
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

  it('lists confirmed and skipped dividends, with where the money went', async () => {
    renderHistory(withDividends());
    expect(row('Dividend · KO').getByText(`+${usd(11_20)}`)).toBeInTheDocument();
    expect(row('Dividend · KO').getByText('To cash')).toBeInTheDocument();
    expect(row('Dividend · VWRL').getByText(`+${usd(8_50)}`)).toBeInTheDocument();
    expect(row('Dividend · VWRL').getByText('Reinvested')).toBeInTheDocument();
    expect(row('Skipped dividend · AAPL').getByText(usd(0))).toBeInTheDocument();
    // A month with only a dividend in it is one to choose.
    await userEvent.selectOptions(screen.getByLabelText('Month'), formatMonthYear('2026-08'));
    expect(row('Dividend · MSFT').getByText('To savings')).toBeInTheDocument();
  });

  it('shows dividends with income, not with spending or transfers', async () => {
    renderHistory(withDividends());
    await userEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByText('Dividend · KO')).toBeInTheDocument();
    for (const name of ['Spending', 'Transfers']) {
      await userEvent.click(screen.getByRole('radio', { name }));
      expect(screen.queryByText('Dividend · KO')).not.toBeInTheDocument();
    }
  });

  it('deletes a dividend after asking', async () => {
    renderHistory(withDividends());
    const name = 'Delete Skipped dividend · AAPL';
    await userEvent.click(row('Skipped dividend · AAPL').getByRole('button', { name }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this entry?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(invest.deleteDividend).toHaveBeenCalledWith('d-aapl');
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
