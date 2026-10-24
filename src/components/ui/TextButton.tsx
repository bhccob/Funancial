import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type TextButtonTone = 'accent' | 'ink' | 'danger';

/** Each tone's colour, spelled out so Tailwind sees the classes. */
const TONES: Record<TextButtonTone, string> = {
  accent: 'text-accent-text',
  // The page's ink; on the top block it is the block's ink, which the accent could be as dark as.
  ink: 'text-text',
  danger: 'text-danger',
};

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `accent` on the page; `ink` where the accent would not hold (the top block); `danger` for a risk. */
  tone?: TextButtonTone;
}

/**
 * The quiet button: an underlined word with no pill, fill or edge of its own, 44px tall to tap and
 * the width of its words. It is what Quests' "Give up" is, for the way out of a screen that is not
 * the main action (Try with demo money, Forgot your PIN?, Skip the lock), where a glass pill would
 * be glass on glass or would shout as loud as the action it sits beside.
 */
export function TextButton({
  tone = 'accent',
  type = 'button',
  className,
  ...rest
}: TextButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center justify-center font-bold underline underline-offset-4',
        'disabled:pointer-events-none disabled:opacity-45',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
