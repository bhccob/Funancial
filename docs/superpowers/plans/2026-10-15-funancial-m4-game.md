# Funancial M4: Game Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the game layer to Funancial, everywhere the app runs, including the Android phone:
- XP and 50 levels in 5 tiers;
- daily, weekly and monthly quests;
- streaks, with streak freezes bought with coins;
- badges and challenges;
- a cosmetic coin shop;
- a Quests & Achievements screen;
- reward and level-up animations.

**Architecture:** Game state is derived. Pure functions in `src/domain/game/` read the finance data and work out every reward it has earned. One reconcile step compares that against an append-only ledger and writes only the difference. The ledger is the `ledger` table: XP and coins, entries keyed by source.

The store runs that reconcile after every write and every sync, in the same session. Entry ids are derived from their keys, so running it twice, or in two tabs, never pays out twice. The UI reads a computed `GameView` and celebrates the store's latest `gameGain`.

**Tech Stack:** React 19, TypeScript, Tailwind 4, zustand 5, zod 4, lucide-react, Vitest and Testing Library, Playwright. No new dependencies.

**Spec:**
- `docs/superpowers/specs/2026-10-14-funancial-design.md`: the design. Game decisions are under "Calls I made" item 8, "Rules of the codebase" item 5, and M4.
- `docs/spec/original-spec.md`: Part 2.3 (progression), Part 5 (Quests & Achievements), Part 8 (notifications).
- `docs/design/visual-direction.md`: the HUD strip and quest rows. The game layer is violet and small.

## Calls this plan makes (for the owner's review)

The spec leaves these open. Each is decided here, and implementers follow it as written.

1. **No event bus.** The design's "events/ → game engine" is replaced by derive-and-reconcile. A reward exists because the data earns it, so deletes, restores and two tabs stay consistent without replaying events.
2. **What reverses, and what stays.**
   - Only *logging* XP reverses: delete an entry and its XP comes off.
   - Quest, streak, badge and challenge rewards are final once paid, as are shop purchases.
   - Quests are judged only for the current day, week and month. "Stay within your limits this week" is the exception: it is judged for the week that just closed.
3. **Logging counts by when you log, not the date on the expense.**
   - Each entry earns 10 XP, for the first 5 entries a day by local logging day (`createdAt`).
   - Only entries you log yourself count: expenses that aren't subscription charges, and extra income. Salaries are covered by a monthly quest instead.
4. **Badges and challenges in M4.** The other badges and challenges need features that don't exist yet. M5 adds First ETF, Portfolio Pro, the three dividend badges, the dividend streak and the Portfolio Check-Up challenge. M6 adds Smart Shopper, Impulse Controller and Budget Defender. The registries are built to grow.

   | | In M4 |
   |---|---|
   | Badges | First Expense Logged, Subscription Slayer, Limit Keeper, Freeze Master |
   | Challenges | No-Spend Weekend, Subscription Audit, 30-Day Budget Streak, Emergency Fund Sprint |
   | Streaks | Daily logging, No overspending, Weekly check-in |

5. **Freeze Master is about salary freezes:** get through one without going over a limit.
6. **"Nothing spent today" is a check-in.** A day without spending can still keep the logging streak and finish the daily quest, so the game never pushes anyone to log something fake.
7. **The weekly check-in is a one-minute review.** The dialog shows the week's spending, limits and the bills due in the next 7 days. Tapping "Check in" records it.
8. **Streak freezes:**
   - They cover a missed day of the logging streak, or a missed week of the check-in streak.
   - They are used automatically, only when the tokens you hold cover the whole gap.
   - A covered day counts toward the streak.
   - They don't apply to "No overspending", because going over isn't something you miss.
   - You can hold at most 2 of each kind.
9. **Cosmetics:**
   - "Skins" are game-colour themes that recolour only the game layer: Violet (free), Ocean, Orchid, Graphite.
   - Avatars are lucide icons.
   - Badge frames are rings around the avatar and the badges.
   - Money colours never change.
10. **Where the HUD shows.** The HUD strip sits at the top of Home, and in the Quests screen header, not on every screen. That keeps money screens clean.
11. **When celebrations show.**
    - Logging XP alone animates the XP bar, with no toast.
    - Quest, streak and challenge rewards get one toast.
    - Badges get their own toast.
    - A level-up opens a dialog.
    - No local notifications: every reward happens while the app is open.

## Global Constraints

- Everything under `src/domain/game/` is pure TypeScript. No React, no IO, no `Date.now()`: time comes in through `GameContext`.
- XP and coins are integers. Coins are only ever earned in the game and spent on cosmetics and streak freezes. They can't be bought and have no money value. The shop says so: "Coins are for fun. They can't be bought and have no money value."
- Local days are `LocalDate` strings. A timestamp becomes a day only through `localDay(iso)`, which is `toLocalDate(new Date(iso))`. Loops step through `LocalDate` strings with `addDays`, never through milliseconds, so daylight-saving days count once.
- Ledger ids are derived from keys: `ledgerId(key, n)` = `` `${key}#${n}` ``, where `n` counts the entries with that key already in the ledger. Freeze uses have the id `` `freeze:<streak>:<date>` ``, and check-ins `` `checkin:<kind>:<date>` ``.
- Tone: no shaming. A streak at 0 reads "Start a new streak today." An over-limit week reads "Over a limit this week. Next week is a fresh start."
- Visual rules (from `docs/design/visual-direction.md`):
  - no box cards; sections are separated by hairlines;
  - the game layer uses only `--color-xp*` tokens and stays small, never competing with money figures;
  - icons are lucide;
  - every animation runs only under `motion-safe:`, so `prefers-reduced-motion` turns it off.
- Tests run with `npm test` (Vitest), `npm run typecheck`, `npm run lint` and `npm run test:e2e`. Tests that build timestamps use `localIso(day, hour)` from `src/test/fixtures.ts`, so they pass in every time zone.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, or with the dispatching model's own trailer for subagent commits, per the M3 ruling.

## Review Focus

1. **Day boundaries and time zones.**
   - An entry created at 23:30 local time counts for that local day, not the UTC day.
   - A streak that spans the daylight-saving change on 2026-10-25 counts each day once.
   - Pinned by Task 3 (`localDay` at 23:00 and 00:00) and Task 4 (a run from 10-24 to 10-26 counts 3).
2. **Paying out twice.** Settling twice, two tabs settling the same data, or a sync right after a write must never pay twice. Pinned by Task 3 (reconcile is idempotent) and Task 8 (two stores on one storage).
3. **Backups across versions.**
   - An M3 backup (schema v3, no game tables) restores and starts the game from its history.
   - A v4 backup restores its XP exactly and adds nothing on the next settle.
   - Pinned by Task 1 (migrating v3) and Task 8 (a restore keeps the ledger).
4. **The first open over a long history.** That open may pay hundreds of logging rewards and several quests at once. It must show one summary toast and one level-up dialog showing the final level, not dozens. Pinned by Task 10.
5. **Edits and deletes.**
   - Changing an expense's date or amount never re-pays or reverses its logging XP.
   - Deleting entries never shows negative coins, or a level below 1.
   - Pinned by Task 2 (a negative total is level 1), Task 8 (editing pays nothing) and Task 9 (coins shown at a floor of 0).

---

### Task 1: Data model v4

**Files:**
- Modify: `src/domain/entities.ts`
- Modify: `src/domain/snapshot.ts`
- Modify: `src/domain/migrations.ts`
- Modify: `src/store/financeActions.ts` (`setSubscriptionAudit`)
- Modify: `src/test/fixtures.ts`
- Modify: `src/data/demoSeed.ts` (type fixes only)
- Test: `src/domain/snapshot.test.ts`, `src/domain/entities.test.ts`, `src/domain/migrations.test.ts`, `src/store/financeActions.test.ts`

**Interfaces:**

