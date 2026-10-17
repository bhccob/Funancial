# Funancial M9: Accounts, a Premium Welcome and Setup, and a Bigger Invest Pie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends make an account (username, email, password) so a new phone can log in and get everything back, with an email "forgot password" that keeps their data. The welcome screen, the setup and the Invest pie get their approved redesigns.

**Architecture:**
- **Encryption on the phone.** The phone encrypts a compressed copy of the data with a random data key (DEK). It stores that key twice: once wrapped by a key derived from the password, once wrapped by the server's master key.
- **Server.** The Vercel service keeps accounts and copies in Upstash Redis. It sends reset emails from the owner's Gmail, and lets a reset page re-wrap the DEK under a new password.
- **App.** A small account layer uploads the copy after changes, with a version check so nothing older overwrites newer.

**Tech Stack:**
- App (unchanged): React 19 + TS + zustand + zod 4, Capacitor 8 Android, WebCrypto (PBKDF2, HKDF, AES-GCM), and `CompressionStream`.
- Server: Node on Vercel functions, with `@upstash/redis` and `nodemailer`. Server-only, exact pinned versions from 2024–2025.
- Page: the existing `site/` Vite build, with a new `reset` entry.

**Spec:** `docs/superpowers/specs/2026-10-17-funancial-accounts-and-polish-design.md` (owner-approved 2026-10-17). The approved prototypes are git-ignored scratch on the owner's computer. Copy their feel, not their code:
- `.superpowers/brainstorm/17180-1792238596/content/welcome-options.html` (option A);
- `.superpowers/brainstorm/17180-1792238596/content/setup-slides-v2.html` ("New step from below");
- `.superpowers/brainstorm/17180-1792238596/content/invest-pie-v2.html`.

## Calls this plan makes

1. **Key derivation.**
   - `master = PBKDF2-SHA256(password, salt = SHA-256(utf8("funancial-account:" + username.toLowerCase())), 600_000 iterations, 256 bits)`.
   - `authKey = HKDF-SHA256(master, info "funancial auth")`: 32 bytes, base64, sent at sign-up and log-in.
   - `kek = HKDF-SHA256(master, info "funancial enc")`: an AES-GCM-256 key that never leaves the phone or the reset page.
   - The salt comes from the username, so log-in needs no first request that would reveal whether a username exists.
2. **The server never stores `authKey`.** It stores `scrypt(authKey, randomSalt16, N=16384, r=8, p=1, 32)` and compares in constant time.
3. **The DEK is a random AES-GCM-256 key.**
   - `wrappedPw` is AES-GCM(kek) over the raw DEK.
   - `wrappedServer` is AES-GCM(`SERVER_MASTER_KEY`) over the raw DEK, made on the server. At sign-up the phone sends the raw DEK over TLS once. The spec accepts that the service can unlock data.
4. **The copy.** It is the snapshot JSON, without any account state, then gzip (`CompressionStream`), then AES-GCM(DEK) with a 12-byte IV, then base64. The server refuses copies whose ciphertext exceeds 1,000,000 bytes, answering 413.
5. **Device token.** It is 32 random bytes (base64url), and the server stores its SHA-256. A log-in issues a new one, so the old phone's token stops working; that is the takeover.
6. **Versions.** Each copy has a `version` (an integer from 0). `PUT /api/copy` carries `baseVersion` and succeeds only when `baseVersion === stored version`, otherwise 409. Success returns `version + 1`.
7. **Endpoints.** They are flat files, so `vercel.json`'s `api/*.ts` still covers them.
   - **`POST /api/signup`** takes `{username, email, authKey, dek}` and returns `{deviceToken}`. An initial copy follows via `PUT /api/copy` with `baseVersion` 0.
   - **`POST /api/login`** takes `{username, authKey}`.
     - It returns `{deviceToken, wrappedPw, copy: {iv, ciphertext, version} | null}`.
     - A wrong password and an unknown user both give 401 with the same body.
   - **`PUT /api/copy`** (Bearer device token) takes `{baseVersion, iv, ciphertext}` and returns `{version, savedAt}`.
   - **`DELETE /api/copy`** (Bearer) deletes the account entirely and returns 204.
   - **`POST /api/password`** (Bearer) takes `{oldAuthKey, newAuthKey, newWrappedPw}` and returns 204.
   - **`POST /api/forgot`** takes `{who}` (a username or an email) and always returns 200 `{ok: true}`.
   - **`GET /api/reset?token=`** returns `{username}`, or 410 when the token is expired or used.
   - **`POST /api/reset`** takes `{token, newAuthKey, kek}`. The server unwraps the DEK with the master key, re-wraps it with `kek`, sets the new auth hash, and burns the token. It returns 204.
   - **`GET /api/logo?symbol=`** returns image bytes, `Cache-Control: public, s-maxage=604800`, or 404.
