import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SKIN_COLORS } from '@/domain/cardMark';
import { historyEntries, type Entry } from '@/domain/history';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { AccountSheet } from '@/features/cards/AccountSheet';
import { RecentSection } from '@/features/dashboard/RecentSection';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { formatDay } from '@/lib/format';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import {
  makeAccount,
  makeDebt,
  makeDividend,
  makeExpense,
  makeIncome,
  makeProfile,
  makeSale,
  makeSettings,
  makeTransaction,
} from '@/test/fixtures';
import { entryLine } from './entryLine';

const TODAY = '2026-10-14';
const MAIN = 'acct-main';
const SAVINGS = 'acct-savings';
const VISA = 'visa';

// Expected text is built with the app's formatter: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');

/**
 * Main account, Savings and a Visa, with a salary still expected, a dividend skipped, a transfer
 * from Main account to Savings and a payment from Main account onto the Visa, a day apart.
 */
function data(): DataSnapshot {
  const d = emptySnapshot();
  d.tables.profile.push(makeProfile({ openingDate: '2026-10-01', salary: null }));
  d.tables.settings.push(makeSettings({ defaultAccountId: MAIN }));
  d.tables.account.push(
    makeAccount({ id: MAIN, openingDate: '2026-10-01' }),
    makeAccount({
      id: SAVINGS,
      name: 'Savings',
      kind: 'savings',
      inAvailable: false,
      order: 1,
      openingDate: '2026-10-01',
    }),
    makeAccount({
      id: VISA,
      name: 'Visa',
      kind: 'credit',
      inAvailable: false,
      order: 2,
      openingDate: '2026-10-01',
      openingBalance: 230_00,
      credit: {
        limit: null,
        statementDay: null,
        dueDay: 21,
        payInFull: true,
        minimumPayment: 0,
        interestRate: 0,
      },
    }),
  );
  d.tables.income.push(
    makeIncome({
      id: 'salary',
      label: 'Salary',
      source: 'salary',
      status: 'expected',
      amount: 3_000_00,
      accountId: MAIN,
      date: '2026-10-13',
    }),
  );
  d.tables.dividend.push(
    makeDividend({
      id: 'skipped',
      symbol: 'AAPL',
      paidOn: '2026-10-12',
      status: 'skipped',
      amount: 0,
      accountId: null,
    }),
  );
  d.tables.transaction.push(
    makeTransaction({
      id: 'move',
      type: 'transfer',
      amount: 500_00,
      date: '2026-10-11',
      fromAccountId: MAIN,
      toAccountId: SAVINGS,
    }),
    makeTransaction({
      id: 'card',
      type: 'card_payment',
      amount: 30_00,
      date: '2026-10-10',
      fromAccountId: MAIN,
      toAccountId: VISA,
    }),
  );
  return d;
}

const store = () => createStubStore({ data: data(), today: TODAY });
const renderHistory = () =>
  renderWithStore(
    <MemoryRouter>
      <HistoryScreen />
    </MemoryRouter>,
    store(),
  );
const renderRecent = () =>
  renderWithStore(
    <MemoryRouter>
      <RecentSection entries={historyEntries(data())} />
    </MemoryRouter>,
    store(),
  );
const renderSheet = (accountId: string) =>
  renderWithStore(
    <MemoryRouter>
      <AccountSheet accountId={accountId} onClose={vi.fn()} />
    </MemoryRouter>,
    store(),
  );

/** How a row reads: its title, its chip, its amount as written, and whether that is money in. */
interface Reading {
  title: string;
  chip?: string;
  amount: string;
  /** Money in, in the success colour. */
  in?: boolean;
  /** The line under the title, where the list writes one. */
  detail?: string;
}

