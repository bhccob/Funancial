import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reminder } from '@/domain/notifications';
import { reminderIds } from '../reminderIds';
import { createAndroidNotifier } from './notifier';

type Handler = (action: { actionId: string; notification: { extra?: unknown } }) => void;

const plugin = vi.hoisted(() => ({
  createChannel: vi.fn(),
  schedule: vi.fn(),
  getPending: vi.fn(),
  cancel: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }));

const remove = vi.fn(async () => {});
let handlers: Record<string, Handler>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  // Only the clock: the plugin's promises must keep resolving on their own.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0, 30));
  handlers = {};
  plugin.createChannel.mockResolvedValue(undefined);
  plugin.schedule.mockResolvedValue({ notifications: [] });
  plugin.getPending.mockResolvedValue({ notifications: [] });
  plugin.cancel.mockResolvedValue(undefined);
  plugin.checkPermissions.mockResolvedValue({ display: 'granted' });
  plugin.requestPermissions.mockResolvedValue({ display: 'granted' });
  plugin.addListener.mockImplementation(async (event: string, cb: Handler) => {
    handlers[event] = cb;
    return { remove };
  });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  consoleError.mockRestore();
});

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    key: 'daily:2026-10-15',
    kind: 'daily-log',
    at: '2026-10-15T20:00',
    title: "Log today's spending",
    body: 'Add what you spent today. It takes a few seconds.',
    route: '/add',
    ...over,
  };
}

/** What was handed to `schedule`, call by call. */
const scheduled = () =>
  plugin.schedule.mock.calls.map(
    ([options]) => (options as { notifications: { id: number; title: string }[] }).notifications,
  );

