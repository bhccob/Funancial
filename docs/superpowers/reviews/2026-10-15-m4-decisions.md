# M4 game layer: decisions and deferred items

This records every call made during M4 that the plan or the spec didn't settle, in the order it was made, with what each costs if wrong. After that come the final review's outcome, the check on the phone, and the minor findings left for later milestones. The game design decisions themselves are in the plan's "Calls this plan makes" section: `docs/superpowers/plans/2026-10-15-funancial-m4-game.md`.

- **Branch:** `feat/m4-game`, commits 99af8d6..9e7bdcf.
- **Final review:** a fresh reviewer (Opus) said it was ready to merge with fixes. All four Important findings were fixed with tests, and the scoped re-review was clean.
- **Phone:** checked on the Nothing Phone (3a).

## Rulings

1. **Pre-flight.**
   - **Decision:** `equip(itemId)` accepts only themes, avatars and frames. Any other item, such as a streak freeze, throws "Only themes, avatars and frames can be used."
   - **Why:** `Cosmetics` has no freeze slot.
   - **Cost if wrong:** one message.
2. **Task 6.**
   - **Decision:** a Subscription Audit finished after its 7-day window doesn't win. Every active subscription needs an `auditedAt` at or after the challenge started, and on or before its last day.
   - **Why:** the challenge is "Review every subscription within 7 days".
   - **Cost if wrong:** a late audit earns nothing.
3. **Task 8.**
   - **Decision:** the double-tap buy race is closed in the UI. The buy dialog's button is disabled while the purchase is pending, and the dialog closes on success.
   - **Cost if wrong:** a second buy fired from elsewhere before the first lands could spend coins twice.
4. **Task 8.**
   - **Decision:** entering the demo could celebrate the seeded demo history.
   - Superseded by ruling 8.
5. **Task 8.**
   - **Decision:** starting a challenge has the same double-tap race, so the Start button is disabled while the start is pending.
   - **Cost if wrong:** two active challenges of one kind.
6. **Task 9.**
   - **Decision:** the HUD keeps "Start a streak today" as its short label. The Quests screen's streak rows say "Start a new streak today."
   - **Why:** both are no-shame wordings.
   - **Cost if wrong:** two wordings.
7. **Task 9.**
   - **Decision:** `upcomingBills(data, today, until = endOfMonth(today))` gains an optional `until`. The default leaves the available balance unchanged. The weekly check-in asks for today through today + 6.
   - **Why:** it used to miss next month's renewals in the last week of a month.
   - **Cost if wrong:** a one-day boundary shift.
8. **Task 10.**
   - **Decision:** entering the demo celebrates nothing. Its seeded history is paid into the ledger but not announced.
   - **Why:** a level-up dialog over the demo's first screen blocked the page and wasn't earned. A real profile's first open on existing history still celebrates.
   - **Cost if wrong:** the demo shows no level-up until you earn one there.
9. **Task 11.**
   - **Decision:** "How to earn" lists all six quests, whether or not they apply yet. It uses an exported `QUEST_TITLES` map.
   - **Cost if wrong:** none.
10. **Task 11.**
    - **Decision:** a running challenge is listed under Active only, not again under Available as "already running".
    - **Cost if wrong:** that message never shows in the UI. The store still refuses a second start.
11. **Final review.**
    - **Decision:** keep monthly limits counted from the start of the month to date, as the Budget screen does, and make the words true. Specifically:
      - the weekly quest says "Over a limit this week. Limits reset with their week or month.", where it used to say "Next week is a fresh start.";
      - "No overspending" at 0 while over today says "Over a limit right now. The streak starts again when it resets.";
      - a lost 30-Day Budget Streak says "Start again once it resets.";
      - starting the 30-Day Budget Streak while over is refused with "You're over a limit right now. Start once it resets."
    - **Cost if wrong:** copy only.
12. **Final review.**
    - **Decision:** tapping a subscription's mark that isn't stamped this month re-stamps it instead of clearing it. Subscriptions reviewed this month show "Reviewed {date}".
    - **Cost if wrong:** clearing an old mark takes two taps.
13. **Final review.**
    - **Decision:** one shared check decides what you logged yourself: `isLoggedExpense(e)`, true when `subscriptionId === null || recurrence !== null`. Expenses entered with "Repeat" now count as logged everywhere, including the daily reminder.
    - **Cost if wrong:** a repeat entry counts as logged.
14. **Final review, "Declined to judge" items.** These all stand as built:
    - cheating by editing your own data;
    - time-zone travel;
    - a stale "today" when the app stays open past midnight;
    - buying from two tabs;
    - both freezes used on a 1-day streak;
    - a leftover no-spend check-in;
    - past periods not judged when the app wasn't opened;
    - a finished quest dropping out of Home's top 3;
    - a restore replacing XP earned after the backup.

    **Why:** it's a single-user app, coins have no value, plan calls 2 and 8 cover some of these, and a restore replaces all data by design.

    **Cost if wrong:** small cosmetic oddities.
15. **Final review, parked.**
    - **Decision:** a mark stamped earlier this month, but before a Subscription Audit challenge started, still needs a clear and a re-tap to count for that challenge.
    - **Why:** it's rare, and "Reviewed {date}" shows why.
    - **Cost if wrong:** one extra tap.

