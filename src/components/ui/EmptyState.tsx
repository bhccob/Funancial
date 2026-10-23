import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** What a list or section says when it has nothing in it, in line with the plain rows (`EmptyRows`). */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="mx-1 flex flex-col items-start gap-2 py-2">
      <p className="font-bold">{title}</p>
      {children && <p className="text-muted text-sm">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
