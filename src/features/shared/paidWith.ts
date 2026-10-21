import { useMemo } from 'react';
import type { Debt, PaymentMethod } from '@/domain/entities';
import { useApp } from '@/store/AppStoreProvider';

// One select value per way to pay; a credit card is "card:<id>".
const CARD_PREFIX = 'card:';

const NAMES: Record<Exclude<PaymentMethod, 'credit_card'>, string> = {
  cash: 'Cash',
  debit: 'Debit card',
  other: 'Other',
};

/**
 * Options for a "Paid with" select: cash, debit, each credit card by name, other. An archived card
 * is offered only as `keepCardId`, the card an expense being edited was already paid with.
 */
export function usePaidWithOptions(
  keepCardId: string | null = null,
): Array<{ value: string; label: string }> {
  const debts = useApp((s) => s.data.tables.debt);
  return useMemo(
    () => [
      { value: 'cash', label: NAMES.cash },
      { value: 'debit', label: NAMES.debit },
      ...debts
        .filter((d) => d.kind === 'credit_card' && (!d.archivedOn || d.id === keepCardId))
        .map((d) => ({ value: `${CARD_PREFIX}${d.id}`, label: d.name })),
      { value: 'other', label: NAMES.other },
    ],
    [debts, keepCardId],
  );
}

export function isCardChoice(value: string): boolean {
  return value.startsWith(CARD_PREFIX);
}

export function parsePaidWith(value: string): {
  paymentMethod: PaymentMethod;
  cardId: string | null;
} {
  return isCardChoice(value)
    ? { paymentMethod: 'credit_card', cardId: value.slice(CARD_PREFIX.length) }
    : { paymentMethod: value as PaymentMethod, cardId: null };
}

export function paidWithValue(paymentMethod: PaymentMethod, cardId: string | null): string {
  return paymentMethod === 'credit_card' && cardId ? `${CARD_PREFIX}${cardId}` : paymentMethod;
}

export function paidWithLabel(
  paymentMethod: PaymentMethod,
  cardId: string | null,
  debts: Debt[],
): string {
  if (paymentMethod !== 'credit_card') return NAMES[paymentMethod];
  return debts.find((d) => d.id === cardId)?.name ?? 'Credit card';
}
