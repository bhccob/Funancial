import { createContext, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { AppState } from './appStore';

const AppStoreContext = createContext<StoreApi<AppState> | null>(null);

export function AppStoreProvider({
  store,
  children,
}: {
  store: StoreApi<AppState>;
  children: ReactNode;
}) {
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hooks belong with their provider
export function useAppStore(): StoreApi<AppState> {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return store;
}

// eslint-disable-next-line react-refresh/only-export-components -- hooks belong with their provider
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useAppStore(), selector);
}
