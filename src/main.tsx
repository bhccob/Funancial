import { Capacitor } from '@capacitor/core';
import { StrictMode } from 'react';
import type { Root as ReactRoot } from 'react-dom/client';
import { Root } from '@/app/Root';
import { startApp } from '@/app/startApp';
import { KDF_ITERATIONS } from '@/data/keys';
import { toLocalDate } from '@/domain/dates';
import { tabChannel } from '@/lib/broadcast';
import { safeStorage } from '@/lib/safeStorage';
import { initTheme } from '@/lib/theme';
import { createAndroidPlatform } from '@/platform/android';
import { PlatformProvider } from '@/platform/PlatformProvider';
import { createWebPlatform } from '@/platform/web';
import { createAppStore } from '@/store/appStore';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import '@/styles/index.css';

async function start(root: ReactRoot) {
  initTheme();

  const platform = Capacitor.isNativePlatform()
    ? await createAndroidPlatform()
    : createWebPlatform();
  const appStore = createAppStore({
    kdfIterations: KDF_ITERATIONS,
    today: () => toLocalDate(new Date()),
    now: () => Date.now(),
    safeStorage,
    channel: tabChannel(),
    storageStatus: platform.storageStatus,
    requestPersistence: platform.requestPersistence,
    storage: platform.storage,
    keyring: platform.keyring,
    biometric: platform.biometric,
  });

  // Another tab changed data: reload it. If it replaced, re-keyed or deleted the data, start over.
  tabChannel().subscribe((m) => {
    if (m.reason === 'data') void appStore.getState().refresh();
    else window.location.reload();
  });

  // A new day (or time away) may have brought renewals, pay days and a new budget period.
  const sync = () => void appStore.getState().sync();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  window.addEventListener('focus', sync);
  // The WebView may not report visibility when the app comes back from the background.
  platform.onResume(sync);

  root.render(
    <StrictMode>
      <PlatformProvider platform={platform}>
        <AppStoreProvider store={appStore}>
          <Root />
        </AppStoreProvider>
      </PlatformProvider>
    </StrictMode>,
  );

  void appStore.getState().boot();
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

void startApp(container, start);
