/* eslint-disable react-refresh/only-export-components -- the hooks sit with the field they feed */
import { useMemo } from 'react';
import { Select } from '@/components/ui/Select';
import { activeAccounts, defaultAccount } from '@/domain/accounts';
import type { Account } from '@/domain/entities';
import { useApp } from '@/store/AppStoreProvider';
import { useToday } from '@/store/useFinance';

/**
 * Narrows an account picker to the accounts that hold money: a bank account, cash or savings, never
 * a credit card. For the accounts that pay, and the ones income goes into. Module-level, as
 * `useAccountOptions` wants a filter that keeps its identity.
 */
export const NOT_CREDIT = (a: Account): boolean => a.kind !== 'credit';

/**
 * The name of the account a row names, archived ones included (history keeps their names), or
 * "Unknown account" when it is gone.
 */
export function accountName(accounts: readonly Account[], id: string | null): string {
  return accounts.find((a) => a.id === id)?.name ?? 'Unknown account';
}

/** What a credit account is called in a picker, so a card isn't taken for a bank account. */
function labelOf(account: Account): string {
  return account.kind === 'credit' ? `${account.name} (credit card)` : account.name;
}

/**
 * Options for an account select: the accounts in use, in carousel order, a credit card's name
 * followed by "(credit card)". `filter` narrows them (pass one that keeps its identity between
 * renders, as the options are only worked out again when it changes). An archived account is
 * offered only as `keepId`, the one a row being edited was already on.
 */
export function useAccountOptions(
  filter?: (a: Account) => boolean,
  keepId: string | null = null,
): Array<{ value: string; label: string }> {
  const accounts = useApp((s) => s.data.tables.account);
  const today = useToday();
  return useMemo(() => {
    const shown = activeAccounts(accounts, today).filter((a) => !filter || filter(a));
    const kept =
      keepId === null || shown.some((a) => a.id === keepId)
        ? undefined
        : accounts.find((a) => a.id === keepId);
    return (kept ? [...shown, kept] : shown).map((a) => ({ value: a.id, label: labelOf(a) }));
  }, [accounts, today, filter, keepId]);
}

/**
 * The account a new row starts on: the default account while the options hold it, else the first
 * option, else `''` when there is nothing to pick.
 */
export function useStartAccountId(filter?: (a: Account) => boolean): string {
  const options = useAccountOptions(filter);
  const preferred = useApp((s) => defaultAccount(s.data, s.today)?.id ?? null);
  return preferred !== null && options.some((o) => o.value === preferred)
    ? preferred
    : (options[0]?.value ?? '');
}

/** Which account a row is paid with or goes to, as a select in the line style. */
export function AccountField({
  label,
  value,
  onChange,
  filter,
  error,
  hint,
  keepId,
}: {
  label: string;
  value: string;
  onChange(id: string): void;
  filter?: (a: Account) => boolean;
  error?: string;
  hint?: string;
  /** An archived account to offer still: the one a row being edited was already on. */
  keepId?: string | null;
}) {
  const options = useAccountOptions(filter, keepId);
  return (
    <Select
      variant="line"
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      hint={hint}
      error={error}
    />
  );
}
