import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { MORE_ROUTES, TAB_ROUTES, type AppRoute } from './routes';

function SidebarLink({ path, label, icon: Icon }: AppRoute) {
  return (
    <NavLink
      to={path}
      end={path === '/'}
      className={({ isActive }) =>
        cn(
          'flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-[14.5px] font-semibold',
          isActive ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
        )
      }
    >
      <Icon aria-hidden className="size-[18px]" />
      {label}
    </NavLink>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'border-border sticky top-0 h-dvh flex-col gap-6 overflow-y-auto border-r px-5 py-6',
        className,
      )}
    >
      <p className="px-2.5 text-[19px] font-extrabold tracking-tight">
        Fun<span className="text-accent-text">ancial</span>
      </p>
      <nav aria-label="All sections" className="flex flex-col gap-0.5">
        {TAB_ROUTES.map((r) => (
          <SidebarLink key={r.path} {...r} />
        ))}
        <hr className="border-border my-3" />
        {MORE_ROUTES.map((r) => (
          <SidebarLink key={r.path} {...r} />
        ))}
      </nav>
    </aside>
  );
}
