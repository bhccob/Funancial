import { describe, expect, it } from 'vitest';
import { makeDividend, makeHolding, makeProfile, makeSettings } from '@/test/fixtures';
import type { Holding } from './entities';
import {
  allocation,
  breakEven,
  convertPortfolio,
  costForShares,
  costPerShare,
  holdingPrice,
  holdingValue,
  investRate,
  portfolio,
} from './portfolio';
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
    expect(allocation(rowsOf(holdings))).toEqual([
      { key: 'id-A', label: 'A', amount: 700 },
      { key: 'id-B', label: 'B', amount: 600 },
      { key: 'id-C', label: 'C', amount: 500 },
      { key: 'id-D', label: 'D', amount: 400 },
      { key: 'id-E', label: 'E', amount: 300 },
      { key: 'other', label: 'Other', amount: 300 },
    ]);
  });

  it('is empty when nothing is priced', () => {
    expect(allocation(rowsOf([held('X', 'stock', null, 0, { quote: null })]))).toEqual([]);
  });
});

describe('investRate', () => {
  const fx = { currency: 'USD', rate: 1.1, asOf: '2026-10-16T10:00:00.000Z' };
  const settings = (investCurrency: string | null, investFx: typeof fx | null) =>
    makeSettings({ investCurrency, investFx });

  it('is the stored rate while Invest is shown in the currency it is for', () => {
    expect(investRate(settings('USD', fx), 'EUR')).toBe(1.1);
  });

  it('is nothing when Invest shows the profile currency, because none or the same was chosen', () => {
    expect(investRate(settings(null, fx), 'EUR')).toBeNull();
    expect(investRate(settings('EUR', null), 'EUR')).toBeNull();
    expect(investRate(settings('EUR', { ...fx, currency: 'EUR' }), 'EUR')).toBeNull();
    expect(investRate(undefined, 'EUR')).toBeNull();
  });

  it('is nothing until the rate for the chosen currency has loaded', () => {
    expect(investRate(settings('USD', null), 'EUR')).toBeNull();
    // A rate left from another choice is not this one's.
    expect(investRate(settings('GBP', fx), 'EUR')).toBeNull();
  });
});

describe('convertPortfolio', () => {
  const at = (rate: number) => (minor: number) => Math.round(minor * rate);
  /** Worth EUR 600.04 for EUR 500.05, up EUR 10.03 today. */
  const twin = (id: string, extra: Partial<Holding> = {}) =>
    makeHolding({
      id,
      symbol: id,
      currency: 'EUR',
      shares: 1,
      costBasis: 500_05,
      quote: quote(600.04, { previousClose: 590.01, fxRate: 1 }),
      ...extra,
    });
  const euros = (...holdings: Holding[]) => portfolio(dataOf(holdings, 'EUR'), 'EUR');

  it('converts each row once and adds the totals up from the converted rows', () => {
    const p = euros(twin('A'), twin('B'));
    const shown = convertPortfolio(p, at(1.1));
    // 60004 x 1.1 = 66004.4 for each row, 132008 for both; 120008 x 1.1 on its own is 132009.
    expect(shown.rows.map((r) => r.value)).toEqual([66_004, 66_004]);
    expect(shown.value).toBe(132_008);
    expect(shown.value).not.toBe(at(1.1)(p.value));
    // 50005 x 1.1 = 55005.5, so 55006 for each.
    expect(shown.cost).toBe(110_012);
    expect(shown.gain).toBe(shown.value - shown.cost);
    expect(shown.rows.map((r) => r.gain)).toEqual([66_004 - 55_006, 66_004 - 55_006]);
    // 1003 x 1.1 = 1103.3 for each row.
    expect(shown.rows.map((r) => r.dayChange)).toEqual([1_103, 1_103]);
    expect(shown.dayChange).toBe(2_206);
  });

  it('leaves the percentages, the counts and the holdings as they were', () => {
    const p = euros(twin('A'), twin('B', { costBasis: 400_00 }), twin('C', { quote: null }));
    const shown = convertPortfolio(p, at(1.1));
    expect(shown.gainPct).toBe(p.gainPct);
    expect(shown.rows.map((r) => r.gainPct)).toEqual(p.rows.map((r) => r.gainPct));
    expect(shown.unpriced).toBe(1);
    expect(shown.rows.map((r) => r.holding)).toEqual(p.rows.map((r) => r.holding));
  });

  it('keeps a holding with no price out of the totals, with no value and no gain', () => {
    const shown = convertPortfolio(euros(twin('A'), twin('C', { quote: null })), at(1.1));
    const [, unpriced] = shown.rows;
    expect(unpriced).toMatchObject({ value: null, gain: null, dayChange: null });
    expect(shown.value).toBe(66_004);
    expect(shown.cost).toBe(55_006);
  });

  it('names the best and the worst among the converted rows', () => {
    const p = euros(twin('A'), twin('B', { costBasis: 400_00 }), twin('C', { costBasis: 700_00 }));
    const shown = convertPortfolio(p, at(1.1));
    expect(shown.best).toBe(shown.rows.find((r) => r.holding.id === p.best!.holding.id));
    expect(shown.worst).toBe(shown.rows.find((r) => r.holding.id === p.worst!.holding.id));
    expect(shown.best?.value).toBe(66_004);
  });

  it('changes nothing when the amounts are not converted', () => {
    const p = euros(twin('A'), twin('B', { costBasis: 400_00 }), twin('C', { quote: null }));
    expect(convertPortfolio(p, (minor) => minor)).toEqual(p);
  });
});

