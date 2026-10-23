import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * The round glass chip before a plain row's name, as Profile's menu and the wireframe's Settings draw
 * it: 38px, the row's icon at 17px inside, ink on the page's glass. It is for the eye only; the row
 * says what it is in words. `className` is for the icon's colour (a badge's accent or muted tone).
 */
export function IconChip({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('glass grid size-[38px] shrink-0 place-items-center rounded-full', className)}
    >
      <Icon className="size-[17px]" />
    </span>
  );
}
