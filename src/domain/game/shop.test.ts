import { describe, expect, it } from 'vitest';
import { localIso, makeLedgerEntry, makeSettings, makeStreakFreeze } from '@/test/fixtures';
import type { LedgerEntry } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import {
  coinBalance,
  DEFAULT_COSMETICS,
  equippedCosmetics,
  FREEZE_LIMIT,
  ownedItems,
  purchaseBlocker,
  purchaseEntry,
  SHOP_ITEMS,
} from './shop';

const now = localIso('2026-10-15', 9);

function snap(tables: Partial<DataSnapshot['tables']>): DataSnapshot {
  const base = emptySnapshot();
  return { ...base, tables: { ...base.tables, ...tables } };
}

/** Coins earned, as one award. */
const earned = (coins: number): LedgerEntry =>
  makeLedgerEntry({ key: 'test-coins', kind: 'award', xp: 0, coins, label: 'Coins' });

/** A purchase of `itemId`, written the way `purchaseEntry` writes it. */
const bought = (itemId: string, purchaseId = 'p1'): LedgerEntry =>
  purchaseEntry(itemId, purchaseId, now);

describe('SHOP_ITEMS', () => {
  it('lists the catalogue in order', () => {
    expect(SHOP_ITEMS.map((i) => [i.slot, i.id, i.name, i.price])).toEqual([
      ['theme', 'theme-violet', 'Violet', 0],
      ['theme', 'theme-ocean', 'Ocean', 150],
      ['theme', 'theme-orchid', 'Orchid', 150],
      ['theme', 'theme-graphite', 'Graphite', 150],
      ['avatar', 'avatar-sprout', 'Sprout', 0],
      ['avatar', 'avatar-rocket', 'Rocket', 80],
      ['avatar', 'avatar-cat', 'Cat', 80],
      ['avatar', 'avatar-mountain', 'Mountain', 80],
      ['avatar', 'avatar-anchor', 'Anchor', 80],
      ['avatar', 'avatar-crown', 'Crown', 120],
      ['avatar', 'avatar-gem', 'Gem', 120],
      ['frame', 'frame-none', 'No frame', 0],
      ['frame', 'frame-silver', 'Silver', 100],
      ['frame', 'frame-gold', 'Gold', 200],
      ['frame', 'frame-game', 'Game color', 100],
      ['freeze', 'freeze-logging', 'Logging streak freeze', 50],
      ['freeze', 'freeze-checkin', 'Check-in streak freeze', 80],
    ]);
  });

  it('has the default cosmetics for free and holds 2 freezes at most', () => {
    const free = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id);
    expect(free).toEqual(Object.values(DEFAULT_COSMETICS));
    expect(FREEZE_LIMIT).toBe(2);
  });
});

describe('ownedItems', () => {
  it('owns the free items and what was bought', () => {
    expect(ownedItems([])).toEqual(new Set(['theme-violet', 'avatar-sprout', 'frame-none']));

    const owned = ownedItems([earned(500), bought('theme-ocean'), bought('freeze-logging')]);
    expect(owned).toEqual(
      new Set(['theme-violet', 'avatar-sprout', 'frame-none', 'theme-ocean', 'freeze-logging']),
    );
  });

  it('counts only purchases of items in the shop', () => {
    const owned = ownedItems([
      makeLedgerEntry({ key: 'shop:avatar-cat:p1', kind: 'reversal', xp: 0, coins: 80 }),
      makeLedgerEntry({ key: 'shop:avatar-unicorn:p1', kind: 'purchase', xp: 0, coins: -80 }),
      makeLedgerEntry({ key: 'badge:first-expense', kind: 'award' }),
    ]);
    expect(owned).toEqual(new Set(['theme-violet', 'avatar-sprout', 'frame-none']));
  });
});

describe('coinBalance', () => {
  it('is the coins the ledger adds up to', () => {
    expect(coinBalance([])).toBe(0);
    expect(coinBalance([earned(200), bought('theme-ocean')])).toBe(50);
  });
});

