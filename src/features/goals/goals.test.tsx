import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import type { Account, CreditTerms } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDate } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  makeAccount,
  makeDebt,
  makeExpense,
  makeGoal,
  makeProfile,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { DebtsScreen } from './DebtsScreen';
import { GoalsScreen } from './GoalsScreen';

const actions = vi.hoisted(() => ({
  saveGoal: vi.fn(async () => ({})),
  deleteGoal: vi.fn(async () => {}),
  contributeToGoal: vi.fn(async () => {}),
  saveAccount: vi.fn(async () => ({})),
  deleteAccount: vi.fn(async () => 'deleted' as const),
  payCard: vi.fn(async () => {}),
  saveDebt: vi.fn(async () => ({})),
  deleteDebt: vi.fn(async () => {}),
  payDebt: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => actions,
}));

const TODAY = '2026-10-14';
const MAIN = 'acct-main';
const SAVINGS = 'acct-savings';
const VISA = 'card-1';
const usd = (minor: number) => formatMoney(minor, 'USD');

/**
 * The toast, once it is there. It floats inside the open dialog and moves out to the page when the
 * dialog closes, so wait for an element that is still in the page rather than holding one.
 */
const toasted = (text: string) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());

beforeEach(() => {
  toastStore.setState({ toasts: [] });
  Object.values(actions).forEach((a) => a.mockClear());
});

const terms = (over: Partial<CreditTerms> = {}): CreditTerms => ({
  limit: 1_000_00,
  statementDay: null,
  dueDay: 21,
  payInFull: true,
  minimumPayment: 0,
  interestRate: 0,
  ...over,
});

/** Main account: a debit account with 10,000.00 on it. */
const mainAccount = () =>
  makeAccount({ id: MAIN, openingDate: '2026-10-01', openingBalance: 10_000_00 });
/** Savings, with 5,000.00, which does not count in Available. */
const savingsAccount = () =>
  makeAccount({
    id: SAVINGS,
    name: 'Savings',
    kind: 'savings',
    skin: 'mint',
    inAvailable: false,
    order: 1,
    openingDate: '2026-10-01',
    openingBalance: 5_000_00,
  });
/** A credit card with 230.00 owed, due on the 21st, paid in full. */
const visaCard = (over: Partial<Account> = {}, credit: Partial<CreditTerms> = {}) =>
  makeAccount({
    id: VISA,
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    order: 2,
    openingDate: '2026-10-01',
    openingBalance: 230_00,
    credit: terms(credit),
    ...over,
  });

