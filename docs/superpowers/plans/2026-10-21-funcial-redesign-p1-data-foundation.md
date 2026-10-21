# Redesign Phase 1 — Data foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Funcial's money onto the cards model (schema v10). Accounts replace the
cash/savings/passive buckets and the credit-card debts. Remove "Should I buy it?", About you and
Salary freeze, and keep every existing screen working with today's look.

**Architecture:**
- A new `account` table and per-entity `accountId` fields replace buckets, `paymentMethod` and
  `cardId`.
- The upgrade from v9 is the first *table-level* migration step: it reads the profile and the
  debts to build accounts. Both load paths run it: stored rows (`repository.loadAll`) and the
  account copy (`migrateSnapshot`).
- Balances, the finance view and every action are then rewritten over accounts. The screens swap
  their bucket and card pickers for one `AccountField`.

**Tech Stack:** React 19, TypeScript, zod 4, zustand 5, vitest + Testing Library, Playwright,
Capacitor Android (SQLCipher).

**Spec:** `docs/superpowers/specs/2026-10-21-funcial-redesign-design.md`, §6 (data model), §8
(calculations) and §10 (P2, P3). Roadmap: `docs/superpowers/plans/2026-10-21-funcial-redesign-roadmap.md`
(Phase 1 acceptance).

## Global Constraints

- **Base:** `main` after the `fix/card-and-data-delete` PR (0.9) is merged.
  - Branch: `feat/redesign-p1-data`.
  - That fix added `Debt.archivedOn`, `src/domain/debts.ts` (`archivedBy`, `activeDebts`,
    `debtRemoval`) and `freshStart` in `snapshot.ts`. This plan carries their meaning over to
    accounts.
- **Money:** integer minor units in the profile currency, never floats.
- **Version:** `CURRENT_SCHEMA_VERSION` and `LATEST_VERSION` are both **10**.
- **Upgrade constants** (`src/domain/upgrades/v10Accounts.ts`):

  | | id | name | skin |
  | --- | --- | --- | --- |
  | `MAIN_ACCOUNT_ID` | `'acct-main'` | `'Main account'` | `'midnight'` |
  | `SAVINGS_ACCOUNT_ID` | `'acct-savings'` | `'Savings'` | `'mint'` |
  | `PASSIVE_ACCOUNT_ID` | `'acct-passive'` | `'Passive income'` | `'amber'` |

  A credit-card debt becomes an account **with the same id**, with skin `'violet'`.
- **Defaults by kind** (`defaultsFor(kind)` in `src/domain/accounts.ts`):

  | kind | skin | in Available |
  | --- | --- | --- |
  | debit | `midnight` | yes |
  | cash | `amber` | yes |
  | savings | `mint` | no |
  | credit | `violet` | no |

- **Copy:** plain English in the app's existing voice. New error strings:
  - `'Pick where its subscriptions go.'`
  - `'Only a bank account, cash or savings can pay.'`
  - `'Use two different accounts.'`
- **Looks:** no visual redesign in this phase. Screens keep today's components and tokens.
- **Typecheck:** from Task 4 to Task 12 the typecheck and the full suite are red, because the data
  shape changes underneath every screen. Each task runs and passes **its own listed tests**
  (vitest compiles without type-checking). Task 13 ends with `npm run typecheck`, `npm run lint`,
  `npm test` and `npm run test:e2e` all green.
- **Commits:** lower-case conventional style, as the repo does (`feat: …`, `fix: …`, `test: …`).
  End each with the `Co-Authored-By` trailer the session gives.
- **Secrets:** never print `.env.local` values. No AI features.

## Review Focus

1. **The owner's real phone data**, with events dated before the profile's or a card's
   `openingDate`. Those are ignored today, and after the upgrade every balance must equal its v9
   value to the cent. The `v9-edge` fixture covers this (Task 1), and Task 6 asserts it.
2. **The same v9 data through the account copy** (`migrateSnapshot`, used at log-in) and through
   stored rows (`repository.loadAll`). Both must produce identical v10 tables (Task 5 test
   `stored and copied v9 data upgrade the same`).
3. **A card archived by the 0.9 fix.** It still has history, and its subscriptions were moved to
   debit. After the upgrade it is an archived credit account: hidden from pickers and lists, still
   named by its expenses, and left out of net worth and bills (Task 4, Task 6).
4. **`defaultAccountId` pointing at an archived or deleted account.** New expenses and expected
   salaries fall back to the first active debit or cash account by `order`, and to nothing when
   there is none (Task 7 test `default account falls back`).
5. **Rows that can't be upgraded:**
   - a stored row that fails to decrypt is left on disk untouched and not removed
   - a v9 expense whose `cardId` names no debt is upgraded with that id as `accountId` and doesn't
     throw

   Task 4 and Task 5 cover both.

---

### Task 1: Freeze the v9 shapes and their balances

Captured before any code changes, so later tasks can prove nothing moved.

**Files:**
- Create: `src/domain/upgrades/__fixtures__/v9-demo.json`
- Create: `src/domain/upgrades/__fixtures__/v9-edge.json`
- Create: `src/domain/upgrades/__fixtures__/v9-expected.json`
- Temporary, not committed: `src/domain/upgrades/capture.test.ts`

