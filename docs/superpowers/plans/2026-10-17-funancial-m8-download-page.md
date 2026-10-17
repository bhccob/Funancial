# Funancial M8: Download Page for Friends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends open an unlisted page, feel the app is simple and safe, and install Funancial on their Android phone with one tap; their app later says when an update is ready.

**Architecture:**
- **The page.** A second, separate Vite entry under `site/` builds the page at `/get` into `site-dist/`. The 3D scroll story loads only after the title and Download button have painted. Vercel now serves `site-dist/` plus the existing `api/` functions, and `/` redirects to `/get`.
- **Release builds.** A release script signs the APK with the owner's key and writes `latest.json` next to it.
- **Update check.** The app reads `latest.json`, on release builds only, and offers the update in a banner.

**Tech Stack:** React 19 app (unchanged stack); the page is plain TypeScript + Vite with Three.js `0.170.0` (page only); Capacitor 8 Android with Gradle release signing; Vitest; Playwright; Vercel.

**Spec:** `docs/superpowers/specs/2026-10-17-funancial-m8-download-page-design.md`. The approved feel is the spike `.superpowers/brainstorm/8662-1792212727/content/phone-spike-v2.html`, which is git-ignored scratch on the owner's computer. Read it for the timeline and look, and copy its numbers. It is not code to keep.

## Calls this plan makes

1. **The update test runs on a hidden test channel on the live site, not a preview deploy.**
   - Ruling: Vercel puts preview deploys behind its own login, so an emulator can't fetch `latest.json` from one.
   - Test builds bake `https://funancial.vercel.app/get/test/latest.json`. Friends' builds bake `https://funancial.vercel.app/get/latest.json`.
   - Nothing at `/get` changes during the test, and the test files are removed afterwards.
2. **`apkUrl` must have the same origin as the update address the build baked in.** Otherwise the offer is ignored, so a tampered `latest.json` can't point the Update button anywhere else.
3. **No real screenshots on the page.** The spec says "may"; the redrawn screens already show the app.
4. **The page reads `latest.json` at load** for the version, size, download link and what's new. Publishing a release never needs a page rebuild. With no `latest.json`, the button reads `Coming soon` and is disabled.
5. **Deploys use `vercel build` then `vercel deploy --prebuilt`.** The APK and `latest.json` are git-ignored local files that a remote build would not see. Every deploy still waits for the owner's OK.
6. **Version numbers.** The first friend release is `versionCode 8`, `versionName "0.8"`. The emulator test builds use 8 (installed first) and 9 (the update) on the test channel only.

## Global Constraints

- **Hosting.** The page lives at `/get` on `https://funancial.vercel.app`. That address is permanent and baked into every release APK as `https://funancial.vercel.app/get/latest.json`.
- **Unlisted.**
  - `/` redirects (not permanent) to `/get`.
  - Every response carries `X-Robots-Tag: noindex, nofollow`.
  - `robots.txt` disallows `/`.
  - The page has `<meta name="robots" content="noindex">`.
