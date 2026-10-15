import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useTopDialog } from '@/lib/dialogStack';
import { dismiss, useToasts, type ToastTone } from '@/lib/toast';

const bars: Record<ToastTone, string> = {
  info: 'border-l-text-muted',
  success: 'border-l-accent',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
};

/**
 * Toasts float above the bottom tabs on phones and at the bottom center on desktop. While a
 * modal dialog is open they render inside it, since the page behind it is inert.
 */
export function Toaster() {
  const toasts = useToasts();
  const dialog = useTopDialog();
  const region = (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(150px+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 md:bottom-8"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'danger' ? 'alert' : 'status'}
          className={cn(
            'bg-overlay pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border-l-[3px] px-4 py-3 text-sm font-semibold shadow-(--shadow-float)',
            bars[t.tone],
          )}
        >
          <p className="min-w-0 flex-1">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="text-muted hover:text-text -m-1 rounded p-1"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
  return dialog ? createPortal(region, dialog) : region;
}
