import type { ReminderSettings, Settings } from '@/domain/entities';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { makeProfile, makeSettings, makeSubscription } from '@/test/fixtures';

/** The local moment the inbox tests run at: a Wednesday, 10:00. */
export const INBOX_NOW = new Date(2026, 9, 14, 10, 0);

const ONLY_THESE: Partial<ReminderSettings> = {
  dailyLog: false,
  bills: true,
  freeze: false,
  reviews: true,
  backup: false,
  dividends: false,
};

/**
 * Data whose last 30 days hold seven reminders at `INBOX_NOW`, newest first: the renewals of
 * Streamflix (due on the 14th, so reminded on the 13th) and Tunely (due on the 13th, reminded on the
 * 12th), and the weekly check-ins of the 11th, the 4th, the 27th and the 20th with the monthly review
 * of the 30th. The master switch is off, which the inbox does not mind.
 */
export function inboxData(inbox: Settings['inbox'] = { readBefore: null, read: [] }): DataSnapshot {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ createdAt: '2026-01-01T09:00:00.000Z' })];
  data.tables.settings = [
    makeSettings({
      weekStartsOn: 1,
      inbox,
      reminders: { ...makeSettings().reminders, enabled: false, ...ONLY_THESE },
    }),
  ];
  data.tables.subscription = [
    makeSubscription({ id: 'sub-streamflix', name: 'Streamflix', nextRenewal: '2026-10-14' }),
    makeSubscription({ id: 'sub-tunely', name: 'Tunely', nextRenewal: '2026-10-13' }),
  ];
  return data;
}
