import { describe, expect, it } from 'vitest';
import {
  localIso,
  makeLedgerEntry,
  makeLegacyPurchase,
  makeSettings,
  makeStreakFreeze,
} from '@/test/fixtures';
import { defaultSettings, type LedgerEntry } from '../entities';
import { emptySnapshot, type DataSnapshot } from '../snapshot';
import {
  coinBalance,
  DEFAULT_COSMETICS,
  equippedCosmetics,
  FREEZE_LIMIT,
  ownedItems,
  purchaseBlocker,
  purchaseEntry,
  RETIRED_THEMES,
  SHOP_ITEMS,
  THEMES,
  themeKind,
  wearSlot,
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

describe('THEMES', () => {
  it('lists the twelve themes in the order of the Shop, with their kind and price', () => {
    expect(THEMES.map((t) => [t.id, t.name, t.kind, t.price])).toEqual([
      ['theme-mono', 'Black & White', 'free', 0],
      ['theme-sky', 'Sunny Sky', 'light', 400],
      ['theme-lemon', 'Lemon Mint', 'light', 400],
      ['theme-pastel', 'Pastel', 'light', 400],
      ['theme-daisy', 'Daisy Sage', 'light', 400],
      ['theme-peach', 'Peach Sorbet', 'light', 450],
      ['theme-powder', 'Powder Blue', 'light', 450],
      ['theme-seafoam', 'Seafoam', 'light', 450],
      ['theme-navy', 'Midnight Navy', 'dark', 600],
      ['theme-forest', 'Forest Night', 'dark', 600],
      ['theme-plum', 'Plum Night', 'dark', 600],
      ['theme-espresso', 'Espresso', 'dark', 600],
    ]);
  });

  it('retires the 0.11 themes into the ones that replace them', () => {
    expect(RETIRED_THEMES).toEqual({
      'theme-violet': 'theme-mono',
      'theme-ocean': 'theme-powder',
      'theme-orchid': 'theme-pastel',
      'theme-graphite': 'theme-navy',
    });
    // Each replacement is a theme that exists.
    for (const replacement of Object.values(RETIRED_THEMES)) {
      expect(THEMES.map((t) => t.id)).toContain(replacement);
    }
  });

  it('says what kind a theme is, a retired one by the theme it became', () => {
    expect(themeKind('theme-mono')).toBe('free');
    expect(themeKind('theme-sky')).toBe('light');
    expect(themeKind('theme-espresso')).toBe('dark');
    expect(themeKind('theme-violet')).toBe('free');
    expect(themeKind('theme-ocean')).toBe('light');
    expect(themeKind('theme-graphite')).toBe('dark');
    expect(themeKind('theme-unicorn')).toBeUndefined();
    expect(themeKind('constructor')).toBeUndefined();
    expect(themeKind('avatar-cat')).toBeUndefined();
  });
});

describe('SHOP_ITEMS', () => {
  it('lists the catalogue in order: the themes, the avatars, the freezes', () => {
    expect(SHOP_ITEMS.map((i) => [i.slot, i.id, i.name, i.price])).toEqual([
      ['theme', 'theme-mono', 'Black & White', 0],
      ['theme', 'theme-sky', 'Sunny Sky', 400],
      ['theme', 'theme-lemon', 'Lemon Mint', 400],
      ['theme', 'theme-pastel', 'Pastel', 400],
      ['theme', 'theme-daisy', 'Daisy Sage', 400],
      ['theme', 'theme-peach', 'Peach Sorbet', 450],
      ['theme', 'theme-powder', 'Powder Blue', 450],
      ['theme', 'theme-seafoam', 'Seafoam', 450],
      ['theme', 'theme-navy', 'Midnight Navy', 600],
      ['theme', 'theme-forest', 'Forest Night', 600],
      ['theme', 'theme-plum', 'Plum Night', 600],
      ['theme', 'theme-espresso', 'Espresso', 600],
      ['avatar', 'avatar-sprout', 'Sprout', 0],
      ['avatar', 'avatar-rocket', 'Rocket', 80],
      ['avatar', 'avatar-cat', 'Cat', 80],
      ['avatar', 'avatar-mountain', 'Mountain', 80],
      ['avatar', 'avatar-anchor', 'Anchor', 80],
      ['avatar', 'avatar-crown', 'Crown', 120],
      ['avatar', 'avatar-gem', 'Gem', 120],
      ['freeze', 'freeze-logging', 'Logging streak freeze', 50],
      ['freeze', 'freeze-checkin', 'Check-in streak freeze', 80],
    ]);
  });

  it('sells no frames: borders come with the level', () => {
    expect(SHOP_ITEMS.filter((i) => i.id.startsWith('frame-'))).toEqual([]);
  });

  it('has the default theme and avatar for free, and holds 2 freezes at most', () => {
    const free = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id);
    expect(free).toEqual([DEFAULT_COSMETICS.theme, DEFAULT_COSMETICS.avatar]);
    expect(FREEZE_LIMIT).toBe(2);
  });

  it('starts everyone in Black & White, as new settings do', () => {
    expect(DEFAULT_COSMETICS).toEqual({
      theme: 'theme-mono',
      avatar: 'avatar-sprout',
      frame: 'frame-none',
    });
    expect(defaultSettings(now).cosmetics).toEqual(DEFAULT_COSMETICS);
  });
});

