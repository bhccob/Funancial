import { useEffect } from 'react';
import { useApp } from '@/store/AppStoreProvider';

/**
 * Locks after `minutes` without a tap or key press. Background tabs throttle timers, so on
 * returning to the tab it also locks if it was hidden for longer than that. 0 disables it.
 */
export function useAutoLock(minutes: number): void {
  const lock = useApp((s) => s.lock);

  useEffect(() => {
    if (minutes <= 0) return;
    const idleMs = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hiddenAt: number | null = null;

    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, idleMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= idleMs) lock();
      else restart();
    };

    restart();
    window.addEventListener('pointerdown', restart);
    window.addEventListener('keydown', restart);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', restart);
      window.removeEventListener('keydown', restart);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [minutes, lock]);
}
