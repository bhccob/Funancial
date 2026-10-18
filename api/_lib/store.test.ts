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

  it('counts with a lifetime that starts again at each count, given in the same step', async () => {
    let now = T0;
    const store = memoryKvStore(() => now);
    expect(await store.incr('n', 60)).toBe(1);
    expect(await store.ttl('n')).toBe(60);
    now += 50_000;
    expect(await store.incr('n', 60)).toBe(2);
    expect(await store.ttl('n')).toBe(60);
    now += 50_000;
    // Without one, a count keeps the lifetime it has.
    expect(await store.incr('n')).toBe(3);
    expect(await store.ttl('n')).toBe(10);
    now += 10_000;
    expect(await store.incr('n', 60)).toBe(1);
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

  it('writes with compareAndSet only where the key still holds what was read, and says whether it wrote', async () => {
    const store = memoryKvStore();
    await store.set('acct', { name: 'ada', n: 1 });
    // Compared by value, as the JSON text set would write.
    expect(await store.compareAndSet('acct', { name: 'ada', n: 1 }, { name: 'ada', n: 2 })).toBe(
      true,
    );
    expect(await store.get('acct')).toEqual({ name: 'ada', n: 2 });
    // A stale read loses, and writes nothing.
    expect(await store.compareAndSet('acct', { name: 'ada', n: 1 }, { name: 'ada', n: 9 })).toBe(
      false,
    );
    expect(await store.get('acct')).toEqual({ name: 'ada', n: 2 });
    // An absent key is not something that was read.
    expect(await store.compareAndSet('missing', null, 1)).toBe(false);
    expect(await store.get('missing')).toBeNull();
  });

  it('lets only one of two compareAndSet calls from the same read win', async () => {
    const store = memoryKvStore();
    await store.set('acct', { n: 0 });
    const results = await Promise.all([
      store.compareAndSet('acct', { n: 0 }, { n: 1 }),
      store.compareAndSet('acct', { n: 0 }, { n: 2 }),
    ]);
    expect(results.sort()).toEqual([false, true]);
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
      eval: async (script: string, keys: string[], args: string[]) => {
        calls.push(['eval', script, keys, args]);
        if (script.includes('INCR')) {
          const n = Number(data.get(keys[0] ?? '') ?? 0) + 1;
          data.set(keys[0] ?? '', String(n));
          return n;
        }
        // What the script does: SET only if GET still gives the first argument.
        if (data.get(keys[0] ?? '') !== args[0]) return 0;
        data.set(keys[0] ?? '', args[1] ?? '');
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

  it('counts with a lifetime in one EVAL, INCR then EXPIRE, so no count is left without one', async () => {
    const { calls, store } = fake();
    expect(await store.incr('rl:x', 900)).toBe(1);
    expect(await store.incr('rl:x', 900)).toBe(2);
    expect(calls).toHaveLength(2);
    const [name, script, keys, args] = calls[0] as [string, string, string[], string[]];
    expect([name, keys, args]).toEqual(['eval', ['rl:x'], ['900']]);
    expect(script).toBe(
      "local n = redis.call('INCR', KEYS[1]) redis.call('EXPIRE', KEYS[1], ARGV[1]) return n",
    );
  });

  it('runs compareAndSet as one EVAL of GET-compare-SET over the JSON text', async () => {
    const { calls, data, store } = fake();
    await store.set('acct', { n: 1 });
    expect(await store.compareAndSet('acct', { n: 1 }, { n: 2 })).toBe(true);
    expect(data.get('acct')).toBe('{"n":2}');
    expect(await store.compareAndSet('acct', { n: 1 }, { n: 3 })).toBe(false);
    expect(data.get('acct')).toBe('{"n":2}');

    const [, script, keys, args] = calls.find((c) => c[0] === 'eval') ?? [];
    expect(script).toBe(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 else return 0 end",
    );
    expect(keys).toEqual(['acct']);
    expect(args).toEqual(['{"n":1}', '{"n":2}']);
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
