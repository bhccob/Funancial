import { create } from 'zustand';

/** The latest spend saved on an account: which one, how much (minor units) and when (epoch ms). */
export interface LastSpend {
  accountId: string;
  amount: number;
  at: number;
}

/**
 * The spend the person has just saved on a card, for the Cards tab's "just now" badge on it. Pay and
 * the Add form call `record` once a spend has gone through; the Cards tab reads it. It lives beside
 * the data, not in it, as the eye on Home does, and in memory only: it is a moment, not a record
 * (History has the record), so it is gone when the app is closed. Only the latest spend is kept, and
 * each is a new object, so a screen can tell one it has already shown from a repeat of the same
 * amount.
 */
export const useLastSpend = create<{
  last: LastSpend | null;
  record(accountId: string, amount: number): void;
}>()((set) => ({
  last: null,
  record: (accountId, amount) => set({ last: { accountId, amount, at: Date.now() } }),
}));
