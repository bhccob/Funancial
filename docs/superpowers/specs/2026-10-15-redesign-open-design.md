# Redesign "Open": design note

**Chosen by the owner on 2026-10-15** from three clickable mockups:
- `design/redesign/2-open.html` (**the chosen one**)
- `design/redesign/index.html` (#1 Soft cards)
- `design/redesign/3-vivid.html` (#3 Vivid)

It replaces the Home, Budget and navigation parts of `docs/design/visual-direction.md` ("D · Pro Ledger"), and the "game HUD strip" call from M4.

## Why

The owner used the app on the phone after M4 and reported:
- The layout feels compact, and it's hard to know where to look.
- Their eyes only went to the big numbers on Home.
- The small buttons were hard to find, and it wasn't clear what they did.
- The "More" button opened an old-looking box of bordered buttons.

They asked for:
- visualizers for the money;
- a more interactive app;
- a modern, minimal look;
- pictures instead of plain text and numbers.

They chose the "Open" direction, the one with the least box styling.

## Principles

1. **No boxes.** Each idea is a section with a large title (21px/800). Sections are separated by space and one hairline. Numbers and charts sit directly on the page. Dialogs and the menu sheet are the only surfaces.
2. **One thing leads.** At the top of Home are "Available to spend" in very large type and one thin line for the month. Everything after it is a titled section.
3. **Every key number gets a picture:**
   - the month line;
   - a category donut;
   - 7-day bars;
   - limit rings;
   - a net-worth trend line;
   - date blocks for bills;
   - progress lines for goals;
   - a level ring.

   Every chart has a legend or labels, shows exact amounts when tapped, and has a text equivalent for screen readers.
4. **Buttons you can find.** Actions are round 56px buttons with a word under each icon. No control is icon-only. Touch targets are at least 48px. The bottom bar has labels.
5. **Calm and minimal.**
   - Manrope throughout, big tabular numbers.
   - Lucide icons.
   - The existing colour tokens.
   - The game layer stays small and violet.
   - Light and dark.
   - Motion only under `prefers-reduced-motion: no-preference`.

## Navigation

- **Phone.** A flat bottom bar across the bottom edge, with a hairline on top: **Home · Budget · + · Quests · Menu**.
  - The + is a 48px round ink button that opens Add Expense.
  - The floating quick-add button goes away.
- **Menu.** A tall sheet that slides up from the bottom, with a grab handle and rounded top corners. It is a plain list in three groups. Each row has a coloured round icon, the name, a line saying what's inside right now, and an arrow:
  - **Your money:** Subscriptions, Goals, History, Salary freeze.
  - **Coming next:** Invest, Buy it?, Dividends, News, each marked "Soon".
  - **You:** Shop, Inbox ("Soon"), Help ("Soon"), Settings.
  - The Android back gesture and Escape close it.
- **Desktop.** The sidebar stays, restyled to the same groups. It has an "Add expense" button at the top.
- **Owner's mockup, kept as the controller's call:** Invest and Buy it? leave the bottom bar until they exist. M5 decides where Invest goes.

## Home (phone order; on desktop the sections pair up in two columns)

1. **Top line.** "Hi, {name} · {Mon D}" on the left. On the right: the streak (flame), the coins, and a 40px level ring showing XP progress with the level number. The right side links to Quests.
2. **Available to spend.** A very large number (50px, dropping to 40px for long amounts). Under it, the month line:
   - three segments: spent this month, bills still to come, and what's left in the overall monthly limit;
   - two keys underneath: what's spent, and what's left;
   - tapping a segment names it.
3. **Four round actions:** Expense (filled), Income, Goals, History. Buy it? replaces History when M6 ships.
4. **Spending.** Week | Month tabs (Month by default), a 150px donut of the top 5 categories plus "Other", and a legend list. Tapping a slice or a row shows that category's amount and share in the centre.
5. **Last 7 days.** Slim bars for the 7 days ending today, with today in ink and labelled "Today". Tapping a day shows what was spent.
6. **Limits.** Up to 3 rings, highest use first. Each shows the % used inside, the name and "$X left" or "$X over", coloured by limit state: under 80% accent, 80–99% warning, 100% or more danger.
7. **Coming up.** Bills with a date block (month and day), the name, its kind and when, and the amount. The header shows the month's bill total.
8. **Net worth.** The number, the change this month (▲/▼), a 30-day trend line, and a Cash / Savings / Debts legend.
9. **Goals.** Up to 2 rows with progress lines.
10. **Quests.** Up to 3 quest rows.

The salary, freeze and reminder banners stay above item 2.

## Budget

- The title "Budget", with a month switcher (‹ October ›). You can't go past the current month.
- A 240px donut for the selected month's categories (top 5 plus Other), with the total in the centre and a legend list. Tapping a slice or a row shows that category.
- **Limits** (always the current period). Each limit has:
  - a bar with a **pace mark**: a thin line showing how far through the period today is;
  - "Weekly/Monthly · $spent of $limit · ahead of pace / on pace / under pace";
  - its Edit button.

  An "Add a limit" link closes the section.

## Everything else

Every other screen keeps its content and adopts the Open styling:
- page titles at 34px;
- section titles at 21px with more space between sections;
- buttons at least 48px tall;
- the new navigation.

`docs/design/visual-direction.md` is rewritten for "E · Open".

## Out of scope

- New features.
- Changes to finance or game rules.
- Investments, Buy it? and Help content. These are M5–M7.
