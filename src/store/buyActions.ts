import type { StoreApi } from 'zustand/vanilla';
import { analyse, buildSnapshot } from '@/domain/advisor';
import { addDays } from '@/domain/dates';
import {
  AboutYouSchema,
  BuyAskSchema,
  MAX_ASK_PRICE,
  type AboutYou,
  type BuyAsk,
  type BuyDecision,
  type Category,
} from '@/domain/entities';
import { newId, nowIso } from '@/domain/ids';
import { formatMoney } from '@/domain/money';
import { marketConfigured, type ExtractResponse, type Market } from '@/services/market';
import type { AppState } from './appStore';

/** What each field of an ask says when it is wrong, so the schema's own errors never show. */
export const BUY_MESSAGES = {
  item: 'Enter what it is, in 80 characters or fewer',
  price: 'Enter an amount like 12.50',
  priceTooHigh: (currency: string) => `Enter a price up to ${formatMoney(MAX_ASK_PRICE, currency)}`,
  quantity: 'Enter a quantity from 1 to 99',
  why: 'Keep it to 200 characters or fewer',
  link: 'That link is too long. Paste a shorter one, or clear it.',
  other: 'Check the form and try again.',
};
/** What `rate` says to anything but 1 to 5. */
export const RATE_RANGE = 'Rate it from 1 (not at all) to 5 (a lot).';
/** What `rate` says to a decision that was not bought: a rating there would move later answers. */
export const RATE_AFTER_BUYING = "You can rate it once you've bought it.";
const NOT_FOUND = 'That item no longer exists.';
const RATINGS = [1, 2, 3, 4, 5] as const;
/** The day to ask again when no limit starts afresh sooner. */
const WAIT_DAYS = 2;

export type AboutPatch = Partial<
  Pick<AboutYou, 'situation' | 'matters' | 'overspend' | 'protectGoalId'>
>;
/** What Add Expense starts from after "I bought it". */
export interface BuyPrefill {
  item: string;
  /** Price times quantity, in minor units. */
  amount: number;
  category: Category;
}

export type BuyActions = ReturnType<typeof createBuyActions>;

// One About-you save at a time per store, whichever actions made it: a change made before the last
// one is stored would otherwise start from the old record and undo it, and an ask would read it
// before it landed. Every entry settles, so waiting on one never throws.
const aboutSaves = new WeakMap<StoreApi<AppState>, Promise<unknown>>();

/**
 * Asks, decides and remembers, all on the phone: an ask is answered by the rules from the data
 * already here and never waits for the network. `market` is only for the optional link fill.
 */
export function createBuyActions(store: StoreApi<AppState>, market: Market) {
  const state = () => store.getState();
  const decisions = () => state().data.tables.buyDecision;
  const stamp = () => {
    const t = nowIso();
    return { createdAt: t, updatedAt: t };
  };
  function find(id: string): BuyDecision {
    const decision = decisions().find((d) => d.id === id);
    if (!decision) throw new Error(NOT_FOUND);
    return decision;
  }
  const update = async (id: string, patch: Partial<BuyDecision>) =>
    state().put('buyDecision', { ...find(id), ...patch, updatedAt: nowIso() });

  /** The ask as the schema reads it, with the person's own words trimmed, or the friendly message. */
  function checked(input: BuyAsk): BuyAsk {
    const result = BuyAskSchema.safeParse({
      ...input,
      item: input.item.trim(),
      why: input.why?.trim() || null,
      link: input.link?.trim() || null,
    });
    if (result.success) return result.data;
    const issue = result.error.issues[0]!;
    const currency = state().data.tables.profile[0]?.currency ?? 'USD';
    const messages: Record<string, string> = {
      item: BUY_MESSAGES.item,
      price: issue.code === 'too_big' ? BUY_MESSAGES.priceTooHigh(currency) : BUY_MESSAGES.price,
      quantity: BUY_MESSAGES.quantity,
      why: BUY_MESSAGES.why,
      link: BUY_MESSAGES.link,
    };
    throw new Error(messages[String(issue.path[0])] ?? BUY_MESSAGES.other);
  }

  return {
    /** Answers an ask from the rules and About you, and keeps the answer. Returns its id. */
    async ask(input: BuyAsk): Promise<string> {
      const ask = checked(input);
      await aboutSaves.get(store);
      const { today, data } = state();
      // The decision being made is not saved yet, so it can never count among the earlier ones.
      const snapshot = buildSnapshot(data, today, ask, decisions());
      const { facts, meter, verdict, confidence, guards, notes } = analyse(
        snapshot,
        ask,
        today,
        data.tables.aboutYou[0],
      );
      const decision: BuyDecision = {
        id: newId(),
        ...stamp(),
        ask,
        facts,
        rulesMeter: meter,
        rulesVerdict: verdict,
        meter,
        verdict,
        confidence,
        guards,
        notes,
        status: 'open',
        remindOn: null,
        boughtOn: null,
        usage: null,
      };
      await state().put('buyDecision', decision);
      return decision.id;
    },

    /**
     * What a product link gives (name, price, currency), or null when it cannot be read: offline,
     * no price service set up, or a page with neither a name nor a price (the route answers 200
     * with nulls for one). It never throws.
     */
    async extract(url: string): Promise<ExtractResponse | null> {
      const link = url.trim();
      if (!link || !marketConfigured()) return null;
      const found = await market.fetchExtract(link).catch(() => null);
      return typeof found?.name === 'string' || typeof found?.price === 'number' ? found : null;
    },

    /** Ask again on the day the limit it went over starts afresh, else in two days. */
    async wait(id: string) {
      const { resetsOn } = find(id).facts;
      const { today } = state();
      await update(id, {
        status: 'waiting',
        remindOn: resetsOn !== null && resetsOn > today ? resetsOn : addDays(today, WAIT_DAYS),
      });
    },

    async bought(id: string): Promise<BuyPrefill> {
      const { ask, status, boughtOn } = find(id);
      // Said again, it was still bought on the first day: the "was it worth it?" reminder counts from it.
      await update(id, {
        status: 'bought',
        boughtOn: status === 'bought' && boughtOn ? boughtOn : state().today,
        remindOn: null,
      });
      return { item: ask.item, amount: ask.price * ask.quantity, category: ask.category };
    },

    skip: (id: string) => update(id, { status: 'skipped', remindOn: null }),

    /** How much the thing was used, 1 (not at all) to 5 (a lot); only what was bought can be rated. */
    async rate(id: string, usage: number) {
      const rating = RATINGS.find((r) => r === usage);
      if (rating === undefined) throw new Error(RATE_RANGE);
      if (find(id).status !== 'bought') throw new Error(RATE_AFTER_BUYING);
      await update(id, { usage: rating });
    },

    deleteDecision: (id: string) => state().remove('buyDecision', id),

    /** Changes the one About-you record, making it on the first save. Nothing is saved if a limit is broken. */
    saveAbout(patch: AboutPatch): Promise<void> {
      const run = (aboutSaves.get(store) ?? Promise.resolve()).then(async () => {
        const blank: AboutYou = {
          id: 'about',
          ...stamp(),
          situation: '',
          matters: '',
          overspend: [],
          protectGoalId: null,
        };
        const about = state().data.tables.aboutYou[0] ?? blank;
        const next = AboutYouSchema.safeParse({ ...about, ...patch, updatedAt: nowIso() });
        if (!next.success) throw new Error(next.error.issues[0]!.message);
        await state().put('aboutYou', next.data);
      });
      aboutSaves.set(
        store,
        run.catch(() => {}),
      );
      return run;
    },
  };
}
