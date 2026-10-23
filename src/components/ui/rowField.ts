import type { FieldVariant } from './lineField';

/**
 * The `row` look of the fields, beside `line` (the Invest forms' and the lock screens') and the box:
 * the plain row of the glass look. The label stands on the left and the value or control on the
 * right, in one row at least 46px tall, with a hairline under it and nothing round it. The control
 * stays the native input or select, with its label tied by `htmlFor`; a hint or an error is said
 * under the row, inside its hairline.
 */
export type RowVariant = FieldVariant | 'row';

/**
 * The hairline under a row, in the colours of `ROWS` (src/features/shared/PlainSection.tsx), which
 * draws the same line as a divide between a list's rows: a row is a field's whole box here, so the
 * line is its own bottom border.
 */
export const ROW_LINE = 'border-b border-black/7 dark:border-white/8';

/** A row with an error has the hairline in danger, in both modes. */
export const rowLine = (error: boolean) =>
  error ? 'border-b border-danger dark:border-danger' : ROW_LINE;

/** The label and the control side by side. */
export const ROW_LAYOUT = 'flex min-h-[46px] items-center gap-3';

/**
 * The label of a row: the ink, 15px bold, never squeezed by a long value. It is as tall as the row,
 * so a tap anywhere on its words' side of the row reaches the control, not only on the words.
 */
export const rowLabel = 'text-text flex shrink-0 items-center self-stretch text-[15px] font-bold';

/**
 * The value of a row, whether an input or a select: muted 15px, right-aligned, filling the rest of
 * the row on 44px. It turns ink while it has focus. It keeps the page-wide focus ring (there is no
 * `focus:outline-none` here), which is what shows focus on a row. The last two classes right-align the
 * fields of a date or time input, which `text-right` does not move (Chrome and the Android WebView).
 */
export const rowControl =
  'text-muted placeholder:text-muted focus:text-text h-11 min-w-0 flex-1 bg-transparent text-right text-[15px] font-semibold [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit]:justify-end';

/** A hint or an error under a row has 8px under it, before the hairline. */
export const ROW_MESSAGE = 'pb-2';
