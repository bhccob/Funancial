# M6 Should I buy it?: decisions and deferred items

**What happened.**
- Branch `feat/m6-buy-it`, commits 97251a0..acf028d, from main 97251a0.
- **Plan:** `docs/superpowers/plans/2026-10-16-funancial-m6-buy-it.md`, revised at 87b3f25 after the owner chose **no AI**.
  - The Claude advisor was built and then removed in Task 4. Nothing about it remains in the tree: no SDK, no POST route, no `ANTHROPIC_*`, and CORS is back to `GET, OPTIONS`.
  - Its code survives only in branch history (9d0ef17..1cfce37) and in the stash `m6-task5-partial`. Dropping the stash or squashing that history is your call.
- **Tasks 1–9** were each built, reviewed and fixed until their review came back clean:
  - the rules engine;
  - storage (schema v8);
  - the link reader `GET /api/extract`;
  - the rules reading About you;
  - the buy actions;
  - Ask and answer, with Home, Menu and Add Expense entry points;
  - About you;
  - badges and reminders;
  - the demo and e2e.
- **Whole-branch review (Opus):** ready with fixes, no Critical findings. One fix wave closed four items, and the scoped re-review was clean.
- **Final gate at acf028d:** 2124 unit tests passing; typecheck and lint clean; e2e 70 passed, 8 skipped (mobile-only specs on the desktop project).
- **Task 10, done on 2026-10-17:**
  - The link reader is deployed to production (https://funancial.vercel.app). Live check: a real Allbirds product link read as "Men's Wool Runner", $110; a private address was refused (400); a call without the token was refused (401).
  - M6 was installed on the owner's phone over M5, and the owner ran the checklist (a pasted link, About you, Remind me then I bought it, Ask in airplane mode): "everything works on the phone".

## How it works now, in plain words

- **The check runs on your phone.**
  - It reads only totals: available, limits, emergency fund, goals and card balance, never single transactions.
  - It gives a 0–100% meter, a verdict, the facts behind it, guard reasons, and notes from About you.
  - Zones: Skip 0–33, Wait 34–66, Buy 67–100.
- **Guards cap the meter at 66,** so it never reads Buy, when the purchase:
  - needs debt;
  - leaves available below zero;
  - is a want or treat that drops the emergency fund under a month.

  A table test over 216 combinations pins this.
- **About you** changes the check in three ways:
  - A category you overspend on: −10 and a note.
  - A goal to protect: a delay of more than 7 days gives −10. If that goal is deleted, complete or has no deadline, the check falls back to the nearest-deadline goal.
  - What matters to you, your situation and your "why": shown back as notes.
- **Deciding.**
  - **Remind me** sets the day the over-limit resets, or 2 days later when no limit is over.
  - **I bought it** opens Add Expense filled in with the item, amount, category and how you said you'd pay. A deleted card falls back to Cash.
  - **Rating** (1–5) is only for bought decisions.
  - **Check again** on an open or waiting decision re-runs it with today's numbers and replaces the old one.
- **The link reader** (`/api/extract`) is the only network call. It carries the link alone. Its guards:
  - every redirect hop is checked against private addresses;
  - DNS and connect share one checked answer;
  - a 2 MiB read cap and a 5 s budget;
  - the token is required.

## The calls I made

- **Storage and engine.**
  - Schema v8 was edited in place: it had never shipped, so no data exists in the old v8 shape.
  - Decisions store their facts, meter, guards and notes from ask time.
  - The demo's decisions are produced by the real rules, never typed in.
- **Reading product pages.**
  - Pages are read up to 2 MiB. IKEA's product data sits at about 1.1 MB.
  - Prices are found through a bounded JSON-LD walk with an og:price fallback.
  - A price in another currency isn't filled in; the screen asks you to enter it in yours.
- **Screens.**
  - About you saves each field when you leave it, and also when you leave the screen. That matters because Android's Back doesn't blur the field you were typing in.
  - It saves only what you changed, so it never overwrites a newer note.
  - Re-graded on effect at the final review: the 1–5 rating targets are now 44px wide, and "Remind me" says when no reminder will come:
    - "Reminders are off. Turn them on in Settings." where Settings has the switch;
    - "Reminders only come on the phone." on the web;
    - "Reminders don't come on demo money." in demo money.
- **Demo.**
  - The demo's waiting decision can read "Skip it", because the real rules say so. Choosing to wait anyway is a real case.
  - The e2e turns Fun off and on, because the demo's About you already marks it.
- **Left as is.**
  - Badges can be earned with throwaway asks, since they're one-time and the app is personal.
  - The cap-at-66 rule isn't in the stored schema. Hand-edited backups are the only way around it.
  - The extract route's CDN cache keys on the token like the quote route.

## Deferred minors

- **Answer screen.**
  - The emergency-fund line rounds to one decimal, so 0.96 shows "1.0 months" beside "under a month". Flooring would fix it.
  - After Check again, tapping a reminder for the old decision that the tray already showed, while the new answer is open, shows a blank screen.
  - Check again on a waiting decision makes an open one and drops the pending reminder, with no line saying so.
- **Add Expense prefill.**
  - It's delivered once, so a bought decision has no way back to a prefilled form.
  - A prefill from before this update (no paymentMethod) is dropped instead of degrading to Cash.
- **Link field.**
  - It sends any pasted text, not just http(s) links.
  - It doesn't retry after a failed read without an edit.
  - A paste into a non-empty field sends one wasted request.
  - The reader takes an empty name as found, doesn't read every JSON-LD variant shape, decodes UTF-8 only, and asks for identity encoding, so the cap counts raw bytes.
- **About you.**
  - A text save that fails on a transient storage error isn't retried on leaving. The error is shown.
  - After a transient failure plus a quick second tap, the chips show the stored value until the next tap.
  - A reload from another tab can be overwritten only by a field you then edit.
- **Reminders.** A wait whose reset is about 31 days out can sit just past the 30-day scheduling horizon until the next resume or day change. Dividends share this.
- **Carried to M7.**
  - The shared category list in LimitDialog, SubscriptionDialog and HistoryScreen (M7 Task 4).
  - TextField's over-limit message isn't announced (M7 Task 5).
- **Tests.**
  - The demo buy tests run at one mid-month date.
  - No test checks that a buy-it badge survives deleting its decisions.
  - The Asked-line test assumes a UTC-ish timezone.
  - The e2e wording "held at Wait" is loose.
  - The guard table's protect axis can't tell its values apart.
