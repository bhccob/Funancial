/** Small key-value store for unencrypted vault metadata (wrapped keys, salts, unlock throttle). */
export interface MetaStore {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  /** Write only if nothing is stored under `key`, atomically. Returns whether it wrote. */
  putIfAbsent(key: string, value: unknown): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function memoryMetaStore(): MetaStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async (key, value) => void map.set(key, value),
    putIfAbsent: async (key, value) => {
      if (map.has(key)) return false;
      map.set(key, value);
      return true;
    },
    delete: async (key) => void map.delete(key),
  };
}
