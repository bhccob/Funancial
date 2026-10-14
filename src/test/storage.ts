/** In-memory Storage double for tests. */
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

/** Storage double whose every access throws, like a browser with storage blocked. */
export function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('Storage disabled', 'SecurityError');
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}
