import { LatestSchema, type Latest } from '@/domain/update';

/** Only the release script's web build sets this, so a debug build on the owner's phone never checks. */
export const isReleaseBuild = (): boolean => import.meta.env.VITE_RELEASE === '1';

/** Where this build looks: the download page, or the test channel's page when the release script says so. */
export const updateUrl = (): string =>
  import.meta.env.VITE_UPDATE_URL || 'https://funancial.vercel.app/get/latest.json';

const TIMEOUT_MS = 5_000;

/**
 * The `latest.json` at `url`, or `null` for anything short of a good one: no connection, a slow
 * answer, a status other than 200, a body that is not a valid file, or an APK link on another
 * origin than the page (which also rules out http for an https page). Sends nothing about the
 * person: no headers, no cookies, no token.
 */
export async function fetchLatest(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Latest | null> {
  const timeout = new AbortController();
  // Not AbortSignal.timeout, so the limit also covers reading the body and a test can drive it.
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: timeout.signal, credentials: 'omit' });
    if (res.status !== 200) return null;
    const parsed = LatestSchema.safeParse(await res.json());
    if (!parsed.success || new URL(parsed.data.apkUrl).origin !== new URL(url).origin) return null;
    return parsed.data;
  } catch {
    // Offline, a timeout, or a body that is not JSON all read the same: there is nothing to offer.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
