# Funancial M3 — Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Funancial runs as an Android app on the user's phone. Data is in an encrypted SQLCipher database, the app unlocks with fingerprint or face (PIN as the fallback), reminders arrive while the app is closed, and backups go out through the share sheet.

**Architecture:** The web app stays the single UI. Capacitor wraps it, and a `Platform` object chosen at startup supplies everything that differs per platform:

- storage backend;
- device keyring;
- biometric vault;
- notifier;
- file saving.

Record encryption and the vault (M1) are reused unchanged. Only the store underneath them moves from Dexie to SQLCipher, behind a new `StorageBackend` seam. Reminder rules are a pure domain module, and a thin native adapter schedules them.

**Tech Stack:**
- Capacitor 8 (Android, compileSdk/targetSdk 36, minSdk 24).
- `@capacitor-community/sqlite` with SQLCipher.
- `@capgo/capacitor-native-biometric`, for Keystore storage that's biometric-bound.
- `@capacitor/local-notifications`, `@capacitor/filesystem`, `@capacitor/share` and `@capacitor/app`.
- `sql.js` for tests.

**Spec:** `docs/superpowers/specs/2026-10-14-funancial-design.md` (M3 and the "Storage & security", "Notifications" and "Verification" sections). The original requirements are in `docs/spec/original-spec.md`, Part 8.

## Global Constraints

- **Exact versions, pinned** (`npm i -E`):
  - Capacitor packages: `@capacitor/core` 8.5.3, `@capacitor/cli` 8.5.3 (dev), `@capacitor/android` 8.5.3, `@capacitor/app` 8.1.2, `@capacitor/local-notifications` 8.3.1, `@capacitor/filesystem` 8.1.4, `@capacitor/share` 8.0.3.
  - Third-party plugins: `@capacitor-community/sqlite` 8.1.1, `@capgo/capacitor-native-biometric` 8.7.0.
  - Test-only (dev): `sql.js` 1.14.2 and `@types/sql.js` 1.4.11.
- **App identity:** appId `io.github.bhccob.funancial`, appName `Funancial`, webDir `dist`. The Android scheme stays Capacitor's default `https`, so `crypto.subtle` keeps working in a secure context.
- **Where Capacitor code lives:** only `src/platform/**` and `src/main.tsx` import `@capacitor/*`. Plugins are loaded by dynamic `import()` inside `src/platform/android/`, so the web bundle and unit tests never load native plugins.
- **The web app keeps working exactly as before:** every existing unit test and Playwright e2e stays green, and the web platform is the default in tests.
- **The data key is never stored unwrapped:**
  - web device mode: a non-extractable CryptoKey (as today);
  - PIN or passphrase: PBKDF2 (as today);
  - Android device mode: the raw device key inside the SQLCipher-encrypted database, whose passphrase sits in the plugin's Keystore-backed secret store;
  - biometric copy: Keystore only, with `AccessControl.BIOMETRY_CURRENT_SET`.
- **Android backup is off:** `android:allowBackup="false"`, and the data extraction rules exclude everything. Google's auto-backup would restore a database the new phone can't decrypt. The encrypted `.funbak` is the backup path.
- **Reminders:**
  - the nearest 60 within 30 days, in local wall-clock time;
  - `allowWhileIdle`, no exact-alarm permission;
  - POST_NOTIFICATIONS is requested only from a user action (the Settings switch or the Home banner);
  - limit warnings at 80/100/120% stay in-app toasts at save time, since they happen while the app is open.
- **Style and copy:** Pro Ledger (hairlines, ink pills, no box cards on screens), plain copy, touch targets ≥ 44px.
- **When the Android toolchain is needed:** JDK 21 and Android SDK 36 (Android Studio) are needed only for building. Every task except Task 12 is verified with `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:e2e`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Fingerprint or face enrolment changed or removed after biometric unlock was turned on.** The Keystore copy is gone (plugin error code 21), and the app must fall back to the PIN with a clear message and switch biometric unlock off. It must never lock the user out. Task 7.
2. **A backup made in the desktop browser restored on the phone,** which is how data moves between devices. It restores exactly, including after the phone is restarted. Task 3.
3. **Notification permission denied or later revoked in Android settings, or scheduling failing.** No crash and no toast storm. Settings shows reminders as blocked with a way to fix it. Tasks 9 and 10.
4. **The app killed mid-write, or the phone restarted.** The database stays consistent (writes are transactional), and scheduled reminders survive a reboot. Tasks 3 and 4, then checked on the device in Task 12.
5. **Android back gesture.** With a dialog open it closes the dialog. On the first screen it backgrounds the app, never killing it mid-entry. Task 5.

---

### Task 1: Storage seam (records and meta behind one backend)

A pure refactor: no behavior change. The repository stops knowing about Dexie.

**Files:**
- Create: `src/data/storage.ts`.
- Modify:
  - `src/data/db.ts` (`RecordRow` moves to `storage.ts`; add `dexieStorage`);
  - `src/data/repository.ts` (add `createRepository`);
  - `src/store/appStore.ts` (`deps.db` becomes `deps.storage`; the session holds a backend);
  - `src/test/realStore.ts`, `src/store/appStore.test.ts` (deps).
- Delete: `src/data/webRepository.ts`. Rename `src/data/webRepository.test.ts` → `src/data/repository.test.ts` (same cases, built via `dexieStorage`).

