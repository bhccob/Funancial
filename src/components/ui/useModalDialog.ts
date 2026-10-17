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
 * so the Android back gesture can find it. Spread the result onto the <dialog>. Closing hands focus
 * back to what had it when the dialog opened (the browser does this itself; saying so here keeps it
 * true under the test stand-in for showModal(), and where the opener is still in the page).
 */
export function useModalDialog(open: boolean, onClose: () => void): ModalDialogProps {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
      // The browser focuses the first control, which can be a radio nobody chose (the "Overall" of
      // Overall / One category). Start on the chosen one, where Tab and the arrows expect to be.
      const first = document.activeElement;
      if (first instanceof HTMLInputElement && first.type === 'radio' && !first.checked) {
        [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')]
          .find((r) => r.name === first.name && r.form === first.form)
          ?.focus();
      }
    }
    if (!open && el.open) {
      el.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected)
        opener.current.focus();
      opener.current = null;
    }
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
