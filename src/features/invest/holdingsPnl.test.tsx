import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding, Settings } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { market } from '@/services/market';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { expectHelpTip } from '@/test/helpTip';
import { makeDividend, makeHolding, makeProfile, makeSale, makeSettings } from '@/test/fixtures';
import { InvestScreen } from './InvestScreen';

const TODAY = '2026-10-14';
const KEY = 'funancial.invest.showPnl';
const usd = (minor: number) => formatMoney(minor, 'USD');
const eur = (minor: number) => formatMoney(minor, 'EUR');

beforeEach(() => {
  // No token: the screen never asks the network for anything.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
  vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const quote = (price: number) => ({
  price,
  previousClose: price,
  fxRate: 1,
  asOf: '2026-10-14T14:05:00.000Z',
});

/** A holding in the profile currency worth `value` for `cost`, minor units, as one share. */
const holding = (id: string, cost: number, price: number, extra: Partial<Holding> = {}) =>
  makeHolding({
    id,
    symbol: id.toUpperCase(),
    name: `${id} Inc`,
    currency: 'USD',
    shares: 1,
    costBasis: cost,
    purchaseDate: '2026-01-05',
    quote: quote(price / 100),
    ...extra,
  });

function dataOf(currency: string, settings: Partial<Settings> | null = null): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency })];
  if (settings) data.tables.settings = [makeSettings(settings)];
  return data;
}

function renderTab(data: DataSnapshot) {
  const store = createStubStore({ data, today: TODAY });
  const router = createMemoryRouter([{ path: '/invest', element: <InvestScreen /> }], {
    initialEntries: ['/invest'],
  });
  renderWithStore(<RouterProvider router={router} />, store);
}

const region = () => screen.getByRole('region', { name: 'Profit & loss · all time' });
const toggle = () => within(region()).getByRole('button', { name: /^(Hide|Show)$/ });
/** The rows of the block: a label and a figure each. */
const rowsOf = () =>
  within(region())
    .getAllByRole('listitem')
    .map((li) => li.textContent);

/**
 * Up $100.00 on what is held (cost $1,000.00, worth $1,100.00), $50.00 from a sale and $20.00 of
 * dividends: $170.00 in all.
 */
function gainData() {
  const data = dataOf('USD');
  data.tables.holding = [holding('ko', 1000_00, 1100_00)];
  data.tables.sale = [makeSale({ proceeds: 300_00, cost: 250_00 })];
  data.tables.dividend = [makeDividend({ holdingId: 'ko', amount: 20_00 })];
  return data;
}

