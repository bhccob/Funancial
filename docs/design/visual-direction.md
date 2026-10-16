# Visual direction — E · Open (chosen 2026-10-15)

Clean, modern finance with a light game layer, and the least box styling of the three options the
owner was shown. Every idea is a titled section on the bare page. Numbers and charts sit directly
on it, separated by space and one hairline. Only dialogs and the Menu sheet are surfaces. Typography,
whitespace and small charts do the work; the game layer stays small and violet. No pixel fonts or
pixel art.

Mockup: `design/redesign/2-open.html` (the clickable reference for layout, sizes and copy). The
reasons for the change and the screen-by-screen design are in
`docs/superpowers/specs/2026-10-15-redesign-open-design.md`.

History: this replaces "D · Pro Ledger" (chosen 2026-10-14), which the owner found compact and hard to read on the phone.

## Principles

1. **No boxes.** Each idea is a section with a large title (21px/800). Sections are separated by
   space and one hairline. Numbers and charts sit directly on the page. Dialogs and the Menu sheet
   are the only surfaces.
2. **One thing leads.** At the top of Home is "Available to spend" in very large type and one thin
   line for the month. Everything after it is a titled section.
3. **Every key number gets a picture:** the month line, a category donut, 7-day bars, limit rings,
   a net-worth trend line, date blocks for bills, progress lines for goals, a level ring. Every
   chart has a legend or labels, shows exact amounts when tapped, and has a text equivalent for
   screen readers.
4. **Buttons you can find.** Actions are round 56px buttons with a word under each icon. No control
   is icon-only. Touch targets are at least 48px. The bottom bar has labels.
5. **Calm and minimal.** Manrope throughout with big tabular numbers, Lucide icons, the colour
   tokens below, a small violet game layer, light and dark. Motion only under
   `prefers-reduced-motion: no-preference` (`motion-safe:`).

## Tokens

Defined in `src/styles/tokens.css` (light in `@theme static`, dark under `:root[data-theme='dark']`).
Contrast figures are text on the page background; all text pairs meet WCAG AA 4.5:1.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg` | `#ffffff` | `#0c0c0e` | Page |
| `--color-surface` | `#ffffff` | `#0c0c0e` | Sections (same as page — sections are not boxes) |
| `--color-surface-2` | `#f2f2f5` | `#1a1a1f` | Chips, segmented controls, active nav, inputs, dialogs' inner wells |
| `--color-overlay` | `#ffffff` | `#16161a` | Dialogs, the Menu sheet, toasts |
| `--color-text` | `#0d0d0f` | `#f4f4f6` | Body, numbers |
| `--color-text-muted` | `#6f6f78` | `#9a9aa6` | Secondary text (4.9:1 / 6.9:1) |
| `--color-border` | `#ebebef` | `#202026` | Hairline dividers between sections |
| `--color-border-strong` | `#d9d9df` | `#2e2e36` | Input and secondary-button outlines |
| `--color-track` | `#ececf1` | `#232329` | Progress tracks |
| `--color-primary` | `#0d0d0f` | `#f4f4f6` | Primary buttons (ink) |
| `--color-primary-contrast` | `#ffffff` | `#0c0c0e` | Text on primary |
| `--color-accent` | `#00b37e` | `#2ee6a6` | Fills only: healthy progress, active marks, positive sparkline |
| `--color-accent-text` | `#007a55` | `#2ee6a6` | Positive amounts, links (5.2:1) |
| `--color-xp` | `#7c5cff` | `#9d85ff` | Game layer fills: XP bar, level chip |
| `--color-xp-text` | `#6b46f5` | `#9d85ff` | XP/reward text (5.5:1) |
| `--color-success` | `#007a55` | `#2ee6a6` | Gains, completed |
| `--color-warning` | `#a35f00` | `#f2a93b` | Limit ≥ 80% (5.0:1 light) |
| `--color-danger` | `#d1373d` | `#ff6b6f` | Limit ≥ 100%, destructive (4.8:1 light) |
| `--color-focus` | `#7c5cff` | `#9d85ff` | Focus ring (2px + 2px offset) |
| `--color-chart-1..6` | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300` | `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300` | Categorical chart series, in this fixed order (validated incl. donut wrap-around); category slices use 1..5 |
| `--color-chart-other` | `#868b96` | `#6b7080` | "Other" slices and segments, always (3:1 or better against its page) |

Radii: `--radius-sm 6px` (bars), `--radius-md 10px` (inputs, chips, nav items), `--radius-lg 16px`
(dialogs). The Menu sheet rounds its top corners with `rounded-t-[30px]`. Buttons and round actions
are pills / circles (`999px`).

## Fonts

- `--font-sans`: **Manrope** — `@fontsource-variable/manrope` (fallback `system-ui, sans-serif`).
  Everything, including numbers (`tabular-nums`). Headline numbers 800, labels 700.
- `--font-display`: same family (Manrope 800). No second display face.

## Type scale

