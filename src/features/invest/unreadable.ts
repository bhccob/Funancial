import { isAmbiguousDecimal } from '@/domain/money';

/** What to say about a number that could not be read: "1,000" is a thousand or one, so say how to settle it. */
export function unreadable(text: string, fallback: string): string {
  const t = text.trim();
  return isAmbiguousDecimal(t)
    ? `Is ${t} a thousand or a fraction? Write ${t.replace(/[.,]/, '')}, or ${t.replace(',', '.')}0 for the fraction`
    : fallback;
}
