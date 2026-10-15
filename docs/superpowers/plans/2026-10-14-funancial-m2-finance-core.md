# Funancial M2 (Finance Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Funancial usable day to day for real money:
- onboarding;
- a dashboard with available balance and net worth;
- adding expenses and income, with limit warnings at 80/100/120%;
- budgets and limits, subscriptions, salary freezes, goals and debts (with credit cards and "Pay card");
- history, "Set actual balance", and CSV export.

**Architecture:**
- All money math lives in pure, unit-tested `src/domain/*` modules. Every Part 4 rule has a worked example as data (`domain/examples.ts`), asserted by Vitest and rendered by Help in M7.
- A pure `computeFinanceView(data, today, weekStartsOn)` produces everything the screens show.
- `createFinanceActions(store)` builds and persists entities.
- A pure "sync" step materializes due subscription charges and expected salary on unlock and when the app regains focus.

**Tech Stack:** as M0+M1 (React 19, TS 6, Vite 8, Tailwind 4, zustand, Dexie, zod 4, Vitest 5, Playwright). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-funancial-design.md` (product spec `docs/spec/original-spec.md`; visual rules `docs/design/visual-direction.md` — direction **D · Pro Ledger**, chosen in round 2; mockup `design/directions-v2/index.html`). Builds on `docs/superpowers/plans/2026-10-14-funancial-m0-m1-foundation-data.md`.

## Global Constraints

- Everything in the M0+M1 plan's Global Constraints still holds: exact pins, TS 6.0.3, strict, no `any`, `@/` alias, no runtime CDN, `safeStorage` only, crypto parameters, American English, accessibility rules, commit trailer.
- Branch `feat/m2-finance-core`, stacked on `feat/m0-m1-foundation` (not yet merged).
- **Money:**
  - Totals are integer minor units.
  - Display uses `formatMoney` with the profile currency and `navigator.language`.
  - Input uses `parseMoney`; components never do arithmetic on money themselves.
- **Calculation rules (design "Calls I made" + "Calculation interpretations"):**
  - Budget periods are calendar months; weeks start on `settings.weekStartsOn` (default Monday = 1).
  - **Cash** = `openingCash` + confirmed income to cash − expenses paid `cash`/`debit`/`other` ± transfers ± adjustments − card/debt payments from cash.
    - Only events with `openingDate ≤ date ≤ today` count.
    - Credit-card expenses never touch cash; they raise that card's balance.
  - **Card balance** = `openingBalance` + card expenses − `card_payment`s. **Loan balance** = `openingBalance` − `debt_payment`s.
  - **Net worth** = cash + savings + passive (+ investments, 0 until M5) − Σ debt balances.
  - **Available balance** = cash + savings − upcoming bills − reserved limits.
    - **Upcoming bills:**
      - active subscription renewals from today through the end of this month;
      - for each credit card with a balance > 0: the full balance if `payInFull`, else `min(minimumPayment, balance)`.
    - **Reserved** = Σ over limits with `reserve`: max(0, limit − spent this period).
  - **Limits** count every expense dated in the period (including subscription charges and card expenses) by category, or all of them for the overall limit.
    - Level by thresholds [80, 100, 120]: `ok` < 80 ≤ `warn` < 100 ≤ `over` < 120 ≤ `way-over`.
  - **Salary:**
    - On or after the pay day (clamped to month length) of each month from the opening month to today, an `expected` salary Income is created if none exists for that month.
    - Its amount = monthly − frozen amount allocated to that month.
    - The user confirms the received amount (status `confirmed`). Expected income never counts in cash.
  - **Freeze:**
    - computed mode: per affected month, `round(monthly × frozenDaysInMonth / daysInMonth)`;
    - manual mode: the entered amount split across months by days, with the remainder going to the last month.
    - Bills still apply.
  - **Subscriptions:**
    - Each renewal on or before today becomes an Expense with id `sub-<subscriptionId>-<date>` (idempotent).
    - `nextRenewal` then advances by cycle, keeping the original day of month (`anchorDay`) so a 31st subscription doesn't drift to the 28th.
  - **Recurring expenses:** "Repeats" on Add Expense creates a Subscription (the recurring-bill engine) and links the first expense to it.
  - **Expense dates:** no later than today (no future-dated expenses in M2).
- **Styling follows `docs/design/visual-direction.md` (Pro Ledger).**
  - No box cards on screens: sections are separated by hairlines and whitespace, and boxes are only for dialogs, menus, toasts and the floating tab bar.
  - Primary buttons are ink pills.
  - Green `accent` is for fills and positive values; violet is the game layer.
  - Charts use `--chart-*`.
  - Screens use `Section` (Task 0), not `Card`.
- **Warning copy** is fixed below in Task 9 and used verbatim.
- **Schema v2:**
  - `Subscription` gains `anchorDay: 1–31`.
  - The v1→v2 migration sets it from `nextRenewal`'s day.
  - Backups and stored rows from v1 are migrated on read.

## Review Focus

1. **Money typed in different shapes** ("1,234.50", "12,5", "1.234,56", "¥1,234", " 12 ") and junk ("12.345", "abc", "-5", "1e3") is parsed correctly or rejected with a message, never silently 100× off. Task 3.
2. **Month ends and leap years:**
   - pay day 31 in February / September;
   - a subscription on the 31st;
   - a freeze spanning a month boundary.
   All clamp correctly with no drift. Tasks 4, 7, 8.
3. **Dated edge cases:**
   - an expense dated before the opening date leaves balances unchanged;
   - a future date is refused at entry;
   - an expense in last month doesn't trigger this month's limit warning.
   Tasks 5, 9, 13.
4. **App left open across midnight or a month change:** `today` refreshes on focus, due subscriptions and salary materialize, and periods roll over. Task 8.
5. **Deleting something that history points at** (a card with expenses or payments, a loan with payments) is refused with an explanation instead of silently erasing money from balances. Deleting a subscription or goal keeps its past expenses and transfers. Tasks 9, 17.

---

## File map (new and changed)

```
src/domain/
  money.ts            parseMoney, formatMoney, minorDigits
  periods.ts          day/week/month/year ranges, monthKey, endOfMonth, daysInMonth
  recurrence.ts       nextOccurrence (anchored), monthlyEquivalent
  balances.ts         bucketBalances, debtBalance, netWorth
  budget.ts           limitStatus, upcomingBills, reservedTotal, availableBalance, spendingSummary, limitLabel
  salary.ts           freezeLoss, freezeAllocation, expectedSalary, payDate
  sync.ts             dueGenerated (subscription charges, expected salary)
  alerts.ts           limitAlerts, crossesOver, limitMessage
  view.ts             computeFinanceView
  examples.ts         worked examples (data) for each Part 4 rule
  migrations.ts       per-record migrations v1→v2
