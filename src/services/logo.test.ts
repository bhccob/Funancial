import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const PNG = () =>
  new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  });

/** A fresh module each test: the per-session cache lives in it. */
async function load() {
  vi.resetModules();
  return import('./logo');
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_FUNANCIAL_API_URL', 'https://prices.example');
  vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', 'secret');
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('logoUrl', () => {
  it('is the price service route for the upper-case symbol', async () => {
    const { logoUrl } = await load();
    expect(logoUrl('ko')).toBe('https://prices.example/api/logo?symbol=KO');
    expect(logoUrl('VWRL.AS')).toBe('https://prices.example/api/logo?symbol=VWRL.AS');
  });

  it("is the app's own origin when no address is set", async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_URL', '');
    const { logoUrl } = await load();
    expect(logoUrl('KO')).toBe('/api/logo?symbol=KO');
  });
});

describe('loadLogo', () => {
  it('fetches the image as a blob with the token and a timeout, and asks once per symbol', async () => {
    fetchMock.mockImplementation(async () => PNG());
    const { loadLogo } = await load();

    const first = await loadLogo('ko');
    expect(first).toBeInstanceOf(Blob);
    expect(first?.type).toBe('image/png');
    expect(first?.size).toBe(4);
    // The same symbol again, however it is spelt, and while the first is still pending.
    const [again, concurrent] = await Promise.all([loadLogo('KO'), loadLogo('Ko')]);
    expect(again).toBe(first);
    expect(concurrent).toBe(first);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://prices.example/api/logo?symbol=KO');
    expect(init.headers).toEqual({ 'X-Funancial-Token': 'secret' });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    await loadLogo('MSFT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('answers null for a symbol with no logo (404), and remembers that too', async () => {
    fetchMock.mockImplementation(
      async () => new Response('{"error":"not found"}', { status: 404 }),
    );
    const { loadLogo } = await load();
    expect(await loadLogo('VUSA.L')).toBeNull();
    expect(await loadLogo('VUSA.L')).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws when the service cannot be reached or fails, and asks again next time', async () => {
    const { loadLogo } = await load();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(loadLogo('KO')).rejects.toThrow("Couldn't reach the price service.");
    fetchMock.mockResolvedValueOnce(new Response('{"error":"upstream"}', { status: 502 }));
    await expect(loadLogo('KO')).rejects.toThrow("Couldn't reach the price service.");
    fetchMock.mockImplementationOnce(async () => PNG());
    expect(await loadLogo('KO')).toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never asks without a token', async () => {
    vi.stubEnv('VITE_FUNANCIAL_API_TOKEN', '');
    const { loadLogo } = await load();
    expect(await loadLogo('KO')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
