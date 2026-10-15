# M2 finance core: decisions and deferred items

Every call made during M2 that a plan or spec didn't settle, in the order it was made, each with what it costs if wrong. Then the final review's outcome and the minor findings deferred to later milestones.

Branch `feat/m2-finance-core`, commits 0300d35..eb7c10e. Final review by a fresh reviewer (Opus): ready to merge with fixes; all Important findings fixed with tests.

## Rulings

- T9→T11..T18: action names — T18 deletes transaction rows but T9 defines no deleteTransaction. Ruling: add `deleteTransaction(id)` to createFinanceActions in T9 — cost if wrong: one extra method.
- Task 0: Ruling: chart tokens named --color-chart-1..6 (Tailwind color namespace) instead of the doc table's --chart-*; doc updated — cost if wrong: rename.
- Task 0: Ruling: token test lives in tests/unit/tokens.test.ts (node env, tsconfig.node types) because Vitest returns '' for CSS ?raw imports and the app tsconfig has no node types; vitest unit project includes tests/unit — cost if wrong: none.
- Task 0: Ruling: RadioGroup's native radio is an invisible input covering its label (absolute inset-0 opacity-0) rather than sr-only — sr-only made the label intercept clicks so the existing e2e (click on role radio) failed; this keeps tests untouched and native semantics — cost if wrong: none.
- Task 0: Ruling: Welcome/Lock/StorageUnavailable keep Card (soft surface-2 panel) as the plan allows; Settings, Placeholder and NotFound moved to Section/plain layout — cost if wrong: cosmetic.
- Task 1: Ruling: store put() delegates to putMany(), so every write posts a single 'data' message; remove() posts too — cost if wrong: none.
- Task 1: Ruling: migrations.ts exports LATEST_VERSION (no value import from snapshot to avoid an init cycle) with a test pinning it to CURRENT_SCHEMA_VERSION — cost if wrong: none.
- Task 1: Ruling: M1 plain-export test literal schemaVersion 1→2 updated (intended bump) — cost if wrong: none.
- Task 2: Ruling: router is created once (lazy module singleton in Root) and reused across lock/unlock instead of "created per mount and disposed in an effect cleanup" — React StrictMode runs mount→cleanup→mount, which would dispose the live router; one router has no listener leak and keeps the user's screen after auto-lock — test "reuses one router…" — cost if wrong: none.
- Task 2: Ruling: toastStore exported (vanilla zustand) so toast timing is unit-testable in node — cost if wrong: none.
- Task 2: Ruling: backup.spec e2e wrong-passphrase expectation updated to the new restore copy (intended change) — cost if wrong: none.
- Task 3: Ruling: a single "." followed by exactly 3 digits is rejected as ambiguous (12.345 could be 12.345 or 12,345); a single "," with 3 digits is grouping (1,234 → 1234.00). The brief's rule 3 said "exactly 3 digits ⇒ grouping" for either mark but its own test list rejects '12.345' — tests win; never 100× off — cost if wrong: Europeans typing "1.234" must type "1234".
- Task 3: Ruling: added formatMoneyPlain and currencySymbol helpers in money.ts (MoneyField needs them) — cost if wrong: none.
- Task 5: Ruling: examples carry an id (EXP-1, BAL-1, …) and examples.test.ts maps each id to its domain calculation; examples.ts exports small deterministic builders (ex.*) reused by later examples; every example's data must pass SnapshotSchema — cost if wrong: none.
- Task 6: Ruling: AVL-1 available corrected to 2_654_01 — the plan's 1_654_01 was an arithmetic slip (1,100 + 3,000 − 245.99 − 1,200 = 2,654.01); Task 12's dashboard expectation follows the corrected value — cost if wrong: none.
- Task 8: Ruling: sync runs at the end of every openWith (boot/unlock/startFresh/startDemo) and on visibility/focus; added pure applyRecords(data, items) in sync.ts for previews and the SUB-1 example — cost if wrong: none.
- Task 8: Ruling: the M1 "failed demo start" test now restores deps.today after simulating the failure — the store calls today() on every boot (sync), and the test's throwing clock otherwise broke its own reboot — cost if wrong: none.
- Task 9: Ruling: added wouldCrossOver(input) to actions (wraps crossesOver with a probe expense) so the Add form doesn't build entities itself — cost if wrong: none.
- Task 9: Ruling: addIncome for a salary month that already has an *expected* salary confirms that record (new amount/date) instead of adding a duplicate — prevents double-counted pay — cost if wrong: a deliberate second salary in one month needs source "extra".
- Task 9: Ruling: actions refuse future dates (addExpense, updateExpense, addIncome, contributeToGoal, payDebt, setActualBalance) with "Use today or an earlier date." — defense behind the form — cost if wrong: none.
- Task 9: Ruling: addExpense with repeat and saveSubscription call sync() afterwards so backdated renewals materialize at once; freezes re-price expected salaries and remove any that fall to 0 — cost if wrong: none.
- Task 9: Ruling: onboarding cards get interestRate 0, minimumPayment 0, statementDay null (not asked in onboarding; editable in Goals & debts) — cost if wrong: a non-pay-in-full card shows a $0 minimum until edited.
- Task 9: Ruling: test helper src/test/realStore.ts (real store over fake-indexeddb) added for action tests — cost if wrong: none.
- Task 11: Ruling: setSecret runs BEFORE completeOnboarding (brief said after) — saving the profile flips Root to the Dashboard at once, so a reload/close during PBKDF2 left the vault without the chosen lock (caught by e2e); lock-first keeps the wizard up until the lock holds — cost if wrong: a failed profile save leaves a locked, un-onboarded vault that re-enters the wizard after unlock.
- Task 11: Ruling: onboarding e2e asserts Home + PIN in force after reload; the "Available balance $6,000.00" assertion moves to Task 12 when the Dashboard exists — cost if wrong: none.
- Task 11: Ruling: Root navigates the shared router to "/" while onboarding shows, so finishing lands on the Dashboard even if a demo session left another screen open (found via backup e2e) — cost if wrong: none.
- Task 11: Ruling: step 6 validates the secret on "Start my adventure" with inline errors instead of a disabled button; card form has Save card/Cancel, Next disabled while it is open, due day defaults to 1; switching to a currency with other decimals clears entered amounts — cost if wrong: copy/polish only.
- Task 12: Ruling: dashboard test expects available $2,654.01 (brief said $1,654.01) — per Task 6's AVL-1 correction — cost if wrong: none.
- Task 12: Ruling: KPI row and section grid go multi-column at lg (1024px), not md — the 210px sidebar leaves ~490px of content at md, too narrow for a 48px figure in 3 columns; mockup D's own container query collapses below 1000px — cost if wrong: portrait tablets get the stacked layout.
- Task 12: Ruling: UI tests build expected money/date text with the app's formatters (this machine's locale en-NL prints "US$"); Playwright pinned to locale en-US so e2e text is fixed; formatting itself stays pinned by money.test.ts — cost if wrong: none.
- Task 12: Ruling: additions beyond the brief — ButtonLink, compact PageHeader, lib/format (formatDay/formatMonth/relativeDays), Goals empty state "No goals yet"/"Add a goal", "$x left/over" under warn/over limit bars, salary Confirm named "Confirm {Month} salary" — cost if wrong: polish only.
- Task 13: Ruling: additions beyond the brief — Save/Cancel buttons (Cancel goes back), category defaults to Food, amount error "Enter an amount like 12.50", hints for card payments and repeats, the quick-add button hides on /add (it only covered the form), date rule split into features/add/pastDate.ts for react-refresh — cost if wrong: polish only.
- Task 14: Ruling: limits are hairline rows in a Section, not Cards as the brief says — the plan's Global Constraints (Pro Ledger, "no box cards on screens") and the user's "less box styling" request outrank the task text — cost if wrong: a restyle of one list.
- Task 14: Ruling: additions beyond the brief — Cancel button, success toasts (Limit added/updated/deleted), Delete without a confirm step (a limit is quick to re-create), "{x} left" line tinted by level, empty states for both sections, 7fr/5fr grid at lg like Home — cost if wrong: polish only.
- Task 15: Ruling: setSubscriptionStatus(id,'active') rolls nextRenewal forward past today — otherwise sync charged every renewal missed while cancelled (found reading sync; test "resuming a long-cancelled subscription skips the renewals missed while it was off") — cost if wrong: a resumed sub's first charge lands on its next anchor date instead of today.
- Task 15: Ruling: "Next renewal" must be today or later when set or changed (a past date back-charges every missed renewal at once) — cost if wrong: someone recording an old subscription must add past charges as expenses.
- Task 15: Ruling: amount reads "{amount} / month" (noun) rather than "/ monthly"; audit chips toggle off when pressed again; summary sits in the PageHeader subtitle; new Menu primitive (ui/Menu.tsx) and shared features/shared/paidWith.ts (ExpenseForm moved onto it) — cost if wrong: polish only.
- Task 16: Ruling: Profile's Currency select lists only currencies with the same number of decimals as the current one — amounts are stored in minor units, so USD→JPY would silently turn $42.00 into ¥4,200 — cost if wrong: switching to a currency with other decimals needs a fresh start.
- Task 16: Ruling: Preferences save on change (like Theme) with one example line for the selected style instead of three; Profile "Monthly take-home pay" left empty = no salary; freeze dates start empty and the preview appears once both are valid; currency list moved to features/shared/currencies.ts; Settings uses PageHeader — cost if wrong: polish only.
- Task 17: Ruling: monthly-to-goal rule lives in domain/goals.ts (monthlyToReach, with tests) rather than in the screen — money math stays in the domain per the codebase rules — cost if wrong: none.
- Task 17: Ruling: editing a card or loan edits its opening balance, labelled "Balance when added" with the opening date (showing today's computed balance there would double-count purchases and payments on save) — cost if wrong: one label.
- Task 17: Ruling: additions beyond the brief — PayDialog refuses paying more than is owed, loans default to min(minimum payment, balance), "Due on the 21st" ordinal, "Goal reached!" / "Deadline passed · {x} to go" lines, goal and debt empty states, formatDate/ordinal in lib/format — cost if wrong: polish only.
- Task 18: Ruling: deleting an income or transaction from History asks first ("Delete this entry?") — brief only said "get Delete"; there is no undo — cost if wrong: one extra tap.
- Task 18: Ruling: ExpenseForm gained an edit mode (prefilled, no Repeats, no strict limit check — the probe would double-count the expense being edited — plus Delete) instead of a second form; "Already matches." disables Save; CSV export is hidden in demo like the plain export; formatMonthYear added to lib/format — cost if wrong: polish only.
- Task 18: Ruling: CSV notes are written as typed (no spreadsheet-formula escaping of a leading =, +, - or @) — the file is the user's own data, for their own sheet — cost if wrong: a note starting with "=" runs as a formula when opened in a spreadsheet.
- Task 19: Ruling: e2e onboard() keeps Task 11's option shape (salary: { amount, payDay }) rather than the brief's flat salary/payDay — Task 11's helper is the existing interface — cost if wrong: none.
- Task 19: Ruling: the debt row always shows the balance figure ($0.00 when paid) instead of "Paid off", matching the brief's expectation and the other rows — cost if wrong: one label.
- Task 19: Ruling: manual pass found two real defects, fixed with tests: (1) cn() joins without merging, so `variant="ghost" className="text-danger"` Delete buttons rendered in body colour — new Button variant "danger-ghost" (test "has a quiet danger style with exactly one text colour"), six call sites moved; dead `last:border-b` overrides removed; (2) Home's three action pills wrapped at 375px — small buttons now px-3 with a 6px icon gap — cost if wrong: small buttons 2px narrower everywhere.
- Task 19: Ruling: added .claude/launch.json entry "funancial-dev-clean" (127.0.0.1:5174, its own browser storage) so demo data can be viewed without erasing the localhost test vault — cost if wrong: none.

## Final review

- Final review: fresh reviewer (Opus) on 0300d35..943e27a — verdict "Ready to merge: with fixes"; 0 Critical, 4 Important, 17 Minor.
- Final: re-graded Minor 5 (routed screens crash to React Router's stack-trace page), Minor 7 (a sync failure at open shows "Storage unavailable" though the data loaded) and Minor 11 (long currency symbols overlap digits in every amount field, incl. "US$" in the user's en-NL locale) to Important by effect.
- Final: fixed expected salary that can't be dismissed / backfills — sync tests "does not expect pay on the opening day", "does not backfill months from before the salary was set" (+ pinning test "keeps a month marked as not arrived from coming back", green before the fix), action tests "a salary set today only expects pay days after today", "marking it as not arrived keeps it out of balances and the banner, for good", dashboard "lets a salary that never came be marked as not arrived" RED→GREEN; Income status gains `skipped`, Profile.salary gains optional `since`, deleting an expected salary skips it, addIncome confirms a skipped month — suite 376/376.
- Final: fixed deleteDebt allowing a card that a subscription pays with — "is refused, so later renewals never point at a missing card" RED→GREEN, suite 376/376.
- Final: fixed a non-pay-in-full card with no minimum billing $0 — "bills the whole balance instead of nothing" RED→GREEN (Home label reads "full balance"), suite 376/376.
- Final: fixed toasts rendering under modal dialogs (inert, unannounced) — "shows messages inside an open dialog, where they can be read and dismissed" RED→GREEN; Dialog registers in lib/dialogStack, Toaster portals into the top dialog — suite 376/376.
- Final: fixed routed crashes showing the router's default error page — router.test "shows the friendly crash screen when a screen throws" RED→GREEN; CrashScreen shared with ErrorBoundary — suite 376/376.
- Final: fixed a sync failure at open sending the app to "Storage unavailable" — "still opens the data instead of claiming storage is unavailable" RED→GREEN — suite 376/376.
- Final: fixed long currency symbols overlapping amounts — "leaves room for a long currency symbol before the digits" RED→GREEN — suite 376/376, e2e 34 passed.

### Rulings on what the reviewer declined to judge

- visual match to mockup D (reviewer declined) — checked in the browser pane at 375px and 1280px, light and dark, during Task 19; two defects found there were fixed — cost if wrong: a restyle pass.
- an overall and a category limit both marked "reserve" each hold back their unspent part (they can overlap) — the spec's rule is per limit and reserve is off by default — cost if wrong: Available understated for someone reserving both.
- loan minimum payments are not upcoming bills — the spec names subscriptions and card balances only — cost if wrong: Available overstated by loan payments due this month.
- cards are billed in full (or the minimum) regardless of statement cycle — the spec's chosen model — cost if wrong: Available understated between statement and due date.
- 3-decimal currencies read "12,345" as 12.345 — consistent with the parse rule; none are in the common list — cost if wrong: a 1000× entry error for those few currencies, visible on blur.
- NFC-normalizing secrets stays — M1 isn't released, no real vaults exist — cost if wrong: none today.
- a backdated repeat expense charges the missed renewals at once — matches what happened — cost if wrong: a few expenses to delete.
- performance with years of data not measured — revisit in M3 with real use on the phone — cost if wrong: slow screens later.
- reviewer didn't run the suites — verified at the fix-pass HEAD: 376/376 unit, 34 e2e passed (2 skipped), typecheck and lint clean.

## Deferred minors

- parseMoney silently accepts some typos ("1O0"→10.00, "−5"→5.00, "(5)", "12 34"→1,234.00, "e5"); rejects Indian "1,00,000".
- `today` refreshes only on focus/visibility; a desktop tab left focused overnight keeps yesterday.
- small money arithmetic in UI (ActualBalanceDialog delta, goal remaining, goal/limit/payoff percentages) belongs in domain.
- deleting a goal contribution transfer leaves the goal's saved amount.
- Freeze form keeps showing the manual amount after saving (MoneyField keeps its own text).
- resume, deleteFreeze, updateProfile and restoreBackup don't sync() right away (catch up on next focus).
- Home's "X this month" bill total includes a card bill dated next month.
- onboarding "What you have now" vs the opening-day rule — copy should say "as of this morning".
- danger toasts auto-dismiss after 6s; Menu doesn't return focus after an item; History delete labels can repeat ("Delete Salary").
- overlapping freezes both apply; computed freeze list shows a stale lost amount after a salary change; preview shows before→after for already-confirmed months.
- two-tab races (stale sync write on focus; refresh dropping a concurrent local write) — unlikely.
- rows skipped at v1 load are stamped v2 and never migrated if later readable.
- negative balances (overdraft) can't be entered at onboarding or in Set actual balance.
- CSV has no UTF-8 BOM (Excel garbles accents).
- IncomeForm defaults to Salary, so a gift saved with the default silently confirms that month's expected salary.
