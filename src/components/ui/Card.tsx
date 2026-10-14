import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
}

/** "Inventory slot" card: strong border, inner hairline frame, pressable edge. */
export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'border-border-strong bg-surface rounded-lg border-2 p-4',
        'shadow-[0_3px_0_var(--color-border-strong),inset_0_0_0_3px_var(--color-surface),inset_0_0_0_4px_var(--color-border)]',
        className,
      )}
      {...rest}
    />
  );
}
