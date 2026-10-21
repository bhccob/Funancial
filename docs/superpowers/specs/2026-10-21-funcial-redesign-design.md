# Funcial redesign — design (2026-10-21)

Status: **approved direction A and proposals P1–P4 (owner, 2026-10-21).** The plan is
`docs/superpowers/plans/2026-10-21-funcial-redesign-roadmap.md`, with one detailed plan per phase.
The direction mockups are in `design/redesign-v2/directions.html`.

## 1. Why

The owner wants Funcial to look and feel like a modern fintech app: glass surfaces, minimal,
playful, with motion and charts everywhere. The two references:

- **X video** (askwhykartik, "know your balance in 2 seconds"):
  - A near-black glass header with a faint purple glow and rounded bottom corners sits over a light
    grey body.
  - The balance is huge, with the cents dimmed. An eye button masks it.
  - The tab bar floats as a white pill, and the active tab grows to show its label.
  - The Cards screen has a swipeable card carousel and round Freeze / View details / Settings
    buttons. Freezing frosts the card and adds a snowflake "FROZEN" badge.
  - When a payment is sent, the button turns to "Sending…", the balance counts down, and the new
    row slides in at the top of Recent.
- **Screenshot** (three phones):
  - A soft white and pastel version: lilac active pill, a mint glass card, rounded white tiles.
  - A fox mascot with dollar sunglasses sits inside a ring chart on a "Spendings & Goals" page.

At the same time the app drops what the owner doesn't use ("Should I buy it?", Salary freeze) and
adds cards, net worth, tax tags and a currency switcher.

**Success:** the owner opens the app and knows their money in two seconds, enjoys tapping around,
and every number they care about is one tap from Home.

**Anti-goals:**
- a generic template look
- glass that hurts legibility
- motion that slows down logging an expense
- losing the data already on the phone

## 2. Decisions the owner made (2026-10-21, "all picks")

1. **Redesign on the existing foundation.** Every screen and the design system get rebuilt. These
   stay: encrypted storage, the Android shell, accounts, the XP/level engine, the price service and
   the test suite. Stack confirmed: React 19, TypeScript, Tailwind 4, Motion, Capacitor Android,
   SQLCipher, Vercel functions and Upstash.
2. **The first list of 2026-10-21 is folded in** wherever it doesn't conflict (mapping in §4). The
   card-delete and Delete-all-data bugs are fixed first, as their own update
   (branch `fix/card-and-data-delete`).
3. **"Pay with a card" records a purchase.** It is a wallet-style flow that records the purchase on
   the picked card: the balance drops and a transaction is logged. It goes through a
   `PaymentService` interface whose only implementation writes locally. There is no fake processor.
   Real money movement would need a card-issuing program, which is only open to registered
   companies and isn't available in Aruba.
4. **Cards = every place money sits.** Debit/bank cards, credit cards, savings and a Cash wallet
   all appear in the carousel. Available to spend = debit + cash, never unused credit.
5. **Currency: FL = AWG.** It is pegged at 1.79 per USD, so that rate is fixed in the app. EUR
   comes from `/api/fx` (refreshed daily; offline it uses the last rate fetched). Amounts stay
   stored in the profile currency, and the switcher only changes what is shown.
6. **Tax deductions: manual tagging only.** Each tag has an optional type, and there is a total per
   year. No bank sync, because no bank-connection service reaches Aruban banks.
7. **Investing:** audit first (§7). Then add an optional target % per holding, drift from target,
   and value over time.
8. **Navigation:** **Home · Cards · ＋ · Spending & Goals · Invest**. Profile opens from the avatar
   (top left). The Profile page shows level, badges and border, and holds the short menu.
9. **Levels:** borders, titles and badges unlock at level thresholds instead of being bought. The
   coin shop keeps themes, avatars and streak freezes. Quests and streaks stay, on Profile.
10. **Removed entirely:** "Should I buy it?", About you and Salary freeze. Their saved data is
    deleted by the data upgrade.
11. **Calls Claude made, unchallenged:**
    - Net worth = automatic items (cards, investments, cash, loans) plus manual items. Its graph
      starts the day it ships.
    - A frozen card can't be picked in the Pay flow.
    - The hide-money toggle stays as today.
    - Income vs Expense sits side by side on Home.
12. **Visual direction: A, Midnight Glass** (§11).
13. **Proposals P1–P4 approved** (§10).

## 3. Not doing

