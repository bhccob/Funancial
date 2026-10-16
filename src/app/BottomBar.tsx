import { Menu } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { BUDGET, HOME, INVEST, type NavTarget } from './menu';

const slot =
  'flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] leading-[14px] font-bold';
const tone = (isActive: boolean) => (isActive ? 'text-text' : 'text-muted');

function BarLink({ path, label, icon: Icon }: NavTarget) {
  return (
    <NavLink to={path} end={path === '/'} className={({ isActive }) => cn(slot, tone(isActive))}>
      <Icon aria-hidden className="size-[23px]" />
      {label}
    </NavLink>
  );
}

/** Flat bar along the phone's bottom edge: Home, Budget, Invest and the Menu sheet. Adding lives on Home and in the sidebar. */
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
        'bg-bg border-border fixed inset-x-0 bottom-0 z-10 grid h-[calc(64px+env(safe-area-inset-bottom))] grid-cols-4 border-t pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <BarLink {...HOME} />
      <BarLink {...BUDGET} />
      <BarLink {...INVEST} />
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
