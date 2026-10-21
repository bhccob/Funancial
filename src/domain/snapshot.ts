import { z } from 'zod';
import {
  AccountSchema,
  BudgetLimitSchema,
  ChallengeSchema,
  CheckInSchema,
  DebtSchema,
  DividendSchema,
  ExpenseSchema,
  GoalSchema,
  HoldingSchema,
  IncomeSchema,
  LedgerEntrySchema,
  ProfileSchema,
  SaleSchema,
  SettingsSchema,
  StreakFreezeSchema,
  SubscriptionSchema,
  TransactionSchema,
} from './entities';
import type { LocalDate } from './dates';
import { migrateTables, type RawTables } from './migrations';

export const TABLES = [
  'profile',
  'settings',
  'account',
  'income',
  'expense',
  'subscription',
  'budgetLimit',
  'transaction',
  'goal',
  'debt',
  'ledger',
  'checkIn',
  'challenge',
  'streakFreeze',
  'holding',
  'dividend',
  'sale',
] as const;
export type TableName = (typeof TABLES)[number];

export const SCHEMAS = {
  profile: ProfileSchema,
  settings: SettingsSchema,
  account: AccountSchema,
  income: IncomeSchema,
  expense: ExpenseSchema,
  subscription: SubscriptionSchema,
  budgetLimit: BudgetLimitSchema,
  transaction: TransactionSchema,
  goal: GoalSchema,
  debt: DebtSchema,
  ledger: LedgerEntrySchema,
  checkIn: CheckInSchema,
  challenge: ChallengeSchema,
  streakFreeze: StreakFreezeSchema,
  holding: HoldingSchema,
  dividend: DividendSchema,
  sale: SaleSchema,
} satisfies Record<TableName, z.ZodType>;

export type EntityMap = { [K in TableName]: z.infer<(typeof SCHEMAS)[K]> };
export type EntityOf<T extends TableName> = EntityMap[T];

export const CURRENT_SCHEMA_VERSION = 10;

/** One record tagged with its table, for batch writes. */
export type TableRecord = { [K in TableName]: { table: K; record: EntityOf<K> } }[TableName];
/** Names one stored record, to remove it. */
export type RecordKey = { table: TableName; id: string };

const SINGLETONS = new Set<TableName>(['profile', 'settings']);

function table<T extends z.ZodType<{ id: string }>>(name: TableName, schema: T) {
  return z
    .array(schema)
    .max(SINGLETONS.has(name) ? 1 : Number.MAX_SAFE_INTEGER)
    .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, 'Duplicate ids');
}

export const SnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  tables: z.object({
    profile: table('profile', ProfileSchema),
    settings: table('settings', SettingsSchema),
    // Added in v10, which builds it out of the profile and the card debts.
    account: table('account', AccountSchema).default([]),
    income: table('income', IncomeSchema),
    expense: table('expense', ExpenseSchema),
    subscription: table('subscription', SubscriptionSchema),
    budgetLimit: table('budgetLimit', BudgetLimitSchema),
    transaction: table('transaction', TransactionSchema),
    goal: table('goal', GoalSchema),
    debt: table('debt', DebtSchema),
    // Added in v4: snapshots from before it have none of these.
    ledger: table('ledger', LedgerEntrySchema).default([]),
    checkIn: table('checkIn', CheckInSchema).default([]),
    challenge: table('challenge', ChallengeSchema).default([]),
    streakFreeze: table('streakFreeze', StreakFreezeSchema).default([]),
    // Added in v5.
    holding: table('holding', HoldingSchema).default([]),
    dividend: table('dividend', DividendSchema).default([]),
    // Added in v7.
    sale: table('sale', SaleSchema).default([]),
  }),
});

export type DataSnapshot = {
  schemaVersion: number;
  tables: { [K in TableName]: EntityOf<K>[] };
};

export function emptySnapshot(): DataSnapshot {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tables: {
      profile: [],
      settings: [],
      account: [],
      income: [],
      expense: [],
      subscription: [],
      budgetLimit: [],
      transaction: [],
      goal: [],
      debt: [],
      ledger: [],
      checkIn: [],
      challenge: [],
      streakFreeze: [],
      holding: [],
      dividend: [],
      sale: [],
    },
  };
}

/**
 * What Delete all data leaves when there is an account: the settings, and the name and currency
 * for setup to start from. Everything added goes, the accounts with it, and the game progress it
 * earned; the money starts again today, from what setup asks.
 */
export function freshStart(data: DataSnapshot, today: LocalDate, now: string): DataSnapshot {
  const fresh = emptySnapshot();
  fresh.tables.settings = data.tables.settings.map((s) => ({
    ...s,
    updatedAt: now,
    defaultAccountId: null,
  }));
  fresh.tables.profile = data.tables.profile.map((p) => ({
    ...p,
    updatedAt: now,
    openingDate: today,
    salary: null,
    onboardedAt: null,
  }));
  return fresh;
}

export class SchemaVersionError extends Error {
  readonly found: number;
  constructor(found: number) {
    super(
      `Data schema version ${found} is newer than this app supports (${CURRENT_SCHEMA_VERSION})`,
    );
    this.name = 'SchemaVersionError';
    this.found = found;
  }
}

/**
 * Bring stored or imported data up to the current schema, then validate it.
 * Older snapshots are upgraded by `migrateTables` (see migrations.ts). Throws SchemaVersionError
 * for data from a newer app, and ZodError for anything malformed.
 */
export function migrateSnapshot(raw: unknown): DataSnapshot {
  const version =
    typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
      ? raw.schemaVersion
      : undefined;
  if (typeof version === 'number' && version > CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionError(version);
  }
  if (typeof version === 'number' && version < CURRENT_SCHEMA_VERSION) {
    raw = upgradeTables(raw as { tables?: unknown }, version);
  }
  return SnapshotSchema.parse(raw);
}

function upgradeTables(raw: { tables?: unknown }, fromVersion: number): unknown {
  const tables = raw.tables;
  if (typeof tables !== 'object' || tables === null) return raw;
  return {
    ...raw,
    tables: migrateTables(tables as RawTables, fromVersion),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
