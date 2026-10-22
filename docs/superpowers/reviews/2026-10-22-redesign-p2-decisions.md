# Redesign Phase 2 (design system and shell) — decisions

Branch `feat/redesign-p2-shell`, from local `main` (`4423a0b`, then `3dd4d7e`). Two builds:

- **0.11** (versionCode 11): direction A "Midnight Glass", built from
  `docs/superpowers/plans/2026-10-22-funcial-redesign-p2-shell.md`. It ended at `77e0e88`.
- **0.12** (versionCode 12): the glass themes the owner approved after seeing 0.11, built from
  `docs/superpowers/plans/2026-10-22-funcial-redesign-p2b-glass-themes.md`. The source of truth
  is `design/redesign-v3/glass-themes.html`. It ended at `714dcf6`.

Both were built task by task, with a fresh implementer and a fresh reviewer for each task, then a
whole-branch review and one fix wave. Each fix wave passed a scoped re-review with nothing left
open.

At `714dcf6`:
- typecheck 0, lint clean
- 174 test files / 4188 tests pass
- e2e 337 passed / 179 skipped (the specs' own per-project guards) / 0 failed

## What changed

**0.11, which the owner checked and replaced:**
- direction A tokens, Inter Tight, the motion primitives, the dark glass header, and a Profile
  page reached from Home's avatar
- a floating pill tab bar with a ＋ fan
- Help copy in accounts terms (R28)
- an axe contrast spec over every screen

**0.12, which ships:**
- **Twelve Shop themes** (`src/styles/themes.css`), keyed on `data-game-theme`:
  - Black & White is free and the default.
  - Sunny Sky, Lemon Mint, Pastel and Daisy Sage cost 400.
  - Peach Sorbet, Powder Blue and Seafoam cost 450.
  - Midnight Navy, Forest Night, Plum Night and Espresso cost 600.
  - A theme repaints the block, its glow, the main buttons, the chart highlight, the level ring
    and the current tab.
  - Dark mode keeps working: the page and the page glass turn dark, and the block keeps its
    theme.
- **Level borders:** Bronze 5, Silver 11, Gold 21, Platinum 31, Diamond 41 and Prism 50 (a glass
  rainbow ring).
  - Frames leave the Shop.
  - A frame bought with coins stays wearable.
  - The level-up dialog names every border a gain passes.
  - Profile has a border picker in which locked borders show "Level N".
- **The tab bar** runs edge to edge: Home · Cards · Spending · Invest · Profile. The current
  tab is in the theme's accent. There is no ＋ and no pill.
- **Home (revised wireframe):**
  - The hero shows the card picked on the Cards tab: "Available balance", "Available credit"
    (limit − owed) or "Owed".
  - The account chip opens "Show on Home".
  - Pay records the purchase only, and a frozen card says so. ⋯ offers Move money and Correct a
    balance.
  - Below the block: the Coming up bubbles, Overview tiles that open the add forms, a Net worth
    tile, and Recent.
- **The Cards tab:**
  - a carousel with tap-to-select and dots, sharing its selection with Home
  - Pay through `PaymentService`, Freeze, View card, and Settings (add, edit or delete any
    account kind)
  - the Available to spend pill
  - a Day/Month/Year chart, Categories, Bills and Loans
- **Profile** follows the wireframe: stats, badges, "Your money" (History, Net worth, My numbers
  "Soon") and "You" (Quests, Shop, Inbox, Help, Settings).
- **The Shop** has a Themes page with previews, prices and Buy/Use/On.
- **Spending and Invest** are restyled in glass, and Goals moved to Spending.
- **Contrast:**
  - Unit tests check every theme in both modes.
  - axe scans run in Black & White, Sunny Sky and Midnight Navy, each in light and dark.

## Rulings

Each ruling gives the call, why, and what it costs if wrong.

### 0.11

1. **Chart colours:** the spec's six hues, re-ordered to violet, green, blue, pink, amber, teal
   with darker dark-mode steps, because the spec's order failed the colour-blind check. *If
   wrong:* a reorder.
2. **Success, danger and warning** were darkened to hold 4.5:1 on `surface-2`, as the spec
   allows. *If wrong:* none.
3. **Card skins** wait for Phase 4, because white text on their light ends was under 4.5:1.
   *If wrong:* P4 picks it up.
4. **The download page** follows the app's tokens and font, because it imports `tokens.css`.
   Nothing was deployed. *If wrong:* its look shifts at the next deploy, which only happens with
   the owner's OK.
5. **Pre-flight rulings:** e2e runs first check that ports 4173 and 4174 are free; each task
   keeps the e2e it can break green; the chart test ports the palette validator. *If wrong:*
   none.
6. **Key presses only when tappable,** and Avatar and MenuGroups got small additions for
   contrast and the entrance animation. *If wrong:* none.
7. **`useModalDialog` stops Escape and cancel at the dialog that handles them,** which fixed a
   real double-close. *If wrong:* none.
8. **Final-review fixes:** the tab pill glide, a status-bar-only style, the late observer
   claim, the Available copy, the Budget title and the XP fill. *If wrong:* none.

### 0.12

9. **The selected card** lives in a device-level store, as the hide-amounts eye does, not in the
   account copy. *If wrong:* the card is re-picked on a new phone.
10. **Old themes map at read time:** Violet → Black & White, Ocean → Powder Blue, Orchid →
    Pastel, Graphite → Midnight Navy. Coins stay spent. *If wrong:* a different mapping, a small
    change.
11. **Borders reuse the `frame-*` ids,** and a bought frame stays wearable at any level. *If
    wrong:* none.
12. **Contrast over the wireframe:**
    - the focus ring takes the block's ink inside the block
    - text tokens were darkened to hold 4.5:1 on the page's soft shapes
    - the button shine ends at 35%
    - the cards in dark themes get a veil
    - Home's hero label is at 84% and its cents at 59% (the cents are large text, so 3:1 applies)

    *If wrong:* a slightly different look from the wireframe; the owner should glance at it.
13. **Pay works on savings,** and a frozen card can't be picked for an expense, an edit or a
    subscription (renewals still run). Pay warns about limits as the expense form does. *If
    wrong:* none.
14. **Pages that moved:**
    - Income stats are reached from a link in History's header.
    - Goals are on Spending.
    - Bills and Loans are on the Cards tab.
    - Net worth opens the existing sheet rather than "Soon".
    - Home's "?" tips are gone, and the help pages are still in the Help index.

    *If wrong:* a link or a tap away.
15. **The Profile tab stays lit** on its sub-pages. Goals on Spending show at most 3. *If
    wrong:* none.
16. **Final-review fixes:**
    - the Cards chart bars hold 3:1
    - one shared History line, so an expected salary never shows 0.00
    - the eye shows even with no account
    - the level-up dialog lists every border passed
    - the Lv label, the worn border, the Shop tab contrast and the moved note
    - Android back closes the ⋯ menu
    - "Get freezes" opens the Freezes tab
    - shared row styles; unused primitives removed

    *If wrong:* none.

## Deferred (can wait)

**Copy and polish:**
- "Not enough coins." repeats on every card.
- Recent's detail line can cut off the day at 360px with a long account name.
- "You owe" can read negative with an overpaid card.

**Hygiene:**
- Stale comments in `menu.ts`, `tokens.css` and `Banner.tsx`.
- `--color-hero-muted` and the `bg-hero` aliases are unused.
- `levelOf(ledger)` is written out four times.
- `HeadBlock` imports from `features`.

**Demo mode:** swiping cards in the demo overwrites the device's selected card.

**Layout:**
- The md/landscape layout (HeadBlock margins, the sidebar's Net worth sheet across the
  breakpoint).
- Screens not rebuilt yet (History, Subscriptions, Debts, Goals, Income, Quests, Inbox, Help,
  Settings) keep their 0.11 styling on the new page.

**Tests:** some failure paths (a buy that succeeds with an equip that fails, an equip that is
rejected) and a tripwire on axe's "incomplete" set.

## Phone check (owner)

- **0.11:** installed and checked. The owner's verdict was that it "doesn't look like the
  source", and they asked for:
  - Profile at the bottom right
  - no ＋
  - fine with boxes
  - wireframes first
  - a shorter Profile menu

  That led to 0.12.
- **0.12:** **pending.** Items to look at:
  - card legibility in each theme
  - the Themes page scrolling smoothly (about 24 glass layers)
  - the ⋯ menu and Android back
  - the status-bar icons over light and dark blocks
  - Remove animations: fades only

The owner chose to merge locally into `main` (2026-10-22), as with Phase 1. Nothing is pushed.
