import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '@/domain/entities';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { cachedLogoColor, logoColor } from '@/lib/logoColor';
import { loadLogo } from '@/services/logo';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeHolding, makeProfile } from '@/test/fixtures';
import { InvestScreen } from './InvestScreen';

vi.mock('@/services/logo', () => ({ loadLogo: vi.fn() }));
// The canvas is the browser's: what a logo's colour is, is each test's to say. The choosing is real.
vi.mock('@/lib/logoColor', async (original) => ({
  ...(await original<typeof import('@/lib/logoColor')>()),
  logoColor: vi.fn(),
  cachedLogoColor: vi.fn(),
}));

const load = vi.mocked(loadLogo);
const sample = vi.mocked(logoColor);
const cached = vi.mocked(cachedLogoColor);

/** The page and the chart series of the light theme, as the style sheet gives <html>; jsdom loads none. */
const LIGHT = {
  '--color-bg': '#eeeef0',
  '--color-chart-1': '#7c5cff',
  '--color-chart-2': '#22c55e',
  '--color-chart-3': '#3b82f6',
  '--color-chart-4': '#ec4899',
  '--color-chart-5': '#f59e0b',
  '--color-chart-other': '#838893',
};
/** The same on the dark page. */
const DARK = {
  ...LIGHT,
  '--color-bg': '#0b0b10',
  '--color-chart-2': '#16a34a',
  '--color-chart-other': '#6b7080',
};

function wear(vars: Record<string, string>, mode: 'light' | 'dark') {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.dataset.theme = mode;
}

let made = 0;
beforeEach(() => {
  made = 0;
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');
  URL.createObjectURL = vi.fn(() => `blob:logo-${++made}`);
  URL.revokeObjectURL = vi.fn();
  load.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  cached.mockReturnValue(undefined);
  wear(LIGHT, 'light');
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.theme;
});

