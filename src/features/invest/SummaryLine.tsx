import type { ReactNode } from 'react';

/**
 * One line of a dialog's summary: a muted label on the left, the figure on the right. The figure
 * changes as the person types, so it is a polite live region, read whole so the label comes with it.
 */
export function SummaryLine({
  label,
  className,
  children,
}: {
  label: string;
  /** The figure's colour, for a gain or a loss. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className="flex justify-between gap-3 text-[13.5px] font-extrabold tabular-nums"
    >
      <span className="text-muted font-bold">{label}</span>
      <span className={className}>{children}</span>
    </p>
  );
}
