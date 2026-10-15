import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameUpdates } from '@/domain/game/engine';
import { challengeViews } from '@/domain/game/challenges';
import { ledgerTotals, netByKey } from '@/domain/game/ledger';
import { ownedItems } from '@/domain/game/shop';
import type { GameContext } from '@/domain/game/types';
import { computeGameView } from '@/domain/game/engine';
import {
  localIso,
  makeExpense,
  makeGoal,
  makeLedgerEntry,
  makeLimit,
  makeSubscription,
} from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { createAppStore, type AppDeps, type AppState } from './appStore';
import { createFinanceActions } from './financeActions';
import { createGameActions } from './gameActions';
import type { StoreApi } from 'zustand/vanilla';

// The real engine, wrapped so a test can make one run fail and count the runs.
vi.mock('@/domain/game/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/game/engine')>();
  return { ...actual, gameUpdates: vi.fn(actual.gameUpdates) };
});

const TODAY = '2026-10-14'; // a Wednesday: with weeks starting Monday the week starts 2026-10-12

// Entities made by the actions are stamped by `Date`, so the clock stands at noon on `TODAY`.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(localIso(TODAY)));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(gameUpdates).mockReset(); // back to the real engine, with no failure left queued
});

async function setup() {
  const t = await freshRealStore();
  return { ...t, finance: createFinanceActions(t.store), game: createGameActions(t.store) };
}

async function reboot(deps: AppDeps) {
  const store = createAppStore(deps);
  await store.getState().boot();
  return store;
}

const lunch = {
  amount: 12_50,
  category: 'food' as const,
  date: TODAY,
  note: 'Lunch',
  paymentMethod: 'cash' as const,
  cardId: null,
  repeat: null,
};

const ledgerOf = (store: StoreApi<AppState>) => store.getState().data.tables.ledger;
const ledgerIds = (store: StoreApi<AppState>) =>
  ledgerOf(store)
    .map((e) => e.id)
    .sort();
const ctxOf = (store: StoreApi<AppState>): GameContext => ({
  today: store.getState().today,
  now: new Date().toISOString(),
  weekStartsOn: store.getState().data.tables.settings[0]?.weekStartsOn ?? 1,
  canBackUp: true,
});

