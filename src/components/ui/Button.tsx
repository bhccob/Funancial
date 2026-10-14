import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md border-2 font-bold select-none ' +
  'transition-[transform,box-shadow] duration-100 active:translate-y-0.5 ' +
  'motion-reduce:transition-none motion-reduce:active:translate-y-0 ' +
  'disabled:pointer-events-none disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-contrast border-primary-shade ' +
    'shadow-[0_3px_0_var(--color-primary-shade)] active:shadow-[0_1px_0_var(--color-primary-shade)]',
  secondary:
    'bg-surface text-text border-border-strong ' +
    'shadow-[0_3px_0_var(--color-border-strong)] active:shadow-[0_1px_0_var(--color-border-strong)]',
  ghost: 'border-transparent bg-transparent text-primary active:translate-y-0',
  danger:
    'bg-danger text-primary-contrast border-danger ' +
    'shadow-[0_3px_0_var(--color-text)] active:shadow-[0_1px_0_var(--color-text)]',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-13 px-5 text-base',
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
