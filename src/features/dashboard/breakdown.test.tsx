import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { Account } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { renderWithStore } from '@/test/appStoreStub';
import {
  makeAccount,
  makeDebt,
  makeDividend,
  makeExpense,
  makeHolding,
  makeLimit,
  makeProfile,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { DashboardScreen } from './DashboardScreen';

afterEach(() => {
  localStorage.clear();
  useAmountsHidden.setState({ hidden: false });
});

const usd = (minor: number) => formatMoney(minor, 'USD');

/** "−$1,234.56" or "-$1,234.56" as -123456: the digits, signed. Exact amounts only, never whole. */
const minor = (text: string | null) =>
  (/^[−-]/.test(text ?? '') ? -1 : 1) * Number((text ?? '').replace(/\D/g, ''));

/** A label and a value, as the two ends of the element that holds them. */
const pair = (el: Element | null) => [
  el?.firstElementChild?.textContent,
  el?.lastElementChild?.textContent,
];

const OPENED = '2026-09-01';

const main = (openingBalance: number) => makeAccount({ openingBalance, openingDate: OPENED });
const savings = makeAccount({
  id: 'acct-savings',
  name: 'Savings',
  kind: 'savings',
  skin: 'mint',
  inAvailable: false,
  openingBalance: 3_000_00,
  openingDate: OPENED,
  order: 1,
});
const passive = makeAccount({
  id: 'acct-passive',
  name: 'Passive income',
  kind: 'savings',
  skin: 'amber',
  inAvailable: false,
  openingBalance: 0,
  openingDate: OPENED,
  order: 2,
});
/** Owes 230.00, paid in full, with no due day: its payment is due today. */
const visa: Account = makeAccount({
  id: 'visa',
  name: 'Visa',
  kind: 'credit',
  skin: 'violet',
  inAvailable: false,
  openingBalance: 230_00,
  openingDate: OPENED,
  order: 3,
  credit: {
    limit: null,
    statementDay: null,
    dueDay: null,
    payInFull: true,
    minimumPayment: 0,
    interestRate: 0,
  },
});

type Seed = {
  cash?: number;
  /** Without it there is no Visa and no subscription: no bill of any kind. */
  bills?: boolean;
  reserve?: boolean;
  invested?: boolean;
  passive?: boolean;
};

/**
 * October 14th on a real store, so a correction really changes Home. Main account holds 3,680
 * (5,000 less 1,320 spent), Savings 3,000. Streamflix (15.99) and the gym (39.00) renew on Main
 * account this month and Tunely (10.99) on the Visa, which owes 230; a car loan is at 1,000. With
 * `reserve` 70 of the Fun limit is held back; `invested` holds 1,000 in shares and `passive` pays
 * 25 into a Passive income account.
 */
async function renderHome({
  cash = 5_000_00,
  bills = true,
  reserve = false,
  invested = false,
  passive: withPassive = false,
}: Seed = {}) {
  const { store } = await freshRealStore();
  const { put } = store.getState();
  await put('profile', makeProfile({ openingDate: OPENED, salary: null }));
  await put('account', main(cash));
  await put('account', savings);
  if (withPassive) await put('account', passive);
  if (bills) await put('account', visa);
  await put(
    'debt',
    makeDebt({ id: 'car', name: 'Car loan', openingBalance: 1_000_00, openingDate: OPENED }),
  );
  for (const [date, category, amount] of [
    ['2026-10-01', 'rent', 1_200_00],
    ['2026-10-05', 'entertainment', 30_00],
    ['2026-10-12', 'food', 20_00],
    ['2026-10-13', 'food', 50_00],
    ['2026-10-14', 'food', 20_00],
  ] as const) {
    await put('expense', makeExpense({ date, category, amount }));
  }
  if (bills) {
    await put(
      'subscription',
      makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
    );
    await put(
      'subscription',
      makeSubscription({ name: 'FitHub Gym', amount: 39_00, nextRenewal: '2026-10-28' }),
    );
    await put(
      'subscription',
      makeSubscription({
        name: 'Tunely',
        amount: 10_99,
        nextRenewal: '2026-10-25',
        accountId: 'visa',
      }),
    );
  }
  await put(
    'budgetLimit',
    makeLimit({ category: 'entertainment', period: 'monthly', amount: 100_00, reserve }),
  );
  if (invested) {
    await put(
      'holding',
      makeHolding({
        shares: 10,
        quote: { price: 100, previousClose: 99, fxRate: 1, asOf: '2026-10-14T10:00:00.000Z' },
      }),
    );
  }
  if (withPassive) {
    await put(
      'dividend',
      makeDividend({ paidOn: '2026-10-08', amount: 25_00, accountId: 'acct-passive' }),
    );
  }
  renderWithStore(
    <MemoryRouter>
      <DashboardScreen />
    </MemoryRouter>,
    store,
  );
  return store;
}

/**
 * The name of a number's button: the amount drawn, then what pressing it does. jsdom drops the space
 * between the two, which a browser keeps (the Home e2e spec checks it there).
 */
const named = (amount: string, what: string) =>
  new RegExp(`^${amount.replace(/[$.]/g, '\\$&')}\\s*${what}$`);

const trigger = (which: 'Available to spend' | 'Net worth') =>
  screen.getByRole('button', { name: new RegExp(`${which}: see and correct$`) });

async function openSheet(which: 'Available to spend' | 'Net worth') {
  await userEvent.click(trigger(which));
  return screen.getByRole('dialog', { name: which });
}

const rows = (sheet: HTMLElement) => within(sheet).getAllByRole('listitem').map(pair);
const row = (sheet: HTMLElement, label: string) =>
  within(sheet).getByText(label).closest('li') as HTMLElement;
const total = (sheet: HTMLElement, label: string) =>
  pair(within(sheet).getByText(label).parentElement);
const correction = () => screen.getByRole('dialog', { name: 'Set actual balance' });

describe('the Available to spend sheet', () => {
  it('opens from the number', async () => {
    await renderHome();
    const button = trigger('Available to spend');
    // Its name is the amount you see, then what it does.
    expect(button).toHaveAccessibleName(
      named(usd(3_395_01), 'Available to spend: see and correct'),
    );
    expect(button).toHaveTextContent(usd(3_395_01));
    // The "?" and the eye are buttons of their own, never inside it.
    for (const other of ['What is available to spend?', 'Hide amounts']) {
      const el = screen.getByRole('button', { name: other });
      expect(button).not.toContainElement(el);
      expect(el.closest('button')).toBe(el);
    }
    expect(screen.queryByRole('dialog', { name: 'Available to spend' })).not.toBeInTheDocument();
    await openSheet('Available to spend');
  });

  it('shows what the number is made of, top to bottom', async () => {
    await renderHome({ reserve: true });
    const sheet = await openSheet('Available to spend');
    // Savings are shown apart, as Saved: not a row here. Tunely is on the Visa, so it is not among
    // the bills: it comes back in the card's payment.
    expect(rows(sheet)).toEqual([
      ['Main account', usd(3_680_00)],
      ['Bills still to come this month', usd(-54_99)],
      ['Card payments due', usd(-230_00)],
      ['Reserved for limits', usd(-70_00)],
    ]);
    expect(total(sheet, '= Available to spend')).toEqual(['= Available to spend', usd(3_325_01)]);
    expect(within(sheet).queryByText('Savings')).not.toBeInTheDocument();
  });

  it('lists every account that counts in Available, in carousel order', async () => {
    const store = await renderHome();
    await store.getState().put(
      'account',
      makeAccount({
        id: 'wallet',
        name: 'Wallet',
        kind: 'cash',
        skin: 'amber',
        openingBalance: 40_00,
        openingDate: OPENED,
        order: 4,
      }),
    );
    const sheet = await openSheet('Available to spend');
    expect(rows(sheet).map(([label]) => label)).toEqual([
      'Main account',
      'Wallet',
      'Bills still to come this month',
      'Card payments due',
    ]);
    expect(total(sheet, '= Available to spend')[1]).toBe(usd(3_435_01));
  });

  it('shows a bill row of nothing as a plain zero, never a minus zero', async () => {
    await renderHome({ bills: false });
    const sheet = await openSheet('Available to spend');
    expect(rows(sheet)).toEqual([
      ['Main account', usd(3_680_00)],
      ['Bills still to come this month', usd(0)],
      ['Card payments due', usd(0)],
    ]);
    expect(total(sheet, '= Available to spend')[1]).toBe(usd(3_680_00));
  });

  it('leaves out Reserved for limits when nothing is reserved', async () => {
    await renderHome();
    const sheet = await openSheet('Available to spend');
    expect(rows(sheet).map(([label]) => label)).toEqual([
      'Main account',
      'Bills still to come this month',
      'Card payments due',
    ]);
    expect(within(sheet).queryByText('Reserved for limits')).not.toBeInTheDocument();
  });

  it.each([
    ['with a reserve', { reserve: true }],
    ['without one', {}],
    ['with cash overspent below zero', { cash: 1_000_00, reserve: true }],
    ['with savings, passive income and investments', { passive: true, invested: true }],
  ])('adds up to the number on Home, to the cent, %s', async (_name, seed) => {
    await renderHome(seed);
    const shown = minor(trigger('Available to spend').textContent);
    const sheet = await openSheet('Available to spend');
    const sum = rows(sheet).reduce((s, [, value]) => s + minor(value ?? null), 0);
    const [, bottom] = total(sheet, '= Available to spend');
    expect(minor(bottom ?? null)).toBe(shown);
    expect(sum).toBe(shown);
  });

  it('opens the correction on the account of the row it was tapped on', async () => {
    await renderHome();
    const sheet = await openSheet('Available to spend');
    // The button is named by its row: "Correct Main account".
    await userEvent.click(
      within(row(sheet, 'Main account')).getByRole('button', { name: 'Correct Main account' }),
    );
    const dialog = correction();
    expect(dialog).toHaveAccessibleDescription('Main account');
    // It corrects that account: there is no other to pick.
    expect(within(dialog).queryByLabelText('Account')).not.toBeInTheDocument();
    expect(within(dialog).getByText(`Funcial thinks: ${usd(3_680_00)}`)).toBeInTheDocument();
  });

  it('puts a correction into the rows, the total and Home', async () => {
    const store = await renderHome();
    const sheet = await openSheet('Available to spend');
    await userEvent.click(
      within(row(sheet, 'Main account')).getByRole('button', { name: 'Correct Main account' }),
    );
    await userEvent.type(within(correction()).getByLabelText('Actual balance'), '3,700');
    await userEvent.click(within(correction()).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Set actual balance' })).not.toBeInTheDocument(),
    );
    expect(store.getState().data.tables.transaction).toEqual([
      expect.objectContaining({ type: 'adjustment', amount: 20_00, toAccountId: 'acct-main' }),
    ]);
    // Back on the sheet, which is still open and already shows the new balance.
    expect(sheet).toBeVisible();
    expect(pair(row(sheet, 'Main account'))).toEqual(['Main account', usd(3_700_00)]);
    expect(total(sheet, '= Available to spend')[1]).toBe(usd(3_415_01));
    expect(trigger('Available to spend')).toHaveTextContent(usd(3_415_01));
    // Net worth rose by the same 20.00: 3,700 + 3,000 − 230 − 1,000.
    expect(
      within(screen.getByRole('region', { name: 'Net worth' })).getByText(usd(5_470_00)),
    ).toBeInTheDocument();
    // The correction is focused back on the button that asked for it.
    expect(
      within(row(sheet, 'Main account')).getByRole('button', { name: 'Correct Main account' }),
    ).toHaveFocus();
  });

  it('shows no amount while amounts are hidden', async () => {
    await renderHome({ reserve: true });
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    const sheet = await openSheet('Available to spend');
    expect(sheet.textContent).not.toMatch(/\d/);
    expect(rows(sheet).map(([, value]) => value)).toEqual(['••••', '••••', '••••', '••••']);
    expect(total(sheet, '= Available to spend')[1]).toBe('••••');
  });
});

describe('the Net worth sheet', () => {
  it('opens from the number', async () => {
    await renderHome();
    const button = trigger('Net worth');
    expect(button).toHaveAccessibleName(named(usd(5_450_00), 'Net worth: see and correct'));
    expect(button).toHaveTextContent(usd(5_450_00));
    expect(screen.queryByRole('dialog', { name: 'Net worth' })).not.toBeInTheDocument();
    await openSheet('Net worth');
  });

  it('lists what you have, savings then bank and cash, then what you owe', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['What you have', 'What you owe']);
    expect(rows(sheet)).toEqual([
      ['Savings', usd(3_000_00)],
      ['Main account', usd(3_680_00)],
      ['Visa', usd(-230_00)],
      ['Car loan', usd(-1_000_00)],
    ]);
    expect(total(sheet, '= Net worth')).toEqual(['= Net worth', usd(5_450_00)]);
    // No investments yet, so nothing to look at in Invest.
    expect(within(sheet).queryByText('Investments')).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'See Invest' })).not.toBeInTheDocument();
  });

  it('adds Investments, with a link to Invest, once they are worth something', async () => {
    await renderHome({ invested: true, passive: true });
    const sheet = await openSheet('Net worth');
    expect(rows(sheet).slice(0, 4)).toEqual([
      ['Savings', usd(3_000_00)],
      ['Passive income', usd(25_00)],
      ['Main account', usd(3_680_00)],
      ['Investments', usd(1_000_00)],
    ]);
    expect(
      within(row(sheet, 'Investments')).getByRole('link', { name: 'See Invest' }),
    ).toHaveAttribute('href', '/invest');
    expect(total(sheet, '= Net worth')[1]).toBe(usd(6_475_00));
  });

  it('gives Correct to each account that holds money, and Edit to each card and loan', async () => {
    await renderHome({ invested: true, passive: true });
    const sheet = await openSheet('Net worth');
    const buttons = Object.fromEntries(
      rows(sheet).map(([label]) => [
        label,
        within(row(sheet, label!))
          .queryAllByRole('button')
          .map((b) => b.textContent),
      ]),
    );
    expect(buttons).toEqual({
      Savings: ['Correct'],
      'Passive income': ['Correct'],
      'Main account': ['Correct'],
      Investments: [],
      Visa: ['Edit'],
      'Car loan': ['Edit'],
    });
  });

  it('leaves an archived account out', async () => {
    const store = await renderHome({ passive: true });
    await store.getState().put('account', { ...passive, archivedOn: '2026-10-14' });
    const sheet = await openSheet('Net worth');
    expect(within(sheet).queryByText('Passive income')).not.toBeInTheDocument();
    expect(total(sheet, '= Net worth')[1]).toBe(usd(5_450_00));
  });

  it.each([
    ['everything', { invested: true, passive: true }],
    ['debts only', {}],
    ['cash below zero', { cash: 1_000_00 }],
  ])('adds up to the number on Home, to the cent, with %s', async (_name, seed) => {
    await renderHome(seed);
    const shown = minor(trigger('Net worth').textContent);
    const sheet = await openSheet('Net worth');
    const sum = rows(sheet).reduce((s, [, value]) => s + minor(value ?? null), 0);
    expect(minor(total(sheet, '= Net worth')[1] ?? null)).toBe(shown);
    expect(sum).toBe(shown);
  });

  it('opens the correction on the account of the row it was tapped on', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(
      within(row(sheet, 'Savings')).getByRole('button', { name: 'Correct Savings' }),
    );
    expect(correction()).toHaveAccessibleDescription('Savings');
    expect(within(correction()).getByText(`Funcial thinks: ${usd(3_000_00)}`)).toBeInTheDocument();
    await userEvent.click(within(correction()).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(
      within(row(sheet, 'Main account')).getByRole('button', { name: 'Correct Main account' }),
    );
    expect(correction()).toHaveAccessibleDescription('Main account');
    expect(within(correction()).getByText(`Funcial thinks: ${usd(3_680_00)}`)).toBeInTheDocument();
  });

  it('writes a correction of Savings to the savings account', async () => {
    const store = await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(
      within(row(sheet, 'Savings')).getByRole('button', { name: 'Correct Savings' }),
    );
    await userEvent.type(within(correction()).getByLabelText('Actual balance'), '3,050');
    await userEvent.click(within(correction()).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Set actual balance' })).not.toBeInTheDocument(),
    );
    expect(store.getState().data.tables.transaction).toEqual([
      expect.objectContaining({
        type: 'adjustment',
        amount: 50_00,
        fromAccountId: null,
        toAccountId: 'acct-savings',
        date: '2026-10-14',
      }),
    ]);
    expect(pair(row(sheet, 'Savings'))).toEqual(['Savings', usd(3_050_00)]);
    expect(total(sheet, '= Net worth')[1]).toBe(usd(5_500_00));
    // Savings are not part of Available, which stays where it was.
    expect(trigger('Available to spend')).toHaveTextContent(usd(3_395_01));
  });

  it('adds a card paid past its balance, and shows a settled loan as a plain zero', async () => {
    const store = await renderHome();
    // 280 against the Visa's 230 leaves a 50 credit; 1,000 settles the car loan. Net worth is
    // unchanged by paying a debt: the money moved from Main account to what is owed.
    const { put } = store.getState();
    await put(
      'transaction',
      makeTransaction({
        type: 'card_payment',
        amount: 280_00,
        date: '2026-10-10',
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      }),
    );
    await put(
      'transaction',
      makeTransaction({
        type: 'debt_payment',
        amount: 1_000_00,
        date: '2026-10-10',
        fromAccountId: 'acct-main',
        toAccountId: null,
        debtId: 'car',
      }),
    );
    const sheet = await openSheet('Net worth');
    expect(rows(sheet)).toEqual([
      ['Savings', usd(3_000_00)],
      ['Main account', usd(2_400_00)],
      ['Visa', usd(50_00)],
      ['Car loan', usd(0)],
    ]);
    const shown = minor(trigger('Net worth').textContent);
    expect(shown).toBe(5_450_00);
    expect(minor(total(sheet, '= Net worth')[1] ?? null)).toBe(shown);
    expect(rows(sheet).reduce((sum, [, value]) => sum + minor(value ?? null), 0)).toBe(shown);
  });

  it('opens the existing editor for a card and for a loan', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(within(row(sheet, 'Visa')).getByRole('button', { name: 'Edit Visa' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit card' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Visa');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(
      within(row(sheet, 'Car loan')).getByRole('button', { name: 'Edit Car loan' }),
    );
    dialog = screen.getByRole('dialog', { name: 'Edit loan' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Car loan');
  });

  it('puts an edited debt into the rows, the total and Home', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(
      within(row(sheet, 'Car loan')).getByRole('button', { name: 'Edit Car loan' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit loan' });
    const balance = within(dialog).getByLabelText('Balance when added');
    await userEvent.clear(balance);
    await userEvent.type(balance, '800');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit loan' })).not.toBeInTheDocument(),
    );
    expect(pair(row(sheet, 'Car loan'))).toEqual(['Car loan', usd(-800_00)]);
    expect(total(sheet, '= Net worth')[1]).toBe(usd(5_650_00));
    expect(trigger('Net worth')).toHaveTextContent(usd(5_650_00));
  });

  it('says so when there is nothing owed', async () => {
    const store = await renderHome({ bills: false });
    // The same Home with no card and no loan.
    await store.getState().remove('debt', 'car');
    const sheet = await openSheet('Net worth');
    expect(within(sheet).getByText('No cards or loans.')).toBeInTheDocument();
    expect(total(sheet, '= Net worth')[1]).toBe(usd(6_680_00));
  });

  it('shows no amount while amounts are hidden', async () => {
    await renderHome({ invested: true, passive: true });
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    const sheet = await openSheet('Net worth');
    expect(sheet.textContent).not.toMatch(/\d/);
    expect(rows(sheet).map(([, value]) => value)).toEqual([
      '••••',
      '••••',
      '••••',
      '••••',
      '••••',
      '••••',
    ]);
  });
});
