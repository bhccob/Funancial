# Funancial M6: "Should I buy it?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised 2026-10-16: no AI.** The owner chose a fully offline, free and private check. There is no AI advisor, no questions and no debate. Tasks 1–3 are already built. The original Task 4 (`POST /api/advisor`) was built and is removed by the new Task 4. Wireframes: `design/wireframes/m5-m6.html` for the M6 Ask and answer screens, without the question, reply and debate; `design/wireframes/m6-no-ai.html` for About you only, since its "Think it through" questions are scrapped.

**Goal:** Before buying something, you can ask the app. It checks the purchase against your real numbers, then shows a 0–100% buy meter, a verdict and the facts behind it, plus reminders from your own "About you" notes. After you decide, it reminds you if you chose to wait, and asks later whether the thing was worth it. Everything runs on your phone.

**Architecture:**
- **Rules engine.** A pure engine in `src/domain/advisor/` turns a snapshot of your finances, the purchase and your About-you choices into facts, a meter, a verdict and guards. It runs offline, always.
- **Product links.** `GET /api/extract` on the existing price service reads a product link's name and price, guarded against SSRF. This is the only network call, and it is optional.
- **Storage and screens.** Decisions and About-you notes are encrypted records like everything else. The screens live in `src/features/buy/`.

**Tech Stack:** React 19, TypeScript, Tailwind 4, zustand, zod 4, Vitest, Playwright, Capacitor, and Vercel functions. No new dependency; Task 4 removes `@anthropic-ai/sdk`.

**Spec:**
- `docs/superpowers/specs/2026-10-14-funancial-design.md`: the "Should I Buy It?" section and M6. The owner's no-AI decision supersedes its Claude parts.
- `docs/spec/original-spec.md` §3.8, minus the AI debate.
- `docs/superpowers/specs/2026-10-15-redesign-open-design.md`: "M6 additions". The buy meter and About you are kept; "always debates" and "facts remembered from debates" are dropped.
- The wireframes named above.

## Calls this plan makes (the owner approved 1–9 before the no-AI change; 10–12 are new)

1. **Ask form.** It asks for Category (to show the right limit) and Pay with (for the "needs debt" guard), plus an optional "Why do you want it?". It uses line fields and underline tabs.
2. **Meter zones.**
   - The zones are Skip 0–33, Wait 34–66 and Buy 67–100, and the rules engine sets the meter.
   - It never reaches Buy when the purchase needs debt, would leave the available balance below zero, or is a want or treat that drops the emergency fund under one month.
3. **Verdicts:** Buy it / Wait a few days / Look for a cheaper one / Skip it.
4. **No AI, no network for the check.** Only the optional link fill uses the price service.
5. **Wait.** "Remind me" sets a reminder for the day the over-limit resets, or 48 hours later when no limit is over. The reminder reads "Still want it? ${item}".
6. **Bought.** "I bought it" opens Add Expense filled in. 14 days later the app asks "Was ${item} worth it?" (1–5).
7. **Badges:**
   - Smart Shopper (rate a purchase 4–5), 100/25;
   - Impulse Controller (skip 5), 150/40;
   - Budget Defender (skip 3 that would have gone over a limit), 150/40.
8. **Similar past purchases** are the last 10 decisions sharing a word of 3+ letters, or the category. A low rating lowers the meter, and a high rating raises it.
9. **Home.** "Buy it?" replaces History among the round actions. Add Expense gets "Haven't bought it yet? Ask first →".
10. **About you** has four parts:
    - **What matters to you**: shown back on every answer as `You said: ${text}`.
    - **Where you tend to overspend**: category picks. A purchase in one of them lowers the meter by 10 and shows `You said you tend to overspend on ${category}.`
    - **A goal to protect**: an existing goal. Its delay is the goal-delay fact, and a delay of more than 7 days lowers the meter by 10. Without one, the nearest-deadline goal is used, as today.
    - **Your situation**: optional free text, shown back with the matters line.
