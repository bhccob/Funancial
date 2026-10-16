import type { StoreApi } from 'zustand/vanilla';
import type { LocalDate } from '@/domain/dates';
import type { ExpectedPayout } from '@/domain/dividends';
import {
  defaultSettings,
  type Dividend,
  type Holding,
  type Sale,
  type Transaction,
} from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';
import { minorDigits } from '@/domain/money';
import { holdingPrice, holdingRate } from '@/domain/portfolio';
import { firstSoldOn, planSale, type SalePlan } from '@/domain/sales';
import type { TableRecord } from '@/domain/snapshot';
import { formatDay } from '@/lib/format';
import { marketConfigured, type Market } from '@/services/market';
import type { AppState } from './appStore';
import { FUTURE } from './financeActions';

/** What `addHolding` says when the price service cannot name a symbol and none was typed in. */
export const UNKNOWN_SYMBOL =
  "We couldn't find that symbol. Check it, or enter the name and currency yourself.";
const NO_PRICE =
  'Reinvesting needs a price for this holding. Refresh prices or set a manual price.';
const NO_RATE = 'Reinvesting needs an exchange rate for this holding. Refresh prices first.';
/** What `deleteDividend` says when taking a reinvested payout's shares back would leave none. */
export const SHARES_GONE =
  'The holding has fewer shares than this dividend bought. Edit the holding first.';
/** What `confirmDividend` and the confirm dialog say to reinvesting a payout of a fully sold holding. */
export const SOLD_NO_REINVEST =
  "This holding was sold, so the dividend can't be reinvested. Choose where the money went.";
/** What a sale dated before the holding was bought is told, by `sellHolding` and by the Sell dialog alike. */
export const saleBeforePurchase = (purchaseDate: LocalDate) =>
  `The sale can't be before you bought it (${formatDay(purchaseDate)}).`;
/** What a purchase date after a sale is told, by `updateHolding` and by the holding dialog alike. */
export const purchaseAfterSale = (soldOn: LocalDate) =>
  `You sold some of these on ${formatDay(soldOn)}, so the purchase date can't be later.`;
/** A currency code a holding can take; a quote with anything else keeps the holding's own. */
const CURRENCY = /^[A-Z]{3}$/;
/** A holding's dividend history is fetched again once it is older than this. */
const DIVIDENDS_MAX_AGE_MS = 24 * 3_600_000;

export type RefreshResult = 'ok' | 'not configured' | 'failed';

export interface HoldingInput {
  symbol: string;
  shares: number;
  /** What the person paid in total, in the profile currency. */
  costBasis: number;
  purchaseDate: LocalDate;
  /** `owned`: bought before using the app, so no money moves. */
  paidFrom: 'owned' | 'cash' | 'savings';
  withholdingPct: number;
  /** Used when the price service gives no profile for the symbol. */
  name?: string;
  type?: Holding['type'];
  currency?: string;
}
export type HoldingPatch = Partial<
  Pick<
    Holding,
    | 'name'
    | 'type'
    | 'currency'
    | 'shares'
    | 'costBasis'
    | 'purchaseDate'
    | 'withholdingPct'
    | 'manualPrice'
  >
>;
export interface DividendInput {
  /** What arrived after tax, in minor units of the profile currency. */
  amount: number;
  paidOn: LocalDate;
  bucket: NonNullable<Dividend['bucket']>;
}

export interface SaleInput {
  shares: number;
  /** What one share sold for, in minor units of the profile currency; the proceeds round it once. */
  pricePerShareMinor: number;
  soldOn: LocalDate;
  /** Where the money goes. */
  to: Sale['to'];
}

export type InvestActions = ReturnType<typeof createInvestActions>;

