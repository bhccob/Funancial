import { localDateTime } from '@/domain/dates';
import type { Reminder } from '@/domain/notifications';
import { reminderIds } from '../reminderIds';
import type { Notifier } from '../types';
import { listen } from './listen';

/** The plugin loads on first use, like the others: the web bundle and unit tests never load it. */
const plugin = () => import('@capacitor/local-notifications');

const CHANNEL_ID = 'reminders';
/** The test reminder's id; `reminderIds` never hands it out. */
const TEST_ID = 1;
const TEST_DELAY_MS = 60_000;

/** `importance: 4` is "high": reminders show as a heads-up, with sound, like a calendar alert. */
const channel = { id: CHANNEL_ID, name: 'Reminders', importance: 4 } as const;

/**
 * The part of a reminder that is the same for every notification. `isExactNotification: false`
 * matters: the plugin defaults to exact alarms and, without the exact-alarm permission, sends the
 * person to the system "Alarms & reminders" screen to grant it. A reminder a few minutes either
 * side of its time is fine, so none of them ask.
 */
const common = {
  channelId: CHANNEL_ID,
  isExactNotification: false,
} as const;

/** The screen a tapped reminder points at: a path of ours, else Home. */
function routeOf(extra: unknown): string {
  const route =
    typeof extra === 'object' && extra !== null && 'route' in extra ? extra.route : undefined;
  return typeof route === 'string' && route.startsWith('/') ? route : '/';
}

function isManaged(extra: unknown): boolean {
  return typeof extra === 'object' && extra !== null && 'managed' in extra && extra.managed === true;
}

/**
 * Reminders as Android local notifications, so they arrive while the app is closed. The phone
 * keeps them across a restart; the app resets the whole set each time its data changes.
 *
 * Every call that writes to the schedule goes through one queue, and the channel is created at
 * most once at a time: the app may ask for a new set while the last is still being written, and
 * an interleaved cancel and schedule would leave duplicates or drop reminders.
 */
export function createAndroidNotifier(): Notifier {
  let channelReady: Promise<void> | null = null;
  const ensureChannel = () =>
    (channelReady ??= plugin()
      .then(({ LocalNotifications }) => LocalNotifications.createChannel(channel))
      .catch((e: unknown) => {
        channelReady = null;
        throw e;
      }));

  let queue: Promise<unknown> = Promise.resolve();
  /** Runs `task` after every earlier one has finished; `queue` itself never rejects. */
  const inOrder = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  };

  return {
    async permission() {
      const { LocalNotifications } = await plugin();
      const { display } = await LocalNotifications.checkPermissions();
      return display === 'prompt-with-rationale' ? 'prompt' : display;
    },

    async request() {
      const { LocalNotifications } = await plugin();
      const { display } = await LocalNotifications.requestPermissions();
      return display === 'granted';
    },

    replace: (reminders: Reminder[]) =>
      inOrder(async () => {
        const { LocalNotifications } = await plugin();
        const { notifications: pending } = await LocalNotifications.getPending();
        // The plugin rejects a cancel with nothing to cancel, and the test reminder is not ours to clear.
        const stale = pending.filter((n) => isManaged(n.extra)).map(({ id }) => ({ id }));
        if (stale.length > 0) await LocalNotifications.cancel({ notifications: stale });
        if (reminders.length === 0) return;

        // `schedule` asks for the notification permission when it is missing, and a change to
        // the data is not a person's action. Only the Settings switch asks.
        const { display } = await LocalNotifications.checkPermissions();
        if (display !== 'granted') return;

        await ensureChannel();
        const ids = reminderIds(reminders.map((r) => r.key));
        await LocalNotifications.schedule({
          notifications: reminders.map((r, i) => ({
            ...common,
            // `reminderIds` gives one id per key.
            id: ids[i] as number,
            title: r.title,
            body: r.body,
            schedule: { at: localDateTime(r.at), allowWhileIdle: true },
            extra: { managed: true, route: r.route },
          })),
        });
      }),

    async sendTest() {
      const { LocalNotifications } = await plugin();
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            ...common,
            id: TEST_ID,
            title: 'Test reminder',
            body: 'Reminders are working.',
            schedule: { at: new Date(Date.now() + TEST_DELAY_MS), allowWhileIdle: true },
            extra: { managed: false },
          },
        ],
      });
    },

    onOpen: (cb) =>
      listen(
        async () =>
          (await plugin()).LocalNotifications.addListener(
            'localNotificationActionPerformed',
            ({ notification }) => cb(routeOf(notification.extra)),
          ),
        'a tapped reminder',
      ),
  };
}
