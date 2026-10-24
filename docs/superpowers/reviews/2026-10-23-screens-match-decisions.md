# Funcial 0.13 (every screen matches) — decisions

Branch `feat/screens-match`, from local `main` at `8931a1b`. Spec:
`docs/superpowers/specs/2026-10-23-funcial-screens-match-design.md`. Plan:
`docs/superpowers/plans/2026-10-23-funcial-screens-match.md`.

It was built overnight while the owner slept ("you can continue everything by urself"). There
were nine tasks, each with a fresh implementer and a fresh reviewer, then a whole-branch review
and one fix wave. The owner checked it on the phone and asked to merge it into local `main`. Nothing is pushed or deployed.

At `b67fc97`:
- typecheck 0, lint clean
- 181 test files / 5209 tests pass
- e2e 388 passed / 218 skipped (the specs' own per-project guards) / 0 failed

## What changed

- **Every inner screen in the 0.12 glass look:**
  - Settings, Inbox, Help and its pages, Quests, Goals, Loans, Bills & cards, Income, History
    and `/add`, plus every form, dialog and sheet they open
  - each has a plain title with a round glass Back button, and plain rows with hairlines
  - Settings is still one page
- **The Expense and Income forms (and Pay):** a big amount, category pills with icons, then
  plain rows (Paid with, Date, Note, Repeats) and a solid Save.
- **Home:**
  - The balance is 52px, stepping down to 40px for long amounts.
  - One slim strip under Coming up: "Quests 2/3" with a bar, and your coins and "Shop".
  - Every Recent row names its card: a small mark in the card's colour, then "Main account ··
    4312".
  - The newest row also says what's left on that card ("Afl. 2,605 left").
  - Recent rows open like History's: an expense opens the edit form, and anything else offers
    History's delete with the same confirm. Stock buys are in Recent.
- **Which card paid:**
  - After Pay, a done step shows "Paid Afl. 12.50", the shop and category, and "Paid with
    Main account ·· 4312".
  - On the Cards tab, the card you just paid with shows "−Afl. 12.50 just now" for 4 seconds.
  - An "On this card" list shows its latest 5 entries.
- **Cards** are 300×186 (from 270×166), with a 26px balance.
- **The Invest pie:**
  - There is no tile behind it.
  - Each slice has a small floating label: the logo (or the ticker) plus its percent, nudged
    apart so none is dropped.
  - Slices take the company's colour when it is readable and stands apart from its
    neighbours.
  - The pie is 200px so the labels fit on a 360px phone.
- **Readability:**
  - The tab bar is a little more solid (92%, from 78%), so its labels stay readable over any
    button scrolling under it.
  - Empty progress bars are now visible.
  - Income's bars no longer fade when you pick a month; the picked month gets an outline.
  - Profile's "Lv" badge holds 4.5:1 in every theme.
- **Version** 0.13 (versionCode 13).

## Calls I made overnight (the owner can overrule any)

| # | Call | Why | Cost if wrong |
| --- | --- | --- | --- |
| R3 | The frost sits on a box inside each sheet and dialog, not on the dialog itself | Otherwise a "save failed" message would show inside the sheet instead of at the bottom of the screen | None found |
| R7 | The tab bar is 92% solid, up from 78% | At 78% its labels failed contrast over the solid Save button in some themes | The bar looks a little less see-through than in 0.12 |
| R9, R4 | The welcome, log-in, lock and setup screens, and the Create-account and Erase dialogs, keep their old fields | They are redone in project 2 (sign-up) | Until then they look a little older than the rest |
| R10, R12 | A screen opened with nothing to go back to sends Back to its parent (Help page → Help list, Quests → Profile, History → Profile, Income → History) | That is where those screens live | None |
| R13, R24 | The progress-bar track is now visible: ink at 20% (17% in dark) | Before, an empty bar was invisible | At the brightest spot of a background shape, a bar's fill is 2.9:1 against its track, not 3:1 |
| R16 | No change to the chart colours | Changing them touches every theme's charts. Every chart lists its amounts | Green, amber and teal pie slices are faint in light mode |
| R17 | Income's bars no longer fade when you pick a month; the picked month gets an outline | The faded bars fell to 1.6–2.2:1 | None |
| R19 | The Home strip counts the weekly spending-limits quest | It mirrors the Quests screen | With a limit set, the strip rarely says "All done" |
| R21 | "Just now" shows only if the spend is under 30 s old when its card comes on screen, and time on Pay's done step counts | The spec's rule, taken literally | Someone who stays more than 30 s on Done won't see the badge |
| R26 | The "left" figure is whole ("Afl. 2,605 left") | It matches the spec's example and gives the card name room on narrow phones | No cents in that one figure |
| R27 | The Invest pie is 200px, down from 220 | It is the only size where every label fits beside its slice on a 360px phone | A slightly smaller pie |
| R8 | The amount field shows "0.00" when empty, and Income's fields follow Expense's order | Consistent with Expense | None |

## Left for later

- light-mode chart colours (green, amber, teal) stay under 3:1 in donuts; legends carry the
  amounts (R16)
- the welcome, log-in, lock and setup screens, the Create-account and Erase dialogs: project 2
- polish noted by the final review and left: one shared constant for pills and round glass
  buttons; an "Optional" hint on empty Note/Name rows (new copy); the mixed rows in
  Profile & salary
- 0.13 is installed on the owner's phone (versionCode 13); the owner looked at it and said "perfect"

## Projects 2–5

Draft mockups in `design/next/` (p2-signup, p3-badges, p4-auto-logging, p5-currency), each
with a recommendation. Nothing is built from them yet. What they need from the owner:
- sign-up's email code needs a server change and a deploy
- automatic logging needs a screenshot of the bank's (or Google Wallet's) payment notification,
  a bank text if any, and a statement file
- the currency switch needs no deploy
