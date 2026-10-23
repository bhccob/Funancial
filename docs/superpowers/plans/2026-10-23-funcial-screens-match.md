# Every Screen Matches (0.13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen 0.12 left untouched into the glass look, and add what the owner
asked for:
- a bigger Home balance and bigger cards
- Shop and Quests on Home
- "which card paid" everywhere
- editable Recent rows
- the Invest pie with floating logo labels

**Architecture:**
- Shared surfaces change first (page header, sections, buttons, form controls, `Sheet` and
  `Dialog` shells), so most screens follow without a rewrite.
- Each screen group then gets a pass that swaps boxed sections and old patterns for
  `PlainSection` / `ROWS` / glass pills.
- The new behaviour is small and local:
  - a card mark in the shared `entryLine`
  - a `lastSpend` store
  - the Pay done step
  - Home's strip
  - the pie's label layout and logo colours

**Tech Stack:** React 19, TypeScript, Tailwind 4, zustand, vitest + Testing Library,
Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-23-funcial-screens-match-design.md`. Mockups are in
`design/redesign-v4/`. The base look is `design/redesign-v3/glass-themes.html` and
`src/styles/themes.css`.

## Global Constraints

- **Branch:** `feat/screens-match`, from `main` at `8931a1b`. Never push, PR, merge or deploy.
- **Version:** 0.13 (`versionCode 13`, `versionName "0.13"`).
- **No changes to:** the schema, money calculations, or dependencies. Money is integer minor
  units.
- **Restyle, not restructure** (spec "My calls"). Screens keep their structure, controls and
  behaviour. Tests that assert behaviour keep asserting it; only class or markup pins the
  restyle changes may change, and each task's report lists them.
- **Inner screens (option B):**
  - a plain `text-page` title on the light page
  - a round glass back button (44px) where the screen was opened from another screen; it goes
    back in history, or to `/` with none
  - the theme block (`HeadBlock`) only on Home, Cards, Profile and the Shop
- **Lists** are plain rows with `ROWS` hairlines. Glass only on buttons, pills and round icon
  chips. No boxed sections (`GlassTile` only for charts and summaries).
- **Contrast** in all 12 themes and in dark mode:
  - text ≥ 4.5:1 on its surface
  - large text (≥ 24px, or ≥ 18.66px bold) ≥ 3:1
  - UI marks ≥ 3:1

  New colour pairs are pinned in `tests/unit/tokens.test.ts` the way 0.12 pins them.
- **Tap targets** ≥ 44px. Icons lucide only. Reduced motion gives fades only.
- **Hidden amounts:** the eye's "hidden" state masks every new amount (`useMoney` / `HIDDEN_AMOUNT`).
- **Commits:** lower-case conventional, each ending with its author's Co-Authored-By trailer.
- **Before Playwright:** check that ports 4173 and 4174 are free
  (`netstat -ano | grep -E ":(4173|4174) .*LISTEN"`).

## Review Focus

1. **A long balance on a 360px phone:** "Afl. 1,234,567.89" at 52px must shrink to fit (down
   to 40px) without overflowing. Task 6 test `long balances shrink to fit`.
2. **Hidden amounts:** every new figure is masked when the eye is off: the "left" figure, the
   "just now" chip, the done step's "Paid Afl. X", and the pie labels' percents stay (a share
   is not an amount). Task 6 and Task 7 tests named `… masks with the eye`.
3. **Every theme and dark mode:** card marks, the Home strip, the pie badges and the restyled
   controls stay readable. Task 1 / 6 / 8 pins in `tokens.test.ts`, and Task 9's axe run.
4. **Editing and deleting from Recent:**
   - an expense edited from Home updates Recent and History alike
   - deleting a stock buy from Recent behaves exactly as from History (same confirm, same
     action)

   Task 6 test `Recent edits and deletes as History does`.
5. **The pie with many holdings, no logos, or logos that fail offline:**
   - nothing crashes
   - no label is dropped
   - labels never overlap
   - slices fall back to chart colours

   Task 8 tests `ten holdings keep every label apart` and `logos that fail keep chart colours`.

---

### Task 1: Shared surfaces

**Files:**
- Modify:
  - `src/components/ui/PageHeader.tsx`
  - `src/components/ui/Section.tsx`
  - `src/components/ui/Button.tsx`
  - `src/components/ui/Dialog.tsx`, `src/components/ui/Sheet.tsx`
  - `src/components/ui/Card.tsx`, `src/components/ui/Banner.tsx`, `src/components/ui/EmptyState.tsx`
  - `src/styles/index.css` (a `glass-sheet` utility)
- Test: `src/components/ui/kit.test.tsx`, `src/components/ui/ui.test.tsx`, `tests/unit/tokens.test.ts`

**Interfaces:**
- **Produces:**
  - `PageHeader({ title, action?, children?, back?: boolean })`: `text-page` title; with
    `back`, a 44px `glass` round button (lucide `ChevronLeft`, named "Back") before the title.
    It calls `navigate(-1)`, or `navigate('/')` when `location.key === 'default'`.
  - `Section`: same props; it now renders like `PlainSection` (`text-section` title, `pt-[22px]`,
    no bottom border), so every old section loses its hairline box.
  - `Button` variants:
    - `secondary` and `ghost` become glass pills (`glass`)
    - `primary` stays solid ink
    - `danger` stays
  - `Sheet` and `Dialog` shells use `glass-sheet`: the surface at .9 opacity, a 1px white top
    line, `blur(24px) saturate(180%)`, `rounded-t-sheet` (sheet) and `rounded-[24px]`
    (dialog). The dark mode surface comes from tokens.
  - `Card` becomes `GlassTile`'s look. `Banner` keeps its tones and gets 24px corners.

- [ ] **Step 1: Update the tests:**
  - `PageHeader` with `back` renders a "Back" button that calls history back
  - `Section` has no border class and a `text-section` heading
  - `Button` `secondary` has `glass`
  - `Sheet` and `Dialog` have `glass-sheet`
  - `tokens.test`: text and muted text ≥ 4.5:1 on `glass-sheet` over the page in every
    theme × mode
- [ ] **Step 2: Run** `npx vitest run src/components/ui tests/unit/tokens.test.ts`. Expected:
  FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`. Expected: PASS. Update only
  the class pins the restyle changes, and list them in the report.