Produces these schemas in `entities.ts`, each also exported as a type. Every entity has the usual `base` fields (`id`, `createdAt`, `updatedAt`).

| Schema | Fields |
|---|---|
| `LedgerEntrySchema` | `key: string` (min 1); `kind: 'award' \| 'reversal' \| 'purchase'`; `xp: int`; `coins: int`; `label: string` |
| `CheckInSchema` | `kind: 'no-spend' \| 'weekly'`; `date: LocalDate` (the day, or the week's start) |
| `ChallengeKindSchema` | enum: `'no-spend-weekend' \| 'subscription-audit' \| 'budget-30' \| 'emergency-sprint'` |
| `ChallengeSchema` | `kind: ChallengeKind`; `start`, `end: LocalDate` (refine: `end >= start`); `baseline: Money \| null`; `goal: PositiveMoney \| null`; `status: 'active' \| 'abandoned'` |
| `StreakFreezeSchema` | `streak: 'logging' \| 'checkin'`; `date: LocalDate` |
| `CosmeticsSchema` | `{ theme, avatar, frame }`, each a string of min length 1 |

It also changes existing entities:
- `Settings` gains `cosmetics: Cosmetics`. `defaultSettings` sets `{ theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' }`.
- `Subscription` gains `auditedAt: IsoTimestamp | null`.

In `snapshot.ts`:
- `TABLES` gains `'ledger', 'checkIn', 'challenge', 'streakFreeze'`, appended after `'debt'`, with matching `SCHEMAS` entries.
- In `SnapshotSchema`, those four tables use `.default([])`, so older snapshots without them still parse.
- `emptySnapshot()` includes the four tables.
- `CURRENT_SCHEMA_VERSION = 4`.

In `migrations.ts`, step `4` is spelled out like step 3:
- `settings` without `cosmetics` gets `{ theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' }`.
- `subscription` without `auditedAt` gets `auditedAt: null`.

New fixtures in `src/test/fixtures.ts`:
- `localIso(day: LocalDate, hour = 12): string`, which is `new Date(y, m - 1, d, hour).toISOString()`.
- `makeLedgerEntry`, `makeCheckIn`, `makeChallenge` and `makeStreakFreeze`, each taking `overrides`.
- `makeSubscription` now includes `auditedAt: null`.

`setSubscriptionAudit(id, audit)` now also sets `auditedAt`: `nowIso()` when `audit !== null`, and `null` when `audit === null`.

- [ ] **Step 1: Write the failing tests**

```ts
// snapshot.test.ts
it('upgrades a v3 snapshot: empty game tables, default cosmetics, auditedAt null', () => {
  const v3 = { schemaVersion: 3, tables: { /* every v3 table */ profile: [], settings: [v3Settings], income: [], expense: [], subscription: [v3Sub], budgetLimit: [], salaryFreeze: [], transaction: [], goal: [], debt: [] } };
  const s = migrateSnapshot(v3);
  expect(s.schemaVersion).toBe(4);
  expect(s.tables.ledger).toEqual([]);
  expect(s.tables.checkIn).toEqual([]);
  expect(s.tables.challenge).toEqual([]);
  expect(s.tables.streakFreeze).toEqual([]);
  expect(s.tables.settings[0]!.cosmetics).toEqual({ theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' });
  expect(s.tables.subscription[0]!.auditedAt).toBeNull();
});
// entities.test.ts
it('rejects fractional XP', () => expect(LedgerEntrySchema.safeParse(makeLedgerEntry({ xp: 1.5 })).success).toBe(false));
it('rejects a challenge that ends before it starts', () =>
  expect(ChallengeSchema.safeParse(makeChallenge({ start: '2026-10-15', end: '2026-10-14' })).success).toBe(false));
// financeActions.test.ts
it('stamps auditedAt when a subscription is audited and clears it when the mark is removed', async () => {
  // setSubscriptionAudit(id, 'keep') → auditedAt is an ISO string; setSubscriptionAudit(id, null) → auditedAt null
});
```

`v3Settings` is `makeSettings()` with `cosmetics` deleted, and `v3Sub` is `makeSubscription()` with `auditedAt` deleted.

- [ ] **Step 2: Run the tests and watch them fail.** `npx vitest run src/domain src/store/financeActions.test.ts`. Expected: FAIL. `LedgerEntrySchema` isn't exported, and the version is 3.
- [ ] **Step 3: Implement** the schemas, tables, migration step, fixtures and audit stamp. Then fix every type error `npm run typecheck` reports by adding the new fields:
  - demo seed subscriptions get `auditedAt: null`;
  - `saveSubscription` keeps the existing `auditedAt`, or `null` for a new subscription.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass. Any test that pinned schema version 3 should now say 4; that is the intended bump.
- [ ] **Step 5: Commit:** `feat: game tables and schema v4`

---

### Task 2: Levels and reward rules

**Files:**
- Create: `src/domain/game/types.ts`, `src/domain/game/rules.ts`, `src/domain/game/levels.ts`
- Test: `src/domain/game/levels.test.ts`

**Interfaces:**

`types.ts` exports these types:

```ts
export type GameContext = { today: LocalDate; now: string; weekStartsOn: 0 | 1; canBackUp: boolean };
export type Reward = { xp: number; coins: number };
export type AwardKind = 'log' | 'quest' | 'streak' | 'badge' | 'challenge';
export type Award = { key: string; kind: AwardKind; title: string; label: string; xp: number; coins: number };
export type StreakKind = 'logging' | 'no-overspend' | 'checkin';
export type QuestId = 'log-today' | 'week-limits' | 'week-checkin' | 'month-salary' | 'month-audit' | 'month-backup';
export type BadgeId = 'first-expense' | 'subscription-slayer' | 'limit-keeper' | 'freeze-master';
export type { ChallengeKind } from '../entities';
```

`rules.ts` exports these constants, used exactly:

| Constant | Value |
|---|---|
| `LOG_XP` | `10` |
| `LOG_CAP_PER_DAY` | `5` |
| `QUEST_REWARDS` | `log-today` 20/5; `week-limits` 60/15; `week-checkin` 40/10; `month-salary` 100/25; `month-audit` 100/25; `month-backup` 80/20 (xp/coins) |
| `STREAK_MILESTONES.logging` | at 7 (50/10), 30 (150/40), 100 (400/100), 365 (1000/250) |
| `STREAK_MILESTONES['no-overspend']` | the same as `logging` |
| `STREAK_MILESTONES.checkin` | at 4 (60/15), 12 (200/50), 52 (800/200) |
| `BADGE_REWARDS` | `first-expense` 50/10; `subscription-slayer` 100/25; `limit-keeper` 150/40; `freeze-master` 150/40 |
| `CHALLENGE_REWARDS` | `no-spend-weekend` 120/30; `subscription-audit` 120/30; `budget-30` 400/100; `emergency-sprint` 250/60 |

`levels.ts` exports:
- `MAX_LEVEL = 50`
- `TIERS`: `[{ name: 'Bronze Saver', from: 1 }, { name: 'Silver Budgeter', from: 11 }, { name: 'Gold Planner', from: 21 }, { name: 'Platinum Investor', from: 31 }, { name: 'Diamond Master', from: 41 }]`
- `xpForLevel(level)`: `Math.round(100 * level ** 1.4)`, the XP from `level` to `level + 1`
- `levelStart(level)`: the total XP at which that level begins
- `tierOf(level)`
- `type LevelInfo = { level; tier; xpIntoLevel; xpForNext: number | null; progress }`
- `levelInfo(totalXp)`

- [ ] **Step 1: Write the failing tests**

```ts
it('starts at level 1, Bronze Saver, 0 of 100', () =>
  expect(levelInfo(0)).toEqual({ level: 1, tier: 'Bronze Saver', xpIntoLevel: 0, xpForNext: 100, progress: 0 }));
it('levels up at 100 and needs 264 more', () => expect(levelInfo(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 264 }));
it('stays level 1 at 99', () => expect(levelInfo(99).level).toBe(1));
it('starts level 3 at 364 and level 11 at 11,749', () => { expect(levelStart(3)).toBe(364); expect(levelStart(11)).toBe(11_749); });
it('names the tiers at 10/11, 21, 31, 41', () => {
  expect(tierOf(10)).toBe('Bronze Saver'); expect(tierOf(11)).toBe('Silver Budgeter');
  expect(tierOf(21)).toBe('Gold Planner'); expect(tierOf(31)).toBe('Platinum Investor'); expect(tierOf(41)).toBe('Diamond Master');
});
it('caps at level 50', () => expect(levelInfo(486_200)).toMatchObject({ level: 50, xpForNext: null, progress: 1 }));
it('treats a negative total as level 1 with no progress', () => expect(levelInfo(-50)).toMatchObject({ level: 1, xpIntoLevel: 0 }));
```

- [ ] **Step 2: Run** `npx vitest run src/domain/game`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement** the three files. `levelInfo` walks the levels from 1. `progress` is `xpIntoLevel / xpForNext`, or `1` at `MAX_LEVEL`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: levels, tiers and reward rules`

---

### Task 3: Activity and the ledger

**Files:**
- Create: `src/domain/game/activity.ts`, `src/domain/game/ledger.ts`
- Test: `src/domain/game/activity.test.ts`, `src/domain/game/ledger.test.ts`

**Interfaces:**

Consumes from Task 1 the `LedgerEntry` and `CheckIn` types and `localIso`; from Task 2 the `Award`, `Reward`, `LOG_XP` and `LOG_CAP_PER_DAY`.

Produces in `activity.ts`:
- `localDay(iso: string): LocalDate`
- `type LoggedEntry = { table: 'expense' | 'income'; id: string; createdAt: string; day: LocalDate }`
- `loggedEntries(data)`: expenses with `subscriptionId === null`, and incomes with `source === 'extra'`. Sorted by `createdAt`, then by `id`.
- `activeDays(data): Set<LocalDate>`: the days of the logged entries, plus the `date` of every `no-spend` check-in.
- `createSpendIndex(data, weekStartsOn): { overOn(day): boolean; limitsOn(day): boolean }`. Index expenses by date once.
  - `limitsOn(day)`: some limit has `localDay(createdAt) <= day`.
  - `overOn(day)`: some limit existing on `day` has spent more than its `amount` in the period containing `day`, counting expenses dated up to and including `day`. Spending exactly the amount is not over.

Produces in `ledger.ts`:
- `ledgerId(key: string, n: number): string`
- `netByKey(ledger): Map<string, Reward>`
- `ledgerTotals(ledger): Reward`, which sums every entry.
- `loggingAwards(data): Award[]`:
  - covers the first `LOG_CAP_PER_DAY` logged entries of each local day;
  - key `` `log:${table}:${id}` ``, kind `'log'`;
  - title and label `'Logged an expense'` or `'Logged income'`;
  - `LOG_XP` XP and 0 coins.
- `reconcileLedger(ledger, awards: { reversible: Award[]; oneTime: Award[] }, now: string): LedgerEntry[]`:
  - **Reversible:** an award whose key has a net of 0 gets an `award` entry. A key starting `log:` with non-zero net XP that is no longer awarded gets a `reversal`, with `xp: -net.xp`, `coins: -net.coins` and label `` `Removed: ${previous label}` ``.
  - **One-time:** a key with no entries yet gets an `award`.
  - `purchase` entries are never touched.
  - New entries get `ledgerId(key, existingCountForKey + emittedSoFarForKey)`, with `createdAt` and `updatedAt` set to `now`.

- [ ] **Step 1: Write the failing tests**

```ts
// activity.test.ts
it('reads a timestamp as its local day', () => {
  expect(localDay(localIso('2026-10-15', 23))).toBe('2026-10-15');
  expect(localDay(localIso('2026-10-16', 0))).toBe('2026-10-16');
});
it('logs what the person entered, not subscription charges or salary', () => { /* one each → two LoggedEntry rows */ });
it('counts a no-spend check-in as an active day', () => { /* activeDays has its date */ });
it('is over only past the amount, within the period, and only for limits that existed', () => {
  // monthly food limit 100_00 created localIso('2026-10-01'); food 60_00 on 10-05, 50_00 on 10-20
  // overOn('2026-10-19') false; overOn('2026-10-20') true; overOn('2026-11-01') false
  // a food expense making exactly 100_00 is not over
  // a second limit created 10-21: limitsOn('2026-10-20') is true only because of the first
});
// ledger.test.ts
it('pays logging XP for the first five entries of a local day', () => {
  // seven expenses created 2026-10-15 at hours 9..15 → five awards for the earliest five; one on 10-16 → award
});
it('counts an entry on the day it was logged, whatever its date', () => { /* expense dated 10-01, created 10-15 → counts toward 10-15 */ });
it('grants missing awards with key-derived ids', () => { /* id 'log:expense:a#0', kind 'award', xp 10 */ });
it('reverses logging XP when the entry is gone', () => { /* reversal id 'log:expense:a#1', xp -10, label 'Removed: Logged an expense' */ });
it('grants again after a reversal', () => { /* id '#2' */ });
it('grants one-time awards once and never reverses them', () => { /* second run [] ; key missing from awards → no reversal */ });
it('never touches purchases', () => { /* a 'shop:theme-ocean:p1' purchase stays alone */ });
it('is idempotent', () => { const first = reconcileLedger(ledger, awards, now); expect(reconcileLedger([...ledger, ...first], awards, now)).toEqual([]); });
it('totals XP and coins across awards, reversals and purchases', () => { /* 30 xp, 20 coins */ });
```

- [ ] **Step 2: Run** `npx vitest run src/domain/game`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: logging awards and the XP ledger`

---

### Task 4: Streaks and streak freezes

**Files:**
- Create: `src/domain/game/streaks.ts`
- Test: `src/domain/game/streaks.test.ts`

**Interfaces:**

Consumes from Task 3 `activeDays`, `createSpendIndex`, `localDay` and `ledgerId`. Consumes `weekRange` and `addDays`.

Produces:

```ts
export type StreakView = {
  kind: StreakKind; title: string; unit: 'day' | 'week'; count: number;
  active: boolean; doneThisPeriod: boolean; tokens: number | null; runStart: LocalDate | null;
};
export function computeStreaks(data: DataSnapshot, ctx: GameContext): StreakView[]; // [logging, no-overspend, checkin]
export function freezeTokensHeld(data: DataSnapshot, streak: 'logging' | 'checkin'): number;
export function freezeUsesDue(data: DataSnapshot, ctx: GameContext): StreakFreeze[];
export function streakAwards(streaks: StreakView[]): Award[];
```

The streak titles are `'Daily logging'`, `'No overspending'` and `'Weekly check-in'`.

**Daily logging:**
- A day is kept when it is in `activeDays`, or covered by a `StreakFreeze` of kind `logging`.
- `count` is the run of kept days ending today if today is kept. Otherwise it ends yesterday, and `doneThisPeriod` is false. It is `0` when neither today nor yesterday is kept.
- `runStart` is the run's first day.

**Weekly check-in:** the same as daily logging, but by week. A week is keyed by `weekRange(day, weekStartsOn).start`. It is kept by a `weekly` check-in for that start, or by a `checkin` freeze.

**No overspending:**
- `active` is false, with `count 0`, until a limit exists.
- Otherwise `count` is the run of days ending today, inclusive, where `!overOn(day)`. It never goes back before the first day any limit existed.
- `doneThisPeriod = !overOn(today)`. `tokens` is `null`.

**`freezeTokensHeld`** is the number of ledger `purchase` entries whose key starts with `` `shop:freeze-${streak}:` ``, minus the `streakFreeze` rows of that streak.

**`freezeUsesDue`:**
- For logging, take the last kept day before today, then the missed days strictly between it and today.
- If at least one day was missed, and no more days than the tokens held, return one use per missed day: `{ id: 'freeze:logging:<day>', streak: 'logging', date: <day>, createdAt: now, updatedAt: now }`.
- Otherwise return `[]`.
- The same applies by week for `checkin`, with `date` being the missed week's start.

**`streakAwards`** gives one award per milestone `at <= count` of a run that has a `runStart`:
- key `` `streak:${kind}:${runStart}:${at}` ``, kind `'streak'`;
- title `` `${title}: ${at}-${unit} streak` ``, which is also the label;
- the milestone's reward.

- [ ] **Step 1: Write the failing tests.** Use today `2026-10-15` (a Thursday) and `weekStartsOn` 1.

```ts
it('counts the logging run through yesterday until today is done', () => {
  // active 10-12, 10-13, 10-14 → { count: 3, doneThisPeriod: false, runStart: '2026-10-12' }; plus today → count 4, done true
});
it('breaks after a missed day without freezes', () => { /* last active 10-12 → count 0 */ });
it('spends freezes only when they cover the whole gap', () => {
  // run 10-10..10-12, today 10-15, two freeze purchases → uses for 10-13 and 10-14 (ids 'freeze:logging:2026-10-13'…); one purchase → []
});
it('counts covered days and spends the tokens', () => { /* with those uses written: count 5, tokens 0 */ });
it('counts each day once across the daylight-saving change', () => { /* active 10-24, 10-25, 10-26, today 10-26 → count 3 */ });
it('tracks no overspending only once a limit exists', () => {
  // no limits → active false, count 0
  // weekly food limit 50_00 created 10-01; 60_00 dated 10-08 → count 4 (10-12..10-15), runStart '2026-10-12', done true
});
it('counts check-in weeks and keeps this week open', () => { /* weekly check-ins 09-28, 10-05 → count 2, done false; plus 10-12 → 3 */ });
it('awards milestones per run', () => {
  // logging run 10-09..10-15 → key 'streak:logging:2026-10-09:7', xp 50, coins 10, label 'Daily logging: 7-day streak'; a 6-day run → none
});
```

- [ ] **Step 2: Run** `npx vitest run src/domain/game/streaks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `streaks.ts`. Walk backwards with `addDays(day, -1)`, or by weeks with `-7`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: streaks with freeze tokens and milestones`

---

### Task 5: Quests

**Files:**
- Create: `src/domain/game/quests.ts`
- Test: `src/domain/game/quests.test.ts`

**Interfaces:**

Consumes from Task 3 `loggedEntries`, `createSpendIndex` and `localDay`, and from Task 2 `QUEST_REWARDS`.

Produces:

```ts
export type QuestView = {
  id: QuestId; cadence: 'daily' | 'weekly' | 'monthly'; period: string; title: string; detail: string;
  current: number; target: number; done: boolean; reward: Reward; action: 'no-spend' | 'checkin' | null;
};
export function currentQuests(data: DataSnapshot, ctx: GameContext): QuestView[]; // daily → weekly → monthly
export function questAwards(data: DataSnapshot, ctx: GameContext): Award[];
```

A quest's `period` is today for daily quests, the week's start for weekly ones, and `YYYY-MM` for monthly ones.

| id | Shown when | Title | Done when | Progress and detail |
|---|---|---|---|---|
| `log-today` | always | `Log today's spending` | a logged entry was created today, or there is a `no-spend` check-in dated today | target 1. Detail `Done for today` / `Add an expense, or tap Nothing spent`. `action: 'no-spend'` while no logged expense is dated today and it isn't done, else `null` |
| `week-limits` | a limit exists | `Stay within your limits this week` | never during the week; see awards below | current = the day of the week, 1–7, target 7. Detail `` `Day ${n} of 7 · on track` ``, or `Over a limit this week. Next week is a fresh start.` once any day this week was over |
| `week-checkin` | always | `Do your weekly check-in` | a `weekly` check-in dated this week's start | target 1. Detail `Checked in` / `Review your week in a minute`. `action: 'checkin'` until done |
| `month-salary` | `profile.salary !== null` | `Reconcile this month's salary` | this month's salary income (`period === YYYY-MM`) has status `confirmed` or `skipped` | target 1. Detail `Done` / `Confirm it or mark it as not arrived` (expected exists) / `Waiting for pay day` |
| `month-audit` | an active subscription exists | `Audit your subscriptions` | every active subscription has an `auditedAt` local day in this month | current = how many are audited, target = active count. Detail `` `${current} of ${target} reviewed` `` |
| `month-backup` | `ctx.canBackUp` | `Back up your data` | `settings.lastBackupAt` has a local day in this month | target 1. Detail `Backed up` / `Save an encrypted copy` |

**`questAwards`:**
- Every done quest in `currentQuests` earns an award: key `` `quest:${id}:${period}` ``, kind `'quest'`, title the quest's title, label `` `Quest: ${title}` ``, and the reward from `QUEST_REWARDS`.
- `week-limits` is also judged for the most recently closed week, the 7 days before this week's start, and for no week before that. It is awarded with that week's start as its period when:
  - some limit existed on that week's last day;
  - no day of that week has `overOn`.

- [ ] **Step 1: Write the failing tests.** Use today `2026-10-15`, `weekStartsOn` 1 (this week is 10-12 to 10-18), and `ctx.canBackUp` true.

```ts
it('shows each quest only when it applies', () => { /* bare data → log-today, week-checkin; + limit → week-limits; + salary → month-salary; + active sub → month-audit; canBackUp false → no month-backup */ });
it('completes the daily quest by logging or by a no-spend check-in, not by a subscription charge', () => {});
it('offers Nothing spent only until something is logged', () => { /* action 'no-spend' → null after a logged expense dated today */ });
it('tracks the week of limits', () => { /* current 4, target 7, 'Day 4 of 7 · on track'; over on 10-13 → 'Over a limit this week. Next week is a fresh start.' */ });
it('awards the daily quest with its day', () => { /* key 'quest:log-today:2026-10-15', xp 20, coins 5, label "Quest: Log today's spending" */ });
it('awards the limits quest for the week that just closed', () => {
  // limit since 10-01, nothing over 10-05..10-11 → key 'quest:week-limits:2026-10-05'; over on 10-08 → none; week 09-28 never judged
});
it('completes the weekly check-in', () => { /* weekly check-in dated 10-12 → 'quest:week-checkin:2026-10-12' */ });
it('completes the salary quest once confirmed or skipped', () => { /* expected → not done; confirmed or skipped → done */ });
it('counts subscriptions audited this month', () => { /* 2 active, 1 auditedAt in October, 1 in September → 1 of 2 reviewed */ });
it('completes the backup quest with a backup this month', () => {});
```

- [ ] **Step 2: Run** `npx vitest run src/domain/game/quests.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `quests.ts`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: daily, weekly and monthly quests`

---

### Task 6: Badges and challenges

**Files:**
- Create: `src/domain/game/badges.ts`, `src/domain/game/challenges.ts`
- Test: `src/domain/game/badges.test.ts`, `src/domain/game/challenges.test.ts`

**Interfaces:**

Consumes from Task 3 `createSpendIndex`, `loggedEntries` and `localDay`, and from Task 2 `BADGE_REWARDS` and `CHALLENGE_REWARDS`.

Produces in `badges.ts`:
- `BADGES`, in this order:

  | id | name | description |
  |---|---|---|
  | `first-expense` | `First Expense Logged` | `Log your first expense.` |
  | `subscription-slayer` | `Subscription Slayer` | `Cancel a subscription you don't need.` |
  | `limit-keeper` | `Limit Keeper` | `Finish a calendar month without going over any limit.` |
  | `freeze-master` | `Freeze Master` | `Get through a salary freeze without going over any limit.` |

- `type BadgeView = { id; name; description; earnedAt: string | null; reward: Reward }`
- `badgeViews(data): BadgeView[]`, where `earnedAt` is the `createdAt` of the ledger entry keyed `badge:<id>`.
- `badgeAwards(data, ctx): Award[]`, for badges whose condition holds and whose key isn't in the ledger yet: key `` `badge:${id}` ``, kind `'badge'`, title the badge's name, label `` `Badge: ${name}` ``.

Badge conditions:
- **first-expense:** a logged expense exists.
- **subscription-slayer:** a subscription has status `cancelled`.
- **limit-keeper:** a calendar month exists whose last day is before today, where a limit existed on the month's first day and no day of the month has `overOn`.
- **freeze-master:** a salary freeze exists with `end < today`, where a limit existed on its `start` and no day in `[start, end]` has `overOn`.

Produces in `challenges.ts`:
- `CHALLENGES`, a list of `{ kind, title, description }`:

  | kind | title | description |
  |---|---|---|
  | `no-spend-weekend` | `No-Spend Weekend` | `Log no spending this coming Saturday and Sunday.` |
  | `subscription-audit` | `Subscription Audit` | `Review every subscription within 7 days.` |
  | `budget-30` | `30-Day Budget Streak` | `Stay within every limit for 30 days.` |
  | `emergency-sprint` | `Emergency Fund Sprint` | `Add 10% of your emergency fund target within 30 days.` |

- `type ChallengeOutcome = 'active' | 'won' | 'lost' | 'abandoned'`
- `type ChallengeView = { challenge: Challenge; title: string; outcome: ChallengeOutcome; current: number; target: number; detail: string; reward: Reward }`
- `startRequirement(kind, data, ctx): string | null`. It returns:
  - `This challenge is already running.` when one of the kind is active;
  - `Add a subscription first.` for `subscription-audit` with no active subscription;
  - `Set a limit first.` for `budget-30` with no limit;
  - `Add an emergency fund goal first.` for `emergency-sprint` with no goal of kind `emergency`;
  - `null` otherwise.
- `newChallenge(kind, data, ctx, id: string): Challenge`, with `createdAt` and `updatedAt` set to `ctx.now` and `status: 'active'`.
- `challengeViews(data, ctx): ChallengeView[]`, newest first.
- `challengeAwards(data, ctx): Award[]` for won challenges: key `` `challenge:${id}` ``, kind `'challenge'`, label `` `Challenge: ${title}` ``.

**Windows and outcomes.** A challenge with a `challenge:<id>` ledger key is always `won`. `abandoned` comes from `status`, and anything else is worked out as below.

| kind | window | won when | lost when |
|---|---|---|---|
| `no-spend-weekend` | the Saturday and Sunday of this week if today is one of them, else the coming Saturday and Sunday | `today > end` and no logged expense dated in the window | a logged expense is dated in the window |
| `subscription-audit` | `start = today`, `end = today + 6` | at least one active subscription, and every active one has `auditedAt >= challenge.createdAt` | `today > end` and it isn't won |
| `budget-30` | `start = today`, `end = today + 29` | `today > end` and it isn't lost | some day in `[start, min(today, end)]` has `overOn` |
| `emergency-sprint` | `start = today`, `end = today + 29`, `baseline` = Σ `current` of emergency goals, `goal = Math.max(1, Math.round(Σ target / 10))` | Σ current − baseline ≥ goal while `today <= end` | `today > end` and it isn't won |

Each challenge's `current` and `target` are:
- **no-spend-weekend:** clean days so far out of 2.
- **subscription-audit:** audited out of active.
- **budget-30:** clean days out of 30.
- **emergency-sprint:** amount added out of the goal, in minor units.

- [ ] **Step 1: Write the failing tests.** Use today `2026-10-15` (a Thursday).

```ts
// badges.test.ts
it('earns First Expense Logged from a logged expense, not a subscription charge', () => {});
it('earns Subscription Slayer from a cancelled subscription', () => {});
it('earns Limit Keeper for a clean month with a limit from its first day', () => {
  // limit created localIso('2026-09-01'), nothing over in September → award; over on 09-20 → none; limit created 09-10 → none
});
it('earns Freeze Master after a freeze ends cleanly', () => { /* freeze 10-01..10-07 ended, limit since 10-01 → award; freeze ending 10-20 → none */ });
it('keeps a badge once in the ledger', () => { /* key 'badge:first-expense' present → no award even with the expense deleted; badgeViews earnedAt = that entry's createdAt */ });
// challenges.test.ts
it('says why a challenge cannot start', () => { /* the four messages */ });
it('sets the weekend window from any day', () => {
  // Thu 10-15 → 10-17..10-18; Sat 10-17 → 10-17..10-18; Sun 10-18 → 10-17..10-18
});
it('sets 7- and 30-day windows', () => { /* audit 10-15..10-21; budget-30 10-15..11-13; sprint 10-15..11-13 */ });
it('sets the sprint baseline and goal', () => { /* emergency goals current 300_00 + 200_00, targets 1_000_00 + 500_00 → baseline 500_00, goal 150_00 */ });
it('loses a no-spend weekend at the first logged expense and wins after a clean one', () => {});
it('wins a subscription audit once every active subscription is reviewed', () => {});
it('loses the 30-day streak on the first day over and wins after 30 clean days', () => {});
it('wins the sprint as soon as enough is added', () => {});
it('pays nothing for an abandoned challenge', () => {});
it('keeps a won challenge won', () => { /* ledger key 'challenge:<id>' present + later overspend → still 'won' */ });
```

- [ ] **Step 2: Run** `npx vitest run src/domain/game`. Expected: FAIL for these files.
- [ ] **Step 3: Implement** both files. Get the day of the week from `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: badges and challenges`

---

### Task 7: The shop and the game engine

**Files:**
- Create: `src/domain/game/shop.ts`, `src/domain/game/engine.ts`
- Test: `src/domain/game/shop.test.ts`, `src/domain/game/engine.test.ts`

**Interfaces:**

Consumes everything in Tasks 2–6, and `applyRecords` from `src/domain/sync.ts`.

Produces in `shop.ts`:
- `type ShopSlot = 'theme' | 'avatar' | 'frame' | 'freeze'`
- `type ShopItem = { id: string; slot: ShopSlot; name: string; price: number }`
- `SHOP_ITEMS`, in this order:

  | Slot | Items (id, name, price in coins) |
  |---|---|
  | theme | `theme-violet` Violet 0; `theme-ocean` Ocean 150; `theme-orchid` Orchid 150; `theme-graphite` Graphite 150 |
  | avatar | `avatar-sprout` Sprout 0; `avatar-rocket` Rocket 80; `avatar-cat` Cat 80; `avatar-mountain` Mountain 80; `avatar-anchor` Anchor 80; `avatar-crown` Crown 120; `avatar-gem` Gem 120 |
  | frame | `frame-none` No frame 0; `frame-silver` Silver 100; `frame-gold` Gold 200; `frame-game` Game color 100 |
  | freeze | `freeze-logging` Logging streak freeze 50; `freeze-checkin` Check-in streak freeze 80 |

- `DEFAULT_COSMETICS = { theme: 'theme-violet', avatar: 'avatar-sprout', frame: 'frame-none' }` and `FREEZE_LIMIT = 2`.
- `ownedItems(ledger): Set<string>`: the price-0 items, plus every item with a purchase key `shop:<itemId>:<purchaseId>`.
- `coinBalance(ledger): number`: the coins from `ledgerTotals`.
- `purchaseBlocker(itemId, data): string | null`. It checks, in this order:
  - `That item isn't in the shop.` for an unknown id;
  - `You already own this.` for a cosmetic already owned;
  - `You can hold 2 at a time.` for a freeze at `FREEZE_LIMIT` held;
  - `Not enough coins.` when the balance is below the price;
  - `null` otherwise.
- `purchaseEntry(itemId, purchaseId, now): LedgerEntry`: key `` `shop:${itemId}:${purchaseId}` ``, id `ledgerId(key, 0)`, kind `'purchase'`, xp 0, coins `-price`, label `` `Bought: ${name}` ``.
- `equippedCosmetics(settings, owned): Cosmetics`: each slot falls back to its default when unknown or not owned.

Produces in `engine.ts`:

```ts
export type GameGain = {
  xp: number; coins: number; levelBefore: number; levelAfter: number; tierChanged: boolean;
  rewards: Array<{ kind: Exclude<AwardKind, 'log'>; title: string; xp: number; coins: number }>;
};
export function gameUpdates(data: DataSnapshot, ctx: GameContext): { records: TableRecord[]; gain: GameGain | null };
export type GameView = {
  totals: Reward; level: LevelInfo; streaks: StreakView[]; quests: QuestView[]; badges: BadgeView[];
  challenges: ChallengeView[]; owned: Set<string>; cosmetics: Cosmetics; history: LedgerEntry[];
};
export function computeGameView(data: DataSnapshot, ctx: GameContext): GameView;
```

`gameUpdates` runs in this order:
1. Write the freeze uses from `freezeUsesDue`.
2. Apply them with `applyRecords`.
3. Gather the awards:
   - reversible: `loggingAwards`;
   - one-time: `questAwards`, `streakAwards(computeStreaks(...))`, `badgeAwards` and `challengeAwards`.
4. Run `reconcileLedger`.

`records` is the freeze uses plus the new ledger entries. `gain` is `null` unless at least one `award` entry was written. Its parts are:
- `xp` and `coins`: the sums of the new `award` entries;
- the levels: from the ledger totals before and after;
- `rewards`: the non-logging awards written, oldest first.

`history` is the last 30 ledger entries, newest first.

- [ ] **Step 1: Write the failing tests.** Use today `2026-10-15`.

```ts
// shop.test.ts
it('owns the free items and what was bought', () => {});
it('blocks purchases with a reason', () => { /* the four messages */ });
it('records a purchase as negative coins', () => {
  expect(purchaseEntry('theme-ocean', 'p1', now)).toMatchObject({ id: 'shop:theme-ocean:p1#0', key: 'shop:theme-ocean:p1', kind: 'purchase', xp: 0, coins: -150, label: 'Bought: Ocean' });
});
it('falls back to defaults for unowned cosmetics', () => {});
// engine.test.ts
it('pays the first expense: logging, the daily quest and a badge', () => {
  const { records, gain } = gameUpdates(dataWithOneLoggedExpenseToday, ctx);
  expect(records.map((r) => r.record.id)).toEqual(expect.arrayContaining([`log:expense:${id}#0`, 'quest:log-today:2026-10-15#0', 'badge:first-expense#0']));
  expect(gain).toMatchObject({ xp: 80, coins: 15, levelBefore: 1, levelAfter: 1, tierChanged: false });
  expect(gain!.rewards.map((r) => r.title)).toEqual(expect.arrayContaining(["Log today's spending", 'First Expense Logged']));
});
it('changes nothing on a second run', () => { /* apply records, run again → { records: [], gain: null } */ });
it('reverses only logging when the expense is deleted', () => { /* one reversal record, gain null */ });
it('spends freezes and counts them in the same run', () => {});
it('reports a level-up and a new tier', () => { /* ledger 11_700 xp + one expense → levelAfter 11, tierChanged true */ });
it('builds the view', () => { /* 3 streaks, 4 badges, quests, owned has 'theme-violet', history newest first */ });
```

- [ ] **Step 2: Run** `npx vitest run src/domain/game`. Expected: FAIL for these files.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: shop catalogue and the game engine`

