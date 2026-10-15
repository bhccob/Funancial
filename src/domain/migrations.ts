import type { TableName } from './snapshot';

/**
 * Per-record upgrades, keyed by the schema version they produce. Stored rows and backups are
 * migrated record by record on read, so a change to one entity never hides old data.
 */
type Step = Partial<
  Record<TableName, (record: Record<string, unknown>) => Record<string, unknown>>
>;

const STEPS: Record<number, Step> = {
  2: {
    subscription: (r) =>
      typeof r.anchorDay === 'number'
        ? r
        : { ...r, anchorDay: Number(String(r.nextRenewal ?? '').slice(8, 10)) || 1 },
  },
  3: {
    // Spelled out, not read from `defaultSettings`: a step keeps meaning what it meant in v3
    // even if the defaults change later.
    settings: (r) =>
      typeof r.reminders === 'object' && r.reminders !== null
        ? r
        : {
            ...r,
            reminders: {
              enabled: false,
              dailyLog: true,
              dailyTime: '20:00',
              bills: true,
              freeze: true,
              reviews: true,
              backup: true,
              prompted: false,
            },
          },
  },
};

export const LATEST_VERSION = Math.max(1, ...Object.keys(STEPS).map(Number));

export function migrateRecord(table: TableName, raw: unknown, fromVersion: number): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  let record = raw as Record<string, unknown>;
  for (let v = fromVersion + 1; v <= LATEST_VERSION; v++) {
    const step = STEPS[v]?.[table];
    if (step) record = step(record);
  }
  return record;
}