describe('costPerShare and costForShares', () => {
  const three = makeHolding({ shares: 3, costBasis: 100_00 });

  it('costPerShare is the unrounded average cost, in minor units per share', () => {
    expect(costPerShare(makeHolding({ shares: 10, costBasis: 500_00 }))).toBe(50_00);
    expect(costPerShare(three)).toBeCloseTo(3333.3333333, 6);
    expect(costPerShare(makeHolding({ shares: 0.5, costBasis: 0 }))).toBe(0);
  });

  it('costForShares is exactly the cost basis for all the shares', () => {
    expect(costForShares(three, 3)).toBe(100_00);
    const odd = makeHolding({ shares: 0.1 + 0.2, costBasis: 12_345 });
    expect(costForShares(odd, odd.shares)).toBe(12_345);
  });

  it('costForShares rounds once, not per share', () => {
    expect(costForShares(three, 1)).toBe(3_333);
    // 3 × the rounded per-share cost would be 6_666.
    expect(costForShares(three, 2)).toBe(6_667);
    expect(costForShares(three, 0.5)).toBe(1_667);
    expect(costForShares(three, 4)).toBe(13_333);
  });
});

describe('breakEven', () => {
  const ko = makeHolding({ id: 'ko', shares: 10, costBasis: 500_00 });
  const paid = (over: Parameters<typeof makeDividend>[0]) =>
    makeDividend({ holdingId: 'ko', status: 'confirmed', ...over });

  function withDividends(...dividends: ReturnType<typeof makeDividend>[]) {
    const data = dataOf([ko]);
    data.tables.dividend = dividends;
    return data;
  }

  it('is the average cost per share, with no dividends to bring it down', () => {
    expect(breakEven(dataOf([ko]), ko)).toEqual({ perShare: 50_00, afterDividends: 50_00 });
  });

  it('takes every confirmed dividend of the holding off the cost, reinvested ones too', () => {
    const data = withDividends(
      paid({ amount: 10_00, bucket: 'cash' }),
      paid({ amount: 8_50, bucket: 'reinvest', sharesAdded: 0.1 }),
      paid({ amount: 11_50, bucket: 'passive' }),
    );
    // (500.00 − 30.00) ÷ 10 shares
    expect(breakEven(data, ko)).toEqual({ perShare: 50_00, afterDividends: 47_00 });
  });

  it('ignores skipped payouts and the payouts of other holdings', () => {
    const data = withDividends(
      paid({ amount: 0, status: 'skipped', bucket: null }),
      makeDividend({ holdingId: 'other', amount: 99_00 }),
      paid({ amount: 5_00 }),
    );
    expect(breakEven(data, ko).afterDividends).toBe(49_50);
  });

  it('never goes below zero', () => {
    const data = withDividends(paid({ amount: 800_00 }));
    expect(breakEven(data, ko)).toEqual({ perShare: 50_00, afterDividends: 0 });
  });

  it('keeps both values unrounded', () => {
    const three = makeHolding({ id: 'ko', shares: 3, costBasis: 100_00 });
    const data = dataOf([three]);
    data.tables.dividend = [paid({ amount: 1_00 })];
    expect(breakEven(data, three).perShare).toBeCloseTo(3333.3333333, 6);
    expect(breakEven(data, three).afterDividends).toBeCloseTo(3300, 9);
  });
});
