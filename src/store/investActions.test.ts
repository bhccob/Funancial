import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketBalances } from '@/domain/balances';
import { duePayouts, type ExpectedPayout } from '@/domain/dividends';
import type { Holding, Settings } from '@/domain/entities';
import { MarketError, type Market } from '@/services/market';
import { makeDividend, makeHolding, makeProfile, makeTransaction } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { createFinanceActions } from './financeActions';
import { formatDay } from '@/lib/format';
import { createInvestActions, saleBeforePurchase, SHARES_GONE } from './investActions';

const TODAY = '2026-10-14';
const ASOF = '2026-10-14T09:00:00.000Z';
const HOURS = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOURS).toISOString();

const KO_PROFILE = {
  symbol: 'KO',
  name: 'The Coca-Cola Company',
  type: 'stock' as const,
  exchange: 'NYSE',
  currency: 'USD',
  sector: 'Consumer Defensive',
};

const down = () => Promise.reject(new MarketError());

/** A price service that answers every route; a test overrides the routes it cares about. */
function fakeMarket(over: Partial<Market> = {}) {
  return {
    fetchQuotes: vi.fn<Market['fetchQuotes']>(
      over.fetchQuotes ??
        (async (symbols) => ({
          quotes: symbols.map((symbol) => ({
            symbol,
            name: symbol,
            price: 100,
            previousClose: 98,
            currency: 'USD',
            type: 'stock' as const,
            exchange: 'NYQ',
            asOf: ASOF,
          })),
          missing: [],
        })),
    ),
    fetchProfile: vi.fn<Market['fetchProfile']>(over.fetchProfile ?? (async () => KO_PROFILE)),
    fetchDividends: vi.fn<Market['fetchDividends']>(
      over.fetchDividends ??
        (async (symbol) => ({
          symbol,
          currency: 'USD',
          history: [{ date: '2026-07-10', amount: 0.485 }],
          next: { exDate: '2026-10-10', payDate: '2026-10-12', amount: 0.485 },
        })),
    ),
    fetchNews: vi.fn<Market['fetchNews']>(over.fetchNews ?? (async () => ({ items: [] }))),
    fetchFx: vi.fn<Market['fetchFx']>(
      over.fetchFx ?? (async (from, to) => ({ from, to, rate: 0.92, asOf: ASOF })),
    ),
    fetchSearch: vi.fn<Market['fetchSearch']>(over.fetchSearch ?? (async () => ({ results: [] }))),
    fetchHistory: vi.fn<Market['fetchHistory']>(
      over.fetchHistory ?? (async (symbol) => ({ symbol, currency: 'USD', points: [] })),
    ),
  };
}

async function setup(over: Partial<Market> = {}) {
  const t = await freshRealStore();
  await t.store.getState().put(
    'profile',
    makeProfile({
      currency: 'EUR',
      openingDate: '2026-10-01',
      openingCash: 10_000_00,
      openingSavings: 5_000_00,
    }),
  );
  const market = fakeMarket(over);
  const actions = createInvestActions(t.store, market);
  const tables = () => t.store.getState().data.tables;
  const balances = () => bucketBalances(t.store.getState().data, TODAY);
  const holding = (id: string) => tables().holding.find((h) => h.id === id)!;
  return { ...t, market, actions, tables, balances, holding };
}

const purchase = {
  symbol: 'KO',
  shares: 10,
  costBasis: 500_00,
  purchaseDate: '2026-10-01',
  paidFrom: 'cash' as const,
  withholdingPct: 15,
};

beforeEach(() => vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'test-token'));
afterEach(() => vi.unstubAllEnvs());

describe('adding a holding', () => {
  it('adds a holding from the profile and records an investment when paid from cash', async () => {
    const { actions, market, tables, balances } = await setup();
    const cashBefore = balances().cash;
    await actions.addHolding({ ...purchase, symbol: 'ko' });
    expect(market.fetchProfile).toHaveBeenCalledWith('KO');
    expect(tables().holding).toMatchObject([
      {
        symbol: 'KO',
        name: 'The Coca-Cola Company',
        type: 'stock',
        exchange: 'NYSE',
        currency: 'USD',
        sector: 'Consumer Defensive',
        shares: 10,
        costBasis: 500_00,
        purchaseDate: '2026-10-01',
        withholdingPct: 15,
        manualPrice: null,
        quote: null,
        dividendInfo: null,
        checkedAt: null,
      },
    ]);
    expect(tables().transaction).toMatchObject([
      { type: 'investment', amount: 500_00, date: '2026-10-01', from: 'cash', to: null },
    ]);
    expect(balances().cash).toBe(cashBefore - 500_00);
  });

  it('takes savings for an investment too, and nothing for a holding already owned', async () => {
    const { actions, tables, balances } = await setup();
    await actions.addHolding({ ...purchase, paidFrom: 'savings' });
    expect(tables().transaction.map((t) => t.from)).toEqual(['savings']);
    const { cash, savings } = balances();
    await actions.addHolding({ ...purchase, paidFrom: 'owned' });
    expect(tables().holding).toHaveLength(2);
    expect(tables().transaction).toHaveLength(1);
    expect(balances()).toMatchObject({ cash, savings });
  });

  it('needs name and currency when the profile lookup fails', async () => {
    const { actions, tables } = await setup({ fetchProfile: down });
    await expect(actions.addHolding(purchase)).rejects.toThrow(
      "We couldn't find that symbol. Check it, or enter the name and currency yourself.",
    );
    await expect(actions.addHolding({ ...purchase, name: 'Coca-Cola' })).rejects.toThrow(
      "We couldn't find that symbol.",
    );
    expect(tables().holding).toEqual([]);
    expect(tables().transaction).toEqual([]);

    await actions.addHolding({ ...purchase, name: ' Coca-Cola ', currency: 'usd', type: 'etf' });
    expect(tables().holding).toMatchObject([
      { name: 'Coca-Cola', currency: 'USD', type: 'etf', exchange: null, sector: null },
    ]);
  });

  it('asks for name and currency without a token, and looks nothing up', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const { actions, market, tables } = await setup();
    await expect(actions.addHolding(purchase)).rejects.toThrow("We couldn't find that symbol.");
    await actions.addHolding({ ...purchase, name: 'Coca-Cola', currency: 'USD' });
    expect(market.fetchProfile).not.toHaveBeenCalled();
    expect(tables().holding).toMatchObject([{ symbol: 'KO', type: 'stock', currency: 'USD' }]);
  });

  it('refuses a future date', async () => {
    const { actions, tables } = await setup();
    await expect(actions.addHolding({ ...purchase, purchaseDate: '2026-10-15' })).rejects.toThrow(
      'Use today or an earlier date.',
    );
    expect(tables().holding).toEqual([]);
  });
});

