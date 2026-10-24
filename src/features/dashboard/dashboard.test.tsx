import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/app/AppShell';
import { SKIN_COLORS } from '@/domain/cardMark';
import type { Account, CreditTerms, ReminderSettings } from '@/domain/entities';
import { purchaseEntry } from '@/domain/game/shop';
import { historyEntries } from '@/domain/history';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { applyRecords, dueGenerated } from '@/domain/sync';
import { formatDay, formatMonth, formatPercent } from '@/lib/format';
import type { AppState } from '@/store/appStore';
import { HIDDEN_AMOUNT, useAmountsHidden } from '@/store/useAmountsHidden';
import { useSelectedAccount } from '@/store/useSelectedAccount';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { fakeNotifier, onPhone, type FakeNotifier } from '@/test/fakeNotifier';
import {
  localIso,
  makeAccount,
  makeCheckIn,
  makeDividend,
  makeExpense,
  makeIncome,
  makeLedgerEntry,
  makeLegacyPurchase,
  makeProfile,
  makeSale,
  makeSettings,
  makeSubscription,
  makeTransaction,
} from '@/test/fixtures';
import { INBOX_NOW, inboxData } from '@/test/inboxData';
import { freshRealStore } from '@/test/realStore';
import type { StoreApi } from 'zustand/vanilla';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { DashboardScreen } from './DashboardScreen';
import { QuestShopStrip } from './QuestShopStrip';

const actions = vi.hoisted(() => ({
  confirmIncome: vi.fn(async () => {}),
  skipIncome: vi.fn(async () => {}),
  updateSettings: vi.fn(async () => {}),
}));
// The real actions, but for the three a banner calls, which are spies.
vi.mock('@/store/useFinance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useFinance')>();
  return {
    ...actual,
    useFinanceActions: () => ({ ...actual.useFinanceActions(), ...actions }),
  };
});

beforeEach(() => Object.values(actions).forEach((a) => a.mockClear()));
afterEach(() => {
  localStorage.clear();
  useSelectedAccount.setState({ id: null });
  useAmountsHidden.setState({ hidden: false });
  vi.useRealTimers();
});

/** Home with the pages it links to, so a tap can be followed. */
function renderHome(data: DataSnapshot | StoreApi<AppState>, today = TODAY) {
  const store = 'getState' in data ? data : createStubStore({ data, today });
  const page = (title: string) => <h1>{title}</h1>;
  const router = createMemoryRouter(
    [
      { path: '/', element: <DashboardScreen /> },
      ...['/profile', '/inbox', '/cards', '/history', '/subscriptions'].map((path) => ({
        path,
        element: page(path),
      })),
    ],
    { initialEntries: ['/'] },
  );
  const { unmount } = renderWithStore(<RouterProvider router={router} />, store);
  return { router, store, unmount };
}

/** Home inside the app's shell, which holds the Add expense and Add income sheet. */
function renderInShell(data: DataSnapshot) {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '/', element: <DashboardScreen /> }] }],
    { initialEntries: ['/'] },
  );
  renderWithStore(<RouterProvider router={router} />, createStubStore({ data, today: TODAY }));
}

const region = (name: string) => screen.getByRole('region', { name });
// Expected text is built with the app's formatters: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });
const october = formatMonth('2026-10');
/** The element whose own text, split over its children, is exactly `text`. */
const whole = (text: string) => (_content: string, el: Element | null) =>
  el?.textContent === text && [...(el.children ?? [])].every((c) => c.textContent !== text);

/** A Wednesday. */
const TODAY = '2026-10-14';
const OPENED = '2026-09-01';

const mainAccount = (openingBalance = 5_000_00): Account =>
  makeAccount({ openingBalance, openingDate: OPENED, last4: '4312' });

const savingsAccount = (): Account =>
  makeAccount({
    id: 'acct-savings',
    name: 'Savings',
    kind: 'savings',
    skin: 'mint',
    inAvailable: false,
    openingBalance: 3_000_00,
    openingDate: OPENED,
    order: 1,
  });

/** The Visa: owes 230.00, no limit, paid in full on the 21st, unless its terms say otherwise. */
const visaCard = (terms: Partial<CreditTerms> = {}, overrides: Partial<Account> = {}): Account =>
  makeAccount({
    id: 'visa',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    last4: '4242',
    inAvailable: false,
    openingBalance: 230_00,
    openingDate: OPENED,
    order: 3,
    credit: {
      limit: null,
      statementDay: null,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 0,
      interestRate: 0,
      ...terms,
    },
    ...overrides,
  });

/**
 * A month in progress. Main account (4312) opened with 5,000 and Savings with 3,000 on Sep 1; the
 * Visa (4242) owes 230. Spent in October from Main account: rent 1,200, fun 30, food 20, 50 and 20
 * (this week). Bills to come: Streamflix 15.99 (10-20), the Visa 230 (10-21), FitHub 39 (10-28).
 */
function monthData({ income = 0 }: { income?: number } = {}): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ name: 'Test Player', openingDate: OPENED })];
  data.tables.account = [mainAccount(), savingsAccount(), visaCard()];
  data.tables.expense = [
    ['2026-10-01', 'rent', 1_200_00],
    ['2026-10-05', 'entertainment', 30_00],
    ['2026-10-12', 'food', 20_00],
    ['2026-10-13', 'food', 50_00],
    ['2026-10-14', 'food', 20_00],
  ].map(([date, category, amount]) =>
    makeExpense({
      date: date as string,
      category: category as 'rent',
      amount: amount as number,
      createdAt: localIso(date as string),
    }),
  );
  data.tables.subscription = [
    makeSubscription({ name: 'Streamflix', amount: 15_99, nextRenewal: '2026-10-20' }),
    makeSubscription({ name: 'FitHub Gym', amount: 39_00, nextRenewal: '2026-10-28' }),
  ];
  data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 250, coins: 40 })];
  if (income > 0) {
    data.tables.income = [
      makeIncome({ amount: income, date: '2026-10-02', createdAt: localIso('2026-10-02') }),
    ];
  }
  return data;
}

/** The parts the app's formatter writes an amount in: "$", "3,680" and ".00" (or "US$" …). */
function partsOf(minor: number) {
  const parts = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).formatToParts(minor / 100);
  const of = (...types: string[]) =>
    parts
      .filter((p) => types.includes(p.type))
      .map((p) => p.value)
      .join('');
  return { currency: of('currency'), cents: of('decimal', 'fraction') };
}

