import { useEffect, useId, useRef, type ReactNode } from 'react';
import { pushDialog, removeDialog } from '@/lib/dialogStack';

export interface SheetProps {
  open: boolean;
  /** The sheet's accessible name; it is not drawn. */
  title: string;
  onClose(): void;
  children?: ReactNode;
}

/**
 * A tall sheet that slides up from the bottom edge, on the same native <dialog> mechanics as
 * `Dialog`: showModal() traps focus and makes the page inert, and the dialog stack lets the
 * Android back gesture close it.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (!open) return;
    pushDialog(el);
    return () => removeDialog(el);
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      // Escape: handle the key ourselves so the close request doesn't also fire `cancel`.
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      // Other close requests (e.g. Android back gesture) arrive as `cancel`.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A tap on the dimmed page behind the sheet lands on the dialog element itself; its content
      // sits in the child below, so a tap on the sheet never has the dialog as its target.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="bg-overlay text-text motion-safe:animate-sheet-up fixed inset-x-0 top-auto bottom-0 m-0 max-h-[calc(100dvh-64px)] w-full max-w-none overflow-y-auto rounded-t-[30px] border-0 p-0 shadow-(--shadow-overlay) backdrop:bg-black/40"
    >
      <div className="px-[22px] pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div aria-hidden className="bg-track mx-auto mb-[18px] h-[5px] w-10 rounded-full" />
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
