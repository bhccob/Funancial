import type { TableName } from './snapshot';
import { upgradeToV10 } from './upgrades/v10Accounts';

type RecordStep = (record: Record<string, unknown>) => Record<string, unknown>;

/**
 * Per-record upgrades, keyed by the schema version they produce. Stored rows and an account's copy
 * are migrated record by record on read, so a change to one entity never hides old data.
 */
type Step = Partial<Record<TableName, RecordStep>>;

/** Rows by table name, as stored or as an account's copy holds them: not yet validated. */
export type RawTables = Record<string, unknown[]>;

type TableStep = (tables: RawTables) => RawTables;

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
  // The buyDecision and aboutYou tables were new (v10 drops them again). Spelled out like step 3:
  // the Buy it? reminder starts on, until v10 takes it away.
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

/**
 * Upgrades that have to look across tables, keyed by the schema version they produce. Each runs
 * after that version's record steps, on every table at once.
 */
export const TABLE_STEPS: Record<number, TableStep> = {
  // Accounts replace the buckets and the credit-card debts; three retired tables go.
  10: upgradeToV10,
};

export const LATEST_VERSION = Math.max(
  1,
  ...Object.keys(STEPS).map(Number),
  ...Object.keys(TABLE_STEPS).map(Number),
);

/** One version's record step, applied to one row. Anything that is not a record passes through. */
function stepRecord(table: string, raw: unknown, step: Step | undefined): unknown {
  if (typeof raw !== 'object' || raw === null || !step) return raw;
  let record = raw as Record<string, unknown>;
  const upgrade = (step as Partial<Record<string, RecordStep>>)[table];
  if (upgrade) record = upgrade(record);
  // A sale stores the holding it removed as it was then, so the holding steps upgrade it too.
  if (
    table === 'sale' &&
    step.holding &&
    typeof record.restore === 'object' &&
    record.restore !== null
  ) {
    record = { ...record, restore: step.holding(record.restore as Record<string, unknown>) };
  }
  return record;
}

/**
 * One record of `table` brought up from `fromVersion`, by the record steps alone: for a single row
 * from v9 or before (a sale's `restore` holding), which no table step changes.
 * `steps` is for tests, to try a step that does not exist yet.
 */
export function migrateRecord(
  table: TableName,
  raw: unknown,
  fromVersion: number,
  steps: Record<number, Step> = STEPS,
): unknown {
  let record = raw;
  for (let v = fromVersion + 1; v <= LATEST_VERSION; v++) {
    record = stepRecord(table, record, steps[v]);
  }
  return record;
}

/**
 * Every table brought up from `fromVersion`: version by version, the record step of that version
 * on each row, then its table step. The one upgrade path for stored rows and an account's copy.
 * The tables given are not changed. `steps` and `tableSteps` are for tests.
 */
export function migrateTables(
  tables: RawTables,
  fromVersion: number,
  steps: Record<number, Step> = STEPS,
  tableSteps: Record<number, TableStep> = TABLE_STEPS,
): RawTables {
  let out = tables;
  for (let v = fromVersion + 1; v <= LATEST_VERSION; v++) {
    const step = steps[v];
    if (step) {
      const stepped: RawTables = {};
      for (const [name, rows] of Object.entries(out)) {
        stepped[name] = Array.isArray(rows) ? rows.map((r) => stepRecord(name, r, step)) : rows;
      }
      out = stepped;
    }
    const tableStep = tableSteps[v];
    if (tableStep) out = tableStep(out);
  }
  return out;
}
