import { NavLink } from 'react-router';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import { MORE_ROUTES } from './routes';

export function MoreSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} title="More" onClose={onClose}>
      {open && (
        <ul className="grid grid-cols-2 gap-2">
          {MORE_ROUTES.map(({ path, label, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center gap-2 rounded-md border-2 px-3 font-bold',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-border-strong text-text shadow-[0_2px_0_var(--color-border-strong)]',
                  )
                }
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeLinecap="square" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
