import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { formatMoney } from '@/domain/money';
import type { DataSnapshot } from '@/domain/snapshot';
import { formatMonthYear, formatShares } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDividend, makeSale, makeTransaction } from '@/test/fixtures';
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
const invest = vi.hoisted(() => ({
  deleteDividend: vi.fn(async () => {}),
  undoSale: vi.fn(async () => {}),
}));
vi.mock('@/store/useInvest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useInvest')>()),
  useInvestActions: () => invest,
}));

const usd = (minor: number) => formatMoney(minor, 'USD');
const bal = EXAMPLES.find((e) => e.id === 'BAL-1');
if (!bal) throw new Error('BAL-1 missing');

beforeEach(() =>
  [...Object.values(actions), ...Object.values(invest)].forEach((a) => a.mockClear()),
);

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

/** BAL-1 with a sale into savings at a profit, one into cash at a loss, and one of August. */
function withSales(): DataSnapshot {
  const data = structuredClone(bal!.data);
  data.tables.sale = [
    makeSale({
      id: 's-aapl',
      symbol: 'AAPL',
      shares: 5,
      proceeds: 1_100_00,
      cost: 1_000_00,
      soldOn: '2026-10-06',
      to: 'savings',
    }),
    makeSale({
      id: 's-ko',
      symbol: 'KO',
      shares: 2.5,
      proceeds: 80_00,
      cost: 100_00,
      soldOn: '2026-10-05',
      to: 'cash',
    }),
    makeSale({ id: 's-aug', symbol: 'MSFT', soldOn: '2026-08-20' }),
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

  it('gives each delete button the 44px a touch target needs', () => {
    renderHistory();
    expect(row('Side gig').getByRole('button', { name: 'Delete Side gig' })).toHaveClass('size-11');
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

  it('lists a sale with its proceeds, where they went and the profit', () => {
    renderHistory(withSales());
    expect(row('Sold 5 AAPL').getByText(`+${usd(1_100_00)}`)).toBeInTheDocument();
    expect(screen.getByText('Sold 5 AAPL').closest('li')).toHaveTextContent(
      `To savings · profit ▲ ${usd(100_00)}`,
    );
  });

  it('shows a loss on a sale with ▼ and the danger colour', () => {
    renderHistory(withSales());
    expect(row(`Sold ${formatShares(2.5)} KO`).getByText(`+${usd(80_00)}`)).toBeInTheDocument();
    const item = screen.getByText(`Sold ${formatShares(2.5)} KO`).closest('li')!;
    expect(item).toHaveTextContent(`To cash · profit ▼ ${usd(20_00)}`);
    expect(within(item).getByText(`▼ ${usd(20_00)}`)).toHaveClass('text-danger');
    const gain = within(screen.getByText('Sold 5 AAPL').closest('li')!).getByText(/^▲/);
    expect(gain).not.toHaveClass('text-danger');
  });

  it('shows a sale with income, in the month it was sold, not with spending or transfers', async () => {
    renderHistory(withSales());
    await userEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByText('Sold 5 AAPL')).toBeInTheDocument();
    for (const name of ['Spending', 'Transfers']) {
      await userEvent.click(screen.getByRole('radio', { name }));
      expect(screen.queryByText('Sold 5 AAPL')).not.toBeInTheDocument();
    }
    // A month with only a sale in it is one to choose.
    await userEvent.selectOptions(screen.getByLabelText('Month'), formatMonthYear('2026-08'));
    await userEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByText('Sold 5 MSFT')).toBeInTheDocument();
  });

  it('deletes a sale after saying the shares go back, by undoing it', async () => {
    renderHistory(withSales());
    await userEvent.click(row('Sold 5 AAPL').getByRole('button', { name: 'Delete Sold 5 AAPL' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this entry?' });
    expect(dialog).toHaveTextContent('its shares go back to your AAPL holding');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(invest.undoSale).toHaveBeenCalledWith('s-aapl');
    expect(invest.deleteDividend).not.toHaveBeenCalled();
  });

  it('shows a stock purchase as what was bought and where the money came from', () => {
    const data = structuredClone(bal!.data);
    data.tables.transaction.push(
      makeTransaction({
        type: 'investment',
        amount: 500_00,
        date: '2026-10-07',
        from: 'savings',
        to: null,
        note: 'Bought KO',
      }),
    );
    renderHistory(data);
    expect(row('Bought KO').getByText('From savings')).toBeInTheDocument();
    expect(row('Bought KO').getByText(`−${usd(500_00)}`)).toBeInTheDocument();
    expect(screen.queryByText('Paid a card or loan')).not.toBeInTheDocument();
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
