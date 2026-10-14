import { Plus } from 'lucide-react';
import { Link } from 'react-router';

/** Logging is the core loop, so a quick-add button sits on every screen. */
export function QuickAddButton() {
  return (
    <Link
      to="/add"
      aria-label="Quick add"
      className="bg-primary text-primary-contrast fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 grid size-14 place-items-center rounded-full shadow-(--shadow-float) transition-transform active:scale-95 motion-reduce:transition-none md:right-8 md:bottom-8"
    >
      <Plus aria-hidden className="size-6" strokeWidth={2.5} />
    </Link>
  );
}