src/data/csv.ts       expensesToCsv
src/store/financeActions.ts  createFinanceActions + useFinanceActions
src/store/useFinance.ts      useFinanceView, useToday, useMoney, useCurrency
src/lib/toast.ts             toast store; src/components/ui/Toaster.tsx
src/lib/useAction.ts         run async UI actions with error toasts
src/components/ui/ MoneyField, Select, Switch, ProgressBar, PageHeader, EmptyState, ErrorBoundary
src/features/onboarding/OnboardingWizard.tsx (+ steps)
src/features/dashboard/DashboardScreen.tsx
src/features/add/AddScreen.tsx, ExpenseForm.tsx, IncomeForm.tsx
src/features/budget/BudgetScreen.tsx, LimitDialog.tsx
src/features/subscriptions/SubscriptionsScreen.tsx, SubscriptionDialog.tsx
src/features/freeze/FreezeScreen.tsx
src/features/goals/GoalsScreen.tsx, GoalDialog.tsx, DebtDialog.tsx, PayDialog.tsx
src/features/history/HistoryScreen.tsx, ActualBalanceDialog.tsx
src/features/settings/ProfileSection.tsx, PreferencesSection.tsx
tests/e2e/onboarding.spec.ts finance.spec.ts (helpers.ts updated)
```

---

### Task 0: Restyle to "Pro Ledger" (user-chosen direction D)

**Files:**
- Modify:
  - `package.json`: add `@fontsource-variable/manrope@5.3.0`; remove `@fontsource-variable/nunito` and `@fontsource/pixelify-sans`;
  - `src/styles/tokens.css`, `src/styles/index.css`: Manrope only, no dot texture;
  - in `src/components/ui/`: `Button`, `Card`, `TextField`, `Dialog`, `Banner`, `RadioGroup`;
  - in `src/app/`: `Sidebar`, `BottomTabs`, `QuickAddButton`, `NotFound`;
  - every screen that uses `font-display` or `Card` for page layout: Welcome, Lock, StorageUnavailable, BootSplash, Placeholder, Settings sections.
- Create: `src/components/ui/Section.tsx` (+ test in `ui.test.tsx`), `src/styles/tokens.test.ts`.

**Interfaces:**
- **Tokens:** exactly the table in `docs/design/visual-direction.md`.
  - Token names kept from M1: `bg`, `surface`, `surface-2`, `text`, `text-muted`, `border`, `border-strong`, `primary`, `primary-contrast`, `xp`, `xp-text`, `success`, `warning`, `danger`, `focus`.
  - Added: `overlay`, `track`, `accent`, `accent-text`, `chart-1`..`chart-6`.
  - Removed: `primary-shade`, `xp-light`, `xp-shade`, `texture`.
- **`Section`:**
  - props `{ title?: string; action?: ReactNode; children: ReactNode; className?: string }`;
  - renders `<section aria-labelledby>` with an h2 (14px, 800) and the action at the right;
  - vertical padding 24px, `border-b border-border` (last one none).
- **`Button`:** pill (`rounded-full`), no pressable edge.
  - primary = `bg-primary text-primary-contrast`;
  - secondary = transparent with a 1px `border-border-strong`;
  - ghost = text only;
  - danger = `bg-danger` with white text.
  - Sizes as before.
- **`Card`:** `bg-surface-2 rounded-lg p-5`, no border or shadow. Only for grouped content inside a page (e.g. the Welcome and Lock panels).
- **`TextField` and other inputs:** `h-11 rounded-md border border-border-strong bg-transparent`; the error border is `danger`.
- **`Dialog`:** `bg-overlay rounded-lg` with a large soft shadow, no border; backdrop `bg-black/40`.
- **`Banner`:** a flat `bg-surface-2 rounded-md` row with a 3px left bar in the tone color; `demo` uses `xp`.
- **`RadioGroup`:** a segmented control on a `surface-2` pill track; the selected segment is `bg-overlay` with a soft shadow; native radios are visually hidden but focusable.
- **Navigation:**
  - `Sidebar` is 210px wide, with a logo ("Fun" + "ancial" in `accent-text`) and icon + label links; active = `bg-surface-2 text-text`; right hairline.
  - `BottomTabs` is a floating bar: `fixed`, 10px from the bottom and sides plus the safe area, `rounded-lg bg-overlay` with a shadow, active tab `text-accent-text`.
  - `QuickAddButton` is a 56px ink circle (`bg-primary text-primary-contrast`).
- **Fonts:** headings use `font-extrabold` Manrope, and `font-display` is removed from the codebase.
- **Game HUD strip:** not built until M4 (no fake XP).

- [ ] **Step 1: Write failing tests:**
  - `ui.test.tsx` "Section is labelled by its title and shows its action";
  - `src/styles/tokens.test.ts` (node env): read `tokens.css` as text and assert it defines `--color-accent-text: #007a55` and `--color-chart-6: #008300` and contains no `Pixelify`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement the restyle.** Behavior and accessible names are unchanged, so the existing unit and e2e tests must keep passing untouched.
- [ ] **Step 4: Run `npm run typecheck && npm run lint && npm test && npm run test:e2e`.** Expected: PASS.
- [ ] **Step 5: Manual check in the browser pane** against mockup D at 375px and 1280px, light and dark: Welcome, Lock, the shell and Settings.
- [ ] **Step 6: Commit** `style: restyle to Pro Ledger — flat sections, ink pills, Manrope, floating tab bar`.

### Task 1: Schema v2, record migrations, putMany, refresh across tabs

**Files:**
- Create: `src/domain/migrations.ts` (+ `migrations.test.ts`).
- Modify:
  - `src/domain/entities.ts` (Subscription `anchorDay`);
  - `src/domain/snapshot.ts` (`CURRENT_SCHEMA_VERSION = 2`; `migrateSnapshot` applies record migrations);
  - `src/data/repository.ts` and `webRepository.ts` (`putMany`, migrate-on-load);
  - `src/data/demoSeed.ts` (`anchorDay`);
  - `src/test/fixtures.ts`;
  - `src/store/appStore.ts` (`putMany`, `refresh`, `'data'` broadcast);
  - `src/lib/broadcast.ts` (reason `'data'`);
  - `src/main.tsx` (`'data'` → `refresh()` instead of reload).

**Interfaces:**
- `SubscriptionSchema` adds `anchorDay: z.number().int().min(1).max(31)`.
- **`migrations.ts`:**
  - `migrateRecord(table: TableName, raw: unknown, fromVersion: number): unknown` applies each step from `fromVersion + 1` to `CURRENT_SCHEMA_VERSION`.
  - The v2 step for `subscription` sets `anchorDay = Number(nextRenewal.slice(8, 10))` when missing.
- **`migrateSnapshot(raw)`:** for `schemaVersion < 2` it maps every row through `migrateRecord`, sets `schemaVersion: 2`, then parses. It still throws `SchemaVersionError` for versions above current.
- **`snapshot.ts`** exports `type TableRecord = { [K in TableName]: { table: K; record: EntityOf<K> } }[TableName]`. It lives in the domain so the pure sync engine can return it.
- **Repository:**
  - `putMany(items: TableRecord[]): Promise<void>` validates all, encrypts all, then one transaction.
  - **`loadAll`:**
    - reads meta `'dataVersion'` (absent ⇒ 1);
    - runs `migrateRecord` before validating;
    - if the version was below current, re-writes every row it loaded and sets `dataVersion = CURRENT_SCHEMA_VERSION` in one transaction;
    - skipped rows are left untouched.
  - `replaceAll` also writes `dataVersion = CURRENT_SCHEMA_VERSION`.
- **Store:**
  - `putMany(items: TableRecord[]): Promise<void>`;
  - `refresh(): Promise<void>` reloads data from the repository when unlocked;
  - `put`/`putMany`/`remove` post `{ type: 'reload', reason: 'data' }`.
- **`main.tsx`:** a `'data'` message calls `appStore.getState().refresh()`; every other reason still reloads the page.

- [ ] **Step 1: Write failing tests**
  - `migrations.test.ts`:
    - `migrateRecord('subscription', v1SubWithNextRenewal('2026-11-30'), 1)` has `anchorDay: 30`;
    - other tables pass through unchanged;
    - `fromVersion 2` is the identity.
  - `snapshot.test.ts`: `migrateSnapshot({ schemaVersion: 1, tables: { …, subscription: [v1Sub] } })` returns `schemaVersion 2` and a sub with `anchorDay`.
  - `webRepository.test.ts`:
    - "migrates v1 rows on load and stamps dataVersion": write an encrypted v1 subscription row directly and set meta `dataVersion` to 1 → `loadAll` returns `anchorDay`, meta `dataVersion` is 2, and the stored row decrypts to the v2 shape;
    - "putMany writes all or nothing" (one invalid ⇒ rejects, count unchanged).
  - `backup.test.ts`: a v1 backup (made by `createBackup` of a v1-shaped snapshot cast) restores with `anchorDay`.
  - `appStore.test.ts`:
    - "put posts a data change";
    - "refresh picks up another tab's write": two stores on the same db; A puts; `B.refresh()` → B sees it.
