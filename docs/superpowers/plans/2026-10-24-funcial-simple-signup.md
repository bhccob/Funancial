# A Shorter Sign-up (0.14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setup in four steps (account, email code, currency and name, lock), with no money questions up front; cards made inside a subscription; Home asking softly afterwards; the remaining old screens in the glass look.

**Architecture:** A new `code` account route emails a 6-digit code, and `signup` takes it (optionally, for old app versions) and makes the account only with a live code. The app gets shared password rules, a code field, a four-step wizard, a two-step Create-account sheet, Home's first-time cards, and "+ New card" in the subscription form. The rest is restyling on 0.13's controls.

**Tech Stack:** React 19, TypeScript, Tailwind 4, zustand, zod, vitest + Testing Library, Playwright + axe, Vercel functions + Upstash, nodemailer (Gmail), Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-10-24-funcial-simple-signup-design.md` (mockup `design/next/p2-signup.html`).

## Global Constraints

- Version 0.14 / versionCode 14. Branch `feat/simple-signup` from `main` at `b05d275`.
- Never push, PR, merge or deploy without asking the owner. **The `code` route and the `signup` change need a Vercel deploy; ask the owner before it.** Don't install on the owner's phone before that deploy unless only "Skip for now" is being tried.
- No stored-schema change: no new field in `SettingsSchema` (it is strict) or any app table. The server's account record may gain the optional `emailVerified`.
- Money is integer minor units; balances use the existing functions.
- Text ≥ 4.5:1, large text and UI marks ≥ 3:1, in all 12 themes, light and dark; tokens only (except the ROWS hairline idiom and the card skin table).
- Tap targets ≥ 44px; lucide icons only; reduced motion gives fades only.
- Never put `backdrop-filter`, `filter` or a lasting `transform` on a `<dialog>` element (the Toaster portals a fixed region into open modals).
- Restyle keeps behaviour: tests of behaviour keep asserting it; only class/markup pins may change.
- Before any Playwright run, ports 4173 and 4174 must be free (Playwright reuses a running server outside CI).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A code pasted or autofilled as "481 529" or "481-529" fills the whole code field. (Task 5 test `pastes a spaced code`.)
2. Going Back from the code step keeps the username, email and password typed. (Task 5 test `back from the code keeps what was typed`.)
3. A sign-up whose first reply was lost, and whose code the server already used, still ends linked, not "wrong code". (Task 3 test `a retried sign-up answers taken before the code`; Task 4 test `a lost reply after the code still links`.)
4. Asking for a new code makes the old one stop working. (Task 3 test `a new code replaces the old`.)
5. Someone already using 0.13 never sees Home's first-time cards. (Task 8 test `no first steps once something is logged`.)

---

### Task 1: Recent and History rows line up, and card names fit at 360px

**Files:**
- Modify: `src/features/shared/EntryRow.tsx` (the delete button's margins, ~:134; the sub-line, ~:90-113)
- Test: `src/features/shared/entryLine.test.tsx` or the EntryRow tests, `tests/e2e/demo.spec.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests.**
  - e2e `amounts line up in Recent and History`: at 360×780 and 375×812, the right edges of every row's amount in Home's Recent, and on History, are within 1px of each other (expense rows with the 16px chevron, and rows with the 44px delete button).
  - e2e `a long card name shows whole with Afl. amounts`: AWG profile, an account named "Everyday checking" with last 4 "4312", an expense on it. At 360×780 the Recent row's sub-line shows "Everyday checking ·· 4312" uncut: no ellipsis, and every glyph inside the row's text box.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/demo.spec.ts --project=mobile-chromium -g "line up|long card name"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The delete button keeps its 44×44 target with margins that put its amount edge where the chevron rows' is. The final review suggested `-ml-3 -mr-4` in place of `-mr-2`.
  - For the name, first win room without changing the row's height: the 40px chip and tighter gaps. If that isn't enough, use `line-clamp-3` on the sub-line. Report which one you used and the measured text-column widths at 360 and 375.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the e2e `demo`, `finance` and `contrast` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `fix: Recent and History amounts line up, and long card names fit`.

### Task 2: Shared password rules and the strength bar

