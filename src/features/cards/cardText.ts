import type { AccountRow } from '@/domain/balances';
import type { AccountKind } from '@/domain/entities';

/** What each kind is called on its card. */
export const KIND_LABEL: Record<AccountKind, string> = {
  debit: 'Debit',
  credit: 'Credit',
  savings: 'Savings',
  cash: 'Cash',
};

/** What each kind is called in a card's name for a screen reader: "Visa, credit card ending 4242". */
const KIND_NAME: Record<AccountKind, string> = {
  debit: 'debit',
  credit: 'credit card',
  savings: 'savings',
  cash: 'cash',
};

/**
 * A card's name for a screen reader, which also stands for what the card shows: its name, kind and
 * last 4 digits, what it holds (or, for a credit card, owes), and whether it is frozen.
 */
export function cardLabel({ account, balance }: AccountRow, money: (minor: number) => string) {
  const kind = `${KIND_NAME[account.kind]}${account.last4 ? ` ending ${account.last4}` : ''}`;
  const amount = account.kind === 'credit' ? `${money(balance)} owed` : money(balance);
  return [account.name, kind, amount, account.frozen && 'frozen'].filter(Boolean).join(', ');
}