8. **The shared `X-Funancial-Token` stays required on every endpoint except `/api/reset`.**
   - On `/api/reset`, the emailed 256-bit reset token is the proof, and the 20-per-IP-per-hour limit applies. That way the public reset page never carries the shared token.
   - CORS allows `GET, POST, PUT, DELETE, OPTIONS` and the headers `X-Funancial-Token, Authorization, Content-Type`.
9. **Rate limits** use Upstash `INCR` + `EXPIRE` keys `rl:{bucket}:{subject}`:
   - login: 10 per username and 30 per IP per 15 min;
   - signup: 5 per IP per hour;
   - forgot: 3 per subject and 10 per IP per hour;
   - reset: 20 per IP per hour.

   Over the limit gives 429 with `Retry-After`.
10. **Redis keys.**
    - `acct:u:{username}` holds the account: `{username, email, authHash, authSalt, wrappedPw, wrappedServer, deviceTokenHash, version, createdAt}`.
    - `acct:e:{email}` is a set of usernames.
    - `acct:c:{username}` holds the copy: `{iv, ciphertext, version, savedAt}`.
    - `acct:r:{sha256(token)}` holds the username, with a 1800 s TTL.

    Usernames and emails are stored lower-cased.
11. **Account rules.**
    - Username: `^[a-z0-9._-]{3,30}$`, after lower-casing.
    - Password: at least 10 characters (checked on the phone and the reset page).
    - Email: zod `.email()`, at most 254 characters.
12. **Phone-side account state** is `{username, email, deviceToken, dek (raw, base64), version, savedAt, status: 'linked' | 'moved'}`.
    - It is stored encrypted with the vault's data key in the vault's `MetaStore` under `funancial.account`, per namespace. The demo namespace never has one.
    - It is never part of the snapshot, a `.funbak` or an upload.
13. **Upload timing.** The phone uploads 30 s after the last data change, on `platform.onPause`, and on the browser `online` event, only when something changed since the last good upload. A 409 or 401 sets `status: 'moved'`. Network errors retry on the next trigger.
14. **Environment** (the owner sets these in Vercel; never in the repo):
    - `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which Vercel's Upstash integration adds;
    - `GMAIL_USER` and `GMAIL_APP_PASSWORD`;
    - `SERVER_MASTER_KEY` (base64 of 32 random bytes).

    The mailer and store read them at call time. A missing value gives 503 `{error: 'not configured'}` without echoing anything.
15. **Reset email.**
    - From: `Funancial <GMAIL_USER>`.
    - Subject: `Choose a new Funancial password`.
    - Text: `Hi {username}, tap the link to choose a new password. It works for 30 minutes.\n\nhttps://funancial.vercel.app/reset?token={token}\n\nIf you didn't ask for this, ignore this email.`
16. **Version numbers.** Release 0.8 is rebuilt after this plan (M8 Task 5). The unpublished local `site/public/get/latest.json` is deleted first.

## Global Constraints

- **No secret ever appears in logs, responses, the repo or chat.** That covers the password, `authKey`, `kek`, the DEK, `SERVER_MASTER_KEY`, `GMAIL_APP_PASSWORD`, device tokens and reset tokens. Error responses are generic `{error}` strings.
- **Nothing in the demo namespace is ever uploaded**, and demo never has account state.
- **Day-to-day unlocking (PIN and fingerprint) is unchanged.** The account password is only for log-in, change password and reset.
- **`.funbak` backup and restore keep working exactly as today.**
- **Restoring a copy** goes through the same path as a `.funbak` restore: `migrateSnapshot` then the repository's `replaceAll`.
- **UI.**
  - Open style, line fields and 44px targets.
  - Motion only under `motion-safe:`. Reduced motion gets a plain cross-fade.
  - Money only through the money formatter.
