import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Latest } from '@/domain/update';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Platform } from '@/platform/types';
import { fakeAppLifecycle } from '@/test/fakeAppLifecycle';
import { UpdateBanner } from './UpdateBanner';

const PAGE = 'https://funcial.vercel.app/get/latest.json';
const latest = (versionCode: number): Latest => ({
  versionCode,
  versionName: `0.${versionCode}`,
  notes: `What is new in ${versionCode}.`,
  apkUrl: `https://funcial.vercel.app/get/funcial-0.${versionCode}.apk`,
  sha256: 'a'.repeat(63) + '0',
  size: 12_345_678,
});

/** What latest.json says right now; a test changes it between checks. */
let published: unknown;
const fetchMock = vi.fn();
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  published = latest(9);
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(published)));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_RELEASE', '1');
  vi.stubEnv('VITE_UPDATE_URL', PAGE);
  localStorage.clear();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  consoleError.mockRestore();
});

/** The app on a phone that has installed `code`, or (`null`) on a web page with no version. */
function setup(installed: number | null = 8, over: Partial<Platform> = {}) {
  const appVersion = vi.fn(async () =>
    installed === null ? null : { code: installed, name: '0.8' },
  );
  const native = fakeAppLifecycle({ appVersion, ...over });
  const mount = () =>
    render(
      <PlatformProvider platform={native.platform}>
        <UpdateBanner />
      </PlatformProvider>,
    );
  return { ...native, appVersion, ...mount(), mount };
}

/** Lets a check that has started finish, so a test can say nothing appeared. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

/** A fetch that answers when the test says so, to make two checks overlap. */
function pending(body: unknown) {
  let answer!: () => void;
  const response = new Promise<Response>((resolve) => {
    answer = () => resolve(new Response(JSON.stringify(body)));
  });
  return { response, answer };
}

const notice = () => screen.queryByRole('status');

describe('a debug build', () => {
  it('never fetches latest.json and never shows the banner, even if it names a newer version', async () => {
    vi.stubEnv('VITE_RELEASE', undefined);
    published = latest(99);
    const { appVersion, resume } = setup();

    await settle();
    resume();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(appVersion).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it.each(['', '0', 'true'])('does not treat VITE_RELEASE=%j as a release build', async (flag) => {
    vi.stubEnv('VITE_RELEASE', flag);
    setup();

    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });
});

describe('a release build', () => {
  it('says a newer version is ready, with its notes and a link to the file', async () => {
    setup(8);

    expect(await screen.findByText('Version 0.9 is ready')).toBeInTheDocument();
    // Long notes stay three lines, so the banner cannot push the page down.
    expect(screen.getByText('What is new in 9.')).toHaveClass('line-clamp-3');
    expect(screen.getByRole('link', { name: 'Update' })).toHaveAttribute(
      'href',
      'https://funcial.vercel.app/get/funcial-0.9.apk',
    );
    expect(fetchMock).toHaveBeenCalledWith(PAGE, expect.anything());
    // The button's name starts with the words on it, for people who speak them to a switch or voice control.
    expect(
      screen.getByRole('button', { name: 'Not now, hide the update notice' }),
    ).toHaveTextContent('Not now');
  });

  it('says nothing when the phone is already up to date', async () => {
    setup(9);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle();

    expect(notice()).toBeNull();
  });

  it('does not check on the web, where the app has no version', async () => {
    setup(null);

    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it('hides with Not now, and stays hidden for that version after a restart', async () => {
    const { unmount, mount } = setup(8);
    await screen.findByText('Version 0.9 is ready');

    await userEvent.click(screen.getByRole('button', { name: 'Not now, hide the update notice' }));
    expect(notice()).toBeNull();
    expect(localStorage.getItem('funancial.update.dismissed')).toBe('9');

    unmount();
    fetchMock.mockClear();
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle();
    expect(notice()).toBeNull();
  });

  it('shows again for a version newer than the one that was hidden', async () => {
    const { resume } = setup(8);
    await screen.findByText('Version 0.9 is ready');
    await userEvent.click(screen.getByRole('button', { name: 'Not now, hide the update notice' }));

    published = latest(10);
    resume();

    expect(await screen.findByText('Version 0.10 is ready')).toBeInTheDocument();
  });

  it('checks again each time the app comes back', async () => {
    published = latest(8);
    const { resume } = setup(8);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settle();
    expect(notice()).toBeNull();

    published = latest(9);
    resume();

    expect(await screen.findByText('Version 0.9 is ready')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies only the newest of two overlapping checks, whichever answers last', async () => {
    const slow = pending(latest(9));
    fetchMock.mockImplementationOnce(() => slow.response);
    published = latest(10);
    const { resume } = setup(8);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    resume();
    expect(await screen.findByText('Version 0.10 is ready')).toBeInTheDocument();
    slow.answer();
    await settle();

    expect(screen.getByText('Version 0.10 is ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update' })).toHaveAttribute('href', latest(10).apkUrl);
  });

  it('does nothing with a check that finishes after the app is gone', async () => {
    const slow = pending(latest(9));
    fetchMock.mockImplementationOnce(() => slow.response);
    const { unmount } = setup(8);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    unmount();
    slow.answer();
    await settle();

    expect(notice()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('stops checking once it is gone', async () => {
    const { resume, unmount } = setup(8);
    await screen.findByText('Version 0.9 is ready');

    unmount();
    fetchMock.mockClear();
    resume();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an apkUrl on another origin', { ...latest(9), apkUrl: 'https://evil.example/a.apk' }],
    [
      'an apkUrl with a user name and password',
      { ...latest(9), apkUrl: 'https://user:pw@funcial.vercel.app/get/a.apk' },
    ],
    ['an http apkUrl', { ...latest(9), apkUrl: 'http://funcial.vercel.app/get/a.apk' }],
    ['a versionCode that is not a number', { ...latest(9), versionCode: '9' }],
    ['huge notes', { ...latest(9), notes: 'x'.repeat(100_000) }],
    ['a body that is not an object', 'newer'],
  ])('shows nothing for a latest.json with %s', async (_, bad) => {
    published = bad;
    setup(8);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle();

    expect(notice()).toBeNull();
  });

  it('shows nothing when the page cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    setup(8);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle();

    expect(notice()).toBeNull();
  });

  it('shows nothing, and does not fail, when the app cannot read its own version', async () => {
    const failure = new Error('bridge down');
    setup(8, { appVersion: async () => Promise.reject(failure) });

    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure);
  });
});