11. **Removed:**
    - the AI advisor route;
    - Claude's SDK;
    - the debate;
    - the "Remember" offers;
    - About-you facts.
12. **Your own words.** The answer shows your optional "Why do you want it?" as `You said: ${why}`.

## Global Constraints

- **No new runtime dependency.** Task 4 removes `@anthropic-ai/sdk` and everything that used it.
- **Nothing about you leaves the phone for an ask.** The only network call is the optional `GET /api/extract?url=`, which carries the link alone.
- **The extract route keeps its rules:**
  - the token guard;
  - SSRF checks on every hop;
  - a 2 MiB cut and a 5 s budget;
  - `no-store` errors with no details;
  - CORS `GET, OPTIONS` and the `X-Funancial-Token` header.
- **Money and dates.** Money is integer minor units in the profile currency, rounded once at the edge. It is formatted only through `useMoney` / `formatMoney`, and dates only through `src/lib/format.ts`.
- **Code style.** Domain code is pure, with time passed in. The UI uses the Open style, with line fields and underline tabs for forms.
- **Accessibility.** Touch targets are at least 44px, every action has a label, and motion runs only under `motion-safe:`.
- **Disclaimer.** The UI always shows `Not financial advice` under an answer.
- **Commits** end with your model's `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>` trailer.
- **Every task** runs `npm test`, `npm run typecheck` and `npm run lint`. UI and e2e tasks also run `npm run test:e2e`.

## Review Focus

1. **The meter never reaches Buy past a guard.** This holds with About-you adjustments, similar-purchase history and every combination of urgency and timing. Pinned in Task 4, with a table-driven test over guard × adjustments.
2. **About-you edge cases.**
   - The protected goal is deleted or completed: fall back to the nearest-deadline goal.
   - An empty overspend list changes nothing.
   - A category picked twice counts once.
   - Notes at the 500-character limit are accepted; longer ones are refused with a message.

   Pinned in Tasks 4 and 7.
3. **Offline never blocks a decision.** With no network, Ask works: the link fill fails quietly with its message, and every other path completes. Pinned in Tasks 5 and 6.
4. **Extract can't be aimed inside the network.** This was done in Task 3 and its tests stay green through Task 4's removals.
5. **Odd money input.** Price 0 and over 10,000,000, quantity, a category with no limit, and no spending history. This was done in Task 1 and its tests stay green.

---

### Task 1: Totals-only snapshot and the rules engine

**Files:**
- Create in `src/domain/advisor/`: `snapshot.ts`, `rules.ts`, `meter.ts`, `index.ts`, plus tests

**Interfaces:**
- **Consumes:**
  - `computeFinanceView` (`src/domain/view.ts`): `available`, `billsTotal`, buckets.
  - `limitStatus` (`src/domain/budget.ts`).
  - `monthlyToReach` (`src/domain/goals.ts`).
  - `portfolio`, `allocation`, `profitAndLoss` and `projectedAnnual` from M5.
  - The `Expense` category enum `CategorySchema`.
