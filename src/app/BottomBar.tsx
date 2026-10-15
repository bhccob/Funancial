import { Menu, Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { BUDGET, HOME, QUESTS, type NavTarget } from './menu';

// Labels sit on one line along the bottom; the round Add button (48px) rises above it, so the bar is 76px.
const slot =
  'flex h-19 flex-col items-center justify-end gap-1 pb-[5px] text-[11.5px] leading-[14px] font-bold';
const tone = (isActive: boolean) => (isActive ? 'text-text' : 'text-muted');

function BarLink({ path, label, icon: Icon }: NavTarget) {
  return (
    <NavLink to={path} end={path === '/'} className={({ isActive }) => cn(slot, tone(isActive))}>
      <Icon aria-hidden className="size-[23px]" />
      {label}
    </NavLink>
  );
}

/** Flat bar along the phone's bottom edge: Home, Budget, a round Add, Quests, and the Menu sheet. */
export function BottomBar({
  menuOpen,
  onMenu,
  className,
}: {
  menuOpen: boolean;
  onMenu(): void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'bg-bg border-border fixed inset-x-0 bottom-0 z-10 grid h-[calc(76px+env(safe-area-inset-bottom))] grid-cols-5 border-t pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <BarLink {...HOME} />
      <BarLink {...BUDGET} />
      <NavLink
        to="/add"
        aria-label="Add expense"
        className={({ isActive }) => cn(slot, 'group', tone(isActive))}
      >
        <span
          aria-hidden
          className="bg-primary text-primary-contrast grid size-12 place-items-center rounded-full motion-safe:transition-transform motion-safe:group-active:scale-95"
        >
          <Plus className="size-[23px]" />
        </span>
        Add
      </NavLink>
      <BarLink {...QUESTS} />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onMenu}
        className={cn(slot, 'text-muted')}
      >
        <Menu aria-hidden className="size-[23px]" />
        Menu
      </button>
    </nav>
  );
}
