import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface MenuItem {
  label: string;
  onSelect(): void;
  danger?: boolean;
}

/**
 * A "more actions" button with a small menu: arrow keys move, Escape closes, a click outside closes.
 * `triggerClassName` draws the button for where it sits (a glass circle on the top block) in place of
 * the plain muted one. The menu is the page's surface wherever it opens, in the page's ink.
 */
export function Menu({
  label,
  items,
  triggerClassName,
}: {
  label: string;
  items: MenuItem[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const entries = () => [
    ...(wrapper.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
  ];

  useEffect(() => {
    if (!open) return;
    entries()[0]?.focus();
    const outside = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const all = entries();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      // Keep the Escape from also closing a surrounding dialog.
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? all[0] : all.at(-1))?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'grid place-items-center rounded-full',
          triggerClassName ?? 'text-muted hover:text-text hover:bg-surface-2 size-11',
        )}
      >
        <MoreHorizontal aria-hidden className={triggerClassName ? 'size-[15px]' : 'size-5'} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="bg-overlay page-ink text-text absolute top-full right-0 z-30 mt-1 flex min-w-48 flex-col rounded-md p-1 text-left shadow-(--shadow-overlay)"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                // The page-wide focus ring is drawn inside the item, which has no room outside it.
                'hover:bg-surface-2 focus:bg-surface-2 rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold focus-visible:-outline-offset-2',
                item.danger && 'text-danger',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
