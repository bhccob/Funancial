# Redesign Phase 2 — Design system and app shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Funcial direction A "Midnight Glass": its tokens in light and dark, Inter Tight,
the shared primitives, the floating pill tab bar with the ＋ fan, and a Profile page that replaces
the Menu sheet. No data or money logic changes.

**Architecture:**
- Tokens keep today's names in `src/styles/tokens.css`, so every existing screen follows. New
  tokens are added for the header, glass, scrim, radii, type and motion.
- Primitives live in `src/components/ui/`. Motion is CSS where that's enough (press, rise, the
  fan). The `motion` library is used where it isn't: the count-up and the tab bar's sliding pill.
- The shell (`src/app/`) swaps `BottomBar` + `MenuSheet` for `TabBar` + `AddFan` + `AddSheet`, and
  adds `/profile`. Home's top line gets the avatar that opens it.
- The dark `GlassHeader` asks the Android shell for light status-bar icons while it sits under the
  status bar.

**Tech Stack:** React 19, TypeScript, Tailwind 4, `motion` 14, lucide-react, vitest + Testing
Library, Playwright + `@axe-core/playwright`, Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-10-21-funcial-redesign-design.md`: §11 (design system), §5
(navigation), §8 (nothing changes). Roadmap: `docs/superpowers/plans/2026-10-21-funcial-redesign-roadmap.md`,
Phase 2 and its acceptance list. Live reference: section A of `design/redesign-v2/directions.html`.

## Global Constraints

- **Base:** local `main` at `4423a0b` (Phase 1 merged, not pushed).
  - Work in this worktree.
  - Rename its branch first: `git branch -m feat/redesign-p2-shell`.
  - Run `npm install` once: the worktree has no `node_modules`.
- **Version:** 0.11 (`versionCode 11`, `versionName "0.11"`) in `android/app/build.gradle`.
- **Dependencies** (exact versions, no `^`, as `package.json` pins them):
  - add `@fontsource-variable/inter-tight` `5.3.0`
  - remove `@fontsource-variable/manrope`
  - add dev `@axe-core/playwright` `4.14.0`
- **No data or money changes:** no schema, store, domain or finance-view edits. The one exception
  is `src/domain/examples.ts` prose (Task 7), never its numbers.
- **Green at every task:** each task ends with typecheck, lint and the suites it lists passing.
  Task 8 runs everything.
- **Icons:** lucide only, 2px outline. No emoji as icons.
- **Tap targets:** 44px or more. A smaller visual (a 36px pill) gets the `hit-44` utility.
- **Copy:** plain English in the app's voice. The fixed strings are in the tasks.
- **Commits:** lower-case conventional (`feat: …`, `fix: …`, `test: …`, `docs: …`), each ending
  with the `Co-Authored-By` trailer the session gives.
- **Secrets:** never print `.env.local` values. No AI features. Ask before any push or Vercel
  deploy.

## Calls this plan makes (for the owner to approve with the plan)

1. **Chart colors: same six hues, new order and dark steps.** Spec §11's order fails the palette
   validator (dataviz `validate_palette.js`):
   - green next to amber is ΔE 5.7 for protan vision, and the floor is 6, the target 8
   - teal next to pink is ΔE 3.7 for deutan vision
   - in dark, green, amber and teal are too light for the dark band

   Re-ordered to violet, green, blue, pink, amber, teal, worst neighbour is ΔE 14.1, including
   the donut's wrap from the last slice to the first. Dark uses darker steps of green, amber and
   teal. Light green and amber stay under 3:1 on white, which is allowed because every chart has
   a legend with amounts.
2. **Three light text colors darkened, as the spec allows** ("darken if it fails"). They must hold
   4.5:1 on `surface-2` (`#ebebf0`), not only on white:

   | token | spec | built | on `surface-2` |
   | --- | --- | --- | --- |
   | `success` | `#15803d` (4.22) | `#147a3a` | 4.56 |
   | `danger` | `#dc2f36` (3.92) | `#ca2a31` | 4.55 |
   | `warning` | today `#a15d00` (4.33) | `#9a5900` | 4.65 |

   The Ocean game theme's light color goes `#1f63d6` → `#1b5bc6`. On the mist page it would be
   4.93:1, and its test asks 5.5.
3. **Card skins wait for Phase 4**, where the card is built. As written, white text on the light
   ends of `violet`, `mint`, `amber`, `ocean` and `rose` is about 1.7–2.5:1. That breaks §11's own
   "white at ≥ 4.5:1 for the balance", so P4 needs darker stops or a scrim behind the balance.
4. **Cards and Spending tabs open today's pages at today's paths** (`/subscriptions`, `/budget`).
   P4 and P5 add `/cards` and `/spending`. The Profile menu still lists "Bills & cards" too.
5. **The avatar is on Home only** (spec §5). Profile, and Settings and Help through it, are one
   tap from Home. The other tabs get no avatar.
6. **The ＋ fan is a non-modal `<dialog>` on the dialog stack**, not a modal. That way the tab bar
   stays crisp above the scrim and the ＋ itself turns into the ×, as in the mockup. Android back,
   Escape and a scrim tap close it.
7. **The dark header appears on Profile only in this phase.** Home's comes in P3.
8. **No `matchMedia` (jsdom) reads as reduced motion**, so no existing unit test meets an animation.
9. **Home's row of round actions stays until P3** (as R8 in the P1 decisions). Expense and Income
   are then both on Home and in the ＋ fan for one release.
