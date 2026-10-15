import { Menu, Plus } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { BUDGET, HOME, QUESTS, type NavTarget } from './menu';

const slot = 'flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-bold';

function BarLink({ path, label, icon: Icon }: NavTarget) {
  return (
    <NavLink
      to={path}
      end={path === '/'}
      className={({ isActive }) => cn(slot, isActive ? 'text-text' : 'text-muted')}
    >
      <Icon aria-hidden className="size-[23px]" />
      {label}
    </NavLink>
  );
}

/** Flat bar along the phone's bottom edge: Home, Budget, a round Add, Quests, and the Menu sheet. */
export function BottomBar({ onMenu, className }: { onMenu(): void; className?: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'bg-bg border-border fixed inset-x-0 bottom-0 z-10 grid h-[calc(64px+env(safe-area-inset-bottom))] grid-cols-5 border-t pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <BarLink {...HOME} />
      <BarLink {...BUDGET} />
      <Link
        to="/add"
        aria-label="Add expense"
        className="bg-primary text-primary-contrast grid size-12 place-items-center place-self-center rounded-full motion-safe:transition-transform motion-safe:active:scale-95"
      >
        <Plus aria-hidden className="size-[23px]" />
      </Link>
      <BarLink {...QUESTS} />
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onMenu}
        className={cn(slot, 'text-muted')}
      >
        <Menu aria-hidden className="size-[23px]" />
        Menu
      </button>
    </nav>
  );
}
