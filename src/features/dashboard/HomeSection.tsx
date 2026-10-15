import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

export interface HomeSectionProps {
  title: string;
  /** What sits on the right of the title: a `SectionLink`, tabs or a figure. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * One titled section of Home: a 21px title, space above, and a hairline on top. The page's column
 * wrappers take the line and the space off the first section of each column.
 */
export function HomeSection({ title, action, children }: HomeSectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="border-border mt-[26px] border-t pt-[30px] pb-1">
      <div className="mb-[18px] flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[21px] leading-tight font-extrabold tracking-[-0.02em]">
          {title}
        </h2>
        {action}
      </div>
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
