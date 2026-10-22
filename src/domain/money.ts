/** Money is integer minor units. These helpers convert to and from what people type and read. */

const MAX_MINOR = 1_000_000_000_00;
const digitsCache = new Map<string, number>();

export function minorDigits(currency: string): number {
  let d = digitsCache.get(currency);
  if (d === undefined) {
    d =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    digitsCache.set(currency, d);
  }
  return d;
}

const isDigits = (s: string) => /^\d*$/.test(s);
const validGroups = (groups: string[]) =>
  groups.length > 0 &&
  /^\d{1,3}$/.test(groups[0]!) &&
  groups.slice(1).every((g) => /^\d{3}$/.test(g));

/**
 * Reads amounts typed in common shapes ("12.50", "12,5", "1,234.56", "1.234,56", "$ 12").
 * Ambiguous or malformed input returns null rather than a guess that could be 100× off:
 * a single "." followed by exactly three digits ("12.345") is rejected.
 */
export function parseMoney(input: string, currency: string): number | null {
  if (/-/.test(input) || /\d\s*[eE]\s*[+-]?\d/.test(input)) return null;
  const s = input.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const digits = minorDigits(currency);

  const dots = s.split('.').length - 1;
  const commas = s.split(',').length - 1;
  let intPart: string;
  let fracPart = '';

  if (dots > 0 && commas > 0) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const decimal = s[last]!;
    const group = decimal === '.' ? ',' : '.';
    if (s.indexOf(decimal) !== last) return null;
    if (!validGroups(s.slice(0, last).split(group))) return null;
    intPart = s.slice(0, last).split(group).join('');
    fracPart = s.slice(last + 1);
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ',';
    const [a = '', b = ''] = s.split(sep);
    if (b.length >= 1 && b.length <= digits) {
      intPart = a;
      fracPart = b;
    } else if (sep === ',' && b.length === 3 && /^\d{1,3}$/.test(a)) {
      intPart = a + b;
    } else {
      return null;
    }
  } else if (dots + commas > 1) {
    const groups = s.split(dots ? '.' : ',');
    if (!validGroups(groups)) return null;
    intPart = groups.join('');
  } else {
    intPart = s;
  }

  if (!isDigits(intPart) || !isDigits(fracPart) || fracPart.length > digits) return null;
  const minor = Number(intPart || '0') * 10 ** digits + Number(fracPart.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

/** One to three digits, one "." or ",", exactly three more: "1,000" is a thousand or one, "12.345" too. */
const AMBIGUOUS_DECIMAL = /^[1-9]\d{0,2}[.,]\d{3}$/;

export function isAmbiguousDecimal(input: string): boolean {
  return AMBIGUOUS_DECIMAL.test(input.trim());
}

/**
 * Reads a plain number typed in the same shapes as `parseMoney` ("12", "2.5", "0,25", "1,234.5",
 * "1.234,5"), with any number of decimals, for shares and prices. It guesses no more than
 * `parseMoney` does: a lone "." or "," after one to three digits and before exactly three more
 * ("1,000", "12.345") could be a thousand or a fraction, so it is refused (see
 * `isAmbiguousDecimal`); so is a sign, an exponent, text or a number too big to hold. "0.125" is
 * clear, as no thousands group starts with 0.
 */
export function parseDecimal(input: string): number | null {
  const s = input.trim();
  if (!/^[\d.,]*\d[\d.,]*$/.test(s)) return null;
  const dots = s.split('.').length - 1;
  const commas = s.split(',').length - 1;
  let intPart: string;
  let fracPart = '';

  if (dots > 0 && commas > 0) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const decimal = s[last]!;
    const group = decimal === '.' ? ',' : '.';
    if (s.indexOf(decimal) !== last) return null;
    const groups = s.slice(0, last).split(group);
    if (!validGroups(groups)) return null;
    intPart = groups.join('');
    fracPart = s.slice(last + 1);
  } else if (dots + commas === 1) {
    if (isAmbiguousDecimal(s)) return null;
    [intPart = '', fracPart = ''] = s.split(dots ? '.' : ',');
    if (fracPart === '') return null;
  } else if (dots + commas > 1) {
    const groups = s.split(dots ? '.' : ',');
    if (!validGroups(groups)) return null;
    intPart = groups.join('');
  } else {
    intPart = s;
  }

  const n = Number(`${intPart || '0'}.${fracPart || '0'}`);
  return Number.isFinite(n) ? n : null;
}

/**
 * A plain number as text `parseDecimal` reads back to the same number, for filling a field: no
 * exponent ("1e-7" is "0.0000001") and no grouping, and a zero added where the text would be
 * ambiguous ("1.125" is "1.1250", as the person would have to write it).
 */
export function formatDecimal(n: number): string {
  const text = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  return isAmbiguousDecimal(text) ? `${text}0` : text;
}

export type MoneyFormatOptions = {
  signDisplay?: 'auto' | 'always' | 'exceptZero';
  /** Drop the minor units ("$1,884"), for compact labels. */
  whole?: boolean;
};

export function formatMoney(
  minor: number,
  currency: string,
  locale?: string,
  opts: MoneyFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: opts.signDisplay ?? 'auto',
    ...(opts.whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(minor / 10 ** minorDigits(currency));
}

/**
 * An amount as `formatMoney` writes it, in the parts Home's hero draws apart: the sign, the currency
 * (written before the number, or after it in some locales), the whole units with their grouping, and
 * the decimal mark with the cents ("" for a currency without them). The spaces between are left out.
 */
export function moneyParts(
  minor: number,
  currency: string,
  locale?: string,
): { lead: string; currency: string; units: string; cents: string; currencyFirst: boolean } {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(
    minor / 10 ** minorDigits(currency),
  );
  const of = (...types: Intl.NumberFormatPartTypes[]) =>
    parts
      .filter((p) => types.includes(p.type))
      .map((p) => p.value)
      .join('');
  return {
    lead: of('minusSign', 'plusSign'),
    currency: of('currency'),
    units: of('integer', 'group'),
    cents: of('decimal', 'fraction'),
    currencyFirst:
      parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer'),
  };
}

/** Plain editable form, e.g. 123450 USD → "1,234.50" (no symbol). */
export function formatMoneyPlain(minor: number, currency: string): string {
  const d = minorDigits(currency);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(minor / 10 ** d);
}

export function currencySymbol(currency: string, locale?: string): string {
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}

/**
 * `minor` units of `from` as minor units of `to` at `rate` (units of `to` for one of `from`),
 * rounded once with `Math.round`, the one rule for money: an exact half goes up, so -22.5 is -22.
 * The currencies may differ in decimals: ¥ has none, € has two. The `+ 0` turns a rounded -0 into
 * 0, which would print as "-¥0". With `from` the same as `to` and a rate of 1 it is the rounding alone.
 */
export function convertMinor(minor: number, from: string, to: string, rate: number): number {
  return Math.round(minor * rate * 10 ** (minorDigits(to) - minorDigits(from))) + 0;
}
