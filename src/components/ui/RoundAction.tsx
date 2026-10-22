import type { LucideIcon } from 'lucide-react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';
import { heroGlass } from './heroGlass';

export interface RoundActionProps {
  icon: LucideIcon;
  label: string;
  to?: LinkProps['to'];
  onClick?: () => void;
  tone?: 'light' | 'hero' | 'ink';
  /** The chip's width and height, in px. */
  size?: number;
  /** The label under the chip. Without it the label is the `aria-label`. */
  showLabel?: boolean;
  /** For a toggle (Freeze): reported as `aria-pressed` on the button. */
  pressed?: boolean;
  className?: string;
}

const chips: Record<NonNullable<RoundActionProps['tone']>, string> = {
  light: 'bg-surface text-text shadow-tile',
  hero: `${heroGlass} text-hero-text`,
  ink: 'bg-primary text-primary-contrast',
};

/**
 * A round icon chip with its label under it: a link with `to`, else a button. It is at least 44px
 * wide and tall however small the chip is. `tone="hero"` is the glass for the dark header.
 */
export function RoundAction({
  icon: Icon,
  label,
  to,
  onClick,
  tone = 'light',
  size = 54,
  showLabel = true,
  pressed,
  className,
}: RoundActionProps) {
  const classes = cn(
    'press inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-1.5 select-none',
    className,
  );
  const content = (
    <>
      <span
        style={{ width: size, height: size }}
        className={cn('grid shrink-0 place-items-center rounded-full', chips[tone])}
      >
        <Icon aria-hidden="true" className="size-5.5" />
      </span>
      {showLabel && (
        <span className={cn('text-small', tone === 'hero' ? 'text-hero-text' : 'text-text')}>
          {label}
        </span>
      )}
    </>
  );
  const ariaLabel = showLabel ? undefined : label;
  if (to !== undefined) {
    return (
      <Link to={to} onClick={onClick} aria-label={ariaLabel} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={classes}
    >
      {content}
    </button>
  );
}