10. **The spec's type scale and gutter apply to every screen:**
    - page titles go from 34px to 28px
    - section titles go from 21px to 17px
    - the page gutter goes from 22px to 20px
11. **The tab bar is a flex row, not five equal cells.** The active tab is 2.2 units wide, so
    "Spending" fits beside its icon at 360px.
12. **The Help sweep goes beyond R28's three spots.** The worked examples' steps, titles and result
    labels also say "Main account" where they mean it.

## Review Focus

1. **Android back in the new layers.** In order, back closes:
   1. the add sheet
   2. then the fan
   3. then goes back a screen

   Never two at once, and never a screen change while the fan is open. Task 6 test `back closes
   the fan before leaving the screen`.
2. **Adding from the fan on any tab.** On Invest, log an expense that crosses a limit. The limit
   dialog opens above the sheet. Saving closes both and leaves you on Invest with the expense
   stored. Task 6 test `an expense from the fan on Invest crosses a limit and stays on Invest`.
3. **Nothing hidden under the floating bar.** The last control of the longest page (Settings) can
   be scrolled clear of the bar at 375×812 and at 360×640. Task 6 e2e `the bottom of Settings
   clears the tab bar`.
4. **Reduced motion everywhere new.** Count-up, rise, press, the fan, the ＋ turn and the tab pill
   become instant changes or fades. Task 2 tests (CountUp, Rise, press) and Task 6 e2e `reduced
   motion: the fan only fades`.
5. **Profile at the level extremes, in demo mode.**
   - Level 1 with 0 XP shows an empty bar.
   - The top level shows "Max level" with a full bar.
   - The demo banner stays above the dark header, not under it.

   Task 5 test `level progress at level 1 and at the top level`, and Task 8 e2e `Profile header
   sits below the demo banner`.

---

### Task 1: Direction A tokens and Inter Tight

**Files:**
- Modify:
  - `src/styles/tokens.css`
  - `src/styles/index.css` (font import, `bg-hero` utility)
  - `package.json`, `package-lock.json`
  - `src/components/ui/PageHeader.tsx` (`text-page`)
  - `src/components/ui/Section.tsx` (title `text-section`)
  - `src/components/ui/Sheet.tsx` (`rounded-t-sheet`)
  - `src/app/AppShell.tsx` (gutter `px-5`)
  - `capacitor.config.ts` (`LocalNotifications.iconColor` `'#7C5CFF'`)
  - `docs/design/visual-direction.md`: one line at the top, "Superseded on 2026-10-22 by direction
    A: spec §11 of `docs/superpowers/specs/2026-10-21-funcial-redesign-design.md`."
  - the `tokens.css` header comment, which points at spec §11
- Test: `tests/unit/tokens.test.ts`; any test that pins `#00B37E`

**Interfaces:**
- Produces Tailwind tokens. Later tasks use their utilities:
  - colors: `bg-glass`, `ring-glass-line`, `bg-glass-hero`, `ring-glass-hero-line`, `bg-scrim`,
    `text-hero-text`, `text-hero-muted`, `bg-accent`, `text-accent-contrast`
  - radii: `rounded-tile`, `rounded-key`, `rounded-card`, `rounded-t-sheet`, `rounded-b-hero`
  - shadows: `shadow-tile`, `shadow-glass`, `shadow-plus`
  - type: `text-hero`, `text-page`, `text-section`, `text-body`, `text-small`
  - easing: `ease-glass`
  - the `bg-hero` utility
- `:root` plain variables, which Task 2 mirrors in TypeScript: `--duration-press: 140ms`,
  `--duration-small: 220ms`, `--duration-standard: 380ms`, `--stagger-rise: 60ms`,
  `--stagger-fan: 50ms`, `--duration-count: 900ms`, `--press-scale: 0.96`.

**Values** (light in `@theme static`, dark in `:root[data-theme='dark']`):

| token | light | dark |
| --- | --- | --- |
| `bg` | `#f2f2f5` | `#0b0b10` |
| `surface` / `overlay` | `#ffffff` / `#ffffff` | `#15151d` / `#15151d` |
| `surface-2` | `#ebebf0` | `#1c1c26` |
| `text` / `text-muted` | `#0b0b12` / `#66667a` | `#f4f4f8` / `#a0a0b2` |
| `border` / `border-strong` | `#e6e6ec` / `#d2d2db` | `#24242e` / `#30303c` |
| `track` | `#ececf1` | `#24242e` |
| `primary` / `primary-contrast` | `#0b0b12` / `#ffffff` | `#f4f4f8` / `#0b0b10` |
| `accent` / `accent-contrast` | `#7c5cff` / `#ffffff` | `#9d85ff` / `#0b0b10` |
| `accent-text` | `#5b3fe0` | `#9d85ff` |
| `xp` / `xp-text` / `xp-contrast` | `#7c5cff` / `#5b3fe0` / `#ffffff` | `#9d85ff` / `#9d85ff` / `#0b0b10` |
| `success` | `#147a3a` | `#4ade80` |
| `warning` | `#9a5900` | `#f2a93b` |
| `danger` / `danger-contrast` | `#ca2a31` / `#ffffff` | `#ff6b6f` / `#0b0b10` |
| `focus` | `#7c5cff` | `#9d85ff` |
| `glass` / `glass-line` | `rgb(255 255 255 / 0.86)` / `rgb(10 10 20 / 0.06)` | `rgb(28 28 38 / 0.82)` / `rgb(255 255 255 / 0.08)` |
| `chart-1..6` | `#7c5cff #22c55e #3b82f6 #ec4899 #f59e0b #14b8a6` | `#7c5cff #16a34a #3b82f6 #ec4899 #d97706 #0d9488` |
| `chart-other` | `#868b96` | `#6b7080` |

