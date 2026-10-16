# Funancial M7: Guidance and polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** drafted overnight. The owner asked me to keep building, and the owner's rule is "a wireframe before each milestone". So Tasks 1–5 reuse styles the owner has already approved: the Open style, line fields, underline tabs, the gradient Banner. Task 6, the guided tour, has a new look and waits for the owner to approve `design/wireframes/m7-guidance.html`.

**Goal:** Help that explains every number from the app's own rules. A "?" next to key numbers. An inbox for reminders you swiped away. The rest of the forms in the lighter style. An accessibility pass.

**Architecture:**
- **Help.** Help content is data in `src/content/help/`. Each "how your numbers work" page renders a worked example from `src/domain/examples.ts` (`EXAMPLES`), which the domain tests already assert, so Help can never disagree with the rules.
- **"?" tips.** A small `HelpTip` component links key numbers to their pages.
- **Inbox.** The inbox is derived from the same reminder rules as `src/domain/notifications.ts`, run over the last 30 days, with read state in settings.

**Tech Stack:** unchanged. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-14-funancial-design.md` M7 (the AI items are dropped, per the owner's M6 decision), `docs/spec/original-spec.md` Help/guidance, and the wireframe `design/wireframes/m7-guidance.html`.

## Calls this plan makes

1. **Help pages (Menu → Help):**
   - Available to spend (AVL-1)
   - Limits and warnings (LIM-1)
   - Salary and freezes (SAL-1)
   - Cards and balances (BAL-1, EXP-1)
   - Subscriptions (SUB-1)
   - Dividends (how expected payouts are worked out, confirm and reinvest)
   - Should I buy it? (the meter table and the guards)
   - Levels, quests and coins
   - Words (glossary), FAQ, Privacy, Terms
   - Disclaimers: not financial advice; market data is delayed; news is third-party.

   No AI disclaimer: there is no AI.
2. **"?" tips** sit on six numbers: Available to spend, Net worth, a limit row, Portfolio value, Profit & loss and the buy meter. Each opens a two-line summary with `How it's worked out ›`.
3. **Inbox** shows reminders that would have fired in the last 30 days, newest first.
   - Daily-log nudges and backup reminders are left out, because they would flood it.
   - It shows even when phone reminders are off, but respects each per-kind switch.
   - "Mark all as read" sets a read-before time. Opening one marks it read.
4. **Forms in the line style:**
   - Add expense / income, limit, goal, debt, pay card or loan, subscription, freeze, set actual balance, confirm salary and confirm dividend.
   - Settings: profile, preferences, PIN/passphrase, and onboarding.
   - Category stays a select (line variant). "Paid with" becomes underline tabs when there are 4 or fewer choices, and a select otherwise.
5. **Accessibility pass** against WCAG 2.2 AA:
   - one `h1` per screen;
   - landmarks;
   - visible focus;
   - focus return after dialogs;
   - labels on icon buttons;
   - text alternatives on every chart;
   - contrast tokens tested;
   - `motion-safe:` everywhere;
   - 44px targets.
6. **Guided tour** (5 steps on demo money, skippable, replay from Help). Built only after the owner's OK.
7. **Not in M7:** search across the whole app, video, more languages, Settings reorganisation.

## Global Constraints

- **No new dependency.**
- **The Open style:**
  - line fields and underline tabs for forms;
  - the gradient Banner;
  - touch targets ≥ 44px;
  - labels on every action;
  - motion only under `motion-safe:`.
- **Help content:** plain, short, non-shaming sentences. Every number on a help page comes from `EXAMPLES` or the app's live data, never typed by hand. Money goes through `formatMoney` in the profile currency.
- **Schema:** the settings change for the inbox's read state is schema v9, with a spelled-out migration step.
- **Commits** end with your model's `Co-Authored-By` trailer.
- **Gate for every task:** `npm test`, `npm run typecheck`, `npm run lint`. UI tasks also run `npm run test:e2e`.

## Review Focus

1. **Help never contradicts the app.** Each example page's figures equal the domain result for that example. Pinned in Task 1.
2. **The inbox doesn't flood or repeat.** No daily-log or backup items, one row per reminder key, and it is empty for a brand-new profile. Pinned in Task 3.
3. **The restyle loses no validation or behaviour.** Every existing form test stays green unchanged, apart from label or class selectors. Pinned in Tasks 4–5.
4. **Keyboard and screen reader work end to end** on the main flows: add an expense, set a limit, ask Buy it?. Pinned in Task 5's e2e.
5. **"?" tips never block the number or its tap.** The tip's own button is separate, with its own accessible name. Pinned in Task 2.

---

### Task 1: Help content and the Help screens

