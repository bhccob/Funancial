# Funcial — every screen matches (project 1 of 5) — design

Date: 2026-10-23. The owner looked at 0.12 on the phone and asked for these changes; this
document records them as agreed in chat. It ships as **0.13** (versionCode 13).

Mockups the owner picked (in `design/redesign-v4/`):

| file | what the owner chose |
| --- | --- |
| `home-shop-quests.html` | **C**: one slim strip under Coming up |
| `invest-pie-labels.html` | **A**: logo badge plus percent, and *no box behind the pie* |
| `inner-screens.html` | **B**: a plain title on the light page with a glass back button |
| `cards-and-paid.html` | all three phones: a bigger balance, bigger cards, and "which card paid". The middle phone's card picture and balance line were later dropped (see Goal 3) |

The look itself is 0.12's glass themes (`design/redesign-v3/glass-themes.html`,
`src/styles/themes.css`), so this is styling and small additions, not a new look.

## Why

After 0.11 and 0.12 rebuilt Home, Cards, Profile and the Shop, the other screens still look like
the old app. The owner's words: "the design/ui inside settings, quest and bills&cards,
expense/income, etc.. area isnt changed yet so sync it so the styling ui make sense".

On the same pass they asked for:
- a premium feel: a bigger balance on Home, and bigger cards on the Cards tab
- a clear answer to "which card is paid and deducted"
- Shop and Quests within reach from Home
- the Invest pie labelled like their screenshot (a Blossom-style donut)

**Success:** the owner opens any screen and it looks like the same app as Home. After paying,
they can tell at a glance which card paid and what is left on it.

## Goals

