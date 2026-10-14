import { Plus } from 'lucide-react';
import { Link } from 'react-router';

/** Gold "reward" button: logging is the core loop, so it sits on every screen. */
export function QuickAddButton() {
  return (
    <Link
      to="/add"
      aria-label="Quick add"
      className="border-xp-shade bg-xp fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-lg border-[3px] text-[#2b2118] shadow-[0_4px_0_var(--color-xp-shade)] transition-transform active:translate-y-0.5 motion-reduce:transition-none md:right-8 md:bottom-8"
    >
      <Plus aria-hidden className="size-7" strokeWidth={3} strokeLinecap="square" />
    </Link>
  );
}
