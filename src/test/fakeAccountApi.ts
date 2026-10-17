import { deriveAccountKeys, newDek, sealCopy, wrapDek, type Sealed } from '@/data/accountCrypto';
import type { DataSnapshot } from '@/domain/snapshot';
import { NetworkError, type AccountApi, type Reply } from '@/services/account';

type Stored = Sealed & { version: number };
type Account = {
  authKey: string;
  email: string;
  dek: string;
  wrappedPw: Sealed;
  token: string;
  copy: Stored | null;
};

const reply = (status: number, body: unknown = null, retryAfter: number | null = null): Reply => ({
  status,
  body,
  retryAfter,
});

/** What a scripted call does instead of the service: `real` runs what the service would have done. */
type Step = (real: () => Reply) => Reply | Promise<Reply>;

/** The account service as Call 7 describes it, in memory, with the iteration count tests use. */
export function fakeAccountApi() {
  const accounts = new Map<string, Account>();
  const calls: Array<{ route: keyof AccountApi; token: string | null; body: unknown }> = [];
  const steps: Partial<Record<keyof AccountApi, Step[]>> = {};
  const byToken = (token: string) => [...accounts.values()].find((a) => a.token === token);

  /** Records the call, then does the next scripted step if there is one, else the service's own. */
  function respond(
    route: keyof AccountApi,
    token: string | null,
    body: unknown,
    real: () => Reply,
  ) {
    calls.push({ route, token, body });
    const step = steps[route]?.shift();
    // A throw inside is a rejection, as a failed fetch is.
    return new Promise<Reply>((resolve) => resolve(step ? step(real) : real()));
  }

  const api: AccountApi = {
    signUp: (body) =>
      respond('signUp', null, body, () => {
        if (accounts.has(body.username)) return reply(409, { error: 'taken' });
        const token = crypto.randomUUID();
        accounts.set(body.username, {
          authKey: body.authKey,
          email: body.email,
          dek: body.dek,
          wrappedPw: body.wrappedPw,
          token,
          copy: null,
        });
        return reply(200, { deviceToken: token });
      }),
    logIn: (body) =>
      respond('logIn', null, body, () => {
        const account = accounts.get(body.username);
        if (account?.authKey !== body.authKey) return reply(401, { error: 'unauthorized' });
        account.token = crypto.randomUUID();
        return reply(200, {
          deviceToken: account.token,
          wrappedPw: account.wrappedPw,
          copy: account.copy,
        });
      }),
    putCopy: (token, body) =>
      respond('putCopy', token, body, () => {
        const account = byToken(token);
        if (!account) return reply(401, { error: 'unauthorized' });
        const stored = account.copy?.version ?? 0;
        if (body.baseVersion !== stored) return reply(409, { error: 'stale', version: stored });
        account.copy = { iv: body.iv, ciphertext: body.ciphertext, version: stored + 1 };
        return reply(200, { version: stored + 1, savedAt: new Date().toISOString() });
      }),
    deleteAccount: (token) =>
      respond('deleteAccount', token, null, () => {
        const name = [...accounts].find(([, a]) => a.token === token)?.[0];
        if (name === undefined) return reply(401, { error: 'unauthorized' });
        accounts.delete(name);
        return reply(204);
      }),
    changePassword: (token, body) =>
      respond('changePassword', token, body, () => {
        const account = byToken(token);
        if (!account || account.authKey !== body.oldAuthKey) {
          return reply(401, { error: 'unauthorized' });
        }
        account.authKey = body.newAuthKey;
        account.wrappedPw = body.newWrappedPw;
        return reply(204);
      }),
  };

  return {
    api,
    accounts,
    calls,
    /** The bodies sent to one route, oldest first. */
    sent: (route: keyof AccountApi) => calls.filter((c) => c.route === route).map((c) => c.body),
    /** Makes the next call to `route` do `step` instead of what the service would. */
    script(route: keyof AccountApi, ...next: Step[]) {
      (steps[route] ??= []).push(...next);
    },
    /** An account made on another phone, holding `snapshot` as its copy (or `copy` as it is). */
    async seed(options: {
      username: string;
      password: string;
      snapshot?: DataSnapshot;
      copy?: Stored;
      version?: number;
      iterations?: number;
    }) {
      const { authKey, kek } = await deriveAccountKeys(
        options.username,
        options.password,
        options.iterations ?? 1_000,
      );
      const dek = await newDek();
      const copy =
        options.copy ??
        (options.snapshot
          ? { ...(await sealCopy(options.snapshot, dek.key)), version: options.version ?? 1 }
          : null);
      accounts.set(options.username, {
        authKey,
        email: 'seed@example.com',
        dek: dek.raw,
        wrappedPw: await wrapDek(dek.raw, kek),
        token: crypto.randomUUID(),
        copy,
      });
      return dek;
    },
  };
}
export type FakeAccountApi = ReturnType<typeof fakeAccountApi>;

/** Steps for `script`. */
export const unreachable: Step = () => {
  throw new NetworkError();
};
/** The call reaches the service, which does its part, but the answer never comes back. */
export const lostReply: Step = (real) => {
  real();
  throw new NetworkError();
};
export const answers =
  (status: number, body: unknown = null, retryAfter: number | null = null): Step =>
  () =>
    reply(status, body, retryAfter);
