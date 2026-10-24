import type { Account } from './entities';

/**
 * The colour of each card skin's mark, the small card drawn beside an account's name in Recent and
 * History: one solid colour for each of the six skins (spec §11), the deep end of the skin's
 * gradient. They are card colours, not theme colours, so they are the one place a raw colour is
 * written for a screen. Each is chosen for the page it sits on: dark enough to hold 3:1 on the light
 * page in every theme (the ink's 35% outline cannot carry it there), and, on the dark page, held
 * by that outline. tests/unit/tokens.test.ts pins it.
 */
export const SKIN_COLORS = {
  midnight: '#4a4565',
  violet: '#6d4aff',
  mint: '#0c7a57',
  amber: '#b45309',
  ocean: '#1d4ed8',
  rose: '#be185d',
} as const;

/** The account a mark stands for, and the colour it is drawn in. */
export interface CardMark {
  name: string;
  /** The last 4 digits, or `null` for an account without them (cash, savings). */
  last4: string | null;
  /** A solid colour from `SKIN_COLORS`. */
  color: string;
}

/** The colour of a skin: a skin this app does not know (a preset added later) takes midnight's. */
function skinColor(skin: string): string {
  return Object.hasOwn(SKIN_COLORS, skin)
    ? SKIN_COLORS[skin as keyof typeof SKIN_COLORS]
    : SKIN_COLORS.midnight;
}

/** What an account looks like as a mark: its name, its last 4 digits and its skin's colour. */
export function cardMark(account: Pick<Account, 'name' | 'last4' | 'skin'>): CardMark {
  return { name: account.name, last4: account.last4, color: skinColor(account.skin) };
}

/** "Main account ·· 4312": a card by its name and, when it has them, its last 4 digits. */
export const cardLabel = ({ name, last4 }: Pick<CardMark, 'name' | 'last4'>): string =>
  last4 ? `${name} ·· ${last4}` : name;
