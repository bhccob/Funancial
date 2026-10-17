import { afterEach, describe, expect, it, vi } from 'vitest';
import { kvStoreFromEnv, memoryKvStore, upstashKvStore, type KvStore } from './store.js';

describe('memoryKvStore', () => {
  const T0 = Date.parse('2026-10-17T12:00:00.000Z');

  it('keeps JSON values by value, so a caller cannot change what is stored', async () => {
    const store = memoryKvStore();
    const value = { a: [1, 2], b: 'x' };
    await store.set('k', value);
    value.a.push(3);
    const got = await store.get<typeof value>('k');
    expect(got).toEqual({ a: [1, 2], b: 'x' });
    got?.a.push(9);
    expect(await store.get('k')).toEqual({ a: [1, 2], b: 'x' });
    expect(await store.get('missing')).toBeNull();
  });

  it('expires a key set with ex once the clock passes it', async () => {
    let now = T0;
    const store = memoryKvStore(() => now);
    await store.set('k', 'v', 30);
    expect(await store.ttl('k')).toBe(30);
    now += 29_000;
    expect(await store.get('k')).toBe('v');
    expect(await store.ttl('k')).toBe(1);
    now += 1_000;
    expect(await store.get('k')).toBeNull();
    expect(await store.ttl('k')).toBe(-2);
  });

  it('sets only an absent key with setNx, and reports which', async () => {
    let now = T0;
    const store = memoryKvStore(() => now);
    expect(await store.setNx('k', 'first', 10)).toBe(true);
    expect(await store.setNx('k', 'second', 10)).toBe(false);
    expect(await store.get('k')).toBe('first');
    now += 10_000;
    expect(await store.setNx('k', 'third', 10)).toBe(true);
    expect(await store.get('k')).toBe('third');
  });

  it('counts with incr, and expire arms a window only where there is none', async () => {
    let now = T0;
    const store = memoryKvStore(() => now);
    expect(await store.incr('n')).toBe(1);
    expect(await store.ttl('n')).toBe(-1);
    await store.expire('n', 60);
    now += 20_000;
    await store.expire('n', 60); // already armed: left alone
    expect(await store.ttl('n')).toBe(40);
    expect(await store.incr('n')).toBe(2);
    now += 40_000;
    expect(await store.incr('n')).toBe(1);
  });

  it('keeps sets of strings, and an emptied set is gone', async () => {
    const store = memoryKvStore();
    await store.sadd('s', 'a');
    await store.sadd('s', 'b');
    await store.sadd('s', 'a');
    expect((await store.smembers('s')).sort()).toEqual(['a', 'b']);
    await store.srem('s', 'a');
    await store.srem('s', 'b');
    expect(await store.smembers('s')).toEqual([]);
    expect(store.dump()).toEqual({});
  });

  it('deletes several keys at once', async () => {
    const store = memoryKvStore();
    await store.set('a', 1);
    await store.set('b', 2);
    await store.set('c', 3);
    await store.del('a', 'c', 'nothing');
    expect(store.dump()).toEqual({ b: 2 });
  });
});

