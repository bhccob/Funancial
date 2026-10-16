import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BannerTone = 'info' | 'warning' | 'danger';

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const bars: Record<BannerTone, string> = {
  info: 'border-l-text-muted',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
};

export function Banner({ tone, children, action, className }: BannerProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'bg-surface-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-l-[3px] px-4 py-3 text-sm font-semibold',
        bars[tone],
        tone === 'danger' && 'text-danger',
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
