# Funancial M0 + M1 (Foundation, Data & Security) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running, tested app shell for Funancial with every screen routed, a chosen visual direction, and a local-first encrypted data layer: PIN/passphrase lock, auto-lock, demo mode, encrypted backup/restore, delete-all.

**Architecture:** Vite + React SPA. Pure domain schemas (zod) define every stored entity. A `Repository` interface hides storage. The web adapter keeps each record AES-GCM-encrypted in one Dexie table, and a key vault wraps the data key with a device key or a PIN/passphrase key. A zustand store owns the session lifecycle (boot → welcome/locked → unlocked) and exposes generic CRUD that M2 builds on.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, React Router 8, zustand 5, Dexie 4, zod 4, Web Crypto, Vitest 5, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-funancial-design.md` (approved design). Product spec: `docs/spec/original-spec.md`.

## Global Constraints

- Node 24 (engines `>=22.12`). npm only. Every dependency is pinned **exactly** (no `^`/`~`):
  - **Runtime:** react 19.3.0, react-dom 19.3.0, react-router 8.4.0, zustand 5.0.15, dexie 4.4.6, zod 4.6.7, date-fns 4.4.0, motion 14.2.0, lucide-react 1.57.0.
  - **Dev:**
    - build and styling: vite 8.3.4, @vitejs/plugin-react 6.1.2, typescript 6.0.3, tailwindcss 4.3.3, @tailwindcss/vite 4.3.3, @types/react 19.3.0, @types/react-dom 19.3.0, @types/node (latest 24.x);
    - testing: vitest 5.0.4, @vitest/coverage-v8 5.0.4, jsdom 30.1.2, fake-indexeddb 6.2.5, @testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1, @testing-library/user-event 14.6.8, @playwright/test 1.64.1;
    - lint and format: eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.2, eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.7, globals 17.13.0, prettier 3.9.10, prettier-plugin-tailwindcss 0.8.1.
- TypeScript **6.0.3, not 7.x**: typescript-eslint 8.71.2 peers on `typescript <6.1.0`. Use `strict: true` and `noUncheckedIndexedAccess: true`. ESLint forbids `any` (`@typescript-eslint/no-explicit-any: error`).
- Import alias `@/` → `src/` (tsconfig `paths` + Vite `resolve.alias`). No `baseUrl` (deprecated in TS 6).
- **Money:** totals are **integer minor units** (cents); zod enforces `.int()`. Per-unit prices, dividends per share and FX rates are decimals, and become relevant in M5.
- **Dates:**
  - calendar dates are `LocalDate` strings `YYYY-MM-DD`, validated as real dates;
  - timestamps are ISO-8601 UTC strings.
- **Nothing loads from a CDN at runtime:** fonts via `@fontsource*` packages, icons via lucide-react. The app must work offline and inside Capacitor later.
- Every `localStorage` access goes through `src/lib/safeStorage.ts`, never directly.
- **Crypto:**
  - records: AES-GCM 256, a fresh random 12-byte IV per encryption, AAD = `` `${table}:${id}` ``;
  - key wrapping: AES-KW 256;
  - PIN/passphrase keys: PBKDF2-SHA-256, **600,000** iterations, 16-byte random salt. Tests may pass lower iterations through options; production code never does.
- **Secrets:** PIN = 4–8 digits; passphrase = at least 8 characters; backup passphrase = at least 8 characters.
- **Copy:** American English, plain and friendly, never shaming.
- **Accessibility:** every input has a label, focus is visible on every interactive element, everything is keyboard-operable, and colors meet WCAG AA contrast.
- **Commits:** one per task, conventional style (`feat:`, `chore:`, `test:`), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Scope:** only M0+M1 entities are defined here: profile, settings, income, expense, subscription, budgetLimit, salaryFreeze, transaction, goal, debt.
  - Investment, game and AI entities arrive in M4–M6 as new tables.
  - The generic encrypted `records` store means adding a table needs no Dexie migration.
  - This is a deliberate narrowing of the design's "all 16 entities in M1".

## Review Focus

1. **Corrupted, truncated or newer-version backup file:** restore fails with a clear message and the existing data is untouched. Test in Task 8 + Task 10.
2. **Repeated wrong PIN:** shows an error and clears the input. After 5 consecutive failures, unlock refuses for 30 s and shows the countdown. Data is never at risk. Test in Task 10 + Task 11.
3. **Storage unavailable** (IndexedDB blocked, private mode, `localStorage` throws): an explanatory screen, not a blank page. Test in Task 10 + Task 11.
4. **Two tabs open:** when one tab sets a PIN, restores, deletes or leaves demo, the other reloads instead of writing stale data. Test in Task 10 + Task 12 (e2e).
5. **Leaving demo** ("Start with my real data") deletes only the demo database and never touches real data. Test in Task 7 + Task 10.

---

## File map

```
package.json  tsconfig.json  tsconfig.node.json  vite.config.ts  vitest.config.ts  playwright.config.ts
eslint.config.js  .prettierrc.json  .gitignore  index.html  README.md
docs/spec/original-spec.md                         verbatim product spec (from the conversation)
docs/superpowers/specs/2026-10-14-funancial-design.md   copy of the approved design
docs/design/visual-direction.md                    chosen direction + token values (Task 2)
design/directions/{a,b,c}.html                     throwaway mockups (Task 2)
src/main.tsx                                       mount, theme init, cross-tab reload listener
src/app/Root.tsx                                   phase switch (booting/unavailable/welcome/locked/unlocked)
src/app/routes.ts  src/app/router.tsx              route table + router
src/app/AppShell.tsx BottomTabs.tsx Sidebar.tsx MoreSheet.tsx QuickAddButton.tsx DemoBanner.tsx NotFound.tsx
src/components/ui/Button.tsx Card.tsx TextField.tsx Dialog.tsx Banner.tsx
src/styles/tokens.css  src/styles/index.css
src/lib/cn.ts safeStorage.ts theme.ts broadcast.ts download.ts
src/domain/dates.ts entities.ts snapshot.ts ids.ts
src/data/crypto.ts keys.ts meta.ts db.ts repository.ts webRepository.ts backup.ts demoSeed.ts
src/store/appStore.ts  src/store/AppStoreProvider.tsx
src/features/placeholder/PlaceholderScreen.tsx
src/features/welcome/WelcomeScreen.tsx
src/features/lock/LockScreen.tsx PinPad.tsx useAutoLock.ts
src/features/system/StorageUnavailable.tsx BootSplash.tsx
src/features/settings/SettingsScreen.tsx SecuritySection.tsx DataSection.tsx SecretDialog.tsx
src/test/setup.ts  src/test/fixtures.ts
tests/e2e/smoke.spec.ts navigation.spec.ts demo.spec.ts security.spec.ts backup.spec.ts
```

Tests sit next to their source as `*.test.ts(x)`. Vitest runs two projects:
- **`unit`** (environment `node`, setup imports `fake-indexeddb/auto`): `src/{domain,data,store,lib}/**/*.test.ts`.
- **`ui`** (environment `jsdom`, setup imports `@testing-library/jest-dom/vitest` and polyfills `HTMLDialogElement.prototype.showModal/close`): `src/**/*.test.tsx`.

---

## M0 — Foundation

### Task 1: Scaffold, tooling, docs

**Files:**
- Create: the root config files above, `index.html`, `src/main.tsx`, `src/app/Root.tsx` (temporary: renders `<h1>Funancial</h1>`), `src/styles/index.css` (`@import "tailwindcss";`), `src/test/setup.ts`, `src/app/Root.test.tsx`, `tests/e2e/smoke.spec.ts`, `README.md`, `.gitignore` (node_modules, dist, coverage, test-results, playwright-report, `.vercel`, `*.funbak`).
- Create: `docs/spec/original-spec.md`, a verbatim copy of the user's spec Parts 1–12 from the planning conversation.
- Create: `docs/superpowers/specs/2026-10-14-funancial-design.md`, a copy of `C:\Users\bhcco\.claude\plans\c-users-bhcco-downloads-game-developer-compressed-hamster.md`.

**Interfaces:**
- Produces these npm scripts:
  - `dev`: vite
  - `build`: `tsc -b && vite build`
  - `typecheck`: `tsc -b`
  - `lint`: `eslint .`
  - `format`: `prettier --write .`
  - `test`: `vitest run`
  - `test:watch`: vitest
  - `test:e2e`: `playwright test`
  - `preview`: `vite preview --port 4173`
- Playwright config:
  - `webServer` = `npm run build && npm run preview`, `baseURL http://localhost:4173`;
  - projects `mobile-chromium` (viewport 375×812) and `desktop-chromium` (1280×800);
  - downloads accepted.