describe('editing a holding', () => {
  it('updates it, and clears the old quote when the currency changes', async () => {
    const { actions, store, holding } = await setup();
    const quote = { price: 60, previousClose: null, fxRate: 0.9, asOf: ASOF };
    const h = makeHolding({ currency: 'USD', quote });
    await store.getState().put('holding', h);
    await actions.updateHolding(h.id, { shares: 12.5, manualPrice: 58 });
    expect(holding(h.id)).toMatchObject({ shares: 12.5, manualPrice: 58, quote });
    await actions.updateHolding(h.id, { currency: 'GBP' });
    expect(holding(h.id)).toMatchObject({ currency: 'GBP', quote: null });
    await expect(actions.updateHolding(h.id, { purchaseDate: '2026-10-15' })).rejects.toThrow(
      'Use today or an earlier date.',
    );
  });

  it('marks a holding checked', async () => {
    const { actions, store, holding } = await setup();
    const h = makeHolding();
    await store.getState().put('holding', h);
    await actions.markChecked(h.id);
    expect(holding(h.id).checkedAt).not.toBeNull();
  });

  it('deletes a holding but keeps its dividends and transactions', async () => {
    const { actions, store, tables } = await setup();
    const h = makeHolding();
    await store.getState().putMany([
      { table: 'holding', record: h },
      { table: 'dividend', record: makeDividend({ holdingId: h.id }) },
      { table: 'transaction', record: makeTransaction({ type: 'investment', to: null }) },
    ]);
    await actions.deleteHolding(h.id);
    expect(tables().holding).toEqual([]);
    expect(tables().dividend).toHaveLength(1);
    expect(tables().transaction).toHaveLength(1);
  });
});