---

### Task 8: Store integration and game actions

**Files:**
- Modify: `src/store/appStore.ts`
- Create: `src/store/gameActions.ts`, `src/store/useGame.ts`
- Test: `src/store/game.test.ts` (uses `freshRealStore` from `src/test/realStore.ts`)

**Interfaces:**

Consumes from Task 7 `gameUpdates`, `computeGameView`, `GameGain`, `purchaseBlocker`, `purchaseEntry`, `equippedCosmetics` and `SHOP_ITEMS`. From Task 6 it consumes `startRequirement` and `newChallenge`.

Produces these store changes:
- `AppState` gains `gameGain: { id: number; gain: GameGain } | null`. It is cleared to `null` on `lock()` and `boot()`.
- The current `putMany` body becomes a private `writeRecords(items)`.
- A private `settle()` builds a `GameContext`:
  - `today` is `get().today`;
  - `now` is the store's ISO clock;
  - `weekStartsOn` comes from the settings, defaulting to `1`;
  - `canBackUp` is `get().namespace === 'real'`.

  It then calls `gameUpdates`, writes any `records` with `writeRecords`, and sets `gameGain` with an incrementing `id` when there is a `gain`. Errors are caught and logged as `'Updating the game layer failed'`. A write never fails because of the game.
- `putMany` is `writeRecords` followed by `settle()`. `remove`, `sync` (after the due items) and `restoreBackup` also end with `settle()`.

