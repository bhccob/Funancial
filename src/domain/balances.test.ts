import { describe, expect, it } from 'vitest';
import {
  makeAccount,
  makeDebt,
  makeDividend,
  makeExpense,
  makeIncome,
  makeSale,
  makeTransaction,
} from '@/test/fixtures';
import {
  accountBalance,
  accountRows,
  debtBalance,
  heroFigure,
  netWorth,
  type AccountRow,
} from './balances';
import type { Account } from './entities';
import { emptySnapshot } from './snapshot';

const AS_OF = '2026-10-10';

/** Main account: 1,000.00 on 1 Oct. */
const main = makeAccount({ openingBalance: 1_000_00, openingDate: '2026-10-01' });
const savings = makeAccount({
  id: 'acct-savings',
  name: 'Savings',
  kind: 'savings',
  skin: 'mint',
  inAvailable: false,
  openingBalance: 5_000_00,
  openingDate: '2026-10-01',
  order: 1,
});

/** A credit card owing `openingBalance` on its opening date. */
function card(overrides: Partial<Account> = {}): Account {
  return makeAccount({
    id: 'visa',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    openingBalance: 0,
    openingDate: '2026-10-01',
    order: 3,
    credit: {
      limit: 3_000_00,
      statementDay: 1,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 25_00,
      interestRate: 22.9,
    },
    ...overrides,
  });
}

function world(...accounts: Account[]) {
  const data = emptySnapshot();
  data.tables.account = accounts.length ? accounts : [main, savings];
  return data;
}