- **Copy (verbatim):**
  - **Welcome:** title `Funancial`; line `Level up your real financial life.`; buttons `Create an account`, `I have an account` and `Try with demo money`; footer `Funancial helps you track and plan your money. It isn't financial advice.`
  - **The setup's account step:**
    - title `Create your account`;
    - lead `So you can move to a new phone and keep everything.`;
    - fields `Username`, `Email (for "forgot password")`, `Password`;
    - note `A locked copy of your data is kept so you can move to a new phone.`;
    - offline: `You're offline. Create your account later in Settings.` with the button `Skip for now`.
  - **Log in:** eyebrow `Welcome back`, title `Log in`, link `Forgot password?`.
  - **Replace prompt:** `Replace this phone's data with your account's copy?`
  - **Takeover:** `Your account moved to another phone`, with the buttons `Log in again` and `Keep using without an account`.
  - **Finish:** `You're all set, {name}`.
- **New dependencies:** `@upstash/redis` and `nodemailer` (plus `@types/nodemailer`) for `api/` only. Nothing new enters the app bundle.
- **Commits** end with your model's `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>` trailer.
- **The gate:** `npm test`, `npm run typecheck`, `npm run lint`; UI tasks also run `npm run test:e2e`.

## Review Focus

1. **No path loses data.** Covers:
   - a declined replace;
   - a log-in on a phone with data;
   - an email reset while the active phone keeps uploading;
   - an old phone after a takeover (it can't overwrite: 409);
   - two uploads racing.

   Pinned in Tasks 2 and 4.
2. **Guessing and probing.**
   - Rate limits hold, and the 429 says nothing about the account.
   - Forgot always answers the same.
   - Log-in failure is identical for an unknown user and a wrong password, compared in constant time.
   - Reset tokens are single-use and expire at 30 min.

   Pinned in Tasks 2 and 3.
3. **No secret in any log or response.** A test spies on `console.*` across every endpoint's failure paths and asserts no secret value appears. Pinned in Tasks 2 and 3.
4. **Demo and backups stay clean.** Demo never uploads. Account state is absent from snapshots, `.funbak` files and uploads. Pinned in Task 4.
5. **Offline and a down service never block the app.** Setup offers Skip only offline. Uploads retry later. A service answering 503 shows a calm message and the app works on. Pinned in Tasks 4 and 5.

---

### Task 1: Account crypto on the phone

**Files:**
- Create: `src/data/accountCrypto.ts`, `src/data/accountCrypto.test.ts`

**Interfaces:**
- Produces:
  - `deriveAccountKeys(username: string, password: string, iterations = 600_000): Promise<{ authKey: string; kek: CryptoKey }>`
  - `newDek(): Promise<{ key: CryptoKey; raw: string }>`
  - `wrapDek(raw: string, kek: CryptoKey): Promise<{ iv: string; ciphertext: string }>`
  - `unwrapDek(w: { iv: string; ciphertext: string }, kek: CryptoKey): Promise<CryptoKey & { raw: string }>`. Throws `DecryptError` on a wrong key.
  - `sealCopy(snapshot: DataSnapshot, dek: CryptoKey): Promise<{ iv: string; ciphertext: string }>`
  - `openCopy(sealed: { iv: string; ciphertext: string }, dek: CryptoKey): Promise<unknown>`, which returns the parsed JSON for `migrateSnapshot` to read.
  - The same derivation must run in the reset page, so the module imports nothing app-only (no React, no store).

- [ ] **Step 1: Write the failing tests** (use `iterations = 1000` in tests):
  - The same username (in any case) and password give the same `authKey`, and a different password gives a different one.
  - `authKey` is 44 base64 characters.
  - `wrapDek` then `unwrapDek` round-trips.
  - The wrong password's `kek` throws `DecryptError`.
  - `sealCopy` then `openCopy` round-trips a fixture snapshot.
  - Two seals of the same snapshot differ (fresh IV).
  - The default iteration count is 600,000. Read it from the function's `.length` or an exported `KDF_ITERATIONS` constant.
- [ ] **Step 2: Run** `npx vitest run src/data/accountCrypto.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with WebCrypto `crypto.subtle` (PBKDF2, HKDF, AES-GCM) and `CompressionStream('gzip')` / `DecompressionStream`. Reuse `bytesToBase64`, `base64ToBytes`, `randomBytes` and `DecryptError` from `src/data/crypto.ts`.
- [ ] **Step 4: Run the gate.**
- [ ] **Step 5: Commit** `feat: account keys and sealed copies on the phone`.

---

### Task 2: The account service — sign-up, log-in, copies, password, delete

**Files:**
- Create:
  - `api/_lib/store.ts`: the `KvStore` interface, the Upstash implementation, and `memoryKvStore()` for tests.
  - `api/_lib/accounts.ts`: pure handlers over a `KvStore` and a clock.
  - `api/_lib/rateLimit.ts`.
  - `api/signup.ts`, `api/login.ts`, `api/copy.ts`, `api/password.ts`.
  - `api/_lib/accounts.test.ts`.
- Modify: `api/_lib/http.ts` (CORS methods and headers; a JSON body reader with a size cap), `package.json` (`@upstash/redis`).

**Interfaces:**
- Produces:
  - `KvStore`: `get`, `set` (with optional `ex` seconds), `del`, `incr`, `expire`, `sadd`, `smembers`, `srem`.
  - `createAccounts(deps: { store: KvStore; masterKey: Uint8Array; now: () => number; mailer?: Mailer })` exposes `signup`, `login`, `putCopy`, `deleteAccount` and `changePassword`. Each returns `{ status, body }`. Task 3 adds the methods that use `mailer`.
  - `rateLimit(store, bucket, subject, limit, windowSec): Promise<{ ok: true } | { ok: false; retryAfter: number }>`.
  - Task 3 reuses `unwrapServer(account, masterKey)` and `rewrapPassword`.

- [ ] **Step 1: Write the failing tests** against `memoryKvStore()` and a fake clock:
  - **Sign-up.**
    - It stores lower-cased names, refuses a taken username (409 `{error:'taken'}`), and refuses a bad username, email, or a missing `dek` (400).
    - `wrappedServer` unwraps back to the sent `dek`.
    - The stored record holds no `authKey`, no raw `dek` and no plain device token.
  - **Log-in.**
    - A right key returns a token, `wrappedPw` and the copy.
    - A wrong key or an unknown user each return 401 with identical bodies.
    - A new log-in rotates the token, so the old token's `putCopy` gets 401.
  - **`putCopy`.**
    - `baseVersion` equal → `version + 1`; stale → 409.
    - Over 1,000,000 bytes of ciphertext → 413.
    - A missing or wrong Bearer → 401.
  - **`changePassword`** with a right old key swaps the hash and `wrappedPw`. A wrong old key gives 401 and changes nothing.
  - **`deleteAccount`** removes the account, the copy and the email-set entry.
  - **Rate limits.**
    - The 11th log-in for one username within 15 min gives 429 with `Retry-After`.
    - The window resets after it ends.
    - Sign-up limits apply per IP.
  - **Secrets (Review Focus 3).** With `console` spied, run every failure path and assert no `authKey`, `dek`, token or master key text was logged or returned.
- [ ] **Step 2: Run** `npx vitest run api/_lib/accounts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The handler files parse JSON with a 1.5 MB cap, take the IP from `x-forwarded-for`, and call `createAccounts` with the Upstash store built from `KV_REST_API_URL` / `KV_REST_API_TOKEN` and `SERVER_MASTER_KEY`.
  - A missing env gives 503 `{error:'not configured'}`.
  - Use Node `crypto` for scrypt, `timingSafeEqual`, AES-GCM and random bytes.
- [ ] **Step 4: Run the gate**, including the existing api tests.
- [ ] **Step 5: Commit** `feat: accounts and locked copies on the service`.

---

### Task 3: Forgot password — the email and the reset page

**Files:**
- Create:
  - `api/_lib/mailer.ts`: a `Mailer` interface, a Gmail implementation via `nodemailer` with `service: 'gmail'`, and `fakeMailer()`.
  - `api/forgot.ts`, `api/reset.ts`, `api/_lib/reset.test.ts`.
  - `site/reset/index.html`, `site/reset/main.ts`, `site/reset/main.test.ts`.
- Modify: `package.json` (`nodemailer`, `@types/nodemailer`), `site/vite.config.ts` (add the `reset` input), `api/_lib/accounts.ts` (`forgot`, `resetInfo`, `reset`), `vercel.json` (no-cache on `/reset`).

**Interfaces:**
- Consumes: Task 2's `createAccounts`, `rateLimit` and `KvStore`, and Task 1's `deriveAccountKeys` (imported by the reset page through the `@` alias).
- Produces: `forgot(who, ip)`, `resetInfo(token, ip)` and `reset(token, newAuthKey, kekRaw, ip)` on `createAccounts`, using `deps.mailer`.

- [ ] **Step 1: Write the failing tests:**
  - **`forgot`.**
    - It returns 200 `{ok:true}` for a known username, a known email, and an unknown subject.
    - Only known subjects send mail. With `fakeMailer`, check that the email text matches Call 15 exactly and the link carries a token.
    - An email naming two accounts sends one email per account.
    - Rate limits: the 4th per subject per hour gives 429.
  - **`resetInfo`.** It returns `{username}`. After 1800 s, or after use, it returns 410.
  - **`reset`.**
    - Afterwards, log-in with the new key works and log-in with the old key gives 401.
    - `unwrapDek` of the new `wrappedPw` with the new `kek` gives the original DEK, so the data is kept.
    - The device token still works, so the active phone keeps uploading.
    - A second use of the token gives 410.
  - **The reset page** (jsdom, with fetch stubbed):
    - It shows `Choose a new password for {username}` and two password fields.
    - A password under 10 characters, or two that don't match, gives an inline error.
    - On success it shows `Your password is changed. Log in on your phone with the new one.`
    - An expired link shows `This link has expired. Ask for a new one in the app.`
    - The page sends `kek` exported raw (base64) plus `newAuthKey`, and never the password.
  - **Secrets.** No token, kek or app password appears in logs or responses.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page reuses the download page's look (blobs, Manrope, tokens) and line fields, with `noindex`.
  - It calls `/api/reset` without the shared token (Call 8). Add a test that `/api/reset` needs no `X-Funancial-Token` while the other account endpoints still require it.
- [ ] **Step 4: Run the gate and the site e2e.**
- [ ] **Step 5: Commit** `feat: forgot password by email, and the reset page`.

---

### Task 4: The app's account layer — link, upload, take over, Settings

**Files:**
- Create: `src/services/account.ts`, `src/store/accountActions.ts`, `src/store/useAccount.ts`, `src/features/settings/AccountSection.tsx`, plus tests.
- Modify:
  - `src/store/appStore.ts`: a hook point to notify the account layer of data changes. Reuse the existing data-change signal (`announceDataChange`/`settle`) rather than adding one.
  - `src/features/settings/SettingsScreen.tsx`.
  - `src/features/dashboard/DashboardScreen.tsx`: the one-time reminder.

**Interfaces:**
- Consumes: Task 1's crypto and Task 2's endpoints.
- Produces:
  - `createAccountActions(store, api, platform)` exposes:
    - `signUp({username, email, password})`;
    - `logIn({username, password}, { replace: boolean })`, which returns `'needs-confirm' | 'done'`;
    - `changePassword(old, next)`;
    - `deleteAccount()`;
    - `saveNow()`.
  - `useAccount(): { state: AccountState | null; lastSaved: string | null; status: 'linked' | 'moved' | 'none'; offline: boolean }`.
  - `AccountState` is as in Call 12. It is stored with `encryptRecord` under `funancial.account` in `MetaStore`, per namespace.

- [ ] **Step 1: Write the failing tests** with a real store (`freshRealStore`), a fake API and a fake clock:
  - **Sign-up.**
    - It stores the account state encrypted. The meta value is not plain JSON and holds no username text.
    - It uploads version 0, and later changes upload after 30 s.
    - No upload happens when nothing changed.
  - **Demo (Review Focus 4).** In the demo namespace, sign-up is refused and nothing ever uploads.
  - **`logIn` on an empty install.** It restores through `migrateSnapshot` → `replaceAll` and returns `'done'`.
  - **`logIn` on a phone with data.**
    - It returns `'needs-confirm'` and changes nothing.
    - With `{replace:true}` it restores.
    - A declined confirm leaves the data and no account state.
  - **Takeover.** A 409 or 401 on upload sets `status 'moved'` and stops uploads. The local data is untouched.
  - **Clean copies.** Neither a `.funbak` export nor an upload body contains `funancial.account` or the DEK.
  - **Retries.** A network error retries on the `online` event and on `onPause`. A 503 shows `Saving your copy isn't working right now. Your data is safe on this phone.` once, not on every try.
  - **AccountSection.**
    - With no account it shows Create account / Log in.
    - Linked, it shows the username, the email and `Last copy saved {time}`, plus Change password and `Turn off and delete my copy` (which confirms first).
    - Moved, it shows the takeover copy and its two buttons.
  - **The Home reminder** shows once for a real-data install without an account, and never in demo.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate and e2e.**
- [ ] **Step 5: Commit** `feat: the app keeps a locked copy, and moves between phones`.

---

### Task 5: Welcome A, setup "from below", and Log in in the app

**Files:**
- Modify: `src/features/welcome/WelcomeScreen.tsx`, `src/features/onboarding/OnboardingWizard.tsx`, and their tests.
- Create: `src/features/account/LoginScreen.tsx`, `src/features/account/ForgotScreen.tsx`, a small `src/components/ui/StepMotion.tsx` for the slide, plus tests and e2e (`tests/e2e/account.spec.ts`, which mocks `**/api/**`).

**Interfaces:**
- Consumes: Task 4's `createAccountActions` / `useAccount`.

- [ ] **Step 1: Write the failing tests:**
  - **Welcome.**
    - It shows the verbatim copy and three choices.
    - `Create an account` starts setup at the account step.
    - `I have an account` opens Log in.
    - Demo works as today.
    - The old step 1 is gone, and the footer line is present.
  - **Setup.**
    - There are six steps (account, name and currency, money, salary, cards, lock), then `You're all set, {name}`.
    - The account step validates username, email and password with inline messages.
    - Online, there is no skip.
    - Offline (stub `navigator.onLine` false), it shows the offline line and `Skip for now`.
    - On Next, the new step has the motion class for "enter from below" under `motion-safe`, and only a fade under reduced motion.
    - Back reverses it, so the step enters from above.
  - **Log in.**
    - A wrong password shows `That username and password don't match.`
    - On a phone with data, it shows the replace prompt (verbatim), and declining keeps the data.
    - Success asks for a new PIN, then shows Home.
  - **Forgot (in the app).** Entering a username or email shows `If that account exists, we've emailed a link. It works for 30 minutes.`
  - **e2e (mobile).**
    - Create an account through setup.
    - Reload with the storage cleared.
    - Log in, and see the same data.
    - Offline setup shows Skip.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, matching the prototypes:
  - Welcome A's blobs, layout and thumb-reach buttons.
  - Steps enter from below (translateY about 70px plus fade) over about 620 ms, while the old step leaves upward.
  - Children stagger about 80 ms apart.
  - The progress bar glides over 700 ms.
  - The blobs shift colour and drift per step.
- [ ] **Step 4: Run the gate and e2e**, and look at 375px in light and dark.
- [ ] **Step 5: Commit** `feat: a calm welcome, setup that rises step by step, and log in`.

---

### Task 6: A bigger Invest pie with company logos

**Files:**
- Create: `api/logo.ts`, `src/components/ui/CompanyLogo.tsx`, `src/services/logo.ts`, plus tests.
- Modify:
  - `api/_lib/yahoo.ts`: `RawProfile.website` from `assetProfile.website`.
  - `src/components/charts/Donut.tsx`: optional outside labels with leader lines and collision dropping.
  - `src/features/invest/HoldingsTab.tsx`: size 220, outside labels, and logos in the legend and holdings rows.

**Interfaces:**
- Produces:
  - `GET /api/logo?symbol=` resolves the profile's website host. It fetches `https://www.google.com/s2/favicons?domain={host}&sz=64` through the existing `safeFetch` and answers the PNG bytes with `Cache-Control: public, s-maxage=604800`, or 404 when there's no website or no icon.
  - `logoUrl(symbol): string`.
  - `CompanyLogo({ symbol, name, color, size })` shows the image, or the first letter on a `color` circle on error or 404.
  - `Donut` gains `outsideLabels?: Array<{ key: string; logo: ReactNode; text: string }>`. Labels sit at each slice's mid-angle just outside the ring, with a leader line. Labels that would overlap are dropped smallest-slice-first.

- [ ] **Step 1: Write the failing tests:**
  - **`api/logo`.**
    - A profile with a website gives image bytes and the cache header, with the fetch mocked.
    - With no website, or with the favicon fetch failing, it gives 404.
    - It requires the token.
  - **`CompanyLogo`** falls back to the letter on image error.
  - **`Donut` outside labels.**
    - Four slices show four labels.
    - Twelve thin slices drop labels so that no two label boxes intersect. Compute boxes in the test from the same geometry helper, exported.
  - **`HoldingsTab`.**
    - The pie is 220.
    - The Other slice's label is the grey `+N` circle with its percentage.
    - Every legend and holdings row starts with a logo.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `allocation()` stays unchanged.
- [ ] **Step 4: Run the gate and e2e**, and look at 375px.
- [ ] **Step 5: Commit** `feat: a bigger Invest pie with company logos`.

---

### Task 7: Say what now happens — privacy wording and the owner's setup guide

**Files:**
- Modify: `src/content/help/legal.ts`, `faq.ts` and `pages.ts` (privacy and terms lines); `site/get/index.html` (the safe section); and their tests.
- Create: `docs/accounts.md`.

**What to write:**
- **Help Privacy.** Replace the "stays on your phone" claims with:
  - Your data lives on your phone, encrypted.
  - If you make an account, a locked copy is kept on the app's service so you can move to a new phone.
  - The email is used only for "forgot password".
  - Because "forgot password" keeps your data, the service can unlock the copy. Only the app's owner runs it.
  - Keep the existing price-service sentence.
- **FAQ.** Add `How do I move to a new phone?`, answered with "log in", and `I forgot my password`, answered with the email link.
- **Download page.** The safe section's privacy line becomes `Your money lives on your phone, encrypted. An account keeps a locked copy so you can move phones. No ads.`
- **`docs/accounts.md`**, for the owner, in plain steps:
  1. Add Upstash Redis from the Vercel dashboard's Storage tab to the `funancial` project.
  2. Turn on 2-step verification, then create a Gmail app password. Add `GMAIL_USER` and `GMAIL_APP_PASSWORD` in Vercel → Settings → Environment Variables.
  3. Generate the master key on this computer with a one-line Node command that prints 32 random bytes in base64, and paste it as `SERVER_MASTER_KEY`. Keep a copy in the password manager: losing it means email resets can't restore data.
  4. Redeploy.
  5. What each secret protects, and that Claude never needs to see any of them.

- [ ] **Steps:**
  1. Update the help and site copy tests first, and watch them fail.
  2. Write the copy and the guide.
  3. Run the gate and the site e2e.
  4. Commit `docs: privacy says what accounts keep, and the owner's setup guide`.

---

### Task 8: Owner setup, live check, then the release (controller with the owner)

- [ ] **Step 1: The owner sets up the three secrets**, following `docs/accounts.md`. Claude confirms only that `npx vercel env ls` lists the names. It never pulls or prints the values.
- [ ] **Step 2: Deploy** with `npx vercel build --prod` then `npx vercel deploy --prebuilt --prod`, after the owner's OK.
  - Live-check: `/api/signup` with a bad body gives 400, and with a missing token gives 401.
  - `/reset?token=x` shows the expired message.
- [ ] **Step 3: Emulator.**
  1. Install a debug build, create an account (`emulatortest1`, using the owner's own email), and add an expense.
  2. Uninstall, reinstall, log in, and see the expense.
  3. Use "Forgot password", and have the owner click the email link and set a new password.
  4. Log in with it and see the data.
  5. Delete the test account from Settings.
- [ ] **Step 4: The owner's phone.** Install the debug build, and the owner creates their account from Settings → Account.
- [ ] **Step 5: M8 Task 5, Step 4 onward.**
  1. Delete the unpublished `site/public/get/latest.json` and `funancial-0.8.apk`.
  2. Run `npm run release:android` with the notes `First release for friends: accounts to move phones, a new welcome and setup, Help, an Inbox, lighter forms, and Buy it?.`
  3. With the owner's OK, deploy and live-check.

## Milestone checkpoint (M9 done)

A friend installs from `/get`, creates an account in a setup that rises step by step, and can move to a new phone or reset a forgotten password by email without losing anything. Invest shows a bigger pie with company logos.
