import { Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { MENU_GROUPS, PRIMARY_LINKS, type NavTarget } from './menu';

function SidebarLink({ path, label, icon: Icon, soon }: NavTarget & { soon?: boolean }) {
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
      {soon && <span className="ml-auto text-xs font-bold">Soon</span>}
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
      <nav aria-label="All sections" className="flex flex-col gap-6">
        <ButtonLink to="/add" size="md">
          <Plus aria-hidden className="size-[18px]" />
          Add expense
        </ButtonLink>
        <div className="flex flex-col gap-0.5">
          {PRIMARY_LINKS.map((link) => (
            <SidebarLink key={link.path} {...link} />
          ))}
        </div>
        {MENU_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-0.5">
            <h2 className="text-muted px-2.5 pb-1 text-xs font-bold tracking-wider uppercase">
              {group.title}
            </h2>
            {group.items.map(({ path, label, icon, soon }) => (
              <SidebarLink key={path} path={path} label={label} icon={icon} soon={soon} />
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}