- **The app's web build is no longer deployed.** The price service under `/api/*` keeps answering, with its existing `maxDuration` 10.
- **Two builds, kept apart.** Nothing from `site/` or `site-dist/`, and no APK or `latest.json`, may end up in `dist/`. Capacitor packs `dist/` into the APK.
- **The update check runs only when `import.meta.env.VITE_RELEASE === '1'`.** Only the release script sets it. Debug builds for the owner's phone never check and never show the banner.
- **`latest.json` fields:** `versionCode` (int > 0), `versionName` (1–20 chars), `notes` (≤ 500 chars), `apkUrl`, `sha256` (64 lower-case hex), `size` (bytes, int > 0).
- **The signing key.**
  - The owner creates the key and its password, and Claude never handles the password.
  - Gradle reads the key from a git-ignored `android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
  - `*.jks`, `*.keystore`, `android/keystore.properties`, `site-dist/`, `site/public/get/*.apk` and `site/public/get/**/latest.json` are git-ignored.
- **No new dependency in the app bundle.**
  - `three` `0.170.0` and `@types/three` `0.170.0` are used by `site/` only.
  - `lighthouse` (exact pinned version) is a devDependency for the Task 4 check.
- **Accessibility and motion.**
  - The page works with keyboard and screen reader.
  - With `prefers-reduced-motion: reduce` or no WebGL, Three.js is never loaded and static phone images are shown.
  - 44px touch targets.
- **Page copy (verbatim):**
  - Title `Funancial`, subline `A budget app that stays on your phone.`
  - The four stops: `01 · Home` / `See what you can still spend.` / `One number that already counts your bills, cards and limits.`, then `02 · Budget` / `Limits that tap you on the shoulder.` / `Warnings at 80%, 100% and 120%, before it gets out of hand.`, then `03 · Buy it?` / `Ask before you buy.` / `A meter weighs the purchase against your own numbers.`, then `04 · Levels` / `Level up as you go.` / `Badges, coins and quests for staying on track.`
  - The end: `Get it on your phone.`, the button `Download for Android`, and the meta line `Version {versionName} · {size in decimal MB (bytes ÷ 1,000,000), one decimal} MB`.
  - On a computer: `Scan with your Android phone`. On an iPhone: `Funancial is Android-only for now.`
  - The safe section: `Safe and simple`, `Your money stays on your phone, encrypted. No account, no ads.`, `Not financial advice.`
- **Commits** end with your model's `Co-Authored-By: Claude <Model> 5.5 <noreply@anthropic.com>` trailer.
- **Gate:** every task runs `npm test`, `npm run typecheck` and `npm run lint`. Tasks 2–4 also run `npm run test:e2e`.

## Review Focus

1. **The owner's debug phone never shows the update banner, and never fetches `latest.json`.** This holds even when `latest.json` names a higher version. Pinned in Task 2.
2. **A bad or hostile `latest.json` can't do harm.** Wrong types, a missing field, an `apkUrl` on another origin, http on an https build, a huge `notes`, or a `versionCode` that isn't a number must not show a banner, crash, or open a foreign URL. Pinned in Task 2.
3. **The app's APK stays clean.** After `npm run build`, `dist/` holds no `get/`, no `*.apk` and no `latest.json`. Pinned in Task 3.
4. **The page works without JavaScript extras.** With reduced motion, with WebGL unavailable, or before Three.js has loaded, the title, the Download button and the install steps are visible and usable. Pinned in Tasks 3 and 4.
5. **The release script refuses unsafe states with a clear message:**
   - `keystore.properties` is missing;
   - the `versionCode` is not higher than the one in the existing `latest.json` on that channel;
   - the Gradle build fails;
   - empty notes.

   Pinned in Task 1.

---

### Task 1: Release builds and the release script

**Files:**
- Modify: `android/app/build.gradle` (a `signingConfigs.release` read from `android/keystore.properties` when it exists; `buildTypes.release.signingConfig` uses it), `.gitignore`, `package.json` (script `release:android`)
- Create: `scripts/release-android.mjs`, `tests/unit/releaseAndroid.test.ts`, `docs/release.md`

**Interfaces:**
- Produces:
  - `readVersion(gradleText: string): { code: number; name: string }`.
  - `buildLatest(input: { code: number; name: string; notes: string; origin: string; channel: 'live' | 'test'; apkFile: string; sha256: string; size: number }): Latest`.
    - `apkUrl` is `${origin}/get/${apkFile}` for live and `${origin}/get/test/${apkFile}` for test.
  - `releaseDir(channel): string`, which returns `site/public/get` or `site/public/get/test`.
  - `refuseUnlessNewer(existing: Latest | null, code: number): void`. It throws `Version ${code} is not newer than the published ${existing.versionCode}.`
  - CLI: `npm run release:android -- --notes "<text>" [--channel test]`. Steps in order:
    1. Check `android/keystore.properties` exists.
    2. Read the version from `android/app/build.gradle`.
    3. Refuse if a `latest.json` already in `releaseDir(channel)` has a `versionCode` ≥ this one.
    4. Run `npm run build` with `VITE_RELEASE=1` and `VITE_UPDATE_URL=${origin}/get[/test]/latest.json`.
    5. Run `npx cap sync android`.
    6. Run `gradlew assembleRelease` with `JAVA_HOME` passed through from the environment.
    7. Copy the APK to `releaseDir(channel)/funancial-${name}.apk`.
    8. Write `latest.json` with sha256 and size.
  - `origin` is `https://funancial.vercel.app`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/releaseAndroid.test.ts`:
  - `readVersion` reads `versionCode 8` and `versionName "0.8"`, and throws on text with neither.
  - `buildLatest` gives the live and test `apkUrl`s above.
  - The result parses with `LatestSchema`. Until Task 2 exists, assert the shape inline: field names, `sha256` matching `/^[0-9a-f]{64}$/`, `size > 0`.
  - `buildLatest` throws on empty notes, notes over 500 characters, and `versionName` over 20.
  - A `refuseUnlessNewer(existing: Latest | null, code: number)` helper throws `Version 8 is not newer than the published 8.`
  - A test reads `android/app/build.gradle` and asserts it has a `release` signing config that loads `keystore.properties`, and that release builds use it.
  - A test asserts `.gitignore` covers each pattern in Global Constraints.