**Interfaces:**
- Produces, in `src/data/storage.ts`:
  ```ts
  export type RecordRow = { table: TableName; id: string; updatedAt: string; iv: Bytes; ciphertext: ArrayBuffer };
  export interface RecordStore {
    all(): Promise<RecordRow[]>;
    /** Insert or replace rows in one transaction. `replace` drops every other row first; `dataVersion` is written to meta in the same transaction. */
    write(rows: RecordRow[], opts: { replace: boolean; dataVersion?: number }): Promise<void>;
    remove(table: TableName, id: string): Promise<void>;
  }
  export interface StorageBackend { meta: MetaStore; records: RecordStore; close(): Promise<void> }
  export interface StorageProvider { open(ns: Namespace): Promise<StorageBackend>; remove(ns: Namespace): Promise<void> }
  ```
- Produces: `createRepository(backend: StorageBackend, key: CryptoKey): Repository` in `repository.ts`, with the same behavior as today's `createWebRepository`. It reads `dataVersion` via `backend.meta.get('dataVersion')`.
- Produces: `dexieStorage(prefix = DEFAULT_DB_PREFIX): StorageProvider` in `db.ts`.
- `AppDeps.storage: StorageProvider` replaces `AppDeps.db`.

- [ ] **Step 1: Write a failing test.** Add to `repository.test.ts`: `it('writes through any StorageBackend')`. It builds `createRepository` over a hand-written in-memory backend (`memoryStorage()`: a `Map` of rows plus `memoryMetaStore()`), round-trips one put through `loadAll`, and checks that `write(..., { replace: true, dataVersion: 2 })` leaves only the new rows and `meta.get('dataVersion') === 2`. Put `memoryStorage()` in `src/test/memoryStorage.ts`.
- [ ] **Step 2: Run** `npx vitest run src/data/repository`. Expected: FAIL (`createRepository` is not exported).
- [ ] **Step 3: Implement** `storage.ts`, `createRepository` and `dexieStorage`. Move the existing tests onto `createRepository(await dexieStorage(prefix).open('real'), key)`. Switch `appStore` to `deps.storage`: `openSession` awaits `deps.storage.open(ns)`, `closeSession` calls `backend.close()`, and `deleteAllData` calls `deps.storage.remove(ns)`. Update `realStoreDeps`/`testDeps` to `storage: dexieStorage(prefix)`, and the module-level `appStore` in `appStore.ts` to `storage: dexieStorage()`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: all green (the new test included).
- [ ] **Step 5: Commit:** `refactor: storage backend seam under the repository`.

### Task 2: Device keyring seam

**Files:**
- Create: `src/data/keyring.ts`.
- Modify: `src/data/keys.ts` (vault functions take a keyring; `VaultRecord.deviceKeyRaw?: string`), `src/store/appStore.ts` (`deps.keyring`), the test deps.
- Test: `src/data/keyring.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface DeviceKeyring {
    /** A new AES-KW device key, plus the vault fields that let `open` find it again. */
    create(): Promise<{ key: CryptoKey; fields: Pick<VaultRecord, 'deviceKey' | 'deviceKeyRaw'> }>;
    open(vault: VaultRecord): Promise<CryptoKey>;
  }
  export const browserKeyring: DeviceKeyring; // non-extractable key kept as `deviceKey` (IndexedDB stores CryptoKeys)
  export const storedKeyring: DeviceKeyring;  // raw bytes as base64 `deviceKeyRaw`, for stores that hold only data (SQLCipher on Android)
  ```
- `createVault(meta, keyring = browserKeyring)`, `unlockVault(meta, secret?, keyring = browserKeyring)`, `clearVaultSecret(meta, dataKey, keyring = browserKeyring)`. `setVaultSecret` writes no device fields.
- `AppDeps.keyring: DeviceKeyring`, passed to every vault call.

- [ ] **Step 1: Write failing tests** in `keyring.test.ts`:
  - `it('storedKeyring keeps the device key as data and unlocks with it')`: after `createVault(meta, storedKeyring)`, the vault record has `deviceKeyRaw` (a 44-char base64 string) and no `deviceKey`, and `unlockVault(meta, undefined, storedKeyring)` returns a key that decrypts a record encrypted with the key `createVault` returned.
  - `it('browserKeyring keeps a non-extractable key')`: `fields.deviceKey.extractable === false`.
  - `it('clearing a secret re-wraps with the given keyring')`: after `setVaultSecret` then `clearVaultSecret(meta, key, storedKeyring)`, the mode is `'device'` and `deviceKeyRaw` is set.
- [ ] **Step 2: Run** `npx vitest run src/data/keyring`. Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement** `keyring.ts` (`storedKeyring.open` imports the raw bytes as a non-extractable AES-KW key) and thread the keyring through `keys.ts` and `appStore` (`deps.keyring`). The test deps and the module-level store use `browserKeyring`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: green.
- [ ] **Step 5: Commit:** `refactor: pluggable device keyring for the vault`.

### Task 3: SQLCipher storage backend (tested on sql.js)

**Files:**
- Create: `src/data/sqliteStorage.ts`, `src/test/sqlJsDriver.ts`.
- Test: `src/data/sqliteStorage.test.ts`, `src/store/nativeStore.test.ts`.
- Modify: `package.json` (dev deps `sql.js` 1.14.2, `@types/sql.js` 1.4.11).

**Interfaces:**
- Produces, in `sqliteStorage.ts`:
  ```ts
  /** The few SQLite calls the native backend needs. The Capacitor plugin (Task 4) and sql.js (tests) both provide them. */
  export interface SqlDb {
    run(sql: string, values?: unknown[]): Promise<{ changes: number }>;
    query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]>;
    /** All statements apply, or none. */
    transaction(statements: Array<{ sql: string; values?: unknown[] }>): Promise<void>;
    close(): Promise<void>;
  }
  export interface SqlDriver { open(name: string): Promise<SqlDb>; remove(name: string): Promise<void> }
  export function sqliteStorage(driver: SqlDriver): StorageProvider;
  export function encodeMetaValue(value: unknown): string; // JSON; ArrayBuffer/Uint8Array → {"$bytes":"<base64>"}; throws on CryptoKey
  export function decodeMetaValue(text: string): unknown;
  ```
