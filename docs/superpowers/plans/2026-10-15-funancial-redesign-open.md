# Funancial Redesign "Open" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Funancial's navigation, Home and Budget in the boxless "Open" style the owner chose, with tappable SVG charts for the money, and bring every other screen to the same look. No feature or rule changes.

**Architecture:**
- **Chart data:** pure functions in a new `src/domain/charts.ts`, unit-tested.
- **Charts:** small hand-written SVG React components in `src/components/charts/`, with no chart library. Each is accessible: buttons for tappable parts, `role="img"` plus a text label for the rest.
- **Navigation:** a new `BottomBar` and a `MenuSheet` built on a `Sheet` variant of the existing native-`<dialog>` modal, so the Android back gesture and Escape keep working through `dialogStack`.
- **Screens:** Home and Budget are recomposed from those pieces. Every other screen only picks up the restyled `PageHeader`, `Section` and `Button`.

**Tech Stack:** React 19, TypeScript, Tailwind 4, zustand 5, lucide-react, Vitest and Testing Library, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-15-redesign-open-design.md`. The visual reference is the clickable mockup `design/redesign/2-open.html`; match it in layout, sizes and copy where this plan doesn't say otherwise.

## Global Constraints

- **No boxes.**
  - Sections are separated by space and one 1px `--color-border` hairline.
  - No new card surfaces. Only dialogs and the menu sheet get a surface: `bg-overlay`, rounded, with a shadow.
- **Type scale:**
  - page titles 34px/800, tracking −0.035em;
  - section titles 21px/800, tracking −0.02em;
  - the Home hero 50px/800 (40px when the formatted amount is longer than 11 characters);
  - body 14–15px; labels 13px/700 muted.
- **Touch and labels.**
  - Every action has a visible text label.
  - Round action buttons are 56px.
  - Buttons: `md` is 48px tall, `sm` 44px, `lg` 56px.
  - The bottom bar and menu rows are at least 48px tall.
  - Nothing is icon-only without an `aria-label`.
- **Charts.**
  - Category colours come from `--color-chart-1..5` in fixed order; "Other" always uses a new `--color-chart-other` (light `#868b96`, dark `#6b7080`, both ≥3:1 against their page).
  - Colour follows the category, never its rank inside a chart.
  - Every chart shows exact amounts on tap or in a legend, and carries a screen-reader label.
- **Limit state colours:** under 80% `accent`, 80–99% `warning`, 100% or more `danger`. Always with text such as "$X left" or "$X over".
- **Money and dates.**
  - Money is always formatted through `useMoney()` / `formatMoney`; `{ whole: true }` (added in Task 1) drops the minor units for compact labels.
  - Dates are formatted only through `src/lib/format.ts`.
  - Domain code stays pure, with time passed in.
- **Motion:** only under `motion-safe:`. Sheet slide-up 280ms ease-out, chart highlight 150ms. Nothing animates under reduced motion.
- **Copy:** no shame, the same tone as the app ("Nothing spent", "No limits yet").
- **Commits:** end with your model's own `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>` trailer.
- **Verification:** each task runs `npm test`, `npm run typecheck` and `npm run lint`. Tasks that touch navigation, Home or e2e also run `npm run test:e2e`.

## Review Focus

1. **A brand-new account.** No expenses, limits, goals, bills or net-worth history. Every chart and section shows a friendly empty state; there is no NaN, no divide-by-zero, and no broken SVG arc. Pinned by Task 2 (charts with a zero total) and Task 4 (Home with empty data).
2. **Big and long values at 375px wide.** An available balance of $1,234,567.89, or a 40-character category, goal or subscription name, must not overflow. The hero drops to 40px, and names truncate with an ellipsis. Pinned by Task 4.
3. **Negative and over values.**
   - A negative available balance or net worth.
   - A limit at 135% (the ring is capped full, in danger colour, "$X over").
   - A falling net worth (▼ in danger colour).
   - Pinned by Task 1 (pace and net-worth change) and Task 2 (Ring clamps above 100%).
4. **Menu sheet behaviour.**
   - The Android back gesture and Escape close it.
   - Tapping a row navigates and closes it.
   - Focus returns to the Menu button.
   - Pinned by Task 3.
5. **Dark mode.** New tokens, icon chips and the month line keep contrast: icon chips ≥3:1 against their white icon, the "Other" chart colour ≥3:1 against the page. Pinned by Task 2's token test and the colour table in Task 3.