- [ ] **Step 2: Run** `npx vitest run tests/unit/releaseAndroid.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the script, the Gradle signing block and the `.gitignore` lines.
  - When `keystore.properties` is missing, the CLI prints how to create the key and exits non-zero. It prints the command only, never a password:

    ```
    keytool -genkeypair -v -keystore C:\Users\<you>\funancial-release.jks -alias funancial -keyalg RSA -keysize 4096 -validity 36500
    ```

    It also prints the four `keystore.properties` lines with placeholders.
  - The key file lives outside the repo.
- [ ] **Step 4: Write `docs/release.md`.** It covers:
  - creating the key, once, by the owner;
  - backing up the key file and the password, and why: losing either means friends must reinstall;
  - raising `versionCode`/`versionName` in `android/app/build.gradle`;
  - `npm run release:android -- --notes "..."`;
  - deploying with `npx vercel build --prod` then `npx vercel deploy --prebuilt --prod`, after the owner's OK;
  - that the owner's own phone stays on `npm run android:run` debug builds;
  - the 2027 Google developer-verification note from the spec.
- [ ] **Step 5: Run the gate.** `npm test && npm run typecheck && npm run lint`. Expected: PASS.

  Don't run the real release here; there is no key yet.
- [ ] **Step 6: Commit** `feat: signed release builds and the release script`

---

### Task 2: The update notice in the app

**Files:**
- Create: `src/domain/update.ts`, `src/domain/update.test.ts`, `src/services/update.ts`, `src/services/update.test.ts`, `src/app/useUpdateOffer.ts`, `src/app/UpdateBanner.tsx`, `src/app/updateBanner.test.tsx`
- Modify:
  - `src/platform/types.ts` (`appVersion`), `src/platform/web.ts`, `src/platform/android/index.ts`, and the test fakes that implement `Platform`;
  - `src/env.d.ts` (`VITE_RELEASE`, `VITE_UPDATE_URL`);
  - `src/app/AppShell.tsx` (mount the banner);
  - `src/content/help/legal.ts` and its test.

**Interfaces:**
- Consumes: the `latest.json` shape from Global Constraints. Task 1's test may switch to `LatestSchema` once this exists.
- Produces:
  - `LatestSchema` (zod) and `type Latest`.
  - `updateOffer(latest: Latest, installedCode: number, dismissedCode: number | null): Latest | null`. It returns `latest` when `latest.versionCode > installedCode` and `latest.versionCode !== dismissedCode`.
  - `updateUrl(): string`. It returns `import.meta.env.VITE_UPDATE_URL || 'https://funancial.vercel.app/get/latest.json'`.
  - `isReleaseBuild(): boolean`.
  - `fetchLatest(url: string, fetchImpl = fetch): Promise<Latest | null>`.
    - It returns `null` on a network error, a non-200 answer, a body that fails `LatestSchema`, or an `apkUrl` whose origin differs from `url`'s.
    - It times out after 5 s and sends no token header.
  - `Platform.appVersion(): Promise<{ code: number; name: string } | null>`. Android reads `App.getInfo()` from `@capacitor/app` (`build` → code, `version` → name); the web returns `null`.
  - `useUpdateOffer(): { offer: Latest | null; dismiss(): void }`.
    - It checks on mount and on `platform.onResume`, and only when `isReleaseBuild()` and `appVersion()` is not `null`.
    - The dismissed code is kept with `safeStorage` under `funancial.update.dismissed`.

- [ ] **Step 1: Write the failing tests.**
  - **Domain:** `updateOffer` covers newer, same, older, and dismissed-this-version. Dismissing an older version still offers a newer one.
  - **`LatestSchema`:** it rejects each bad input in Review Focus 2.
  - **Service:**
    - `fetchLatest` returns the parsed value.
    - It returns `null` on a thrown fetch, a 404, invalid JSON, a schema failure, a foreign-origin `apkUrl`, and `http:` against an `https:` URL.
    - It aborts after 5 s, tested with fake timers.
  - **Hook and banner:**
    - With `VITE_RELEASE` unset, no fetch happens and no banner shows, even with a fake `latest.json` naming code 99. This pins Review Focus 1.
    - With the release flag stubbed on and installed code 8, a `latest.json` with code 9 shows a banner titled `Version 0.9 is ready`, with the notes and an `Update` link whose `href` is `apkUrl`.
    - `Not now` (aria-label `Hide the update notice`) hides it, and it stays hidden for 9 after a remount.
    - A later code 10 shows again.
    - A resume re-checks.
  - **Help:** `LEGAL.privacy` contains `An app installed from the download page also checks that page for a newer version. That check carries nothing about you.`
- [ ] **Step 2: Run** `npx vitest run src/domain/update.test.ts src/services/update.test.ts src/app/updateBanner.test.tsx src/content`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The banner uses the existing gradient `Banner` (tone `info`, with `title`) at the top of AppShell's content, like the reminder banner.
  - `Update` is a plain `<a href={apkUrl}>` styled as the banner's action. On Android, Capacitor opens off-site links in the system browser, and that browser downloads the file.
- [ ] **Step 4: Run the gate and e2e.** The banner never shows in e2e, because e2e builds are not release builds.
- [ ] **Step 5: Commit** `feat: the app says when an update is ready`

---

### Task 3: The page shell, at `/get`

**Files:**
- Create:
  - `site/vite.config.ts`: root `site`, `build.outDir` `../site-dist`, the `@` alias to `src`, and a multi-page input of `site/get/index.html`.
  - `site/get/index.html`, `site/get/main.ts`, `site/get/page.css`.
  - `site/get/platform.ts`, `site/get/latest.ts` and `site/get/screens.ts`, each with a `.test.ts`.
  - `site/get/qr.svg`, `site/public/robots.txt`, `tests/e2e/site/get.spec.ts`.
- Modify:
  - `package.json`: scripts `site:dev`, `site:build`, `site:preview` (port 4174), and the `three` / `@types/three` dependencies.
  - `vercel.json`: `buildCommand` `npm run site:build`, `outputDirectory` `site-dist`, the existing `functions`, `redirects` `/` → `/get` (not permanent), `X-Robots-Tag` on `/(.*)`, and `Cache-Control: no-cache` on `/get/latest.json` and `/get/test/latest.json`.
  - `playwright.config.ts`: a second webServer on 4174 running `npm run site:build && npm run site:preview`, and a `site` project matching `tests/e2e/site/**`. The existing projects ignore that folder.
  - Vitest and lint config so `site/**/*.test.ts` run and lint.
  - `tsconfig` so `site/` typechecks.

**Interfaces:**
- Consumes: `LatestSchema` and `Latest` from `@/domain/update`.
- Produces:
  - `platformOf(userAgent: string): 'android' | 'ios' | 'other'`.
  - `loadLatest(fetchImpl = fetch): Promise<Latest | null>`, which reads the absolute path `/get/latest.json`. It isn't relative, because `/get` without a trailing slash would resolve `./latest.json` to `/latest.json`.
  - `SCREEN = { w: 540, h: 1140 }`.
  - `drawScreen(g: CanvasRenderingContext2D, index: 0 | 1 | 2 | 3, progress: number): void`.
    - It draws Home, Budget, Buy it? or Levels at `progress` from 0 to 1, as in spike v2.
    - The look is the app's Manrope font (via `@fontsource-variable/manrope`, awaited with `document.fonts.load` before drawing) and the app's colours from `src/styles/tokens.css`.
    - The figures are demo money. Use the spike's figures.
  - `mountStaticPhones(container: HTMLElement): void`, which draws all four screens at progress 1 into static phone frames. This is the reduced-motion and no-WebGL view.

- [ ] **Step 1: Write the failing tests.**
  - **`platformOf`:** a Pixel Chrome UA gives `android`. iPhone Safari and iPad (including iPadOS desktop-mode Safari with touch) give `ios`. Windows Chrome gives `other`.
  - **`loadLatest`:** it parses a valid file, and returns `null` on 404 or an invalid body.
  - **`drawScreen`:** it runs at progress 0, 0.5 and 1 for each index against a stub 2D context, without throwing.
  - **e2e** (`tests/e2e/site/get.spec.ts`, with `page.route('**/get/latest.json')` serving a fixture with versionName `0.8` and size `9437184`):
    - The page has `noindex`.
    - An Android UA sees `Download for Android`, whose `href` is the fixture's `apkUrl`, with `Version 0.8 · 9.4 MB`.
    - A desktop UA sees the QR image (alt `QR code for this page`) and `Scan with your Android phone`, plus a direct download link.
    - An iPhone UA sees `Funancial is Android-only for now.` and no download button.
    - With a 404 for `latest.json`, the button reads `Coming soon` and is disabled.
    - With `reducedMotion: 'reduce'`, the four static phones are visible and no `<canvas>` with a WebGL context exists.
    - The install steps are visible.
    - Tab reaches the download button, and it has a visible focus ring.
  - **Review Focus 3:** a unit test runs no build. It asserts that `vite.config.ts` doesn't include `site`, and that `site/vite.config.ts` writes to `site-dist`. The Step 4 gate then checks `dist/` after `npm run build` for no `get/`, no `.apk` and no `latest.json`.
- [ ] **Step 2: Run** the new unit tests and the site e2e project. Expected: FAIL.
- [ ] **Step 3: Implement the page without the 3D story.**
  - The title, the Download area, the four stops as plain sections with their static phones (from `mountStaticPhones`), the safe section, and what's new from `latest.json`.
  - The safe section has two more lines:
    - Why Android asks: Android asks before installing apps that don't come from the Play Store, and that's normal for an app shared between friends.
    - What the app asks for: this must match the permissions in `android/app/src/main/AndroidManifest.xml`; read them, don't guess.
  - Then the install steps:
    1. `Tap Download, then open the file.`
    2. `If Android asks, allow your browser to install apps.`
    3. `Tap Install, open Funancial, and try demo money first.`
  - Generate `qr.svg` once for `https://funancial.vercel.app/get` with a one-off `npx` QR tool, and commit only the SVG. No QR library ships on the page.
  - Use the app's light theme tokens, and the soft gradient background from the spike.
