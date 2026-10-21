import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { emptySnapshot } from '@/domain/snapshot';
import type { AppState } from '@/store/appStore';
import { AppStoreProvider } from '@/store/AppStoreProvider';

/** A store whose actions are spies: UI tests assert what the UI asks the store to do. */
export function createStubStore(overrides: Partial<AppState> = {}): StoreApi<AppState> {
  return createStore<AppState>()(() => ({
    phase: 'unlocked',
    namespace: 'real',
    lockMode: 'device',
    data: emptySnapshot(),
    skipped: [],
    persisted: true,
    failedAttempts: 0,
    lockedUntil: null,
    checking: false,
    today: '2026-10-14',
    biometric: 'unavailable',
    gameGain: null,
    boot: vi.fn(async () => {}),
    startFresh: vi.fn(async () => {}),
    startDemo: vi.fn(async () => {}),
    exitDemo: vi.fn(async () => {}),
    unlock: vi.fn(async () => 'ok' as const),
    verifySecret: vi.fn(async () => true),
    lock: vi.fn(),
    setSecret: vi.fn(async () => {}),
    clearSecret: vi.fn(async () => {}),
    enableBiometric: vi.fn(async () => {}),
    disableBiometric: vi.fn(async () => {}),
    unlockWithBiometric: vi.fn(async () => 'cancelled' as const),
    put: vi.fn(async () => {}),
    putMany: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    sync: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    restoreSnapshot: vi.fn(async () => {}),
    onDataChange: vi.fn(() => () => {}),
    getPrivate: vi.fn(async () => null),
    putPrivate: vi.fn(async () => {}),
    deletePrivate: vi.fn(async () => {}),
    deleteAllData: vi.fn(async () => {}),
    startOver: vi.fn(async () => {}),
    ...overrides,
  }));
}

export function renderWithStore(
  ui: ReactElement,
  store = createStubStore(),
): RenderResult & {
  store: StoreApi<AppState>;
} {
  return { ...render(<AppStoreProvider store={store}>{ui}</AppStoreProvider>), store };
}
