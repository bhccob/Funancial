import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { MOTION } from '@/lib/motion';

export interface RiseProps {
  /** Its place in a list of blocks: each one comes in 60 ms after the one before. */
  index?: number;
  as?: 'div' | 'section' | 'article' | 'li' | 'ul';
  className?: string;
  children: ReactNode;
}

/**
 * A block that rises 12px into place while it fades in, when it first shows. The motion is CSS and
 * only under `motion-safe:`; for reduced motion it fades in without moving.
 */
export function Rise({ index = 0, as: Tag = 'div', className, children }: RiseProps) {
  return (
    <Tag
      className={cn('motion-safe:animate-rise motion-reduce:animate-fade-in', className)}
      style={{ animationDelay: `${Math.round(index * MOTION.stagger * 1000)}ms` }}
    >
      {children}
    </Tag>
  );
}
