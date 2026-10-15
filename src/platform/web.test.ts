import { describe, expect, it, vi } from 'vitest';
import { browserKeyring } from '@/data/keyring';
import { downloadText } from '@/lib/download';
import { createWebPlatform } from './web';

vi.mock('@/lib/download', () => ({ downloadText: vi.fn() }));

describe('createWebPlatform', () => {
  it('the web platform keeps browser storage and downloads', async () => {
    const platform = createWebPlatform();

    expect(platform.kind).toBe('web');
    expect(platform.keyring).toBe(browserKeyring);

    await platform.files.save('funancial-export.json', '{}', 'application/json');
    expect(downloadText).toHaveBeenCalledWith('funancial-export.json', '{}', 'application/json');
  });

  it('reports a resume when the page becomes visible again', () => {
    const platform = createWebPlatform();
    const resumed = vi.fn();
    const stop = platform.onResume(resumed);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).toHaveBeenCalledTimes(1);

    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('reports a pause when the page is hidden', () => {
    const platform = createWebPlatform();
    const paused = vi.fn();
    const stop = platform.onPause(paused);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).not.toHaveBeenCalled();

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).toHaveBeenCalledTimes(1);

    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});
