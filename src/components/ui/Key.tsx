import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';
import { heroGlass } from './heroGlass';

export interface KeyProps {
  label: string;
  value: ReactNode;
  to?: LinkProps['to'];
  onClick?: () => void;
  tone?: 'light' | 'hero';
  /** A small arrow on the right, for a key that opens something. */
  chevron?: boolean;
  className?: string;
}

const tones = {
  light: { box: 'bg-surface text-text shadow-tile', label: 'text-muted' },
  hero: { box: `${heroGlass} text-hero-text`, label: 'text-hero-muted' },
};

/**
 * A key figure: a small label over a bold amount, in a 64px-tall box with 18px corners. A link with
 * `to`, a button with `onClick`, else a plain display. `tone="hero"` is the glass for the dark header.
 */
export function Key({
  label,
  value,
  to,
  onClick,
  tone = 'light',
  chevron = false,
  className,
}: KeyProps) {
  const interactive = to !== undefined || onClick !== undefined;
  const classes = cn(
    'rounded-key flex min-h-16 items-center gap-2 px-3.5 py-3 text-left',
    tones[tone].box,
    interactive && 'press',
    className,
  );
  const content = (
    <>
      <span className="min-w-0">
        <span className={cn('text-small block', tones[tone].label)}>{label}</span>
        <span className="block text-[17px] leading-tight font-extrabold tracking-[-0.02em] whitespace-nowrap tabular-nums">
          {value}
        </span>
      </span>
      {chevron && (
        <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 opacity-60" />
      )}
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