describe('ownedItems', () => {
  it('owns the free items and what was bought', () => {
    expect(ownedItems([], 1)).toEqual(new Set(['theme-mono', 'avatar-sprout', 'frame-none']));

    const owned = ownedItems([earned(500), bought('theme-sky'), bought('freeze-logging')], 1);
    expect(owned).toEqual(
      new Set(['theme-mono', 'avatar-sprout', 'frame-none', 'theme-sky', 'freeze-logging']),
    );
  });

  it('counts only purchases of items in the shop', () => {
    const owned = ownedItems(
      [
        makeLedgerEntry({ key: 'shop:avatar-cat:p1', kind: 'reversal', xp: 0, coins: 80 }),
        makeLedgerEntry({ key: 'shop:avatar-unicorn:p1', kind: 'purchase', xp: 0, coins: -80 }),
        makeLedgerEntry({ key: 'badge:first-expense', kind: 'award' }),
      ],
      1,
    );
    expect(owned).toEqual(new Set(['theme-mono', 'avatar-sprout', 'frame-none']));
  });

  // Owned below the level it is named for, never; from it, always.
  it.each([
    ['frame-bronze', 5],
    ['frame-silver', 11],
    ['frame-gold', 21],
    ['frame-platinum', 31],
    ['frame-diamond', 41],
    ['frame-prism', 50],
  ])('owns the %s border from level %i, and not the level before', (border, level) => {
    expect(ownedItems([], level - 1).has(border)).toBe(false);
    expect(ownedItems([], level).has(border)).toBe(true);
    expect(ownedItems([], 50).has(border)).toBe(true);
  });

  it('owns every border below the level, and no more', () => {
    const frames = (level: number) => [...ownedItems([], level)].filter((id) => /^frame-/.test(id));
    expect(frames(1)).toEqual(['frame-none']);
    expect(frames(12).sort()).toEqual(['frame-bronze', 'frame-none', 'frame-silver']);
    expect(frames(50)).toHaveLength(7);
  });

  it('keeps a frame bought in 0.11, whatever the level', () => {
    const ledger = [makeLegacyPurchase('frame-gold', 200), makeLegacyPurchase('frame-game', 100)];
    const owned = ownedItems(ledger, 1);
    expect(owned.has('frame-gold')).toBe(true);
    expect(owned.has('frame-game')).toBe(true);
    expect(owned.has('frame-silver')).toBe(false);
    expect(owned.has('frame-diamond')).toBe(false);
  });

  it('does not own frame-game by level', () => {
    expect(ownedItems([], 50).has('frame-game')).toBe(false);
  });

  it.each([
    ['theme-ocean', 'theme-powder'],
    ['theme-orchid', 'theme-pastel'],
    ['theme-graphite', 'theme-navy'],
  ])('owns %s as the %s that replaced it', (retired, replacement) => {
    const owned = ownedItems([makeLegacyPurchase(retired, 150)], 1);
    expect(owned.has(replacement)).toBe(true);
    expect(owned.has(retired)).toBe(false);
    expect(owned).toEqual(new Set(['theme-mono', 'avatar-sprout', 'frame-none', replacement]));
  });
});

