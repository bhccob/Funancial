import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Account, CreditTerms, Transaction } from '@/domain/entities';
import { accountBalance } from '@/domain/balances';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { Toaster } from '@/components/ui/Toaster';
import { formatDay } from '@/lib/format';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeAccount, makeProfile, makeTransaction } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { CardSheet } from './CardSheet';

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

/**
 * The toast, once it is there. It floats inside the open dialog and moves out to the page when the
 * dialog closes, so wait for an element that is still in the page rather than holding one.
 */
const toasted = (text: string) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());

afterEach(() => useAmountsHidden.setState({ hidden: false }));

/** Main account, which pays the card: a debit account with 1,000.00. */
const mainAccount = () =>
  makeAccount({ id: 'acct-main', openingDate: '2026-10-01', openingBalance: 1_000_00 });

/** The Visa: a credit account with 318.40 owed on it, a 1,500.00 limit, due on the 21st. */
const visa = (account: Partial<Account> = {}, credit: Partial<CreditTerms> = {}) =>
  makeAccount({
    id: 'visa',
    name: 'Visa',
    kind: 'credit',
    skin: 'violet',
    inAvailable: false,
    order: 2,
    openingDate: '2026-10-01',
    openingBalance: 318_40,
    credit: {
      limit: 1_500_00,
      statementDay: null,
      dueDay: 21,
      payInFull: true,
      minimumPayment: 0,
      interestRate: 0,
      ...credit,
    },
    ...account,
  });

function renderSheet(
  overrides: { account?: Partial<Account>; credit?: Partial<CreditTerms> } = {},
  accountId: string | null = 'visa',
  payments: Transaction[] = [],
) {
  const onClose = vi.fn();
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ openingDate: '2026-10-01' }));
  data.tables.account.push(mainAccount(), visa(overrides.account, overrides.credit));
  data.tables.transaction.push(...payments);
  renderWithStore(
    <CardSheet accountId={accountId} onClose={onClose} />,
    createStubStore({ data, today: TODAY }),
  );
  return onClose;
}

const sheet = () => screen.getByRole('dialog', { name: 'Visa credit card' });
/** A fact's label and value, as one string. */
const fact = (label: string) => within(sheet()).getByText(label).parentElement;

