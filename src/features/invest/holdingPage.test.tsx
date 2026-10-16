import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Holding } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDate, formatPercent, formatShares } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { market, MarketError, type HistoryResponse, type Market } from '@/services/market';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDividend, makeHolding, makeProfile } from '@/test/fixtures';
import { clearHistoryCache } from './historyCache';
import { HoldingPage } from './HoldingPage';
import { InvestScreen } from './InvestScreen';

const TODAY = '2026-10-14';
const usd = (minor: number) => formatMoney(minor, 'USD');

let fetchHistory: MockInstance<Market['fetchHistory']>;

beforeEach(() => {
  // No token unless a test sets one: the page then never asks the network for anything.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
  vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
  fetchHistory = vi.spyOn(market, 'fetchHistory').mockRejectedValue(new MarketError());
  clearHistoryCache();
  toastStore.setState({ toasts: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const configured = () => vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');

/**
 * 40 shares of an Amsterdam ETF priced in euros, bought on Mar 3, 2025 for $8,420.00 ($210.50 a
 * share) and worth 40 x EUR 200 at 1.2 = $9,600.00, so up $1,180.00 (14.0%). It is 590 days since.
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

function dataOf(holding: Holding = vusa()): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'USD' })];
  data.tables.holding = [holding];
  data.tables.dividend = [
    makeDividend({ holdingId: 'vusa', amount: 50_00 }),
    makeDividend({ holdingId: 'vusa', amount: 46_20 }),
    // Not received: skipped, or another holding's.
    makeDividend({ holdingId: 'vusa', status: 'skipped', amount: 0, bucket: null }),
    makeDividend({ holdingId: 'other', amount: 99_00 }),
  ];
  return data;
}

function renderPage(data = dataOf(), path = '/invest/holding/vusa', today = TODAY) {
  const store = createStubStore({ data, today });
  const router = createMemoryRouter(
    [
      { path: '/invest', element: <InvestScreen /> },
      { path: '/invest/holding/:id', element: <HoldingPage /> },
    ],
    { initialEntries: [path] },
  );
  renderWithStore(<RouterProvider router={router} />, store);
  return { store, router };
}

/** Closes in euros, as the service sends them: $210.00, $204.00, $228.00 and $240.00 at 1.2. */
const closes = (overrides: Partial<HistoryResponse> = {}): HistoryResponse => ({
  symbol: 'VUSA.AS',
  currency: 'EUR',
  points: [
    { date: '2025-03-03', close: 175 },
    { date: '2025-09-01', close: 170 },
    { date: '2026-03-02', close: 190 },
    { date: TODAY, close: 200 },
  ],
  ...overrides,
});

const fact = (label: string) => screen.getByText(label).parentElement!;

describe('the way to a holding', () => {
  it('opens from its row in Holdings, and goes back to Holdings', async () => {
    const { router } = renderPage(dataOf(), '/invest');
    await userEvent.click(screen.getByRole('link', { name: /^VUSA\.AS · / }));
    expect(router.state.location.pathname).toBe('/invest/holding/vusa');
    expect(screen.getByRole('heading', { level: 1, name: 'VUSA.AS' })).toBeInTheDocument();

    const back = screen.getByRole('link', { name: 'Back to Invest' });
    expect(back).toHaveTextContent('‹ Invest');
    expect(back).toHaveAttribute('href', '/invest?tab=holdings');
    expect(back).toHaveClass('min-h-11');
    await userEvent.click(back);
    expect(router.state.location.pathname).toBe('/invest');
    expect(screen.getByRole('tab', { name: 'Holdings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('goes back one step to the Invest it came from, with its pies choice kept', async () => {
    const { router } = renderPage(dataOf(), '/invest?pies=together');
    await userEvent.click(screen.getByRole('link', { name: /^VUSA\.AS · / }));
    await userEvent.click(screen.getByRole('link', { name: 'Back to Invest' }));
    // A step back in the history, not a new entry, so the first Android Back leaves Invest.
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.pathname).toBe('/invest');
    expect(router.state.location.search).toBe('?pies=together');
    expect(screen.queryByRole('heading', { level: 1, name: 'VUSA.AS' })).not.toBeInTheDocument();
  });

  it('opens Holdings in place of the holding when there is nothing to go back to', async () => {
    const { router } = renderPage();
    await userEvent.click(screen.getByRole('link', { name: 'Back to Invest' }));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.pathname).toBe('/invest');
    expect(router.state.location.search).toBe('?tab=holdings');
    expect(screen.getByRole('tab', { name: 'Holdings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('goes back to Invest for a holding that is not there', () => {
    const { router } = renderPage(dataOf(), '/invest/holding/gone');
    expect(router.state.location.pathname).toBe('/invest');
    expect(screen.getByRole('heading', { level: 1, name: 'Invest' })).toBeInTheDocument();
  });
});

describe('Holding page', () => {
  it('names the holding with its exchange, and leaves the exchange out when there is none', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'VUSA.AS' })).toBeInTheDocument();
    expect(screen.getByText('Vanguard S&P 500 UCITS ETF · Amsterdam')).toBeInTheDocument();
    expect(screen.getByText('Prices delayed · not financial advice')).toBeInTheDocument();
  });

  it('has no exchange to name for a holding without one', () => {
    renderPage(dataOf(vusa({ exchange: null })));
    expect(screen.getByText('Vanguard S&P 500 UCITS ETF')).toBeInTheDocument();
    expect(screen.queryByText(/Amsterdam/)).not.toBeInTheDocument();
  });

  it('shows the value and how far it has moved since it was bought', () => {
    renderPage();
    expect(screen.getByText(usd(9_600_00))).toHaveClass('text-[34px]');
    const change = screen.getByText(`▲ ${usd(1_180_00)}`).parentElement!;
    expect(change).toHaveTextContent(
      `▲ ${usd(1_180_00)} · ▲ ${formatPercent((118_000 * 100) / 842_000)} since you bought`,
    );
    expect(screen.getByText(`▲ ${usd(1_180_00)}`)).toHaveClass('text-accent-text');
  });

  it('shows a loss with a down arrow in the danger colour', () => {
    renderPage(dataOf(vusa({ costBasis: 10_000_00 })));
    const gain = screen.getByText(`▼ ${usd(400_00)}`);
    expect(gain).toHaveClass('text-danger');
    expect(gain.parentElement).toHaveTextContent(
      `▼ ${usd(400_00)} · ▼ ${formatPercent(4)} since you bought`,
    );
    expect(screen.getByText(`▼ ${formatPercent(4)}`)).toHaveClass('text-danger');
  });

  it('shows a dash for the value and the price of a holding with no price', () => {
    renderPage(dataOf(vusa({ quote: null })));
    expect(screen.queryByText(/since you bought/)).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3); // value, change and price now
    expect(fact('Price now')).toHaveTextContent('—');
    // What does not need a price is still said.
    expect(fact('You paid in total')).toHaveTextContent(usd(8_420_00));
  });

  it('lists the facts of the purchase, in the profile currency', () => {
    renderPage();
    expect(fact('Bought on')).toHaveTextContent(formatDate('2025-03-03'));
    expect(fact('Bought on')).toHaveTextContent('590 days ago');
    expect(fact('Shares')).toHaveTextContent('40');
    expect(fact('You paid per share')).toHaveTextContent(usd(210_50));
    // EUR 200 at 1.2.
    expect(fact('Price now')).toHaveTextContent(usd(240_00));
    expect(fact('You paid in total')).toHaveTextContent(usd(8_420_00));
    // Only what was received for this holding: 50.00 + 46.20.
    expect(fact('Dividends received')).toHaveTextContent(usd(96_20));
  });

  it('says no dividends have been received with $0.00, and keeps fractions of a share', () => {
    const data = dataOf(vusa({ shares: 0.25, costBasis: 100_00 }));
    data.tables.dividend = [];
    renderPage(data);
    expect(fact('Dividends received')).toHaveTextContent(usd(0));
    expect(fact('Shares')).toHaveTextContent(formatShares(0.25));
    expect(fact('You paid per share')).toHaveTextContent(usd(400_00));
  });

  it('opens the edit dialog from Edit', async () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit VUSA.AS' });
    expect(within(dialog).getByLabelText('Shares')).toHaveValue('40');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves an edit and stays on the page', async () => {
    const { store, router } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit VUSA.AS' });
    await userEvent.clear(within(dialog).getByLabelText('Shares'));
    await userEvent.type(within(dialog).getByLabelText('Shares'), '41');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
    expect(store.getState().put).toHaveBeenCalledWith(
      'holding',
      expect.objectContaining({ id: 'vusa', shares: 41 }),
    );
    expect(router.state.location.pathname).toBe('/invest/holding/vusa');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the holding as checked', async () => {
    const { store } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as checked' }));
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
    expect(store.getState().put).toHaveBeenCalledWith(
      'holding',
      expect.objectContaining({ id: 'vusa', checkedAt: expect.any(String) }),
    );
    expect(toastStore.getState().toasts.at(-1)?.message).toBe('Marked as checked.');
  });

  it('has buttons at least 48px tall', () => {
    renderPage();
    for (const name of ['Edit', 'Mark as checked']) {
      expect(screen.getByRole('button', { name })).toHaveClass('h-12');
    }
  });
});

describe('Holding page chart', () => {
  const chart = () =>
    screen.findByRole('img', {
      name: `From ${usd(210_00)} on ${formatDate('2025-03-03')} to ${usd(240_00)} today`,
    });

  it('draws the closes in the profile currency, with a dashed line at what was paid', async () => {
    configured();
    fetchHistory.mockResolvedValue(closes());
    renderPage();
    const img = await chart();
    // EUR 175 to EUR 200 at 1.2, and the dashed line at $210.50 a share.
    expect(fetchHistory).toHaveBeenCalledWith('VUSA.AS', '2025-03-03');
    expect(img.querySelector('line[stroke-dasharray]')).toBeInTheDocument();
    expect(within(img).getByText(`You bought · ${usd(210_50)}`)).toBeInTheDocument();
    expect(within(img).getByText(usd(240_00))).toBeInTheDocument();
    // Walking the closes shows each one's day and price.
    const slider = screen.getByRole('slider', { name: 'Price on a day' });
    fireEvent.change(slider, { target: { value: '1' } });
    expect(screen.getByText(`${formatDate('2025-09-01')} · ${usd(204_00)}`)).toBeInTheDocument();
  });

  it('reaches back by calendar months, to the end of a month that is too short', async () => {
    configured();
    fetchHistory.mockResolvedValue(closes());
    // Mar 31: a month back is Feb 28 (not Mar 1), half a year Sep 30, a year Mar 31.
    renderPage(dataOf(vusa({ purchaseDate: '2025-01-01' })), '/invest/holding/vusa', '2026-03-31');
    const chips = await screen.findByRole('group', { name: 'Chart range' });
    for (const [name, from] of [
      ['1M', '2026-02-28'],
      ['6M', '2025-09-30'],
      ['1Y', '2025-03-31'],
    ] as const) {
      await userEvent.click(within(chips).getByRole('button', { name }));
      await waitFor(() => expect(fetchHistory).toHaveBeenLastCalledWith('VUSA.AS', from));
    }
  });

  it('starts from the day it was bought, and the range chips change where it starts', async () => {
    configured();
    fetchHistory.mockResolvedValue(closes());
    renderPage();
    await chart();
    const chips = screen.getByRole('group', { name: 'Chart range' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Since you bought', '1Y', '6M', '1M']);
    expect(within(chips).getByRole('button', { name: 'Since you bought' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    for (const [name, from] of [
      ['1Y', '2025-10-14'],
      ['6M', '2026-04-14'],
      ['1M', '2026-09-14'],
    ] as const) {
      await userEvent.click(within(chips).getByRole('button', { name }));
      expect(within(chips).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() => expect(fetchHistory).toHaveBeenLastCalledWith('VUSA.AS', from));
      await chart();
    }
    // Back to the first: asked for once already, so not again within the hour.
    await userEvent.click(within(chips).getByRole('button', { name: 'Since you bought' }));
    await chart();
    expect(fetchHistory).toHaveBeenCalledTimes(4);
  });

  it('keeps the price paid on the chart since the purchase, and fits the other ranges to their own closes', async () => {
    configured();
    // Since the purchase the closes straddle the $210.50 paid; in the last month they are all above it.
    fetchHistory.mockImplementation(async (_symbol, from) =>
      from === '2025-03-03'
        ? closes()
        : closes({
            points: [
              { date: '2026-09-14', close: 250 },
              { date: TODAY, close: 260 },
            ],
          }),
    );
    renderPage();
    const since = await chart();
    expect(since.querySelector('line[stroke-dasharray]')).toBeInTheDocument();
    expect(within(since).getByText(`You bought · ${usd(210_50)}`)).toBeInTheDocument();

    const chips = screen.getByRole('group', { name: 'Chart range' });
    await userEvent.click(within(chips).getByRole('button', { name: '1M' }));
    const month = await screen.findByRole('img', {
      name: `From ${usd(300_00)} on ${formatDate('2026-09-14')} to ${usd(312_00)} today`,
    });
    expect(month.querySelector('line[stroke-dasharray]')).not.toBeInTheDocument();
    // The line would lie below the closes: an edge label points down to it.
    expect(within(month).getByText(`You bought · ${usd(210_50)} ↓`)).toBeInTheDocument();

    await userEvent.click(within(chips).getByRole('button', { name: 'Since you bought' }));
    expect((await chart()).querySelector('line[stroke-dasharray]')).toBeInTheDocument();
  });

  it('never reaches back before the purchase', async () => {
    configured();
    fetchHistory.mockResolvedValue(closes());
    renderPage(dataOf(vusa({ purchaseDate: '2026-09-20' })));
    await chart();
    const chips = screen.getByRole('group', { name: 'Chart range' });
    for (const name of ['1Y', '6M', '1M']) {
      await userEvent.click(within(chips).getByRole('button', { name }));
      await chart();
    }
    // The month starts on Sep 14, which is before Sep 20; the others reach back further still.
    expect(fetchHistory.mock.calls).toEqual([['VUSA.AS', '2026-09-20']]);
  });

  it('says it is loading while it waits', async () => {
    configured();
    let answer: (r: HistoryResponse) => void = () => {};
    fetchHistory.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    expect(await screen.findByText('Loading chart…')).toBeInTheDocument();
    answer(closes());
    await chart();
    expect(screen.queryByText('Loading chart…')).not.toBeInTheDocument();
  });

  it('says the chart needs the price service, without one, and asks for nothing', () => {
    renderPage();
    expect(screen.getByText('The chart needs the price service.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Chart range' })).not.toBeInTheDocument();
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it("says it could not load the chart when the service fails, and when the closes are not in the holding's currency", async () => {
    configured();
    fetchHistory.mockRejectedValue(new MarketError());
    renderPage();
    expect(await screen.findByText("Couldn't load the chart right now.")).toBeInTheDocument();
    // The facts are still there.
    expect(fact('Shares')).toHaveTextContent('40');
    cleanup();

    // Closes in dollars for a holding kept in euros would be turned into dollars at the euro rate.
    clearHistoryCache();
    fetchHistory.mockResolvedValue(closes({ currency: 'USD' }));
    renderPage();
    expect(await screen.findByText("Couldn't load the chart right now.")).toBeInTheDocument();
  });

  it('says there is not enough history for fewer than two closes', async () => {
    configured();
    fetchHistory.mockResolvedValue(closes({ points: [{ date: TODAY, close: 200 }] }));
    renderPage();
    expect(await screen.findByText('Not enough price history yet.')).toBeInTheDocument();
    cleanup();

    clearHistoryCache();
    fetchHistory.mockResolvedValue(closes({ points: [] }));
    renderPage();
    expect(await screen.findByText('Not enough price history yet.')).toBeInTheDocument();
  });

  it('does not ask for the history of a holding bought today', async () => {
    configured();
    renderPage(dataOf(vusa({ purchaseDate: TODAY })));
    expect(screen.getByText('Not enough price history yet.')).toBeInTheDocument();
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('has no chart for a holding with no exchange rate to show it in the profile currency', () => {
    configured();
    renderPage(
      dataOf(
        vusa({
          quote: { price: 200, previousClose: 199, fxRate: null, asOf: '2026-10-14T14:05:00.000Z' },
        }),
      ),
    );
    expect(screen.queryByRole('group', { name: 'Chart range' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading chart/)).not.toBeInTheDocument();
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('draws a holding that is in the profile currency at the rate of 1', async () => {
    configured();
    fetchHistory.mockResolvedValue(
      closes({
        currency: 'USD',
        points: [
          { date: '2025-03-03', close: 210 },
          { date: TODAY, close: 240 },
        ],
      }),
    );
    renderPage(
      dataOf(
        vusa({
          currency: 'USD',
          quote: { price: 240, previousClose: 239, fxRate: 1, asOf: '2026-10-14T14:05:00.000Z' },
        }),
      ),
    );
    expect(await chart()).toBeInTheDocument();
  });
});