describe('refreshing the market', () => {
  it('refreshes quotes, rates and stale dividend info in one write', async () => {
    // Each quote in the currency its symbol is listed in.
    const { actions, store, market, holding } = await setup({
      fetchQuotes: async (symbols) => {
        const { quotes } = await fakeMarket().fetchQuotes(symbols);
        return {
          quotes: quotes.map((q) => ({ ...q, currency: q.symbol === 'KO' ? 'USD' : 'EUR' })),
          missing: [],
        };
      },
    });
    const fresh = {
      history: [{ date: '2026-07-01', amount: 1 }],
      nextExDate: null,
      nextPayDate: null,
      nextAmount: null,
      fetchedAt: ago(1),
    };
    const usd = makeHolding({ symbol: 'KO', currency: 'USD' });
    const staleEur = makeHolding({
      symbol: 'SAP',
      currency: 'EUR',
      dividendInfo: { ...fresh, fetchedAt: ago(25) },
    });
    const freshEur = makeHolding({ symbol: 'ABC', currency: 'EUR', dividendInfo: fresh });
    await store
      .getState()
      .putMany([usd, staleEur, freshEur].map((record) => ({ table: 'holding' as const, record })));
    const putMany = vi.spyOn(store.getState(), 'putMany');

    await expect(actions.refreshMarket()).resolves.toBe('ok');

    expect(putMany).toHaveBeenCalledTimes(1);
    expect(putMany.mock.calls[0]![0]).toHaveLength(3);
    expect(market.fetchQuotes).toHaveBeenCalledOnce();
    expect(market.fetchQuotes).toHaveBeenCalledWith(['KO', 'SAP', 'ABC']);
    expect(market.fetchFx).toHaveBeenCalledOnce();
    expect(market.fetchFx).toHaveBeenCalledWith('USD', 'EUR');
    expect(market.fetchDividends.mock.calls.map(([s]) => s)).toEqual(['KO', 'SAP']);

    expect(holding(usd.id).quote).toEqual({
      price: 100,
      previousClose: 98,
      fxRate: 0.92,
      asOf: ASOF,
    });
    expect(holding(staleEur.id).quote).toMatchObject({ price: 100, fxRate: 1 });
    expect(holding(usd.id).dividendInfo).toMatchObject({
      history: [{ date: '2026-07-10', amount: 0.485 }],
      nextExDate: '2026-10-10',
      nextPayDate: '2026-10-12',
      nextAmount: 0.485,
    });
    expect(Date.parse(holding(staleEur.id).dividendInfo!.fetchedAt)).toBeGreaterThan(
      Date.now() - HOURS,
    );
    expect(holding(freshEur.id).dividendInfo).toEqual(fresh);
  });

  it("adopts the quote's currency and fetches that currency's rate", async () => {
    const quoted = { symbol: 'ASML', name: 'ASML', price: 700, previousClose: 690 };
    const { actions, store, market, tables, holding } = await setup({
      fetchQuotes: async () => ({
        quotes: [{ ...quoted, currency: 'EUR', type: 'stock', exchange: 'AMS', asOf: ASOF }],
        missing: [],
      }),
      fetchFx: async (from, to) => ({ from, to, rate: from === 'EUR' ? 1.08 : 0.5, asOf: ASOF }),
    });
    await store.getState().put('profile', { ...tables().profile[0]!, currency: 'USD' });
    // Typed in by hand as dollars, the profile's own currency: Yahoo lists it in euros.
    const h = makeHolding({ symbol: 'ASML', currency: 'USD' });
    await store.getState().put('holding', h);

    await expect(actions.refreshMarket()).resolves.toBe('ok');
    expect(market.fetchFx.mock.calls).toEqual([['EUR', 'USD']]);
    expect(holding(h.id)).toMatchObject({ currency: 'EUR', quote: { price: 700, fxRate: 1.08 } });
  });

  it("keeps no rate of the old currency when the adopted one's rate cannot be fetched", async () => {
    const { actions, store, holding } = await setup({
      fetchQuotes: async () => ({
        quotes: [
          {
            symbol: 'ASML',
            name: 'ASML',
            price: 700,
            previousClose: 690,
            currency: 'USD',
            type: 'stock',
            exchange: 'NMS',
            asOf: ASOF,
          },
        ],
        missing: [],
      }),
      fetchFx: down,
    });
    const old = { price: 600, previousClose: null, fxRate: 1.17, asOf: ASOF };
    const h = makeHolding({ symbol: 'ASML', currency: 'GBP', quote: old });
    await store.getState().put('holding', h);

    await actions.refreshMarket();
    expect(holding(h.id)).toMatchObject({ currency: 'USD', quote: { price: 700, fxRate: null } });
  });

  it('matches quotes by upper-case symbol and leaves a holding the service lacks as it was', async () => {
    const { actions, store, holding } = await setup({
      fetchQuotes: async () => ({
        quotes: [
          {
            symbol: 'ko',
            name: 'Coca-Cola',
            price: 61,
            previousClose: null,
            currency: 'USD',
            type: 'stock',
            exchange: null,
            asOf: ASOF,
          },
        ],
        missing: ['ZZZ'],
      }),
    });
    const ko = makeHolding({ symbol: 'KO' });
    const old = { price: 7, previousClose: null, fxRate: 0.9, asOf: '2026-10-01T09:00:00.000Z' };
    const zzz = makeHolding({ symbol: 'ZZZ', quote: old });
    await store.getState().putMany([
      { table: 'holding', record: ko },
      { table: 'holding', record: zzz },
    ]);
    await actions.refreshMarket();
    expect(holding(ko.id).quote?.price).toBe(61);
    expect(holding(zzz.id).quote).toEqual(old);
  });

  it('keeps the last prices and returns "failed" when the service is down', async () => {
    const { actions, store, holding } = await setup({
      fetchQuotes: down,
      fetchFx: down,
      fetchDividends: down,
    });
    const quote = { price: 60, previousClose: 59, fxRate: 0.9, asOf: '2026-10-13T09:00:00.000Z' };
    const h = makeHolding({ currency: 'USD', quote });
    await store.getState().put('holding', h);
    const putMany = vi.spyOn(store.getState(), 'putMany');
    await expect(actions.refreshMarket()).resolves.toBe('failed');
    expect(putMany).not.toHaveBeenCalled();
    expect(holding(h.id)).toEqual(h);
  });

  it("keeps a holding's last rate and dividends when only those calls fail", async () => {
    const { actions, store, holding } = await setup({ fetchFx: down, fetchDividends: down });
    const info = {
      history: [{ date: '2026-07-10', amount: 0.4 }],
      nextExDate: null,
      nextPayDate: null,
      nextAmount: null,
      fetchedAt: ago(48),
    };
    const old = { price: 60, previousClose: null, fxRate: 0.9, asOf: '2026-10-13T09:00:00.000Z' };
    const h = makeHolding({ currency: 'USD', quote: old, dividendInfo: info });
    await store.getState().put('holding', h);
    await expect(actions.refreshMarket()).resolves.toBe('ok');
    expect(holding(h.id).quote).toMatchObject({ price: 100, fxRate: 0.9, asOf: ASOF });
    expect(holding(h.id).dividendInfo).toEqual(info);
  });

  it('applies the answers to the holdings as they are when the answers arrive', async () => {
    let edit = Promise.resolve();
    const ctx = await setup({
      fetchQuotes: async (symbols) => {
        await edit; // the person edits the holding while the request is out
        return fakeMarket().fetchQuotes(symbols);
      },
    });
    const h = makeHolding({ shares: 10 });
    await ctx.store.getState().put('holding', h);
    edit = ctx.actions.updateHolding(h.id, { shares: 20 });
    await ctx.actions.refreshMarket();
    expect(ctx.holding(h.id)).toMatchObject({ shares: 20, quote: { price: 100 } });
  });

  it('writes nothing when the currency was switched while the answers were out', async () => {
    let switchCurrency = async () => {};
    const ctx = await setup({
      fetchQuotes: async (symbols) => {
        await switchCurrency(); // the person switches currency while the request is out
        return fakeMarket().fetchQuotes(symbols);
      },
    });
    switchCurrency = () => createFinanceActions(ctx.store).changeCurrency('GBP');
    const old = { price: 60, previousClose: 59, fxRate: 0.9, asOf: '2026-10-13T09:00:00.000Z' };
    const h = makeHolding({ currency: 'USD', quote: old });
    await ctx.store.getState().put('holding', h);

    // The rates it fetched were for the euro, which is no longer the profile's currency.
    await expect(ctx.actions.refreshMarket()).resolves.toBe('failed');
    expect(ctx.market.fetchFx).toHaveBeenCalledWith('USD', 'EUR');
    expect(ctx.tables().profile[0]?.currency).toBe('GBP');
    // The switch cleared the stale rate; the refresh did not put one for the euro back.
    expect(ctx.holding(h.id).quote).toEqual({ ...old, fxRate: null });
  });

  it('returns "not configured" without a token and makes no request', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const { actions, store, market } = await setup();
    await store.getState().put('holding', makeHolding());
    await expect(actions.refreshMarket()).resolves.toBe('not configured');
    for (const route of Object.values(market)) expect(route).not.toHaveBeenCalled();
  });
});

