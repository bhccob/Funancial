import { Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useModelessDialogOpen, useTopModalDialog } from '@/lib/dialogStack';
import { dismiss, useToasts, type ToastTone } from '@/lib/toast';

const bars: Record<ToastTone, string> = {
  info: 'border-l-text-muted',
  success: 'border-l-accent',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
  reward: 'border-l-xp',
};

/**
 * Toasts float just above the tab bar on phones (its top is 88px up: 22px below it and 66px of bar;
 * plus a 12px gap and the safe area) and at the bottom center on desktop. While the ＋ fan is open
 * they rise above its bubbles instead (those reach 196px up: 104px to their foot, 92px tall), so
 * they never cover one. While a modal dialog is open they render inside it, since the page behind
 * it is inert; the fan is not modal, and leaves the toasts where they are.
 */
export function Toaster() {
  const toasts = useToasts();
  const modal = useTopModalDialog();
  const overFan = useModelessDialogOpen();
  const region = (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-3 z-40 flex flex-col items-center gap-2 md:bottom-8',
        overFan
          ? 'bottom-[calc(208px+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(100px+env(safe-area-inset-bottom))]',
      )}
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
          {t.tone === 'reward' && (
            <Sparkles aria-hidden className="text-xp-text mt-0.5 size-4 shrink-0" />
          )}
          <p className="min-w-0 flex-1">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="text-muted hover:text-text -m-3.5 grid size-11 shrink-0 place-items-center rounded-full"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
  return modal ? createPortal(region, modal) : region;
}
