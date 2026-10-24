/* eslint-disable react-refresh/only-export-components -- the check sits with the field it decides */
import type { RowVariant } from '@/components/ui/rowField';
import { cn } from '@/lib/cn';
import { AccountField, NOT_CREDIT, useAccountOptions } from './AccountField';

/**
 * What a form that moves money between two accounts says where "To" would be, while there is only
 * one account that can hold money: there is nowhere to move it, so it points to where a second one
 * is made.
 */
export const NO_OTHER_ACCOUNT = 'Add another account on the Cards tab to move money between them.';

/**
 * Whether there is nowhere to move money to: fewer than two accounts in use that can hold it (a bank
 * account, cash or savings; never a credit card). The form turns its Save off while it is true, and
 * `MoveToField` says why. One check for both, so they never disagree.
 */
export function useNowhereToMove(): boolean {
  return useAccountOptions(NOT_CREDIT).length < 2;
}

/**
 * The "To" of a form that moves money (Move money, a goal's Add money): the account picker, or
 * `NO_OTHER_ACCOUNT` in its place while there is nowhere to move money to (`useNowhereToMove`), so
 * there is no picker offering the one account it comes from.
 */
export function MoveToField({
  value,
  onChange,
  error,
  variant,
}: {
  value: string;
  onChange(id: string): void;
  error?: string;
  variant?: RowVariant;
}) {
  const nowhere = useNowhereToMove();
  if (nowhere) {
    return (
      // Under a row (the From above it), it keeps a row's distance from that row's hairline.
      <p className={cn('text-muted text-[14px] font-semibold', variant === 'row' && 'pt-3')}>
        {NO_OTHER_ACCOUNT}
      </p>
    );
  }
  return (
    <AccountField
      variant={variant}
      label="To"
      value={value}
      onChange={onChange}
      filter={NOT_CREDIT}
      error={error}
    />
  );
}