/** The row titled `title` reads as `reading`. */
function expectRow({ title, chip, amount, in: moneyIn = false, detail }: Reading) {
  const row = screen.getByText(title, { selector: 'b, span' }).closest('li');
  if (!row) throw new Error(`No row for ${title}`);
  const inRow = within(row);
  if (chip) expect(inRow.getByText(chip), `${title}: chip`).toBeInTheDocument();
  else expect(inRow.queryByText(/^(Expected|Didn't arrive)$/), `${title}: no chip`).toBeNull();
  const written = inRow.getByText(amount);
  if (moneyIn) expect(written, `${title}: in colour`).toHaveClass('text-success');
  else expect(written, `${title}: not money in`).not.toHaveClass('text-success');
  if (detail) expect(row, `${title}: detail`).toHaveTextContent(detail);
}

/**
 * What History writes for each entry, the reference the other lists read alike, with the line under
 * the title in History and in Home's Recent, which adds the day as it lists days together.
 */
const CASES: Array<Reading & { history: string; recent: string }> = [
  {
    title: 'Salary',
    chip: 'Expected',
    amount: `+${usd(3_000_00)}`,
    in: true,
    history: 'Salary · to Main account',
    recent: 'Salary · to Main account · Yesterday',
  },
  {
    title: 'Skipped dividend · AAPL',
    amount: usd(0),
    history: '',
    recent: formatDay('2026-10-12'),
  },
  {
    title: 'Main account → Savings',
    amount: usd(500_00),
    history: '',
    recent: formatDay('2026-10-11'),
  },
  {
    title: 'Main account → Visa',
    amount: `−${usd(30_00)}`,
    history: 'Card payment',
    recent: `Card payment · ${formatDay('2026-10-10')}`,
  },
];

describe('one History entry, read alike in History, Home and the account sheet', () => {
  it.each(CASES)('reads $title in History, the reference', ({ history, recent, ...reading }) => {
    void recent;
    renderHistory();
    expectRow({ ...reading, detail: history });
  });

  it.each(CASES)("reads $title the same in Home's Recent", ({ history, recent, ...reading }) => {
    void history;
    renderRecent();
    expectRow({ ...reading, detail: recent });
  });

  it('reads an expected salary the same on the account sheet, never 0.00', () => {
    renderSheet(MAIN);
    const { history, recent, ...expected } = CASES[0]!;
    void history;
    void recent;
    // The sheet is the account's own, so the line leaves its name out, and it names the day as "On this card" does.
    expectRow({ ...expected, detail: 'Salary · Yesterday' });
    const sheet = within(screen.getByRole('dialog', { name: 'Main account' }));
    expect(sheet.queryByText(usd(0))).toBeNull();
  });

  it("reads a transfer and a card payment from the account's side on its sheet", () => {
    const { unmount } = renderSheet(MAIN);
    expectRow({
      title: 'To Savings',
      amount: `−${usd(500_00)}`,
      detail: `Transfer · ${formatDay('2026-10-11')}`,
    });
    expectRow({
      title: 'Paid Visa',
      amount: `−${usd(30_00)}`,
      detail: `Card payment · ${formatDay('2026-10-10')}`,
    });
    unmount();

    const savings = renderSheet(SAVINGS);
    expectRow({ title: 'From Main account', amount: `+${usd(500_00)}` });
    savings.unmount();

    renderSheet(VISA);
    expectRow({ title: 'Payment from Main account', amount: `+${usd(30_00)}` });
  });

  it('lists no skipped dividend on a sheet, as a skipped payout goes to no account', () => {
    renderSheet(MAIN);
    expect(screen.queryByText(/dividend/i)).toBeNull();
  });
});

describe('entryLine', () => {
  const d = data();
  const context = { accounts: d.tables.account, debts: d.tables.debt };
  const [salary, skipped, move, card] = ['salary', 'skipped', 'move', 'card'].map((id) =>
    historyEntries(d).find((e) => e.item.id === id)!,
  ) as [Entry, Entry, Entry, Entry];

  it('writes an expected income as money in with a chip, and one that did not arrive as 0', () => {
    expect(entryLine(salary, context)).toEqual({
      title: 'Salary',
      detail: 'Salary · to Main account',
      // The account the money went to, drawn where its name stands.
      mark: {
        name: 'Main account',
        last4: null,
        color: SKIN_COLORS.midnight,
        accountId: MAIN,
        before: 'Salary · to ',
        after: '',
      },
      amount: 3_000_00,
      sign: '+',
      tone: 'in',
      chip: 'Expected',
    });
    const missed = { ...salary, item: { ...salary.item, status: 'skipped' } } as Entry;
    expect(entryLine(missed, context)).toMatchObject({
      amount: 0,
      sign: '',
      tone: 'plain',
      chip: "Didn't arrive",
    });
  });

  it('reads a skipped dividend the same from any account, as it went to none', () => {
    const line = {
      title: 'Skipped dividend · AAPL',
      detail: '',
      amount: 0,
      sign: '',
      tone: 'plain',
    };
    expect(entryLine(skipped, context)).toEqual(line);
    expect(entryLine(skipped, { ...context, perspective: MAIN })).toEqual(line);
  });

  it("reads a transfer as moved money, or from an account's side as money out of or into it", () => {
    expect(entryLine(move, context)).toMatchObject({
      title: 'Main account → Savings',
      sign: '',
      tone: 'plain',
    });
    expect(entryLine(move, { ...context, perspective: MAIN })).toMatchObject({
      title: 'To Savings',
      detail: 'Transfer',
      sign: '−',
      tone: 'out',
    });
    expect(entryLine(move, { ...context, perspective: SAVINGS })).toMatchObject({
      title: 'From Main account',
      sign: '+',
      tone: 'plain',
    });
    // An account the transfer does not touch sees it as History does.
    expect(entryLine(move, { ...context, perspective: VISA }).title).toBe('Main account → Savings');
  });

  it("reads a card payment as money out, or from the card's side as a payment onto it", () => {
    expect(entryLine(card, context)).toMatchObject({
      title: 'Main account → Visa',
      // The account that paid, first (and drawn as a mark in the lists).
      detail: 'Main account · Card payment',
      sign: '−',
    });
    expect(entryLine(card, { ...context, perspective: MAIN }).title).toBe('Paid Visa');
    expect(entryLine(card, { ...context, perspective: VISA })).toMatchObject({
      title: 'Payment from Main account',
      sign: '+',
    });
  });

  it("leaves the account's own name out of the line on its sheet", () => {
    expect(entryLine(salary, { ...context, perspective: MAIN }).detail).toBe('Salary');
    expect(entryLine(salary, { ...context, perspective: SAVINGS }).detail).toBe(
      'Salary · to Main account',
    );
  });
});

describe('entryLine marks', () => {
  const main = makeAccount({ id: MAIN, name: 'Main account', last4: '4312', skin: 'midnight' });
  const savings = makeAccount({ id: SAVINGS, name: 'Savings', kind: 'savings', skin: 'mint' });
  const visa = makeAccount({
    id: VISA,
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    last4: '4242',
  });
  const accounts = [main, savings, visa];
  const context = { accounts, debts: [makeDebt({ id: 'car', name: 'Car loan' })] };
  const entry = (kind: Entry['kind'], item: Entry['item']) => ({ kind, item }) as Entry;
  const markOf = (e: Entry, c: Parameters<typeof entryLine>[1] = context) => entryLine(e, c).mark;

  it("marks an expense with the account it was paid with, where the account's name stands", () => {
    const e = entry(
      'expense',
      makeExpense({ accountId: VISA, category: 'food', subscriptionId: 'sub' }),
    );
    const line = entryLine(e, context);
    expect(line.mark).toEqual({
      name: 'Visa',
      last4: '4242',
      color: SKIN_COLORS.violet,
      accountId: VISA,
      before: 'Food · ',
      after: ' · Subscription',
    });
    // The words are the same as they ever were; the mark and the last 4 only add to them.
    expect(line.detail).toBe('Food · Visa · Subscription');
  });

  it('marks an income with the account it went to', () => {
    const e = entry('income', makeIncome({ accountId: SAVINGS, source: 'extra' }));
    expect(markOf(e)).toMatchObject({
      name: 'Savings',
      last4: null,
      color: SKIN_COLORS.mint,
      before: 'Extra income · to ',
      after: '',
    });
  });

  it('marks a transfer with the account it left, and a card payment with the one that paid', () => {
    const move = entry(
      'transaction',
      makeTransaction({
        type: 'transfer',
        fromAccountId: MAIN,
        toAccountId: SAVINGS,
        note: 'Rainy day',
      }),
    );
    // First in the line, so what the line said before still reads on from it.
    expect(markOf(move)).toMatchObject({
      name: 'Main account',
      last4: '4312',
      color: SKIN_COLORS.midnight,
      before: '',
      after: ' · Rainy day',
    });
    const pay = entry(
      'transaction',
      makeTransaction({ type: 'card_payment', fromAccountId: SAVINGS, toAccountId: VISA }),
    );
    expect(markOf(pay)).toMatchObject({
      name: 'Savings',
      color: SKIN_COLORS.mint,
      before: '',
      after: ' · Card payment',
    });
  });

  it('marks a stock purchase and a loan payment with the account the money left', () => {
    const buy = entry(
      'transaction',
      makeTransaction({
        type: 'investment',
        fromAccountId: SAVINGS,
        toAccountId: null,
        note: 'Bought KO',
      }),
    );
    expect(markOf(buy)).toMatchObject({ name: 'Savings', before: 'From ', after: '' });
    const loan = entry(
      'transaction',
      makeTransaction({
        type: 'debt_payment',
        fromAccountId: MAIN,
        toAccountId: null,
        debtId: 'car',
      }),
    );
    expect(markOf(loan)).toMatchObject({ name: 'Main account', before: 'From ', after: '' });
  });

  it('marks a dividend paid into an account and a sale whose proceeds went to one', () => {
    const paid = entry('dividend', makeDividend({ accountId: SAVINGS, reinvested: false }));
    expect(markOf(paid)).toMatchObject({ name: 'Savings', before: 'To ', after: '' });
    const sold = entry('sale', makeSale({ toAccountId: MAIN }));
    expect(markOf(sold)).toMatchObject({ name: 'Main account', before: 'To ', after: '' });
  });

  it('marks a balance correction with the account it corrected', () => {
    const fix = entry(
      'transaction',
      makeTransaction({
        type: 'adjustment',
        fromAccountId: null,
        toAccountId: VISA,
        amount: 20_00,
        note: 'Fee',
      }),
    );
    expect(markOf(fix)).toMatchObject({
      name: 'Visa',
      last4: '4242',
      color: SKIN_COLORS.violet,
      before: '',
      after: ' · owed more · Fee',
    });
  });

  it('marks nothing for an entry with no account: a reinvested dividend', () => {
    const reinvested = entry('dividend', makeDividend({ accountId: null, reinvested: true }));
    expect(entryLine(reinvested, context)).not.toHaveProperty('mark');
    const skipped = entry(
      'dividend',
      makeDividend({ accountId: null, status: 'skipped', amount: 0 }),
    );
    expect(entryLine(skipped, context)).not.toHaveProperty('mark');
  });

  it('marks nothing for an account that is gone, which reads as Unknown account', () => {
    const e = entry('expense', makeExpense({ accountId: 'gone', category: 'shopping' }));
    const line = entryLine(e, context);
    expect(line).not.toHaveProperty('mark');
    expect(line.detail).toBe('Shopping · Unknown account');
  });

  it('colours an account by its skin, midnight for one it does not know', () => {
    const odd = makeAccount({ id: 'odd', skin: 'neon' });
    const e = entry('expense', makeExpense({ accountId: 'odd' }));
    expect(markOf(e, { ...context, accounts: [...accounts, odd] })?.color).toBe(
      SKIN_COLORS.midnight,
    );
  });

  it("leaves the mark out of an account's own sheet, where the line leaves its name out", () => {
    const e = entry('expense', makeExpense({ accountId: MAIN }));
    expect(entryLine(e, { ...context, perspective: MAIN })).not.toHaveProperty('mark');
    // Another account's sheet shows an entry it touches as History does.
    expect(markOf(e, { ...context, perspective: SAVINGS })).toMatchObject({ name: 'Main account' });
    const move = entry(
      'transaction',
      makeTransaction({ type: 'transfer', fromAccountId: MAIN, toAccountId: SAVINGS }),
    );
    // From either side the line is the account's own: "To Savings" and "From Main account".
    expect(entryLine(move, { ...context, perspective: MAIN })).not.toHaveProperty('mark');
    expect(entryLine(move, { ...context, perspective: SAVINGS })).not.toHaveProperty('mark');
    expect(markOf(move, { ...context, perspective: VISA })).toMatchObject({ name: 'Main account' });
  });
});

describe('the mark in the lists', () => {
  /** The data above with Main account (4312) in violet and a cup of tea on it today. */
  const marked = () => {
    const d = data();
    d.tables.account[0] = makeAccount({
      id: MAIN,
      openingDate: '2026-10-01',
      last4: '4312',
      skin: 'violet',
    });
    d.tables.expense.push(
      makeExpense({
        id: 'tea',
        note: 'Tea',
        accountId: MAIN,
        category: 'food',
        date: TODAY,
        createdAt: `${TODAY}T09:00:00.000Z`,
      }),
    );
    return d;
  };
  const teaRow = () => screen.getByText('Tea', { selector: 'b' }).closest('li')!;

  /** The row of tea: the mark drawn in the account's colour, then "Main account ·· 4312". */
  function expectMarked() {
    const row = teaRow();
    const mark = row.querySelector('[data-card-mark]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveStyle({ backgroundColor: SKIN_COLORS.violet });
    // Drawn, not written: the row reads the name and last 4, the name carrying the meaning.
    expect(mark).toBeEmptyDOMElement();
    expect(row).toHaveTextContent('Food · Main account ·· 4312');
  }

  it("draws a card mark in the account's colour before its name and last 4, in History", () => {
    renderWithStore(
      <MemoryRouter>
        <HistoryScreen />
      </MemoryRouter>,
      createStubStore({ data: marked(), today: TODAY }),
    );
    expectMarked();
  });

  it('draws it the same in Recent', () => {
    const d = marked();
    renderWithStore(
      <MemoryRouter>
        <RecentSection entries={historyEntries(d)} />
      </MemoryRouter>,
      createStubStore({ data: d, today: TODAY }),
    );
    expectMarked();
  });

  it('reads the name alone when the account has no last 4', () => {
    const d = marked();
    d.tables.account[0] = makeAccount({ id: MAIN, openingDate: '2026-10-01', last4: null });
    renderWithStore(
      <MemoryRouter>
        <RecentSection entries={historyEntries(d)} />
      </MemoryRouter>,
      createStubStore({ data: d, today: TODAY }),
    );
    expect(teaRow()).toHaveTextContent('Food · Main account · Today');
    expect(teaRow()).not.toHaveTextContent('··');
  });

  it("draws no mark on an account's sheet, whose lines leave the account out", () => {
    renderWithStore(
      <MemoryRouter>
        <AccountSheet accountId={MAIN} onClose={vi.fn()} />
      </MemoryRouter>,
      createStubStore({ data: marked(), today: TODAY }),
    );
    expect(document.querySelector('[data-card-mark]')).toBeNull();
  });
});
