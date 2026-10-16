import { formatShares } from '@/lib/format';
import type { LocalDate } from './dates';
import type { Holding, Sale } from './entities';
import { costForShares, portfolio } from './portfolio';
import type { DataSnapshot } from './snapshot';

/** Selling this close to every share is selling every share: the rest is floating-point dust. */
const ALL = 1e-9;

export type SalePlan = {
  shares: number;
  proceeds: number;
  cost: number;
  profit: number;
  /** Every share is sold, so the holding goes. */
  all: boolean;
};

/**
 * What selling `shares` of a holding at `pricePerShareMinor` (profile minor units, unrounded) comes
 * to: the proceeds, the part of the cost basis those shares carried, and the profit. Selling all of
 * them sells exactly `h.shares` and carries exactly `h.costBasis`. Each amount is rounded once.
 * Refuses no shares, more than held, and a price that leaves no proceeds (a sale record needs some).
 */
export function planSale(h: Holding, shares: number, pricePerShareMinor: number): SalePlan {
  if (!(shares > 0)) throw new Error('Sell at least a part of a share.');
  if (shares > h.shares + ALL) throw new Error(`You only have ${formatShares(h.shares)} shares.`);
  const all = shares >= h.shares - ALL;
  const sold = all ? h.shares : shares;
  const cost = costForShares(h, sold);
  const proceeds = Math.round(sold * pricePerShareMinor);
  if (!(proceeds > 0)) throw new Error('Enter a price above 0.');
  return { shares: sold, proceeds, cost, profit: proceeds - cost, all };
}

/** What the sales made over their cost, added up. */
export function realisedProfit(data: DataSnapshot): number {
  return data.tables.sale.reduce((sum, s) => sum + s.proceeds - s.cost, 0);
}

/**
 * Everything made on the investments, in minor units: the gain on what is held (the priced
 * holdings), the profit on what was sold, and every dividend received, reinvested ones included.
 */
export function profitAndLoss(
  data: DataSnapshot,
  profileCurrency: string,
): { held: number; sales: number; dividends: number; total: number } {
  const held = portfolio(data, profileCurrency).gain;
  const sales = realisedProfit(data);
  const dividends = data.tables.dividend
    .filter((d) => d.status === 'confirmed')
    .reduce((sum, d) => sum + d.amount, 0);
  return { held, sales, dividends, total: held + sales + dividends };
}

export type SoldGroup = {
  symbol: string;
  name: string;
  type: Sale['type'];
  shares: number;
  proceeds: number;
  cost: number;
  profit: number;
  lastSoldOn: LocalDate;
};

/** The sales added up by symbol, the symbol sold most recently first; its name and type are the latest sale's. */
export function soldGroups(data: DataSnapshot): SoldGroup[] {
  const newestFirst = [...data.tables.sale].sort(
    (a, b) => b.soldOn.localeCompare(a.soldOn) || b.createdAt.localeCompare(a.createdAt),
  );
  const groups = new Map<string, SoldGroup>();
  for (const s of newestFirst) {
    const g = groups.get(s.symbol);
    if (!g) {
      groups.set(s.symbol, {
        symbol: s.symbol,
        name: s.name,
        type: s.type,
        shares: s.shares,
        proceeds: s.proceeds,
        cost: s.cost,
        profit: s.proceeds - s.cost,
        lastSoldOn: s.soldOn,
      });
    } else {
      g.shares += s.shares;
      g.proceeds += s.proceeds;
      g.cost += s.cost;
      g.profit += s.proceeds - s.cost;
    }
  }
  return [...groups.values()];
}