- [ ] **Step 2: Run `npm test`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Update `demoSeed` (`anchorDay` = each sub's `day`) and the fixtures (`makeSubscription` `anchorDay` = day of `nextRenewal`).
  - Update the `SyncMessage` reasons to include `'data'`.
- [ ] **Step 4: Run `npm test && npm run typecheck && npm run lint`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: schema v2 with record migrations, putMany, and cross-tab data refresh`.

### Task 2: Review leftovers from M1

**Files:**
- Create: `src/lib/toast.ts`, `src/components/ui/Toaster.tsx`, `src/lib/useAction.ts`, `src/components/ui/ErrorBoundary.tsx` (tests beside each).
- Modify:
  - `src/data/keys.ts` (NFC);
  - `src/store/appStore.ts` (`createBackup` records the date after encrypting, best-effort);
  - `src/data/backup.ts` (wrong-passphrase copy);
  - `src/features/settings/DataSection.tsx` (`accept=".funbak"` only, skipped-rows banner);
  - `src/app/Root.tsx` (ErrorBoundary, Toaster, router disposal);
  - `src/features/lock/useAutoLock.ts` (wheel/scroll/touchstart);
  - `src/features/lock/LockScreen.tsx` (clear the old error when a countdown ends);
  - `index.html` (inline theme script);
  - `WelcomeScreen`, `LeaveDemoButton`, `EraseDialog`, `SecretDialog` (use `useAction`).

**Interfaces:**
- **`toast.ts`:**
  - `type Toast = { id: number; tone: 'info' | 'success' | 'warning' | 'danger'; message: string }`;
  - `toast(tone, message): void`;
  - `useToasts(): Toast[]`;
  - `dismiss(id)`.
  - Toasts auto-dismiss after 6000 ms, and at most 3 are shown.
- **`Toaster`:** a region `aria-live="polite"` (danger toasts get `role="alert"`), fixed above the bottom tabs, each with a "Dismiss" button.
- **`useAction()`:** returns `run(fn: () => Promise<unknown>, opts?: { success?: string }): Promise<boolean>`. It catches errors, shows `toast('danger', message)`, and returns false.
- **`ErrorBoundary`:** shows the heading "Something went wrong" and a "Reload" button.
- **`deriveKey`:** uses `secret.normalize('NFC')`.
- **`readBackup` decryption-failure message:** `"That passphrase didn't open this backup. Check it, or the file may be damaged."`
  - It is still `WrongSecretError`, but constructed with this message (add an optional message parameter).
  - The lock screen's copy is unchanged.
- **`Root`:** the unlocked router is created per mount and disposed in a `useEffect` cleanup.
- **`useAutoLock`:** also resets on `wheel`, `scroll` (capture, passive) and `touchstart`.
- **`index.html`:** an inline `<script>` before the module sets `data-theme` from `localStorage['funancial.theme']` and `prefers-color-scheme`, inside try/catch.
- **`DataSection`:** when `skipped.length > 0`, a warning Banner reads `"{n} saved items couldn't be read and are hidden. They're still kept on this device."`

- [ ] **Step 1: Write failing tests**
  - `toast.test.ts`: `toast` adds an item; it is auto-removed after 6000 ms (fake timers); the 4th toast drops the oldest.
  - `useAction.test.tsx`: a rejected fn shows a danger toast with the error message and returns false; success returns true and shows the success text.
  - `ErrorBoundary` renders the fallback when a child throws.
  - `keys.test.ts`: a vault set with `'café'` (NFC) unlocks with `'café'` (NFD).
  - `backup.test.ts`: the wrong-passphrase message equals the new copy.
  - `appStore.test.ts`: "createBackup still returns the file when saving lastBackupAt fails" — after `freshStore()`, replace `put` in state with `vi.fn().mockRejectedValue(new Error('quota'))` via `store.setState`; `createBackup` resolves with a dated file name.
  - `lock.test.tsx`: "useAutoLock resets on wheel"; "locks on return after being hidden longer than the timeout" (stub `document.visibilityState`).
  - `settings.test.tsx`: the skipped banner shows `"2 saved items couldn't be read…"` when `skipped` has 2.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement**, and wire `useAction` into Welcome, LeaveDemoButton, EraseDialog and SecretForm (no more silent failures).
- [ ] **Step 4: Run `npm test && npm run typecheck && npm run lint && npm run test:e2e`.** Expected: PASS.
- [ ] **Step 5: Commit** `fix: M1 review leftovers — toasts, error boundary, NFC, backup ordering, auto-lock activity, theme flash`.

### Task 3: Money parsing and formatting, MoneyField

**Files:**
- Create: `src/domain/money.ts` (+ test), `src/components/ui/MoneyField.tsx` (+ test), `src/store/useFinance.ts` (only `useCurrency` and `useMoney` in this task; + test).

**Interfaces:**
- `minorDigits(currency: string): number`, via `Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`; USD 2, JPY 0.
- `parseMoney(input: string, currency: string): number | null`. The rules:
  1. Trim, and drop currency symbols, letters and spaces. Empty or a `-` anywhere ⇒ null.
  2. If both `.` and `,` appear, the last one is the decimal mark and the other is grouping.
  3. If only one appears once, and 1..`minorDigits` digits follow it at the end ⇒ decimal mark. If exactly 3 digits follow ⇒ grouping.
  4. Several of the same mark ⇒ grouping, and every group after the first must be 3 digits.
  5. More fraction digits than `minorDigits` ⇒ null (for JPY, any decimal ⇒ null).
  6. Result must be ≤ 1_000_000_000_00 minor units, else null. Exponents (`e`) ⇒ null.
- `formatMoney(minor: number, currency: string, locale?: string, opts?: { signDisplay?: 'auto' | 'always' | 'exceptZero' }): string`.
- `MoneyField`:
  - props `{ label: string; value: number | null; onChange(v: number | null): void; currency: string; hint?: string; error?: string; autoFocus?: boolean; id?: string }`;
  - keeps the raw text, uses `inputMode="decimal"`, and shows the currency symbol as a prefix;
  - on blur it reformats valid input to the plain form (e.g. `1234.5` → `1,234.50`), and invalid input shows the error `"Enter an amount like 12.50"`.
- `useCurrency(): string` returns `profile.currency ?? 'USD'`; `useMoney(): (minor: number, opts?) => string`.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ['12.50', 'USD', 1250], ['12,5', 'USD', 1250], ['1,234.56', 'USD', 123456], ['1.234,56', 'EUR', 123456],
  ['1,234', 'USD', 123400], ['1.234.567', 'EUR', 123456700], [' $ 12 ', 'USD', 1200], ['0.99', 'USD', 99],
  ['¥1,234', 'JPY', 1234], ['1234', 'JPY', 1234],
])('parses %s %s → %d', (input, cur, minor) => expect(parseMoney(input, cur)).toBe(minor));
it.each(['', 'abc', '-5', '12.345', '1,23,4', '1e3', '12.5', '99999999999999'])('rejects %s', (input) =>
  expect(parseMoney(input, input === '12.5' ? 'JPY' : 'USD')).toBeNull());
expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56');
expect(formatMoney(1234, 'JPY', 'en-US')).toBe('¥1,234');
expect(formatMoney(-500, 'USD', 'en-US', { signDisplay: 'always' })).toBe('-$5.00');
// MoneyField: typing "12,5" then blur → onChange(1250), field shows "12.50"; typing "abc" + blur → error text, onChange(null)
```

- [ ] **Step 2: Run `npm test -- money MoneyField`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: locale-tolerant money parsing, formatting and MoneyField`.

### Task 4: Periods and recurrence

**Files:**
- Create: `src/domain/periods.ts`, `src/domain/recurrence.ts` (+ tests).

**Interfaces:**
- **`periods.ts`:**
  - `type Range = { start: LocalDate; end: LocalDate }` (inclusive);
  - `dayRange(d)`, `weekRange(d, weekStartsOn: 0 | 1)`, `monthRange(d)`, `yearRange(d)`;
  - `periodRange(kind: 'weekly' | 'monthly', d, weekStartsOn)`;
  - `inRange(d, r): boolean`;
  - `monthKey(d): string` (`YYYY-MM`);
  - `endOfMonth(d)`;
  - `daysInMonth(year: number, month1to12: number)`;
  - `dayOfMonth(d): number`;
  - `monthsBetween(fromKey, toKey): string[]` (inclusive keys).
- **`recurrence.ts`:**
  - `nextOccurrence(d: LocalDate, cycle: Cycle, anchorDay: number): LocalDate`:
    - weekly: +7 days;
    - monthly, quarterly, yearly: +1, +3, +12 months, on `min(anchorDay, daysInMonth)` of the target month.
  - `monthlyEquivalent(amount: number, cycle: Cycle): number` = round(weekly × 52/12 | monthly × 1 | quarterly ÷ 3 | yearly ÷ 12).

- [ ] **Step 1: Write the failing tests**

```ts
expect(weekRange('2026-10-14', 1)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
expect(weekRange('2026-10-14', 0)).toEqual({ start: '2026-10-11', end: '2026-10-17' });
expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
expect(monthRange('2028-02-10').end).toBe('2028-02-29');
expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
expect(nextOccurrence('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
expect(nextOccurrence('2026-11-30', 'quarterly', 30)).toBe('2027-02-28');
expect(nextOccurrence('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
expect(nextOccurrence('2026-12-29', 'weekly', 29)).toBe('2027-01-05');
expect(monthlyEquivalent(12_00, 'weekly')).toBe(52_00);
expect(monthlyEquivalent(30_00, 'quarterly')).toBe(10_00);
expect(monthlyEquivalent(9_99, 'yearly')).toBe(83);
```

- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: date periods and anchored recurrence`.

### Task 5: Balances, debts and net worth (+ worked examples)

**Files:**
- Create: `src/domain/balances.ts`, `src/domain/examples.ts` (+ tests).

**Interfaces:**
- `type Buckets = { cash: number; savings: number; passive: number }`.
- `bucketBalances(data: DataSnapshot, asOf: LocalDate): Buckets`. With no profile, the opening amounts are 0 and the opening date is `'0000-01-01'`.
- `debtBalance(debt: Debt, data: DataSnapshot, asOf: LocalDate): number`. Events count from `debt.openingDate` to `asOf`.
- `netWorth(buckets: Buckets, debtTotal: number, investments = 0): number`.
- **`examples.ts`:**
  - `type WorkedExample = { rule: string; title: string; data: DataSnapshot; today: LocalDate; steps: string[]; result: Record<string, number> }`;
  - `export const EXAMPLES: WorkedExample[]`, one per Part 4 rule: Expense, Subscription, Spending limit, Salary freeze, Net worth, Available balance.
  - Stock purchase and Dividend are added in M5.
  - Each example's `result` is asserted against the domain functions in `examples.test.ts`.
- **Worked example EXP-1 ("Expense"):**
  - opening cash `500_00` on `2026-10-01`; lunch `12_50` debit and headphones `60_00` on card `card-1` (opening 0), both on 10-02.
  - As of 10-02: cash `487_50`, card `60_00`, net worth `427_50`.
  - (The "counts toward Food limit" half is asserted in Task 6.)
- **Worked example BAL-1 ("Net worth"):**
  - Profile: openingDate `2026-10-01`, cash `1_000_00`, savings `5_000_00`.
  - Events:
    - salary `3_000_00` confirmed to cash on 10-01;
    - extra `200_00` **expected** on 10-02;
    - groceries `120_00` debit on 10-03;
    - jacket `80_00` on card `card-1` on 10-04;
    - an old `50_00` cash expense on **09-30**;
    - transfer `500_00` cash→savings on 10-05;
    - card payment `30_00` from cash to `card-1` on 10-06;
    - adjustment `−20_00` to cash on 10-07.
  - Card `card-1`: opening 0 on 10-01.
  - As of 10-10 the result is cash `3_330_00`, savings `5_500_00`, passive 0, card `50_00`, net worth `8_780_00`.

- [ ] **Step 1: Write failing tests** asserting BAL-1 exactly, and:
  - "an expense dated before opening doesn't change cash";
  - "events after asOf are ignored";
  - "a loan balance falls with debt_payment and never counts card expenses";
  - "an overpaid card shows a negative balance".
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: bucket balances, debt balances and net worth with worked example`.

### Task 6: Budget — limits, upcoming bills, reserved, available, spending summary

**Files:**
- Create: `src/domain/budget.ts` (+ test). Modify: `src/domain/examples.ts`.

**Interfaces:**
- `type LimitLevel = 'ok' | 'warn' | 'over' | 'way-over'`.
- `type LimitStatus = { limit: BudgetLimit; range: Range; spent: number; remaining: number; pct: number; level: LimitLevel }`:
  - `pct` = Math.round(spent × 100 / amount);
  - the level is computed with integer math (`spent × 100 ≥ amount × threshold`).
- `limitStatus(limit, data, today, weekStartsOn): LimitStatus`.
- `limitLabel(limit): string` → `'Overall'` or the capitalized category (`'Food'`).
- `type Bill = { date: LocalDate; name: string; amount: number; kind: 'subscription' | 'card'; refId: string }`.
- `upcomingBills(data, today): Bill[]`, sorted by date. A card bill's date is the next `dueDay` on or after today (clamped), or today if `dueDay` is null.
- `reservedTotal(data, today, weekStartsOn): number`.
- `availableBalance(buckets, bills, reserved): number`.
- `spendingSummary(expenses, today, weekStartsOn): { today: number; week: number; month: number; year: number }`.
- `categoryBreakdown(expenses, range): Array<{ category: Category; amount: number }>`, sorted by amount descending, without zero rows.
- **Worked example AVL-1 ("Available balance"):**
  - today `2026-10-14`, weekStartsOn 1;
  - profile opening `2026-10-01`, cash `1_200_00`, savings `3_000_00`;
  - expense food `100_00` debit on 10-13;
  - subscription Streamflix `15_99` monthly, next 10-20 (active);
  - subscription Gym `39_00`, next 11-02;
  - card `card-1` payInFull, opening `230_00` on 10-01, dueDay 21;
  - limit rent monthly `1_200_00` with reserve;
  - limit food weekly `120_00`.
  - Results: bills `[Streamflix 15_99 on 10-20, card 230_00 on 10-21]`, reserved `1_200_00`, available `1_654_01`; food status spent `100_00`, pct 83, level `'warn'`.
- **Worked example LIM-1 ("Spending limit"):** levels for spent 79/80/99/100/119/120 of a 100 limit are ok/warn/warn/over/over/way-over.

- [ ] **Step 1: Write failing tests:**
  - AVL-1;
  - LIM-1;
  - "a subscription charge counts toward its category limit";
  - "a card expense counts toward limits";
  - "a non-payInFull card bill is min(minimumPayment, balance)";
  - "cancelled subscriptions are not bills";
  - "renewals after month end are not bills";
  - `spendingSummary` totals with expenses on today / earlier this week / earlier this month / Jan 2 / last year;
  - `categoryBreakdown` ordering.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: limits, upcoming bills, reserved limits and available balance`.

### Task 7: Salary and freezes (+ worked example)

**Files:**
- Create: `src/domain/salary.ts` (+ test). Modify: `examples.ts`.

**Interfaces:**
- `payDate(monthKey: string, payDay: number): LocalDate` (clamped).
- `freezeLoss(start, end, monthlySalary): number`: the computed-mode total, Σ per month of `round(monthly × days / daysInMonth)`.
- `freezeAllocation(freeze: SalaryFreeze, monthlySalary: number): Record<string, number>`:
  - computed mode: per-month computed amounts;
  - manual mode: `lostAmount` split by days, remainder to the last month.
- `expectedSalary(profile: Profile, freezes: SalaryFreeze[], monthKey: string): number` = max(0, monthly − Σ allocations for that month); 0 with no salary.
- **Worked example SAL-1 ("Salary freeze"):**
  - monthly `3_000_00`; freeze `2026-09-28`..`2026-10-03`, computed.
  - Sep loss `300_00`, Oct `290_32`, total `590_32`.
  - Expected salary Sep `2_700_00`, Oct `2_709_68`.
  - Manual `500_00` over the same days ⇒ `{ '2026-09': 250_00, '2026-10': 250_00 }`.

- [ ] **Step 1: Write failing tests:**
  - SAL-1;
  - `payDate('2026-02', 30) === '2026-02-28'`, `payDate('2026-09', 31) === '2026-09-30'`;
  - a one-day freeze in a 31-day month = `round(monthly / 31)`;
  - a freeze exceeding the month's pay clamps the expected salary at 0.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: salary freeze math and expected salary with worked example`.

### Task 8: Sync engine and `today`

**Files:**
- Create: `src/domain/sync.ts` (+ test).
- Modify: `src/store/appStore.ts` (+ tests), `src/store/useFinance.ts` (`useToday`), `src/main.tsx`.

**Interfaces:**
- `dueGenerated(data: DataSnapshot, today: LocalDate): TableRecord[]`, pure. It returns:
  - **for each active subscription with `nextRenewal ≤ today`:**
    - an Expense per due date, with id `sub-<id>-<date>`, the subscription's amount, category, paymentMethod and cardId, note = name, and `subscriptionId` set;
    - expenses already present by id are skipped;
    - the updated Subscription, with `nextRenewal` advanced via `nextOccurrence(…, anchorDay)` past today.
  - **when the profile has a salary with `monthlyAmount > 0`:**
    - for each month from `monthKey(openingDate)` to `monthKey(today)` whose `payDate` is ≥ `openingDate` and ≤ `today`, and which has no Income with `source: 'salary'` and that `period`: an Income;
    - its id is `salary-<YYYY-MM>`, `status: 'expected'`, amount `expectedSalary`, label `'Salary'`, bucket `'cash'`, date `payDate`;
    - it is skipped when the amount is 0.
  - Generated timestamps are `` `${date}T12:00:00.000Z` `` (deterministic).
- **Store:**
  - `today: LocalDate` in state, set at boot;
  - `sync(): Promise<void>` sets `today = deps.today()`; when unlocked, it `putMany(dueGenerated(data, today))` if the result is non-empty;
  - `sync` runs after every successful unlock/boot into `'unlocked'`;
  - `main.tsx` calls `appStore.getState().sync()` on `visibilitychange` → visible, and on `focus`.
- `useToday(): LocalDate` selects `today`.

- **Worked example SUB-1 ("Subscription")**, added to `examples.ts`:
  - Streamflix `15_99` monthly, anchorDay 20, next `2026-10-20`, debit; opening cash `1_000_00` on 10-01.
  - On 10-19: bills include Streamflix `15_99`; available = `1_000_00` − `15_99` = `984_01`; cash `1_000_00`.
  - After sync on 10-20: expense `sub-<id>-2026-10-20` exists, cash `984_01`, nextRenewal `2026-11-20`, no Streamflix bill this month.

- [ ] **Step 1: Write failing tests:**
  - SUB-1 (in `examples.test.ts`).
  - **`sync.test.ts`:**
    - sub next `2026-08-31`, anchor 31, monthly, today `2026-10-14` ⇒ expenses on `2026-08-31` and `2026-09-30`, sub next `2026-10-31`;
    - running again on data plus that output ⇒ `[]`;
    - a cancelled sub ⇒ nothing.
  - **Salary:** opening `2026-08-15`, payDay 25, `4_200_00`, a confirmed `2026-08` salary present, today `2026-10-14` ⇒ one expected Income `salary-2026-09` on `2026-09-25` for `4_200_00`. With a freeze in September ⇒ the reduced amount.
  - **Edge cases:** payDay 31 ⇒ September date `2026-09-30`; opening `2026-10-20` ⇒ no October salary until the 25th.
  - **`appStore.test.ts`:**
    - "boot materializes due subscriptions";
    - "sync on a new day picks up a renewal" (advance `deps.today` from 10-19 to 10-20 → Streamflix expense appears, `today` updates);
    - "demo boots with nothing to generate".
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: sync engine materializes subscription charges and expected salary`.

### Task 9: Finance view, actions and limit alerts

**Files:**
- Create: `src/domain/view.ts`, `src/domain/alerts.ts`, `src/store/financeActions.ts` (+ tests each).
- Modify: `src/store/useFinance.ts`.

**Interfaces:**
- **`computeFinanceView(data, today, weekStartsOn): FinanceView`**, where `FinanceView` has:
  - `buckets`;
  - `debts: Array<{ debt: Debt; balance: number }>` and `debtTotal`;
  - `netWorth`;
  - `bills` and `billsTotal`;
  - `reserved`;
  - `available`;
  - `limits: LimitStatus[]`, sorted by pct descending;
  - `spending` (`spendingSummary`);
  - `pendingSalary: Income[]` (expected salary rows);
  - `expectedSalaryThisMonth`;
  - `activeFreeze: SalaryFreeze | null` (start ≤ today ≤ end);
  - `subscriptionsMonthly` (Σ `monthlyEquivalent` of active subscriptions).
- **`alerts.ts`:**
  - `limitAlerts(before: DataSnapshot, after: DataSnapshot, today, weekStartsOn): LimitStatus[]` returns the after-statuses whose level rank rose. Only limits whose current period contains `today` count, so last-month expenses never alert.
  - `crossesOver(data, expense: Expense, today, weekStartsOn): LimitStatus[]` returns the limits that would go from below `over` to `over` or higher if the expense were added.
  - `limitMessage(tone: 'gentle' | 'motivational' | 'strict', status: LimitStatus): string`. `{name}` = `limitLabel`, `{pct}` = pct, `{period}` = `week` | `month`. Exact copy:

| Tone | warn | over | way-over |
|---|---|---|---|
| gentle | `Heads up: {name} is at {pct}% of its limit.` | `{name} has reached its limit for this {period}.` | `{name} is well past its limit ({pct}%).` |
| motivational | `{name} is at {pct}%. A few careful days and you've got this!` | `{name} hit its limit. Let's hold the line for the rest of the {period}.` | `{name} is at {pct}%. Let's regroup and get back on track.` |
| strict | `{name}: {pct}% used.` | `{name} limit reached.` | `{name} limit exceeded: {pct}%.` |

- **`createFinanceActions(store: StoreApi<AppState>)`** returns:
  - **Expenses:**
    - `addExpense(input: ExpenseInput): Promise<{ expense: Expense; alerts: LimitStatus[] }>`, where `ExpenseInput = { amount; category; date; note; paymentMethod; cardId; repeat: Cycle | null }`;
    - with `repeat`, it also creates a Subscription (name = note, or the category label; `anchorDay` = day of date; `nextRenewal = nextOccurrence(date, repeat, anchorDay)`; same category, method and card) and sets the expense's `subscriptionId`, via one `putMany`;
    - `updateExpense(id, patch: Partial<ExpenseInput>)`;
    - `deleteExpense(id)`.
  - **Income:**
    - `addIncome({ amount, source, label, date, bucket, note })` creates a confirmed Income; a salary income gets `period = monthKey(date)`;
    - `confirmIncome(id, amount)`;
    - `deleteIncome(id)`.
  - **Subscriptions:**
    - `saveSubscription(input: { id?; name; amount; cycle; nextRenewal; category; paymentMethod; cardId })`, which sets `anchorDay` from the day of `nextRenewal` on create;
    - `setSubscriptionStatus(id, status)`;
    - `setSubscriptionAudit(id, audit)`;
    - `deleteSubscription(id)`, which keeps past expenses.
  - **Limits:** `saveLimit(input: { id?; scope; category; period; amount; reserve })` (warnAt `[80,100,120]`, includeInvestments false); `deleteLimit(id)`.
  - **Freezes:**
    - `addFreeze({ start, end, mode, lostAmount?, note })`; computed mode uses `freezeLoss` with the profile's salary;
    - then re-prices still-`expected` salary incomes in affected months to the new `expectedSalary` (same `putMany`);
    - `deleteFreeze(id)` re-prices the same way.
  - **Goals:**
    - `saveGoal(input)`; `deleteGoal(id)`;
    - `contributeToGoal(goalId, amount, date)`: a transfer cash→savings with note `` `Goal: ${name}` `` plus `goal.current += amount`, in one `putMany`.
  - **Debts:**
    - `saveDebt(input)`;
    - `deleteDebt(id)` rejects with `Error("This card or loan has history. Delete its expenses and payments first, or keep it.")` if any expense `cardId` or transaction `debtId` references it;
    - `payDebt(debtId, amount, from: 'cash' | 'savings', date)` makes a `card_payment` for a card, `debt_payment` for a loan.
  - **Corrections:** `setActualBalance(bucket: 'cash' | 'savings', actual: number, date)` creates an adjustment of `actual − computed`; it is a no-op and returns null when the difference is 0.
  - **Profile and settings:** `updateProfile(patch)`; `updateSettings(patch)`.
  - **Onboarding:** `completeOnboarding({ name, currency, openingCash, openingSavings, salary: { monthlyAmount, payDay } | null, cards: CardInput[] })` writes the profile (`openingDate = today`, `onboardedAt = now`) and the cards (kind `credit_card`, `openingBalance` = current balance, `openingDate` today) in one `putMany`. `CardInput = { name; balance; creditLimit: number | null; dueDay: number | null; payInFull: boolean }`.
  - All of these use the store's `today` and `newId`/`nowIso`.
- **`useFinance.ts`:** `useFinanceView(): FinanceView` (memoized on `data`, `today`, `weekStartsOn`); `useFinanceActions()` (memoized per store).

- [ ] **Step 1: Write failing tests:**
  - **`view.test.ts`:** AVL-1 data → view fields equal the AVL-1 numbers; `activeFreeze` is found on its start and end days.
  - **`alerts.test.ts`:**
    - food weekly `120_00` spent `90_00`, add `10_00` ⇒ alert to `'warn'`;
    - add `5_00` more from `warn` ⇒ no alert;
    - an expense dated in the previous month ⇒ none;
    - `crossesOver` for `30_00` ⇒ the food limit;
    - all 9 `limitMessage` strings, exact.
  - **`financeActions.test.ts`** (real store over fake-indexeddb, as in `appStore.test.ts`):
    - a repeat expense creates a linked subscription with `nextRenewal` one cycle later and `anchorDay`;
    - addExpense returns alerts;
    - `contributeToGoal` changes the savings bucket and the goal together;
    - `deleteDebt` with linked expenses rejects with the exact message, and without history it succeeds;
    - `deleteSubscription` keeps its past expenses (with their `subscriptionId`) and balances are unchanged;
    - `payDebt` lowers the card balance and cash;
    - `setActualBalance('cash', computed + 12_34)` ⇒ an adjustment of `12_34`, and an equal amount ⇒ null;
    - `addFreeze` re-prices a pending expected salary;
    - `completeOnboarding` writes the profile and cards, and `onboardedAt` is set.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: finance view, limit alerts with tone copy, and finance actions`.

### Task 10: UI kit additions

**Files:**
- Create in `src/components/ui/`: `Select.tsx`, `Switch.tsx`, `ProgressBar.tsx`, `PageHeader.tsx`, `EmptyState.tsx` (+ `kit.test.tsx`).

**Interfaces:**
- `Select`: `{ label; value; onChange(v: string); options: Array<{ value: string; label: string }>; hint?; error? }`, a native `<select>` styled like TextField.
- `Switch`: `{ label; checked; onChange(v: boolean); hint? }`, a checkbox with `role="switch"`.
- `ProgressBar`:
  - props `{ label: string; value: number /* pct, may exceed 100 */; level: LimitLevel; valueText: string }`;
  - `role="progressbar"`, `aria-valuemin 0`, `aria-valuemax 100`, `aria-valuenow min(value, 100)`, `aria-valuetext`;
  - fill colors `ok` primary, `warn` warning, `over`/`way-over` danger;
  - the inset track from visual-direction.
- `PageHeader`: `{ title: string; action?: ReactNode; children? }`, an h1 (28px, 800) with the action at the right and a bottom hairline. (`Section` comes from Task 0.)
- `EmptyState`: `{ title; children?; action? }`.

- [ ] **Step 1: Write failing tests:**
  - ProgressBar at 135 → `aria-valuenow 100` and valuetext `'135% used'`;
  - Switch toggles and reports `aria-checked`;
  - Select is labelled and fires onChange with the value.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: Select, Switch, ProgressBar, PageHeader and EmptyState primitives`.

### Task 11: Onboarding wizard

**Files:**
- Create: `src/features/onboarding/OnboardingWizard.tsx` (+ `onboarding.test.tsx`), `tests/e2e/onboarding.spec.ts`.
- Modify:
  - `src/app/Root.tsx`: the unlocked real namespace without `profile[0]?.onboardedAt` renders `OnboardingWizard` instead of the router;
  - `tests/e2e/helpers.ts`: add `onboard(page, opts?)`; `startFresh` now onboards with defaults.

**Interfaces:**
- **Steps and exact copy:**
  - The header reads "Step {n} of 6". Each step has Back and Next; Next is disabled until the step is valid.
  - **Step 1, "Before we start":**
    - body: "Funancial helps you track and plan your money. It isn't financial advice, and it never needs your bank login. Everything stays encrypted on this device."
    - checkbox: "I understand".
  - **Step 2, "Your currency and name":**
    - Select "Currency". The common ones come first (USD, EUR, GBP, CAD, AUD, JPY, CHF, INR, SGD, ZAR), then the rest of `Intl.supportedValuesOf('currency')`. Default: USD.
    - TextField "What should we call you?" (optional).
  - **Step 3, "What you have now":**
    - MoneyField "Cash & checking" and MoneyField "Savings", both required (0 allowed);
    - hint "Rough numbers are fine. You can correct them anytime."
  - **Step 4, "Your salary":**
    - MoneyField "Monthly take-home pay" and Select "Pay day" (1–31, default 25);
    - Switch "I don't have a regular salary" hides the fields.
  - **Step 5, "Credit cards":**
    - "Add a card" opens an inline form: TextField "Card name", MoneyField "Current balance", MoneyField "Credit limit" (optional), Select "Due day" (1–31), Switch "I pay it in full each month" (default on).
    - Added cards are listed with Remove. The step can be continued with none.
  - **Step 6, "Lock Funancial?":**
    - RadioGroup "No lock" / "PIN" / "Passphrase", with new + confirm fields validated by `validateSecret`;
    - the button "Start my adventure".
- **Finish:** `completeOnboarding`, then `setSecret` if one was chosen, then the Dashboard. The `useAction` error toast appears on failure.

- [ ] **Step 1: Write failing tests:**
  - **`onboarding.test.tsx`** (stub store, spy actions):
    - Next is disabled until "I understand" is checked;
    - a full happy path with cash `1,000`, savings `5000`, salary `4200` on day 25, one card "Visa" with balance `230` and due day 21, and a PIN `2468` calls `completeOnboarding` with exact values (`openingCash 100000`, `openingSavings 500000`, `salary { monthlyAmount 420000, payDay 25 }`, cards `[{ name: 'Visa', balance: 23000, creditLimit: null, dueDay: 21, payInFull: true }]`), then `setSecret('2468', 'pin')`;
    - "no regular salary" ⇒ `salary: null`.
  - **e2e `onboarding.spec.ts`:** Start with my real data → complete all steps → Home shows Available balance `$6,000.00` (cash 1,000 + savings 5,000; no bills or limits).
- [ ] **Step 2–4: Run → FAIL; implement (and update `helpers.startFresh` so existing e2e pass); run `npm test && npm run test:e2e` → PASS.**
- [ ] **Step 5: Commit** `feat: onboarding wizard with currency, balances, salary, cards and lock`.

### Task 12: Dashboard

**Files:**
- Create: `src/features/dashboard/DashboardScreen.tsx` (+ test).
- Modify: `src/app/routes.tsx` (`/` → Dashboard).

**Interfaces (layout per mockup D):**
- **Header:** PageHeader title "Home" (13px muted, so the KPI row leads); the greeting is "Hi, {name}" when a name is set.
- **Banners (above the KPIs):**
  - **Pending salary:** for each `pendingSalary` income: "Your {Month} salary is expected: {amount}. Did it arrive?" with a "Confirm" button.
    - The button opens a Dialog "Confirm salary" with MoneyField "Amount received" (prefilled) and Confirm, which calls `confirmIncome`.
  - **Active freeze:** "Salary freeze until {end date}. Bills and subscriptions still apply."
- **KPI row:** 3 columns divided by vertical hairlines; it stacks with horizontal hairlines below `md`.
  1. **"Available to spend":** 48px/800 figure; caption "Cash + savings − upcoming bills − reserved limits"; then the pill buttons "Add expense" (primary, `/add`), "Income" (secondary, `/add?type=income`), "Buy it?" (secondary, `/buy`).
  2. **"Net worth":** 34px figure; muted line "Cash {cash} · Savings {savings} · Debts {debtTotal}".
  3. **"Spent in {Month}":** 34px figure (`spending.month`); muted line "{pct}% of your {amount} limit" when an overall monthly limit exists, else "This year {spending.year}".
- **Grid (`md:grid-cols-[7fr_5fr]`, sections divided by hairlines):**
  - **Limits** (7fr): up to 4 ProgressBars sorted by pct, with "See all" → `/budget`; EmptyState "No limits yet" with action "Set a limit" → `/budget`.
  - **Spending** (5fr): Today / This week / This month / This year, plus the top 3 categories this month.
  - **Upcoming bills** (7fr): list rows with an icon well (`surface-2`), name, date and amount; the header action is the total; EmptyState "Nothing due this month".
  - **Goals** (5fr): the top 2 goals with ProgressBar and "{current} of {target}", and "All goals" → `/goals`.
- **Later milestones:** Portfolio (with the interactive donut from mockup D) joins the grid in M5; the game HUD strip and Quests in M4.

- [ ] **Step 1: Write failing tests** (render with a stub store holding AVL-1 data and `today`):
  - shows `$1,654.01` as available;
  - shows the food bar at 83%;
  - lists Streamflix and the card bill;
  - a pending salary Confirm calls `confirmIncome('salary-2026-10', 270968)` (SAL-1 data variant);
  - the freeze banner text.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: dashboard with available balance, net worth, spending, limits and bills`.

### Task 13: Add expense / income

**Files:**
- Create: `src/features/add/AddScreen.tsx`, `ExpenseForm.tsx`, `IncomeForm.tsx` (+ `add.test.tsx`).
- Modify: `routes.tsx` (`/add` → AddScreen).

**Interfaces:**
- **AddScreen:** PageHeader "Add"; RadioGroup "Type" Expense/Income, from `?type=income`.
- **`ExpenseForm`:**
  - **Fields:**
    - MoneyField "Amount" (autofocus);
    - "Category": a RadioGroup of the 8 categories with labels Food, Transport, Rent, Utilities, Fun (value `entertainment`), Health, Shopping, Other;
    - TextField type date "Date" (default today, `max` today; error "Use today or an earlier date.");
    - Select "Paid with": Cash, Debit card, each credit card by name (value `card:<id>`), Other;
    - TextField "Note";
    - Select "Repeats": Doesn't repeat / Weekly / Monthly / Quarterly / Yearly.
  - **Save:** if `settings.warningTone === 'strict'` and `crossesOver(...)` is non-empty, it first opens a Dialog "Over your limit?" with description `limitMessage('strict', status)` for the first status, and buttons "Save anyway" / "Cancel".
  - **After save:**
    - a success toast "Expense saved.";
    - each alert shows `toast('warning', limitMessage(tone, alert))`;
    - then navigate back to the previous page (or `/`).
- **`IncomeForm`:** MoneyField "Amount"; RadioGroup "Source" Salary/Extra; TextField "Label" (default "Salary"/"Extra income"); Date; Select "Goes to" Cash/Savings; Note. Save shows "Income saved."

- [ ] **Step 1: Write failing tests** (stub store with a real-shaped `useFinanceActions` via spies):
  - a valid expense calls `addExpense` with exact input (`amount 1250`, category `food`, date today, `paymentMethod 'cash'`, `cardId null`, `repeat null`);
  - choosing card "Visa" ⇒ `paymentMethod 'credit_card'`, `cardId 'card-1'`;
  - a future date shows the error and doesn't save;
  - motivational tone + returned alert ⇒ warning toast with the exact motivational warn copy;
  - strict tone + `crossesOver` ⇒ the confirm dialog, and Cancel ⇒ no save;
  - income salary ⇒ `addIncome` with `source 'salary'`.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: add expense and income with limit warnings and strict confirmation`.

### Task 14: Budget & Limits screen

**Files:**
- Create: `src/features/budget/BudgetScreen.tsx`, `LimitDialog.tsx` (+ test). Modify: `routes.tsx`.

**Interfaces:**
- **Header:** PageHeader "Budget" with the action "Add limit".
- **Limits:** for each status, a Card with the `limitLabel` + period ("Food · weekly"), a ProgressBar, "{spent} of {amount} · {remaining} left" (or "{over} over"), a "Reserved" chip when `reserve`, and Edit.
- **Spending:** "This month by category" uses `categoryBreakdown` with simple bars.
- **`LimitDialog`:**
  - fields: RadioGroup "Applies to" Overall / One category; Select "Category"; RadioGroup "Period" Weekly/Monthly; MoneyField "Limit"; Switch "Reserve what's left" (hint "Hold back the unspent part of this limit in your available balance."); buttons Save, plus Delete when editing;
  - **validation:** amount required; at most one limit per scope + category + period, else the error "You already have this limit.".

- [ ] **Step 1: Write failing tests:**
  - lists demo limits with correct remaining text;
  - creating "Food weekly 120" calls `saveLimit` exactly;
  - the duplicate error;
  - Delete calls `deleteLimit`.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: budget and limits screen`.

### Task 15: Subscriptions screen

**Files:**
- Create: `src/features/subscriptions/SubscriptionsScreen.tsx`, `SubscriptionDialog.tsx` (+ test). Modify: `routes.tsx`.

**Interfaces:**
- **Header:** PageHeader "Subscriptions & bills" with the action "Add".
- **Summary:** "{subscriptionsMonthly} a month · {count} active".
- **Each active subscription:**
  - shows its name, "{amount} / {cycle}", "Renews {date}" (or "Renews in {n} days" when n ≤ 7), and paid-with;
  - audit chips Keep / Review / Cancel (`setSubscriptionAudit`);
  - menu actions Edit, "Cancel subscription" (status cancelled).
- **Cancelled subscriptions** are listed below under "Cancelled", muted, each with "Resume".
- **`SubscriptionDialog`:** fields Name, MoneyField Amount, Select Cycle, Date "Next renewal", Select Category, Select Paid with; buttons Save, plus Delete when editing (Delete text: "Past charges stay in your history.").

- [ ] **Step 1: Write failing tests:**
  - the monthly total for 15.99 monthly + 120 yearly = `$25.99`;
  - "Renews in 3 days";
  - the audit chip calls `setSubscriptionAudit(id, 'review')`;
  - Cancel → `setSubscriptionStatus(id, 'cancelled')`;
  - create calls `saveSubscription` exactly.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: subscriptions screen with audit and cancel`.

### Task 16: Salary Freeze screen, Profile & salary and Preferences in Settings

**Files:**
- Create: `src/features/freeze/FreezeScreen.tsx` (+ test), `src/features/settings/ProfileSection.tsx`, `PreferencesSection.tsx`.
- Modify: `routes.tsx`, `SettingsScreen.tsx` (+ `settings.test.tsx`).

**Interfaces:**
- **FreezeScreen:**
  - PageHeader "Salary Freeze".
  - Without a salary: EmptyState "Add your salary first" with action "Open settings" → `/settings`.
  - Otherwise, a form:
    - Date "From", Date "To";
    - RadioGroup "Lost pay": "Calculate from my salary" / "I'll enter the amount" (+ MoneyField "Amount lost");
    - a live preview per affected month: "{Month}: {before} → {after}";
    - the note "Bills and subscriptions still apply during a freeze.";
    - the button "Add freeze".
  - Below it, a list of freezes with Delete.
  - Validation: To ≥ From, else the error "The end date must be on or after the start date."
- **ProfileSection** (Settings, first): TextField Name, Select Currency (hint "Changing this relabels amounts; it doesn't convert them."), MoneyField "Monthly take-home pay" + Select "Pay day", and Save → `updateProfile`.
- **PreferencesSection:** Select "Week starts on" Monday/Sunday; RadioGroup "Warning style" Gentle/Motivational/Strict, with an example line for each, using the warn-level copy for "Food at 85%" → `updateSettings`.
- Both sections are hidden for the demo namespace except Preferences.

- [ ] **Step 1: Write failing tests:**
  - the freeze preview for SAL-1 shows "September: $3,000.00 → $2,700.00" and "October: $3,000.00 → $2,709.68";
  - manual mode calls `addFreeze` with `mode 'manual'`, `lostAmount 50000`;
  - the end-before-start error;
  - Preferences saves `warningTone 'strict'`;
  - Profile saves a salary.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: salary freeze screen and profile/preferences settings`.

### Task 17: Goals & Debts screen

**Files:**
- Create: `src/features/goals/GoalsScreen.tsx`, `GoalDialog.tsx`, `DebtDialog.tsx`, `PayDialog.tsx` (+ test). Modify: `routes.tsx`.

**Interfaces:**
- **Header:** PageHeader "Goals & debts".
- **Goals section:**
  - each goal shows a ProgressBar (`current/target`, level `ok`), "{current} of {target}", and, with a deadline, "{monthly} a month to reach it by {date}";
    - monthly = ceil(remaining ÷ monthsLeft);
    - monthsLeft = max(1, (deadlineYear × 12 + deadlineMonth) − (todayYear × 12 + todayMonth));
  - "Add money" opens PayDialog-like "Add to goal" (MoneyField) → `contributeToGoal`;
  - Edit;
  - "Add goal" opens GoalDialog: Name, RadioGroup Kind Savings/Emergency fund/Other, MoneyField Target, MoneyField "Saved so far", Date "Deadline" (optional).
- **Debts section:**
  - **Card rows:** balance, "{used}% of limit" when there is a limit, "Due on the {dueDay}", and "Pay card" → PayDialog (MoneyField "Amount", default balance; RadioGroup "From" Cash/Savings) → `payDebt`.
  - **Loan rows:** balance, a payoff ProgressBar (`(opening − balance) / opening`), and "Make a payment".
  - "Add card" / "Add loan" opens DebtDialog: Name, MoneyField "Current balance", Interest rate % (number), MoneyField "Minimum payment"; card-only fields Credit limit, Due day, and Switch "Pay in full".
  - Delete inside the DebtDialog uses `useAction` (shows the history message on refusal).

- [ ] **Step 1: Write failing tests:**
  - "New bike" `450 / 1,200`, deadline in 4 months ⇒ "$187.50 a month to reach it by …";
  - Add money calls `contributeToGoal('g1', 5000, today)`;
  - Pay card defaults to the balance and calls `payDebt('card-1', 23000, 'cash', today)`;
  - a refused delete shows the exact history message in a toast.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: goals and debts screen with contributions and card payments`.

### Task 18: History, Set actual balance and CSV export

**Files:**
- Create: `src/features/history/HistoryScreen.tsx`, `ActualBalanceDialog.tsx` (+ test), `src/data/csv.ts` (+ test).
- Modify: `routes.tsx`, `DataSection.tsx` (CSV export).

**Interfaces:**
- **`HistoryScreen`:**
  - PageHeader "History" with the action "Set actual balance".
  - Filters: Select "Month" (months with activity, newest first; default the current month), RadioGroup "Show" All / Spending / Income / Transfers, Select "Category" (spending only).
  - The list is grouped by day (newest first). Rows:
    - expense: "−{amount}" with category, note and paid-with;
    - income: "+{amount}", with an "Expected" chip when unconfirmed;
    - transfer: "{from} → {to}";
    - adjustment: "Balance correction";
    - card/debt payment: "Paid {debt name}".
  - Tapping an expense opens ExpenseForm in a Dialog "Edit expense" (`updateExpense`, plus Delete → `deleteExpense`). Income and transaction rows get Delete.
- **`ActualBalanceDialog`:**
  - RadioGroup "Which balance" Cash/Savings, showing "Funancial thinks: {computed}";
  - MoneyField "Actual balance"; Save → `setActualBalance`;
  - shows "Already matches." when equal.
- **`csv.ts`:** `expensesToCsv(data: DataSnapshot, currency: string): string`.
  - Header: `date,amount,currency,category,payment_method,card,note,subscription`.
  - Amount is in major units with `.` and `minorDigits` decimals; card is the card name; subscription is the subscription name.
  - RFC 4180 quoting (quote fields containing `,`, `"`, or newlines; double the inner quotes); `\r\n` line endings; sorted by date then id.
- **DataSection** adds a "Export expenses (CSV)" button with the same unprotected-copy warning, file name `funancial-expenses-YYYY-MM-DD.csv`.

- [ ] **Step 1: Write failing tests:**
  - **`csv.test.ts`:** two expenses, one with note `Lunch, "big"` on card "Visa" ⇒ an exact two-line body; a JPY amount has no decimals.
  - **`history.test.tsx`:**
    - BAL-1 data shows the transfer row "Cash → Savings" and the adjustment "Balance correction";
    - the Spending filter hides incomes;
    - editing an expense amount calls `updateExpense(id, { amount: 13000, … })`;
    - "Set actual balance" for cash `3,342.34` calls `setActualBalance('cash', 334234, today)`.
- [ ] **Step 2–4: Run → FAIL; implement; run → PASS.**
- [ ] **Step 5: Commit** `feat: history with edit and delete, set actual balance, and CSV export`.

### Task 19: M2 end-to-end flows

**Files:**
- Create: `tests/e2e/finance.spec.ts`.
- Modify: `tests/e2e/helpers.ts`.

- [ ] **Step 1: Write the e2e tests** (each starts with `onboard(page, { cash: '1000', savings: '5000', salary: '4200', payDay: 25 })`, and some add a card):
  - **80% warning:**
    - Budget → Add limit Food weekly 120 → Add expense 100 Food;
    - expect the toast "Food is at 83%. A few careful days and you've got this!";
    - Dashboard shows the food bar at 83%.
  - **Card spending and paying it off:**
    - add card "Visa" (balance 0, due 21) in Goals & debts;
    - add a 50 expense paid with Visa;
    - Goals & debts shows the Visa balance `$50.00` and Available drops by 50 (the card bill);
    - Pay card 50 from Cash → balance `$0.00`.
  - **Freeze:** add a computed freeze for a 3-day range in the current month; the preview shows the reduced pay; the Dashboard shows the freeze banner.
  - **Set actual balance:** History → Set actual balance (Cash, 900) → the Dashboard cash row shows `$900.00` and History shows "Balance correction".
  - **Repeat expense:** add Rent 1,200 monthly → Subscriptions lists "Rent" renewing next month.
- [ ] **Step 2: Run `npm run test:e2e`.** Expected: all PASS on both projects (fix the app, not the tests, on failure).
- [ ] **Step 3: Manual pass in the browser pane** at 375px and desktop, light and dark: onboarding, dashboard, add, budget, subscriptions, freeze, goals, history.
- [ ] **Step 4: Commit** `test: M2 end-to-end finance flows`.

---

## Milestone checkpoint (M2 done)

**Usable day to day in the browser:**
- onboard with real balances;
- log expenses and income in seconds and see limit warnings in your chosen tone;
- check available balance and net worth;
- manage limits, subscriptions, salary freezes, goals, cards and loans;
- correct drift with "Set actual balance";
- export expenses as CSV.

**Next:** M3, the Android app.
