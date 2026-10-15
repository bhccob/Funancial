import type { Cosmetics, LedgerEntry, Settings } from '../entities';
import type { DataSnapshot } from '../snapshot';
import { ledgerId, ledgerTotals } from './ledger';
import { freezeTokensHeld } from './streaks';

export type ShopSlot = 'theme' | 'avatar' | 'frame' | 'freeze';

export type ShopItem = { id: string; slot: ShopSlot; name: string; price: number };

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'theme-violet', slot: 'theme', name: 'Violet', price: 0 },
  { id: 'theme-ocean', slot: 'theme', name: 'Ocean', price: 150 },
  { id: 'theme-orchid', slot: 'theme', name: 'Orchid', price: 150 },
  { id: 'theme-graphite', slot: 'theme', name: 'Graphite', price: 150 },
  { id: 'avatar-sprout', slot: 'avatar', name: 'Sprout', price: 0 },
  { id: 'avatar-rocket', slot: 'avatar', name: 'Rocket', price: 80 },
  { id: 'avatar-cat', slot: 'avatar', name: 'Cat', price: 80 },
  { id: 'avatar-mountain', slot: 'avatar', name: 'Mountain', price: 80 },
  { id: 'avatar-anchor', slot: 'avatar', name: 'Anchor', price: 80 },
  { id: 'avatar-crown', slot: 'avatar', name: 'Crown', price: 120 },
  { id: 'avatar-gem', slot: 'avatar', name: 'Gem', price: 120 },
  { id: 'frame-none', slot: 'frame', name: 'No frame', price: 0 },
  { id: 'frame-silver', slot: 'frame', name: 'Silver', price: 100 },
  { id: 'frame-gold', slot: 'frame', name: 'Gold', price: 200 },
  { id: 'frame-game', slot: 'frame', name: 'Game color', price: 100 },
  { id: 'freeze-logging', slot: 'freeze', name: 'Logging streak freeze', price: 50 },
  { id: 'freeze-checkin', slot: 'freeze', name: 'Check-in streak freeze', price: 80 },
];

export const DEFAULT_COSMETICS: Cosmetics = {
  theme: 'theme-violet',
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

/** The ids of everything free, plus everything the ledger holds a purchase of. */
export function ownedItems(ledger: readonly LedgerEntry[]): Set<string> {
  const purchases = ledger.filter((e) => e.kind === 'purchase');
  return new Set(
    SHOP_ITEMS.filter(
      (item) => item.price === 0 || purchases.some((e) => e.key.startsWith(`shop:${item.id}:`)),
    ).map((item) => item.id),
  );
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
  if (item.slot !== 'freeze' && ownedItems(ledger).has(item.id)) return 'You already own this.';

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

/** What the person wears: each slot's equipped item, or its default when not owned or not known. */
export function equippedCosmetics(
  settings: Pick<Settings, 'cosmetics'> | undefined,
  owned: ReadonlySet<string>,
): Cosmetics {
  const pick = (slot: keyof Cosmetics): string => {
    const id = settings?.cosmetics[slot];
    const item = id === undefined ? undefined : findItem(id);
    return item?.slot === slot && owned.has(item.id) ? item.id : DEFAULT_COSMETICS[slot];
  };
  return { theme: pick('theme'), avatar: pick('avatar'), frame: pick('frame') };
}
