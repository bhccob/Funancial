/**
 * localStorage that never throws. Private windows, blocked site data and some embedded
 * WebViews make every access throw (or remove the object entirely); callers get null/false.
 */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const safeStorage = {
  get(key: string): string | null {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    const s = store();
    if (!s) return false;
    try {
      s.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      store()?.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  },
};

export type SafeStorage = typeof safeStorage;
