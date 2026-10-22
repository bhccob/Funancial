import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { createStubStore } from '@/test/appStoreStub';
import { makeAccount, makeProfile } from '@/test/fixtures';
import { AppStoreProvider } from './AppStoreProvider';
import { useCurrency, useMoney, usePaymentService } from './useFinance';
import { useAmountsHidden } from './useAmountsHidden';

afterEach(() => useAmountsHidden.setState({ hidden: false }));

function withProfile(currency: string | null) {
  const data = emptySnapshot();
  if (currency) data.tables.profile = [makeProfile({ currency })];
  const store = createStubStore({ data });
  return ({ children }: { children: ReactNode }) => (
    <AppStoreProvider store={store}>{children}</AppStoreProvider>
  );
}

it('uses the profile currency, defaulting to USD', () => {
  expect(renderHook(() => useCurrency(), { wrapper: withProfile('EUR') }).result.current).toBe(
    'EUR',
  );
  expect(renderHook(() => useCurrency(), { wrapper: withProfile(null) }).result.current).toBe(
    'USD',
  );
});

it('formats amounts in the profile currency', () => {
  const { result } = renderHook(() => useMoney(), { wrapper: withProfile('EUR') });
  expect(result.current(1250)).toContain('12.50');
  expect(result.current(1250)).toContain('€');
});

it('drops the minor units when asked for whole amounts', () => {
  const { result } = renderHook(() => useMoney(), { wrapper: withProfile('EUR') });
  expect(result.current(1250, { whole: true })).toContain('13');
  expect(result.current(1250, { whole: true })).not.toContain('50');
});

it('writes every amount as four bullets while amounts are hidden, and the number again after', () => {
  const { result } = renderHook(() => useMoney(), { wrapper: withProfile('EUR') });
  act(() => useAmountsHidden.setState({ hidden: true }));
  expect(result.current(1250)).toBe('••••');
  expect(result.current(-1250, { whole: true })).toBe('••••');
  expect(result.current(1250, { signDisplay: 'always' })).toBe('••••');
  expect(result.current(0)).toBe('••••');
  act(() => useAmountsHidden.setState({ hidden: false }));
  expect(result.current(1250)).toContain('12.50');
});

it('hands out a payment service that records an expense through the store', async () => {
  const data = emptySnapshot();
  data.tables.account = [makeAccount({ id: 'acct-main' })];
  const store = createStubStore({ data });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider store={store}>{children}</AppStoreProvider>
  );
  const { result, rerender } = renderHook(() => usePaymentService(), { wrapper });
  const first = result.current;
  rerender();
  expect(result.current).toBe(first);
  const expense = await first.pay({
    accountId: 'acct-main',
    amount: 12_50,
    category: 'food',
    note: 'Lunch',
    date: store.getState().today,
  });
  expect(expense).toMatchObject({ accountId: 'acct-main', amount: 12_50, note: 'Lunch' });
  expect(store.getState().putMany).toHaveBeenCalledWith([{ table: 'expense', record: expense }]);
});
