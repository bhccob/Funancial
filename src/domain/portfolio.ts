import type { Slice } from './charts';
import type { Holding, Settings } from './entities';
import { minorDigits } from './money';
import type { DataSnapshot } from './snapshot';

/**
 * What Invest converts its profile-currency amounts at: the rate for the chosen currency, or null
 * when it is shown in the profile currency (none chosen, the same one, or its rate has not loaded).
 */
export function investRate(
  settings: Pick<Settings, 'investCurrency' | 'investFx'> | undefined,
  profileCurrency: string,
): number | null {
  const chosen = settings?.investCurrency ?? null;
  const fx = settings?.investFx ?? null;
  return chosen !== null && chosen !== profileCurrency && fx?.currency === chosen ? fx.rate : null;
}

/** The price to value a holding at: the person's own, else the last quote. */
export function holdingPrice(h: Holding): number | null {
  return h.manualPrice ?? h.quote?.price ?? null;
}

/** What one unit of the holding's currency is worth in the profile currency; null when unknown. */
export function holdingRate(h: Holding, profileCurrency: string): number | null {
  return h.currency === profileCurrency ? 1 : (h.quote?.fxRate ?? null);
}

/**
 * `amount` of the holding's currency as whole minor units of the profile currency, rounded once.
 * The `+ 0` turns a rounded -0 into 0, which would otherwise print as "-$0.00".
 */
export function toMinor(amount: number, rate: number, profileCurrency: string): number {
  return Math.round(amount * rate * 10 ** minorDigits(profileCurrency)) + 0;
}

/** What one share cost on average, in minor units of the profile currency, unrounded: the break-even price. */
export function costPerShare(h: Holding): number {
  return h.costBasis / h.shares;
}

/**
 * The part of the cost basis that `shares` of the holding carry, rounded once. All the shares carry
 * the cost basis exactly, whatever the division would round to.
 */
export function costForShares(h: Holding, shares: number): number {
  return shares === h.shares ? h.costBasis : Math.round((h.costBasis * shares) / h.shares);
}

/**
 * What one share must sell for to get the money back, in minor units of the profile currency, both
 * unrounded: `perShare` is the average cost, `afterDividends` also takes off what the holding has
 * paid out so far (every confirmed dividend, reinvested ones too) and is never below zero.
 */
export function breakEven(
  data: DataSnapshot,
  h: Holding,
): { perShare: number; afterDividends: number } {
  const received = data.tables.dividend
    .filter((d) => d.holdingId === h.id && d.status === 'confirmed')
    .reduce((sum, d) => sum + d.amount, 0);
  return {
    perShare: costPerShare(h),
    afterDividends: Math.max(0, h.costBasis - received) / h.shares,
  };
}

/** What the holding is worth in minor units of the profile currency; null when no price or rate. */
export function holdingValue(h: Holding, profileCurrency: string): number | null {
  const price = holdingPrice(h);
  const rate = holdingRate(h, profileCurrency);
  return price === null || rate === null ? null : toMinor(h.shares * price, rate, profileCurrency);
}

/** Today's move from the quote alone: a manual price is the person's, so it has no day change. */
function holdingDayChange(h: Holding, profileCurrency: string): number | null {
  const rate = holdingRate(h, profileCurrency);
  const quote = h.quote;
  if (h.manualPrice !== null || !quote || quote.previousClose === null || rate === null) {
    return null;
  }
  return toMinor(h.shares * (quote.price - quote.previousClose), rate, profileCurrency);
}

export type HoldingRow = {
  holding: Holding;
  value: number | null;
  gain: number | null;
  /** Percent of the cost; null without a value or without a cost. */
  gainPct: number | null;
  dayChange: number | null;
};

export type Portfolio = {
  rows: HoldingRow[];
  value: number;
  cost: number;
  gain: number;
  gainPct: number | null;
  dayChange: number;
  /** Holdings left out of the totals for want of a price or an exchange rate. */
  unpriced: number;
  best: HoldingRow | null;
  worst: HoldingRow | null;
};

/**
 * Every holding as a row, and the totals of the rows that have a value. Each row is rounded once,
 * so a total is always the sum of the rows shown (`convertPortfolio` keeps that in another currency).
 */
export function portfolio(data: DataSnapshot, profileCurrency: string): Portfolio {
  const rows = data.tables.holding.map((holding): HoldingRow => {
    const value = holdingValue(holding, profileCurrency);
    const gain = value === null ? null : value - holding.costBasis;
    return {
      holding,
      value,
      gain,
      gainPct: gain === null || holding.costBasis === 0 ? null : (gain * 100) / holding.costBasis,
      dayChange: holdingDayChange(holding, profileCurrency),
    };
  });

  const priced = rows.filter((r) => r.value !== null);
  const value = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const cost = priced.reduce((sum, r) => sum + r.holding.costBasis, 0);
  const ranked = rows
    .filter((r): r is HoldingRow & { gainPct: number } => r.gainPct !== null)
    .sort((a, b) => b.gainPct - a.gainPct);

  return {
    rows,
    value,
    cost,
    gain: value - cost,
    gainPct: cost === 0 ? null : ((value - cost) * 100) / cost,
    dayChange: rows.reduce((sum, r) => sum + (r.dayChange ?? 0), 0),
    unpriced: rows.length - priced.length,
    best: ranked.length >= 2 ? ranked[0]! : null,
    worst: ranked.length >= 2 ? ranked[ranked.length - 1]! : null,
  };
}

/**
 * The portfolio as Invest shows it in another currency. Each row's value, day change and cost are
 * converted once, and the totals, the gains and the cost are made from those converted rows, so
 * what is shown adds up: the total is the sum of the rows, and a gain is the value less what was
 * paid, both as shown. The percentages come from the profile-currency amounts and do not change.
 * The rows keep their holdings, whose cost is still in the profile currency.
 */
export function convertPortfolio(p: Portfolio, convert: (minor: number) => number): Portfolio {
  const rows = p.rows.map((row): HoldingRow => {
    const value = row.value === null ? null : convert(row.value);
    return {
      ...row,
      value,
      gain: value === null ? null : value - convert(row.holding.costBasis),
      dayChange: row.dayChange === null ? null : convert(row.dayChange),
    };
  });
  const priced = rows.filter((r) => r.value !== null);
  const value = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const cost = priced.reduce((sum, r) => sum + convert(r.holding.costBasis), 0);
  const shown = (row: HoldingRow | null) =>
    row && rows.find((r) => r.holding.id === row.holding.id)!;
  return {
    ...p,
    rows,
    value,
    cost,
    gain: value - cost,
    dayChange: rows.reduce((sum, r) => sum + (r.dayChange ?? 0), 0),
    best: shown(p.best),
    worst: shown(p.worst),
  };
}

export const TYPE_LABELS: Record<Holding['type'], string> = {
  stock: 'Stocks',
  etf: 'ETFs',
  other: 'Other',
};

/**
 * What the priced holdings are worth, one slice each and highest first. The `top` biggest are
 * kept; the rest fold into one "Other" slice (key `other`) at the end.
 */
export function allocation(rows: HoldingRow[], top = 5): Slice[] {
  const sorted: Slice[] = rows
    .flatMap((r) =>
      r.value === null ? [] : [{ key: r.holding.id, label: r.holding.symbol, amount: r.value }],
    )
    .sort((a, b) => b.amount - a.amount);
  const slices = sorted.slice(0, top);
  const folded = sorted.slice(top).reduce((sum, s) => sum + s.amount, 0);
  if (folded > 0) slices.push({ key: 'other', label: 'Other', amount: folded });
  return slices;
}
