import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TileProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'li' | 'ul';
  /** The 16px inside space; off for a tile whose content runs to its edge. */
  padded?: boolean;
}

/** A solid box with 24px corners and a hairline shadow: the body's one surface, never glass. */
export function Tile({ as: Tag = 'div', padded = true, className, ...html }: TileProps) {
  return (
    <Tag
      className={cn('bg-surface rounded-tile shadow-tile', padded && 'p-4', className)}
      {...html}
    />
  );
}
