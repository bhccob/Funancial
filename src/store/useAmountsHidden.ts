import { create } from 'zustand';
import { safeStorage } from '@/lib/safeStorage';

/** Whether amounts are hidden, kept on this device; shown until the person hides them. */
const KEY = 'funancial.hideAmounts';

/** What a hidden amount is drawn as. */
export const HIDDEN_AMOUNT = '••••';

/**
 * The eye on Home. It lives beside the data, not in it: it is a choice about this screen, so it is
 * not part of a backup or the account's copy, and it is the same in demo mode. `useMoney` and
 * `useInvestMoney` read it, so everything they write is hidden without its callers changing.
 */
export const useAmountsHidden = create<{ hidden: boolean; toggle(): void }>()((set, get) => ({
  hidden: safeStorage.get(KEY) === 'true',
  toggle: () => {
    const hidden = !get().hidden;
    safeStorage.set(KEY, String(hidden));
    set({ hidden });
  },
}));