describe('createAndroidNotifier', () => {
  describe('replace', () => {
    it('replaces only the reminders it scheduled', async () => {
      plugin.getPending.mockResolvedValue({
        notifications: [
          { id: 5, extra: { managed: true } },
          { id: 1, extra: { managed: false } },
          { id: 9 },
          { id: 12, extra: null },
        ],
      });

      await createAndroidNotifier().replace([reminder()]);

      expect(plugin.cancel).toHaveBeenCalledTimes(1);
      expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 5 }] });
    });

    it('cancels before it schedules', async () => {
      const events: string[] = [];
      plugin.getPending.mockResolvedValue({ notifications: [{ id: 5, extra: { managed: true } }] });
      plugin.cancel.mockImplementation(async () => void events.push('cancel'));
      plugin.schedule.mockImplementation(async () => void events.push('schedule'));

      await createAndroidNotifier().replace([reminder()]);

      expect(events).toEqual(['cancel', 'schedule']);
    });

    it('does not ask the plugin to cancel nothing, which it rejects', async () => {
      plugin.getPending.mockResolvedValue({
        notifications: [{ id: 1, extra: { managed: false } }],
      });

      await createAndroidNotifier().replace([reminder()]);

      expect(plugin.cancel).not.toHaveBeenCalled();
      expect(plugin.schedule).toHaveBeenCalledTimes(1);
    });

    it('schedules in local time, allowed while idle, on the reminders channel', async () => {
      const r = reminder({ key: 'renewal:netflix:2026-10-21', at: '2026-10-21T09:00', route: '/subscriptions' });

      await createAndroidNotifier().replace([r]);

      expect(plugin.createChannel).toHaveBeenCalledWith({
        id: 'reminders',
        name: 'Reminders',
        importance: 4,
        visibility: 0,
      });
      expect(plugin.schedule).toHaveBeenCalledTimes(1);
      expect(plugin.schedule).toHaveBeenCalledWith({
        notifications: [
          {
            id: reminderIds([r.key])[0],
            title: r.title,
            body: r.body,
            channelId: 'reminders',
            // 09:00 on the phone's own clock, whatever time zone that is.
            schedule: { at: new Date(2026, 9, 21, 9, 0), allowWhileIdle: true },
            isExactNotification: false,
            extra: { managed: true, route: '/subscriptions' },
          },
        ],
      });
    });

    it('keeps reminder text off a secure lock screen', async () => {
      // Android's PRIVATE visibility (0): the lock screen shows that a reminder arrived, not what
      // it says, until the phone is unlocked. 1 would show the text to anyone holding the phone.
      await createAndroidNotifier().replace([reminder()]);
      expect(plugin.createChannel).toHaveBeenLastCalledWith(
        expect.objectContaining({ visibility: 0 }),
      );

      // The channel the test reminder creates is the same one.
      plugin.createChannel.mockClear();
      await createAndroidNotifier().sendTest();
      expect(plugin.createChannel).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'reminders', visibility: 0 }),
      );
    });

    it('gives each reminder its own id, in one schedule call', async () => {
      const rs = [
        reminder({ key: 'daily:2026-10-15' }),
        reminder({ key: 'daily:2026-10-16', at: '2026-10-16T20:00' }),
        reminder({ key: 'backup:2026-10-17', at: '2026-10-17T19:00', route: '/settings' }),
      ];

      await createAndroidNotifier().replace(rs);

      expect(plugin.schedule).toHaveBeenCalledTimes(1);
      const ids = scheduled()[0]?.map((n) => n.id);
      expect(ids).toEqual(reminderIds(rs.map((r) => r.key)));
    });

    it('never asks for the exact-alarm permission', async () => {
      // The plugin defaults to exact alarms, and for those it opens the system "Alarms &
      // reminders" screen when the permission is missing. Every reminder opts out.
      await createAndroidNotifier().replace([
        reminder(),
        reminder({ key: 'daily:2026-10-16', at: '2026-10-16T20:00' }),
      ]);

      const all = plugin.schedule.mock.calls.flatMap(
        ([o]) => (o as { notifications: { isExactNotification?: boolean }[] }).notifications,
      );
      expect(all).toHaveLength(2);
      expect(all.every((n) => n.isExactNotification === false)).toBe(true);
    });

    it('only clears the old reminders when there are no new ones', async () => {
      plugin.getPending.mockResolvedValue({ notifications: [{ id: 5, extra: { managed: true } }] });

      await createAndroidNotifier().replace([]);

      expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 5 }] });
      expect(plugin.schedule).not.toHaveBeenCalled();
      expect(plugin.createChannel).not.toHaveBeenCalled();
    });

    it('creates the channel once, however often it schedules', async () => {
      const notifier = createAndroidNotifier();

      await Promise.all([notifier.replace([reminder()]), notifier.replace([reminder()])]);
      await notifier.replace([reminder()]);
      await notifier.sendTest();

      expect(plugin.createChannel).toHaveBeenCalledTimes(1);
    });

    it('tries to create the channel again after it failed', async () => {
      plugin.createChannel.mockRejectedValueOnce(new Error('bridge down'));
      const notifier = createAndroidNotifier();

      await expect(notifier.replace([reminder()])).rejects.toThrow('bridge down');
      expect(plugin.schedule).not.toHaveBeenCalled();

      await notifier.replace([reminder()]);
      expect(plugin.createChannel).toHaveBeenCalledTimes(2);
      expect(plugin.schedule).toHaveBeenCalledTimes(1);
    });

    it('does not ask Android for permission, or schedule, without it', async () => {
      // `schedule` itself asks for the permission when it is missing, and a data change is not
      // a person's action: the Settings switch is the only place that asks.
      for (const display of ['denied', 'prompt', 'prompt-with-rationale']) {
        plugin.schedule.mockClear();
        plugin.checkPermissions.mockResolvedValue({ display });
        plugin.getPending.mockResolvedValue({
          notifications: [{ id: 5, extra: { managed: true } }],
        });

        await createAndroidNotifier().replace([reminder()]);

        expect(plugin.schedule).not.toHaveBeenCalled();
        expect(plugin.requestPermissions).not.toHaveBeenCalled();
        expect(plugin.cancel).toHaveBeenLastCalledWith({ notifications: [{ id: 5 }] });
      }
    });

    it('runs one replace at a time, so the last data wins', async () => {
      const events: string[] = [];
      let release: (v: { notifications: [] }) => void = () => {};
      plugin.getPending
        .mockImplementationOnce(() => {
          events.push('getPending a');
          return new Promise((resolve) => (release = resolve));
        })
        .mockImplementation(async () => {
          events.push('getPending b');
          return { notifications: [{ id: 5, extra: { managed: true } }] };
        });
      plugin.cancel.mockImplementation(async () => void events.push('cancel'));
      plugin.schedule.mockImplementation(async (o: { notifications: { title: string }[] }) => {
        events.push(`schedule ${o.notifications.map((n) => n.title).join()}`);
        return { notifications: [] };
      });
      const notifier = createAndroidNotifier();

      const a = notifier.replace([reminder({ title: 'a' })]);
      const b = notifier.replace([reminder({ title: 'b' })]);
      await vi.waitFor(() => expect(events).toEqual(['getPending a']));
      await new Promise((r) => setTimeout(r, 0));
      expect(events).toEqual(['getPending a']);

      release({ notifications: [] });
      await Promise.all([a, b]);

      expect(events).toEqual([
        'getPending a',
        'schedule a',
        'getPending b',
        'cancel',
        'schedule b',
      ]);
    });

    it('goes on to the next replace after one failed', async () => {
      plugin.schedule.mockRejectedValueOnce(new Error('too many alarms'));
      const notifier = createAndroidNotifier();

      const failed = notifier.replace([reminder({ title: 'a' })]);
      const next = notifier.replace([reminder({ title: 'b' })]);

      await expect(failed).rejects.toThrow('too many alarms');
      await expect(next).resolves.toBeUndefined();
      expect(scheduled().map((ns) => ns.map((n) => n.title))).toEqual([['a'], ['b']]);
    });
  });

  describe('sendTest', () => {
    it('sends a test reminder a minute out', async () => {
      await createAndroidNotifier().sendTest();

      expect(plugin.createChannel).toHaveBeenCalledTimes(1);
      expect(plugin.schedule).toHaveBeenCalledTimes(1);
      expect(plugin.schedule).toHaveBeenCalledWith({
        notifications: [
          {
            id: 1,
            title: 'Test reminder',
            body: 'Reminders are working.',
            channelId: 'reminders',
            schedule: { at: new Date(2026, 9, 14, 10, 1, 30), allowWhileIdle: true },
            isExactNotification: false,
            extra: { managed: false },
          },
        ],
      });
    });

    it('is left alone when the reminders are replaced', async () => {
      plugin.getPending.mockResolvedValue({
        notifications: [{ id: 1, extra: { managed: false } }],
      });
      const notifier = createAndroidNotifier();

      await notifier.sendTest();
      await notifier.replace([]);

      expect(plugin.cancel).not.toHaveBeenCalled();
    });

    it('rejects when the plugin does, for the caller to say so', async () => {
      plugin.schedule.mockRejectedValueOnce(new Error('Notifications are disabled'));

      await expect(createAndroidNotifier().sendTest()).rejects.toThrow('Notifications are disabled');
    });
  });

  describe('permission and request', () => {
    it.each([
      ['granted', 'granted'],
      ['denied', 'denied'],
      ['prompt', 'prompt'],
      ['prompt-with-rationale', 'prompt'],
    ])('reports %s as %s', async (display, expected) => {
      plugin.checkPermissions.mockResolvedValue({ display });

      await expect(createAndroidNotifier().permission()).resolves.toBe(expected);
      expect(plugin.requestPermissions).not.toHaveBeenCalled();
    });

    it.each([
      ['granted', true],
      ['denied', false],
      ['prompt', false],
    ])('asks Android once, and %s means %s', async (display, expected) => {
      plugin.requestPermissions.mockResolvedValue({ display });

      await expect(createAndroidNotifier().request()).resolves.toBe(expected);
      expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    });
  });

  describe('onOpen', () => {
    const tap = (extra?: unknown) =>
      handlers['localNotificationActionPerformed']?.({
        actionId: 'tap',
        notification: { extra },
      });

    it('routes an opened reminder', async () => {
      const cb = vi.fn();
      const stop = createAndroidNotifier().onOpen(cb);
      await vi.waitFor(() => expect(handlers['localNotificationActionPerformed']).toBeDefined());

      tap({ managed: true, route: '/subscriptions' });
      expect(cb).toHaveBeenLastCalledWith('/subscriptions');

      // The test reminder carries no route, and nothing else can be trusted to be a path.
      tap({ managed: false });
      expect(cb).toHaveBeenLastCalledWith('/');
      tap(undefined);
      expect(cb).toHaveBeenLastCalledWith('/');
      tap({ route: 42 });
      expect(cb).toHaveBeenLastCalledWith('/');
      tap({ route: 'https://example.com' });
      expect(cb).toHaveBeenLastCalledWith('/');
      expect(cb).toHaveBeenCalledTimes(5);

      stop();
      await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    });

    it('routes nothing after unsubscribe, even a tap Capacitor had already queued', async () => {
      const cb = vi.fn();
      const stop = createAndroidNotifier().onOpen(cb);
      await vi.waitFor(() => expect(handlers['localNotificationActionPerformed']).toBeDefined());

      // Capacitor removes a listener asynchronously; a tap already on its way still arrives.
      stop();
      tap({ managed: true, route: '/subscriptions' });
      await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
      tap({ managed: true, route: '/subscriptions' });

      expect(cb).not.toHaveBeenCalled();
    });

    it('does not follow a route that leaves the app', async () => {
      // The launcher activity is exported, so any app can hand it extras. `//host` and `/\host`
      // are how a browser (and a router built on its URL parser) spells another site.
      const cb = vi.fn();
      createAndroidNotifier().onOpen(cb);
      await vi.waitFor(() => expect(handlers['localNotificationActionPerformed']).toBeDefined());

      for (const route of ['//example.com', '//example.com/budget', '/\\example.com']) {
        tap({ managed: true, route });
        expect(cb).toHaveBeenLastCalledWith('/');
      }
      expect(cb).toHaveBeenCalledTimes(3);

      // A path of ours still gets through, a slash inside it included.
      tap({ managed: true, route: '/budget/limits' });
      expect(cb).toHaveBeenLastCalledWith('/budget/limits');
    });

    it('logs a listener that cannot be added instead of rejecting unhandled', async () => {
      const failure = new Error('bridge down');
      plugin.addListener.mockRejectedValueOnce(failure);

      createAndroidNotifier().onOpen(vi.fn())();

      await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.anything(), failure));
      expect(remove).not.toHaveBeenCalled();
    });
  });
});
