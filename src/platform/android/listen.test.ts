import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listen } from './listen';

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('listen', () => {
  it('adds the listener and removes it on unsubscribe', async () => {
    const remove = vi.fn(async () => {});
    const unsubscribe = listen(async () => ({ remove }), 'the back button');

    unsubscribe();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('removes a listener that was still being added when it was unsubscribed', async () => {
    const remove = vi.fn(async () => {});
    let added!: () => void;
    const unsubscribe = listen(
      () => new Promise((resolve) => (added = () => resolve({ remove }))),
      'resume',
    );

    unsubscribe();
    expect(remove).not.toHaveBeenCalled();
    added();

    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it('logs a listener that cannot be added instead of leaving the rejection unhandled', async () => {
    const failure = new Error('bridge down');
    const unsubscribe = listen(() => Promise.reject(failure), 'pause');

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('pause'), failure),
    );
    expect(() => unsubscribe()).not.toThrow();
  });

  it('logs a listener that cannot be removed instead of leaving the rejection unhandled', async () => {
    const failure = new Error('already gone');
    const unsubscribe = listen(async () => ({ remove: () => Promise.reject(failure) }), 'resume');

    unsubscribe();

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('resume'), failure),
    );
  });
});
