# M7 Guidance and polish: decisions and deferred items

**What happened.**
- **Branch.** `feat/m7-guidance` is stacked on `feat/m6-buy-it` at 147a58c (M6 is code-complete; its deploy and phone check wait for you).
- **Plan and wireframe.** Plan: `docs/superpowers/plans/2026-10-17-funancial-m7-guidance.md`. Wireframe: `design/wireframes/m7-guidance.html`.
- **Built overnight.** Tasks 1–5 were built overnight because you said "keep building". They reuse styles you had already approved: the line fields, underline tabs, gradient banners and the Open look. Each task was reviewed and fixed until its review came back clean.
  1. A Help center that explains every number using the app's own worked examples.
  2. "?" tips on six numbers.
  3. An Inbox of reminders from the last 30 days.
  4. The money forms in the line style.
  5. Settings and onboarding in the line style, plus an accessibility pass.
- **Task 6, the guided tour, is not built.** It has a new look, so it waits for your OK on the last phone of the wireframe.
- **Final review.** A whole-branch review (Opus) found no Critical issues. It led to one fix wave and one follow-up for a regression that wave caused. The scoped re-reviews came back clean.

## Before you install: the order matters

- This branch raises the Android `versionCode` from 1 to 7. Android will now refuse to install any older Funancial build over it.
- **So install M6 first (its Task 10), then M7.** After M7 is on the phone, the M6 build can only go back on after an uninstall, which wipes the phone's data (a backup restores it).
- Without this, an older build could quietly drop newer settings and reset your preferences.
- The app also refuses to open data saved by a newer version: "This data was saved by a newer version of Funancial. Install the latest version to open it." It writes nothing when it refuses.
- On the first open after the update, the Inbox will show about a month of weekly and monthly reviews as New, once. "Mark all as read" clears them.

## Please read

- **Help wording.** I wrote the Help, FAQ, Privacy and Terms wording myself, from how the app works: your data stays on the phone and is encrypted, there is no account and no analytics, and the price service is sent a symbol, search text, a currency pair, a date or a link, never your amounts. Two reviews checked every claim against the code. You should still read it.
- **Add Expense categories.** Category is one tap again, as before. The plan wrongly assumed it was already a dropdown.

## The calls I made

- **Help.**
  - Every number on a page comes from the app's worked examples or its rules, never typed in. The buy meter's 34, 67 and 66 are now named constants that the meter itself uses.
  - Net worth and Investments got their own pages, so the "?" tips have somewhere to go.
  - The Investments page also notes that prices are delayed and headlines come from a third party.
- **"?" tips.**
  - The explanation opens in the app's bottom sheet, the one pop-up it already has, not the centred card in the wireframe.
  - Limits get one "?" on the section heading, not one per row.
  - Closing any dialog or sheet now returns focus to the button that opened it.
- **Inbox.**
  - Daily-log and backup nudges are left out, because they would flood it.
  - Renewals, card bills and dividends show only their latest missed reminder until the date moves on. Nothing older is made up.
  - The Inbox works with phone reminders off, but honours each reminder switch.
  - Your settings gained `inbox` read state (schema v9). It is tested from a v7 device, a v7 backup and a stored row.
- **Forms.**
  - "Paid with" is tabs when there are 4 or fewer choices, and a dropdown beyond that.
  - Tabs are at least 44px wide, and rows of four fit on a 360px phone.
- **Accessibility.**
  - Field errors are announced.
  - When the screen changes, focus lands on that screen's title.
  - New screens open at the top, and Back restores where you were.
  - Text colours are tested for contrast in light and dark. Light grey text, warning and danger are slightly darker, and the off switch is mid-grey.
  - Charts carry text labels.
- **Left as is.**
  - The 12-month dividend bars stay narrower than 44px (accepted in M5).
  - Chart colours 3–5 are below 3:1. Their numbers are also shown as text.

## Deferred minors

- **Focus.**
  - When the button that opened a dialog is gone (Subscriptions "…" › Edit, the Confirm-salary banner, a confirmed dividend row, "Mark all as read"), focus drops to the page.
  - Redirect screens leave focus on the page rather than the target's title.
- **Help.**
  - "The next payment due on each credit card" could say "each card you owe on".
  - Privacy's first sentence leaves out the stock profile lookup.
  - Terms says backups are yours "because only you have them".
  - The not-financial-advice note also shows on the Levels page.
  - Two Available-example rows have no step explaining them.
  - A help page's own back link goes to the Help index; the Back gesture returns to where you were.
- **Inbox.**
  - Entries backdated after the fact (a freeze, a purchase) show occasions that never fired.
  - A dividend row can come back as New if the announced pay lag changes.
  - The read-state race comment names the wrong race; it isn't reachable in practice.
- **Layout.**
  - At 320px the Profit & loss title wraps with its "?".
  - A 46-character card name with no spaces makes a dialog scroll sideways.
  - The Category legend is a little brighter than the line labels beside it.
- **Web only.** A typed URL in a web tab you already used restores an old scroll position. This doesn't happen on the phone.
- **Tests.**
  - A few checks rely on demo money's wide balance.
  - One dashboard filter is looser than it needs to be.
  - The date field's calendar button is exempt from the focus-ring check.
- **Storage (pre-existing).** A load that overlaps an erase could, in theory, close the wrong session; the window is a single read.