The same in both themes (in `@theme static` only):
- `hero-from` `#14121f`, `hero-to` `#0b0b12`
- `hero-glow` `rgb(124 92 255 / 0.55)`, `hero-glow-2` `rgb(37 99 235 / 0.35)`
- `hero-text` `#ffffff`, `hero-muted` `rgb(255 255 255 / 0.66)`
- `glass-hero` `rgb(255 255 255 / 0.08)`, `glass-hero-line` `rgb(255 255 255 / 0.12)`
- `scrim` `rgb(11 11 18 / 0.35)`

Unchanged: the banner tones, the soft tints, the menu colors, and the game themes except the Ocean
light value (Call 2).

Radii: `tile` 24px, `key` 18px, `card` 24px, `sheet` 28px, `hero` 34px.

Shadows:
- `tile`: `0 1px 2px rgb(10 10 20 / 0.04)`
- `glass`: `0 12px 30px -12px rgb(10 10 20 / 0.35)`
- `plus`: `0 10px 24px -8px rgb(124 92 255 / 0.7)`

Easing: `--ease-glass: cubic-bezier(0.2, 0.8, 0.2, 1)`.

Type, as `--text-*` with `--line-height`, `--letter-spacing` and `--font-weight` sub-values:

| name | size | line-height | letter-spacing | weight |
| --- | --- | --- | --- | --- |
| hero | 46px | 1 | −0.045em | 800 |
| page | 28px | 1.15 | −0.03em | 800 |
| section | 17px | 1.25 | −0.015em | 800 |
| body | 15px | 1.45 | — | 500 |
| small | 13px | 1.3 | — | 700 |

Font: `--font-sans: 'Inter Tight Variable', system-ui, sans-serif`.

`bg-hero` (`@utility` in `index.css`) paints these, top first:
- `radial-gradient(120% 80% at 10% 0%, var(--color-hero-glow), transparent 55%)`
- `radial-gradient(90% 70% at 100% 30%, var(--color-hero-glow-2), transparent 60%)`
- `linear-gradient(180deg, var(--color-hero-from), var(--color-hero-to))`

- [ ] **Step 1: Update `tokens.test.ts` first:**
  - `defines the Midnight Glass tokens`: the table's values, light and dark.
  - `GAME_THEMES.ocean.light` becomes `#1b5bc6`. The dark `xp-contrast` and `danger-contrast`
    become `#0b0b10`.
  - `keeps the accent icon readable on the accent fill`: `accent-contrast` on `accent` ≥ 3, in both
    themes.
  - `keeps header text readable on the brightest point of the header`:
    - composite `hero-glow` over `hero-from` (`#4d3b9a`)
    - `hero-text` must be ≥ 4.5 on it (8.72)
    - `hero-muted` composited onto that point must be ≥ 4.5 (4.79)
  - `validates the chart series like the palette validator`. Port its four gates as helpers in the
    test file: OKLab, the Machado protan/deutan matrices, and the WCAG contrast that is already
    there. For the six series, check adjacent pairs plus the wraps 5→1 and 6→1. Per theme:
    - OKLCH L inside `[0.43, 0.77]` light and `[0.48, 0.67]` dark
    - chroma ≥ 0.1
    - protan and deutan ΔE×100 ≥ 8
    - normal-vision ΔE×100 ≥ 15

    The expected minimums are 14.1 (CVD) and 20+ (normal).
  - `has the motion durations the TypeScript mirrors`: written in Task 2, so skip it here.
  - The existing contrast suites run unchanged on the new values.
- [ ] **Step 2: Run** `npx vitest run tests/unit/tokens.test.ts`. Expected: FAIL on the new values.
- [ ] **Step 3: Swap the font package** (`npm uninstall @fontsource-variable/manrope && npm install -E @fontsource-variable/inter-tight@5.3.0`), then write the tokens, the font import and `bg-hero`.
  Apply `text-page`, `text-section`, `rounded-t-sheet` and `px-5`.
- [ ] **Step 4: Run** `npm run typecheck && npm run lint && npm test`. Expected: PASS. Update only
  the assertions that pin an old class or value (`text-[34px]`, `text-[21px]`, `#00B37E`).
- [ ] **Step 5: Commit:** `feat: direction A tokens, chart order and Inter Tight`.

### Task 2: Motion foundation — press, Rise, CountUp

**Files:**
- Create:
  - `src/lib/motion.ts`, `src/lib/motion.test.ts`
  - `src/components/ui/Rise.tsx`
  - `src/components/ui/CountUp.tsx`
  - `src/components/ui/motion.test.tsx`
- Modify:
  - `src/styles/index.css` (`press`, `hit-44`, the `rise` animation)
  - `src/components/ui/Button.tsx` (press)
  - `src/app/Root.tsx` (`<MotionConfig reducedMotion="user">` around `<Phase />`)
  - `tests/unit/tokens.test.ts`

