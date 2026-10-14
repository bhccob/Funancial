import { z } from 'zod';

/** A calendar day, `YYYY-MM-DD`, with no time zone. */
export type LocalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(d: LocalDate): [number, number, number] | null {
  const m = DATE_RE.exec(d);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isRealDate(d: string): boolean {
  const p = parts(d);
  if (!p) return false;
  const [y, mo, day] = p;
  const utc = new Date(Date.UTC(y, mo - 1, day));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === mo - 1 && utc.getUTCDate() === day;
}

export const LocalDateSchema = z.string().refine(isRealDate, 'Expected a date as YYYY-MM-DD');

/** `YYYY-MM`, e.g. the month a salary belongs to. */
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

export const IsoTimestampSchema = z.iso.datetime();

const pad = (n: number) => String(n).padStart(2, '0');

function fromUtc(date: Date): LocalDate {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The local calendar day of `d` (not its UTC day). */
export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar arithmetic done in UTC so daylight-saving shifts never skip or repeat a day. */
export function addDays(d: LocalDate, n: number): LocalDate {
  const p = parts(d);
  if (!p) throw new RangeError(`Not a LocalDate: ${d}`);
  const [y, mo, day] = p;
  return fromUtc(new Date(Date.UTC(y, mo - 1, day + n)));
}
