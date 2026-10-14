import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose(): void;
  children?: ReactNode;
  actions?: ReactNode;
}

/** Modal built on native <dialog>: focus trapping and inert background come from showModal(). */
export function Dialog({ open, title, description, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
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
      className="border-border-strong bg-surface text-text m-auto w-[min(92vw,420px)] rounded-lg border-2 p-0 shadow-[0_4px_0_var(--color-border-strong)] backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-display text-xl font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-muted">
              {description}
            </p>
          )}
        </div>
        {children}
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </dialog>
  );
}
