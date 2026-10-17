import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { androidBiometric } from './biometric';
import { createAndroidPlatform } from './index';
import { installShell } from './shell';

type Handler = () => void;

const app = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  remove: vi.fn(async () => {}),
  addListener: vi.fn(),
  getInfo: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: app.addListener, getInfo: app.getInfo },
}));
vi.mock('./sqlite', () => ({ capacitorSqlDriver: async () => ({}) }));
vi.mock('./shell', () => ({ installShell: vi.fn(async () => {}) }));

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  app.handlers = {};
  app.addListener.mockImplementation(async (event: string, cb: Handler) => {
    app.handlers[event] = cb;
    return { remove: app.remove };
  });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('createAndroidPlatform', () => {
  it('installs the shell before the app starts', async () => {
    const platform = await createAndroidPlatform();

    expect(platform.kind).toBe('android');
    expect(platform.biometric).toBe(androidBiometric);
    expect(platform.notifier?.replace).toBeTypeOf('function');
    expect(installShell).toHaveBeenCalledTimes(1);
  });

  it("reads the installed build's number as the code and its version as the name", async () => {
    app.getInfo.mockResolvedValue({ build: '8', version: '0.8' });

    await expect((await createAndroidPlatform()).appVersion()).resolves.toEqual({
      code: 8,
      name: '0.8',
    });
  });

  it.each([
    ['onResume', 'resume'],
    ['onPause', 'pause'],
  ] as const)('%s follows the app\'s own "%s" event until unsubscribed', async (method, event) => {
    const platform = await createAndroidPlatform();
    const cb = vi.fn();

    const stop = platform[method](cb);
    await vi.waitFor(() => expect(app.handlers[event]).toBeDefined());
    app.handlers[event]?.();
    expect(cb).toHaveBeenCalledTimes(1);

    stop();
    await vi.waitFor(() => expect(app.remove).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['onResume', 'resume'],
    ['onPause', 'pause'],
  ] as const)(
    '%s runs nothing after unsubscribe, even a "%s" Capacitor had already queued',
    async (method, event) => {
      const platform = await createAndroidPlatform();
      const cb = vi.fn();
      const stop = platform[method](cb);
      await vi.waitFor(() => expect(app.handlers[event]).toBeDefined());

      // Removing a listener takes a round trip; one message per listener was queued before it.
      stop();
      app.handlers[event]?.();
      await vi.waitFor(() => expect(app.remove).toHaveBeenCalledTimes(1));
      app.handlers[event]?.();

      expect(cb).not.toHaveBeenCalled();
    },
  );

  it.each(['onResume', 'onPause'] as const)(
    '%s logs a listener that cannot be added or removed instead of rejecting unhandled',
    async (method) => {
      const platform = await createAndroidPlatform();
      const addFailure = new Error('bridge down');
      app.addListener.mockRejectedValueOnce(addFailure);

      platform[method](vi.fn())();
      await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.anything(), addFailure));

      const removeFailure = new Error('already gone');
      app.remove.mockRejectedValueOnce(removeFailure);
      platform[method](vi.fn())();
      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(expect.anything(), removeFailure),
      );
    },
  );
});
