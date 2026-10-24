/** What the Last 4 field says when it is not four digits. */
export const LAST4_MESSAGE = 'Use the last 4 digits.';

/** Said under the Last 4 field while it is fine. */
export const LAST4_HINT = 'Optional. Only to tell your cards apart.';

/**
 * The Last 4 rule of every form that makes a card: nothing, or exactly four digits (the field is
 * only there to tell cards apart, so no more of the number is ever kept). `undefined` when it holds.
 */
export function last4Problem(raw: string): string | undefined {
  const digits = raw.trim();
  return digits === '' || /^\d{4}$/.test(digits) ? undefined : LAST4_MESSAGE;
}