- [ ] **Step 4: Run the gate and both e2e sets.** Then run `npm run build` and check that `dist/` holds no `get`, `.apk` or `latest.json`.
- [ ] **Step 5: Look at it at 375px and 1280px**, then commit `feat: the download page at /get`.

---

### Task 4: The 3D scroll story

**Files:**
- Create: `site/get/story.ts`, `site/get/timeline.ts`, `site/get/timeline.test.ts`
- Modify: `site/get/main.ts`, `site/get/page.css`, `tests/e2e/site/get.spec.ts`, `package.json` (`lighthouse` devDependency, script `site:lighthouse`)

**Interfaces:**
- Consumes: `drawScreen` and `SCREEN` from Task 3.
- Produces:
  - `timeline(p: number): { intro: number; outro: number; stop: 0 | 1 | 2 | 3; hold: number; slide: number }`. It uses the spike v2 constants: intro 0–0.08, four stops of 0.19 each (the first 25% of each turns or slides, the rest holds), outro 0.84–1, and the slide in the last 22% of a stop.
  - `startStory(stage: HTMLElement): () => void`. It builds the scene and returns a cleanup.
  - `main.ts` dynamically imports `story.ts` only when all three hold:
    - `matchMedia('(prefers-reduced-motion: reduce)')` is false;
    - a WebGL context can be created;
    - the first paint has happened (`requestAnimationFrame` after load).