**Files:**
- Create: `src/domain/passwordRules.ts`, `src/domain/commonPasswords.ts`, `src/domain/passwordRules.test.ts`
- Modify:
  - `src/store/accountActions.ts`: `passwordProblem` (~:136), sign-up and change password
  - `src/features/account/parts.tsx`: `PasswordField` gets a strength bar
  - `src/features/settings/AccountSection.tsx`: Change password
  - `site/reset/main.ts` (~:96), with its test
- Test: `src/domain/passwordRules.test.ts`, `site/reset/main.test.ts`, `src/features/account/*.test.tsx`

**Interfaces:**
- **Produces:**
  - `passwordProblem(password: string, who?: { username?: string; email?: string }): string | null`.
    Rules are checked in this order, with this exact copy:
    1. length < 10: `'Use at least 10 characters.'`
    2. one character repeated: `'Use more than one character.'`
    3. in `COMMON_PASSWORDS` (case-insensitive): `'That password is too common. Pick another one.'`
    4. equals the username, or the email's part before `@` (case-insensitive, trimmed): `"Don't use your username or email as your password."`
  - `passwordStrength(password: string): 'weak' | 'okay' | 'strong'`:
    - `weak` when `passwordProblem` refuses it
    - `strong` at ≥ 14 characters with at least 3 of {lower, upper, digit, symbol}
    - else `okay`
  - `COMMON_PASSWORDS: ReadonlySet<string>`: about 1,000 lower-cased passwords of 10+ characters.
    - Build it from SecLists' `Passwords/Common-Credentials/10-million-password-list-top-100000.txt` (MIT): keep the first 1,000 of length ≥ 10, lower-cased and deduped.
    - Put a header comment with the source URL and the MIT licence line.
    - Fetching that one text file is fine; nothing else is downloaded.
  - `accountActions.passwordProblem` becomes this function (re-export), so sign-up, Change password and the Create-account sheet all use it.
  - `PasswordField` takes `strength?: boolean`. When on, a 3-segment bar and a word ("Weak", "Okay", "Strong") sit under the field. The segments are UI marks (≥ 3:1), and the word is muted text (≥ 4.5:1).