**Files:**
- Create: `src/content/help/{pages.ts,glossary.ts,faq.ts,legal.ts,index.ts}` and `src/features/help/{HelpScreen.tsx,HelpPage.tsx,ExampleTable.tsx}`, plus tests
- Modify: `src/app/routes.tsx` (`/help`, `/help/:id`), `src/app/menu.ts` (Help without `soon`)

**Interfaces:**
- `type HelpPage = { id: string; title: string; summary: string; group: 'numbers' | 'how' | 'more'; body: string[]; exampleIds?: string[] }`.
- `HELP_PAGES: HelpPage[]`, `GLOSSARY: Array<{ term; meaning }>`, `FAQ: Array<{ q; a }>`, `LEGAL: { privacy: string[]; terms: string[]; disclaimers: Array<{ title; text }> }`.
- `helpPage(id): HelpPage | undefined`.

**Screens:**
- **Help index:** a `Search help` line field filtering by title and summary; three groups (`How your numbers work`, `How it works`, `More`), each row with title and summary.
- **A page:** title, summary, body paragraphs, then for each example an `ExampleTable`. It renders that `WorkedExample` from `src/domain/examples.ts`: its `title`, its `steps` as an ordered list, and its `result` as label → value rows, with money through `formatMoney` in the example profile's currency. Give the `result` keys readable labels in a map next to the page; a key with no label is a test failure. Vitest already checks each `result` against the real domain functions (`src/domain/examples.test.ts`), so the page shows exactly what the app computes.
- **Should I buy it?** page: the zone table and the guard cap come from the domain, not typed in. Today `zone()` in `src/domain/advisor/meter.ts` and the guard cap use inline literals, so export them as named constants (`WAIT_FROM = 34`, `BUY_FROM = 67`, `GUARD_CAP = 66`) from `src/domain/advisor` and use them in both the rules and the page: Skip 0–33, Wait 34–66, Buy 67–100, and a guard caps the meter at 66.
- **Glossary, FAQ and legal** are pages too.
- **Disclaimers:**
  - `Funancial is not financial advice. It shows your own numbers so you can decide.`
  - `Market prices are delayed and may be out of date.`
  - `Headlines come from a third party. Funancial doesn't check them.`

- [ ] **Steps:**
  1. Write tests:
     - every page renders;
     - search filters;
     - each example table shows every `result` key with a label and its formatted value, plus every step;
     - every `exampleIds` entry exists in `EXAMPLES`;
     - the menu has Help.

     Watch them fail.
  2. Implement.
  3. Run the gate and e2e.
  4. Commit: `feat: Help center built from the app's own rules`

### Task 2: "?" help tips on key numbers

**Files:**
- Create: `src/components/ui/HelpTip.tsx`, plus tests
- Modify: `src/features/dashboard/HomeHero.tsx`, `NetWorthSection.tsx`, `LimitsSection.tsx`, `src/features/invest/HoldingsTab.tsx`, `ProfitAndLoss.tsx`, `src/features/buy/BuyMeter.tsx` (or `AnswerScreen.tsx`)

