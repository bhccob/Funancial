# Funancial — Design & Build Plan

## Context

The user wants **Funancial**, a gamified personal finance tracker, built from their detailed spec (Parts 1–12 of the request). It is a single-player "serious game" over their real money: expenses, salary (with freezes), subscriptions, limits, savings/goals, a stock/ETF portfolio with dividends and news, and a "Should I Buy It?" AI assistant. It wraps all of this in XP, levels, quests, streaks, badges and cosmetic coins. The folder `C:\Users\bhcco\Downloads\Funancial` is empty, so this is a greenfield build. At M0 the full original spec is saved verbatim to `docs/spec/original-spec.md` and this design to `docs/superpowers/specs/2026-10-14-funancial-design.md`. Those are the reference for entity, badge, quest and disclaimer lists.

**Decided by the user (2026-10-14)**

| Topic | Decision | Consequence |
|---|---|---|
| Audience | Just them | Personal tool. A Yahoo Finance proxy is acceptable. No accounts, light legal pages |
| Scope | Full MVP, phased | Ordered milestones, each one usable |
| AI | Claude + rules fallback | The rules engine always computes the numbers and a baseline verdict; Claude explains them and runs Debate Mode |
| Backend | Vercel | Stateless serverless functions in the same repo |
| Main device | **Android phone** | The phone holds the data. Desktop gets a copy from an encrypted backup (import replaces). No sync server |
| Reminders | Must arrive when the app is closed | Met by native Android local notifications, so no Web Push is needed |
| Payments | Mix of debit/cash and credit card | Card spending builds a card balance (a debt); a card payment clears it |

**Environment:** Windows 11, Node 24.14, npm 11.10, git. Not installed: Java, Android Studio/SDK, Vercel CLI. iOS is out of scope for now: no iPhone, no Mac. Capacitor keeps it addable later.

**Success:**
- Used daily on the Android phone.
- Logging takes about 5 seconds and feels rewarding.
- Every number traces to a rule in the Help Center.
- The assistant gives honest, non-preachy opinions.

**Anti-goals:**
- Shaming tone.
- Anything resembling trading or gambling.
- Coins with real-money value.
- Raw transactions leaving the device when aggregates suffice.
- Data loss.

## Calls I made (please check)
1. **Order:** the Android app comes right after the finance core (M3), so real use starts early and every later milestone ships to the phone.
2. **Credit cards** are a `Debt` of kind `credit_card` (limit, statement day, due day, pay-in-full flag).
   - A card expense counts toward limits at purchase time and raises the card balance, not cash.
   - "Pay card" moves cash to the card; it is a transfer, not an expense.
   - Available balance subtracts card balances due, as "upcoming bills".
3. **Available balance** = cash + savings − upcoming bills (subscriptions to month end + card balances due) − reserved limits.
   - Reserved limit = max(0, limit − spent) for limits marked "reserve". Off by default; suggested for rent and utilities.
4. **Periods:** calendar month; weeks start Monday (setting).
5. **Salary:**
   - Monthly salary plus a pay day. The app posts an "expected salary" entry on pay day, and the user confirms the actual amount (the Reconcile quest).
   - **Freeze:** the lost amount is either entered, or computed as monthly ÷ days-in-month × frozen days, pro-rated across months.
6. **Stock purchases:** reduce cash only when "paid from cash" is on, so existing holdings can be entered as-is. Excluded from limits unless opted in.
7. **Desktop copy:** shows a banner "Copy from {date} — changes here don't reach your phone".
8. **Game:**
   - 50 levels; the XP needed for level n ≈ 100·n^1.4.
   - Tiers every 10 levels: Bronze Saver 1–10, Silver Budgeter 11–20, Gold Planner 21–30, Platinum Investor 31–40, Diamond Master 41–50.
   - Logging XP is capped at 5 entries/day.
   - Badges are permanent once earned. XP from a deleted entry is reversed.
9. **Advisor:** model `claude-opus-5-5` (overridable by env var), with server-side refusal fallback enabled.

---

## Architecture

**Stack.** Vite + React 19 + TypeScript (strict) + Tailwind CSS v4. Also:
- React Router, Zustand, TanStack Query (persisted), Dexie, Web Crypto.
- Recharts, `motion`, zod, date-fns, vite-plugin-pwa.
- Capacitor plus `@capacitor-community/sqlite` (SQLCipher), a secure-storage plugin (Keystore), a biometric plugin, `@capacitor/local-notifications`, `@capacitor/filesystem` and `@capacitor/share`.

Tests: Vitest + Testing Library + Playwright. Versions are pinned exactly at scaffold time.