---

### Task 1: Chart data in the domain

**Files:**
- Create: `src/domain/charts.ts`, `src/domain/charts.test.ts`
- Modify: `src/domain/money.ts` (the `whole` option), `src/domain/money.test.ts`, `src/lib/format.ts` (`formatWeekday`, `formatMonthShort`), `src/store/useFinance.ts` (`useMoney` passes `whole` through)

**Interfaces:**
- Consumes:
  - `bucketBalances(data, asOf)`, `debtBalance(debt, data, asOf)` and `netWorth(buckets, debtTotal)` from `src/domain/balances.ts`;
  - `periodRange`, `monthRange` and `weekRange` from `src/domain/periods.ts`;
  - `addDays` from `src/domain/dates.ts`;
  - `categoryLabel` from `src/domain/budget.ts`;
  - `FinanceView` from `src/domain/view.ts`.
- Produces in `src/domain/charts.ts`:
  - `spendingByDay(expenses: Expense[], endDay: LocalDate, days: number): Array<{ day: LocalDate; amount: number }>`: oldest first, every day present (0 when nothing was spent), by expense `date`.
  - `type Slice = { key: Category | 'other'; label: string; amount: number }`.
  - `categorySlices(expenses: Expense[], range: Range, top = 5): Slice[]`: the categories with spending in the range, highest first. When more than `top` have spending, the rest fold into one `{ key: 'other', label: 'Other' }` slice at the end. The `other` category itself always folds into that slice.
  - `netWorthOn(data: DataSnapshot, day: LocalDate): number`.
  - `netWorthSeries(data: DataSnapshot, endDay: LocalDate, days: number): Array<{ day: LocalDate; value: number }>`: oldest first.
  - `netWorthChangeThisMonth(data: DataSnapshot, today: LocalDate): number`: `netWorthOn(today) − netWorthOn(day before the month's 1st)`.
  - `periodProgress(period: 'weekly' | 'monthly', today: LocalDate, weekStartsOn: 0 | 1): number`: (days elapsed including today) ÷ (days in the period), from 0 to 1.
  - `paceStatus(pct: number, progress: number): 'ahead' | 'on' | 'under'`: `'ahead'` when `pct / 100 > progress + 0.05`, `'under'` when `< progress − 0.05`, else `'on'`.
  - `type MonthLineData = { spent: number; bills: number; left: number | null }`.
  - `monthLine(view: FinanceView): MonthLineData`:
    - `spent` is `view.spending.month`;
    - `bills` is `view.billsTotal`;
    - `left` is `max(0, remaining)` of the overall monthly limit in `view.limits` (scope `overall`, period `monthly`), or `null` when there is none.
- Also produces:
  - `formatMoney(minor, currency, locale?, opts: { signDisplay?; whole?: boolean })`, where `whole` sets `minimumFractionDigits: 0, maximumFractionDigits: 0`;
  - `useMoney()`, whose returned function accepts `{ whole?: boolean }`;
  - `formatWeekday(d: LocalDate, locale?)`, giving "Thu";
  - `formatMonthShort(d: LocalDate, locale?)`, giving "OCT", uppercase. Both are formatted in UTC like the others.

- [ ] **Step 1: Write the failing tests** (`charts.test.ts`; all dates are LocalDate strings and amounts are minor units)

```ts
it('lists every day of the window, oldest first, with 0 for quiet days', () => {
  // expenses 10-13 2000, 10-15 1500 + 500; spendingByDay(…, '2026-10-15', 3)
  // → [{ day:'2026-10-13', amount:2000 }, { day:'2026-10-14', amount:0 }, { day:'2026-10-15', amount:2000 }]
});
it('keeps the top five categories and folds the rest into Other', () => {
  // seven categories with spending in October → 6 slices; the last is { key:'other', label:'Other', amount: sum of the two smallest }
});
it('folds the "other" category into Other, and returns [] with no spending', () => {});
it('computes net worth on a past day and the change this month', () => {
  // opening cash 1000_00 on 2026-09-01; expense 200_00 on 2026-10-05; today 2026-10-15
  // netWorthOn('2026-09-30') = 1000_00 (+ savings); netWorthChangeThisMonth = −200_00
});
it('gives a 30-point series ending today', () => { /* length 30, last day '2026-10-15' */ });
it('measures how far through the period today is', () => {
  // periodProgress('monthly','2026-10-15',1) = 15/31; periodProgress('weekly','2026-10-15',1) = 4/7 (Thu, Monday start)
});
it('calls pace ahead, on or under with a 5-point band', () => {
  expect(paceStatus(72, 15 / 31)).toBe('ahead'); expect(paceStatus(50, 15 / 31)).toBe('on'); expect(paceStatus(39, 4 / 7)).toBe('under');
  expect(paceStatus(135, 0.5)).toBe('ahead');
});
it('builds the month line, with left null when there is no overall monthly limit', () => {});
// money.test.ts
it('formats whole units', () => expect(formatMoney(188436, 'USD', 'en-US', { whole: true })).toBe('$1,884'));
```