## Final review

A fresh reviewer (Opus) reviewed 99af8d6..d26472a. It agreed with every ruling and found no Critical issues and four Important ones. Each was fixed with a test that failed first:

1. **Overlapping settles announced a gain twice.** This happens when focus and visibility events arrive together, or resume and visibility on Android. Settles now run one after another, and no gain is announced after a lock. Commit cbb06f6.
2. **Monthly-limit wording, and the 30-Day Budget Streak lost on its first day.** Fixed per ruling 11. Commit 0c0880f.
3. **Re-confirming a subscription audit needed a hidden double tap.** Fixed per ruling 12. Commit a5e2c03.
4. **Expenses entered with "Repeat" didn't count as logged.** Fixed per ruling 13. Commit e1fe957.

The same wave also fixed:
- Home now computes the game view once;
- the HUD says "1 coin";
- two doc comments are corrected.

Commits 28116ec and 9e7bdcf. The scoped re-review was clean. Results: unit tests 962/962, end-to-end 40 passed and 2 skipped (by viewport), typecheck and lint clean.

## On the phone (Task 13)

The final build (9e7bdcf) was installed with `npm run android:run` on the Nothing Phone (3a), Android 15. The owner checked:
- the first-open reward for existing history;
- the HUD and quests on Home, clear of the status and gesture bars;
- "Nothing spent";
- an expense moving the XP bar;
- XP and coins unchanged after swiping the app away and reopening;
- the Shop.

All looked good.

Not checked on the phone: a level-up with Android's "Remove animations" turned on. The pop animation exists only under `motion-safe:`, which the built CSS confirms.

## Deferred minors

**Resolved by the final fix wave:**
- the `auditedAt` doc wording;
- a stale celebration after a lock;
- overlapping settles over-reporting a gain;
- Home computing the game view twice.

**Still open:**

- **Data and schema**
  - The restore summary doesn't list the game tables. Ledger rows aren't entries you made.
  - There is no test that a v3 subscription with a mark migrates to `auditedAt: null`.
  - The `ChallengeSchema` error path is unasserted.
- **Levels and rules**
  - `levelStart` and `tierOf` throw outside levels 1–50.
  - Nothing is tested at 486,199 XP or above the cap.
  - The values in `rules.ts` aren't pinned by any test.
- **Ledger and activity**
  - `createdAt` is compared as a string, which breaks with mixed precision. All writers use `toISOString`.
  - The `'log:'` prefix literal is duplicated.
  - `activeDays` sorts when it doesn't need to.
  - A Vite configLoader warning appears in the test output; it was there before M4.
- **Streaks**
  - The logging and check-in wrappers are near-duplicates.
  - A freeze dated mid-week, or a change of week start, is untested.
  - The DST test only proves anything in a time zone that has DST.
  - Milestones are paid again when an edit joins two runs.
- **Quests**
  - A second spend index is built for the awards.
  - One test depends on the real clock.
  - Changing the week start mid-week reopens the weekly check-in quest.
  - The salary quest is stuck on "Waiting for pay day" in a fully frozen month.
  - The daily quest's text mentions "Nothing spent" when the button is hidden.
- **Challenges**
  - Their detail wording isn't pinned by tests.
  - The audit boundary cases are untested.
  - Nested ternaries make the code dense.
  - `startRequirement` rebuilds every challenge view on each call.
  - A No-Spend Weekend started after weekend spending, or an audit whose subscriptions are all cancelled, is lost from the start.
- **Shop**
  - The freeze-streak map and the swatch colours copy domain and token values without a coverage test.
  - The Use guard is per row.
  - Cancel stays enabled while a purchase is pending.
- **Store**
  - `useGame.ts` restates the context rules.
  - A repeated check-in rewrites its record.
  - There are duplicate imports in a test.
  - The settle queue would wait on a storage write that never settles; Dexie writes always do.
  - A write still in flight when the app locks lands in the emptied data until the next unlock; this was already true before M4.
- **UI**
  - A top-3 test builds its limits already sorted.
  - The HUD's accessible name differs from its visible text (a plan-mandated string).
  - Violet's light text colour is 5.498:1.
  - A demo comment is stale, the seeding flag is a single flag, one StrictMode test proves nothing, and an id is misnamed.
  - The multi-reward line can print "+0 coins", and "+1 coins" is theoretical.
  - Three celebration toasts push out an earlier saved toast.
  - The quest order is copied by hand in "How to earn".
  - The "Get freezes" link style differs from other links.
  - The level chip classes are duplicated.
  - "Keep going" stays live while a give-up is pending.
  - The Quests screen's tests mock the actions.
  - A closed weekly dialog may be mounted per quest group.
  - Purchase rows show "0 XP" in Recent XP.
  - Long-history performance on the phone: `overOn` keeps no running totals.
  - Quest rows could link to where each quest is done.
- **Tests and docs**
  - Two e2e locators are brittle: the top 3 on Home, and the Ocean substring match.
  - The README doesn't mention the 5-a-day logging cap.
  - The design spec's data model still lists Achievement, Quest, Streak and CosmeticUnlock entities. The plan text keeps the old "Next week is a fresh start." wording.
  - Existing Repeat expenses pay their logging XP once on the next settle. This is the expected catch-up.
