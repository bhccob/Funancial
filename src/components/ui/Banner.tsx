import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BannerTone = 'demo' | 'info' | 'warning' | 'danger';

export interface BannerProps {
  tone: BannerTone;
  /** The bold first line. Without it, `children` is the bold sentence. */
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Each tone's gradient ends and muted line, spelled out so Tailwind sees the classes. */
const tones: Record<BannerTone, { card: string; muted: string }> = {
  demo: { card: 'from-demo-from to-demo-to', muted: 'text-demo-muted' },
  info: { card: 'from-info-from to-info-to', muted: 'text-info-muted' },
  warning: { card: 'from-warning-from to-warning-to', muted: 'text-warning-muted' },
  danger: { card: 'from-danger-from to-danger-to', muted: 'text-danger-muted' },
};

/**
 * A soft gradient card: text on the left, the action on the right (under the text when it doesn't
 * fit). The text stays in the page's ink colour, since the danger red is under 4.5:1 on its own
 * gradient; the tone shows in the gradient and, for danger, in `role="alert"`.
 */
export function Banner({ tone, title, children, action, className }: BannerProps) {
  const { card, muted } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg bg-linear-120/srgb px-3.5 py-3',
        card,
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-40">
        {title === undefined ? (
          <div className="text-[13px] font-bold">{children}</div>
        ) : (
          <>
            <div className="text-[13px] font-extrabold">{title}</div>
            <div className={cn('mt-0.5 text-[11px] font-bold', muted)}>{children}</div>
          </>
        )}
      </div>
      {action}
    </div>
  );
}