```
api/                    Vercel functions (Web-standard Request→Response)
  _lib/                 token check, CORS + OPTIONS, yahoo client (+ minor-unit currency fix, 429 backoff), ssrf-safe fetch
  quote.ts profile.ts dividends.ts news.ts fx.ts extract.ts advisor.ts
src/
  domain/               PURE TS, no React/IO. All money math. Fully unit-tested.
    money periods recurrence budget salary cards networth portfolio dividends goals notifications
    advisor/ (snapshot, rules, schema)   game/ (ledger, levels, quests, badges, streaks, challenges, shop)
  data/                 Repository interface; web adapter (Dexie + AES-GCM); native adapter (SQLCipher);
                        key management; schema + migrations; demo seed; encrypted backup/restore
  store/                Zustand slices: action → domain fn → repository → domain event
  events/               typed event bus → game engine
  platform/             adapters: Notifier, SecureKeyStore, Biometric, FileShare (web vs native)
  services/             api client (base URL + token), TanStack queries
  features/<screen>/    14 spec screens + Lock, Inbox, History, Shop
  components/ui/        primitives: Card, Sheet, ProgressRing, Tooltip, CoachMark, Toast, NumberField…
  content/help/         glossary, FAQ, how-it-works, legal; worked examples rendered from domain/
tests/e2e/
vite.config.ts          + dev-only plugin serving api/* locally (no Vercel login needed for dev)
vercel.json  capacitor.config.ts  android/
```

**Rules of the codebase**
1. **Money:** integer minor units everywhere. Shares are decimals (fractional allowed). Values are rounded to cents at the edges.
2. **The domain is pure.** UI and stores never do money arithmetic themselves.
3. **One source of truth for rules.** Each Part 4 rule has a domain function plus a worked example defined as data. Vitest asserts it, and the Help Center renders it.
4. **Local-first.** The backend is stateless. The only user data it receives is the advisor's aggregated snapshot and the purchase being asked about.
5. **Game state is derived.**
   - An append-only **XP/coin ledger** is keyed by `(source type, source id, rule)`. Level is derived from the ledger sum, and reversal is an offsetting entry.
   - Quest progress and streaks are recomputed from data by pure functions, not incremented counters.
   - Import/restore and deletes stay consistent automatically.
6. **Platform adapters** keep the web and native code paths separate and testable.

**Data model**
- **The 16 spec entities:** User, Income, Expense, Subscription, BudgetLimit, SalaryFreeze, Holding, Dividend, Transaction, Goal, Debt, Achievement, Quest, Streak, BuyDecision, NewsItem.
- **Additions:**
  - `Debt.kind` (loan | credit_card), plus card fields;
  - `Expense.paymentMethod` (cash | debit | credit_card + cardId | other);
  - `Transaction.type` gains `adjustment` (a "set actual balance" fix for cash and savings drift, excluded from limits and XP) and `card_payment`;
  - `LedgerEntry` (XP/coins);
  - `Holding`: cached profile (exchange, quoteType, sector, currency), `manualPrice`, `withholdingPct`;
  - `BuyDecision`: `rulesVerdict`, `aiVerdict`, `debate[]`, `status`, `usageRating`;
  - `Settings`;
  - `CosmeticUnlock`.

**Storage & security**
- **Web:**
  - A random AES-256-GCM data key encrypts each record. Rows are `{id, table, updatedAt, iv, ciphertext}`, decrypted into memory on unlock.
  - The data key is extractable but **always stored wrapped**. Without a PIN, a non-extractable device key in IndexedDB wraps it; with a PIN or passphrase, a PBKDF2-SHA-256 (600k) key wraps it. Setting or changing the PIN only re-wraps the key.
  - The app calls `navigator.storage.persist()`.
  - Help states honestly that a short PIN deters casual access but is not strong offline protection, and offers a passphrase instead.
- **Android:**
  - SQLCipher database. A random passphrase is kept in the Android Keystore through secure storage.
  - The app unlocks with biometric (BiometricPrompt), with PIN fallback, and locks on resume after an idle timeout.
- **Backups:**
  - Default: an **encrypted** `.funbak` file (passphrase → PBKDF2 → AES-GCM), shared through the Android share sheet to Drive or Files, or downloaded on web.
  - Plain JSON or CSV only on explicit request, with a warning.
  - Restore replaces all data.
  - A weekly backup reminder and a monthly "Back up your data" quest.
- **Delete all data:** a typed confirmation wipes the database and keys.

**Backend (Vercel)**
- **Auth:** a custom `X-Funancial-Token` header, deliberately not `Authorization`, so Vercel's CDN can still cache public market data.
  - 401 responses are `no-store`.
  - OPTIONS preflight is answered without the token.
  - CORS allows the production origin, `localhost`, `capacitor://localhost` and `https://localhost`.
