import { describe, expect, it } from 'vitest';
import { makeHolding, makeProfile } from '@/test/fixtures';
import type { Holding } from './entities';
import { allocation, holdingPrice, holdingValue, portfolio } from './portfolio';
import { emptySnapshot } from './snapshot';

type Quote = NonNullable<Holding['quote']>;
const quote = (price: number, extra: Partial<Quote> = {}): Quote => ({
  price,
  previousClose: null,
  fxRate: null,
  asOf: '2026-10-16T10:00:00.000Z',
  ...extra,
});

function dataOf(holdings: Holding[], currency = 'USD') {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency })];
  data.tables.holding = holdings;
  return data;
}

describe('holdingPrice and holdingValue', () => {
  it('prefers the manual price, then the quote, else nothing', () => {
    expect(holdingPrice(makeHolding({ manualPrice: 70, quote: quote(60) }))).toBe(70);
    expect(holdingPrice(makeHolding({ manualPrice: null, quote: quote(60) }))).toBe(60);
    expect(holdingPrice(makeHolding({ manualPrice: null, quote: null }))).toBeNull();
  });

  it('values a USD holding in EUR with the stored rate and rounds once', () => {
    // 10 × 100.005 × 0.92 = 920.046 EUR; rounding the price or rate first would give 920.09 / 920.00.
    const h = makeHolding({ currency: 'USD', shares: 10, quote: quote(100.005, { fxRate: 0.92 }) });
    expect(holdingValue(h, 'EUR')).toBe(92_005);
  });

  it('needs no rate when the holding is in the profile currency', () => {
    const h = makeHolding({ currency: 'USD', shares: 2, quote: quote(10.4, { fxRate: null }) });
    expect(holdingValue(h, 'USD')).toBe(20_80);
  });

  it('uses the currency’s own minor units', () => {
    const h = makeHolding({ currency: 'JPY', shares: 2, quote: quote(10.4) });
    expect(holdingValue(h, 'JPY')).toBe(21);
  });

  it('is null without a price, or without a rate for another currency', () => {
    expect(holdingValue(makeHolding({ quote: null }), 'USD')).toBeNull();
    const noRate = makeHolding({ currency: 'USD', quote: quote(10, { fxRate: null }) });
    expect(holdingValue(noRate, 'EUR')).toBeNull();
  });

  it('converts a manual price with the quote’s rate', () => {
    const h = makeHolding({
      currency: 'USD',
      shares: 10,
      manualPrice: 70,
      quote: quote(60, { fxRate: 0.9 }),
    });
    expect(holdingValue(h, 'EUR')).toBe(630_00);
  });
});

