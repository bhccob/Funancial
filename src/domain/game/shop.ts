import type { Cosmetics, LedgerEntry, Settings } from '../entities';
import type { DataSnapshot } from '../snapshot';
import { ledgerId, ledgerTotals } from './ledger';
import { BORDERS, bordersAt, levelInfo } from './levels';
import { freezeTokensHeld } from './streaks';

/** What a theme's top block is: Black & White is the free one, and its block is dark. */
export type ThemeKind = 'free' | 'light' | 'dark';

export type GameTheme = { id: string; name: string; kind: ThemeKind; price: number };

/**
 * The twelve themes, in the order of the Shop (design/redesign-v3/glass-themes.html). themes.css
 * styles each as `[data-game-theme=<id without "theme-">]`.
 */
export const THEMES: readonly GameTheme[] = [
  { id: 'theme-mono', name: 'Black & White', kind: 'free', price: 0 },
  { id: 'theme-sky', name: 'Sunny Sky', kind: 'light', price: 400 },
  { id: 'theme-lemon', name: 'Lemon Mint', kind: 'light', price: 400 },
  { id: 'theme-pastel', name: 'Pastel', kind: 'light', price: 400 },
  { id: 'theme-daisy', name: 'Daisy Sage', kind: 'light', price: 400 },
  { id: 'theme-peach', name: 'Peach Sorbet', kind: 'light', price: 450 },
  { id: 'theme-powder', name: 'Powder Blue', kind: 'light', price: 450 },
  { id: 'theme-seafoam', name: 'Seafoam', kind: 'light', price: 450 },
  { id: 'theme-navy', name: 'Midnight Navy', kind: 'dark', price: 600 },
  { id: 'theme-forest', name: 'Forest Night', kind: 'dark', price: 600 },
  { id: 'theme-plum', name: 'Plum Night', kind: 'dark', price: 600 },
  { id: 'theme-espresso', name: 'Espresso', kind: 'dark', price: 600 },
];

/**
 * The themes 0.11 sold, and the theme each reads as now. Whoever owned or wore one still does, as the
 * new one, and the coins spent on it stay spent. Nothing is rewritten: stored ids are read through this.
 */
export const RETIRED_THEMES: Readonly<Record<string, string>> = {
  'theme-violet': 'theme-mono',
  'theme-ocean': 'theme-powder',
  'theme-orchid': 'theme-pastel',
  'theme-graphite': 'theme-navy',
};

/** The theme an id reads as: a retired theme's replacement, any other id as it is. */
const themeNow = (id: string): string =>
  Object.hasOwn(RETIRED_THEMES, id) ? (RETIRED_THEMES[id] ?? id) : id;

/** A theme's kind by id (a retired theme by the one that replaced it), or `undefined` for no theme. */
export function themeKind(id: string): ThemeKind | undefined {
  const now = themeNow(id);
  return THEMES.find((t) => t.id === now)?.kind;
}

/** What the Shop sells. Frames are not sold: borders come with the level. */
export type ShopSlot = 'theme' | 'avatar' | 'freeze';

export type ShopItem = { id: string; slot: ShopSlot; name: string; price: number };

export const SHOP_ITEMS: readonly ShopItem[] = [
  ...THEMES.map(({ id, name, price }): ShopItem => ({ id, slot: 'theme', name, price })),
  { id: 'avatar-sprout', slot: 'avatar', name: 'Sprout', price: 0 },
  { id: 'avatar-rocket', slot: 'avatar', name: 'Rocket', price: 80 },
  { id: 'avatar-cat', slot: 'avatar', name: 'Cat', price: 80 },
  { id: 'avatar-mountain', slot: 'avatar', name: 'Mountain', price: 80 },
  { id: 'avatar-anchor', slot: 'avatar', name: 'Anchor', price: 80 },
  { id: 'avatar-crown', slot: 'avatar', name: 'Crown', price: 120 },
  { id: 'avatar-gem', slot: 'avatar', name: 'Gem', price: 120 },
  { id: 'freeze-logging', slot: 'freeze', name: 'Logging streak freeze', price: 50 },
  { id: 'freeze-checkin', slot: 'freeze', name: 'Check-in streak freeze', price: 80 },
];

export const DEFAULT_COSMETICS: Cosmetics = {
  theme: 'theme-mono',
  avatar: 'avatar-sprout',
  frame: 'frame-none',
};

