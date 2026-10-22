import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { TABS, type NavTarget } from './menu';

/** A tab: its icon over its name, in the accent at full weight when it is the current one. */
function Tab({ path, label, icon: Icon }: NavTarget) {
  return (
    <NavLink
      to={path}
      end={path === '/'}
      className={({ isActive }) =>
        cn(
          'press flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] text-[11px]',
          isActive ? 'text-accent font-extrabold' : 'text-muted font-bold',
        )
      }
    >
      <Icon aria-hidden className="size-[21px] shrink-0" />
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
  );
}

/**
 * The phone's tab bar: Home, Cards, Spending, Invest and Profile, along the bottom edge from side to
 * side in the bar's glass, with a hairline over it. Its height (`--tab-bar`, index.css) takes in the
 * safe area under the tabs.
 */
export function TabBar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'glass-bar fixed inset-x-0 bottom-0 z-30 flex h-(--tab-bar) items-start px-1 pt-1.5 md:hidden',
        className,
      )}
    >
      {TABS.map((tab) => (
        <Tab key={tab.path} {...tab} />
      ))}
    </nav>
  );
}
