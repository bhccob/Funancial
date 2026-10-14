import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
}

/** A soft grouped panel for content inside a page (e.g. Welcome, Lock). Screens use Section. */
export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag className={cn('bg-surface-2 rounded-lg p-5', className)} {...rest} />;
}