- **Schema,** created on `open` with `CREATE TABLE IF NOT EXISTS`:
  - `records(tbl TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, PRIMARY KEY (tbl, id))`;
  - `meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
- **Encoding:** `iv` and `ciphertext` are base64 (`bytesToBase64`/`base64ToBytes`). Database names come from `dbName(ns)` (`funancial-real`, `funancial-demo`). `putIfAbsent` uses `INSERT OR IGNORE` and returns `changes === 1`.
- **Test driver:** `sqlJsDriver(): SqlDriver & { failOn(fragment: string): void }` keeps each named database across `close`/`open` (it simulates files on disk). `failOn` makes the next statement containing `fragment` throw, to test rollback.

- [ ] **Step 1: Write failing tests.** In `sqliteStorage.test.ts`:
  - `it('round-trips vault-shaped meta values, bytes included')`;
  - `it('putIfAbsent writes once')`;
  - `it('write with replace drops other rows and sets dataVersion atomically')`;
  - `it('a failing statement rolls the whole write back')`: `failOn('INSERT')` partway through a 3-row write leaves the earlier rows untouched;
  - `it('data persists across close and reopen')`;
  - `it('remove deletes the database')`.

  In `nativeStore.test.ts`, a real `createAppStore` over `sqliteStorage(sqlJsDriver())` with `storedKeyring`:
  - `it('starts fresh, saves, and reopens unlocked after a restart')`;
  - `it('a PIN set on the phone is asked for after a restart')`: `setSecret('2468','pin')`, a new store, `boot`, `phase === 'locked'`, `unlock('2468') === 'ok'`;
  - `it('restores a backup made in the browser')` (**Review Focus 2**): build a backup with a Dexie-backed store (`createBackup('correct horse')`), restore it into the SQLite-backed store, and deep-equal the snapshots after a reboot.
- [ ] **Step 2: Run** `npx vitest run src/data/sqliteStorage src/store/nativeStore`. Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement** `sqliteStorage.ts` and `sqlJsDriver.ts`. sql.js transactions are explicit `BEGIN`/`COMMIT`/`ROLLBACK`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: green.
- [ ] **Step 5: Commit:** `feat: SQLCipher-ready storage backend over a small SQL driver`.

### Task 4: Capacitor Android project and platform selection

**Files:**
- Create:
  - `capacitor.config.ts`;
  - `src/platform/types.ts`, `src/platform/web.ts`, `src/platform/PlatformProvider.tsx`;
  - `src/platform/android/index.ts`, `src/platform/android/sqlite.ts`;
  - `android/` (generated by `npx cap add android`).
- Test: `src/platform/web.test.ts`, `src/platform/android/sqlite.test.ts`.
- Modify:
  - `src/main.tsx` (build the store from the platform);
  - `src/store/appStore.ts` (remove the module-level `appStore` and the `navigator.storage` helpers, which move to `web.ts`);
  - `tsconfig.node.json` (include `capacitor.config.ts`);
  - `package.json`;
  - `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/xml/data_extraction_rules.xml` (new), `android/app/src/main/res/drawable/ic_launcher_foreground.xml`, `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml`, `android/app/src/main/res/values/ic_launcher_background.xml`, `android/app/src/main/res/drawable/ic_stat_reminder.xml`.

**Interfaces:**
- Produces, in `src/platform/types.ts`. Task 5 adds `onPause`, Task 7 adds `biometric` and Task 9 adds `notifier`. Until Task 6, Android's `files` uses the web implementation.
  ```ts
  export interface Platform {
    kind: 'web' | 'android';
    storage: StorageProvider;
    keyring: DeviceKeyring;
    storageStatus(): Promise<boolean>;
    requestPersistence(): Promise<boolean>;
    files: { save(fileName: string, text: string, mime: string): Promise<void> };
    onResume(cb: () => void): () => void;
  }
  ```
- Produces: `createWebPlatform(): Platform` (`dexieStorage()`, `browserKeyring`, the `navigator.storage` helpers, `files.save` = `downloadText`, `onResume` = visibilitychange→visible). Also `createAndroidPlatform(): Promise<Platform>`:
  - `sqliteStorage(await capacitorSqlDriver())` and `storedKeyring`;
  - `storageStatus`/`requestPersistence` resolve `true`;
  - `onResume` via `App.addListener('resume')`.
- Produces: `PlatformProvider`/`usePlatform()`, with the default context value `createWebPlatform()`. It mirrors `AppStoreProvider`.
- Produces: `capacitorSqlDriver(): Promise<SqlDriver>` in `android/sqlite.ts`:
  - if `!(await sqlite.isSecretStored()).result`, it calls `setEncryptionSecret(randomBase64(32))` once;
  - `open(name)` = `createConnection(name, true, 'secret', 1, false)` then `open()`;
  - `transaction` = `executeSet(statements.map(s => ({ statement: s.sql, values: s.values ?? [] })), true)`;
  - `run` = `run(sql, values, false)`;
  - `remove` deletes via a connection's `delete()`.
- **`capacitor.config.ts`:**
  ```ts
  const devUrl = process.env.FUNANCIAL_DEV_URL;
  export default {
    appId: 'io.github.bhccob.funancial', appName: 'Funancial', webDir: 'dist',
    plugins: {
      CapacitorSQLite: { androidIsEncryption: true, androidBiometric: { biometricAuth: false } },
      LocalNotifications: { smallIcon: 'ic_stat_reminder', iconColor: '#00B37E' },
      SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
    },
    ...(devUrl ? { server: { url: devUrl, cleartext: true } } : {}),
  } satisfies CapacitorConfig;
  ```
- **Manifest:**
  - `android:allowBackup="false"`, `android:dataExtractionRules="@xml/data_extraction_rules"` (cloud-backup and device-transfer both `<exclude domain="root" path="." />`, plus the same for `database`, `sharedpref` and `file`);
  - `<uses-permission>` for `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `USE_BIOMETRIC`.