describe('settling after a write', () => {
  it('pays logging XP, the daily quest and the badge with the first expense', async () => {
    const { store, deps, finance } = await setup();
    expect(store.getState().gameGain).toBeNull();

    const { expense } = await finance.addExpense(lunch);

    expect(ledgerIds(store)).toEqual([
      'badge:first-expense#0',
      `log:expense:${expense.id}#0`,
      `quest:log-today:${TODAY}#0`,
    ]);
    expect(store.getState().gameGain).toMatchObject({ id: 1, gain: { xp: 80, coins: 15 } });
    // It was saved, not only shown.
    expect(ledgerIds(await reboot(deps))).toEqual(ledgerIds(store));
  });

  it('pays an expense entered with Repeat as logged, though it starts a subscription', async () => {
    const { store, finance } = await setup();

    const { expense } = await finance.addExpense({ ...lunch, repeat: 'monthly' });

    expect(expense.subscriptionId).not.toBeNull();
    expect(ledgerIds(store)).toEqual([
      'badge:first-expense#0',
      `log:expense:${expense.id}#0`,
      `quest:log-today:${TODAY}#0`,
    ]);
    const logToday = computeGameView(store.getState().data, ctxOf(store)).quests.find(
      (q) => q.id === 'log-today',
    );
    expect(logToday).toMatchObject({ done: true, action: null });
  });

  it('numbers each gain', async () => {
    const { store, finance } = await setup();
    await finance.addExpense(lunch);
    await finance.addExpense({ ...lunch, note: 'Coffee' });
    expect(store.getState().gameGain).toMatchObject({ id: 2, gain: { xp: 10, coins: 0 } });
  });

  it('tells other tabs once per write, however many ledger entries it settles', async () => {
    const { store, posts, finance } = await setup();
    const before = posts.length;
    await finance.addExpense(lunch);
    expect(posts.slice(before)).toEqual([{ type: 'reload', reason: 'data' }]);
    expect(ledgerOf(store)).toHaveLength(3);
  });

  it('settles once per write, never from its own writes', async () => {
    const { finance } = await setup();
    vi.mocked(gameUpdates).mockClear();
    await finance.addExpense(lunch);
    expect(gameUpdates).toHaveBeenCalledTimes(1);
  });

  it('reverses logging XP when the expense is deleted', async () => {
    const { store, finance } = await setup();
    const { expense } = await finance.addExpense(lunch);
    const gain = store.getState().gameGain;

    await finance.deleteExpense(expense.id);

    expect(netByKey(ledgerOf(store)).get(`log:expense:${expense.id}`)).toEqual({ xp: 0, coins: 0 });
    expect(ledgerIds(store)).toContain(`log:expense:${expense.id}#1`);
    // The quest and the badge were earned and stay; taking XP back is not a gain.
    expect(ledgerTotals(ledgerOf(store)).xp).toBe(70);
    expect(store.getState().gameGain).toBe(gain);
  });

  it('pays nothing for an edit', async () => {
    const { store, finance } = await setup();
    const { expense } = await finance.addExpense(lunch);
    const before = ledgerOf(store);

    await finance.updateExpense(expense.id, { amount: 99_00, date: '2026-10-13' });

    expect(ledgerOf(store)).toEqual(before);
  });

  it('settles idempotently', async () => {
    const { store, finance } = await setup();
    await finance.addExpense(lunch);
    const before = ledgerOf(store);
    const gain = store.getState().gameGain;

    await store.getState().sync();
    await store.getState().sync();

    expect(ledgerOf(store)).toEqual(before);
    expect(store.getState().gameGain).toBe(gain);
  });

  it('pays once when two stores settle the same data', async () => {
    const { store: a, deps, finance } = await setup();
    const b = await reboot(deps);

    await finance.addExpense(lunch);
    await b.getState().refresh();
    await b.getState().sync();

    const reloaded = await reboot(deps);
    const ids = ledgerOf(reloaded).map((e) => e.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ledgerTotals(ledgerOf(reloaded)).xp).toBe(80);
    expect(ledgerIds(a)).toEqual(ids.sort());
    expect(b.getState().gameGain).toBeNull();
  });

  it('pays once when a second store settles before it has seen the first one’s ledger', async () => {
    const { deps, finance } = await setup();
    const b = await reboot(deps);

    await finance.addExpense(lunch);
    await b.getState().refresh();
    const { data } = b.getState();
    b.setState({ data: { ...data, tables: { ...data.tables, ledger: [] } } });
    await b.getState().sync(); // pays what the first store already paid, under the same ids

    const reloaded = await reboot(deps);
    expect(ledgerOf(reloaded)).toHaveLength(3);
    expect(ledgerTotals(ledgerOf(reloaded)).xp).toBe(80);
  });

  it('never fails a write because the game failed, and pays the catch-up later', async () => {
    const { store, deps, finance } = await setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    vi.mocked(gameUpdates).mockImplementationOnce(() => {
      throw boom;
    });

    const { expense } = await finance.addExpense(lunch);

    expect(error).toHaveBeenCalledWith('Updating the game layer failed', boom);
    expect(store.getState().data.tables.expense.map((e) => e.id)).toEqual([expense.id]);
    expect(ledgerOf(store)).toEqual([]);
    expect(store.getState().gameGain).toBeNull();

    await store.getState().sync();
    expect(ledgerTotals(ledgerOf(store)).xp).toBe(80);
    expect(ledgerTotals(ledgerOf(await reboot(deps))).xp).toBe(80);
  });

  it('settles when the app opens over a history it never settled', async () => {
    const { store, deps } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(gameUpdates).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await store.getState().put('expense', makeExpense({ id: 'old', date: TODAY }));
    expect(ledgerOf(store)).toEqual([]);

    const again = await reboot(deps);

    expect(ledgerTotals(ledgerOf(again)).xp).toBe(80);
    expect(again.getState().gameGain).toMatchObject({ gain: { xp: 80 } });
  });
});

