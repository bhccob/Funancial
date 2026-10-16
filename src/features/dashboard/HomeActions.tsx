import { HandCoins, Plus, ShoppingBag, Target, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

const ACTIONS: Array<{ to: string; label: string; Icon: LucideIcon; primary?: boolean }> = [
  { to: '/add', label: 'Expense', Icon: Plus, primary: true },
  { to: '/add?type=income', label: 'Income', Icon: HandCoins },
  { to: '/goals', label: 'Goals', Icon: Target },
  { to: '/buy', label: 'Buy it?', Icon: ShoppingBag },
];

/** Four round actions, each with its word under it. The first, adding an expense, is filled. */
export function HomeActions() {
  return (
    <div className="-mx-1.5 mt-[30px] mb-1.5 grid grid-cols-4">
      {ACTIONS.map(({ to, label, Icon, primary }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-col items-center gap-2 py-1 text-[13px] font-bold"
        >
          <span
            className={cn(
              'grid size-14 place-items-center rounded-full',
              primary ? 'bg-primary text-primary-contrast' : 'bg-surface-2',
            )}
          >
            <Icon aria-hidden="true" className="size-6" />
          </span>
          {label}
        </Link>
      ))}
    </div>
  );
}
