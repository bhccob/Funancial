import { Check } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { BORDERS } from '@/domain/game/levels';
import { Avatar } from '@/features/game/Avatar';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/useAction';
import { useGameActions, useGameView } from '@/store/useGame';

/** What a border is called and the level it opens at; `level` is `null` for the ones that need none. */
type Option = { id: string; name: string; level: number | null };

/** The frame 0.11 sold, which is only shown to someone who bought it. */
const LEGACY: Option = { id: 'frame-game', name: 'Game color', level: null };

/**
 * Your border: the ring the avatar wears. None, then the six borders in the order they unlock, each
 * drawn on the person's own avatar. One that is open can be picked, which wears it and closes the
 * sheet; one the level has not reached is greyed and says which level opens it. The border worn is
 * checked, and a tap on it only closes the sheet. A frame bought in 0.11 is listed after them while
 * it is owned.
 */
export function BorderSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { owned, cosmetics } = useGameView();
  const { equip } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);

  const options: Option[] = [
    { id: 'frame-none', name: 'None', level: null },
    ...BORDERS,
    ...(owned.has(LEGACY.id) ? [LEGACY] : []),
  ];

  async function pick(id: string) {
    // It is worn already: there is nothing to save.
    if (id === cosmetics.frame) return onClose();
    setBusy(true);
    const worn = await run(() => equip(id));
    setBusy(false);
    if (worn) onClose();
  }

  return (
    <Sheet open={open} title="Your border" showTitle onClose={onClose}>
      {open && (
        <>
          <ul className="grid grid-cols-3 gap-2.5">
            {options.map(({ id, name, level }) => {
              const locked = !owned.has(id);
              const worn = cosmetics.frame === id;
              return (
                <li key={id} className="flex">
                  <button
                    type="button"
                    aria-pressed={worn}
                    disabled={locked || busy}
                    onClick={() => void pick(id)}
                    className={cn(
                      'press flex min-h-[44px] w-full flex-col items-center gap-1.5 rounded-[18px] border px-2 py-3.5 text-center disabled:pointer-events-none',
                      worn ? 'border-accent ring-accent ring-1' : 'border-border',
                    )}
                  >
                    {/* Greyed while it is shut: the ring is still there to see what it will be. */}
                    <span
                      data-preview
                      className={cn('relative grid place-items-center p-1', locked && 'opacity-45')}
                    >
                      <Avatar item={cosmetics.avatar} frame={id} size={44} />
                      {worn && (
                        <span className="bg-accent text-accent-contrast absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full">
                          <Check aria-hidden="true" className="size-3" />
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] font-extrabold">{name}</span>
                    {locked && level !== null && (
                      <span className="text-muted -mt-1 text-[11.5px] font-bold">{`Level ${level}`}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted mx-1 mt-3 text-[12px] leading-[1.45] font-semibold">
            New borders open as you level up.
          </p>
        </>
      )}
    </Sheet>
  );
}