- [ ] **Step 5: Commit:** `feat: glass page headers, sections, buttons and sheets`.

### Task 2: The Expense and Income forms

**Files:**
- Modify:
  - `src/features/add/ExpenseForm.tsx`, `src/features/add/IncomeForm.tsx`
  - `src/features/add/AddScreen.tsx`, `src/features/add/DateField.tsx`
  - `src/components/ui/MoneyField.tsx`, `src/components/ui/RadioGroup.tsx`
  - `src/components/ui/Select.tsx`, `src/components/ui/TextField.tsx`
- Test: `src/features/add/add.test.tsx`, `src/components/ui/*.test.tsx`

**Interfaces:**
- **Consumes:** Task 1's `PageHeader back`, `Button`, `Sheet`.
- **Produces:**
  - `MoneyField` `size="hero"`: the amount at 40px/700 with a dimmed currency.
  - `RadioGroup` `variant="pills"`: options as 32px `glass` pills (44px tap area); the chosen
    one solid `bg-primary text-primary-contrast`. Keyboard and `aria` behaviour stays as
    today's radio group.
  - `Select`, `TextField` and `DateField`: a plain row look (label left, value right, `ROWS`
    hairline), keeping their native controls and labels.
- **The forms:**
  - the amount is `hero`
  - the category is `pills`
  - the account, date, note and repeat are plain rows
  - Save is solid; Cancel and Delete stay as they are, restyled
  - `AddScreen` uses `PageHeader title="Add" back`

