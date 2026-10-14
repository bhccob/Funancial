# Funancial

A gamified personal finance tracker: expenses, salary (with freezes), subscriptions, limits, goals,
a stock/ETF portfolio with dividends and news, and a "Should I Buy It?" assistant — wrapped in XP,
levels, quests, streaks and badges. Local-first and encrypted on your device.

- Product spec: `docs/spec/original-spec.md`
- Approved design: `docs/superpowers/specs/2026-10-14-funancial-design.md`
- Implementation plans: `docs/superpowers/plans/`

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
