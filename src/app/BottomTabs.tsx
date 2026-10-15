import { Ellipsis } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { TAB_ROUTES } from './routes';

const item =
  'flex min-h-13 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[10.5px] font-bold';

/** Floating tab bar for phones. */
export function BottomTabs({ onMore, className }: { onMore(): void; className?: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'bg-overlay fixed inset-x-2.5 bottom-[calc(10px+env(safe-area-inset-bottom))] z-10 flex rounded-lg px-1.5 py-1 shadow-(--shadow-float)',
        className,
      )}
    >
      {TAB_ROUTES.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) => cn(item, isActive ? 'text-accent-text' : 'text-muted')}
        >
          <Icon aria-hidden className="size-[22px]" />
          <span>{label}</span>
        </NavLink>
      ))}
      <button type="button" onClick={onMore} className={cn(item, 'text-muted')}>
        <Ellipsis aria-hidden className="size-[22px]" />
        <span>More</span>
      </button>
    </nav>
  );
}