**Interfaces:**
- `MOTION` (in seconds, for `motion`):
  `{ ease: [0.2, 0.8, 0.2, 1], press: 0.14, pressScale: 0.96, small: 0.22, standard: 0.38, rise: 12, stagger: 0.06, fanStagger: 0.05, countUp: 0.9, plusTurn: 135 } as const`
- `useReducedMotion(): boolean`. It uses `useSyncExternalStore` on
  `matchMedia('(prefers-reduced-motion: reduce)')`, and returns `true` when `matchMedia` doesn't
  exist (Call 8).
- `Rise({ index = 0, as = 'div', className, children })`. It renders
  `motion-safe:animate-rise motion-reduce:animate-fade-in`, with
  `style={{ animationDelay: `${index * 60}ms` }}`.
- `CountUp({ value, format, duration = MOTION.countUp, className })`:
  - `format(n: number): ReactNode` gets whole numbers (`Math.round`).
  - It animates from the value last shown (0 at mount) to `value`, with `animate()` from `motion`
    and ease-out-quart `[0.25, 1, 0.5, 1]`.
  - While it runs, the moving text is `aria-hidden` beside an `sr-only` final value. Once done,
    it is one plain span holding `format(value)`.
  - Under reduced motion it renders `format(value)` at once.
- CSS utilities:
  - `press`: under `prefers-reduced-motion: no-preference`, a transform transition of
    `var(--duration-press)` `var(--ease-glass)`, and `:active` scales to `var(--press-scale)`.
  - `hit-44`: a centered `::after` of at least 44×44px.
  - `--animate-rise`: `rise var(--duration-standard) var(--ease-glass) backwards`. The keyframe
    starts at `opacity: 0; translate: 0 12px`.

- [ ] **Step 1: Write the tests:**
  - `motion.test.ts`:
    - `useReducedMotion` is true with no `matchMedia`, follows a stubbed query, and updates on
      its `change`
    - `MOTION` matches the `:root` variables in `tokens.css` (ms = s × 1000; press scale equal).
      Add the same check to `tokens.test.ts`.
  - `motion.test.tsx`:
    - CountUp under reduced motion shows `format(value)` once, with no `aria-hidden` copy.
    - With motion allowed (stubbed `matchMedia` → false, `duration` 0.05), the final text appears
      (`waitFor`) and the sr-only copy is gone after.
    - A new `value` counts from the old one, not from 0: right after the change, the number
      shown is at least the old value.
    - Rise carries both animation classes and the delay for `index={3}` (`180ms`).
    - Button has the `press` class.
- [ ] **Step 2: Run** `npx vitest run src/lib/motion.test.ts src/components/ui/motion.test.tsx tests/unit/tokens.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above. In `Button.tsx`, `press` replaces
  `motion-safe:active:scale-[0.98]`. The background and opacity transition stays.
- [ ] **Step 4: Run** the same command, then `npm run typecheck && npm run lint && npm test`.
  Expected: PASS.
- [ ] **Step 5: Commit:** `feat: press, rise and count-up, with reduced motion as fades`.

### Task 3: Surface primitives — Tile, Pill, SegmentedControl, RoundAction, Key

**Files:**
- Create:
  - `src/components/ui/Tile.tsx`
  - `src/components/ui/Pill.tsx`
  - `src/components/ui/SegmentedControl.tsx`
  - `src/components/ui/RoundAction.tsx`
  - `src/components/ui/Key.tsx`
  - `src/components/ui/surfaces.test.tsx`

**Interfaces** (each takes `className`; `tone` defaults to `'light'`; `'hero'` is the glass for
the dark header):
- **`Tile`** `({ as = 'div', padded = true, ...html })`: `bg-surface rounded-tile shadow-tile`,
  with `p-4` when padded.
- **`Pill`** `({ tone = 'soft', to?, onClick?, children, 'aria-label'? })`:
  - `tone` is `'soft' | 'ink' | 'hero'`:
    - soft: `bg-surface-2 text-text`
    - ink: `bg-primary text-primary-contrast`
    - hero: `bg-glass-hero ring-1 ring-inset ring-glass-hero-line text-hero-text backdrop-blur-[24px] backdrop-saturate-[1.4]`
  - It is 36px tall, `rounded-full`, `text-small`.
  - With `to` it is a `Link`, with `onClick` a `button`, else a `span`. Links and buttons get
    `press hit-44`.
- **`SegmentedControl<T extends string>`**
  `({ label, value, options: { value: T; label: string }[], onChange(v: T): void, tone = 'light' })`:
  - a `role="group"` named `label`, with one `button` per option carrying `aria-pressed`
  - The chosen one is a white (`hero`) or ink (`light`) pill that moves with
    `motion.span layoutId`. Its `layoutId` is unique per instance (`useId`).
  - Each button is 34px tall with `hit-44`.
- **`RoundAction`** `({ icon: LucideIcon, label, to?, onClick?, tone = 'light', size = 54, showLabel = true, pressed? })`:
  - a round `size` px chip with a 22px icon, and the label under it when `showLabel`. Otherwise
    the label is the `aria-label`.
  - tones:
    - light: `bg-surface shadow-tile`
    - hero: glass on the header
    - ink: `bg-primary text-primary-contrast`
  - `pressed` sets `aria-pressed` (for Freeze in P4).
- **`Key`** `({ label, value: ReactNode, to?, onClick?, tone = 'light', chevron = false })`:
  - `rounded-key`, `min-h-16`, `px-3.5 py-3`, `press`
  - the label in `text-small` muted, the value at 17px/800 tabular
  - a 16px `ChevronRight` when `chevron`

- [ ] **Step 1: Write `surfaces.test.tsx`:**
  - Tile renders `as="section"`.
  - Pill is a link with `to`, a button with `onClick` (and fires it), else not focusable.
  - SegmentedControl:
    - is a group named by `label`
    - exactly one button has `aria-pressed="true"`
    - clicking another calls `onChange` with its value
    - two controls on one page each keep their own pressed button
  - RoundAction:
    - is named by its label in both `showLabel` states
    - is a link with `to`
    - reports `aria-pressed` when given
  - Key shows label and value, and is a link with `to` or a button with `onClick`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/surfaces.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the five components.
- [ ] **Step 4: Run** the same, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: tile, pill, segmented control, round action and key`.

