import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAmountsHidden } from '@/store/useAmountsHidden';

/**
 * The eye beside Home's balance: hides every amount in the app, and shows them again. One name,
 * "Hide amounts", with `aria-pressed` for whether they are hidden. A plain eye in the colour of the
 * words beside it, crossed out while amounts are hidden; the button round it is the 44px target, so
 * `className` gives it the margins that keep it from pushing what is around it.
 */
export function HideAmountsButton({ className }: { className?: string }) {
  const hidden = useAmountsHidden((s) => s.hidden);
  const toggle = useAmountsHidden((s) => s.toggle);
  const Icon = hidden ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label="Hide amounts"
      aria-pressed={hidden}
      onClick={toggle}
      className={cn('grid size-11 shrink-0 place-items-center rounded-full', className)}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}
