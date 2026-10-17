import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDate } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDebt, makeGoal, makeProfile, makeTransaction } from '@/test/fixtures';
import { DebtsScreen } from './DebtsScreen';
import { GoalsScreen } from './GoalsScreen';

const actions = vi.hoisted(() => ({
  saveGoal: vi.fn(async () => ({})),
  deleteGoal: vi.fn(async () => {}),
  contributeToGoal: vi.fn(async () => {}),
  saveDebt: vi.fn(async () => ({})),
  deleteDebt: vi.fn(async () => {}),
  payDebt: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');
const HISTORY =
  'This card or loan has history. Delete its expenses and payments first, or keep it.';

beforeEach(() => {
  toastStore.setState({ toasts: [] });
  Object.values(actions).forEach((a) => a.mockClear());
});

/** A goal, a card and a loan: each page must show its own and none of the other's. */
function filledData(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ openingDate: '2026-10-01' }));
  data.tables.goal.push(
    makeGoal({
      id: 'g1',
      name: 'New bike',
      target: 1_200_00,
      current: 450_00,
      deadline: '2027-02-14',
    }),
  );
  data.tables.debt.push(
    makeDebt({
      id: 'card-1',
      name: 'Visa',
      kind: 'credit_card',
      openingDate: '2026-10-01',
      openingBalance: 230_00,
      creditLimit: 1_000_00,
      dueDay: 21,
      payInFull: true,
    }),
    makeDebt({
      id: 'loan-1',
      name: 'Car loan',
      kind: 'loan',
      openingDate: '2026-10-01',
      openingBalance: 10_000_00,
      minimumPayment: 250_00,
      creditLimit: null,
      dueDay: null,
    }),
  );
  data.tables.transaction.push(
    makeTransaction({
      type: 'debt_payment',
      amount: 2_500_00,
      date: '2026-10-05',
      from: 'cash',
      to: null,
      debtId: 'loan-1',
    }),
  );
  return data;
}

function renderPage(page: ReactElement, data: DataSnapshot = filledData()) {
  renderWithStore(
    <MemoryRouter>
      {page}
      <Toaster />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY }),
  );
}

const renderGoals = (data?: DataSnapshot) => renderPage(<GoalsScreen />, data);
const renderDebts = (data?: DataSnapshot) => renderPage(<DebtsScreen />, data);

const row = (name: string) => {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`no row for ${name}`);
  return within(item);
};

