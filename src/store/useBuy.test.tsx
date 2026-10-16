import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { emptySnapshot } from '@/domain/snapshot';
import { createStubStore } from '@/test/appStoreStub';
import { makeAboutYou, makeBuyDecision, makeProfile } from '@/test/fixtures';
import { AppStoreProvider } from './AppStoreProvider';
import { useAboutYou, useBuyActions, useDecision, useDecisions } from './useBuy';

function setup(decisions = [makeBuyDecision({ id: 'a' })], about = [makeAboutYou()]) {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile()];
  data.tables.buyDecision = decisions;
  data.tables.aboutYou = about;
  const store = createStubStore({ data });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider store={store}>{children}</AppStoreProvider>
  );
  return { store, wrapper };
}

describe('useDecisions', () => {
  it('lists the newest first, and keeps its value until the data changes', () => {
    const old = makeBuyDecision({ id: 'old', createdAt: '2026-10-01T09:00:00.000Z' });
    const mid = makeBuyDecision({ id: 'mid', createdAt: '2026-10-10T09:00:00.000Z' });
    const fresh = makeBuyDecision({ id: 'fresh', createdAt: '2026-10-14T09:00:00.000Z' });
    const { store, wrapper } = setup([mid, fresh, old]);
    const { result, rerender } = renderHook(() => useDecisions(), { wrapper });
    expect(result.current.map((d) => d.id)).toEqual(['fresh', 'mid', 'old']);
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    const newest = makeBuyDecision({ id: 'newest', createdAt: '2026-10-14T09:00:00.000Z' });
    const data = store.getState().data;
    act(() =>
      store.setState({
        data: {
          ...data,
          tables: { ...data.tables, buyDecision: [...data.tables.buyDecision, newest] },
        },
      }),
    );
    // Asked at the same moment, the one saved last is the newer.
    expect(result.current.map((d) => d.id)).toEqual(['newest', 'fresh', 'mid', 'old']);
  });

  it('is empty before anything is asked', () => {
    const { wrapper } = setup([]);
    expect(renderHook(() => useDecisions(), { wrapper }).result.current).toEqual([]);
  });
});

describe('useDecision', () => {
  it('finds a decision by id, and nothing for one that is gone', () => {
    const { wrapper } = setup([makeBuyDecision({ id: 'a' }), makeBuyDecision({ id: 'b' })]);
    expect(renderHook(() => useDecision('b'), { wrapper }).result.current?.id).toBe('b');
    expect(renderHook(() => useDecision('gone'), { wrapper }).result.current).toBeUndefined();
  });
});

describe('useAboutYou', () => {
  it('gives the one record, or nothing until it is saved', () => {
    const about = makeAboutYou({ matters: 'A bike' });
    expect(
      renderHook(() => useAboutYou(), { wrapper: setup(undefined, [about]).wrapper }).result
        .current,
    ).toEqual(about);
    expect(
      renderHook(() => useAboutYou(), { wrapper: setup(undefined, []).wrapper }).result.current,
    ).toBeUndefined();
  });
});

describe('useBuyActions', () => {
  it('is the same actions until the store changes', () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => useBuyActions(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.keys(first).sort()).toEqual(
      ['ask', 'bought', 'deleteDecision', 'extract', 'rate', 'saveAbout', 'skip', 'wait'].sort(),
    );
  });
});