- [ ] **Step 2: Run** `npx vitest run src/domain/charts.test.ts src/domain/money.test.ts`. Expected: FAIL, because the module is missing.
- [ ] **Step 3: Implement** the functions. Step through days with `addDays`, never milliseconds.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm test && npm run typecheck`.
- [ ] **Step 5: Commit:** `feat: chart data for the Open redesign`

---

### Task 2: Chart components

**Files:**
- Create in `src/components/charts/`: `Donut.tsx`, `MonthLine.tsx`, `DayBars.tsx`, `Ring.tsx`, `Sparkline.tsx`, `colors.ts`, `charts.test.tsx`
- Modify: `src/styles/tokens.css` (`--color-chart-other`), `tests/unit/tokens.test.ts`

**Interfaces:**
- Consumes `Slice` from Task 1.
- Produces:
  - **`colors.ts`:** `sliceColor(key: Category | 'other', index: number): string`. It returns `var(--color-chart-${n})` by the slice's position among non-other slices (1–5), and `var(--color-chart-other)` for `'other'`.
  - **`Donut`:** `{ slices: Slice[]; size: number; thickness: number; formatAmount(minor): string; idle: { value: string; label: string }; selected: number | null; onSelect(index: number | null): void }`.
    - One SVG arc per slice, with a 3px gap.
    - Each arc is also a `<button>` overlay with no box. Put it in an accessible list: a visually hidden list of buttons, `aria-label` `` `${label}, ${amount}, ${pct}%` ``.
    - The centre shows `idle` when nothing is selected, else the slice's amount and `` `${label} · ${pct}%` ``.
    - Unselected arcs fade to 0.25 opacity when one is selected.
    - With an empty `slices` it renders the track ring only, and the centre shows `idle`.
  - **`DonutLegend`** (same file): `{ slices; formatAmount; selected; onSelect }`. Rows are `<button>`s, each with a dot, the label (truncating) and the amount, `aria-pressed` on the selected one.
  - **`MonthLine`:** `{ segments: Array<{ key: string; label: string; amount: number; color: string }>; onSelect(key: string | null): void; selected: string | null }`.
    - A 6px line of `flex: amount` segments with 3px gaps.
    - Each segment is a `<button>` with `aria-label` `` `${label}: ${formatted}` ``; the formatted string is passed in the label.
  - **`DayBars`:** `{ days: Array<{ label: string; amount: number; isToday: boolean }>; selected: number | null; onSelect(i: number | null): void; formatAmount }`.
    - 10px-wide rounded bars in a 130px-tall row. Height is relative to the week's maximum, with a minimum of 6px.
    - Today and the selected bar are filled `--color-text`; the rest are `--color-track`.
    - Each bar is a `<button>` with `aria-label` `` `${label}: ${amount}` ``.
  - **`Ring`:** `{ value: number /* percent, may exceed 100 */; size: number; thickness: number; color: string; label: string; children?: ReactNode }`.
    - `role="img"`, `aria-label={label}`.
    - The arc is capped at 100%.
  - **`Sparkline`:** `{ values: number[]; height: number; color: string; label: string }`.
    - `role="img"`, `aria-label={label}`.
    - A flat line when every value is equal.

- [ ] **Step 1: Write the failing tests**

```tsx
it('labels each donut slice with amount and share, and selects it', async () => { /* 3 slices; click 'Rent, $1,200.00, 64%' → onSelect(0) */ });
it('shows the idle centre, and a track only, when there are no slices', () => {});
it('colours Other with the other token and the rest in order', () => expect(sliceColor('other', 5)).toBe('var(--color-chart-other)'));
it('caps a ring above 100% and keeps its label', () => { /* value 135 → the arc's dashoffset is 0; aria-label passed through */ });
it('draws a flat sparkline for equal values without NaN', () => { /* the path d has no 'NaN' */ });
it('selects a day bar and a month-line segment by label', async () => {});
// tokens.test.ts
it('defines the Other chart colour', () => { expect(css).toContain('--color-chart-other: #868b96'); expect(css).toContain('--color-chart-other: #6b7080'); });
```

- [ ] **Step 2: Run** `npx vitest run src/components/charts tests/unit/tokens.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components and the token. Highlight transitions are `motion-safe:transition-opacity`.
- [ ] **Step 4: Run** the same command, then `npm test && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: tappable SVG charts`

