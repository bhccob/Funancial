import { createContext, useContext, type ReactNode } from 'react';
import type { Platform } from './types';
import { createWebPlatform } from './web';

// Outside a provider (tests, mostly) the app is a web page.
const PlatformContext = createContext<Platform>(createWebPlatform());

export function PlatformProvider({
  platform,
  children,
}: {
  platform: Platform;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hooks belong with their provider
export function usePlatform(): Platform {
  return useContext(PlatformContext);
}
