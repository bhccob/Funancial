# Funancial M6: "Should I buy it?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before buying something, you can ask the app. It checks the purchase against your real numbers. It shows a 0–100% buy meter with a verdict, always pushes back with a question you can argue with, and remembers what you choose to tell it. After you've decided, it reminds you if you chose to wait, and asks later whether the thing was worth it.

**Architecture:**
- **Rules engine.** A pure engine in `src/domain/advisor/` turns a totals-only snapshot of your finances and the purchase into facts: limits after, available after, emergency months, goal delay and whether it needs debt. From those it computes a baseline meter and a verdict. It runs offline and always.
- **Advisor route.** `POST /api/advisor` on the existing Vercel price service sends the snapshot, the ask, your "About you" notes and the debate so far to Claude, and gets back structured JSON. The server clamps the meter so the AI can never push past the hard guards.
- **Product links.** `GET /api/extract` reads a product link's name and price, guarded against SSRF.
- **Storage.** Decisions and About-you notes are encrypted records, like everything else. The screens live in `src/features/buy/`.

**Tech Stack:**
- Existing: React 19, TypeScript, Tailwind 4, zustand, zod 4, Vitest, Playwright, Capacitor, Vercel functions.
- New: `@anthropic-ai/sdk`, server-side only under `api/` and pinned exact.

**Spec:**
- `docs/superpowers/specs/2026-10-14-funancial-design.md`: the "Should I Buy It?" section and M6.
- `docs/spec/original-spec.md` §3.8, plus the badges and notifications lists.
- `docs/superpowers/specs/2026-10-15-redesign-open-design.md`: "M6 additions from the owner".
- The approved wireframe `design/wireframes/m5-m6.html`, M6 row. Match its layout and copy unless this plan says otherwise.

## Calls this plan makes (for the owner's review)

1. **The Ask form gains two fields the wireframe didn't show.**
   - **Category**, needed to show the right limit, e.g. "Fun limit after 132%".
   - **Pay with**, the app's existing choices, needed for the "needs debt" guard.

   Both use the lighter line style from the Invest forms.
2. **Meter zones:** Skip 0–33, Wait 34–66, Buy 67–100.
   - The rules engine sets the baseline using the formula in Task 1.
   - The AI may move it at most 30 points either way.
   - It can never enter the Buy zone when the purchase needs debt, would leave the available balance below zero, or is a want or treat that drops the emergency fund under one month.
3. **Verdicts:** Buy it / Wait a few days / Look for a cheaper one / Skip it.
4. **Model.** The advisor uses `claude-opus-5-5`, changeable with an `ANTHROPIC_MODEL` setting in Vercel. Each ask and each debate reply is one call.
   - Without `ANTHROPIC_API_KEY`, or offline, you get the rules-only "Basic check" and no debate.