| Role | Size / weight | Tracking | Where |
| --- | --- | --- | --- |
| Home hero | 50px / 800 (40px when the formatted amount is longer than 11 characters) | −0.045em | "Available to spend" |
| Page title | 34px / 800 | −0.035em | `PageHeader`, Budget, standalone screens (Welcome back, onboarding steps) |
| Section title | 21px / 800 | −0.02em | `Section`, the Menu sheet's groups |
| Body | 14–15px | | Rows, forms, paragraphs |
| Label | 13px / 700, muted | | Keys under numbers, legends, a section's right-hand action (13.5px / 700) |

Numbers are tabular. Money always goes through `useMoney()` / `formatMoney`, dates through
`src/lib/format.ts`.

## Layout and the shared UI kit

- **Page padding:** 22px on phones, 40px from `md`; the main column's max width is unchanged.
- **`PageHeader`:** the 34px title, an optional muted line and an optional action. No rule below it;
  it has `pb-2` and the page's first section supplies its own top space.
- **`Section`** (`src/components/ui/Section.tsx`, with `SectionLink` and `EmptyLink`): a 21px title
  row with the action on the right (a `SectionLink`, tabs, a button or a figure), `py-7`, and a 1px
  hairline below every section but the last. Home, Budget and every other screen use the one
  component.
- **Buttons:** pills. `sm` 44px tall, `md` 48px, `lg` 56px. Primary is ink, secondary a hairline
  outline, tertiary a text button. Round actions are 56px circles with a word under the icon.
- **Desktop (≥ `md`):** the sidebar (210px) stays. Home and Budget put their sections in two columns
  from `lg`.

## Navigation

- **Phone:** a flat bottom bar across the bottom edge with a hairline on top: **Home · Budget · + ·
  Quests · Menu**. It is 76px tall plus the safe area, every item has a label, and the + is a 48px
  round ink button that opens Add Expense. There is no floating quick-add button. Toasts float just
  above the bar.
- **Menu:** a tall sheet that slides up from the bottom (280ms ease-out, only under `motion-safe:`)
  with a grab handle and rounded top corners. It is a plain list in three groups (section titles at
  21px); each row is at least 48px tall with a coloured round icon, the name, a line saying what is
  inside right now, and an arrow. Escape and the Android back gesture close it.
  - **Your money:** Subscriptions, Goals, History, Salary freeze.
  - **Coming next:** Invest, Buy it?, Dividends, News, each marked "Soon".
  - **You:** Shop, Inbox ("Soon"), Help ("Soon"), Settings.
- **Desktop:** the sidebar lists the same groups under an "Add expense" button.

### Icon-chip colours

Fixed in both themes (`src/app/menu.ts`); each holds at least 3:1 against the white icon on it.

| Item | Colour | Item | Colour |
| --- | --- | --- | --- |
| Subscriptions | `#2a78d6` | Dividends | `#0b7f8a` |
| Goals | `#128a60` | News | `#5b6270` |
| History | `#d9541e` | Shop | `#6b46f5` |
| Salary freeze | `#4458d6` | Inbox | `#3b82c4` |
| Invest | `#b86e00` | Help | `#128a60` |
| Buy it? | `#c43b6a` | Settings | `#5b6270` |

## Charts

Small hand-written SVG components in `src/components/charts/`, no chart library.

1. **Category colours** are slots `--color-chart-1..5`, taken by position in the chart: the first
   slice is chart-1, the second chart-2, and so on. "Other" always uses `--color-chart-other`.
   Identity is carried by the legend text and the tap labels, so a category's colour may differ
   between Week and Month, or between months. The reason: the palette is validated only in its fixed
   adjacent order.
2. **Donuts** show the top 5 categories plus "Other", with a 3px gap between arcs and the total (or
   the chosen slice) in the centre. Two-part splits are bars, not pies.
3. **Every chart shows exact amounts** on tap or in a legend, and carries a screen-reader label.
   Identity is never by colour alone: legends have the name, the amount and, where it helps, the share.
   Tapping a slice or a legend row highlights it (150ms, `motion-safe:` only); a keyboard reaches the
   same targets.
4. **Limit state colours:** under 80% `accent`, 80–99% `warning`, 100% or more `danger`, always with
   text such as "$X left" or "$X over". Budget bars carry a pace mark showing how far through the
   period today is.
5. The 7-day bars put today in ink and label it "Today"; the net-worth trend is a 30-day line.

## Rules

1. **No boxes on screens.** Sections are separated by whitespace and 1px `--color-border`
   hairlines. Surfaces (overlay colour, rounded corners, soft shadow) are only for dialogs and the
   Menu sheet. Welcome and the lock screen keep their one soft `Card`.
2. **Numbers lead.** Key amounts are big, 800 weight, tabular, `--color-text`. Never colour a whole
   amount except gains/losses (`accent-text` / `danger`) and limit warnings.
3. **One action colour.** Primary buttons are ink; secondary are hairline outlines; tertiary are
   text buttons. Green `accent` is for fills and positive values, not buttons.
4. **The game layer is violet and small:** the level ring, XP bar, level chip and quest rewards. It
   never competes with money figures.
5. **Every action has a visible text label;** nothing is icon-only without an `aria-label`.
6. **Icons:** Lucide, 2px stroke, round caps.
7. **Motion** only under `motion-safe:`; nothing animates under reduced motion.
8. **Copy:** no shame, the same tone as the rest of the app ("Nothing spent", "No limits yet").