### Task 4: GlassHeader and the status bar over it

**Files:**
- Create:
  - `src/components/ui/GlassHeader.tsx`, `src/components/ui/GlassHeader.test.tsx`
  - `src/lib/systemBars.ts`, `src/lib/systemBars.test.ts`
- Modify:
  - `src/platform/android/shell.ts`, `src/platform/android/shell.test.ts`
  - `src/app/AppShell.tsx` (banners wrapper)
  - `src/styles/index.css` (the pull-up rule)

**Interfaces:**
- `src/lib/systemBars.ts`:
  - `claimDarkTop(): () => void`: one claim. The returned function releases it, and only once.
  - `onBarsBackground(cb: (bg: 'dark' | 'light') => void): () => void`. It calls back with
    `'dark'` when the theme is dark or any claim is held, now and on every change. It is built on
    `onThemeApplied`.
- `GlassHeader({ children, className })`:
  - a `div` with `data-glass-header` and `bg-hero text-hero-text rounded-b-hero`
  - remaps `[--color-text:var(--color-hero-text)] [--color-text-muted:var(--color-hero-muted)]`,
    so existing components inside follow
  - full-bleed: `-mx-5 px-5`, `pt-[max(1rem,env(safe-area-inset-top))] pb-7`
  - In dark theme a 1px `border-b border-border` tells it from the body.
  - While mounted and covering the top of the viewport, it holds `claimDarkTop()`. That uses an
    `IntersectionObserver` with `rootMargin: '0px 0px -96% 0px'`. With no observer, it claims
    while mounted.
- `AppShell` wraps `<UpdateBanner /><DemoBanner />` in
  `<div data-shell-banners className="flex flex-col gap-2 empty:hidden">`.
- `index.css`: `main:has(> [data-shell-banners]:empty) [data-glass-header]` gets
  `margin-top: calc(-1 * max(1rem, env(safe-area-inset-top)))`. So the header reaches the top edge
  only when no banner is above it.
- `shell.ts` sets the system bar style from `onBarsBackground`: `'dark'` →
  `SystemBarsStyle.Dark` (light icons).

- [ ] **Step 1: Write the tests:**
  - `systemBars.test.ts`:
    - light theme, no claim → `'light'`
    - a claim → `'dark'`
    - two claims with one released → still `'dark'`
    - all released → `'light'`
    - dark theme → `'dark'` with or without claims
    - releasing twice doesn't go below zero
  - `GlassHeader.test.tsx`:
    - it renders its children inside `[data-glass-header]`
    - mounting it makes `onBarsBackground` report `'dark'` in the light theme, and unmounting
      reports `'light'`
  - `shell.test.ts`: a claim made after start sets `SystemBarsStyle.Dark`. Its release sets
    `Light` in the light theme.
- [ ] **Step 2: Run** `npx vitest run src/lib/systemBars.test.ts src/components/ui/GlassHeader.test.tsx src/platform/android/shell.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: the dark glass header, with light status-bar icons over it`.

### Task 5: Profile page and the avatar on Home

