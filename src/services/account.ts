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
/** `200` of log-in: the copy is `null` when the account has none; `email` and `savedAt` come from newer services. */
export const LoggedIn = z.object({
  deviceToken: z.string().min(1),
  wrappedPw: sealed,
  copy: sealed.extend({ version: z.int().min(0), savedAt: z.string().optional() }).nullable(),
  email: z.string().nullish(),
});
/** `200` of an upload. */
export const Saved = z.object({ version: z.int().min(0), savedAt: z.string() });
/** `409` of an upload: where the service stands. `stale`: re-base on `version`. `busy`: try later. */
export const Conflict = z.object({ error: z.enum(['stale', 'busy']), version: z.int().min(0) });

/** A copy can be a megabyte up and down over a slow phone connection. */
const TIMEOUT_MS = 30_000;

/** `AbortSignal.timeout` where there is one; an older WebView gets a controller and a timer, to clear when done. */
function timeoutSignal(ms: number): { signal: AbortSignal; done(): void } {
  if (typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), done: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

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
  const { signal, done } = timeoutSignal(TIMEOUT_MS);
  try {
    let res: Response;
    try {
      const base = import.meta.env.VITE_FUNANCIAL_API_URL ?? '';
      res = await fetch(`${base}/api/${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
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
  } finally {
    done();
  }
}

export const accountApi: AccountApi = {
  signUp: (body) => call('POST', 'signup', null, body),
  logIn: (body) => call('POST', 'login', null, body),
  putCopy: (token, body) => call('PUT', 'copy', token, body),
  deleteAccount: (token) => call('DELETE', 'copy', token),
  changePassword: (token, body) => call('POST', 'password', token, body),
};
