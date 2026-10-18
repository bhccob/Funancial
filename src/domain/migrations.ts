import type { TableName } from './snapshot';

/**
 * Per-record upgrades, keyed by the schema version they produce. Stored rows and an account's copy
 * are migrated record by record on read, so a change to one entity never hides old data.
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
  4: {
    // Spelled out for the same reason as step 3. The four game tables are new, so they have no
    // old rows to upgrade; a snapshot without them gets empty ones from the schema.
    settings: (r) =>
      typeof r.cosmetics === 'object' && r.cosmetics !== null
        ? r
        : {
            ...r,
            cosmetics: { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' },
          },
    subscription: (r) => (r.auditedAt !== undefined ? r : { ...r, auditedAt: null }),
  },
  5: {
    // The holding and dividend tables are new, so a snapshot without them gets empty ones from
    // the schema. Spelled out like step 3: the dividend reminder starts on.
    settings: (r) =>
      typeof r.reminders === 'object' && r.reminders !== null && !('dividends' in r.reminders)
        ? { ...r, reminders: { ...r.reminders, dividends: true } }
        : r,
  },
  6: {
    // Spelled out like step 3: Invest starts in the profile currency, with no rate fetched yet.
    settings: (r) => ({
      ...r,
      investCurrency: r.investCurrency ?? null,
      investFx: r.investFx ?? null,
    }),
  },
  // The sale table is new, so it has no old rows to upgrade and no other record changes: a snapshot
  // without it gets an empty one from the schema. The step stays so the version number has one.
  7: {},
  // The buyDecision and aboutYou tables are new, so a snapshot without them gets empty ones from the
  // schema. Spelled out like step 3: the Buy it? reminder starts on.
  8: {
    settings: (r) =>
      typeof r.reminders === 'object' && r.reminders !== null && !('buyIt' in r.reminders)
        ? { ...r, reminders: { ...r.reminders, buyIt: true } }
        : r,
  },
  // Spelled out like step 3: nothing is read yet. A phone still on v7 runs step 8 first, then this.
  9: {
    settings: (r) =>
      typeof r.inbox === 'object' && r.inbox !== null
        ? r
        : { ...r, inbox: { readBefore: null, read: [] } },
  },
};

export const LATEST_VERSION = Math.max(1, ...Object.keys(STEPS).map(Number));

/** `steps` is for tests, to try a step that does not exist yet. */
export function migrateRecord(
  table: TableName,
  raw: unknown,
  fromVersion: number,
  steps: Record<number, Step> = STEPS,
): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  let record = raw as Record<string, unknown>;
  for (let v = fromVersion + 1; v <= LATEST_VERSION; v++) {
    const step = steps[v]?.[table];
    if (step) record = step(record);
  }
  // A sale stores the holding it removed as it was then, so the holding steps upgrade it too.
  if (table === 'sale' && typeof record.restore === 'object' && record.restore !== null) {
    record = { ...record, restore: migrateRecord('holding', record.restore, fromVersion, steps) };
  }
  return record;
}
