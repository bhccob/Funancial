import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyse, buildSnapshot } from '@/domain/advisor';
import { categoryLabel } from '@/domain/budget';
import { MAX_ASK_PRICE, type BuyAsk } from '@/domain/entities';
import { formatMoney } from '@/domain/money';
import { market as realMarket, MarketError, type Market } from '@/services/market';
import { makeAboutYou, makeBuyAsk, makeBuyDecision, makeLimit, makeProfile } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { BUY_MESSAGES, createBuyActions, RATE_RANGE } from './buyActions';

// The advisor module is the real one; the spy only lets a test see what the ask handed it.
vi.mock('@/domain/advisor', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/domain/advisor')>();
  return { ...real, buildSnapshot: vi.fn(real.buildSnapshot) };
});

const TODAY = '2026-10-14';
const NOT_FOUND = 'That item no longer exists.';

/** Cash only, no salary, no history: a "want" lands at exactly 50 until something moves it. */
async function setup(
  extract: Market['fetchExtract'] = async () => ({
    name: 'Trail shoes',
    price: 79.9,
    currency: 'USD',
  }),
) {
  const t = await freshRealStore();
  await t.store
    .getState()
    .put(
      'profile',
      makeProfile({
        salary: null,
        openingDate: '2026-10-01',
        openingCash: 1_000_00,
        openingSavings: 0,
      }),
    );
  const market: Market = { ...realMarket, fetchExtract: vi.fn(extract) };
  const actions = createBuyActions(t.store, market);
  const table = () => t.store.getState().data.tables;
  const decision = (id: string) => table().buyDecision.find((d) => d.id === id)!;
  return { ...t, market, actions, table, decision };
}

const concert = (over: Partial<BuyAsk> = {}) =>
  makeBuyAsk({ item: 'Concert ticket', price: 40_00, category: 'entertainment', ...over });

beforeEach(() => {
  vi.mocked(buildSnapshot).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ask', () => {
  it('saves what the rules said, as an open decision, and returns its id', async () => {
    const { store, actions, decision } = await setup();
    const ask = concert();
    const id = await actions.ask(ask);

    const data = store.getState().data;
    const expected = analyse(buildSnapshot(data, TODAY, ask), ask, TODAY);
    expect(decision(id)).toMatchObject({
      id,
      ask,
      status: 'open',
      remindOn: null,
      boughtOn: null,
      usage: null,
      facts: expected.facts,
      meter: expected.meter,
      verdict: expected.verdict,
      confidence: expected.confidence,
      rulesMeter: expected.meter,
      rulesVerdict: expected.verdict,
      notes: expected.notes,
      guards: expected.guards,
    });
    expect(decision(id)).toMatchObject({ meter: 50, verdict: 'wait', confidence: 'low' });
    expect(data.tables.buyDecision).toHaveLength(1);
  });

  it('keeps the guard reasons with the decision', async () => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert({ price: 5_000_00 }));
    expect(decision(id).guards.capAtWait).toBe(true);
    expect(decision(id).guards.reasons).toContain("Needs money you don't have");
    expect(decision(id).meter).toBeLessThanOrEqual(66);
    expect(decision(id).verdict).not.toBe('buy');
  });

  it('works offline: nothing is sent, and the link reader is not asked', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'secret');
    const offline = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', offline);
    const { actions, market, decision } = await setup(() => Promise.reject(new MarketError()));
    const id = await actions.ask(concert({ link: 'https://shop.test/ticket' }));
    expect(decision(id).status).toBe('open');
    expect(offline).not.toHaveBeenCalled();
    expect(market.fetchExtract).not.toHaveBeenCalled();
  });

  it('lets About you move the meter, and says why', async () => {
    const { actions, decision } = await setup();
    const before = await actions.ask(concert());
    await actions.saveAbout({ overspend: ['entertainment'] });
    const after = await actions.ask(concert());
    expect(decision(before)).toMatchObject({ meter: 50, notes: [] });
    expect(decision(after).meter).toBe(40);
    expect(decision(after).notes).toEqual([
      `You said you tend to overspend on ${categoryLabel('entertainment')}.`,
    ]);
  });

  it('weighs it against the earlier decisions, never against itself', async () => {
    const { store, actions, decision } = await setup();
    const first = await actions.ask(concert());
    await actions.bought(first);
    await actions.rate(first, 1);
    expect(vi.mocked(buildSnapshot).mock.calls[0]![3]).toEqual([]);

    const second = await actions.ask(concert());
    const past = vi.mocked(buildSnapshot).mock.calls[1]![3]!;
    // Only the earlier decision, as it stands now.
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      ask: decision(first).ask,
      verdict: decision(first).verdict,
      status: 'bought',
      usage: 1,
      createdAt: decision(first).createdAt,
    });
    // A thing the person did not use makes the same thing less of a buy.
    expect(decision(second).meter).toBe(decision(first).meter - 10);
    expect(store.getState().data.tables.buyDecision).toHaveLength(2);
  });

  it('trims the name and the optional lines, and keeps a blank one as nothing', async () => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert({ item: '  Concert ticket ', why: '  ', link: '' }));
    expect(decision(id).ask).toMatchObject({ item: 'Concert ticket', why: null, link: null });
  });

  it('accepts the limits of an ask', async () => {
    const { actions, table } = await setup();
    await actions.ask(concert({ item: 'x'.repeat(80), why: 'y'.repeat(200) }));
    await actions.ask(concert({ price: MAX_ASK_PRICE, quantity: 99 }));
    await actions.ask(concert({ price: 1, quantity: 1 }));
    expect(table().buyDecision).toHaveLength(3);
  });

  const price = 'Enter an amount like 12.50';
  it.each<[string, Partial<BuyAsk>, string]>([
    ['no name', { item: '' }, BUY_MESSAGES.item],
    ['a blank name', { item: '   ' }, BUY_MESSAGES.item],
    ['a name over 80 characters', { item: 'x'.repeat(81) }, BUY_MESSAGES.item],
    ['no price', { price: 0 }, price],
    ['a negative price', { price: -5 }, price],
    ['a price in part of a cent', { price: 12.5 }, price],
    ['a price that is not a number', { price: Number.NaN }, price],
    ['a price over the limit', { price: MAX_ASK_PRICE + 1 }, BUY_MESSAGES.priceTooHigh('USD')],
    ['no quantity', { quantity: 0 }, BUY_MESSAGES.quantity],
    ['100 of them', { quantity: 100 }, BUY_MESSAGES.quantity],
    ['half of one', { quantity: 1.5 }, BUY_MESSAGES.quantity],
    ['a reason over 200 characters', { why: 'y'.repeat(201) }, BUY_MESSAGES.why],
    [
      'a link over 2048 characters',
      { link: `https://s.test/${'a'.repeat(2048)}` },
      BUY_MESSAGES.link,
    ],
    ['a category that is not one', { category: 'cars' as never }, BUY_MESSAGES.other],
  ])('refuses %s with a message, and saves nothing', async (_what, over, message) => {
    const { actions, table } = await setup();
    await expect(actions.ask(concert(over))).rejects.toThrow(message);
    expect(table().buyDecision).toEqual([]);
  });

  it('says the top price in the currency of the profile', async () => {
    const { store, actions } = await setup();
    await store.getState().put('profile', makeProfile({ currency: 'JPY', salary: null }));
    await expect(actions.ask(concert({ price: MAX_ASK_PRICE + 1 }))).rejects.toThrow(
      `Enter a price up to ${formatMoney(MAX_ASK_PRICE, 'JPY')}`,
    );
  });
});

