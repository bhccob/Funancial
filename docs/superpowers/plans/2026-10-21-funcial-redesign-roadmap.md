# Funcial redesign — roadmap

**Spec:** `docs/superpowers/specs/2026-10-21-funcial-redesign-design.md` (direction A, P1–P4
approved). Mockup reference: `design/redesign-v2/directions.html`, section A.

How this works:
- The redesign ships in phases, in the order below.
- Each phase gets its own detailed plan (superpowers:writing-plans) just before it is built, in
  `docs/superpowers/plans/2026-10-21-funcial-redesign-pN-<name>.md`. Phase 1's is written.
- Each phase ends on the owner's phone:
  - raise `versionName`/`versionCode` in `android/app/build.gradle`
  - `npm run android:run` with `JAVA_HOME` inline
  - the owner checks the phase's acceptance list
  - a PR to `main`
- Rulings go in `docs/superpowers/reviews/2026-10-21-redesign-pN-decisions.md`.

The full unit suite, typecheck, lint and e2e must pass at the end of every phase. The guest path
(no account) is part of every phase's e2e run.

## Order and what can run side by side

```
P0 bug fixes ─┐
              ├─ P1 data foundation ─┐
              └─ P2 design system ───┴─ P3 Home ─ P4 Cards ─ P5 Spending&Goals/History ─ P6 Currency ─ P7 Net worth
                                                     └──────── P8 Invest (after P4) ────────┘
                                         P9 Profile/levels (after P3) · P10 Settings+Security (after P2) · P11 Setup (after P4)
```

- **P1 and P2 can run at the same time** in separate worktrees:
  - P1 touches `src/domain`, `src/store`, `src/data` and the forms.
  - P2 touches `src/styles`, `src/components/ui`, `src/app` (the shell) and the fonts.
  - Their one meeting point is `src/app/routes.tsx` and `src/app/menu.ts`. P1 removes the Buy
    it / Salary freeze / About you entries there, and P2 only reorders navigation. Whoever merges
    second resolves it.
- P10 (Settings + Security, with server work) only needs P2 and can run beside P3–P8.
- P8 (Invest) only needs P1 and P2, plus P4's card picker for "Buy more", so it can run beside P5–P7.
- Everything else is in order, because it shares Home and the finance view.

## Phase 0 — Bug fixes (in progress)

Branch `fix/card-and-data-delete`, version 0.9:
- deleting a card moves its subscriptions to debit and archives a card with history
- Delete all data with an account starts over

**Done when:** the owner checked both on the phone and the PR is merged. P1 starts from that
`main`.

## Phase 1 — Data foundation (version 0.10, looks the same)

Plan: `2026-10-21-funcial-redesign-p1-data-foundation.md`.

What it does:
- Cards model (schema v10): accounts replace the cash/savings/passive buckets and credit-card
  debts.
- Settings gains `defaultAccountId`.
- Removes "Should I buy it?", About you and Salary freeze, with their data.
- Every existing screen works on accounts, with today's look.

**Acceptance:**
- After the update on the phone:
  - Main account = the old Cash, Savings = the old Savings, and each card owes what it owed, to
    the cent
  - Net worth is unchanged
  - Available to spend changes only as P2 says (savings out; a subscription on a card is no longer
    counted twice)
- Buy it, About you and Salary freeze are gone everywhere: menu, Home banners, reminders, Help,
  Inbox and quests.
- Adding an expense or income, a subscription, paying a card, correcting a balance, adding a
  holding, selling, confirming a dividend, and goal contributions all work and name an account.
- A brand-new setup creates Main account, Savings and the cards it was given.
- The account copy on the server upgrades the same way on log-in.

## Phase 2 — Design system and app shell (version 0.11)

What it does:
- The direction A tokens (spec §11) in light and dark, and Inter Tight.
- The primitives:
  - `GlassHeader`, `Tile`, `Pill`, `SegmentedControl`, `RoundAction`, `Key`
  - `CountUp`, `Rise` (the staggered entrance) and the press feedback
- The floating tab bar **Home · Cards · ＋ · Spending · Invest**:
  - Tapping ＋ fans out Expense / Income over a scrim.
  - A second tap on a bubble opens its form as a sheet.
  - Until P4/P5 exist, Cards opens today's Bills & cards page and Spending today's Budget page.
- The avatar at the top left opens a **Profile** page. For now it holds level progress and
  today's Menu groups, which replaces the Menu sheet.

**Acceptance:**
- Tokens pass `tokens.test.ts` contrast checks in both themes.
- The tab bar and ＋ fan behave as in the mockup:
  - ＋ turns into an ×
  - the bubbles rise and the scrim closes them
  - back closes them on Android
- Reduced motion gives fades only.
- Every existing screen still renders in both themes without contrast failures (axe in e2e).

## Phase 3 — Home (version 0.12)

What it does, top to bottom:
- **Top line:** avatar with level ring, greeting, currency pill (a placeholder until P6), bell.
- **Hero on the dark header:**
  - Available to spend with a count-up, the eye, and *All money ↔ Cash in pocket*
  - tapping the amount opens the purchases behind it
  - keys *Spent in <month>* and **Saved**, which opens savings accounts and goals, editable
- **Coming up:** bill bubbles over the header edge, plus the month total link to Bills.
- **Income vs Expense:** side by side, with sparklines, change vs last month and the split bar.
- **Limits:** tap to edit, Add a limit.
- **Recent:** 5 transactions, "All" → History.
- **Quests:** top 2 (P4 approved).

