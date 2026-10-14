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
    boot: vi.fn(async () => {}),
    startFresh: vi.fn(async () => {}),
    startDemo: vi.fn(async () => {}),
    exitDemo: vi.fn(async () => {}),
    unlock: vi.fn(async () => 'ok' as const),
    verifySecret: vi.fn(async () => true),
    lock: vi.fn(),
    setSecret: vi.fn(async () => {}),
    clearSecret: vi.fn(async () => {}),
    put: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    createBackup: vi.fn(async () => ({ fileName: 'backup.funbak', text: '{}' })),
    restoreBackup: vi.fn(async () => {}),
    exportPlain: vi.fn(() => ({ fileName: 'export.json', text: '{}' })),
    deleteAllData: vi.fn(async () => {}),
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