/** How many freezes of one kind can be held, bought and not yet spent. */
export const FREEZE_LIMIT = 2;

/** The streak each freeze protects. */
const FREEZE_STREAK: Readonly<Record<string, 'logging' | 'checkin'>> = {
  'freeze-logging': 'logging',
  'freeze-checkin': 'checkin',
};

const findItem = (id: string): ShopItem | undefined => SHOP_ITEMS.find((i) => i.id === id);

/**
 * Every frame there is: none, the level borders, and 0.11's `frame-game`. A frame bought in 0.11 stays
 * wearable (`frame-game` only so); the rest are worn from their level.
 */
const FRAME_IDS: ReadonlySet<string> = new Set([
  'frame-none',
  ...BORDERS.map((b) => b.id),
  'frame-game',
]);

/** The slot an id is worn in, or `undefined` for what is not worn (a freeze, or no item at all). */
export function wearSlot(id: string): keyof Cosmetics | undefined {
  const item = findItem(id);
  if (item) return item.slot === 'freeze' ? undefined : item.slot;
  return FRAME_IDS.has(id) ? 'frame' : undefined;
}

/**
 * The ids of everything owned: the free items; everything the ledger holds a purchase of (a retired
 * theme as the theme that replaced it, a frame bought in 0.11 as itself); `frame-none`; and the borders
 * `level` has reached.
 */
export function ownedItems(ledger: readonly LedgerEntry[], level: number): Set<string> {
  const purchases = ledger.filter((e) => e.kind === 'purchase');
  const bought = (id: string) => purchases.some((e) => e.key.startsWith(`shop:${id}:`));
  const owned = new Set<string>(['frame-none', ...bordersAt(level)]);
  for (const item of SHOP_ITEMS) if (item.price === 0 || bought(item.id)) owned.add(item.id);
  for (const [retired, now] of Object.entries(RETIRED_THEMES)) if (bought(retired)) owned.add(now);
  for (const frame of FRAME_IDS) if (bought(frame)) owned.add(frame);
  return owned;
}

/** The coins left to spend: what was earned, less what was bought. */
export function coinBalance(ledger: readonly LedgerEntry[]): number {
  return ledgerTotals(ledger).coins;
}

/**
 * Why `itemId` cannot be bought now, or `null` when it can. A cosmetic is bought once; a freeze can
 * be bought again while fewer than `FREEZE_LIMIT` are held.
 */
export function purchaseBlocker(itemId: string, data: DataSnapshot): string | null {
  const item = findItem(itemId);
  if (!item) return "That item isn't in the shop.";

  const { ledger } = data.tables;
  const level = levelInfo(ledgerTotals(ledger).xp).level;
  if (item.slot !== 'freeze' && ownedItems(ledger, level).has(item.id)) {
    return 'You already own this.';
  }

  const streak = FREEZE_STREAK[item.id];
  if (streak && freezeTokensHeld(data, streak) >= FREEZE_LIMIT) return 'You can hold 2 at a time.';

  if (coinBalance(ledger) < item.price) return 'Not enough coins.';
  return null;
}

/** The ledger entry for buying `itemId`, taking its price out of the coins. */
export function purchaseEntry(itemId: string, purchaseId: string, now: string): LedgerEntry {
  const item = findItem(itemId);
  if (!item) throw new RangeError(`Not an item in the shop: ${itemId}`);
  const key = `shop:${item.id}:${purchaseId}`;
  return {
    id: ledgerId(key, 0),
    createdAt: now,
    updatedAt: now,
    key,
    kind: 'purchase',
    xp: 0,
    coins: -item.price,
    label: `Bought: ${item.name}`,
  };
}

/**
 * What the person wears: each slot's equipped item, or its default when not owned or not known. A
 * retired theme is read as the one that replaced it, and a border the level has not reached is none.
 */
export function equippedCosmetics(
  settings: Pick<Settings, 'cosmetics'> | undefined,
  owned: ReadonlySet<string>,
): Cosmetics {
  const pick = (slot: keyof Cosmetics): string => {
    const stored = settings?.cosmetics[slot];
    const id = stored !== undefined && slot === 'theme' ? themeNow(stored) : stored;
    return id !== undefined && wearSlot(id) === slot && owned.has(id)
      ? id
      : DEFAULT_COSMETICS[slot];
  };
  return { theme: pick('theme'), avatar: pick('avatar'), frame: pick('frame') };
}
