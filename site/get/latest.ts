import './jitless';
import { LatestSchema, type Latest } from '@/domain/update';

// Absolute on purpose: at /get, without a trailing slash, './latest.json' would mean /latest.json.
const LATEST_URL = '/get/latest.json';
const TIMEOUT_MS = 5000;

/** A signal that aborts after `ms`, on browsers that predate AbortSignal.timeout too. */
function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  if (typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), done: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** The newest release, or null when there is none yet or the file is not one. */
export async function loadLatest(fetchImpl: typeof fetch = fetch): Promise<Latest | null> {
  let done = () => {};
  try {
    const timeout = timeoutSignal(TIMEOUT_MS);
    done = timeout.done;
    const response = await fetchImpl(LATEST_URL, { cache: 'no-cache', signal: timeout.signal });
    if (!response.ok) return null;
    const parsed = LatestSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    done();
  }
}

/** "Version 0.8 · 9.4 MB". Decimal MB, which is what Android's download notification shows. */
export const metaLine = ({ versionName, size }: Latest) =>
  `Version ${versionName} · ${(size / 1_000_000).toFixed(1)} MB`;
