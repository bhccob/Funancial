import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';
import { heroGlass } from './heroGlass';

export type PillTone = 'soft' | 'ink' | 'hero';

export interface PillProps {
  tone?: PillTone;
  to?: LinkProps['to'];
  onClick?: () => void;
  children: ReactNode;
  'aria-label'?: string;
  className?: string;
}

const tones: Record<PillTone, string> = {
  soft: 'bg-surface-2 text-text',
  ink: 'bg-primary text-primary-contrast',
  hero: `${heroGlass} text-hero-text`,
};

/**
 * A 36px rounded chip for a short fact or a shortcut: a link with `to`, a button with `onClick`,
 * else plain text. A link or button is pressable, has a 44px tap area and takes an `aria-label`.
 */
export function Pill({
  tone = 'soft',
  to,
  onClick,
  children,
  'aria-label': ariaLabel,
  className,
}: PillProps) {
  const base = cn(
    'text-small inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 whitespace-nowrap select-none',
    tones[tone],
    className,
  );
  const tappable = cn(base, 'press hit-44');
  if (to !== undefined) {
    return (
      <Link to={to} onClick={onClick} aria-label={ariaLabel} className={tappable}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={tappable}>
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}
