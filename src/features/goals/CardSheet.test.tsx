import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Debt } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot } from '@/domain/snapshot';
import { formatDay } from '@/lib/format';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDebt, makeProfile } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { CardSheet } from './CardSheet';

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

afterEach(() => useAmountsHidden.setState({ hidden: false }));

function renderSheet(overrides: Partial<Debt> = {}, debtId: string | null = 'visa') {
  const onClose = vi.fn();
  const data = emptySnapshot();
  data.tables.profile.push(makeProfile({ openingDate: '2026-10-01' }));
  data.tables.debt.push(
    makeDebt({
      id: 'visa',
      name: 'Visa',
      openingDate: '2026-10-01',
      openingBalance: 318_40,
      creditLimit: 1_500_00,
      dueDay: 21,
      payInFull: true,
      ...overrides,
    }),
  );
  renderWithStore(
    <CardSheet debtId={debtId} onClose={onClose} />,
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

  it('explains why cash stays put, with the same amount and date as the Coming-up row', () => {
    renderSheet();
    expect(
      within(sheet()).getByText(
        `Buying with this card adds to what you owe. Your cash only drops when you pay the card, so Funcial keeps ${usd(318_40)} aside for ${formatDay('2026-10-21')}.`,
      ),
    ).toBeInTheDocument();
  });

  it('says the minimum, and keeps that amount aside, when the card is not paid in full', () => {
    renderSheet({ payInFull: false, minimumPayment: 25_00 });
    expect(fact('You pay')).toHaveTextContent(`You pay${usd(25_00)} minimum`);
    expect(within(sheet()).getByText(/Funcial keeps/)).toHaveTextContent(
      `keeps ${usd(25_00)} aside`,
    );
  });

  it('drops "Limit used" when the card has no limit', () => {
    renderSheet({ creditLimit: null });
    expect(within(sheet()).queryByText('Limit used')).not.toBeInTheDocument();
    expect(within(sheet()).getByText('You owe')).toBeInTheDocument();
  });

  it('has nothing to pay, and no note, when nothing is owed', () => {
    renderSheet({ openingBalance: 0 });
    expect(within(sheet()).getByRole('button', { name: 'Pay card' })).toBeDisabled();
    expect(within(sheet()).queryByText(/Funcial keeps/)).not.toBeInTheDocument();
  });

  it('opens the pay dialog from Pay card', async () => {
    renderSheet();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Pay card' }));
    const pay = screen.getByRole('dialog', { name: 'Pay Visa' });
    expect(within(pay).getByText(`You owe ${usd(318_40)}.`)).toBeInTheDocument();
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
    await store.getState().put('profile', makeProfile({ openingDate: '2026-10-01', salary: null }));
    await store
      .getState()
      .put(
        'debt',
        makeDebt({ id: 'visa', name: 'Visa', openingDate: '2026-10-01', openingBalance: 318_40 }),
      );
    renderWithStore(<CardSheet debtId="visa" onClose={vi.fn()} />, store);
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
