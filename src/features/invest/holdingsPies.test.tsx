import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { market } from '@/services/market';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeHolding, makeProfile } from '@/test/fixtures';
import { spoken } from '@/test/spoken';
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

const selector = () => screen.getByRole('group', { name: 'Allocation' });
const options = () =>
  within(selector())
    .getAllByRole('button')
    .map((b) => b.textContent);
const choose = (name: string) => userEvent.click(within(selector()).getByRole('button', { name }));
const pie = (name: string) => screen.getByRole('group', { name });
const none = (name: string) =>
  expect(screen.queryByRole('group', { name })).not.toBeInTheDocument();
/** What the legend of a pie says, one string per row. */
const legend = (name: string) =>
  within(pie(name)).getAllByRole('button').map(spoken).filter(Boolean);
/** The rows of a pie's legend: the pie's buttons that are not the hidden ones over its slices. */
const legendRows = (name: string) =>
  within(pie(name))
    .getAllByRole('button')
    .filter((b) => b.closest('ul')?.getAttribute('aria-label') !== 'Value by holding');
/** The labels standing just outside the ring, by the slice key they belong to. */
const outside = (name: string) =>
  [...pie(name).querySelectorAll<HTMLElement>('[data-label]')].map((el) => ({
    key: el.dataset.label!,
    el,
  }));

