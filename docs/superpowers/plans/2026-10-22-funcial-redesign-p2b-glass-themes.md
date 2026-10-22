# Redesign Phase 2b — Glass themes (0.12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace 0.11's look with the owner-approved glass themes, screen for screen:
- the 12 Shop themes, Black & White free and the default
- the edge-to-edge tab bar
- Home, Cards, Profile and the Shop rebuilt to the wireframe
- level borders
- Spending and Invest restyled

Ships as 0.12 (versionCode 12).

**Source of truth:** `design/redesign-v3/glass-themes.html`.
- `.t-*` classes: the theme tokens.
- `.hg` / `.pg` / `.hmain` / `.amain`: the glass recipes.
- `home()`, `cards()`, `profile()` and `shop()` in its script: the screens.

Where this plan is silent, match the file. Where this plan states a rule, it wins.

**Architecture:**
- Theme rules live in `src/styles/themes.css`, keyed on `[data-game-theme=<id>]` (set on `<html>` by `useGameTheme`, or on any element for a preview). They feed Tailwind tokens, so screens use utilities.
- The game domain owns the theme and border catalog and the unlock rules.
- Screens are rebuilt in their feature folders. The 0.11 primitives are reused where they fit.

**Spec:** `docs/superpowers/specs/2026-10-21-funcial-redesign-design.md`:
- §5 (screens)
- §8 (Available)
- §2.9 and §6 settings (borders unlock at levels, and `cosmetics.frame` may only name an unlocked one)

## Global Constraints

- **Branch:** `feat/redesign-p2-shell` (on top of 0.11, `77e0e88`). Do not push, open a PR, merge or deploy.
- **Version:** 0.12 (`versionCode 12`).
- **No schema change.** Cosmetics stay strings in `settings.cosmetics`. Money stays integer minor units.
- **No new dependencies.**
- **Green at every task:** typecheck, lint, `npm test`, and the e2e specs the task touches. Task 8 runs everything.
- **Contrast:** `tests/unit/tokens.test.ts` must hold for every theme in light and dark mode:
  - text ≥ 4.5:1 on the surface it sits on
  - icons and UI marks ≥ 3:1
- **Glass recipes,** as in the file:
  - on the block (`glass-head`, = `.hg`): theme `--hg-bg`, `--hg-line` and `--hg-hi`
  - on the page (`glass`, = `.pg`): `rgba(255,255,255,.48)`, a 1px `rgba(255,255,255,.85)` line, an inset `0 1px 0 #fff`, and a `0 12px 28px -18px var(--shadow-tint)` shadow
  - both: `blur(22px) saturate(180%)`
  - edge pieces that hang over a dark block (the Available pill, bill bubbles, stats card): `.66` white
- **No box** on:
  - the Available balance area
  - Recent transactions, Categories, Loans, Bills
  - the Profile menus

  These are plain rows with `rgba(0,0,0,.07)` hairlines.
- **Before Playwright:** check nothing listens on ports 4173/4174.
- **Commits:** lower-case conventional, each with its author's Co-Authored-By trailer.
- **Copy:** plain English in the app's voice; never print `.env.local`.

## Calls (rulings in this plan; recorded in the decisions doc)

1. **Theme ids** are `theme-mono` (default), `-sky`, `-lemon`, `-pastel`, `-daisy`, `-peach`, `-powder`, `-seafoam`, `-navy`, `-forest`, `-plum` and `-espresso`.
   - The old themes retire, and owning one maps to a new theme: Violet → Black & White, Ocean → Powder Blue, Orchid → Pastel, Graphite → Midnight Navy. Coins already spent stay spent.
   - A stored `cosmetics.theme` that names an old theme shows as its new one.
2. **Borders reuse the `frame-*` ids:**
   - `frame-bronze` at level 5, `frame-silver` at 11, `frame-gold` at 21, `frame-platinum` at 31, `frame-diamond` at 41, `frame-prism` at 50
   - `frame-none` is always available
   - a border is wearable when the level reaches it **or** a purchase of it exists, so bought `frame-silver`, `frame-gold` and `frame-game` stay wearable
   - frames leave the Shop