1. **Every screen not yet redone follows the 0.12 rules:**
   - the screens:
     - Settings, all its sections, and any sub-pages it opens
     - Quests (and its sections: streaks, badges, challenges, XP history, how to earn)
     - Bills & cards (`/subscriptions`), Goals, Loans (`/debts`), Income, History
     - Inbox, Help with its pages and glossary/FAQ, and the full-page Add screen (`/add`)
   - the top:
     - a plain page title (`text-page`) on the light page, with a round glass back button
       where the screen was opened from somewhere else (inner-screens option B)
     - the theme block stays on Home, Cards, Profile and the Shop only
   - lists are plain rows with `rgba(0,0,0,.07)` hairlines, and glass only on buttons, pills
     and the round icon chips. No boxed sections.
   - the Expense and Income forms (the sheets from Home's tiles and the `/add` page):
     - a big amount
     - categories as glass pills, with the chosen one solid (primary)
     - the account, date, note and repeat as plain rows
     - one solid Save button at the bottom (as in `inner-screens.html`, "Add expense")
   - the edit and confirm dialogs and sheets those screens open take the same rules
2. **Home:**
   - The hero balance is bigger: 52px, up from 42px. The dimmed "Afl." and cents and the
     contrast rules from 0.12 still apply.
   - One slim glass strip sits under the Coming up bubbles (option C):
     - left: today's quest progress ("Quests 2/3" with a small bar), opening `/quests`
     - right: the coin balance and "Shop", opening `/shop`
   - Every row in Recent names its card: a tiny card mark in that card's colour, then its
     name and `·· last4` (or just the name when there is no last 4). The newest row also
     shows what is left on that card ("Afl. 2,605 left").
   - Recent already includes stock buys ("Bought KO", the money leaving a card) and sales,
     because it lists what History lists. The owner asked on 2026-10-23.
   - **Recent rows can be edited, as in History.**
     - Tapping an expense opens the same edit form History uses.
     - Every other row offers History's delete, with the same confirm.
     - Editing income, transfers or stock entries doesn't exist anywhere yet, and stays out of
       this project.
3. **"Which card paid":**
   - **After Pay** (from Home or Cards), the Pay sheet ends on a short done step:
     - a check, "Paid Afl. 12.50", and the shop and category
     - one line naming the card it was paid with: "Paid with Main account ·· 4312"
     - "Done"

     There is no card picture and no old-to-new balance line. The owner changed this from
     the `cards-and-paid.html` mockup on 2026-10-23.
   - **On the Cards tab:**
     - the card just paid with shows "−Afl. 12.50 just now" on it for a few seconds
     - an "On this card" list under the carousel shows the selected card's latest entries,
       with "View all" opening History
4. **The Cards tab cards** are bigger: 300×186px, up from 270×166, with a bigger balance on the
   card. Their look is otherwise unchanged.
5. **The Invest pie** (Holdings):
   - **No glass tile behind it:** the pie stands on the page.
   - **Labels:** a small label sits just outside each slice, with no leader lines. It is a
     round badge with the company logo (or, with no logo yet, the ticker on the slice's
     colour), then the percent (option A).
   - **Crowding:** labels that would overlap are nudged apart, so none is dropped.
   - **Interaction:** tapping a slice still shows its amount.

## Non-goals

- The welcome, log-in, lock and setup screens. They change in project 2 (sign-up).
- Evolving badges (project 3), automatic logging (project 4) and the currency switcher
  (project 5).
- New data or new money rules. Nothing in the schema or the calculations changes.
- The Cards scene's sections, Profile and the Shop. They already match 0.12; only the card size
  changes there.
- The download page.

## Anti-goals

- A screen that looks boxed or "old" next to Home after this ships.
- Text that fails contrast. The 0.12 rules hold: text ≥ 4.5:1 on its surface, large text and
  UI marks ≥ 3:1, in all twelve themes and in dark mode.
- Losing a feature or a test of a feature while restyling. This is a restyle: behaviour stays.
- Motion that slows down logging an expense.

## Constraints

- Build on the 0.12 utilities: `glass`, `glass-strong`, `glass-head`, `btn-head`, `btn-accent`,
  `text-page`, `text-section`, `PlainSection`/`ROWS`, `GlassTile`, `HeadBlock`, `SegmentedControl`,
  `Sheet`, `Dialog`. Use the theme tokens, never raw colours, so all twelve themes and dark mode
  follow.
- Tap targets ≥ 44px. Icons lucide only. Reduced motion gives fades only (the balance count-down
  jumps, and "just now" appears without sliding).
- Money is integer minor units. "What is left on that card" is the card's balance after that
  entry. Use the existing balance functions; don't compute it a new way.
- The tests that cover behaviour must keep asserting the behaviour. Only class or markup pins
  that the restyle changes may change.
- Version 0.13 / versionCode 13. Branch `feat/screens-match`, from `main` at `8931a1b`.
- Never push, PR, merge or deploy without asking the owner.

## Decided by the owner (in chat, 2026-10-23)

- the order of the five projects, with this one first
- Home's Shop/Quests placement: strip C
- the Invest labels: style A, and no box behind the pie
- inner screens: top B
- a bigger Home balance and bigger cards
- the "which card paid" design: Recent card marks; the done step after Pay with a one-line
  "Paid with <card>" (no card picture, no balance line); and "just now" plus "On this card" on
  Cards

## The owner's go-ahead

On 2026-10-23 the owner left the build to me ("you can continue everything by urself"). The one
question still open was whether to pick a colour for each card. I took name + last 4 for now:
cards keep their colour by kind, and choosing a colour per card waits for Phase 4's card
settings.

## My calls, not yet challenged

- **Restyle, not restructure.**
  - Every screen keeps its structure, its controls and its behaviour. Only the look changes.
  - Settings stays one page of sections, restyled as plain rows; one page per category is
    Phase 10's job.
  - The forms keep their fields (`AccountField`, `DateField`, the repeat `Select`) and their
    Cancel and Delete buttons, restyled.
  - The mockups set the look, not the layout. "Save" keeps the forms' current words.
- **Dialog and sheet shells:** `Sheet` and `Dialog` themselves get the frosted surface (white
  .9 with a white top line, blur), so every sheet in the app matches. Their contents follow the
  screen rules.
- **Restyled elsewhere:** the welcome, log-in and setup screens are restyled in project 2, not
  here.
- **"Quests 2/3" on Home:** quests done out of all the quests open right now (daily, weekly and
  monthly together), the same set the Quests screen lists. The bar is that fraction. With none
  open, the left half reads "Quests" with no bar; with all done, it reads "All done".
- **The card mark:**
  - Its colour is the card's stored `skin`. A small skin → colour table follows spec §11's six
    skins (midnight, violet, mint, amber, ocean, rose). Each colour is checked at 3:1 as a UI
    mark in every theme and mode, and darkened if it fails.
  - The name always carries the meaning; the colour only helps.
  - It shows the account the entry moved money on: an expense's or income's account, a
    transfer's or card payment's "from" account. An entry with no account (a reinvested
    dividend) shows no mark.
  - The mark and name replace the account's name in the sub-line, in History as well as
    Recent, through the shared `entryLine`, so one entry still reads one way everywhere.
- **"What is left on that card":**
  - It shows on the newest Recent row only, and only when that row moved money (not an
    expected or skipped income).
  - The figure is the card's `heroFigure` amount: "Afl. X left" for a balance or available
    credit, and "Afl. X owed" for a credit card with no limit.
- **"Just now" on a card:**
  - A small shared store remembers the last spend saved on a card (Pay or the Add form): which
    card, how much and when.
  - The Cards tab shows "−Afl. X just now" on that card for 4 seconds, starting when the card is
    first on screen, and only if the spend is under 30 seconds old.
  - Reduced motion: it appears and fades without sliding.
- **"On this card":** it shows the latest 5 entries.
- **The pie:**
  - **Slice colours:** a slice takes its company's colour, sampled from the logo once it
    loads. The sampled colour is used only if it holds 3:1 against the page in the current
    theme and mode, and stands apart from its neighbours; otherwise the slice keeps its chart
    colour. One pie may mix the two.
  - **The badge:** the no-logo badge shows the ticker (up to 4 letters) at 9px or more, in
    white or ink, whichever holds 4.5:1 on the slice colour.
  - **No box:** the whole Holdings tile goes. The Allocation control, the pie and its legend sit
    on the page.
  - **The middle** keeps showing the portfolio value.
- **Long balances:** the 52px Home balance shrinks to fit for long amounts, down to 40px, then
  wraps the cents under the whole number at most.

## Left to the builder

- the exact component breakdown, and whether the done step is a new sheet state or a step in
  `PaySheet`
- how logo colours are read (for example, sampling the loaded logo image on a canvas) and
  cached
- how labels are nudged apart, building on `layoutLabels`
- the order the inner screens are restyled in, and how the work is split into tasks