- [ ] **Step 1: `git init`, write `.gitignore`, the docs copies and all config files. Then `npm install` with the exact versions from Global Constraints (`npm install --save-exact ...`), and `npx playwright install chromium`.**
- [ ] **Step 2: Write the failing tests**

```tsx
// src/app/Root.test.tsx
it('renders the app name', () => {
  render(<Root />);
  expect(screen.getByRole('heading', { name: 'Funancial' })).toBeInTheDocument();
});
```
```ts
// tests/e2e/smoke.spec.ts
test('app loads with title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Funancial');
});
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL (Root not found).
- [ ] **Step 4: Implement `Root`, `main.tsx` and `index.html`** (`<title>Funancial</title>`, `lang="en"`, viewport meta with `viewport-fit=cover`).
- [ ] **Step 5: Run `npm run typecheck && npm run lint && npm test && npm run test:e2e`.** Expected: all pass, 2 e2e tests (one per project).
- [ ] **Step 6: Commit** `chore: scaffold Funancial (vite, react, ts, tailwind, vitest, playwright) and add spec docs`.

### Task 2: Visual direction checkpoint (needs the user)

**Files:**
- Create: `design/directions/a.html`, `b.html`, `c.html`. Each is self-contained (inline CSS, system fonts allowed here only) with a 375px-wide phone frame.
- Create: `docs/design/visual-direction.md`.

**Interfaces:**
- Produces the token values for the names fixed in Task 3, and the font choice (an `@fontsource` package name).

- [ ] **Step 1: Load a design skill** (`ui-ux-pro-max`, or `design-taste-frontend`) for palette, type and layout guidance. The tone: playful, clean, motivating, trustworthy.
- [ ] **Step 2: Build three distinctly different directions of the same Dashboard**, each with demo numbers.
  - **Content:**
    - header with level badge and XP bar;
    - available balance and net worth;
    - two limit-progress bars, one at 85% (warning state);
    - streak chip;
    - quick actions (Add expense, Should I buy it?);
    - bottom tabs (Home, Budget, Invest, Buy It?, Quests) and a quick-add button.
  - **Variants:** each file shows light and dark side by side.
  - **Directions:**
    - A: "calm fintech": neutral, one accent;
    - B: "playful game": bold color, chunky rounded cards;
    - C: "cozy RPG": warm palette, subtle texture, pixel-ish iconography accents.
- [ ] **Step 3: Send all three with `SendUserFile` (`display: render`) and ask the user to pick one (or mix) with AskUserQuestion. Wait for the answer.**
- [ ] **Step 4: Write `docs/design/visual-direction.md`:**
  - the chosen direction;
  - a light and a dark value for every token in Task 3;
  - the font package(s);
  - corner radii;
  - rules for using the accent color.
- [ ] **Step 5: Commit** `docs: record chosen visual direction`.

### Task 3: Theme tokens & UI primitives

**Files:**
- Create: `src/styles/tokens.css`, `src/lib/cn.ts`, `src/lib/safeStorage.ts`, `src/lib/theme.ts`, `src/components/ui/{Button,Card,TextField,Dialog,Banner}.tsx`.
- Create tests: `src/lib/theme.test.ts`, `src/lib/safeStorage.test.ts`, `src/components/ui/ui.test.tsx`.
- Modify: `src/styles/index.css` (import tokens and font; `@theme inline` maps tokens to Tailwind colors; `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`), `src/main.tsx` (`initTheme()` before render).

**Interfaces:**
- **Tokens:** CSS custom properties on `:root[data-theme=light]` and `:root[data-theme=dark]`.
  - colors: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-primary`, `--color-primary-contrast`, `--color-xp`, `--color-success`, `--color-warning`, `--color-danger`, `--color-focus`;
  - radii: `--radius-sm/md/lg`;
  - fonts: `--font-sans`, `--font-display`.
  - Mapped utilities: `bg-bg`, `bg-surface`, `bg-surface-2`, `text-text`, `text-muted`, `border-border`, `bg-primary`, `text-primary-contrast`, `bg-xp`, `text-success/warning/danger`, `ring-focus`.
- **`safeStorage`:** `get(key: string): string | null`, `set(key: string, value: string): boolean`, `remove(key: string): void`. Never throws.
- **Theme:** `type ThemePreference = 'system' | 'light' | 'dark'`.
  - `getThemePreference(): ThemePreference` (storage key `funancial.theme`, default `'system'`);
  - `setThemePreference(p): void`;
  - `resolveTheme(p, prefersDark: boolean): 'light' | 'dark'`;
  - `initTheme(): () => void` sets `document.documentElement.dataset.theme`, listens to `prefers-color-scheme`, and returns an unsubscribe.
