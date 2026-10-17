import { createAccounts, type Accounts, type Result } from './accounts.js';
import { bearerToken, clientIp, empty, guard, json, readJson } from './http.js';
import { kvStoreFromEnv } from './store.js';

type Context = { token: string | null; body: unknown; ip: string };

/** Read at call time; null when the database or the master key (base64 of 32 bytes) is missing. */
function accountsFromEnv(): Accounts | null {
  const store = kvStoreFromEnv();
  const masterKey = Buffer.from(process.env.SERVER_MASTER_KEY ?? '', 'base64');
  return store && masterKey.length === 32
    ? createAccounts({ store, masterKey, now: Date.now })
    : null;
}

/**
 * Makes an account route: the shared token first, then the service's setup, the JSON body (capped),
 * and `run`. Failures answer with a fixed string; the reason is never logged, as a store error can
 * carry what was being stored.
 */
export function accountRoute(
  run: (accounts: Accounts, context: Context) => Promise<Result>,
  hasBody = true,
) {
  return async (req: Request): Promise<Response> => {
    const denied = guard(req);
    if (denied) return denied;
    try {
      const accounts = accountsFromEnv();
      if (!accounts) return json(req, { error: 'not configured' }, 'no-store', 503);

      let body: unknown;
      if (hasBody) {
        const read = await readJson(req);
        if ('status' in read) {
          const error = read.status === 413 ? 'too large' : 'bad request';
          return json(req, { error }, 'no-store', read.status);
        }
        body = read.value;
      }

      const {
        status,
        body: answer,
        retryAfter,
      } = await run(accounts, {
        token: bearerToken(req),
        body,
        ip: clientIp(req),
      });
      const res = answer === undefined ? empty(req, status) : json(req, answer, 'no-store', status);
      if (retryAfter !== undefined) res.headers.set('Retry-After', String(retryAfter));
      return res;
    } catch (err) {
      console.error('[api] accounts failure:', err instanceof Error ? err.name : 'unknown');
      return json(req, { error: 'unavailable' }, 'no-store', 503);
    }
  };
}
