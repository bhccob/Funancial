/** Small key-value store for unencrypted vault metadata (wrapped keys, salts). */
export interface MetaStore {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export function memoryMetaStore(): MetaStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
  };
}