- **Produces:**
  - `type BuyAsk = { item: string; price: number /* minor, per unit */; quantity: number; category: Category; urgency: 'need' | 'want' | 'treat'; howSoon: 'today' | 'month' | 'norush'; payWith: 'cash' | 'debit' | 'credit_card' | 'other'; cardId: string | null; link: string | null; why: string | null /* optional, ≤ 200 chars, sent to the advisor only */ }`.
  - `type AdvisorSnapshot = { currency; monthIncome; monthSpent; spentByCategory: Record<Category, number>; limits: Array<{ scope: Category | 'overall'; period: 'week' | 'month'; limit; spent }>; available; billsTotal; freeze: { active: boolean; until: LocalDate | null }; savings; emergencyMonths: number | null; goals: Array<{ name; target; saved; deadline: LocalDate | null }>; debts: { total; cardsDue }; investments: { value; byType: Record<'stock' | 'etf' | 'other', number> }; dividendsYear; similar: Array<{ item; price; verdict; status; usage: number | null }> }`. Every value is integer minor units except the month figures and `emergencyMonths`.
  - `buildSnapshot(data, today: LocalDate, ask: BuyAsk): AdvisorSnapshot`.
  - `type Facts = { total: number; categoryAfter: { limit: number; spentAfter: number; pct: number } | null; overallAfter: { limit; spentAfter; pct } | null; overBy: number /* max overage, ≥ 0 */; availableAfter: number; emergencyBefore: number | null; emergencyAfter: number | null; goalDelay: { name: string; days: number } | null; requiresDebt: boolean; resetsOn: LocalDate | null /* start of the next period of the over limit */ }`.
  - `analyse(snapshot, ask, today): { facts: Facts; meter: number; verdict: Verdict; confidence: 'low' | 'medium' | 'high'; guards: { capAtWait: boolean; reasons: string[] } }`, where `type Verdict = 'buy' | 'wait' | 'cheaper' | 'skip'`.
  - `zone(meter): 'skip' | 'wait' | 'buy'`: 0–33, 34–66, 67–100.

**Rules (decided here):**
- **Emergency months:** the emergency goal's `saved` (the first goal with `kind: 'emergency'`), else the savings bucket, divided by the average monthly spending of the last 3 full months. It is `null` when that average is 0.
- **`requiresDebt`:**
  - `payWith === 'credit_card'` and that card already carries a balance; or
  - `total > cash + savings − billsTotal`.
- **Goal delay:** for the goal with the nearest deadline that is not complete, `days = ceil(total / (monthlyToReach / 30))`. It is `null` when there is no such goal or `monthlyToReach` is 0 or null.
- **Baseline meter:** start at 50, add the changes below, then clamp to 0–100.

  | Condition | Change |
  |---|---|
  | urgency need / want / treat | +20 / 0 / −10 |
  | howSoon today with a want or treat / no rush | −10 / +5 |
  | category or overall limit after ≤ 80% | +10 |
  | category limit after > 100% | −15 |
  | overall limit after > 100% | −20 |
  | `availableAfter` < 10% of `monthIncome` | −10 |
  | emergency after ≥ 3 / < 1 | +10 / −15 |
  | goal delay > 14 days | −10 |
  | a similar past purchase rated ≤ 2 / ≥ 4 | −10 / +5 |

- **Guards:** `capAtWait = requiresDebt || availableAfter < 0 || (urgency !== 'need' && emergencyAfter !== null && emergencyAfter < 1)`. When it is true, the meter is clamped to ≤ 66.
  - Reasons copy: `Needs money you don't have`, `Leaves your available balance below zero`, `Drops your emergency fund under a month`.
- **Verdict:**
  - zone `buy` gives `buy`; zone `skip` gives `skip`;
  - zone `wait` gives `cheaper` when `overBy > 0` and `total × 0.6` would fit every limit; otherwise `wait`.
- **Confidence:** high when |meter − 50| ≥ 30, medium when ≥ 15, low otherwise.

- [ ] **Step 1: Write the failing tests**

```ts
it('sends totals only: no note text, ids or individual amounts', () => {
  // data with expense note 'SECRET-NOTE-123' → JSON.stringify(buildSnapshot(...)) has no 'SECRET-NOTE-123' and no expense id
});
it('computes limits after, overage and the reset date for a Fun purchase', () => {});
it('needs debt when cash + savings − bills can\'t cover it, or the card carries a balance', () => {});
it('caps the meter at 66 when a guard fires, with the reason', () => {});
it('scores need/want/treat, timing, limits, emergency fund, goal delay and history as specified', () => {});
it('maps meter to zone and verdict, including "cheaper" when 60% would fit', () => {});
it('multiplies price by quantity', () => {});
it('shows emergency months as null with no spending history', () => {});
it('falls back to the overall limit, or leaves the line out, when the category has none', () => {});
it('finds similar past decisions by shared word or category, newest 10', () => {});
```