/** Builds holdings and payouts from form input, and keeps them in step with the price service. */
export function createInvestActions(store: StoreApi<AppState>, market: Market) {
  const state = () => store.getState();
  const holdings = () => state().data.tables.holding;
  const profileCurrency = () => state().data.tables.profile[0]?.currency ?? 'USD';
  const stamp = () => {
    const t = nowIso();
    return { createdAt: t, updatedAt: t };
  };
  const notFuture = (d: LocalDate) => {
    if (d > state().today) throw new Error(FUTURE);
  };
  function find(id: string): Holding {
    const holding = holdings().find((h) => h.id === id);
    if (!holding) throw new Error('That item no longer exists.');
    return holding;
  }

  /** One id per payout, so asking for it twice at once writes the same record, not two. */
  const payoutId = (p: ExpectedPayout) => `${p.holding.id}:${p.payDate}`;
  const settledBefore = (p: ExpectedPayout) =>
    state().data.tables.dividend.some(
      (d) => d.holdingId === p.holding.id && d.expectedPayDate === p.payDate,
    );
  const payoutRecord = (
    p: ExpectedPayout,
    outcome: Pick<Dividend, 'paidOn' | 'status' | 'amount' | 'bucket' | 'sharesAdded'>,
  ): Dividend => ({
    id: payoutId(p),
    ...stamp(),
    holdingId: p.holding.id,
    symbol: p.holding.symbol,
    expectedPayDate: p.payDate,
    ...outcome,
  });

  const actions = {
    async addHolding(input: HoldingInput): Promise<Holding> {
      notFuture(input.purchaseDate);
      const symbol = input.symbol.trim().toUpperCase();
      const profile = marketConfigured()
        ? await market.fetchProfile(symbol).catch(() => null)
        : null;
      const name = profile?.name ?? input.name?.trim();
      const currency = profile?.currency ?? input.currency?.trim().toUpperCase();
      if (!name || !currency) throw new Error(UNKNOWN_SYMBOL);

      const holding: Holding = {
        id: newId(),
        ...stamp(),
        symbol,
        name,
        type: profile?.type ?? input.type ?? 'stock',
        exchange: profile?.exchange ?? null,
        sector: profile?.sector ?? null,
        currency,
        shares: input.shares,
        costBasis: input.costBasis,
        purchaseDate: input.purchaseDate,
        withholdingPct: input.withholdingPct,
        manualPrice: null,
        quote: null,
        dividendInfo: null,
        checkedAt: null,
      };
      const items: TableRecord[] = [{ table: 'holding', record: holding }];
      if (input.paidFrom !== 'owned') {
        const purchase: Transaction = {
          id: newId(),
          ...stamp(),
          type: 'investment',
          amount: input.costBasis,
          date: input.purchaseDate,
          from: input.paidFrom,
          to: null,
          debtId: null,
          note: `Bought ${symbol}`,
        };
        items.push({ table: 'transaction', record: purchase });
      }
      await state().putMany(items);
      return holding;
    },

    async updateHolding(id: string, patch: HoldingPatch) {
      const holding = find(id);
      if (patch.purchaseDate) {
        notFuture(patch.purchaseDate);
        const soldOn = firstSoldOn(state().data, id);
        if (soldOn && patch.purchaseDate > soldOn) throw new Error(purchaseAfterSale(soldOn));
      }
      await state().put('holding', {
        ...holding,
        ...patch,
        // A price in the old currency would be shown as if it were in the new one.
        quote: patch.currency && patch.currency !== holding.currency ? null : holding.quote,
        updatedAt: nowIso(),
      });
    },

    /** Its dividend records and the transaction that paid for it stay: they are money that moved. */
    deleteHolding: (id: string) => state().remove('holding', id),

    /**
     * Sells shares of a holding, in one write. A partial sale leaves the holding with the shares and
     * cost basis the sold ones did not carry. Selling every share removes the holding, and the sale
     * keeps it as it was, so `undoSale` can bring it back. The proceeds count in the bucket they went
     * to from the sale date (`bucketBalances`). Returns what the sale came to.
     */
    async sellHolding(id: string, input: SaleInput): Promise<SalePlan> {
      notFuture(input.soldOn);
      const holding = find(id);
      if (input.soldOn < holding.purchaseDate)
        throw new Error(saleBeforePurchase(holding.purchaseDate));
      const plan = planSale(holding, input.shares, input.pricePerShareMinor);
      const sale: Sale = {
        id: newId(),
        ...stamp(),
        holdingId: holding.id,
        symbol: holding.symbol,
        name: holding.name,
        type: holding.type,
        shares: plan.shares,
        proceeds: plan.proceeds,
        cost: plan.cost,
        soldOn: input.soldOn,
        to: input.to,
        restore: plan.all ? holding : null,
      };
      const items: TableRecord[] = [{ table: 'sale', record: sale }];
      if (!plan.all) {
        items.push({
          table: 'holding',
          record: {
            ...holding,
            shares: holding.shares - plan.shares,
            costBasis: holding.costBasis - plan.cost,
            updatedAt: nowIso(),
          },
        });
      }
      await state().putMany(items, plan.all ? [{ table: 'holding', id }] : []);
      return plan;
    },

    /**
     * Takes a sale back, in one write: its shares and cost go back to the holding if it is still held,
     * else the holding a full sale removed comes back as it was. A sale whose holding was deleted
     * since, with nothing stored to restore, cannot be undone; one made before a later full sale
     * waits for that sale to be undone first.
     */
    async undoSale(id: string) {
      const sale = state().data.tables.sale.find((s) => s.id === id);
      if (!sale) throw new Error('That item no longer exists.');
      const holding = holdings().find((h) => h.id === sale.holdingId);
      let back: Holding;
      if (holding) {
        back = {
          ...holding,
          shares: holding.shares + sale.shares,
          costBasis: holding.costBasis + sale.cost,
          updatedAt: nowIso(),
        };
      } else if (sale.restore) {
        back = sale.restore;
      } else if (
        state().data.tables.sale.some((s) => s.holdingId === sale.holdingId && s.restore)
      ) {
        throw new Error(`Undo the later sale of ${sale.symbol} first.`);
      } else {
        throw new Error("This sale can't be undone because its holding is gone.");
      }
      await state().putMany([{ table: 'holding', record: back }], [{ table: 'sale', id }]);
    },

    /**
     * Fetches quotes, exchange rates and stale dividend info, and saves them in one write, with the
     * rate Invest is shown at when a currency is chosen for it. A holding the service has nothing
     * new for keeps its last values, and so does the Invest rate. It never throws: `failed` is the
     * quotes not arriving (or not saving), or the profile currency changing meanwhile, and then
     * nothing is written.
     */
    async refreshMarket(): Promise<RefreshResult> {
      if (!marketConfigured()) return 'not configured';
      try {
        const home = profileCurrency();
        const asked = holdings();
        // The currency Invest is shown in, when it is not the profile's: its rate is fetched too.
        const chosen = state().data.tables.settings[0]?.investCurrency;
        const shownIn = chosen && chosen !== home ? chosen : null;
        if (asked.length === 0 && !shownIn) return 'ok';
        const symbols = [...new Set(asked.map((h) => h.symbol))];
        const stale = asked.filter(
          (h) =>
            !h.dividendInfo ||
            Date.now() - Date.parse(h.dividendInfo.fetchedAt) > DIVIDENDS_MAX_AGE_MS,
        );
        // A rate or a dividend history the service cannot give only goes missing; quotes are the check.
        const orNull = <T>(call: Promise<T>) => call.catch(() => null);
        const asking = Promise.all(stale.map((h) => orNull(market.fetchDividends(h.symbol))));
        const investAsk = shownIn ? orNull(market.fetchFx(home, shownIn)) : null;
        const quotes = symbols.length > 0 ? await market.fetchQuotes(symbols) : { quotes: [] };
        // Yahoo is authoritative for a listed symbol's currency, so the rates follow the quotes'.
        const currencies = [...new Set(quotes.quotes.map((q) => q.currency))].filter(
          (c) => c !== home && CURRENCY.test(c),
        );
        const [rates, dividends, investFx] = await Promise.all([
          Promise.all(currencies.map((c) => orNull(market.fetchFx(c, home)))),
          asking,
          investAsk,
        ]);
        const quoteOf = new Map(quotes.quotes.map((q) => [q.symbol.toUpperCase(), q]));
        const rateOf = new Map(currencies.map((c, i) => [c, rates[i]?.rate]));
        const dividendsOf = new Map(stale.map((h, i) => [h.id, dividends[i]]));

        // Applied to the holdings as they are now: the person may have edited one meanwhile.
        const at = nowIso();
        const updated: TableRecord[] = [];
        for (const h of holdings()) {
          const q = quoteOf.get(h.symbol.toUpperCase());
          const d = dividendsOf.get(h.id);
          if (!q && !d) continue;
          const currency = q && CURRENCY.test(q.currency) ? q.currency : h.currency;
          // The last rate is only worth keeping while it is for the same currency.
          const lastRate = currency === h.currency ? (h.quote?.fxRate ?? null) : null;
          const record: Holding = {
            ...h,
            currency,
            quote: q
              ? {
                  price: q.price,
                  previousClose: q.previousClose,
                  fxRate: currency === home ? 1 : (rateOf.get(currency) ?? lastRate),
                  asOf: q.asOf,
                }
              : h.quote,
            dividendInfo: d
              ? {
                  history: d.history,
                  nextExDate: d.next.exDate,
                  nextPayDate: d.next.payDate,
                  nextAmount: d.next.amount,
                  fetchedAt: at,
                }
              : h.dividendInfo,
            updatedAt: at,
          };
          updated.push({ table: 'holding', record });
        }
        // Only while Invest is still shown in the currency the rate was asked for.
        const settings = state().data.tables.settings[0];
        if (investFx && shownIn && settings?.investCurrency === shownIn) {
          const next = { currency: shownIn, rate: investFx.rate, asOf: investFx.asOf };
          updated.push({
            table: 'settings',
            record: { ...settings, investFx: next, updatedAt: at },
          });
        }
        // The rates are for `home`; a currency switched meanwhile would store them for the wrong one.
        if (profileCurrency() !== home) return 'failed';
        await state().putMany(updated);
        return 'ok';
      } catch {
        return 'failed';
      }
    },

    /**
     * Records a payout as received. A payout already confirmed or skipped is left as it is, so a
     * second tap cannot count it twice. Reinvesting buys shares at the holding's price instead of
     * paying a bucket. A payout of a fully sold holding pays a bucket, and cannot be reinvested.
     */
    async confirmDividend(p: ExpectedPayout, input: DividendInput) {
      notFuture(input.paidOn);
      if (settledBefore(p)) return;
      const holding = holdings().find((h) => h.id === p.holding.id);
      const sold = state().data.tables.sale.some((s) => s.holdingId === p.holding.id && s.restore);
      if (!holding && !sold) throw new Error('That item no longer exists.');
      const items: TableRecord[] = [];
      let sharesAdded: number | null = null;
      if (input.bucket === 'reinvest') {
        if (!holding) throw new Error(SOLD_NO_REINVEST);
        const price = holdingPrice(holding) ?? 0;
        const rate = holdingRate(holding, profileCurrency());
        if (price <= 0) throw new Error(NO_PRICE);
        if (rate === null) throw new Error(NO_RATE);
        sharesAdded = input.amount / (price * rate * 10 ** minorDigits(profileCurrency()));
        items.push({
          table: 'holding',
          record: {
            ...holding,
            shares: holding.shares + sharesAdded,
            costBasis: holding.costBasis + input.amount,
            updatedAt: nowIso(),
          },
        });
      }
      const dividend = payoutRecord(p, {
        paidOn: input.paidOn,
        status: 'confirmed',
        amount: input.amount,
        bucket: input.bucket,
        sharesAdded,
      });
      await state().putMany([{ table: 'dividend', record: dividend }, ...items]);
    },

    /** The payout never arrived: it stops being due and counts for nothing. */
    async skipDividend(p: ExpectedPayout) {
      if (settledBefore(p)) return;
      await state().put(
        'dividend',
        payoutRecord(p, {
          paidOn: p.payDate,
          status: 'skipped',
          amount: 0,
          bucket: null,
          sharesAdded: null,
        }),
      );
    },

    /**
     * Removes a confirmed or skipped payout, so it is due again while it is recent. A reinvested one
     * takes its shares and cost back off the holding, if it is still held, in the same write.
     */
    async deleteDividend(id: string) {
      const dividend = state().data.tables.dividend.find((d) => d.id === id);
      if (!dividend) throw new Error('That item no longer exists.');
      const holding = holdings().find((h) => h.id === dividend.holdingId);
      const items: TableRecord[] = [];
      if (dividend.bucket === 'reinvest' && holding) {
        const shares = holding.shares - (dividend.sharesAdded ?? 0);
        if (shares <= 0) throw new Error(SHARES_GONE);
        items.push({
          table: 'holding',
          record: {
            ...holding,
            shares,
            costBasis: Math.max(0, holding.costBasis - dividend.amount),
            updatedAt: nowIso(),
          },
        });
      }
      await state().putMany(items, [{ table: 'dividend', id }]);
    },

    async markChecked(id: string) {
      const at = nowIso();
      await state().put('holding', { ...find(id), checkedAt: at, updatedAt: at });
    },

    /**
     * Chooses the currency Invest is shown in; the profile currency, or null, is the way back. A
     * rate for another currency is dropped, and the new one is fetched straight away.
     */
    async setInvestCurrency(code: string | null): Promise<void> {
      const settings = state().data.tables.settings[0] ?? defaultSettings(nowIso());
      const investCurrency = code === profileCurrency() ? null : code;
      const keep = investCurrency !== null && settings.investFx?.currency === investCurrency;
      await state().put('settings', {
        ...settings,
        investCurrency,
        investFx: keep ? settings.investFx : null,
        updatedAt: nowIso(),
      });
      if (investCurrency !== null && !keep) await actions.refreshMarket();
    },
  };
  return actions;
}