describe('purchaseBlocker', () => {
  const rich = (extra: Partial<DataSnapshot['tables']> = {}, coins = 1_000) =>
    snap({ ledger: [earned(coins)], ...extra });

  it('blocks purchases with a reason', () => {
    expect(purchaseBlocker('theme-unicorn', rich())).toBe("That item isn't in the shop.");

    const owning = rich({ ledger: [earned(1_000), bought('theme-ocean')] });
    expect(purchaseBlocker('theme-ocean', owning)).toBe('You already own this.');
    expect(purchaseBlocker('theme-violet', rich())).toBe('You already own this.');

    const holdingTwo = rich({
      ledger: [earned(1_000), bought('freeze-logging', 'p1'), bought('freeze-logging', 'p2')],
    });
    expect(purchaseBlocker('freeze-logging', holdingTwo)).toBe('You can hold 2 at a time.');

    expect(purchaseBlocker('avatar-rocket', rich({}, 79))).toBe('Not enough coins.');
  });

  it('allows a purchase when nothing stands in the way', () => {
    expect(purchaseBlocker('theme-ocean', rich())).toBeNull();
    expect(purchaseBlocker('avatar-rocket', rich({}, 80))).toBeNull();
    expect(purchaseBlocker('freeze-checkin', rich())).toBeNull();
  });

  it('checks the reasons in order', () => {
    // Owned and broke: owned wins over coins.
    const brokeOwner = snap({
      ledger: [earned(150), bought('theme-ocean'), bought('freeze-logging', 'p1')],
    });
    expect(coinBalance(brokeOwner.tables.ledger)).toBe(-50);
    expect(purchaseBlocker('theme-ocean', brokeOwner)).toBe('You already own this.');

    // At the freeze limit and broke: the limit wins over coins.
    const brokeHolder = snap({
      ledger: [earned(100), bought('freeze-logging', 'p1'), bought('freeze-logging', 'p2')],
    });
    expect(coinBalance(brokeHolder.tables.ledger)).toBe(0);
    expect(purchaseBlocker('freeze-logging', brokeHolder)).toBe('You can hold 2 at a time.');
  });

  it('counts the freezes held, not the freezes ever bought', () => {
    const twoBought = [
      earned(1_000),
      bought('freeze-logging', 'p1'),
      bought('freeze-logging', 'p2'),
    ];
    // One was spent, so one is held.
    const oneSpent = snap({ ledger: twoBought, streakFreeze: [makeStreakFreeze()] });
    expect(purchaseBlocker('freeze-logging', oneSpent)).toBeNull();
    // Each freeze has its own limit.
    expect(purchaseBlocker('freeze-checkin', snap({ ledger: twoBought }))).toBeNull();
  });
});

describe('purchaseEntry', () => {
  it('records a purchase as negative coins', () => {
    expect(purchaseEntry('theme-ocean', 'p1', now)).toEqual({
      id: 'shop:theme-ocean:p1#0',
      createdAt: now,
      updatedAt: now,
      key: 'shop:theme-ocean:p1',
      kind: 'purchase',
      xp: 0,
      coins: -150,
      label: 'Bought: Ocean',
    });
  });

  it('writes a freeze under the key the streak counts', () => {
    expect(purchaseEntry('freeze-checkin', 'p9', now)).toMatchObject({
      key: 'shop:freeze-checkin:p9',
      coins: -80,
      label: 'Bought: Check-in streak freeze',
    });
  });

  it('refuses an item that is not in the shop', () => {
    expect(() => purchaseEntry('theme-unicorn', 'p1', now)).toThrow(RangeError);
  });
});

describe('equippedCosmetics', () => {
  const equip = (cosmetics: Partial<typeof DEFAULT_COSMETICS>) =>
    makeSettings({ cosmetics: { ...DEFAULT_COSMETICS, ...cosmetics } });

  it('wears what is equipped and owned', () => {
    const owned = ownedItems([bought('theme-ocean'), bought('avatar-cat'), bought('frame-gold')]);
    const settings = equip({ theme: 'theme-ocean', avatar: 'avatar-cat', frame: 'frame-gold' });
    expect(equippedCosmetics(settings, owned)).toEqual({
      theme: 'theme-ocean',
      avatar: 'avatar-cat',
      frame: 'frame-gold',
    });
  });

  it('falls back to defaults for unowned cosmetics', () => {
    const owned = ownedItems([bought('theme-ocean')]);
    const settings = equip({ theme: 'theme-ocean', avatar: 'avatar-rocket', frame: 'frame-gold' });
    expect(equippedCosmetics(settings, owned)).toEqual({
      theme: 'theme-ocean',
      avatar: 'avatar-sprout',
      frame: 'frame-none',
    });
  });

  it('falls back to defaults for ids that are unknown or belong to another slot', () => {
    const owned = ownedItems([bought('avatar-cat'), bought('freeze-logging')]);
    const settings = equip({
      theme: 'theme-unicorn',
      avatar: 'freeze-logging',
      frame: 'avatar-cat',
    });
    expect(equippedCosmetics(settings, owned)).toEqual(DEFAULT_COSMETICS);
  });

  it('wears the defaults when there are no settings yet', () => {
    expect(equippedCosmetics(undefined, ownedItems([]))).toEqual(DEFAULT_COSMETICS);
  });
});