- [ ] **Step 2: Run** `npx vitest run src/domain/advisor`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: buy advisor snapshot and rules engine`

---

### Task 2: Data v8: decisions and About you

**Files:**
- Modify: `src/domain/entities.ts`, `snapshot.ts`, `migrations.ts`, `src/test/fixtures.ts`

**Interfaces:**
- **`BuyDecisionSchema`** (table `buyDecision`): base fields plus
  - `ask: BuyAsk`;
  - `facts: Facts`, `rulesMeter`, `rulesVerdict: Verdict`;
  - `meter`, `verdict: Verdict`, `confidence`;
  - `ai: { summary: string; pros: string[]; cons: string[]; alternatives: string[]; coolingOffHours: number | null } | null` (`null` means Basic check);
  - `debate: Array<{ role: 'advisor' | 'you'; text: string; meter: number | null; at: Iso }>`, capped at 40 turns;
  - `status: 'open' | 'waiting' | 'bought' | 'skipped'`;
  - `remindOn: LocalDate | null`, `boughtOn: LocalDate | null`, `usage: 1 | 2 | 3 | 4 | 5 | null`.
- **`AboutYouSchema`** (table `aboutYou`, a single record with `id: 'about'`): `situation`, `matters`, `overspend` (strings, each up to 500 chars) and `facts: Array<{ id: string; text: string /* ≤ 200 chars */; addedOn: LocalDate }>`.
- `ReminderSettings` gains `buyIt: boolean`, default true.
- `CURRENT_SCHEMA_VERSION = 8`, with a spelled-out step 8 that adds `reminders.buyIt: true` when missing and changes nothing else.
- Fixtures: `makeBuyDecision`, `makeAboutYou`.

- [ ] **Steps 1–5:**
  1. Write tests for parse, defaults, caps and a v7 snapshot migrating to empty tables, and watch them fail.
  2. Implement.
  3. Run `npm test && npm run typecheck && npm run lint` until it passes.
  4. Commit: `feat: buy decisions and About you records (schema v8)`

---

### Task 3: `GET /api/extract`: name and price from a product link

**Files:**
- Create: `api/extract.ts`, `api/_lib/safeFetch.ts`
- Modify: `api/_lib/api.test.ts`

**Interfaces:**
- **Route:** `GET /api/extract?url=<encoded>` → `{ name: string | null; price: number | null /* major units */; currency: string | null }`.
- **Sources, in order of preference:**
  1. JSON-LD `Product` / `Offer` (`name`, `offers.price`, `offers.priceCurrency`);
  2. OpenGraph `og:title` with `product:price:amount` / `product:price:currency`;
  3. `<title>`.
- **Cache:** `s-maxage=3600`. Errors are `no-store`.
- **`safeFetch(url): Promise<string>`:**
  - accepts `http`/`https` only;
  - resolves DNS with `node:dns/promises` `lookup(host, { all: true })` and rejects any private, loopback, link-local, ULA or unspecified address (IPv4 and IPv6);
  - follows at most 3 redirects manually, re-checking every hop;
  - has a 5 s total timeout and a 1 MB cap (it streams and stops);
  - gives up on a non-HTML content type.
- **Errors:** blocked or bad input gives `400 {"error":"bad request"}`; a fetch failure gives `502 {"error":"upstream"}`.

- [ ] **Steps 1–5:**
  1. Write tests for each Review Focus #4 case (mock `dns` and `fetch`), plus the JSON-LD / OpenGraph / title parsing and the currency.
  2. Run them and watch them FAIL.
  3. Implement.
  4. Run the gate.
  5. Commit: `feat: read a product link's name and price, safely`

---

### Task 4: Remove the AI advisor, and teach the rules About you

