import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { LockScreen } from '@/features/lock/LockScreen';
import { useAutoLock } from '@/features/lock/useAutoLock';
import { BootSplash } from '@/features/system/BootSplash';
import { StorageUnavailable } from '@/features/system/StorageUnavailable';
import { WelcomeScreen } from '@/features/welcome/WelcomeScreen';
import { useApp } from '@/store/AppStoreProvider';
import { createAppRouter } from './router';

const DEFAULT_AUTO_LOCK_MINUTES = 5;

function UnlockedApp() {
  const minutes = useApp(
    (s) => s.data.tables.settings[0]?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
  );
  useAutoLock(minutes);
  const [router] = useState(createAppRouter);
  return <RouterProvider router={router} />;
}

export function Root() {
  const phase = useApp((s) => s.phase);
  switch (phase) {
    case 'booting':
      return <BootSplash />;
    case 'unavailable':
      return <StorageUnavailable />;
    case 'welcome':
      return <WelcomeScreen />;
    case 'locked':
      return <LockScreen />;
    case 'unlocked':
      return <UnlockedApp />;
  }
}
