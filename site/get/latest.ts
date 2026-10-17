import { LatestSchema, type Latest } from '@/domain/update';

// Absolute on purpose: at /get, without a trailing slash, './latest.json' would mean /latest.json.
const LATEST_URL = '/get/latest.json';
const TIMEOUT_MS = 5000;

/** The newest release, or null when there is none yet or the file is not one. */
export async function loadLatest(fetchImpl: typeof fetch = fetch): Promise<Latest | null> {
  try {
    const response = await fetchImpl(LATEST_URL, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = LatestSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** "Version 0.8 · 9.0 MB" */
export const metaLine = ({ versionName, size }: Latest) =>
  `Version ${versionName} · ${(size / 2 ** 20).toFixed(1)} MB`;