describe('Holdings pie', () => {
  it('starts on All: one pie of everything, with the share of each holding in its legend', () => {
    renderTab(mixed());
    expect(options()).toEqual(['All', 'Stocks', 'ETFs']);
    expect(within(selector()).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(selector()).getByRole('button', { name: 'Stocks' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // $4,000 in all, biggest holding first.
    expect(legend('All holdings')).toEqual([
      `AAPL${usdWhole(2000_00)}50%`,
      `KO${usdWhole(600_00)}15%`,
      `VUSA${usdWhole(600_00)}15%`,
      `ASML${usdWhole(400_00)}10%`,
      `VWRL${usdWhole(400_00)}10%`,
    ]);
    // The centre says what the selection adds up to.
    expect(within(pie('All holdings')).getAllByText(usdWhole(4000_00))).toHaveLength(1);
    expect(within(pie('All holdings')).getAllByText('All holdings')).toHaveLength(1);
    none('Stocks');
    none('ETFs');
    // The old switch is gone.
    for (const name of ['Split', 'Together']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('draws one pie, 200px wide: the room that is left for the labels at 360px', () => {
    renderTab(mixed());
    expect(pie('All holdings').querySelector('svg')).toHaveAttribute('width', '200');
  });

  it('stands the pie on the page: no glass tile behind the control, the pie or its legend', () => {
    renderTab(mixed());
    // The control is a glass track itself, so its own box is not looked at, only what holds it.
    for (const el of [selector().parentElement!, pie('All holdings')]) {
      expect(el.closest('.glass, .rounded-\\[24px\\]'), el.getAttribute('aria-label') ?? '').toBe(
        null,
      );
    }
    // Control, pie and legend share one block, and the legend is not boxed apart in it.
    const block = pie('All holdings').parentElement!;
    expect(block).toContainElement(selector());
    for (const row of legendRows('All holdings')) expect(row.closest('.glass')).toBe(null);
  });

  it('keeps a label for every slice, however many there are, each in a glass pill', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => worth(s, (7 - i) * 100));
    renderTab(dataOf(...many));
    // Five holdings and Other: six slices, six labels, none dropped.
    const slices = within(pie('All holdings')).getAllByRole('button', { name: /, \d+%$/ });
    expect(slices).toHaveLength(6);
    const labels = outside('All holdings');
    expect(labels).toHaveLength(slices.length);
    for (const { el } of labels) expect(el).toHaveClass('glass-strong', 'rounded-full');
    // No leader lines: the labels are only where their slices are.
    expect(pie('All holdings').querySelectorAll('line')).toHaveLength(0);
  });

  it('shows only the stocks, or only the ETFs, when chosen, and keeps the choice in the address', async () => {
    const { router } = renderTab(mixed());
    await choose('Stocks');
    expect(within(selector()).getByRole('button', { name: 'Stocks' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(router.state.location.search).toBe('?pie=stocks');
    none('All holdings');
    expect(legend('Stocks')).toEqual([
      `AAPL${usdWhole(2000_00)}67%`,
      `KO${usdWhole(600_00)}20%`,
      `ASML${usdWhole(400_00)}13%`,
    ]);
    expect(within(pie('Stocks')).getByText(usdWhole(3000_00))).toBeInTheDocument();

    await choose('ETFs');
    expect(router.state.location.search).toBe('?pie=etfs');
    expect(legend('ETFs')).toEqual([`VUSA${usdWhole(600_00)}60%`, `VWRL${usdWhole(400_00)}40%`]);
    expect(within(pie('ETFs')).getByText(usdWhole(1000_00))).toBeInTheDocument();
    none('Stocks');

    await choose('All');
    expect(router.state.location.search).toBe('');
    expect(pie('All holdings')).toBeInTheDocument();
  });

  it('opens a choice from the address, and keeps other parts of it', async () => {
    const { router } = renderTab(mixed(), '/invest?tab=holdings&pie=etfs');
    expect(pie('ETFs')).toBeInTheDocument();
    expect(within(selector()).getByRole('button', { name: 'ETFs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await choose('Stocks');
    expect(router.state.location.search).toBe('?tab=holdings&pie=stocks');
    await choose('All');
    expect(router.state.location.search).toBe('?tab=holdings');
  });

  it('ignores the old ?pies= in the address, and a choice it does not know', () => {
    renderTab(mixed(), '/invest?pies=together');
    expect(pie('All holdings')).toBeInTheDocument();
    cleanup();
    renderTab(mixed(), '/invest?pie=bonds');
    expect(pie('All holdings')).toBeInTheDocument();
  });

  it('leaves out an option that has nothing priced, and falls back to All for it', () => {
    const unpriced = makeHolding({
      id: 'new',
      symbol: 'NEW',
      name: 'New ETF',
      type: 'etf',
      quote: null,
    });
    renderTab(dataOf(worth('AAPL', 1000), unpriced), '/invest?pie=etfs');
    // The ETF has no price: no ETFs option, so the address's choice shows All instead.
    expect(options()).toEqual(['All', 'Stocks']);
    expect(pie('All holdings')).toBeInTheDocument();
    // Its row still stands under the ETFs heading, saying it has no price yet.
    const row = within(screen.getByRole('list', { name: 'ETFs' })).getByRole('link');
    expect(row).toHaveTextContent('Not priced yet');
  });

  it('has Other as a choice when there are other holdings, and puts it last', async () => {
    renderTab(dataOf(worth('AAPL', 1000), worth('GOLD', 500, 'other')));
    expect(options()).toEqual(['All', 'Stocks', 'Other']);
    await choose('Other');
    // Its one holding is the whole pie: in the centre and in the legend.
    expect(within(pie('Other')).getAllByText(usdWhole(500_00))).toHaveLength(2);
    expect(legend('Other')).toEqual([`GOLD${usdWhole(500_00)}100%`]);
    // The rows' lists are the ones with a name.
    const lists = screen.getAllByRole('list', { name: /^(Stocks|ETFs|Other)$/ });
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual(['Stocks', 'Other']);
  });

  it("stands each holding's badge and share just outside its slice", () => {
    // $10,000: 80%, 10%, 6% and 4%.
    renderTab(dataOf(worth('AAA', 8000), worth('BBB', 1000), worth('CCC', 600), worth('DDD', 400)));
    const labels = outside('All holdings');
    expect(labels.map((l) => l.key)).toEqual(['aaa', 'bbb', 'ccc', 'ddd']);
    expect(labels.map((l) => spoken(l.el))).toEqual(['80%', '10%', '6%', '4%']);
    for (const { key, el } of labels) {
      const logo = el.querySelector('[data-logo]');
      expect(logo, key).toHaveAttribute('data-logo', key.toUpperCase());
      // No logo yet: the ticker (up to four letters) on the slice's colour.
      expect(logo).toHaveTextContent(key.toUpperCase());
      // A 24px round badge, in a pill that holds it with the share after it.
      expect(logo).toHaveStyle({ width: '24px', height: '24px' });
      expect(parseFloat(el.style.height)).toBeGreaterThanOrEqual(24);
      expect(parseFloat(el.style.width)).toBeGreaterThan(24);
    }
    // All four are in the legend with their share as well.
    expect(legend('All holdings')).toEqual([
      `AAA${usdWhole(8000_00)}80%`,
      `BBB${usdWhole(1000_00)}10%`,
      `CCC${usdWhole(600_00)}6%`,
      `DDD${usdWhole(400_00)}4%`,
    ]);
  });

  it('writes the Other slice as a grey +N, N holdings folded into it, with its share', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => worth(s, (7 - i) * 100));
    renderTab(dataOf(...many));
    // F and G, $300 of $2,800, fold into Other.
    const other = outside('All holdings').find((l) => l.key === 'other')!;
    expect(other.el.querySelector('[data-logo]')).toHaveTextContent('+2');
    expect(spoken(other.el)).toBe('11%');
    expect(other.el.querySelector('[data-logo]')!.getAttribute('style')).toContain(
      '--color-chart-other',
    );
    // The legend's Other row starts with the same grey disc.
    const row = legendRows('All holdings').at(-1)!;
    expect(row.firstElementChild).toHaveAttribute('data-logo', 'other');
    expect(row.firstElementChild).toHaveTextContent('+2');
  });

  it('starts every legend row and every holdings row with a logo', () => {
    renderTab(mixed());
    const rows = legendRows('All holdings');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.firstElementChild?.getAttribute('data-logo'))).toEqual([
      'AAPL',
      'KO',
      'VUSA',
      'ASML',
      'VWRL',
    ]);
    // The rows under the pie, one link each, start the same way and still read as just the holding.
    for (const list of screen.getAllByRole('list', { name: /^(Stocks|ETFs)$/ })) {
      for (const link of within(list).getAllByRole('link')) {
        expect(link.querySelector('[data-logo]')).toBe(link.firstElementChild);
        expect(link.firstElementChild).toHaveAttribute('aria-hidden', 'true');
        expect(link).toHaveAccessibleName(/^[A-Z]+ · [A-Z]+ Inc/);
      }
    }
    expect(screen.getAllByRole('link', { name: /Inc/ })).toHaveLength(5);
  });

  it('asks the price service for no logo while it has no token, so each stays its letter', () => {
    renderTab(mixed());
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelectorAll('[data-logo]').length).toBeGreaterThan(0);
  });

  it('folds all but the biggest five into Other', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => worth(s, (7 - i) * 100));
    renderTab(dataOf(...many));
    expect(legend('All holdings')).toEqual([
      `A${usdWhole(700_00)}25%`,
      `B${usdWhole(600_00)}21%`,
      `C${usdWhole(500_00)}18%`,
      `D${usdWhole(400_00)}14%`,
      `E${usdWhole(300_00)}11%`,
      `Other${usdWhole(300_00)}11%`,
    ]);
  });

  it('shows the tapped slice in the middle of the pie, and starts clear on the next choice', async () => {
    renderTab(mixed());
    await userEvent.click(
      within(pie('All holdings')).getByRole('button', { name: `KO, ${usd(600_00)}, 15%` }),
    );
    expect(within(pie('All holdings')).getByText(usd(600_00))).toBeInTheDocument();
    expect(within(pie('All holdings')).getByText('KO · 15%')).toBeInTheDocument();

    await choose('Stocks');
    expect(within(pie('Stocks')).queryByText(/ · \d+%$/)).not.toBeInTheDocument();
    expect(within(pie('Stocks')).getAllByText('Stocks')).toHaveLength(1); // its idle centre
  });

  it('shows no pie, and no choice between them, with nothing priced', () => {
    renderTab(dataOf(makeHolding({ quote: null })));
    expect(screen.queryByRole('group', { name: 'Allocation' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('group')).toEqual([]);
  });

  it('lists the rows under their type, Stocks first, and no longer by type or sector with chips', () => {
    renderTab(mixed());
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Stocks',
      'ETFs',
    ]);
    for (const name of ['By holding', 'By type', 'By sector']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('has choices with a 44px tap area, and animates nothing unless motion is welcome', () => {
    renderTab(mixed());
    for (const name of ['All', 'Stocks', 'ETFs']) {
      const button = within(selector()).getByRole('button', { name });
      // The glass control's 34px choices carry a 44px tap area (hit-44).
      expect(button).toHaveClass('hit-44');
      expect(button.className).not.toMatch(/(^|\s)(transition|animate-)/);
    }
  });
});