**Files:**
- **Delete:** `api/advisor.ts`, `api/_lib/claude.ts`, `api/_lib/claude.test.ts`, `api/_lib/advisorSchema.ts`, and the advisor tests in `api/_lib/api.test.ts`.
- **Modify:**
  - `package.json` and the lockfile: run `npm uninstall @anthropic-ai/sdk`.
  - `vercel.json`: drop the advisor entry.
  - `.env.example`: drop the `ANTHROPIC_*` lines.
  - `vite.config.ts`: drop the dev plugin's POST support and the `ANTHROPIC_*` copy.
  - `api/_lib/http.ts`: CORS back to `GET, OPTIONS` and `X-Funancial-Token`.
  - `src/domain/entities.ts`, `src/domain/migrations.ts`, `src/test/fixtures.ts`, `src/domain/advisor/*`.

**Keep:** everything Task 3 built, including the dedicated agents and the blocked ranges, plus their tests.

**Schema v8 changes in place.** v8 has never shipped to a device.
- **`BuyDecisionSchema`:**
  - Drop `ai` and `debate`.
  - Keep `meter`, `verdict` and `confidence`, which now always come from the rules.
  - Keep `rulesMeter` and `rulesVerdict` as the values at ask time.
- **`AboutYouSchema`:** `{ id: 'about', situation: string ≤ 500, matters: string ≤ 500, overspend: Category[] (unique), protectGoalId: string | null }`. Drop `facts`.

**Rules: `analyse(snapshot, ask, today, about?: AboutYou)`.**
- **Overspend:** when `about.overspend` includes `ask.category`, subtract 10 and add the reason `You said you tend to overspend on ${label}.` to a new `notes: string[]` in the result. Use the app's category label.
- **Goal to protect:** when `about.protectGoalId` names a goal in the snapshot, `goalDelay` uses that goal.
  - A delay of more than 7 days subtracts 10, in place of the generic more-than-14-days rule for that goal.
  - The snapshot's goals gain `id` for this. It is local-only now.
  - A protected goal that is missing or complete falls back to the nearest-deadline goal.
- **Your own words:** `notes` also carry `You said: ${about.matters}` (when set), `${about.situation}` (when set), and `You said: ${ask.why}` (when set).
- **Guards:** unchanged, and applied after every adjustment.

**Rename the totals-only test.** It stays valid, but rename it to "the snapshot holds totals, not transactions".

- [ ] **Step 1: Write the failing tests:**
  - overspend −10 with its note;
  - protect-goal delay > 7 days −10, and the fallback when that goal is gone or complete;
  - the notes copy;
  - a table over guard × overspend × protect × similar history, proving the meter never reaches 67 under a guard;
  - About-you schema limits and unique categories;
  - no `@anthropic-ai/sdk` in `package.json`, and no `api/advisor.ts`.
- [ ] **Step 2: Run** `npx vitest run src/domain api`. Expected: FAIL.
- [ ] **Step 3: Implement** the removals and the rule changes.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** in two parts:
  - `refactor: remove the AI advisor`
  - `feat: the buy check reads About you`

---

### Task 5: Buy actions

**Files:**
- Create: `src/store/buyActions.ts`, `src/store/useBuy.ts`, plus tests
- Modify: `src/services/market.ts` (add `fetchExtract(url)`, same pattern as the other fetchers)

**Interfaces:**
- **`createBuyActions(store, market)`:**
  - **`ask(ask: BuyAsk): Promise<string>`.** It validates with `BuyAskSchema`, using the existing friendly messages for name, price and quantity. It runs `buildSnapshot`, passing past decisions without the new one, then `analyse` with the About-you record. It saves the decision with status `open` and returns its id.
  - **`wait(id)`:** status `waiting`; `remindOn` is `facts.resetsOn`, else today + 2 days.
  - **`bought(id)`:** status `bought`, `boughtOn` today. It returns the prefill `{ item, amount: price × quantity, category }`.
  - **`skip(id)`**, **`rate(id, usage: 1–5)`** and **`deleteDecision(id)`**.
  - **`saveAbout(patch)`:** it creates the single `aboutYou` record if missing, and enforces the limits with messages.
