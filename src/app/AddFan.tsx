import { Minus, Plus, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { pushDialog, removeDialog } from '@/lib/dialogStack';

export type AddKind = 'expense' | 'income';

export interface AddFanProps {
  open: boolean;
  onClose(): void;
  /** Called after `onClose` with the bubble tapped. */
  onPick(kind: AddKind): void;
  /** The ＋ in the tab bar: focus goes back to it when the fan closes with focus inside. */
  plusRef: RefObject<HTMLButtonElement | null>;
}

const BUBBLES: { kind: AddKind; label: string; icon: LucideIcon }[] = [
  { kind: 'expense', label: 'Expense', icon: Minus },
  { kind: 'income', label: 'Income', icon: Plus },
];

/**
 * What the ＋ opens: Expense and Income, two bubbles that rise from it over a scrim.
 *
 * A <dialog> shown with show(), not showModal(): a modal would sit in the top layer above the tab
 * bar, but here the bar stays crisp above the scrim, with the ＋ turned into the × that closes the
 * fan. So nothing is inert by the browser's doing (AppShell makes the page inert itself), Escape
 * fires no `cancel` (it is listened for on the document), and the dialog goes on the dialog stack
 * by hand, where the Android back gesture finds it. A tap on the scrim closes it too.
 */
export function AddFan({ open, onClose, onPick, plusRef }: AddFanProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.show();
      first.current?.focus();
    }
    if (!open && el.open) {
      // Looked at before close(), which can move focus out of the dialog itself.
      const hadFocus = el.contains(document.activeElement);
      el.close();
      if (hadFocus) plusRef.current?.focus();
    }
    if (!open) return;
    pushDialog(el);
    return () => removeDialog(el);
  }, [open, plusRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        data-fan-scrim
        onClick={onClose}
        className={cn(
          'bg-scrim ease-glass fixed inset-0 z-20 transition-opacity duration-(--duration-standard)',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <dialog
        ref={ref}
        aria-label="Add"
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
        // `open:flex`, not `flex`: a display of its own would show the dialog while it is closed.
        // While it closes it stays drawn for as long as the bubbles take to leave (the discrete
        // transition of `display`). Taps between the bubbles go through it to the scrim.
        // No transform on it: a toast shown while it is open renders inside it, fixed to the screen.
        className="group/fan pointer-events-none fixed inset-x-0 bottom-[calc(104px+env(safe-area-inset-bottom))] z-40 m-0 w-full max-w-none justify-center gap-[18px] border-0 bg-transparent p-0 transition-[display] transition-discrete duration-(--duration-standard) open:flex"
      >
        {BUBBLES.map(({ kind, label, icon: Icon }, i) => (
          <button
            key={kind}
            ref={i === 0 ? first : undefined}
            type="button"
            onClick={() => {
              onClose();
              onPick(kind);
            }}
            className={cn(
              'flex flex-col items-center gap-1.5 text-[13px] font-extrabold group-open/fan:pointer-events-auto',
              // They rise 26px from the ＋, growing from 40% as they fade in, the second a beat
              // later, and sink back together. The start is set with `starting:`, as the dialog
              // was not drawn a moment before. Reduced motion keeps only the fade.
              'ease-glass transition-[opacity,translate,scale] duration-(--duration-standard)',
              'group-not-open/fan:opacity-0 starting:opacity-0',
              'motion-safe:group-not-open/fan:translate-y-[26px] motion-safe:group-not-open/fan:scale-[0.4]',
              'motion-safe:starting:translate-y-[26px] motion-safe:starting:scale-[0.4]',
              i > 0 && 'group-open/fan:delay-(--stagger-fan)',
            )}
          >
            <span className="bg-primary text-primary-contrast grid size-[60px] place-items-center rounded-full">
              <Icon aria-hidden className="size-6" />
            </span>
            <span className="bg-surface text-text rounded-full px-2.5 py-[3px]">{label}</span>
          </button>
        ))}
      </dialog>
    </>
  );
}
