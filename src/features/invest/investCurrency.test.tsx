import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding, Settings } from '@/domain/entities';
import { COMMON_CURRENCIES, currencyOptions } from '@/features/shared/currencies';
import { currencySymbol, formatMoney, formatMoneyPlain } from '@/domain/money';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDate, formatDay, formatMonthShort, formatPercent } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { market, MarketError } from '@/services/market';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeDividend, makeHolding, makeProfile, makeSettings } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { clearHistoryCache } from './historyCache';
import { HoldingPage } from './HoldingPage';
import { InvestScreen } from './InvestScreen';

const TODAY = '2026-10-14';
const ASOF = '2026-10-14T14:05:00.000Z';
// Expected text is built with the app's formatters: the test machine's locale decides "$" vs "US$".
const usd = (minor: number) => formatMoney(minor, 'USD');
const usdWhole = (minor: number) => formatMoney(minor, 'USD', undefined, { whole: true });
const eur = (minor: number) => formatMoney(minor, 'EUR');

/** The profile is in euros; Invest is shown in dollars at 1.1. */
const dollars = { currency: 'USD', rate: 1.1, asOf: ASOF };
const inDollars: Partial<Settings> = { investCurrency: 'USD', investFx: dollars };

const configured = () => vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token');

beforeEach(() => {
  // No token unless a test sets one: the screen then never asks the network for anything.
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
  vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
  vi.spyOn(market, 'fetchDividends').mockRejectedValue(new MarketError());
  vi.spyOn(market, 'fetchHistory').mockRejectedValue(new MarketError());
  clearHistoryCache();
  toastStore.setState({ toasts: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const quote = (price: number, previousClose: number) => ({
  price,
  previousClose,
  fxRate: 1,
  asOf: ASOF,
});

/** Coca-Cola: 10 shares worth EUR 600.00 for EUR 500.00, up EUR 10.00 today. Stocks. */
const ko = (extra: Partial<Holding> = {}) =>
  makeHolding({
    id: 'ko',
    symbol: 'KO',
    name: 'Coca-Cola',
    currency: 'EUR',
    shares: 10,
    costBasis: 500_00,
    purchaseDate: '2026-01-05',
    withholdingPct: 15,
    quote: quote(60, 59),
    ...extra,
  });
/** An ETF: 4 shares worth EUR 400.00 for EUR 380.00, up EUR 4.00 today. */
const vusa = (extra: Partial<Holding> = {}) =>
  makeHolding({
    id: 'vusa',
    symbol: 'VUSA',
    name: 'S&P 500 ETF',
    type: 'etf',
    currency: 'EUR',
    shares: 4,
    costBasis: 380_00,
    purchaseDate: '2026-01-05',
    quote: quote(100, 99),
    ...extra,
  });

function dataOf(holdings: Holding[], settings: Partial<Settings> | null): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency: 'EUR' })];
  data.tables.holding = holdings;
  if (settings) data.tables.settings = [makeSettings(settings)];
  return data;
}

function renderInvest(data: DataSnapshot, path = '/invest') {
  const store = createStubStore({ data, today: TODAY });
  const router = createMemoryRouter(
    [
      { path: '/invest', element: <InvestScreen /> },
      { path: '/invest/holding/:id', element: <HoldingPage /> },
    ],
    { initialEntries: [path] },
  );
  renderWithStore(<RouterProvider router={router} />, store);
  return store;
}

const chip = (currency: string) => screen.getByRole('button', { name: `Shown in ${currency}` });
const region = (name: string) => screen.getByRole('region', { name });
const fact = (label: string) => screen.getByText(label).parentElement!;
const pie = (name: string) => screen.getByRole('group', { name });
const noRateNote = (chosen: string) => `Showing EUR until a ${chosen} rate loads.`;