- **Icon:** a vector adaptive icon. The foreground is a white rounded "F" mark with a small green spark on a `#0D0D0F` background, and the monochrome layer is the same path. Capacitor's PNG icons stay as the fallback for API 24–25. `ic_stat_reminder` is a white 24dp vector bell.

- [ ] **Step 1: Write failing tests:**
  - `web.test.ts`: `it('the web platform keeps browser storage and downloads')` checks `kind === 'web'`, `keyring === browserKeyring`, and that `files.save` calls `downloadText`, mocked.
  - `android/sqlite.test.ts`, with `vi.mock('@capacitor-community/sqlite')`: `it('creates the SQLCipher secret once and opens encrypted connections')` checks that `setEncryptionSecret` is called once with a 44-char base64 string when none is stored, never when one is, and that `createConnection` gets `(name, true, 'secret', 1, false)`.
- [ ] **Step 2: Run** `npx vitest run src/platform`. Expected: FAIL (the modules are missing).
- [ ] **Step 3: Install** `npm i -E @capacitor/core@8.5.3 @capacitor/android@8.5.3 @capacitor/app@8.1.2 @capacitor-community/sqlite@8.1.1` and `npm i -E -D @capacitor/cli@8.5.3`.
- [ ] **Step 4: Implement the platform code.** Write the platform modules and `capacitor.config.ts`. `main.tsx` does the following inside an async `start()`:
  - `const platform = Capacitor.isNativePlatform() ? await createAndroidPlatform() : createWebPlatform()`;
  - `createAppStore({ ...platform-derived deps })`;
  - render `<PlatformProvider platform={platform}><AppStoreProvider …>`;
  - wire `platform.onResume(sync)` beside the existing focus and visibility listeners.
- [ ] **Step 5: Generate the Android project.** Run `npm run build && npx cap add android`, then apply the manifest, data-extraction and icon edits above.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: green, with web behavior unchanged.
- [ ] **Step 7: Commit:** `feat: Capacitor Android project with SQLCipher storage and platform selection`.

### Task 5: Android shell — back gesture, pause/resume auto-lock and system bars

**Files:**
- Create: `src/platform/back.ts`, `src/platform/android/shell.ts`.
- Test: `src/platform/back.test.ts`, `src/features/lock/useAutoLock.test.tsx`.
- Modify:
  - `src/lib/dialogStack.ts` (add a non-hook `topDialog(): HTMLDialogElement | null`);
  - `src/lib/theme.ts` (add `onThemeApplied(cb: (dark: boolean) => void): () => void`);
  - `src/platform/types.ts` (add `onPause(cb: () => void): () => void`: on the web, visibilitychange→hidden; on Android, `App.addListener('pause')`);
  - `src/features/lock/useAutoLock.ts` (also listen to `usePlatform().onPause`/`onResume`, since the WebView may not report visibility when the app goes to the background);
  - `src/platform/android/index.ts` (call `installShell()`).

**Interfaces:**
- Produces: `handleBack(canGoBack: boolean, env: { topDialog(): HTMLDialogElement | null; back(): void; minimize(): void }): 'dialog' | 'back' | 'minimize'`. With a dialog open, it dispatches a cancelable `cancel` event on it (Dialog already turns `cancel` into `onClose`). Otherwise it goes back when `canGoBack` is true, and minimizes otherwise.
- Produces: `installShell(): Promise<void>`:
  - `App.addListener('backButton', ({ canGoBack }) => handleBack(canGoBack, { topDialog, back: () => history.back(), minimize: () => App.minimizeApp() }))`;
  - `onThemeApplied(dark => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }))`.

- [ ] **Step 1: Write failing tests** in `back.test.ts` (**Review Focus 5**):
  - `it('closes the open dialog instead of leaving the screen')`: the dialog's `onClose` runs, and `back`/`minimize` don't;
  - `it('goes back when there is history')`;
  - `it('backgrounds the app on the first screen instead of closing it')`.

  In `useAutoLock.test.tsx`: `it('locks on resume after being away longer than the timeout, from platform pause and resume alone')`. It uses fake timers and a stub platform whose `onPause`/`onResume` callbacks the test fires, with no visibilitychange.
