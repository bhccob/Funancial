import { Ellipsis } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { TAB_ROUTES } from './routes';

const item =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold';

export function BottomTabs({ onMore, className }: { onMore(): void; className?: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'border-border-strong bg-surface fixed inset-x-0 bottom-0 z-10 flex border-t-[3px] px-1 pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      {TAB_ROUTES.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) => cn(item, isActive ? 'text-primary' : 'text-muted')}
        >
          {({ isActive }) => (
            <>
              <Icon aria-hidden className="size-6" strokeLinecap="square" strokeLinejoin="miter" />
              <span className={cn(isActive && 'border-primary border-b-2')}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button type="button" onClick={onMore} className={cn(item, 'text-muted')}>
        <Ellipsis aria-hidden className="size-6" />
        <span>More</span>
      </button>
    </nav>
  );
}