**Interfaces:**
- Produces:
  - Two raw v9 snapshots, `{ schemaVersion: 9, tables }`.
  - `v9-expected.json`: `{ demo: Expected, edge: Expected }`, where
    `Expected = { asOf: '2026-10-20', cash, savings, passive, cards: Record<id, number>, loans: Record<id, number>, netWorth }`.

- [ ] **Step 1: Write the capture test** (`capture.test.ts`):
  - `v9-demo` = `buildDemoSnapshot('2026-10-20')`.
  - `v9-edge` is built with the `src/test/fixtures.ts` helpers. Profile `openingDate`
    `2026-01-01`, with `openingCash` 100000 and `openingSavings` 500000. It holds:
    - an expense dated `2025-12-31` (before opening: ignored)
    - expenses paid `cash`, `debit`, `other` and `credit_card`
    - a credit card `card-a` with a subscription on it
    - a second card `card-b` with `archivedOn: '2026-09-01'` and an expense on it
    - a loan `loan-1` with a `debt_payment` from `cash`
    - income to `savings`
    - a `transfer` from `savings` to `passive`
    - a `card_payment` to `card-a` from `savings`
    - an `investment` from `savings` with a holding (quote price set)
    - a `sale` to `savings`
    - a confirmed dividend to `passive`, one reinvested, and one skipped
    - an `adjustment` of −2500 to `cash`
    - one `salaryFreeze`, one `buyDecision` and an `aboutYou` row
    - settings with `reminders.freeze` and `reminders.buyIt` true

  The test writes both snapshots and `v9-expected.json`. Expected values are computed with
  today's `bucketBalances`, `debtBalance` and `computeFinanceView(...).netWorth` at `2026-10-20`
  with `weekStartsOn` 1.
- [ ] **Step 2: Run it once:** `npx vitest run src/domain/upgrades/capture.test.ts`. Expected: the
  three JSON files exist, and `edge.passive` is non-zero.
- [ ] **Step 3: Delete `capture.test.ts`.** It depends on v9 code that later tasks remove.
- [ ] **Step 4: Commit:** `test: freeze v9 snapshots and their balances for the cards upgrade`.

### Task 2: Remove "Should I buy it?" and About you

The `buyDecision` and `aboutYou` schemas and tables stay until Task 4, which deletes their rows.

**Files:**
- Delete:
  - `src/features/buy/` (all)
  - `src/store/buyActions.ts`, `src/store/buyActions.test.ts`
  - `src/store/useBuy.ts`, `src/store/useBuy.test.tsx`
  - `src/domain/advisor/` (all)
  - `tests/e2e/buy.spec.ts`
  - `api/extract.ts`, the product-link fill that only Buy it used. Also its `describe('product
    link extract')` block in `api/_lib/api.test.ts`, `fetchExtract` and `ExtractResponse` in
    `src/services/market.ts`, and the `extract` entry in `api/[op].ts` or `vercel.json` if listed.
    The live service keeps the route until the next Vercel deploy, which happens only after asking
    the owner (Task 13).
- Modify:
  - `src/app/routes.tsx` (drop `/buy`, `/buy/:id`, `/about-you`)
  - `src/app/menu.ts` (drop "Buy it?" and "About you")
  - `src/app/useMenuSubtitles.ts`
  - the store composition that wires `buyActions`
  - `src/domain/notifications.ts`: drop the `buyIt` rule and the `buy-wait`/`buy-usage` kinds,
    and their `REMINDER_AREA` entries
  - `src/features/settings/RemindersSection.tsx` (drop the Buy it? switch)
  - `src/domain/game/badges.ts`: drop the two badges that read `buyDecision`. Their XP stays,
    because one-time awards are never reversed (`ledger.ts`).
  - `src/content/help/*`: drop the `buy-it` page and the glossary terms used only by it
  - `src/data/demoSeed.ts` (no `buyDecision` or `aboutYou` rows)
  - `src/test/fixtures.ts` (drop `makeBuyAsk`, `makeBuyDecision`, `makeAboutYou`)
  - `src/test/inboxData.ts`
- Test:
  - `src/app/routes.test.ts`, `src/app/nav.test.tsx`
  - `src/domain/notifications.test.ts`
  - `src/domain/game/badges.test.ts`
  - `src/content/help/help.test.ts`
  - `src/data/demoSeed.test.ts`

**Interfaces:**
- Produces: no `buy` or `aboutYou` code paths remain outside `entities.ts` and `snapshot.ts`.

- [ ] **Step 1: Update the tests first:**
  - `routes.test.ts`: `'/buy'`, `'/buy/x'` and `'/about-you'` are not in `APP_ROUTES`.
  - `nav.test.tsx`: the Menu has no "Buy it?" and no "About you".
  - `notifications.test.ts`: `ReminderKind` values contain no `buy-`, and data with a
    `buyDecision` produces no reminder.
  - `badges.test.ts`: the badge list matches the remaining ids.
  - `help.test.ts`: no page id `buy-it`.
