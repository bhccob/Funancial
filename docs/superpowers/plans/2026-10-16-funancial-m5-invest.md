# Funancial M5: Invest (backend, holdings, dividends, news) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Invest tab. You enter your stocks and ETFs, see live prices, portfolio value and allocation, track and confirm dividends, and read headlines for what you hold. Underneath is a small token-protected price service on Vercel, plus the investing badges, streak, challenge and reminders deferred from M4.

**Architecture:**
- **Price service.** Five stateless Vercel functions in `api/` turn Yahoo Finance into a stable JSON shape and cache it at the CDN. A Vite dev plugin serves the same handlers locally, so development needs no Vercel login.
- **Holdings data.** Holdings and confirmed dividends are encrypted records, like everything else. The last price, exchange rate and dividend schedule are stored on each holding, so Invest works offline with "as of" times.
- **Logic.** All money logic is pure and lives in `src/domain/portfolio.ts` and `src/domain/dividends.ts`. Network calls happen only in `src/services/market.ts`, called from a new `src/store/investActions.ts`.
- **Game.** Rewards plug into the existing derived game engine.

**Tech Stack:**
- React 19, TypeScript, Tailwind 4, zustand, zod 4, Vitest, Playwright, Capacitor.
- **New:** `yahoo-finance2`, used only by `api/` and never bundled into the app. Yahoo's quote, summary and dividend endpoints need a cookie and crumb handshake that this library maintains.
- Vercel for hosting.

**Spec:**
- `docs/superpowers/specs/2026-10-14-funancial-design.md`: the "Backend (Vercel)" section and M5.
- `docs/spec/original-spec.md`: Parts 3.6, 3.7, 3.9 and 8.
- `docs/superpowers/specs/2026-10-15-redesign-open-design.md`: the M5 navigation.
- The approved wireframe, `design/wireframes/m5-m6.html` (top row). Match its layout and copy unless this plan says otherwise.

## Calls this plan makes (for the owner's review)

1. **Cost basis is entered in your own currency.** It is what you actually paid, including fees and exchange. Gain equals today's value (converted to your currency) minus that amount. A holding's `currency` is only its trading currency, used to convert its price.
2. **Prices are stored as decimals, not cents.** Prices and per-share dividends are decimals in the holding's trading currency, because some trade at fractions of a cent. Every amount shown or added up is rounded to whole cents in your currency.
3. **"Paid from" decides whether money moves.** Adding a holding has a "Paid from" choice: Already owned (the default, nothing moves), Cash, or Savings. Cash and Savings record an `investment` transaction that lowers that balance.
4. **Expected dividends are worked out, never stored.** They come from Yahoo's next ex-date and pay date when it gives them, otherwise from the last 5 years of payouts: the typical gap sets the frequency, and the last amount is the amount.
   - You confirm a payout with the actual amount received, in your currency, into Cash, Savings, Passive or Reinvest. Reinvest buys fractional shares at the last price.
   - "Didn't get it" hides an expected payout.
5. **Best and worst use the all-time gain %.** The app has no price history for "this month", so this replaces the wireframe's "Best / worst this month".
6. **The net-worth trend line uses today's prices.** It counts each holding at today's value from its purchase date onward, because there is no price history.
7. **Navigation.** The bar becomes **Home · Budget · Invest · Menu**. Quests moves to the top of the Menu's "You" group, and Home's level ring still opens it. Dividends and News become tabs inside Invest, so their old routes go away. Buy it? stays "Soon".
8. **The service address and token are build settings.** `VITE_FUNANCIAL_API_URL` and `VITE_FUNANCIAL_API_TOKEN` live in a git-ignored `.env.local`. The address is empty in development, because the dev plugin serves `/api` on the same address. Without a token, Invest shows the last or manual prices and a note.
9. **Not built in M5** (named here so the gaps are visible):
   - market-move and news alerts;
   - counting investment purchases toward a limit (`includeInvestments` stays false);
   - "by region" allocation;
   - dividend-change announcements;
   - `fx` caching beyond the last rate on each holding.

## Global Constraints

- `yahoo-finance2` is imported only under `api/`. Nothing under `src/` may import it, and the app bundle must not contain it. No other new runtime dependency.
- **Price-service security.**
  - Every route except `OPTIONS` requires the header `X-Funancial-Token` equal to `process.env.FUNANCIAL_ACCESS_TOKEN`, compared in constant time.
  - A wrong or missing token gets `401 {"error":"unauthorized"}` with `Cache-Control: no-store`.
  - With no `FUNANCIAL_ACCESS_TOKEN` set, every request gets `500 {"error":"not configured"}`, `no-store`.