/** Quotes in euros, the profile currency, so the only rate asked for is the one Invest is shown at. */
const inEuros: Partial<Market> = {
  fetchQuotes: async (symbols) => ({
    quotes: symbols.map((symbol) => ({
      symbol,
      name: symbol,
      price: 100,
      previousClose: 98,
      currency: 'EUR',
      type: 'stock' as const,
      exchange: 'AMS',
      asOf: ASOF,
    })),
    missing: [],
  }),
};
const dollars = { currency: 'USD', rate: 1.1, asOf: ASOF };

/** A euro profile with Invest shown in `investCurrency`, and `investFx` as the rate stored for it. */
async function shownIn(
  investCurrency: string | null,
  investFx: Settings['investFx'] = null,
  over: Partial<Market> = {},
) {
  const ctx = await setup({
    ...inEuros,
    fetchFx: async (from, to) => ({ from, to, rate: 1.1, asOf: ASOF }),
    ...over,
  });
  const settings = () => ctx.tables().settings[0]!;
  await ctx.store.getState().put('settings', { ...settings(), investCurrency, investFx });
  const putMany = vi.fn(ctx.store.getState().putMany);
  ctx.store.setState({ putMany });
  return { ...ctx, settings, putMany };
}

describe('refreshing the rate Invest is shown at', () => {
  it('fetches it from the profile currency and stores it in the same write as the holdings', async () => {
    const { actions, store, market, settings, putMany } = await shownIn('USD');
    await store.getState().put('holding', makeHolding({ currency: 'EUR' }));
    putMany.mockClear();

    await expect(actions.refreshMarket()).resolves.toBe('ok');

    expect(market.fetchFx.mock.calls).toEqual([['EUR', 'USD']]);
    expect(putMany).toHaveBeenCalledTimes(1);
    expect(putMany.mock.calls[0]![0].map((i) => i.table)).toEqual(['holding', 'settings']);
    expect(settings().investFx).toEqual(dollars);
    expect(settings().investCurrency).toBe('USD');
  });

  it('keeps the last rate when only that call fails', async () => {
    const old = { currency: 'USD', rate: 1.05, asOf: '2026-10-13T09:00:00.000Z' };
    const { actions, store, settings, putMany } = await shownIn('USD', old, { fetchFx: down });
    await store.getState().put('holding', makeHolding({ currency: 'EUR' }));
    putMany.mockClear();

    await expect(actions.refreshMarket()).resolves.toBe('ok');

    expect(settings().investFx).toEqual(old);
    expect(putMany.mock.calls[0]![0].map((i) => i.table)).toEqual(['holding']);
  });

  it('asks for none when Invest is shown in the profile currency', async () => {
    for (const choice of [null, 'EUR']) {
      const { actions, store, market, settings } = await shownIn(choice);
      await store.getState().put('holding', makeHolding({ currency: 'EUR' }));
      await actions.refreshMarket();
      expect(market.fetchFx, String(choice)).not.toHaveBeenCalled();
      expect(settings().investFx).toBeNull();
    }
  });

  it('stores no rate for a currency Invest is no longer shown in', async () => {
    let choose = async () => {};
    const { actions, store, settings } = await shownIn('USD', null, {
      fetchFx: async (from, to) => {
        await choose(); // the person picks another currency while the rate is out
        return { from, to, rate: 1.1, asOf: ASOF };
      },
    });
    await store.getState().put('holding', makeHolding({ currency: 'EUR' }));
    choose = () => store.getState().put('settings', { ...settings(), investCurrency: 'GBP' });

    await expect(actions.refreshMarket()).resolves.toBe('ok');

    expect(settings()).toMatchObject({ investCurrency: 'GBP', investFx: null });
  });

  it('fetches the rate with no holdings, and no quotes', async () => {
    const { actions, market, settings } = await shownIn('USD');
    await expect(actions.refreshMarket()).resolves.toBe('ok');
    expect(market.fetchQuotes).not.toHaveBeenCalled();
    expect(market.fetchFx.mock.calls).toEqual([['EUR', 'USD']]);
    expect(settings().investFx).toEqual(dollars);
  });

  it('requests nothing with no holdings and no currency chosen', async () => {
    const { actions, market } = await shownIn(null);
    await expect(actions.refreshMarket()).resolves.toBe('ok');
    for (const route of Object.values(market)) expect(route).not.toHaveBeenCalled();
  });
});

