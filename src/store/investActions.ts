import type { StoreApi } from 'zustand/vanilla';
import type { LocalDate } from '@/domain/dates';
import type { ExpectedPayout } from '@/domain/dividends';
import type { Dividend, Holding, Transaction } from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';
import { minorDigits } from '@/domain/money';
import { holdingPrice, holdingRate } from '@/domain/portfolio';
import type { TableRecord } from '@/domain/snapshot';
import { marketConfigured, type Market } from '@/services/market';
import type { AppState } from './appStore';
import { FUTURE } from './financeActions';

/** What `addHolding` says when the price service cannot name a symbol and none was typed in. */
export const UNKNOWN_SYMBOL =
  "We couldn't find that symbol. Check it, or enter the name and currency yourself.";
const NO_PRICE =
  'Reinvesting needs a price for this holding. Refresh prices or set a manual price.';
/** What `deleteDividend` says when taking a reinvested payout's shares back would leave none. */
export const SHARES_GONE =
  'The holding has fewer shares than this dividend bought. Edit the holding first.';
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

  return {
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
      if (patch.purchaseDate) notFuture(patch.purchaseDate);
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
     * Fetches quotes, exchange rates and stale dividend info, and saves them in one write. A holding
     * the service has nothing new for keeps its last values. It never throws: `failed` is the
     * quotes not arriving (or not saving), and then nothing is written.
     */
    async refreshMarket(): Promise<RefreshResult> {
      if (!marketConfigured()) return 'not configured';
      try {
        const home = profileCurrency();
        const asked = holdings();
        if (asked.length === 0) return 'ok';
        const symbols = [...new Set(asked.map((h) => h.symbol))];
        const currencies = [...new Set(asked.map((h) => h.currency))].filter((c) => c !== home);
        const stale = asked.filter(
          (h) =>
            !h.dividendInfo ||
            Date.now() - Date.parse(h.dividendInfo.fetchedAt) > DIVIDENDS_MAX_AGE_MS,
        );
        // A rate or a dividend history the service cannot give only goes missing; quotes are the check.
        const orNull = <T>(call: Promise<T>) => call.catch(() => null);
        const [quotes, rates, dividends] = await Promise.all([
          market.fetchQuotes(symbols),
          Promise.all(currencies.map((c) => orNull(market.fetchFx(c, home)))),
          Promise.all(stale.map((h) => orNull(market.fetchDividends(h.symbol)))),
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
          const record: Holding = {
            ...h,
            quote: q
              ? {
                  price: q.price,
                  previousClose: q.previousClose,
                  fxRate:
                    h.currency === home ? 1 : (rateOf.get(h.currency) ?? h.quote?.fxRate ?? null),
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
        await state().putMany(updated);
        return 'ok';
      } catch {
        return 'failed';
      }
    },

    /**
     * Records a payout as received. A payout already confirmed or skipped is left as it is, so a
     * second tap cannot count it twice. Reinvesting buys shares at the holding's price instead of
     * paying a bucket.
     */
    async confirmDividend(p: ExpectedPayout, input: DividendInput) {
      notFuture(input.paidOn);
      if (settledBefore(p)) return;
      const holding = find(p.holding.id);
      const items: TableRecord[] = [];
      let sharesAdded: number | null = null;
      if (input.bucket === 'reinvest') {
        const price = holdingPrice(holding);
        const rate = holdingRate(holding, profileCurrency());
        const minorPerShare =
          price === null || rate === null ? 0 : price * rate * 10 ** minorDigits(profileCurrency());
        if (minorPerShare <= 0) throw new Error(NO_PRICE);
        sharesAdded = input.amount / minorPerShare;
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
  };
}