**Files:**
- Create:
  - `src/features/profile/ProfileScreen.tsx`, `src/features/profile/profile.test.tsx`
  - `src/app/MenuGroups.tsx` (the rows, moved out of `MenuSheet.tsx`)
  - `src/features/game/LevelProgress.tsx` (the bar, moved out of `QuestsScreen`'s `LevelHeader`)
- Modify:
  - `src/app/routes.tsx` (`/profile`), `src/app/menu.ts` (`PROFILE`)
  - `src/app/MenuSheet.tsx` (uses `MenuGroups` until Task 6 deletes it)
  - `src/features/quests/QuestsScreen.tsx` (uses `LevelProgress`)
  - `src/features/dashboard/HomeTopLine.tsx`
- Test:
  - `src/app/routes.test.ts`, `src/app/nav.test.tsx`
  - `src/features/dashboard/dashboard.test.tsx`, `src/features/quests/quests.test.tsx`

**Interfaces:**
- `PROFILE: NavTarget = { path: '/profile', label: 'Profile', icon: CircleUser }`.
- `MenuGroups({ onNavigate? })` renders `MENU_GROUPS` with live subtitles:
  - each group is an `h2` (`text-section`, a `mt-[22px] mb-2.5` rhythm) over one `Tile padded={false}`
  - each row is a link of at least 56px: the colored icon chip, label, subtitle, then the chevron
    or "Soon"
  - rows are split by `border-border` hairlines
- `LevelProgress({ level, tone = 'page' })` keeps today's `role="progressbar"`, its name "Level
  progress" and its `aria-valuetext`, plus the XP text beside it. `tone="hero"` draws the track in
  `bg-white/15`.
- **`ProfileScreen`**, top to bottom:
  1. `GlassHeader` in a `Rise index={0}`, holding:
     - `h1` "Profile" in `text-page`
     - a row: `Avatar` (size 64, the worn frame), the name (`profile.name`, else "You") over the
       tier (`level.tier`), and on the right `Pill tone="hero"` "Level N"
     - `LevelProgress tone="hero"`
     - a row of two `Pill tone="hero"`: "N coins" (a span) and "Shop" (link to `/shop`)
  2. `MenuGroups`, each group in its own `Rise` (index 1, 2).
- **`HomeTopLine`:**
  - Left: a link to `/profile` named `Profile, level N`. It holds a 44px `Ring` (progress,
    `var(--color-xp)`, thickness 3) around a 36px `Avatar`, with a level chip at the bottom
    right: `bg-xp-text text-xp-contrast`, 9.5px/800, with a 2px ring in `bg`. Then the greeting
    "Hi, <name>" (or "Hi there"), with today's date muted from 400px up, as now.
  - Right: the link to `/quests` keeps the streak and coins. Its name becomes `<n>-day streak, <n>
    coins. Open quests`. The level ring is gone from it.

- [ ] **Step 1: Update the tests first:**
  - `routes.test.ts`: `/profile` is in `APP_ROUTES`.
  - `profile.test.tsx`:
    - the `h1` is "Profile"
    - both group headings show, with every `MENU_GROUPS` row as a link to its path
    - a row navigates to its page
    - name and tier show
    - "Level N" and the coins show
    - **`level progress at level 1 and at the top level`**: `aria-valuenow` 0 with "0 / N XP";
      at the top level, "Max level" and a full bar
  - `dashboard.test.tsx`:
    - the top line's first link is `Profile, level N` and opens Profile
    - the quests link is named by streak and coins and opens Quests
  - `quests.test.tsx` keeps passing with `LevelProgress`.
  - `nav.test.tsx`'s Menu sheet cases keep passing through `MenuGroups`.
- [ ] **Step 2: Run** `npx vitest run src/features/profile src/features/dashboard src/features/quests src/app`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: a Profile page with level progress and the menu, opened from the avatar`.

### Task 6: The floating tab bar, the ＋ fan and the add sheet

**Files:**
- Create:
  - `src/app/TabBar.tsx`, `src/app/AddFan.tsx`, `src/app/AddSheet.tsx`
  - `src/app/tabBar.test.tsx`
- Delete:
  - `src/app/BottomBar.tsx`, `src/app/MenuSheet.tsx`
  - their cases in `nav.test.tsx` and `AppShell.test.tsx`
- Modify:
  - `src/app/menu.ts`
  - `src/app/AppShell.tsx`
  - `src/components/ui/Sheet.tsx` (`showTitle`)
  - `tests/e2e/navigation.spec.ts`, `help.spec.ts`, `inbox.spec.ts`, and any spec that opens the
    Menu sheet
- Test: `src/app/AppShell.test.tsx`, `src/platform/back.test.ts`

**Interfaces:**
- `menu.ts` gains:
  - `CARDS_TAB: NavTarget = { path: '/subscriptions', label: 'Cards', icon: CreditCard }`
  - `SPENDING_TAB: NavTarget = { path: '/budget', label: 'Spending', icon: ChartPie }`
  - `TABS = [HOME, CARDS_TAB, SPENDING_TAB, INVEST] as const`, with the ＋ between the 2nd and 3rd

  `PRIMARY_LINKS` (the sidebar) is unchanged.
- **`TabBar({ fanOpen, onPlus, plusRef, className })`:**
  - a `nav` named "Primary": `fixed inset-x-3.5 bottom-[calc(22px+env(safe-area-inset-bottom))] z-30 h-[66px] rounded-full bg-glass ring-1 ring-inset ring-glass-line shadow-glass backdrop-blur-[20px] backdrop-saturate-[1.6] flex items-center gap-1 px-1.5 md:hidden`
  - **tabs:** each is a `NavLink`, with `end` for `/`.
    - Inactive: `flex-1`, a 21px icon in `text-muted`, the label `sr-only`.
    - Active: `flex-[2.2]`, a 50px ink pill (`motion.span layoutId="tab-pill"`), with the icon and
      the label at 12px/800 in `text-primary-contrast`.
  - **the ＋:** a 54px `button`, `bg-accent text-accent-contrast shadow-plus`, with a 26px `Plus`.
    - `aria-haspopup="dialog"`, `aria-expanded={fanOpen}`
    - named "Add", or "Close" when open
    - `rotate-[135deg]` when open, with `motion-safe:transition-transform duration-[380ms] ease-glass`
- **`AddFan({ open, onClose, onPick(kind: 'expense' | 'income'), plusRef })`**, where `plusRef` is
  the `RefObject<HTMLButtonElement | null>` that `AppShell` also hands `TabBar`:
  - The scrim: a `div`, `fixed inset-0 z-20 bg-scrim`. It fades over 380ms and closes on tap.
  - The bubbles: a **non-modal** `<dialog>` (Call 6), named "Add", `fixed inset-x-0
    bottom-[calc(104px+env(safe-area-inset-bottom))] z-40 m-0 bg-transparent flex justify-center
    gap-[18px]`.
    - Opening it: `show()`, `pushDialog`, then focus the Expense bubble.
    - Closing it: `close()`, `removeDialog`, and focus back on the ＋ when focus was inside.
    - Its `cancel` event and Escape (`keydown` on `document` while open) call `onClose`.
  - Two buttons: **Expense** (`Minus`) and **Income** (`Plus`). Each is a 60px
    `bg-primary text-primary-contrast` circle over a `bg-surface` label pill.
    - They rise: from `translate-y-[26px] scale-[0.4] opacity-0` to none, over 380ms `ease-glass`.
      The second is 50ms later.
    - Under reduced motion: `motion-reduce:transform-none`, opacity only.
  - A bubble calls `onClose()` then `onPick(kind)`.
- **`AddSheet({ kind: 'expense' | 'income' | null, onClose })`:**
  - `<Sheet open={kind !== null} title={kind === 'income' ? 'Add income' : 'Add expense'} showTitle onClose={onClose}>`
  - It holds `ExpenseForm` or `IncomeForm` with `onDone={onClose}`, unchanged.
  - `Sheet`'s new `showTitle` draws its `h2` in `text-section` instead of `sr-only`.
- **`AppShell`:**
  - owns `fanOpen` and `adding`
  - renders `TabBar` (before `main`, as `BottomBar` was), `AddFan` and `AddSheet`
  - sets `inert={fanOpen}` on `main`
  - `main` gets `pb-[calc(110px+env(safe-area-inset-bottom))]` on phones (`md:pb-12` as now)
  - drops the Menu-button focus exception

- [ ] **Step 1: Write `tabBar.test.tsx`:**
  - The bar reads Home, Cards, Add, Spending, Invest in order. Cards goes to `/subscriptions` and
    Spending to `/budget`. The current tab has `aria-current="page"` and its label is visible.
  - ＋ opens the fan:
    - `aria-expanded="true"` and named "Close"
    - Expense and Income show, and focus is on Expense
  - Escape closes it and puts focus back on ＋.
  - A tap on the scrim closes it.
  - **`back closes the fan before leaving the screen`**: with the fan open,
    `handleBack(true, env)` returns `'dialog'`, closes the fan and doesn't call `back`. The next
    `handleBack` returns `'back'`.
  - Expense opens a dialog named "Add expense" with the Amount field focused, and the fan closed.
    `handleBack` then closes the sheet only.
  - **`an expense from the fan on Invest crosses a limit and stays on Invest`**, on a real store
    (`src/test/realStore.ts`) with a Food limit near its edge:
    - start at `/invest`, open the fan, then Expense, enter an amount over the limit, save
    - the limit dialog opens over the sheet
    - confirm it: both close, the path is still `/invest`, and the expense is in the store
  - Income opens "Add income".
- [ ] **Step 2: Update** `AppShell.test.tsx` (the bar before `main`; no Menu cases) and drop the
  Menu-sheet cases from `nav.test.tsx`. `MenuGroups` is covered in Task 5. Then run
  `npx vitest run src/app src/platform`. Expected: FAIL.
- [ ] **Step 3: Implement**, delete `BottomBar.tsx` and `MenuSheet.tsx`, then run the same.
  Expected: PASS.
- [ ] **Step 4: Update the e2e specs** that used the Menu sheet: open Profile from Home's avatar
  instead. Add to `navigation.spec.ts` (mobile project):
  - the bar's links and buttons read `['Home', 'Cards', 'Add', 'Spending', 'Invest']`
  - at 360×640, the active "Spending" label isn't cut off (`scrollWidth <= clientWidth`)
  - ＋, then Expense, adds a 4.20 expense that shows in History
  - **`the bottom of Settings clears the tab bar`**: at 375×812 and 360×640, after scrolling to
    the end, the last button's bounding box ends above the bar's top
  - **`reduced motion: the fan only fades`**: with `emulateMedia({ reducedMotion: 'reduce' })`,
    the open Expense bubble's computed `transform` is `none`
- [ ] **Step 5: Run** `npm run typecheck && npm run lint && npm test && npm run test:e2e`.
  Expected: PASS.
- [ ] **Step 6: Commit:** `feat: floating tab bar with the ＋ fan; Profile replaces the Menu sheet`.

### Task 7: Help speaks accounts (R28)

**Files:**
- Modify:
  - `src/content/help/pages.ts`, `glossary.ts`, `faq.ts`
  - `src/domain/examples.ts` (titles and steps only)
- Test: `src/content/help/help.test.ts`, `tests/e2e/help.spec.ts` (if it quotes changed text)

**The copy:**
- **Dividends**, 4th paragraph: "It can go to any of your accounts, like Main account or Savings,
  or you can reinvest it in the same holding. If a payout never comes, you can say so."
- **Net worth**, paragraphs 2 and 3:
  - "What you have is the money in your accounts (bank, cash and savings) and your investments at
    their latest price. What you owe is what is on your credit cards and your loans."
  - "Spending lowers it, and saving, earning and paying down what you owe raise it. Moving money
    between your accounts does not change it."
- **Cards and balances**, paragraphs 1, 2 and 4:
  - "Spending on a credit card does not take money from your bank account. It adds to what you
    owe on the card."
  - "The money in your accounts drops when you pay by debit or cash, or when you pay the card
    off."
  - "Money you only expect does not count until it arrives. Moving money between your accounts
    changes where it sits, not what you are worth."
- **Glossary:**
  - new first term, **Account**: "A place your money sits: a bank account, a credit card, savings
    or a cash wallet. Funcial shows each one as a card."
  - **Cash** becomes: "Notes and coins in your pocket. Add a cash account to keep track of them."
- **FAQ 2:**
  - q: "Why didn't my bank account drop when I paid by credit card?"
  - a: "A credit card purchase adds to what you owe on the card. Your bank account drops when you
    pay the card off."
- **Examples** (`examples.ts`) and `RESULT_ROWS` (`pages.ts`): where "cash" means the Main account,
  say "Main account":
  - `cash` → "Main account"
  - `cashBefore` → "Main account before the renewal"
  - `cashAfter` → "Main account after the renewal"
  - BAL-1's title → "Net worth = accounts + investments − debts"
  - steps like "lowers cash from" → "lowers Main account from"

  Numbers and result keys stay.

- [ ] **Step 1: Update `help.test.ts`:**
  - the Dividends and Net worth pages contain the new sentences above
  - the glossary starts with "Account", and "Cash" reads as above
  - **`no Help prose uses cash for the bank account`**: every `allProse()` line (extended with the
    examples' titles and steps and the `RESULT_ROWS` labels) that matches `/\bcash\b/i` also
    matches `/cash (wallet|account)|debit or cash|bank accounts? and (your )?cash|notes and coins|bank, cash and savings/i`
- [ ] **Step 2: Run** `npx vitest run src/content/help src/domain/examples.test.ts`. Expected: FAIL.
- [ ] **Step 3: Rewrite the copy.**
- [ ] **Step 4: Run** the same, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `docs: Help speaks accounts, not cash and savings buckets`.

### Task 8: Contrast on every screen (axe), both themes

**Files:**
- Create: `tests/e2e/contrast.spec.ts`
- Modify: `package.json`, `package-lock.json`, and any screen that fails
- Test: the full suites

**Interfaces:** none new.

- [ ] **Step 1: Add the dev dependency:** `npm install -D -E @axe-core/playwright@4.14.0`.
- [ ] **Step 2: Write `contrast.spec.ts`** (mobile project only).
  - For each theme (`addInitScript` sets `localStorage['funancial.theme']` to `'light'` or
    `'dark'`), `startDemo`, then visit:
    - every path in `APP_ROUTES` without a parameter
    - `/profile` and `/help/available`
    - the first demo holding's page
    - the open fan
    - the Add expense sheet

    Then run `new AxeBuilder({ page }).withRules(['color-contrast']).analyze()`. Expect
    `violations` to equal `[]`, and on failure print each node's target and its contrast.
  - Plus **`Profile header sits below the demo banner`**: the `[data-glass-header]` box's top is
    at or below the demo banner's bottom.
- [ ] **Step 3: Run** `npx playwright test tests/e2e/contrast.spec.ts --project=mobile-chromium`.
  Fix each violation with a token that passes. Never exclude a node, except an `aria-hidden`
  decoration. Run it again until green.
- [ ] **Step 4: Run everything:** `npm run typecheck && npm run lint && npm test && npm run test:e2e`.
  Expected: all PASS.
- [ ] **Step 5: Commit:** `test: color contrast on every screen in both themes, checked with axe`.

### Task 9: Version 0.11, the phone check, decisions, and the branch

**Files:**
- Modify: `android/app/build.gradle` (`versionCode 11`, `versionName "0.11"`)
- Create: `docs/superpowers/reviews/2026-10-22-redesign-p2-decisions.md`

- [ ] **Step 1: Raise the version**, run `npx vitest run tests/unit/androidVersion.test.ts`, and
  commit: `chore: version 0.11 (versionCode 11) for the new look`.
- [ ] **Step 2: Final review** (subagent-driven: a fresh whole-branch reviewer). Fix what it finds
  and run the full suites again.
- [ ] **Step 3: Install on the phone:** `JAVA_HOME='C:\Users\bhcco\.jdks\temurin-21.0.12.1' npm run android:run`.
  The owner checks, in light and in dark:
  - Inter Tight everywhere, the mist page, white sheets, the violet accent
  - nothing unreadable
  - the bar: Home · Cards · ＋ · Spending · Invest
    - the active tab shows its label
    - Cards opens Bills & cards, and Spending opens Budget
  - ＋ turns into ×, Expense and Income rise, and a scrim tap closes them
  - **Android back closes the fan**
  - Expense and Income open their forms as sheets. Saving logs and closes. Back closes the sheet.
  - Home's avatar opens Profile, with level progress and every menu row working
  - the status-bar icons can be read over the dark header and on light pages
  - the bottom of Settings is reachable above the bar
  - with Settings → Accessibility → Remove animations, fades only
  - Help → Dividends, Net worth and Words read in accounts
- [ ] **Step 4: Write the decisions doc**, as Phase 1's: what changed, the Calls above as built,
  the rulings made while building, the deferred minors, and the owner's check results. Commit:
  `docs: redesign phase 2 decisions and the phone check`.
- [ ] **Step 5: Finish the branch** (superpowers:finishing-a-development-branch). Ask the owner:
  merge locally into `main` (as Phase 1), or open a PR. A PR needs `origin/main` to have Phase 1
  first, which means pushing `main`, and that needs the owner's OK.
