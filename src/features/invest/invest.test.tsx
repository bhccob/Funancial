import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Holding } from '@/domain/entities';
import { formatMoney, formatMoneyPlain } from '@/domain/money';
import { emptySnapshot, type DataSnapshot, type TableRecord } from '@/domain/snapshot';
import { toastStore } from '@/lib/toast';
import {
  formatDateTime,
  formatDay,
  formatMonthShort,
  formatMonthYear,
  formatPercent,
} from '@/lib/format';
import { market, MarketError, type Market, type NewsItem } from '@/services/market';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDividend, makeHolding, makeProfile } from '@/test/fixtures';
import { FUTURE } from '@/store/financeActions';
import { UNKNOWN_SYMBOL } from '@/store/investActions';
import { InvestScreen } from './InvestScreen';
import { clearNewsCache } from './newsCache';

const TODAY = '2026-10-14';
const ASOF = '2026-10-14T14:05:00.000Z';
// Expected text is built with the app's formatters: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });

const NOT_CONFIGURED = 'Live prices need the price service. Showing your last prices.';
const UNREACHABLE = "Couldn't reach the price service. Showing your last prices.";

let fetchQuotes: MockInstance<Market['fetchQuotes']>;
let fetchProfile: MockInstance<Market['fetchProfile']>;
let fetchNews: MockInstance<Market['fetchNews']>;

beforeEach(() => {
  // No token unless a test sets one: the screen then never asks the network for anything.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
  fetchQuotes = vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
  fetchProfile = vi.spyOn(market, 'fetchProfile').mockRejectedValue(new MarketError());
  vi.spyOn(market, 'fetchDividends').mockRejectedValue(new MarketError());
  fetchNews = vi.spyOn(market, 'fetchNews').mockResolvedValue({ items: [] });
  clearNewsCache();
  toastStore.setState({ toasts: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const configured = () => vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');

const held = (overrides: Parameters<typeof makeHolding>[0] = {}) =>
  makeHolding({ purchaseDate: '2026-09-01', ...overrides });

const quote = (price: number, previousClose: number | null, fxRate: number | null = 1) => ({
  price,
  previousClose,
  fxRate,
  asOf: ASOF,
});

/**
 * Worth $1,950.00 for $1,900.00 paid (up 2.6%). Today KO is up $10, Apple down $25 and the ETF
 * unchanged, so the day is down $15. Best KO +20.0%, worst Apple -5.0%.
 */
function portfolioData(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'USD' })];
  data.tables.holding = [
    held({
      id: 'ko',
      symbol: 'KO',
      name: 'Coca-Cola',
      sector: 'Consumer Defensive',
      shares: 10,
      costBasis: 500_00,
      quote: quote(60, 59),
    }),
    held({
      id: 'aapl',
      symbol: 'AAPL',
      name: 'Apple',
      sector: 'Technology',
      shares: 5,
      costBasis: 1_000_00,
      quote: quote(190, 195),
    }),
    held({
      id: 'vwrl',
      symbol: 'VWRL',
      name: 'All-World ETF',
      type: 'etf',
      sector: null,
      shares: 4,
      costBasis: 400_00,
      quote: quote(100, 100),
    }),
  ];
  return data;
}

function noHoldings(): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'USD' })];
  return data;
}

function renderInvest(data: DataSnapshot, path = '/invest') {
  const store = createStubStore({ data, today: TODAY });
  const router = createMemoryRouter([{ path: '/invest', element: <InvestScreen /> }], {
    initialEntries: [path],
  });
  renderWithStore(<RouterProvider router={router} />, store);
  return { store, router };
}

const tab = (name: string) => screen.getByRole('tab', { name });
const region = (name: string) => screen.getByRole('region', { name });
const rowOf = (symbol: string) => screen.getByRole('button', { name: new RegExp(`^${symbol} · `) });

describe('Invest tabs', () => {
  it('opens the tab from ?tab= and switches tabs', async () => {
    const { router } = renderInvest(portfolioData(), '/invest?tab=news');
    expect(screen.getByRole('heading', { level: 1, name: 'Invest' })).toBeInTheDocument();
    expect(tab('News')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Holdings')).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('region', { name: 'Portfolio value' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'News' })).toHaveTextContent(
      'News needs the price service.',
    );

    await userEvent.click(tab('Dividends'));
    expect(tab('Dividends')).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.search).toBe('?tab=dividends');
    expect(screen.getByRole('tabpanel', { name: 'Dividends' })).toHaveTextContent(
      'No dividends yet. Holdings that pay dividends show up here.',
    );

    await userEvent.click(tab('Holdings'));
    expect(tab('Holdings')).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.search).toBe('');
    expect(region('Portfolio value')).toBeInTheDocument();
  });

  it('starts on Holdings without a tab, or with one it does not know', () => {
    renderInvest(portfolioData());
    expect(tab('Holdings')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Holdings')).toHaveAttribute('tabindex', '0');
    expect(tab('News')).toHaveAttribute('tabindex', '-1');
    // Each tab is at least 44px wide as well as tall, whatever its word.
    for (const name of ['Holdings', 'Dividends', 'News']) {
      expect(tab(name)).toHaveClass('min-h-11', 'min-w-11');
    }
    cleanup();
    renderInvest(portfolioData(), '/invest?tab=nonsense');
    expect(tab('Holdings')).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between tabs with the arrow keys', async () => {
    renderInvest(portfolioData());
    tab('Holdings').focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(tab('Dividends')).toHaveAttribute('aria-selected', 'true'));
    expect(tab('Dividends')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(tab('Holdings')).toHaveAttribute('aria-selected', 'true'));
    // Past the first tab it comes round to the last.
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(tab('News')).toHaveAttribute('aria-selected', 'true'));
    expect(tab('News')).toHaveFocus();
  });
});

