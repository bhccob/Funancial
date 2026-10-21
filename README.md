# Funcial

A gamified personal finance tracker: expenses, salary (with freezes), subscriptions, limits, goals,
and a stock/ETF portfolio with dividends and news — wrapped in XP,
levels, quests, streaks and badges. Local-first and encrypted on your device.

- Product spec: `docs/spec/original-spec.md`
- Approved design: `docs/superpowers/specs/2026-10-14-funancial-design.md`
- Implementation plans: `docs/superpowers/plans/`
- Run it on an Android phone, with live reload: `docs/android.md`

## Game layer

Logging an expense or income, finishing a quest or a challenge, reaching a streak milestone and
earning a badge all pay XP, and XP raises your level. Everything except logging also pays coins,
which you spend in the shop on themes, avatars, frames and streak freezes. Every reward comes from
your own data and is listed under "How to earn" on the Quests screen. Coins are only for fun: they
can't be bought and have no money value.

## Scripts

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server                                |
| `npm run build`     | Type-check and build to `dist/`                          |
| `npm run typecheck` | Type-check all projects                                  |
| `npm run lint`      | ESLint                                                   |
| `npm test`          | Unit + UI tests (Vitest)                                 |
| `npm run test:e2e`  | End-to-end tests (Playwright, mobile + desktop Chromium) |

Requires Node 22.12+ (developed on Node 24).
