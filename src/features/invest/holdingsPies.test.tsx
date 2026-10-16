import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { market } from '@/services/market';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeHolding, makeProfile } from '@/test/fixtures';
import { InvestScreen } from './InvestScreen';

const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });

beforeEach(() => {
  // No token: the screen never asks the network for anything.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
  vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** A holding worth `value` dollars: one share at that price, in USD, which is the profile currency. */
function worth(symbol: string, value: number, type: Holding['type'] = 'stock') {
  return makeHolding({
    id: symbol.toLowerCase(),
    symbol,
    name: `${symbol} Inc`,
    type,
    shares: 1,
    costBasis: value * 100,
    purchaseDate: '2026-01-05',
    quote: { price: value, previousClose: value, fxRate: 1, asOf: '2026-10-14T14:05:00.000Z' },
  });
}

function dataOf(...holdings: Holding[]): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'USD' })];
  data.tables.holding = holdings;
  return data;
}

/** Stocks worth $3,000 (AAPL $2,000, KO $600, ASML $400) and ETFs worth $1,000 (VUSA $600, VWRL $400). */
const mixed = () =>
  dataOf(
    worth('AAPL', 2000),
    worth('KO', 600),
    worth('ASML', 400),
    worth('VUSA', 600, 'etf'),
    worth('VWRL', 400, 'etf'),
  );

function renderTab(data: DataSnapshot, path = '/invest') {
  const store = createStubStore({ data, today: '2026-10-14' });
  const router = createMemoryRouter([{ path: '/invest', element: <InvestScreen /> }], {
    initialEntries: [path],
  });
  renderWithStore(<RouterProvider router={router} />, store);
  return { router };
}

const pie = (name: string) => screen.getByRole('group', { name });
const none = (name: string) =>
  expect(screen.queryByRole('group', { name })).not.toBeInTheDocument();
/** What the legend of a pie says, one string per row. */
const legend = (name: string) =>
  within(pie(name))
    .getAllByRole('button')
    .map((b) => b.textContent)
    .filter(Boolean);

