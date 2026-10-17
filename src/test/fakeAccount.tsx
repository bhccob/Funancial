import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AccountActions, AccountState, AccountView } from '@/store/accountActions';
import { AccountProvider } from '@/store/useAccount';

export const linkedAccount = (over: Partial<AccountState> = {}): AccountState => ({
  username: 'robin',
  email: 'robin@example.com',
  deviceToken: 'token',
  dek: 'dek',
  version: 3,
  savedAt: '2026-10-14T10:00:00.000Z',
  status: 'linked',
  dirty: false,
  tooBig: false,
  ...over,
});

/** The account layer with spies for actions, showing `state` (`loaded: false` for a layer that has not read it yet). */
export function fakeAccount(state: AccountState | null = null, loaded = true) {
  const view = createStore<AccountView>()(() => ({ loaded, state }));
  const actions = {
    view,
    start: vi.fn(() => () => {}),
    signUp: vi.fn<AccountActions['signUp']>(async () => {}),
    logIn: vi.fn<AccountActions['logIn']>(async () => 'done'),
    changePassword: vi.fn<AccountActions['changePassword']>(async () => {}),
    deleteAccount: vi.fn<AccountActions['deleteAccount']>(async () => {}),
    unlink: vi.fn<AccountActions['unlink']>(async () => {}),
    forgot: vi.fn<AccountActions['forgot']>(async () => {}),
    saveNow: vi.fn<AccountActions['saveNow']>(async () => {}),
  } satisfies AccountActions;
  return actions;
}

/** `ui` under an account layer that shows `state`. */
export function withAccount(actions: AccountActions, ui: ReactNode) {
  return <AccountProvider actions={actions}>{ui}</AccountProvider>;
}
