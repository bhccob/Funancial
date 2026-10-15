import { useEffect } from 'react';
import { usePlatform } from '@/platform/PlatformProvider';
import { useApp } from '@/store/AppStoreProvider';

/**
 * Locks after `minutes` without a tap or key press. Background tabs throttle timers, so on
 * returning to the tab it also locks if it was hidden for longer than that. 0 disables it.
 *
 * Going away is reported twice: by the page's visibility, and by the platform (on Android the
 * app's own pause and resume), because the WebView may not report visibility when the app goes
 * to the background. Either one is enough, and hearing both is harmless.
 */
export function useAutoLock(minutes: number): void {
  const lock = useApp((s) => s.lock);
  const platform = usePlatform();

  useEffect(() => {
    if (minutes <= 0) return;
    const idleMs = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let awayAt: number | null = null;

    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, idleMs);
    };
    // The first report counts: a second one for the same absence must not shorten it.
    const goAway = () => {
      awayAt ??= Date.now();
    };
    const comeBack = () => {
      const away = awayAt === null ? 0 : Date.now() - awayAt;
      awayAt = null;
      if (away >= idleMs) lock();
      else restart();
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? goAway() : comeBack());

    restart();
    const activity = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    activity.forEach((e) => window.addEventListener(e, restart, { passive: true }));
    window.addEventListener('scroll', restart, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    const stopPause = platform.onPause(goAway);
    const stopResume = platform.onResume(comeBack);
    return () => {
      clearTimeout(timer);
      activity.forEach((e) => window.removeEventListener(e, restart));
      window.removeEventListener('scroll', restart, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      stopPause();
      stopResume();
    };
  }, [minutes, lock, platform]);
}
