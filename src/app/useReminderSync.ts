import { useEffect } from 'react';
import { formatLocalDateTime } from '@/domain/dates';
import { upcomingReminders, type Reminder } from '@/domain/notifications';
import { usePlatform } from '@/platform/PlatformProvider';
import type { Notifier } from '@/platform/types';
import type { AppState } from '@/store/appStore';
import { useApp, useAppStore } from '@/store/AppStoreProvider';

/** Edits come in bursts (a form saves several records); the phone is told once they stop. */
const SETTLE_MS = 1_000;

/** What the phone should have scheduled for this state. Demo money never reminds anyone. */
function remindersFor({ namespace, data }: Pick<AppState, 'namespace' | 'data'>): Reminder[] {
  return namespace === 'real' ? upcomingReminders(data, formatLocalDateTime(new Date())) : [];
}

/**
 * Keeps the reminders scheduled on the phone in step with the data: the reminder rules, run
 * a second after the data (or the day) last changed and again each time the app comes back, since
 * the next 30 days moved on while it was away. Does nothing without a notifier (the web).
 *
 * A failure to schedule goes to the console and nowhere else: reminders are a convenience, and
 * a person who has blocked notifications must not be nagged by an error on every edit. The next
 * change simply tries again.
 */
export function useReminderSync(notifier: Notifier | null): void {
  const platform = usePlatform();
  const store = useAppStore();

  useEffect(() => {
    if (!notifier) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = async () => {
      clearTimeout(timer);
      const state = store.getState();
      // A locked app holds no data, so it would schedule nothing and cancel every reminder.
      if (state.phase !== 'unlocked') return;
      try {
        await notifier.replace(remindersFor(state));
      } catch (e) {
        console.error('Could not schedule reminders', e);
      }
    };
    const syncSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), SETTLE_MS);
    };

    syncSoon();
    const stopWatching = store.subscribe((s, prev) => {
      if (s.data !== prev.data || s.today !== prev.today || s.namespace !== prev.namespace) {
        syncSoon();
      }
    });
    const stopResume = platform.onResume(() => void sync());
    return () => {
      clearTimeout(timer);
      stopWatching();
      stopResume();
    };
  }, [notifier, platform, store]);
}

/**
 * Clears the reminders on the phone each time the app reaches its welcome screen: no data is
 * left (everything was deleted, or this is a first run), so nothing may go on reminding about it.
 * `useReminderSync` only runs while unlocked and cannot see this. Failures go to the console.
 */
export function useClearRemindersWithoutData(notifier: Notifier | null): void {
  const noData = useApp((s) => s.phase === 'welcome');

  useEffect(() => {
    if (!noData || !notifier) return;
    void (async () => {
      try {
        await notifier.replace([]);
      } catch (e) {
        console.error('Could not clear reminders', e);
      }
    })();
  }, [noData, notifier]);
}
