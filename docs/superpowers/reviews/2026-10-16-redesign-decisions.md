# Open redesign: decisions and deferred items

**What happened.**
- Branch `feat/redesign`, commits 937a819..409dec1.
- The owner chose mockup #2, "Open", on 2026-10-15.
- A fresh reviewer (Opus) reviewed the whole branch and said ready to merge with fixes. Its 2 Important findings, plus 2 re-graded ones, were fixed with tests, and the scoped re-review was clean.
- The owner checked it on the Nothing Phone (3a): "I like the design much more". They asked for the middle + to go, which is done in 409dec1.

## Rulings

1. **Chart colours.** Slices use fixed-order slots, chart-1..5 by position, with Other always grey. Fixed per-category colours lose here.
   - Why: the dataviz validator passes the palette only in its fixed adjacent order. Seven fixed category colours fail the colour-blind and normal-vision separation checks.
   - Identity is carried by the legend text and the tap labels.
   - Cost if wrong: a category's colour can differ between Week and Month, or between months.
2. **Month-line labels.** They include the amount, so screen readers announce it.
   - Cost if wrong: none.
3. **The + in the bar.** It gained a visible "Add" label, which made the bar 76px. Superseded on 2026-10-16: the owner asked for the + to be removed.
4. **"Declined to judge" items from the final review stand as built:**
   - Budget shows the top 5 categories plus Other.
   - Home drops the Today and This year totals, the explainer and the card note.
   - The light-mode contrast of chart colours stays (every value is also in text and labels).
   - A card purchase counts as spent, and its payment as a bill.
   - Previous month has no lower limit.
   - No bar item is highlighted on Menu pages.
   - Phones in landscape get the sidebar.
   - Passive income isn't in the net-worth legend.
   - Completed goals show first.
   - Budget limits always show the current period.

   Cost if wrong: small presentational differences.
5. **The Home greeting.** The date is hidden below 400px wide, and the greeting truncates only for genuinely long names. A half-shown date is worse than none.
   - Cost if wrong: no date on very narrow phones.

## Fixed after the final review

- The visual-direction doc now states the colour rule the code applies.
- Focus returning to Menu is pinned in e2e.
- The greeting keeps a normal name whole, and coins are formatted like XP.
- Tapping the month line shows the exact amount.
- Small month-line segments have a minimum width.
- An empty week reads "Nothing spent this week".
- The Menu button has `aria-expanded`.
- The pace mark no longer takes taps meant for Edit.
- The dead `AppRoute` label and icon fields are removed.

## Deferred minors

- **Domain and charts**
  - `paceStatus` band edges are untested.
  - A locale-dependent `whole` test.
  - A debt is counted before its opening date in the net-worth trend.
  - Donut arcs are thin; the legend is the touch path.
  - The hidden list duplicates tab stops and has no name.
  - Focus-arc and single-slice cases are untested.
  - Sparkline has no NaN guard.
  - Donut uses parallel arrays.
- **Navigation**
  - About 36px above the first Menu group.
  - The sheet stays open if the window widens past md.
  - Bar slot heights in rem.
- **Home**
  - Rings follow `warnAt` levels.
  - The goal progress bar is hand-rolled.
  - Salary-banner code is left in `DashboardScreen`.
  - The "Coming up" link reads $0.00 when empty.
  - "0-day streak".
  - Month-line aria-labels use whole units.
  - The date is hidden below 400px.
- **Budget**
  - The hint is 12.5px.
  - Overlapping tests.
  - The selected slice isn't reset when data changes.
- **Docs and code**
  - The limit-state colour map exists three times.
  - The "overall monthly limit" lookup is repeated.
  - The plan file still states "colour follows the category" (historic).
