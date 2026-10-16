import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStubStore } from '@/test/appStoreStub';
import { INBOX_NOW, inboxData } from '@/test/inboxData';
import { AppStoreProvider } from './AppStoreProvider';
import { useInboxActions, useInboxItems } from './useInbox';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: INBOX_NOW }));
afterEach(() => vi.useRealTimers());

function setup(data = inboxData()) {
  const store = createStubStore({ data, today: '2026-10-14' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider store={store}>{children}</AppStoreProvider>
  );
  return { store, wrapper };
}

describe('useInboxItems', () => {
  it('lists the last 30 days of reminders at the time of day it is', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useInboxItems(), { wrapper });
    expect(result.current.map((i) => i.key)).toEqual([
      'freeze-end:freeze-1',
      'freeze-start:freeze-1',
      'buy-wait:kettle:2026-10-12',
      'week:2026-10-11',
      'week:2026-10-04',
      'month:2026-09-30',
      'week:2026-09-27',
      'week:2026-09-20',
    ]);
    expect(result.current.every((i) => !i.read)).toBe(true);
  });

  it('keeps its value until the data or the day changes, then catches up with the clock', () => {
    const { store, wrapper } = setup();
    const { result, rerender } = renderHook(() => useInboxItems(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    // Sunday evening's check-in comes due while the app stays open: the next day change finds it.
    vi.setSystemTime(new Date(2026, 9, 18, 19, 0));
    act(() => store.setState({ today: '2026-10-18' }));
    expect(result.current[0]?.key).toBe('week:2026-10-18');

    const data = store.getState().data;
    const settings = data.tables.settings[0]!;
    act(() =>
      store.setState({
        data: {
          ...data,
          tables: {
            ...data.tables,
            settings: [{ ...settings, inbox: { readBefore: null, read: ['week:2026-10-18'] } }],
          },
        },
      }),
    );
    expect(result.current[0]).toMatchObject({ key: 'week:2026-10-18', read: true });
  });
});

describe('useInboxActions', () => {
  it('is the same object while the store is', () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => useInboxActions(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.keys(first).sort()).toEqual(['markAllRead', 'markRead']);
  });
});