- **CORS.** Allowed origins: `http://localhost:5173`, `capacitor://localhost`, `https://localhost`, plus `process.env.FUNANCIAL_APP_ORIGIN` when set.
  - `OPTIONS` answers `204` with `Access-Control-Allow-Origin` (the matching origin), `Access-Control-Allow-Headers: X-Funancial-Token` and `Access-Control-Allow-Methods: GET, OPTIONS`.
- **Caching:** quote `s-maxage=60, stale-while-revalidate=60`; profile `s-maxage=86400`; dividends `s-maxage=21600`; news `s-maxage=3600`; fx `s-maxage=3600`; search `s-maxage=86400`; history `s-maxage=3600`. Errors are always `no-store`.
- **Bad input.** Symbols must match `/^[A-Za-z0-9.^=-]{1,15}$/`, at most 25 per request. Currencies are `/^[A-Z]{3}$/`. Anything else gets `400 {"error":"bad request"}`. When Yahoo fails, the reply is `502 {"error":"upstream"}`, with no stack trace or secret in the body.
- **Minor-unit currencies** are normalised on the server: `GBp` becomes `GBP` ÷ 100, `ZAc` becomes `ZAR` ÷ 100, `ILA` becomes `ILS` ÷ 100.
- **Money rules.** Derived money is always integer minor units of the profile currency, rounded once at the edge (`Math.round`). Shares, prices, exchange rates and per-share dividends are plain numbers. Money is formatted only through `useMoney()` / `formatMoney`, and dates only through `src/lib/format.ts`.
- **Exact copy:**
  - Holdings footer: `Prices delayed · not financial advice`.
  - News footer: `News data is for informational purposes only. Not financial advice.`
  - Without a token: `Live prices need the price service. Showing your last prices.`
  - The service unreachable: `Couldn't reach the price service. Showing your last prices.`
- **Style.** Use the Open style in `docs/design/visual-direction.md`: no boxes, 21px section titles, charts from `src/components/charts/` with slot colours by position. Touch targets at least 44px, labels on every action, motion only under `motion-safe:`.
- **Domain code stays pure**, with time passed in. Step through days with `addDays`.
- **Commits** end with your model's own `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>` trailer.
- **Every task runs** `npm test`, `npm run typecheck` (it must also cover `api/`) and `npm run lint`. Tasks that touch UI or e2e also run `npm run test:e2e`.

## Review Focus