describe('choosing the Invest currency', () => {
  it('writes the choice with the old rate dropped, then fetches the new rate straight away', async () => {
    const gbp = { currency: 'GBP', rate: 0.86, asOf: '2026-10-13T09:00:00.000Z' };
    const { actions, market, settings, putMany } = await shownIn('GBP', gbp);
    putMany.mockClear();

    await actions.setInvestCurrency('USD');

    const written = putMany.mock.calls.map(([items]) =>
      items.flatMap((i) => (i.table === 'settings' ? [i.record] : [])),
    );
    // First the choice alone, with no rate, then the rate once it has come.
    expect(written[0]![0]).toMatchObject({ investCurrency: 'USD', investFx: null });
    expect(market.fetchFx.mock.calls).toEqual([['EUR', 'USD']]);
    expect(settings()).toMatchObject({ investCurrency: 'USD', investFx: dollars });
  });

  it('stores null for the profile currency, drops the rate and fetches nothing', async () => {
    const { actions, market, settings } = await shownIn('USD', dollars);
    await actions.setInvestCurrency('EUR');
    expect(settings()).toMatchObject({ investCurrency: null, investFx: null });
    expect(market.fetchFx).not.toHaveBeenCalled();
    expect(market.fetchQuotes).not.toHaveBeenCalled();

    await actions.setInvestCurrency(null);
    expect(settings().investCurrency).toBeNull();
  });

  it('keeps the rate it already has for the currency chosen again', async () => {
    const { actions, market, settings } = await shownIn('USD', dollars);
    await actions.setInvestCurrency('USD');
    expect(settings()).toMatchObject({ investCurrency: 'USD', investFx: dollars });
    expect(market.fetchFx).not.toHaveBeenCalled();
  });

  it('keeps the choice, with no rate, when the price service is not set up', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const { actions, market, settings } = await shownIn(null);
    await actions.setInvestCurrency('USD');
    expect(settings()).toMatchObject({ investCurrency: 'USD', investFx: null });
    for (const route of Object.values(market)) expect(route).not.toHaveBeenCalled();
  });

  it('keeps the choice, with no rate, when the rate cannot be fetched', async () => {
    const { actions, settings } = await shownIn(null, null, { fetchFx: down });
    await actions.setInvestCurrency('USD');
    expect(settings()).toMatchObject({ investCurrency: 'USD', investFx: null });
  });

  it('refuses a code that is not three capital letters', async () => {
    const { actions, settings } = await shownIn(null);
    await expect(actions.setInvestCurrency('usd')).rejects.toThrow();
    expect(settings().investCurrency).toBeNull();
  });
});