- [ ] **Step 1: Write the failing tests** in `passwordRules.test.ts`:
  - `'short'` → `'Use at least 10 characters.'`
  - `'aaaaaaaaaaaa'` → `'Use more than one character.'`
  - `'Password123'` and `'PASSWORD123'` → the common message
  - `'robin.smith1'` with `{ username: 'robin.smith1' }` → the username message
  - `'LongerName1'` with `{ email: 'longername1@x.io' }` → the username message (the email's name part, case-insensitive)
  - `'correct horse battery'` → `null`
  - strength:
    - `'abcdefghij'` → `'okay'`
    - `'Tr0ub4dor&3xyz'` → `'strong'`
    - `'short'` → `'weak'`
  - a reset-page test: the page refuses `'password123'` with the common message.
- [ ] **Step 2: Run** `npx vitest run src/domain/passwordRules.test.ts site/reset`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, the list and the wiring. The reset page imports from `@/domain/passwordRules`, as it already imports from `@/data`.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: shared password rules, common passwords refused, and a strength bar`.

### Task 3: The server's email code, and sign-up that takes it

**Files:**
- Create: `api/_account/code.ts`
- Modify:
  - `api/_lib/accounts.ts`: a `code` method, the `signup` body and order, the `Account` type, `K.code`
  - `api/[op].ts`: register `code`
- Test: `api/_lib/accounts.test.ts`, `api/_lib/accountRoutes.test.ts`, `api/_lib/dispatch.test.ts`

**Interfaces:**
- **Produces:**
  - **`POST /api/code` with `{ username, email }`** (same zod shapes as `signup`):
    - 200 `{ ok: true }` when a code was sent
    - 409 `{ error: 'taken' }` when the username exists
    - 429 with `Retry-After`
    - 503 `{ error: 'not configured' }` without a mailer
    - 400 for a bad body
  - **The code:** 6 digits from `randomInt(0, 1_000_000)`, zero-padded.
  - **Storage:** `K.code(email) = 'acct:v:' + email`, holding `{ hash: sha256(code), tries: 0, sentAt: now }`, TTL 600 s. A new send overwrites it, so only the newest code works.
  - **Limits, all checked before sending:**
    - `code:ip` 5 per HOUR
    - `code:email` 5 per HOUR
    - a 30-second gap since `sentAt` for that email (429, `retryAfter` = seconds left)
    - `code:global` 150 per DAY, AND `forgot:global` 300 per DAY (both counted)
  - **The email:**
    - Subject: `'Your Funcial code'`
    - Text: `'Your Funcial code is 481 529. It works for 10 minutes. If you didn\'t ask for it, ignore this email.'`, with the real code written as 3 + space + 3.
    - A mail failure answers 503 `{ error: 'not sent' }` and keeps no code.
  - **`signup` body:** gains an optional `code: z.string().regex(/^\d{6}$/)`. The order:
    1. parse
    2. if the username exists → 409 `taken` (before anything about the code)
    3. if `code` is present:
       - throttle `code:try` per ip, 20 per HOUR
       - read `K.code(email)`; none → 410 `{ error: 'expired' }`
       - hash mismatch → `tries + 1`. At 5, delete the key. Answer 401 `{ error: 'code' }`.
       - match → delete the key
    4. throttle `signup:ip` 5 per HOUR (as today, now after the code)
    5. create the account as today
  - **`Account.emailVerified?: boolean`:** `true` when a code was used, `false` when none was sent.

- [ ] **Step 1: Write the failing tests** in `accounts.test.ts` (fake mailer, in-memory store, fixed `now`):
  - `sends a code` (one mail, the exact subject and text shape)
  - `a taken name gets no code`
  - `a new code replaces the old` (the first code → 401 `code` after a second send)
  - `30 seconds between codes`
  - `five codes an hour per email`
  - `codes have their own daily cap` (151st → 429 while `forgot` still sends)
  - `a wrong code five times ends it` (6th try → 410)
  - `an expired code` (now + 601 s → 410)
  - `the right code makes a verified account and is used up`
  - `a sign-up without a code still works, unverified`
  - `a retried sign-up answers taken before the code` (the same body after success → 409 `taken`, not 401/410)
  - `wrong codes don't use up sign-up's limit` (6 wrong codes then a right one from the same ip → 200)
  - a route test that `code` is registered and answers 405 for GET.
- [ ] **Step 2: Run** `npx vitest run api`. Expected: FAIL.
- [ ] **Step 3: Implement** it, reusing `throttle`, `rateLimit`, `sha256` and `fail`, and `logMailFailure`'s way of logging.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npx vitest run api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: an emailed code before sign-up, on the account service`.

### Task 4: The app's code request and coded sign-up

**Files:**
- Modify: `src/services/account.ts` (`accountApi.requestCode`), `src/store/accountActions.ts`
- Test: `src/store/accountActions.test.ts` (or the account actions test file)

**Interfaces:**
- **Consumes:** Task 3's route and answers. Task 2's `passwordProblem(password, { username, email })`.
- **Produces:**
  - `accountApi.requestCode(body: { username: string; email: string }): Promise<Reply>` → `POST code`.
  - `AccountActions.requestCode({ username, email }): Promise<void>`. It checks `usernameProblem` and `emailProblem` first, then calls the route. A refusal throws `AccountError`: `taken`, `limited`, `offline` or `unavailable`.
  - `AccountActions.signUp({ username, email, password, code }: { …; code: string }): Promise<void>`. This sends `code` in the body; the rest is as today.
  - New `AccountErrorCode`s:
    - `'code'`: `"That code isn't right. Check the email and try again."` (401 `code`)
    - `'expired'`: `'That code has expired. Send a new one.'` (410 `expired`)
  - The lost-reply path stays as is: a lost first reply, then a retry answering `taken`, then a log-in to confirm.
- [ ] **Step 1: Write the failing tests:**
  - `requestCode` maps 200, 409, 429 (with minutes text) and offline
  - `signUp` with a right code links
  - 401 `code` → `'code'`
  - 410 → `'expired'`
  - `a lost reply after the code still links` (first call throws `NetworkError` after the server made the account; the retry gets 409 `taken`; the log-in confirms)
  - the password rules are applied with the username and email
- [ ] **Step 2: Run** the focused vitest file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the app asks for a code and signs up with it`.

### Task 5: Setup in four steps

**Files:**
- Create: `src/features/account/CodeField.tsx`, with its test
- Modify:
  - `src/features/onboarding/OnboardingWizard.tsx`
  - `src/store/financeActions.ts`: `OnboardingInput`, `completeOnboarding`
  - `src/features/settings/DataSection.tsx` (~:53) and its test (`settings.test.tsx` ~:254)
  - `src/content/help/*` where the old steps are named (`help.test.ts` ~:158)
  - `tests/e2e/helpers.ts`: `onboard()`, `createAccountStep`, and the specs that pass `cash`, `savings`, `salary` or `cards`
  - `tests/e2e/account.spec.ts`: its mock service answers `code` and checks `signup`'s `code`
- Test: `src/features/onboarding/onboarding.test.tsx`, `src/features/account/CodeField.test.tsx`, the e2e specs

**Interfaces:**
- **Consumes:** Task 4's `requestCode`, `signUp({ …, code })` and error codes; Task 2's `PasswordField strength`; 0.13's `row` fields, `PageHeader`-style Back, `page-blobs`.
- **Produces:**
  - `CodeField({ value, onChange, error, label = 'Code' }: { value: string; onChange(v: string): void; error?: string; label?: string })`:
    - one `<input inputMode="numeric" autoComplete="one-time-code" maxLength={6}>` with the accessible name `label`, drawn as 6 boxes
    - paste or autofill keeps digits only, at most 6, so "481 529" and "481-529" fill it
  - `OnboardingInput = { name: string; currency: string }`. `completeOnboarding` writes:
    - the profile, with `salary: null`
    - one account, `MAIN_ACCOUNT_ID` "Main account" (debit, opening balance 0)
    - settings with `defaultAccountId: MAIN_ACCOUNT_ID`
    - no Savings, no cards
  - **The wizard's steps:**
    1. **Account:** username, email, password with the strength bar. Continue calls `requestCode`; "taken" shows on the username.
    2. **Code:**
       - eyebrow "Security", title "Check your email"
       - lead `` `We sent a 6-digit code to ${email}. Your account is made once you type it.` ``
       - the `CodeField`
       - "Send a new code", disabled for 30 s after each send
       - hint "The code works for 10 minutes. Wrong email? Go back and fix it."
       - the button "Verify", which calls `signUp`
    3. **Currency and name:** unchanged.
    4. **Lock:** unchanged.

    Then "You're all set" as today. The progress bar runs over 4 steps.
  - **Kept:**
    - "Skip for now" (offline, or service failure) on step 1 goes to step 3 with no account
    - a linked account (after Delete all data, or a log-in over setup) also goes from step 1 to step 3
    - "I already have an account" (log-in) is kept
  - **Look:** setup uses the light page with `page-blobs` (no moving `Blobs`), a round glass Back, a `text-page` title, `row` fields and a solid Continue, as the mockup draws.
  - **New copy for Delete all data:** `` `…You stay logged in as ${username}, and your name, currency, lock and settings stay. Setup then asks for your currency and name again.` ``. The help text naming the old steps changes to match.
  - **e2e:** `onboard(page, opts)` walks the 4 steps. The specs that set balances, salary or cards set them after setup:
    - balances through `setStartingBalance(page, amount)` (Task 8's Home card), or the Cards tab's add/edit account
    - salary through Settings
    - cards through the Cards tab's Settings

    If a spec only needs data, prefer the demo or a seeded snapshot helper where one exists.
- [ ] **Step 1: Write the failing tests:**
  - `four steps, no money asked`: the labels "In your bank account", "In savings", "Monthly take-home pay" and "Credit cards" never appear. The steps read "Step 1 of 4" … "Step 4 of 4".
  - `asks for a code, then makes the account with it` (fake actions: `requestCode` once with the typed name and email; `signUp` with the code)
  - `pastes a spaced code` ("481 529" → value "481529")
  - `back from the code keeps what was typed`
  - `a wrong code says so and stays`
  - `send a new code waits 30 seconds` (fake timers)
  - `a taken name shows on the username field`
  - `offline at the account step offers Skip for now`
  - `a linked account skips the code step`
  - `completeOnboarding makes Main account at 0 and nothing else` (financeActions test)
  - e2e: `account.spec` creates an account through the code step against its mock service. The mock's `code` route answers 200, and its `signup` route accepts only the code `'123456'`, answering 401 `{ error: 'code' }` otherwise. One test types a wrong code first. `onboard()` users stay green.
- [ ] **Step 2: Run** the focused vitest files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: setup in four steps, with an email code and no money questions`.

### Task 6: Create an account from Settings, in two steps

**Files:**
- Modify: `src/features/settings/AccountSection.tsx` (the Create-account dialog, ~:24-100)
- Test: `src/features/settings/AccountSection.test.tsx`, `tests/e2e/account-settings.spec.ts`

**Interfaces:**
- **Consumes:** Task 4's actions; Task 5's `CodeField`; Task 2's `PasswordField strength`.
- **Produces:** the Create-account sheet: step 1 is username, email and password, then Continue (`requestCode`). Step 2 is the code (the same copy as setup's code step), then Verify (`signUp`).
  - Back returns to step 1 with the fields kept.
  - It uses `row` fields. The email's long label "Email (for "forgot password")" becomes `Email`, with the hint `'For "forgot password".'` under it, so the row has room. This answers 0.13's R9.
- [ ] **Step 1: Write the failing tests:**
  - `creates an account with a code from Settings`
  - `back keeps what was typed`
  - `a wrong code stays on the code step`
  - `the email row has its hint`
- [ ] **Step 2: Run** the focused files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the e2e `account-settings` and `account` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Create account in Settings asks for the email code too`.

### Task 7: Welcome, log-in, forgot password, lock and the Erase dialog in glass

**Files:**
- Modify:
  - `src/features/welcome/WelcomeScreen.tsx`
  - `src/features/account/LoginScreen.tsx`, `ForgotScreen.tsx`, `parts.tsx`
  - `src/features/lock/LockScreen.tsx`, `PinPad.tsx`
  - `src/features/system/EraseDialog.tsx`
- Test: their test files, `tests/e2e/contrast.spec.ts`

**Interfaces:**
- **Consumes:** 0.12's `bg-head` block (`HeadBlock` or its classes) and `page-blobs`; 0.13's `PageHeader`, `row` fields, `PasswordField variant="row"`, the glass `Button` variants and the quiet text-button idiom (Quests' "Give up").
- **Rules:**
  - **Welcome and lock:** the `bg-head` block with its glow shapes for the hero, as on Home and Profile.
    - Welcome keeps its two actions and "Try with demo money". 0.13's R4: its ghost pill becomes the quiet text-button idiom.
    - Lock's PIN pad and "Use fingerprint or face" sit on it. "Forgot your PIN?" becomes the quiet text-button, so there is no glass inside glass.
  - **Log-in and forgot password:** the light page with `page-blobs`, a round glass Back, a `text-page` title, `row` fields and a solid main button. "Skip the lock" (a ghost) becomes the quiet text-button.
  - **Erase dialog:** its field becomes `row` (0.13's R9).
  - Copy and behaviour stay.
- [ ] **Step 1: Update tests:** every behaviour test keeps passing unchanged in what it asserts. Add class pins: welcome and lock carry `bg-head`; the log-in fields are `row`; the Erase field is `row`.
- [ ] **Step 2: Run** them. Expected: FAIL on the new pins.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the e2e `account`, `security`, `lock` (if present) and `contrast` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: welcome, log-in, lock and erase in glass`.

### Task 8: Home's first-time cards, and Move money with one account

**Files:**
- Create: `src/features/dashboard/FirstSteps.tsx`, `src/features/dashboard/StartBalanceSheet.tsx`
- Modify:
  - `src/features/dashboard/DashboardScreen.tsx`: place `FirstSteps` above Overview, with the banners
  - `src/store/financeActions.ts`
  - `src/features/dashboard/MoveMoneyDialog.tsx`
  - `src/features/goals/PayDialog.tsx`
- Test: `src/features/dashboard/dashboard.test.tsx`, `src/store/financeActions.test.ts`, `src/features/goals/goals.test.tsx`

**Interfaces:**
- **Produces:**
  - `setOpeningBalance(accountId: string, amount: number): Promise<Account>`: sets an account in use's `openingBalance` (and `updatedAt`), and nothing else.
  - **`FirstSteps`:** real data only (not the demo). Two quiet cards, as plain glass tiles with a title, a muted line, a solid action and a quiet "Not now":
    - **"What's in your Main account?"**
      - line: "Set its starting balance so Funcial starts from the right number."
      - action: "Set balance", which opens `StartBalanceSheet` (a `Sheet` with `MoneyField size="hero"` labelled "Starting balance", and Save → `setOpeningBalance(MAIN_ACCOUNT_ID, amount)`)
      - shown only while: Main account exists, is in use, has `openingBalance === 0`; and there is no expense, income or transfer; and `safeStorage` `funancial.first.balance` ≠ `'1'`
    - **"Got subscriptions?"**
      - line: "Add Netflix, Spotify and the rest. You pick the card each one is paid with right there."
      - action: "Add a subscription", which opens the subscription form
      - shown only while: there are no subscriptions, and `funancial.first.subscriptions` ≠ `'1'`
    - "Not now" sets its key to `'1'`.
  - **Move money with one account:** where the "to" picker has no account to choose, `MoveMoneyDialog` and goals' `PayDialog` show `'Add another account on the Cards tab to move money between them.'` in place of the picker's "Pick an account." error. Their Save stays disabled.
  - **e2e helper:** `setStartingBalance(page, amount: string)` (in `tests/e2e/helpers.ts`) uses Home's card. Task 5's `onboard` users that need a balance call it.
- [ ] **Step 1: Write the failing tests:**
  - `asks for the starting balance after setup`
  - `the balance card goes once it is set`
  - `no first steps once something is logged` (an expense exists → neither balance card nor, with a subscription, the subscriptions card; the 0.13-upgrader case)
  - `Not now is remembered`
  - `the subscriptions card opens the form`
  - `the demo shows no first steps`
  - `setOpeningBalance changes only the opening balance`
  - `Move money with one account explains why`
- [ ] **Step 2: Run** the focused files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the e2e `finance`, `demo` and `contrast` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Home asks for the starting balance and subscriptions, softly`.

### Task 9: "+ New card" in a subscription

**Files:**
- Modify:
  - `src/features/shared/AccountField.tsx`
  - `src/features/subscriptions/SubscriptionDialog.tsx`
  - `src/store/financeActions.ts`: `SubscriptionInput`, `saveSubscription`
- Test: `src/features/subscriptions/subscriptions.test.tsx`, `src/store/financeActions.test.ts`

**Interfaces:**
- **Produces:**
  - `AccountField` takes `newCard?: boolean`. When set, the list ends with an option labelled `'+ New card'` whose value is the exported constant `NEW_CARD = 'new-card'`. Only the subscription form sets it.
  - `SubscriptionInput.newCard?: { name: string; last4: string | null; kind: 'debit' | 'credit' }`.
    - When set, `saveSubscription` creates the account, then the subscription on it, in ONE `putMany`, and `input.accountId` is ignored.
    - The account is a new one through the same rules as `saveAccount`: its kind's skin and Available choice, opening balance 0, opened today, ordered last.
    - A credit card gets terms `{ limit: null, statementDay: null, dueDay: null, payInFull: false, minimumPayment: 0, interestRate: 0 }`.
    - An edit of an existing subscription can also pick "+ New card".
  - **In the form:** picking "+ New card" shows, right under "Paid with":
    - Name (row, required: `'Name the card.'`)
    - Last 4 (row, optional, 4 digits: the AccountDialog's existing rule and message)
    - Kind as `RadioGroup variant="pills"`: Debit (default) / Credit
- [ ] **Step 1: Write the failing tests:**
  - `a subscription can make its card` (the account and subscription exist after one save, with the subscription on the new account)
  - `no card without the subscription` (cancel → no account)
  - `a new credit card has no limit and no due day`
  - `the card needs a name`
  - `only the subscription form offers + New card` (the expense form's picker has no such option)
- [ ] **Step 2: Run** the focused files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`, then the e2e `finance` and `cards` specs. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: make a card right inside a subscription`.

### Task 10: Contrast, version 0.14, everything green

**Files:**
- Modify: `tests/e2e/contrast.spec.ts`, `android/app/build.gradle`
- Test: the whole suite

- [ ] **Step 1:** Extend the axe scans to the new states in Black & White, Sunny Sky and Midnight Navy, each in both modes:
  - setup's four steps, including the code step with an error
  - the welcome and lock screens
  - log-in and forgot password
  - Home's first-time cards and the starting-balance sheet
  - the subscription form with "+ New card" open
  - the Create-account sheet's code step

  Fix violations with tokens, never by weakening the scan.
- [ ] **Step 2:** Set `versionCode 14` and `versionName "0.14"`, then run `npm run typecheck && npm run lint && npm test && npm run test:e2e`. Expected: all PASS.
- [ ] **Step 3: Commit:** `chore: version 0.14 (versionCode 14) for the shorter sign-up`.

Then:
- the final whole-branch review, one fix wave, and the report
- ask the owner before the Vercel deploy of the `code` route and the `signup` change
- only after the deploy, install on the phone