describe('portfolio', () => {
  it('leaves a holding with no rate out of the totals and counts it as unpriced', () => {
    const priced = makeHolding({ shares: 10, costBasis: 500_00, quote: quote(60) });
    const noRate = makeHolding({
      currency: 'GBP',
      shares: 5,
      costBasis: 900_00,
      quote: quote(100, { fxRate: null }),
    });
    const noQuote = makeHolding({ quote: null, costBasis: 123_00 });
    const p = portfolio(dataOf([priced, noRate, noQuote]), 'USD');
    expect(p.rows.map((r) => r.value)).toEqual([600_00, null, null]);
    expect(p).toMatchObject({
      value: 600_00,
      cost: 500_00,
      gain: 100_00,
      gainPct: 20,
      unpriced: 2,
    });
    expect(p.rows[1]).toMatchObject({ gain: null, gainPct: null, dayChange: null });
  });

  it('totals equal the sum of rounded row values for fractional shares and tiny prices', () => {
    const tiny = () => makeHolding({ shares: 0.1234, costBasis: 0, quote: quote(0.0123) });
    const holdings = [
      tiny(),
      makeHolding({ shares: 3.5, costBasis: 0, quote: quote(4321.5) }),
      makeHolding({ shares: 10, costBasis: 0, quote: quote(99.995) }),
      tiny(),
      tiny(),
      tiny(),
      tiny(),
    ];
    const p = portfolio(dataOf(holdings), 'USD');
    const sum = p.rows.reduce((s, r) => s + (r.value ?? 0), 0);
    expect(p.rows.map((r) => r.value)).toEqual([0, 1_512_525, 99_995, 0, 0, 0, 0]);
    // The five tiny rows are 0.15 cents each: 0 as rows, but 1 if the unrounded total were rounded.
    expect(p.value).toBe(sum);
    expect(p.value).toBe(1_612_520);
    expect(p.gain).toBe(p.value - p.cost);
  });

  it('has no percentage gain without a cost', () => {
    const p = portfolio(dataOf([makeHolding({ costBasis: 0, quote: quote(10) })]), 'USD');
    expect(p.rows[0]).toMatchObject({ gain: 100_00, gainPct: null });
    expect(p.gainPct).toBeNull();
  });

  it('uses a manual price over the quote, and skips day change for manual prices', () => {
    const manual = makeHolding({
      shares: 10,
      costBasis: 500_00,
      manualPrice: 70,
      quote: quote(60, { previousClose: 50 }),
    });
    const quoted = makeHolding({
      shares: 10,
      costBasis: 500_00,
      quote: quote(60, { previousClose: 58 }),
    });
    const p = portfolio(dataOf([manual, quoted]), 'USD');
    expect(p.rows[0]).toMatchObject({ value: 700_00, gain: 200_00, dayChange: null });
    expect(p.rows[1]).toMatchObject({ value: 600_00, dayChange: 20_00 });
    expect(p.dayChange).toBe(20_00);
  });

  it('converts and rounds each holding’s day change on its own', () => {
    // 3 × (10.07 − 10) × 0.9 = 0.189 EUR, so 19 cents.
    const h = makeHolding({
      currency: 'USD',
      shares: 3,
      quote: quote(10.07, { previousClose: 10, fxRate: 0.9 }),
    });
    expect(portfolio(dataOf([h], 'EUR'), 'EUR').rows[0]!.dayChange).toBe(19);
    const noPrevious = makeHolding({ quote: quote(10) });
    expect(portfolio(dataOf([noPrevious]), 'USD').rows[0]!.dayChange).toBeNull();
  });

  it('names the best and worst holding by percentage, from two priced rows up', () => {
    const up = makeHolding({ symbol: 'UP', shares: 1, costBasis: 100_00, quote: quote(120) });
    const flat = makeHolding({ symbol: 'FLAT', shares: 1, costBasis: 100_00, quote: quote(100) });
    const down = makeHolding({ symbol: 'DOWN', shares: 1, costBasis: 100_00, quote: quote(80) });
    const lone = portfolio(dataOf([up]), 'USD');
    expect([lone.best, lone.worst]).toEqual([null, null]);
    const p = portfolio(dataOf([flat, up, down]), 'USD');
    expect(p.best?.holding.symbol).toBe('UP');
    expect(p.worst?.holding.symbol).toBe('DOWN');
  });

  it('is empty for no holdings', () => {
    expect(portfolio(dataOf([]), 'USD')).toEqual({
      rows: [],
      value: 0,
      cost: 0,
      gain: 0,
      gainPct: null,
      dayChange: 0,
      unpriced: 0,
      best: null,
      worst: null,
    });
  });
});

describe('allocation', () => {
  const held = (
    symbol: string,
    type: Holding['type'],
    sector: string | null,
    price: number,
    over: Partial<Holding> = {},
  ) => makeHolding({ symbol, type, sector, shares: 1, quote: quote(price), ...over });

  const rowsOf = (holdings: Holding[]) => portfolio(dataOf(holdings), 'USD').rows;

  it('allocates by holding, top five then Other, priced rows only', () => {
    const holdings = [
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) =>
        held(s, 'stock', null, 7 - i, { id: `id-${s}` }),
      ),
      held('NOPRICE', 'stock', null, 0, { quote: null }),
    ];
    expect(allocation(rowsOf(holdings), 'holding')).toEqual([
      { key: 'id-A', label: 'A', amount: 700 },
      { key: 'id-B', label: 'B', amount: 600 },
      { key: 'id-C', label: 'C', amount: 500 },
      { key: 'id-D', label: 'D', amount: 400 },
      { key: 'id-E', label: 'E', amount: 300 },
      { key: 'other', label: 'Other', amount: 300 },
    ]);
  });

  it('allocates by type and by sector, with ETFs as "ETF (diversified)"', () => {
    const rows = rowsOf([
      held('VWRL', 'etf', 'Whatever', 40),
      held('AAPL', 'stock', 'Technology', 30),
      held('MSFT', 'stock', 'Technology', 20),
      held('KO', 'stock', 'Consumer Defensive', 10),
      held('XYZ', 'other', null, 5),
    ]);
    expect(allocation(rows, 'type').map((s) => [s.key, s.label, s.amount])).toEqual([
      ['stock', 'Stocks', 6000],
      ['etf', 'ETFs', 4000],
      ['other', 'Other', 500],
    ]);
    expect(allocation(rows, 'sector').map((s) => [s.label, s.amount])).toEqual([
      ['Technology', 5000],
      ['ETF (diversified)', 4000],
      ['Consumer Defensive', 1000],
      ['Unknown', 500],
    ]);
  });

  it('is empty when nothing is priced', () => {
    expect(allocation(rowsOf([held('X', 'stock', null, 0, { quote: null })]), 'type')).toEqual([]);
  });
});
