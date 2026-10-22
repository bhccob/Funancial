import { useMemo } from 'react';
import { create } from 'zustand';
import { selectedAccount } from '@/domain/accounts';
import { accountBalance, type AccountRow } from '@/domain/balances';
import { safeStorage } from '@/lib/safeStorage';
import { useApp } from './AppStoreProvider';
import { useToday } from './useFinance';

/** Which account is selected, kept on this device; none until a card is picked. */
const KEY = 'funancial.selectedAccount';

/**
 * The card in the middle of the Cards carousel, which is also the account Home shows. It lives
 * beside the data, not in it, as the eye on Home does: it is a choice about these screens, so it
 * is not part of the account's copy, and it is the same in demo mode. It holds the id as it was
 * picked; whether that account is still in use is for `selectedAccount` to say, so an account
 * archived since falls back without this being rewritten. Read it through `useSelectedAccountRow`.
 */
export const useSelectedAccount = create<{ id: string | null; select(id: string): void }>()(
  (set) => ({
    id: safeStorage.get(KEY) || null,
    select: (id) => {
      safeStorage.set(KEY, id);
      set({ id });
    },
  }),
);

/**
 * The selected account and what it holds (or, for a card, owes) today, the row the finance view's
 * `accounts` has for it: the stored one while it is in use, else the default account, else the first
 * in use, else `null` with no account in use. Re-renders when the selection, the accounts or
 * their balances change.
 */
export function useSelectedAccountRow(): AccountRow | null {
  const storedId = useSelectedAccount((s) => s.id);
  const data = useApp((s) => s.data);
  const today = useToday();
  return useMemo(() => {
    const account = selectedAccount(data, today, storedId);
    return account ? { account, balance: accountBalance(account, data, today) } : null;
  }, [data, today, storedId]);
}
