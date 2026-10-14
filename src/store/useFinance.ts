import { useCallback } from 'react';
import { formatMoney } from '@/domain/money';
import { useApp } from './AppStoreProvider';

export function useCurrency(): string {
  return useApp((s) => s.data.tables.profile[0]?.currency ?? 'USD');
}

/** Formatter for the profile currency in the reader's locale. */
export function useMoney(): (
  minor: number,
  opts?: { signDisplay?: 'auto' | 'always' | 'exceptZero' },
) => string {
  const currency = useCurrency();
  return useCallback((minor, opts) => formatMoney(minor, currency, undefined, opts), [currency]);
}
