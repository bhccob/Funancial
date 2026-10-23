import { useId, type ReactNode } from 'react';
import { useModalDialog } from './useModalDialog';

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
  const modal = useModalDialog(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <dialog
      {...modal}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="glass-sheet text-text m-auto w-[min(92vw,440px)] rounded-[24px] border-0 p-0 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-xl font-extrabold tracking-tight">
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