1. **The price service unreachable, or no token set.** Invest still lists holdings with their last or manual price and "as of" time. It shows the exact note, and nothing crashes or spins forever. Pinned by Task 3 (actions with a failing or unconfigured service) and Task 4 (the screen's note).
2. **Foreign-currency and minor-unit holdings.**
   - A USD stock with a EUR profile is converted with the stored rate.
   - A `GBp` quote is normalised.
   - A holding whose rate is unknown is left out of totals and shown as `—` with `1 holding has no exchange rate yet`, never counted as if it were in euros.
   - Pinned by Task 1 (normalisation) and Task 2 (conversion and the missing rate).
3. **Fractional shares and odd prices.** For example 0.1234 shares at 0.0123 or at 4,321.5. They must round to whole cents with no floating-point drift in totals: the total equals the sum of the rounded values. Pinned by Task 2.
4. **Dividend double counting.**
   - Confirming a payout once removes it from "due".
   - An inferred schedule never re-shows a confirmed or skipped payout.
   - Editing the date when confirming doesn't reopen it.
   - Reinvest raises shares and cost basis without touching cash.
   - Pinned by Task 2 (matching by `holdingId` and `expectedPayDate`) and Task 3 (confirm and skip).
5. **Service hardening.**
   - No token or a wrong one gives 401 `no-store`.
   - The preflight succeeds without a token.
   - Bad symbols give 400, and 26 symbols give 400.
   - Yahoo throwing gives 502 with no detail.
   - Pinned by Task 1.

---

### Task 1: Price service (`api/`) and the dev plugin

**Files:**
- Create in `api/`: `_lib/http.ts`, `_lib/yahoo.ts`, `quote.ts`, `profile.ts`, `dividends.ts`, `news.ts`, `fx.ts`, `api.test.ts`
- Create: `vercel.json`, `.env.example`
- Modify: `vite.config.ts` (dev plugin), `package.json` (`yahoo-finance2`, pinned exact with `npm i -E yahoo-finance2`), the tsconfig and vitest config so `api/**/*.ts` is typechecked and tested in the node project, `.gitignore` (`.env.local`, `.vercel`)

**Interfaces.** Each route exports `GET(req: Request): Promise<Response>` and `OPTIONS(req: Request): Response`, in the Web-standard form Vercel Node functions accept. Every response body is JSON.

| Route | Response |
|---|---|
| `GET /api/quote?symbols=AAPL,VWRL.AS` | `{ quotes: Array<{ symbol, name, price, previousClose: number \| null, currency, type: 'stock'\|'etf'\|'other', exchange: string \| null, asOf: string }>, missing: string[] }` |
| `GET /api/profile?symbol=AAPL` | `{ symbol, name, type, exchange, currency, sector: string \| null }`. ETFs return `sector: null`. |
| `GET /api/dividends?symbol=KO` | `{ symbol, currency, history: Array<{ date: 'YYYY-MM-DD', amount: number }>, next: { exDate: string \| null, payDate: string \| null, amount: number \| null } }`. History covers the last 5 years, oldest first. |
| `GET /api/news?symbols=AAPL,KO` | `{ items: Array<{ symbol, title, publisher, url, publishedAt: string }> }`. At most 10 per symbol, de-duplicated by url, newest first. Only `http`/`https` urls. |
| `GET /api/fx?from=USD&to=EUR` | `{ from, to, rate: number, asOf: string }`. Identical currencies return rate 1 without calling Yahoo. |
| `GET /api/search?q=apple` | `{ results: Array<{ symbol, name, exchange: string \| null, type: 'stock' \| 'etf' }> }`. `q` is 1 to 40 letters, digits, spaces or `. & ' -`, else `400`. At most 8 results, stocks and ETFs only, de-duplicated by symbol, best match first. |
| `GET /api/history?symbol=AAPL&from=2025-03-03` | `{ symbol, currency, points: Array<{ date: 'YYYY-MM-DD', close: number }> }`. `from` is a real day, not after today, else `400`. Closes since `from`, oldest first, on the exchange's calendar day: daily for the last 92 days, weekly for 2 years, monthly beyond that. Minor-unit currencies are normalised like quotes. |

**Helpers:**
- `api/_lib/http.ts` exports:
  - `guard(req: Request): Response | null`, which handles the token and the not-configured case;
  - `json(req: Request, body: unknown, cacheControl: string, status = 200): Response`, which adds CORS for an allowed `Origin`;
  - `preflight(req: Request): Response`;
  - `parseSymbols(param: string | null): string[] | null`.
- `api/_lib/yahoo.ts` wraps `yahoo-finance2` and exports `normalise(price: number, currency: string): { price: number; currency: string }`, plus one function per route. It retries once on a 429 after 500ms.

**Dev plugin.** A Vite plugin, applied in `serve` mode only, handles `/api/<name>`. It loads `api/<name>.ts` with `server.ssrLoadModule`, builds a `Request` from the Node request, calls `GET` or `OPTIONS`, and streams back the `Response`. `FUNANCIAL_ACCESS_TOKEN` comes from `.env.local` through `loadEnv(mode, cwd, '')`.

**`vercel.json`:** `{ "functions": { "api/*.ts": { "maxDuration": 10 } } }`.

**`.env.example`** documents `FUNANCIAL_ACCESS_TOKEN=`, `FUNANCIAL_APP_ORIGIN=`, `VITE_FUNANCIAL_API_URL=` and `VITE_FUNANCIAL_API_TOKEN=`.

- [ ] **Step 1: Write the failing tests** (`api/api.test.ts`, with `vi.mock` on `./_lib/yahoo`)

```ts
it('rejects a missing or wrong token with 401 no-store', async () => {});
it('answers the preflight without a token, for an allowed origin only', () => {});
it('says not configured when FUNANCIAL_ACCESS_TOKEN is unset', async () => {});
it('rejects bad symbols and more than 25 with 400', async () => {});
it('returns quotes with the 60s cache header and lists missing symbols', async () => {});
it('normalises GBp, ZAc and ILA prices', () => {
  expect(normalise(1234, 'GBp')).toEqual({ price: 12.34, currency: 'GBP' });
});
it('returns 502 without details when Yahoo throws', async () => {});
it('keeps only http(s) news links, newest first, 10 per symbol', async () => {});
it('returns rate 1 for the same currency without calling Yahoo', async () => {});
```

- [ ] **Step 2: Run** `npx vitest run api`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, the routes and the plugin.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Live check.**
  1. Put any token in `.env.local`.
  2. Run `npm run dev`.
  3. Run `curl -H "X-Funancial-Token: <token>" "http://localhost:5173/api/quote?symbols=AAPL,VWRL.AS"`, and do the same for profile, dividends (KO), news and fx (USD→EUR).
  4. Record in the report that real data came back.
  5. If `yahoo-finance2` fails against Yahoo today, stop and report BLOCKED with the error. Don't hand-roll the crumb flow.
- [ ] **Step 6: Commit:** `feat: price service for quotes, profiles, dividends, news and fx`

---

### Task 2: Data model v5 and the portfolio and dividend maths

**Files:**
- Modify: `src/domain/entities.ts`, `snapshot.ts`, `migrations.ts`, `balances.ts`, `view.ts`, `charts.ts` (`netWorthOn`), `src/test/fixtures.ts`
- Create: `src/domain/portfolio.ts`, `src/domain/dividends.ts`, plus their tests

**Interfaces.**

Produces these entities. Both have the shared `base` fields, and their tables are `holding` and `dividend`, defaulting to `[]` in `SnapshotSchema`.

- **`HoldingSchema`:**
  - `symbol` (upper case), `name`;
  - `type: 'stock' | 'etf' | 'other'`, `exchange: string | null`, `sector: string | null`;
  - `currency` (`/^[A-Z]{3}$/`);
  - `shares: number > 0`, `costBasis` (Money ≥ 0, profile currency), `purchaseDate: LocalDate`;
  - `withholdingPct: number` from 0 to 100;
  - `manualPrice: number | null`;
  - `quote: { price: number; previousClose: number | null; fxRate: number | null; asOf: Iso } | null`;
  - `dividendInfo: { history: Array<{ date: LocalDate; amount: number }>; nextExDate: LocalDate | null; nextPayDate: LocalDate | null; nextAmount: number | null; fetchedAt: Iso } | null`;
  - `checkedAt: Iso | null`.
- **`DividendSchema`:**
  - `holdingId`, `symbol`, `expectedPayDate: LocalDate`, `paidOn: LocalDate`;
  - `status: 'confirmed' | 'skipped'`;
  - `amount` (Money ≥ 0, 0 when skipped);
  - `bucket: 'cash' | 'savings' | 'passive' | 'reinvest' | null` (null when skipped);
  - `sharesAdded: number | null`.

Also:
- `TransactionSchema.type` gains `'investment'`, which needs `from` and a positive amount.
- `ReminderSettings` gains `dividends: boolean`, default `true`.
- `CURRENT_SCHEMA_VERSION = 5`. Migration step 5 adds `reminders.dividends: true` to settings when it is missing.
- Fixtures: `makeHolding` and `makeDividend`.

**`src/domain/portfolio.ts`** produces:
- `holdingPrice(h): number | null`, giving `manualPrice ?? quote?.price ?? null`.
- `holdingValue(h, profileCurrency): number | null`, in minor units of the profile currency: `round(shares × price × rate × 10^minorDigits)`. The rate is `1` when `h.currency === profileCurrency`, else `quote?.fxRate`. It returns null when the price or rate is unknown.
- `type HoldingRow = { holding; value: number | null; gain: number | null; gainPct: number | null; dayChange: number | null }`.
- `portfolio(data, profileCurrency): { rows: HoldingRow[]; value: number; cost: number; gain: number; gainPct: number | null; dayChange: number; unpriced: number; best: HoldingRow | null; worst: HoldingRow | null }`.
  - Totals add up only rows with a value; `unpriced` counts the rest.
  - Best and worst use `gainPct`, among at least 2 priced rows.
  - `dayChange` is shares × (price − previousClose) × rate, using the quote only, not a manual price.
- `allocation(rows, by: 'holding' | 'type' | 'sector'): Slice[]`:
  - priced rows only, top 5 plus Other;
  - type labels `Stocks`, `ETFs`, `Other`;
  - sector labels are the sector, `ETF (diversified)` for ETFs, or `Unknown`.
  - The `Slice.key` type in `src/domain/charts.ts` widens to `string`; `'other'` still means Other.

**`src/domain/dividends.ts`** produces:
- `type ExpectedPayout = { holding; exDate: LocalDate | null; payDate: LocalDate; perShare: number; net: number | null }`. `net` is minor units of the profile currency after withholding, or null when the rate is unknown.
- `inferFrequency(history): 'monthly' | 'quarterly' | 'semiannual' | 'annual' | null`. It takes the median gap in days: ≤45 is monthly, ≤120 quarterly, ≤240 semiannual, ≤400 annual, anything else or fewer than 2 entries is null.
- `expectedPayouts(data, profileCurrency, from: LocalDate, to: LocalDate): ExpectedPayout[]`.
  - It uses `next*` when present. Otherwise it steps from the last history date by the frequency (1, 3, 6 or 12 months) with the last amount.
  - It leaves out any payout whose `(holding.id, payDate)` matches a `dividend` record's `(holdingId, expectedPayDate)`.
  - Results are sorted by `payDate`.
- `duePayouts(data, profileCurrency, today)`: expected payouts with `payDate <= today`, within the last 60 days.
- `dividendTotals(data, today): { month: number; quarter: number; year: number }`, confirmed amounts by `paidOn`, reinvested ones included.
- `projectedAnnual(data, profileCurrency, today): number`: the net of expected payouts over the next 365 days.
- `monthlyIncome(data, profileCurrency, today, dir: 'past' | 'next'): Array<{ month: 'YYYY-MM'; amount: number }>`, 12 months either way.
- `topPayers(data, profileCurrency, today, n = 3)`.

**Balances and net worth:**
- `bucketBalances` subtracts `investment` transactions from `from`, and adds confirmed dividends with a cash, savings or passive bucket on `paidOn`.
- `computeFinanceView` adds `investments: number`, the priced portfolio value, and `netWorth(buckets, debtTotal, investments)`.
- `netWorthOn(data, day)` adds the value of holdings with `purchaseDate <= day` at today's prices. Comment it: `shortcut: no price history, uses today's prices; upgrade when prices are stored by day`.

- [ ] **Step 1: Write the failing tests:**

```ts
it('values a USD holding in EUR with the stored rate and rounds once', () => {});
it('leaves a holding with no rate out of the totals and counts it as unpriced', () => {});
it('totals equal the sum of rounded row values for fractional shares and tiny prices', () => {
  // 0.1234 sh × 0.0123, 3.5 sh × 4321.5, 10 sh × 99.995 → value === sum of row values
});
it('uses a manual price over the quote, and skips day change for manual prices', () => {});
it('allocates by holding, type and sector with ETFs as "ETF (diversified)"', () => {});
it('infers quarterly from the history and steps the next payouts', () => {});
it('prefers Yahoo next dates, and drops payouts already confirmed or skipped', () => {});
it('applies withholding and the rate to the net amount', () => { /* 10 sh × 0.485 USD × 0.85 × 0.92 → 379 cents */ });
it('totals confirmed dividends by month, quarter and year, reinvest included', () => {});
it('lowers cash for an investment and raises the chosen bucket for a confirmed dividend', () => {});
it('adds investments to net worth and to the trend from each purchase date', () => {});
it('migrates v4 settings with reminders.dividends true and empty holding tables', () => {});
```

- [ ] **Step 2: Run** `npx vitest run src/domain`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: holdings and dividends data, portfolio and dividend maths`

---

### Task 3: Market client and invest actions

**Files:**
- Create: `src/services/market.ts`, `src/store/investActions.ts`, `src/store/useInvest.ts`, plus tests
- Create: `src/env.d.ts` (`ImportMetaEnv` with optional `VITE_FUNANCIAL_API_URL` and `VITE_FUNANCIAL_API_TOKEN`; tsconfig already loads `vite/client`)

**Interfaces.**

`src/services/market.ts` produces:
- `marketConfigured(): boolean`, which checks for a token.
- One fetcher per route: `fetchQuotes(symbols)`, `fetchProfile(symbol)`, `fetchDividends(symbol)`, `fetchNews(symbols)` and `fetchFx(from, to)`, typed to Task 1's response shapes.
- Each sends `X-Funancial-Token`, uses `${import.meta.env.VITE_FUNANCIAL_API_URL ?? ''}/api/...`, and times out with `AbortSignal.timeout(10_000)`.
- Each throws `MarketError` with the message `Couldn't reach the price service.`.
- `type Market = typeof` these fetchers.

`createInvestActions(store, market: Market)` produces:
- **`addHolding(input: { symbol; shares; costBasis; purchaseDate; paidFrom: 'owned' | 'cash' | 'savings'; withholdingPct; name?; type?; currency? })`:**
  - When configured, it looks up the profile for the name, type, exchange, currency and sector. A failed lookup needs `name` and `currency` from the input, or it throws `We couldn't find that symbol. Check it, or enter the name and currency yourself.`.
  - When `paidFrom` isn't `owned`, it also writes an `investment` transaction dated `purchaseDate`.
  - It refuses a future date.
- **`updateHolding(id, patch)`** and **`deleteHolding(id)`**. Delete keeps the holding's dividend records and transactions.
- **`refreshMarket(): Promise<'ok' | 'not configured' | 'failed'>`:**
  - quotes for every symbol;
  - the rate for each currency that differs from the profile's;
  - dividends for holdings whose `dividendInfo` is missing or older than 24 hours.
  - It writes everything with one `putMany`, keeps each holding's last values on failure, and never throws.
- **`confirmDividend(p: ExpectedPayout, input: { amount; paidOn; bucket })`:**
  - writes a `dividend` record with `expectedPayDate = p.payDate`;
  - for `reinvest`, also adds `sharesAdded = amount / (price × rate × 10^digits)` to the holding's shares and `amount` to its cost basis.
- **`skipDividend(p)`.**
- **`markChecked(id)`.**

`useInvest.ts` produces:
- `useInvestActions()`;
- `usePortfolio()`, memoised `portfolio(...)`;
- `useMarketRefresh()`, which refreshes on mount and on resume when the newest `quote.asOf` is older than 15 minutes. It exposes `{ status, refresh }`.

- [ ] **Step 1: Write the failing tests** (a real store via `freshRealStore`, with a fake `Market`):

```ts
it('adds a holding from the profile and records an investment when paid from cash', async () => {});
it('needs name and currency when the profile lookup fails', async () => {});
it('refreshes quotes, rates and stale dividend info in one write', async () => {});
it('keeps the last prices and returns "failed" when the service is down', async () => {});
it('returns "not configured" without a token and makes no request', async () => {});
it('confirms a payout once, into savings', async () => { /* duePayouts no longer lists it */ });
it('reinvests by adding fractional shares and cost basis, not cash', async () => {});
it('skips a payout so it is not due again', async () => {});
```

- [ ] **Step 2: Run** the focused tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: market client and invest actions`

---

### Task 4: Navigation and Invest · Holdings

**Files:**
- Modify: `src/app/menu.ts`, `BottomBar.tsx`, `Sidebar.tsx`, `routes.tsx`, `useMenuSubtitles.ts`, nav tests, `tests/e2e/navigation.spec.ts`, `src/features/dashboard/NetWorthSection.tsx`
- Create: `src/features/invest/InvestScreen.tsx`, `HoldingsTab.tsx`, `HoldingDialog.tsx`, `invest.test.tsx`

**Navigation:**
- The bar becomes Home, Budget, **Invest** (`/invest`, TrendingUp icon) and Menu.
- `MENU_GROUPS`:
  - **Quests** (`/quests`, Trophy, chip `#b86e00`) goes first in "You", with the subtitle `` `Level ${level}` ``.
  - "Coming next" keeps only Buy it?.
  - Invest, Dividends and News leave the Menu.
- The sidebar's primary links are Home, Budget and Invest.
- The `/dividends` and `/news` routes are removed.

**Invest screen:**
- Tabs `Holdings · Dividends · News` come from `?tab=`, defaulting to holdings. Dividends and News render placeholders until Task 5.
- It calls `useMarketRefresh()`.
- It has a `Refresh` button and an `as of {time}` line.
- It shows the not-configured or failed note from the global constraints.

**Holdings tab:**
- `Portfolio value` and the total.
- `` `▲ ${today} today · ▲ ${pct}% all time` ``, with ▼ and danger colour when negative.
- `By holding · By type · By sector` chips, a `Donut` and `DonutLegend` of `allocation(...)`.
- A row per holding, opening `HoldingDialog`: symbol · name, shares, and value with ▲/▼ gain %.
- When `unpriced > 0`: `` `${n} holding${n === 1 ? ' has' : 's have'} no exchange rate yet` ``.
- `Best: SYMBOL +x% · Worst: SYMBOL −y%`.
- A `+ Add a holding` button.
- The footer `Prices delayed · not financial advice`.
- Empty: `No investments yet` with `Add your first holding`.

**`HoldingDialog`** (add and edit):
- symbol;
- shares (fractional allowed);
- cost basis (MoneyField, profile currency, labelled `What you paid in total`);
- purchase date;
- `Paid from`: Already owned / Cash / Savings (add only);
- `Tax withheld on dividends (%)`, default 15;
- edit only: `Manual price` (empty means live), `Mark as checked`, `Delete`.
- When the service isn't configured or the lookup fails, it shows Name, Type and Currency fields.

**Home:** the net-worth legend adds `` `Investments ${…}` `` in chart-2 when the value is above 0.

- [ ] **Step 1: Write the failing tests:**

```tsx
it('shows Home, Budget, Invest and Menu in the bar, and Quests first in the Menu', () => {});
it('opens the tab from ?tab= and switches tabs', async () => {});
it('shows value, today and all-time change, allocation chips and rows', () => {});
it('shows the not-configured note with the last prices and as-of time', () => {});
it('flags holdings without an exchange rate', () => {});
it('adds a holding, with name and currency fields when the lookup fails', async () => {});
it('edits a manual price and marks a holding checked', async () => {});
it('adds Investments to the Home net-worth legend', () => {});
```

  Update e2e navigation: the Menu path to Settings is unchanged, the desktop sidebar test clicks `Invest`, and the bar has four items.
- [ ] **Step 2: Run** the focused tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Look at it** in the dev server at 375px and desktop, light and dark, with a fake token so the dev plugin serves real quotes. Note the result in the report.
- [ ] **Step 6: Commit:** `feat: Invest tab with holdings, and the bar with Invest`

---

### Task 5: Invest · Dividends and News

**Files:**
- Create in `src/features/invest/`: `DividendsTab.tsx`, `ConfirmDividendDialog.tsx`, `NewsTab.tsx`
- Modify: `invest.test.tsx`

**Dividends tab** (wireframe copy):
- **Figures:** `This month`, `This year` (`dividendTotals`), `Next 12 months` (`~` plus `projectedAnnual`), and `Yield` (projected annual ÷ portfolio value, one decimal, `—` when the value is 0).
- **Chart:** a `DayBars` chart with `Next 12 months | Last 12 months` toggles (`monthlyIncome`). Labels are `formatMonthShort`, and the current month counts as "today".
- **Due:** each `duePayouts` row reads `` `${symbol} · paid ${formatDay(payDate)}` `` with the net, and two buttons:
  - `Confirm` opens `ConfirmDividendDialog`: Amount received (prefilled with the net), Date (prefilled with the pay date), and `Where did it go?` (Cash / Savings / Passive / Reinvest).
  - `Didn't get it` skips it.
- **Coming up:** the next 60 days of `expectedPayouts`. Each row reads `` `${symbol} · pays ${formatDay(payDate)}` `` with `` `ex-date ${…} · after ${withholdingPct}% tax` `` and the net. An unknown rate shows `—`.
- **Below:** `Top payers` and the `Dividend streak` from Task 6 (`n months`; hidden until Task 6 exists).
- **Empty:** `No dividends yet. Holdings that pay dividends show up here.`

**News tab:**
- Chips `All` plus one per symbol.
- `fetchNews(symbols)` is cached in memory for 1 hour per symbol set.
- Each row shows the title, then `` `${symbol} · ${publisher} · ${relative time}` ``, and is a link (`target="_blank"`, `rel="noopener noreferrer"`).
- The footer reads `News data is for informational purposes only. Not financial advice.`
- Not configured or failed: `News needs the price service.` / `Couldn't load news right now.`
- Empty: `No headlines for your holdings right now.`

- [ ] **Step 1: Write the failing tests:**

```tsx
it('shows month, year, next-12-months and yield figures', () => {});
it('toggles the income bars between next and last 12 months', async () => {});
it('confirms a due payout into reinvest and it leaves the list', async () => {});
it('skips a due payout', async () => {});
it('lists coming payouts with ex-date and tax', () => {});
it('filters news by holding, links out safely and shows the disclaimer', async () => {});
it('explains when news is unavailable', () => {});
```

- [ ] **Step 2 to 4:** run the tests and watch them fail, implement, then run `npm test && npm run typecheck && npm run lint && npm run test:e2e` until everything passes. Look at the screen in the dev server at 375px.
- [ ] **Step 5: Commit:** `feat: dividends and news in Invest`

---

### Task 6: Investing in the game, and dividend reminders

**Files:**
- Modify in `src/domain/game/`: `types.ts`, `rules.ts`, `badges.ts`, `streaks.ts`, `quests.ts`, `challenges.ts`, `activity.ts`, and the related tests.
- Modify: `src/domain/notifications.ts`, `src/features/settings/RemindersSection.tsx`, `src/features/quests/*` (labels and icons for the new items), and `DividendsTab.tsx` (the streak line).

**Values:**
- **Badges**, appended to `BADGES` in this order:

  | id | name | description | condition | reward (xp/coins) |
  |---|---|---|---|---|
  | `first-etf` | `First ETF` | `Add an ETF to your portfolio.` | a holding with type `etf` | 100/25 |
  | `portfolio-pro` | `Portfolio Pro` | `Hold five or more investments.` | 5 or more holdings | 150/40 |
  | `first-dividend` | `First Dividend` | `Confirm your first dividend.` | a confirmed dividend | 100/25 |
  | `dividend-collector` | `Dividend Collector` | `Confirm 12 dividends.` | 12 or more confirmed | 150/40 |
  | `passive-income-pro` | `Passive Income Pro` | `Collect 100 in dividends in one month.` | confirmed amounts in one calendar month ≥ `100 × 10^minorDigits(currency)` | 200/50 |

- **Streak `dividend`** (title `Dividend streak`, unit `month`):
  - it counts calendar months in a row with at least one confirmed dividend, by `paidOn`;
  - the current month counts if it has one, otherwise the run ends last month;
  - it is active only with at least one holding;
  - it has no tokens;
  - milestones are at 3 (60/15), 6 (150/40) and 12 (400/100).
- **Quest `month-dividends`** (`Confirm this month's dividends`, 80/20):
  - it shows when this month has at least one expected payout due, or a dividend record with an `expectedPayDate` this month;
  - it is done when none of this month's due payouts is left and at least one was confirmed or skipped;
  - its progress is handled out of due-plus-handled.
- **Challenge `portfolio-checkup`** (`Portfolio Check-Up`, `Check every holding within 7 days.`, 120/30):
  - its requirement is `Add a holding first.`;
  - it is won when every holding has `checkedAt >= createdAt` and its local day is on or before `end`;
  - otherwise it is lost after `end`.
- **Logging XP:** confirmed dividends count as logged entries (`log:dividend:<id>`, `Logged a dividend`) inside the existing 5-a-day cap.
- **Reminders** (when `reminders.dividends` is on), from `expectedPayouts` over the reminder horizon:
  - on the ex-date minus one day at 09:00: title `` `${symbol} goes ex-dividend tomorrow` ``, body `Hold your shares through today to get the next payout.`, route `/invest?tab=dividends`, kind `dividend-ex`;
  - on the pay date at 09:00: title `` `${symbol} pays a dividend today` ``, body `` `Expected about ${amount}. Confirm it when it arrives.` ``, route `/invest?tab=dividends`, kind `dividend-pay`.
  - RemindersSection adds a `Dividends` switch.

- [ ] **Step 1: Write the failing tests:** one per badge condition; the dividend streak (with a gap and with the current month); the quest showing and completing; the challenge won, lost and its requirement; dividend logging XP and its cap; both reminder kinds, and the switch turning them off.
- [ ] **Step 2 to 4:** run the tests and watch them fail, implement, then run `npm test && npm run typecheck && npm run lint` until everything passes.
- [ ] **Step 5: Commit:** `feat: investing badges, dividend streak, quest, challenge and reminders`

---

### Task 7: Demo data and end-to-end

**Files:**
- Modify: `src/data/demoSeed.ts`, plus its tests
- Create: `tests/e2e/invest.spec.ts`

**Demo data.** Four holdings, each with a stored `quote` (rate set) and `dividendInfo`, so demo Invest works with no service:
- VWRL (ETF, EUR);
- AAPL (stock, USD);
- KO (stock, USD, quarterly history);
- ASML (stock, EUR).

There are two confirmed KO dividends, one into Passive and one reinvested, and an `investment` transaction for one holding. Use values that look plausible and are fixed.

**e2e** (`page.route('**/api/**', …)` fulfils mocked JSON):
1. Onboard, then add a holding with a mocked profile and quote. The Holdings tab shows its value, and the allocation donut has a slice.
2. With demo money, Invest shows Dividends, and confirming a due payout shows the reward toast and earns `First Dividend`.
3. With no token, Invest shows `Live prices need the price service. Showing your last prices.`

- [ ] **Step 1 to 4:** write the demo tests and the e2e, watch them fail, implement, then run `npm test && npm run typecheck && npm run lint && npm run test:e2e` until everything passes.
- [ ] **Step 5: Commit:** `test: invest end to end and demo holdings`

---

### Task 8: Deploy the price service, then on the phone (needs the owner)

**Files:** none, unless something breaks. Any fix gets a failing test first.

- [ ] **Step 1: The owner's one-time setup**, at the owner's keyboard:
  1. Create a free Vercel account.
  2. Run `npx vercel login` and `npx vercel link`.
  3. Generate a token with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
  4. Run `npx vercel env add FUNANCIAL_ACCESS_TOKEN production`.
  5. Run `npx vercel --prod`, and note the production URL.
- [ ] **Step 2: `.env.local`.** Set `VITE_FUNANCIAL_API_URL=<production URL>`, `VITE_FUNANCIAL_API_TOKEN=<same token>` and `FUNANCIAL_ACCESS_TOKEN=<same token>`. The file is git-ignored.
- [ ] **Step 3: Live check** against production for each route with curl. Also confirm a request without the token gets 401.
- [ ] **Step 4: Install** with `npm run android:run`, setting `JAVA_HOME` to `C:\Users\bhcco\.jdks\temurin-21.0.12.1` for that command.
- [ ] **Step 5: Checklist.** Record each item in the ledger:
  1. Add a real holding; its price and value appear.
  2. The allocation chips switch.
  3. Dividends shows the expected payouts.
  4. News loads and opens in the browser.
  5. In airplane mode, the last prices show with the note.
  6. The bar reads Home · Budget · Invest · Menu, and Quests is in the Menu.
- [ ] **Step 6: Commit** any fixes as `fix: on-device findings`.

---

## Milestone checkpoint (M5 done)

On the phone, Invest shows your real holdings with live, cached and manual prices:
- portfolio value, gain and allocation;
- expected and confirmed dividends flowing into your balances and net worth;
- headlines for what you hold.

The investing badges, streak, quest, challenge and reminders all work.

**Next:** M6, "Should I buy it?", with the buy meter, debate and About you. It starts with its wireframe, already approved.