- **`useBuy.ts`:** `useBuyActions()`, `useDecisions()` (newest first), `useDecision(id)` and `useAboutYou()`.

- [ ] **Steps 1–5:**
  1. Write tests with a real store (`freshRealStore`) and watch them fail. Cover:
     - an ask saves the rules result, and works offline;
     - About you changes the meter;
     - past decisions exclude the new one;
     - wait picks the reset date or +2 days;
     - bought returns the prefill;
     - the rate range;
     - the validation messages;
     - saveAbout creates, then updates the record.
  2. Implement.
  3. Run the gate.
  4. Commit: `feat: buy actions`

---

### Task 6: Ask, answer and the ways in

**Files:**
- Create in `src/features/buy/`: `BuyScreen.tsx` (list + Ask), `AskForm.tsx`, `AnswerScreen.tsx`, `BuyMeter.tsx`, plus tests
- Modify:
  - `src/app/routes.tsx` (`/buy`, `/buy/:id`)
  - `src/app/menu.ts` (Buy it? without `soon`; "Coming next" goes)
  - `src/features/dashboard/HomeActions.tsx` (Buy it? replaces History)
  - `src/features/add/AddScreen.tsx` / `ExpenseForm.tsx`: the line `Haven't bought it yet? Ask first →`, plus prefill from router `state: { prefill: { item, amount, category } }` (Ruling C)
  - navigation tests and e2e

**Ask form** (line fields and underline tabs):
- `Paste a link (fills name and price)`: on paste or blur, call `fetchExtract`, fill the empty fields, and show `Couldn't read that link. Fill it in yourself.` on failure or offline.
- `What is it?`, `Price`, Quantity (a stepper, default 1), Category, `Pay with`, and `Why do you want it? (optional)`.
- `Need · Want · Treat` and `How soon? Today · This month · No rush`.
- The `Ask` button, and the footnote `Your numbers stay on your phone.`

**Answer:**
- **`BuyMeter`.** A 0–100 gauge with Skip, Wait and Buy zones and a marker. It shows `${meter}% a buy`, and has `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-valuetext` (`38% a buy, Wait zone`). The marker moves only under `motion-safe:`.
- **The verdict line**, then `· confidence ${level}`.
- **The facts grid:**
  - `${Category} limit after ${pct}% · over by ${amount}`
  - `Available after ${amount}`
  - `Emergency fund ${before} → ${after} months`
  - `${goal} goal +${days} days later`

  Leave out a line when its fact is null.
- **Guard reasons** in a warning `Banner` when `capAtWait`.
- **The `notes`** as muted lines (overspend, `You said: …`).
- **The decide buttons:** `Remind me ${formatDay(remindOn)}` → wait; `I bought it` → bought, then navigate to `/add` with the prefill; `Skip it` → skip. After deciding, show the status line (`Waiting until ${day}` / `Bought ${day}` / `Skipped`). A bought decision shows a `Was it worth it?` 1–5 rating.
- **The footer:** `Not financial advice`.

**List:** past decisions, newest first, each with item, price, meter %, verdict and status. A decision can be deleted.

- [ ] **Steps 1–5:**
  1. Write tests and watch them fail. Cover:
     - form validation, and the link fill, both the stubbed fill and the offline failure;
     - the meter's ARIA and zone;
     - the verdict;
     - facts left out when null;
     - the guard banner;
     - the notes;
     - each decide button, including the Add Expense prefill;
     - the rating;
     - the Home action, Menu entry and Add Expense line.
  2. Implement.
  3. Run the gate + e2e.
  4. Look at it at 375px in light and dark.
  5. Commit: `feat: ask whether to buy, with the buy meter`

---

### Task 7: About you

**Files:**
- Create: `src/features/buy/AboutYouScreen.tsx`, plus tests
- Modify: `routes.tsx` (`/about-you`), `menu.ts` (About you in "You", after Quests)

