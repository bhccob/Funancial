import type { ReactNode } from 'react';

/** A quiet sub-heading over a list, named for screen readers as the list's group. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title}>
      <h3 className="text-muted mx-1 mb-1 text-[13px] font-bold">{title}</h3>
      {children}
    </div>
  );
}
