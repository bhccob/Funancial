import { z } from 'zod';
import { safeStorage, type SafeStorage } from '@/lib/safeStorage';

/**
 * A sign-up waiting on its emailed code: whose it is (the name and address as typed) and when the code
 * was sent. Never the password, never the code. The person goes to their email app for the code, and
 * the screen they left may not be there when they come back: a lock takes every screen down, and the
 * phone may reload the app. So it is kept outside the screens, in memory (which a lock leaves alone)
 * and on the phone (`safeStorage`, which a reload leaves alone), for as long as the code works.
 *
 * The sign-up screens keep it and let it go (`useEmailCode`). The app lets it go too wherever it forgets
 * what was typed on this phone or no longer needs it: Delete all data, starting over, and a log-in
 * (`forgetPendingCode`); and it drops one whose code has run out as it boots (`dropStalePendingCode`).
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

/** What `storage` keeps, if it is one of ours and its code still works at `now`. */
function keptOn(storage: SafeStorage, now: number): PendingCode | null {
  const raw = storage.get(PENDING_CODE_KEY);
  if (raw === null) return null;
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success && stillWorks(parsed.data, now) ? parsed.data : null;
  } catch {
    // Not JSON: not one of ours.
    return null;
  }
}

/** In memory: `undefined` until it is first read from the phone. */
let pending: PendingCode | null | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/**
 * The sign-up waiting on a code, as it was last kept (one that has since run out included: the caller
 * checks `stillWorks` for the moment it asks about). Read from the phone the first time, which drops
 * one there that has run out or is not ours.
 */
export function pendingCode(): PendingCode | null {
  if (pending === undefined) {
    pending = keptOn(safeStorage, Date.now());
    if (pending === null) safeStorage.remove(PENDING_CODE_KEY);
  }
  return pending;
}

/** Keeps `next` as the sign-up waiting on a code, or lets it go (`null`), in memory and on the phone. */
export function keepPendingCode(next: PendingCode | null) {
  pending = next;
  if (next) safeStorage.set(PENDING_CODE_KEY, JSON.stringify(next));
  else safeStorage.remove(PENDING_CODE_KEY);
  changed();
}

/**
 * Lets go of any sign-up waiting on a code, in memory and on the phone: `storage` is the phone's
 * storage as the caller holds it (the app store's own; it is `safeStorage` in the app).
 */
export function forgetPendingCode(storage: SafeStorage = safeStorage) {
  storage.remove(PENDING_CODE_KEY);
  keepPendingCode(null);
}

/**
 * As the app boots: a sign-up whose code has run out by `now` (or a record that is not ours) is let go,
 * in memory and on the phone, rather than left there until a sign-up screen next opens.
 */
export function dropStalePendingCode(storage: SafeStorage = safeStorage, now = Date.now()) {
  if (storage.get(PENDING_CODE_KEY) !== null && keptOn(storage, now) === null) {
    storage.remove(PENDING_CODE_KEY);
  }
  if (pending && !stillWorks(pending, now)) keepPendingCode(null);
}

/** For `useSyncExternalStore`: `listener` hears every change. */
export function subscribePendingCode(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
