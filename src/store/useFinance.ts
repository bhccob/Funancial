import { useCallback, useMemo } from 'react';
import { formatMoney, type MoneyFormatOptions } from '@/domain/money';
import { computeFinanceView, type FinanceView } from '@/domain/view';
import { createLocalPaymentService, type PaymentService } from '@/services/payment';
import { useApp, useAppStore } from './AppStoreProvider';
import { createFinanceActions, type FinanceActions } from './financeActions';
import { HIDDEN_AMOUNT, useAmountsHidden } from './useAmountsHidden';

export function useToday(): string {
  return useApp((s) => s.today);
}

export function useCurrency(): string {
  return useApp((s) => s.data.tables.profile[0]?.currency ?? 'USD');
}

/** Formatter for the profile currency in the reader's locale. While amounts are hidden, `••••`. */
export function useMoney(): (minor: number, opts?: MoneyFormatOptions) => string {
  const currency = useCurrency();
  const hidden = useAmountsHidden((s) => s.hidden);
  return useCallback(
    (minor, opts) => (hidden ? HIDDEN_AMOUNT : formatMoney(minor, currency, undefined, opts)),
    [currency, hidden],
  );
}

export function useFinanceView(): FinanceView {
  const data = useApp((s) => s.data);
  const today = useToday();
  const weekStartsOn = useApp((s) => s.data.tables.settings[0]?.weekStartsOn ?? 1);
  return useMemo(() => computeFinanceView(data, today, weekStartsOn), [data, today, weekStartsOn]);
}

export function useFinanceActions(): FinanceActions {
  const store = useAppStore();
  return useMemo(() => createFinanceActions(store), [store]);
}

/** What Pay goes through: the local service, which records the payment as an expense. */
export function usePaymentService(): PaymentService {
  const actions = useFinanceActions();
  return useMemo(() => createLocalPaymentService(actions), [actions]);
}
