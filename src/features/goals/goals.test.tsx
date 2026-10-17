import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { formatDate } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDebt, makeGoal, makeProfile, makeTransaction } from '@/test/fixtures';
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

function renderGoals() {
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
  renderWithStore(
    <MemoryRouter>
      <GoalsScreen />
      <Toaster />
    </MemoryRouter>,
    createStubStore({ data, today: TODAY }),
  );
}

const row = (name: string) => {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`no row for ${name}`);
  return within(item);
};

describe('Goals', () => {
  it('shows progress and what to save each month to make the deadline', () => {
    renderGoals();
    expect(screen.getByRole('heading', { level: 1, name: 'Goals & debts' })).toBeInTheDocument();
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
  it('shows card use and due day, and a loan payoff bar', () => {
    renderGoals();
    expect(row('Visa').getByText('23% of limit · Due on the 21st')).toBeInTheDocument();
    expect(row('Visa').getByText(usd(230_00))).toBeInTheDocument();
    expect(row('Car loan').getByRole('progressbar', { name: 'Car loan paid off' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
  });

  it('pays the card balance from cash by default', async () => {
    renderGoals();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Visa' });
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('230.00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
    expect(actions.payDebt).toHaveBeenCalledWith('card-1', 230_00, 'cash', TODAY);
  });

  it('explains when a card with history cannot be deleted', async () => {
    actions.deleteDebt.mockRejectedValueOnce(new Error(HISTORY));
    renderGoals();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Edit Visa' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit card' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(actions.deleteDebt).toHaveBeenCalledWith('card-1');
    expect(await screen.findByText(HISTORY)).toBeInTheDocument();
  });
});

describe('with amounts hidden', () => {
  afterEach(() => useAmountsHidden.setState({ hidden: false }));

  it('hides the rows but not what a form is editing', async () => {
    useAmountsHidden.setState({ hidden: true });
    renderGoals();
    expect(row('New bike').getByText('•••• of ••••')).toBeInTheDocument();
    expect(row('Visa').getByText('••••')).toBeInTheDocument();

    await userEvent.click(row('New bike').getByRole('button', { name: 'Edit New bike' }));
    const goal = screen.getByRole('dialog', { name: 'Edit goal' });
    expect(within(goal).getByLabelText('Target')).toHaveValue('1,200.00');
    expect(within(goal).getByLabelText('Saved so far')).toHaveValue('450.00');
    await userEvent.click(within(goal).getByRole('button', { name: 'Cancel' }));

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
    renderGoals();
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
    renderGoals();
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
    renderGoals();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Visa' });
    lineFields(dialog, ['Amount']);
    expect(within(dialog).getByText('Cash')).toHaveClass('border-b-2', 'border-text');
    expect(within(dialog).getByText('Savings')).toHaveClass('border-transparent');
  });
});