- Real payments, bank sync and Apple/Google Wallet integration.
- Cards in currencies other than the profile's.
- AI anything (the owner ruled it out on 2026-10-16).
- iOS.
- A web deployment of the app (the download page stays as is).

## 4. The first list, item by item

| First-list item | Where it lands |
| --- | --- |
| Deleting a card blocked by subscriptions | Bug-fix update (own branch), then the Cards model (§6) keeps it working |
| Delete all data doesn't work | Bug-fix update (own branch) |
| Stock pie in each company's color | Invest: `Holding.brandColor` (§6), used by the pie |
| Settings: one page per category, new Security page | Settings, §9 |
| Setup: simpler card step | Setup: name + current amount, debit/credit choice, "I owe money on it" switch |
| "Should I buy it?" tweaks | Dropped (feature removed) |
| Tap Available to spend → history; cash-in-pocket view | Home hero: tap opens the purchases behind it; a toggle switches All money ↔ Cash in pocket |
| A place to see and edit all my numbers | **My numbers** page in the Profile menu (§5) |
| Goals: "wishlist" kind with no target/saved/deadline | `Goal.kind = 'wishlist'` (§6) |
| Home: keep Available; replace "bills to come" with savings + a button to see/edit where it's saved | Home hero's right key becomes **Saved**, which opens the savings accounts and goals |
| Move the four round buttons; ＋ in the bar opens Expense / Income | Center ＋ in the tab bar. One tap fans out Expense and Income, and a second tap on one opens its form |
| "Coming up" takes the four buttons' place, redesigned | Home: a horizontal strip of upcoming bills under the hero |
| Goals + Buy it on the Budget page; Budget not its own page | **Spending & Goals** page (Buy it removed). Limits are edited from Home's Limits section too |
| Goal history moves there | Spending & Goals, under Goals |

## 5. Screens and navigation

**Tab bar** (floating pill):
- Home · Cards · ＋ · Spending & Goals · Invest
- ＋ fans out two bubbles, Expense and Income. Tapping one opens its add form as a sheet.
- The active tab shows its label.

**Home**
1. Top line: avatar (opens Profile) with greeting and level ring, currency pill (AWG / USD / EUR),
   bell (Inbox).
2. Hero:
   - **Available to spend**, huge, with an eye to hide amounts. Tapping the amount opens the
     purchases behind it.
   - A small toggle switches *All money* ↔ *Cash in pocket*.
   - Under it, two keys: *Spent this month* and **Saved**. Tapping Saved opens a sheet with the
     savings accounts and goals, editable.
3. **Coming up**: a horizontal strip of bill chips (logo/initial, name, amount, "in 3 days"). The
   header link goes to Bills.
4. **Income vs Expense** for the month, side by side, with real numbers, a small sparkline each,
   and the change against last month.
5. **Limits**: bars with a pace mark. Tapping one edits it, and "Add a limit" sits at the end.
6. **Recent**: the last 5 transactions with merchant logos/initials. "All" goes to History.
7. Quests: the top 2, linking to Profile.

**Cards** (in the order the spec gives):
1. A carousel of card visuals (debit, credit, savings, cash), plus a "+" card at the end. Each card
   shows its name, the last 4 digits if given, its balance (for credit: owed and available) and a
   kind mark.
2. Combined **Available to spend**: a small pill-shaped figure. Tapping it expands a per-card
   breakdown.
