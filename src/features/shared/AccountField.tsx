/* eslint-disable react-refresh/only-export-components -- the hooks sit with the field they feed */
import { useMemo } from 'react';
import type { RowVariant } from '@/components/ui/rowField';
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
 * Narrows an account picker to the accounts that can take a new charge: not a frozen one. For the
 * pickers of an expense or a subscription; income, transfers and payments are not stopped by a
 * freeze. Module-level, as `useAccountOptions` wants a filter that keeps its identity. A row being
 * edited keeps the account it is already on through `keepId`.
 */
export const NOT_FROZEN = (a: Account): boolean => !a.frozen;

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
 * renders, as the options are only worked out again when it changes). An archived account, or one
 * the filter leaves out (a frozen one for `NOT_FROZEN`), is offered only as `keepId`, the one a row
 * being edited was already on.
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

/**
 * What a picker with `newCard` picks to say "a card that does not exist yet": not an account's id,
 * so the form holding it makes the card when it is saved.
 */
export const NEW_CARD = 'new-card';

/**
 * Which account a row is paid with or goes to, as a select: in the line style, or `row` in the
 * plain rows of the glass look (the add forms).
 */
export function AccountField({
  label,
  value,
  onChange,
  filter,
  error,
  hint,
  keepId,
  newCard = false,
  variant = 'line',
}: {
  label: string;
  value: string;
  onChange(id: string): void;
  filter?: (a: Account) => boolean;
  error?: string;
  hint?: string;
  /** An account to offer still, archived or filtered out: the one a row being edited was already on. */
  keepId?: string | null;
  /**
   * Ends the list with "+ New card", which picks `NEW_CARD`. Only for a form that makes the card
   * itself (the subscription's); every other form picks among the accounts that exist.
   */
  newCard?: boolean;
  variant?: RowVariant;
}) {
  const options = useAccountOptions(filter, keepId);
  const listed = newCard
    ? [
        // Nothing picked and nothing to pick (every account archived or frozen): the select would
        // otherwise show "+ New card" as if it were chosen, and picking it would change nothing.
        ...(value === '' ? [{ value: '', label: '' }] : []),
        ...options,
        { value: NEW_CARD, label: '+ New card' },
      ]
    : options;
  return (
    <Select
      variant={variant}
      label={label}
      value={value}
      options={listed}
      onChange={onChange}
      hint={hint}
      error={error}
    />
  );
}