describe('coinBalance', () => {
  it('is the coins the ledger adds up to', () => {
    expect(coinBalance([])).toBe(0);
    expect(coinBalance([earned(500), bought('theme-sky')])).toBe(100);
  });

  it('is not touched by a retired theme reading as a new one', () => {
    // 150 coins were spent on Ocean in 0.11, and stay spent.
    const ledger = [earned(500), makeLegacyPurchase('theme-ocean', 150)];
    expect(coinBalance(ledger)).toBe(350);
    expect(ownedItems(ledger, 1).has('theme-powder')).toBe(true);
    expect(coinBalance(ledger)).toBe(350);
    expect(purchaseBlocker('theme-powder', snap({ ledger }))).toBe('You already own this.');
  });
});

describe('purchaseBlocker', () => {
  const rich = (extra: Partial<DataSnapshot['tables']> = {}, coins = 1_000) =>
    snap({ ledger: [earned(coins)], ...extra });

  it('blocks purchases with a reason', () => {
    expect(purchaseBlocker('theme-unicorn', rich())).toBe("That item isn't in the shop.");

    const owning = rich({ ledger: [earned(1_000), bought('theme-sky')] });
    expect(purchaseBlocker('theme-sky', owning)).toBe('You already own this.');
    expect(purchaseBlocker('theme-mono', rich())).toBe('You already own this.');

    const holdingTwo = rich({
      ledger: [earned(1_000), bought('freeze-logging', 'p1'), bought('freeze-logging', 'p2')],
    });
    expect(purchaseBlocker('freeze-logging', holdingTwo)).toBe('You can hold 2 at a time.');

    expect(purchaseBlocker('avatar-rocket', rich({}, 79))).toBe('Not enough coins.');
    expect(purchaseBlocker('theme-sky', rich({}, 399))).toBe('Not enough coins.');
    expect(purchaseBlocker('theme-navy', rich({}, 599))).toBe('Not enough coins.');
  });

  it('does not sell the old themes or any frame', () => {
    expect(purchaseBlocker('theme-ocean', rich())).toBe("That item isn't in the shop.");
    expect(purchaseBlocker('frame-gold', rich())).toBe("That item isn't in the shop.");
    expect(purchaseBlocker('frame-game', rich())).toBe("That item isn't in the shop.");
  });

  it('allows a purchase when nothing stands in the way', () => {
    expect(purchaseBlocker('theme-sky', rich())).toBeNull();
    expect(purchaseBlocker('theme-sky', rich({}, 400))).toBeNull();
    expect(purchaseBlocker('avatar-rocket', rich({}, 80))).toBeNull();
    expect(purchaseBlocker('freeze-checkin', rich())).toBeNull();
  });

  it('checks the reasons in order', () => {
    // Owned and broke: owned wins over coins.
    const brokeOwner = snap({
      ledger: [earned(400), bought('theme-sky'), bought('freeze-logging', 'p1')],
    });
    expect(coinBalance(brokeOwner.tables.ledger)).toBe(-50);
    expect(purchaseBlocker('theme-sky', brokeOwner)).toBe('You already own this.');

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
    expect(purchaseEntry('theme-sky', 'p1', now)).toEqual({
      id: 'shop:theme-sky:p1#0',
      createdAt: now,
      updatedAt: now,
      key: 'shop:theme-sky:p1',
      kind: 'purchase',
      xp: 0,
      coins: -400,
      label: 'Bought: Sunny Sky',
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
    expect(() => purchaseEntry('theme-ocean', 'p1', now)).toThrow(RangeError);
    expect(() => purchaseEntry('frame-gold', 'p1', now)).toThrow(RangeError);
  });
});

describe('wearSlot', () => {
  it('names the slot an item is worn in', () => {
    expect(wearSlot('theme-navy')).toBe('theme');
    expect(wearSlot('avatar-cat')).toBe('avatar');
    expect(wearSlot('frame-none')).toBe('frame');
    expect(wearSlot('frame-prism')).toBe('frame');
    expect(wearSlot('frame-game')).toBe('frame');
  });

  it('names none for what is not worn', () => {
    expect(wearSlot('freeze-logging')).toBeUndefined();
    expect(wearSlot('theme-ocean')).toBeUndefined();
    expect(wearSlot('frame-unknown')).toBeUndefined();
  });
});

describe('equippedCosmetics', () => {
  const equip = (cosmetics: Partial<typeof DEFAULT_COSMETICS>) =>
    makeSettings({ cosmetics: { ...DEFAULT_COSMETICS, ...cosmetics } });

  it('wears what is equipped and owned', () => {
    const owned = ownedItems([bought('theme-sky'), bought('avatar-cat')], 21);
    const settings = equip({ theme: 'theme-sky', avatar: 'avatar-cat', frame: 'frame-gold' });
    expect(equippedCosmetics(settings, owned)).toEqual({
      theme: 'theme-sky',
      avatar: 'avatar-cat',
      frame: 'frame-gold',
    });
  });

  it('falls back to defaults for unowned cosmetics', () => {
    const owned = ownedItems([bought('theme-sky')], 1);
    const settings = equip({ theme: 'theme-sky', avatar: 'avatar-rocket', frame: 'frame-gold' });
    expect(equippedCosmetics(settings, owned)).toEqual({
      theme: 'theme-sky',
      avatar: 'avatar-sprout',
      frame: 'frame-none',
    });
    expect(equippedCosmetics(equip({ theme: 'theme-navy' }), owned).theme).toBe('theme-mono');
  });

  it('wears a frame bought in 0.11 at level 1', () => {
    const owned = ownedItems([makeLegacyPurchase('frame-gold', 200)], 1);
    expect(equippedCosmetics(equip({ frame: 'frame-gold' }), owned).frame).toBe('frame-gold');
  });

  it('puts a border the level has not reached back to none', () => {
    const owned = ownedItems([], 12);
    expect(equippedCosmetics(equip({ frame: 'frame-diamond' }), owned).frame).toBe('frame-none');
    expect(equippedCosmetics(equip({ frame: 'frame-silver' }), owned).frame).toBe('frame-silver');
    // Frame-game is only for those who bought it.
    expect(equippedCosmetics(equip({ frame: 'frame-game' }), ownedItems([], 50)).frame).toBe(
      'frame-none',
    );
  });

  it('reads a retired theme as the theme that replaced it, owned through the old purchase', () => {
    const owned = ownedItems([makeLegacyPurchase('theme-ocean', 150)], 1);
    expect(equippedCosmetics(equip({ theme: 'theme-ocean' }), owned).theme).toBe('theme-powder');
  });

  it('reads the old default as Black & White', () => {
    const owned = ownedItems([], 1);
    expect(equippedCosmetics(equip({ theme: 'theme-violet' }), owned).theme).toBe('theme-mono');
  });

  it('does not give a retired theme that was never bought', () => {
    const owned = ownedItems([], 1);
    for (const retired of ['theme-ocean', 'theme-orchid', 'theme-graphite']) {
      expect(equippedCosmetics(equip({ theme: retired }), owned).theme).toBe('theme-mono');
    }
  });

  it('falls back to defaults for ids that are unknown or belong to another slot', () => {
    const owned = ownedItems([bought('avatar-cat'), bought('freeze-logging')], 1);
    const settings = equip({
      theme: 'theme-unicorn',
      avatar: 'freeze-logging',
      frame: 'avatar-cat',
    });
    expect(equippedCosmetics(settings, owned)).toEqual(DEFAULT_COSMETICS);
    expect(equippedCosmetics(equip({ theme: 'constructor' }), owned)).toEqual(DEFAULT_COSMETICS);
  });

  it('wears the defaults when there are no settings yet', () => {
    expect(equippedCosmetics(undefined, ownedItems([], 1))).toEqual(DEFAULT_COSMETICS);
  });
});