describe('overlapping settles', () => {
  it('announces a gain once when two syncs run together', async () => {
    // A desktop tab gets `visibilitychange` and `focus` together; Android gets `resume` with it.
    let today = TODAY;
    const t = await freshRealStore({ today: () => today });
    const { store } = t;
    await store.getState().put('budgetLimit', makeLimit());
    const gains: NonNullable<AppState['gameGain']>[] = [];
    store.subscribe((s, prev) => {
      if (s.gameGain && s.gameGain !== prev.gameGain) gains.push(s.gameGain);
    });

    today = '2026-10-19'; // the next Monday: last week's limits were kept
    await Promise.all([store.getState().sync(), store.getState().sync()]);

    expect(gains).toHaveLength(1);
    expect(gains[0]?.gain.rewards.map((r) => r.title)).toContain(
      'Stay within your limits this week',
    );
    expect(ledgerOf(store).filter((e) => e.key === 'quest:week-limits:2026-10-12')).toHaveLength(1);
  });

  it('announces no gain from a settle that finishes after the app locked', async () => {
    const { store, finance } = await setup();
    await store.getState().setSecret('2468', 'pin');
    const { gameUpdates: real } =
      await vi.importActual<typeof import('@/domain/game/engine')>('@/domain/game/engine');
    // Locks while the settle's ledger write is still on its way to storage.
    vi.mocked(gameUpdates).mockImplementationOnce((data, ctx) => {
      queueMicrotask(() => store.getState().lock());
      return real(data, ctx);
    });

    await finance.addExpense(lunch);

    expect(store.getState().phase).toBe('locked');
    expect(store.getState().gameGain).toBeNull();
  });
});

describe('restoring a backup', () => {
  it('keeps a restored ledger without paying twice', async () => {
    const { store, finance } = await setup();
    await finance.addExpense(lunch);
    const { text } = await store.getState().createBackup('correct horse');
    const backedUp = ledgerOf(store);

    await store.getState().deleteAllData();
    await store.getState().startFresh();
    await store.getState().restoreBackup(text, 'correct horse');

    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(ledgerOf(store))).toEqual(byId(backedUp));
    await store.getState().sync();
    expect(byId(ledgerOf(store))).toEqual(byId(backedUp));
  });

  it('starts the game from the history of a backup that has no ledger', async () => {
    const { store, finance } = await setup();
    await finance.addExpense(lunch);
    const { data } = store.getState();
    store.setState({ data: { ...data, tables: { ...data.tables, ledger: [] } } });
    const { text } = await store.getState().createBackup('correct horse');

    const other = await setup();
    await other.store.getState().restoreBackup(text, 'correct horse');

    expect(ledgerTotals(ledgerOf(other.store)).xp).toBe(80);
    expect(other.store.getState().gameGain).toMatchObject({ gain: { xp: 80 } });
  });
});