- **`cn(...classes: Array<string | false | null | undefined>): string`.**
- **Components:**
  - `Button`: `variant: 'primary' | 'secondary' | 'ghost' | 'danger'` (default primary), `size: 'sm' | 'md' | 'lg'` (default md), plus native button props; `type` defaults to `"button"`.
  - `Card`: `as?: 'section' | 'div' | 'article'`, plus children/className.
  - `TextField`: `label: string`, `hint?: string`, `error?: string`, plus input props. Generates an id with `useId`, sets `aria-invalid` and `aria-describedby`.
  - `Dialog`: `open: boolean`, `title: string`, `description?: string`, `onClose(): void`, `children`, `actions?: ReactNode`. Built on native `<dialog>` with `showModal()`; Escape calls `onClose`; labelled by its title.
  - `Banner`: `tone: 'info' | 'warning' | 'danger' | 'demo'`, `children`, `action?: ReactNode`; `role="status"` (danger uses `role="alert"`).

- [ ] **Step 1: Write the failing tests**

```ts
// theme.test.ts
expect(resolveTheme('system', true)).toBe('dark');
expect(resolveTheme('light', true)).toBe('light');
// localStorage.getItem throwing → getThemePreference() === 'system'
// safeStorage.test.ts: setItem throwing → safeStorage.set('k','v') === false; getItem throwing → get('k') === null
```
```tsx
// ui.test.tsx
it('TextField links label, hint and error', () => {
  render(<TextField label="PIN" hint="4 to 8 digits" error="Too short" />);
  const input = screen.getByLabelText('PIN');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(/4 to 8 digits.*Too short/);
});
it('Dialog closes on Escape', async () => { /* open → keyboard('{Escape}') → onClose called once */ });
it('Button defaults to type=button', () => { /* expect attribute type="button" */ });
it('danger Banner is an alert', () => { /* getByRole('alert') */ });
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement tokens (values from `docs/design/visual-direction.md`), the libs and the components.**
- [ ] **Step 4: Run `npm test && npm run lint && npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: theme tokens, dark mode, and UI primitives`.

### Task 4: App shell & routing

**Files:**
- Create: `src/app/routes.ts`, `router.tsx`, `AppShell.tsx`, `BottomTabs.tsx`, `Sidebar.tsx`, `MoreSheet.tsx`, `QuickAddButton.tsx`, `NotFound.tsx`, `src/features/placeholder/PlaceholderScreen.tsx`.
- Create tests: `src/app/routes.test.ts`, `src/app/AppShell.test.tsx`, `tests/e2e/navigation.spec.ts`.
- Modify: `Root.tsx`, which renders the router. Task 11 replaces it with the phase switch.

**Interfaces:**
- **`interface AppRoute`:** `path: string`, `label: string`, `icon: LucideIcon`, `nav: 'tab' | 'more' | 'hidden'`, `element: ReactNode`.
- **`export const APP_ROUTES: AppRoute[]`**, in this order:

| Path | Label | Nav |
|---|---|---|
| `/` | Home | tab |
| `/budget` | Budget | tab |
| `/invest` | Invest | tab |
| `/buy` | Buy It? | tab |
| `/quests` | Quests | tab |
| `/subscriptions` | Subscriptions | more |
| `/freeze` | Salary Freeze | more |
| `/dividends` | Dividends | more |
| `/news` | News | more |
| `/goals` | Goals | more |
| `/history` | History | more |
| `/shop` | Shop | more |
| `/inbox` | Inbox | more |
| `/help` | Help | more |
| `/settings` | Settings | more |
| `/add` | Add Expense | hidden |

- **Layout:**
  - **Below `md`:** bottom tabs (5) plus a "More" tab that opens `MoreSheet`, a dialog listing the `more` routes.
  - **At `md` and above:** a `Sidebar` with all tab and more routes; no bottom tabs.
  - `QuickAddButton` (aria-label "Quick add") links to `/add` on every shell screen.
  - Safe-area padding via `env(safe-area-inset-*)`.
- **Router:** `createBrowserRouter` from `react-router`, with `NotFound` as the catch-all (heading "Page not found" and a "Go home" link).
- **`PlaceholderScreen`:** props `{ title: string }`; renders an `h1` title and "Coming soon".

- [ ] **Step 1: Write the failing tests**

```ts
// routes.test.ts
it('has unique paths', () => expect(new Set(APP_ROUTES.map(r => r.path)).size).toBe(APP_ROUTES.length));
it('has exactly 5 tabs in spec order', () =>
  expect(APP_ROUTES.filter(r => r.nav === 'tab').map(r => r.label)).toEqual(['Home','Budget','Invest','Buy It?','Quests']));
```
```ts
// navigation.spec.ts
test('mobile: tabs + More sheet', async ({ page }) => { /* mobile project: bottom nav visible, sidebar hidden; More → Settings → h1 "Settings" */ });
test('desktop: sidebar navigates', async ({ page }) => { /* desktop project: click "Dividends" in sidebar → h1 "Dividends" */ });
test('unknown route shows not found', async ({ page }) => { /* goto /nope → "Page not found" → Go home → h1 "Home" */ });
```

Use `test.skip(testInfo.project.name !== 'mobile-chromium')` (or the desktop equivalent) for viewport-specific tests.
- [ ] **Step 2: Run `npm test && npm run test:e2e`.** Expected: FAIL.
- [ ] **Step 3: Implement the routes, shell and components**, styled with the tokens from Task 3.
- [ ] **Step 4: Run `npm test && npm run test:e2e && npm run lint && npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Manual check in the browser pane** at 375px and 1280px, light and dark (toggle by setting `data-theme` in devtools).
- [ ] **Step 6: Commit** `feat: app shell with bottom tabs, sidebar, more sheet and all screen routes`.

---

## M1 — Data & security

### Task 5: Entity schemas, snapshot, fixtures

**Files:**
- Create: `src/domain/dates.ts`, `src/domain/ids.ts`, `src/domain/entities.ts`, `src/domain/snapshot.ts`, `src/test/fixtures.ts`.
- Create tests: `src/domain/dates.test.ts`, `src/domain/entities.test.ts`, `src/domain/snapshot.test.ts`.

**Interfaces:**
- **`dates.ts`:**
  - `LocalDateSchema`: a zod string, `YYYY-MM-DD`, that must be a real calendar date;
  - `type LocalDate = string`;
  - `toLocalDate(d: Date): LocalDate` (uses local time);
  - `addDays(d: LocalDate, n: number): LocalDate`.