- **Routes:**
  - `quote`: batched prices. s-maxage=60.
  - `profile`: per-symbol `quoteSummary` (sector, type, exchange, currency), fetched once when a holding is added and stored locally. ETFs show as "ETF (diversified)" in the sector chart.
  - `dividends`: rate, ex/pay dates, history to infer frequency. s-maxage=6h.
  - `news`: headline/source/url/publishedAt only. s-maxage=3600.
  - `fx`: s-maxage=1h.
  - `extract`: product name and price from OpenGraph or JSON-LD. SSRF-safe: http/https only, private IPs blocked, 5s timeout, 1MB cap.
  - `advisor`: no-store.
- **Yahoo hardening:**
  - Minor-unit currencies are normalized (GBp→GBP/100, ZAc, ILA).
  - Backoff on 429.
  - The client keeps the last known price with an "as of" time and supports a manual price override.
  - Expected dividends apply the holding's withholding %.
- **Client caching:** persisted TanStack Query, so the app works offline with the last data.
- **Deploy:** `npx vercel --prod` to the stable production domain (preview URLs sit behind Vercel's login wall). Redeploy after environment variable changes.

**"Should I Buy It?"**
1. **The client builds an aggregated snapshot:**
   - month and week spend vs limits;
   - available balance;
   - upcoming bills;
   - freeze status;
   - savings and emergency-fund months;
   - goals with deadlines;
   - debts and card balances;
   - dividend and investment income;
   - up to 10 similar past purchases with usage ratings.
   No notes and no transaction list.
2. **The rules engine** (offline) computes the facts:
   - spend after purchase;
   - category and overall limit status after;
   - overage;
   - available balance after;
   - emergency-fund months after;
   - goal delay in days;
   - `requiresDebt` (card/BNPL when cash + savings − bills < price, or a card that carries a balance).
   From these it produces the **rules verdict**: Buy / Wait / Cheaper alternative / Do not buy, with a confidence and a what-if sentence.
3. **`api/advisor` calls Claude** through `@anthropic-ai/sdk`:
   - beta messages surface with `server-side-fallback-2026-07-01`, `fallbacks: "default"`;
   - structured output via `output_config.format`, validated with zod;
   - effort `medium`, adaptive thinking;
   - `stop_reason` checked for refusal before the output is read.
   **Schema fields:** recommendation, confidence, summary, pros, cons, alternatives, coolingOffHours, debateReply.
   - These are narrative only. Every displayed figure comes from the rules engine.
   - The system prompt carries the guardrails: no licensed advice, never encourage debt or risky spending, transparent, non-manipulative, no shaming.
4. **Hard server guard:** if `requiresDebt`, or available balance after < 0, or (a want and emergency-fund months after < 1), the AI can't return "Buy". It is clamped to Wait or Cheaper, and the clamp is shown to the user.
5. **The UI** shows:
   - the AI recommendation as the headline;
   - the "Budget check" (rules verdict) beside it, with an explanation when the two disagree;
   - every number from the rules engine;
   - the "Not financial advice" disclaimer, always rendered by the UI.
6. **Debate Mode:** append-only turns stored on the BuyDecision. Each counterargument returns an updated recommendation.
7. **Follow-ups:**
   - Cooling-off ends with a native reminder: "Still want it?", with a re-check.
   - 14 days after "I bought it", a usage check-in (1–5).
8. **No key or offline:** the rules verdict only, labelled "basic analysis"; Debate Mode disabled.

**Notifications**
- The pure `domain/notifications.ts` derives every reminder type in Part 8 from state. Each milestone adds the types for its own features.
- **Android:**
  - Local notifications for the nearest ~60 reminders over the next 30 days, rescheduled on every data change and on resume.
  - The POST_NOTIFICATIONS permission is requested on Android 13+.
  - `allowWhileIdle` is used; exact alarms are not needed.
- **Web/desktop:** the in-app inbox, plus notifications while the app is open. No Web Push, since the phone covers closed-app reminders.
- **Market-move and news alerts** fire when a refresh (on open, every 15 min while visible, or manual) crosses the threshold set in Settings.
- The service worker is **not registered in native builds**.

**UI.**
- Mobile-first layout:
  - phone: bottom tabs (Home, Budget, Invest, Buy It?, Quests) plus a "More" sheet;
  - desktop: a sidebar.
- A quick-add button on every screen.
- Dark mode, WCAG AA contrast, and `prefers-reduced-motion` respected.
- Coach marks on the first visit to each major screen, and `?` tooltips on key numbers that link to the Help rule.
- **Demo mode** uses a separate database namespace with seeded fake data and a persistent "Demo money" banner. "Start with my real data" discards it and runs onboarding.

---

## Milestones (each ends with something to try)

**M0 — Foundation.**
- `git init`; scaffold, lint/format, Vitest, Playwright.
- App shell, routing, theme tokens, UI primitives.
- Save the spec and the design into `docs/`.
- **Checkpoint:** 2–3 visual directions for the Dashboard and shell, shown to the user; they pick one.

**M1 — Data & security.**
- Domain types, the Repository interface, the encrypted web adapter.
- PIN lock and auto-lock.
- Encrypted backup/restore, delete-all.
- Demo seed and demo mode.

**M2 — Finance core.**
- Domain modules, all with tests: money, periods, recurrence, budget, salary, cards, networth, goals.
- Screens:
  - Onboarding (welcome, disclaimer, try demo, currency, salary + pay day, cash, savings, cards, PIN);
  - Dashboard;
  - Add Expense/Income (payment method);
  - Budget & Limits (80/100/120; gentle/motivational/strict, where strict asks before going over);
  - Subscriptions (renewals, monthly total, audit flag);
  - Salary Freeze (impact preview);
  - Goals & Debts (including cards and "Pay card");
  - History;
  - "Set actual balance".

**M3 — Android app.**
- Capacitor Android.
- SQLCipher adapter plus Keystore, biometric unlock.
- Local-notification scheduler (reminder types from M2).
- Backup through the share sheet.
- HTTPS dev server for live reload.
- **User action:** install Android Studio and enable USB debugging on the phone. Real-data use on the phone starts here.

**M4 — Game layer.**
- Ledger, levels/tiers, quests (daily/weekly/monthly templates), the 4 streaks with coin-bought freeze tokens, the 12 badges, the 5 challenges.
- Coins and the cosmetic Shop.
- Quests & Achievements screen.
- XP and level-up micro-animations.

**M5 — Backend, investments, dividends, news.**
- `api/` routes plus the dev plugin.
- Investments: holdings CRUD, refresh, metrics, best/worst performers, pie charts by holding/type/sector.
- Dividends:
  - schedule and expected (net) income;
  - confirm payout to cash, savings, passive or reinvest;
  - dashboard: month/quarter/year totals, projection, yields, calendar, growth chart, top payers, streak.
- News tab and per-holding headlines (1h TTL).
- Dividend reminders and dividend badges.
- **User action:** create a Vercel account, run `npx vercel login`, set `FUNANCIAL_ACCESS_TOKEN`, then `npx vercel --prod`.

**M6 — Should I Buy It?**
- Snapshot and rules engine, with tests.
- `extract` and `advisor` routes.
- Entry form, analysis view, what-if, Debate Mode, history.
- Cooling-off and usage check-ins.
- Smart Shopper, Impulse Controller and Budget Defender badges.
- **User action:** add `ANTHROPIC_API_KEY` in Vercel and redeploy.

**M7 — Guidance & polish.**
- Help Center:
  - glossary;
  - worked examples from the domain;
  - how-it-works pages for freeze, dividends and the AI;
  - FAQ;
  - privacy, terms and the four disclaimers (not financial advice, market-data delay, AI, news).
- Interactive tutorial on demo data, coach marks, tooltips.
- Notification inbox.
- Profile & Settings.
- Accessibility pass.

**M8 — Desktop PWA.**
- Manifest and icons, Workbox app-shell precache, runtime caching.
- Offline banner, install and update prompts.
- Desktop copy banner and import flow.

**Deferred (out of MVP, by decision):** iOS build, Web Push, cloud sync, bank sync, the advanced items in the spec.

## Verification
- **Every milestone:**
  - `npm run typecheck && npm run lint && npm test` (Vitest; the domain at high coverage; every Part 4 rule has an asserted worked example);
  - `npm run test:e2e`;
  - a manual pass in the browser pane at 375px and desktop, light and dark.
- **Key e2e flows:**
  - onboarding → expense → 80% warning;
  - card expense raises the card balance → pay card;
  - freeze lowers expected income while bills remain;
  - demo → start real;
  - holding with mocked quotes → pie chart;
  - confirm dividend → XP + badge;
  - Buy It? with mocked advisor → verdict + debate turn;
  - guard clamps "Buy" when `requiresDebt`;
  - encrypted backup → delete → restore round-trip;
  - lock/unlock and PIN change.
- **API:** handler tests with mocked Yahoo and Anthropic. One live check per route once keys exist.
- **Android:** `npx cap run android` on the user's phone over USB. Check SQLCipher persistence across restarts, biometric unlock, and a reminder firing with the app closed.
- **PWA:** Lighthouse PWA and accessibility check; offline reload works.
