import { useEffect, useRef, type KeyboardEvent, type RefObject, type SyntheticEvent } from 'react';
import { pushDialog, removeDialog } from '@/lib/dialogStack';

export interface ModalDialogProps {
  ref: RefObject<HTMLDialogElement | null>;
  onKeyDown(e: KeyboardEvent<HTMLDialogElement>): void;
  onCancel(e: SyntheticEvent<HTMLDialogElement>): void;
}

/**
 * What `Dialog` and `Sheet` share: a native <dialog> that is shown modally while `open`
 * (focus trapping and an inert background come from showModal()) and sits on the dialog stack,
 * so the Android back gesture can find it. Spread the result onto the <dialog>.
 */
export function useModalDialog(open: boolean, onClose: () => void): ModalDialogProps {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (!open) return;
    pushDialog(el);
    return () => removeDialog(el);
  }, [open]);

  return {
    ref,
    // Escape: handle the key ourselves so the close request doesn't also fire `cancel`.
    onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    // Other close requests (e.g. Android back gesture) arrive as `cancel`.
    onCancel(e) {
      e.preventDefault();
      onClose();
    },
  };
}
