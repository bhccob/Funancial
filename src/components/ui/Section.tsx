import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';

export interface SectionProps {
  title?: string;
  /** A `HelpTip` for the title: it sits just after it, and `action` stays on the right. */
  help?: ReactNode;
  /** What sits on the right of the title: a `SectionLink`, tabs, a button or a figure. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A page section: a 21px title row, content, and a hairline below (none under the last section).
 * No box: the padding above and below is the space between sections. A page's first section
 * supplies its own top space under the header.
 */
export function Section({ title, help, action, children, className }: SectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('border-border border-b py-7 last-of-type:border-b-0', className)}
    >
      {(title || action) && (
        <div className="mb-[18px] flex items-center justify-between gap-3">
          {title && (
            <h2
              id={headingId}
              className="text-[21px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              {title}
            </h2>
          )}
          {help && <div className="mr-auto flex">{help}</div>}
          {action && <div className="text-muted text-[13.5px] font-bold">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A muted link with a chevron, for the right of a section title. Its tap area is 44px tall. */
export function SectionLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-muted hover:text-text -my-3 inline-flex min-h-11 items-center gap-0.5 text-[13.5px] font-bold"
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

/** A bold text link under an empty state ("Set a limit"), with a 44px tap area. */
export function EmptyLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link to={to} className="-my-1 inline-flex min-h-11 items-center text-[15px] font-extrabold">
      {children}
    </Link>
  );
}
