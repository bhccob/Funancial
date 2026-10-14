import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BannerTone = 'info' | 'warning' | 'danger' | 'demo';

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const tones: Record<BannerTone, string> = {
  info: 'border-border-strong bg-surface text-text',
  warning: 'border-warning bg-surface text-warning',
  danger: 'border-danger bg-surface text-danger',
  demo: 'border-dashed border-border-strong bg-surface-2 text-text',
};

export function Banner({ tone, children, action, className }: BannerProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-2 px-4 py-3 text-sm font-bold',
        tones[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
