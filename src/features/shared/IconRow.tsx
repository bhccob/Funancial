import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconChip } from '@/components/ui/IconChip';
import { cn } from '@/lib/cn';

/** A row's name: 15px extra-bold, as the wireframe's Settings sets it. */
export const ROW_TITLE = 'text-[15px] font-extrabold';

/** The line under a row's name: 13px, muted. */
export const ROW_SUB = 'text-muted text-[13px] font-semibold';

/**
 * Added to a row that has no chip of its own, so its words line up under the title of the chip row
 * above it: a 38px chip and a 12px gap.
 */
export const UNDER_TITLE = 'pl-[50px]';

/**
 * A plain row of a list (under `ROWS`): a round glass chip with the row's icon, then whatever the
 * row says, then `end` (a button, a figure). The row is at least 54px tall with its parts centred, or
 * with `top` they hang from the top, for a row that holds a group of choices under a label.
 */
export function IconRow({
  icon,
  end,
  top = false,
  children,
}: {
  icon: LucideIcon;
  end?: ReactNode;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-h-[54px] gap-3', top ? 'items-start py-3' : 'items-center py-2')}>
      <IconChip icon={icon} />
      <div className="min-w-0 flex-1">{children}</div>
      {end}
    </div>
  );
}