describe('Holdings pies', () => {
  it('splits into a pie of stocks and a pie of ETFs, each headed by its value and share', () => {
    renderTab(mixed());
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Together' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // By holding, biggest first, each with its share of its own pie.
    expect(legend('Stocks')).toEqual([
      `AAPL${usdWhole(2000_00)}67%`,
      `KO${usdWhole(600_00)}20%`,
      `ASML${usdWhole(400_00)}13%`,
    ]);
    expect(legend('ETFs')).toEqual([`VUSA${usdWhole(600_00)}60%`, `VWRL${usdWhole(400_00)}40%`]);
    // The heading says what the type adds up to and its share of the whole portfolio.
    expect(within(pie('Stocks')).getByText(`${usdWhole(3000_00)} · 75%`)).toBeInTheDocument();
    expect(within(pie('ETFs')).getByText(`${usdWhole(1000_00)} · 25%`)).toBeInTheDocument();
    none('All holdings');
    // The stocks come first, in the pies and in the rows below them.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Stocks',
      'ETFs',
      'Stocks',
      'ETFs',
    ]);
  });

  it('writes the share on each slice of 6% or more, and leaves smaller ones to the legend', () => {
    // $10,000: 80%, 10%, exactly 6% and 4%.
    renderTab(dataOf(worth('AAA', 8000), worth('BBB', 1000), worth('CCC', 600), worth('DDD', 400)));
    const stocks = pie('Stocks');
    // Once on the pie and once in the legend ...
    for (const text of ['80%', '10%', '6%']) {
      expect(within(stocks).getAllByText(text), text).toHaveLength(2);
    }
    // ... but the 4% slice is too small for the pie.
    expect(within(stocks).getAllByText('4%')).toHaveLength(1);
    expect(within(stocks).getByText('DDD').closest('button')).toHaveTextContent('4%');
  });

  it('shows everything in one pie when Together is chosen, and keeps the choice in the address', async () => {
    const { router } = renderTab(mixed());
    await userEvent.click(screen.getByRole('button', { name: 'Together' }));

    expect(screen.getByRole('button', { name: 'Together' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(router.state.location.search).toBe('?pies=together');
    none('Stocks');
    none('ETFs');
    // $4,000 in all, biggest holding first.
    expect(legend('All holdings')).toEqual([
      `AAPL${usdWhole(2000_00)}50%`,
      `KO${usdWhole(600_00)}15%`,
      `VUSA${usdWhole(600_00)}15%`,
      `ASML${usdWhole(400_00)}10%`,
      `VWRL${usdWhole(400_00)}10%`,
    ]);
    // The rows below keep their groups.
    expect(screen.getByRole('list', { name: 'Stocks' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'ETFs' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(router.state.location.search).toBe('');
    expect(pie('Stocks')).toBeInTheDocument();
    none('All holdings');
  });

  it('opens Together from the address, and keeps other parts of it', async () => {
    const { router } = renderTab(mixed(), '/invest?tab=holdings&pies=together');
    expect(pie('All holdings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(router.state.location.search).toBe('?tab=holdings');
    await userEvent.click(screen.getByRole('button', { name: 'Together' }));
    expect(router.state.location.search).toBe('?tab=holdings&pies=together');
  });

  it('folds all but the biggest five into Other', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => worth(s, (7 - i) * 100));
    renderTab(dataOf(...many));
    expect(legend('Stocks')).toEqual([
      `A${usdWhole(700_00)}25%`,
      `B${usdWhole(600_00)}21%`,
      `C${usdWhole(500_00)}18%`,
      `D${usdWhole(400_00)}14%`,
      `E${usdWhole(300_00)}11%`,
      `Other${usdWhole(300_00)}11%`,
    ]);
  });

  it('has no pie for a type with nothing priced, but still lists its holdings', () => {
    const unpriced = makeHolding({
      id: 'new',
      symbol: 'NEW',
      name: 'New ETF',
      type: 'etf',
      quote: null,
    });
    renderTab(dataOf(worth('AAPL', 1000), unpriced));
    expect(pie('Stocks')).toBeInTheDocument();
    none('ETFs');
    expect(legend('Stocks')).toEqual([`AAPL${usdWhole(1000_00)}100%`]);
    // Its row stands under the ETFs heading, saying it has no price yet.
    const row = within(screen.getByRole('list', { name: 'ETFs' })).getByRole('link');
    expect(row).toHaveTextContent('Not priced yet');
  });

  it('leaves out a type that has no holdings, and puts Other last', () => {
    renderTab(dataOf(worth('AAPL', 1000), worth('GOLD', 500, 'other')));
    none('ETFs');
    expect(screen.queryByRole('list', { name: 'ETFs' })).not.toBeInTheDocument();
    expect(within(pie('Stocks')).getByText(`${usdWhole(1000_00)} · 67%`)).toBeInTheDocument();
    expect(within(pie('Other')).getByText(`${usdWhole(500_00)} · 33%`)).toBeInTheDocument();
    // The rows' lists are the ones with a name.
    const lists = screen.getAllByRole('list', { name: /^(Stocks|ETFs|Other)$/ });
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual(['Stocks', 'Other']);
  });

  it('shows the tapped slice in the middle of its own pie only', async () => {
    renderTab(mixed());
    await userEvent.click(
      within(pie('Stocks')).getByRole('button', { name: `KO, ${usd(600_00)}, 20%` }),
    );
    expect(within(pie('Stocks')).getByText(usd(600_00))).toBeInTheDocument();
    expect(within(pie('Stocks')).getByText('KO · 20%')).toBeInTheDocument();
    expect(within(pie('ETFs')).queryByText(/^V[A-Z]+ · \d+%$/)).not.toBeInTheDocument();
    expect(within(pie('ETFs')).getAllByText('ETFs')).toHaveLength(2); // heading, and its idle centre
  });

  it('shows no pies, and no choice between them, with nothing priced', () => {
    renderTab(dataOf(makeHolding({ quote: null })));
    expect(screen.queryByRole('button', { name: 'Split' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Together' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('group')).toEqual([]);
  });

  it('no longer groups by type or sector with chips', () => {
    renderTab(mixed());
    for (const name of ['By holding', 'By type', 'By sector']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});
