import { sharesText } from '@/lib/format';
import type { LocalDate } from './dates';
import type { Holding, Sale } from './entities';
import { costForShares, portfolio } from './portfolio';
import type { DataSnapshot } from './snapshot';

/** Half the last of the 4 decimals shares are shown to: a count within it of every share is all. */
const DUST = 5e-5;

/** What `planSale` says about a price that leaves no proceeds; the Sell dialog shows it at the price. */
export const NO_PROCEEDS = 'Enter a price above 0.';

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
  if (shares > h.shares + DUST) throw new Error(`You only have ${sharesText(h.shares)}.`);
  // A sale that would leave less than DUST sells all, so no unsellable sliver stays behind.
  const all = shares >= h.shares - DUST;
  const sold = all ? h.shares : shares;
  const cost = costForShares(h, sold);
  const proceeds = Math.round(sold * pricePerShareMinor);
  if (!(proceeds > 0)) throw new Error(NO_PROCEEDS);
  return { shares: sold, proceeds, cost, profit: proceeds - cost, all };
}

/** The day some of a holding's shares were first sold; undefined if none were. */
export function firstSoldOn(data: DataSnapshot, holdingId: string): LocalDate | undefined {
  return data.tables.sale
    .filter((s) => s.holdingId === holdingId)
    .map((s) => s.soldOn)
    .sort()[0];
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
