import { Plus } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { MENU_GROUPS, TABS, type MenuItem, type MenuSheet, type NavTarget } from './menu';
import { MenuSheets } from './MenuGroups';

const ROW =
  'flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[14.5px] font-semibold';

function SidebarLink({ path, label, icon: Icon }: NavTarget) {
  return (
    <NavLink
      to={path}
      end={path === '/'}
      className={({ isActive }) =>
        cn(ROW, isActive ? 'bg-surface-2 text-text' : 'text-muted hover:text-text')
      }
    >
      <Icon aria-hidden className="size-[18px]" />
      {label}
    </NavLink>
  );
}

/** A menu row: a link to its page, a button for its sheet, or, not built yet, disabled and "Soon". */
function SidebarRow({ item, onOpen }: { item: MenuItem; onOpen(sheet: MenuSheet): void }) {
  const { path, sheet, label, icon: Icon } = item;
  if (path !== undefined) return <SidebarLink path={path} label={label} icon={Icon} />;
  return (
    <button
      type="button"
      disabled={sheet === undefined}
      onClick={sheet === undefined ? undefined : () => onOpen(sheet)}
      className={cn(ROW, 'text-muted', sheet !== undefined && 'hover:text-text')}
    >
      <Icon aria-hidden className="size-[18px]" />
      {label}
      {item.soon && <span className="ml-auto text-xs font-bold">Soon</span>}
    </button>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  return (
    <aside
      className={cn(
        'border-border sticky top-0 h-dvh flex-col gap-6 overflow-y-auto border-r px-5 py-6',
        className,
      )}
    >
      <p className="px-2.5 text-[19px] font-extrabold tracking-tight">
        Fun<span className="text-accent-text">cial</span>
      </p>
      <nav aria-label="All sections" className="flex flex-col gap-6">
        <ButtonLink to="/add" size="md">
          <Plus aria-hidden className="size-[18px]" />
          Add expense
        </ButtonLink>
        <div className="flex flex-col gap-0.5">
          {TABS.map((link) => (
            <SidebarLink key={link.path} {...link} />
          ))}
        </div>
        {MENU_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-0.5">
            <h2 className="text-muted px-2.5 pb-1 text-xs font-bold tracking-wider uppercase">
              {group.title}
            </h2>
            {group.items.map((item) => (
              <SidebarRow key={item.label} item={item} onOpen={setSheet} />
            ))}
          </section>
        ))}
      </nav>
      <MenuSheets open={sheet} onClose={() => setSheet(null)} />
    </aside>
  );
}
