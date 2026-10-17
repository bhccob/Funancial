import { waitUntil } from '@vercel/functions';
import { createAccounts, MasterKeyMismatch, type Accounts, type Result } from './accounts.js';
import { bearerToken, clientIp, empty, guard, json, readJson } from './http.js';
import { gmailMailerFromEnv } from './mailer.js';
import { kvStoreFromEnv } from './store.js';

type Context = { token: string | null; body: unknown; query: URLSearchParams; ip: string };

/** Read at call time; null when the database or the master key (base64 of 32 bytes) is missing. Without Gmail only `forgot` is unavailable. */
function accountsFromEnv(): Accounts | null {
  const store = kvStoreFromEnv();
  const masterKey = Buffer.from(process.env.SERVER_MASTER_KEY ?? '', 'base64');
  return store && masterKey.length === 32
    ? createAccounts({
        store,
        masterKey,
        now: Date.now,
        mailer: gmailMailerFromEnv() ?? undefined,
        waitUntil,
      })
    : null;
}

/**
 * Makes an account route: the shared token first, then the service's setup, the JSON body (capped),
 * and `run`. Failures answer with a fixed string; the reason is never logged, as a store error can
 * carry what was being stored. `sharedToken: false` is for the reset link's routes only, whose proof
 * is the emailed token (see `reset`): the reset page is public and can't carry the shared one.
 */
export function accountRoute(
  run: (accounts: Accounts, context: Context) => Promise<Result>,
  hasBody = true,
  { sharedToken = true }: { sharedToken?: boolean } = {},
) {
  return async (req: Request): Promise<Response> => {
    const denied = sharedToken ? guard(req) : null;
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
        query: new URL(req.url).searchParams,
        ip: clientIp(req),
      });
      const res = answer === undefined ? empty(req, status) : json(req, answer, 'no-store', status);
      if (retryAfter !== undefined) res.headers.set('Retry-After', String(retryAfter));
      // The phone is a cross-origin caller and reads Retry-After only if it is exposed.
      res.headers.set('Access-Control-Expose-Headers', 'Retry-After');
      return res;
    } catch (err) {
      if (err instanceof MasterKeyMismatch) {
        // SERVER_MASTER_KEY was changed after accounts were made: a setup problem, not a failure.
        console.error('[api] the master key does not match the account');
        return json(req, { error: 'not configured' }, 'no-store', 503);
      }
      console.error('[api] accounts failure:', err instanceof Error ? err.name : 'unknown');
      return json(req, { error: 'unavailable' }, 'no-store', 503);
    }
  };
}