- **`ids.ts`:** `newId(): string` (`crypto.randomUUID()`) and `nowIso(): string`.
- **`entities.ts`:** zod schemas, and types inferred from them.
  - Every entity has `id: string`, `createdAt: iso`, `updatedAt: iso`.
  - Money fields are `z.number().int()`. Fields marked `+` must be greater than 0, fields marked `≥0` may be 0, and plain fields are any integer.
  - **Shared enums:**
    - `Category`: food | transport | rent | utilities | entertainment | health | shopping | other
    - `PaymentMethod`: cash | debit | credit_card | other
    - `Bucket`: cash | savings | passive
    - `Cycle`: weekly | monthly | quarterly | yearly
    - `Recurrence = { cycle: Cycle }`

| Entity | Fields |
|---|---|
| `Profile` | `id:'profile'`, `name`, `currency` (3 uppercase letters), `openingDate: LocalDate`, `openingCash ≥0`, `openingSavings ≥0`, `salary: { monthlyAmount ≥0, payDay 1–31 } \| null`, `onboardedAt: iso \| null` |
| `Settings` | `id:'settings'`, `weekStartsOn: 0 \| 1` (default 1), `warningTone: 'gentle' \| 'motivational' \| 'strict'` (default 'motivational'), `autoLockMinutes: 0 \| 1 \| 5 \| 15 \| 30` (0 = never; default 5), `lastBackupAt: iso \| null` |
| `Income` | `amount +`, `source: 'salary' \| 'extra'`, `label`, `date`, `status: 'expected' \| 'confirmed'`, `bucket: 'cash' \| 'savings'`, `recurrence \| null`, `period: 'YYYY-MM' \| null`, `note` |
| `Expense` | `amount +`, `category`, `date`, `note`, `paymentMethod`, `cardId: string \| null`, `recurrence \| null`, `subscriptionId: string \| null`. Refine: `credit_card` ⇔ `cardId` non-null |
| `Subscription` | `name`, `amount +`, `cycle`, `nextRenewal: LocalDate`, `category` (default 'entertainment'), `paymentMethod`, `cardId \| null` (same refine), `status: 'active' \| 'cancelled'`, `audit: 'keep' \| 'review' \| 'cancel' \| null`, `note` |
| `BudgetLimit` | `scope: 'category' \| 'overall'`, `category \| null` (refine: required iff scope 'category'), `period: 'weekly' \| 'monthly'`, `amount +`, `warnAt: number[]` (default [80,100,120], ascending), `reserve: boolean`, `includeInvestments: boolean` |
| `SalaryFreeze` | `start`, `end` (refine: end ≥ start), `lostAmount ≥0`, `mode: 'manual' \| 'computed'`, `note` |
| `Transaction` | `type: 'transfer' \| 'adjustment' \| 'card_payment' \| 'debt_payment'`, `amount` (refine: positive unless adjustment), `date`, `from: Bucket \| null`, `to: Bucket \| null`, `debtId \| null` (refine: required for card_payment/debt_payment), `note` |
| `Goal` | `name`, `kind: 'savings' \| 'emergency' \| 'custom'`, `target +`, `current ≥0`, `deadline: LocalDate \| null` |
| `Debt` | `name`, `kind: 'loan' \| 'credit_card'`, `openingBalance ≥0`, `openingDate`, `interestRate` (number ≥0, APR %), `minimumPayment ≥0`, `creditLimit \| null`, `statementDay: 1–31 \| null`, `dueDay: 1–31 \| null`, `payInFull: boolean` |

- **`snapshot.ts`:**
  - `TABLES = ['profile','settings','income','expense','subscription','budgetLimit','salaryFreeze','transaction','goal','debt'] as const`;
  - `type TableName`;
  - `type EntityOf<T extends TableName>`;
  - `SCHEMAS: { [K in TableName]: ZodType<EntityOf<K>> }`;
  - `CURRENT_SCHEMA_VERSION = 1`;
  - `type DataSnapshot = { schemaVersion: number; tables: { [K in TableName]: EntityOf<K>[] } }`;
  - `SnapshotSchema`;
  - `emptySnapshot(): DataSnapshot`;
  - `migrateSnapshot(raw: unknown): DataSnapshot`, which throws `SchemaVersionError` when `schemaVersion > CURRENT_SCHEMA_VERSION` and is the identity for v1.
- **`entities.ts`** also exports `defaultSettings(now: string): Settings` (the defaults in the table). Production code uses it; fixtures may wrap it.
- **`fixtures.ts`:** `makeProfile`, `makeSettings`, `makeExpense`, `makeIncome`, `makeSubscription`, `makeLimit`, `makeDebt`, `makeGoal`, each `(overrides?: Partial<T>) => T`, with valid defaults (e.g. `makeExpense()` = 12_50 food cash today).

- [ ] **Step 1: Write the failing tests**

```ts
expect(LocalDateSchema.safeParse('2026-02-30').success).toBe(false);
expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
expect(ExpenseSchema.safeParse(makeExpense({ amount: 12.5 })).success).toBe(false);
expect(ExpenseSchema.safeParse(makeExpense({ paymentMethod: 'credit_card', cardId: null })).success).toBe(false);
expect(BudgetLimitSchema.safeParse(makeLimit({ scope: 'category', category: null })).success).toBe(false);
expect(SalaryFreezeSchema.safeParse({ ...validFreeze, start: '2026-10-10', end: '2026-10-01' }).success).toBe(false);
const s = emptySnapshot();
expect(Object.keys(s.tables).sort()).toEqual([...TABLES].sort());
expect(SnapshotSchema.safeParse(s).success).toBe(true);
expect(() => migrateSnapshot({ ...s, schemaVersion: 99 })).toThrow(SchemaVersionError);
```