describe('check-ins', () => {
  it('records a no-spend day and refuses it after spending', async () => {
    const { store, game } = await setup();
    await game.checkInNoSpend();
    expect(store.getState().data.tables.checkIn).toMatchObject([
      { id: `checkin:no-spend:${TODAY}`, kind: 'no-spend', date: TODAY },
    ]);
    expect(ledgerIds(store)).toContain(`quest:log-today:${TODAY}#0`);

    const spender = await setup();
    await spender.finance.addExpense(lunch);
    await expect(spender.game.checkInNoSpend()).rejects.toThrow(
      'You already logged spending today.',
    );
    expect(spender.store.getState().data.tables.checkIn).toEqual([]);
  });

  it('refuses Nothing spent after an expense entered with Repeat', async () => {
    const { store, game, finance } = await setup();
    await finance.addExpense({ ...lunch, repeat: 'monthly' });
    await expect(game.checkInNoSpend()).rejects.toThrow('You already logged spending today.');
    expect(store.getState().data.tables.checkIn).toEqual([]);
  });

  it('counts only what the person spent today: not a subscription charge, not an earlier day', async () => {
    const { store, game } = await setup();
    await store.getState().putMany([
      { table: 'expense', record: makeExpense({ date: TODAY, subscriptionId: 's1' }) },
      { table: 'expense', record: makeExpense({ date: '2026-10-13' }) },
    ]);
    await expect(game.checkInNoSpend()).resolves.toBeUndefined();
  });

  it('checks in once per week, dated by the start of the week', async () => {
    const { store, game } = await setup();
    await game.checkInWeek();
    await game.checkInWeek();

    expect(store.getState().data.tables.checkIn).toMatchObject([
      { id: 'checkin:weekly:2026-10-12', kind: 'weekly', date: '2026-10-12' },
    ]);
    const quest = computeGameView(store.getState().data, ctxOf(store)).quests.find(
      (q) => q.id === 'week-checkin',
    );
    expect(quest?.done).toBe(true);
  });

  it('follows the week start in the settings', async () => {
    const { store, game, finance } = await setup();
    await finance.updateSettings({ weekStartsOn: 0 });
    await game.checkInWeek();
    expect(store.getState().data.tables.checkIn.map((c) => c.id)).toEqual([
      'checkin:weekly:2026-10-11',
    ]);
  });
});

describe('the shop', () => {
  async function withCoins(coins: number) {
    const t = await setup();
    await t.store.getState().put('ledger', makeLedgerEntry({ key: 'seed', xp: 0, coins }));
    return t;
  }
  const coinsLeft = (store: StoreApi<AppState>) => ledgerTotals(ledgerOf(store)).coins;

  it('buys with coins, refuses when short, equips only what is owned', async () => {
    const { store, game } = await withCoins(100);

    await expect(game.buy('theme-ocean')).rejects.toThrow('Not enough coins.');
    await expect(game.buy('nothing-here')).rejects.toThrow("That item isn't in the shop.");
    expect(coinsLeft(store)).toBe(100);

    await expect(game.equip('avatar-rocket')).rejects.toThrow('Buy it first.');
    await game.buy('avatar-rocket');
    expect(coinsLeft(store)).toBe(20);
    expect(ownedItems(ledgerOf(store)).has('avatar-rocket')).toBe(true);
    await expect(game.buy('avatar-rocket')).rejects.toThrow('You already own this.');

    await game.equip('avatar-rocket');
    expect(store.getState().data.tables.settings[0]?.cosmetics).toEqual({
      theme: 'theme-violet',
      avatar: 'avatar-rocket',
      frame: 'frame-none',
    });
    expect(computeGameView(store.getState().data, ctxOf(store)).cosmetics.avatar).toBe(
      'avatar-rocket',
    );
  });

  it('equips what is free without buying it', async () => {
    const { store, game } = await setup();
    await game.equip('frame-none');
    expect(store.getState().data.tables.settings[0]?.cosmetics.frame).toBe('frame-none');
  });

  it('uses only themes, avatars and frames, and says so before asking for a purchase', async () => {
    const { game } = await withCoins(500);
    await expect(game.equip('freeze-logging')).rejects.toThrow(
      'Only themes, avatars and frames can be used.',
    );
    await game.buy('freeze-logging');
    await expect(game.equip('freeze-logging')).rejects.toThrow(
      'Only themes, avatars and frames can be used.',
    );
  });

  it('holds at most two freezes', async () => {
    const { game } = await withCoins(500);
    await game.buy('freeze-checkin');
    await game.buy('freeze-checkin');
    await expect(game.buy('freeze-checkin')).rejects.toThrow('You can hold 2 at a time.');
  });
});

