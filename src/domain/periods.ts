import { addDays, type LocalDate } from './dates';

/** An inclusive range of calendar days. */
export type Range = { start: LocalDate; end: LocalDate };

const pad = (n: number) => String(n).padStart(2, '0');
const year = (d: LocalDate) => Number(d.slice(0, 4));
const month = (d: LocalDate) => Number(d.slice(5, 7));

export function daysInMonth(y: number, m1to12: number): number {
  return new Date(Date.UTC(y, m1to12, 0)).getUTCDate();
}

export function dayOfMonth(d: LocalDate): number {
  return Number(d.slice(8, 10));
}

export function monthKey(d: LocalDate): string {
  return d.slice(0, 7);
}

export function endOfMonth(d: LocalDate): LocalDate {
  return `${d.slice(0, 7)}-${pad(daysInMonth(year(d), month(d)))}`;
}

export function dayRange(d: LocalDate): Range {
  return { start: d, end: d };
}

/** The week containing `d`, starting Monday (1) or Sunday (0). */
export function weekRange(d: LocalDate, weekStartsOn: 0 | 1): Range {
  const weekday = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const back = (weekday - weekStartsOn + 7) % 7;
  const start = addDays(d, -back);
  return { start, end: addDays(start, 6) };
}

export function monthRange(d: LocalDate): Range {
  return { start: `${d.slice(0, 7)}-01`, end: endOfMonth(d) };
}

export function yearRange(d: LocalDate): Range {
  return { start: `${d.slice(0, 4)}-01-01`, end: `${d.slice(0, 4)}-12-31` };
}

export function periodRange(kind: 'weekly' | 'monthly', d: LocalDate, weekStartsOn: 0 | 1): Range {
  return kind === 'weekly' ? weekRange(d, weekStartsOn) : monthRange(d);
}

export function inRange(d: LocalDate, r: Range): boolean {
  return d >= r.start && d <= r.end;
}

/**
 * The same days of the month before as `d` has had of its own so far: its 1st to the same day, or to
 * its last day when it is shorter (Oct 1-22 for Nov 22; all of February for Mar 31).
 */
export function sameDaysLastMonth(d: LocalDate): Range {
  const [y, m] = month(d) === 1 ? [year(d) - 1, 12] : [year(d), month(d) - 1];
  const day = Math.min(dayOfMonth(d), daysInMonth(y, m));
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(day)}` };
}

/** The month keys of the last `count` months, oldest first, ending with the month of `d`. */
export function lastMonths(d: LocalDate, count: number): string[] {
  let y = year(d);
  let m = month(d);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return keys;
}

/** Month keys from `fromKey` to `toKey` inclusive (empty if from > to). */
export function monthsBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let y = Number(fromKey.slice(0, 4));
  let m = Number(fromKey.slice(5, 7));
  while (`${y}-${pad(m)}` <= toKey) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