function worth(symbol: string, value: number) {
  return makeHolding({
    id: symbol.toLowerCase(),
    symbol,
    name: `${symbol} Inc`,
    type: 'stock',
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

/** $10,000 in four holdings: 80%, 10%, 6% and 4%. */
const four = () =>
  dataOf(worth('AAA', 8000), worth('BBB', 1000), worth('CCC', 600), worth('DDD', 400));

function renderTab(data: DataSnapshot, path = '/invest') {
  const store = createStubStore({ data, today: '2026-10-14' });
  const router = createMemoryRouter([{ path: '/invest', element: <InvestScreen /> }], {
    initialEntries: [path],
  });
  renderWithStore(<RouterProvider router={router} />, store);
}

const pie = (name = 'All holdings') => screen.getByRole('group', { name });
/** The arcs' colours, in slice order. */
const arcs = (name?: string) =>
  [...pie(name).querySelector('svg')!.querySelectorAll('circle')].map((c) =>
    c.getAttribute('stroke'),
  );
/** The badge of each pie label: its picture once the logo is in, else the ticker. */
const badges = (name?: string) =>
  [...pie(name).querySelectorAll<HTMLElement>('[data-label]')].map(
    (el) => el.firstElementChild as HTMLElement,
  );
/** Waits for the logos to arrive and says they have loaded, as a browser does once it has decoded them. */
async function loaded(name?: string) {
  await waitFor(() => expect(badges(name).every((b) => b.querySelector('img'))).toBe(true));
  for (const badge of badges(name)) {
    const img = badge.querySelector('img');
    if (img) fireEvent.load(img);
  }
}

/** What each logo gives, by symbol; a symbol not named gives nothing. */
const gives = (colors: Record<string, string | null>) =>
  sample.mockImplementation((_img, key) => (key && key in colors ? colors[key]! : null));

const CHART = ['#7c5cff', '#22c55e', '#3b82f6', '#ec4899'];

describe('the pie takes its slices from the logos', () => {
  it('starts every slice on its chart colour, read from the page so a badge can choose its ink on it', () => {
    load.mockResolvedValue(null);
    renderTab(four());
    expect(arcs()).toEqual(CHART);
  });

  it('takes a logo colour that holds 3:1 on the page, once its logo has loaded; the rest keep their chart colours', async () => {
    // Navy holds on the light page; the light yellow does not; one logo has no colour at all.
    gives({ AAA: '#0f3e99', BBB: '#ffd400', CCC: null });
    renderTab(four());
    await loaded();
    expect(arcs()).toEqual(['#0f3e99', '#22c55e', '#3b82f6', '#ec4899']);
    expect(sample).toHaveBeenCalledTimes(4);
  });

  it('holds a logo colour apart from its neighbours', async () => {
    // Two slices side by side that both want navy: the second is no distance from the first, so it
    // keeps its chart colour.
    gives({ AAA: '#0f3e99', BBB: '#0f3e99' });
    renderTab(four());
    await loaded();
    expect(arcs().slice(0, 2)).toEqual(['#0f3e99', '#22c55e']);
  });

  it('colours the badge and the legend ring with the slice, and the ticker holds 4.5:1 on a logo colour', async () => {
    load.mockResolvedValue(null);
    renderTab(four());
    const aaa = badges()[0]!;
    // The chart violet is the fill, and the ticker in white or the ink on it.
    expect(aaa.style.backgroundColor).toBe('rgb(124, 92, 255)');
    expect(['rgb(255, 255, 255)', 'rgb(11, 11, 18)']).toContain(aaa.style.color);
  });

  it('follows a change of mode: navy fails on the dark page and yellow passes', async () => {
    gives({ AAA: '#0f3e99', BBB: '#ffd400' });
    renderTab(four());
    await loaded();
    expect(arcs().slice(0, 2)).toEqual(['#0f3e99', '#22c55e']);

    // The app turns dark: the page and the chart series change on <html>, and the pie reads them again.
    wear(DARK, 'dark');
    await waitFor(() => expect(arcs().slice(0, 2)).toEqual(['#7c5cff', '#ffd400']));
    expect(arcs().slice(2)).toEqual(['#3b82f6', '#ec4899']);
  });

  it('keeps the chart colours where the page cannot be read (no style sheet), whatever the logos give', async () => {
    document.documentElement.removeAttribute('style');
    gives({ AAA: '#0f3e99' });
    renderTab(four());
    await loaded();
    expect(arcs()).toEqual([1, 2, 3, 4].map((n) => `var(--color-chart-${n})`));
  });

  it('keeps the Other slice grey, and gives its badge the ink that holds on it', () => {
    load.mockResolvedValue(null);
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => worth(s, (7 - i) * 100));
    renderTab(dataOf(...many));
    const other = badges().at(-1)!;
    expect(other).toHaveAttribute('data-logo', 'other');
    expect(other).toHaveTextContent('+2');
    expect(other.style.backgroundColor).toBe('rgb(131, 136, 147)');
    expect(arcs().at(-1)).toBe('#838893');
  });

  it('starts from a logo sampled earlier in the session, with no wait for it to load', () => {
    load.mockResolvedValue(null);
    cached.mockImplementation((key) => (key === 'AAA' ? '#0f3e99' : undefined));
    renderTab(four());
    expect(arcs()).toEqual(['#0f3e99', '#22c55e', '#3b82f6', '#ec4899']);
    expect(cached).toHaveBeenCalledWith('AAA');
  });

  it('keeps what it has learned when the choice changes from All to Stocks and back', async () => {
    const mixed = dataOf(worth('AAA', 8000), worth('BBB', 1000), worth('CCC', 600));
    const etf = makeHolding({
      id: 'vusa',
      symbol: 'VUSA',
      name: 'VUSA Inc',
      type: 'etf',
      shares: 1,
      costBasis: 100_00,
      purchaseDate: '2026-01-05',
      quote: { price: 100, previousClose: 100, fxRate: 1, asOf: '2026-10-14T14:05:00.000Z' },
    });
    mixed.tables.holding = [...mixed.tables.holding, etf];
    gives({ AAA: '#0f3e99' });
    renderTab(mixed);
    await loaded();
    expect(arcs()[0]).toBe('#0f3e99');
    // A second pie starts from the logo already sampled (the real cache answers; here it is told).
    cached.mockImplementation((key) => (key === 'AAA' ? '#0f3e99' : undefined));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Allocation' })).getByRole('button', {
        name: 'Stocks',
      }),
    );
    expect(arcs('Stocks')[0]).toBe('#0f3e99');
  });
});