- [ ] **Step 1: Update `add.test.tsx`:** the category radios are still radios named as today; the
  chosen one carries `bg-primary`; Save, Cancel and Delete keep their names; the amount field
  keeps focus on open.
- [ ] **Step 2: Run** `npx vitest run src/features/add src/components/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `finance` and `a11y` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the expense and income forms in glass`.

### Task 3: Settings, Inbox and Help

**Files:**
- Modify:
  - `src/features/settings/*.tsx`
  - `src/features/inbox/InboxScreen.tsx`
  - `src/features/help/HelpScreen.tsx`, `src/features/help/HelpPage.tsx` and the help parts
    they render (glossary, FAQ, example tables)
- Test: `src/features/settings/*.test.tsx`, `src/features/inbox/*.test.tsx`, `src/features/help/*.test.tsx`

**Interfaces:**
- **Consumes:** Task 1 and Task 2 controls.
- **Rules:**
  - Each screen uses `PageHeader … back` (Settings, Inbox and Help are opened from Profile or
    Home).
  - Sections are `PlainSection` with `ROWS` lists. Switches and rows sit as plain rows, each
    with a round glass icon chip where the row has an icon.
  - Help pages keep their prose, set as plain text on the page, with example tables in a
    `GlassTile`.
  - Settings stays one page (Phase 10 splits it).

- [ ] **Step 1: Update tests:** a "Back" button on Settings, Inbox and Help; every existing
  behaviour test passes unchanged in what it asserts.
