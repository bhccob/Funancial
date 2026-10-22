import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

/** The small glass pill on the right of a section's title, 32px tall with a 44px tap area. */
const PILL =
  'glass press hit-44 inline-flex h-8 items-center gap-0.5 rounded-full pr-2.5 pl-3 text-[12.5px] font-extrabold';

/** A pill that opens something over the page ("Details"), for a section's `action`. */
export function SectionPillButton({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className={PILL}>
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" />
    </button>
  );
}

/** A pill that opens a page, for a section's `action` when "View all" is not what it says. */
export function SectionPillLink({
  to,
  children,
  'aria-label': ariaLabel,
}: {
  to: LinkProps['to'];
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Link to={to} aria-label={ariaLabel} className={PILL}>
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

/**
 * A section below the theme's block, as the glass wireframe draws them: a title, a "View all" pill
 * when it leads to a page (`to`) or another pill (`action`), then its content, which is plain rows or
 * glass tiles. No box round it, and no rule under it.
 */
export function PlainSection({
  title,
  to,
  action,
  children,
}: {
  title: string;
  to?: LinkProps['to'];
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="pt-[22px]">
      <div className="mx-1 mb-3 flex items-center justify-between">
        <h2 id={headingId} className="text-section">
          {title}
        </h2>
        {action ?? (to !== undefined && <SectionPillLink to={to}>View all</SectionPillLink>)}
      </div>
      {children}
    </section>
  );
}

/** What a plain list says when it has nothing in it. */
export function EmptyRows({ children }: { children: ReactNode }) {
  return <p className="text-muted mx-1 py-2 text-[14px] font-semibold">{children}</p>;
}
