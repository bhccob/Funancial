import { describe, expect, it } from 'vitest';
import { makeAccount } from '@/test/fixtures';
import { defaultsFor } from './accounts';
import { cardMark, markLabel, SKIN_COLORS } from './cardMark';
import type { AccountKind } from './entities';

const SKINS = ['midnight', 'violet', 'mint', 'amber', 'ocean', 'rose'] as const;
const KINDS: AccountKind[] = ['debit', 'cash', 'savings', 'credit'];

describe('cardMark', () => {
  it('gives each of the six skins one solid colour of its own', () => {
    expect(Object.keys(SKIN_COLORS).sort()).toEqual([...SKINS].sort());
    const colors = SKINS.map((skin) => cardMark(makeAccount({ skin })).color);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(colors).size).toBe(SKINS.length);
  });

  it('names the account and its last 4 digits, or null with none', () => {
    expect(cardMark(makeAccount({ name: 'Main account', last4: '4312' }))).toMatchObject({
      name: 'Main account',
      last4: '4312',
    });
    expect(cardMark(makeAccount({ name: 'Cash wallet', last4: null }))).toMatchObject({
      name: 'Cash wallet',
      last4: null,
    });
  });

  it('falls back to midnight for a skin it does not know', () => {
    const midnight = cardMark(makeAccount({ skin: 'midnight' })).color;
    expect(cardMark(makeAccount({ skin: 'neon-pink' })).color).toBe(midnight);
    expect(cardMark(makeAccount({ skin: 'constructor' })).color).toBe(midnight);
    expect(cardMark(makeAccount({ skin: '__proto__' })).color).toBe(midnight);
  });

  it('colours the skin each kind of account starts with', () => {
    for (const kind of KINDS) {
      const { skin } = defaultsFor(kind);
      expect(Object.keys(SKIN_COLORS), `${kind}'s ${skin}`).toContain(skin);
    }
  });
});

describe('markLabel', () => {
  it('writes a card as its name and its last 4 digits, or the name alone with none', () => {
    expect(markLabel({ name: 'Main account', last4: '4312' })).toBe('Main account ·· 4312');
    expect(markLabel({ name: 'Cash wallet', last4: null })).toBe('Cash wallet');
  });

  it('takes an account or a mark alike', () => {
    const account = makeAccount({ name: 'Visa', last4: '4242' });
    expect(markLabel(account)).toBe('Visa ·· 4242');
    expect(markLabel(cardMark(account))).toBe('Visa ·· 4242');
  });
});
