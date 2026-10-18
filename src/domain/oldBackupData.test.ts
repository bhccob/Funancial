import { describe, expect, it } from 'vitest';
import { localIso, makeLedgerEntry, makeProfile, makeSettings } from '@/test/fixtures';
import { computeGameView, gameUpdates } from './game/engine';
import type { GameContext } from './game/types';
import { emptySnapshot, migrateSnapshot } from './snapshot';

// Backups, their reminder and their quest are gone. Data saved while they existed still holds
// their fields and records, and has to load and behave as before.

const today = '2026-10-15';
const ctx: GameContext = { today, now: localIso(today, 18), weekStartsOn: 1 };

const earnedFromQuest = makeLedgerEntry({
  id: 'quest:month-backup:2026-09#0',
  key: 'quest:month-backup:2026-09',
  kind: 'award',
  xp: 80,
  coins: 20,
  label: 'Quest: Back up your data',
  createdAt: localIso('2026-09-12'),
});

/** What a phone that made backups saved: a backup date, the reminder switch on, its read keys, the quest paid. */
function savedWithBackups() {
  const snapshot = emptySnapshot();
  snapshot.tables.profile = [makeProfile()];
  const settings = makeSettings();
  snapshot.tables.settings = [
    {
      ...settings,
      lastBackupAt: '2026-10-02T12:00:00.000Z',
      reminders: { ...settings.reminders, enabled: true, backup: true },
      inbox: { readBefore: null, read: ['backup:2026-10-07', 'week:2026-10-11'] },
    },
  ];
  snapshot.tables.ledger = [earnedFromQuest];
  return snapshot;
}

describe('data saved while backups existed', () => {
  it('still loads, field for field', () => {
    const saved = savedWithBackups();
    const loaded = migrateSnapshot(JSON.parse(JSON.stringify(saved)));

    expect(loaded).toEqual(saved);
    expect(loaded.tables.settings[0]).toMatchObject({
      lastBackupAt: '2026-10-02T12:00:00.000Z',
      reminders: { backup: true },
      inbox: { read: ['backup:2026-10-07', 'week:2026-10-11'] },
    });
    expect(loaded.tables.ledger[0]!.key).toBe('quest:month-backup:2026-09');
  });

  it('keeps the XP and coins the backup quest paid, in the totals and the history', () => {
    const view = computeGameView(savedWithBackups(), ctx);

    expect(view.totals).toEqual({ xp: 80, coins: 20 });
    expect(view.history.map((e) => e.label)).toEqual(['Quest: Back up your data']);
    // The quest is no longer offered, so nothing is left to be done for it.
    expect(view.quests.map((q) => q.id)).not.toContain('month-backup');
  });

  it('never takes back, or pays again, what the retired quest paid', () => {
    const { records, gain } = gameUpdates(savedWithBackups(), ctx);

    expect(
      records.filter((r) => r.table === 'ledger' && r.record.key.includes('month-backup')),
    ).toEqual([]);
    expect(gain).toBeNull();
  });
});