describe('challenges', () => {
  it('starts and abandons a challenge', async () => {
    const { store, game } = await setup();
    await expect(game.startChallenge('budget-30')).rejects.toThrow('Set a limit first.');
    await expect(game.startChallenge('emergency-sprint')).rejects.toThrow(
      'Add an emergency fund goal first.',
    );

    await store.getState().putMany([
      { table: 'budgetLimit', record: makeLimit() },
      { table: 'goal', record: makeGoal() },
    ]);
    const challenge = await game.startChallenge('budget-30');

    expect(challenge).toMatchObject({
      kind: 'budget-30',
      status: 'active',
      start: TODAY,
      end: '2026-11-12',
    });
    expect(store.getState().data.tables.challenge).toEqual([challenge]);
    await expect(game.startChallenge('budget-30')).rejects.toThrow(
      'This challenge is already running.',
    );

    await game.abandonChallenge(challenge.id);
    expect(store.getState().data.tables.challenge[0]).toMatchObject({
      id: challenge.id,
      status: 'abandoned',
    });
    expect(challengeViews(store.getState().data, ctxOf(store)).map((v) => v.outcome)).toEqual([
      'abandoned',
    ]);

    // Dropped, it can be started again.
    await expect(game.startChallenge('budget-30')).resolves.toMatchObject({ status: 'active' });
    await expect(game.abandonChallenge('missing')).rejects.toThrow('That item no longer exists.');
  });

  it('refuses the 30-day budget streak while a limit is over', async () => {
    const { store, game } = await setup();
    await store.getState().putMany([
      { table: 'budgetLimit', record: makeLimit({ amount: 10_00 }) },
      { table: 'expense', record: makeExpense({ date: TODAY, amount: 20_00 }) },
    ]);
    await expect(game.startChallenge('budget-30')).rejects.toThrow(
      "You're over a limit right now. Start once it resets.",
    );
    expect(store.getState().data.tables.challenge).toEqual([]);
  });

  it('refuses a subscription audit with no subscription to review', async () => {
    const { store, game } = await setup();
    await expect(game.startChallenge('subscription-audit')).rejects.toThrow(
      'Add a subscription first.',
    );
    await store.getState().put('subscription', makeSubscription({ nextRenewal: '2026-11-01' }));
    await expect(game.startChallenge('subscription-audit')).resolves.toMatchObject({
      kind: 'subscription-audit',
    });
  });
});

describe('locking', () => {
  it('clears the gain on lock', async () => {
    const { store, finance } = await setup();
    await store.getState().setSecret('2468', 'pin');
    await finance.addExpense(lunch);
    expect(store.getState().gameGain).not.toBeNull();

    store.getState().lock();

    expect(store.getState().gameGain).toBeNull();
  });

  it('clears the gain on boot', async () => {
    const { store, finance } = await setup();
    await store.getState().setSecret('2468', 'pin');
    await finance.addExpense(lunch);
    expect(store.getState().gameGain).not.toBeNull();

    await store.getState().boot();

    expect(store.getState().gameGain).toBeNull();
  });

  it('does not pay again when the app is unlocked', async () => {
    const { store, finance } = await setup();
    await store.getState().setSecret('2468', 'pin');
    await finance.addExpense(lunch);
    store.getState().lock();

    await expect(store.getState().unlock('2468')).resolves.toBe('ok');

    expect(ledgerTotals(ledgerOf(store)).xp).toBe(80);
    expect(store.getState().gameGain).toBeNull();
  });
});

describe('the demo', () => {
  it('settles its seeded history without celebrating it', async () => {
    const { store } = await setup();

    await store.getState().startDemo();

    // The history was paid out, but nothing is shown for it.
    expect(ledgerOf(store).length).toBeGreaterThan(0);
    expect(store.getState().gameGain).toBeNull();
  });

  it('celebrates what is earned inside the demo', async () => {
    const { store } = await setup();
    await store.getState().startDemo();

    await createFinanceActions(store).addExpense({ ...lunch, note: 'Demo coffee' });

    expect(store.getState().gameGain).toMatchObject({ gain: { xp: 10 } });
  });
});
