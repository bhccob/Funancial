import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
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
  makeDividend,
  makeIncome,
  makeProfile,
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
    // The sheet is the account's own, so the line leaves its name out.
    expectRow({ ...expected, detail: `Salary · ${formatDay('2026-10-13')}` });
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
      detail: 'Card payment',
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