describe('dividend payouts', () => {
  /** A quarterly payer whose October payout (net 379 cents at 0.92) is waiting to be confirmed. */
  async function withDuePayout(over: Partial<Holding> = {}) {
    const t = await setup();
    const h = makeHolding({
      symbol: 'KO',
      currency: 'USD',
      shares: 10,
      costBasis: 500_00,
      purchaseDate: '2026-01-01',
      withholdingPct: 15,
      quote: { price: 60, previousClose: null, fxRate: 0.9, asOf: ASOF },
      dividendInfo: {
        history: [
          { date: '2026-01-10', amount: 0.485 },
          { date: '2026-04-10', amount: 0.485 },
          { date: '2026-07-10', amount: 0.485 },
        ],
        nextExDate: '2026-10-10',
        nextPayDate: '2026-10-12',
        nextAmount: 0.485,
        fetchedAt: ago(1),
      },
      ...over,
    });
    await t.store.getState().put('holding', h);
    const due = () => duePayouts(t.store.getState().data, 'EUR', TODAY);
    const [payout] = due() as [ExpectedPayout];
    return { ...t, h, due, payout };
  }

  it('confirms a payout once, into savings', async () => {
    const { actions, tables, balances, due, payout } = await withDuePayout();
    expect(due()).toHaveLength(1);
    const before = balances();

    await actions.confirmDividend(payout, {
      amount: 3_79,
      paidOn: '2026-10-12',
      bucket: 'savings',
    });
    expect(tables().dividend).toMatchObject([
      {
        symbol: 'KO',
        expectedPayDate: payout.payDate,
        paidOn: '2026-10-12',
        status: 'confirmed',
        amount: 3_79,
        bucket: 'savings',
        sharesAdded: null,
      },
    ]);
    expect(due()).toEqual([]);
    expect(balances()).toMatchObject({ savings: before.savings + 3_79, cash: before.cash });

    // Asking again changes nothing.
    await actions.confirmDividend(payout, { amount: 3_79, paidOn: '2026-10-12', bucket: 'cash' });
    expect(tables().dividend).toHaveLength(1);
    expect(balances()).toMatchObject({ savings: before.savings + 3_79, cash: before.cash });
  });

  it('confirms once when it is asked twice before the first save is done', async () => {
    const { actions, tables, balances, payout } = await withDuePayout();
    const before = balances();
    const input = { amount: 3_79, paidOn: '2026-10-12', bucket: 'savings' as const };
    await Promise.all([
      actions.confirmDividend(payout, input),
      actions.confirmDividend(payout, input),
    ]);
    expect(tables().dividend).toHaveLength(1);
    expect(balances().savings).toBe(before.savings + 3_79);
  });

  it('reinvests once when it is asked twice before the first save is done', async () => {
    const { actions, tables, holding, h, payout } = await withDuePayout();
    const input = { amount: 3_79, paidOn: '2026-10-12', bucket: 'reinvest' as const };
    await Promise.all([
      actions.confirmDividend(payout, input),
      actions.confirmDividend(payout, input),
    ]);
    expect(tables().dividend).toHaveLength(1);
    expect(holding(h.id).costBasis).toBe(500_00 + 3_79);
  });

  it('stays settled when the person gives another date for it', async () => {
    const { actions, due, payout } = await withDuePayout();
    await actions.confirmDividend(payout, { amount: 3_79, paidOn: '2026-10-14', bucket: 'cash' });
    expect(due()).toEqual([]);
  });

  it('refuses a payment date in the future', async () => {
    const { actions, tables, payout } = await withDuePayout();
    await expect(
      actions.confirmDividend(payout, { amount: 3_79, paidOn: '2026-10-15', bucket: 'cash' }),
    ).rejects.toThrow('Use today or an earlier date.');
    expect(tables().dividend).toEqual([]);
  });

  it('reinvests by adding fractional shares and cost basis, not cash', async () => {
    const { actions, tables, balances, holding, h, payout } = await withDuePayout();
    const before = balances();

    await actions.confirmDividend(payout, {
      amount: 3_79,
      paidOn: '2026-10-12',
      bucket: 'reinvest',
    });

    // 60 USD at 0.9 is 54 EUR, or 5400 cents, a share.
    const sharesAdded = 3_79 / 5400;
    expect(tables().dividend).toMatchObject([
      { status: 'confirmed', amount: 3_79, bucket: 'reinvest', sharesAdded },
    ]);
    expect(holding(h.id).shares).toBeCloseTo(10 + sharesAdded, 12);
    expect(holding(h.id).costBasis).toBe(500_00 + 3_79);
    expect(balances()).toEqual(before);
  });

  it('prices a reinvestment at the manual price when there is one', async () => {
    const { actions, holding, h, payout } = await withDuePayout({ manualPrice: 30 });
    await actions.confirmDividend(payout, {
      amount: 5_40,
      paidOn: '2026-10-12',
      bucket: 'reinvest',
    });
    expect(holding(h.id).shares).toBeCloseTo(10 + 540 / 2700, 12);
  });

  const NO_PRICE =
    'Reinvesting needs a price for this holding. Refresh prices or set a manual price.';
  const NO_RATE = 'Reinvesting needs an exchange rate for this holding. Refresh prices first.';
  const noRate = { price: 60, previousClose: null, fxRate: null, asOf: ASOF };
  it.each([
    ['price', { quote: null }, NO_PRICE],
    ['exchange rate', { quote: noRate }, NO_RATE],
    ['exchange rate, with a manual price', { quote: null, manualPrice: 30 }, NO_RATE],
    ['price above zero', { manualPrice: 0 }, NO_PRICE],
    ['price or rate', { quote: noRate, manualPrice: 0 }, NO_PRICE],
  ])('will not reinvest without a %s', async (_what, over, message) => {
    const { actions, tables, holding, h, payout } = await withDuePayout(over);
    const kept = holding(h.id);
    await expect(
      actions.confirmDividend(payout, { amount: 3_79, paidOn: '2026-10-12', bucket: 'reinvest' }),
    ).rejects.toThrow(message);
    expect(tables().dividend).toEqual([]);
    expect(holding(h.id)).toEqual(kept);
  });

  describe('deleting a dividend record', () => {
    it('reopens a confirmed payout and takes back its money and logging XP', async () => {
      const { actions, tables, balances, due, payout } = await withDuePayout();
      const before = balances();
      await actions.confirmDividend(payout, {
        amount: 3_79,
        paidOn: '2026-10-12',
        bucket: 'savings',
      });
      const [dividend] = tables().dividend;
      const xp = () =>
        tables()
          .ledger.filter((e) => e.key === `log:dividend:${dividend!.id}`)
          .reduce((sum, e) => sum + e.xp, 0);
      expect(xp()).toBeGreaterThan(0);

      await actions.deleteDividend(dividend!.id);
      expect(tables().dividend).toEqual([]);
      expect(due()).toEqual([payout]);
      expect(balances()).toEqual(before);
      expect(xp()).toBe(0);
    });

    it('reopens a skipped payout', async () => {
      const { actions, tables, due, payout } = await withDuePayout();
      await actions.skipDividend(payout);
      await actions.deleteDividend(tables().dividend[0]!.id);
      expect(due()).toEqual([payout]);
    });

    it('takes reinvested shares and cost back off the holding in the same write', async () => {
      const { actions, store, tables, holding, h, payout } = await withDuePayout();
      await actions.confirmDividend(payout, {
        amount: 3_79,
        paidOn: '2026-10-12',
        bucket: 'reinvest',
      });
      const putMany = vi.spyOn(store.getState(), 'putMany');

      await actions.deleteDividend(tables().dividend[0]!.id);
      expect(putMany).toHaveBeenCalledOnce();
      expect(tables().dividend).toEqual([]);
      expect(holding(h.id).shares).toBeCloseTo(10, 12);
      expect(holding(h.id).costBasis).toBe(500_00);
    });

    it('refuses when the holding no longer has the shares the dividend bought', async () => {
      const { actions, tables, holding, h, payout } = await withDuePayout();
      await actions.confirmDividend(payout, {
        amount: 3_79,
        paidOn: '2026-10-12',
        bucket: 'reinvest',
      });
      const [dividend] = tables().dividend;
      await actions.updateHolding(h.id, { shares: dividend!.sharesAdded! });
      const kept = holding(h.id);

      await expect(actions.deleteDividend(dividend!.id)).rejects.toThrow(SHARES_GONE);
      expect(tables().dividend).toEqual([dividend]);
      expect(holding(h.id)).toEqual(kept);
    });

    it('removes a reinvested record of a holding that was deleted', async () => {
      const { actions, tables, h, payout } = await withDuePayout();
      await actions.confirmDividend(payout, {
        amount: 3_79,
        paidOn: '2026-10-12',
        bucket: 'reinvest',
      });
      await actions.deleteHolding(h.id);
      await actions.deleteDividend(tables().dividend[0]!.id);
      expect(tables().dividend).toEqual([]);
      expect(tables().holding).toEqual([]);
    });
  });

  describe('of a holding sold since', () => {
    /** The due October payout after every share was sold on 13 October, three days after its ex-date. */
    async function soldAfterExDate() {
      const t = await withDuePayout();
      const sell = {
        shares: 10,
        pricePerShareMinor: 54_00,
        soldOn: '2026-10-13',
        to: 'cash' as const,
      };
      await t.actions.sellHolding(t.h.id, sell);
      return t;
    }

    it('is still due, and is confirmed into cash with no holding to update', async () => {
      const { actions, tables, balances, due, h, payout } = await soldAfterExDate();
      expect(tables().holding).toEqual([]);
      expect(due()).toHaveLength(1);
      expect(due()[0]).toMatchObject({ payDate: payout.payDate, net: payout.net });
      const before = balances();

      await actions.confirmDividend(due()[0]!, {
        amount: 3_79,
        paidOn: '2026-10-12',
        bucket: 'cash',
      });
      expect(tables().dividend).toMatchObject([
        { holdingId: h.id, symbol: 'KO', status: 'confirmed', amount: 3_79, bucket: 'cash' },
      ]);
      expect(tables().holding).toEqual([]);
      expect(due()).toEqual([]);
      expect(balances()).toEqual({ ...before, cash: before.cash + 3_79 });
    });

    it('cannot be reinvested', async () => {
      const { actions, tables, due } = await soldAfterExDate();
      await expect(
        actions.confirmDividend(due()[0]!, {
          amount: 3_79,
          paidOn: '2026-10-12',
          bucket: 'reinvest',
        }),
      ).rejects.toThrow(
        "This holding was sold, so the dividend can't be reinvested. Choose where the money went.",
      );
      expect(tables().dividend).toEqual([]);
      expect(tables().holding).toEqual([]);
    });

    it('is skipped', async () => {
      const { actions, tables, due } = await soldAfterExDate();
      await actions.skipDividend(due()[0]!);
      expect(tables().dividend).toMatchObject([{ status: 'skipped', amount: 0 }]);
      expect(due()).toEqual([]);
    });

    it('is due once, not twice, after the sale is undone', async () => {
      const { actions, tables, due, h } = await soldAfterExDate();
      await actions.undoSale(tables().sale[0]!.id);
      expect(due().map((p) => p.holding.id)).toEqual([h.id]);
    });

    it('is not confirmed once the holding was deleted with nothing sold', async () => {
      const { actions, h, payout } = await withDuePayout();
      await actions.deleteHolding(h.id);
      await expect(
        actions.confirmDividend(payout, { amount: 3_79, paidOn: '2026-10-12', bucket: 'cash' }),
      ).rejects.toThrow('That item no longer exists.');
    });
  });

  it('skips a payout so it is not due again', async () => {
    const { actions, tables, balances, due, payout } = await withDuePayout();
    const before = balances();
    await actions.skipDividend(payout);
    await actions.skipDividend(payout);
    expect(tables().dividend).toMatchObject([
      {
        symbol: 'KO',
        expectedPayDate: payout.payDate,
        status: 'skipped',
        amount: 0,
        bucket: null,
        sharesAdded: null,
      },
    ]);
    expect(due()).toEqual([]);
    expect(balances()).toEqual(before);
  });
});

