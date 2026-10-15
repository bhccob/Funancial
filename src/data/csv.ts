import { minorDigits } from '@/domain/money';
import type { DataSnapshot } from '@/domain/snapshot';

const HEADER = [
  'date',
  'amount',
  'currency',
  'category',
  'payment_method',
  'card',
  'note',
  'subscription',
];

/** RFC 4180: quote a field holding a comma, quote or line break, doubling inner quotes. */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Major units with "." and the currency's own decimals, e.g. 1250 USD → "12.50", 1234 JPY → "1234". */
function amount(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

/** Every expense as CSV for a spreadsheet, oldest first, with CRLF line endings. */
export function expensesToCsv(data: DataSnapshot, currency: string): string {
  const cards = new Map(data.tables.debt.map((d) => [d.id, d.name]));
  const subscriptions = new Map(data.tables.subscription.map((s) => [s.id, s.name]));
  const rows = [...data.tables.expense]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((e) => [
      e.date,
      amount(e.amount, currency),
      currency,
      e.category,
      e.paymentMethod,
      (e.cardId && cards.get(e.cardId)) ?? '',
      e.note,
      (e.subscriptionId && subscriptions.get(e.subscriptionId)) ?? '',
    ]);
  return [HEADER, ...rows].map((r) => r.map(field).join(',') + '\r\n').join('');
}