Produces `createGameActions(store)` in `gameActions.ts`:

| Action | Behaviour |
|---|---|
| `checkInNoSpend()` | Puts `{ id: 'checkin:no-spend:<today>', kind: 'no-spend', date: today }`. Throws `You already logged spending today.` when a logged expense is dated today |
| `checkInWeek()` | Puts `{ id: 'checkin:weekly:<weekStart>', kind: 'weekly', date: weekStart }`. The same id makes it idempotent |
| `startChallenge(kind)` | Throws the `startRequirement` message, else puts `newChallenge(kind, data, ctx, newId())` and returns it |
| `abandonChallenge(id)` | Sets `status: 'abandoned'` |
| `buy(itemId)` | Throws the `purchaseBlocker` message, else puts `purchaseEntry(itemId, newId(), now)` |
| `equip(itemId)` | Throws `Buy it first.` unless owned, else updates `settings.cosmetics[slot]` |

Produces in `useGame.ts`:
- `useGameContext(): GameContext`
- `useGameView(): GameView`, memoized on `data`, `today`, `weekStartsOn` and `namespace`
- `useGameActions()`

- [ ] **Step 1: Write the failing tests**

```ts
it('pays logging XP, the daily quest and the badge with the first expense', async () => {
  // addExpense via createFinanceActions → ledger has the three keys; store.getState().gameGain!.gain.xp === 80
});
it('reverses logging XP when the expense is deleted', async () => { /* net of 'log:expense:<id>' is 0 */ });
it('pays nothing for an edit', async () => { /* updateExpense(date/amount) → ledger length unchanged */ });
it('settles idempotently', async () => { /* sync() twice → ledger length unchanged */ });
it('pays once when two stores settle the same data', async () => {
  // two stores on one memory storage, both unlocked; A adds an expense; B.refresh() then B.sync(); reload → each ledger id appears once, totals 80 xp
});
it('keeps a restored ledger without paying twice', async () => { /* createBackup → deleteAllData → onboard → restoreBackup → ledger equals the backup's, sync() adds nothing */ });
it('records a no-spend day and refuses it after spending', async () => {});
it('checks in once per week', async () => {});
it('buys with coins, refuses when short, equips only what is owned', async () => {});
it('starts and abandons a challenge', async () => {});
it('clears the gain on lock', async () => {});
```