describe('Invest shown in another currency: Holdings', () => {
  it('converts the value, the day and the pies, and leaves the percentages as they are', () => {
    renderInvest(dataOf([ko(), vusa()], inDollars));
    expect(chip('USD')).toHaveTextContent('Shown in USD ▾');
    // EUR 1,000.00 at 1.1.
    expect(screen.getByText(usd(1_100_00))).toHaveClass('text-[34px]');
    expect(screen.getByText(`▲ ${usd(15_40)} today`)).toBeInTheDocument();
    // 120 on 880 paid, in euros and in dollars alike.
    expect(screen.getByText(`▲ ${formatPercent((120 * 100) / 880)} all time`)).toBeInTheDocument();

    // The type headings say what each adds up to.
    expect(within(pie('Stocks')).getByText(`${usdWhole(660_00)} · 60%`)).toBeInTheDocument();
    expect(within(pie('ETFs')).getByText(`${usdWhole(440_00)} · 40%`)).toBeInTheDocument();
    // Each pie's legend and its centre.
    const stocks = within(pie('Stocks'));
    expect(stocks.getByText('KO').closest('button')).toHaveTextContent(`KO${usdWhole(660_00)}100%`);
    expect(stocks.getAllByText(usdWhole(660_00)).length).toBeGreaterThanOrEqual(2);

    // The rows.
    expect(screen.getByRole('link', { name: /^KO · / })).toHaveTextContent(usd(660_00));
    expect(screen.getByRole('link', { name: /^VUSA · / })).toHaveTextContent(usd(440_00));
    expect(screen.getByText(/^Best: /)).toHaveTextContent(
      `Best: KO ${formatPercent(20, true)} · Worst: VUSA ${formatPercent((20 * 100) / 380, true)}`,
    );
    // Nothing of the profile currency is left on the tab.
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(noRateNote('USD'))).not.toBeInTheDocument();
  });

  it('names a selected slice in the currency Invest is shown in', async () => {
    renderInvest(dataOf([ko(), vusa()], inDollars));
    await userEvent.click(within(pie('Stocks')).getByText('KO').closest('button')!);
    expect(within(pie('Stocks')).getAllByText(usd(660_00)).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the profile currency and says so until the rate loads', () => {
    renderInvest(dataOf([ko(), vusa()], { investCurrency: 'USD', investFx: null }));
    expect(screen.getByText(eur(1_000_00))).toHaveClass('text-[34px]');
    expect(screen.getByText(noRateNote('USD'))).toBeInTheDocument();
    // The chip says what is shown; the note says what was chosen.
    expect(chip('EUR')).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('shows the profile currency, with no note, when no currency was chosen', () => {
    renderInvest(dataOf([ko(), vusa()], null));
    expect(screen.getByText(eur(1_000_00))).toHaveClass('text-[34px]');
    expect(chip('EUR')).toBeInTheDocument();
    expect(screen.queryByText(/until a .* rate loads/)).not.toBeInTheDocument();
  });

  it('shows the profile currency while the rate in store is for another currency', () => {
    renderInvest(
      dataOf([ko(), vusa()], {
        investCurrency: 'GBP',
        investFx: { ...dollars, currency: 'USD' },
      }),
    );
    expect(screen.getByText(eur(1_000_00))).toBeInTheDocument();
    expect(screen.getByText(noRateNote('GBP'))).toBeInTheDocument();
  });
});

describe('Invest shown in another currency: totals that add up', () => {
  /** Two stocks each worth EUR 600.04, up EUR 10.03 today: at 1.1 each is $660.04 and $11.03. */
  const twins = () =>
    ['aaa', 'bbb'].map((id) =>
      makeHolding({
        id,
        symbol: id.toUpperCase(),
        name: `${id} Inc`,
        currency: 'EUR',
        shares: 1,
        costBasis: 500_05,
        purchaseDate: '2026-01-05',
        quote: quote(600.04, 590.01),
      }),
    );

  it('shows a portfolio value and a day that are the sums of the rows shown', () => {
    renderInvest(dataOf(twins(), inDollars));
    // Each row rounds to $660.04, so the two are $1,320.08. Converting the EUR 1,200.08 total on its
    // own would say $1,320.09, one cent more than the rows add up to.
    expect(screen.getByRole('link', { name: /^AAA · / })).toHaveTextContent(usd(660_04));
    expect(screen.getByRole('link', { name: /^BBB · / })).toHaveTextContent(usd(660_04));
    expect(within(region('Portfolio value')).getByText(usd(1_320_08))).toHaveClass('text-[34px]');
    // The same for the day: $11.03 and $11.03, not the $22.07 of EUR 20.06 converted whole.
    expect(screen.getByText(`▲ ${usd(22_06)} today`)).toBeInTheDocument();
  });

  it('names a selected slice by its row, so the pie adds up to the portfolio too', async () => {
    renderInvest(dataOf(twins(), inDollars));
    await userEvent.click(within(pie('Stocks')).getByText('AAA').closest('button')!);
    expect(within(pie('Stocks')).getAllByText(usd(660_04)).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Invest shown in another currency: a holding', () => {
  it('converts the value, the gain, the facts and the chart', async () => {
    configured();
    vi.spyOn(market, 'fetchHistory').mockResolvedValue({
      symbol: 'KO',
      currency: 'EUR',
      points: [
        { date: '2026-01-05', close: 40 },
        { date: '2026-06-01', close: 50 },
        { date: TODAY, close: 60 },
      ],
    });
    const data = dataOf([ko()], inDollars);
    data.tables.dividend = [
      makeDividend({ holdingId: 'ko', amount: 12_00 }),
      makeDividend({ holdingId: 'ko', amount: 8_00 }),
    ];
    renderInvest(data, '/invest/holding/ko');

    expect(screen.getByText(usd(660_00))).toHaveClass('text-[34px]');
    // EUR 100.00 gained, on EUR 500.00 paid.
    expect(screen.getByText(`▲ ${usd(110_00)}`).parentElement).toHaveTextContent(
      `▲ ${usd(110_00)} · ▲ ${formatPercent(20)} since you bought`,
    );
    expect(fact('You paid per share')).toHaveTextContent(usd(55_00));
    expect(fact('Price now')).toHaveTextContent(usd(66_00));
    expect(fact('You paid in total')).toHaveTextContent(usd(550_00));
    expect(fact('Dividends received')).toHaveTextContent(usd(22_00));
    expect(fact('Shares')).toHaveTextContent('10');

    // The closes and the dashed line at what was paid, in dollars: EUR 40 and 60, EUR 50 paid.
    const img = await screen.findByRole('img', {
      name: `From ${usd(44_00)} on ${formatDate('2026-01-05')} to ${usd(66_00)} today`,
    });
    expect(within(img).getByText(`You bought · ${usd(55_00)}`)).toBeInTheDocument();
    expect(within(img).getByText(usd(66_00))).toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it('shows the profile currency on its page until the rate loads', () => {
    renderInvest(dataOf([ko()], { investCurrency: 'USD', investFx: null }), '/invest/holding/ko');
    expect(screen.getByText(eur(600_00))).toHaveClass('text-[34px]');
    expect(fact('You paid in total')).toHaveTextContent(eur(500_00));
  });

  it('says on Invest, where the note is, that the profile currency is shown until the rate loads', () => {
    renderInvest(dataOf([ko()], { investCurrency: 'USD', investFx: null }));
    expect(screen.getByText(noRateNote('USD'))).toBeInTheDocument();
  });

  it('shows a gain that is the value shown less the amount paid shown', () => {
    // EUR 600.04 worth, EUR 500.05 paid: $660.04 and $550.06 at 1.1. The EUR 99.99 gain on its own
    // would convert to $109.99; the two figures beside it leave $109.98.
    const h = ko({ shares: 1, costBasis: 500_05, quote: quote(600.04, 600.04) });
    renderInvest(dataOf([h], inDollars), '/invest/holding/ko');
    expect(screen.getByText(usd(660_04), { selector: 'p' })).toHaveClass('text-[34px]');
    expect(fact('You paid in total')).toHaveTextContent(usd(550_06));
    expect(screen.getByText(`▲ ${usd(109_98)}`)).toBeInTheDocument();
  });

  it('rounds the price per share and the price now once, from the unrounded amounts', () => {
    // EUR 250.025 paid a share and EUR 0.335 a share now, at 1.5: $375.04 (37503.75) and $0.50
    // (50.25). Rounding the euro cents first would give $375.05 and $0.51.
    const h = ko({ shares: 2, costBasis: 500_05, quote: quote(0.335, 0.335) });
    renderInvest(
      dataOf([h], { investCurrency: 'USD', investFx: { ...dollars, rate: 1.5 } }),
      '/invest/holding/ko',
    );
    expect(fact('You paid per share')).toHaveTextContent(usd(375_04));
    expect(fact('Price now')).toHaveTextContent(usd(50));
  });
});

/**
 * KO pays EUR 1.32 a share (10 shares, 15% withheld: EUR 11.22) on Oct 28 and every three months
 * after. VUSA paid EUR 2.50 a share (4 shares: EUR 10.00) on Oct 12, so that payout is due. MSFT
 * is no longer held: it paid EUR 346.30 in March and EUR 42.10 on Oct 5.
 */
function dividendData(settings: Partial<Settings> | null): DataSnapshot {
  const quarterly = (...dates: string[]) => dates.map((date) => ({ date, amount: 1 }));
  const data = dataOf(
    [
      ko({
        dividendInfo: {
          history: quarterly('2026-01-17', '2026-04-18', '2026-07-18'),
          nextExDate: '2026-10-18',
          nextPayDate: '2026-10-28',
          nextAmount: 1.32,
          fetchedAt: ASOF,
        },
      }),
      vusa({
        withholdingPct: 0,
        dividendInfo: {
          history: quarterly('2026-01-08', '2026-04-08', '2026-07-08'),
          nextExDate: '2026-10-08',
          nextPayDate: '2026-10-12',
          nextAmount: 2.5,
          fetchedAt: ASOF,
        },
      }),
    ],
    settings,
  );
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

describe('Invest shown in another currency: Dividends', () => {
  const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div');

  it('converts the figures, the bars, the rows and the top payers, and not the yield', () => {
    renderInvest(dividendData(inDollars), '/invest?tab=dividends');
    // EUR 42.10 this month and EUR 388.40 this year, at 1.1.
    expect(figure('This month')).toHaveTextContent(`This month${usd(46_31)}`);
    expect(figure('This year')).toHaveTextContent(`This year${usd(427_24)}`);
    // 4 x EUR 11.22 + 4 x EUR 10.00 = EUR 84.88, on a portfolio worth EUR 1,000.00.
    expect(figure('Next 12 months')).toHaveTextContent(`Next 12 months~${usdWhole(93_37)}`);
    expect(figure('Yield')).toHaveTextContent(`Yield${formatPercent((84_88 * 100) / 1_000_00)}`);

    // EUR 11.22 on Oct 28.
    expect(
      screen.getByRole('button', { name: `${formatMonthShort('2026-10-01')}: ${usd(12_34)}` }),
    ).toBeInTheDocument();
    expect(region('Due').querySelectorAll('li')).toHaveLength(1);
    expect(region('Due')).toHaveTextContent(`VUSA · paid ${formatDay('2026-10-12')}${usd(11_00)}`);
    expect(region('Coming up')).toHaveTextContent(
      `KO · pays ${formatDay('2026-10-28')}ex-date ${formatDay('2026-10-18')} · after 15% tax${usd(12_34)}`,
    );
    // A year of KO is EUR 44.88, and of VUSA EUR 40.00.
    expect(region('Top payers')).toHaveTextContent(`KO · Coca-Cola${usd(49_37)} a year`);
    expect(region('Top payers')).toHaveTextContent(`VUSA · S&P 500 ETF${usd(44_00)} a year`);
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it('shows the profile currency until the rate loads', () => {
    renderInvest(dividendData({ investCurrency: 'USD', investFx: null }), '/invest?tab=dividends');
    expect(figure('This month')).toHaveTextContent(`This month${eur(42_10)}`);
    expect(region('Due')).toHaveTextContent(eur(10_00));
    expect(screen.getByText(noRateNote('USD'))).toBeInTheDocument();
  });

  it('converts each figure from its own total, as none is shown as the sum of others', () => {
    // Two payouts of EUR 1.05 this month: the month is EUR 2.10, which is $2.31. Each payout alone
    // would be $1.16, and two of those $2.32.
    const data = dataOf([ko()], inDollars);
    data.tables.dividend = ['2026-10-05', '2026-10-06'].map((paidOn) =>
      makeDividend({ holdingId: 'ko', expectedPayDate: paidOn, paidOn, amount: 1_05 }),
    );
    renderInvest(data, '/invest?tab=dividends');
    expect(figure('This month')).toHaveTextContent(`This month${usd(2_31)}`);
    expect(figure('This year')).toHaveTextContent(`This year${usd(2_31)}`);
  });

  it('keeps the amount the person confirms in the profile currency', async () => {
    renderInvest(dividendData(inDollars), '/invest?tab=dividends');
    await userEvent.click(within(region('Due')).getByRole('button', { name: 'Confirm' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm VUSA dividend' });
    // The row says $11.00; what gets stored, and typed, is EUR 10.00.
    const amount = within(dialog).getByLabelText('Amount received');
    expect(amount).toHaveValue(formatMoneyPlain(10_00, 'EUR'));
    expect(dialog).toHaveTextContent(currencySymbol('EUR'));
    expect(dialog).not.toHaveTextContent(currencySymbol('USD'));
  });
});

describe('Invest shown in another currency: the holding dialog', () => {
  it('keeps what you paid in the profile currency, as it is stored', async () => {
    renderInvest(dataOf([ko()], inDollars), '/invest/holding/ko');
    expect(fact('You paid in total')).toHaveTextContent(usd(550_00));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit KO' });
    expect(within(dialog).getByLabelText('What you paid in total')).toHaveValue(
      formatMoneyPlain(500_00, 'EUR'),
    );
    expect(dialog).toHaveTextContent(currencySymbol('EUR'));
  });

  it('keeps the cost of a new holding in the profile currency too', async () => {
    renderInvest(dataOf([], inDollars));
    await userEvent.click(screen.getByRole('button', { name: 'Add your first holding' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('What you paid in total')).toBeInTheDocument();
    expect(dialog).toHaveTextContent(currencySymbol('EUR'));
    expect(dialog).not.toHaveTextContent(currencySymbol('USD'));
  });
});

describe('The currency sheet', () => {
  const open = async (data = dataOf([ko(), vusa()], null)) => {
    const store = renderInvest(data);
    await userEvent.click(chip('EUR'));
    return { store, sheet: screen.getByRole('dialog', { name: 'Show Invest in' }) };
  };
  const labels = (sheet: HTMLElement) =>
    within(sheet)
      .getAllByRole('radio')
      .map((b) => b.textContent);

  it('is a chip beside the title, at least 44px tall, that opens the sheet', async () => {
    renderInvest(dataOf([ko(), vusa()], null));
    expect(chip('EUR')).toHaveTextContent('Shown in EUR ▾');
    expect(chip('EUR')).toHaveClass('h-11');
    expect(screen.queryByRole('dialog', { name: 'Show Invest in' })).not.toBeInTheDocument();
    await userEvent.click(chip('EUR'));
    expect(screen.getByRole('dialog', { name: 'Show Invest in' })).toBeInTheDocument();
  });

  it('lists the common currencies, marks the app currency and the choice, and ends in All currencies', async () => {
    const { sheet } = await open();
    expect(within(sheet).getByText('Show Invest in', { selector: 'h3' })).toBeInTheDocument();
    expect(labels(sheet)).toEqual([
      expect.stringMatching(/^USD · /),
      'EUR · Euro (your app currency)',
      expect.stringMatching(/^GBP · /),
      expect.stringMatching(/^CAD · /),
      expect.stringMatching(/^AUD · /),
      expect.stringMatching(/^JPY · /),
      expect.stringMatching(/^CHF · /),
      expect.stringMatching(/^INR · /),
      expect.stringMatching(/^SGD · /),
      expect.stringMatching(/^ZAR · /),
    ]);
    const all = within(sheet).getByRole('button', { name: 'All currencies…' });
    // A check marks the current choice, which is the profile currency until another is picked.
    const on = within(sheet)
      .getAllByRole('radio', { checked: true })
      .map((b) => b.textContent);
    expect(on).toEqual(['EUR · Euro (your app currency)']);
    for (const row of [...within(sheet).getAllByRole('radio'), all]) {
      expect(row).toHaveClass('min-h-14');
    }
    expect(
      within(sheet).getByText(
        "Only Invest changes. Home, Budget and your balances stay in EUR. Invest converts at today's rate, so your gain % stays the same.",
      ),
    ).toBeInTheDocument();
  });

  it('shows every currency from All currencies, common ones first', async () => {
    const { sheet } = await open();
    expect(within(sheet).queryByRole('radio', { name: /^THB · / })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'All currencies…' }));
    const all = labels(sheet);
    expect(all.length).toBeGreaterThan(100);
    expect(all[0]).toMatch(/^USD · /);
    expect(all).toContainEqual(expect.stringMatching(/^THB · /));
    expect(
      within(sheet).queryByRole('button', { name: 'All currencies…' }),
    ).not.toBeInTheDocument();
    expect(all.filter((l) => l?.startsWith('EUR · '))).toEqual(['EUR · Euro (your app currency)']);
  });

  it('lists a currency picked from All currencies among the common ones next time', async () => {
    renderInvest(dataOf([ko(), vusa()], { investCurrency: 'THB', investFx: null }));
    await userEvent.click(chip('EUR'));
    const sheet = screen.getByRole('dialog', { name: 'Show Invest in' });
    const names = labels(sheet);
    expect(names).toContainEqual(expect.stringMatching(/^THB · /));
    expect(within(sheet).getByRole('button', { name: 'All currencies…' })).toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { checked: true })).toHaveTextContent(/^THB · /);
  });

  it('is one radio group of currencies, with the choice as the only tab stop', async () => {
    const { sheet } = await open();
    const group = within(sheet).getByRole('radiogroup', { name: 'Invest currency' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(COMMON_CURRENCIES.length);
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
    for (const radio of radios) {
      expect(radio).toHaveAttribute('aria-checked', radio === radios[1] ? 'true' : 'false');
      expect(radio).not.toHaveAttribute('aria-pressed');
      expect(radio).toHaveAttribute('tabindex', radio === radios[1] ? '0' : '-1');
    }
  });

  it('moves between the currencies with the arrow keys, and chooses only on Enter', async () => {
    const { store, sheet } = await open();
    const radios = within(sheet).getAllByRole('radio');
    radios[1]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(radios[2]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(radios[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(radios.at(-1)).toHaveFocus();
    expect(store.getState().put).not.toHaveBeenCalled();

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(store.getState().put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({ investCurrency: 'USD' }),
    );
  });

  it('puts focus on the first new currency when All currencies opens the rest', async () => {
    const { sheet } = await open();
    await userEvent.click(within(sheet).getByRole('button', { name: 'All currencies…' }));
    // The first currency after the common ones is where the person was in the list.
    const first = currencyOptions().find((o) => !COMMON_CURRENCIES.includes(o.value))!;
    expect(document.activeElement).toBe(
      within(sheet).getByRole('radio', { name: new RegExp(`^${first.value} · `) }),
    );
  });

  it('closes on Escape without choosing', async () => {
    const { store } = await open();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Show Invest in' })).not.toBeInTheDocument(),
    );
    expect(store.getState().put).not.toHaveBeenCalled();
  });
});

describe('Picking the currency', () => {
  const asDollars = async (_from: string, to: string) => ({
    from: 'EUR',
    to,
    rate: 1.1,
    asOf: ASOF,
  });

  /** A real store, so the choice and the rate that follows it really land in the settings. */
  async function renderReal(settings: Partial<Settings> | null) {
    configured();
    const { store } = await freshRealStore();
    const data = dataOf(
      [ko({ quote: { ...quote(60, 59), asOf: new Date().toISOString() } })],
      null,
    );
    await store.getState().put('profile', data.tables.profile[0]!);
    await store.getState().put('holding', data.tables.holding[0]!);
    if (settings) {
      await store
        .getState()
        .put('settings', { ...store.getState().data.tables.settings[0]!, ...settings });
    }
    const router = createMemoryRouter([{ path: '/invest', element: <InvestScreen /> }], {
      initialEntries: ['/invest'],
    });
    renderWithStore(<RouterProvider router={router} />, store);
    return store;
  }
  const settingsOf = (store: Awaited<ReturnType<typeof renderReal>>) =>
    store.getState().data.tables.settings[0]!;

  it('converts Invest once the rate arrives, and keeps the choice and the rate in the settings', async () => {
    const fetchFx = vi.spyOn(market, 'fetchFx').mockImplementation(asDollars);
    vi.spyOn(market, 'fetchQuotes').mockImplementation(async (symbols) => ({
      quotes: symbols.map((symbol) => ({
        symbol,
        name: symbol,
        price: 60,
        previousClose: 59,
        currency: 'EUR',
        type: 'stock' as const,
        exchange: 'NYQ',
        asOf: new Date().toISOString(),
      })),
      missing: [],
    }));
    const store = await renderReal(null);
    expect(within(region('Portfolio value')).getByText(eur(600_00))).toBeInTheDocument();

    await userEvent.click(chip('EUR'));
    const sheet = screen.getByRole('dialog', { name: 'Show Invest in' });
    await userEvent.click(within(sheet).getByRole('radio', { name: /^USD · / }));

    // The sheet closes and the rate arrives straight away.
    await waitFor(() => expect(chip('USD')).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Show Invest in' })).not.toBeInTheDocument();
    expect(within(region('Portfolio value')).getByText(usd(660_00))).toHaveClass('text-[34px]');
    expect(fetchFx).toHaveBeenCalledWith('EUR', 'USD');
    expect(settingsOf(store)).toMatchObject({ investCurrency: 'USD', investFx: dollars });
    expect(screen.queryByText(noRateNote('USD'))).not.toBeInTheDocument();
  });

  it('shows the profile currency with the note when the rate cannot be fetched', async () => {
    vi.spyOn(market, 'fetchFx').mockRejectedValue(new MarketError());
    vi.spyOn(market, 'fetchQuotes').mockResolvedValue({ quotes: [], missing: [] });
    const store = await renderReal(null);

    await userEvent.click(chip('EUR'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Show Invest in' })).getByRole('radio', {
        name: /^USD · /,
      }),
    );

    await waitFor(() => expect(settingsOf(store).investCurrency).toBe('USD'));
    expect(await screen.findByText(noRateNote('USD'))).toBeInTheDocument();
    expect(within(region('Portfolio value')).getByText(eur(600_00))).toBeInTheDocument();
    expect(chip('EUR')).toBeInTheDocument();
  });

  it('stores null when the profile currency is picked, and shows Invest in it again', async () => {
    const fetchFx = vi.spyOn(market, 'fetchFx').mockImplementation(asDollars);
    const store = await renderReal(inDollars);
    expect(within(region('Portfolio value')).getByText(usd(660_00))).toBeInTheDocument();

    await userEvent.click(chip('USD'));
    const sheet = screen.getByRole('dialog', { name: 'Show Invest in' });
    expect(within(sheet).getByRole('radio', { checked: true })).toHaveTextContent(/^USD · /);
    await userEvent.click(
      within(sheet).getByRole('radio', { name: 'EUR · Euro (your app currency)' }),
    );

    await waitFor(() => expect(chip('EUR')).toBeInTheDocument());
    expect(settingsOf(store)).toMatchObject({ investCurrency: null, investFx: null });
    expect(within(region('Portfolio value')).getByText(eur(600_00))).toBeInTheDocument();
    expect(fetchFx).not.toHaveBeenCalled();
  });

  it('keeps Home and the rest in the profile currency: only the Invest setting changes', async () => {
    vi.spyOn(market, 'fetchFx').mockImplementation(asDollars);
    const store = await renderReal(null);
    const profile = store.getState().data.tables.profile[0]!;
    await userEvent.click(chip('EUR'));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Show Invest in' })).getByRole('radio', {
        name: /^USD · /,
      }),
    );
    await waitFor(() => expect(settingsOf(store).investCurrency).toBe('USD'));
    expect(store.getState().data.tables.profile[0]).toEqual(profile);
    expect(store.getState().data.tables.holding[0]).toMatchObject({ costBasis: 500_00 });
  });
});
