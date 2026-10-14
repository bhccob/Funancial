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
          'flex min-h-11 items-center gap-3 rounded-md border-2 px-3 font-bold',
          isActive
            ? 'border-border-strong bg-surface text-primary shadow-[0_2px_0_var(--color-border-strong)]'
            : 'text-muted hover:text-text border-transparent',
        )
      }
    >
      <Icon aria-hidden className="size-5" strokeLinecap="square" strokeLinejoin="miter" />
      {label}
    </NavLink>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'border-border-strong bg-surface-2 sticky top-0 h-dvh flex-col gap-6 overflow-y-auto border-r-[3px] p-4',
        className,
      )}
    >
      <p className="font-display text-primary px-3 pt-2 text-2xl font-bold">Funancial</p>
      <nav aria-label="All sections" className="flex flex-col gap-1">
        {TAB_ROUTES.map((r) => (
          <SidebarLink key={r.path} {...r} />
        ))}
        <hr className="border-border-strong my-3 border-t-2 border-dashed" />
        {MORE_ROUTES.map((r) => (
          <SidebarLink key={r.path} {...r} />
        ))}
      </nav>
    </aside>
  );
}