**What to build** (wireframe `m6-no-ai.html`, About you phone):
- The heading `About you` and the intro `The app uses this every time you ask. It stays on your phone.`
- `What matters to you` (a line field).
- `Where you tend to overspend` (category chips, multi-select).
- `A goal to protect` (a select of your goals plus `None`).
- `Your situation (optional)`.
- Saved on change or blur, with a `Saved` status.
- The explanatory note from the wireframe.

- [ ] **Steps 1–5:**
  1. Write tests for saving each field, the chips' toggle and uniqueness, the goal select including a deleted goal, and the 500-character limits with a message. Watch them fail.
  2. Implement.
  3. Run the gate.
  4. Commit: `feat: About you for the buy check`

---

### Task 8: Badges and reminders

**Files:**
- Modify in `src/domain/game/`: `types.ts`, `badges.ts`, `rules.ts`, plus tests
- Modify: `src/domain/notifications.ts`, `src/features/settings/RemindersSection.tsx` (a `Buy it?` switch on `reminders.buyIt`), and quest labels/icons

**What to build:**
- **Badges** `smart-shopper`, `impulse-controller` and `budget-defender` (Calls #7). Budget Defender counts skipped decisions whose `facts.overBy > 0`.
- **Reminders** (kinds `buy-wait` and `buy-usage`, route `/buy/${id}`):
  - At 09:00 on `remindOn` for `waiting`: title `Still want it? ${item}`, body `You chose to wait. See your check again.`
  - At 09:00 14 days after `boughtOn` while `usage` is null: title `Was ${item} worth it?`, body `Rate it, and your next check takes it into account.`

- [ ] **Steps 1–5:**
  1. Write tests for each badge, both reminders and the switch. Watch them fail.
  2. Implement.
  3. Run the gate.
  4. Commit: `feat: buy-it badges and reminders`

---

### Task 9: Demo and end to end

**Files:**
- Modify: `src/data/demoSeed.ts` (three decisions: one waiting, one bought and rated, one skipped over a limit; plus an About-you record), and its tests
- Create: `tests/e2e/buy.spec.ts` (mock `**/api/extract`)

**e2e:**
1. From Home's Buy it?, paste a link (mocked), ask about something over the Fun limit, and see the meter, verdict, facts and guard banner.
2. Set About you overspend to that category, ask again, and see the meter drop and the note appear.
3. Choose I bought it, and see Add Expense open prefilled.
4. With `/api/extract` failing, the link message shows and Ask still works.

- [ ] **Steps 1–5:**
  1. Write the tests and watch them fail.
  2. Implement.
  3. Run the gate + e2e.
  4. Commit: `test: buy-it end to end and demo decisions`

---

### Task 10: Deploy the link reader, then the phone (needs the owner)

- [ ] **Step 1: Deploy.** Once the owner confirms, run `npx vercel --prod`; `/api/extract` isn't live yet.
  - Live-check `/api/extract` with the token on one real product link, and confirm 400 for `http://127.0.0.1` and 401 without the token.
  - Ask the owner whether to remove the unused `ANTHROPIC_API_KEY` with `npx vercel env rm ANTHROPIC_API_KEY production`. Never print it.
- [ ] **Step 2: Install** with `npm run android:run`, with `JAVA_HOME` set to `C:\Users\bhcco\.jdks\temurin-21.0.12.1` for that command.
- [ ] **Step 3: Checklist.**
  1. Ask about something real, using a pasted link.
  2. Check the meter, verdict, facts and notes.
  3. Use About you.
  4. Remind me, then I bought it.
  5. In airplane mode, Ask still works.
- [ ] **Step 4: Commit** any fixes as `fix: on-device findings`.

---

## Milestone checkpoint (M6 done)

On the phone you can ask before you buy and get a guarded verdict with a meter, built from your own numbers and your own notes, entirely on the phone. Next is M7: help, polish and the rest of the forms in the new style.
