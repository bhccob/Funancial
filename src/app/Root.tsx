import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/Toaster';
import { useGameTheme } from '@/features/game/useGameTheme';
import { LockScreen } from '@/features/lock/LockScreen';
import { useAutoLock } from '@/features/lock/useAutoLock';
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard';
import { BootSplash } from '@/features/system/BootSplash';
import { StorageUnavailable } from '@/features/system/StorageUnavailable';
import { WelcomeScreen } from '@/features/welcome/WelcomeScreen';
import { usePlatform } from '@/platform/PlatformProvider';
import { useApp } from '@/store/AppStoreProvider';
import { createAppRouter } from './router';
import { useClearRemindersWithoutData, useReminderSync } from './useReminderSync';

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
  useReminderSync(usePlatform().notifier);
  useEffect(() => {
    // Onboarding ends on the Dashboard, not on a screen an earlier session (say, demo) left open.
    if (needsOnboarding) void getAppRouter().navigate('/', { replace: true });
  }, [needsOnboarding]);
  // Saving the profile ends onboarding, but the last step ("You're all set") is still to be seen.
  const [finishing, setFinishing] = useState(false);
  if (needsOnboarding || finishing) return <OnboardingWizard onFinishing={setFinishing} />;
  return <RouterProvider router={getAppRouter()} />;
}

function Phase() {
  const phase = useApp((s) => s.phase);
  // Log in makes the vault, then restores the account's copy into it: the app is "unlocked" for a
  // moment with nothing in it (which would show setup), so Log in keeps its screen until it is done.
  const [loggingIn, setLoggingIn] = useState(false);
  switch (phase) {
    case 'booting':
      return <BootSplash />;
    case 'unavailable':
      return <StorageUnavailable />;
    case 'updateNeeded':
      return <StorageUnavailable newer />;
    case 'welcome':
      return <WelcomeScreen onHold={setLoggingIn} />;
    case 'locked':
      return <LockScreen />;
    case 'unlocked':
      return loggingIn ? <WelcomeScreen onHold={setLoggingIn} /> : <UnlockedApp />;
  }
}

export function Root() {
  const notifier = usePlatform().notifier;
  // Always listening, locked or not: opening a reminder while the app is locked lines the router
  // up for after the unlock, and one opened while the app was closed is delivered when this starts.
  useEffect(() => notifier?.onOpen((route) => void getAppRouter().navigate(route)), [notifier]);
  useClearRemindersWithoutData(notifier);
  useGameTheme();
  return (
    <ErrorBoundary>
      <Phase />
      <Toaster />
    </ErrorBoundary>
  );
}
