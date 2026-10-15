import { vi } from 'vitest';
import type { BiometricVault } from '@/platform/types';

export type BiometricOutcome = 'ok' | 'cancelled' | 'changed';

/**
 * An in-memory biometric vault. Each `read` succeeds with the stored secret unless the test
 * scripted the next outcome with `nextRead`. `changed` behaves as the phone does after the
 * fingerprints or face changed: the copy is gone. The methods are spies.
 */
export function fakeBiometric({ available = true } = {}) {
  const slots = new Map<string, string>();
  let next: BiometricOutcome = 'ok';

  const vault = {
    available: vi.fn(async () => available),
    store: vi.fn(async (slot: string, secret: string) => void slots.set(slot, secret)),
    read: vi.fn(async (slot: string) => {
      const outcome = next;
      next = 'ok';
      if (outcome === 'cancelled') return { status: 'cancelled' as const };
      const secret = slots.get(slot);
      if (outcome === 'changed' || secret === undefined) {
        slots.delete(slot);
        return { status: 'changed' as const };
      }
      return { status: 'ok' as const, secret };
    }),
    forget: vi.fn(async (slot: string) => void slots.delete(slot)),
  } satisfies BiometricVault;

  return {
    ...vault,
    /** What the vault holds, by slot. */
    slots,
    /** How the next `read` ends. */
    nextRead(outcome: BiometricOutcome) {
      next = outcome;
    },
  };
}