- [ ] **Step 2: Run** `npx vitest run src/platform/back src/features/lock`. Expected: FAIL.
- [ ] **Step 3: Implement** `back.ts`, `topDialog()`, `onThemeApplied` (called wherever `theme.ts` applies the `data-theme` attribute), `Platform.onPause`, the `useAutoLock` listeners and `shell.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: green.
- [ ] **Step 5: Commit:** `feat: Android back gesture, resume sync and system bar colours`.

### Task 6: Backups and exports through the share sheet

**Files:**
- Create: `src/platform/android/files.ts`.
- Test: `src/platform/android/files.test.ts`, plus an addition to `src/features/settings/settings.test.tsx`.
- Modify: `src/features/settings/DataSection.tsx` (every `downloadText` call becomes `await usePlatform().files.save(...)` inside `run`), `src/platform/android/index.ts`, `package.json` (`npm i -E @capacitor/filesystem@8.1.4 @capacitor/share@8.0.3`).

**Interfaces:**
- Produces: `androidFiles: Platform['files']`:
  - `save` writes `Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })`;
  - then `Share.share({ title: fileName, files: [uri], dialogTitle: 'Save or send your file' })`;
  - a share rejection whose message contains `cancel` (case-insensitive) resolves silently, and other errors are rethrown.

- [ ] **Step 1: Write failing tests:**
  - `files.test.ts` (plugins mocked): `it('writes to the cache and opens the share sheet')` checks the exact arguments; `it('treats a cancelled share as fine')`; `it('reports a failed write')`.
  - `settings.test.tsx`: `it('saves the backup through the platform')`, rendered inside a `PlatformProvider` whose `files.save` is a spy; it expects `('funancial-backup-….funbak', text, 'application/octet-stream')`.
- [ ] **Step 2: Run** `npx vitest run src/platform/android/files src/features/settings`. Expected: FAIL.
- [ ] **Step 3: Implement** `files.ts` and switch `DataSection` to `usePlatform().files.save`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: green (the web downloads in e2e are unchanged).
- [ ] **Step 5: Commit:** `feat: backups and exports through the Android share sheet`.

### Task 7: Biometric unlock with PIN fallback

**Files:**
- Create: `src/platform/android/biometric.ts`, `src/test/fakeBiometric.ts`.
- Test: `src/platform/android/biometric.test.ts`, `src/store/biometric.test.ts`, plus additions to `src/features/lock/lock.test.tsx`, `src/features/settings/settings.test.tsx` and `src/features/onboarding/onboarding.test.tsx`.
- Modify:
  - `src/platform/types.ts` (add `biometric: BiometricVault | null` to `Platform`; the web platform gets `null`);
  - `src/store/appStore.ts` (`deps.biometric`, state, actions);
  - `src/test/appStoreStub.tsx`;
  - `src/features/lock/LockScreen.tsx`, `src/features/settings/SecuritySection.tsx`, `src/features/onboarding/OnboardingWizard.tsx`;
  - `package.json` (`npm i -E @capgo/capacitor-native-biometric@8.7.0`).

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export interface BiometricVault {
    available(): Promise<boolean>;
    /** Keep `secret` behind the fingerprint/face check (Keystore, current enrolment only). May show the system prompt. */
    store(slot: string, secret: string): Promise<void>;
    /** Shows the system prompt. `changed`: enrolment changed or the copy is gone (plugin code 21). */
    read(slot: string): Promise<{ status: 'ok'; secret: string } | { status: 'cancelled' } | { status: 'changed' }>;
    forget(slot: string): Promise<void>;
  }
  ```
- **Android implementation (capgo):**
  - `available` = `isAvailable().isAvailable`;
  - `store` = `setData({ key: slot, value, accessControl: AccessControl.BIOMETRY_CURRENT_SET, title: 'Turn on biometric unlock' })`;
  - `read` = `getSecureData({ key: slot, title: 'Unlock Funancial', negativeButtonText: 'Use PIN' })`, where code `21` gives `changed` and any other rejection gives `cancelled`;
  - `forget` = `deleteData`.
- **Store:**
  - `AppDeps.biometric: BiometricVault | null`;
  - state `biometric: 'unavailable' | 'off' | 'on'`, set at boot from `available()` and a meta flag `'biometric'`;
  - actions `enableBiometric(): Promise<void>`, `disableBiometric(): Promise<void>` and `unlockWithBiometric(): Promise<'ok' | 'cancelled' | 'changed'>`;
  - the slot is `` `funancial.${namespace}.unlock` ``, and the secret is the raw data key (`exportKey('raw')` → base64). On `ok` it is imported as an extractable AES-GCM key, then `openWith`, and the throttle is reset.
  - `changed` runs `disableBiometric()`;
  - `clearSecret` and `deleteAllData` forget the copy, while `setSecret` keeps it (the data key is unchanged);
  - enabling is allowed only when unlocked with `lockMode` `pin` or `passphrase`.
- **UI (exact copy):**
  - **LockScreen**, when `biometric === 'on'`: it prompts once on mount and shows the button "Use fingerprint or face". On `changed` it shows "Your fingerprints or face changed, so use your PIN this time. You can turn biometric unlock back on in Settings."
  - **SecuritySection**, only when `biometric !== 'unavailable'` and a PIN or passphrase is set: Switch "Unlock with fingerprint or face", with hint "Your PIN still works if this fails."
  - **Onboarding step 6**, when biometric is available and a PIN or passphrase is chosen: Switch "Also unlock with fingerprint or face", default on. `enableBiometric()` runs after `setSecret`.

- [ ] **Step 1: Write failing tests:**
  - **`biometric.test.ts` (store, real Dexie store, `fakeBiometric()`):**
    - `it('keeps the data key behind biometrics and opens the app with it after a restart')`;
    - `it('falls back to the PIN and turns itself off when enrolment changed')` (**Review Focus 1**): the fake returns `changed`, the result is `'changed'`, `biometric === 'off'`, the phase is still `locked`, and the PIN still unlocks;
    - `it('a cancelled prompt leaves the PIN pad')`;
    - `it('removing the lock forgets the biometric copy')`;
    - `it('deleting all data forgets the biometric copy')`;
    - `it('cannot be turned on without a PIN or passphrase')`.
  - **`android/biometric.test.ts` (plugin mocked):** `it('maps plugin results to ok, cancelled and changed')`, with code `'21'` giving `changed` and `'16'` giving `cancelled`.
  - **UI:**
    - lock: `it('offers fingerprint or face and explains a changed enrolment')`;
    - settings: `it('turns biometric unlock on and off when a PIN is set')`, `it('hides biometric unlock without a lock or on the web')`;
    - onboarding: `it('turns on biometric unlock after setting the PIN')` (order: `setSecret`, then `enableBiometric`).
