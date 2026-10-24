import { z } from 'zod';
import { safeStorage } from '@/lib/safeStorage';

/**
 * A sign-up waiting on its emailed code: whose it is (the name and address as typed) and when the code
 * was sent. Never the password, never the code. The person goes to their email app for the code, and
 * the screen they left may not be there when they come back: a lock takes every screen down, and the
 * phone may reload the app. So it is kept outside the screens, in memory (which a lock leaves alone)
 * and on the phone (`safeStorage`, which a reload leaves alone), for as long as the code works.
 */
export type PendingCode = { username: string; email: string; sentAt: number };

/** Where it is kept on the phone. */
export const PENDING_CODE_KEY = 'funancial.signup.code';
/** How long an emailed code works, from its mail. A sign-up waiting on an older one waits for nothing. */
export const CODE_LIFETIME_MS = 10 * 60_000;

const Stored = z.object({
  username: z.string().max(200),
  email: z.string().max(254),
  sentAt: z.number().finite(),
});

/** Whether `pending` is for a code that still works at `now`. */
export const stillWorks = (pending: PendingCode, now: number) =>
  now >= pending.sentAt && now - pending.sentAt < CODE_LIFETIME_MS;

function fromPhone(): PendingCode | null {
  const raw = safeStorage.get(PENDING_CODE_KEY);
  if (raw === null) return null;
  let parsed: ReturnType<typeof Stored.safeParse> | null = null;
  try {
    parsed = Stored.safeParse(JSON.parse(raw));
  } catch {
    // Not JSON: not one of ours.
  }
  if (parsed?.success && stillWorks(parsed.data, Date.now())) return parsed.data;
  // Run out, or unreadable: nothing to come back to.
  safeStorage.remove(PENDING_CODE_KEY);
  return null;
}

/** In memory: `undefined` until it is first read from the phone. */
let pending: PendingCode | null | undefined;
const listeners = new Set<() => void>();

/**
 * The sign-up waiting on a code, as it was last kept (one that has since run out included: the caller
 * checks `stillWorks` for the moment it asks about). Read from the phone the first time.
 */
export function pendingCode(): PendingCode | null {
  if (pending === undefined) pending = fromPhone();
  return pending;
}

/** Keeps `next` as the sign-up waiting on a code, or lets it go (`null`), in memory and on the phone. */
export function keepPendingCode(next: PendingCode | null) {
  pending = next;
  if (next) safeStorage.set(PENDING_CODE_KEY, JSON.stringify(next));
  else safeStorage.remove(PENDING_CODE_KEY);
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`: `listener` hears every change. */
export function subscribePendingCode(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
