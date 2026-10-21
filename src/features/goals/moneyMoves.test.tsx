import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { accountBalance, debtBalance } from '@/domain/balances';
import { formatMoney } from '@/domain/money';
import type { TableRecord } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import type { AppState } from '@/store/appStore';
import { renderWithStore } from '@/test/appStoreStub';
import {
  makeAccount,
  makeDebt,
  makeExpense,
  makeGoal,
  makeProfile,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { DebtsScreen } from './DebtsScreen';
import { GoalsScreen } from './GoalsScreen';

/**
 * What the goals and debts screens really do to the accounts: a real store, no spies. Main account
 * holds 10,000.00 and Savings 5,000.00; the Visa owes 230.00; the Car loan owes 10,000.00.
 */

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

beforeEach(() => toastStore.setState({ toasts: [] }));

type Extra = TableRecord[];

async function setup(extra: Extra = []) {
  const { store } = await freshRealStore();
  await store.getState().putMany([
    { table: 'profile', record: makeProfile({ openingDate: '2026-10-01', salary: null }) },
    {
      table: 'account',
      record: makeAccount({ id: MAIN, openingDate: '2026-10-01', openingBalance: 10_000_00 }),
    },
    {
      table: 'account',
      record: makeAccount({
        id: SAVINGS,
        name: 'Savings',
        kind: 'savings',
        skin: 'mint',
        inAvailable: false,
        order: 1,
        openingDate: '2026-10-01',
        openingBalance: 5_000_00,
      }),
    },
    {
      table: 'account',
      record: makeAccount({
        id: VISA,
        name: 'Visa',
        kind: 'credit',
        skin: 'violet',
        inAvailable: false,
        order: 2,
        openingDate: '2026-10-01',
        openingBalance: 230_00,
        credit: {
          limit: 1_000_00,
          statementDay: null,
          dueDay: 21,
          payInFull: true,
          minimumPayment: 0,
          interestRate: 0,
        },
      }),
    },
    {
      table: 'debt',
      record: makeDebt({
        id: 'loan-1',
        name: 'Car loan',
        openingDate: '2026-10-01',
        openingBalance: 10_000_00,
        minimumPayment: 250_00,
      }),
    },
    {
      table: 'goal',
      record: makeGoal({ id: 'g1', name: 'New bike', target: 1_200_00, current: 450_00 }),
    },
    ...extra,
  ]);
  return store;
}

function show(page: ReactElement, store: StoreApi<AppState>) {
  renderWithStore(
    <MemoryRouter>
      {page}
      <Toaster />
    </MemoryRouter>,
    store,
  );
}

/** What an account holds, or for a credit card what is owed on it. */
const held = (store: StoreApi<AppState>, id: string) => {
  const data = store.getState().data;
  return accountBalance(
    data.tables.account.find((a) => a.id === id)!,
    data,
    TODAY,
  );
};

const row = (name: string) => {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`no row for ${name}`);
  return within(item);
};

