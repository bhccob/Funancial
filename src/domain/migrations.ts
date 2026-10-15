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
