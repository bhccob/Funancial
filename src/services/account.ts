import { z } from 'zod';
import type { Sealed } from '@/data/accountCrypto';

/** The service could not be reached: offline, a timeout or a dropped connection. */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach Funancial's service.");
    this.name = 'NetworkError';
  }
}

/** What the service answered. `body` is its JSON, or `null` when it sent none; `retryAfter` is in seconds. */
export type Reply = { status: number; body: unknown; retryAfter: number | null };

export type SignUpBody = {
  username: string;
  email: string;
  authKey: string;
  dek: string;
  wrappedPw: Sealed;
};
export type LogInBody = { username: string; authKey: string };
export type CopyBody = Sealed & { baseVersion: number };
export type PasswordBody = { oldAuthKey: string; newAuthKey: string; newWrappedPw: Sealed };

/** The account service, as the app's account layer uses it; tests hand it a fake. Each call throws `NetworkError` where nothing came back. */
export type AccountApi = {
  signUp(body: SignUpBody): Promise<Reply>;
  logIn(body: LogInBody): Promise<Reply>;
  putCopy(deviceToken: string, body: CopyBody): Promise<Reply>;
  deleteAccount(deviceToken: string): Promise<Reply>;
  changePassword(deviceToken: string, body: PasswordBody): Promise<Reply>;
};

const sealed = z.object({ iv: z.string(), ciphertext: z.string() });
/** `200` of sign-up. */
export const SignedUp = z.object({ deviceToken: z.string().min(1) });
/** `200` of log-in. `email` is not sent today; a phone that is told it keeps it. */
export const LoggedIn = z.object({
  deviceToken: z.string().min(1),
  wrappedPw: sealed,
  copy: sealed.extend({ version: z.int().min(0) }).nullable(),
  email: z.string().optional(),
});
/** `200` of an upload. */
export const Saved = z.object({ version: z.int().min(0), savedAt: z.string() });
/** `409` of an upload: where the service stands. `stale`: re-base on `version`. `busy`: try later. */
export const Conflict = z.object({ error: z.enum(['stale', 'busy']), version: z.int().min(0) });

/** A copy can be a megabyte up and down over a slow phone connection. */
const TIMEOUT_MS = 30_000;

async function call(
  method: 'POST' | 'PUT' | 'DELETE',
  route: string,
  deviceToken: string | null,
  body?: unknown,
): Promise<Reply> {
  const headers: Record<string, string> = {
    'X-Funancial-Token': import.meta.env.VITE_FUNANCIAL_API_TOKEN ?? '',
  };
  if (deviceToken) headers.Authorization = `Bearer ${deviceToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    const base = import.meta.env.VITE_FUNANCIAL_API_URL ?? '';
    res = await fetch(`${base}/api/${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NetworkError();
  }
  const seconds = Number.parseInt(res.headers.get('Retry-After') ?? '', 10);
  return {
    status: res.status,
    // A body that is not JSON (or was cut off) reads as none; the status still says what happened.
    body: await res.json().catch(() => null),
    retryAfter: Number.isNaN(seconds) ? null : seconds,
  };
}

export const accountApi: AccountApi = {
  signUp: (body) => call('POST', 'signup', null, body),
  logIn: (body) => call('POST', 'login', null, body),
  putCopy: (token, body) => call('PUT', 'copy', token, body),
  deleteAccount: (token) => call('DELETE', 'copy', token),
  changePassword: (token, body) => call('POST', 'password', token, body),
};
