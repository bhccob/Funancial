import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { accountBalance } from '@/domain/balances';
import type { Account, CreditTerms } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { computeFinanceView } from '@/domain/view';
import { formatDay } from '@/lib/format';
import { safeStorage } from '@/lib/safeStorage';
import { toastStore } from '@/lib/toast';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { useLastSpend } from '@/store/useLastSpend';
import { useSelectedAccount } from '@/store/useSelectedAccount';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  makeAccount,
  makeDebt,
  makeExpense,
  makeIncome,
  makeLimit,
  makeProfile,
  makeSettings,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { CardsScreen } from './CardsScreen';

const TODAY = '2026-10-14';
const OPENED = '2026-10-01';
const MAIN = 'acct-main';
const VISA = 'visa';
const SAVINGS = 'savings';
const KEY = 'funancial.selectedAccount';

// Expected text is built with the app's formatter: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');

// What the payment service refuses with while a test sets it; with none, the real service answers.
const refusal = vi.hoisted(() => ({ message: null as string | null }));
vi.mock('@/store/useFinance', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/store/useFinance')>();
  return {
    ...real,
    usePaymentService: () => {
      const service = real.usePaymentService();
      const message = refusal.message;
      return message === null ? service : { pay: () => Promise.reject(new Error(message)) };
    },
  };
});

afterEach(() => {
  refusal.message = null;
  localStorage.clear();
  useSelectedAccount.setState({ id: null });
  useAmountsHidden.setState({ hidden: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useLastSpend.setState({ last: null });
  toastStore.setState({ toasts: [] });
});

/** Main account with 1,000.00, a 4242 Visa owing 230.00 of a 1,000.00 limit, and Savings with 500.00. */
const main = (overrides: Partial<Account> = {}) =>
  makeAccount({ id: MAIN, openingDate: OPENED, openingBalance: 1_000_00, ...overrides });
const visa = (overrides: Partial<Account> = {}, credit: Partial<CreditTerms> = {}) =>
  makeAccount({
    id: VISA,
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    last4: '4242',
    inAvailable: false,
    order: 1,
    openingDate: OPENED,
    openingBalance: 230_00,
    credit: {
      limit: 1_000_00,
      statementDay: null,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 0,
      interestRate: 0,
      ...credit,
    },
    ...overrides,
  });
const savings = (overrides: Partial<Account> = {}) =>
  makeAccount({
    id: SAVINGS,
    name: 'Savings',
    kind: 'savings',
    skin: 'mint',
    inAvailable: false,
    order: 2,
    openingDate: OPENED,
    openingBalance: 500_00,
    ...overrides,
  });

function baseData(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ openingDate: OPENED, salary: null }));
  data.tables.settings.push(makeSettings({ defaultAccountId: MAIN }));
  data.tables.account.push(main(), visa(), savings());
  return data;
}

/** The screen with the pages its links go to, so a tap can be followed. */
function renderCards(data: DataSnapshot = baseData()) {
  const router = createMemoryRouter(
    [
      { path: '/cards', element: <CardsScreen /> },
      { path: '/subscriptions', element: <h1>Bills page</h1> },
      { path: '/debts', element: <h1>Debts page</h1> },
      { path: '/history', element: <h1>History page</h1> },
    ],
    { initialEntries: ['/cards'] },
  );
  const result = renderWithStore(
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>,
    createStubStore({ data, today: TODAY }),
  );
  return { ...result, router };
}

/** The same screen over a real store, so what a tap saves shows on the screen. */
async function renderReal(extra: (data: DataSnapshot) => void = () => {}) {
  const { store } = await freshRealStore();
  const data = baseData();
  extra(data);
  await store
    .getState()
    .putMany([
      ...data.tables.profile.map((record) => ({ table: 'profile' as const, record })),
      ...data.tables.account.map((record) => ({ table: 'account' as const, record })),
      ...data.tables.expense.map((record) => ({ table: 'expense' as const, record })),
      ...data.tables.budgetLimit.map((record) => ({ table: 'budgetLimit' as const, record })),
      ...data.tables.subscription.map((record) => ({ table: 'subscription' as const, record })),
    ]);
  const settings = store.getState().data.tables.settings[0]!;
  await store.getState().put('settings', { ...settings, defaultAccountId: MAIN });
  renderWithStore(
    <MemoryRouter>
      <CardsScreen />
      <Toaster />
    </MemoryRouter>,
    store,
  );
  return store;
}

const carousel = () => screen.getByRole('group', { name: 'Your cards' });

/**
 * Stands in for IntersectionObserver, which jsdom lacks, and returns `centre(name)`: the card whose
 * name starts with `name` is now in the carousel's middle strip, and fully on screen (the rest are not).
 * Only the carousel's observers (the ones watching the cards) are told; the block has one of its own.
 */
function stubObservers(): (name: string) => void {
  const observers: Array<{ callback: IntersectionObserverCallback; targets: Element[] }> = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      targets: Element[] = [];
      callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  return (name) => {
    for (const { callback, targets } of observers) {
      if (!targets.some((t) => t.hasAttribute('data-account-id'))) continue;
      const entries = targets.map((target) => ({
        target,
        isIntersecting: target.getAttribute('aria-label')?.startsWith(name) ?? false,
        intersectionRatio: target.getAttribute('aria-label')?.startsWith(name) ? 1 : 0,
      }));
      callback(entries as never, {} as never);
    }
  };
}
const cardButtons = () => within(carousel()).getAllByRole('button');
const card = (name: string) =>
  within(carousel()).getByRole('button', { name: new RegExp(`^${name},`) });
const action = (name: string) =>
  within(screen.getByRole('group', { name: 'Card actions' })).getByRole('button', { name });
const toasted = (text: string) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());

