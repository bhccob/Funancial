import { Redis } from '@upstash/redis';

/**
 * What the account service needs from a key-value store, and no more. Values are JSON; sets hold
 * strings. The Upstash one runs it, `memoryKvStore` stands in for it in tests.
 */
export interface KvStore {
  get<T = unknown>(key: string): Promise<T | null>;
  /** `ex` is a lifetime in seconds. */
  set(key: string, value: unknown, ex?: number): Promise<void>;
  /** Writes only where the key is absent, in one step; says whether it wrote. */
  setNx(key: string, value: unknown, ex?: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string): Promise<number>;
  /** Arms a lifetime on a key that has none (EXPIRE NX); one that has a lifetime keeps it. */
  expire(key: string, seconds: number): Promise<void>;
  /** Seconds left: -1 for a key with no lifetime, -2 for a missing key. */
  ttl(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
}

export type UpstashClient = Pick<
  Redis,
  'get' | 'set' | 'del' | 'incr' | 'expire' | 'ttl' | 'sadd' | 'smembers' | 'srem'
>;

/**
 * The client is made with automatic deserialisation off, and values go in and out as JSON text here:
 * its own parser would turn the string "123" (a valid username) into a number.
 */
export function upstashKvStore(redis: UpstashClient): KvStore {
  return {
    async get<T>(key: string) {
      const raw = await redis.get<string>(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    },
    async set(key, value, ex) {
      await redis.set(key, JSON.stringify(value), ex === undefined ? undefined : { ex });
    },
    async setNx(key, value, ex) {
      const done = await redis.set(
        key,
        JSON.stringify(value),
        ex ? { nx: true, ex } : { nx: true },
      );
      return done !== null;
    },
    async del(...keys) {
      if (keys.length) await redis.del(...keys);
    },
    incr: (key) => redis.incr(key),
    async expire(key, seconds) {
      await redis.expire(key, seconds, 'NX');
    },
    ttl: (key) => redis.ttl(key),
    async sadd(key, member) {
      await redis.sadd(key, member);
    },
    smembers: (key) => redis.smembers<string[]>(key),
    async srem(key, member) {
      await redis.srem(key, member);
    },
  };
}

/** Read at call time, as everything else here is; null when the database is not configured. */
export function kvStoreFromEnv(): KvStore | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return upstashKvStore(new Redis({ url, token, automaticDeserialization: false }));
}

type Entry = { value: string | Set<string>; expiresAt?: number };

/** Behaves like the Upstash one, by value and by clock, so tests catch what a real store would. */
export function memoryKvStore(now: () => number = Date.now): KvStore & {
  /** Everything live, parsed, for a test to look at. */
  dump(): Record<string, unknown>;
} {
  const data = new Map<string, Entry>();
  const entry = (key: string) => {
    const e = data.get(key);
    if (e?.expiresAt !== undefined && e.expiresAt <= now()) {
      data.delete(key);
      return undefined;
    }
    return e;
  };
  const expiry = (ex?: number) => (ex === undefined ? {} : { expiresAt: now() + ex * 1000 });
  const members = (key: string) => {
    const e = entry(key);
    if (e && typeof e.value === 'string') throw new Error('WRONGTYPE');
    return (e?.value as Set<string> | undefined) ?? new Set<string>();
  };

  return {
    async get<T>(key: string) {
      const e = entry(key);
      return e && typeof e.value === 'string' ? (JSON.parse(e.value) as T) : null;
    },
    async set(key, value, ex) {
      data.set(key, { value: JSON.stringify(value), ...expiry(ex) });
    },
    async setNx(key, value, ex) {
      if (entry(key)) return false;
      data.set(key, { value: JSON.stringify(value), ...expiry(ex) });
      return true;
    },
    async del(...keys) {
      for (const key of keys) data.delete(key);
    },
    async incr(key) {
      const e = entry(key);
      const n = Number(e?.value ?? 0) + 1;
      data.set(key, { value: String(n), expiresAt: e?.expiresAt });
      return n;
    },
    async expire(key, seconds) {
      const e = entry(key);
      if (e && e.expiresAt === undefined) e.expiresAt = now() + seconds * 1000;
    },
    async ttl(key) {
      const e = entry(key);
      if (!e) return -2;
      return e.expiresAt === undefined ? -1 : Math.ceil((e.expiresAt - now()) / 1000);
    },
    async sadd(key, member) {
      const set = members(key);
      set.add(member);
      data.set(key, { value: set, expiresAt: entry(key)?.expiresAt });
    },
    async smembers(key) {
      return [...members(key)];
    },
    async srem(key, member) {
      const set = members(key);
      set.delete(member);
      if (set.size === 0) data.delete(key);
    },
    dump() {
      const live: Record<string, unknown> = {};
      for (const key of [...data.keys()]) {
        const e = entry(key);
        if (e) live[key] = typeof e.value === 'string' ? JSON.parse(e.value) : [...e.value].sort();
      }
      return live;
    },
  };
}
