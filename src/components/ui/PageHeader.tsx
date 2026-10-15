import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}

/** A page's 34px title, an optional line under it and an optional action. No rule below. */
export function PageHeader({ title, action, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-2">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.035em]">{title}</h1>
        {children && <div className="text-muted text-sm font-semibold">{children}</div>}
      </div>
      {action}
    </header>
  );
}