- [ ] **Step 2: Run** `npx vitest run src/store/game.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the store changes, `gameActions.ts` and `useGame.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS. Existing store tests stay green, because the game writes only to its own tables.
- [ ] **Step 5: Commit:** `feat: settle the game after every write`

---

### Task 9: Game colours, the HUD and quests on Home

**Files:**
- Modify: `src/styles/tokens.css`, `tests/unit/tokens.test.ts`
- Create: `src/features/game/useGameTheme.ts`, `src/features/game/Avatar.tsx`, `src/features/game/GameHud.tsx`, `src/features/game/QuestList.tsx`, `src/features/game/WeeklyCheckInDialog.tsx`
- Modify: `src/app/Root.tsx` (call `useGameTheme()`), `src/features/dashboard/DashboardScreen.tsx`
- Test: `src/features/game/game.test.tsx`, `src/features/dashboard/dashboard.test.tsx`

**Interfaces:**

Consumes from Task 8 `useGameView` and `useGameActions`.

Produces these tokens:
- `--color-xp-contrast`: `#ffffff` light, `#0c0c0e` dark. It is the text on a solid chip of `--color-xp-text`: 5.5:1 or better for every theme.
- Theme overrides. Each sets `--color-xp` and `--color-xp-text` to the same value:

  | Theme | Light selector | Light | Dark selector | Dark |
  |---|---|---|---|---|
  | Ocean | `:root[data-game-theme='ocean']` | `#1f63d6` | `:root[data-theme='dark'][data-game-theme='ocean']` | `#6aa6ff` |
  | Orchid | `:root[data-game-theme='orchid']` | `#a8189a` | `:root[data-theme='dark'][data-game-theme='orchid']` | `#f08ae0` |
  | Graphite | `:root[data-game-theme='graphite']` | `#4a4f5c` | `:root[data-theme='dark'][data-game-theme='graphite']` | `#c3c8d4` |

  Violet keeps today's tokens. All pairs were checked at 5.5:1 or better against the page and against `--color-xp-contrast`, and 4.6:1 or better against the progress track.