describe('Profit & loss', () => {
  it('explains profit & loss, beside its title, and Hide still hides it', async () => {
    renderTab(gainData());
    await expectHelpTip(region(), 'profit & loss', 'investments');
    await userEvent.click(toggle());
    expect(toggle()).toHaveTextContent('Show');
  });

  it('shows the total and its three parts, up in the success colour', () => {
    renderTab(gainData());
    const total = within(region()).getByText(`▲ ${usd(170_00)}`);
    expect(total).toHaveClass('text-success');
    expect(rowsOf()).toEqual([
      `On what you hold▲ ${usd(100_00)}`,
      `From sales▲ ${usd(50_00)}`,
      `Dividends▲ ${usd(20_00)}`,
    ]);
    expect(within(region()).getByText(`▲ ${usd(100_00)}`)).toHaveClass('text-success');
  });

  it('shows a loss with a down arrow in the danger colour, and keeps a gain beside it up', () => {
    const data = dataOf('USD');
    // Down $100.00 on what is held, up $50.00 on a sale: down $50.00 in all, with no dividends.
    data.tables.holding = [holding('ko', 1000_00, 900_00)];
    data.tables.sale = [makeSale({ proceeds: 300_00, cost: 250_00 })];
    renderTab(data);
    const total = within(region()).getByText(`▼ ${usd(50_00)}`);
    expect(total).toHaveClass('text-danger');
    expect(within(region()).getByText(`▼ ${usd(100_00)}`)).toHaveClass('text-danger');
    expect(within(region()).getByText(`▲ ${usd(50_00)}`)).toHaveClass('text-success');
    expect(rowsOf()).toEqual([
      `On what you hold▼ ${usd(100_00)}`,
      `From sales▲ ${usd(50_00)}`,
      `Dividends▲ ${usd(0)}`,
    ]);
  });

  it('draws a thin bar of the sizes of the parts, in the chart slots by position, skipping an empty one', () => {
    const data = gainData();
    data.tables.dividend = [];
    renderTab(data);
    const segments = [...region().querySelectorAll<HTMLElement>('[data-part]')];
    expect(segments.map((s) => [s.dataset.part, s.style.flexGrow])).toEqual([
      ['held', '10000'],
      ['sales', '5000'],
    ]);
    expect(segments.map((s) => s.style.backgroundColor)).toEqual([
      'var(--color-chart-1)',
      'var(--color-chart-2)',
    ]);
    // The bar is a picture of what the rows already say.
    expect(segments[0]!.parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('makes the total the sum of the parts as converted, so the rows add up', () => {
    // In euros: up EUR 0.01 on what is held, EUR 0.01 from a sale and EUR 0.01 of dividends. Shown
    // in dollars at 1.5, each is $0.015, which rounds to $0.02: $0.06 in all. Converting the
    // EUR 0.03 total on its own would say $0.05, which is not what the rows add up to.
    const data = dataOf('EUR', {
      investCurrency: 'USD',
      investFx: { currency: 'USD', rate: 1.5, asOf: '2026-10-14T14:05:00.000Z' },
    });
    data.tables.holding = [holding('ko', 100_00, 100_01, { currency: 'EUR' })];
    data.tables.sale = [makeSale({ proceeds: 101, cost: 100 })];
    data.tables.dividend = [makeDividend({ holdingId: 'ko', amount: 1 })];
    renderTab(data);
    expect(rowsOf()).toEqual([
      `On what you hold▲ ${usd(2)}`,
      `From sales▲ ${usd(2)}`,
      `Dividends▲ ${usd(2)}`,
    ]);
    expect(within(region()).getByText(`▲ ${usd(6)}`)).toBeInTheDocument();
    expect(within(region()).queryByText(/€/)).not.toBeInTheDocument();
  });

  it('hides and shows with its button, which says what it controls, and remembers the choice', async () => {
    renderTab(gainData());
    expect(toggle()).toHaveTextContent('Hide');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(toggle().getAttribute('aria-controls')!)!;
    expect(body).toBeVisible();
    expect(toggle()).toHaveClass('min-h-11');

    await userEvent.click(toggle());
    expect(toggle()).toHaveTextContent('Show');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(body).not.toBeVisible();
    // Only the header row shows.
    expect(
      within(region()).getByRole('heading', { name: 'Profit & loss · all time' }),
    ).toBeVisible();
    expect(localStorage.getItem(KEY)).toBe('false');

    // Opened again later, on this device, it is still hidden.
    cleanup();
    renderTab(gainData());
    expect(toggle()).toHaveTextContent('Show');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle());
    expect(toggle()).toHaveTextContent('Hide');
    expect(localStorage.getItem(KEY)).toBe('true');
    expect(document.getElementById(toggle().getAttribute('aria-controls')!)).toBeVisible();
  });

  it('is shown when nothing was chosen, and when what was stored is not a choice', () => {
    renderTab(gainData());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    cleanup();
    localStorage.setItem(KEY, 'banana');
    renderTab(gainData());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to shown when the device storage throws, and still hides for now', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderTab(gainData());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no profit and loss before anything was held, sold or paid', () => {
    renderTab(dataOf('USD'));
    expect(
      screen.queryByRole('region', { name: 'Profit & loss · all time' }),
    ).not.toBeInTheDocument();
  });
});

describe('Holdings rows', () => {
  it('say the break-even price per share, in the currency Invest is shown in', () => {
    // EUR 500.00 for 10 shares is EUR 50.00 each, $55.00 at 1.1.
    const data = dataOf('EUR', {
      investCurrency: 'USD',
      investFx: { currency: 'USD', rate: 1.1, asOf: '2026-10-14T14:05:00.000Z' },
    });
    data.tables.holding = [
      holding('ko', 500_00, 60_00, { currency: 'EUR', shares: 10, quote: quote(6) }),
    ];
    renderTab(data);
    const row = screen.getByRole('link', { name: /^KO · / });
    expect(row).toHaveTextContent(`10 shares · break-even ${usd(55_00)}`);
  });

  it('say it for a holding with no price, too', () => {
    const data = dataOf('USD');
    data.tables.holding = [holding('ko', 500_00, 0, { shares: 4, quote: null })];
    renderTab(data);
    expect(screen.getByRole('link', { name: /^KO · / })).toHaveTextContent(
      `4 shares · break-even ${usd(125_00)}`,
    );
    expect(screen.getByRole('link', { name: /^KO · / })).toHaveTextContent('Not priced yet');
  });
});

describe('Sold', () => {
  /** AAPL sold twice (3 + 2 shares) at a profit, and KO once, at a loss. */
  function soldData() {
    const data = gainData();
    data.tables.sale = [
      makeSale({
        symbol: 'AAPL',
        name: 'Apple',
        shares: 3,
        proceeds: 700_00,
        cost: 600_00,
        soldOn: '2026-09-01',
      }),
      makeSale({
        symbol: 'AAPL',
        name: 'Apple',
        shares: 2,
        proceeds: 500_00,
        cost: 400_00,
        soldOn: '2026-10-01',
      }),
      makeSale({
        symbol: 'KO',
        name: 'Coca-Cola',
        shares: 1,
        proceeds: 80_00,
        cost: 100_00,
        soldOn: '2026-10-10',
      }),
    ];
    return data;
  }
  const toggleSold = () => screen.getByRole('button', { name: /^Sold \(/ });

  it('is a row under the holdings that opens a list of what was sold, by symbol', async () => {
    renderTab(soldData());
    expect(toggleSold()).toHaveTextContent('Sold (2)');
    expect(toggleSold()).toHaveAttribute('aria-expanded', 'false');
    expect(toggleSold()).toHaveClass('min-h-14');
    const list = document.getElementById(toggleSold().getAttribute('aria-controls')!)!;
    expect(list).not.toBeVisible();
    // Below the holdings' rows.
    const rows = screen.getByRole('list', { name: 'Stocks' });
    expect(
      rows.compareDocumentPosition(toggleSold()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(toggleSold());
    expect(toggleSold()).toHaveAttribute('aria-expanded', 'true');
    expect(list).toBeVisible();
    // The symbol sold most recently first: KO on Oct 10, then AAPL.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      `KO · Coca-Cola1 share sold${usd(80_00)}▼ ${usd(20_00)}`,
      `AAPL · Apple5 shares sold${usd(1200_00)}▲ ${usd(200_00)}`,
    ]);
    expect(within(list).getByText(`▲ ${usd(200_00)}`)).toHaveClass('text-success');
    expect(within(list).getByText(`▼ ${usd(20_00)}`)).toHaveClass('text-danger');

    await userEvent.click(toggleSold());
    expect(list).not.toBeVisible();
  });

  it('is not there without a sale', () => {
    const data = gainData();
    data.tables.sale = [];
    renderTab(data);
    expect(screen.queryByRole('button', { name: /^Sold \(/ })).not.toBeInTheDocument();
  });

  it('shows the proceeds and the profit in the currency Invest is shown in', async () => {
    const data = dataOf('EUR', {
      investCurrency: 'USD',
      investFx: { currency: 'USD', rate: 1.5, asOf: '2026-10-14T14:05:00.000Z' },
    });
    data.tables.holding = [holding('ko', 100_00, 100_00, { currency: 'EUR' })];
    data.tables.sale = [makeSale({ proceeds: 100_00, cost: 60_00 })];
    renderTab(data);
    await userEvent.click(toggleSold());
    const item = within(screen.getByRole('list', { name: 'Sold' })).getByRole('listitem');
    // EUR 100.00 is $150.00; the EUR 40.00 profit is $60.00.
    expect(item).toHaveTextContent(`${usd(150_00)}▲ ${usd(60_00)}`);
    expect(item).not.toHaveTextContent(eur(100_00));
  });

  it('is still there when everything was sold, with the profit and loss and a way to add a holding', async () => {
    const data = dataOf('USD');
    data.tables.sale = [makeSale({ proceeds: 300_00, cost: 250_00 })];
    renderTab(data);
    expect(screen.getByText('No holdings right now')).toBeInTheDocument();
    expect(screen.queryByText('No investments yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Portfolio value' })).not.toBeInTheDocument();
    // The total and the sales are the same $50.00.
    expect(within(region()).getAllByText(`▲ ${usd(50_00)}`)).toHaveLength(2);
    await userEvent.click(toggleSold());
    expect(screen.getByRole('list', { name: 'Sold' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Add a holding' }));
    expect(screen.getByRole('dialog', { name: 'Add a holding' })).toBeInTheDocument();
  });
});