describe('Goals', () => {
  it('shows the goals and none of the debts', () => {
    renderGoals();
    expect(screen.getByRole('heading', { level: 1, name: 'Goals' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add goal' })).toBeInTheDocument();
    expect(screen.getByText('New bike')).toBeInTheDocument();
    for (const gone of ['Visa', 'Car loan']) expect(screen.queryByText(gone)).toBeNull();
    for (const gone of ['Add card', 'Add loan']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
    expect(screen.queryByRole('heading', { name: 'Debts' })).toBeNull();
  });

  it('says so when there are no goals, and still offers to add one', () => {
    renderGoals(emptySnapshot());
    expect(screen.getByText('No goals yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add goal' })).toBeInTheDocument();
  });

  it('shows progress and what to save each month to make the deadline', () => {
    renderGoals();
    const bike = row('New bike');
    expect(bike.getByText(`${usd(450_00)} of ${usd(1_200_00)}`)).toBeInTheDocument();
    expect(
      bike.getByText(`${usd(187_50)} a month to reach it by ${formatDate('2027-02-14')}`),
    ).toBeInTheDocument();
    expect(bike.getByRole('progressbar', { name: 'New bike' })).toHaveAttribute(
      'aria-valuenow',
      '37',
    );
  });

  it('adds money to a goal from cash', async () => {
    renderGoals();
    await userEvent.click(row('New bike').getByRole('button', { name: 'Add money' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to goal' });
    await userEvent.type(within(dialog).getByLabelText('Amount'), '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(actions.contributeToGoal).toHaveBeenCalledWith('g1', 50_00, TODAY);
  });

  it('creates a goal with exactly what was entered', async () => {
    renderGoals();
    await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a goal' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Rainy day');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Emergency fund' }));
    await userEvent.type(within(dialog).getByLabelText('Target'), '3000');
    await userEvent.type(within(dialog).getByLabelText('Saved so far'), '500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.saveGoal).toHaveBeenCalledWith({
      name: 'Rainy day',
      kind: 'emergency',
      target: 3_000_00,
      current: 500_00,
      deadline: null,
    });
  });
});

describe('Debts', () => {
  it('shows the cards and loans with Add card and Add loan, and none of the goals', () => {
    renderDebts();
    expect(screen.getByRole('heading', { level: 1, name: 'Debts' })).toBeInTheDocument();
    for (const name of ['Add card', 'Add loan']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Visa', 'Car loan']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText('New bike')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add goal' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Goals' })).toBeNull();
  });

  it('says so when there are no cards or loans, and still offers to add them', () => {
    renderDebts(emptySnapshot());
    expect(screen.getByText('No cards or loans')).toBeInTheDocument();
    for (const name of ['Add card', 'Add loan']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows card use and due day, and a loan payoff bar', () => {
    renderDebts();
    expect(row('Visa').getByText('23% of limit · Due on the 21st')).toBeInTheDocument();
    expect(row('Visa').getByText(usd(230_00))).toBeInTheDocument();
    expect(row('Car loan').getByRole('progressbar', { name: 'Car loan paid off' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
  });

  it('pays the card balance from cash by default', async () => {
    renderDebts();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Visa' });
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('230.00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
    expect(actions.payDebt).toHaveBeenCalledWith('card-1', 230_00, 'cash', TODAY);
  });

  it('explains when a card with history cannot be deleted', async () => {
    actions.deleteDebt.mockRejectedValueOnce(new Error(HISTORY));
    renderDebts();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Edit Visa' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit card' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteDebt).toHaveBeenCalledWith('card-1');
    expect(await screen.findByText(HISTORY)).toBeInTheDocument();
  });
});

describe('with amounts hidden', () => {
  afterEach(() => useAmountsHidden.setState({ hidden: false }));

  it('hides the goal rows but not what a form is editing', async () => {
    useAmountsHidden.setState({ hidden: true });
    renderGoals();
    expect(row('New bike').getByText('•••• of ••••')).toBeInTheDocument();

    await userEvent.click(row('New bike').getByRole('button', { name: 'Edit New bike' }));
    const goal = screen.getByRole('dialog', { name: 'Edit goal' });
    expect(within(goal).getByLabelText('Target')).toHaveValue('1,200.00');
    expect(within(goal).getByLabelText('Saved so far')).toHaveValue('450.00');
  });

  it('hides the debt rows but not what a form is paying', async () => {
    useAmountsHidden.setState({ hidden: true });
    renderDebts();
    expect(row('Visa').getByText('••••')).toBeInTheDocument();

    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const pay = screen.getByRole('dialog', { name: 'Pay Visa' });
    expect(within(pay).getByLabelText('Amount')).toHaveValue('230.00');
  });
});

describe('the goal and debt dialogs in the line style', () => {
  const LINE = ['border-b', 'font-extrabold'];
  const lineFields = (dialog: HTMLElement, labels: string[]) => {
    for (const label of labels) {
      expect(within(dialog).getByLabelText(label), label).toHaveClass(...LINE);
      expect(within(dialog).getByLabelText(label), label).not.toHaveClass('rounded-md');
    }
  };

  it('has line fields and underline tabs for a goal', async () => {
    renderGoals();
    await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a goal' });
    lineFields(dialog, ['Name', 'Target', 'Saved so far', 'Deadline']);
    expect(within(dialog).getByText('Savings')).toHaveClass('border-b-2', 'border-text');
    expect(within(dialog).getByText('Emergency fund')).toHaveClass('border-transparent');
  });

  it('has line fields and a line select for a card', async () => {
    renderDebts();
    await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a card' });
    lineFields(dialog, [
      'Name',
      'Current balance',
      'Interest rate %',
      'Minimum payment',
      'Credit limit',
      'Due day',
    ]);
  });

  it('has line fields for a loan', async () => {
    renderDebts();
    await userEvent.click(screen.getByRole('button', { name: 'Add loan' }));
    lineFields(screen.getByRole('dialog', { name: 'Add a loan' }), [
      'Name',
      'Current balance',
      'Interest rate %',
      'Minimum payment',
    ]);
  });

  it('has a line amount when adding to a goal', async () => {
    renderGoals();
    await userEvent.click(row('New bike').getByRole('button', { name: 'Add money' }));
    lineFields(screen.getByRole('dialog', { name: 'Add to goal' }), ['Amount']);
  });

  it('has a line amount and underline tabs when paying a card', async () => {
    renderDebts();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Visa' });
    lineFields(dialog, ['Amount']);
    expect(within(dialog).getByText('Cash')).toHaveClass('border-b-2', 'border-text');
    expect(within(dialog).getByText('Savings')).toHaveClass('border-transparent');
  });
});