describe('accountBalance of a bank, cash or savings account', () => {
  it('starts from its opening balance', () => {
    expect(accountBalance(main, world(), AS_OF)).toBe(1_000_00);
  });

  it('adds confirmed income paid into it, and not expected or skipped income', () => {
    const data = world();
    data.tables.income = [
      makeIncome({ amount: 300_00, date: '2026-10-02' }),
      makeIncome({ amount: 40_00, date: '2026-10-03', status: 'expected' }),
      makeIncome({ amount: 50_00, date: '2026-10-04', status: 'skipped' }),
      makeIncome({ amount: 70_00, date: '2026-10-05', accountId: 'acct-savings' }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(1_300_00);
    expect(accountBalance(savings, data, AS_OF)).toBe(5_070_00);
  });

  it('adds a transfer in and takes a transfer out', () => {
    const data = world();
    data.tables.transaction = [
      makeTransaction({
        type: 'transfer',
        amount: 200_00,
        date: '2026-10-02',
        fromAccountId: 'acct-main',
        toAccountId: 'acct-savings',
      }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(800_00);
    expect(accountBalance(savings, data, AS_OF)).toBe(5_200_00);
  });

  it('adds an adjustment to it, whatever its sign', () => {
    const data = world();
    data.tables.transaction = [
      makeTransaction({
        type: 'adjustment',
        amount: -25_00,
        date: '2026-10-02',
        fromAccountId: null,
        toAccountId: 'acct-main',
      }),
      makeTransaction({
        type: 'adjustment',
        amount: 10_00,
        date: '2026-10-03',
        fromAccountId: null,
        toAccountId: 'acct-main',
      }),
      makeTransaction({
        type: 'adjustment',
        amount: 99_00,
        date: '2026-10-03',
        fromAccountId: null,
        toAccountId: 'acct-savings',
      }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(985_00);
  });

  it('adds a confirmed dividend paid into it, and not a skipped or reinvested one', () => {
    const data = world();
    data.tables.dividend = [
      makeDividend({ amount: 11_20, paidOn: '2026-10-03' }),
      makeDividend({ amount: 7_00, paidOn: '2026-10-03', accountId: 'acct-savings' }),
      makeDividend({
        amount: 9_00,
        paidOn: '2026-10-03',
        accountId: null,
        reinvested: true,
        sharesAdded: 0.1,
      }),
      makeDividend({ status: 'skipped', amount: 0, accountId: null, paidOn: '2026-10-03' }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(1_011_20);
    expect(accountBalance(savings, data, AS_OF)).toBe(5_007_00);
  });

  it('adds nothing for a reinvested dividend, even a malformed one that names it', () => {
    const data = world();
    // The schema refuses a reinvested payout with an account; the builders don't validate.
    data.tables.dividend = [
      makeDividend({
        amount: 9_00,
        paidOn: '2026-10-03',
        accountId: 'acct-main',
        reinvested: true,
        sharesAdded: 0.1,
      }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(1_000_00);
  });

  it('adds the proceeds of a sale paid into it, on the day of the sale', () => {
    const data = world();
    data.tables.sale = [
      makeSale({ proceeds: 300_00, soldOn: '2026-10-03' }),
      makeSale({ proceeds: 450_00, soldOn: '2026-10-04', toAccountId: 'acct-savings' }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(1_300_00);
    expect(accountBalance(main, data, '2026-10-02')).toBe(1_000_00);
    expect(accountBalance(savings, data, AS_OF)).toBe(5_450_00);
  });

  it('takes off an expense paid with it', () => {
    const data = world();
    data.tables.expense = [
      makeExpense({ amount: 50_00, date: '2026-10-02' }),
      makeExpense({ amount: 60_00, date: '2026-10-02', accountId: 'visa' }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(950_00);
  });

  it('takes off a card payment, a loan payment and an investment paid from it', () => {
    const data = world();
    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        amount: 40_00,
        date: '2026-10-02',
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      }),
      makeTransaction({
        type: 'debt_payment',
        amount: 250_00,
        date: '2026-10-03',
        fromAccountId: 'acct-main',
        toAccountId: null,
        debtId: 'loan-1',
      }),
      makeTransaction({
        type: 'investment',
        amount: 200_00,
        date: '2026-10-04',
        fromAccountId: 'acct-main',
        toAccountId: null,
      }),
      makeTransaction({
        type: 'investment',
        amount: 300_00,
        date: '2026-10-04',
        fromAccountId: 'acct-savings',
        toAccountId: null,
      }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(1_000_00 - 40_00 - 250_00 - 200_00);
    expect(accountBalance(savings, data, AS_OF)).toBe(4_700_00);
  });

  it("events before the account opened don't count", () => {
    const data = world();
    data.tables.income = [makeIncome({ amount: 300_00, date: '2026-09-30' })];
    data.tables.expense = [makeExpense({ amount: 50_00, date: '2026-09-30' })];
    data.tables.dividend = [makeDividend({ amount: 98_00, paidOn: '2026-09-30' })];
    data.tables.sale = [makeSale({ proceeds: 97_00, soldOn: '2026-09-30' })];
    data.tables.transaction = [
      makeTransaction({ amount: 200_00, date: '2026-09-30' }),
      makeTransaction({
        type: 'adjustment',
        amount: 10_00,
        date: '2026-09-30',
        fromAccountId: null,
        toAccountId: 'acct-main',
      }),
    ];
    expect(accountBalance(main, data, AS_OF)).toBe(1_000_00);
    expect(accountBalance(savings, data, AS_OF)).toBe(5_000_00);
    // On the opening day they do.
    for (const e of data.tables.expense) e.date = '2026-10-01';
    expect(accountBalance(main, data, AS_OF)).toBe(950_00);
  });

  it('ignores events after the as-of day, and counts those on it', () => {
    const data = world();
    data.tables.expense = [makeExpense({ date: '2026-10-11', amount: 50_00 })];
    expect(accountBalance(main, data, AS_OF)).toBe(1_000_00);
    expect(accountBalance(main, data, '2026-10-11')).toBe(950_00);
  });
});

describe('accountBalance of a credit card: what is owed on it', () => {
  it('adds an expense on it', () => {
    const visa = card({ openingBalance: 100_00 });
    const data = world(main, visa);
    data.tables.expense = [
      makeExpense({ amount: 40_00, date: '2026-10-02', accountId: 'visa' }),
      makeExpense({ amount: 99_00, date: '2026-10-02' }),
    ];
    expect(accountBalance(visa, data, AS_OF)).toBe(140_00);
  });

  it('takes off a card payment into it', () => {
    const visa = card({ openingBalance: 100_00 });
    const data = world(main, visa);
    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        amount: 30_00,
        date: '2026-10-02',
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      }),
      makeTransaction({
        type: 'card_payment',
        amount: 20_00,
        date: '2026-10-02',
        fromAccountId: 'acct-main',
        toAccountId: 'another-card',
      }),
    ];
    expect(accountBalance(visa, data, AS_OF)).toBe(70_00);
  });

  it('adds an adjustment to it', () => {
    const visa = card({ openingBalance: 100_00 });
    const data = world(main, visa);
    data.tables.transaction = [
      makeTransaction({
        type: 'adjustment',
        amount: -15_00,
        date: '2026-10-02',
        fromAccountId: null,
        toAccountId: 'visa',
      }),
    ];
    expect(accountBalance(visa, data, AS_OF)).toBe(85_00);
  });

  it('counts nothing else that names it', () => {
    const visa = card({ openingBalance: 100_00 });
    const data = world(main, visa);
    data.tables.income = [makeIncome({ amount: 300_00, date: '2026-10-02', accountId: 'visa' })];
    data.tables.dividend = [makeDividend({ paidOn: '2026-10-02', accountId: 'visa' })];
    data.tables.sale = [makeSale({ soldOn: '2026-10-02', toAccountId: 'visa' })];
    data.tables.transaction = [
      makeTransaction({ date: '2026-10-02', fromAccountId: 'visa', toAccountId: 'acct-main' }),
      makeTransaction({ date: '2026-10-02', fromAccountId: 'acct-main', toAccountId: 'visa' }),
      makeTransaction({
        type: 'investment',
        date: '2026-10-02',
        fromAccountId: 'visa',
        toAccountId: null,
      }),
    ];
    expect(accountBalance(visa, data, AS_OF)).toBe(100_00);
  });

  it('shows an overpaid card as a negative balance', () => {
    const visa = card();
    const data = world(main, visa);
    data.tables.expense = [makeExpense({ date: '2026-10-02', accountId: 'visa', amount: 40_00 })];
    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        amount: 50_00,
        date: '2026-10-03',
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      }),
    ];
    expect(accountBalance(visa, data, AS_OF)).toBe(-10_00);
  });

  it('counts from its own opening day: a payment before it lowers the payer only', () => {
    // The bank account opened on 1 Oct and the card on the 5th.
    const visa = card({ openingBalance: 150_00, openingDate: '2026-10-05' });
    const data = world(main, visa);
    data.tables.expense = [
      makeExpense({ amount: 33_33, date: '2026-10-03', accountId: 'visa' }),
      makeExpense({ amount: 80_00, date: '2026-10-05', accountId: 'visa' }),
    ];
    data.tables.transaction = [
      makeTransaction({
        type: 'card_payment',
        amount: 40_00,
        date: '2026-10-04',
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      }),
    ];
    expect(accountBalance(visa, data, AS_OF)).toBe(230_00);
    expect(accountBalance(main, data, AS_OF)).toBe(960_00);
  });
});

describe('accountRows', () => {
  it('lists the accounts in use on the day, in carousel order, with their balances', () => {
    const cash = makeAccount({
      id: 'acct-cash',
      kind: 'cash',
      openingBalance: 20_00,
      openingDate: '2026-10-01',
      order: 2,
    });
    const old = card({ id: 'old', archivedOn: '2026-10-10', order: 4 });
    const later = card({ id: 'later', archivedOn: '2026-10-11', order: 5 });
    const data = world(old, cash, later, savings, main);
    expect(accountRows(data, AS_OF).map((r) => [r.account.id, r.balance])).toEqual([
      ['acct-main', 1_000_00],
      ['acct-savings', 5_000_00],
      ['acct-cash', 20_00],
      ['later', 0],
    ]);
  });
});

describe('debtBalance', () => {
  it('a loan falls with payments to it and nothing else', () => {
    const loan = makeDebt({ id: 'loan-1', openingBalance: 5_000_00, openingDate: '2026-10-01' });
    const data = world();
    data.tables.debt = [loan];
    data.tables.expense = [makeExpense({ date: '2026-10-02', accountId: 'loan-1', amount: 99_00 })];
    data.tables.transaction = [
      makeTransaction({
        type: 'debt_payment',
        debtId: 'loan-1',
        fromAccountId: 'acct-main',
        toAccountId: null,
        amount: 250_00,
        date: '2026-10-03',
      }),
      makeTransaction({
        type: 'debt_payment',
        debtId: 'loan-1',
        fromAccountId: 'acct-main',
        toAccountId: null,
        amount: 77_00,
        date: '2026-09-30', // before the loan was taken
      }),
      makeTransaction({
        type: 'debt_payment',
        debtId: 'loan-2',
        fromAccountId: 'acct-main',
        toAccountId: null,
        amount: 66_00,
        date: '2026-10-03',
      }),
    ];
    expect(debtBalance(loan, data, AS_OF)).toBe(4_750_00);
  });
});

describe('netWorth', () => {
  const row = (account: Account, balance: number): AccountRow => ({ account, balance });

  it('adds what accounts hold and investments, and takes off what cards and loans owe', () => {
    const rows = [row(main, 100), row(savings, 200), row(card(), 30)];
    expect(netWorth(rows, 40, 1000)).toBe(100 + 200 - 30 - 40 + 1000);
    expect(netWorth([row(main, 100)], 0, 0)).toBe(100);
    expect(netWorth([], 0, 0)).toBe(0);
  });
});

describe('heroFigure', () => {
  const row = (account: Account, balance: number): AccountRow => ({ account, balance });
  const withLimit = (limit: number | null) => ({
    ...card().credit!,
    limit,
  });

  it('is the balance of a bank account, cash or savings, as Available balance', () => {
    const cash = makeAccount({ id: 'acct-cash', kind: 'cash' });
    expect(heroFigure(row(main, 1_000_00))).toEqual({
      label: 'Available balance',
      amount: 1_000_00,
    });
    expect(heroFigure(row(cash, 40_00))).toEqual({ label: 'Available balance', amount: 40_00 });
    expect(heroFigure(row(savings, 5_000_00))).toEqual({
      label: 'Available balance',
      amount: 5_000_00,
    });
  });

  it('keeps an overdrawn balance as it is', () => {
    expect(heroFigure(row(main, -25_00))).toEqual({ label: 'Available balance', amount: -25_00 });
  });

  it('is what is left of the limit on a credit card with one, as Available credit', () => {
    const visa = card({ credit: withLimit(3_000_00) });
    expect(heroFigure(row(visa, 0))).toEqual({ label: 'Available credit', amount: 3_000_00 });
    expect(heroFigure(row(visa, 1_250_50))).toEqual({
      label: 'Available credit',
      amount: 1_749_50,
    });
    expect(heroFigure(row(visa, 3_000_00))).toEqual({ label: 'Available credit', amount: 0 });
  });

  it('is never below 0 when the card owes more than its limit', () => {
    const visa = card({ credit: withLimit(3_000_00) });
    expect(heroFigure(row(visa, 3_200_00))).toEqual({ label: 'Available credit', amount: 0 });
  });

  it('counts an overpaid card as credit on top of the limit', () => {
    const visa = card({ credit: withLimit(3_000_00) });
    expect(heroFigure(row(visa, -50_00))).toEqual({
      label: 'Available credit',
      amount: 3_050_00,
    });
  });

  it('is what is owed on a credit card with no limit, as Owed', () => {
    const visa = card({ credit: withLimit(null) });
    expect(heroFigure(row(visa, 230_00))).toEqual({ label: 'Owed', amount: 230_00 });
    expect(heroFigure(row(visa, 0))).toEqual({ label: 'Owed', amount: 0 });
  });

  it('reads a limit of 0 as no limit, as the card screens do', () => {
    const visa = card({ credit: withLimit(0) });
    expect(heroFigure(row(visa, 75_00))).toEqual({ label: 'Owed', amount: 75_00 });
  });
});
