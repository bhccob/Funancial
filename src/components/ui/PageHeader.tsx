import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  /** A quiet 13px title, for screens whose first figures should lead (Home). */
  compact?: boolean;
}

export function PageHeader({ title, action, children, compact }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'border-border flex flex-wrap justify-between gap-3 border-b',
        compact ? 'items-center py-3.5' : 'items-end pb-4',
      )}
    >
      <div className="flex flex-col gap-1">
        <h1
          className={cn(
            compact
              ? 'text-muted text-[13px] font-semibold'
              : 'text-[28px] font-extrabold tracking-tight',
          )}
        >
          {title}
        </h1>
        {children && <div className="text-muted text-sm font-semibold">{children}</div>}
      </div>
      {action}
    </header>
  );
}