---

### Task 3: Bottom bar, Menu sheet and sidebar

**Files:**
- Create: `src/components/ui/Sheet.tsx`, `src/app/BottomBar.tsx`, `src/app/MenuSheet.tsx`, `src/app/menu.ts`, `src/app/useMenuSubtitles.ts`, `src/app/nav.test.tsx`
- Modify: `src/app/AppShell.tsx`, `src/app/Sidebar.tsx`, `src/app/routes.tsx`, `tests/e2e/navigation.spec.ts`
- Delete: `src/app/BottomTabs.tsx`, `src/app/MoreSheet.tsx`, `src/app/QuickAddButton.tsx`, and their tests

**Interfaces:**
- Consumes `Dialog` behaviour (native `<dialog>`, `pushDialog` / `removeDialog`), `useGameView`, `useFinanceView`, `useMoney`, and `formatDay`.
- Produces:
  - **`Sheet`:** `{ open; title; onClose; children }`. The same native-dialog mechanics as `Dialog`, but:
    - laid out as a bottom sheet: full width, `max-h-[calc(100dvh-64px)]`, `rounded-t-[30px]`, a 40×5px grab handle, padding `10px 22px` plus the safe area;
    - it slides up with `motion-safe:` (280ms);
    - the title renders as an `sr-only` heading, so the dialog's accessible name is the title.
  - **`menu.ts`:** `MENU_GROUPS: Array<{ title: string; items: Array<{ path: string; label: string; icon: LucideIcon; color: string; soon?: boolean }> }>`, in this order:

    | Group | Item | Path | Icon | Chip colour |
    |---|---|---|---|---|
    | Your money | Subscriptions | /subscriptions | Repeat | #2a78d6 |
    | Your money | Goals | /goals | Target | #128a60 |
    | Your money | History | /history | Clock | #d9541e |
    | Your money | Salary freeze | /freeze | Snowflake | #4458d6 |
    | Coming next | Invest *(soon)* | /invest | TrendingUp | #b86e00 |
    | Coming next | Buy it? *(soon)* | /buy | ShoppingBag | #c43b6a |
    | Coming next | Dividends *(soon)* | /dividends | Coins | #0b7f8a |
    | Coming next | News *(soon)* | /news | Newspaper | #5b6270 |
    | You | Shop | /shop | Store | #6b46f5 |
    | You | Inbox *(soon)* | /inbox | Inbox | #3b82c4 |
    | You | Help *(soon)* | /help | CircleQuestionMark | #128a60 |
    | You | Settings | /settings | Settings | #5b6270 |

    Chip colours are fixed for both themes, and each is ≥3:1 against a white icon.
  - **`useMenuSubtitles(): Record<string, string>`**, keyed by path, with this exact copy:
    - `/subscriptions`: `` `${n} active · ${money(monthly)}/mo` ``, or `None yet`.
    - `/goals`: `` `${n} goal${n === 1 ? '' : 's'} · ${pct}% saved` `` (Σcurrent ÷ Σtarget), or `None yet`.
    - `/history`: `Every entry, searchable`.
    - `/freeze`: `` `Active until ${formatDay(end)}` ``, or `None right now`.
    - `/invest`: `Stocks and ETFs`. `/buy`: `Ask before you spend`. `/dividends`: `Passive income`. `/news`: `For what you hold`.
    - `/shop`: `` `${coins} coin${coins === 1 ? '' : 's'} to spend` ``.
    - `/inbox`: `Your notices`. `/help`: `How everything works`.
    - `/settings`: `Lock, backups, reminders`.
  - **`MenuSheet`:** `{ open; onClose }`.
    - Group headings are 21px/800.
    - Each row is a `NavLink` (≥56px tall) with a 42px round colour chip and a white icon, the label (15.5px/800), the subtitle (13px muted), and on the right either a chevron or a muted `Soon`.
    - Rows are separated by hairlines.
    - Tapping a row navigates and calls `onClose`.
  - **`BottomBar`:** `{ onMenu(): void }`. An `aria-label="Primary"` nav fixed to the bottom edge:
    - `bg-bg`, a top hairline, height 64px plus the safe area;
    - five equal slots: Home (`/`), Budget (`/budget`), Add (a 48px round ink button linking to `/add` with `aria-label="Add expense"`), Quests (`/quests`), and Menu (a button that opens the sheet);
    - active links in `text-text`, others `text-muted`.
  - **`Sidebar`:**
    - an `Add expense` primary button at the top;
    - links for Home, Budget and Quests;
    - then the `MENU_GROUPS` with their titles as 12px uppercase muted headings, and `Soon` tags on soon items.
  - **`routes.tsx`:** `TAB_ROUTES` and `MORE_ROUTES` go away. `APP_ROUTES` keeps every route, and its `nav` field is removed. Nav lists come from `menu.ts` and the three bottom-bar links.
  - **`AppShell`:**
    - renders `Sidebar` on md and up;
    - renders `BottomBar` plus `MenuSheet` below md;
    - drops `QuickAddButton`;
    - bottom padding fits the new bar.