Produces these components:
- **`useGameTheme()`** sets `document.documentElement.dataset.gameTheme` to the equipped theme without its `theme-` prefix, while `phase === 'unlocked'`. Otherwise it deletes the attribute.
- **`Avatar({ item, frame, size })`** draws the lucide icon for `avatar-*`: Sprout, Rocket, Cat, Mountain, Anchor, Crown, Gem. Frames are drawn as rings:
  - `frame-silver`: a 2px `#a8adb7` ring;
  - `frame-gold`: a 2px `#d4a017` ring;
  - `frame-game`: a 2px ring in `--color-xp`;
  - `frame-none`: no ring.
- **`GameHud`** is one hairline-bottomed strip that links to `/quests`. It holds:
  - the avatar;
  - a chip `LV {n}` (`bg-xp-text text-xp-contrast`, radius 8);
  - the tier name;
  - a 6px XP bar (`bg-xp` on `bg-track`, `motion-safe:transition-[width]`);
  - `{into} / {needed} XP`, or `Max level`;
  - the logging streak, with a `Flame` icon in `text-warning`: `{n}-day streak`, or `Start a streak today` at 0;
  - coins, with a `Coins` icon: `{max(0, coins)} coins`.

  Its link label is: `` `Level ${n}, ${tier}, ${into} of ${needed} XP, ${streakText}, ${coins} coins. Open quests` ``.
