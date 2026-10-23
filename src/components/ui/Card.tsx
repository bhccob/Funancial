import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
}

/**
 * A tile of page glass for content inside a page (e.g. Welcome, Lock), with `GlassTile`'s corners.
 * Screens use Section.
 */
export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag className={cn('glass rounded-[24px] p-5', className)} {...rest} />;
}