- [ ] **Step 1: Write the failing tests** (`nav.test.tsx`, real router as in the existing `src/app/*.test.tsx`)

```tsx
it('shows Home, Budget, Add expense, Quests and Menu in the bottom bar', () => {});
it('opens the Menu sheet with three groups and live subtitles', async () => { /* subtitles built from the stub data, e.g. `${n} active · ${money}/mo` and `${coins} coins to spend` */ });
it('marks soon items', () => { /* Invest row contains 'Soon' */ });
it('navigates from a row and closes the sheet', async () => {});
it('closes on Escape and on the dialog cancel event (Android back)', async () => {});
it('puts Add expense first in the sidebar, then the groups', () => {});
```

Also update `tests/e2e/navigation.spec.ts`:
- **Mobile:** the Menu button, then the dialog `Menu`, then the Settings link, then the Settings heading.
- **Desktop:** the sidebar's Dividends link.
- **Add:** replace the quick-add test with the bottom-bar `Add expense` link opening Add (Expense checked) on mobile, and the sidebar `Add expense` on desktop.

- [ ] **Step 2: Run** `npx vitest run src/app`. Expected: FAIL.
- [ ] **Step 3: Implement**, then delete the three old components and their tests.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: bottom bar, Menu sheet and grouped sidebar`

---

### Task 4: Home

**Files:**
- Modify: `src/features/dashboard/DashboardScreen.tsx`, rebuilt as composition only
- Create in `src/features/dashboard/`: `HomeTopLine.tsx`, `HomeHero.tsx`, `HomeActions.tsx`, `SpendingSection.tsx`, `WeekSection.tsx`, `LimitsSection.tsx`, `BillsSection.tsx`, `NetWorthSection.tsx`, `GoalsSection.tsx`
- Modify: `src/features/dashboard/dashboard.test.tsx` (rewritten for the new layout), `tests/e2e/game.spec.ts`, `tests/e2e/finance.spec.ts` (only where it asserted the old Home), `tests/e2e/onboarding.spec.ts` (only if needed)
- Delete: `src/features/game/GameHud.tsx`, and its tests in `src/features/game/game.test.tsx`. Keep `useGameTheme`, `Avatar` and `QuestList`.

**Interfaces:**
- Consumes the Task 1 functions, the Task 2 components, `useFinanceView`, `useGameView`, `useMoney`, `QuestList`, `ConfirmSalaryDialog`, `ReminderBanner`, and the banners already on Home.

**Layout and copy** (the spec's Home section is binding; the exact strings are below):

1. **`HomeTopLine`.**
   - Left: `` `Hi, ${name}` `` (15px/800) followed by a muted `` ` · ${formatDay(today)}` ``.
   - Right: a link to `/quests` with `aria-label` `` `Level ${level}, ${into} of ${span} XP, ${streak}-day streak, ${coins} coins. Open quests` ``, or `Max level` in place of the XP part. It contains:
     - the Flame icon (`text-warning`) and the streak count;
     - the Coins icon and `max(0, coins)`;
     - a 40px `Ring` in `--color-xp`, with the level number inside.
   - With no name: `Hi there`.
2. **`HomeHero`.**
   - The label `Available to spend`.
   - The amount at 50px (40px when longer than 11 characters).
   - The `MonthLine` segments:
     - `spent`: `--color-chart-4`, label `Spent so far`;
     - `bills`: `--color-chart-5`, label `Bills still to come`;
     - `left`: `--color-accent`, label `Left in your monthly limit`, only when not null.
   - Under it, two keys:
     - left: `money(spent, { whole: true })` over `` `spent in ${Month}` ``;
     - right: `money(left, { whole: true })` over `left in limit`, or, when `left` is null, `money(bills, { whole: true })` over `bills to come`.
   - Tapping a segment replaces the left key with that segment's label and amount; tapping again restores it.
   - When everything is 0, show the line as the track only.
3. **`HomeActions`.** A 4-column grid of `Link`s. Each is a 56px round icon above a 13px/700 label:
   - `Expense` (`/add`, ink filled, Plus);
   - `Income` (`/add?type=income`, HandCoins);
   - `Goals` (`/goals`, Target);
   - `History` (`/history`, Clock).
4. **`SpendingSection`.**
   - Title `Spending`, with tabs `Week` and `Month` (buttons, `aria-pressed`, Month by default).
   - A `Donut` (150px, thickness 18) of `categorySlices` for `weekRange` or `monthRange`, with `DonutLegend`.
   - The idle centre is `money(total, { whole: true })` over `{Month name}` or `This week`.
   - Empty: `No spending yet` and `Expenses you add show up here by category.`.
5. **`WeekSection`.**
   - Title `Last 7 days`, with a link `History` to `/history`.
   - `DayBars` of `spendingByDay(expenses, today, 7)`; labels are `formatWeekday`, and today is `Today`.
   - The tip line reads `` `This week so far ${money(view.spending.week)} · tap a day` ``. When a day is selected it reads `` `${label} · spent ${money(amount)}` ``, or `` `${label} · nothing spent` ``.
6. **`LimitsSection`.**
   - Title `Limits`, with a link `Budget`.
   - Up to 3 `Ring`s (86px, thickness 7) from `view.limits`, already sorted by % used. Each has:
     - the colour of its limit state;
     - `` `${pct}%` `` in the centre;
     - the name: `limitLabel`, plus ` · week` for weekly limits;
     - `` `${money(remaining, { whole: true })} left` `` or `` `${money(−remaining, { whole: true })} over` ``.
   - The ring's `label` is `` `${name}: ${pct}% used, ${left/over text}` ``.
   - Empty: `No limits yet`, with a link `Set a limit` to `/budget`.
7. **`BillsSection`.**
   - Title `Coming up`, with a link to `/subscriptions` whose text is `money(view.billsTotal)`.
   - Up to 4 rows, each with:
     - a date block: `formatMonthShort` (11px/800 muted) over the day number (22px/800);
     - the name (15px/800, truncating);
     - `` `${kind === 'card' ? 'Card' : 'Subscription'} · ${relativeDays(today, date)}` ``;
     - the amount.
   - Empty: `Nothing due this month`.
8. **`NetWorthSection`.**
   - Title `Net worth`. On the right, the change:
     - `` `▲ ${money(change, { whole: true })} this month` `` in `text-accent-text`;
     - `` `▼ ${money(−change, { whole: true })} this month` `` in `text-danger`;
     - `No change this month` in muted.
   - The amount at 34px/800.
   - A `Sparkline` (70px tall, `--color-accent`) of `netWorthSeries(data, today, 30)`, labelled `` `Net worth over the last 30 days, now ${money(netWorth)}` ``.
   - A legend: `` `Cash ${…}` `` (chart-1), `` `Savings ${…}` `` (chart-3), and `` `Debts ${…}` `` (danger), each with `{ whole: true }`.
9. **`GoalsSection`.**
   - Title `Goals`, with a link `All` to `/goals`.
   - Up to 2 goals in the existing order. Each row has the name, `` `${money(current, { whole: true })} of ${money(target, { whole: true })} · ${pct}%` ``, and a 6px progress line in `sliceColor`-style order (chart-1, chart-3).
   - Empty: `No goals yet`, with a link `Add a goal`.
10. **Quests.** Title `Quests`, a link `All`, and `QuestList` with a limit of 3.

**Page layout.**
- Phone: one column in that order.
- `lg`: items 1–3 span the full width, then sections 4–10 in two columns. The left column holds Spending, Last 7 days and Limits; the right holds Coming up, Net worth, Goals and Quests. The gap is `gap-x-14`.
- The page has no `PageHeader`. Its `h1` is a visually hidden `Home`, so the e2e heading checks still pass.

- [ ] **Step 1: Write the failing tests** (`dashboard.test.tsx`, stub store as today)

```tsx
it('greets with the name and date, and links level, streak and coins to Quests', () => {});
it('shows the hero amount, and shrinks it for long amounts', () => { /* 123456789 minor → the hero has the 40px class */ });
it('names a month-line segment when tapped', async () => { /* tap 'Bills still to come: $547.81' → the left key shows it */ });
it('shows four labelled actions', () => { /* links Expense, Income, Goals, History */ });
it('switches the donut between week and month, and shows a slice when tapped', async () => {});
it('shows the last 7 days and a tapped day', async () => {});
it('rings the top three limits with left or over text', () => { /* a 135% limit reads '$… over' and uses the danger colour */ });
it('lists the coming bills with date blocks', () => {});
it('shows net worth with its monthly change and trend', () => { /* a fall shows '▼' with the danger class */ });
it('shows friendly empty states on a brand-new account', () => { /* 'No spending yet', 'No limits yet', 'Nothing due this month', 'No goals yet'; no 'NaN' anywhere */ });
it('truncates a 40-character goal name', () => {});
```

Update `tests/e2e/game.spec.ts`:
- Home has no `80 / 100 XP` any more. Assert instead that the top-line link's `aria-label` contains `Level 1, 80 of 100 XP`, and that the coins read `15`.
- The streak e2e asserts that the top-line `aria-label` contains `1-day streak`.

- [ ] **Step 2: Run** `npx vitest run src/features/dashboard`. Expected: FAIL.
- [ ] **Step 3: Implement** the sections and the composition. Delete `GameHud` and its tests.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Look at it.** Run the dev server with demo data, and check 375px and desktop in light and dark against `design/redesign/2-open.html`. Note anything that differs in the report.
- [ ] **Step 6: Commit:** `feat: Home in the Open style with money charts`

---

### Task 5: Budget

**Files:**
- Modify: `src/features/budget/BudgetScreen.tsx`
- Create: `src/features/budget/LimitPaceRow.tsx`
- Modify: the budget tests (`src/features/budget/*.test.tsx`), and any e2e that clicked the old `Add limit` header button (`tests/e2e/finance.spec.ts`)

**Interfaces:**
- Consumes `categorySlices`, `periodProgress` and `paceStatus` (Task 1), `Donut` and `DonutLegend` (Task 2), and the existing `LimitDialog`.

**Layout and copy:**
- **Header row.**
  - An `h1` `Budget` (34px).
  - A month switcher: `‹` button (`aria-label="Previous month"`), the `formatMonthYear(selected)` text, and a `›` button (`aria-label="Next month"`, disabled on the current month).
  - It starts on the current month.
- **Spending.**
  - A `Donut` (240px, thickness 22) of `categorySlices(expenses, monthRange(selected))`, with `DonutLegend` below.
  - Centre, idle: a small `Spent` label, `money(total)`, and either:
    - `` `of ${money(limit.amount)} · ${pct}%` `` when the selected month is the current one and an overall monthly limit exists;
    - otherwise `formatMonth(selected)`.
  - Empty: `No spending in {Month}`.
- **Limits** (always the current period).
  - The title `Limits`, with a muted hint on the right: `Line shows today's pace`.
  - One `LimitPaceRow` per limit:
    - the name, plus `` `${money(remaining)} left` `` or `` `${money(−remaining)} over` ``;
    - an 8px bar in the limit-state colour, with a 2px pace mark at `periodProgress × 100%`;
    - `` `${Weekly|Monthly} · ${money(spent)} of ${money(amount)} · ${ahead of pace|on pace|under pace}` ``;
    - an `Edit` button (`aria-label` `` `Edit ${name} limit` ``).
  - Ends with a text button `Add a limit` (Plus icon) that opens `LimitDialog`.
  - Empty: `No limits yet. Add one to see your pace.`, plus the button.

- [ ] **Step 1: Write the failing tests**

```tsx
it('starts on this month and cannot go past it', () => {});
it('shows the previous month’s categories after Previous month', async () => {});
it('shows spent of the overall limit in the centre for this month only', () => {});
it('draws a pace mark and names the pace', () => { /* today 10-15: monthly 72% → 'ahead of pace'; the mark sits at 48% */ });
it('reads over for a limit past 100%', () => {});
it('opens the limit dialog from Add a limit and from Edit', async () => {});
```

- [ ] **Step 2: Run** `npx vitest run src/features/budget`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Budget with a month donut and pace marks`