describe('adding money to a goal', () => {
  it('moves Main account to Savings by default, and counts toward the goal', async () => {
    const store = await setup();
    show(<GoalsScreen />, store);
    await userEvent.click(row('New bike').getByRole('button', { name: 'Add money' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to goal' });
    await userEvent.type(within(dialog).getByLabelText('Amount'), '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await toasted('Added to New bike.');
    expect(held(store, MAIN)).toBe(9_950_00);
    expect(held(store, SAVINGS)).toBe(5_050_00);
    expect(store.getState().data.tables.goal[0]).toMatchObject({ current: 500_00 });
    expect(store.getState().data.tables.transaction).toEqual([
      expect.objectContaining({
        type: 'transfer',
        amount: 50_00,
        fromAccountId: MAIN,
        toAccountId: SAVINGS,
      }),
    ]);
  });
});

describe('paying a card or a loan', () => {
  it('lowers both the card and Savings when the card is paid from Savings', async () => {
    const store = await setup();
    show(<DebtsScreen />, store);
    await userEvent.click(row('Visa').getByRole('button', { name: 'Pay card' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Visa' });
    await userEvent.selectOptions(within(dialog).getByLabelText('From'), 'Savings');
    const amount = within(dialog).getByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '100');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));

    await toasted(`Paid ${usd(100_00)} toward Visa.`);
    expect(held(store, SAVINGS)).toBe(4_900_00);
    expect(held(store, VISA)).toBe(130_00);
    expect(held(store, MAIN)).toBe(10_000_00);
    // The list follows: 130.00 of the 1,000.00 limit.
    expect(row('Visa').getByText(usd(130_00))).toBeInTheDocument();
    expect(row('Visa').getByText('13% of limit · Due on the 21st')).toBeInTheDocument();
  });

  it('lowers both the loan and the account it was paid from', async () => {
    const store = await setup();
    show(<DebtsScreen />, store);
    await userEvent.click(row('Car loan').getByRole('button', { name: 'Make a payment' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Car loan' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));

    await toasted(`Paid ${usd(250_00)} toward Car loan.`);
    const data = store.getState().data;
    expect(held(store, MAIN)).toBe(9_750_00);
    expect(debtBalance(data.tables.debt[0]!, data, TODAY)).toBe(9_750_00);
  });
});

describe('deleting a card', () => {
  /** Two subscriptions on the card and one on Main account. */
  const subscriptions = (): Extra => [
    {
      table: 'subscription',
      record: makeSubscription({ id: 's1', accountId: VISA, nextRenewal: '2026-11-05' }),
    },
    {
      table: 'subscription',
      record: makeSubscription({ id: 's2', accountId: VISA, nextRenewal: '2026-11-06' }),
    },
    {
      table: 'subscription',
      record: makeSubscription({ id: 's3', accountId: MAIN, nextRenewal: '2026-11-07' }),
    },
  ];

  async function openDelete(store: StoreApi<AppState>) {
    show(<DebtsScreen />, store);
    await userEvent.click(row('Visa').getByRole('button', { name: 'Edit Visa' }));
    const edit = screen.getByRole('dialog', { name: 'Edit card' });
    await userEvent.click(within(edit).getByRole('button', { name: 'Delete' }));
  }

  it('moves the subscriptions to the account that was picked, then removes the card', async () => {
    const store = await setup(subscriptions());
    await openDelete(store);
    const ask = screen.getByRole('dialog', { name: 'Delete Visa?' });
    await userEvent.selectOptions(
      within(ask).getByLabelText('Move its subscriptions to'),
      'Savings',
    );
    await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));

    await toasted('Visa deleted.');
    const { account, subscription } = store.getState().data.tables;
    expect(account.map((a) => a.id)).toEqual([MAIN, SAVINGS]);
    expect(subscription.map((s) => [s.id, s.accountId])).toEqual([
      ['s1', SAVINGS],
      ['s2', SAVINGS],
      ['s3', MAIN],
    ]);
    expect(screen.queryByText('Visa')).toBeNull();
  });

  it('moves them to Main account when nothing else is picked', async () => {
    const store = await setup(subscriptions());
    await openDelete(store);
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete Visa?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await toasted('Visa deleted.');
    expect(store.getState().data.tables.subscription.map((s) => [s.id, s.accountId])).toEqual([
      ['s1', MAIN],
      ['s2', MAIN],
      ['s3', MAIN],
    ]);
  });

  it('archives a card with history: it leaves the list and what it owes stops counting', async () => {
    const store = await setup([
      { table: 'expense', record: makeExpense({ amount: 20_00, accountId: VISA, date: TODAY }) },
      {
        table: 'transaction',
        record: makeTransaction({
          type: 'card_payment',
          amount: 50_00,
          date: TODAY,
          fromAccountId: MAIN,
          toAccountId: VISA,
        }),
      },
    ]);
    await openDelete(store);
    const ask = screen.getByRole('dialog', { name: 'Archive Visa?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Archive' }));

    await toasted('Visa archived.');
    expect(store.getState().data.tables.account.find((a) => a.id === VISA)).toMatchObject({
      archivedOn: TODAY,
    });
    await waitFor(() => expect(screen.queryByText('Visa')).toBeNull());
    expect(screen.getByText('Car loan')).toBeInTheDocument();
    // Its history is still there, with the card's name.
    expect(store.getState().data.tables.expense).toHaveLength(1);
  });
});