- **`QuestList({ quests, limit? })`** shows one row per quest:
  - a lucide icon:

    | Quest | Icon |
    |---|---|
    | log-today | Receipt |
    | week-limits | Target |
    | week-checkin | CalendarCheck |
    | month-salary | Wallet |
    | month-audit | ListChecks |
    | month-backup | HardDriveDownload |

  - the title, the detail, and a thin `bg-xp` bar at `current / target`;
  - the reward `+{xp} XP` in `text-xp-text`, or a `Check` icon with `Done`.

  `action: 'no-spend'` shows a secondary `Nothing spent` button that calls `checkInNoSpend`. `action: 'checkin'` shows `Check in`, which opens `WeeklyCheckInDialog`.
- **`WeeklyCheckInDialog`** has the title `Weekly check-in`. It shows:
  - "Spent this week" (`view.spending.week`);
  - the top 3 limits with their % used;
  - "Bills in the next 7 days", with the count and total.

  Its buttons are `Not now` and `Check in`, which calls `checkInWeek`.
- **Home** puts `GameHud` directly under the page header. The grid gains a `Quests` section with a `See all` link to `/quests`. It shows up to 3 quests: unfinished ones first, then daily before weekly before monthly.

- [ ] **Step 1: Write the failing tests**

```ts
// tokens.test.ts
it('defines the game themes', () => {
  expect(css).toContain('--color-xp-contrast: #ffffff');
  expect(css).toMatch(/\[data-game-theme='ocean'\][^}]*--color-xp: #1f63d6/);
  expect(css).toMatch(/\[data-theme='dark'\]\[data-game-theme='orchid'\][^}]*--color-xp-text: #f08ae0/);
});
// game.test.tsx
it('shows level, tier, XP, streak and coins in the HUD', () => { /* 'LV 1', 'Bronze Saver', '0 / 100 XP', 'Start a streak today', '0 coins'; link to /quests */ });
it('shows coins at 0 when the balance is negative', () => {});
it('applies the equipped game theme while unlocked', () => { /* equip ocean → data-game-theme 'ocean'; lock → attribute removed */ });
it('records Nothing spent from the quest row', async () => { /* click → row shows 'Done' */ });
it('checks in from the weekly dialog', async () => {});
// dashboard.test.tsx
it('shows the HUD and up to three quests on Home', () => {});
```

- [ ] **Step 2: Run** `npx vitest run src/features/game src/features/dashboard tests/unit/tokens.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the tokens, components and Home changes. Register `--color-xp-contrast` with Tailwind next to the other tokens, so `text-xp-contrast` exists.
- [ ] **Step 4: Run** `npm test && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: game HUD, quests on Home and game themes`

---

### Task 10: Celebrations

**Files:**
- Modify: `src/lib/toast.ts` (`ToastTone` gains `'reward'`), `src/components/ui/Toaster.tsx` (the `reward` tone: a violet `Sparkles` icon and `text-xp-text` accent, `role="status"`)
- Create: `src/features/game/Celebrations.tsx`, `src/features/game/LevelUpDialog.tsx`
- Modify: `src/app/AppShell.tsx` (mount `<Celebrations />`), `src/styles/index.css` (a `pop` keyframe used only as `motion-safe:animate-pop`)
- Test: `src/features/game/celebrations.test.tsx`

**Interfaces:**

Consumes `gameGain` from Task 8.

Produces `Celebrations`. It reacts once to each new `gameGain.id`, ignoring re-renders, and splits the gain's `rewards` into badges and the rest.

Rewards other than badges:
- With exactly one:
  - quest → `` `Quest complete: ${title} · +${xp} XP` ``
  - streak → `` `${title} · +${xp} XP` ``
  - challenge → `` `Challenge won: ${title} · +${xp} XP` ``

  Each adds `` ` · +${coins} coins` `` when coins > 0.
- With two or more: `` `+${Σxp} XP · +${Σcoins} coins from ${n} rewards` ``.

Badges:
- With one or two: one toast each, `` `Badge unlocked: ${title}` ``.
- With three or more: one toast, `` `${n} badges unlocked` ``.

Level-ups:
- When `levelAfter > levelBefore`, open `LevelUpDialog`. Its title is `` `Level ${levelAfter}` ``.
- The body is `` `You're now a ${tier}.` `` when `tierChanged`, else `` `${tier} · keep it up.` ``.
- It has one button, `Nice`.
- The level chip inside uses `motion-safe:animate-pop`.

A gain with only logging XP shows nothing; the HUD bar moves on its own.

- [ ] **Step 1: Write the failing tests**

```ts
it('toasts one quest reward', () => { /* "Quest complete: Log today's spending · +20 XP · +5 coins" */ });
it('summarizes many rewards in one toast', () => { /* 4 quest/streak rewards → '+230 XP · +55 coins from 4 rewards' */ });
it('announces badges', () => { /* 'Badge unlocked: First Expense Logged'; 3 badges → '3 badges unlocked' */ });
it('opens one level-up dialog at the final level', () => { /* levelBefore 1, levelAfter 6 → one dialog 'Level 6' */ });
it('names a new tier', () => { /* tierChanged → "You're now a Silver Budgeter." */ });
it('stays quiet for logging XP alone', () => {});
it('celebrates a gain once', () => { /* rerender with the same id → still one toast */ });
```