---

### Task 6: The Open look everywhere else

**Files:**
- Modify: `src/components/ui/PageHeader.tsx`, `src/components/ui/Section.tsx`, `src/components/ui/Button.tsx`, `src/app/AppShell.tsx` (page padding), `docs/design/visual-direction.md`
- Modify: whatever screen or test the new sizes break. Expect class-only fixes in `src/components/ui/*.test.tsx` and screen tests.

**Interfaces:** no new ones.

**Values:**
- **`PageHeader`** (non-compact):
  - the title at 34px/800, tracking −0.035em;
  - no bottom border; the header gets `pb-2`, and the page's first section supplies its own top space;
  - the `compact` prop is removed (Home no longer uses it).
- **`Section`:**
  - the title at 21px/800, tracking −0.02em;
  - the padding is `py-7`, with the hairline kept between sections;
  - the action slot stays 13.5px/700 muted.
- **`Button` sizes:** `sm` `h-11 px-4 text-sm`, `md` `h-12 px-5 text-[15px]`, `lg` `h-14 px-6 text-base`.
- **`AppShell` main padding:** `px-[22px]` on phones and `md:px-10`, with the max width unchanged.
- **`docs/design/visual-direction.md`:** rewrite it as "E · Open (chosen 2026-10-15)". Cover:
  - the principles from the spec;
  - the token table, unchanged except for `--color-chart-other`;
  - the type scale, the navigation, the chart rules and the icon-chip colours;
  - a pointer to `design/redesign/2-open.html`.

  Keep "D · Pro Ledger" as one line of history.

