import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { AccountActions, AccountView } from './accountActions';

const AccountContext = createContext<AccountActions | null>(null);

export function AccountProvider({
  actions,
  children,
}: {
  actions: AccountActions;
  children: ReactNode;
}) {
  return <AccountContext.Provider value={actions}>{children}</AccountContext.Provider>;
}

/** The account's actions. Only screens that show once the account has loaded call this. */
// eslint-disable-next-line react-refresh/only-export-components -- hooks belong with their provider
export function useAccountActions(): AccountActions {
  const actions = useContext(AccountContext);
  if (!actions) throw new Error('useAccountActions must be used inside <AccountProvider>');
  return actions;
}

/** What a screen not under a provider (a test, mostly) sees: nothing loaded. */
const unloaded = createStore<AccountView>()(() => ({ loaded: false, state: null }));

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** What a screen may know of the account: no data key, no device token. */
export type AccountInfo = {
  loaded: boolean;
  status: 'linked' | 'moved' | 'none';
  username: string | null;
  email: string | null;
  /** When the service last took a copy, if it has. */
  savedAt: string | null;
  /** The service refused the last copy as too large. */
  tooBig: boolean;
  offline: boolean;
};

/**
 * Where this phone stands with its account. `loaded` is false until the link has been read for the
 * open data (and always for the demo, which has none): "no account" means something only after that.
 */
// eslint-disable-next-line react-refresh/only-export-components -- hooks belong with their provider
export function useAccount(): AccountInfo {
  const { loaded, state } = useStore(useContext(AccountContext)?.view ?? unloaded);
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine === false,
    () => false,
  );
  return {
    loaded,
    status: state?.status ?? 'none',
    username: state?.username ?? null,
    email: state?.email ?? null,
    savedAt: state?.savedAt ?? null,
    tooBig: state?.tooBig ?? false,
    offline,
  };
}
