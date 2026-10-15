import { useCallback } from 'react';
import { toast } from './toast';

/** Run a user-triggered async action: failures become a visible message, never silence. */
export function useAction() {
  return useCallback(
    async (fn: () => Promise<unknown>, opts: { success?: string } = {}): Promise<boolean> => {
      try {
        await fn();
        if (opts.success) toast('success', opts.success);
        return true;
      } catch (e) {
        toast('danger', e instanceof Error && e.message ? e.message : 'Something went wrong.');
        return false;
      }
    },
    [],
  );
}