- [ ] **Step 2: Run `npm test -- src/domain`.** Expected: FAIL.
- [ ] **Step 3: Implement the schemas, snapshot and fixtures.**
- [ ] **Step 4: Run `npm test -- src/domain`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: domain entity schemas and data snapshot`.

### Task 6: Record encryption & key vault

**Files:**
- Create: `src/data/crypto.ts`, `src/data/meta.ts`, `src/data/keys.ts`.
- Create tests: `src/data/crypto.test.ts`, `src/data/keys.test.ts`.

**Interfaces:**
- **`crypto.ts`:**
  - `generateDataKey(): Promise<CryptoKey>` (AES-GCM 256, extractable, encrypt/decrypt);
  - `type EncryptedPayload = { iv: Uint8Array; ciphertext: ArrayBuffer }`;
  - `encryptRecord(key, aad: string, value: unknown): Promise<EncryptedPayload>` (JSON → UTF-8 → AES-GCM);
  - `decryptRecord<T = unknown>(key, aad, payload): Promise<T>`, which throws `DecryptError`;
  - `bytesToBase64(b: Uint8Array): string` and `base64ToBytes(s: string): Uint8Array`.
- **`meta.ts`:** `interface MetaStore { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> }`, plus `memoryMetaStore(): MetaStore`.
- **`keys.ts`:**
  - `type LockMode = 'device' | 'pin' | 'passphrase'`;
  - `type SecretKind = 'pin' | 'passphrase'`;
  - `KDF_ITERATIONS = 600_000`;
  - `type VaultRecord = { version: 1; mode: LockMode; wrappedKey: ArrayBuffer; deviceKey?: CryptoKey; salt?: Uint8Array; iterations?: number }`, stored under meta key `'vault'`.
  - **Functions:**
    - `createVault(meta): Promise<CryptoKey>` creates a data key and a non-extractable AES-KW device key, and wraps one with the other.
    - `getLockMode(meta): Promise<LockMode | null>`.
    - `unlockVault(meta, secret?: string): Promise<CryptoKey>` unwraps with the device key or with PBKDF2(secret, salt, iterations from the record). It throws `WrongSecretError` on an unwrap failure.
    - `setVaultSecret(meta, dataKey, secret, kind, opts?: { iterations?: number }): Promise<void>` writes the new wrapped key and removes `deviceKey` in **one `put`**.
    - `clearVaultSecret(meta, dataKey): Promise<void>` creates a new device key and re-wraps.
    - `validateSecret(secret: string, kind: SecretKind): string | null` returns the user-facing error or null.
    - `deriveKey(secret: string, salt: Uint8Array, iterations: number, usage: 'wrap' | 'encrypt'): Promise<CryptoKey>`: PBKDF2-SHA-256 to AES-KW (`wrap`) or AES-GCM (`encrypt`). Task 8 reuses it.
  - **`WrongSecretError` message:** `"That didn't match. Try again."`
  - **`validateSecret` copy:**
    - PIN: `"Use 4 to 8 digits."`
    - passphrase: `"Use at least 8 characters."`

- [ ] **Step 1: Write the failing tests**

```ts
const FAST = { iterations: 1_000 };
it('round-trips and binds to its slot', async () => {
  const key = await generateDataKey();
  const p = await encryptRecord(key, 'expense:1', { note: 'coffee' });
  expect(await decryptRecord(key, 'expense:1', p)).toEqual({ note: 'coffee' });
  await expect(decryptRecord(key, 'expense:2', p)).rejects.toBeInstanceOf(DecryptError);
});
it('uses a fresh 12-byte IV', async () => { /* two encryptions → iv.length 12 and ivs differ */ });
it('keeps one data key across PIN set / unlock / clear', async () => {
  const meta = memoryMetaStore();
  const k1 = await createVault(meta);
  const p = await encryptRecord(k1, 'a:1', 42);
  await setVaultSecret(meta, k1, '2468', 'pin', FAST);
  expect(await getLockMode(meta)).toBe('pin');
  expect((await meta.get<VaultRecord>('vault'))?.deviceKey).toBeUndefined();
  await expect(unlockVault(meta, '1357')).rejects.toBeInstanceOf(WrongSecretError);
  const k2 = await unlockVault(meta, '2468');
  expect(await decryptRecord(k2, 'a:1', p)).toBe(42);
  await clearVaultSecret(meta, k2);
  expect(await getLockMode(meta)).toBe('device');
  expect(await decryptRecord(await unlockVault(meta), 'a:1', p)).toBe(42);
});
it('validates secrets', () => {
  expect(validateSecret('123', 'pin')).toBe('Use 4 to 8 digits.');
  expect(validateSecret('12a4', 'pin')).toBe('Use 4 to 8 digits.');
  expect(validateSecret('24680', 'pin')).toBeNull();
  expect(validateSecret('short', 'passphrase')).toBe('Use at least 8 characters.');
});
```

- [ ] **Step 2: Run `npm test -- src/data`.** Expected: FAIL.
- [ ] **Step 3: Implement with `crypto.subtle`** (`wrapKey('raw', dataKey, kek, 'AES-KW')` and `unwrapKey(..., {name:'AES-GCM'}, true, ['encrypt','decrypt'])`).
- [ ] **Step 4: Run `npm test -- src/data`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: AES-GCM record encryption and PIN/passphrase key vault`.

### Task 7: Encrypted Dexie repository

**Files:**
- Create: `src/data/db.ts`, `src/data/repository.ts`, `src/data/webRepository.ts`.
- Create test: `src/data/webRepository.test.ts`.

**Interfaces:**
- **`db.ts`:**
  - `type Namespace = 'real' | 'demo'`;
  - `type RecordRow = { table: TableName; id: string; updatedAt: string; iv: Uint8Array; ciphertext: ArrayBuffer }`;
  - `class FunancialDb extends Dexie`, with `records: Table<RecordRow, [string, string]>` and `meta: Table<{ key: string; value: unknown }, string>`. Schema v1: `records: '[table+id], table'`, `meta: '&key'`.
  - `openDb(ns: Namespace): FunancialDb`, with database name `funancial-${ns}`;
  - `deleteDb(ns: Namespace): Promise<void>`;
  - `dexieMetaStore(db): MetaStore`.
- **`repository.ts`:**
  - `type SkippedRecord = { table: TableName; id: string; reason: 'decrypt' | 'invalid' }`;
  - `type LoadResult = { snapshot: DataSnapshot; skipped: SkippedRecord[] }`;
  - `interface Repository`, with these methods:
    - `loadAll(): Promise<LoadResult>`;
    - `put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>`;
    - `remove(table: TableName, id: string): Promise<void>`;
    - `replaceAll(snapshot: DataSnapshot): Promise<void>`.
- **`webRepository.ts`:**
  - `createWebRepository(db: FunancialDb, key: CryptoKey): Repository`.
  - `put` validates with `SCHEMAS[table]` before encrypting and throws a `ZodError` on invalid input.
  - `replaceAll` validates the whole snapshot with `SnapshotSchema`, encrypts every row **before** opening the transaction, then does `clear` + `bulkPut` inside one `db.transaction('rw', db.records, ...)`.
  - `loadAll` skips undecryptable rows (reason `decrypt`) and rows that fail validation (reason `invalid`), and reports them.

- [ ] **Step 1: Write the failing tests** (node env; `fake-indexeddb/auto` is loaded by the setup file)

```ts
it('never stores plaintext', async () => {
  const db = openDb('real'); const repo = createWebRepository(db, await generateDataKey());
  await repo.put('expense', makeExpense({ id: 'e1', note: 'secret coffee' }));
  const row = await db.records.get(['expense', 'e1']);
  expect(new TextDecoder().decode(row!.ciphertext)).not.toContain('secret coffee');
  expect((await repo.loadAll()).snapshot.tables.expense[0]?.note).toBe('secret coffee');
});
it('replaceAll is all-or-nothing', async () => {
  // seed e1; replaceAll with a snapshot containing an invalid expense → rejects; loadAll still has e1 only
});
it('skips and reports a corrupt row', async () => {
  // db.records.put({ table:'expense', id:'bad', updatedAt, iv:new Uint8Array(12), ciphertext:new ArrayBuffer(8) })
  // loadAll → skipped toEqual([{ table:'expense', id:'bad', reason:'decrypt' }])
});
it('deleting the demo db leaves real data intact', async () => {
  // put into real + demo; deleteDb('demo'); real loadAll still has its record; demo reopened is empty
});
it('dexieMetaStore can persist the vault', async () => {
  // createVault(dexieMetaStore(db)) then getLockMode → 'device' (proves CryptoKey clones into IndexedDB)
});
```

