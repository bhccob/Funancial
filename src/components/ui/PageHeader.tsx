import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, action, children }: PageHeaderProps) {
  return (
    <header className="border-border flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-extrabold tracking-tight">{title}</h1>
        {children && <div className="text-muted text-sm font-semibold">{children}</div>}
      </div>
      {action}
    </header>
  );
}
