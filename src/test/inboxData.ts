import type { ReminderSettings, Settings } from '@/domain/entities';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { makeBuyDecision, makeProfile, makeSettings } from '@/test/fixtures';

/** The local moment the inbox tests run at: a Wednesday, 10:00. */
export const INBOX_NOW = new Date(2026, 9, 14, 10, 0);

const ONLY_THESE: Partial<ReminderSettings> = {
  dailyLog: false,
  bills: false,
  freeze: true,
  reviews: true,
  backup: false,
  dividends: false,
  buyIt: true,
};

/**
 * Data whose last 30 days hold eight reminders at `INBOX_NOW`, newest first: a freeze that ended on
 * the 13th and started on the 12th, a Kettle to think about again on the 12th, and the weekly
 * check-ins of the 11th, the 4th, the 27th and the 20th with the monthly review of the 30th. The
 * master switch is off, which the inbox does not mind.
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
  data.tables.salaryFreeze = [
    {
      id: 'freeze-1',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
      start: '2026-10-12',
      end: '2026-10-13',
      lostAmount: 0,
      mode: 'manual',
      note: '',
    },
  ];
  data.tables.buyDecision = [
    makeBuyDecision({
      id: 'kettle',
      status: 'waiting',
      remindOn: '2026-10-12',
      ask: { ...makeBuyDecision().ask, item: 'Kettle' },
    }),
  ];
  return data;
}