- [ ] **Step 2: Run them:** `npx vitest run src/app src/domain/notifications.test.ts src/domain/game/badges.test.ts src/content/help`. Expected: FAIL.
- [ ] **Step 3: Delete and edit the files listed.** `grep -rn "buyDecision\|aboutYou\|advisor\|useBuy\|/buy" src tests` should then show only `entities.ts`, `snapshot.ts` and their tests.
- [ ] **Step 4: Run** `npm run typecheck && npm test`. Expected: PASS (the shape hasn't changed yet).
- [ ] **Step 5: Commit:** `feat: "Should I buy it?" and About you are gone`.

### Task 3: Remove Salary freeze

The `salaryFreeze` schema and table stay until Task 4.

**Files:**
- Delete: `src/features/freeze/` (all)
- Modify:
  - `src/store/financeActions.ts`: drop `FreezeInput`, `addFreeze`, `deleteFreeze`
  - `src/domain/salary.ts`: drop `freezeLoss` and `freezeAllocation`.
    `expectedSalary(profile: Profile, month: string): number` loses its `freezes` parameter.
  - `src/domain/view.ts`: drop `activeFreeze`, and call `expectedSalary(profile, month)`
  - `src/features/dashboard/DashboardScreen.tsx` (drop the freeze banner)
  - `src/domain/notifications.ts`: drop the `freezes` rule and the `freeze-start`/`freeze-end`
    kinds
  - `src/features/settings/RemindersSection.tsx` (drop the freeze switch)
  - `src/domain/game/badges.ts` (drop `freeze-master`; its XP stays)
  - `src/app/routes.tsx` and `src/app/menu.ts` (drop `/freeze` and "Salary freeze")
  - `src/content/help/*`: drop the `salary-freeze` page, the FAQ entry, the glossary term and
    example `SAL-1` in `src/domain/examples.ts`
  - `src/data/demoSeed.ts`
  - `src/test/fixtures.ts`
- Test:
  - `src/domain/salary.test.ts`, `src/domain/view.test.ts`
  - `src/domain/notifications.test.ts`, `src/domain/game/badges.test.ts`
  - `src/content/help/help.test.ts`, `src/app/routes.test.ts`
  - `src/features/dashboard/dashboard.test.tsx`

**Interfaces:**
- Produces: `expectedSalary(profile: Profile, month: string): number`.

- [ ] **Step 1: Update the tests first:**
  - `salary.test.ts`: `expectedSalary(profile, '2026-10')` equals `profile.salary.monthlyAmount`
    from the pay month on, and 0 before `since`.
  - `view.test.ts`: `FinanceView` has no `activeFreeze`.
  - `routes.test.ts`: `'/freeze'` is gone.
  - `notifications.test.ts`: no `freeze-` kinds.
  - `dashboard.test.tsx`: no freeze banner, even with a `salaryFreeze` row in the data.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Delete and edit the files listed.**
- [ ] **Step 4: Run** `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Salary freeze is gone`.

### Task 4: The cards schema (v10) and its upgrade

**Files:**
- Modify: `src/domain/entities.ts`, `src/domain/snapshot.ts`, `src/domain/migrations.ts`
- Create:
  - `src/domain/upgrades/v10Accounts.ts`
  - `src/domain/accounts.ts` (moves `src/domain/debts.ts`'s account half here; `debts.ts`
    keeps loans)
- Test:
  - `src/domain/upgrades/v10Accounts.test.ts`
  - `src/domain/migrations.test.ts`
  - `src/domain/entities.test.ts`
  - `src/domain/snapshot.test.ts`

**Interfaces:**
- Produces in `entities.ts`:
  - `AccountKindSchema = z.enum(['debit','credit','savings','cash'])`, with
    `type AccountKind`.
  - `CreditTermsSchema = z.object({ limit: NonNegativeMoney.nullable(), statementDay: DayOfMonth.nullable(), dueDay: DayOfMonth.nullable(), payInFull: z.boolean(), minimumPayment: NonNegativeMoney, interestRate: z.number().nonnegative() })`,
    with `type CreditTerms`.
  - `AccountSchema = z.object({ ...base, name: z.string().min(1), kind: AccountKindSchema, skin: z.string().min(1), last4: z.string().regex(/^\d{4}$/).nullable(), openingBalance: Money, openingDate: LocalDateSchema, inAvailable: z.boolean(), frozen: z.boolean(), order: z.number().int().nonnegative(), archivedOn: LocalDateSchema.optional(), credit: CreditTermsSchema.nullable() })`,
    refined so that `(kind === 'credit') === (credit !== null)`. Exports `type Account`.
  - **Expense** and **Subscription:** `paymentMethod`, `cardId` and the refine go;
    `accountId: z.string().min(1)` comes in.
  - **Income:** `bucket` → `accountId: z.string().min(1)`.
  - **Transaction:** `from`/`to` → `fromAccountId` and `toAccountId`, both
    `z.string().min(1).nullable()`. `debtId` stays for loans. The rules:
    - adjustment needs `toAccountId` and an amount ≠ 0
    - transfer needs both accounts, and they must differ
    - `card_payment` needs both accounts and `debtId === null`
    - `debt_payment` needs `debtId` and `fromAccountId`
    - `investment` needs `fromAccountId`
  - **Dividend:** `bucket` → `accountId: z.string().min(1).nullable()` plus
    `reinvested: z.boolean()`.
    - skipped ⇒ amount 0, `accountId` null, `reinvested` false, `sharesAdded` null
    - confirmed ⇒ exactly one of `reinvested` or `accountId`
  - **Sale:** `to` → `toAccountId: z.string().min(1)`.
  - **Debt:** `kind: z.literal('loan')`. The other fields and `archivedOn` stay.
  - **Profile:** loses `openingCash` and `openingSavings`.
  - **Settings:**
    - gains `defaultAccountId: z.string().min(1).nullable()` (null in `defaultSettings`)
    - `reminders` loses `freeze` and `buyIt`
  - **Removed:** `PaymentMethodSchema`, `BucketSchema`, `SalaryFreezeSchema`, `BuyAskSchema`,
    `BuyDecisionSchema`, `AboutYouSchema`, `VerdictSchema`, `FactsSchema`, `ConfidenceSchema`,
    `MAX_ASK_PRICE`.
- Produces in `snapshot.ts`:
  - `TABLES` gains `'account'` (after `'settings'`) and loses `'salaryFreeze'`, `'buyDecision'`
    and `'aboutYou'`.
  - `CURRENT_SCHEMA_VERSION = 10`. `emptySnapshot` has `account: []`.
  - The `account` table is `.default([])` in `SnapshotSchema`.
  - `freshStart` empties `account` too and sets `settings.defaultAccountId` to null.
- Produces in `migrations.ts`:
  - `TABLE_STEPS: Record<number, (tables: RawTables) => RawTables>`, with
    `type RawTables = Record<string, unknown[]>`.
  - `migrateTables(tables: RawTables, fromVersion: number, steps?, tableSteps?): RawTables`.
    For each version `v` from `fromVersion + 1` to `LATEST_VERSION`, it applies the record step
    of `v` to each row, then `TABLE_STEPS[v]`. `migrateRecord` stays for single records ≤ v9.
  - `LATEST_VERSION` counts both maps.
- Produces in `upgrades/v10Accounts.ts`:
  - `upgradeToV10(tables: RawTables): RawTables`
  - `V10_DROPPED_TABLES = ['salaryFreeze','buyDecision','aboutYou'] as const`
  - `MAIN_ACCOUNT_ID`, `SAVINGS_ACCOUNT_ID`, `PASSIVE_ACCOUNT_ID`
- Produces in `accounts.ts`:
  - `archivedBy(a: Account, day: LocalDate): boolean`
  - `activeAccounts(accounts: readonly Account[], day: LocalDate): Account[]`, sorted by `order`
  - `defaultsFor(kind: AccountKind): { skin: string; inAvailable: boolean }`
  - `accountRemoval(data: DataSnapshot, accountId: string): { subscriptions: Subscription[]; archive: boolean }`.
    `archive` is true when any expense, income, transaction (from/to), dividend or sale names the
    account.
- Produces in `debts.ts`:
  - `activeDebts` and `archivedBy` for loans
  - `loanRemoval(data, debtId): { archive: boolean }`, true when a `debt_payment` names it

`upgradeToV10` mapping (the spec §6 "upgrade from v9", exactly):

| v9 | v10 |
| --- | --- |
| profile (if present) | `acct-main` (debit, opening `openingCash`, `inAvailable` true, order 0), `acct-savings` (savings, opening `openingSavings`, order 1). Both `openingDate` = profile's; `createdAt`/`updatedAt` = profile's. Profile loses the two fields |
| any row naming bucket `passive` (transaction `from`/`to`, dividend `bucket`, sale `to`) | also `acct-passive` (savings, opening 0, order 2) |
| debt `kind: 'credit_card'` | account with the same `id`, `name`, `openingBalance`, `openingDate`, `archivedOn`, kind `credit`, skin `violet`, `inAvailable` false, order 3+i, `credit` from `creditLimit→limit`, `statementDay`, `dueDay`, `payInFull`, `minimumPayment`, `interestRate`; the debt row is dropped |
| expense / subscription | `accountId = paymentMethod === 'credit_card' ? cardId : 'acct-main'` |
| income | `accountId = bucket === 'savings' ? 'acct-savings' : 'acct-main'` |
| transaction | `fromAccountId`/`toAccountId` = bucket map (`cash→acct-main`, `savings→acct-savings`, `passive→acct-passive`). `card_payment`: `toAccountId = debtId`, `debtId = null`. `debt_payment` and `investment`: `fromAccountId` = map(`from`) |
| dividend | `accountId` = map(`bucket`) unless `'reinvest'` or null; `reinvested = bucket === 'reinvest'` |
| sale | `toAccountId` = map(`to`) |
| settings | `defaultAccountId = profile ? 'acct-main' : null` |
| `salaryFreeze`, `buyDecision`, `aboutYou` | dropped |

- [ ] **Step 1: Write the failing tests:**
  - `v10Accounts.test.ts`:
    - `upgrades the demo to a valid v10 snapshot`:
      `SnapshotSchema.parse({ schemaVersion: 10, tables: upgradeToV10(v9demo.tables) })`
      doesn't throw.
    - `maps every v9 row of the edge fixture`, table-driven over the mapping rows above.
    - `creates the passive account only when something names passive`: the demo without passive
      rows has no `acct-passive`.
    - `keeps the card's id and archivedOn`: `card-b`'s account has `archivedOn: '2026-09-01'`.
    - `has no bucket accounts and a null default without a profile`.
    - `drops the three removed tables`.
    - `leaves a dangling cardId as the accountId`: an expense with `cardId: 'gone'` →
      `accountId: 'gone'`, and no throw.
  - `migrations.test.ts`: `migrateTables` runs record step 9 before table step 10, and a
    snapshot already at 10 is unchanged.
  - `entities.test.ts`: the `AccountSchema` credit refine, the transaction rules above, and the
    dividend exactly-one rule.
- [ ] **Step 2: Run:** `npx vitest run src/domain/upgrades src/domain/migrations.test.ts src/domain/entities.test.ts src/domain/snapshot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the schemas, `TABLE_STEPS[10] = upgradeToV10`, `migrateTables`, and
  `migrateSnapshot`'s use of it.** `upgradeTables` becomes a call to
  `migrateTables(raw.tables, version)`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: schema v10 — accounts replace buckets and credit-card debts`.

### Task 5: Stored rows and the account copy upgrade the same way

**Files:**
- Modify:
  - `src/data/repository.ts` (`loadAll`)
  - `src/data/storage.ts` (`RecordKey.table` becomes `string` at the storage layer, so a dropped
    table's rows can be removed)
  - `src/data/sqliteStorage.ts` and `src/data/db.ts` (types only)
- Test: `src/data/repository.test.ts`, `src/data/sqliteStorage.test.ts`

**Interfaces:**
- Consumes: `migrateTables` and `V10_DROPPED_TABLES` (Task 4).
- Produces: `loadAll()` returns v10 snapshots from v9 storage, and persists the upgrade once.

New `loadAll` order:
1. Decrypt every row, keeping rows of known tables and of `V10_DROPPED_TABLES`. A row that fails
   to decrypt is skipped as today and never removed.
2. Group the raw values by table, then run `migrateTables(raw, fromVersion)`.
3. Validate each record (invalid ones go to `skipped`).
4. When `fromVersion < 10`, write every valid record (`dataVersion: 10`) and remove the
   `(table, id)` pairs that were read but are no longer present: dropped tables and moved card
   debts.

- [ ] **Step 1: Write the failing tests** in `repository.test.ts`:
  - `upgrades v9 rows to accounts and stores them once`:
    - seed a `memoryStorage` backend with `v9-edge` rows at data version 9
    - after `loadAll`:
      - `snapshot.tables.account` has `acct-main`, `acct-savings`, `acct-passive`, `card-a` and
        `card-b`
      - the stored rows include those accounts and no `salaryFreeze`/`buyDecision`/`aboutYou`
        rows
      - there is no `debt` row with id `card-a`
      - the meta version is 10
    - a second `loadAll` writes nothing
  - `stored and copied v9 data upgrade the same`: `loadAll` on seeded `v9-edge` rows equals
    `migrateSnapshot(v9edge).tables`, compared table by table after sorting by id.
  - `leaves an undecryptable v9 row on disk`.
- [ ] **Step 2: Run:** `npx vitest run src/data/repository.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the new `loadAll` order above.**
- [ ] **Step 4: Run:** `npx vitest run src/data`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: stored data and the account copy both upgrade to accounts`.

### Task 6: Balances, bills and the finance view over accounts

**Files:**
- Modify:
  - `src/domain/balances.ts`
  - `src/domain/budget.ts`
  - `src/domain/view.ts`
  - `src/domain/income.ts`
  - `src/domain/charts.ts` (where it reads buckets or cards)
- Test:
  - `src/domain/balances.test.ts`
  - `src/domain/budget.test.ts`
  - `src/domain/view.test.ts`
  - `src/domain/upgrades/v10Balances.test.ts`

**Interfaces:**
- Consumes: `Account`, `archivedBy` and `activeAccounts` (Task 4).
- Produces in `balances.ts`:
  - `accountBalance(account: Account, data: DataSnapshot, asOf: LocalDate): number`. Events
    count from `account.openingDate` through `asOf`.
    - **Non-credit:** opening, + confirmed income to it, + transfers in, − transfers out,
      + adjustments to it, + confirmed dividends to it, + sale proceeds to it, − expenses on it,
      − `card_payment`, `debt_payment` and `investment` from it.
    - **Credit:** what is owed: opening, + expenses on it, − `card_payment` to it, + adjustments
      to it.
  - `type AccountRow = { account: Account; balance: number }`
  - `accountRows(data, asOf): AccountRow[]`: active accounts by `order`
  - `debtBalance(debt, data, asOf)`: loans only, as today minus the card branch
  - `netWorth(rows: AccountRow[], loanTotal: number, investments: number): number`: non-credit
    balances − credit owed − loans + investments
  - `Buckets` and `bucketBalances` are deleted.
- Produces in `budget.ts`:
  - `Bill` gains `accountId: string`. For a card bill it is the card's id; for a subscription,
    its account.
  - `upcomingBills(data, today, until?)` reads card bills from active credit accounts.
  - `cardPayment(data, card: Account, owed: number, today)`.
  - `availableBalance(rows: AccountRow[], bills: Bill[], reserved: number): number`: the sum of
    `inAvailable` rows, − subscription bills whose `accountId` is an `inAvailable` row, − every
    card bill, − `reserved`.
  - `cashInPocket(rows): number`: the sum of `kind === 'cash'` rows.
  - `savedTotal(rows): number`: the sum of `kind === 'savings'` rows.
- Produces in `view.ts`:
  - `FinanceView` replaces `buckets`, `debts` and `debtTotal` with:
    - `accounts: AccountRow[]`
    - `loans: Array<{ debt: Debt; balance: number }>`
    - `owed: number` (credit owed + loans)
    - `cash: number`, `saved: number`
  - It keeps `investments`, `netWorth`, `bills`, `billsTotal`, `reserved`, `available`,
    `limits`, `spending`, `pendingSalary`, `expectedSalaryThisMonth` and
    `subscriptionsMonthly`.

- [ ] **Step 1: Write the failing tests:**
  - `v10Balances.test.ts`, for `demo` and `edge`:
    - upgrade the fixture through `migrateSnapshot`
    - at `2026-10-20` assert:
      - `accountBalance(acct-main)` = `expected.cash`
      - `acct-savings` = `expected.savings`
      - `acct-passive` = `expected.passive` (0 and absent for the demo)
      - each card's balance = `expected.cards[id]`
      - each loan = `expected.loans[id]`
      - `computeFinanceView(...).netWorth` = `expected.netWorth`
  - `budget.test.ts`:
    - `available leaves savings out`
    - `a subscription on a credit card is not taken off available`
    - `a card bill is taken off available`
    - `cash in pocket sums cash accounts only`
    - `an archived card has no bill`
  - `balances.test.ts`: one case per event type in the rule above, plus `events before the
    account opened don't count`.
- [ ] **Step 2: Run:** `npx vitest run src/domain/balances.test.ts src/domain/budget.test.ts src/domain/view.test.ts src/domain/upgrades`. Expected: FAIL.
- [ ] **Step 3: Implement the functions above.**
- [ ] **Step 4: Run the same command.** Expected: PASS, with the v9 numbers equal to the cent.
- [ ] **Step 5: Commit:** `feat: balances, bills and Available are worked out per account`.

### Task 7: Finance actions over accounts

**Files:**
- Modify: `src/store/financeActions.ts`, `src/domain/sync.ts`, `src/store/appStore.ts` (the
  `freshStart` call site)
- Test: `src/store/financeActions.test.ts`, `src/domain/sync.test.ts`, `src/store/appStore.test.ts`

**Interfaces:**
- Consumes: Task 4's schemas and `accountRemoval`/`loanRemoval`; Task 6's `accountBalance`.
- Produces:
  - `ExpenseInput`, `IncomeInput` and `SubscriptionInput` use `accountId: string` instead of
    `paymentMethod`/`cardId`/`bucket`.
  - `AccountInput = { id?: string; name: string; kind: AccountKind; skin?: string; last4: string | null; openingBalance: number; inAvailable?: boolean; credit: CreditTerms | null }`.
  - `saveAccount(input: AccountInput): Promise<Account>`. A new account gets `openingDate`
    today, `order` = max + 1, `frozen` false, and the `defaultsFor(kind)` values where the input
    leaves them out.
  - `deleteAccount(id: string, opts: { moveSubscriptionsTo: string | null }): Promise<'deleted' | 'archived'>`:
    - Its subscriptions move to `moveSubscriptionsTo`. It throws `'Pick where its subscriptions
      go.'` when it has some and that is null.
    - It archives (`archivedOn` today) when `accountRemoval(...).archive` is true, and removes it
      otherwise, in one `putMany`.
    - When it was the default, `defaultAccountId` becomes `defaultAccount(data)` after the change.
  - `transfer(fromAccountId, toAccountId, amount, date, note): Promise<Transaction>`. It throws
    `'Use two different accounts.'`, and `'Only a bank account, cash or savings can pay.'` when
    either is credit.
  - `payCard(cardId: string, fromAccountId: string, amount: number, date: LocalDate)` writes a
    `card_payment`. It replaces `payDebt` for cards.
  - `payDebt(loanId, fromAccountId, amount, date)` writes a `debt_payment`.
  - `contributeToGoal(goalId, amount, date, fromAccountId, toAccountId)`.
  - `setActualBalance(accountId: string, actual: number, date: LocalDate)`.
  - `saveDebt` and `deleteDebt` are loans only, and `deleteDebt` archives via `loanRemoval`.
  - `completeOnboarding(input: OnboardingInput)`, same input as today, creates:
    - `acct-main` (debit, opening `openingCash`)
    - `acct-savings` (savings, opening `openingSavings`)
    - one credit account per `CardInput` (`newId()`, `credit.limit = creditLimit`, `dueDay`,
      `payInFull`, `minimumPayment` 0, `interestRate` 0)
    - `settings.defaultAccountId = 'acct-main'`
  - In `src/domain/accounts.ts`: `defaultAccount(data: DataSnapshot, today: LocalDate): Account | null`
    returns the settings' default if it is active and not credit. Otherwise it returns the first
    active debit or cash account by `order`, else null.
  - `sync.ts dueGenerated`:
    - a subscription's renewal expense gets `accountId: sub.accountId`
    - an expected salary gets `accountId: defaultAccount(data, today)?.id`, and no salary is
      generated when that is null

- [ ] **Step 1: Write the failing tests:**
  - `deleteAccount` moves subscriptions, archives with history, removes without it, and refuses
    with no target.
  - `deleting the default account moves the default`.
  - `default account falls back`: the default archived → the first active debit/cash; none →
    null, and `dueGenerated` makes no salary.
  - `transfer` refuses a credit account and the same account twice.
  - `payCard` lowers what the card owes and what the source holds.
  - `setActualBalance` on a credit account changes what it owes by the delta.
  - `completeOnboarding` creates the accounts and the default.
  - `freshStart` leaves no accounts.
- [ ] **Step 2: Run:** `npx vitest run src/store/financeActions.test.ts src/domain/sync.test.ts src/store/appStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the actions above.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: every money action names an account`.

### Task 8: Invest actions over accounts

**Files:**
- Modify: `src/store/investActions.ts`
- Test: `src/store/investActions.test.ts`

**Interfaces:**
- Produces:
  - `HoldingInput.paidFrom: 'owned' | string`, where the string is a non-credit account id.
  - `SaleInput.toAccountId: string`, replacing `to`.
  - `DividendInput.to: 'reinvest' | { accountId: string }`, replacing `bucket`.
  - Credit accounts are refused with `'Only a bank account, cash or savings can pay.'`.

- [ ] **Step 1: Write the failing tests:**
  - Adding a holding paid from `acct-savings` writes an `investment` with
    `fromAccountId: 'acct-savings'`.
  - Selling to `acct-main` writes `toAccountId`.
  - Confirming to `{ accountId }` sets `accountId`, and `'reinvest'` sets `reinvested` and
    `sharesAdded`.
  - Paying from a credit account throws.
- [ ] **Step 2: Run:** `npx vitest run src/store/investActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: investing pays from and into accounts`.

### Task 9: Demo data, worked examples and test helpers on accounts

**Files:**
- Modify:
  - `src/data/demoSeed.ts`
  - `src/domain/examples.ts`
  - `src/test/fixtures.ts`
  - `src/test/testWorld.ts`
  - `src/test/appStoreStub.tsx`
- Test:
  - `src/data/demoSeed.test.ts`
  - `src/domain/examples.test.ts`
  - `src/content/help/help.test.ts`

**Interfaces:**
- Produces:
  - `makeAccount(overrides?: Partial<Account>): Account`. The default is `acct-main`, debit.
  - `makeExpense`, `makeIncome` and `makeSubscription` default `accountId` to `'acct-main'`.
  - `makeProfile` has no opening fields.
  - The demo has Main account, Savings, a Cash wallet (`acct-cash`, cash, 18625) and the card
    `CARD_ID` as a credit account. About 30% of expenses are on the card and about 20% on the
    Cash wallet.

- [ ] **Step 1: Update the tests:**
  - `demoSeed.test.ts`:
    - the demo has four accounts
    - every expense's `accountId` is one of them
    - Available and every non-credit balance are ≥ 0 on `buildDemoSnapshot('2026-10-20')`
  - The examples tests keep their worked numbers.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run:** `npx vitest run src/data src/domain/examples.test.ts src/content`. Expected: PASS.
- [ ] **Step 5: Commit:** `test: demo, examples and helpers use accounts`.

### Task 10: AccountField and the add/edit forms

**Files:**
- Create: `src/features/shared/AccountField.tsx`
- Delete: `src/features/shared/PaidWithField.tsx`, `src/features/shared/paidWith.ts`
- Modify:
  - `src/features/add/ExpenseForm.tsx`
  - `src/features/add/IncomeForm.tsx`
  - `src/features/add/AddScreen.tsx`
  - `src/features/subscriptions/SubscriptionDialog.tsx`
  - `src/features/subscriptions/SubscriptionsScreen.tsx`
- Test: `src/features/add/add.test.tsx`, `src/features/subscriptions/subscriptions.test.tsx`

**Interfaces:**
- Consumes: `activeAccounts` and `defaultAccount` (Task 4, Task 7).
- Produces:
  - `useAccountOptions(filter?: (a: Account) => boolean): Array<{ value: string; label: string }>`:
    the active accounts by `order`. A credit account's label is `"<name> (credit card)"`.
  - `AccountField(props: { label: string; value: string; onChange(id: string): void; filter?: (a: Account) => boolean; error?: string })`:
    the existing `Select`, `variant="line"`.
- The expense form starts on `defaultAccount`, with the label "Paid with". The income form uses
  "Goes to" with `filter: a => a.kind !== 'credit'`. A subscription uses "Paid with".

- [ ] **Step 1: Update the tests:**
  - The expense form lists Main account, Savings and "Visa (credit card)", and an archived
    account isn't listed.
  - Saving writes the chosen `accountId`.
  - The income form doesn't list credit cards.
  - A subscription saves its `accountId`.
- [ ] **Step 2: Run:** `npx vitest run src/features/add src/features/subscriptions`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: one account picker for expenses, income and subscriptions`.

### Task 11: Cards, loans and goals screens on accounts

**Files:**
- Modify:
  - `src/features/goals/CardSheet.tsx`
  - `src/features/goals/PayDialog.tsx`
  - `src/features/goals/DebtsScreen.tsx`
  - `src/features/goals/GoalsScreen.tsx` (contribute)
  - `src/app/useMenuSubtitles.ts`
  - `src/domain/notifications.ts` (card due reminders from credit accounts)
- Split `src/features/goals/DebtDialog.tsx` into:
  - `src/features/goals/CardDialog.tsx`: `saveAccount` with kind `credit`. Delete calls
    `deleteAccount` and, when the card pays subscriptions, shows an `AccountField` labelled
    "Move its subscriptions to", defaulting to `defaultAccount`.
  - `src/features/goals/LoanDialog.tsx`: `saveDebt`/`deleteDebt`.
- Test:
  - `src/features/goals/goals.test.tsx`
  - `src/features/goals/CardSheet.test.tsx`
  - `src/domain/notifications.test.ts`
  - `src/app/nav.test.tsx`

**Interfaces:**
- Consumes: `saveAccount`, `deleteAccount`, `payCard`, `payDebt` and `contributeToGoal` (Task 7),
  and `AccountField` (Task 10).
- `CardSheet` takes `accountId: string | null`, replacing `debtId`. Its callers in
  `BillsSection` and `DebtsScreen` pass the card's account id.

- [ ] **Step 1: Update the tests:**
  - The Debts screen lists cards from accounts and loans from debts.
  - Paying a card from "Savings" lowers both.
  - Deleting a card that pays a subscription asks where it goes, and moves it.
  - Deleting a card with history archives it ("archived" toast as in 0.9).
  - A goal contribution moves Main account → Savings by default.
  - Card due reminders come from credit accounts.
- [ ] **Step 2: Run:** `npx vitest run src/features/goals src/domain/notifications.test.ts src/app/nav.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: cards are accounts on the cards, loans and goals screens`.

### Task 12: Home, History, investing dialogs and setup on accounts

**Files:**
- Modify:
  - `src/features/dashboard/AvailableSheet.tsx`
  - `src/features/dashboard/NetWorthSection.tsx`
  - `src/features/dashboard/NetWorthSheet.tsx`
  - `src/features/dashboard/BillsSection.tsx`
  - `src/features/history/ActualBalanceDialog.tsx`
  - `src/features/history/HistoryScreen.tsx`
  - `src/features/invest/ConfirmDividendDialog.tsx`
  - `src/features/invest/SellDialog.tsx`
  - `src/features/invest/HoldingDialog.tsx`
  - `src/features/income/IncomeScreen.tsx` (if it names buckets)
  - `src/features/onboarding/OnboardingWizard.tsx`
- Test:
  - `src/features/dashboard/breakdown.test.tsx`
  - `src/features/dashboard/dashboard.test.tsx`
  - `src/features/history/history.test.tsx`
  - `src/features/invest/*.test.tsx`
  - `src/features/onboarding/onboarding.test.tsx`

**Interfaces:**
- Consumes: `FinanceView` (Task 6), `setActualBalance(accountId, …)` (Task 7), `AccountField`
  (Task 10).
- **AvailableSheet** rows, top to bottom:
  - each `inAvailable` account, with "Correct" opening `ActualBalanceDialog` for it
  - "Bills still to come this month", from those accounts
  - "Card payments due"
  - "Reserved for limits"
  - "= Available to spend"

  The rows add up to `view.available` exactly.
- **NetWorthSheet:** accounts grouped by kind (savings, debit/cash, then credit as owed), loans,
  investments, total = `view.netWorth`.
- **`ActualBalanceDialog`** takes `accountId` (an `AccountField` when it's opened without one).
- **History** lines:
  - income: "to <account name>"
  - dividend: "To <account name>" or "Reinvested"
  - transfer: "<from> → <to>"
  - card payment: "<from> → <card>"
- **Setup** passes the same `OnboardingInput`. Its "What you have now" step labels become "In
  your bank account" (openingCash) and "In savings" (openingSavings).

- [ ] **Step 1: Update the tests:**
  - The Available sheet's rows add to the hero figure, and a credit-card subscription isn't in
    "Bills still to come".
  - Correcting Savings writes an adjustment to `acct-savings`.
  - History shows "Main account → Savings".
  - A dividend confirmed to Savings reads "To Savings".
  - Setup creates Main account and Savings.
- [ ] **Step 2: Run:** `npx vitest run src/features`. Expected: FAIL in the files above.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run:** `npx vitest run src/features`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Home, History, investing and setup read accounts`.

### Task 13: End-to-end, version 0.10 and the phone check

**Files:**
- Modify:
  - `tests/e2e/*.spec.ts` (finance, demo, onboarding, invest, inbox, navigation, a11y, smoke,
    account)
  - `android/app/build.gradle` (`versionName "0.10"`, `versionCode 10`)
- Create: `docs/superpowers/reviews/2026-10-21-redesign-p1-decisions.md`

- [ ] **Step 1: Update the e2e specs** to pick accounts where they picked "Paid with" or a
  bucket. Remove the steps that visit Buy it or Salary freeze.
- [ ] **Step 2: Run everything:** `npm run typecheck && npm run lint && npm test && npm run test:e2e`.
  Expected: all PASS. Fix anything red before going on.
- [ ] **Step 3: Raise the version and commit:** `chore: version 0.10 (versionCode 10) for the cards model`.
- [ ] **Step 4: Phone check with the owner.**
  - **Before installing**, the owner reads on 0.9:
    - Home → Available sheet: Cash and Savings
    - Net worth sheet: the total
    - Bills & cards: what each card owes
  - **Install:** `JAVA_HOME='C:\Users\bhcco\.jdks\temurin-21.0.12.1' npm run android:run`.
  - **After installing**, the owner confirms:
    - Main account = old Cash, Savings = old Savings, each card the same, net worth the same
    - Buy it, About you and Salary freeze are nowhere
    - adding an expense on a card and paying the card work
- [ ] **Step 5: Write the decisions doc:**
  - the rulings made while building
  - the v10 mapping as built
  - the owner's check results
  - the Available change (P2 and the credit-card subscription change)

  Commit: `docs: redesign phase 1 decisions and the phone check`.
- [ ] **Step 6: Push the branch and open the PR to `main`** with `& "C:\Program Files\GitHub CLI\gh.exe" pr create`.
- [ ] **Step 7: Ask the owner before redeploying** the service without `/api/extract`
  (`npx vercel --prod`). Deploy only on a yes.
