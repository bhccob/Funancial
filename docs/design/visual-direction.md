# Visual direction — D: Pro Ledger (chosen 2026-10-14, round 2)

Clean, modern finance with a light game layer. Typography and whitespace do the work: big tabular
numbers, hairline dividers, almost no boxes. The game layer is one slim HUD strip (level, XP,
streak, coins) and quest rows. No pixel fonts or pixel art.

Mockups: `design/directions-v2/index.html` (pick "D · Pro Ledger"). Round 1 (C "Cozy RPG") was
replaced at the user's request ("less box styling… doesn't look like Minecraft").

## Tokens

Defined in `src/styles/tokens.css` (light in `@theme static`, dark under `:root[data-theme='dark']`).
Contrast figures are text on the page background; all text pairs meet WCAG AA 4.5:1.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg` | `#ffffff` | `#0c0c0e` | Page |
| `--color-surface` | `#ffffff` | `#0c0c0e` | Sections (same as page — sections are not boxes) |
| `--color-surface-2` | `#f2f2f5` | `#1a1a1f` | Chips, segmented controls, active nav, inputs, dialogs' inner wells |
| `--color-overlay` | `#ffffff` | `#16161a` | Dialogs, menus, toasts, floating tab bar |
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
| `--color-chart-1..6` | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300` | `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300` | Categorical chart series, in this fixed order (validated incl. donut wrap-around) |

Radii: `--radius-sm 6px` (bars), `--radius-md 10px` (inputs, chips, nav items), `--radius-lg 16px`
(dialogs, floating tab bar). Buttons are pills (`999px`).

## Fonts

- `--font-sans`: **Manrope** — `@fontsource-variable/manrope` (fallback `system-ui, sans-serif`).
  Everything, including numbers (`tabular-nums`). Headline numbers 800, labels 600.
- `--font-display`: same family (Manrope 800). No second display face.

## Layout

- **Desktop (≥ md):** 210px left text sidebar (logo, icon + label links, active = `surface-2` chip,
  hairline right border); main column with a top HUD strip (M4) and sections in a 12-column grid,
  7fr / 5fr pairs separated by vertical hairlines.
- **Home:** KPI row (Available to spend — largest — · Net worth · Spent this month) divided by
  hairlines; quick actions under the first KPI; then sections (Limits + Spending, Upcoming bills,
  Portfolio from M5, Quests from M4).
- **Phone:** single column, 16px gutters, floating rounded tab bar (overlay surface, shadow) at the
  bottom; the sidebar is hidden.

## Rules

1. **No box cards on screens.** Sections are separated by whitespace and 1px `--color-border`
   hairlines. Boxes (overlay surface, radius-lg, soft shadow) are only for dialogs, menus, toasts
   and the floating tab bar.
2. **Numbers lead.** Key amounts are big, 800 weight, tabular, `--color-text`. Never color a whole
   amount except gains/losses (`accent-text` / `danger`) and limit warnings.
3. **One action color.** Primary buttons are ink (`primary`); secondary are hairline outlines;
   tertiary are text buttons. Green `accent` is for fills and positive values, not buttons.
4. **Game layer is violet and small:** XP bar, level chip, quest rewards. It never competes with
   money figures.
5. **Limit states:** < 80% accent, 80–99% warning, ≥ 100% danger — always with text ("85% used").
6. **Charts** use `--chart-*` in fixed order, a 2px page-colored gap between slices, a legend with
   name, percent and value (identity never by color alone), and hover/tap/keyboard highlighting.
   Two-part splits are bars, not pies.
7. **Icons:** lucide, 2px stroke, round caps.
8. Respect `prefers-reduced-motion`.