describe('CardSheet', () => {
  it('is closed without a card', () => {
    renderSheet({}, null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is closed for an archived card, as one deleted from inside it', () => {
    renderSheet({ account: { archivedOn: TODAY } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is closed for an account that is not a credit card', () => {
    renderSheet({}, 'acct-main');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is closed for an account that does not exist', () => {
    renderSheet({}, 'gone');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the card and gives the four facts', () => {
    renderSheet();
    expect(within(sheet()).getByText('Credit card')).toBeInTheDocument();
    expect(within(sheet()).getByText('Visa', { selector: 'p' })).toBeInTheDocument();
    expect(fact('You owe')).toHaveTextContent(`You owe${usd(318_40)}`);
    expect(fact('Payment due')).toHaveTextContent(`Payment due${formatDay('2026-10-21')}`);
    expect(fact('You pay')).toHaveTextContent('You payThe full balance');
    // 318.40 of 1,500.00 is 21.2%.
    expect(fact('Limit used')).toHaveTextContent(`Limit used21% of ${usd(1_500_00)}`);
  });

  it('draws the facts as plain rows: the label left, the figure right, a hairline between', () => {
    renderSheet();
    const facts = within(sheet()).getByText('You owe').closest('dl')!;
    expect(facts).toHaveClass('divide-y', 'divide-black/7', 'dark:divide-white/8');
    expect(facts.children).toHaveLength(4);
    for (const label of ['You owe', 'Payment due', 'You pay', 'Limit used']) {
      const row = fact(label)!;
      expect(row, label).toHaveClass('flex', 'justify-between');
      expect(within(sheet()).getByText(label), label).toHaveClass('text-muted');
      expect(row.querySelector('dd'), label).toHaveClass('font-extrabold', 'tabular-nums');
    }
  });

  it('says why cash stays put in plain words, not in a box', () => {
    renderSheet();
    const note = within(sheet()).getByText(/Buying with this card/);
    expect(note).not.toHaveClass('bg-surface-2', 'rounded-xl');
    expect(note).toHaveClass('text-muted');
  });

  it('explains why cash stays put, with the same amount and date as the Coming-up row', () => {
    renderSheet();
    expect(
      within(sheet()).getByText(
        `Buying with this card adds to what you owe. Your cash only drops when you pay the card, so Funcial keeps ${usd(318_40)} aside for ${formatDay('2026-10-21')}.`,
      ),
    ).toBeInTheDocument();
  });

  it('says the minimum, and keeps that amount aside, when the card is not paid in full', () => {
    renderSheet({ credit: { payInFull: false, minimumPayment: 25_00 } });
    expect(fact('You pay')).toHaveTextContent(`You pay${usd(25_00)} minimum`);
    expect(within(sheet()).getByText(/Funcial keeps/)).toHaveTextContent(
      `keeps ${usd(25_00)} aside`,
    );
  });

  describe('when part of the minimum is already paid', () => {
    const paid = (amount: number) =>
      makeTransaction({
        type: 'card_payment',
        amount,
        date: TODAY,
        fromAccountId: 'acct-main',
        toAccountId: 'visa',
      });
    const minimum = { credit: { payInFull: false, minimumPayment: 25_00 } };

    it('says what is left, and keeps only that aside', () => {
      renderSheet(minimum, 'visa', [paid(10_00)]);
      expect(fact('You pay')).toHaveTextContent(`You pay${usd(15_00)} minimum`);
      expect(within(sheet()).getByText(/Funcial keeps/)).toHaveTextContent(
        `keeps ${usd(15_00)} aside`,
      );
    });

    it('says the minimum is paid, and keeps nothing aside, once all of it is', () => {
      renderSheet(minimum, 'visa', [paid(25_00)]);
      expect(fact('You pay')).toHaveTextContent('You payMinimum paid');
      expect(within(sheet()).getByText(/Your cash only drops/)).toHaveTextContent(
        `the minimum due ${formatDay('2026-10-21')} is paid, so Funcial keeps nothing aside.`,
      );
      // Paying more is still allowed.
      expect(within(sheet()).getByRole('button', { name: 'Pay card' })).toBeEnabled();
    });
  });

  it('drops "Limit used" when the card has no limit', () => {
    renderSheet({ credit: { limit: null } });
    expect(within(sheet()).queryByText('Limit used')).not.toBeInTheDocument();
    expect(within(sheet()).getByText('You owe')).toBeInTheDocument();
  });

  it('has nothing to pay, and no note, when nothing is owed', () => {
    renderSheet({ account: { openingBalance: 0 } });
    expect(within(sheet()).getByRole('button', { name: 'Pay card' })).toBeDisabled();
    expect(within(sheet()).queryByText(/Funcial keeps/)).not.toBeInTheDocument();
  });

  it('opens the pay dialog from Pay card', async () => {
    renderSheet();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Pay card' }));
    const pay = screen.getByRole('dialog', { name: 'Pay Visa' });
    expect(within(pay).getByText(`You owe ${usd(318_40)}.`)).toBeInTheDocument();
    expect(within(pay).getByLabelText('From')).toHaveValue('acct-main');
  });

  it('opens the card editor from Edit card', async () => {
    renderSheet();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Edit card' }));
    const edit = screen.getByRole('dialog', { name: 'Edit card' });
    expect(within(edit).getByLabelText('Name')).toHaveValue('Visa');
  });

  it('closes through onClose', async () => {
    const onClose = renderSheet();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows no amount while amounts are hidden', () => {
    useAmountsHidden.setState({ hidden: true });
    renderSheet();
    expect(fact('You owe')).toHaveTextContent('You owe••••');
    expect(fact('Limit used')).toHaveTextContent('Limit used21% of ••••');
    expect(within(sheet()).getByText(/Funcial keeps/)).toHaveTextContent('keeps •••• aside');
    expect(within(sheet()).queryByText(/\d,\d|\.\d\d/)).not.toBeInTheDocument();
  });
});

describe('CardSheet focus after a payment', () => {
  /** A real store, so a payment really changes what is owed. The Visa owes 318.40. */
  async function renderPaying() {
    const { store } = await freshRealStore();
    await store.getState().putMany([
      { table: 'profile', record: makeProfile({ openingDate: '2026-10-01', salary: null }) },
      { table: 'account', record: mainAccount() },
      { table: 'account', record: visa() },
    ]);
    renderWithStore(<CardSheet accountId="visa" onClose={vi.fn()} />, store);
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Pay card' }));
    return within(screen.getByRole('dialog', { name: 'Pay Visa' }));
  }
  const paying = () => screen.queryByRole('dialog', { name: 'Pay Visa' });

  it('goes to Edit card when the payment clears the card and Pay card is disabled', async () => {
    const pay = await renderPaying();
    // The amount starts at the whole balance.
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(paying()).not.toBeInTheDocument());
    expect(within(sheet()).getByRole('button', { name: 'Pay card' })).toBeDisabled();
    expect(within(sheet()).getByRole('button', { name: 'Edit card' })).toHaveFocus();
  });

  it('goes back to Pay card after a part payment, as it does after Cancel', async () => {
    const pay = await renderPaying();
    const amount = pay.getByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '100');
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(paying()).not.toBeInTheDocument());
    expect(within(sheet()).getByRole('button', { name: 'Pay card' })).toHaveFocus();

    await userEvent.click(within(sheet()).getByRole('button', { name: 'Pay card' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Pay Visa' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(within(sheet()).getByRole('button', { name: 'Pay card' })).toHaveFocus();
  });
});

describe('CardSheet over a real store', () => {
  async function renderReal() {
    const { store } = await freshRealStore();
    await store.getState().putMany([
      { table: 'profile', record: makeProfile({ openingDate: '2026-10-01', salary: null }) },
      { table: 'account', record: mainAccount() },
      { table: 'account', record: visa() },
    ]);
    const onClose = vi.fn();
    renderWithStore(
      <>
        <CardSheet accountId="visa" onClose={onClose} />
        <Toaster />
      </>,
      store,
    );
    return { store, onClose };
  }

  it('pays from Main account, so the card and the account both go down', async () => {
    const { store } = await renderReal();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Pay card' }));
    const pay = within(screen.getByRole('dialog', { name: 'Pay Visa' }));
    await userEvent.click(pay.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(fact('You owe')).toHaveTextContent(`You owe${usd(0)}`));
    const data = store.getState().data;
    const balance = (id: string) =>
      accountBalance(
        data.tables.account.find((a) => a.id === id)!,
        data,
        TODAY,
      );
    expect(balance('visa')).toBe(0);
    expect(balance('acct-main')).toBe(1_000_00 - 318_40);
  });

  it('lets the card be edited from the sheet, and the sheet follows the edit', async () => {
    await renderReal();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Edit card' }));
    const edit = screen.getByRole('dialog', { name: 'Edit card' });
    const limit = within(edit).getByLabelText('Credit limit');
    await userEvent.clear(limit);
    await userEvent.type(limit, '1000');
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit card' })).toBeNull());
    // 318.40 of 1,000.00 is 31.8%.
    expect(fact('Limit used')).toHaveTextContent(`Limit used32% of ${usd(1_000_00)}`);
  });

  it('closes the sheet when the card is deleted from inside it', async () => {
    await renderReal();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Edit card' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit card' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete Visa?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await toasted('Visa deleted.');
    expect(screen.queryByRole('dialog', { name: 'Visa credit card' })).toBeNull();
  });
});