describe('extract', () => {
  it('returns what the link reader found', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'secret');
    const { actions, market } = await setup();
    await expect(actions.extract('https://shop.test/shoes')).resolves.toEqual({
      name: 'Trail shoes',
      price: 79.9,
      currency: 'USD',
    });
    expect(market.fetchExtract).toHaveBeenCalledWith('https://shop.test/shoes');
  });

  it('fails quietly: offline, or with no price service set up, it is nothing', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'secret');
    const down = await setup(() => Promise.reject(new MarketError()));
    await expect(down.actions.extract('https://shop.test/shoes')).resolves.toBeNull();

    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const unset = await setup();
    await expect(unset.actions.extract('https://shop.test/shoes')).resolves.toBeNull();
    expect(unset.market.fetchExtract).not.toHaveBeenCalled();
  });
});

describe('wait', () => {
  it('asks again when the limit it went over starts afresh', async () => {
    const { store, actions, decision } = await setup();
    await store
      .getState()
      .put('budgetLimit', makeLimit({ category: 'entertainment', amount: 30_00 }));
    const id = await actions.ask(concert());
    expect(decision(id).facts.resetsOn).toBe('2026-10-19');
    await actions.wait(id);
    expect(decision(id)).toMatchObject({ status: 'waiting', remindOn: '2026-10-19' });
  });

  it('asks again in two days when no limit is over', async () => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert());
    expect(decision(id).facts.resetsOn).toBeNull();
    await actions.wait(id);
    expect(decision(id)).toMatchObject({ status: 'waiting', remindOn: '2026-10-16' });
  });

  it('does not ask for a day that has come by the time the person decides', async () => {
    const { store, actions, decision } = await setup();
    const open = makeBuyDecision({ id: 'old' });
    await store
      .getState()
      .put('buyDecision', { ...open, facts: { ...open.facts, resetsOn: TODAY } });
    await actions.wait('old');
    expect(decision('old').remindOn).toBe('2026-10-16');
  });
});

