import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAmountsHidden } from '@/store/useAmountsHidden';

/**
 * The eye on Home: hides every amount in the app, and shows them again. One name, "Hide amounts",
 * with `aria-pressed` for whether they are hidden. The button is the 44px target; the circle in it is the 36px of the wireframe, dark and filled while amounts are hidden.
 * Its margins take back the 4px each side of the circle, so the circle sits 8px from the quests
 * link and flush with the page's right edge, and the name beside them keeps room.
 */
export function HideAmountsButton() {
  const hidden = useAmountsHidden((s) => s.hidden);
  const toggle = useAmountsHidden((s) => s.toggle);
  const Icon = hidden ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label="Hide amounts"
      aria-pressed={hidden}
      onClick={toggle}
      className="group -mr-1 -ml-2 grid size-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={cn(
          'grid size-9 place-items-center rounded-full border motion-safe:transition-colors motion-safe:duration-100',
          hidden
            ? 'border-primary bg-primary text-primary-contrast'
            : 'border-border bg-surface text-text group-hover:bg-surface-2',
        )}
      >
        <Icon aria-hidden="true" className="size-[18px]" />
      </span>
    </button>
  );
}