**What to build:**
- `HelpTip({ pageId, label })`: a 44px button showing a small "?", with the accessible name `What is ${label}?`.
- It opens a popover. Use the existing `Sheet` on phones, or a small anchored panel if the codebase has one; pick one and say which.
- The popover shows the page's title and `summary`, then a `How it's worked out ›` link to `/help/${pageId}`. It closes with Escape or a tap outside, and focus returns to the "?".

- [ ] **Steps:**
  1. Write tests:
     - each of the six numbers has its tip;
     - the accessible name;
     - open, close and focus return;
     - the link;
     - the number's own tap still works.

     Watch them fail.
  2. Implement.
  3. Run the gate and e2e.
  4. Commit: `feat: "?" tips on key numbers`

### Task 3: Inbox

**Files:**
- Modify: `src/domain/notifications.ts`, `src/domain/entities.ts` (Settings `inbox: { readBefore: Iso | null; read: string[] /* ≤ 200 keys */ }`), `snapshot.ts` (v9), `migrations.ts` (a spelled-out step 9 adding `inbox`), fixtures
- Create: `src/features/inbox/InboxScreen.tsx`, `src/store/inboxActions.ts`, plus tests
- Modify: `routes.tsx` (`/inbox`), `menu.ts` (Inbox without `soon`), `useMenuSubtitles.ts` (`${n} new`)

**Interfaces:**
- `pastReminders(data, now, days = 30): Reminder[]`. It runs the same rules over `[now − days, now]`, ignores `prefs.enabled`, honours each per-kind switch, leaves out `daily-log` and `backup`, keeps one per key, and sorts newest first. Share the rule list with `upcomingReminders`; don't copy it.
- `inboxItems(data, now): Array<Reminder & { read: boolean }>`.
- `REMINDER_AREA: Record<ReminderKind, string>` for each row's area label:
  - renewal → `Subscriptions`
  - card-due → `Cards`
  - freeze-start and freeze-end → `Salary freeze`
  - weekly-review and monthly-review → `Budget`
  - dividend-ex and dividend-pay → `Invest`
  - buy-wait and buy-usage → `Buy it?`
  - daily-log → `Today` and backup → `Backup` (the inbox leaves these two out, but the map stays exhaustive)
- Actions: `markRead(key)` and `markAllRead()`. Read keys are capped at 200, oldest dropped.

**Screen:** `New (n)` / `All` underline tabs, rows with title and `${area} · ${when}`, an unread dot, a tap that opens `route` and marks the row read, and `Mark all as read`. Empty state: `Nothing here yet. Reminders you miss will show up here.`

- [ ] **Steps:**
  1. Write tests:
     - the window;
     - per-kind switches;
     - no daily-log or backup;
     - dedupe;
     - read and read-all;
     - the 200 cap;
     - the migration;
     - the screen and the menu subtitle.

     Watch them fail.
  2. Implement.
  3. Run the gate and e2e.
  4. Commit: `feat: inbox of recent reminders`

### Task 4: Money forms in the line style

**Files:** `src/features/add/{ExpenseForm,IncomeForm,DateField}.tsx`, `budget/LimitDialog.tsx`, `goals/{GoalDialog,DebtDialog,PayDialog}.tsx`, `subscriptions/SubscriptionDialog.tsx`, `freeze/FreezeScreen.tsx`, `history/ActualBalanceDialog.tsx`, `dashboard/ConfirmSalaryDialog.tsx`, `invest/ConfirmDividendDialog.tsx`, plus their tests

**What to build:**
- Switch each field to the `variant="line"` of `TextField` / `MoneyField` / `Select` / `DateField`.
- Turn radio groups and short selects of 4 or fewer choices into the underline tabs already used in Invest and Buy it?.
- Change no validation, copy or behaviour.
- Add Expense's amount field shows larger (20px), as in the wireframe.
- Carried from M6: `LimitDialog`, `SubscriptionDialog` and `HistoryScreen` drop their own category lists and use `CATEGORY_OPTIONS` from `src/features/shared/categories.ts`.

- [ ] **Steps:**
  1. Update the selectors in the existing tests only where a role changes (select to tabs), and add a class test per form. Watch the class tests fail.
  2. Implement.
  3. Run the gate and e2e.
  4. Look at each form at 375px in light and dark.
  5. Commit: `style: money forms in the line style`

### Task 5: Settings and onboarding in the line style, plus the accessibility pass

**Files:**
- `src/features/settings/*.tsx`, `src/features/onboarding/OnboardingWizard.tsx`, `src/features/system/EraseDialog.tsx`, plus tests
- Accessibility fixes anywhere in `src/`
- `tests/e2e/a11y.spec.ts`

**What to build:**
- **Line style:** as in Task 4, for these screens.
- **Audit:** go through every screen against the Calls #5 list and fix what fails. Record each finding and fix in the report.
- Carried from M6: the shared `TextField` / `MoneyField` error line is announced when it appears after blur (`role="alert"` or a polite live region), not only through `aria-describedby`.
- **e2e (keyboard only):** add an expense, set a limit, ask Buy it?. Assert focus is visible and returns after each dialog.

- [ ] **Steps:**
  1. Write the a11y e2e and the class tests, and watch them fail.
  2. Implement.
  3. Run the gate and e2e.
  4. Commit:
     - `style: settings and onboarding in the line style`
     - `fix: accessibility pass`

### Task 6: Guided tour on demo money (only after the owner approves the wireframe)

**Files:** `src/features/tour/*` and `src/app/AppShell.tsx` (mount); Help gets `Replay the tour`.

**What to build:**
- Five steps the first time demo money opens: Available, the Expense action, a limit row, Invest, Buy it?.
- Each step is a dark card with `Step n of 5`, its text, `Skip tour` and `Next ›`. It is anchored to its element, with the rest dimmed.
- The "seen" flag is kept per device with `safeStorage`.
- `Escape` skips. Focus moves into the card and returns afterwards.
- Motion runs only under `motion-safe:`.

- [ ] **Steps:**
  1. Write the tests and watch them fail.
  2. Implement.
  3. Run the gate and e2e.
  4. Commit: `feat: guided tour on demo money`

---

## Milestone checkpoint (M7 done)

Every number can explain itself, missed reminders wait in the inbox, and every form looks like the Invest forms. The app passes a keyboard and screen-reader run of the main flows. Next is M8: the desktop PWA.