5. **Wait.** "Remind me" sets a reminder for:
   - the day the over-limit resets, when a limit is the reason (the wireframe's "Nov 1");
   - otherwise the AI's cooling-off time, or 48 hours.

   It sends "Still want it? ${item}".
6. **Bought.**
   - "I bought it" marks the decision bought and opens Add Expense filled in with the name, price and category. You still save the expense.
   - 14 days later a reminder asks "Was ${item} worth it?" with a 1–5 rating.
7. **Badges:**

   | Badge | Condition | XP / coins |
   |---|---|---|
   | Smart Shopper | rate something you bought 4 or 5 | 100/25 |
   | Impulse Controller | skip 5 decisions | 150/40 |
   | Budget Defender | skip 3 decisions that would have gone over a limit | 150/40 |

8. **Similar past purchases** are the last 10 decisions that share a word of 3 or more letters in the name, or the category.
9. **Home.** "Buy it?" replaces History among Home's four round actions. History stays in the Menu. Add Expense gets "Haven't bought it yet? Ask first →".
10. **Not in M6:** "buy used" price lookups, price-drop watching, and sharing a decision.

## Global Constraints

- `@anthropic-ai/sdk` is imported only under `api/`, pinned exact (`npm i -E @anthropic-ai/sdk`). No other new runtime dependency.
- **Advisor route.** It keeps the existing guard: `X-Funancial-Token`, a constant-time compare, `401 no-store`, and `500 not configured` when `FUNANCIAL_ACCESS_TOKEN` is missing.
  - Without `ANTHROPIC_API_KEY` it returns `503 {"error":"advisor off"}` with `no-store`.
  - Every advisor response is `no-store`.
  - The body is limited to 64 KB and validated with zod; anything else gets `400 {"error":"bad request"}`.
  - Claude failing, refusing or returning invalid JSON gives `502 {"error":"upstream"}`, with no details in the body.
- **CORS.** `api/_lib/http.ts` allows `GET, POST, OPTIONS` and the headers `X-Funancial-Token, Content-Type`. Same origins as today.
- **Totals only.** What leaves the phone for an ask is the `AdvisorSnapshot` from Task 1, the ask, your About-you notes and the debate turns. No individual expense, income, transaction, note, id or date of a past transaction is ever sent.
- **Guard rules.** The server clamps the meter to `[baseline − 30, baseline + 30] ∩ [0, 100]`. When `guards.capAtWait` is true it also clamps to `≤ 66` and replaces a `buy` recommendation with `wait`. It returns `clamped: true` when it changed anything.
- **System prompt.** It states that the advisor:
  - gives no licensed financial advice;
  - never encourages debt or risky spending;
  - is transparent and non-manipulative, never shaming;
  - is told every figure comes from the app;
  - always ends with one pointed question or counterargument (`question`);
  - offers `remember` only for a new, durable personal fact the person stated.
- **The UI always shows** `Not financial advice` under an answer.
- **Exact copy:**
  - Basic check: `Basic check · the advisor explains this when you're online.`
  - No debate: `The debate needs the advisor. You can still decide.`
- **Money and rounding.** Money is integer minor units in the profile currency, rounded once at the edge. It is formatted only through `useMoney` / `formatMoney`, and dates only through `src/lib/format.ts`.
- **Code and style.**
  - Domain code is pure, with time passed in.
  - The Open style applies, with line fields and underline tabs for the forms.
  - Touch targets are at least 44px, every action has a label, and motion is only under `motion-safe:`.
- **Commits** end with your model's `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>` trailer.
- **Every task** runs `npm test`, `npm run typecheck` and `npm run lint`. UI and e2e tasks also run `npm run test:e2e`.

## Review Focus

1. **The AI can never talk you into the Buy zone past a guard.** With a crafted model reply of `{ meter: 95, recommendation: 'buy' }` and `capAtWait`, the response is 66 / `wait` / `clamped: true`. Pinned in Task 4.
2. **Nothing private leaves the phone.** A snapshot built from data full of notes and transactions contains no note text, no ids and no individual amounts beyond the totals listed. Pinned in Task 1, by serialising and searching for a known note string.
3. **Offline or no key never blocks a decision.** Ask still shows the rules meter, verdict and facts with the Basic check line, and you can still Remind / I bought it / Skip. Pinned in Tasks 5 and 6.
4. **Extract can't be aimed inside the network.** `localhost`, `127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `::1`, `fc00::/7`, a hostname that resolves to any of those, redirects to those, non-http(s), more than 1 MB and more than 5 s are all refused. Pinned in Task 3.
5. **Odd money input.**
   - A price of 0 is refused.
   - A price over 10,000,000 is refused.
   - Quantity above 1 multiplies the price.
   - A want with no limit set in that category still gets a sensible meter (the overall limit is used, or the line is left out).
   - A profile with no spending history shows the emergency months as `—`, not `∞` or NaN.

   Pinned in Task 1.

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

### Task 4: `POST /api/advisor`

**Files:**
- Create: `api/advisor.ts`, `api/_lib/claude.ts`, `api/_lib/advisorSchema.ts`
- Modify: `api/_lib/http.ts` (POST, `Content-Type`), `api/_lib/api.test.ts`, `package.json`, `.env.example` (`ANTHROPIC_API_KEY=`, `ANTHROPIC_MODEL=`)

**Interfaces:**
- **Request** (zod): `{ snapshot: AdvisorSnapshot; ask: BuyAsk; facts: Facts; rules: { meter; verdict; confidence; guards }; about: { situation; matters; overspend; facts: string[] }; debate: Array<{ role; text }> /* last 20 */ }`.
  - Share the schema shape with the client by duplicating the zod schema in `api/_lib/advisorSchema.ts`. It is the same contract as Task 1's types, so add a type-level test in `src` that keeps them equal.
- **Model output** (structured, validated with zod): `{ recommendation: Verdict; meter: number; confidence: 'low' | 'medium' | 'high'; summary: string; pros: string[]; cons: string[]; alternatives: string[]; coolingOffHours: number | null; reply: string /* empty on the first ask */; question: string; remember: string | null }`.
- **Response:** the model output after clamping (see Global Constraints) plus `clamped: boolean`.
- **`claude.ts`:**
  - Uses `@anthropic-ai/sdk` with `model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5'`.
  - Asks for structured JSON output, using the installed SDK's structured-output option. Check its types in node_modules.
  - Treats `stop_reason === 'refusal'` or invalid JSON as upstream errors.
  - Keeps `max_tokens` modest (1500).
- **The user message** carries the JSON input; the system prompt carries the guardrails.

- [ ] **Step 1: Write the failing tests** (mock `./_lib/claude`):

```ts
it('needs the token, allows the POST preflight, and says advisor off without a key', async () => {});
it('rejects bodies over 64 KB or failing the schema with 400', async () => {});
it('clamps to ±30 of the rules meter and caps at 66 with buy→wait when capAtWait', async () => {
  // model {meter: 95, recommendation: 'buy'}, rules meter 40, capAtWait → meter 66, 'wait', clamped true
});
it('returns 502 without details when Claude refuses or returns invalid JSON', async () => {});
it('sends no-store on every advisor response', async () => {});
```

- [ ] **Step 2: Run** `npx vitest run api`. Expected: FAIL.
- [ ] **Step 3: Implement.** Install with `npm i -E @anthropic-ai/sdk`.
- [ ] **Step 4: Run** the gate. Also live-check with `npm run dev`, but only if the owner has put an `ANTHROPIC_API_KEY` in `.env.local`; otherwise record that the live check waits for Task 11.
- [ ] **Step 5: Commit:** `feat: advisor route with structured answers and hard guards`

---

### Task 5: Client and buy actions

**Files:**
- Create: `src/services/advisor.ts`, `src/store/buyActions.ts`, `src/store/useBuy.ts`, plus tests

**Interfaces:**
- **`advisor.ts`:** `fetchAdvice(body)` and `fetchExtract(url)`, using the same base URL, token header, timeout (20 s for advice) and `MarketError` pattern as `market.ts`. Also `advisorAvailable(): boolean`, which is true when the price service is configured.
- **`createBuyActions(store, advisor)`:**
  - `ask(ask: BuyAsk): Promise<string /* decision id */>`
    - Validates: item 1–80 chars, price > 0 and ≤ 10,000,000 major units, quantity 1–99.
    - Runs `buildSnapshot` + `analyse` and saves the decision with the rules result.
    - When the advisor is available, calls it and updates `meter`/`verdict`/`confidence`/`ai`, and adds the advisor's `question` as the first debate turn.
    - On a failure it keeps the Basic check. It never throws for advisor problems.
  - `reply(id, text)`: adds your turn, calls the advisor with the debate, then adds the advisor's `reply` + `question` as a turn with its meter and updates the meter and verdict. Text is 1–500 chars. It returns `remember` (string or null) without saving it.
  - `remember(text)`: appends to About-you facts.
  - `forget(factId)`
  - `saveAbout(patch)`
  - `wait(id)`: sets status `waiting` and `remindOn` (rule from Calls #5).
  - `bought(id)`: sets status `bought` and `boughtOn` to today, and returns the Add Expense prefill `{ item, amount: price × quantity, category }`.
  - `skip(id)`
  - `rate(id, usage)`
  - `deleteDecision(id)`
- **`useBuy.ts`:** `useBuyActions()`, `useDecisions()` (newest first) and `useAboutYou()`.

- [ ] **Step 1: Write the failing tests** (real store via `freshRealStore`, fake advisor):
  - an ask saves a rules-only decision when the advisor is unavailable;
  - with the advisor, the AI meter, verdict and first question are saved;
  - an advisor failure keeps the Basic check;
  - a reply moves the meter and returns a remember offer without saving it;
  - `remember` and `forget`;
  - `wait` picks the limit reset date or +48 h;
  - `bought` returns the prefill;
  - validation messages;
  - the debate cap of 40.
- [ ] **Steps 2–5:**
  1. Watch the tests fail.
  2. Implement.
  3. Run the gate until it passes.
  4. Commit: `feat: buy actions with offline rules and the advisor`

---

### Task 6: Ask and answer screens, and the ways in

**Files:**
- Create in `src/features/buy/`: `BuyScreen.tsx` (list + Ask), `AskForm.tsx`, `AnswerScreen.tsx`, `BuyMeter.tsx`, plus tests
- Modify:
  - `src/app/routes.tsx` (`/buy`, `/buy/:id`)
  - `src/app/menu.ts` (Buy it? without `soon`; "Coming next" goes away)
  - `src/features/dashboard/HomeActions.tsx` (Buy it? replaces History)
  - `src/features/add/ExpenseForm.tsx` (the line `Haven't bought it yet? Ask first →`, linking to `/buy`)
  - the navigation tests and e2e

**What to build:**
- **Ask form** (wireframe phone 2, line fields and underline tabs):
  - `Paste a link (fills name and price)`: on paste or blur it calls `fetchExtract` and fills empty fields, showing `Couldn't read that link. Fill it in yourself.` on failure.
  - `What is it?`, `Price`, Quantity (a stepper, default 1), Category, `Pay with`, and `Why do you want it? (optional)`.
  - `Need · Want · Treat`; `How soon? Today · This month · No rush`.
  - The `Ask` button; the footnote `Only totals (not your transactions) leave the phone.`
- **Answer:**
  - **`BuyMeter`:** a horizontal gauge 0–100 with Skip/Wait/Buy zone labels and a marker. It shows `${meter}% a buy` large, has `role="meter"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` and an `aria-valuetext` like `38% a buy, Wait zone`, and animates the marker only under `motion-safe:`.
  - **The verdict line** (`Buy it` / `Wait a few days` / `Look for a cheaper one` / `Skip it`). Under it: `Budget check agrees` or `Budget check says ${rules verdict}`, then `· confidence ${level}`.
  - **The facts grid:**
    - `${Category} limit after ${pct}% · over by ${amount}`;
    - `Available after ${amount}`;
    - `Emergency fund ${before} → ${after} months`;
    - `${goal} goal +${days} days later`.
    Leave out a line whose fact is null.
  - **Guard reasons**, when `capAtWait`, in a warning `Banner`.
  - **The AI summary**, pros, cons and alternatives (collapsed under `Why`).
  - **The challenge:** `Before you decide, the advisor asks:` with the question and a `Reply…` field that opens the debate (Task 7).
  - **Without the AI:** the Basic check line and the no-debate line instead.
  - **Footer:** `Not financial advice`.
- **List:** past decisions, newest first, each showing item, price, meter %, verdict and status.

- [ ] **Steps 1–5:**
  1. Write tests:
     - the form's validation and link fill (stubbed);
     - the meter's ARIA and zone;
     - the verdict and budget-check wording;
     - facts lines left out when null;
     - the guard banner;
     - the Basic check path;
     - the Home action and Menu entry;
     - the Add Expense line.
     Watch them fail.
  2. Implement.
  3. Run the gate + e2e.
  4. Look at it at 375px, light and dark.
  5. Commit: `feat: ask whether to buy, with the buy meter`

---

### Task 7: Debate, remember and deciding

**Files:**
- Create: `src/features/buy/Debate.tsx`, plus tests
- Modify: `AnswerScreen.tsx`

**What to build** (wireframe phone 4):
- **The meter header:** `Buy meter: ${first}% → ${now}%`.
- **Turns:** advisor turns labelled `Advisor`, or `Advisor · meter ${n}%` when the turn moved the meter; your turns labelled `You`.
- **The reply field:** `Argue back…`, with Send.
- **Remember offer.** When a reply returns `remember`, show the chip `Remember: ${text}` with `Not now`. Tapping it saves the fact, and Not now dismisses it.
- **Deciding buttons:**
  - `Remind me ${formatDay(remindOn)}` → `wait`;
  - `I bought it` → `bought`, then navigate to `/add` with the prefill;
  - `Skip it` → `skip`.
- **Decided state.** After a decision the buttons are replaced by its status line: `Waiting until ${day}` / `Bought ${day}` / `Skipped`. A bought decision also gets a `Was it worth it?` 1–5 rating, shown once its reminder date has passed or when opened later.
- **Errors.** While replying, the advisor's errors show inline (`Couldn't reach the advisor. Try again.`) and keep the text.

- [ ] **Steps 1–5:**
  1. Write tests:
     - a reply adds both turns and moves the header;
     - Remember saves only on accept;
     - each decision button's effect, including the Add Expense prefill;
     - the rating;
     - the error keeps the typed text;
     - the debate is disabled without the advisor.
     Watch them fail.
  2. Implement.
  3. Run the gate + e2e.
  4. Look at it at 375px.
  5. Commit: `feat: debate the advisor, remember facts and decide`

---

### Task 8: About you

**Files:**
- Create: `src/features/buy/AboutYouScreen.tsx`, plus tests
- Modify: `routes.tsx` (`/about-you`), `menu.ts` (About you in "You", after Quests)

**What to build** (wireframe phone 5, line fields):
- Heading `About you`, intro `The advisor reads this every time you ask. Only you can change it.`
- Fields `Your situation`, `What matters to you` and `Where you tend to overspend`, saved on blur with a `Saved` status.
- `Remembered from your debates`: each fact with its date and `remove`.
- Footnote `Also uses your app data: income, spending by category, limits, savings, goals, debts, investments and dividends (totals only).`

- [ ] **Steps 1–5:**
  1. Write tests for save, remove and the 500/200 char limits with a message. Watch them fail.
  2. Implement.
  3. Run the gate.
  4. Commit: `feat: About you notes for the advisor`

---

### Task 9: Badges and reminders

**Files:**
- Modify in `src/domain/game/`: `types.ts`, `badges.ts`, `rules.ts`, plus their tests
- Modify: `src/domain/notifications.ts`, `src/features/settings/RemindersSection.tsx` (a `Buy it?` switch on `reminders.buyIt` from Task 2), quest labels and icons

**What to build:**
- **Badges** `smart-shopper`, `impulse-controller` and `budget-defender`, with the conditions and rewards from Calls #7. Budget Defender counts skipped decisions whose `facts.overBy > 0`.
- **Reminders** (kinds `buy-wait` and `buy-usage`, route `/buy/${id}`):
  - at 09:00 on `remindOn` for `waiting`: title `Still want it? ${item}`, body `You chose to wait. See what the advisor said.`;
  - at 09:00 14 days after `boughtOn` while `usage` is null: title `Was ${item} worth it?`, body `Rate it so the advisor learns what you use.`

- [ ] **Steps 1–5:**
  1. Write tests for each badge condition, both reminder kinds and the switch. Watch them fail.
  2. Implement.
  3. Run the gate.
  4. Commit: `feat: buy-it badges and reminders`

---

### Task 10: Demo and end to end

**Files:**
- Modify: `src/data/demoSeed.ts` (three decisions: one waiting with a debate, one bought and rated, one skipped over a limit; plus About-you notes), and its tests
- Create: `tests/e2e/buy.spec.ts`

**e2e** (mock `**/api/advisor` and `**/api/extract`):
1. From Home's Buy it?, ask about an item over the Fun limit. The meter, verdict and facts show, and the question appears.
2. Reply. The meter moves, Remember is offered and accepted, and About you lists the fact.
3. Choose I bought it. Add Expense opens prefilled.
4. With `/api/advisor` answering 503, ask again. The Basic check shows, and Skip still works.

- [ ] **Steps 1–5:**
  1. Write the demo tests and the e2e, and watch them fail.
  2. Implement.
  3. Run the gate + e2e.
  4. Commit: `test: buy-it end to end and demo decisions`

---

### Task 11: Turn the advisor on, then the phone (needs the owner)

- [ ] **Step 1: The owner's setup.**
  1. Create an Anthropic API key in the Anthropic Console.
  2. Run `npx vercel env add ANTHROPIC_API_KEY production`, pasting the key.
  3. Optionally run `npx vercel env add ANTHROPIC_MODEL production`.

  Controller rule: never print or handle the key.
- [ ] **Step 2: Deploy.** Run `npx vercel --prod` once the owner confirms. Then live-check `/api/advisor` with the token: one ask and one reply. Without the token, confirm the 401. With a crafted body, confirm `capAtWait` is honoured.
- [ ] **Step 3: Install** with `npm run android:run`, setting `JAVA_HOME` to `C:\Users\bhcco\.jdks\temurin-21.0.12.1` for that command.
- [ ] **Step 4: Checklist.**
  1. Ask about something real.
  2. Check the meter, verdict, facts and question.
  3. Reply and see the meter move.
  4. Remember a fact, and see it in About you.
  5. Remind me, then I bought it.
  6. In airplane mode, the Basic check shows.
- [ ] **Step 5: Commit** any fixes as `fix: on-device findings`.

---

## Milestone checkpoint (M6 done)

On the phone you can ask before you buy and get an honest, guarded verdict with a meter. You can argue with it, decide, and be reminded, and the app learns only what you allow. Next is M7: help, polish and the rest of the forms in the new style.
