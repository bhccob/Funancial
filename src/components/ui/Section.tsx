import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SectionProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A page section: a heading row, content, and a hairline below. No box. */
export function Section({ title, action, children, className }: SectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('border-border border-b py-6 last:border-b-0', className)}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 id={headingId} className="text-[15px] font-extrabold tracking-tight">
              {title}
            </h2>
          )}
          {action && <div className="text-muted text-sm font-semibold">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