- [ ] **Step 2: Run them.** Expected: FAIL on the back button.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `account-settings`, `security`, `help`, `inbox` and `contrast` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: settings, inbox and help in glass`.

### Task 4: Quests, Goals and Loans

**Files:**
- Modify:
  - `src/features/quests/*.tsx`
  - `src/features/goals/GoalsScreen.tsx`, `src/features/goals/DebtsScreen.tsx` and their dialogs
    (`GoalDialog`, `LoanDialog`, `PayDialog`, `CardSheet`)
- Test: `src/features/quests/quests.test.tsx`, `src/features/goals/*.test.tsx`

**Interfaces:**
- **Rules:**
  - as Task 3: `PageHeader … back`, `PlainSection` / `ROWS`
  - goal rings and progress bars stay; the quest list and badges become plain rows
  - streak and challenge summaries go in a `GlassTile` only where today's screen shows a
    summary figure

- [ ] **Step 1: Update tests:** "Back" on each screen; behaviour unchanged.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `game` and `navigation` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: quests, goals and loans in glass`.

### Task 5: Bills & cards, Income and History

**Files:**
- Modify:
  - `src/features/subscriptions/*.tsx`
  - `src/features/shared/BillRow.tsx`
  - `src/features/income/IncomeScreen.tsx`
  - `src/features/history/HistoryScreen.tsx`, `src/features/history/ActualBalanceDialog.tsx`
- Test: `src/features/subscriptions/*.test.tsx`, `src/features/income/*.test.tsx`, `src/features/history/*.test.tsx`

**Interfaces:**
- **Rules:**
  - as Task 3
  - History's filters become glass pills, and its rows plain rows
  - Income's bar chart sits in a `GlassTile`
  - Bills keeps its sections (Card payments, Active, Cancelled) as `PlainSection` lists

- [ ] **Step 1: Update tests:** "Back" on each screen; behaviour unchanged.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `finance` and `navigation` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: bills, income and history in glass`.

### Task 6: Home — bigger balance, the Shop/Quests strip, card marks, editable Recent

**Files:**
- Create:
  - `src/features/dashboard/QuestShopStrip.tsx`
  - `src/domain/cardMark.ts`
- Modify:
  - `src/features/dashboard/HomeHero.tsx`, `src/features/dashboard/DashboardScreen.tsx`
  - `src/features/dashboard/RecentSection.tsx`
  - `src/features/shared/entryLine.ts`, `src/features/shared/EntryParts.tsx`
  - `src/features/history/HistoryScreen.tsx` (shares the editing pieces with Recent)
  - `src/domain/game/quests.ts` (a selector, if needed)
  - `tests/unit/tokens.test.ts`
- Test:
  - `src/features/dashboard/dashboard.test.tsx`
  - `src/features/shared/entryLine.test.tsx`
  - `src/domain/cardMark.test.ts`

**Interfaces:**
- **Produces:**
  - `cardMark(account: Account): { name: string; last4: string | null; color: string }`.
    `color` comes from a skin → colour table for `midnight`, `violet`, `mint`, `amber`,
    `ocean` and `rose` (spec §11's skins; one solid colour each). The mark draws with a 1px
    `--color-text`/35% outline, so it holds 3:1 on the page in every theme and mode (pin it in
    `tokens.test`).
  - `EntryLine` gains `mark?: { name; last4; color }`: the account the entry moved money on.
    That is an expense's or income's account, or a transfer's or card payment's from-account;
    none for an entry with no account. `EntryDetail` renders the mark and name in place of the
    account's name, in History and Recent alike.
  - `questProgress(game): { done: number; open: number }` over every open quest (daily,
    weekly, monthly), the same set the Quests screen lists.
- **The pieces:**
  - **The hero amount:** 52px, shrinking to fit down to 40px (measure, or step by digit count).
  - **`QuestShopStrip`:**
    - under the Coming up bubbles: one `glass` strip split in two
    - left: "Quests 2/3" with a bar (→ `/quests`); "All done" when done = open; just
      "Quests" when open = 0
    - right: coins and "Shop" (→ `/shop`)
    - each half is a 44px link
  - **Recent's newest row** (when it moved money) adds "Afl. X left" (or "Afl. X owed") from
    `heroFigure` of its account.
  - **Recent rows open as History's rows do:** an expense opens the same edit dialog, and
    others offer History's delete with the same confirm. Lift History's row actions into a
    shared hook or component, so both use one.

- [ ] **Step 1: Write the tests:**
  - **`long balances shrink to fit`:** 123456789 minor units renders at ≤ 52px and ≥ 40px;
    the class or style holds within the hero's width.
  - **The strip:** "Quests 2/3" and the coins; the links go to /quests and /shop; "All done".
  - **`cardMark`:** each skin has a colour; an unknown skin falls back to midnight.
  - **`entryLine` marks:** expense → its account; transfer → its from-account; reinvested
    dividend → none.
  - **`Recent … masks with the eye`:** the "left" figure becomes `HIDDEN_AMOUNT`.
  - **`Recent edits and deletes as History does`:** edit an expense from Home and History
    shows the change; delete a stock buy from Recent with the same confirm text History uses.
  - **`tokens.test`:** each mark colour + outline ≥ 3:1 on the page in every theme × mode.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `finance`, `demo` and `contrast` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Home's bigger balance, the quests and shop strip, card marks and editable Recent`.

### Task 7: Which card paid — the done step, "just now", "On this card", bigger cards

**Files:**
- Create: `src/store/useLastSpend.ts`
- Modify:
  - `src/features/cards/PaySheet.tsx`, `src/features/cards/AccountCard.tsx`, `src/features/cards/CardsScreen.tsx`
  - `src/features/add/ExpenseForm.tsx` (records the last spend)
- Test: `src/features/cards/cards.test.tsx`, `src/store/useLastSpend.test.ts`

**Interfaces:**
- **Consumes:** `historyEntries`, `entryLine` with marks (Task 6), `heroFigure`.
- **Produces:**
  - `useLastSpend`: a zustand store (not persisted) holding
    `{ accountId: string; amount: number; at: number } | null` and `record(accountId, amount)`.
    PaySheet and ExpenseForm call it after a save.
  - **PaySheet's done step:**
    - a check
    - "Paid Afl. 12.50", then the shop and category
    - one line: "Paid with Main account ·· 4312" (`cardMark` name + last 4)
    - Done

    No card picture and no balance line (spec Goal 3).
  - **"Just now":**
    - the Cards card carrying the last spend shows "−Afl. 12.50 just now" in a small
      `glass-strong` badge
    - only when the spend is < 30s old, for 4s, starting when that card is on screen
    - reduced motion: it fades in and out
  - **"On this card":**
    - a `PlainSection` under the chart with the selected account's latest 5 `historyEntries`
      as `entryLine` rows from that account's perspective
    - "View all" → `/history`
  - **`AccountCard`:** 300×186px (was 270×166), with the balance at 26px. The carousel padding
    and dots follow.

- [ ] **Step 1: Write the tests:**
  - the done step names the card and has no balance line
  - **`… masks with the eye`:** "Paid" and "just now" amounts are masked
  - "just now" shows for a recent spend and not for one 31s old
  - "On this card" lists 5 entries for the selected card and follows a change of card
  - the card measures 300×186 (class pin)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `cards` spec (update its geometry for 300px cards). Expected: PASS.
- [ ] **Step 5: Commit:** `feat: which card paid, on the pay sheet and the Cards tab, with bigger cards`.

### Task 8: The Invest pie — no box, floating logo labels, brand colours

**Files:**
- Create: `src/lib/logoColor.ts`
- Modify:
  - `src/components/charts/Donut.tsx`, `src/components/charts/labelLayout.ts`
  - `src/features/invest/HoldingsTab.tsx` and the pie's container
- Test:
  - `src/components/charts/outsideLabels.test.tsx`
  - `src/lib/logoColor.test.ts`
  - `src/features/invest/holdingsPies.test.tsx`

**Interfaces:**
- **Produces:**
  - `Donut` `labelStyle="badge"`:
    - each label is a pill: a 24px round badge (the logo, or the ticker on the slice colour)
      with the percent after it
    - it sits just outside the slice, with no leader line
    - `layoutLabels` nudges overlapping labels along the ring instead of dropping them
  - `logoColor(img: HTMLImageElement): string | null`: the logo's dominant non-white,
    non-black colour, sampled on a small canvas. It returns null on failure or a tainted
    canvas.
  - `pickSliceColor(sampled: string | null, fallback: string, page: string, neighbours: string[]): string`:
    returns `sampled` only when it holds 3:1 against `page` and is at least ΔE 15 (OKLab ×100,
    as tokens.test's helper) from each neighbour; else `fallback`.
  - **The no-logo badge:** shows up to 4 letters of the ticker at ≥ 9px, in white or ink,
    whichever holds 4.5:1 on the slice colour.
  - **`HoldingsTab`:** the Holdings `GlassTile` is removed. The Allocation control, the pie and
    its legend sit on the page; the middle keeps the portfolio value.

- [ ] **Step 1: Write the tests:**
  - **`ten holdings keep every label apart`:** no two label boxes intersect, and the label
    count equals the slice count.
  - **`logos that fail keep chart colours`:** `logoColor` → null gives the fallback.
  - `pickSliceColor` rejects a too-light colour and one too close to a neighbour.
  - the badge text colour holds 4.5:1 on a yellow and on a navy slice.
  - no `glass` tile wraps the pie.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the mobile e2e
  `invest` and `contrast` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the invest pie with floating logo labels and brand colours`.

### Task 9: Contrast, version 0.13, everything green

**Files:**
- Modify:
  - `tests/e2e/contrast.spec.ts` (any new route state: the Home strip, "On this card", the
    restyled sheets)
  - `android/app/build.gradle`
- Test: the whole suite

- [ ] **Step 1:** Extend the axe scans to the new states in Black & White, Sunny Sky and
  Midnight Navy, each in both modes. Fix violations with tokens, never by weakening the scan.
- [ ] **Step 2:** Raise the version to `versionCode 13` and `versionName "0.13"`. Run
  `npm run typecheck && npm run lint && npm test && npm run test:e2e`. Expected: all PASS.
- [ ] **Step 3: Commit:** `chore: version 0.13 (versionCode 13) for matching screens`. Then
  the final whole-branch review, one fix wave, and the report.
