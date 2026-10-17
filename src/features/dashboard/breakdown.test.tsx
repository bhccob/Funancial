import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@/domain/money';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { renderWithStore } from '@/test/appStoreStub';
import {
  makeDebt,
  makeDividend,
  makeExpense,
  makeHolding,
  makeLimit,
  makeProfile,
  makeSubscription,
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

type Seed = { cash?: number; reserve?: boolean; invested?: boolean; passive?: boolean };

/**
 * October 14th on a real store, so a correction really changes Home. Cash 3,680 (5,000 less 1,320
 * spent), savings 3,000, bills of 54.99, the Visa at 230 and a car loan at 1,000. With `reserve`
 * 70 of the Fun limit is held back; `invested` holds 1,000 in shares and `passive` pays 25 into
 * the passive bucket.
 */
async function renderHome({
  cash = 5_000_00,
  reserve = false,
  invested = false,
  passive = false,
}: Seed = {}) {
  const { store } = await freshRealStore();
  const { put } = store.getState();
  await put(
    'profile',
    makeProfile({
      openingDate: '2026-09-01',
      openingCash: cash,
      openingSavings: 3_000_00,
      salary: null,
    }),
  );
  await put(
    'debt',
    makeDebt({ id: 'visa', name: 'Visa', openingBalance: 230_00, openingDate: '2026-09-01' }),
  );
  await put(
    'debt',
    makeDebt({
      id: 'car',
      name: 'Car loan',
      kind: 'loan',
      openingBalance: 1_000_00,
      openingDate: '2026-09-01',
      creditLimit: null,
      dueDay: null,
      payInFull: false,
    }),
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
  await put(
    'subscription',
    makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
  );
  await put(
    'subscription',
    makeSubscription({ name: 'FitHub Gym', amount: 39_00, nextRenewal: '2026-10-28' }),
  );
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
  if (passive) {
    await put(
      'dividend',
      makeDividend({ paidOn: '2026-10-08', amount: 25_00, bucket: 'passive', status: 'confirmed' }),
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

const trigger = (which: 'Available to spend' | 'Net worth') =>
  screen.getByRole('button', { name: `${which}: see and correct` });

async function openSheet(which: 'Available to spend' | 'Net worth') {
  await userEvent.click(trigger(which));
  return screen.getByRole('dialog', { name: which });
}

const rows = (sheet: HTMLElement) => within(sheet).getAllByRole('listitem').map(pair);
const row = (sheet: HTMLElement, label: string) =>
  within(sheet).getByText(label).closest('li') as HTMLElement;
const total = (sheet: HTMLElement, label: string) =>
  pair(within(sheet).getByText(label).parentElement);

describe('the Available to spend sheet', () => {
  it('opens from the number', async () => {
    await renderHome();
    const button = trigger('Available to spend');
    // Its name says what it does, and the amount is still read out, as its description.
    expect(button).toHaveAccessibleDescription(usd(6_395_01));
    expect(button).toHaveTextContent(usd(6_395_01));
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
    expect(rows(sheet)).toEqual([
      ['Cash', usd(3_680_00)],
      ['Savings', usd(3_000_00)],
      ['Bills still to come this month', `−${usd(54_99)}`],
      ['Card payments due', `−${usd(230_00)}`],
      ['Reserved for limits', `−${usd(70_00)}`],
    ]);
    expect(total(sheet, '= Available to spend')).toEqual(['= Available to spend', usd(6_325_01)]);
  });

  it('leaves out Reserved for limits when nothing is reserved', async () => {
    await renderHome();
    const sheet = await openSheet('Available to spend');
    expect(rows(sheet).map(([label]) => label)).toEqual([
      'Cash',
      'Savings',
      'Bills still to come this month',
      'Card payments due',
    ]);
    expect(within(sheet).queryByText('Reserved for limits')).not.toBeInTheDocument();
  });

  it.each([
    ['with a reserve', { reserve: true }],
    ['without one', {}],
    ['with cash overspent below zero', { cash: 1_000_00, reserve: true }],
  ])('adds up to the number on Home, to the cent, %s', async (_name, seed) => {
    await renderHome(seed);
    const shown = minor(trigger('Available to spend').textContent);
    const sheet = await openSheet('Available to spend');
    const sum = rows(sheet).reduce((s, [, value]) => s + minor(value ?? null), 0);
    const [, bottom] = total(sheet, '= Available to spend');
    expect(minor(bottom ?? null)).toBe(shown);
    expect(sum).toBe(shown);
  });

  it('opens the correction on the balance of the row it was tapped on', async () => {
    await renderHome();
    const sheet = await openSheet('Available to spend');

    // Two buttons named Correct are told apart by what they describe.
    const correctSavings = within(row(sheet, 'Savings')).getByRole('button', { name: 'Correct' });
    expect(correctSavings).toHaveAccessibleDescription('Savings');
    await userEvent.click(correctSavings);
    let dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    expect(within(dialog).getByRole('radio', { name: 'Savings' })).toBeChecked();
    expect(within(dialog).getByText(`Funancial thinks: ${usd(3_000_00)}`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(within(row(sheet, 'Cash')).getByRole('button', { name: 'Correct' }));
    dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    expect(within(dialog).getByRole('radio', { name: 'Cash' })).toBeChecked();
    expect(within(dialog).getByText(`Funancial thinks: ${usd(3_680_00)}`)).toBeInTheDocument();
  });

  it('puts a correction into the rows, the total and Home', async () => {
    await renderHome();
    const sheet = await openSheet('Available to spend');
    await userEvent.click(within(row(sheet, 'Cash')).getByRole('button', { name: 'Correct' }));
    const dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    await userEvent.type(within(dialog).getByLabelText('Actual balance'), '3,700');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Set actual balance' })).not.toBeInTheDocument(),
    );
    // Back on the sheet, which is still open and already shows the new cash.
    expect(sheet).toBeVisible();
    expect(pair(row(sheet, 'Cash'))).toEqual(['Cash', usd(3_700_00)]);
    expect(total(sheet, '= Available to spend')[1]).toBe(usd(6_415_01));
    expect(trigger('Available to spend')).toHaveTextContent(usd(6_415_01));
    // Net worth rose by the same 20.00: 3,700 + 3,000 − 230 − 1,000.
    expect(
      within(screen.getByRole('region', { name: 'Net worth' })).getByText(usd(5_470_00)),
    ).toBeInTheDocument();
    // The correction is focused back on the button that asked for it.
    expect(within(row(sheet, 'Cash')).getByRole('button', { name: 'Correct' })).toHaveFocus();
  });

  it('shows no amount while amounts are hidden', async () => {
    await renderHome({ reserve: true });
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    const sheet = await openSheet('Available to spend');
    expect(sheet.textContent).not.toMatch(/\d/);
    expect(rows(sheet).map(([, value]) => value)).toEqual([
      '••••',
      '••••',
      '−••••',
      '−••••',
      '−••••',
    ]);
    expect(total(sheet, '= Available to spend')[1]).toBe('••••');
  });
});

describe('the Net worth sheet', () => {
  it('opens from the number', async () => {
    await renderHome();
    const button = trigger('Net worth');
    expect(button).toHaveAccessibleDescription(usd(5_450_00));
    expect(button).toHaveTextContent(usd(5_450_00));
    expect(screen.queryByRole('dialog', { name: 'Net worth' })).not.toBeInTheDocument();
    await openSheet('Net worth');
  });

  it('lists what you have, then what you owe', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['What you have', 'What you owe']);
    expect(rows(sheet)).toEqual([
      ['Cash', usd(3_680_00)],
      ['Savings', usd(3_000_00)],
      ['Passive income received', usd(0)],
      ['Visa', `−${usd(230_00)}`],
      ['Car loan', `−${usd(1_000_00)}`],
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
      ['Cash', usd(3_680_00)],
      ['Savings', usd(3_000_00)],
      ['Passive income received', usd(25_00)],
      ['Investments', usd(1_000_00)],
    ]);
    expect(
      within(row(sheet, 'Investments')).getByRole('link', { name: 'See Invest' }),
    ).toHaveAttribute('href', '/invest');
    expect(total(sheet, '= Net worth')[1]).toBe(usd(6_475_00));
  });

  it('gives Correct to cash and savings only, and Edit to each card and loan', async () => {
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
      Cash: ['Correct'],
      Savings: ['Correct'],
      'Passive income received': [],
      Investments: [],
      Visa: ['Edit'],
      'Car loan': ['Edit'],
    });
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

  it('opens the correction on the balance of the row it was tapped on', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(within(row(sheet, 'Savings')).getByRole('button', { name: 'Correct' }));
    const dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    expect(within(dialog).getByRole('radio', { name: 'Savings' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(within(row(sheet, 'Cash')).getByRole('button', { name: 'Correct' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Set actual balance' })).getByRole('radio', {
        name: 'Cash',
      }),
    ).toBeChecked();
  });

  it('opens the existing editor for a card and for a loan', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(within(row(sheet, 'Visa')).getByRole('button', { name: 'Edit' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit card' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Visa');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(within(row(sheet, 'Car loan')).getByRole('button', { name: 'Edit' }));
    dialog = screen.getByRole('dialog', { name: 'Edit loan' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Car loan');
  });

  it('puts an edited debt into the rows, the total and Home', async () => {
    await renderHome();
    const sheet = await openSheet('Net worth');
    await userEvent.click(within(row(sheet, 'Car loan')).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit loan' });
    const balance = within(dialog).getByLabelText('Balance when added');
    await userEvent.clear(balance);
    await userEvent.type(balance, '800');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit loan' })).not.toBeInTheDocument(),
    );
    expect(pair(row(sheet, 'Car loan'))).toEqual(['Car loan', `−${usd(800_00)}`]);
    expect(total(sheet, '= Net worth')[1]).toBe(usd(5_650_00));
    expect(trigger('Net worth')).toHaveTextContent(usd(5_650_00));
  });

  it('says so when there is nothing owed', async () => {
    const store = await renderHome();
    // The same Home with no card and no loan.
    for (const id of ['visa', 'car']) await store.getState().remove('debt', id);
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
      '−••••',
      '−••••',
    ]);
  });
});
