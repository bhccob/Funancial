import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { FUTURE } from '@/store/financeActions';
import { saleBeforePurchase } from '@/store/investActions';
import { formatShares, sharesText } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { market } from '@/services/market';
import { renderWithStore } from '@/test/appStoreStub';
import { makeHolding, makeProfile } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { HoldingPage } from './HoldingPage';
import { InvestScreen } from './InvestScreen';

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

beforeEach(() => {
  // No token: the screens never ask the network for anything.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
  vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
  toastStore.setState({ toasts: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/**
 * 40 shares of an Amsterdam ETF priced in euros, bought on Mar 3, 2025 for $8,420.00 ($210.50 a
 * share), at EUR 200 (1.2 to the dollar) now: $240.00 a share.
 */
const vusa = (overrides: Partial<Holding> = {}) =>
  makeHolding({
    id: 'vusa',
    symbol: 'VUSA.AS',
    name: 'Vanguard S&P 500 UCITS ETF',
    exchange: 'Amsterdam',
    type: 'etf',
    currency: 'EUR',
    shares: 40,
    costBasis: 8_420_00,
    purchaseDate: '2025-03-03',
    quote: { price: 200, previousClose: 199, fxRate: 1.2, asOf: '2026-10-14T14:05:00.000Z' },
    ...overrides,
  });

/** A real store, so a sale really changes the holding, and a full one really removes it. */
async function renderPage(holding: Holding = vusa()) {
  const { store } = await freshRealStore();
  await store.getState().put('profile', makeProfile({ currency: 'USD' }));
  await store.getState().put('holding', holding);
  const router = createMemoryRouter(
    [
      { path: '/invest', element: <InvestScreen /> },
      { path: '/invest/holding/:id', element: <HoldingPage /> },
    ],
    { initialEntries: ['/invest/holding/vusa'] },
  );
  renderWithStore(<RouterProvider router={router} />, store);
  const tables = () => store.getState().data.tables;
  return { store, router, tables };
}

async function openSell(holding?: Holding) {
  const page = await renderPage(holding);
  await userEvent.click(screen.getByRole('button', { name: 'Sell' }));
  const dialog = screen.getByRole('dialog', { name: 'Sell VUSA.AS' });
  return { ...page, dialog };
}

const SHARES = 'Shares to sell · of 40';
const PRICE = 'Sold at (per share)';

async function enter(dialog: HTMLElement, label: string, text: string) {
  const field = within(dialog).getByLabelText(label);
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
}

describe('Sell dialog', () => {
  it('opens from Sell with a share to sell, the price now in the profile currency, today and cash', async () => {
    const { dialog } = await openSell();
    expect(dialog).toHaveAccessibleDescription('Vanguard S&P 500 UCITS ETF');
    // The stepper, labelled with how many are held.
    expect(within(dialog).getByLabelText(SHARES)).toHaveValue('1');
    expect(within(dialog).getByRole('button', { name: 'Fewer shares' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'More shares' })).toBeEnabled();
    // EUR 200 at 1.2, to the cent, in dollars.
    expect(within(dialog).getByLabelText(PRICE)).toHaveValue('240.00');
    expect(within(dialog).getByLabelText('Sale date')).toHaveValue(TODAY);
    expect(within(dialog).getByLabelText('Sale date')).toHaveAttribute('max', TODAY);
    expect(within(dialog).getByRole('radio', { name: 'Cash' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Savings' })).not.toBeChecked();
    expect(within(dialog).getByRole('group', { name: 'Money goes to' })).toBeInTheDocument();
    // In lighter fields, like Add.
    for (const label of [PRICE, 'Sale date']) {
      expect(within(dialog).getByLabelText(label), label).toHaveClass('border-b', 'font-extrabold');
    }
    expect(within(dialog).getByRole('button', { name: 'Sell 1 share' })).toBeInTheDocument();
  });

  it('leaves the price empty for a holding with no price, and asks for one', async () => {
    const { dialog, tables } = await openSell(vusa({ quote: null }));
    expect(within(dialog).getByLabelText(PRICE)).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 1 share' }));
    expect(within(dialog).getByLabelText(PRICE)).toBeInvalid();
    expect(within(dialog).getByLabelText(PRICE)).toHaveAccessibleDescription(
      'Enter an amount like 12.50',
    );
    expect(tables().sale).toEqual([]);
  });

  it('has Half and All shortcuts: Half sets half, All sets everything and names the button', async () => {
    const { dialog } = await openSell();
    expect(within(dialog).getByRole('button', { name: 'Half' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Half' }));
    expect(within(dialog).getByLabelText(SHARES)).toHaveValue('20');
    expect(within(dialog).getByRole('button', { name: 'Sell 20 shares' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'All 40' }));
    expect(within(dialog).getByLabelText(SHARES)).toHaveValue('40');
    expect(within(dialog).getByRole('button', { name: 'Sell all 40 shares' })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Sell 40 shares' }),
    ).not.toBeInTheDocument();
  });

  it('halves an odd count into a fraction', async () => {
    const { dialog } = await openSell(vusa({ shares: 5, costBasis: 1_000_00 }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Half' }));
    expect(within(dialog).getByLabelText('Shares to sell · of 5')).toHaveValue('2.5');
  });

  it('says how many shares stay and what selling all does, and only the second after All', async () => {
    const { dialog } = await openSell();
    const STAY = 'Selling all 40 moves VUSA.AS to "Sold" with its result kept.';
    await enter(dialog, SHARES, '10');
    expect(dialog).toHaveTextContent(`30 shares stay. ${STAY}`);
    await userEvent.click(within(dialog).getByRole('button', { name: 'More shares' }));
    expect(dialog).toHaveTextContent(`29 shares stay. ${STAY}`);
    await enter(dialog, SHARES, '39');
    expect(dialog).toHaveTextContent(`1 share stays. ${STAY}`);

    await userEvent.click(within(dialog).getByRole('button', { name: 'All 40' }));
    expect(dialog).toHaveTextContent(STAY);
    expect(dialog).not.toHaveTextContent(/shares? stays?\./);
    // Typing all of them says the same.
    await enter(dialog, SHARES, '10');
    await enter(dialog, SHARES, '40');
    expect(dialog).not.toHaveTextContent(/shares? stays?\./);
  });

  it('takes the count shown, to four decimals, as all, with no sliver said to stay', async () => {
    const { dialog } = await openSell(vusa({ shares: 10.070906432748538 }));
    await enter(dialog, `Shares to sell · of ${formatShares(10.0709)}`, '10.0709');
    expect(dialog).not.toHaveTextContent(/shares? stays?\./);
    expect(
      within(dialog).getByRole('button', { name: `Sell all ${sharesText(10.0709)}` }),
    ).toBeInTheDocument();
  });

  it('shows what you get and the profit on these shares as the shares and the price change', async () => {
    const { dialog } = await openSell();
    // One share: $240.00 for a $210.50 share.
    expect(dialog).toHaveTextContent(`You get${usd(240_00)}`);
    expect(dialog).toHaveTextContent(`Profit on these shares▲ ${usd(29_50)}`);

    await enter(dialog, SHARES, '10');
    expect(dialog).toHaveTextContent(`You get${usd(2_400_00)}`);
    const profit = within(dialog).getByText(`▲ ${usd(295_00)}`);
    expect(profit).toHaveClass('text-success');

    // Sold for less than it cost: a loss, in the danger colour.
    await enter(dialog, PRICE, '200');
    expect(dialog).toHaveTextContent(`You get${usd(2_000_00)}`);
    const loss = within(dialog).getByText(`▼ ${usd(105_00)}`);
    expect(loss).toHaveClass('text-danger');
    expect(within(dialog).queryByText(/^▲/)).not.toBeInTheDocument();
  });

  it('announces the figures politely as they change', async () => {
    const { dialog } = await openSell();
    for (const label of ['You get', 'Profit on these shares']) {
      expect(within(dialog).getByText(label).closest('p')).toHaveAttribute('aria-live', 'polite');
    }
  });

  it('shows dashes for what you get while the shares or the price cannot be read', async () => {
    const { dialog } = await openSell();
    await enter(dialog, SHARES, 'abc');
    expect(dialog).toHaveTextContent('You get—');
    expect(dialog).toHaveTextContent('Profit on these shares—');
    await enter(dialog, SHARES, '41');
    expect(dialog).toHaveTextContent('You get—');
  });

  it('shows the planSale errors at the shares field, and sells nothing', async () => {
    const { dialog, tables } = await openSell();
    await enter(dialog, SHARES, '41');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 41 shares' }));
    const shares = within(dialog).getByLabelText(SHARES);
    expect(shares).toBeInvalid();
    expect(shares).toHaveAccessibleDescription('You only have 40 shares.');

    // Changing the shares clears it.
    await enter(dialog, SHARES, '0');
    expect(shares).toBeValid();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 0 shares' }));
    expect(shares).toHaveAccessibleDescription('Sell at least a part of a share.');

    await enter(dialog, SHARES, 'lots');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell shares' }));
    expect(shares).toHaveAccessibleDescription('Enter how many shares, like 2 or 0.5');
    await enter(dialog, SHARES, '1,000');
    await userEvent.click(within(dialog).getByRole('button', { name: /^Sell/ }));
    expect(shares).toHaveAccessibleDescription(
      'Is 1,000 a thousand or a fraction? Write 1000, or 1.0000 for the fraction',
    );
    expect(tables().sale).toEqual([]);
    expect(tables().holding[0]!.shares).toBe(40);
  });

  it('shows "Enter a price above 0." at the price field, and not at the shares', async () => {
    const { dialog, tables } = await openSell();
    await enter(dialog, PRICE, '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 1 share' }));
    expect(within(dialog).getByLabelText(PRICE)).toBeInvalid();
    expect(within(dialog).getByLabelText(PRICE)).toHaveAccessibleDescription(
      'Enter a price above 0.',
    );
    expect(within(dialog).getByLabelText(SHARES)).toBeValid();
    expect(tables().sale).toEqual([]);
  });

  it('refuses a date in the future and a date before it was bought, at the date field', async () => {
    const { dialog, tables } = await openSell();
    const date = within(dialog).getByLabelText('Sale date');
    fireEvent.change(date, { target: { value: '2026-10-15' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 1 share' }));
    expect(date).toHaveAccessibleDescription(FUTURE);

    fireEvent.change(date, { target: { value: '2025-03-02' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 1 share' }));
    expect(date).toHaveAccessibleDescription(saleBeforePurchase('2025-03-03'));
    expect(date).toHaveAccessibleDescription(/^The sale can't be before you bought it \(/);

    fireEvent.change(date, { target: { value: '' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 1 share' }));
    expect(date).toHaveAccessibleDescription('Choose the day you sold it');
    expect(tables().sale).toEqual([]);
  });

  it('sells part of a holding, closes the dialog and stays on the page', async () => {
    const { dialog, router, tables } = await openSell();
    await enter(dialog, SHARES, '10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 10 shares' }));

    await waitFor(() => expect(tables().sale).toHaveLength(1));
    expect(tables().sale[0]).toMatchObject({
      holdingId: 'vusa',
      shares: 10,
      proceeds: 2_400_00,
      cost: 2_105_00,
      soldOn: TODAY,
      to: 'cash',
      restore: null,
    });
    // 30 shares are left, with the cost the other ten did not carry.
    expect(tables().holding[0]).toMatchObject({ shares: 30, costBasis: 6_315_00 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/invest/holding/vusa');
    expect(screen.getByRole('heading', { level: 1, name: 'VUSA.AS' })).toBeInTheDocument();
    expect(toastStore.getState().toasts.at(-1)?.message).toBe('Sold 10 VUSA.AS.');
  });

  it('sells at the price and the date that were typed, into savings when asked', async () => {
    const { dialog, tables } = await openSell();
    await enter(dialog, PRICE, '250.55');
    fireEvent.change(within(dialog).getByLabelText('Sale date'), {
      target: { value: '2026-10-10' },
    });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Savings' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell 1 share' }));
    await waitFor(() => expect(tables().sale).toHaveLength(1));
    expect(tables().sale[0]).toMatchObject({
      shares: 1,
      proceeds: 250_55,
      soldOn: '2026-10-10',
      to: 'savings',
    });
  });

  it('sells every share and goes back to Invest', async () => {
    const { dialog, router, tables } = await openSell();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All 40' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sell all 40 shares' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/invest'));
    expect(tables().holding).toEqual([]);
    expect(tables().sale).toHaveLength(1);
    expect(tables().sale[0]).toMatchObject({ shares: 40, proceeds: 9_600_00, cost: 8_420_00 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Invest' })).toBeInTheDocument();
  });

  it('closes on Cancel without selling, and starts afresh the next time', async () => {
    const { dialog, tables } = await openSell();
    await enter(dialog, SHARES, '12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tables().sale).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Sell' }));
    expect(screen.getByLabelText(SHARES)).toHaveValue('1');
  });

  it('has a Sell button 48px tall, and keeps every touch target at 44px or more', async () => {
    const { dialog } = await openSell();
    expect(within(dialog).getByRole('button', { name: 'Sell 1 share' })).toHaveClass('h-12');
    expect(within(dialog).getByRole('button', { name: 'Half' })).toHaveClass('min-h-11');
    expect(within(dialog).getByRole('button', { name: 'All 40' })).toHaveClass('min-h-11');
  });
});