3. **Home's hero shows the selected account** (revised wireframe, owner-approved). The selected account is a device-level store shared with the Cards carousel (ledger ruling R-Q6). What each account shows:
   - debit, cash and savings: their balance, labelled "Available balance"
   - credit: what is left to spend (limit − owed), labelled "Available credit"; with no limit set, the amount owed, labelled "Owed"

   The spec's `available` (bills, card payments and reserves off) is the Cards tab's pill. **Task 5 is built before Task 4,** because Home uses its store and its Pay flow.
4. **Home keeps its banners** (expected salary, reminders, account) under the bill bubbles. It drops its Spending, Week, Limits, Net worth, Goals and Quests sections:
   - Limits and Goals live on Spending (Budget gains a Goals section).
   - Quests live on Profile.
   - Net worth opens today's net-worth sheet from Profile's "Net worth" row, so it is not "Soon" (it already exists).
   - "My numbers" is a disabled "Soon" row.
5. **Where pages moved:**
   - Bills & cards and Loans move to the Cards tab (Bills and Loans sections, each with "View all" → `/subscriptions`, `/debts`).
   - Income opens from Home's Overview Income tile.
   - Goals are on Spending.
6. **The Cards tab** is a new `/cards` route. Its charts and Categories follow the card centred in the carousel (spec P1). Pay records an expense through a new `PaymentService` (local only). A frozen account can't be picked for an expense or Pay; subscriptions still renew on it.
7. **Status-bar icons** follow the block: a dark block (Black & White and the four dark themes) claims light icons, and a light block claims dark icons, in either mode.
8. **Dark mode stays.** The page turns dark and the page glass turns dark. The block keeps its theme. Each theme gets a dark-mode accent, lightened until it passes.
9. **Ruled out:** a floating bar, the ＋ fan, a centre ＋.

## Review Focus

1. **Every theme × light/dark mode keeps every text and icon readable.** That includes the block's text over its brightest glow, the current tab in the accent, and the main button's label. (Task 1: `tokens.test.ts` matrix. Task 8: axe over Black & White, Sunny Sky and Midnight Navy, each in both modes.)
2. **Border boundaries:** 4/5, 10/11, 20/21, 30/31, 40/41, 49/50. A bought frame stays wearable at level 1. A stored frame the level hasn't unlocked falls back to none. (Task 2.)
3. **An old 0.11 install upgrading:**
   - a stored `theme-violet` or `theme-ocean` and a bought Ocean show as Black & White / Powder Blue and stay owned
   - coins are unchanged

   (Task 2.)
4. **Pay and Freeze:**
   - a frozen card can't pay or be picked in the expense form
   - Pay on a credit card raises what it owes
   - the balance shown drops by exactly the amount

   (Task 5.)
