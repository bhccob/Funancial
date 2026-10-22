import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { heroFigure } from '@/domain/balances';
import { emptySnapshot } from '@/domain/snapshot';
import { computeFinanceView } from '@/domain/view';
import { safeStorage } from '@/lib/safeStorage';
import { createStubStore } from '@/test/appStoreStub';
import { makeAccount, makeExpense, makeSettings } from '@/test/fixtures';
import { throwingStorage } from '@/test/storage';
import { AppStoreProvider } from './AppStoreProvider';
import { useSelectedAccount, useSelectedAccountRow } from './useSelectedAccount';

// Which card is selected lives on this device only, under its own key.
const KEY = 'funancial.selectedAccount';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  useSelectedAccount.setState({ id: null });
});

it('starts with nothing selected, and selects the account it is given on this device', () => {
  expect(useSelectedAccount.getState().id).toBeNull();
  act(() => useSelectedAccount.getState().select('card-1'));
  expect(useSelectedAccount.getState().id).toBe('card-1');
  expect(safeStorage.get(KEY)).toBe('card-1');
  act(() => useSelectedAccount.getState().select('acct-main'));
  expect(useSelectedAccount.getState().id).toBe('acct-main');
  expect(safeStorage.get(KEY)).toBe('acct-main');
});

it('is still selected when the app is opened again', async () => {
  act(() => useSelectedAccount.getState().select('acct-savings'));
  vi.resetModules();
  const reopened = await import('./useSelectedAccount');
  expect(reopened.useSelectedAccount.getState().id).toBe('acct-savings');
});

it('starts with nothing selected when nothing was kept, and still selects where storage is blocked', async () => {
  vi.stubGlobal('localStorage', throwingStorage());
  vi.resetModules();
  const fresh = await import('./useSelectedAccount');
  expect(fresh.useSelectedAccount.getState().id).toBeNull();
  act(() => fresh.useSelectedAccount.getState().select('card-1'));
  expect(fresh.useSelectedAccount.getState().id).toBe('card-1');
});

const TODAY = '2026-10-14';
const MAIN = makeAccount({ id: 'acct-main', name: 'Main account', openingDate: '2026-10-01' });
const VISA = makeAccount({
  id: 'card-1',
  name: 'Visa',
  kind: 'credit',
  order: 1,
  openingDate: '2026-10-01',
  openingBalance: 100_00,
  credit: {
    limit: 1_000_00,
    statementDay: null,
    dueDay: 21,
    payInFull: true,
    minimumPayment: 0,
    interestRate: 0,
  },
});
const OLD = makeAccount({ id: 'acct-old', name: 'Old', order: 2, archivedOn: '2026-10-02' });

/** The hook over a store holding `accounts`, with Main account as the default. */
function selectedRow(accounts = [MAIN, VISA, OLD]) {
  const data = emptySnapshot();
  data.tables.account = accounts;
  data.tables.settings = [makeSettings({ defaultAccountId: 'acct-main' })];
  data.tables.expense = [makeExpense({ accountId: 'card-1', amount: 25_00, date: '2026-10-05' })];
  const store = createStubStore({ data, today: TODAY });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider store={store}>{children}</AppStoreProvider>
  );
  return { ...renderHook(() => useSelectedAccountRow(), { wrapper }), data };
}

it('resolves to the default account and its balance when nothing is selected', () => {
  const { result } = selectedRow();
  expect(result.current).toEqual({ account: MAIN, balance: 100_000 });
});

it('resolves to the selected account with what it holds, or for a card what it owes', () => {
  act(() => useSelectedAccount.getState().select('card-1'));
  const { result, data } = selectedRow();
  expect(result.current?.account.id).toBe('card-1');
  expect(result.current?.balance).toBe(125_00);
  expect(heroFigure(result.current!)).toEqual({ label: 'Available credit', amount: 875_00 });
  // It is the row the finance view has for that account.
  expect(result.current).toEqual(
    computeFinanceView(data, TODAY, 1).accounts.find((r) => r.account.id === 'card-1'),
  );
});

it('follows a new selection', () => {
  const { result } = selectedRow();
  expect(result.current?.account.id).toBe('acct-main');
  act(() => useSelectedAccount.getState().select('card-1'));
  expect(result.current?.account.id).toBe('card-1');
});

it('falls back to the default account when the selected one is archived or gone', () => {
  act(() => useSelectedAccount.getState().select('acct-old'));
  expect(selectedRow().result.current?.account.id).toBe('acct-main');
  act(() => useSelectedAccount.getState().select('acct-gone'));
  expect(selectedRow().result.current?.account.id).toBe('acct-main');
  // The choice itself is not rewritten: it is only not honoured.
  expect(safeStorage.get(KEY)).toBe('acct-gone');
});

it('resolves to nothing with no account in use', () => {
  expect(selectedRow([OLD]).result.current).toBeNull();
  expect(selectedRow([]).result.current).toBeNull();
});