3. Spending by category (donut) **for the selected card**.
4. Card actions: **Freeze** (frost and snowflake animation; a frozen card can't be picked in Pay),
   **View card** (its details, transactions and subscriptions) and **Settings** (name, color, kind,
   last 4, limit and due day for credit, include in Available, delete).
5. Mini spending graph for the selected card, with a Daily / Monthly / Yearly toggle.

A **Pay** button on the card opens the wallet-style flow:
- amount → merchant → category → optional tax tag → "Pay" → "Paying…" → done
- the card's balance animates down and the row slides into Recent

**Spending & Goals**
- Month switcher. The donut of spending by category in the middle, with the month's total.
- **Limits**: the full list with pace, add and edit.
- **Goals**: rings for savings goals and wishlist items (no ring), add and edit.
- **Goal history**: contributions and finished goals.

**Invest**: the existing Holdings / Dividends / News tabs, restyled. The pie uses brand colors. It
adds targets, drift and value over time (§7).

**Profile** (from the avatar):
- avatar with its border, title, level and progress to the next level
- badges, quests, streaks, shop
- then the menu: **Net worth · My numbers · History · Bills · Loans · Settings · Help**

**Net worth**:
- the figure, then a graph over time (1M / 6M / 1Y / All)
- breakdown by type (donut)
- assets and liabilities lists. Automatic items are marked "from your cards/investments"; manual
  items can be added, edited and removed.

**My numbers**: every number the app runs on, grouped and editable in place:
- *Money* (each card's balance, opening amounts)
- *Income* (salary, pay day)
- *Bills* (each subscription)
- *Limits*
- *Goals*
- *Loans*

Each row says which screen uses it ("feeds Available to spend").

**History**: every transaction (expense, income, transfer, card payment, investment).
- Filters: card, category, type, date range, tax-deductible.
- Search by merchant.
- With the tax filter on, a per-year total of tagged items is shown.

**Settings**: a list of categories, each opening its own page:
- **Profile**
- **Account**
- **Security** (§9)
- **Currency**
- **Reminders**
- **Appearance**
- **Data**

## 6. Data model

Money stays integer minor units in the profile currency.

The cards model and the removals are **schema version 10**. It is the only upgrade that has to
look across tables, because it builds accounts out of the profile and the debts. Every other
change below arrives with the phase that needs it, as its own small per-record step (v11, v12, …).
Fields marked *(later)* are those.

The changes, table by table:

### New: `account` (shown as a "card")
```
id, createdAt, updatedAt
name            string
kind            'debit' | 'credit' | 'savings' | 'cash'
skin            string       // card look preset id (gradient/glass), from the design system
last4           string | null  // display only, 4 digits; never a full card number
openingBalance  Money        // debit/savings/cash: what is on it; credit: what is owed
openingDate     LocalDate
inAvailable     boolean      // default: debit and cash true, savings and credit false
frozen          boolean
order           int          // carousel position
archivedOn      LocalDate, optional   // deleted with history: from this day hidden, and what it
                                      // holds or owes no longer counts (as the 0.9 bug fix does for cards)
credit          { limit: Money|null, statementDay, dueDay, payInFull, minimumPayment,
                  interestRate } | null   // only for kind 'credit'
```
Settings gains **`defaultAccountId`**: the account a new expense starts on, and where an expected
salary lands. It is Main account after the upgrade.
Balance as of a day = opening + income in − expenses out ± transfers ± adjustments. For credit,
expenses raise what is owed and payments lower it.

### Changed: `expense`
- `paymentMethod` + `cardId` → **`accountId`** (required).
- *(later)* **`merchant`** string ('' allowed). Shown as the row title, with `note` kept for extra
  words.
- *(later)* **`tax`**: `{ type: 'medical'|'donation'|'work'|'education'|'other', note: string } |
  null`. Null means not deductible.

### Changed: `income`
- `bucket` → **`accountId`**.

### Changed: `dividend` and `sale`
- A dividend's `bucket` → **`accountId`** (null when skipped or reinvested) plus
  **`reinvested`** boolean.
- A sale's `to` → **`toAccountId`**.

### Changed: `transaction` (money moving, not spending)
- `from`/`to` buckets → **`fromAccountId` / `toAccountId`**.
- A card payment = a transfer into a credit account (`type: 'card_payment'`).
- `debt_payment` keeps `debtId` (loans only) and gains `fromAccountId`.
- *(later)* `investment` gains **`holdingId`** and **`shares`**, so every buy is recorded.
- `adjustment` names `toAccountId` and carries a signed amount.

### Changed: `subscription`
- `paymentMethod` + `cardId` → **`accountId`**.
- Deleting an account moves its subscriptions to another account the person picks in the delete
  dialog.

### Changed: `debt`
- Loans only. Credit cards move to `account` (same ids, so existing references stay valid).

### Changed: `profile`
- `openingCash` and `openingSavings` move into the Main account and Savings openings.

### Changed: `goal` *(later)*
- `kind` adds **'wishlist'**.
- `target` becomes nullable (null only for wishlist), and `deadline` is already nullable.
- Adds `link: string | null` (wishlist), `achievedAt: timestamp | null` (for goal history) and
  `order`.

### Changed: `holding` *(later)*
- **`targetPct`**: number 0–100 | null.
- **`brandColor`**: `#rrggbb` | null. It is fetched with the logo, and the person can override it.
- Buying more shares of a holding you already own goes through **Buy more**. It adds shares and
  cost to the same holding and writes an `investment` transaction (§7, finding 1).

### New: `netWorthItem` (manual items) *(later)*
```
id, createdAt, updatedAt
label    string
side     'asset' | 'liability'
type     'property' | 'vehicle' | 'cash' | 'investment' | 'loan' | 'other'
value    Money (non-negative; the side gives the sign)
note     string
```

### New: `netWorthPoint` (history for the graph) *(later)*
```
id = the date (one per day; a later save that day replaces it)
date        LocalDate
assets      Money
liabilities Money
byType      Record<type, Money>
```
It is saved when the app opens and after any change, at most once per change per day.

### Changed: `settings` *(later, except `defaultAccountId` above and the reminder removals)*
- **`displayCurrency`**: 'AWG' | 'USD' | 'EUR' | null. Null means the profile currency. It
  replaces `investCurrency`, and Invest follows the global switcher.
- **`fx`**: `{ USD: number, EUR: number, asOf }`, units per profile-currency unit. A USD↔AWG pair
  uses the fixed 1.79 peg.
- **`homeView`**: 'all' | 'cash' (the hero toggle).
- `reminders`: drop `freeze` and `buyIt`, add **`goalReminders`**.
- `cosmetics.frame` may only name a border the level has unlocked.
- **`security`**: `{ rememberUsername: boolean, alerts: boolean }`.

### Removed tables
`buyDecision`, `aboutYou`, `salaryFreeze`. The v10 upgrade drops their rows.

### The upgrade from v9 (runs on the phone and on the account copy)
1. **Accounts:**
   - The `cash` bucket becomes **Main account** (debit, `inAvailable`), with opening = `openingCash`.
   - `savings` becomes **Savings** (savings kind), with opening = `openingSavings`.
   - `passive` becomes **Passive income** (savings kind), only if anything was ever paid into it.
   - Each credit-card debt becomes a credit account with the same id.
2. **Expenses** paid by credit card get `accountId = cardId`. Every other expense gets Main account.
   `merchant` = '' and `tax` = null.
3. **Income, transactions and subscriptions** map their buckets and card ids to account ids the
   same way.
4. **Removed tables** lose their rows. Settings drop `investCurrency`/`investFx` (a chosen invest
   currency carries over as `displayCurrency` when it is AWG, USD or EUR).
5. Balances before and after the upgrade must match to the cent. A test checks this on the demo
   data and on the owner's real data shape.

> The person can later add a **Cash** wallet and move money into it with a transfer. The upgrade
> can't know how much of "cash" was in a pocket and how much in a bank.

## 7. Investing audit (report first, as asked)

What exists:
- Holdings with shares, cost basis, a quote, FX and dividends.
- Sales with realized profit and undo.
- An all-time profit block (price + dividends + sales).
- A pie of value per holding (top 5 + Other).

Findings, most important first:

1. **No way to buy more of something you own.** Adding the same symbol again makes a second
   holding, so the pie shows two slices of one stock. Editing shares by hand changes the holding
   but records no money leaving a card, so the balance and the investment total drift apart.
   *Fix:* **Buy more** adds shares and cost to the holding and records an `investment` transaction
   from a card. Adding a symbol you already own offers Buy more instead.
2. **No value over time for the whole portfolio.** Only each holding's price chart exists, while
   pie-style investing normally shows the pie's value over time. *Fix:* rebuild it from the
   recorded buys and sales (finding 1 makes them complete from now on) together with
   `/api/history` prices, and fall back to daily saved points for holdings with no history.
3. **No targets, drift or rebalancing.** *Fix:*
   - an optional target % per holding (the targets of a pie add up to 100% or are left unset)
   - the pie shows the actual share against the target ring
   - each row shows its drift ("+4% over target")
   - a **Rebalance** sheet works out what to buy to get back on target with new money, so nothing
     is sold by default ("to rebalance with 500: buy 320 of VWRL, 180 of AAPL"). Selling to
     rebalance is shown as an option.
4. **The pie hides everything after the top 5** in "Other". With targets, every holding needs its
   own slice. *Fix:* show every holding, and fold slices under 2% only when there are more than 8.
5. **Pie colors are by position, not by company.** *Fix:* `brandColor` (first-list item).
6. **Gains mix price and exchange-rate moves.** That is normal when reporting in your own currency.
   With AWG pegged to USD it doesn't matter for US stocks, but it does for EUR ones. *Fix:* label
   only ("includes currency changes"), with no change to the math.
7. **Deleting a holding keeps its purchase transaction.** This is correct (the money was spent),
   but the screen doesn't say so. *Fix:* the delete dialog explains it and offers "I sold it"
   instead.

Nothing found wrong in: the cost-basis split on partial sales, the rounding of converted totals,
break-even after dividends, or the dividend withholding.

## 8. Calculations

- **Available to spend:**
  - Start from the balances of accounts with `inAvailable` (debit and cash by default).
  - Take off this month's unpaid bills charged to those accounts, this month's credit-card payments
    due, and what limits with `reserve` keep back.
  - A subscription charged to a credit card is not taken off: it lands on the card and comes back
    as that card's payment. Today's rule takes off both, which counts it twice.
  - *Cash in pocket* view: what the cash accounts hold, with nothing taken off.
  - This changes today's rule: savings used to count. The first list puts savings apart as
    "Saved", so savings no longer count toward Available (P2, approved).
- **Saved:** savings accounts plus goal money (goals are labels on savings, so they're not added
  twice).
- **Net worth:**
  - assets = every non-archived account except credit, plus investments at market value, plus
    manual assets
  - liabilities = credit owed, loans and manual liabilities
- **Income vs Expense:** confirmed income against expenses for the calendar month. The change is
  measured against the same days of last month.
- **Display currency:** every amount converts once at render, with `Intl` formatting:
  - **AWG**: symbol "Afl." with 2 decimals
  - **USD**: "$"
  - **EUR**: "€"

  Totals are computed in the profile currency and converted once, so rows add up as on Invest
  today.

## 9. Settings → Security (server work included)

Today an account allows one phone at a time: logging in on another phone signs out the first.

- **2-step verification:** an optional 6-digit code emailed at log-in (the Gmail mailer exists).
  The code lives 10 minutes, with 5 tries, rate-limited.
- **Devices:** shows the signed-in phone (model, last log-in time and place in plain words) and
  "Sign out of other devices". With one-device accounts this mostly says "only this phone". Kept
  simple on purpose.
- **Security alerts:** email on log-in from a new phone and on password change (on by default).
- **Save login info:** remember the username on this phone (the password never). There are also
  switches for biometric unlock and auto-lock, which move here from today's Security section.
- **Change password** and **App lock** (PIN / passphrase / none).

## 10. Proposals (open mandate) — all four approved 2026-10-21

- **P1. Cards scene charts follow the selected card.** Otherwise sections 3 and 5 repeat Spending &
  Goals. With this, Cards answers "what did *this card* do" and Spending & Goals answers "what did
  *I* do".
- **P2. Available to spend leaves savings out** (§8). The first list's "Saved" key implies it.
- **P3. Loans stay loans** (not cards). They show on Net worth and in the Profile menu, and stay
  out of the carousel.
- **P4. Quests stay** but move to Profile, and Home shows only the top 2.

## 11. Design system: direction A, Midnight Glass

The look of the X video: a near-black glass header with a violet glow over a light grey body,
solid white tiles, and a floating white pill tab bar with an ink active pill. The live reference
is section A of `design/redesign-v2/directions.html`. Tokens keep today's names in
`src/styles/tokens.css` (so existing screens follow), and new ones are added for the header,
glass and motion.

**Color, light** (default):

| token | value | use |
| --- | --- | --- |
| `bg` | `#f2f2f5` | the page body ("mist") |
| `surface` | `#ffffff` | tiles, sheets |
| `surface-2` | `#ebebf0` | quiet fills, round action buttons on light |
| `text` | `#0b0b12` | ink |
| `text-muted` | `#66667a` | second lines (≥ 4.5:1 on `bg` and `surface`) |
| `border` / `border-strong` | `#e6e6ec` / `#d2d2db` | hairlines |
| `track` | `#ececf1` | bar and ring tracks |
| `primary` / `primary-contrast` | `#0b0b12` / `#ffffff` | ink pill: active tab, primary buttons |
| `accent` | `#7c5cff` | glow violet: the ＋, highlights, the chosen bar |
| `accent-text` | `#5b3fe0` | violet as text (≥ 4.5:1 on white) |
| `success` (income) | `#15803d` | |
| `danger` (expense) | `#dc2f36` | checked ≥ 4.5:1 on `surface` in `tokens.test.ts`; darken if it fails |

**Color, dark:**

| token | value |
| --- | --- |
| `bg` | `#0b0b10` |
| `surface` | `#15151d` |
| `surface-2` | `#1c1c26` |
| `text` | `#f4f4f8` |
| `text-muted` | `#a0a0b2` |
| `border` / `track` | `#24242e` |
| `primary` / `primary-contrast` | `#f4f4f8` / `#0b0b10` |
| `accent` | `#9d85ff` |
| `success` | `#4ade80` |
| `danger` | `#ff6b6f` |

**The header** (`hero-*`, same in both themes; in dark it is told apart from the body by a
hairline):
- background:
  - a radial `rgba(124,92,255,.55)` at 10% 0%
  - a radial `rgba(37,99,235,.35)` at 100% 30%
  - over a linear `#14121f` → `#0b0b12`
- text `#ffffff`, muted `rgba(255,255,255,.66)`
- bottom corners 34px
- It holds the top line and the hero on Home, and the title and carousel on Cards. Items that sit
  half on it and half on the body overlap its edge by about 34px: the bill bubbles on Home, the
  Available pill on Cards.

**Glass:**
- **On the dark header** (pills, segmented control, round actions, the Saved/Spent keys): fill
  `rgba(255,255,255,.08)`, line `rgba(255,255,255,.12)`, `blur(24px) saturate(140%)`.
- **Light glass** (tab bar, sheets' grabber area):
  - light theme: fill `rgba(255,255,255,.86)`, inset line `rgba(10,10,20,.06)`,
    `blur(20px) saturate(160%)`, shadow `0 12px 30px -12px rgba(10,10,20,.35)`
  - dark theme: fill `rgba(28,28,38,.82)`, line `rgba(255,255,255,.08)`
- Tiles on the body are solid `surface`, not glass, so the glass stays special.

**Shape and space:**
- Radii: tile 24px, key 18px, card 24px, sheet top 28px, pills full. Header bottom corners 34px.
- Spacing on a 4/8 rhythm: page gutter 20px, section gap 22px, tile padding 14–16px.
- Tap targets are at least 44px.

**Type:** Inter Tight (bundled with `@fontsource-variable/inter-tight`, replacing Manrope), with
tabular figures everywhere:

| style | size / weight / tracking |
| --- | --- |
| hero amount | 46px / 800 / −0.045em (40px when the amount is long); the cents at 42% opacity, and the currency in small caps-height |
| page title | 28px / 800 / −0.03em |
| section title | 17px / 800 |
| body | 15px / 500 |
| small | 12.5–13px / 700 |

**Motion** (CSS where it's enough; the installed `motion` library for springs, layout moves and
the count-up):
- Ease `cubic-bezier(.2,.8,.2,1)`.
- Press: scale .96 over 140ms.
- Durations: small 220ms, standard 380ms.
- Entrance: rise 12px plus fade, staggered 60ms.
- Count-up: 900ms ease-out-quart.
- The ＋ turns 135° into an ×, and Expense/Income bubbles rise from it, staggered 50ms, over a 35%
  ink scrim.
- Freeze frosts the card (blur 7px, a dot texture and a snowflake "FROZEN" badge) in 380ms.
- Reduced motion turns all of it into 1ms changes and fades.

**Charts:**
- Series colors in fixed order: `#7c5cff` `#22c55e` `#f59e0b` `#3b82f6` `#ec4899` `#14b8a6`, with
  "Other" `#868b96`. They are validated in `tokens.test.ts` like today's.
- Holdings use their brand color (Phase 8).

**Card skins:**

| skin | look |
| --- | --- |
| `midnight` | radial `#3a3550` → `#121019` |
| `violet` | `#b9a7ff` → `#7c5cff` |
| `mint` | `#34d399` → `#0f766e` |
| `amber` | `#fbbf24` → `#ea580c` |
| `ocean` | `#60a5fa` → `#1d4ed8` |
| `rose` | `#f9a8d4` → `#db2777` |

Text on every skin is white and checked at ≥ 4.5:1 for the balance.

**Rules:**
- Glass only over color, never behind body text on the light page.
- Contrast is checked in tests for every token pair a screen uses.
- One icon family (lucide), with outline icons at 2px stroke.
- No emoji as icons.

## 12. Phases

The phases, their order, what each ships and its acceptance criteria are in
`docs/superpowers/plans/2026-10-21-funcial-redesign-roadmap.md`. Each phase gets its own detailed
plan before it is built, ships to the phone (raise `versionCode`), and the owner checks it before
the next.

## 13. Left to the builder

- Exact component breakdown and file layout.
- The animation curves within the chosen direction's motion tokens.
- Chart library choices: keep the hand-made SVG charts unless a chart can't be done well that way.
