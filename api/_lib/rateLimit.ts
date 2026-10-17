import type { KvStore } from './store.js';

export type Limit = { ok: true } | { ok: false; retryAfter: number };

/**
 * Counts one attempt in a fixed window that starts at its first attempt. The lifetime is armed on
 * every call (it only takes where there is none), so a crash between INCR and EXPIRE can't leave a
 * counter that never resets. `retryAfter` is the seconds left in the window.
 */
export async function rateLimit(
  store: KvStore,
  bucket: string,
  subject: string,
  limit: number,
  windowSec: number,
): Promise<Limit> {
  const key = `rl:${bucket}:${subject}`;
  const attempts = await store.incr(key);
  await store.expire(key, windowSec);
  if (attempts <= limit) return { ok: true };
  const left = await store.ttl(key);
  return { ok: false, retryAfter: left > 0 ? left : windowSec };
}