describe('Home top line', () => {
  it('starts with the avatar, a link to Profile named by the level, wearing its border in a level ring', () => {
    const data = monthData();
    data.tables.settings = [
      makeSettings({
        cosmetics: { theme: 'theme-mono', avatar: 'avatar-rocket', frame: 'frame-gold' },
      }),
    ];
    data.tables.ledger.push(
      makeLedgerEntry({ key: 'bonus', xp: 0, coins: 400 }),
      purchaseEntry('avatar-rocket', 'p1', localIso('2026-10-01')),
      makeLegacyPurchase('frame-gold', 200, 'p2'),
    );
    renderHome(data);
    // 250 XP is level 2. The avatar comes first.
    const [first] = screen.getAllByRole('link');
    expect(first).toHaveAccessibleName('Profile, level 2');
    expect(first).toHaveAttribute('href', '/profile');
    expect(first).toHaveClass('size-11');
    // The ring is 44px in the block's XP colour, filled to the progress through the level.
    const ring = first!.querySelector<HTMLElement>('[role="img"]');
    expect(ring).toHaveStyle({ width: '44px', height: '44px' });
    const arc = [...(ring?.querySelectorAll('circle') ?? [])].at(-1);
    expect(arc).toHaveAttribute('stroke', 'var(--color-hero-xp)');
    const circumference = 2 * Math.PI * ((44 - 3) / 2);
    // 150 of 264 XP.
    expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * (1 - 150 / 264),
      3,
    );
    // The avatar they wear, in the border they wear, small enough that the border clears the ring.
    const face = first!.querySelector<HTMLElement>('svg.lucide-rocket')?.parentElement;
    expect(face).toHaveStyle({ width: '30px', height: '30px' });
    expect(face).toHaveClass('ring-[#d4a017]');
  });

  it('opens Profile from the avatar', async () => {
    const { router } = renderHome(monthData());
    await userEvent.click(screen.getByRole('link', { name: 'Profile, level 2' }));
    expect(router.state.location.pathname).toBe('/profile');
  });

  it('greets by name on one line, and says Hi there without one', () => {
    renderHome(monthData());
    const hello = screen.getByText('Hi, Test Player');
    expect(hello).toHaveClass('truncate');
    // No date, no streak and no coins up here any more.
    expect(screen.queryByText(`· ${formatDay(TODAY)}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open quests$/ })).not.toBeInTheDocument();
  });

  it('says Hi there without a name', () => {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ name: '' })];
    renderHome(data);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('shows the currency as a small glass pill on the block', () => {
    renderHome(monthData());
    const pill = screen.getByText('USD');
    expect(pill).toHaveClass('glass-head', 'min-h-[30px]', 'rounded-full');
    // A placeholder for now: not a control.
    expect(pill.closest('button, a')).toBeNull();
  });

  it('links a plain bell to the inbox, with a dot for what is unread', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: INBOX_NOW });
    const { router } = renderHome(inboxData());
    const bell = screen.getByRole('link', { name: 'Inbox, 7 new' });
    expect(bell).toHaveAttribute('href', '/inbox');
    expect(bell).not.toHaveClass('glass-head');
    expect(bell.querySelector('[data-testid="unread-dot"]')).toBeInTheDocument();
    await userEvent.click(bell);
    expect(router.state.location.pathname).toBe('/inbox');
  });

  it('shows no dot when everything is read', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: INBOX_NOW });
    renderHome(inboxData({ readBefore: '2026-10-14T08:00:00.000Z', read: [] }));
    const bell = screen.getByRole('link', { name: 'Inbox' });
    expect(bell.querySelector('[data-testid="unread-dot"]')).not.toBeInTheDocument();
  });
});

describe('Home hero', () => {
  it('shows the selected account: a bank account by its balance, as Available balance', () => {
    renderHome(monthData());
    // Nothing picked yet: the default account, Main account (5,000 less 1,320 spent).
    const hero = region('Available balance');
    expect(within(hero).getByText(whole(usd(3_680_00)))).toBeInTheDocument();
    expect(
      within(hero).getByRole('button', { name: 'Main account ·· 4312, change account' }),
    ).toBeInTheDocument();
  });

  it('shows a credit card with a limit by what is left to spend, as Available credit', () => {
    const data = monthData();
    data.tables.account[2] = visaCard({ limit: 1_000_00 });
    useSelectedAccount.setState({ id: 'visa' });
    renderHome(data);
    expect(within(region('Available credit')).getByText(whole(usd(770_00)))).toBeInTheDocument();
  });

  it('shows a credit card without a limit by what is owed, as Owed', () => {
    useSelectedAccount.setState({ id: 'visa' });
    renderHome(monthData());
    const hero = region('Owed');
    expect(within(hero).getByText(whole(usd(230_00)))).toBeInTheDocument();
    expect(
      within(hero).getByRole('button', { name: 'Visa ·· 4242, change account' }),
    ).toBeInTheDocument();
  });

  it('falls back to the default account when the one picked has been archived', () => {
    const data = monthData();
    data.tables.account.push(
      makeAccount({ id: 'old', name: 'Old bank', openingDate: OPENED, archivedOn: '2026-10-10' }),
    );
    localStorage.setItem('funancial.selectedAccount', 'old');
    useSelectedAccount.setState({ id: 'old' });
    renderHome(data);
    expect(
      within(region('Available balance')).getByRole('button', {
        name: 'Main account ·· 4312, change account',
      }),
    ).toBeInTheDocument();
    // The choice is kept as it was picked, for the store to resolve.
    expect(localStorage.getItem('funancial.selectedAccount')).toBe('old');
  });

  it('writes the amount big, with the currency and the cents dimmed', () => {
    renderHome(monthData());
    const hero = region('Available balance');
    const amount = within(hero).getByTestId('hero-amount');
    expect(amount.textContent).toBe(usd(3_680_00));
    expect(amount).toHaveClass('text-[52px]', 'font-bold');
    const { currency, cents } = partsOf(3_680_00);
    expect(within(amount).getByText(currency)).toHaveClass('text-head-dim');
    expect(within(amount).getByText(cents)).toHaveClass('text-head-faint');
    // The label is dimmed too, and the eye sits beside it.
    const label = within(hero).getByRole('heading', { name: 'Available balance' });
    expect(label.parentElement).toHaveClass('text-head-dim');
    expect(label.parentElement).toContainElement(
      within(hero).getByRole('button', { name: 'Hide amounts' }),
    );
  });

  /** Home with one account holding `minor`, and the size in px its big amount is written at. */
  function heroPx(minor: number): number {
    const data = emptySnapshot();
    data.tables.profile = [makeProfile({ openingDate: OPENED, salary: null })];
    data.tables.account = [mainAccount(minor)];
    const { unmount } = renderHome(data);
    const px = /text-\[(\d+)px\]/.exec(screen.getByTestId('hero-amount').className)?.[1];
    unmount();
    return Number(px);
  }

  it('writes the amount at 52px, down from 42px', () => {
    expect(heroPx(3_680_00)).toBe(52);
    expect(heroPx(0)).toBe(52);
  });

  it('shrinks a long amount to fit, a step at a time, never under 40px', () => {
    // 123456789 minor units is 1,234,567.89: seven digits before the cents.
    const long = heroPx(123_456_789);
    expect(long).toBeLessThanOrEqual(52);
    expect(long).toBeGreaterThanOrEqual(40);
    expect(long).toBeLessThan(52);
    // The longer the amount, the smaller the type, between 52px and the 40px it stops at.
    const sizes = [12_34, 3_680_00, 123_456_78, 1_234_567_89, 12_345_678_90, 123_456_789_00].map(
      heroPx,
    );
    expect(sizes[0]).toBe(52);
    expect(sizes.at(-1)).toBe(40);
    for (const [i, px] of sizes.entries()) {
      expect(px, `${i}`).toBeGreaterThanOrEqual(40);
      if (i > 0) expect(px, `${i}`).toBeLessThanOrEqual(sizes[i - 1]!);
    }
    expect(new Set(sizes).size, 'steps between 52 and 40').toBeGreaterThan(2);
  });

  it('lets the cents wrap under the whole number when even 40px is too wide', () => {
    const data = emptySnapshot();
    data.tables.account = [mainAccount(1_000_000_000_00)];
    renderHome(data);
    const amount = screen.getByTestId('hero-amount');
    expect(amount).toHaveClass('text-[40px]');
    // The whole number and its currency stay together; the cents may drop under them.
    const row = amount.querySelector('.flex-wrap');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('justify-center');
    expect(row!.textContent).toBe(usd(1_000_000_000_00));
  });

  it('keeps the hidden amount at 52px whatever the balance is', async () => {
    useAmountsHidden.setState({ hidden: true });
    const data = emptySnapshot();
    data.tables.account = [mainAccount(123_456_789_00)];
    renderHome(data);
    expect(screen.getByTestId('hero-amount')).toHaveClass('text-[52px]');
    expect(screen.getByTestId('hero-amount')).toHaveTextContent('••••');
  });

  it('marks the account with a card when it has its last 4 digits, else a wallet', () => {
    renderHome(monthData());
    const chip = screen.getByRole('button', { name: /, change account$/ });
    expect(chip.querySelector('svg.lucide-credit-card')).toBeInTheDocument();
    act(() => useSelectedAccount.setState({ id: 'acct-savings' }));
    const savings = screen.getByRole('button', { name: 'Savings, change account' });
    expect(savings.querySelector('svg.lucide-wallet')).toBeInTheDocument();
  });

  it('has Pay and More, each with a 44px tap area round a 34px pill', () => {
    renderHome(monthData());
    const pay = screen.getByRole('button', { name: 'Pay' });
    expect(pay).toHaveClass('btn-head', 'h-[34px]', 'hit-44');
    expect(pay.querySelector('svg.lucide-nfc')).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveClass('glass-head', 'size-[34px]', 'hit-44');
    // The Saved chip and the Expense and Income buttons have gone.
    expect(screen.queryByText(/^Saved/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Expense' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Income' })).not.toBeInTheDocument();
  });

  it('says so when there is no account to show yet', () => {
    const { container } = render0();
    expect(screen.getByText('No account yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('keeps the eye with no account, so amounts hidden can be shown again', async () => {
    useAmountsHidden.setState({ hidden: true });
    render0();
    const eye = screen.getByRole('button', { name: 'Hide amounts' });
    expect(eye).toHaveAttribute('aria-pressed', 'true');
    expect(eye).toHaveClass('size-11');
    // Beside the words, as it sits beside the label over an account.
    expect(screen.getByText('No account yet.').parentElement).toContainElement(eye);
    await userEvent.click(eye);
    expect(useAmountsHidden.getState().hidden).toBe(false);
    expect(eye).toHaveAttribute('aria-pressed', 'false');
  });
});

/** Home with nothing set up. */
function render0() {
  const store = createStubStore({ data: emptySnapshot(), today: TODAY });
  return renderWithStore(
    <MemoryRouter>
      <DashboardScreen />
    </MemoryRouter>,
    store,
  );
}

describe('Show on Home', () => {
  it('lists every account in use, with its figure, and checks the one shown', async () => {
    const data = monthData();
    data.tables.account.push(
      makeAccount({
        id: 'old',
        name: 'Old bank',
        openingDate: OPENED,
        order: 5,
        archivedOn: '2026-10-01',
      }),
    );
    data.tables.account[2] = visaCard({ limit: 1_000_00 }, { frozen: true });
    renderHome(data);
    await userEvent.click(screen.getByRole('button', { name: /, change account$/ }));
    const sheet = screen.getByRole('dialog', { name: 'Show on Home' });
    const rows = within(sheet).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      `Main accountDebit ·· 4312${usd(3_680_00)}`,
      `SavingsSavings${usd(3_000_00)}`,
      `VisaCredit ·· 4242 · frozen${usd(770_00)}`,
    ]);
    expect(rows.map((r) => r.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(rows[0]!.querySelector('svg.lucide-check')).toBeInTheDocument();
    expect(rows[1]!.querySelector('svg.lucide-check')).not.toBeInTheDocument();
    expect(
      within(sheet).getByText('Swiping to a card on the Cards tab changes this too.'),
    ).toBeInTheDocument();
  });

  it('shows the account picked, and keeps it as the one selected', async () => {
    renderHome(monthData());
    await userEvent.click(screen.getByRole('button', { name: /, change account$/ }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Show on Home' })).getByRole('button', {
        name: /^Savings/,
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Show on Home' })).not.toBeInTheDocument();
    expect(useSelectedAccount.getState().id).toBe('acct-savings');
    expect(within(region('Available balance')).getByText(whole(usd(3_000_00)))).toBeInTheDocument();
    // The choice is kept on the device, as the Cards tab's is.
    expect(localStorage.getItem('funancial.selectedAccount')).toBe('acct-savings');
  });
});

/** Home on a real store: Main account 1,000.00 (4312), Savings 500.00 and the Visa owing 230.00. */
async function realHome(overrides: { visa?: Partial<Account> } = {}) {
  const { store } = await freshRealStore();
  const { put } = store.getState();
  await put('profile', makeProfile({ openingDate: OPENED, salary: null }));
  await put('account', mainAccount(1_000_00));
  await put('account', { ...savingsAccount(), openingBalance: 500_00 });
  await put('account', visaCard({ limit: 1_000_00 }, overrides.visa));
  renderHome(store);
  return store;
}

describe('Home Pay', () => {
  it('pays with the account shown, and the amount drops by exactly what was paid', async () => {
    const store = await realHome();
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    const sheet = screen.getByRole('dialog', { name: 'Pay with Main account' });
    await userEvent.type(within(sheet).getByLabelText('Amount'), '12.50');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Pay' }));
    expect(await within(sheet).findByRole('status')).toHaveTextContent('Paid');
    expect(store.getState().data.tables.expense).toEqual([
      expect.objectContaining({ accountId: 'acct-main', amount: 12_50, date: TODAY }),
    ]);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(within(region('Available balance')).getByText(whole(usd(987_50)))).toBeInTheDocument();
  });

  it('pays with a card that was picked to show', async () => {
    useSelectedAccount.setState({ id: 'visa' });
    await realHome();
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(screen.getByRole('dialog', { name: 'Pay with Visa' })).toBeInTheDocument();
  });

  it('sends a frozen card to the Cards tab instead of paying', async () => {
    useSelectedAccount.setState({ id: 'visa' });
    const store = await realHome({ visa: { frozen: true } });
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('This card is frozen. Unfreeze it on the Cards tab.');
    const link = within(note).getByRole('link', { name: 'Unfreeze it on the Cards tab.' });
    expect(link).toHaveAttribute('href', '/cards');
    expect(store.getState().data.tables.expense).toEqual([]);

    // Another account shown: the note is gone.
    act(() => useSelectedAccount.setState({ id: 'acct-main' }));
    expect(screen.queryByText(/This card is frozen/)).not.toBeInTheDocument();
  });
});

describe('Home More menu', () => {
  it('offers Move money and Correct a balance', async () => {
    renderHome(monthData());
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Move money', 'Correct a balance']);
  });

  it('corrects the balance of the account shown', async () => {
    useSelectedAccount.setState({ id: 'acct-savings' });
    renderHome(monthData());
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Correct a balance' }));
    const dialog = screen.getByRole('dialog', { name: 'Set actual balance' });
    expect(dialog).toHaveAccessibleDescription('Savings');
    expect(within(dialog).getByText(`Funcial thinks: ${usd(3_000_00)}`)).toBeInTheDocument();
  });

  it('moves 50 from Main account to Savings', async () => {
    const store = await realHome();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move money' }));
    const dialog = screen.getByRole('dialog', { name: 'Move money' });
    // From the account shown, to the savings account; never a credit card.
    expect(within(dialog).getByLabelText('From')).toHaveValue('acct-main');
    expect(within(dialog).getByLabelText('To')).toHaveValue('acct-savings');
    expect(
      within(within(dialog).getByLabelText('To'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Main account', 'Savings']);
    expect(within(dialog).getByLabelText('Date')).toHaveValue(TODAY);
    await userEvent.type(within(dialog).getByLabelText('Amount'), '50');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'For the trip');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Move money' })).not.toBeInTheDocument(),
    );
    expect(store.getState().data.tables.transaction).toEqual([
      expect.objectContaining({
        type: 'transfer',
        amount: 50_00,
        fromAccountId: 'acct-main',
        toAccountId: 'acct-savings',
        date: TODAY,
        note: 'For the trip',
      }),
    ]);
    expect(within(region('Available balance')).getByText(whole(usd(950_00)))).toBeInTheDocument();
  });

  it('asks for two different accounts, an amount and a date that has come', async () => {
    const store = await realHome();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move money' }));
    const dialog = screen.getByRole('dialog', { name: 'Move money' });
    await userEvent.selectOptions(within(dialog).getByLabelText('To'), 'Main account');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(within(dialog).getByLabelText('To')).toHaveAccessibleDescription(
      'Use two different accounts.',
    );
    expect(within(dialog).getByLabelText('Amount')).toHaveAccessibleDescription(
      'Enter an amount like 12.50',
    );
    expect(store.getState().data.tables.transaction).toEqual([]);
  });
});

describe('Home bills coming up', () => {
  it('hangs the bills over the block as round glass bubbles, each with what it is and when', () => {
    renderHome(monthData());
    const bills = screen.getByRole('list', { name: 'Coming up' });
    const links = within(bills).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Streamflix, due in 6 days',
      'Visa card payment, due in 7 days',
      'FitHub Gym, due in 14 days',
    ]);
    expect(links.map((l) => l.textContent)).toEqual([
      'SStreamflix6 days',
      'Visa7 days',
      'FFitHub Gym14 days',
    ]);
    for (const link of links) expect(link).toHaveAttribute('href', '/subscriptions');
    // The disc is the thick glass of what hangs over the block's edge, with its two-tone ring.
    const disc = links[0]!.firstElementChild;
    expect(disc).toHaveClass('glass-strong', 'focus-edge', 'size-[58px]', 'rounded-full');
    expect(links[1]!.querySelector('svg.lucide-credit-card')).toBeInTheDocument();
    // 42px over the block, with 6px above the discs for their ring, which the scrolling row would clip.
    expect(bills).toHaveClass('-mt-[48px]', 'pt-1.5');
  });

  it('opens the bills page from a bubble', async () => {
    const { router } = renderHome(monthData());
    await userEvent.click(screen.getByRole('link', { name: 'Streamflix, due in 6 days' }));
    expect(router.state.location.pathname).toBe('/subscriptions');
  });

  it('shows no bubbles, and no Coming up, with nothing due', () => {
    const data = monthData();
    data.tables.subscription = [];
    data.tables.account = data.tables.account.filter((a) => a.kind !== 'credit');
    renderHome(data);
    expect(screen.queryByText('Coming up')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Coming up' })).not.toBeInTheDocument();
  });
});

describe('Home Quests and Shop strip', () => {
  /**
   * Home with the quests of Wednesday 2026-10-14: today's log, this week's check-in and (with a
   * salary) this month's reconciliation, `done` of them done, and 520 coins in the ledger.
   */
  function questHome({ log = false, checkin = false, salary = true, coins = 520 } = {}) {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({
        openingDate: OPENED,
        salary: salary ? { monthlyAmount: 3_000_00, payDay: 25 } : null,
      }),
    ];
    data.tables.account = [mainAccount()];
    data.tables.ledger = [makeLedgerEntry({ key: 'seed', xp: 0, coins })];
    if (log) {
      data.tables.expense = [makeExpense({ date: TODAY, createdAt: localIso(TODAY) })];
    }
    if (checkin) data.tables.checkIn = [makeCheckIn({ kind: 'weekly', date: '2026-10-12' })];
    return renderHome(data);
  }
  const strip = () => screen.getByTestId('quest-shop-strip');

  it('shows the quests done out of the quests open, with a bar, and the coins with Shop', () => {
    questHome({ log: true, checkin: true });
    const quests = within(strip()).getByRole('link', { name: 'Quests 2/3' });
    expect(quests).toHaveAttribute('href', '/quests');
    // The bar is that fraction: 2 of 3.
    const fill = quests.querySelector('[data-testid="quests-bar-fill"]');
    expect(fill).toHaveStyle({ width: '67%' });
    // The fill is the ink, which holds 3:1 on the glass; the track behind it is not relied on.
    expect(fill).toHaveClass('bg-text');
    const shop = within(strip()).getByRole('link', { name: '520 coins · Shop' });
    expect(shop).toHaveAttribute('href', '/shop');
    expect(shop.querySelector('svg.lucide-coins')).toBeInTheDocument();
  });

  it('counts every quest open, daily, weekly and monthly together, as the Quests screen lists them', () => {
    questHome();
    expect(within(strip()).getByRole('link', { name: 'Quests 0/3' })).toBeInTheDocument();
    expect(
      within(strip())
        .getByRole('link', { name: 'Quests 0/3' })
        .querySelector('[data-testid="quests-bar-fill"]'),
    ).toHaveStyle({ width: '0%' });
  });

  it('says All done when every quest is done', () => {
    questHome({ log: true, checkin: true, salary: false });
    const link = within(strip()).getByRole('link', { name: /All done/ });
    expect(link).toHaveAttribute('href', '/quests');
    expect(within(link).getByText('All done')).toBeInTheDocument();
    // Still the Quests link for a screen reader, which hears what is done.
    expect(link).toHaveAccessibleName('Quests: All done');
    expect(within(strip()).queryByText(/^Quests \d/)).not.toBeInTheDocument();
  });

  it('says 1 coin for one coin, and keeps its tap area 44px', () => {
    questHome({ coins: 1 });
    const shop = within(strip()).getByRole('link', { name: '1 coin · Shop' });
    for (const link of [shop, within(strip()).getByRole('link', { name: /^Quests/ })]) {
      expect(link).toHaveClass('min-h-11');
    }
  });

  it('is one glass strip split in two, under the bubbles and above Overview', () => {
    renderHome(monthData());
    const bar = strip();
    expect(bar).toHaveClass('glass');
    expect(within(bar).getAllByRole('link')).toHaveLength(2);
    const bubbles = screen.getByRole('list', { name: 'Coming up' });
    expect(bubbles.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      bar.compareDocumentPosition(region('Overview')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // It is not a section of its own: Home keeps its sections.
    expect(screen.queryByRole('region', { name: 'Quests' })).not.toBeInTheDocument();
  });

  it('opens Quests and the Shop', async () => {
    const data = emptySnapshot();
    data.tables.account = [mainAccount()];
    const router = createMemoryRouter(
      [
        { path: '/', element: <DashboardScreen /> },
        { path: '/quests', element: <h1>Quests page</h1> },
        { path: '/shop', element: <h1>Shop page</h1> },
      ],
      { initialEntries: ['/'] },
    );
    renderWithStore(<RouterProvider router={router} />, createStubStore({ data, today: TODAY }));
    await userEvent.click(within(strip()).getByRole('link', { name: /^Quests/ }));
    expect(router.state.location.pathname).toBe('/quests');
    await act(() => router.navigate('/'));
    await userEvent.click(within(strip()).getByRole('link', { name: /Shop$/ }));
    expect(router.state.location.pathname).toBe('/shop');
  });

  it('stands below the block when nothing is coming up', () => {
    const data = monthData();
    data.tables.subscription = [];
    data.tables.account = data.tables.account.filter((a) => a.kind !== 'credit');
    renderHome(data);
    expect(screen.queryByRole('list', { name: 'Coming up' })).not.toBeInTheDocument();
    expect(strip()).toBeInTheDocument();
  });

  it('says Quests alone, with no bar, when none is open', () => {
    render(
      <MemoryRouter>
        <QuestShopStrip progress={{ done: 0, open: 0 }} coins={40} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Quests' });
    expect(link).toHaveAttribute('href', '/quests');
    expect(link.querySelector('[data-testid="quests-bar-fill"]')).toBeNull();
    expect(screen.getByRole('link', { name: '40 coins · Shop' })).toHaveAttribute('href', '/shop');
  });
});

describe('Home Overview', () => {
  /** monthData with 2,000 of income on Oct 2, and 1,600 of income and 1,200 spent early in September. */
  function withSeptember() {
    const data = monthData({ income: 2_000_00 });
    data.tables.income.push(
      makeIncome({ amount: 1_600_00, date: '2026-09-02', period: '2026-09' }),
    );
    data.tables.expense.push(makeExpense({ amount: 1_200_00, date: '2026-09-03' }));
    return data;
  }

  it('shows this month so far, in and out, against the same days of last month', () => {
    renderHome(withSeptember());
    const overview = region('Overview');
    const [income, expenses] = within(overview).getAllByRole('button');
    expect(income).toHaveClass('glass');
    expect(within(income!).getByText('Income')).toBeInTheDocument();
    expect(within(income!).getByText(`+${usdWhole(2_000_00)}`)).toHaveClass('text-success');
    // 2,000 against 1,600, and 1,320 against 1,200.
    expect(
      within(income!).getByText(`This month · ${formatPercent(25, true)}`),
    ).toBeInTheDocument();
    expect(within(expenses!).getByText('Expenses')).toBeInTheDocument();
    expect(within(expenses!).getByText(`−${usdWhole(1_320_00)}`)).toHaveClass('text-danger');
    expect(
      within(expenses!).getByText(`This month · ${formatPercent(10, true)}`),
    ).toBeInTheDocument();
    // Each carries a small ＋.
    for (const tile of [income!, expenses!]) {
      expect(tile.querySelector('svg.lucide-plus')?.parentElement).toHaveClass('glass', 'size-7');
    }
  });

  it('says This month alone when last month had nothing to compare with', () => {
    renderHome(monthData({ income: 2_000_00 }));
    const [income] = within(region('Overview')).getAllByRole('button');
    expect(within(income!).getByText('This month')).toBeInTheDocument();
  });

  it('opens History, on this month, from View all', async () => {
    const { router } = renderHome(monthData());
    await userEvent.click(within(region('Overview')).getByRole('link', { name: 'View all' }));
    expect(router.state.location.pathname).toBe('/history');
  });

  it('opens Add income from the Income tile and Add expense from the Expenses tile', async () => {
    renderInShell(monthData());
    const overview = region('Overview');
    await userEvent.click(within(overview).getByRole('button', { name: /^Income.*Add income$/ }));
    const income = screen.getByRole('dialog', { name: 'Add income' });
    expect(within(income).getByLabelText('Amount')).toHaveFocus();
    await userEvent.click(within(income).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Add income' })).not.toBeInTheDocument();

    await userEvent.click(
      within(overview).getByRole('button', { name: /^Expenses.*Add expense$/ }),
    );
    expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeInTheDocument();
  });
});

describe('Home Net worth', () => {
  it('shows the total, this month’s change and line, and what you have and owe', () => {
    renderHome(monthData());
    const worth = region('Net worth');
    const tile = within(worth).getByRole('button', { name: /Net worth: see and correct$/ });
    expect(tile).toHaveClass('glass');
    // 3,680 + 3,000 − 230; 7,770 at the end of September.
    expect(within(tile).getByText(usd(6_450_00))).toBeInTheDocument();
    expect(within(tile).getByText(`−${usd(1_320_00)} this month`)).toHaveClass('text-danger');
    expect(tile.querySelector('[data-testid="net-worth-line"]')).toBeInTheDocument();
    expect(within(tile).getByText(usdWhole(6_680_00)).parentElement).toHaveTextContent(
      `You have ${usdWhole(6_680_00)}`,
    );
    expect(within(tile).getByText(usdWhole(230_00)).parentElement).toHaveTextContent(
      `You owe ${usdWhole(230_00)}`,
    );
    // The split: what you have in the accent, what you owe in grey, in proportion.
    const [have, owe] = [...tile.querySelectorAll('[data-testid="split"] > i')];
    expect(have).toHaveClass('bg-accent');
    expect(have).toHaveStyle({ flexGrow: '668000' });
    expect(owe).toHaveStyle({ flexGrow: '23000' });
  });

  it('shows a rise in the success colour', () => {
    renderHome(monthData({ income: 2_000_00 }));
    expect(within(region('Net worth')).getByText(`+${usd(680_00)} this month`)).toHaveClass(
      'text-success',
    );
  });

  it('shows no change and no line when the data starts after the 1st', () => {
    const data = monthData();
    data.tables.profile = [makeProfile({ name: 'Test Player', openingDate: '2026-10-05' })];
    renderHome(data);
    const worth = region('Net worth');
    expect(within(worth).getByText(usd(6_450_00))).toBeInTheDocument();
    expect(within(worth).queryByText(/this month$/)).not.toBeInTheDocument();
    expect(worth.querySelector('[data-testid="net-worth-line"]')).not.toBeInTheDocument();
  });

  it('opens the Net worth sheet from the tile and from Details', async () => {
    renderHome(monthData());
    const worth = region('Net worth');
    await userEvent.click(within(worth).getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('dialog', { name: 'Net worth' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      within(worth).getByRole('button', { name: /Net worth: see and correct$/ }),
    );
    expect(screen.getByRole('dialog', { name: 'Net worth' })).toBeInTheDocument();
  });
});

describe('Home Recent transactions', () => {
  it('shows the 5 newest entries History shows, as plain rows', () => {
    const data = monthData({ income: 2_000_00 });
    renderHome(data);
    const recent = region('Recent transactions');
    const rows = within(recent).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    // The same five, in the same order.
    const newest = historyEntries(data).slice(0, 5);
    expect(newest.map((e) => e.item.id)).toEqual(rows.map((r) => r.dataset.entry));
    // Written as History writes them (the card by its name and last 4), with the day after History's
    // line, and what is left on the card after the newest row's amount.
    expect(rows.map((r) => r.textContent)).toEqual([
      `FoodFood · Main account ·· 4312 · Today−${usd(20_00)}${usd(5_680_00)} left`,
      `FoodFood · Main account ·· 4312 · Yesterday−${usd(50_00)}`,
      `FoodFood · Main account ·· 4312 · ${formatDay('2026-10-12')}−${usd(20_00)}`,
      `FunFun · Main account ·· 4312 · ${formatDay('2026-10-05')}−${usd(30_00)}`,
      `SalarySalary · to Main account ·· 4312 · ${formatDay('2026-10-02')}+${usd(2_000_00)}`,
    ]);
    expect(within(rows[4]!).getByText(`+${usd(2_000_00)}`)).toHaveClass('text-success');
    expect(within(rows[0]!).getByText(`−${usd(20_00)}`)).toHaveClass('text-danger');
    expect(within(recent).getByRole('list')).toHaveClass('divide-y');
  });

  it('opens History from View all', async () => {
    const { router } = renderHome(monthData());
    await userEvent.click(
      within(region('Recent transactions')).getByRole('link', { name: 'View all' }),
    );
    expect(router.state.location.pathname).toBe('/history');
  });

  it('says so when there is nothing yet', () => {
    render0();
    expect(
      within(region('Recent transactions')).getByText('Nothing here yet.'),
    ).toBeInTheDocument();
  });
});

describe('Home Recent transactions name the card', () => {
  const recent = () => region('Recent transactions');
  const rowOf = (title: string) =>
    within(recent()).getByText(title, { selector: 'b' }).closest('li')!;

  /** monthData with `extra` entries added, the Visa's limit set. */
  function withNewest(make: (data: DataSnapshot) => void, limit: number | null = null) {
    const data = monthData();
    data.tables.account[2] = visaCard({ limit });
    make(data);
    return data;
  }

  it('draws a mark in each card’s colour before its name and last 4', () => {
    const data = monthData();
    data.tables.expense.push(
      makeExpense({
        id: 'swim',
        note: 'Swim',
        accountId: 'visa',
        category: 'health',
        date: TODAY,
        createdAt: `${TODAY}T11:00:00.000Z`,
      }),
    );
    renderHome(data);
    const swim = rowOf('Swim');
    const mark = swim.querySelector('[data-card-mark]');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveStyle({ backgroundColor: SKIN_COLORS.violet });
    expect(swim).toHaveTextContent('Health · Visa ·· 4242 · Today');
    // Main account's is midnight, drawn the same way.
    const food = within(recent()).getAllByText('Food', { selector: 'b' })[0]!.closest('li')!;
    expect(food.querySelector('[data-card-mark]')).toHaveStyle({
      backgroundColor: SKIN_COLORS.midnight,
    });
  });

  it('says what is left on the card on the newest row only', () => {
    renderHome(monthData());
    const rows = within(recent()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(`${usd(3_680_00)} left`);
    for (const row of rows.slice(1)) expect(row).not.toHaveTextContent(/ left| owed/);
  });

  it('says what a card owes, or what is left to spend on one, from the same figure as Home', () => {
    const spend = (data: DataSnapshot) =>
      data.tables.expense.push(
        makeExpense({
          id: 'visa-spend',
          note: 'Visa spend',
          accountId: 'visa',
          amount: 25_00,
          date: TODAY,
          createdAt: `${TODAY}T12:00:00.000Z`,
        }),
      );
    // No limit: it owes 230 and now 25 more.
    const { unmount } = renderHome(withNewest(spend));
    expect(rowOf('Visa spend')).toHaveTextContent(`${usd(255_00)} owed`);
    unmount();
    // A 1,000 limit: 1,000 less the 255 owed.
    renderHome(withNewest(spend, 1_000_00));
    expect(rowOf('Visa spend')).toHaveTextContent(`${usd(745_00)} left`);
    expect(rowOf('Visa spend')).not.toHaveTextContent('owed');
  });

  it('says nothing is left on a row that moved no money: an income not counted yet', () => {
    const data = monthData();
    data.tables.income.push(
      makeIncome({
        id: 'pending',
        label: 'Pending pay',
        status: 'expected',
        date: TODAY,
        createdAt: `${TODAY}T13:00:00.000Z`,
        accountId: 'acct-main',
      }),
    );
    renderHome(data);
    expect(rowOf('Pending pay')).toHaveTextContent('Expected');
    expect(recent()).not.toHaveTextContent(/ left| owed/);
  });

  it('says nothing is left on an income that did not arrive', () => {
    const data = monthData();
    data.tables.income.push(
      makeIncome({
        id: 'missed',
        label: 'Missed pay',
        status: 'skipped',
        date: TODAY,
        createdAt: `${TODAY}T13:00:00.000Z`,
        accountId: 'acct-main',
      }),
    );
    renderHome(data);
    expect(rowOf('Missed pay')).toHaveTextContent("Didn't arrive");
    expect(recent()).not.toHaveTextContent(/ left| owed/);
  });

  it('says nothing is left on an account no longer in use', () => {
    const data = monthData();
    data.tables.account[1] = { ...savingsAccount(), archivedOn: '2026-10-10' };
    data.tables.expense.push(
      makeExpense({
        id: 'old',
        note: 'Old spend',
        accountId: 'acct-savings',
        date: TODAY,
        createdAt: `${TODAY}T14:00:00.000Z`,
      }),
    );
    renderHome(data);
    expect(rowOf('Old spend')).toHaveTextContent('Savings');
    expect(recent()).not.toHaveTextContent(/ left| owed/);
  });

  it('says nothing is left on a reinvested dividend, which moved money on no account', () => {
    const data = monthData();
    data.tables.dividend.push(
      makeDividend({
        id: 'drip',
        symbol: 'KO',
        reinvested: true,
        accountId: null,
        sharesAdded: 0.2,
        paidOn: TODAY,
        createdAt: `${TODAY}T15:00:00.000Z`,
      }),
    );
    renderHome(data);
    // It is the newest row, the one that would say what is left.
    const newest = within(recent()).getAllByRole('listitem')[0]!;
    expect(newest).toHaveTextContent('Dividend · KO');
    expect(newest).toHaveTextContent('Reinvested');
    expect(recent()).not.toHaveTextContent(/ left| owed/);
  });

  it('says nothing is left on an entry on an account that was deleted', () => {
    const data = monthData();
    data.tables.expense.push(
      makeExpense({
        id: 'ghost',
        note: 'Ghost spend',
        accountId: 'deleted-account',
        date: TODAY,
        createdAt: `${TODAY}T14:30:00.000Z`,
      }),
    );
    renderHome(data);
    expect(within(recent()).getAllByRole('listitem')[0]).toHaveTextContent('Ghost spend');
    expect(recent()).not.toHaveTextContent(/ left| owed/);
  });

  it('masks the figure with the eye, as every amount is', async () => {
    renderHome(monthData());
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    const newest = within(recent()).getAllByRole('listitem')[0]!;
    expect(newest).toHaveTextContent(`${HIDDEN_AMOUNT} left`);
    expect(newest).not.toHaveTextContent('3,680');
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    expect(newest).toHaveTextContent(`${usd(3_680_00)} left`);
  });

  it('starts hidden when the amounts were hidden before', () => {
    useAmountsHidden.setState({ hidden: true });
    renderHome(monthData());
    expect(within(recent()).getAllByRole('listitem')[0]).toHaveTextContent(`${HIDDEN_AMOUNT} left`);
  });
});

describe('Home Recent transactions, edited and deleted as History does', () => {
  /** Home and History over a real store: a cup of tea (12.50) today and a stock buy (500.00) yesterday. */
  async function recentHome() {
    const { store } = await freshRealStore();
    const { put } = store.getState();
    await put('profile', makeProfile({ openingDate: OPENED, salary: null }));
    await put('account', mainAccount(1_000_00));
    await put(
      'expense',
      makeExpense({
        id: 'tea',
        note: 'Tea',
        amount: 12_50,
        category: 'food',
        date: TODAY,
        accountId: 'acct-main',
        createdAt: `${TODAY}T09:00:00.000Z`,
      }),
    );
    await put(
      'transaction',
      makeTransaction({
        id: 'buy',
        type: 'investment',
        note: 'Bought KO',
        amount: 500_00,
        date: '2026-10-13',
        fromAccountId: 'acct-main',
        toAccountId: null,
        createdAt: '2026-10-13T09:00:00.000Z',
      }),
    );
    const router = createMemoryRouter(
      [
        { path: '/', element: <DashboardScreen /> },
        { path: '/history', element: <HistoryScreen /> },
      ],
      { initialEntries: ['/'] },
    );
    renderWithStore(<RouterProvider router={router} />, store);
    return { store, router };
  }
  const recent = () => region('Recent transactions');

  it('opens the edit form History uses from an expense, and History shows the change', async () => {
    const { store, router } = await recentHome();
    await userEvent.click(within(recent()).getByRole('button', { name: /^Tea/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit expense' });
    const amount = within(dialog).getByLabelText('Amount');
    expect(amount).toHaveValue('12.50');
    await userEvent.clear(amount);
    await userEvent.type(amount, '15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit expense' })).not.toBeInTheDocument(),
    );
    expect(store.getState().data.tables.expense).toEqual([
      expect.objectContaining({ id: 'tea', amount: 15_00 }),
    ]);
    // Recent counts it at once, and so does History.
    expect(within(recent()).getByText(`−${usd(15_00)}`)).toBeInTheDocument();
    await userEvent.click(within(recent()).getByRole('link', { name: 'View all' }));
    expect(router.state.location.pathname).toBe('/history');
    const tea = screen.getByRole('button', { name: /^Tea/ });
    expect(within(tea).getByText(`−${usd(15_00)}`)).toBeInTheDocument();
  });

  it('offers a delete on every other row, and an expense none, as History does', async () => {
    await recentHome();
    const buy = within(recent()).getByText('Bought KO', { selector: 'b' }).closest('li')!;
    expect(within(buy).getByRole('button', { name: 'Delete Bought KO' })).toHaveClass('size-11');
    const tea = within(recent()).getByRole('button', { name: /^Tea/ }).closest('li')!;
    expect(within(tea).queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('deletes a stock buy after asking with the words History asks', async () => {
    const { store } = await recentHome();
    await userEvent.click(within(recent()).getByRole('button', { name: 'Delete Bought KO' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this entry?' });
    expect(dialog).toHaveTextContent('Bought KO will be removed from your history.');
    // Cancel keeps it.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().data.tables.transaction).toHaveLength(1);
    await userEvent.click(within(recent()).getByRole('button', { name: 'Delete Bought KO' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete this entry?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(store.getState().data.tables.transaction).toEqual([]));
    expect(within(recent()).queryByText('Bought KO')).not.toBeInTheDocument();
  });

  it('says the shares go back before deleting a sale, as History does', async () => {
    const { store } = await freshRealStore();
    const { put } = store.getState();
    await put('profile', makeProfile({ openingDate: OPENED, salary: null }));
    await put('account', mainAccount(1_000_00));
    await put(
      'sale',
      makeSale({ id: 'sold', symbol: 'AAPL', shares: 2, soldOn: TODAY, toAccountId: 'acct-main' }),
    );
    renderHome(store);
    await userEvent.click(within(recent()).getByRole('button', { name: 'Delete Sold 2 AAPL' }));
    expect(screen.getByRole('dialog', { name: 'Delete this entry?' })).toHaveTextContent(
      'its shares go back to your AAPL holding',
    );
  });
});

describe('Home sections', () => {
  it('keeps to the bubbles, the banners, Overview, Net worth and Recent transactions', () => {
    renderHome(monthData());
    const page = screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => !heading.closest('dialog'));
    expect(page.map((h) => h.textContent)).toEqual([
      'Available balance',
      'Coming up',
      'Overview',
      'Net worth',
      'Recent transactions',
    ]);
    for (const gone of ['Spending', 'Last 7 days', 'Limits', 'Goals', 'Quests']) {
      expect(screen.queryByRole('region', { name: gone })).not.toBeInTheDocument();
    }
  });
});

describe('Home salary', () => {
  /** A $3,000.00 salary paid on the 25th into Main account, set up on 2026-09-01. */
  const sal = (() => {
    const data = emptySnapshot();
    data.tables.profile = [
      makeProfile({
        openingDate: OPENED,
        salary: { monthlyAmount: 3_000_00, payDay: 25 },
      }),
    ];
    data.tables.account = [mainAccount(), savingsAccount(), visaCard()];
    data.tables.settings = [makeSettings({ defaultAccountId: 'acct-main' })];
    return { data };
  })();

  const due = () => applyRecords(sal.data, dueGenerated(sal.data, '2026-10-25'));

  it('asks whether an expected salary arrived and confirms the amount', async () => {
    renderHome(due(), '2026-10-25');
    expect(
      screen.getByText(`Your ${october} salary is expected: ${usd(3_000_00)}. Did it arrive?`),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    expect(within(dialog).getByLabelText('Amount received')).toHaveValue('3,000.00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(actions.confirmIncome).toHaveBeenCalledWith('salary-2026-10', 300000, 'acct-main');
  });

  it('asks which account the salary went to, starting on its own, and never a card', async () => {
    renderHome(due(), '2026-10-25');
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    const to = within(dialog).getByLabelText('Goes to');
    expect(to).toHaveValue('acct-main');
    expect(
      within(to)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Main account', 'Savings']);
    await userEvent.selectOptions(to, 'Savings');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(actions.confirmIncome).toHaveBeenCalledWith('salary-2026-10', 300000, 'acct-savings');
  });

  it('confirms a salary left on an archived account into one still in use', async () => {
    const data = due();
    // Main account was archived after the salary was expected on it; Savings is the one left.
    data.tables.account = data.tables.account.map((a) =>
      a.id === 'acct-main' ? { ...a, archivedOn: '2026-10-25' } : a,
    );
    expect(data.tables.income[0]).toMatchObject({ status: 'expected', accountId: 'acct-main' });
    renderHome(data, '2026-10-25');
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    const to = within(dialog).getByLabelText('Goes to');
    expect(to).toHaveValue('acct-savings');
    expect(
      within(to)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Savings']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(actions.confirmIncome).toHaveBeenCalledWith('salary-2026-10', 300000, 'acct-savings');
  });

  it('asks for an account when none is left to take the salary', async () => {
    const data = due();
    data.tables.account = data.tables.account.map((a) =>
      a.kind === 'credit' ? a : { ...a, archivedOn: '2026-10-25' },
    );
    renderHome(data, '2026-10-25');
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(within(dialog).getByLabelText('Goes to')).toHaveAccessibleDescription(
      'Pick an account.',
    );
    expect(actions.confirmIncome).not.toHaveBeenCalled();
  });

  it('confirms the salary on a line field', async () => {
    renderHome(due(), '2026-10-25');
    await userEvent.click(screen.getByRole('button', { name: `Confirm ${october} salary` }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm salary' });
    const amount = within(dialog).getByLabelText('Amount received');
    expect(amount).toHaveClass('border-b', 'font-extrabold');
    expect(amount).not.toHaveClass('rounded-md');
  });

  it('lets a salary that never came be marked as not arrived', async () => {
    renderHome(due(), '2026-10-25');
    await userEvent.click(
      screen.getByRole('button', { name: `Didn't arrive (${october} salary)` }),
    );
    expect(actions.skipIncome).toHaveBeenCalledWith('salary-2026-10');
  });

  it('shows no freeze banner', () => {
    renderHome(structuredClone(sal.data), '2026-10-02');
    expect(screen.queryByText(/Salary freeze/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bills and subscriptions still apply/)).not.toBeInTheDocument();
  });

  it('puts the banners under the bills coming up, before Overview', () => {
    renderHome(due(), '2026-10-25');
    const [banner] = screen.getAllByText(/salary is expected/);
    const bills = screen.getByRole('list', { name: 'Coming up' });
    const overview = region('Overview');
    expect(bills.compareDocumentPosition(banner!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      banner!.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('Home reminders invitation', () => {
  const INVITE = 'Get reminders for bills, renewals and a daily nudge to log spending.';
  const BLOCKED =
    'Notifications are blocked for Funcial. Turn them on in Android Settings → Apps → Funcial → Notifications.';
  /** Nobody has been asked yet: off, and not prompted. */
  const fresh = makeSettings().reminders;

  function dataWith(reminders: ReminderSettings) {
    const data = emptySnapshot();
    data.tables.settings = [makeSettings({ reminders })];
    return data;
  }

  function renderOnPhone(
    notifier: FakeNotifier | null,
    reminders = fresh,
    namespace: 'real' | 'demo' = 'real',
  ) {
    return renderWithStore(
      onPhone(
        notifier,
        <MemoryRouter>
          <DashboardScreen />
        </MemoryRouter>,
      ),
      createStubStore({ data: dataWith(reminders), namespace, today: '2026-10-14' }),
    );
  }

  it('offers reminders once and remembers Not now', async () => {
    const notifier = fakeNotifier();
    const { store } = renderOnPhone(notifier);
    expect(screen.getByText(INVITE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(actions.updateSettings).toHaveBeenCalledExactlyOnceWith({
      reminders: { ...fresh, prompted: true },
    });
    expect(notifier.request).not.toHaveBeenCalled();

    // Saved, so it is not offered again.
    act(() => store.setState({ data: dataWith({ ...fresh, prompted: true }) }));
    expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
  });

  it('does not offer reminders on the web, in the demo, or once they are on or answered', () => {
    const web = renderWithStore(
      <MemoryRouter>
        <DashboardScreen />
      </MemoryRouter>,
      createStubStore({ data: dataWith(fresh), today: '2026-10-14' }),
    );
    expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
    web.unmount();

    const cases: Array<[ReminderSettings, 'real' | 'demo']> = [
      [fresh, 'demo'],
      [{ ...fresh, enabled: true }, 'real'],
      [{ ...fresh, prompted: true }, 'real'],
      [{ ...fresh, enabled: true, prompted: true }, 'real'],
    ];
    for (const [reminders, namespace] of cases) {
      const view = renderOnPhone(fakeNotifier(), reminders, namespace);
      expect(screen.queryByText(INVITE)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('asks Android on Turn on, then saves reminders as on', async () => {
    const notifier = fakeNotifier();
    renderOnPhone(notifier);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(notifier.request).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(actions.updateSettings).toHaveBeenCalledExactlyOnceWith({
        reminders: { ...fresh, enabled: true, prompted: true },
      }),
    );
  });

  it('explains how to unblock notifications when Android refuses, and saves nothing', async () => {
    const notifier = fakeNotifier({ request: async () => false });
    renderOnPhone(notifier);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(actions.updateSettings).not.toHaveBeenCalled();
    // Still on offer: they can fix it in Android's settings and try again, or dismiss it.
    expect(screen.getByText(INVITE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });
});

describe('Home account reminder', () => {
  const ASK = 'Make an account so you can move to a new phone and keep everything.';

  function renderWithAccount(namespace: 'real' | 'demo' = 'real') {
    localStorage.clear();
    return renderWithStore(
      withAccount(
        fakeAccount(),
        <MemoryRouter>
          <DashboardScreen />
        </MemoryRouter>,
      ),
      createStubStore({ data: monthData(), namespace, today: '2026-10-14' }),
    );
  }

  it('asks a real-data install without an account, once', async () => {
    renderWithAccount();
    expect(screen.getByText(ASK)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });

  it('never asks in the demo', () => {
    renderWithAccount('demo');
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });
});

describe('Home with amounts hidden', () => {
  const RUN = /\d[\d.,]*\d|\d/g;
  /**
   * Every run of digits that is read on the page, in its text and in the names it gives to
   * assistive tech: "1,320.00", "21", "88". Each text node on its own, as neighbours ("3" beside
   * "40") would run together into one.
   */
  const digitRuns = () => {
    const read: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      read.push(node.nodeValue ?? '');
    }
    for (const el of document.body.querySelectorAll('[aria-label],[aria-valuetext]')) {
      read.push(el.getAttribute('aria-label') ?? '', el.getAttribute('aria-valuetext') ?? '');
    }
    return read.flatMap((text) => text.match(RUN) ?? []);
  };
  /** The digits an amount is written with, whole and exact: ["1,320", "1,320.00"]. */
  const writtenAs = (minor: number) =>
    [usd(minor), usdWhole(minor)].flatMap((text) => text.match(RUN) ?? []);

  it('has the eye beside the label: a plain eye with a 44px target', () => {
    renderHome(monthData());
    const eye = screen.getByRole('button', { name: 'Hide amounts' });
    expect(eye).toHaveClass('size-11');
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    expect(eye.querySelector('svg.lucide-eye')).toBeInTheDocument();
    // No circle in it.
    expect(eye.querySelector('span')).toBeNull();
  });

  it('shows no amount and four bullets in their place after the eye is pressed', async () => {
    renderHome(monthData({ income: 2_000_00 }));
    // The hero (5,000 + 2,000 − 1,320), the tiles, net worth, its change, have and owe, and the rows.
    const known = [5_680_00, 2_000_00, 1_320_00, 8_450_00, 680_00, 8_680_00, 230_00, 20_00, 50_00];
    // The hero writes its cents apart, dimmed.
    expect(digitRuns()).toEqual(expect.arrayContaining(['5,680', '1,320', '8,450.00']));

    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));

    const runs = digitRuns();
    for (const minor of known) {
      for (const written of writtenAs(minor)) expect(runs, written).not.toContain(written);
    }
    expect(screen.getAllByText(/••••/).length).toBeGreaterThan(6);
    expect(screen.getByRole('button', { name: 'Hide amounts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.querySelector('svg.lucide-eye-off')).toBeInTheDocument();
    // Names, dates and directions stay.
    expect(screen.getByText('Streamflix')).toBeInTheDocument();
    expect(screen.getByText('Hi, Test Player')).toBeInTheDocument();
    expect(screen.getByText('+•••• this month')).toHaveClass('text-success');
    // The split would give the share away: it is one plain track.
    expect(document.querySelectorAll('[data-testid="split"] > i')).toHaveLength(1);
  });

  it('shows the amounts again when the eye is pressed again', async () => {
    renderHome(monthData());
    const eye = screen.getByRole('button', { name: 'Hide amounts' });
    await userEvent.click(eye);
    await userEvent.click(eye);
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    expect(digitRuns()).toContain('3,680');
    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
  });

  it('hides the figures in Show on Home too', async () => {
    renderHome(monthData());
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    await userEvent.click(screen.getByRole('button', { name: /, change account$/ }));
    const sheet = screen.getByRole('dialog', { name: 'Show on Home' });
    expect(within(sheet).getAllByText('••••')).toHaveLength(3);
  });
});
