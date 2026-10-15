import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { createStubStore } from '@/test/appStoreStub';
import { makeSettings } from '@/test/fixtures';
import { AppStoreProvider } from './AppStoreProvider';
import { useGameActions, useGameContext, useGameView } from './useGame';

function setup() {
  const store = createStubStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider store={store}>{children}</AppStoreProvider>
  );
  return { store, wrapper };
}

it('builds the context from the store: today, the week start and whether a backup is possible', () => {
  const { store, wrapper } = setup();
  const { result } = renderHook(() => useGameContext(), { wrapper });
  expect(result.current).toMatchObject({ today: '2026-10-14', weekStartsOn: 1, canBackUp: true });

  act(() => {
    const data = emptySnapshot();
    data.tables.settings = [makeSettings({ weekStartsOn: 0 })];
    store.setState({ data, namespace: 'demo' });
  });
  expect(result.current).toMatchObject({ weekStartsOn: 0, canBackUp: false });
});

it('keeps the same view until the data, the day, the week start or the namespace changes', () => {
  const { store, wrapper } = setup();
  const { result } = renderHook(() => useGameView(), { wrapper });
  const first = result.current;

  act(() => store.setState({ persisted: false })); // not something the game reads
  expect(result.current).toBe(first);

  act(() => store.setState({ today: '2026-10-15' }));
  expect(result.current).not.toBe(first);
  const second = result.current;

  act(() => store.setState({ namespace: 'demo' }));
  expect(result.current).not.toBe(second);
  const third = result.current;

  act(() => store.setState({ data: emptySnapshot() }));
  expect(result.current).not.toBe(third);
});

it('hands out the same actions for the same store', () => {
  const { wrapper } = setup();
  const { result, rerender } = renderHook(() => useGameActions(), { wrapper });
  const first = result.current;
  rerender();
  expect(result.current).toBe(first);
});