describe('selling a holding', () => {
  const sell = { shares: 4, pricePerShareMinor: 60_00, soldOn: '2026-10-10', to: 'cash' as const };

  /** Ten KO shares that cost 500.00, priced at the last quote. */
  async function withHolding(over: Partial<Holding> = {}) {
    const t = await setup();
    const h = makeHolding({
      shares: 10,
      costBasis: 500_00,
      purchaseDate: '2026-10-01',
      quote: { price: 60, previousClose: 59, fxRate: 1, asOf: ASOF },
      ...over,
    });
    await t.store.getState().put('holding', h);
    return { ...t, h };
  }

  it('a partial sale lowers the shares and the cost, and writes one sale, in one write', async () => {
    const { actions, store, tables, holding, balances, h } = await withHolding();
    const before = balances();
    const putMany = vi.spyOn(store.getState(), 'putMany');

    const plan = await actions.sellHolding(h.id, sell);

    expect(putMany).toHaveBeenCalledOnce();
    expect(plan).toEqual({ shares: 4, proceeds: 240_00, cost: 200_00, profit: 40_00, all: false });
    expect(holding(h.id)).toMatchObject({ shares: 6, costBasis: 300_00 });
    expect(tables().sale).toMatchObject([
      {
        holdingId: h.id,
        symbol: 'KO',
        name: 'Coca-Cola',
        type: 'stock',
        shares: 4,
        proceeds: 240_00,
        cost: 200_00,
        soldOn: '2026-10-10',
        to: 'cash',
        restore: null,
      },
    ]);
    expect(balances()).toEqual({ ...before, cash: before.cash + 240_00 });
  });

  it('puts the proceeds into savings when asked', async () => {
    const { actions, balances, h } = await withHolding();
    const before = balances();
    await actions.sellHolding(h.id, { ...sell, to: 'savings' });
    expect(balances()).toEqual({ ...before, savings: before.savings + 240_00 });
  });

  it('a full sale removes the holding and keeps it on the sale as it was', async () => {
    const { actions, store, tables, h } = await withHolding();
    const was = tables().holding[0]!;
    const putMany = vi.spyOn(store.getState(), 'putMany');

    const plan = await actions.sellHolding(h.id, { ...sell, shares: 10 });

    expect(putMany).toHaveBeenCalledOnce();
    expect(plan).toEqual({ shares: 10, proceeds: 600_00, cost: 500_00, profit: 100_00, all: true });
    expect(tables().holding).toEqual([]);
    expect(tables().sale).toHaveLength(1);
    expect(tables().sale[0]).toMatchObject({ shares: 10, cost: 500_00, restore: was });
  });

  it('keeps the dividends and the purchase of a holding that was sold', async () => {
    const { actions, store, tables, h } = await withHolding();
    await store.getState().putMany([
      { table: 'dividend', record: makeDividend({ holdingId: h.id }) },
      { table: 'transaction', record: makeTransaction({ type: 'investment', to: null }) },
    ]);
    await actions.sellHolding(h.id, { ...sell, shares: 10 });
    expect(tables().dividend).toHaveLength(1);
    expect(tables().transaction).toHaveLength(1);
  });

  it('refuses a future date, too many shares, a zero price and a holding that is gone, writing nothing', async () => {
    const { actions, tables, holding, h } = await withHolding();
    const kept = holding(h.id);
    await expect(actions.sellHolding(h.id, { ...sell, soldOn: '2026-10-15' })).rejects.toThrow(
      'Use today or an earlier date.',
    );
    await expect(actions.sellHolding(h.id, { ...sell, shares: 11 })).rejects.toThrow(
      'You only have 10 shares.',
    );
    await expect(actions.sellHolding(h.id, { ...sell, shares: 0 })).rejects.toThrow(
      'Sell at least a part of a share.',
    );
    await expect(actions.sellHolding(h.id, { ...sell, pricePerShareMinor: 0 })).rejects.toThrow(
      'Enter a price above 0.',
    );
    await expect(actions.sellHolding('nope', sell)).rejects.toThrow('That item no longer exists.');
    expect(tables().sale).toEqual([]);
    expect(holding(h.id)).toEqual(kept);
  });

  it('refuses a sale dated before the holding was bought, and takes one on the day it was', async () => {
    const { actions, tables, holding, h } = await withHolding();
    const kept = holding(h.id);
    await expect(actions.sellHolding(h.id, { ...sell, soldOn: '2026-09-30' })).rejects.toThrow(
      saleBeforePurchase('2026-10-01'),
    );
    await expect(actions.sellHolding(h.id, { ...sell, soldOn: '2026-09-30' })).rejects.toThrow(
      `The sale can't be before you bought it (${formatDay('2026-10-01')}).`,
    );
    expect(tables().sale).toEqual([]);
    expect(holding(h.id)).toEqual(kept);

    await actions.sellHolding(h.id, { ...sell, soldOn: '2026-10-01' });
    expect(tables().sale).toHaveLength(1);
  });

  describe('undoing a sale', () => {
    it('gives a partial sale its shares and cost back, and removes the record, in one write', async () => {
      const { actions, store, tables, holding, balances, h } = await withHolding();
      const before = balances();
      await actions.sellHolding(h.id, sell);
      const putMany = vi.spyOn(store.getState(), 'putMany');

      await actions.undoSale(tables().sale[0]!.id);

      expect(putMany).toHaveBeenCalledOnce();
      expect(tables().sale).toEqual([]);
      expect(holding(h.id)).toMatchObject({ shares: 10, costBasis: 500_00 });
      expect(balances()).toEqual(before);
    });

    it('adds to the holding as it is now, not as it was', async () => {
      const { actions, tables, holding, h } = await withHolding();
      await actions.sellHolding(h.id, sell);
      await actions.updateHolding(h.id, { shares: 8, costBasis: 400_00 });
      await actions.undoSale(tables().sale[0]!.id);
      expect(holding(h.id)).toMatchObject({ shares: 12, costBasis: 600_00 });
    });

    it('puts a fully sold holding back exactly as it was', async () => {
      const { actions, store, tables, holding, balances, h } = await withHolding();
      const before = balances();
      const was = holding(h.id);
      await actions.sellHolding(h.id, { ...sell, shares: 10 });
      const putMany = vi.spyOn(store.getState(), 'putMany');

      await actions.undoSale(tables().sale[0]!.id);

      expect(putMany).toHaveBeenCalledOnce();
      expect(tables().sale).toEqual([]);
      expect(tables().holding).toEqual([was]);
      expect(balances()).toEqual(before);
    });

    it('refuses when the holding is gone and the sale has nothing to restore', async () => {
      const { actions, tables, h } = await withHolding();
      await actions.sellHolding(h.id, sell);
      await actions.deleteHolding(h.id);
      const [sale] = tables().sale;

      await expect(actions.undoSale(sale!.id)).rejects.toThrow(
        "This sale can't be undone because its holding is gone.",
      );
      expect(tables().sale).toEqual([sale]);
      expect(tables().holding).toEqual([]);
    });

    it('asks for a later full sale to be undone first, then undoes both', async () => {
      const { actions, tables, holding, h } = await withHolding();
      await actions.sellHolding(h.id, sell);
      await actions.sellHolding(h.id, { ...sell, shares: 6 });
      const [partial, full] = tables().sale;
      expect(full!.restore).not.toBeNull();

      await expect(actions.undoSale(partial!.id)).rejects.toThrow(
        'Undo the later sale of KO first.',
      );
      expect(tables().sale).toEqual([partial, full]);
      expect(tables().holding).toEqual([]);

      await actions.undoSale(full!.id);
      await actions.undoSale(partial!.id);
      expect(tables().sale).toEqual([]);
      expect(holding(h.id)).toMatchObject({ shares: 10, costBasis: 500_00 });
    });

    it('refuses a sale that is not there', async () => {
      const { actions } = await withHolding();
      await expect(actions.undoSale('nope')).rejects.toThrow('That item no longer exists.');
    });
  });
});