describe('bought, skip, rate and delete', () => {
  it('records the purchase and hands back what Add Expense starts from', async () => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert({ price: 12_50, quantity: 3 }));
    await actions.wait(id);
    const prefill = await actions.bought(id);
    expect(prefill).toEqual({ item: 'Concert ticket', amount: 37_50, category: 'entertainment' });
    expect(decision(id)).toMatchObject({ status: 'bought', boughtOn: TODAY, remindOn: null });
  });

  it('records a skip and clears a reminder', async () => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert());
    await actions.wait(id);
    await actions.skip(id);
    expect(decision(id)).toMatchObject({ status: 'skipped', remindOn: null, boughtOn: null });
  });

  it('rates how much it was used from 1 to 5', async () => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert());
    await actions.bought(id);
    for (const usage of [1, 2, 3, 4, 5]) {
      await actions.rate(id, usage);
      expect(decision(id).usage).toBe(usage);
    }
  });

  it.each([0, 6, 2.5, -1, Number.NaN])('refuses a rating of %s', async (usage) => {
    const { actions, decision } = await setup();
    const id = await actions.ask(concert());
    await actions.rate(id, 3);
    await expect(actions.rate(id, usage)).rejects.toThrow(RATE_RANGE);
    expect(decision(id).usage).toBe(3);
  });

  it('deletes one decision and leaves the others', async () => {
    const { actions, table } = await setup();
    const a = await actions.ask(concert());
    const b = await actions.ask(concert({ item: 'Shoes' }));
    await actions.deleteDecision(a);
    expect(table().buyDecision.map((d) => d.id)).toEqual([b]);
  });

  it('does not mind a second delete of the same decision', async () => {
    const { actions, table } = await setup();
    const id = await actions.ask(concert());
    await actions.deleteDecision(id);
    await expect(actions.deleteDecision(id)).resolves.toBeUndefined();
    expect(table().buyDecision).toEqual([]);
  });

  it.each(['wait', 'bought', 'skip'] as const)(
    'says so when %s is given a decision that is gone',
    async (name) => {
      const { actions } = await setup();
      await expect(actions[name]('gone')).rejects.toThrow(NOT_FOUND);
    },
  );

  it('says so when a decision that is gone is rated', async () => {
    const { actions } = await setup();
    await expect(actions.rate('gone', 3)).rejects.toThrow(NOT_FOUND);
  });
});

describe('saveAbout', () => {
  it('creates the one record on the first save, then updates it', async () => {
    const { actions, table } = await setup();
    expect(table().aboutYou).toEqual([]);

    await actions.saveAbout({ matters: 'A bike for the summer' });
    const [created] = table().aboutYou;
    expect(table().aboutYou).toHaveLength(1);
    expect(created).toMatchObject({
      id: 'about',
      matters: 'A bike for the summer',
      situation: '',
      overspend: [],
      protectGoalId: null,
    });

    await actions.saveAbout({ overspend: ['food', 'shopping'], protectGoalId: 'g1' });
    await actions.saveAbout({ situation: 'Between jobs' });
    expect(table().aboutYou).toHaveLength(1);
    expect(table().aboutYou[0]).toMatchObject({
      id: 'about',
      createdAt: created!.createdAt,
      matters: 'A bike for the summer',
      situation: 'Between jobs',
      overspend: ['food', 'shopping'],
      protectGoalId: 'g1',
    });
  });

  it('keeps every change when two are made before the first is saved', async () => {
    const { actions, table } = await setup();
    await Promise.all([
      actions.saveAbout({ matters: 'A bike' }),
      actions.saveAbout({ overspend: ['food'] }),
      actions.saveAbout({ situation: 'Renting' }),
    ]);
    expect(table().aboutYou[0]).toMatchObject({
      matters: 'A bike',
      overspend: ['food'],
      situation: 'Renting',
    });
  });

  it('takes 500 characters in a line, and refuses more with a message', async () => {
    const { actions, table } = await setup();
    await actions.saveAbout({ matters: 'm'.repeat(500), situation: 's'.repeat(500) });
    for (const field of ['matters', 'situation'] as const) {
      await expect(actions.saveAbout({ [field]: 'x'.repeat(501) })).rejects.toThrow(
        'Keep it to 500 characters or fewer',
      );
    }
    expect(table().aboutYou[0]).toMatchObject({
      matters: 'm'.repeat(500),
      situation: 's'.repeat(500),
    });
  });

  it('refuses a category picked twice, and changes nothing', async () => {
    const { actions, table } = await setup();
    await actions.saveAbout({ overspend: ['food'] });
    await expect(actions.saveAbout({ overspend: ['food', 'food'] })).rejects.toThrow(
      'Pick each category once',
    );
    expect(table().aboutYou[0]!.overspend).toEqual(['food']);
  });

  it('takes a goal that is gone: the check falls back by itself', async () => {
    const { actions, table, store } = await setup();
    await store.getState().put('aboutYou', makeAboutYou({ protectGoalId: 'g1' }));
    await actions.saveAbout({ protectGoalId: 'deleted-goal' });
    expect(table().aboutYou[0]!.protectGoalId).toBe('deleted-goal');
    await actions.saveAbout({ protectGoalId: null });
    expect(table().aboutYou[0]!.protectGoalId).toBeNull();
  });
});