**Acceptance:**
- Income vs Expense side by side with real numbers.
- Hide-money masks every amount on Home.
- The Cash view shows the cash accounts' total.
- Saved opens and edits.
- Limits edit from Home.
- Matches mockup A on 360px and 412px widths.

## Phase 4 — Cards and Pay (version 0.13)

What it does, as the Cards scene (spec §5):
1. **Carousel** of account cards (skins), with a "+" card to add debit, credit, savings or cash.
2. **Combined Available** pill that expands per account.
3. **Category donut** for the selected card (P1).
4. **Freeze / View card / Settings.**
5. **Spending graph** for the selected card: Daily / Monthly / Yearly.

Also:
- **Pay** flow behind `PaymentService` (local implementation only), with the "Paying…" →
  balance count-down → row slides into Recent.
- Card settings: name, skin, kind, last 4, credit terms, in-Available, delete (moving
  subscriptions; archive with history).

**Acceptance:**
- Add a card, see its balance, pay (mock): the balance drops and the transaction is logged.
- The combined Available total is correct and expands per card.
- All 5 sections present and working.
- A frozen card can't be picked in Pay or in the add-expense form.

## Phase 5 — Spending & Goals, History, tax tags (version 0.14, schema v11)

What it does:
- Schema v11: `expense.merchant`, `expense.tax`, goal `kind: 'wishlist'` with nullable target,
  `link`, `achievedAt` and `order`.
- **Spending & Goals** page (replaces Budget in the tab bar):
  - month switcher and donut
  - limits
  - goals, including wishlist items, which show no target, saved amount or deadline
  - goal history
- **History:**
  - every transaction, with filters (card, category, type, date range, tax-deductible) and
    merchant search
  - with the tax filter on, a per-year total
- Expense form: merchant field and tax tag.

**Acceptance:**
- Budget and spending are merged.
- History lists everything and filters correctly.
- Manual tax tagging works, and the year total is correct.
- A wishlist goal hides target, saved amount and deadline.

## Phase 6 — Currency switcher (version 0.15, schema v12)

What it does:
- `settings.displayCurrency`, which replaces `investCurrency`/`investFx`, and `settings.fx`.
- AWG ↔ USD at the fixed 1.79 peg. EUR from `/api/fx`, refreshed daily, with the last rate used
  offline.
- The top-line pill switches every amount app-wide. Totals are converted once, so rows still add
  up.

**Acceptance:** switching reformats every amount correctly (Afl. / $ / €), totals still add up,
and stored values are unchanged.

## Phase 7 — Net worth (version 0.16, schema v13)

What it does:
- `netWorthItem` and `netWorthPoint` tables.
- The Net worth page:
  - figure and graph (1M/6M/1Y/All)
  - donut by type
  - assets and liabilities, with automatic items marked
  - add/edit/remove manual items
- A daily point is saved on open and after changes.

**Acceptance:**
- Add, edit and remove items.
- The total is correct, including cards, investments and loans.
- The graph draws from the saved points, and the breakdown adds up.
- Follows the currency switcher and hide-money.

## Phase 8 — Invest (version 0.17, schema v14)

What it does:
- Audit fixes 1–7 (spec §7):
  - Buy more
  - value over time
  - target % with drift and a Rebalance sheet
  - every holding gets its own slice
  - `brandColor` from the logo service, with an override
  - a currency note
  - a clearer delete
- The investing area restyled to direction A.

**Acceptance:**
- No duplicate holdings are possible.
- Buying more records money leaving a card.
- Targets add up to 100% or are unset.
- The rebalance suggestion is correct on worked examples.
- The pie is in brand colors.

## Phase 9 — Profile, levels and My numbers (version 0.18)

What it does:
- The Profile page:
  - avatar with border, title, level and progress to the next level
  - badges, quests, streaks, shop
  - the short menu: Net worth · My numbers · History · Bills · Loans · Settings · Help
- Titles, badges and borders unlock at level thresholds; frames leave the shop.
- **My numbers:** every number the app runs on, grouped and editable, each saying where it's used.

**Acceptance:**
- The menu is reduced and Profile hosts it.
- Borders, titles and badges unlock at the thresholds (tested at each boundary).
- My numbers edits take effect where they're shown.

## Phase 10 — Settings pages and Security (version 0.19, server deploy)

What it does:
- **Settings** becomes a list of categories (Profile, Account, Security, Currency, Reminders,
  Appearance, Data), each with its own page.
- **Security**, with server work (spec §9):
  - 2-step verification by emailed code
  - devices
  - security alerts
  - save login info (username only)
  - change password, app lock, biometrics, auto-lock
- The server routes are deployed to Vercel, after asking the owner.

**Acceptance:**
- Each category opens only its own page.
- 2-step codes expire after 10 minutes and allow 5 tries, rate-limited.
- Alerts email on a new phone and on a password change.
- The username is remembered and the password never is.

## Phase 11 — Setup (version 0.20)

What it does:
- The welcome and setup restyled to direction A.
- The simpler card step (first list): each card is a name, current amount, debit or credit, and
  an "I owe money on it" switch.
- The guest path is first-class:
  - "Skip for now" on the account step
  - guest data moves into the account when one is created later

**Acceptance:**
- No-login mode works end to end.
- Signing up later keeps every guest record.
- Setup creates the right accounts from the card step.