describe('Holdings tab', () => {
  it('shows value, today and all-time change, allocation chips and rows', async () => {
    renderInvest(portfolioData());
    const value = region('Portfolio value');
    expect(within(value).getByText(usd(1_950_00))).toHaveClass('text-[34px]');

    // Down $15 today (danger), up 2.6% on what was paid (accent).
    const day = within(value).getByText(`▼ ${usd(15_00)} today`);
    expect(day).toHaveClass('text-danger');
    const all = within(value).getByText(`▲ ${formatPercent((5_000 * 100) / 190_000)} all time`);
    expect(all).toHaveClass('text-accent-text');
    expect(day.parentElement).toHaveTextContent(
      `▼ ${usd(15_00)} today · ▲ ${formatPercent((5_000 * 100) / 190_000)} all time`,
    );

    // By holding to start with: the legend names each holding, biggest first.
    const by = within(value).getByRole('group', { name: 'Group by' });
    expect(
      within(by)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['By holding', 'By type', 'By sector']);
    expect(within(by).getByRole('button', { name: 'By holding' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The legend's rows: the buttons that carry text and are not the chips.
    const chips = ['By holding', 'By type', 'By sector'];
    const legend = () =>
      within(value)
        .getAllByRole('button')
        .map((b) => b.textContent ?? '')
        .filter((text) => text !== '' && !chips.includes(text));
    expect(legend()).toEqual([
      `AAPL${usdWhole(950_00)}`,
      `KO${usdWhole(600_00)}`,
      `VWRL${usdWhole(400_00)}`,
    ]);

    await userEvent.click(within(by).getByRole('button', { name: 'By type' }));
    expect(within(by).getByRole('button', { name: 'By type' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(legend()).toEqual([`Stocks${usdWhole(1_550_00)}`, `ETFs${usdWhole(400_00)}`]);

    await userEvent.click(within(by).getByRole('button', { name: 'By sector' }));
    expect(legend()).toEqual([
      `Technology${usdWhole(950_00)}`,
      `Consumer Defensive${usdWhole(600_00)}`,
      `ETF (diversified)${usdWhole(400_00)}`,
    ]);

    const rows = within(screen.getByRole('list', { name: 'Holdings' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      `KO · Coca-Cola10 shares${usd(600_00)}▲ ${formatPercent(20)}`,
      `AAPL · Apple5 shares${usd(950_00)}▼ ${formatPercent(5)}`,
      `VWRL · All-World ETF4 shares${usd(400_00)}▲ ${formatPercent(0)}`,
    ]);
    expect(within(rows[1]!).getByText(`▼ ${formatPercent(5)}`)).toHaveClass('text-danger');
    expect(within(rows[0]!).getByText(`▲ ${formatPercent(20)}`)).toHaveClass('text-accent-text');

    expect(
      screen.getByText(
        `Best: KO ${formatPercent(20, true)} · Worst: AAPL ${formatPercent(-5, true)}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Prices delayed · not financial advice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a holding' })).toBeInTheDocument();
  });

  it('uses the singular for one share, and leaves out best and worst for a single holding', () => {
    const data = noHoldings();
    data.tables.holding = [held({ shares: 1, quote: quote(60, 59) })];
    renderInvest(data);
    expect(screen.getByText('1 share')).toBeInTheDocument();
    expect(screen.queryByText(/^Best:/)).not.toBeInTheDocument();
  });

  it('shows a rise today with an up arrow in the accent colour', () => {
    const data = noHoldings();
    data.tables.holding = [held({ shares: 10, costBasis: 700_00, quote: quote(60, 59) })];
    renderInvest(data);
    expect(screen.getByText(`▲ ${usd(10_00)} today`)).toHaveClass('text-accent-text');
    expect(screen.getByText(`▼ ${formatPercent((100_00 * 100) / 700_00)} all time`)).toHaveClass(
      'text-danger',
    );
  });

  it('shows the not-configured note with the last prices and as-of time', () => {
    renderInvest(portfolioData());
    expect(screen.getByText(NOT_CONFIGURED)).toBeInTheDocument();
    expect(screen.getByText(`as of ${formatDateTime(ASOF)}`)).toBeInTheDocument();
    expect(within(region('Portfolio value')).getByText(usd(1_950_00))).toBeInTheDocument();
    expect(fetchQuotes).not.toHaveBeenCalled();
    expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument();
  });

  it('says so when the price service cannot be reached, and not when it answers', async () => {
    configured();
    fetchQuotes.mockRejectedValue(new MarketError());
    renderInvest(portfolioData());
    expect(await screen.findByText(UNREACHABLE)).toBeInTheDocument();
    expect(screen.queryByText(NOT_CONFIGURED)).not.toBeInTheDocument();
    expect(within(region('Portfolio value')).getByText(usd(1_950_00))).toBeInTheDocument();

    fetchQuotes.mockResolvedValue({ quotes: [], missing: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument());
  });

  it('refreshes from the Refresh button, and is quiet about notes while it works', async () => {
    configured();
    renderInvest(portfolioData());
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
    // Disabled while the first refresh runs.
    await waitFor(() => expect(refresh).toBeEnabled());
    fetchQuotes.mockClear();
    await userEvent.click(refresh);
    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(NOT_CONFIGURED)).not.toBeInTheDocument();
    expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument();
  });

  it('flags holdings without an exchange rate', () => {
    const data = noHoldings();
    data.tables.holding = [
      held({ symbol: 'KO', name: 'Coca-Cola', shares: 10, quote: quote(60, 59) }),
      held({ symbol: 'SAP', name: 'SAP SE', currency: 'EUR', quote: quote(120, 119, null) }),
    ];
    renderInvest(data);
    expect(screen.getByText('1 holding has no exchange rate yet')).toBeInTheDocument();
    expect(rowOf('SAP')).toHaveTextContent('Not priced yet');
    // Left out of the total.
    expect(within(region('Portfolio value')).getByText(usd(600_00))).toBeInTheDocument();

    cleanup();
    data.tables.holding.push(
      held({ symbol: 'ASML', name: 'ASML', currency: 'EUR', quote: quote(700, 690, null) }),
    );
    renderInvest(data);
    expect(screen.getByText('2 holdings have no exchange rate yet')).toBeInTheDocument();
  });

  it('counts only holdings that have a price but no rate in the exchange-rate note', () => {
    const data = noHoldings();
    data.tables.holding = [
      held({ symbol: 'KO', name: 'Coca-Cola', quote: quote(60, 59) }),
      // Just added: no quote yet, so no price at all. It says so on its row, not in the note.
      held({ symbol: 'NEW', name: 'Just added', quote: null }),
      // A price of the person's own in euros, and no rate to turn it into dollars.
      held({ symbol: 'SAP', name: 'SAP SE', currency: 'EUR', manualPrice: 120, quote: null }),
    ];
    renderInvest(data);
    expect(screen.getByText('1 holding has no exchange rate yet')).toBeInTheDocument();
    expect(rowOf('NEW')).toHaveTextContent('Not priced yet');
    expect(rowOf('SAP')).toHaveTextContent('Not priced yet');

    // Without the one that has a price, nothing is said about rates.
    cleanup();
    data.tables.holding = data.tables.holding.slice(0, 2);
    renderInvest(data);
    expect(screen.queryByText(/no exchange rate yet/)).not.toBeInTheDocument();
    expect(rowOf('NEW')).toHaveTextContent('Not priced yet');
  });

  it('says nothing about exchange rates for a freshly added holding without a quote', () => {
    const data = noHoldings();
    data.tables.holding = [held({ symbol: 'NEW', name: 'Just added', quote: null })];
    renderInvest(data);
    expect(screen.queryByText(/no exchange rate yet/)).not.toBeInTheDocument();
    expect(rowOf('NEW')).toHaveTextContent('Not priced yet');
  });

  it('shows no note about rates when every holding is priced', () => {
    renderInvest(portfolioData());
    expect(screen.queryByText(/no exchange rate yet/)).not.toBeInTheDocument();
  });

  it('asks for a first holding when there are none', async () => {
    renderInvest(noHoldings());
    expect(screen.getByText('No investments yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Portfolio value' })).not.toBeInTheDocument();
    expect(screen.queryByText(NOT_CONFIGURED)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add your first holding' }));
    expect(screen.getByRole('dialog', { name: 'Add a holding' })).toBeInTheDocument();
  });
});

/** Waits for the refresh that starts when the screen opens to finish and save, then forgets it. */
async function settled(store: ReturnType<typeof createStubStore>) {
  await waitFor(() => expect(store.getState().putMany).toHaveBeenCalled());
  vi.mocked(store.getState().putMany).mockClear();
}

async function openNewHolding() {
  const add =
    screen.queryByRole('button', { name: 'Add a holding' }) ??
    screen.getByRole('button', { name: 'Add your first holding' });
  await userEvent.click(add);
  return screen.getByRole('dialog', { name: 'Add a holding' });
}

/** Types into a field by its label (the field is cleared first, so a default can be replaced). */
async function enter(dialog: HTMLElement, label: string, text: string) {
  const field = within(dialog).getByLabelText(label);
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
}

const MICROSOFT = {
  symbol: 'MSFT',
  name: 'Microsoft',
  type: 'stock' as const,
  exchange: 'NMS',
  currency: 'USD',
  sector: 'Technology',
};

describe('HoldingDialog adding', () => {
  it('adds a holding, with name and currency fields when the lookup fails', async () => {
    configured();
    fetchProfile.mockRejectedValue(new MarketError());
    const { store } = renderInvest(portfolioData());
    await settled(store);
    const dialog = await openNewHolding();

    // The service is configured, so the name is looked up and not asked for yet.
    expect(within(dialog).queryByLabelText('Name')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Tax withheld on dividends (%)')).toHaveValue('15');
    expect(within(dialog).getByLabelText('Purchase date')).toHaveValue(TODAY);
    expect(within(dialog).getByRole('radio', { name: 'Already owned' })).toBeChecked();
    expect(within(dialog).queryByLabelText('Manual price')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    await enter(dialog, 'Symbol', 'acme');
    await enter(dialog, 'Shares', '2.5');
    await enter(dialog, 'What you paid in total', '400');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Cash' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    // The lookup failed: the friendly message, and the fields to fill in yourself.
    expect(await within(dialog).findByLabelText('Name')).toBeInTheDocument();
    expect(toastStore.getState().toasts.map((t) => t.message)).toEqual([UNKNOWN_SYMBOL]);
    expect(store.getState().putMany).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Type')).toHaveValue('stock');

    await enter(dialog, 'Name', 'Acme Corp');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'ETF');
    await enter(dialog, 'Currency', 'eur');
    fetchQuotes.mockClear();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().putMany).toHaveBeenCalled());
    const items = vi.mocked(store.getState().putMany).mock.calls[0]![0];
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      table: 'holding',
      record: expect.objectContaining({
        symbol: 'ACME',
        name: 'Acme Corp',
        type: 'etf',
        currency: 'EUR',
        shares: 2.5,
        costBasis: 400_00,
        purchaseDate: TODAY,
        withholdingPct: 15,
      }),
    });
    expect(items[1]).toEqual({
      table: 'transaction',
      record: expect.objectContaining({ type: 'investment', amount: 400_00, from: 'cash' }),
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toastStore.getState().toasts.at(-1)?.message).toBe('Holding added.');
    // A new holding has no quote, so prices are asked for again.
    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
  });

  it('names the holding from the price service when it knows the symbol', async () => {
    configured();
    fetchProfile.mockResolvedValue(MICROSOFT);
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await enter(dialog, 'Symbol', ' msft ');
    await enter(dialog, 'Shares', '3');
    await enter(dialog, 'What you paid in total', '900');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().putMany).toHaveBeenCalledTimes(1));
    const items = vi.mocked(store.getState().putMany).mock.calls[0]![0];
    // Bought before using the app: no money moves.
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      table: 'holding',
      record: expect.objectContaining({
        symbol: 'MSFT',
        name: 'Microsoft',
        currency: 'USD',
        sector: 'Technology',
      }),
    });
    expect(within(dialog).queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('asks for the name, type and currency from the start without the price service', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Type')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Currency')).toBeInTheDocument();

    await enter(dialog, 'Symbol', 'vwrl.l');
    await enter(dialog, 'Name', 'All-World ETF');
    await enter(dialog, 'Currency', 'gbp');
    await enter(dialog, 'Shares', '40');
    await enter(dialog, 'What you paid in total', '4,000.50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().putMany).toHaveBeenCalledTimes(1));
    expect(fetchProfile).not.toHaveBeenCalled();
    expect(vi.mocked(store.getState().putMany).mock.calls[0]![0][0]).toEqual({
      table: 'holding',
      record: expect.objectContaining({
        symbol: 'VWRL.L',
        name: 'All-World ETF',
        currency: 'GBP',
        shares: 40,
        costBasis: 4_000_50,
      }),
    });
  });

  it('shows friendly errors for every field and saves nothing until they are fixed', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    const text = dialog.textContent;
    expect(text).toContain('Use letters and numbers only, like KO or VWRL.L');
    expect(text).toContain('Enter the name');
    expect(text).toContain('Use a 3-letter code, like USD');
    expect(text).toContain('Enter how many shares, like 2 or 0.5');
    expect(text).toContain('Enter an amount like 12.50');
    expect(within(dialog).getByLabelText('Symbol')).toBeInvalid();
    expect(store.getState().putMany).not.toHaveBeenCalled();

    await enter(dialog, 'Symbol', 'bad symbol!');
    await enter(dialog, 'Name', 'Acme');
    await enter(dialog, 'Currency', 'US');
    await enter(dialog, 'Shares', '0');
    await enter(dialog, 'What you paid in total', '10');
    await enter(dialog, 'Tax withheld on dividends (%)', '101');
    fireEvent.change(within(dialog).getByLabelText('Purchase date'), {
      target: { value: '2026-10-15' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(dialog.textContent).toContain('Use letters and numbers only, like KO or VWRL.L');
    expect(dialog.textContent).toContain('Use a 3-letter code, like USD');
    expect(dialog.textContent).toContain('Enter how many shares, like 2 or 0.5');
    expect(dialog.textContent).toContain('Enter a percentage from 0 to 100');
    expect(dialog.textContent).toContain('Use today or an earlier date.');
    expect(store.getState().putMany).not.toHaveBeenCalled();
    expect(toastStore.getState().toasts).toEqual([]);

    // A negative number, text, an exponent and a number too big to hold are not shares either.
    for (const bad of ['-1', 'abc', '1e3', '', '9'.repeat(400)]) {
      fireEvent.change(within(dialog).getByLabelText('Shares'), { target: { value: bad } });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(dialog.textContent, bad).toContain('Enter how many shares, like 2 or 0.5');
    }
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });

  it('takes fractional shares, a free holding and no withholding', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await enter(dialog, 'Symbol', 'BTC-USD');
    await enter(dialog, 'Name', 'Bitcoin');
    await enter(dialog, 'Currency', 'USD');
    await enter(dialog, 'Shares', '0,25');
    await enter(dialog, 'What you paid in total', '0');
    await enter(dialog, 'Tax withheld on dividends (%)', '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().putMany).toHaveBeenCalledTimes(1));
    expect(vi.mocked(store.getState().putMany).mock.calls[0]![0][0]).toEqual({
      table: 'holding',
      record: expect.objectContaining({ shares: 0.25, costBasis: 0, withholdingPct: 0 }),
    });
  });

  it('refuses shares that could be a thousand times out, and reads a clear thousand', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await enter(dialog, 'Symbol', 'KO');
    await enter(dialog, 'Name', 'Coca-Cola');
    await enter(dialog, 'Currency', 'USD');
    await enter(dialog, 'What you paid in total', '100');

    // "1,000" and "1.000" are a thousand or one: saved as neither, and the person is asked.
    for (const text of ['1,000', '1.000']) {
      await enter(dialog, 'Shares', text);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(dialog.textContent, text).toContain(
        `Is ${text} a thousand or a fraction? Write 1000, or 1.0000 for the fraction`,
      );
      expect(within(dialog).getByLabelText('Shares'), text).toBeInvalid();
    }
    expect(store.getState().putMany).not.toHaveBeenCalled();

    await enter(dialog, 'Shares', '1,234.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().putMany).toHaveBeenCalledTimes(1));
    expect(vi.mocked(store.getState().putMany).mock.calls[0]![0][0]).toEqual({
      table: 'holding',
      record: expect.objectContaining({ shares: 1234.5 }),
    });
  });

  it('refuses a withholding that could be a thousand times out', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await enter(dialog, 'Tax withheld on dividends (%)', '15,000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(dialog.textContent).toContain('Is 15,000 a thousand or a fraction?');
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });

  it('reads a three-decimal fraction that starts with 0', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await enter(dialog, 'Symbol', 'BTC-USD');
    await enter(dialog, 'Name', 'Bitcoin');
    await enter(dialog, 'Currency', 'USD');
    await enter(dialog, 'What you paid in total', '100');
    await enter(dialog, 'Shares', '0.125');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().putMany).toHaveBeenCalledTimes(1));
    expect(vi.mocked(store.getState().putMany).mock.calls[0]![0][0]).toEqual({
      table: 'holding',
      record: expect.objectContaining({ shares: 0.125 }),
    });
  });

  it('refuses to take nothing from cash or savings, and a date the schema would not read', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await enter(dialog, 'Symbol', 'KO');
    await enter(dialog, 'Name', 'Coca-Cola');
    await enter(dialog, 'Currency', 'USD');
    await enter(dialog, 'Shares', '1');
    await enter(dialog, 'What you paid in total', '0');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Savings' }));
    fireEvent.change(within(dialog).getByLabelText('Purchase date'), {
      target: { value: '19999-01-01' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(dialog.textContent).toContain('Enter what you paid, or choose Already owned');
    expect(dialog.textContent).toContain('Choose the day you bought it');
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });

  it('closes without saving on Cancel', async () => {
    const { store } = renderInvest(noHoldings());
    const dialog = await openNewHolding();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });
});

describe('HoldingDialog editing', () => {
  it('edits a manual price and marks a holding checked', async () => {
    const data = portfolioData();
    const { store } = renderInvest(data);
    await userEvent.click(rowOf('KO'));
    const dialog = screen.getByRole('dialog', { name: 'Edit KO' });
    expect(dialog).toHaveAccessibleDescription('Coca-Cola');
    expect(within(dialog).getByLabelText('Symbol')).toBeDisabled();
    expect(within(dialog).getByLabelText('Shares')).toHaveValue('10');
    expect(within(dialog).getByLabelText('What you paid in total')).toHaveValue('500.00');
    expect(within(dialog).getByLabelText('Purchase date')).toHaveValue(
      data.tables.holding[0]!.purchaseDate,
    );
    expect(within(dialog).getByLabelText('Tax withheld on dividends (%)')).toHaveValue('15');
    expect(within(dialog).getByLabelText('Manual price')).toHaveValue('');
    expect(within(dialog).queryByRole('radiogroup', { name: 'Paid from' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Paid from')).not.toBeInTheDocument();
    // The service is not configured here, so the holding's name, type and currency can be fixed.
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Coca-Cola');
    expect(within(dialog).getByLabelText('Currency')).toHaveValue('USD');

    await enter(dialog, 'Manual price', '65.5');
    await enter(dialog, 'Shares', '12.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
    expect(store.getState().put).toHaveBeenCalledWith(
      'holding',
      expect.objectContaining({
        id: 'ko',
        symbol: 'KO',
        manualPrice: 65.5,
        shares: 12.5,
        costBasis: 500_00,
        withholdingPct: 15,
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toastStore.getState().toasts.at(-1)?.message).toBe('Holding updated.');

    await userEvent.click(rowOf('KO'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit KO' })).getByRole('button', {
        name: 'Mark as checked',
      }),
    );
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(2));
    const checked = vi.mocked(store.getState().put).mock.calls[1]!;
    expect(checked[0]).toBe('holding');
    expect(checked[1]).toEqual(
      expect.objectContaining({ id: 'ko', checkedAt: expect.any(String), manualPrice: null }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an existing manual price, and an empty field puts the holding back on live prices', async () => {
    const data = portfolioData();
    data.tables.holding[0] = { ...data.tables.holding[0]!, manualPrice: 61.25 };
    const { store } = renderInvest(data);
    await userEvent.click(rowOf('KO'));
    const dialog = screen.getByRole('dialog', { name: 'Edit KO' });
    expect(within(dialog).getByLabelText('Manual price')).toHaveValue('61.25');
    expect(within(dialog).getByLabelText('Manual price')).toHaveAccessibleDescription(
      'In USD. Leave it empty to use the live price.',
    );

    await enter(dialog, 'Manual price', '');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
    expect(store.getState().put).toHaveBeenCalledWith(
      'holding',
      expect.objectContaining({ id: 'ko', manualPrice: null }),
    );
  });

  it('rejects a manual price that is not a number, without a raw schema error', async () => {
    const { store } = renderInvest(portfolioData());
    await userEvent.click(rowOf('AAPL'));
    const dialog = screen.getByRole('dialog', { name: 'Edit AAPL' });
    await enter(dialog, 'Manual price', 'a lot');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(dialog.textContent).toContain('Enter a price like 12.50, or leave it empty');
    expect(store.getState().put).not.toHaveBeenCalled();
  });

  it('saves a holding whose stored numbers have three decimals after changing only another field', async () => {
    const data = portfolioData();
    data.tables.holding[0] = {
      ...data.tables.holding[0]!,
      shares: 1.125,
      manualPrice: 12.345,
      withholdingPct: 12.125,
    };
    const { store } = renderInvest(data);
    await userEvent.click(rowOf('KO'));
    const dialog = screen.getByRole('dialog', { name: 'Edit KO' });
    // Filled in the way the person would have to write them.
    expect(within(dialog).getByLabelText('Shares')).toHaveValue('1.1250');
    expect(within(dialog).getByLabelText('Manual price')).toHaveValue('12.3450');
    expect(within(dialog).getByLabelText('Tax withheld on dividends (%)')).toHaveValue('12.1250');

    fireEvent.change(within(dialog).getByLabelText('Purchase date'), {
      target: { value: '2026-09-02' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
    expect(store.getState().put).toHaveBeenCalledWith(
      'holding',
      expect.objectContaining({
        id: 'ko',
        shares: 1.125,
        manualPrice: 12.345,
        withholdingPct: 12.125,
        purchaseDate: '2026-09-02',
      }),
    );
  });

  it('refuses a manual price that could be a thousand times out, and reads a clear one', async () => {
    const { store } = renderInvest(portfolioData());
    await userEvent.click(rowOf('AAPL'));
    const dialog = screen.getByRole('dialog', { name: 'Edit AAPL' });
    for (const text of ['1,234', '1.234']) {
      await enter(dialog, 'Manual price', text);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(dialog.textContent, text).toContain(
        `Is ${text} a thousand or a fraction? Write 1234, or 1.2340 for the fraction`,
      );
    }
    expect(store.getState().put).not.toHaveBeenCalled();

    await enter(dialog, 'Manual price', '1,234.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
    expect(store.getState().put).toHaveBeenCalledWith(
      'holding',
      expect.objectContaining({ id: 'aapl', manualPrice: 1234.5 }),
    );
  });

  it('deletes a holding', async () => {
    const { store } = renderInvest(portfolioData());
    await userEvent.click(rowOf('AAPL'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Edit AAPL' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(store.getState().remove).toHaveBeenCalledWith('holding', 'aapl'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the name, type and currency out of an edit while the price service names them', async () => {
    configured();
    const { store } = renderInvest(portfolioData());
    await settled(store);
    await userEvent.click(rowOf('KO'));
    const dialog = screen.getByRole('dialog', { name: 'Edit KO' });
    expect(within(dialog).queryByLabelText('Name')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Type')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Currency')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().put).toHaveBeenCalledTimes(1));
  });
});

type Info = NonNullable<Holding['dividendInfo']>;

const info = (extra: Partial<Info>): Info => ({
  history: [],
  nextExDate: null,
  nextPayDate: null,
  nextAmount: null,
  fetchedAt: ASOF,
  ...extra,
});
const quarterly = (...dates: string[]) => dates.map((date) => ({ date, amount: 1 }));

/**
 * KO pays $1.32 a share (10 shares, 15% withheld: $11.22) on Oct 28 and every three months after.
 * VWRL paid $2.50 a share (4 shares: $8.50) on Oct 12, so that payout is due; it pays again in
 * Jan, Apr, Jul and Oct. MSFT is no longer held: it paid $346.30 in March and $42.10 on Oct 5.
 * Next 12 months: 4 x $11.22 + 4 x $8.50 = $78.88, on a portfolio worth $1,000.
 */
function dividendData(): DataSnapshot {
  const data = noHoldings();
  data.tables.holding = [
    held({
      id: 'ko',
      symbol: 'KO',
      name: 'Coca-Cola',
      shares: 10,
      purchaseDate: '2025-01-01',
      quote: quote(60, 59),
      dividendInfo: info({
        history: quarterly('2026-01-17', '2026-04-18', '2026-07-18'),
        nextExDate: '2026-10-18',
        nextPayDate: '2026-10-28',
        nextAmount: 1.32,
      }),
    }),
    held({
      id: 'vwrl',
      symbol: 'VWRL',
      name: 'All-World ETF',
      type: 'etf',
      sector: null,
      shares: 4,
      purchaseDate: '2025-01-01',
      quote: quote(100, 100),
      dividendInfo: info({
        history: quarterly('2026-01-08', '2026-04-08', '2026-07-08'),
        nextExDate: '2026-10-08',
        nextPayDate: '2026-10-12',
        nextAmount: 2.5,
      }),
    }),
  ];
  data.tables.dividend = [
    makeDividend({
      holdingId: 'gone',
      symbol: 'MSFT',
      expectedPayDate: '2026-03-15',
      paidOn: '2026-03-16',
      amount: 346_30,
    }),
    makeDividend({
      holdingId: 'gone',
      symbol: 'MSFT',
      expectedPayDate: '2026-10-05',
      paidOn: '2026-10-05',
      amount: 42_10,
    }),
  ];
  return data;
}

/** A store whose writes land in its data, so a confirmed payout really leaves the list. */
function liveStore(data: DataSnapshot) {
  const store = createStubStore({ data, today: TODAY });
  const putMany = vi.fn(async (items: TableRecord[]) => {
    store.setState((s) => {
      const tables: Record<string, Array<{ id: string }>> = { ...s.data.tables };
      for (const { table, record } of items) {
        tables[table] = [...tables[table]!.filter((r) => r.id !== record.id), record];
      }
      return { data: { ...s.data, tables } as DataSnapshot };
    });
  });
  store.setState({
    putMany,
    put: vi.fn(async (table, record) => putMany([{ table, record } as TableRecord])),
  });
  return store;
}

function renderDividends(data: DataSnapshot = dividendData(), live = false) {
  const store = live ? liveStore(data) : createStubStore({ data, today: TODAY });
  const router = createMemoryRouter([{ path: '/invest', element: <InvestScreen /> }], {
    initialEntries: ['/invest?tab=dividends'],
  });
  renderWithStore(<RouterProvider router={router} />, store);
  return store;
}

const monthKeys = (from: string) =>
  Array.from({ length: 12 }, (_, i) => {
    const n = Number(from.slice(0, 4)) * 12 + Number(from.slice(5)) - 1 + i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  });
/** The chart's bars as their accessible names, oldest month first. */
const bars = () =>
  screen.getAllByRole('button', { name: /^[A-Z]{3,4}: / }).map((b) => b.getAttribute('aria-label'));
const barsFor = (from: string, minor: Record<string, number>) =>
  monthKeys(from).map((m) => `${formatMonthShort(`${m}-01`)}: ${usd(minor[m] ?? 0)}`);
const bar = (month: string, minor: number) =>
  screen.getByRole('button', { name: `${formatMonthShort(`${month}-01`)}: ${usd(minor)}` });

describe('Dividends tab', () => {
  it('shows month, year, next-12-months and yield figures', () => {
    renderDividends();
    const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div');
    expect(figure('This month')).toHaveTextContent(`This month${usd(42_10)}`);
    expect(figure('This year')).toHaveTextContent(`This year${usd(388_40)}`);
    expect(figure('Next 12 months')).toHaveTextContent(`Next 12 months~${usdWhole(78_88)}`);
    expect(figure('Yield')).toHaveTextContent(`Yield${formatPercent((78_88 * 100) / 1_000_00)}`);

    // Nothing is worth anything yet, so there is no yield to divide by.
    cleanup();
    const unpriced = dividendData();
    unpriced.tables.holding = unpriced.tables.holding.map((h) => ({ ...h, quote: null }));
    renderDividends(unpriced);
    expect(figure('Yield')).toHaveTextContent('Yield—');
  });

  it('toggles the income bars between next and last 12 months', async () => {
    renderDividends();
    const period = screen.getByRole('group', { name: 'Months shown' });
    const toggle = (name: string) => within(period).getByRole('button', { name });
    expect(toggle('Next 12 months')).toHaveAttribute('aria-pressed', 'true');

    // Expected from today on, net, by pay date: KO's Oct 28, then both payers each quarter.
    expect(bars()).toEqual(
      barsFor('2026-10', {
        '2026-10': 11_22,
        '2027-01': 19_72,
        '2027-04': 19_72,
        '2027-07': 19_72,
      }),
    );
    // This month stands in ink, as today does on the week's bars.
    expect(bar('2026-10', 11_22)).toHaveClass('text-text');
    expect(bar('2026-11', 0)).toHaveClass('text-muted');

    await userEvent.click(toggle('Last 12 months'));
    expect(toggle('Last 12 months')).toHaveAttribute('aria-pressed', 'true');
    expect(toggle('Next 12 months')).toHaveAttribute('aria-pressed', 'false');
    // What was confirmed, by the day it was paid, ending with this month.
    expect(bars()).toEqual(barsFor('2025-11', { '2026-03': 346_30, '2026-10': 42_10 }));
    expect(bar('2026-10', 42_10)).toHaveClass('text-text');

    // A tap names the month and its amount.
    await userEvent.click(bar('2026-03', 346_30));
    expect(screen.getByText(formatMonthYear('2026-03')).parentElement).toHaveTextContent(
      `${formatMonthYear('2026-03')} · ${usd(346_30)}`,
    );
  });

  it('confirms a due payout into reinvest and it leaves the list', async () => {
    const store = renderDividends(dividendData(), true);
    const due = region('Due');
    const rows = within(due).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(`VWRL · paid ${formatDay('2026-10-12')}${usd(8_50)}`);

    await userEvent.click(within(due).getByRole('button', { name: 'Confirm' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm VWRL dividend' });
    // The net and the pay date are what the payout was expected to be.
    expect(within(dialog).getByLabelText('Amount received')).toHaveValue(
      formatMoneyPlain(8_50, 'USD'),
    );
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-12');
    const where = within(dialog).getByRole('group', { name: 'Where did it go?' });
    expect(
      within(where)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual(['Cash', 'Savings', 'Passive', 'Reinvest']);
    expect(within(where).getByRole('radio', { name: 'Cash' })).toBeChecked();

    await userEvent.click(within(where).getByRole('radio', { name: 'Reinvest' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Due' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const data = store.getState().data.tables;
    expect(data.dividend.find((d) => d.holdingId === 'vwrl')).toMatchObject({
      status: 'confirmed',
      amount: 8_50,
      paidOn: '2026-10-12',
      bucket: 'reinvest',
    });
    // $8.50 buys 0.085 of a share at $100.
    expect(data.holding.find((h) => h.id === 'vwrl')?.shares).toBeCloseTo(4.085, 6);
    expect(toastStore.getState().toasts.at(-1)?.message).toBe('Dividend confirmed.');
  });

  it('skips a due payout', async () => {
    const store = renderDividends(dividendData(), true);
    await userEvent.click(within(region('Due')).getByRole('button', { name: "Didn't get it" }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Due' })).not.toBeInTheDocument(),
    );
    expect(store.getState().put).toHaveBeenCalledWith(
      'dividend',
      expect.objectContaining({ holdingId: 'vwrl', status: 'skipped', amount: 0 }),
    );
    // It counts for nothing.
    expect(screen.getByText('This year', { selector: 'dt' }).closest('div')).toHaveTextContent(
      `This year${usd(388_40)}`,
    );
  });

  it('checks the amount and the day before it confirms', async () => {
    const store = renderDividends();
    await userEvent.click(within(region('Due')).getByRole('button', { name: 'Confirm' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm VWRL dividend' });
    const confirm = () => userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await enter(dialog, 'Amount received', '');
    await confirm();
    expect(dialog.textContent).toContain('Enter an amount like 12.50');

    await enter(dialog, 'Amount received', '8.50');
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-10-20' } });
    await confirm();
    expect(dialog.textContent).toContain(FUTURE);
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });

  it('says why a payout cannot be reinvested without a price, and keeps the dialog open', async () => {
    const data = dividendData();
    data.tables.holding = data.tables.holding.map((h) => ({ ...h, quote: null }));
    const store = renderDividends(data);
    await userEvent.click(within(region('Due')).getByRole('button', { name: 'Confirm' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm VWRL dividend' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Reinvest' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(toastStore.getState().toasts.at(-1)?.message).toBe(
        'Reinvesting needs a price for this holding. Refresh prices or set a manual price.',
      ),
    );
    expect(dialog).toBeInTheDocument();
    expect(store.getState().putMany).not.toHaveBeenCalled();
  });

  it('lists coming payouts with ex-date and tax', () => {
    const data = dividendData();
    data.tables.holding.push(
      held({
        id: 'sap',
        symbol: 'SAP',
        name: 'SAP SE',
        currency: 'EUR',
        shares: 5,
        purchaseDate: '2025-01-01',
        // A price in euros and no rate to turn it into dollars.
        quote: quote(120, 119, null),
        dividendInfo: info({ nextExDate: '2026-11-05', nextPayDate: '2026-11-12', nextAmount: 1 }),
      }),
    );
    renderDividends(data);
    const rows = within(region('Coming up')).getAllByRole('listitem');
    // The next 60 days: VWRL's January payout is further off, and its due one is above.
    expect(rows.map((r) => r.textContent)).toEqual([
      `KO · pays ${formatDay('2026-10-28')}ex-date ${formatDay('2026-10-18')} · after 15% tax${usd(11_22)}`,
      `SAP · pays ${formatDay('2026-11-12')}ex-date ${formatDay('2026-11-05')} · after 15% tax—`,
    ]);
  });

  it('ranks the top payers by what they are expected to pay', () => {
    renderDividends();
    const rows = within(region('Top payers')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      `KO · Coca-Cola${usd(44_88)} a year`,
      `VWRL · All-World ETF${usd(34_00)} a year`,
    ]);
  });

  it('counts the dividend streak in months, below the top payers', () => {
    const data = dividendData();
    // MSFT paid on 2026-10-05; add September and August, and an earlier gap to stop at.
    data.tables.dividend.push(
      ...['2026-09-05', '2026-08-05', '2026-06-05'].map((day) =>
        makeDividend({ holdingId: 'gone', symbol: 'MSFT', expectedPayDate: day, paidOn: day }),
      ),
    );
    renderDividends(data);
    expect(region('Dividend streak')).toHaveTextContent('Dividend streak3 months');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Dividend streak')).toBeGreaterThan(titles.indexOf('Top payers'));
  });

  it('says how to start a dividend streak when none is running', () => {
    const data = dividendData();
    // Nothing confirmed paid this month or last.
    data.tables.dividend = data.tables.dividend.filter((d) => d.paidOn < '2026-09-01');
    renderDividends(data);
    expect(region('Dividend streak')).toHaveTextContent('Start a new streak today.');
    expect(region('Dividend streak')).not.toHaveTextContent('month');
  });

  it('counts one month in the singular', () => {
    renderDividends();
    expect(region('Dividend streak')).toHaveTextContent('Dividend streak1 month');
    expect(region('Dividend streak')).not.toHaveTextContent('months');
  });

  it('says so when no holding pays dividends', () => {
    renderDividends(portfolioData());
    expect(
      screen.getByText('No dividends yet. Holdings that pay dividends show up here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('This month', { selector: 'dt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Due' })).not.toBeInTheDocument();
  });
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3_600_000;

const headlines = (): NewsItem[] => [
  {
    symbol: 'AAPL',
    title: 'Apple unveils a new phone',
    publisher: 'Reuters',
    url: 'https://example.com/apple',
    publishedAt: ago(2 * HOUR + 60_000),
  },
  {
    symbol: 'KO',
    title: 'Coca-Cola raises its dividend',
    publisher: 'Bloomberg',
    url: 'https://example.com/ko',
    publishedAt: ago(5 * HOUR + 60_000),
  },
  {
    symbol: 'VWRL',
    title: 'Global markets close higher',
    publisher: 'FT',
    url: 'https://example.com/markets',
    publishedAt: ago(26 * HOUR),
  },
  {
    symbol: 'KO',
    title: 'A link that is not a web page',
    publisher: 'Nobody',
    url: 'javascript:alert(1)',
    publishedAt: ago(HOUR),
  },
];

function renderNews(data: DataSnapshot = portfolioData()) {
  return renderInvest(data, '/invest?tab=news');
}

const DISCLAIMER = 'News data is for informational purposes only. Not financial advice.';

describe('News tab', () => {
  it('filters news by holding, links out safely and shows the disclaimer', async () => {
    configured();
    fetchNews.mockResolvedValue({ items: headlines() });
    renderNews();

    const apple = await screen.findByRole('link', { name: /Apple unveils a new phone/ });
    expect(fetchNews).toHaveBeenCalledWith(['KO', 'AAPL', 'VWRL']);
    // Opens in a new tab without handing over the app's window.
    expect(apple).toHaveAttribute('href', 'https://example.com/apple');
    expect(apple).toHaveAttribute('target', '_blank');
    expect(apple).toHaveAttribute('rel', 'noopener noreferrer');
    // The title, then the symbol, the publisher and how long ago.
    expect(apple).toHaveTextContent('Apple unveils a new phoneAAPL · Reuters · 2 h ago');
    expect(screen.getByRole('link', { name: /Coca-Cola raises/ })).toHaveTextContent(
      'KO · Bloomberg · 5 h ago',
    );
    expect(screen.getByRole('link', { name: /Global markets/ })).toHaveTextContent(
      'VWRL · FT · 1 day ago',
    );
    // Only web links are shown.
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByText(/not a web page/)).not.toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();

    const chips = screen.getByRole('group', { name: 'Filter by holding' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'KO', 'AAPL', 'VWRL']);
    expect(within(chips).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(chips).getByRole('button', { name: 'KO' }));
    expect(within(chips).getByRole('button', { name: 'KO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Coca-Cola raises its dividendKO · Bloomberg · 5 h ago',
    ]);

    await userEvent.click(within(chips).getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('asks for the same holdings once an hour', async () => {
    configured();
    fetchNews.mockResolvedValue({ items: headlines() });
    renderNews();
    await screen.findByRole('link', { name: /Apple unveils/ });

    // Back on the tab later, within the hour: no new request.
    cleanup();
    renderNews();
    await screen.findByRole('link', { name: /Apple unveils/ });
    expect(fetchNews).toHaveBeenCalledTimes(1);

    // Another set of holdings is another request.
    cleanup();
    const other = noHoldings();
    other.tables.holding = [held({ symbol: 'MSFT', name: 'Microsoft' })];
    renderNews(other);
    await waitFor(() => expect(fetchNews).toHaveBeenCalledTimes(2));
    expect(fetchNews).toHaveBeenLastCalledWith(['MSFT']);

    // After the hour it asks again.
    cleanup();
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61 * 60_000 });
    try {
      renderNews();
      await waitFor(() => expect(fetchNews).toHaveBeenCalledTimes(3));
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains when news is unavailable', () => {
    renderNews();
    expect(screen.getByText('News needs the price service.')).toBeInTheDocument();
    expect(fetchNews).not.toHaveBeenCalled();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('says so when the headlines cannot be loaded, and asks again next time', async () => {
    configured();
    fetchNews.mockRejectedValue(new MarketError());
    renderNews();
    expect(await screen.findByText("Couldn't load news right now.")).toBeInTheDocument();

    // A failure is not kept for the hour.
    cleanup();
    fetchNews.mockResolvedValue({ items: headlines() });
    renderNews();
    expect(await screen.findByRole('link', { name: /Apple unveils/ })).toBeInTheDocument();
    expect(fetchNews).toHaveBeenCalledTimes(2);
  });

  it('says so when there are no headlines, or nothing is held', async () => {
    configured();
    renderNews();
    expect(
      await screen.findByText('No headlines for your holdings right now.'),
    ).toBeInTheDocument();

    cleanup();
    fetchNews.mockClear();
    renderNews(noHoldings());
    expect(screen.getByText('No headlines for your holdings right now.')).toBeInTheDocument();
    expect(fetchNews).not.toHaveBeenCalled();
  });
});