/** A goal, a card, a loan and the accounts that pay for them: each page shows its own only. */
function filledData(card: Account = visaCard()): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ openingDate: '2026-10-01' }));
  data.tables.account.push(mainAccount(), savingsAccount(), card);
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
      id: 'loan-1',
      name: 'Car loan',
      openingDate: '2026-10-01',
      openingBalance: 10_000_00,
      minimumPayment: 250_00,
    }),
  );
  data.tables.transaction.push(
    makeTransaction({
      type: 'debt_payment',
      amount: 2_500_00,
      date: '2026-10-05',
      fromAccountId: MAIN,
      toAccountId: null,
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
const optionsOf = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);

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

  async function openAddMoney() {
    await userEvent.click(row('New bike').getByRole('button', { name: 'Add money' }));
    return screen.getByRole('dialog', { name: 'Add to goal' });
  }

  it('moves the money from Main account to Savings by default', async () => {
    renderGoals();
    const dialog = await openAddMoney();
    expect(within(dialog).getByLabelText('From')).toHaveValue(MAIN);
    expect(within(dialog).getByLabelText('To')).toHaveValue(SAVINGS);
    await userEvent.type(within(dialog).getByLabelText('Amount'), '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(actions.contributeToGoal).toHaveBeenCalledWith('g1', 50_00, TODAY, MAIN, SAVINGS);
  });

  it('offers the accounts that can pay, never a credit card', async () => {
    renderGoals();
    const dialog = await openAddMoney();
    for (const label of ['From', 'To']) {
      expect(optionsOf(within(dialog).getByLabelText(label))).toEqual(['Main account', 'Savings']);
    }
  });

  it('moves it between the accounts that were picked', async () => {
    renderGoals();
    const dialog = await openAddMoney();
    await userEvent.selectOptions(within(dialog).getByLabelText('From'), 'Savings');
    await userEvent.selectOptions(within(dialog).getByLabelText('To'), 'Main account');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(actions.contributeToGoal).toHaveBeenCalledWith('g1', 20_00, TODAY, SAVINGS, MAIN);
  });

  it('refuses the same account on both sides, saying so by the field', async () => {
    renderGoals();
    const dialog = await openAddMoney();
    await userEvent.selectOptions(within(dialog).getByLabelText('To'), 'Main account');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    const to = within(dialog).getByLabelText('To');
    expect(to).toBeInvalid();
    expect(to).toHaveAccessibleDescription('Use two different accounts.');
    expect(actions.contributeToGoal).not.toHaveBeenCalled();

    // Picking again clears it.
    await userEvent.selectOptions(to, 'Savings');
    expect(to).toBeValid();
  });

  it('asks for an amount, saying so by the field', async () => {
    renderGoals();
    const dialog = await openAddMoney();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    const amount = within(dialog).getByLabelText('Amount');
    expect(amount).toBeInvalid();
    expect(amount).toHaveAccessibleDescription(/Enter an amount like 12\.50/);
    expect(actions.contributeToGoal).not.toHaveBeenCalled();
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
  it('lists the cards from accounts and the loans from debts, with Add card and Add loan', () => {
    renderDebts();
    expect(screen.getByRole('heading', { level: 1, name: 'Debts' })).toBeInTheDocument();
    for (const name of ['Add card', 'Add loan']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Visa', 'Car loan']) expect(screen.getByText(name)).toBeInTheDocument();
    // A bank account or savings is not a debt, and neither is a goal.
    for (const gone of ['Main account', 'Savings', 'New bike']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Add goal' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Goals' })).toBeNull();
  });

  it('lists the cards by name, then the loans', () => {
    const data = filledData();
    data.tables.account.push(visaCard({ id: 'card-2', name: 'Amex', order: 3 }));
    data.tables.debt.push(makeDebt({ id: 'loan-0', name: 'Bike loan', openingBalance: 300_00 }));
    renderDebts(data);
    const edits = screen.getAllByRole('listitem').map((li) =>
      within(li)
        .getByRole('button', { name: /^Edit / })
        .getAttribute('aria-label'),
    );
    expect(edits).toEqual(['Edit Amex', 'Edit Visa', 'Edit Bike loan', 'Edit Car loan']);
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
    expect(row('Car loan').getByText(usd(7_500_00))).toBeInTheDocument();
    expect(row('Car loan').getByRole('progressbar', { name: 'Car loan paid off' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
  });

  it('has no row for an archived card, and no row for an archived loan', () => {
    const data = filledData(visaCard({ archivedOn: TODAY }));
    data.tables.debt[0]!.archivedOn = TODAY;
    renderDebts(data);
    expect(screen.queryByText('Visa')).toBeNull();
    expect(screen.queryByText('Car loan')).toBeNull();
    expect(screen.getByText('No cards or loans')).toBeInTheDocument();
  });

  describe('paying a card', () => {
    async function openPay(data?: DataSnapshot) {
      renderDebts(data);
      await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
      return screen.getByRole('dialog', { name: 'Pay Visa' });
    }

    it('pays the card balance from Main account by default', async () => {
      const dialog = await openPay();
      expect(within(dialog).getByLabelText('Amount')).toHaveValue('230.00');
      expect(within(dialog).getByLabelText('From')).toHaveValue(MAIN);
      expect(optionsOf(within(dialog).getByLabelText('From'))).toEqual(['Main account', 'Savings']);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
      expect(actions.payCard).toHaveBeenCalledWith(VISA, MAIN, 230_00, TODAY);
      await toasted(`Paid ${usd(230_00)} toward Visa.`);
    });

    it('pays it from the account that was picked', async () => {
      const dialog = await openPay();
      await userEvent.selectOptions(within(dialog).getByLabelText('From'), 'Savings');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
      expect(actions.payCard).toHaveBeenCalledWith(VISA, SAVINGS, 230_00, TODAY);
    });

    it('refuses more than is owed, saying so by the field', async () => {
      const dialog = await openPay();
      const amount = within(dialog).getByLabelText('Amount');
      await userEvent.clear(amount);
      await userEvent.type(amount, '300');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
      expect(amount).toBeInvalid();
      expect(amount).toHaveAccessibleDescription(
        new RegExp(`That's more than the ${usd(230_00).replace('$', '\\$')} you owe`),
      );
      expect(actions.payCard).not.toHaveBeenCalled();
    });

    it('suggests the minimum for a card that is not paid in full, as its sheet says', async () => {
      const dialog = await openPay(
        filledData(visaCard({}, { payInFull: false, minimumPayment: 25_00 })),
      );
      expect(within(dialog).getByLabelText('Amount')).toHaveValue('25.00');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
      expect(actions.payCard).toHaveBeenCalledWith(VISA, MAIN, 25_00, TODAY);
    });

    it.each([
      [10_00, '15.00'],
      [25_00, ''],
    ])(
      'suggests what is left of the minimum after %d of it is paid: "%s"',
      async (amount, suggested) => {
        const data = filledData(visaCard({}, { payInFull: false, minimumPayment: 25_00 }));
        data.tables.transaction.push(
          makeTransaction({
            type: 'card_payment',
            amount,
            date: TODAY,
            fromAccountId: MAIN,
            toAccountId: VISA,
          }),
        );
        const dialog = await openPay(data);
        expect(within(dialog).getByLabelText('Amount')).toHaveValue(suggested);
      },
    );
  });

  describe('paying a loan', () => {
    async function openPay() {
      renderDebts();
      await userEvent.click(row('Car loan').getByRole('button', { name: 'Make a payment' }));
      return screen.getByRole('dialog', { name: 'Pay Car loan' });
    }

    it('suggests a loan its minimum, as it always has, from Main account', async () => {
      const dialog = await openPay();
      expect(within(dialog).getByLabelText('Amount')).toHaveValue('250.00');
      expect(within(dialog).getByLabelText('From')).toHaveValue(MAIN);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
      expect(actions.payDebt).toHaveBeenCalledWith('loan-1', MAIN, 250_00, TODAY);
    });

    it('pays it from Savings when asked', async () => {
      const dialog = await openPay();
      await userEvent.selectOptions(within(dialog).getByLabelText('From'), 'Savings');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
      expect(actions.payDebt).toHaveBeenCalledWith('loan-1', SAVINGS, 250_00, TODAY);
    });
  });

  describe('adding and editing a card', () => {
    it('saves a new card as a credit account with exactly what was entered', async () => {
      renderDebts();
      await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
      const dialog = screen.getByRole('dialog', { name: 'Add a card' });
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Amex');
      await userEvent.type(within(dialog).getByLabelText('Current balance'), '100');
      await userEvent.type(within(dialog).getByLabelText('Interest rate %'), '19.9');
      await userEvent.type(within(dialog).getByLabelText('Minimum payment'), '25');
      await userEvent.type(within(dialog).getByLabelText('Credit limit'), '2000');
      await userEvent.selectOptions(within(dialog).getByLabelText('Due day'), '12');
      await userEvent.click(within(dialog).getByRole('switch', { name: 'Pay in full each month' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(actions.saveAccount).toHaveBeenCalledWith({
        name: 'Amex',
        kind: 'credit',
        last4: null,
        openingBalance: 100_00,
        credit: {
          limit: 2_000_00,
          statementDay: null,
          dueDay: 12,
          payInFull: false,
          minimumPayment: 25_00,
          interestRate: 19.9,
        },
      });
      await toasted('Card added.');
      expect(screen.queryByRole('dialog', { name: 'Add a card' })).toBeNull();
    });

    it('edits a card in place, keeping what the form does not show', async () => {
      const card = visaCard({ last4: '4242' }, { statementDay: 3, interestRate: 21.5 });
      renderDebts(filledData(card));
      await userEvent.click(row('Visa').getByRole('button', { name: 'Edit Visa' }));
      const dialog = screen.getByRole('dialog', { name: 'Edit card' });
      expect(within(dialog).getByLabelText('Name')).toHaveValue('Visa');
      expect(within(dialog).getByLabelText('Balance when added')).toHaveValue('230.00');
      expect(within(dialog).getByLabelText('Balance when added')).toHaveAccessibleDescription(
        `On ${formatDate('2026-10-01')}. Purchases and payments since then are added on top.`,
      );
      expect(within(dialog).getByLabelText('Interest rate %')).toHaveValue('21.5');
      expect(within(dialog).getByLabelText('Credit limit')).toHaveValue('1,000.00');
      expect(within(dialog).getByLabelText('Due day')).toHaveValue('21');
      expect(within(dialog).getByRole('switch', { name: 'Pay in full each month' })).toBeChecked();

      await userEvent.clear(within(dialog).getByLabelText('Name'));
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Visa Gold');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(actions.saveAccount).toHaveBeenCalledWith({
        id: VISA,
        name: 'Visa Gold',
        kind: 'credit',
        last4: '4242',
        openingBalance: 230_00,
        credit: {
          limit: 1_000_00,
          statementDay: 3,
          dueDay: 21,
          payInFull: true,
          minimumPayment: 0,
          interestRate: 21.5,
        },
      });
      await toasted('Saved.');
    });

    it('says what is missing by each field, and saves nothing', async () => {
      renderDebts();
      await userEvent.click(screen.getByRole('button', { name: 'Add card' }));
      const dialog = screen.getByRole('dialog', { name: 'Add a card' });
      await userEvent.type(within(dialog).getByLabelText('Interest rate %'), 'abc');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      const name = within(dialog).getByLabelText('Name');
      expect(name).toBeInvalid();
      expect(name).toHaveAccessibleDescription('Give it a name.');
      const balance = within(dialog).getByLabelText('Current balance');
      expect(balance).toBeInvalid();
      expect(balance).toHaveAccessibleDescription('Enter an amount like 12.50');
      const rate = within(dialog).getByLabelText('Interest rate %');
      expect(rate).toBeInvalid();
      expect(rate).toHaveAccessibleDescription('Enter a rate like 19.9');
      expect(actions.saveAccount).not.toHaveBeenCalled();
    });
  });

  describe('deleting a card', () => {
    async function deleteVisa(data: DataSnapshot) {
      renderDebts(data);
      await userEvent.click(row('Visa').getByRole('button', { name: 'Edit Visa' }));
      const edit = screen.getByRole('dialog', { name: 'Edit card' });
      await userEvent.click(within(edit).getByRole('button', { name: 'Delete' }));
    }

    /** Two subscriptions on the card and one on Main account. */
    function withSubscriptions(data: DataSnapshot) {
      data.tables.subscription.push(
        makeSubscription({ id: 's1', accountId: VISA, nextRenewal: '2026-11-05' }),
        makeSubscription({ id: 's2', accountId: VISA, nextRenewal: '2026-11-06' }),
        makeSubscription({ id: 's3', accountId: MAIN, nextRenewal: '2026-11-07' }),
      );
      return data;
    }

    it('asks before deleting a card with nothing on it, and deletes it', async () => {
      await deleteVisa(filledData());
      expect(actions.deleteAccount).not.toHaveBeenCalled();
      const ask = screen.getByRole('dialog', { name: 'Delete Visa?' });
      expect(ask).toHaveAccessibleDescription('Visa will be deleted.');
      expect(within(ask).queryByLabelText('Move its subscriptions to')).toBeNull();
      await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
      expect(actions.deleteAccount).toHaveBeenCalledWith(VISA, { moveSubscriptionsTo: null });
      await toasted('Visa deleted.');
      expect(screen.queryByRole('dialog', { name: 'Edit card' })).toBeNull();
    });

    it('asks where its subscriptions go, starting on Main account', async () => {
      await deleteVisa(withSubscriptions(filledData()));
      const ask = screen.getByRole('dialog', { name: 'Delete Visa?' });
      expect(ask).toHaveAccessibleDescription(
        'Visa will be deleted. 2 subscriptions paid with it move to the account you pick below.',
      );
      const move = within(ask).getByLabelText('Move its subscriptions to');
      expect(move).toHaveValue(MAIN);
      // The card itself is not a place to move them.
      expect(optionsOf(move)).toEqual(['Main account', 'Savings']);
      await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
      expect(actions.deleteAccount).toHaveBeenCalledWith(VISA, { moveSubscriptionsTo: MAIN });
    });

    it('moves them to the account that was picked', async () => {
      await deleteVisa(withSubscriptions(filledData()));
      const ask = screen.getByRole('dialog', { name: 'Delete Visa?' });
      await userEvent.selectOptions(
        within(ask).getByLabelText('Move its subscriptions to'),
        'Savings',
      );
      await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
      expect(actions.deleteAccount).toHaveBeenCalledWith(VISA, { moveSubscriptionsTo: SAVINGS });
    });

    it('has nowhere to move them to when no other account is left, and says so by the field', async () => {
      const data = filledData();
      data.tables.account = [visaCard()];
      data.tables.subscription.push(
        makeSubscription({ id: 's1', accountId: VISA, nextRenewal: '2026-11-05' }),
      );
      await deleteVisa(data);
      const ask = screen.getByRole('dialog', { name: 'Delete Visa?' });
      await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
      const move = within(ask).getByLabelText('Move its subscriptions to');
      expect(move).toBeInvalid();
      expect(move).toHaveAccessibleDescription('Pick where its subscriptions go.');
      expect(actions.deleteAccount).not.toHaveBeenCalled();
    });

    it('says a card with history is archived, and that what it owes stops counting', async () => {
      const data = filledData();
      data.tables.subscription.push(
        makeSubscription({ id: 's1', accountId: VISA, nextRenewal: '2026-11-05' }),
      );
      data.tables.expense.push(makeExpense({ amount: 20_00, accountId: VISA, date: TODAY }));
      await deleteVisa(data);
      const ask = screen.getByRole('dialog', { name: 'Archive Visa?' });
      expect(ask).toHaveAccessibleDescription(
        `Visa has past expenses or payments, so it is archived: it leaves Debts, bills and "Paid with", and past expenses keep its name. The ${usd(250_00)} still owed on it stops counting toward what you owe. 1 subscription paid with it moves to the account you pick below.`,
      );
      await userEvent.click(within(ask).getByRole('button', { name: 'Archive' }));
      expect(actions.deleteAccount).toHaveBeenCalledWith(VISA, { moveSubscriptionsTo: MAIN });
      await toasted('Visa archived.');
    });

    it('keeps the card when the ask is cancelled', async () => {
      await deleteVisa(filledData());
      const ask = screen.getByRole('dialog', { name: 'Delete Visa?' });
      await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
      expect(actions.deleteAccount).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Delete Visa?' })).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Edit card' })).toBeInTheDocument();
    });
  });

  describe('adding, editing and deleting a loan', () => {
    it('saves a new loan as a debt with exactly what was entered', async () => {
      renderDebts();
      await userEvent.click(screen.getByRole('button', { name: 'Add loan' }));
      const dialog = screen.getByRole('dialog', { name: 'Add a loan' });
      expect(within(dialog).queryByLabelText('Credit limit')).toBeNull();
      expect(within(dialog).queryByLabelText('Due day')).toBeNull();
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Bike loan');
      await userEvent.type(within(dialog).getByLabelText('Current balance'), '800');
      await userEvent.type(within(dialog).getByLabelText('Interest rate %'), '4.5');
      await userEvent.type(within(dialog).getByLabelText('Minimum payment'), '40');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(actions.saveDebt).toHaveBeenCalledWith({
        name: 'Bike loan',
        openingBalance: 800_00,
        interestRate: 4.5,
        minimumPayment: 40_00,
        creditLimit: null,
        statementDay: null,
        dueDay: null,
        payInFull: false,
      });
      await toasted('Loan added.');
    });

    it('edits a loan in place', async () => {
      renderDebts();
      await userEvent.click(row('Car loan').getByRole('button', { name: 'Edit Car loan' }));
      const dialog = screen.getByRole('dialog', { name: 'Edit loan' });
      expect(within(dialog).getByLabelText('Balance when added')).toHaveValue('10,000.00');
      await userEvent.clear(within(dialog).getByLabelText('Name'));
      await userEvent.type(within(dialog).getByLabelText('Name'), 'Auto loan');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(actions.saveDebt).toHaveBeenCalledWith({
        id: 'loan-1',
        name: 'Auto loan',
        openingBalance: 10_000_00,
        interestRate: 6.5,
        minimumPayment: 250_00,
        creditLimit: null,
        statementDay: null,
        dueDay: null,
        payInFull: false,
      });
    });

    async function deleteCarLoan(data?: DataSnapshot) {
      renderDebts(data);
      await userEvent.click(row('Car loan').getByRole('button', { name: 'Edit Car loan' }));
      const edit = screen.getByRole('dialog', { name: 'Edit loan' });
      await userEvent.click(within(edit).getByRole('button', { name: 'Delete' }));
    }

    it('archives a loan that has payments, and says what it still owes', async () => {
      await deleteCarLoan();
      const ask = screen.getByRole('dialog', { name: 'Archive Car loan?' });
      expect(ask).toHaveAccessibleDescription(
        `Car loan has payments made to it, so it is archived: it leaves Debts, and those payments keep its name. The ${usd(7_500_00)} still owed on it stops counting toward what you owe.`,
      );
      await userEvent.click(within(ask).getByRole('button', { name: 'Archive' }));
      expect(actions.deleteDebt).toHaveBeenCalledWith('loan-1');
      await toasted('Car loan archived.');
    });

    it('deletes a loan with no payments', async () => {
      const data = filledData();
      data.tables.transaction = [];
      await deleteCarLoan(data);
      const ask = screen.getByRole('dialog', { name: 'Delete Car loan?' });
      expect(ask).toHaveAccessibleDescription('Car loan will be deleted.');
      await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
      expect(actions.deleteDebt).toHaveBeenCalledWith('loan-1');
      await toasted('Car loan deleted.');
    });
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

describe('the Goals and Debts headers', () => {
  /** A page inside a router that has the places Back can go to. */
  function renderRouted(page: ReactElement, path: string, entries: string[], index?: number) {
    renderWithStore(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route path={path} element={page} />
          <Route path="/budget" element={<p>The Spending page</p>} />
          <Route path="/cards" element={<p>The Cards page</p>} />
          <Route path="/profile" element={<p>The Profile page</p>} />
          <Route path="/" element={<p>The Home page</p>} />
        </Routes>
      </MemoryRouter>,
      createStubStore({ data: filledData(), today: TODAY }),
    );
  }

  it.each([
    ['Goals', renderGoals],
    ['Debts', renderDebts],
  ])('has a round Back button before the %s title', (title, render) => {
    render();
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveClass('glass', 'rounded-full', 'size-11');
    const heading = screen.getByRole('heading', { level: 1, name: title });
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('goes back to the screen Goals was opened from', async () => {
    renderRouted(<GoalsScreen />, '/goals', ['/profile', '/goals'], 1);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('The Profile page')).toBeInTheDocument();
  });

  it('goes to Spending, which lists the goals, when Goals was the first screen', async () => {
    renderRouted(<GoalsScreen />, '/goals', ['/goals']);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('The Spending page')).toBeInTheDocument();
  });

  it('goes back to the screen Debts was opened from', async () => {
    renderRouted(<DebtsScreen />, '/debts', ['/profile', '/debts'], 1);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('The Profile page')).toBeInTheDocument();
  });

  it('goes to Cards, which lists the loans, when Debts was the first screen', async () => {
    renderRouted(<DebtsScreen />, '/debts', ['/debts']);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('The Cards page')).toBeInTheDocument();
  });
});

describe('Goals and Debts in glass', () => {
  const expectPlainList = (list: Element | null) => {
    expect(list).toHaveClass('divide-y', 'divide-black/7', 'dark:divide-white/8');
    expect(list).not.toHaveClass('divide-border');
  };

  /** An Edit button is a round glass icon: 44px, a pencil, no words. */
  const expectEditIcon = (button: HTMLElement) => {
    expect(button).toHaveClass('glass', 'rounded-full', 'size-11');
    expect(button).not.toHaveClass('px-4');
    expect(button).toHaveTextContent('');
    expect(button.querySelector('svg.lucide-pencil')).toHaveAttribute('aria-hidden', 'true');
  };

  it('draws the goals as plain rows, each with a glass chip and its progress bar', () => {
    renderGoals();
    expectPlainList(screen.getByRole('list'));
    const item = screen.getByText('New bike').closest('li')!;
    expect(
      item.querySelector('.glass.size-\\[38px\\].rounded-full svg.lucide-target'),
    ).toBeTruthy();
    expect(row('New bike').getByRole('progressbar', { name: 'New bike' })).toHaveClass('bg-track');
  });

  it('gives a goal a glass Add money pill and a round pencil for Edit', () => {
    renderGoals();
    const bike = row('New bike');
    const add = bike.getByRole('button', { name: 'Add money' });
    const edit = bike.getByRole('button', { name: 'Edit New bike' });
    expect(add).toHaveClass('glass', 'rounded-full', 'h-11', 'px-4');
    expectEditIcon(edit);
    // The pill is the main action, first; the pencil is beside it.
    expect(add.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.parentElement).toBe(edit.parentElement);
  });

  it('draws the cards and loans as plain rows with a chip, a pill to pay and a round pencil', () => {
    renderDebts();
    expectPlainList(screen.getByRole('list'));
    const visa = screen.getByText('Visa').closest('li')!;
    const loan = screen.getByText('Car loan').closest('li')!;
    expect(visa.querySelector('.glass.size-\\[38px\\] svg.lucide-credit-card')).toBeTruthy();
    expect(loan.querySelector('.glass.size-\\[38px\\] svg.lucide-car')).toBeTruthy();
    for (const [name, pay] of [
      ['Visa', 'Pay card'],
      ['Car loan', 'Make a payment'],
    ] as const) {
      expect(row(name).getByRole('button', { name: pay })).toHaveClass('glass', 'h-11', 'px-4');
      expectEditIcon(row(name).getByRole('button', { name: `Edit ${name}` }));
    }
  });

  it('keeps the pay pill off for a card with nothing owed, and Edit on', () => {
    renderDebts(filledData(visaCard({ openingBalance: 0 })));
    expect(row('Visa').getByRole('button', { name: 'Pay card' })).toBeDisabled();
    expect(row('Visa').getByRole('button', { name: 'Edit Visa' })).toBeEnabled();
  });
});

describe('the goal and debt dialogs in glass', () => {
  /** A `row` field: the label on the left, the value on the right, a hairline under it. */
  const rowFields = (dialog: HTMLElement, labels: string[]) => {
    for (const label of labels) {
      const field = within(dialog).getByLabelText(label);
      expect(field, label).toHaveClass('text-right', 'h-11');
      expect(field, label).not.toHaveClass('rounded-md', 'border', 'border-b', 'font-extrabold');
      expect(field.closest('.border-b'), label).toHaveClass(
        'border-black/7',
        'dark:border-white/8',
      );
    }
  };
  /** A `hero` amount: 40px bold, no box. */
  const heroAmount = (dialog: HTMLElement) =>
    expect(within(dialog).getByLabelText('Amount')).toHaveClass('text-[40px]', 'font-bold');

  it('has row fields and kind pills for a goal', async () => {
    renderGoals();
    await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a goal' });
    rowFields(dialog, ['Name', 'Target', 'Saved so far', 'Deadline']);
    // Kind is three short choices: pills, the chosen one solid, still radios.
    expect(within(dialog).getByText('Savings')).toHaveClass(
      'bg-primary',
      'text-primary-contrast',
      'h-8',
    );
    expect(within(dialog).getByText('Emergency fund')).toHaveClass('glass', 'rounded-full');
    expect(within(dialog).getByText('Emergency fund')).not.toHaveClass('bg-primary');
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3);
  });

  it('has the same rows when editing a goal, with Delete in danger', async () => {
    renderGoals();
    await userEvent.click(row('New bike').getByRole('button', { name: 'Edit New bike' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit goal' });
    rowFields(dialog, ['Name', 'Target', 'Saved so far', 'Deadline']);
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('text-danger');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveClass('bg-primary');
  });

  it('has a hero amount and row selects when adding to a goal', async () => {
    renderGoals();
    await userEvent.click(row('New bike').getByRole('button', { name: 'Add money' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to goal' });
    heroAmount(dialog);
    rowFields(dialog, ['From', 'To']);
    expect(within(dialog).getByRole('button', { name: 'Add' })).toHaveClass('bg-primary');
  });

  it('has a hero amount and a row select when paying a card', async () => {
    renderDebts();
    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Visa' });
    heroAmount(dialog);
    rowFields(dialog, ['From']);
    expect(within(dialog).getByLabelText('Amount')).toHaveAccessibleDescription(
      `You owe ${usd(230_00)}.`,
    );
  });

  it('has a hero amount and a row select when paying a loan', async () => {
    renderDebts();
    await userEvent.click(row('Car loan').getByRole('button', { name: 'Make a payment' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Car loan' });
    heroAmount(dialog);
    rowFields(dialog, ['From']);
  });

  it('has row fields for a loan', async () => {
    renderDebts();
    await userEvent.click(screen.getByRole('button', { name: 'Add loan' }));
    rowFields(screen.getByRole('dialog', { name: 'Add a loan' }), [
      'Name',
      'Current balance',
      'Interest rate %',
      'Minimum payment',
    ]);
  });

  it('has row fields for a loan being edited, with Delete in danger', async () => {
    renderDebts();
    await userEvent.click(row('Car loan').getByRole('button', { name: 'Edit Car loan' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit loan' });
    rowFields(dialog, ['Name', 'Balance when added', 'Interest rate %', 'Minimum payment']);
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveClass('text-danger');
  });
});

// A card is an account: its dialogs are `AccountDialog`'s, in the line style until the Cards pass.
describe('the card dialogs in the line style', () => {
  const LINE = ['border-b', 'font-extrabold'];
  const lineFields = (dialog: HTMLElement, labels: string[]) => {
    for (const label of labels) {
      expect(within(dialog).getByLabelText(label), label).toHaveClass(...LINE);
      expect(within(dialog).getByLabelText(label), label).not.toHaveClass('rounded-md');
    }
  };

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

  it('has a line select for where a deleted card sends its subscriptions', async () => {
    const data = filledData();
    data.tables.subscription.push(makeSubscription({ accountId: VISA, nextRenewal: '2026-11-05' }));
    renderDebts(data);
    await userEvent.click(row('Visa').getByRole('button', { name: 'Edit Visa' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit card' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    lineFields(screen.getByRole('dialog', { name: 'Delete Visa?' }), ['Move its subscriptions to']);
  });
});
