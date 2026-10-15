import type { StoreApi } from 'zustand/vanilla';
import { defaultSettings, type Challenge, type ChallengeKind } from '@/domain/entities';
import { newChallenge, startRequirement } from '@/domain/game/challenges';
import { ownedItems, purchaseBlocker, purchaseEntry, SHOP_ITEMS } from '@/domain/game/shop';
import { newId, nowIso } from '@/domain/ids';
import { weekRange } from '@/domain/periods';
import { gameContext, type AppState } from './appStore';

const COSMETIC_ONLY = 'Only themes, avatars and frames can be used.';

export type GameActions = ReturnType<typeof createGameActions>;

/** The person's own game moves: check-ins, challenges and the shop. The store settles what they earn. */
export function createGameActions(store: StoreApi<AppState>) {
  const state = () => store.getState();
  const stamp = () => {
    const t = nowIso();
    return { createdAt: t, updatedAt: t };
  };

  return {
    /** Records that nothing was spent today. Spending logged today rules it out. */
    async checkInNoSpend() {
      const { today, data } = state();
      if (data.tables.expense.some((e) => e.subscriptionId === null && e.date === today)) {
        throw new Error('You already logged spending today.');
      }
      await state().put('checkIn', {
        id: `checkin:no-spend:${today}`,
        ...stamp(),
        kind: 'no-spend',
        date: today,
      });
    },

    /** The weekly check-in, dated by the week's start; checking in again changes nothing. */
    async checkInWeek() {
      const { today, weekStartsOn } = gameContext(state(), nowIso());
      const { start } = weekRange(today, weekStartsOn);
      await state().put('checkIn', {
        id: `checkin:weekly:${start}`,
        ...stamp(),
        kind: 'weekly',
        date: start,
      });
    },

    async startChallenge(kind: ChallengeKind): Promise<Challenge> {
      const ctx = gameContext(state(), nowIso());
      const blocker = startRequirement(kind, state().data, ctx);
      if (blocker) throw new Error(blocker);
      const challenge = newChallenge(kind, state().data, ctx, newId());
      await state().put('challenge', challenge);
      return challenge;
    },

    async abandonChallenge(id: string) {
      const challenge = state().data.tables.challenge.find((c) => c.id === id);
      if (!challenge) throw new Error('That item no longer exists.');
      await state().put('challenge', { ...challenge, status: 'abandoned', updatedAt: nowIso() });
    },

    /** Spends coins on an item. The purchase is a ledger entry, so it is kept and synced like the rest. */
    async buy(itemId: string) {
      const blocker = purchaseBlocker(itemId, state().data);
      if (blocker) throw new Error(blocker);
      await state().put('ledger', purchaseEntry(itemId, newId(), nowIso()));
    },

    /** Puts on a theme, avatar or frame that is owned. A freeze is spent by the game, not worn. */
    async equip(itemId: string) {
      const item = SHOP_ITEMS.find((i) => i.id === itemId);
      if (!item || item.slot === 'freeze') throw new Error(COSMETIC_ONLY);
      if (!ownedItems(state().data.tables.ledger).has(item.id)) throw new Error('Buy it first.');
      const settings = state().data.tables.settings[0] ?? defaultSettings(nowIso());
      await state().put('settings', {
        ...settings,
        cosmetics: { ...settings.cosmetics, [item.slot]: item.id },
        updatedAt: nowIso(),
      });
    },
  };
}
