# Visual direction — C: Cozy RPG (chosen 2026-10-14)

Warm parchment and forest green by day, lantern-lit by night. Game objects (level, streak, XP coin,
quest chest) are pixel-art accents; every money number stays in a clean, readable sans. Mockup:
`design/directions/c.html` (A and B were the alternatives, kept for reference).

## Tokens

Defined on `:root[data-theme=light]` / `:root[data-theme=dark]` in `src/styles/tokens.css`.
All text/background pairs below meet WCAG AA (4.5:1) unless marked "fill only".

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--color-bg` | `#F6EFE1` | `#15130F` | App background (with texture) |
| `--color-surface` | `#FFFBF2` | `#211D17` | Cards, sheets, tab bar |
| `--color-surface-2` | `#F0E6D2` | `#2B261E` | Tracks, chips, icon wells |
| `--color-text` | `#2B2118` | `#F3E9D6` | Body text, money |
| `--color-text-muted` | `#6B5B49` | `#B9A88C` | Secondary text (6.3:1 / 7.2:1) |
| `--color-border` | `#E2D3B8` | `#3A3328` | Hairlines, inner card frame |
| `--color-border-strong` | `#CDB994` | `#4B4334` | Card/button borders and pressable edge |
| `--color-primary` | `#2F6B4F` | `#7CC39B` | Primary actions, active nav, normal progress |
| `--color-primary-shade` | `#1F4A36` | `#4F8F6B` | Primary pressable edge/border |
| `--color-primary-contrast` | `#FFFBF2` | `#15130F` | Text on primary (6.1:1 / 8.9:1) |
| `--color-xp` | `#C98A1B` | `#F0B84A` | XP bar, coins, rewards — **fill only** in light |
| `--color-xp-light` | `#E9B44C` | `#F6CF7C` | XP bar segment highlight (fill only) |
| `--color-xp-shade` | `#8A5D0F` | `#A8741A` | Pressable edge of gold buttons (quick add) |
| `--color-xp-text` | `#8A5D0F` | `#F0B84A` | XP/reward **text** (5.4:1 / 9.3:1) |
| `--color-success` | `#3C7D3A` | `#8BCB7E` | Gains, completed states (4.8:1 light) |
| `--color-warning` | `#A3561A` | `#E8A25A` | Limit ≥ 80% (5.2:1 light) |
| `--color-danger` | `#B23A2E` | `#E07A6B` | Limit ≥ 100%, destructive actions (5.7:1 light) |
| `--color-focus` | `#2F6B4F` | `#F0B84A` | Focus ring (2px, 2px offset in bg color) |
| `--color-texture` | `rgba(120,90,50,.09)` | `rgba(240,184,74,.05)` | Background dot texture |

Radii: `--radius-sm: 4px` (progress tracks, pixel frames), `--radius-md: 10px` (buttons, inputs, chips),
`--radius-lg: 12px` (cards, sheets). Level badge 8px. Pill shapes are not used.

Pressable edge: `box-shadow: 0 3px 0 var(--color-border-strong)` (or the matching `*-shade` on
filled buttons); pressed state translates 2px down and drops the edge to 1px.

## Fonts

- `--font-sans`: **Nunito** — `@fontsource-variable/nunito` (fallback `system-ui, sans-serif`).
  Body, labels, inputs, and **all money amounts** (`font-variant-numeric: tabular-nums`; hero amounts 800).
- `--font-display`: **Pixelify Sans** — `@fontsource/pixelify-sans` weights 500/600/700
  (fallback `--font-sans`). Game accents only.

## Rules

1. **Money is never pixel.** Amounts, inputs, body copy and form labels use Nunito.
2. **Pixel font is for game accents:** level number, XP counts, quest kicker labels ("DAILY QUEST · 2/3"),
   card/section headings, streak count, Shop and Quests titles.
3. **Gold means reward.** `--color-xp*` is only for XP, coins, quest rewards, level-ups and the quick-add
   button. Never for money, warnings or links.
4. **Green means go.** `--color-primary` for primary actions, active navigation, links and normal progress.
5. **Limit states:** < 80% primary, 80–99% warning, ≥ 100% danger. Always paired with text ("85% used"),
   never color alone.
6. **Icons:** game objects use 8×8 pixel sprites (`shape-rendering: crispEdges`, scaled in whole multiples);
   navigation and actions use lucide icons with square line caps and miter joins.
7. **Texture** (dot grid via `--color-texture`) only on the app background, never inside cards.
8. **Cards** are "inventory slots": 2px `--color-border-strong` border, inner 1px `--color-border` frame
   inset 3px, pressable edge.
9. Respect `prefers-reduced-motion`: no bounce/sparkle animation, state changes still visible.
