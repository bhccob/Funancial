import { cn } from '@/lib/cn';

/**
 * The lighter field of the Invest forms: a small muted label over the value, a hairline under it,
 * no box. The line turns ink and 2px thick while the field has focus (the second pixel is a shadow,
 * so nothing moves), which is what shows focus here instead of the outline around a box.
 */
export const lineLabel = 'text-muted text-[13px] font-bold';

/** The value of a line field: 16px extra-bold on a 44px row, its line danger while it has an error. */
export const lineInput = (error: boolean) =>
  cn(
    'text-text placeholder:text-muted h-11 w-full min-w-0 border-b bg-transparent px-0 text-base font-extrabold tabular-nums placeholder:font-semibold focus:outline-none',
    error
      ? 'border-danger focus:shadow-[0_1px_0_0_var(--color-danger)]'
      : 'border-border focus:border-text focus:shadow-[0_1px_0_0_var(--color-text)]',
  );

export type FieldVariant = 'box' | 'line';