- [ ] **Step 1: Write the failing tests:**

```tsx
it('renders page titles at 34px', () => {});
it('renders section titles at 21px', () => {});
it('makes medium buttons 48px tall', () => {});
```

  Assert the classes in `ui.test.tsx`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui`. Expected: FAIL.
- [ ] **Step 3: Implement**, then fix the screens and tests the change affects.
- [ ] **Step 4: Look at every screen** in the dev server at 375px and on desktop, in light and dark: Welcome, onboarding, Lock, Home, Budget, Add, Subscriptions, Salary freeze, Goals, History, Quests, Shop, Settings, the Menu sheet, and the placeholders. Fix any spacing or overflow regressions, and list each screen as checked in the report.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: PASS.
- [ ] **Step 6: Commit:** `style: the Open look across every screen`

---

### Task 7: On the phone

**Files:** none, unless the check finds something. Each fix gets a failing test first.

- [ ] **Step 1: Full suite:** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: all green.
- [ ] **Step 2: Install with the owner present:** `npm run android:run`. On this PC the shell needs `JAVA_HOME` set to `C:\Users\bhcco\.jdks\temurin-21.0.12.1` for that command.
- [ ] **Step 3: Checklist.** Record each item in the ledger:
  1. The bottom bar and the Menu sheet sit clear of the gesture bar. Android back closes the sheet.
  2. Home reads top to bottom, and the owner can find the actions.
  3. Tapping the donut, the bars and the month line shows the amounts.
  4. Budget's month switcher and pace marks work.
  5. Light and dark both look right.
  6. Nothing overflows at the phone's width.
- [ ] **Step 4: Commit** fixes, if any, as `fix: on-device findings`.

---

## Milestone checkpoint (redesign done)

Funancial looks and reads the way the owner chose:
- an Open, boxless layout;
- a picture for every key number, with tap-for-details;
- big labelled actions;
- a modern Menu sheet;
- the same style on every screen.

**Next:** M5, the backend, investments, dividends and news. That milestone decides where Invest goes in the navigation.
