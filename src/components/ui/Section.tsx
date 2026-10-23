import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';

export interface SectionProps {
  title?: string;
  /** A `HelpTip` for the title: 4px after it (the row's 12px gap less 8px), and `action` stays on the right. */
  help?: ReactNode;
  /** What sits on the right of the title: a `SectionLink`, tabs, a button or a figure. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A page section, as `PlainSection` draws one: a 17px title row, then content, with 22px above. No
 * box, no hairline and no padding below: the space above the next section is the space between them.
 * A page's first section supplies its own top space under the header.
 */
export function Section({ title, help, action, children, className }: SectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cn('pt-[22px]', className)}>
      {(title || action) && (
        <div className="mx-1 mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 id={headingId} className="text-section">
              {title}
            </h2>
          )}
          {help && <div className="mr-auto -ml-2 flex">{help}</div>}
          {action && <div className="text-muted text-[13.5px] font-bold">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A muted link with a chevron, for the right of a section title. Its tap area is 44px tall and wide. */
export function SectionLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-muted hover:text-text -my-3 inline-flex min-h-11 min-w-11 items-center justify-end gap-0.5 text-[13.5px] font-bold"
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