Afterwards, delete each test's databases.
- [ ] **Step 2: Run `npm test -- src/data/webRepository`.** Expected: FAIL.
- [ ] **Step 3: Implement.** If fake-indexeddb cannot structured-clone a `CryptoKey`, mark only the last test `skip` with a comment pointing to `security.spec.ts`; the Playwright e2e in Task 12 covers it in a real browser.
- [ ] **Step 4: Run `npm test -- src/data`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: encrypted Dexie repository with atomic replace`.

### Task 8: Encrypted backup & plain export

**Files:**
- Create: `src/data/backup.ts`.
- Create test: `src/data/backup.test.ts`.

**Interfaces:**
- **Backup file:** JSON text.

```ts
{ format: 'funancial-backup', version: 1, createdAt,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
  cipher: { name: 'AES-GCM', iv }, data }
```

`salt`, `iv` and `data` are base64. `data` is the encrypted `JSON.stringify(snapshot)`.
- **Functions:**
  - `createBackup(snapshot: DataSnapshot, passphrase: string, opts?: { iterations?: number; now?: Date }): Promise<string>` throws `Error('Use at least 8 characters.')` for a short passphrase.
  - `readBackup(text: string, passphrase: string): Promise<DataSnapshot>`.
    - Throws `InvalidBackupError` (message `"This file isn't a Funancial backup."`) for bad JSON or the wrong format.
    - Throws `InvalidBackupError` with `"This backup was made by a newer version of Funancial."` when the version is greater than 1 or `SchemaVersionError` is raised.
    - Throws `WrongSecretError` when decryption fails.
    - Runs `migrateSnapshot` and then `SnapshotSchema.parse`.
  - `exportPlainJson(snapshot: DataSnapshot, now?: Date): string` produces `{ format: 'funancial-export', schemaVersion, exportedAt, data }`, pretty-printed.
  - `backupFileName(now: Date): string` → `funancial-backup-YYYY-MM-DD.funbak`.
  - `exportFileName(now: Date): string` → `funancial-export-YYYY-MM-DD.json`.

- [ ] **Step 1: Write the failing tests**

```ts
const FAST = { iterations: 1_000 };
it('round-trips', async () => {
  const snap = { ...emptySnapshot(), tables: { ...emptySnapshot().tables, expense: [makeExpense()] } };
  expect(await readBackup(await createBackup(snap, 'correct horse', FAST), 'correct horse')).toEqual(snap);
});
it('rejects a wrong passphrase', /* → WrongSecretError */);
it('rejects truncated text', /* text.slice(0, 40) → InvalidBackupError */);
it('rejects a newer version', /* JSON with version: 2 → InvalidBackupError /newer version/ */);
it('detects tampering', /* flip one base64 char in data → WrongSecretError */);
it('names files by date', () => expect(backupFileName(new Date(2026, 9, 14))).toBe('funancial-backup-2026-10-14.funbak'));
```

- [ ] **Step 2: Run `npm test -- src/data/backup`.** Expected: FAIL.
- [ ] **Step 3: Implement**, reusing `bytesToBase64`/`base64ToBytes` from `crypto.ts` and `deriveKey(…, 'encrypt')` from `keys.ts`.
- [ ] **Step 4: Run `npm test -- src/data`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: passphrase-encrypted backup, restore and plain JSON export`.

### Task 9: Demo seed

**Files:**
- Create: `src/data/demoSeed.ts`.
- Create test: `src/data/demoSeed.test.ts`.

**Interfaces:**
- **`buildDemoSnapshot(today: LocalDate, seed = 42): DataSnapshot`**: deterministic, using a mulberry32 PRNG.
- **Profile and settings:**
  - Profile: `name 'Demo Player'`, `currency 'USD'`, `openingDate = today − 60 days`, `openingCash 2_500_00`, `openingSavings 8_000_00`, salary `{ monthlyAmount: 4_200_00, payDay: 25 }`.
  - Default settings.
- **Income:** confirmed salary incomes for each pay day in the window.
- **Expenses:** 2–4 per day over the 60 days, up to and including today.
  - Category weights: food 35%, transport 15%, shopping 15%, entertainment 10%, health 5%, other 5%, utilities 10%, rent 5%, with rent and utilities as one monthly entry each.
  - Amounts in realistic ranges per category.
  - About 30% paid with the demo card.
- **Subscriptions:**

| Name | Amount | Category |
|---|---|---|
| Streamflix | 15_99 monthly | entertainment |
| Tunely | 10_99 monthly | entertainment |
| CloudBox | 2_99 monthly | other |
| FitHub Gym | 39_00 monthly | health |

- **Limits:**
  - overall monthly 2_600_00, with `reserve` false;
  - food weekly 120_00;
  - entertainment monthly 100_00.
- **Debt:** `Demo Visa`, a credit_card with `payInFull` true, statementDay 1, dueDay 21, creditLimit 3_000_00.
- **Goals:** "Emergency fund" (emergency, target 10_000_00, current 3_000_00) and "New bike" (savings, target 1_200_00, current 450_00, deadline today + 120 days).
- **Freeze:** one past salary freeze of 5 days, mode `computed`.

- [ ] **Step 1: Write the failing tests**

```ts
it('is deterministic', () => expect(buildDemoSnapshot('2026-10-14')).toEqual(buildDemoSnapshot('2026-10-14')));
it('is valid', () => expect(SnapshotSchema.safeParse(buildDemoSnapshot('2026-10-14')).success).toBe(true));
it('has no future-dated expenses', /* every expense.date <= '2026-10-14' and >= '2026-08-15' */);
it('card expenses point at an existing card', /* every credit_card expense.cardId ∈ debt ids with kind credit_card */);
```

- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: deterministic demo data seed`.

### Task 10: App store (session lifecycle, CRUD, demo, backup, delete)

**Files:**
- Create: `src/store/appStore.ts`, `src/store/AppStoreProvider.tsx`, `src/lib/broadcast.ts`.
- Create test: `src/store/appStore.test.ts`.

**Interfaces:**
- **`broadcast.ts`:** `type SyncMessage = { type: 'reload'; reason: 'secret' | 'restore' | 'delete' | 'namespace' }` and `createChannel(): { post(m: SyncMessage): void; subscribe(fn: (m: SyncMessage) => void): () => void }`. Wraps `BroadcastChannel('funancial')`; a no-op if the API is unavailable.
- **`appStore.ts`:**

```ts
type Phase = 'booting' | 'unavailable' | 'welcome' | 'locked' | 'unlocked';
interface AppDeps {
  kdfIterations: number; today(): LocalDate; now(): number;
  storage: typeof safeStorage; channel: { post(m: SyncMessage): void };
  requestPersistence(): Promise<boolean>; openDb(ns: Namespace): FunancialDb;
}
interface AppState {
  phase: Phase; namespace: Namespace; lockMode: LockMode | null;
  data: DataSnapshot; skipped: SkippedRecord[]; persisted: boolean;
  failedAttempts: number; lockedUntil: number | null;   // epoch ms
  boot(): Promise<void>;
  startFresh(): Promise<void>;
  startDemo(): Promise<void>;
  exitDemo(): Promise<void>;
  unlock(secret: string): Promise<'ok' | 'wrong' | 'throttled'>;
  verifySecret(secret: string): Promise<boolean>;
  lock(): void;
  setSecret(secret: string, kind: SecretKind): Promise<void>;
  clearSecret(): Promise<void>;
  put<T extends TableName>(table: T, record: EntityOf<T>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  createBackup(passphrase: string): Promise<{ fileName: string; text: string }>;
  restoreBackup(text: string, passphrase: string): Promise<void>;
  exportPlain(): { fileName: string; text: string };
  deleteAllData(): Promise<void>;
}
export function createAppStore(deps: AppDeps): StoreApi<AppState>;   // zustand/vanilla
export const appStore: StoreApi<AppState>;                           // production deps
```

- **`AppStoreProvider.tsx`:** `AppStoreProvider({ store, children })`, `useApp<T>(selector: (s: AppState) => T): T` and `useAppStore(): StoreApi<AppState>`.
- **Behavior:**
  - The active namespace is persisted in `storage` key `funancial.namespace` (default `'real'`). The repository and data key live in the store closure, not in state.
  - **`boot`:**
    1. Call `requestPersistence` and store the result in `persisted`.
    2. Open the db. On any failure, the phase becomes `'unavailable'`.
    3. With no vault, the phase is `'welcome'`.
    4. A `device` vault auto-unlocks.
    5. Otherwise the phase is `'locked'`.
  - **`startFresh`:**
    - create the vault (device mode);
    - write `defaultSettings(nowIso())` (not a profile; that comes with M2 onboarding);
    - phase becomes `'unlocked'`.
  - **`startDemo`:**
    - namespace becomes demo;
    - delete any old demo db;
    - create the vault;
    - `replaceAll(buildDemoSnapshot(today()))`;
    - phase becomes unlocked;
    - post `namespace`.
  - **`exitDemo`:**
    - `deleteDb('demo')`;
    - namespace becomes real;
    - post `namespace`;
    - `boot()`.
  - **`unlock` throttle:**
    - a wrong secret increments `failedAttempts`;
    - at 5 failures, set `lockedUntil = now() + 30_000` and reset the count;
    - while `now() < lockedUntil`, return `'throttled'` without trying;
    - success resets both.
  - **`lock`:** a no-op when `lockMode === 'device'`. Otherwise it clears the data and key from memory and sets the phase to `'locked'`.
  - **`setSecret`, `clearSecret` and `restoreBackup`** post `reload` after a successful write. `setSecret`/`clearSecret` throw in the demo namespace.
  - **`createBackup`** sets `settings.lastBackupAt`.
  - **`restoreBackup`** reads and validates fully before `replaceAll`. On any error, it rethrows and leaves the state unchanged.
  - **`deleteAllData`:**
    - `deleteDb(namespace)`;
    - remove `funancial.namespace`;
    - post `delete`;
    - phase becomes `'welcome'`.

- [ ] **Step 1: Write the failing tests** (node env).
  - Use a factory `testDeps()`: iterations 1_000, a fixed today `'2026-10-14'`, a controllable `now`, an in-memory storage, a spy channel, and `requestPersistence` resolving true.
  - Give each test unique db names by stubbing `openDb` to add a random suffix.

```ts
it('first boot → welcome; startFresh → unlocked device mode with settings', ...);
it('device mode survives a reboot without a prompt', /* new store, same deps → boot → unlocked, data kept */);
it('PIN: reboot is locked; wrong → "wrong"; right → unlocked with data', ...);
it('throttles after 5 wrong attempts for 30s', async () => {
  // 5× unlock('0000') → 5th returns 'wrong' and sets lockedUntil; unlock('2468') → 'throttled'
  // advance now by 30_001 → unlock('2468') → 'ok'
});
it('put persists across reboot', ...);
it('demo then exit keeps real data', async () => {
  // startFresh; put real expense; startDemo → namespace demo, expenses > 0; exitDemo → namespace real, data has only the real expense
});
it('failed restore leaves data untouched', /* restoreBackup(garbage) rejects; data unchanged; phase unlocked */);
it('restore replaces data and posts reload', ...);
it('deleteAllData → welcome, db empty, channel got delete', ...);
it('unavailable when the database cannot open', /* openDb returns db whose open() rejects → phase unavailable */);
it('setSecret posts reload and is refused in demo', ...);
```

- [ ] **Step 2: Run `npm test -- src/store`.** Expected: FAIL.
- [ ] **Step 3: Implement** with `createStore` from `zustand/vanilla` and `useStore` in the provider.
- [ ] **Step 4: Run `npm test`.** Expected: PASS (all projects).
- [ ] **Step 5: Commit** `feat: app session store with lock, demo, backup, restore and delete`.

### Task 11: Root phases, Welcome, Lock, auto-lock, demo banner

**Files:**
- Create:
  - `src/features/system/BootSplash.tsx` and `StorageUnavailable.tsx`;
  - `src/features/welcome/WelcomeScreen.tsx`;
  - `src/features/lock/LockScreen.tsx`, `PinPad.tsx`, `useAutoLock.ts`;
  - `src/app/DemoBanner.tsx`.
- Create tests: `src/features/lock/lock.test.tsx`, `src/features/welcome/welcome.test.tsx`, `src/app/Root.test.tsx` (replaces Task 1's test).
- Modify:
  - `src/app/Root.tsx`, which switches on `phase`: booting → BootSplash, unavailable → StorageUnavailable, welcome → Welcome, locked → Lock, unlocked → router with `DemoBanner` above the shell and `useAutoLock` active;
  - `src/main.tsx`, which wraps the app in `AppStoreProvider store={appStore}`, calls `boot()`, and subscribes to the channel with `location.reload()`;
  - `src/app/AppShell.tsx`, which renders `DemoBanner`.

**Interfaces:**
- **`useAutoLock(minutes: number): void`:** when minutes > 0, starts an idle timer that resets on `pointerdown`, `keydown` and `visibilitychange` (when visible), and calls `lock()` on expiry. It also locks immediately on becoming visible if hidden for longer than `minutes`.
- **`PinPad`:** props `{ minLength?: number /* 4 */; maxLength?: number /* 8 */; onSubmit(pin: string): void; disabled?: boolean; error?: string }`. A 0–9 keypad with Delete and Enter (aria-label "Unlock"); physical keyboard digits work too.
- **Copy (exact):**
  - **Welcome:**
    - title "Funancial";
    - tagline "Level up your real financial life.";
    - buttons "Try with demo money" and "Start with my real data";
    - footnote "Funancial is a personal tracking tool, not financial advice. Your data stays on this device."
  - **Lock:** title "Welcome back"; wrong-secret message "That didn't match. Try again."; throttled message `"Too many tries. Try again in {n}s."`.
  - **StorageUnavailable:** title "Funancial can't save data here"; body "Your browser is blocking storage (this can happen in private windows). Open Funancial in a normal window to continue."
  - **DemoBanner:** "You're using demo money." with a button "Start with my real data", which opens a confirm Dialog: "Leave demo? Demo data will be deleted. Your real data isn't affected." Buttons "Leave demo" / "Stay".

- [ ] **Step 1: Write the failing tests.** Use jsdom with a real `createAppStore` over a stub repository, or a hand-built store via `createStore` with `vi.fn()` actions. Fake timers for auto-lock.

```tsx
it('Welcome buttons start demo / fresh', ...);
it('PIN lock: wrong PIN shows message and clears input', ...);
it('passphrase lock shows a password field instead of a PIN pad', ...);
it('throttled unlock shows a countdown', /* unlock resolves 'throttled', lockedUntil = now+30_000 → "Too many tries. Try again in 30s." */);
it('auto-lock fires after idle minutes and resets on activity', ...);
it('autoLockMinutes 0 never locks', ...);
it('DemoBanner only in demo, confirm calls exitDemo', ...);
it('Root shows StorageUnavailable for phase unavailable', ...);
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test && npm run lint && npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: welcome, lock screen with PIN pad, auto-lock and demo banner`.

### Task 12: Settings — Security & Data, plus M1 e2e

**Files:**
- Create: `src/features/settings/SettingsScreen.tsx`, `SecuritySection.tsx`, `DataSection.tsx`, `SecretDialog.tsx`, `src/lib/download.ts`.
- Create tests: `src/features/settings/settings.test.tsx`, `tests/e2e/demo.spec.ts`, `security.spec.ts`, `backup.spec.ts`.
- Modify: `src/app/routes.ts`, so `/settings` renders `SettingsScreen`.

**Interfaces:**
- **`download.ts`:** `downloadText(fileName: string, text: string, mime: string): void` (Blob + object URL + temporary `<a download>`) and `readFileText(file: File): Promise<string>`.
- **SettingsScreen** shows an `h1` "Settings", then Appearance (theme: System/Light/Dark via `setThemePreference`), Security and Data.
- **SecuritySection:**
  - Hidden in demo, where it shows "Demo data isn't locked."
  - **Lock method** radio: "No lock" / "PIN" / "Passphrase".
    - Changing it opens `SecretDialog`: current secret if one is set (checked with `verifySecret`), new secret, confirm, validated with `validateSecret`. Mismatch message: "Those don't match."
  - **Auto-lock** select: Never / 1 / 5 / 15 / 30 minutes; writes `settings.autoLockMinutes`. Shown only when a lock is set.
  - A one-line note when PIN is chosen: "A PIN keeps casual snoopers out. For stronger protection, use a passphrase."
- **DataSection:**
  - A summary line of counts, e.g. "42 expenses · 4 subscriptions · 3 limits · …", for non-empty tables.
  - Storage status: "Storage: protected from automatic clearing" or "Storage: the browser may clear it if space runs low".
  - **"Create encrypted backup":** passphrase + confirm (≥ 8). Warning "If you forget this passphrase, the backup can't be opened." Then `downloadText(fileName, text, 'application/octet-stream')`; shows "Last backup: {date}" afterwards.
  - **"Restore from backup":** file input (accept `.funbak,.json`, label "Backup file"), passphrase field, confirm Dialog "Restore this backup? It replaces all data on this device.". Shows errors as the error's message.
  - **"Export unencrypted copy":** confirm Dialog "This file isn't protected. Anyone who gets it can read your finances."
  - **"Delete all data":** Dialog requiring typing `DELETE`; button disabled until it matches.
- In the demo namespace, Data shows only the summary plus "Start with my real data".

- [ ] **Step 1: Write the failing tests**

```tsx
// settings.test.tsx
it('PIN dialog rejects mismatch and invalid PIN', ...);
it('Delete button stays disabled until DELETE is typed', ...);
it('restore shows the error message from a bad file', /* restoreBackup rejects InvalidBackupError → text "This file isn't a Funancial backup." */);
```
```ts
// demo.spec.ts
test('try demo → banner → leave demo → welcome', ...);
// security.spec.ts
test('set PIN → reload → locked → wrong → right → unlocked', ...);
test('second tab reloads after data is deleted in the first', async ({ context }) => {
  // pageA + pageB on '/', startFresh in A, B reloads to unlocked; A deletes all → B shows Welcome (expect.poll)
});
// backup.spec.ts  (no add-expense UI exists yet, so the demo data is the payload)
test('backup → leave → restore round-trip', async ({ page }) => {
  // Try with demo money → Settings → Create encrypted backup ('correct horse' ×2) → download.path()
  // Leave demo → Start with my real data → Settings → summary shows no expenses
  // Restore: setInputFiles(backup), passphrase 'correct horse', confirm → summary shows the demo expense count
  // Restore again with 'wrong pass' → shows "That didn't match. Try again." (WrongSecretError message), counts unchanged
});
```

- [ ] **Step 2: Run `npm test && npm run test:e2e`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run typecheck && npm run lint && npm test && npm run test:e2e`.** Expected: all PASS on both Playwright projects.
- [ ] **Step 5: Manual pass in the browser pane** at 375px and desktop, light and dark: demo, PIN lock/unlock, backup download, restore, delete.
- [ ] **Step 6: Commit** `feat: security and data settings with encrypted backup, restore, export and delete`.

---

## Milestone checkpoint (M1 done)

The user can, in the browser:
- try demo money and leave it;
- start fresh;
- set, change or remove a PIN or passphrase;
- get locked out after idling;
- make an encrypted backup, restore it, export plain JSON, and delete everything.

Next: write the M2 (finance core) plan with this skill, against the same design doc.