- [ ] **Step 2: Run** `npx vitest run src/store/biometric src/platform/android/biometric src/features`. Expected: FAIL.
- [ ] **Step 3: Implement** the vault, the store state and actions (the stub store gets spies and `biometric: 'unavailable'`), and the three UI changes.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: green.
- [ ] **Step 5: Commit:** `feat: fingerprint or face unlock backed by the Android Keystore`.

### Task 8: Reminder rules (pure)

**Files:**
- Create: `src/domain/notifications.ts`.
- Test: `src/domain/notifications.test.ts`.
- Modify:
  - `src/domain/entities.ts` (`Settings.reminders`, `defaultSettings`);
  - `src/domain/migrations.ts` (step `3`);
  - `src/domain/snapshot.ts` (`CURRENT_SCHEMA_VERSION = 3`);
  - `src/domain/budget.ts` (export `nextDueDate`);
  - `src/domain/dates.ts` (add `localDateTime(at: string): Date`).

**Interfaces:**
- `Settings.reminders` schema and default:
  ```ts
  { enabled: false, dailyLog: true, dailyTime: '20:00', bills: true, freeze: true, reviews: true, backup: true, prompted: false }
  ```
  `dailyTime` matches `/^([01]\d|2[0-3]):[0-5]\d$/`. Migration step 3 adds the default to settings records that lack it.
- Produces:
  ```ts
  export type ReminderKind = 'daily-log' | 'renewal' | 'card-due' | 'freeze-start' | 'freeze-end' | 'weekly-review' | 'monthly-review' | 'backup';
  export type Reminder = { key: string; kind: ReminderKind; at: string /* local 'YYYY-MM-DDTHH:MM' */; title: string; body: string; route: string };
  export function upcomingReminders(data: DataSnapshot, now: string /* local 'YYYY-MM-DDTHH:MM' */, opts?: { horizonDays?: number; limit?: number }): Reminder[];
  ```
  The defaults are `horizonDays` 30 and `limit` 60. Reminders strictly after `now` and within the horizon are sorted by `at`, then `key`. The result is `[]` when `reminders.enabled` is false or there is no profile.