describe('the block', () => {
  it('is titled Cards, with a ＋ that adds a debit, credit, savings or cash account', async () => {
    renderCards();
    expect(screen.getByRole('heading', { level: 1, name: 'Cards' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a card' });
    const kinds = within(dialog).getByRole('group', { name: 'Kind' });
    expect(
      within(kinds)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual(['Debit', 'Credit', 'Savings', 'Cash']);
    expect(within(kinds).getByRole('radio', { name: 'Debit' })).toBeChecked();
  });

  it('shows the accounts in use as cards, in their order, and never a loan or an archived one', () => {
    const data = baseData();
    data.tables.account.push(
      makeAccount({ id: 'old', name: 'Old bank', order: 3, archivedOn: '2026-10-10' }),
    );
    data.tables.debt.push(makeDebt({ id: 'car', name: 'Car loan' }));
    renderCards(data);
    expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      `Main account, debit, ${usd(1_000_00)}`,
      `Visa, credit card ending 4242, ${usd(230_00)} owed`,
      `Savings, savings, ${usd(500_00)}`,
    ]);
  });

  it('shows what a credit card owes and what is free on it, and its last 4 digits', () => {
    renderCards();
    const visaCard = card('Visa');
    expect(within(visaCard).getByText(usd(230_00))).toBeInTheDocument();
    expect(within(visaCard).getByText(`Owed · ${usd(770_00)} free`)).toBeInTheDocument();
    expect(within(visaCard).getByText('Visa · •••• 4242')).toBeInTheDocument();
  });

  it('opens on the stored selection, and marks only that card', () => {
    useSelectedAccount.setState({ id: VISA });
    renderCards();
    expect(cardButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('falls back to the default account when the stored one is archived, without forgetting it', () => {
    useSelectedAccount.getState().select(VISA);
    const data = baseData();
    data.tables.account[1] = visa({ archivedOn: '2026-10-12' });
    renderCards(data);
    expect(card('Main account')).toHaveAttribute('aria-pressed', 'true');
    expect(useSelectedAccount.getState().id).toBe(VISA);
    expect(safeStorage.get(KEY)).toBe(VISA);
  });

  it('selects a card when it is tapped, and keeps it after the app is opened again', async () => {
    renderCards();
    expect(card('Main account')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(card('Savings'));
    expect(card('Savings')).toHaveAttribute('aria-pressed', 'true');
    expect(card('Main account')).toHaveAttribute('aria-pressed', 'false');
    expect(useSelectedAccount.getState().id).toBe(SAVINGS);
    expect(safeStorage.get(KEY)).toBe(SAVINGS);
    vi.resetModules();
    const reopened = await import('@/store/useSelectedAccount');
    expect(reopened.useSelectedAccount.getState().id).toBe(SAVINGS);
  });

  it('never selects on its own as it opens, even when the card in the middle is another', () => {
    // A browser reports the card in the middle as soon as it is watched: that is not a pick.
    const observed: Element[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        callback: IntersectionObserverCallback;
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          observed.push(target);
          this.callback(
            [
              { target, isIntersecting: target.getAttribute('aria-label')?.startsWith('Savings') },
            ] as never,
            this as never,
          );
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    renderCards();
    expect(observed.length).toBeGreaterThan(0);
    expect(useSelectedAccount.getState().id).toBeNull();
    expect(card('Main account')).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects the card in the middle once the person scrolls the carousel', () => {
    const centre = stubObservers();
    renderCards();
    act(() => centre('Visa'));
    expect(useSelectedAccount.getState().id).toBeNull();
    // A finger on the carousel, then the cards slide.
    act(() => {
      fireEvent.pointerDown(carousel());
      fireEvent.scroll(carousel());
      centre('Visa');
    });
    expect(useSelectedAccount.getState().id).toBe(VISA);
    expect(card('Visa')).toHaveAttribute('aria-pressed', 'true');
  });

  it('stops selecting once the slide has come to rest, so a scroll the person did not make selects nothing', async () => {
    const centre = stubObservers();
    renderCards();
    act(() => {
      fireEvent.pointerDown(carousel());
      fireEvent.scroll(carousel());
      centre('Visa');
    });
    expect(useSelectedAccount.getState().id).toBe(VISA);
    act(() => {
      carousel().dispatchEvent(new Event('scrollend'));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    // Tab bringing another card into view, or a turn of the phone snapping the row again.
    act(() => centre('Savings'));
    expect(useSelectedAccount.getState().id).toBe(VISA);
  });

  it('selects nothing after a press on the row that moved nothing', () => {
    const centre = stubObservers();
    renderCards();
    act(() => {
      fireEvent.pointerDown(carousel());
      fireEvent.pointerUp(carousel());
      centre('Savings');
    });
    expect(useSelectedAccount.getState().id).toBeNull();
  });

  it('shows small dots under the carousel, the selected one wider, hidden from screen readers', async () => {
    renderCards();
    const dots = screen.getByTestId('card-dots');
    expect(dots).toHaveAttribute('aria-hidden', 'true');
    const wide = () => [...dots.children].map((d) => d.getAttribute('data-on'));
    expect(wide()).toEqual(['true', 'false', 'false']);
    await userEvent.click(card('Visa'));
    expect(wide()).toEqual(['false', 'true', 'false']);
  });

  it('says when there is no card yet', () => {
    const data = baseData();
    data.tables.account = [];
    renderCards(data);
    expect(screen.getByText('No cards yet. Add one with ＋.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Card actions' })).toBeNull();
  });

  it('hides every amount on the cards while amounts are hidden', () => {
    useAmountsHidden.setState({ hidden: true });
    renderCards();
    expect(card('Main account')).toHaveAttribute('aria-label', 'Main account, debit, ••••');
    expect(within(card('Visa')).queryByText(usd(230_00))).toBeNull();
  });
});

describe('Pay', () => {
  const sheet = (name: string) => screen.getByRole('dialog', { name: `Pay with ${name}` });

  it('pays 12.50 with Main account: its card drops by exactly that', async () => {
    const store = await renderReal();
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('radio', { name: 'Transport' }));
    await userEvent.type(pay.getByLabelText('Note'), 'Bus');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    expect(await pay.findByText(`Paid ${usd(12_50)}`)).toHaveAttribute('role', 'status');
    await waitFor(() =>
      expect(card('Main account')).toHaveAttribute(
        'aria-label',
        `Main account, debit, ${usd(1_000_00 - 12_50)}`,
      ),
    );
    const data = store.getState().data;
    expect(data.tables.expense).toEqual([
      expect.objectContaining({
        amount: 12_50,
        category: 'transport',
        note: 'Bus',
        accountId: MAIN,
        date: TODAY,
      }),
    ]);
    await userEvent.click(pay.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Pay with Main account' })).toBeNull();
  });

  it('says Paying… while it pays', async () => {
    await renderReal();
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '5');
    const button = pay.getByRole('button', { name: 'Pay' });
    await userEvent.click(button);
    // Whatever moment the save is at, the button never offers a second payment.
    await pay.findByText(`Paid ${usd(5_00)}`);
    expect(pay.queryByRole('button', { name: 'Pay' })).toBeNull();
  });

  it('pays with the Visa: what it owes rises by the amount', async () => {
    const store = await renderReal();
    await userEvent.click(card('Visa'));
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Visa'));
    expect(pay.getByText('Adds to what you owe on the card.')).toBeInTheDocument();
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await waitFor(() =>
      expect(card('Visa')).toHaveAttribute(
        'aria-label',
        `Visa, credit card ending 4242, ${usd(230_00 + 12_50)} owed`,
      ),
    );
    const data = store.getState().data;
    const visaNow = data.tables.account.find((a) => a.id === VISA)!;
    expect(accountBalance(visaNow, data, TODAY)).toBe(230_00 + 12_50);
  });

  it('asks for an amount, and pays nothing without one', async () => {
    const store = await renderReal();
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    expect(pay.getByLabelText('Amount')).toHaveAccessibleDescription('Enter an amount like 12.50');
    expect(store.getState().data.tables.expense).toEqual([]);
  });

  it('asks first under the strict tone when it would go over a limit, then tells about it', async () => {
    const store = await renderReal((data) => {
      data.tables.budgetLimit.push(
        makeLimit({ category: 'food', amount: 10_00, period: 'monthly' }),
      );
    });
    const settings = store.getState().data.tables.settings[0]!;
    await act(() => store.getState().put('settings', { ...settings, warningTone: 'strict' }));
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    const ask = screen.getByRole('dialog', { name: 'Over your limit?' });
    expect(store.getState().data.tables.expense).toEqual([]);
    await userEvent.click(within(ask).getByRole('button', { name: 'Pay anyway' }));
    await pay.findByText(`Paid ${usd(12_50)}`);
    expect(store.getState().data.tables.expense).toHaveLength(1);
    expect(screen.getAllByRole('status').some((s) => /Food/.test(s.textContent ?? ''))).toBe(true);
  });

  it('pays nothing when the limit question is cancelled', async () => {
    const store = await renderReal((data) => {
      data.tables.budgetLimit.push(
        makeLimit({ category: 'food', amount: 10_00, period: 'monthly' }),
      );
    });
    const settings = store.getState().data.tables.settings[0]!;
    await act(() => store.getState().put('settings', { ...settings, warningTone: 'strict' }));
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Over your limit?' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(store.getState().data.tables.expense).toEqual([]);
    expect(pay.getByRole('button', { name: 'Pay' })).toBeEnabled();
  });

  it('tells about a limit crossed under the gentle tone too, after paying', async () => {
    await renderReal((data) => {
      data.tables.budgetLimit.push(
        makeLimit({ category: 'food', amount: 10_00, period: 'monthly' }),
      );
    });
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await pay.findByText(`Paid ${usd(12_50)}`);
    expect(screen.queryByRole('dialog', { name: 'Over your limit?' })).toBeNull();
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => /Food/.test(s.textContent ?? ''))).toBe(
        true,
      ),
    );
  });
});

describe('the done step of Pay', () => {
  const sheet = (name: string) => screen.getByRole('dialog', { name: `Pay with ${name}` });

  /** Pays `amount` with the selected card, with a category and a note, and returns the sheet to look in. */
  async function payToTheEnd(
    name: string,
    amount: string,
    { category = 'Transport', note = 'Bus' }: { category?: string; note?: string } = {},
  ) {
    await userEvent.click(action('Pay'));
    const pay = within(sheet(name));
    await userEvent.type(pay.getByLabelText('Amount'), amount);
    await userEvent.click(pay.getByRole('radio', { name: category }));
    if (note) await userEvent.type(pay.getByLabelText('Note'), note);
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    return pay;
  }

  it('says what was paid, the shop and the category, and names the card, with no balance and no card picture', async () => {
    await renderReal((data) => {
      data.tables.account[0] = main({ last4: '4312' });
    });
    const pay = await payToTheEnd('Main account', '12.50');
    const paid = await pay.findByText(`Paid ${usd(12_50)}`);
    expect(paid).toHaveAttribute('role', 'status');
    expect(pay.getByText('Bus · Transport')).toBeInTheDocument();
    expect(pay.getByText('Paid with Main account ·· 4312')).toBeInTheDocument();
    expect(pay.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    // What is left on the card is not on this step: no old-to-new balance, nothing drawn as a card.
    const done = sheet('Main account');
    expect(done).not.toHaveTextContent(usd(1_000_00));
    expect(done).not.toHaveTextContent(usd(1_000_00 - 12_50));
    expect(done.textContent).not.toMatch(/left|balance|→/i);
    expect(done.querySelector('[data-account-id], [data-card-mark]')).toBeNull();
    // The check, the three lines and Done: nothing else is drawn.
    expect(done.querySelectorAll('p')).toHaveLength(3);
    // It is still the Pay sheet, so it keeps its name; the words "Pay with Main account" are not
    // drawn again over "Paid with Main account".
    expect(pay.getByRole('heading', { name: 'Pay with Main account' })).toHaveClass('sr-only');
  });

  it.each([
    ['Main account', 'Paid with Main account'],
    ['Visa', 'Paid with Visa ·· 4242'],
  ])('names %s as "%s", the last 4 digits only where it has them', async (name, line) => {
    await renderReal();
    if (name === 'Visa') await userEvent.click(card('Visa'));
    const pay = await payToTheEnd(name, '12.50');
    await pay.findByText(`Paid ${usd(12_50)}`);
    expect(pay.getByText(line)).toBeInTheDocument();
  });

  it('says the category alone when there is no note', async () => {
    await renderReal();
    const pay = await payToTheEnd('Main account', '9', { category: 'Transport', note: '' });
    await pay.findByText(`Paid ${usd(9_00)}`);
    expect(pay.getByText('Transport')).toBeInTheDocument();
  });

  it('masks with the eye: the paid amount is hidden while amounts are hidden', async () => {
    useAmountsHidden.setState({ hidden: true });
    await renderReal();
    const pay = await payToTheEnd('Main account', '12.50');
    expect(await pay.findByText('Paid ••••')).toHaveAttribute('role', 'status');
    expect(sheet('Main account').textContent).not.toMatch(/12[.,]50/);
  });

  it('closes on Done, and the next payment starts on the form again', async () => {
    await renderReal();
    const pay = await payToTheEnd('Main account', '12.50');
    await pay.findByText(`Paid ${usd(12_50)}`);
    await userEvent.click(pay.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Pay with Main account' })).toBeNull();
    await userEvent.click(action('Pay'));
    expect(within(sheet('Main account')).getByLabelText('Amount')).toHaveValue('');
  });

  it.each([
    ['Escape', (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: 'Escape' })],
    // The Android back gesture is a close request on the dialog.
    [
      'the back gesture',
      (dialog: HTMLElement) => fireEvent(dialog, new Event('cancel', { cancelable: true })),
    ],
  ])('closes on %s as Done does', async (_, press) => {
    await renderReal();
    const pay = await payToTheEnd('Main account', '12.50');
    await pay.findByText(`Paid ${usd(12_50)}`);
    press(sheet('Main account'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Pay with Main account' })).toBeNull(),
    );
    await userEvent.click(action('Pay'));
    expect(within(sheet('Main account')).getByLabelText('Amount')).toHaveValue('');
  });

  it('records the spend on the card it was paid with, once it has gone through', async () => {
    await renderReal();
    await userEvent.click(card('Visa'));
    const pay = await payToTheEnd('Visa', '12.50');
    await pay.findByText(`Paid ${usd(12_50)}`);
    expect(useLastSpend.getState().last).toEqual({
      accountId: VISA,
      amount: 12_50,
      at: expect.any(Number),
    });
  });

  it('records nothing for a payment that is asked about and not made', async () => {
    const store = await renderReal((data) => {
      data.tables.budgetLimit.push(
        makeLimit({ category: 'food', amount: 10_00, period: 'monthly' }),
      );
    });
    const settings = store.getState().data.tables.settings[0]!;
    await act(() => store.getState().put('settings', { ...settings, warningTone: 'strict' }));
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Over your limit?' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(useLastSpend.getState().last).toBeNull();
  });

  it('records nothing and shows no done step when the payment service refuses, and stays on the form', async () => {
    const store = await renderReal();
    refusal.message = 'The payment was declined.';
    await userEvent.click(action('Pay'));
    const pay = within(sheet('Main account'));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    // Today's error behaviour: the reason is said in a toast, and nothing else happens.
    await toasted('The payment was declined.');
    expect(useLastSpend.getState().last).toBeNull();
    expect(store.getState().data.tables.expense).toEqual([]);
    expect(pay.queryByText(`Paid ${usd(12_50)}`)).toBeNull();
    expect(pay.queryByText(/^Paid with /)).toBeNull();
    expect(pay.queryByRole('button', { name: 'Done' })).toBeNull();
    // Still the form, with what was typed, and Pay offered again.
    expect(pay.getByLabelText('Amount')).toHaveValue('12.50');
    expect(pay.getByRole('button', { name: 'Pay' })).toBeEnabled();
    expect(card('Main account')).toHaveAttribute(
      'aria-label',
      `Main account, debit, ${usd(1_000_00)}`,
    );
  });
});

describe('just now', () => {
  /** A clock the test moves: only the timers the badge reads are faked, so the rest of the screen runs as it does. */
  function clock() {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
  }
  const spend = (accountId: string, amount: number, age = 0) =>
    useLastSpend.setState({ last: { accountId, amount, at: Date.now() - age } });
  const badge = (text: string | RegExp) => screen.queryByText(text);
  const JUST_NOW = `−${usd(12_50)} just now`;

  it('shows what came off the card, on that card, for 4 seconds, in a small thick glass badge', () => {
    clock();
    spend(MAIN, 12_50);
    renderCards();
    const shown = within(card('Main account')).getByText(JUST_NOW);
    expect(shown).toHaveClass('glass-strong');
    // It is a piece of the card, not a second thing to tap, and the card keeps its own name.
    expect(card('Main account')).toHaveAttribute(
      'aria-label',
      `Main account, debit, ${usd(1_000_00)}`,
    );
    act(() => vi.advanceTimersByTime(3_999));
    expect(badge(JUST_NOW)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(badge(JUST_NOW)).toBeNull();
  });

  it('is on the card that paid and no other', () => {
    clock();
    spend(VISA, 45_00);
    renderCards();
    expect(within(card('Visa')).getByText(`−${usd(45_00)} just now`)).toBeInTheDocument();
    expect(within(card('Main account')).queryByText(/just now/)).toBeNull();
    expect(within(card('Savings')).queryByText(/just now/)).toBeNull();
  });

  it('slides in and out, and under reduced motion only fades, by one pair of classes', () => {
    clock();
    spend(MAIN, 12_50);
    renderCards();
    expect(badge(JUST_NOW)).toHaveClass(
      'motion-safe:animate-just-now',
      'motion-reduce:animate-just-now-fade',
    );
  });

  it('shows for a spend under 30 seconds old, and not for one 31 seconds old', () => {
    clock();
    spend(MAIN, 12_50, 29_000);
    const fresh = renderCards();
    expect(badge(JUST_NOW)).toBeInTheDocument();
    fresh.unmount();
    spend(MAIN, 12_50, 31_000);
    renderCards();
    expect(badge(JUST_NOW)).toBeNull();
  });

  it('shows nothing when nothing was spent', () => {
    clock();
    renderCards();
    expect(badge(/just now/)).toBeNull();
  });

  it('masks with the eye: the amount is hidden while amounts are hidden', () => {
    clock();
    useAmountsHidden.setState({ hidden: true });
    spend(MAIN, 12_50);
    renderCards();
    expect(within(card('Main account')).getByText('−•••• just now')).toBeInTheDocument();
    expect(badge(/12[.,]50/)).toBeNull();
  });

  it('does not come back on a re-render, or on going back to the card', () => {
    clock();
    spend(MAIN, 12_50);
    renderCards();
    act(() => vi.advanceTimersByTime(4_000));
    expect(badge(JUST_NOW)).toBeNull();
    act(() => useAmountsHidden.setState({ hidden: true }));
    act(() => useAmountsHidden.setState({ hidden: false }));
    fireEvent.click(card('Visa'));
    fireEvent.click(card('Main account'));
    expect(badge(/just now/)).toBeNull();
  });

  it('waits for its card to come on screen, then shows once and not again on going back', () => {
    clock();
    const centre = stubObservers();
    spend(VISA, 45_00, 20_000);
    renderCards();
    // Main is the card in the middle: the Visa is off to the side, and nothing shows yet.
    expect(badge(/just now/)).toBeNull();
    act(() => vi.advanceTimersByTime(5_000));
    act(() => centre('Visa'));
    expect(within(card('Visa')).getByText(`−${usd(45_00)} just now`)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_000));
    expect(badge(/just now/)).toBeNull();
    // Away and back: it has had its turn.
    act(() => centre('Main account'));
    act(() => centre('Visa'));
    expect(badge(/just now/)).toBeNull();
  });

  it('does not show for a card that comes on screen after the 30 seconds', () => {
    clock();
    const centre = stubObservers();
    spend(VISA, 45_00, 20_000);
    renderCards();
    act(() => vi.advanceTimersByTime(10_000));
    act(() => centre('Visa'));
    expect(badge(/just now/)).toBeNull();
  });

  it('shows again for a newer spend while the tab is open', () => {
    clock();
    spend(MAIN, 12_50);
    renderCards();
    act(() => vi.advanceTimersByTime(4_000));
    expect(badge(JUST_NOW)).toBeNull();
    act(() => useLastSpend.getState().record(MAIN, 3_00));
    expect(within(card('Main account')).getByText(`−${usd(3_00)} just now`)).toBeInTheDocument();
  });

  it('waits until the Pay sheet is closed, so it is seen on the card and not behind the sheet', async () => {
    const store = await renderReal();
    await userEvent.click(action('Pay'));
    const pay = within(screen.getByRole('dialog', { name: 'Pay with Main account' }));
    await userEvent.type(pay.getByLabelText('Amount'), '12.50');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await pay.findByText(`Paid ${usd(12_50)}`);
    expect(store.getState().data.tables.expense).toHaveLength(1);
    expect(badge(/just now/)).toBeNull();
    await userEvent.click(pay.getByRole('button', { name: 'Done' }));
    expect(await within(card('Main account')).findByText(JUST_NOW)).toBeInTheDocument();
  });
});

describe('On this card', () => {
  /** Main has seven coffees and a transfer to Savings, the Visa a fill-up, and Savings its own rent share. */
  function withEntries(): DataSnapshot {
    const data = baseData();
    for (let day = 1; day <= 7; day++) {
      data.tables.expense.push(
        makeExpense({
          amount: day * 1_00,
          note: `Coffee ${day}`,
          accountId: MAIN,
          date: `2026-10-0${day}`,
        }),
      );
    }
    data.tables.expense.push(
      makeExpense({ amount: 45_00, note: 'Fill-up', accountId: VISA, date: '2026-10-08' }),
      makeExpense({ amount: 60_00, note: 'Rent share', accountId: SAVINGS, date: '2026-10-05' }),
    );
    data.tables.transaction.push(
      makeTransaction({
        amount: 200_00,
        fromAccountId: MAIN,
        toAccountId: SAVINGS,
        date: '2026-10-09',
        note: 'Top up',
      }),
    );
    return data;
  }
  const section = () => screen.getByRole('region', { name: 'On this card' });
  const titles = () =>
    within(section())
      .getAllByRole('listitem')
      .map((li) => li.querySelector('b')?.textContent);

  it('lists the selected card’s latest 5 entries, newest first, as History writes them from the card’s side', () => {
    renderCards(withEntries());
    // The transfer reads as money out of Main, and the coffees follow it.
    expect(titles()).toEqual(['To Savings', 'Coffee 7', 'Coffee 6', 'Coffee 5', 'Coffee 4']);
    const [first, second] = within(section()).getAllByRole('listitem');
    expect(first).toHaveTextContent(
      `To SavingsTransfer · Top up · ${formatDay('2026-10-09')}−${usd(200_00)}`,
    );
    expect(second).toHaveTextContent(`Coffee 7Food · ${formatDay('2026-10-07')}−${usd(7_00)}`);
    // Seen from the card itself, no row names it again or draws its mark.
    expect(section().querySelector('[data-card-mark]')).toBeNull();
    expect(section()).not.toHaveTextContent('Main account');
  });

  it('follows the card that is picked', async () => {
    renderCards(withEntries());
    await userEvent.click(card('Visa'));
    expect(titles()).toEqual(['Fill-up']);
    await userEvent.click(card('Savings'));
    expect(titles()).toEqual(['From Main account', 'Rent share']);
    await userEvent.click(card('Main account'));
    expect(titles()).toHaveLength(5);
  });

  it('sits under the chart and above the categories', () => {
    renderCards(withEntries());
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByRole('region', { name: 'Spending' }), section())).toBe(true);
    expect(follows(section(), screen.getByRole('region', { name: 'Categories' }))).toBe(true);
  });

  it('has View all, which opens History', async () => {
    const { router } = renderCards(withEntries());
    await userEvent.click(within(section()).getByRole('link', { name: /View all/ }));
    expect(router.state.location.pathname).toBe('/history');
  });

  it('says so when the card has no entries, and still has View all', () => {
    renderCards();
    expect(within(section()).getByText('Nothing on Main account yet.')).toBeInTheDocument();
    expect(within(section()).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(section()).getByRole('link', { name: /View all/ })).toBeInTheDocument();
  });

  it('is only to look at: its rows open nothing and delete nothing (History does that)', () => {
    renderCards(withEntries());
    expect(within(section()).queryAllByRole('button')).toHaveLength(0);
  });

  it('masks with the eye: no amount shows while amounts are hidden', () => {
    useAmountsHidden.setState({ hidden: true });
    renderCards(withEntries());
    expect(section()).toHaveTextContent('−••••');
    expect(section().textContent).not.toMatch(/\d[.,]\d\d/);
  });
});

describe('the cards’ size', () => {
  it('is 300 by 186, with the amount at 26px', () => {
    renderCards();
    for (const name of ['Main account', 'Visa', 'Savings']) {
      expect(card(name)).toHaveClass('h-[186px]', 'w-[300px]');
      expect(card(name)).not.toHaveClass('h-[166px]', 'w-[270px]');
    }
    expect(within(card('Main account')).getByText(usd(1_000_00))).toHaveClass('text-[26px]');
  });

  it('leaves the row room for a card of that width on a wide screen: half the row less half a card', () => {
    renderCards();
    // 50% is of the box the row stands out of by 20px a side: half a card (150px) less those 20px.
    expect(carousel()).toHaveClass('sm:px-[calc(50%-130px)]');
  });
});

describe('Freeze', () => {
  it('freezes the selected card: Pay is off, with Unfreeze to pay, until it is unfrozen', async () => {
    const store = await renderReal();
    await userEvent.click(action('Freeze'));
    await toasted('Main account frozen.');
    expect(store.getState().data.tables.account.find((a) => a.id === MAIN)?.frozen).toBe(true);
    expect(card('Main account')).toHaveAttribute(
      'aria-label',
      `Main account, debit, ${usd(1_000_00)}, frozen`,
    );
    expect(within(card('Main account')).getByTestId('frost')).toHaveAttribute('data-on', 'true');
    expect(action('Unfreeze to pay')).toBeDisabled();
    expect(
      within(screen.getByRole('group', { name: 'Card actions' })).queryByRole('button', {
        name: 'Pay',
      }),
    ).toBeNull();

    await userEvent.click(action('Unfreeze'));
    await toasted('Main account unfrozen.');
    expect(action('Pay')).toBeEnabled();
    expect(within(card('Main account')).getByTestId('frost')).toHaveAttribute('data-on', 'false');
  });

  it('freezes only the card that is selected', async () => {
    const store = await renderReal();
    await userEvent.click(card('Visa'));
    await userEvent.click(action('Freeze'));
    await toasted('Visa frozen.');
    const frozen = store
      .getState()
      .data.tables.account.filter((a) => a.frozen)
      .map((a) => a.id);
    expect(frozen).toEqual([VISA]);
    await userEvent.click(card('Main account'));
    expect(action('Pay')).toBeEnabled();
  });
});

describe('below the block', () => {
  it('shows Available to spend, which is the finance view’s available, and opens what it is made of', async () => {
    const data = baseData();
    data.tables.subscription.push(
      makeSubscription({
        name: 'Netflix',
        amount: 15_99,
        accountId: MAIN,
        nextRenewal: '2026-10-20',
      }),
    );
    renderCards(data);
    const available = computeFinanceView(data, TODAY, 1).available;
    const pill = screen.getByRole('button', { name: `Available to spend ${usd(available)}` });
    expect(pill).toHaveClass('glass-strong');
    await userEvent.click(pill);
    expect(screen.getByRole('dialog', { name: 'Available to spend' })).toBeInTheDocument();
  });

  it('charts what the selected card spent, and follows the card that is picked', async () => {
    const data = baseData();
    data.tables.expense.push(
      makeExpense({ amount: 30_00, category: 'food', accountId: MAIN, date: '2026-10-03' }),
      makeExpense({ amount: 10_00, category: 'transport', accountId: MAIN, date: '2026-10-05' }),
      makeExpense({ amount: 45_00, category: 'shopping', accountId: VISA, date: '2026-10-09' }),
    );
    renderCards(data);
    const chart = screen.getByRole('region', { name: 'Spending' });
    expect(within(chart).getByText('Spent this month')).toBeInTheDocument();
    expect(within(chart).getByTestId('spend-total')).toHaveTextContent(usd(40_00));
    const categories = screen.getByRole('region', { name: 'Categories' });
    expect(
      within(categories)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([`Food1 transaction${usd(30_00)}75%`, `Transport1 transaction${usd(10_00)}25%`]);

    await userEvent.click(card('Visa'));
    expect(within(chart).getByTestId('spend-total')).toHaveTextContent(usd(45_00));
    expect(
      within(categories)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([`Shopping1 transaction${usd(45_00)}100%`]);
  });

  it('switches the chart between days, months and years, and marks the highest bar', async () => {
    const data = baseData();
    data.tables.expense.push(
      makeExpense({ amount: 30_00, accountId: MAIN, date: '2026-10-03' }),
      makeExpense({ amount: 80_00, accountId: MAIN, date: '2026-09-20' }),
      makeExpense({ amount: 20_00, accountId: MAIN, date: '2025-06-01' }),
    );
    renderCards(data);
    const chart = within(screen.getByRole('region', { name: 'Spending' }));
    const period = chart.getByRole('group', { name: 'Period' });
    expect(within(period).getByRole('button', { name: 'Month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(chart.getAllByRole('listitem')).toHaveLength(12);
    // September's 80.00 is the highest of the twelve months, and carries its amount.
    expect(chart.getByTestId('spend-top')).toHaveTextContent(
      formatMoney(80_00, 'USD', undefined, { whole: true }),
    );

    await userEvent.click(within(period).getByRole('button', { name: 'Day' }));
    expect(chart.getByText('Spent in the last 14 days')).toBeInTheDocument();
    expect(chart.getAllByRole('listitem')).toHaveLength(14);
    expect(chart.getByTestId('spend-total')).toHaveTextContent(usd(30_00));

    await userEvent.click(within(period).getByRole('button', { name: 'Year' }));
    expect(chart.getByText('Spent this year')).toBeInTheDocument();
    expect(chart.getAllByRole('listitem')).toHaveLength(4);
    expect(chart.getByTestId('spend-total')).toHaveTextContent(usd(110_00));
  });

  it('says how this month compares with the same days of last month', () => {
    const data = baseData();
    data.tables.expense.push(
      makeExpense({ amount: 30_00, accountId: MAIN, date: '2026-10-03' }),
      makeExpense({ amount: 20_00, accountId: MAIN, date: '2026-09-10' }),
    );
    renderCards(data);
    const chart = within(screen.getByRole('region', { name: 'Spending' }));
    expect(chart.getByTestId('spend-change')).toHaveTextContent('+50.00% vs last month');
  });

  it('lists the next three bills, and View all opens the bills page', async () => {
    const data = baseData();
    data.tables.subscription.push(
      makeSubscription({ name: 'Netflix', accountId: MAIN, nextRenewal: '2026-10-16' }),
      makeSubscription({ name: 'Phone', accountId: MAIN, nextRenewal: '2026-10-18' }),
      makeSubscription({ name: 'Gym', accountId: MAIN, nextRenewal: '2026-10-19' }),
      makeSubscription({ name: 'Rent', accountId: MAIN, nextRenewal: '2026-10-28' }),
    );
    const { router } = renderCards(data);
    const bills = screen.getByRole('region', { name: 'Bills' });
    const named = within(bills)
      .getAllByRole('listitem')
      .map((li) => ['Netflix', 'Phone', 'Gym', 'Rent'].find((n) => li.textContent?.includes(n)));
    expect(named).toEqual(['Netflix', 'Phone', 'Gym']);
    await userEvent.click(within(bills).getByRole('link', { name: /View all/ }));
    expect(router.state.location.pathname).toBe('/subscriptions');
  });

  it('lists the loans with their next payment day, and View all opens Debts', async () => {
    const data = baseData();
    data.tables.debt.push(
      makeDebt({
        id: 'car',
        name: 'Car loan',
        openingBalance: 9_000_00,
        dueDay: 1,
        openingDate: OPENED,
      }),
    );
    const { router } = renderCards(data);
    const loans = screen.getByRole('region', { name: 'Loans' });
    const row = within(loans).getByRole('listitem');
    expect(row).toHaveTextContent('Car loan');
    expect(row).toHaveTextContent(`Next payment ${formatDay('2026-11-01')}`);
    expect(row).toHaveTextContent(usd(9_000_00));
    await userEvent.click(within(loans).getByRole('link', { name: /View all/ }));
    expect(router.state.location.pathname).toBe('/debts');
  });

  it('keeps Bills and Loans and their links when there are none', () => {
    const data = baseData();
    // A card that owes nothing has no payment due.
    data.tables.account[1] = visa({ openingBalance: 0 });
    renderCards(data);
    expect(
      within(screen.getByRole('region', { name: 'Bills' })).getByText('Nothing due this month.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Loans' })).getByText('No loans.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Loans' })).getByRole('link', { name: /View all/ }),
    ).toBeInTheDocument();
  });
});

describe('View card', () => {
  const sheet = (name: string) => screen.getByRole('dialog', { name });

  it('shows a bank account, its last ten entries and its subscriptions, and corrects its balance', async () => {
    const data = baseData();
    for (let day = 1; day <= 12; day++) {
      data.tables.expense.push(
        makeExpense({
          amount: day * 1_00,
          note: `Coffee ${day}`,
          accountId: MAIN,
          date: `2026-10-${String(day).padStart(2, '0')}`,
        }),
      );
    }
    data.tables.expense.push(
      makeExpense({ note: 'On the card', accountId: VISA, date: '2026-10-13' }),
    );
    data.tables.income.push(
      makeIncome({ label: 'Salary', amount: 2_000_00, accountId: MAIN, date: '2026-10-13' }),
    );
    data.tables.subscription.push(
      makeSubscription({
        name: 'Netflix',
        amount: 15_99,
        accountId: MAIN,
        nextRenewal: '2026-10-20',
      }),
      makeSubscription({ name: 'Spotify', accountId: VISA, nextRenewal: '2026-10-22' }),
    );
    renderCards(data);
    await userEvent.click(action('View card'));
    const main = within(sheet('Main account'));
    const entries = main.getByRole('list', { name: 'Latest entries' });
    const titles = within(entries)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('b')?.textContent);
    expect(titles).toEqual([
      'Salary',
      'Coffee 12',
      'Coffee 11',
      'Coffee 10',
      'Coffee 9',
      'Coffee 8',
      'Coffee 7',
      'Coffee 6',
      'Coffee 5',
      'Coffee 4',
    ]);
    const subs = main.getByRole('list', { name: 'Subscriptions' });
    expect(
      within(subs)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('b')?.textContent),
    ).toEqual(['Netflix']);
    await userEvent.click(main.getByRole('button', { name: 'Correct the balance' }));
    expect(screen.getByRole('dialog', { name: /balance/i })).toBeInTheDocument();
  });

  it('writes a bank account’s facts as plain rows, as a credit card’s are', async () => {
    renderCards();
    await userEvent.click(action('View card'));
    const facts = within(sheet('Main account')).getByText('Balance').closest('dl')!;
    expect(facts).toHaveClass('divide-y', 'divide-black/7', 'dark:divide-white/8');
    expect(facts).not.toHaveClass('grid', 'grid-cols-2');
    expect(facts.children).toHaveLength(3);
    for (const label of ['Balance', 'Opened', 'In Available']) {
      const term = within(facts).getByText(label);
      expect(term, label).toHaveClass('text-muted');
      expect(term.parentElement, label).toHaveClass('flex', 'justify-between');
      expect(term.nextElementSibling, label).toHaveClass('font-extrabold', 'tabular-nums');
    }
    // dl, dt and dd stay, so a screen reader still hears the pairs.
    expect(within(facts).getByText('Balance').tagName).toBe('DT');
    expect(within(facts).getByText('In Available').nextElementSibling?.tagName).toBe('DD');
  });

  it('pays a credit card from its sheet', async () => {
    renderCards();
    await userEvent.click(card('Visa'));
    await userEvent.click(action('View card'));
    const visaSheet = within(sheet('Visa'));
    expect(visaSheet.queryByRole('button', { name: 'Correct the balance' })).toBeNull();
    await userEvent.click(visaSheet.getByRole('button', { name: 'Pay the card' }));
    expect(screen.getByRole('dialog', { name: 'Pay Visa' })).toBeInTheDocument();
  });
});

describe('Settings', () => {
  it('edits the selected account: name, last 4 and whether it counts in Available', async () => {
    const store = await renderReal();
    await userEvent.click(action('Settings'));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit card' }));
    expect(dialog.getByLabelText('Name')).toHaveValue('Main account');
    expect(dialog.getByRole('switch', { name: 'Count it in Available to spend' })).toBeChecked();
    await userEvent.clear(dialog.getByLabelText('Name'));
    await userEvent.type(dialog.getByLabelText('Name'), 'Everyday');
    await userEvent.type(dialog.getByLabelText('Last 4 digits'), '1234');
    await userEvent.click(dialog.getByRole('switch', { name: 'Count it in Available to spend' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await toasted('Saved.');
    expect(store.getState().data.tables.account.find((a) => a.id === MAIN)).toMatchObject({
      name: 'Everyday',
      last4: '1234',
      inAvailable: false,
      kind: 'debit',
    });
    expect(card('Everyday')).toBeInTheDocument();
  });

  it('keeps the kind of an account with history', async () => {
    await renderReal((data) => {
      data.tables.expense.push(makeExpense({ accountId: MAIN, date: '2026-10-03' }));
    });
    await userEvent.click(action('Settings'));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit card' }));
    expect(dialog.queryByRole('group', { name: 'Kind' })).toBeNull();
    expect(dialog.getByText('Debit · It has history, so it keeps its kind.')).toBeInTheDocument();
  });

  it('says what is wrong with the last 4 digits', async () => {
    await renderReal();
    await userEvent.click(action('Settings'));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit card' }));
    await userEvent.type(dialog.getByLabelText('Last 4 digits'), '12a');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    expect(dialog.getByLabelText('Last 4 digits')).toHaveAccessibleDescription(
      'Use the last 4 digits.',
    );
  });

  it('adds a cash wallet, which then shows in the carousel', async () => {
    const store = await renderReal();
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a card' }));
    await userEvent.click(dialog.getByRole('radio', { name: 'Cash' }));
    expect(dialog.queryByLabelText('Credit limit')).toBeNull();
    expect(dialog.getByRole('switch', { name: 'Count it in Available to spend' })).toBeChecked();
    await userEvent.type(dialog.getByLabelText('Name'), 'Wallet');
    await userEvent.type(dialog.getByLabelText('Current balance'), '40');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await toasted('Card added.');
    expect(card('Wallet')).toHaveAttribute('aria-label', `Wallet, cash, ${usd(40_00)}`);
    expect(cardButtons()).toHaveLength(4);
    expect(store.getState().data.tables.account.find((a) => a.name === 'Wallet')).toMatchObject({
      kind: 'cash',
      openingBalance: 40_00,
      inAvailable: true,
      credit: null,
    });
  });

  it('adds a credit card with its terms', async () => {
    const store = await renderReal();
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a card' }));
    await userEvent.click(dialog.getByRole('radio', { name: 'Credit' }));
    expect(dialog.queryByRole('switch', { name: 'Count it in Available to spend' })).toBeNull();
    await userEvent.type(dialog.getByLabelText('Name'), 'Amex');
    await userEvent.type(dialog.getByLabelText('Current balance'), '0');
    await userEvent.type(dialog.getByLabelText('Credit limit'), '2000');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await toasted('Card added.');
    expect(store.getState().data.tables.account.find((a) => a.name === 'Amex')).toMatchObject({
      kind: 'credit',
      inAvailable: false,
      credit: expect.objectContaining({ limit: 2_000_00 }),
    });
  });

  it('deletes with the move-subscriptions question, which leaves frozen accounts out', async () => {
    await renderReal((data) => {
      data.tables.account[2] = savings({ frozen: true });
      data.tables.account.push(
        makeAccount({ id: 'cash', name: 'Cash', kind: 'cash', order: 3, openingDate: OPENED }),
      );
      data.tables.subscription.push(
        makeSubscription({ accountId: MAIN, nextRenewal: '2026-11-05' }),
      );
    });
    await userEvent.click(action('Settings'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit card' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    const ask = within(screen.getByRole('dialog', { name: 'Delete Main account?' }));
    const move = ask.getByLabelText('Move its subscriptions to');
    expect([...(move as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Visa (credit card)',
      'Cash',
    ]);
  });
});