describe('upstashKvStore', () => {
  // Just enough of the client: strings by key, the way the real one answers with
  // automatic deserialisation off, and a record of how it was asked.
  function fake() {
    const data = new Map<string, string>();
    const calls: unknown[][] = [];
    const redis = {
      get: async (key: string) => data.get(key) ?? null,
      set: async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
        calls.push(['set', key, opts]);
        if (opts?.nx && data.has(key)) return null;
        data.set(key, value);
        return 'OK';
      },
      del: async (...keys: string[]) => {
        calls.push(['del', ...keys]);
        return keys.filter((k) => data.delete(k)).length;
      },
      incr: async (key: string) => {
        const n = Number(data.get(key) ?? 0) + 1;
        data.set(key, String(n));
        return n;
      },
      expire: async (key: string, seconds: number, option?: string) => {
        calls.push(['expire', key, seconds, option]);
        return 1 as const;
      },
      ttl: async (key: string) => {
        calls.push(['ttl', key]);
        return 12;
      },
      sadd: async (key: string, member: string) => {
        data.set(key, JSON.stringify([...JSON.parse(data.get(key) ?? '[]'), member]));
        return 1;
      },
      smembers: async (key: string) => JSON.parse(data.get(key) ?? '[]') as string[],
      srem: async (key: string, member: string) => {
        data.set(
          key,
          JSON.stringify(
            (JSON.parse(data.get(key) ?? '[]') as string[]).filter((m) => m !== member),
          ),
        );
        return 1;
      },
    };
    return {
      data,
      calls,
      store: upstashKvStore(redis as unknown as Parameters<typeof upstashKvStore>[0]),
    };
  }

  it('writes JSON text and reads it back as the same value, a numeric-looking name included', async () => {
    const { data, store } = fake();
    await store.set('acct', { username: 'ada', version: 1 });
    expect(data.get('acct')).toBe('{"username":"ada","version":1}');
    expect(await store.get('acct')).toEqual({ username: 'ada', version: 1 });

    // Upstash's own deserialiser would turn "123" into a number; the store must not.
    await store.set('ptr', '123');
    expect(await store.get('ptr')).toBe('123');
    expect(await store.get('absent')).toBeNull();
  });

  it('passes the expiry to set, and says whether setNx wrote', async () => {
    const { calls, store } = fake();
    await store.set('a', 1, 1800);
    expect(await store.setNx('b', 1, 60)).toBe(true);
    expect(await store.setNx('b', 2, 60)).toBe(false);
    expect(calls).toEqual([
      ['set', 'a', { ex: 1800 }],
      ['set', 'b', { nx: true, ex: 60 }],
      ['set', 'b', { nx: true, ex: 60 }],
    ]);
  });

  it('arms an expiry only where there is none (EXPIRE NX), and passes ttl through', async () => {
    const { calls, store } = fake();
    await store.expire('rl:x', 900);
    expect(await store.ttl('rl:x')).toBe(12);
    expect(calls).toEqual([
      ['expire', 'rl:x', 900, 'NX'],
      ['ttl', 'rl:x'],
    ]);
  });

  it('counts, deletes and keeps sets', async () => {
    const { calls, store } = fake();
    expect(await store.incr('n')).toBe(1);
    expect(await store.incr('n')).toBe(2);
    await store.del('a', 'b');
    expect(calls).toContainEqual(['del', 'a', 'b']);
    await store.sadd('s', 'ada');
    await store.sadd('s', 'grace');
    expect(await store.smembers('s')).toEqual(['ada', 'grace']);
    await store.srem('s', 'ada');
    expect(await store.smembers('s')).toEqual(['grace']);
  });
});

describe('kvStoreFromEnv', () => {
  const names = [
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ];
  afterEach(() => vi.unstubAllEnvs());
  const env = (values: Record<string, string>) => {
    for (const name of names) vi.stubEnv(name, values[name] ?? '');
  };
  const isStore = (s: KvStore | null) => expect(typeof s?.get).toBe('function');

  it('is null when the URL or the token is missing or empty', () => {
    env({});
    expect(kvStoreFromEnv()).toBeNull();
    env({ KV_REST_API_URL: 'https://kv.example' });
    expect(kvStoreFromEnv()).toBeNull();
    env({ KV_REST_API_TOKEN: 'secret' });
    expect(kvStoreFromEnv()).toBeNull();
  });

  it('reads the Vercel integration names, then the Upstash ones', () => {
    env({ KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'secret' });
    isStore(kvStoreFromEnv());
    env({ UPSTASH_REDIS_REST_URL: 'https://kv.example', UPSTASH_REDIS_REST_TOKEN: 'secret' });
    isStore(kvStoreFromEnv());
    env({ KV_REST_API_URL: 'https://kv.example', UPSTASH_REDIS_REST_TOKEN: 'secret' });
    isStore(kvStoreFromEnv());
  });
});