- `localDateTime('2026-10-25T09:00')` = `new Date(2026, 9, 25, 9, 0)`, in wall-clock local time.
- **Rules and exact copy** (money via `formatMoney(amount, profile.currency)`):

  | kind | when | title | body | route | pref |
  |---|---|---|---|---|---|
  | daily-log | every day at `dailyTime`, skipping today if any expense or income is dated today | Log today's spending | Add what you spent today. It takes a few seconds. | /add | dailyLog |
  | renewal | 09:00 the day before each active subscription renewal (via `nextOccurrence`) | {name} renews tomorrow | {amount} will be charged. | /subscriptions | bills |
  | card-due | 09:00 two days before each card bill from `upcomingBills` (`kind: 'card'`) | {name} payment due in 2 days | {amount} to pay. | /goals | bills |
  | freeze-start / freeze-end | 09:00 on a freeze's start / end date | Salary freeze starts today / Salary freeze ends today | Expected pay is lower while it lasts. Bills still apply. / Your expected pay goes back to normal. | /freeze | freeze |
  | weekly-review | 18:00 on the last day of each week (Sunday when weeks start Monday, Saturday when Sunday), skipped when it is the month's last day | Weekly check-in | See how this week went: spending, limits and bills. | / | reviews |
  | monthly-review | 18:00 on the last day of each month | Monthly review | Look back at this month before it ends. | /budget | reviews |
  | backup | 19:00, 7 days after `lastBackupAt` (else after `profile.onboardedAt`'s date), then every 7 days; if already due, the next 19:00 | Back up your data | Save an encrypted copy to Drive or Files. It takes a minute. | /settings | backup |

  Keys: `daily:{date}`, `renewal:{subId}:{date}`, `card:{debtId}:{date}`, `freeze-start:{id}`, `freeze-end:{id}`, `week:{date}`, `month:{date}`, `backup:{date}`.

- [ ] **Step 1: Write failing tests** in `notifications.test.ts`, with fixtures and `now = '2026-10-14T10:00'`:
  - `it('is empty until reminders are turned on')`;
  - `it('nudges to log every evening, skipping today once something is logged')`;
  - `it('reminds the day before each subscription renewal')`: Streamflix renewing 10-20 gives `{ key: 'renewal:sub-tv:2026-10-20', at: '2026-10-19T09:00', title: 'Streamflix renews tomorrow', body: '<formatMoney(1599)> will be charged.' }`;
  - `it('reminds two days before a card payment is due')`;
  - `it('announces a freeze starting and ending')`;
  - `it('schedules weekly and monthly reviews without doubling up on the last day')`;
  - `it('reminds to back up a week after the last backup')`;
  - `it('honours each switch')`;
  - `it('keeps the nearest 60 within 30 days, all after now')`;
  - `it('keeps 09:00 at 09:00 across a clock change')` (**time-zone check**): with `process.env.TZ = 'Europe/Amsterdam'`, `localDateTime('2026-10-25T09:00').getHours() === 9` and `localDateTime('2026-10-24T09:00').getHours() === 9`.

  In `migrations.test.ts`: `it('v3 adds reminder settings to old settings records')`.
- [ ] **Step 2: Run** `npx vitest run src/domain`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema, the migration, `nextDueDate` export, `localDateTime` and `upcomingReminders`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: green.
- [ ] **Step 5: Commit:** `feat: reminder rules for logging, bills, freezes, reviews and backups`.

### Task 9: Scheduling reminders on the phone

**Files:**
- Create: `src/platform/android/notifier.ts`, `src/platform/reminderIds.ts`, `src/app/useReminderSync.ts`.
- Test: `src/platform/android/notifier.test.ts`, `src/platform/reminderIds.test.ts`, `src/app/useReminderSync.test.tsx`.
- Modify:
  - `src/platform/types.ts` (add `notifier: Notifier | null` to `Platform`; the web platform gets `null`), `src/platform/android/index.ts`;
  - `src/app/Root.tsx` (`useReminderSync` in `UnlockedApp`; opening a notification navigates the router);
  - `package.json` (`npm i -E @capacitor/local-notifications@8.3.1`).

**Interfaces:**
- Produces:
  ```ts
  export interface Notifier {
    permission(): Promise<'granted' | 'denied' | 'prompt'>;
    /** Asks Android (13+) for notification permission. Only call after a user action. */
    request(): Promise<boolean>;
    /** Cancel the reminders this app scheduled and schedule these instead. */
    replace(reminders: Reminder[]): Promise<void>;
    /** One reminder a minute from now, to check they arrive. */
    sendTest(): Promise<void>;
    onOpen(cb: (route: string) => void): () => void;
  }
  export function reminderIds(keys: string[]): number[]; // FNV-1a 32-bit → positive 31-bit, unique (linear probe on collision), never 0 or 1 (1 = test reminder)
  ```
- **Android implementation:**
  - `createChannel({ id: 'reminders', name: 'Reminders', importance: 4 })` once;
  - `replace` cancels pending notifications whose `extra.managed === true`, then schedules each item as `{ id, title, body, channelId: 'reminders', schedule: { at: localDateTime(r.at), allowWhileIdle: true }, extra: { managed: true, route } }`;
  - `sendTest` uses id 1, at now + 60 s, title "Test reminder", body "Reminders are working.", `extra.managed: false`;
  - `permission` maps `'prompt-with-rationale'` to `'prompt'`;
  - `onOpen` listens for `localNotificationActionPerformed`, using `extra.route`, or `'/'` when it's missing.
- Produces: `useReminderSync(notifier: Notifier | null): void`. When unlocked in the `real` namespace:
  - it calls `notifier.replace(upcomingReminders(data, nowLocal()))` 1,000 ms after the latest change to `data` or `today`, and again on `platform.onResume`;
  - it calls `replace([])` in demo;
  - errors go to `console.error` and never reach the UI.

- [ ] **Step 1: Write failing tests:**
  - `reminderIds.test.ts`: `it('gives stable, unique, positive ids')`.
  - `notifier.test.ts` (plugin mocked):
    - `it('replaces only the reminders it scheduled')`: pending `[{ id: 5, extra: { managed: true } }, { id: 1, extra: { managed: false } }]` cancels only 5;
    - `it('schedules in local time, allowed while idle, on the reminders channel')`;
    - `it('sends a test reminder a minute out')`;
    - `it('routes an opened reminder')`.
  - `useReminderSync.test.tsx` (fake timers, fake notifier):
    - `it('schedules what the rules give after changes settle')`;
    - `it('clears reminders in demo and when turned off')`;
    - `it('reschedules when the app comes back')`;
    - `it('keeps working when scheduling fails')` (**Review Focus 3**): `replace` rejects, no toast is shown, and the next change tries again.
- [ ] **Step 2: Run** `npx vitest run src/platform src/app/useReminderSync`. Expected: FAIL.
- [ ] **Step 3: Implement** the code above. `Root` subscribes `notifier.onOpen(route => getAppRouter().navigate(route))` once.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: green.
- [ ] **Step 5: Commit:** `feat: schedule reminders as Android local notifications`.

### Task 10: Reminders in Settings and on Home

**Files:**
- Create: `src/features/settings/RemindersSection.tsx`, `src/features/dashboard/ReminderBanner.tsx`.
- Test: additions to `settings.test.tsx` and `dashboard.test.tsx`.
- Modify: `SettingsScreen.tsx` (the section goes after Preferences, shown only when `usePlatform().notifier`), `DashboardScreen.tsx` (the banner goes under the header).

**Interfaces (exact copy):**
- **RemindersSection, titled "Reminders":**
  - Switch "Reminders on this phone". Turning it on calls `notifier.request()`. When granted, it runs `updateSettings({ reminders: { ...r, enabled: true, prompted: true } })`. When refused, it shows the inline alert "Notifications are blocked for Funancial. Turn them on in Android Settings → Apps → Funancial → Notifications." and leaves `enabled` false.
  - On mount, if `enabled` is true but `permission()` isn't `'granted'`, it shows that same alert.
  - With the master switch on, these Switches are enabled: "Daily nudge to log spending" with Select "At" (`07:00` to `23:00` hourly), "Bills and renewals", "Salary freeze start and end", "Weekly and monthly reviews" and "Backup reminder".
  - Button "Send a test reminder" (`notifier.sendTest()`, toast "A test reminder arrives in about a minute.").
- **ReminderBanner,** shown only when a notifier exists and `!enabled && !prompted` in the real namespace:
  - text "Get reminders for bills, renewals and a daily nudge to log spending.";
  - buttons "Turn on" (the same flow as the switch) and "Not now" (`prompted: true`).

- [ ] **Step 1: Write failing tests:**
  - **settings:**
    - `it('turns reminders on after Android allows it')`;
    - `it('explains how to unblock notifications when refused')` (**Review Focus 3**);
    - `it('saves each reminder switch and the daily time')`;
    - `it('sends a test reminder')`;
    - `it('has no reminders section on the web')`.
  - **dashboard:** `it('offers reminders once and remembers Not now')`.
- [ ] **Step 2: Run** `npx vitest run src/features/settings src/features/dashboard`. Expected: FAIL.
- [ ] **Step 3: Implement** both components.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: green.
- [ ] **Step 5: Commit:** `feat: reminder settings and a one-time Home invitation`.

### Task 11: Phone dev workflow and docs

**Files:**
- Create: `scripts/android-dev.mjs`, `docs/android.md`.
- Test: `tests/unit/capacitorConfig.test.ts`.
- Modify: `package.json` (scripts), `README.md` (a link to `docs/android.md`).

**Interfaces:**
- **Scripts:**
  - `"android:sync": "npm run build && cap sync android"`;
  - `"android:open": "cap open android"`;
  - `"android:run": "npm run android:sync && cap run android"`;
  - `"android:dev": "node scripts/android-dev.mjs"`.
- **`android-dev.mjs`:**
  - it finds `adb`: `$ANDROID_HOME/platform-tools/adb`, else `%LOCALAPPDATA%/Android/Sdk/platform-tools/adb.exe`, else it exits with "adb not found — install Android Studio (see docs/android.md)";
  - it runs `adb reverse tcp:5173 tcp:5173`, then `npx cap run android` with `FUNANCIAL_DEV_URL=http://localhost:5173`.
  - **Why `localhost`:** over `adb reverse`, `http://localhost` is a secure context, so `crypto.subtle` works with no HTTPS certificate. This replaces the design's "HTTPS dev server" (ledger ruling).
  - It prints: "Live reload is on. Keep `npm run dev` running. Run `npm run android:run` before using the app away from this computer."
- **`docs/android.md`** covers:
  - installing Android Studio (it bundles JDK 21), and setting `JAVA_HOME` (`C:\Program Files\Android\Android Studio\jbr`) and `ANDROID_HOME` (`%LOCALAPPDATA%\Android\Sdk`);
  - enabling USB debugging and accepting the RSA prompt, then checking `adb devices`;
  - `npm run android:run` (install) and `npm run android:dev` (live reload);
  - moving data from the browser (back up on desktop, send the file to the phone, Settings → Restore);
  - the note that this is a debug build for personal use, with signed release builds deferred.

- [ ] **Step 1: Write the failing test** `capacitorConfig.test.ts`: `it('points at the dev server only when asked')`. Import the config with `FUNANCIAL_DEV_URL` unset and expect no `server`. Then `vi.resetModules()`, set the variable, and expect `server.url === 'http://localhost:5173'` and `server.cleartext === true`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/capacitorConfig`. Expected: it passes if Task 4's config already reads the variable. If so, keep it as a pinning test and note in the ledger that it was green on arrival. Otherwise it fails and you fix the config.
- [ ] **Step 3: Implement** the scripts and docs.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: green.
- [ ] **Step 5: Commit:** `docs: run Funancial on an Android phone, with live reload`.

### Task 12: On the phone (needs the user)

**Precondition (user action):** Android Studio installed and opened once, USB debugging on, the phone connected, and `adb devices` listing it. If any of this is missing, stop and ask the user. This is the plan's only blocking stop.

**Files:** fixes only, wherever the device shows a problem. Each fix gets a failing unit test first if the cause is in TypeScript.

- [ ] **Step 1: Build check.** Set `JAVA_HOME` and `ANDROID_HOME`, then run `cd android && ./gradlew assembleDebug`. Expected: `BUILD SUCCESSFUL`.
- [ ] **Step 2: Install** with `npm run android:run`. Expected: the app opens on the phone at Welcome.
- [ ] **Step 3: Checklist, with the user at the phone.** Record each result in the ledger.
  1. Onboarding with a PIN, plus fingerprint or face, lands on Home. Safe areas: nothing sits under the status bar or the gesture bar, in light and dark.
  2. Add an expense, force-stop the app from Android Settings, and reopen it. Biometric unlock opens the app, and the expense is still there.
  3. Database encryption: `adb shell run-as io.github.bhccob.funancial ls databases` shows the database file, and `adb shell run-as io.github.bhccob.funancial head -c 16 databases/funancial-realSQLite.db` does **not** print `SQLite format 3`. The file name is whatever the plugin creates.
  4. Biometric "Use PIN" works. After 1 minute in the background with auto-lock at 1 minute, the app asks again.
  5. The back gesture closes a dialog, then goes back, then backgrounds the app on Home.
  6. Settings → create an encrypted backup → the share sheet opens → save to Files. Restore it after "Delete all data".
  7. Turn reminders on, allow notifications, and use "Send a test reminder". Then swipe the app away; the reminder arrives within about 2 minutes with the app closed. Tapping it opens the app.
  8. Restart the phone. Reminders are still scheduled (check one renewal reminder the next morning, or `adb shell dumpsys alarm | grep funancial`).
- [ ] **Step 4:** Fix anything that failed, one TDD cycle each (when the cause is in TypeScript), and re-run the affected checks.
- [ ] **Step 5: Commit:** `fix: on-device findings` (only if anything changed), and record the checklist outcome in the ledger.

---

## Milestone checkpoint (M3 done)

Funancial is installed on the user's Android phone with real data:
- an encrypted database;
- fingerprint or face unlock, with the PIN as backup;
- reminders that arrive while the app is closed;
- backups through the share sheet.

Desktop browser copies come from those backups.

**Next:** M4, the game layer.