5. **Home's numbers:**
   - the hero equals the selected account's figure: a credit card's limit − owed, or "Owed" with no limit
   - the selection survives a restart, and an archived selection falls back
   - the Overview change compares the same days of last month (Oct 1–22 vs Sep 1–22; Mar 31 compares to Feb's last day)
   - the net-worth change is hidden when the data doesn't reach the start of the month
   - Recent shows the 5 newest entries History shows

   (Tasks 4 and 5.)

---

### Task 1: Theme tokens and glass utilities

**Files:**
- Create: `src/styles/themes.css` (imported by `index.css` after `tokens.css`).
- Modify:
  - `src/styles/tokens.css`: the defaults become Black & White, the Midnight Glass hero tokens are replaced, and the old game-theme rules go.
  - `src/styles/index.css`: utilities.
  - `tests/unit/tokens.test.ts`
  - `site/get/screens.ts` (if `siteTokens.test` needs it)

**Interfaces:**
- **Per-theme variables** (copied from each `.t-*` class, plus `.t-dark-block` or `.t-light-block` by kind): `--head`, `--head-blobs`, `--head-ink`, `--page`, `--page-blobs`, `--hg-bg`, `--hg-line`, `--hg-hi`, `--hmain`, `--hmain-ink`, `--accent`, `--accent-ink`, `--ring`, `--xp`, `--av`, `--av-ink`, `--card-tint`, `--card-tint-2`, `--card-tint-3`, `--shadow-tint`.
- **Rules:**
  - Each theme sits under `:root[data-game-theme='<id>'], [data-theme-preview='<id>']`.
  - Black & White's values are also on `:root`.
  - The theme's dark-mode accent is under `:root[data-theme='dark'][data-game-theme='<id>']`.
- **Token mapping:**
  - `--color-bg` = `--page`
  - `--color-accent` = `--accent` (text and marks on the page)
  - `--color-accent-contrast` = `--accent-ink`
  - `--color-head-ink`, `--color-hmain`, `--color-hmain-ink`, `--color-ring`, `--color-hero-xp` (= `--xp`, the bar on the block)
  - `--color-xp` and `--color-xp-text` = `--accent` (XP on the page)
  - `--color-focus` = `--accent`
- **Utilities:**
  - `bg-head` (`var(--head-blobs), var(--head)`)
  - `glass-head`, `glass`, `glass-strong` (the .66 edge variant)
  - `btn-head` (= `.hmain`), `btn-accent` (= `.amain`)
  - `page-blobs`: `body::before`, fixed, `var(--page-blobs)`
- **Dark mode** (`:root[data-theme='dark']`):
  - page `#0b0b10`, blobs at 40% strength, page glass `rgba(28,28,38,.55)` with a `rgba(255,255,255,.08)` line
  - text and muted tokens as 0.11's dark values

- [ ] **Step 1: Rewrite `tokens.test.ts` for the theme matrix.** For each of the 12 themes in each mode:
  - `--head-ink` ≥ 4.5 on both `--head` gradient stops and on the brightest blob composited over each stop
  - `--hmain-ink` on `--hmain` ≥ 4.5
  - `--accent-ink` on `--accent` ≥ 4.5
  - `--accent` (the current tab's label) ≥ 4.5 on the page and on the tab bar's glass composited over the page
  - text and muted ≥ 4.5 on the page and on the page glass over the page

  Keep the chart-series validator test and the banner-tone tests. Where a theme value from the file fails, darken (light mode) or lighten (dark mode) that one token until it passes, and list each change in the commit.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Write `themes.css`, the token mapping and the utilities.** Run `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 4: Commit:** `feat: twelve glass themes, Black & White by default`.

### Task 2: Theme and border catalog and unlock rules

**Files:**
- Modify:
  - `src/domain/game/shop.ts`
  - `src/domain/game/levels.ts` (border unlock levels)
  - `src/domain/entities.ts` (default cosmetics `theme-mono`)
  - `src/store/gameActions.ts` (equip checks)
  - `src/features/game/useGameTheme.ts`
  - `src/features/game/frameRing.ts`
- Test:
  - `src/domain/game/shop.test.ts`, `src/domain/game/levels.test.ts`
  - `src/store/game.test.ts`, `src/features/game/game.test.tsx`

**Interfaces:**
- **`THEMES: readonly { id: string; name: string; kind: 'free' | 'light' | 'dark'; price: number }[]`.** These are the 12 themes, in the file's order, at the prices the owner gave (0 / 400 / 450 / 600). `SHOP_ITEMS` theme entries come from it.
- **`RETIRED_THEMES: Record<string, string>`:** `theme-violet` → `theme-mono`, `theme-ocean` → `theme-powder`, `theme-orchid` → `theme-pastel`, `theme-graphite` → `theme-navy`.
- **`BORDERS: readonly { id: string; name: string; level: number }[]`:** bronze 5, silver 11, gold 21, platinum 31, diamond 41, prism 50.
  - `bordersAt(level): string[]`
  - `newBorderAt(level): { id; name } | null` (the border that level unlocks)
- **`ownedItems(ledger, level)`:**
  - free items
  - purchases, with retired theme ids mapped
  - frames whose level is reached
  - `frame-none`
- **`equippedCosmetics(settings, owned)`:** maps a retired theme and falls back to the default when the item isn't owned.
- **`equip(itemId)`** throws `"Reach level N to wear this border."` for a locked border.
- **Shop slots** are `theme`, `avatar` and `freeze`. Frames are not sold. `frame-game` stays a known frame (it is wearable only if bought).
- **`frameRing(frame)`** gains `frame-bronze`, `frame-platinum`, `frame-diamond` and `frame-prism` (a `conic-gradient` rainbow ring with a glass edge).

- [ ] **Step 1: Write the tests:**
  - the catalog matches the owner's list and prices
  - border boundaries 4/5, 10/11, 20/21, 30/31, 40/41, 49/50 (owned below, owned at)
  - a bought `frame-gold` is wearable at level 1
  - a stored `frame-diamond` at level 12 equips as `frame-none`
  - a stored `theme-ocean` with an Ocean purchase reads as `theme-powder`, owned
  - coin balance is unchanged by the mapping
  - `newBorderAt(11)` is Silver and `newBorderAt(12)` is null
  - `useGameTheme` sets `data-game-theme="mono"` by default
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the theme catalog, and borders that unlock with your level`.

### Task 3: The shell — tab bar, theme block, menu

**Files:**
- Create: `src/components/ui/HeadBlock.tsx` (replaces `GlassHeader.tsx`)
- Modify:
  - `src/app/TabBar.tsx`, `src/app/AppShell.tsx`, `src/app/menu.ts`, `src/app/routes.tsx`
  - `src/lib/systemBars.ts`, `src/platform/android/shell.ts`
  - `src/components/ui/Toaster.tsx`
- Delete: `src/app/AddFan.tsx` and its tests
- Test:
  - `src/app/tabBar.test.tsx`, `src/app/nav.test.tsx`, `src/app/AppShell.test.tsx`
  - `src/lib/systemBars.test.ts`
  - e2e: navigation, help, inbox, contrast

**Interfaces:**
- **`TABS`:** Home `/` · Cards `/cards` · Spending `/budget` · Invest `/invest` · Profile `/profile`.
  - `/cards` renders a stub `CardsScreen` (h1 "Cards") until Task 5.
  - The bar runs edge to edge: `glass` at `.78` white, a hairline top, icon over label (11px), height `86px` including the safe area.
  - The current tab is `text-accent` at 800 weight. The rest are `text-muted`.
  - There is no ＋, no fan and no pill.
- **`HeadBlock({ children, className })`:**
  - `bg-head text-head-ink`, bottom corners 36px, `pb-[60px]`, full-bleed
  - pulls up under the status bar as GlassHeader did
  - claims the status-bar icon style for its block kind (Call 7): `claimTop('dark' | 'light')`, which replaces `claimDarkTop`
- **`MENU_GROUPS`:**
  - "Your money": History, Net worth (opens `NetWorthSheet`), My numbers (`soon`, disabled)
  - "You": Quests, Shop, Inbox, Help, Settings
- **`AppShell`:**
  - `<body>` wears `page-blobs` (the page's soft shapes)
  - drops the fan
  - keeps `AddSheet` (opened by Home in Task 4)
  - `main` bottom padding clears the 86px bar
  - toasts sit above the bar

- [ ] **Step 1: Update the tests:**
  - five tabs in order, each with its icon and label
  - `aria-current` on the current tab
  - no "Add" button in the bar
  - the Profile tab opens `/profile`
  - a light-block theme claims `'light'`
  - the menu rows match the list above
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Delete the fan. Profile and Home (until Tasks 4 and 6) use `HeadBlock` where they used `GlassHeader`.
- [ ] **Step 4: Run** typecheck, lint, `npm test`, and the mobile e2e (navigation, help, inbox, contrast). Expected: PASS.
- [ ] **Step 5: Commit:** `feat: an edge-to-edge tab bar with Profile, and the theme block`.

### Task 4: Home (revised wireframe; built after Task 5)

**Source:** `home()`, `hero()` and `acctSheet()` in `design/redesign-v3/glass-themes.html` (re-copied for the revised Home).

**Files:**
- Create:
  - `src/domain/overview.ts`
  - `src/features/dashboard/MoveMoneyDialog.tsx`
  - `src/features/dashboard/ShowOnHomeSheet.tsx`
  - `src/features/dashboard/NetWorthTile.tsx`
- Modify:
  - `src/features/dashboard/DashboardScreen.tsx`, `HomeTopLine.tsx`
  - drop the Home-only sections that are no longer used
- Test:
  - `src/domain/overview.test.ts`
  - `src/features/dashboard/dashboard.test.tsx`
  - e2e finance/demo/a11y where they touch Home

**Interfaces:**
- **Consumes from Task 5:**
  - `useSelectedAccount` / `selectedAccount(data, today, storedId)`
  - `heroFigure(row: AccountRow): { label: 'Available balance' | 'Available credit' | 'Owed'; amount: number }` (Call 3)
  - `PaySheet` with a starting account
  - `historyEntries(data)`
- **`monthToDate(data, today)`** returns `{ income, expenses, incomeChange, expensesChange, incomeSeries, expensesSeries }`:
  - change = percent vs the same days of last month, `null` when last month is 0
  - series = the last 7 months' totals, oldest first
  - income counts confirmed income only; expenses are expenses only
- **`netWorthSummary(data, today, view)`** returns `{ total, have, owe, change: number | null, series: number[] | null }`:
  - `have` and `owe` are the parts of `view.netWorth`
  - `change` and `series` are `null` unless the data reaches the start of this month (the profile's opening date ≤ the 1st). The series is daily over this month, from the existing `netWorthOn`.
  - Never invent a figure.
- **Top line:**
  - the avatar wearing its border, with level ring (→ `/profile`)
  - a one-line "Hi, <name>" ("Hi there" without one)
  - a small `glass-head` currency pill (30px, the profile currency code; a placeholder until P6)
  - a plain bell, no circle (→ `/inbox`, unread dot)
- **Hero:** no box, nothing else.
  - **Label:** `heroFigure().label` at 60% opacity, with a plain eye icon (the existing hide-amounts toggle; 44px tap area).
  - **Amount:** at 42px/700 with "Afl." and the cents dimmed, as a `CountUp`.
  - **Account chip:** plain text with an icon (`CreditCard` when it has a `last4`, else `Wallet`), "<name> ·· <last4>" and a chevron. It opens `ShowOnHomeSheet`.
  - **Two buttons:**
    - Pay (`btn-head`, 34px visible / 44px tap, `Nfc` icon) opens `PaySheet` on the selected account. On a frozen account it says "This card is frozen. Unfreeze it on the Cards tab." with a link to `/cards`.
    - ⋯ (a 34px `glass-head` circle) opens a small menu: "Move money" (→ `MoveMoneyDialog`) and "Correct a balance" (→ `ActualBalanceDialog` on the selected account).
- **`ShowOnHomeSheet`:** "Show on Home".
  - Every active account, as a plain row: icon, name, kind ·· last4 (· frozen), `heroFigure` amount, and a check on the selected one.
  - Picking one sets the shared selection and closes the sheet.
  - Foot: "Swiping to a card on the Cards tab changes this too."
- **Below the block:**
  - **Bill bubbles** (`view.bills`, `glass-strong` circles with logo or initial and days left; a tap opens `/subscriptions`), pulled 42px over the block's edge.
  - **The banners.**
  - **Overview:**
    - Two `glass` tiles, each with a small `glass` ＋ circle at the top right. Tapping the Income tile opens the add-Income sheet, and the Expenses tile the add-Expense sheet (`AddSheet`).
    - Each tile shows its sparkline, total and change.
    - "View all" → `/history`, showing this month.
  - **Net worth** (`NetWorthTile`, a `glass` tile):
    - total; change this month in success/danger with a small sparkline (both hidden when `null`)
    - a have/owe split bar (have in the accent, owe in grey)
    - "You have X · You owe Y"
    - The tile and "Details" open `NetWorthSheet`.
  - **Recent transactions:** 5 plain rows. "View all" → `/history`.
- **`MoveMoneyDialog`:** from, to, amount, date and note, then `finance.transfer`, with the existing account rules and copy. It errors with "Use two different accounts." when from and to match.
- **No longer on Home:** the "Saved" chip and the Expense/Income buttons.

- [ ] **Step 1: Write the tests:**
  - `monthToDate`: same days, month-end, a zero last month
  - `netWorthSummary`: change hidden when the data starts this month
  - Home:
    - the hero shows the selected account's figure, with labels for debit, credit with a limit, and credit without one
    - the chip sheet lists every account and picking one changes the hero
    - Pay opens on the selected account; frozen shows the message
    - the eye masks every amount
    - the Income and Expense tiles open their sheets
    - Move money moves 50 from Main to Savings
    - bubbles list `view.bills`
    - the Net worth tile shows have and owe
    - Recent shows 5
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the file's `home()`, `hero()` and `acctSheet()`.
- [ ] **Step 4: Run** typecheck, lint, `npm test`, and the affected mobile e2e. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Home as in the revised glass wireframe`.

### Task 5: Cards tab

**Files:**
- Create:
  - `src/services/payment.ts` (`PaymentService` and the local implementation)
  - `src/features/cards/` (`CardsScreen`, `AccountCard`, `AccountDialog`, `AccountSheet`, `PaySheet`, `SpendChart`)
  - `src/domain/cardSpend.ts`
  - `src/store/useSelectedAccount.ts`
  - `src/domain/history.ts` (the History entry list, moved from `HistoryScreen`, which then imports it)
- Modify:
  - `src/features/history/HistoryScreen.tsx`
  - `src/store/financeActions.ts` (`setAccountFrozen`; `addExpense` refuses a frozen account)
  - `src/features/shared/AccountField.tsx` (expense pickers leave frozen accounts out)
  - `src/app/routes.tsx`
- Test:
  - `src/features/cards/cards.test.tsx`, `src/domain/cardSpend.test.ts`
  - `src/store/finance.test.ts` (or its home)
  - a mobile e2e

**Interfaces:**
- **`PaymentService.pay({ accountId, amount, category, note, date }): Promise<Expense>`.** The local implementation calls `addExpense`.
- **`ACCOUNT_FROZEN = 'That card is frozen. Unfreeze it to use it.'`**
- **`spendSeries(data, accountId, range: 'day' | 'month' | 'year', today)`** returns `{ label, total, change, bars: { key, amount }[] }`:
  - day: the last 14 days, "Spent in the last 14 days"
  - month: the last 12 months, "Spent this month", change vs the same days of last month
  - year: the last 4 years, "Spent this year"
- **`categoryRows(data, accountId, today)`** returns this month's rows by category: count, amount and whole percent.
- **`useSelectedAccount`** (ledger ruling R-Q6): a zustand store persisted with `safeStorage` key `funancial.selectedAccount`, as `useAmountsHidden` does.
  - `selectedAccount(data, today, storedId): Account | null` returns the stored account while it is active, else `defaultAccount`, else the first active account.
  - Home (Task 4) reads it.
- **`heroFigure(row: AccountRow)`** returns `{ label: 'Available balance' | 'Available credit' | 'Owed'; amount }` (Call 3). Home's hero and its account sheet use it.
- **`historyEntries(data): Entry[]`**, newest first. It is the exact list `HistoryScreen` shows; `AccountSheet` and Home's Recent read it.
- **The screen**, as in the file's `cards()`:
  - **Block:** title "Cards" with a ＋ (opens `AccountDialog` for a new debit, credit, savings or cash account).
  - **Carousel:** the active accounts (loans never) as glass cards. The card shows kind, chip and contactless mark when it has a `last4`, balance (credit: owed and free), name and `•••• last4`, and the frost and "FROZEN" badge when frozen. Selecting a card writes the shared selection:
    - the centred card is selected (IntersectionObserver)
    - tapping a card selects it and scrolls it to the centre
    - the carousel opens on the stored selection
    - small dots under it show the selected card (the active dot is wider)
  - **Actions:**
    - Pay (`btn-head`): `PaySheet({ accountId, onClose })` (Home opens it too) takes amount, category and note, then shows "Pay", "Paying…" and done. The card's balance counts to its new value. It is disabled with "Unfreeze to pay" on a frozen card, and refused on savings with the existing copy.
    - Freeze / Unfreeze (`setAccountFrozen`, frost in 380ms, fade only under reduced motion).
    - View card: `AccountSheet` shows details, then "Pay the card" (credit, existing `PayDialog`) or "Correct the balance", the account's last 10 History entries and its subscriptions.
    - Settings: `AccountDialog` edits name, kind (fixed once it has history, as now), last 4, credit terms, in-Available and delete. Delete reuses the existing move-subscriptions and archive flow. `CardDialog` folds into it.
  - **Below the block:** the `glass-strong` "Available to spend" pill over the block's edge, showing `view.available` (tap opens `AvailableSheet`). Then the `glass` chart box with a Day/Month/Year `SegmentedControl` and the highest bar labelled in the accent. Then Categories and Bills (next 3, "View all" → `/subscriptions`), then Loans (`view.loans`, next payment day, "View all" → `/debts`), all as plain rows.

- [ ] **Step 1: Write the tests:**
  - `spendSeries` and `categoryRows` (per account, ranges, change)
  - a frozen account can't take `addExpense` and is missing from the expense picker
  - Pay 12.50 on Main lowers its balance by 12.50
  - Pay on Visa raises what it owes
  - Freeze disables Pay
  - a new cash account appears in the carousel
  - the chart follows the selected card
  - tapping a card selects it, and the selection survives a reload of the store
  - an archived stored selection falls back
  - `heroFigure` for debit, credit with a limit, and credit without one
  - `historyEntries` matches the History screen's order
  - the pill equals `view.available`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** typecheck, lint, `npm test`, and a mobile e2e (open Cards, pay, freeze). Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the Cards tab with pay, freeze, card details and settings`.

### Task 6: Profile, borders and the Shop

**Files:**
- Modify:
  - `src/features/profile/ProfileScreen.tsx`
  - `src/features/shop/ShopScreen.tsx`, `src/features/shop/BuyDialog.tsx`
  - `src/features/game/LevelUpDialog.tsx`, `src/features/game/Avatar.tsx`
- Create: `src/features/profile/BorderSheet.tsx`
- Test: `src/features/profile/profile.test.tsx`, `src/features/shop/shop.test.tsx`, `src/features/game/celebrations.test.tsx`

**Interfaces:**
- **Profile**, as in the file's `profile()`:
  - **Block:** a `glass-head` gear (→ `/settings`); a 92px avatar wearing its border, with a `btn-head` "Lv N" badge (a tap opens `BorderSheet`); name; tier; `LevelProgress` on a `glass-head` track with `--color-hero-xp`.
  - **Stats card:** a `glass-strong` card over the edge with streak, badges (earned / total) and coins.
  - **Badges row:** earned badges first, at most 5. "All" → `/quests`.
  - **Menus:** `MenuGroups` as plain rows.
  - **Moved note:** "Goals are in the Spending tab · Income opens from Home · Bills & cards and Loans are on the Cards tab."
- **`BorderSheet`:** none, then the six borders and any bought legacy frame.
  - Unlocked borders are pickable (they call `equip`). Locked ones are greyed with "Level N".
  - The worn one is marked.
- **`LevelUpDialog`:** when `newBorderAt(level)` is set, it adds "New border: <name>. Pick it on your Profile."
- **The Shop**, as in the file's `shop()`:
  - **Block:** back, "Shop", coins.
  - **Segmented control:** Themes / Avatars / Freezes.
  - **Themes:** Free, Light and Dark groups. Each card is a `glass` card with a mini preview (`data-theme-preview`), name, price or "Free", and Buy, Use or On.
  - **Buying** goes through the existing `BuyDialog`.

- [ ] **Step 1: Write the tests:**
  - the Profile sections and order
  - the border sheet: a locked level 21 Gold at level 12, picking Silver at level 11
  - the level-up dialog at 11 names Silver; at 12 it names none
  - the Shop's three groups and prices
  - buying Sunny Sky with 400 coins turns it on
  - an owned theme shows "Use"
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** typecheck, lint, `npm test`, and the mobile e2e (game, navigation). Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Profile, borders and the themes shop as in the glass wireframe`.

### Task 7: Spending and Invest restyled

**Files:**
- Modify:
  - `src/features/budget/BudgetScreen.tsx` (+ a Goals section)
  - `src/features/invest/*` (the screen and tabs only)
  - shared list and section styles where these pages use them
- Test: `src/features/budget/budget.test.tsx`, `src/features/invest/*.test.tsx`

**Interfaces:**
- Both pages keep their structure and behaviour:
  - their charts and summaries sit in `glass` tiles
  - their lists are plain rows with hairlines
  - page titles are `text-page`
- **Budget gains Goals:** each goal is a plain row with its ring and saved / target. "View all" → `/goals`. Empty: "Set a goal" → `/goals`.

- [ ] **Step 1: Write the tests:**
  - Budget shows the Goals section with the demo goals, and the link
  - existing Budget and Invest tests still pass
- [ ] **Step 2: Run them.** Expected: FAIL (Goals).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** typecheck, lint, `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Spending and Invest in glass, and Goals on Spending`.

### Task 8: Contrast across themes, version 0.12, everything green

**Files:**
- Modify:
  - `tests/e2e/contrast.spec.ts` (a theme dimension)
  - `android/app/build.gradle` (`versionCode 12`, `versionName "0.12"`)
- Test: the whole suite

- [ ] **Step 1:** Extend `contrast.spec.ts`. Run every scan for Black & White, Sunny Sky and Midnight Navy (set through the stored settings in demo, or by `data-game-theme` on `<html>` before the scan), each in light and dark mode. Fix violations with tokens.
- [ ] **Step 2: Raise the version.** Run `npm run typecheck && npm run lint && npm test && npm run test:e2e`. Expected: all PASS.
- [ ] **Step 3: Commit:** `chore: version 0.12 (versionCode 12) for the glass themes`. Then the final whole-branch review, one fix wave, and the report to the parent session.
