/** Cross-tab signal: when one tab rewrites or deletes the data, other open tabs reload. */
export type SyncMessage = {
  type: 'reload';
  reason: 'secret' | 'restore' | 'delete' | 'namespace';
};

export interface SyncChannel {
  post(m: SyncMessage): void;
  subscribe(fn: (m: SyncMessage) => void): () => void;
  close(): void;
}

const REASONS = new Set(['secret', 'restore', 'delete', 'namespace']);

function isSyncMessage(v: unknown): v is SyncMessage {
  return (
    typeof v === 'object' &&
    v !== null &&
    'type' in v &&
    v.type === 'reload' &&
    'reason' in v &&
    typeof v.reason === 'string' &&
    REASONS.has(v.reason)
  );
}

/** Lazily opens a BroadcastChannel; a no-op where the API is missing. */
export function createChannel(name = 'funancial'): SyncChannel {
  let channel: BroadcastChannel | null | undefined;
  const get = () => {
    if (channel === undefined) {
      try {
        channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;
      } catch {
        channel = null;
      }
    }
    return channel;
  };

  return {
    post(m) {
      try {
        get()?.postMessage(m);
      } catch {
        // Another tab missing a reload is recoverable; never fail the write over it.
      }
    },
    subscribe(fn) {
      const c = get();
      if (!c) return () => {};
      const handler = (e: MessageEvent) => {
        if (isSyncMessage(e.data)) fn(e.data);
      };
      c.addEventListener('message', handler);
      return () => c.removeEventListener('message', handler);
    },
    close() {
      channel?.close();
      channel = null;
    },
  };
}