- [ ] **Step 1: Write the failing tests.**
  - **`timeline`:**
    - At 0 everything is 0.
    - At 0.08 intro is 1.
    - At 0.08 + 0.19 × 1.5, `stop` is 1 and `hold` is about 0.33.
    - `slide` is 0 at the start of a hold and greater than 0 near a stop's end.
    - At 0.84, `stop` is 3 and `slide` is 0.
    - At 1, outro is 1.
    - Values outside 0–1 clamp.
  - **e2e:**
    - With motion allowed, after scrolling to 50%, a WebGL canvas exists, and the caption for the stop at that point is visible.
    - Reduced motion still shows no canvas (Task 3's test stays).
    - `three` is not requested under reduced motion: assert no request URL containing `three`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the story** with the spike v2 look:
  - a rounded phone body with `RoomEnvironment` reflections and a camera bump;
  - the live screen canvas redrawn only when the timeline changes, with the slide between screens;
  - the glass sheen;
  - the background shapes drifting;
  - the heavier glide (0.06 per frame);
  - the full turn to the back with `Funancial` on it, then stepping aside for the download block;
  - captions fading and rising per stop;
  - a narrow layout below 760px, with captions under the phone.

  Cap `devicePixelRatio` at 2. Stop the render loop while the tab is hidden.
- [ ] **Step 4: Run the gate and e2e.**
  - Run `npm run site:lighthouse`: mobile form factor against `site:preview`, with Playwright's Chromium as `CHROME_PATH`.
  - Expected: performance ≥ 80 and accessibility ≥ 95. Record the scores in the report.
- [ ] **Step 5: Scroll it at 375px and 1280px** in light mode and compare with the spike. Then commit `feat: the 3D scroll story`.

---

### Task 5: The first release, with the owner

This is the owner's milestone checkpoint. Every deploy waits for the owner's OK in chat.

- [ ] **Step 1: The owner creates the key.**
  - Show them the `keytool` command and the `keystore.properties` lines from `docs/release.md`.
  - They run the command themselves, choose the password, and fill in the file.
  - Never ask for the password and never print the file.
  - Confirm only that `android/keystore.properties` exists and is git-ignored.
- [ ] **Step 2: Emulator test on the test channel.**
  1. Set `versionCode 8` / `"0.8"` and run `npm run release:android -- --channel test --notes "Test build"`.
  2. With the owner's OK, deploy.
  3. Start the `Medium_Phone_API_37.0` emulator. The test channel has no page, so open the test APK link from `site/public/get/test/latest.json` (`https://funancial.vercel.app/get/test/funancial-0.8.apk`) in its browser. Download, install, open, and add one expense.
  4. Set `versionCode 9` / `"0.9"` and release to the test channel again. With the owner's OK, deploy.
  5. Reopen the app on the emulator. Expected: the banner `Version 0.9 is ready`. Tap Update and install.
  6. Expected: the expense is still there, and the installed version is 0.9 (`adb shell dumpsys package io.github.bhccob.funancial | grep versionName`).
- [ ] **Step 3: Clean up.**
  - Delete `site/public/get/test/`, and with the owner's OK redeploy so `/get/test/` is gone.
  - Uninstall the app from the emulator.
  - Set `versionCode 8` / `"0.8"` again.
- [ ] **Step 4: The live release.**
  - Run `npm run release:android -- --notes "First release for friends: Help, an Inbox for missed reminders, lighter forms, and Buy it?."`.
  - With the owner's OK, deploy.
  - Check that `/` redirects to `/get`, that `/get/latest.json` names 0.8, and that `/api/quote?symbols=KO` still answers 200 with the token. Read the token without printing it.
- [ ] **Step 5: On the owner's phone.**
  - Open `https://funancial.vercel.app/get` in the phone's browser: the story plays smoothly, and the button shows `Version 0.8`.
  - Don't install the release over the owner's debug app.
  - Then run `npm run android:run` to put a debug build of this branch on the phone. Confirm no update banner shows.
- [ ] **Step 6: Commit** any fixes as `fix: release findings`, and the version bump as `chore: release 0.8`.

## Milestone checkpoint (M8 done)

Friends get a link that opens a smooth, calm page at `/get`. One tap installs Funancial on their Android phone, and their app says when a new version is ready. The owner's phone keeps working exactly as before.
