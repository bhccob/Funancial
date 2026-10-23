import type { LucideIcon } from 'lucide-react';

/**
 * The round glass chip before a plain row's name, as Profile's menu and the wireframe's Settings draw
 * it: 38px, the row's icon at 17px inside, ink on the page's glass. It is for the eye only; the row
 * says what it is in words.
 */
export function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="glass grid size-[38px] shrink-0 place-items-center rounded-full"
    >
      <Icon className="size-[17px]" />
    </span>
  );
}
