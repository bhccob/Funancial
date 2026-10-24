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

/**
 * The row that closes a `ROWS` list (a parent with `divide-y`) has no hairline of its own: the list
 * draws the lines between its rows and none after the last, so this row's own bottom border would be
 * a line no other list has. A form's rows stand in a plain `div`, not under `divide-y`, so the last
 * field there keeps its line, which is the one that closes the form.
 */
const CLOSING_ROW = '[.divide-y>&:last-child]:border-b-0';

/**
 * The hairline of a row: `ROW_LINE`, left to the list when the row closes a `ROWS` list. A row with an
 * error has the hairline in danger, in both modes, and keeps it wherever it stands.
 */
export const rowLine = (error: boolean) =>
  error ? 'border-b border-danger dark:border-danger' : `${ROW_LINE} ${CLOSING_ROW}`;

/** The label and the control side by side. */
export const ROW_LAYOUT = 'flex min-h-[46px] items-center gap-3';

/**
 * The label of a row: the ink, 15px bold, never squeezed by a long value. It is as tall as the row,
 * so a tap anywhere on its words' side of the row reaches the control, not only on the words.
 */
export const rowLabel = 'text-text flex shrink-0 items-center self-stretch text-[15px] font-bold';

/**
 * What a row's value looks like, whether it is an input, a select or an amount: muted 15px,
 * right-aligned on 44px, turning ink while it has focus. It keeps the page-wide focus ring (there is no
 * `focus:outline-none` here), which is what shows focus on a row. It has no minimum width: the value that
 * fills the row adds `min-w-0` (`rowControl`), and the amount that is as wide as its figures a minimum
 * of its own, so a field never has two.
 */
export const rowValue =
  'text-muted placeholder:text-muted focus:text-text h-11 bg-transparent text-right text-[15px] font-semibold';

/**
 * The value of a row that fills the rest of it, an input or a select. The last two classes right-align the
 * fields of a date or time input, which `text-right` does not move (Chrome and the Android WebView).
 */
export const rowControl = `${rowValue} min-w-0 flex-1 [&::-webkit-datetime-edit]:flex [&::-webkit-datetime-edit]:justify-end`;

/** A hint or an error under a row has 8px under it, before the hairline. */
export const ROW_MESSAGE = 'pb-2';
