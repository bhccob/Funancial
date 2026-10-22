import { useId, type ReactNode } from 'react';
import { useModalDialog } from './useModalDialog';

export interface SheetProps {
  open: boolean;
  /** The sheet's accessible name. It is not drawn unless `showTitle` is set. */
  title: string;
  /** Draws the title at the top of the sheet, as a section title. */
  showTitle?: boolean;
  onClose(): void;
  children?: ReactNode;
}

/**
 * A tall sheet that slides up from the bottom edge, on the same native <dialog> mechanics as
 * `Dialog` (`useModalDialog`): showModal() traps focus and makes the page inert, and the dialog
 * stack lets the Android back gesture close it.
 */
export function Sheet({ open, title, showTitle = false, onClose, children }: SheetProps) {
  const modal = useModalDialog(open, onClose);
  const titleId = useId();

  return (
    <dialog
      {...modal}
      tabIndex={-1}
      aria-labelledby={titleId}
      // A tap on the dimmed page behind the sheet lands on the dialog element itself; its content
      // sits in the child below, so a tap on the sheet never has the dialog as its target.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="bg-overlay text-text motion-safe:animate-sheet-up rounded-t-sheet fixed inset-x-0 top-auto bottom-0 m-0 max-h-[calc(100dvh-64px)] w-full max-w-none overflow-y-auto border-0 p-0 shadow-(--shadow-overlay) backdrop:bg-black/40"
    >
      <div className="px-[22px] pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div aria-hidden className="bg-track mx-auto mb-[18px] h-[5px] w-10 rounded-full" />
        <h2 id={titleId} className={showTitle ? 'text-section mb-4' : 'sr-only'}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
