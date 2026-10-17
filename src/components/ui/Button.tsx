import type { ButtonHTMLAttributes, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  'primary' | 'secondary' | 'banner' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
}

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap select-none ' +
  'motion-safe:transition-[transform,background-color,opacity] motion-safe:duration-100 motion-safe:active:scale-[0.98] ' +
  'disabled:pointer-events-none disabled:opacity-45';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-contrast hover:opacity-90',
  secondary: 'border border-border-strong bg-transparent text-text hover:bg-surface-2',
  // A secondary button for a gradient card: the page colour, part see-through, so its edge shows.
  banner: 'border border-border-strong bg-bg/60 text-text hover:bg-bg',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-danger text-danger-contrast hover:opacity-90',
  'danger-ghost': 'bg-transparent text-danger hover:bg-surface-2',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 px-4 text-sm',
  md: 'h-12 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest} />
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A router link that looks like a Button: for actions that go to another screen. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}
