import { z } from 'zod';
import {
  BudgetLimitSchema,
  DebtSchema,
  ExpenseSchema,
  GoalSchema,
  IncomeSchema,
  ProfileSchema,
  SalaryFreezeSchema,
  SettingsSchema,
  SubscriptionSchema,
  TransactionSchema,
} from './entities';

export const TABLES = [
  'profile',
  'settings',
  'income',
  'expense',
  'subscription',
  'budgetLimit',
  'salaryFreeze',
  'transaction',
  'goal',
  'debt',
] as const;
export type TableName = (typeof TABLES)[number];

export const SCHEMAS = {
  profile: ProfileSchema,
  settings: SettingsSchema,
  income: IncomeSchema,
  expense: ExpenseSchema,
  subscription: SubscriptionSchema,
  budgetLimit: BudgetLimitSchema,
  salaryFreeze: SalaryFreezeSchema,
  transaction: TransactionSchema,
  goal: GoalSchema,
  debt: DebtSchema,
} satisfies Record<TableName, z.ZodType>;

export type EntityMap = { [K in TableName]: z.infer<(typeof SCHEMAS)[K]> };
export type EntityOf<T extends TableName> = EntityMap[T];

export const CURRENT_SCHEMA_VERSION = 1;

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
    income: table('income', IncomeSchema),
    expense: table('expense', ExpenseSchema),
    subscription: table('subscription', SubscriptionSchema),
    budgetLimit: table('budgetLimit', BudgetLimitSchema),
    salaryFreeze: table('salaryFreeze', SalaryFreezeSchema),
    transaction: table('transaction', TransactionSchema),
    goal: table('goal', GoalSchema),
    debt: table('debt', DebtSchema),
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
      income: [],
      expense: [],
      subscription: [],
      budgetLimit: [],
      salaryFreeze: [],
      transaction: [],
      goal: [],
      debt: [],
    },
  };
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
 * v1 is the first version, so there are no steps yet. Throws SchemaVersionError for data
 * from a newer app, and ZodError for anything malformed.
 */
export function migrateSnapshot(raw: unknown): DataSnapshot {
  const version =
    typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
      ? raw.schemaVersion
      : undefined;
  if (typeof version === 'number' && version > CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionError(version);
  }
  return SnapshotSchema.parse(raw);
}
