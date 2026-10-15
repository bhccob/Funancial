# M3 Android: decisions and deferred items

Every call made during M3 that a plan or spec didn't settle, in the order it was made, each with what it costs if wrong. Then the final review's outcome, the on-device checks, and the minor findings deferred to later milestones.

Branch `feat/m3-android`, commits a969c3a..60f0aca. Final review by a fresh reviewer (Opus): ready to merge with fixes. The one Critical and four Important findings were all fixed with tests, and the re-review was clean. Checked on a Nothing Phone (3a) running Android 15: all eight checklist items pass.

## Rulings

- Pre-flight: Ruling 1: Task 7 also modifies src/main.tsx to pass `biometric: platform.biometric` into createAppStore deps — the deps are assembled there since Task 4 — cost if wrong: none.
- Pre-flight: Ruling 2: Task 9 adds `formatLocalDateTime(d: Date): string` ('YYYY-MM-DDTHH:MM', local wall clock) to src/domain/dates.ts beside Task 8's localDateTime, with a test, and useReminderSync uses formatLocalDateTime(new Date()) as `now` — the plan's `nowLocal()` was never defined — cost if wrong: a rename.
- Task 1: Ruling: AppDeps.storage becomes the StorageProvider (plan name) and the existing localStorage wrapper dep is renamed AppDeps.safeStorage (its module is already lib/safeStorage) — cost if wrong: a rename.
- Task 3: Ruling: commits authored by Sonnet subagents carry the Sonnet 5.5 trailer (accurate authorship); no history rewrite — cost if wrong: inconsistent trailers in git log.
- Task 4: Ruling: the StorageUnavailable screen gets Android-specific copy and a retry button (it shows for phone storage-setup failures, where "your browser is blocking storage… private windows" is wrong) — cost if wrong: copy only.
- Task 4: Ruling: the App.addListener promises in android/index.ts get rejection handling in Task 5, which adds onPause beside onResume there — cost if wrong: none.
- Task 5: Ruling: @capacitor/core may be imported statically inside src/platform/android (shell.ts: SystemBars) — core is not a plugin and main.tsx already imports it statically; plugins stay dynamic — cost if wrong: none.
- Task 6: Ruling: any task that adds a Capacitor plugin runs `npx cap sync android` and commits the regenerated native files (plugins missing from the native project fail on the device; mocks can't catch it) — cost if wrong: none.
- Task 6: Ruling (overrides the plan's "cancel resolves silently"): files.save returns 'saved' | 'cancelled'; createBackup no longer stamps lastBackupAt — a new markBackedUp() action does, only after 'saved'; on 'cancelled' the dialog stays open with its passphrase — a false "Last backup" would also silence the weekly backup reminder — cost if wrong: one extra store action.
- Task 7: Ruling: BiometricVault.available() = isAvailable && strongBiometryIsAvailable — the Keystore-bound read accepts only Class 3 biometrics, so weak-face-only phones would show a switch that can never unlock — cost if wrong: some phones don't offer biometric unlock.
- Task 7: Ruling: a read() failing with a non-21 code returns 'changed' when isDataSaved says the copy is gone — plugin 8.7.0 reports code 0 on the first read after an enrolment change and 21 only later — cost if wrong: a rare cancel misread as changed turns biometric off (PIN still works).
- Task 7: Ruling: the lock-screen "changed" message and the Settings hint say "passphrase" instead of "PIN" for passphrase users — cost if wrong: copy only.
- Task 8: Ruling (refines the plan's "any expense or income dated today"): the daily nudge is skipped only for things the person logged — expenses without a subscription and confirmed incomes dated today; renewal charges and expected salaries don't count, or the nudge would vanish on every renewal and pay day — cost if wrong: one extra nudge on a day with only a confirmed salary.
- Task 9: Ruling: reminders set isExactNotification: false, replace() schedules only when the permission is already granted (never prompts), and the manifest removes SCHEDULE_EXACT_ALARM — these enforce the plan's "no exact alarms; POST_NOTIFICATIONS only from a user action" against the plugin's defaults — cost if wrong: a Gradle merge issue (checked on the device: none).
- Task 9: Ruling: when the app reaches the welcome phase (after Delete all data, or a first run), Root calls notifier.replace([]) so no reminder outlives the data — cost if wrong: none.
- Task 9: Ruling: the reminders channel is created with lock-screen visibility private; the plugin's plaintext copy of titles and bodies in app-private SharedPreferences is accepted (sandboxed; upcoming-bill names and amounts only) — cost if wrong: bill names readable on a rooted or forensically imaged phone.
- Task 9: Ruling: routeOf rejects '//'-prefixed routes (an exported launcher activity can receive crafted extras) — cost if wrong: none.
- Task 10: Ruling: the Reminders section is hidden in the demo namespace, like the Home banner — demo data never schedules reminders — cost if wrong: none.
- Task 10: Ruling: a refused "Turn on" in the Home banner shows the blocked message inside the banner, saves nothing, and the banner stays until "Not now" — cost if wrong: copy/flow polish.
- Task 12: Ruling: build on Temurin 21 (downloaded by the owner through Android Studio) with Capacitor's tested Gradle 8.14.3, keeping rootProject.layout.buildDirectory; docs/android.md points JAVA_HOME at it (environment variables are the owner's to set) — cost if wrong: a later JDK-25-only setup needs the Gradle 9.2 pairing.

## Final review

A fresh reviewer (Opus) reviewed a969c3a..048662c. It agreed with every ruling. Findings, all fixed with a test that failed first; suite 609/609, e2e 34 passed / 2 skipped, `assembleDebug` succeeds:

- **Critical:** restoring a backup crashed the app. `accept=".funbak"` on the file input made Capacitor's picker call `setType` on an empty MIME list. Restore is the only path from desktop to phone. Fixed in 25bce1e: `accept` is set only on the web.
- **Important:** pause/resume callbacks fired once more after being removed, because Capacitor removes listeners asynchronously. That wiped the phone's reminders on lock and left an orphan idle timer behind. Fixed in 1fa511e: a live flag in `listen()`, and sync runs only while unlocked.
- **Important:** the lock screen prompted for biometrics while the app was in the background. Fixed in 2a29f54: it prompts only when visible, otherwise once on resume.
- **Important (re-graded):** `npm run android:run` and `android:dev` failed on this PC. Fixed in beeb8e1 and 60f0aca: device choice, `gradlew.bat` by its path, `installDebug` then `am start`, and a `JAVA_HOME` check.
- **Important (re-graded):** the restore steps in `docs/android.md` left out onboarding first and the confirm step. Fixed in 25bce1e.

## On the phone (Task 12)

Nothing Phone (3a), Android 15, debug build installed with `npm run android:run`:

1. Onboarding with a PIN and the fingerprint switch lands on Home. Nothing sits under the status bar or the gesture bar.
2. An expense survives a force-stop. On relaunch the fingerprint prompt appears by itself.
3. The database file is encrypted: its header is random bytes, not `SQLite format 3`. Logcat shows no bridge output and no key material.
4. "Use PIN" works. After a minute in the background with auto-lock at 1 minute, the app reopens locked with the prompt. All 39 reminders stay scheduled while it is locked.
5. The back gesture closes a dialog, then goes back, then sends the app to the background from Home.
6. An encrypted backup is saved through the share sheet to Files. After "Delete all data", restoring it brings the data back, and the file picker opens without crashing.
7. With reminders on and the notification permission granted, a test reminder arrives with the app swiped away. Tapping it opens the app.
8. After a restart, with the app not opened, Android's boot broadcast restores all 39 reminders, matching the plugin's saved records one for one.

Notes:

- The merged manifest has no exact-alarm permission.
- The phone reports the reminders channel with no lock-screen override. Each notification still carries the private visibility the plugin sets, so its content is hidden on a secure lock screen whenever the phone is set to hide sensitive content. This phone is currently set to show it, which is the owner's choice.
- Not checked on the device: the "changed" message after enrolling a new finger (optional), and live reload with `npm run android:dev`.

## Deferred minors

Resolved later in M3: the bare `'dataVersion'` literals (now `DATA_VERSION_KEY`), `closeSession` swallowing close errors (now logged), the `addListener` promises without a catch, biometric reads that never settle in the background (final fix 2a29f54), and the missing test that a lock leaves reminders scheduled (final fix 1fa511e).

Still open:

- Storage:
  - Dexie `write()` always locks `meta` too.
  - Type-level import cycle between `storage.ts` and `db.ts`.
  - The `memoryStorage()` name is used twice in the test helpers.
  - Internal db.ts helpers are still exported.
  - No shared backend-contract suite for Dexie and SQLite.
- Keys: `deviceWrapped` spreads `...fields` last.
- SQLite:
  - The rollback test never rolls back a `dataVersion` write.
  - `sqliteStorage` imports `dbName` from db.ts, which pulls Dexie into the native module.
  - `repository.test` still uses the bare `'dataVersion'` literal.
  - Close sets `closed` before awaiting, so a failed close can't be retried.
- Android shell and platform:
  - The web runs sync three times when the tab returns.
  - Missing tests: the connection-consistency check, the failure-cleanup branches, `createAndroidPlatform`'s shape, and a successful boot to welcome. Mock implementations leak between tests.
  - The template `ExampleInstrumentedTest` asserts the wrong package.
  - Unused template resources and the Capacitor splash still ship.
  - The data-extraction rules omit `external` and the `device_*` domains.
  - 3 moderate dev-only `npm audit` advisories come from `@capacitor/cli`.
- Back gesture:
  - On the lock screen, the back gesture moves the router behind it.
  - An open Menu isn't closed by the back gesture.
  - `listen()` doesn't catch a synchronous throw from `add()`.
  - The theme→system-bar sync shares a try with the app import.
  - The `minimizeApp` rejection is untested, and the theme listeners aren't isolated.
  - A duplicated `AutoLockProbe` helper.
- Backups:
  - Plain JSON/CSV exports stay in the app cache after sharing.
  - `isCancellation` matches /cancel/i on the whole message.
  - The `download.ts` comment is stale.
  - No assertion that the Android platform uses `androidFiles`.
- Biometrics:
  - In the changed path the flag stays on if `forget()` fails.
  - `clearSecret` forgets the slot strictly even when biometric unlock was never on.
  - Repeated non-21 failures look like cancels forever.
  - Test gaps: the shared in-flight prompt, the post-prompt re-check, and others.
  - `appStore.ts` is about 520 lines; extract the biometric parts.
  - If both the flag write and the forget fail, a Keystore copy remains.
- Reminder rules:
  - Card reminders repeat the next bill's amount for later months.
  - Day-boundary anchoring is untested.
  - No tests for the 31st or for February.
  - Nonexistent spring-forward times shift silently.
  - Migration test names and assertions are loose.
- Scheduling:
  - An edit followed within 1 s by a lock drops the pending sync until the next unlock.
  - Cancel-then-schedule leaves no reminders if the schedule fails (schedule-first with stable ids would be non-destructive).
  - The `ids[i] as number` assertion.
  - Root.test's timers can flake.
  - The fake-notifier helper is duplicated.
- Reminders UI:
  - The "blocked" alert in Settings goes stale after allowing notifications in Android Settings.
  - Two quick taps can lose one change.
  - No in-flight guard on Turn on.
  - Untested failure paths.
  - `routeOf` doesn't reject control characters.
- Dev scripts and docs:
  - The `android:dev` adb-reverse hint ignores multiple devices.
  - The guide doesn't say the adb reverse rule is lost on replug.
  - The `JAVA_HOME` note for non-default installs.
  - The README lacks the `android:*` scripts.
  - `android:run` syncs twice.
  - A missing `JAVA_HOME` is reported only after the web build.
- Dev builds only: under StrictMode, a cold-start notification tap can be consumed by a dead listener.
- If the WebView misreports visibility, the lock screen shows no auto-prompt (the button still works).
- `android/.idea/` is untracked and not ignored.
