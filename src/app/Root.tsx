import { useEffect } from 'react';
import { RouterProvider } from 'react-router/dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/Toaster';
import { LockScreen } from '@/features/lock/LockScreen';
import { useAutoLock } from '@/features/lock/useAutoLock';
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard';
import { BootSplash } from '@/features/system/BootSplash';
import { StorageUnavailable } from '@/features/system/StorageUnavailable';
import { WelcomeScreen } from '@/features/welcome/WelcomeScreen';
import { useApp } from '@/store/AppStoreProvider';
import { createAppRouter } from './router';

const DEFAULT_AUTO_LOCK_MINUTES = 5;

/**
 * One router for the app's lifetime: locking and unlocking reuse it (and its listeners),
 * so you come back to the screen you were on.
 */
let appRouter: ReturnType<typeof createAppRouter> | null = null;
const getAppRouter = () => (appRouter ??= createAppRouter());

function UnlockedApp() {
  const minutes = useApp(
    (s) => s.data.tables.settings[0]?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
  );
  const needsOnboarding = useApp(
    (s) => s.namespace === 'real' && !s.data.tables.profile[0]?.onboardedAt,
  );
  useAutoLock(minutes);
  useEffect(() => {
    // Onboarding ends on the Dashboard, not on a screen an earlier session (say, demo) left open.
    if (needsOnboarding) void getAppRouter().navigate('/', { replace: true });
  }, [needsOnboarding]);
  if (needsOnboarding) return <OnboardingWizard />;
  return <RouterProvider router={getAppRouter()} />;
}

function Phase() {
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

export function Root() {
  return (
    <ErrorBoundary>
      <Phase />
      <Toaster />
    </ErrorBoundary>
  );
}
