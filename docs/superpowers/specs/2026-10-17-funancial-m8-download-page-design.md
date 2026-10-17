# Funancial M8: the download page for friends — design

Status: draft for the owner's approval (2026-10-17). It replaces the original M8 "desktop PWA" in `docs/superpowers/specs/2026-10-14-funancial-design.md`.

## Intent

The owner wants to share Funancial with a few friends. Each friend opens a link the owner sends, feels the app is simple and safe, and installs it on their Android phone. When the owner later releases a new version, the friend's app tells them an update is ready.

**History of this decision.** M8 was planned as a desktop app: a look-only overview board on the computer, fed by a locked, encrypted copy the phone sends to the owner's Vercel service. The owner chose the overview layout (board "B", Available to spend first) and accepted the locked copy. Then the owner decided to drop the computer app entirely: "scrap the computer app and only make the web computer so that user can download the app only". None of the board, the locked copy or the sync is built. Money data still never leaves the phone.

## Who it's for

Friends the owner sends the link to. Nobody else. The page is unlisted, not advertised and not indexed. Friends mostly open the link on their phone, which is where the app must end up.

The friends live in the Netherlands and in Aruba (the owner's answer).

**Google's developer verification.**
- Since 30 September 2026, certified Android phones in Brazil, Indonesia, Singapore and Thailand only install apps from developers registered with Google.
- Neither the Netherlands nor Aruba is in that first wave, so the ordinary "allow installs from this browser" flow works for these friends today.
- Google plans to extend this to every country in 2027. After that, an unregistered app needs Android's "advanced" install flow, which has a 24-hour wait.
- **Revisit before 2027.** Either the owner registers as a developer (there is a limited-distribution route), or the page explains the advanced flow.
- Sources: [Android Developers Blog, June 2026](https://android-developers.googleblog.com/2026/06/android-developer-verification.html); [Android developer verification](https://developer.android.com/developer-verification).

## Goals

1. **Feels simple and safe.** Plain words, a calm "safe and simple" section, honest install steps.
2. **Premium scroll story.** It feels like the approved spike v2 (`.superpowers/brainstorm/…/phone-spike-v2.html`, summarised under "The page" below). The owner's verdict on v2: "feels much much better" than v1, and "smooth".
3. **Download for Android in one tap on a phone.** On a computer, a QR code opens the page on the phone instead.
4. **Updates reach friends.** A friend's app shows "Version X is ready" with an Update button when a newer release is published.
5. **The owner's own phone is unchanged.** It stays on test (debug) builds installed over the USB cable, with no uninstall and no data move. The update banner never shows on a debug build.

## Non-goals

- Any money view on a computer, and any sync or copy of data off the phone.
- iPhone support, the Play Store, accounts, analytics, ads.
- Search-engine visibility.
- Releasing a version from inside the app. Releases are made by the owner, through Claude, on the computer.

## Anti-goals (a failure even if it technically works)

- The page feels sketchy or pushy: fake badges, scare text, claims the app can't back up such as "virus-scanned" or "certified".
- The animation is janky on a mid-range Android phone, or the page is heavy to load on mobile data.
- Any screenshot or screen shows the owner's real numbers.
- An update wipes a friend's data, or the Update button offers something that won't install.
- The owner's phone shows an update banner it can't act on.

## Constraints

- **Hosting.**
  - The page is served by the existing Vercel project `bhccob/funancial` (https://funancial.vercel.app), on the path `/get`.
  - **The main address `/` sends visitors to `/get`** (the owner's answer). The app's full web build stops being served from Vercel. The price service under `/api/*` keeps working.
  - Playwright e2e keeps running the app locally (`vite preview`), so it isn't affected.
  - The whole origin carries `noindex`, and `robots.txt` disallows everything.
  - **The address is permanent** (the owner's answer). `https://funancial.vercel.app` is baked into every APK as the update address. Renaming or deleting the Vercel project would silently end updates for everyone who installed.
  - Deploying always waits for the owner's OK.
- **Two builds, kept apart.**
  - Capacitor packs everything in `dist/` (its `webDir`) into the APK. The page, the APK file and `latest.json` must therefore never land in `dist/`.
  - Otherwise each APK would carry the page and the previous APK.
  - The page has its own build output, and Vercel deploys that output plus `api/`.
- **Release builds are marked at build time.**
  - The web code is the same for debug and release builds. The update check therefore needs a flag set when the release APK is built, e.g. a Vite mode or env value the release script sets, or a native `BuildConfig.DEBUG` read.
  - The check runs only when that flag says "release".
- **The download file.**
  - It's a **release** APK, signed with a release key that belongs to the owner.
  - **The owner creates the key and its password themselves**, with one command Claude gives them, and keeps both safe: the password in their password manager, the key file backed up off the computer.
  - The build reads the key through a git-ignored `android/keystore.properties`. Claude never handles the password.
  - Losing the key means friends can't update without uninstalling, which wipes their data (a backup restores it). The page and the release notes must not depend on Claude remembering this; it goes in the release doc.
- **Version numbers.**
  - Every release raises Android `versionCode`. M7 set it to 7, and the first friend release will be 8 or higher.
  - Debug builds for the owner's phone carry the same numbers but are signed with the debug key.
- **Update check (in the app).**
  - On app start and on resume, when online and on a **release** build only, the app fetches a small `latest.json` from the page's path. Fields: `versionCode`, `versionName`, `notes`, `apkUrl`, `sha256`, `size`.
  - It carries nothing about the person.
  - If `versionCode` is higher than the installed one, it shows a banner in the existing gradient Banner style: "Version {versionName} is ready" with **Update**, which opens `apkUrl` in the browser so Android downloads and installs it.
  - The banner can be dismissed for that version.
  - The Help center's Privacy page must list this check alongside the price-service calls.
- **The access key.** Friends' apps use the owner's price service with the same shared token baked into the APK. The owner accepted this earlier, when the token stopped unlocking anything paid. The cost is more traffic on the owner's free tier.
- **Accessibility and motion.**
  - With `prefers-reduced-motion`, the page shows the same content with no scroll animation.
  - Without WebGL, the page shows static phone images in place of the 3D phone.
  - The Download button and all text work with a keyboard and a screen reader.
- **Performance.**
  - The 3D library loads only on this page, never in the app bundle.
  - The first paint shows the title and the Download button before the 3D phone loads, so a slow phone can still download straight away.

## The page (what the owner approved by feel)

- **Title screen.** "Funancial" and "A budget app that stays on your phone." A phone rises in from below as you start scrolling.
- **Four stops**, each held still while you read, with the phone turning between them.
  - The screen inside the phone is alive and tied to the scroll:
    1. **Home:** Available to spend counts up and the month line draws itself.
    2. **Budget:** the limit bars fill, one after another.
    3. **Buy it?:** the meter needle swings past and settles, and the verdict appears.
    4. **Levels:** the XP bar fills and the badges pop in.
  - Screens slide from one to the next.
  - Beside each stop: a small label ("01 · Home"), one headline and one sentence.
- **Look.**
  - The scroll movement glides, with the heavier smoothing of v2. The story is about twice as long as v1.
  - Realistic reflections on the phone body, a moving glass sheen, and soft coloured shapes in the background drifting at a different speed.
- **Ending.** The phone turns a full circle to show its back with the Funancial name, then steps aside for **Download for Android**, with the version and size under it.
- **Safe and simple section** (after the story).
  - Your money stays on your phone, encrypted. No account, no ads.
  - Why Android asks before installing an app that isn't from the Play Store.
  - Three install steps.
  - "Not financial advice."
  - What's new in this version.
- **On a computer:** the Download button area shows a QR code that opens the page on the phone, with "Scan with your Android phone". The direct download link is still available.
- **iPhone visitors:** "Funancial is Android-only for now."

## Decided by Claude (the owner can overrule)

- **The page's address:** the path is `/get`. It's unlisted, not secret: anyone with the link can open it, which matches "only friends I send the link to".
- **What the screens inside the phone are.** They are faithful redraws of the app's real screens, in its fonts and colours with demo-money figures. They aren't flat screenshots, because the in-screen animation is what made v2 feel premium. The safe-and-simple section may also show a row of real screenshots taken from demo money.
- **Where the page lives in the repo.** A separate small entry in the same Vite build, for example `site/get/`, with Three.js as a dependency of that entry only. The builder may choose another layout, as long as the app bundle doesn't grow.
- **The APK and `latest.json`** are served as static files next to the page. Publishing a release is: build, sign, write `latest.json` (with the sha256 and size), deploy with the owner's OK.
- **How Update installs.** It opens the APK link in the system browser rather than installing from inside the app. This needs no new Android permission. Android shows its own install screen.
- **Where the release steps live.** A short "how to release a version" note, including the key warning, goes in the docs.
- **How the release build and the update are tested.**
  - The owner's phone stays on debug builds, and Android won't put a release build over one. So the first friend-style install and the update (a test release with a higher `versionCode`) are checked on an Android emulator on the owner's computer.
  - The test points at a Vercel **preview** deploy, through a build-time override of the update address. Production gets the release only after that test passes, so no friend ever sees the test build.
  - The owner's real phone is used for the page's look and feel, and to confirm its debug build never shows the banner.
  - If the emulator can't be set up on this computer, Claude asks the owner before choosing another route.

## Left to the builder

- How the scroll is timed and smoothed, as long as it matches v2's feel.
- Exact copy, within the tone above. Plain, short and warm.
- How the QR code is made (a small generator is fine) and how the desktop/phone split is detected.
- Test approach. Expected at least:
  - a unit test of the update check: newer, same, older, offline, debug build, dismissed;
  - an e2e of the page with reduced motion, the computer QR view and the phone link;
  - a Lighthouse pass for performance and accessibility on mobile.

## Done means

- The page is live at `/get` (after the owner's OK) and loads fast on the owner's phone.
- `/` sends visitors to `/get`, and the price service still answers.
- A friend-style install from the page works on the emulator.
- A test release with a higher `versionCode` (on a preview deploy) shows the update banner on that install, and updating keeps its data.
- The owner's debug build never shows the banner.