- [ ] **Step 2: Run** `npx vitest run src/features/game/celebrations.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the files.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: reward toasts and the level-up dialog`

---

### Task 11: Quests & Achievements screen

**Files:**
- Create in `src/features/quests/`: `QuestsScreen.tsx`, `StreaksSection.tsx`, `ChallengesSection.tsx`, `BadgesSection.tsx`, `HowToEarn.tsx`, `XpHistory.tsx`
- Modify: `src/app/routes.tsx` (`/quests` renders `<QuestsScreen />`)
- Test: `src/features/quests/quests.test.tsx`

**Interfaces:**

Consumes from Tasks 8–9 `useGameView`, `useGameActions`, `QuestList`, `Avatar` and `WeeklyCheckInDialog`. Consumes `CHALLENGES`, `BADGES`, `STREAK_MILESTONES`, `QUEST_REWARDS` and `LOG_XP`.

The screen is laid out with the page header `Quests`, then hairline sections in this order:

1. **Header:**
   - the avatar, the level chip and the tier;
   - the XP bar with `{into} / {needed} XP`;
   - the coin balance;
   - a `Shop` link to `/shop`.
2. **Streaks:** one row each for `Daily logging`, `No overspending` and `Weekly check-in`.
   - Each row shows the count with its unit, or `Start a new streak today.` at 0.
   - "No overspending" shows `Set a limit to start this streak.` while it isn't active.
   - Rows with tokens show `Freezes: {n}`, with a `Get freezes` link to `/shop`.
3. **Quests:** `QuestList` grouped under `Today`, `This week` and `This month`.
4. **Challenges:**
   - Active ones show the title, detail, `current / target` bar, `{n} days left` and `Give up`. "Give up" asks first, in a dialog `Give up {title}?` with `Keep going` and `Give up`.
   - Available ones show the title, description, reward and `Start`. Start is disabled, with the `startRequirement` reason shown under it, when it can't start.
   - The last 5 finished ones show `Won`, `Missed` or `Given up`.
5. **Badges:** a grid of the 4 badges, using the frame. Earned ones show `Earned {date}`. Locked ones show a `Lock` icon and their description.

   | Badge | Icon |
   |---|---|
   | first-expense | Receipt |
   | subscription-slayer | Scissors |
   | limit-keeper | Target |
   | freeze-master | Snowflake |

6. **How to earn**, rendered from the rule constants:
   - `Log an expense or income — +10 XP (up to 5 a day)`;
   - one row per quest with its reward;
   - streak milestones, e.g. `7-day streak — +50 XP, +10 coins`;
   - badges and challenges with their rewards.
7. **Recent XP:** the `history` rows, each with its label, `+10 XP` or `−10 XP`, coins when not 0, and the date.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows the level header with coins and a Shop link', () => {});
it('lists the three streaks, with the no-limit hint and freezes held', () => {});
it('groups quests by day, week and month', () => {});
it('starts a challenge and gives it up after asking', async () => {});
it('disables Start with the reason', () => { /* 'Set a limit first.' */ });
it('shows earned and locked badges', () => {});
it('explains how XP is earned', () => { /* 'Log an expense or income — +10 XP (up to 5 a day)' */ });
it('lists recent XP', () => { /* 'Logged an expense' '+10 XP' */ });
```

- [ ] **Step 2: Run** `npx vitest run src/features/quests`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen and wire the route.
- [ ] **Step 4: Run** `npm test && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: Quests & Achievements screen`

---

### Task 12: Shop screen

**Files:**
- Create: `src/features/shop/ShopScreen.tsx`, `src/features/shop/BuyDialog.tsx`
- Modify: `src/app/routes.tsx` (`/shop` renders `<ShopScreen />`)
- Test: `src/features/shop/shop.test.tsx`

**Interfaces:**

Consumes `SHOP_ITEMS`, `FREEZE_LIMIT` and `purchaseBlocker` from Task 7; `useGameView` and `useGameActions` from Task 8; and `Avatar` from Task 9.

The screen is laid out like this:
- The page header `Shop`, then the balance `{coins} coins` and the line `Coins are for fun. They can't be bought and have no money value.`
- Sections `Themes`, `Avatars`, `Frames` and `Streak freezes`, each with one row per item:
  - **Preview:** a theme swatch (a 24px dot in that theme's light or dark value), the avatar, or the frame ring around the current avatar.
  - **Name and price:** `{price} coins`, or `Free`.
- The buttons on each row:
  - not owned: `Buy`, disabled with its `purchaseBlocker` reason shown as text;
  - owned but not equipped: `Use`;
  - equipped: the text `In use`;
  - freezes always show `Buy`, plus `Held: {n} of 2`.
- `BuyDialog` asks `` `Buy ${name} for ${price} coins?` `` with `Cancel` and `Buy`. On success the toast reads `` `${name} is yours.` ``.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows the balance and the no-money-value line', () => {});
it('disables Buy with the reason when coins are short', () => { /* 'Not enough coins.' */ });
it('buys after confirming, then uses the item', async () => {
  // with 200 coins: Buy Ocean → dialog 'Buy Ocean for 150 coins?' → Buy → 'Use' → 'In use'; settings.cosmetics.theme 'theme-ocean'
});
it('shows freezes held', () => { /* 'Held: 1 of 2' */ });
```

- [ ] **Step 2: Run** `npx vitest run src/features/shop`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen and wire the route.
- [ ] **Step 4: Run** `npm test && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: cosmetic shop`

---

### Task 13: End to end, then on the phone

**Files:**
- Create: `tests/e2e/game.spec.ts`
- Modify: `README.md` (a short "Game layer" paragraph: what earns XP, and that coins have no money value)

- [ ] **Step 1: Write the e2e tests**

```ts
test('the first expense pays XP, completes the daily quest and earns a badge', async ({ page }) => {
  // onboard(page); add an expense → toast "Quest complete: Log today's spending · +20 XP · +5 coins" and 'Badge unlocked: First Expense Logged'
  // Home HUD shows '80 / 100 XP' and '15 coins'; /quests shows 'First Expense Logged' as earned
});
test('Nothing spent keeps the day', async ({ page }) => { /* onboard; Home quest row 'Nothing spent' → 'Done'; HUD '1-day streak' */ });
test('the shop refuses a purchase without enough coins', async ({ page }) => { /* /shop Ocean Buy disabled, 'Not enough coins.' */ });
```

- [ ] **Step 2: Run** `npm run test:e2e`. Expected: the new tests pass, and the existing 34 still pass.
- [ ] **Step 3: Run the full suite:** `npm test && npm run typecheck && npm run lint && npm run test:e2e`. Expected: all green.
- [ ] **Step 4: Commit:** `test: game layer end to end`
- [ ] **Step 5: On the phone (needs the owner).** Run `npm run android:run` and record each result in the ledger:
  1. The HUD and the quests on Home sit clear of the status bar and the gesture bar, in light and dark.
  2. Adding an expense shows the reward toasts, and the XP bar moves.
  3. "Nothing spent" works.
  4. Equipping a bought theme recolours the game layer only.
  5. With Android's "Remove animations" on, the level-up dialog appears without the pop.
  6. After a force-stop and reopening, XP and coins are unchanged: nothing pays twice.

---

## Milestone checkpoint (M4 done)

Funancial has its game layer on the web and on the phone:
- XP and levels, quests, streaks with freezes, badges and challenges;
- a cosmetic coin shop;
- celebrations that respect reduced motion.

Every reward is derived from the person's own data and can be explained from the "How to earn" list.

**Next:** M5, the backend, investments, dividends and news. M5 adds the investment and dividend badges, the dividend streak and Portfolio Check-Up.
