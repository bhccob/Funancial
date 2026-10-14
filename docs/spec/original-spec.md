# Original Product Spec (verbatim from the user, 2026-10-14)

> Kept as the reference for entity, badge, quest, screen and disclaimer lists. The approved design
> (`docs/superpowers/specs/2026-10-14-funancial-design.md`) records the decisions made on top of it.
> Tables were pasted as tab-separated text and are rendered here as Markdown tables; wording is unchanged.

## PART 1: PROJECT OVERVIEW

### 1.1 Product Name
[App Name] — a gamified personal finance tracker.

### 1.2 One-Line Summary
A web-first, mobile-ready, single-player gamified personal finance simulation that tracks daily, weekly, monthly, and yearly spending; manages salary, subscriptions, savings, and spending limits; monitors stocks, ETFs, and dividend payouts with live market data and news; and uses AI to help users decide whether a purchase is financially wise.

### 1.3 Platform Strategy
Build as a responsive web application first, then package it for iOS and Android using Capacitor. This gives one codebase that runs as a website, a PWA, and a native mobile app.

| Stage | Deliverable |
| --- | --- |
| Stage 1 | Responsive web app (desktop + mobile browser) |
| Stage 2 | PWA with install-to-home-screen, offline caching, and web push |
| Stage 3 | Capacitor iOS + Android builds for App Store and Google Play |
| Stage 4 | Native features: biometric lock, encrypted local DB, native notifications, background sync |

### 1.4 Core Value Proposition
Makes budgeting feel like a game instead of a chore.

Gives users a real financial opinion before they spend.

Tracks investments and passive dividend income in one place.

Works offline, protects data locally, and never requires bank credentials.

## PART 2: GAME DESIGN

### 2.1 Game Type
Genre: Serious game / financial management simulation / RPG-lite progression / AI decision assistant.

Mode: Single-player, persistent, cross-device.

Core fantasy: "Level up your real financial life and make smarter buying decisions."

Game world: The user's actual income, expenses, subscriptions, savings, dividends, and investments.

Score: Financial health, streaks, XP, levels, completed quests, goal progress, and smart-decision accuracy.

Not: A real-money trading app, gambling app, or licensed financial advisory service.

### 2.2 Core Game Loop
User logs income, expenses, subscriptions, dividends, or holdings.

User asks the AI "Should I Buy It?" for a potential purchase.

AI analyzes budget, limits, spending history, goals, and returns a recommendation.

App updates balance, limits, net worth, portfolio value, and dividend income.

User earns XP, coins, and streak progress.

User completes daily, weekly, and monthly quests.

User levels up, unlocks badges, themes, and challenges.

App sends gentle warnings, insights, and reminders.

User adjusts behavior and repeats.

### 2.3 Progression Systems
XP and Levels: Bronze Saver → Silver Budgeter → Gold Planner → Platinum Investor → Diamond Master.

Quests: Daily (log expenses), Weekly (stay under grocery limit), Monthly (reconcile salary, audit subscriptions).

Streaks: Daily logging, no-overspend, weekly check-in, dividend logging.

Badges: First Expense Logged, Subscription Slayer, Limit Keeper, First ETF, Portfolio Pro, Freeze Master, First Dividend, Dividend Collector, Passive Income Pro, Smart Shopper, Impulse Controller, Budget Defender.

Virtual Coins: Earned via quests and streaks; used only for cosmetics (themes, avatars, skins, badge frames). Never exchangeable for real money.

Challenges: No-Spend Weekend, Subscription Audit, 30-Day Budget Streak, Emergency Fund Sprint, Portfolio Check-Up.

## PART 3: FEATURE SET

### 3.1 Income and Salary
Add monthly salary and optional extra income sources.

Salary Freeze: select a period (e.g., one week); user enters lost amount or app calculates from daily salary. Frozen salary reduces expected monthly income and available balance. Subscriptions and expenses still apply.

### 3.2 Expenses
Track daily, weekly, monthly, yearly.

Categories: food, transport, rent, utilities, entertainment, health, shopping, other.

Recurring vs one-time. Notes, dates, payment methods.

### 3.3 Subscriptions
Name, amount, billing cycle, renewal date.

Auto-deducted from available balance.

Renewal reminders and audit quests to cancel unused services.

### 3.4 Spending Limits
Limits by category, week, month, or overall.

Warning thresholds at 80%, 100%, 120%.

Gentle, motivational, or strict warning modes.

### 3.5 Savings, Goals, and Net Worth
Savings and emergency fund tracking.

Goals: target amount, current amount, deadline.

Debt tracking and payoff progress.

Net worth = cash + savings + investments − debts.

Available balance = cash + savings − upcoming bills − reserved limits.

### 3.6 Investment Portfolio
Manual entry: ticker, name, type (stock/ETF), shares, cost basis, purchase date, currency.

Fractional shares supported.

Market data: current price, daily change, total value, profit/loss, allocation.

Pie chart by holding, by asset type (stocks vs ETFs), optional by sector or region. Interactive slices.

Metrics: total invested, current value, profit/loss, daily change, best/worst performers.

Periodic and manual refresh.

### 3.7 Dividend Tracking
Per holding: dividend per share, frequency (monthly, quarterly, semi-annual, annual, special), ex-dividend date, payment date, currency, tax withheld.

Expected dividend income calculated from shares held.

User confirms payouts; logged as income into savings or a Passive Income bucket.

Options to reinvest or record as cash.

Dividend Dashboard: totals by month/quarter/year, projected annual income, yield per holding and portfolio-wide, dividend calendar, growth chart, top payers, dividend streak.

Notifications: before ex-date, on payment date, on dividend change announcements, on income milestones.

Game mechanics: XP for logging dividends, quest "Confirm all dividends this month," badges and streaks.

### 3.8 "Should I Buy It?" AI Assistant
Inputs:

Item name (typed), optional product link (app extracts name and price), price, quantity, category, description of usefulness, urgency (need vs want), planned payment method.

AI analyzes:

Current monthly and weekly spending.

Remaining budget and limit status.

Upcoming subscriptions and bills.

Salary freeze status.

Savings and emergency fund level.

Debt and financial goals.

Dividend and investment income.

Past similar purchases and how they were used.

Need vs want, timing, and alternatives.

AI outputs:

Recommendation: Buy, Wait, Buy a cheaper alternative, or Do not buy.

Confidence score (e.g., 82%).

Short reasoning summary, pros and cons.

Impact on monthly budget and limits.

Impact on savings goals.

Alternatives (wait for sale, buy used, lower-cost version).

Cooling-off suggestion (e.g., wait 48 hours).

"What if" simulation: "If you buy this, your monthly limit will be exceeded by $X."

AI Debate Mode:

AI presents both sides.

User can reply with counterarguments.

AI updates its reasoning.

Goal is critical thinking, not shaming.

AI Boundaries:

No licensed financial advice.

No encouragement of debt or risky spending.

Always show "not financial advice" disclaimer.

Transparent reasoning; respects user autonomy; no manipulation.

Game mechanics: XP for using the assistant before major purchases; badges and streaks for smart decisions.

### 3.9 News Feed
Fetches recent Yahoo Finance news headlines for held tickers.

Stores only headlines, source, URL, and timestamp — not full article bodies.

Short-lived cache (e.g., 1 hour TTL) to reduce fetch frequency.

Displayed per holding and in a portfolio news tab.

Disclaimer: "News data is for informational purposes only. Not financial advice."

Production apps should use a licensed data provider; Yahoo endpoints are acceptable only for personal prototypes, low-volume use, and must not be resold or mirrored.

## PART 4: CALCULATION RULES

| Rule | Definition |
| --- | --- |
| Expense | Money spent and not recovered |
| Subscription | Recurring expense deducted from available balance |
| Stock purchase | Reduces cash, increases investments; not an expense unless user selects it |
| Dividend | Income added to savings or passive income bucket; can be reinvested |
| Spending limit | Applies to expenses and subscriptions by default; user can include/exclude stock purchases |
| Salary freeze | Reduces expected income for the selected period; does not stop bills |
| Net worth | Cash + savings + investments − debts |
| Available balance | Cash + savings − upcoming subscriptions − reserved limits |

All rules must appear in the app's Help section with worked examples.

## PART 5: SCREENS
Onboarding: welcome, disclaimer, currency, salary, savings.

Dashboard: balance, net worth, limit progress, XP, level, streaks, quick actions.

Add Expense: amount, category, date, note, recurring.

Budget & Limits: set limits, progress, thresholds.

Subscriptions: list, renewals, total cost, audit.

Salary Freeze: period, lost amount, impact.

Investments: holdings, add holding, portfolio value, pie chart.

Dividends: calendar, income, yield, projections, confirm payout.

Should I Buy It?: item entry, AI analysis, debate mode, recommendation.

News: per-ticker headlines and portfolio news feed.

Goals: savings, emergency fund, debt payoff.

Quests & Achievements: daily/weekly/monthly quests, badges, level.

Profile & Settings: currency, notifications, privacy, export, help.

Help Center: glossary, FAQs, calculation examples, tutorials.

## PART 6: ONBOARDING AND INSTRUCTIONS
The app must include instructions. Required:

Step-by-step setup wizard.

Interactive tutorial with sample data.

Tooltips on every major screen.

Glossary: net worth, cost basis, limit, freeze, ETF, dividend yield, ex-dividend date.

Calculation examples for every rule.

"How it works" pages for salary freeze, dividends, and the AI assistant.

FAQ and legal disclaimers.

Demo mode with fake money before entering real data.

## PART 7: DATA MODEL
User: id, name, currency, salary, savings, settings.

Income: id, amount, source, date, recurring.

Expense: id, amount, category, date, note, recurring.

Subscription: id, name, amount, cycle, next renewal.

BudgetLimit: id, category, period, amount, threshold.

SalaryFreeze: id, start, end, lost amount, note.

Holding: id, ticker, name, type, shares, cost basis, purchase date, currency.

Dividend: id, holding id, per share, frequency, ex-date, pay-date, tax, status.

Transaction: id, type, amount, date, linked holding or category.

Goal: id, name, target, current, deadline.

Debt: id, name, balance, interest rate, minimum payment.

Achievement: id, name, description, unlocked date.

Quest: id, type, description, progress, reward.

Streak: id, type, count, last updated.

BuyDecision: id, item, price, link, description, urgency, AI recommendation, confidence, timestamp.

NewsItem: id, ticker, headline, source, url, publishedAt, fetchedAt.

## PART 8: NOTIFICATIONS
Daily expense logging reminder.

Limit warnings at 80%, 100%, 120%.

Subscription renewal reminders.

Salary freeze start and end.

Dividend ex-date and payment reminders.

Dividend income milestone alerts.

Weekly and monthly review reminders.

Market movement alerts for holdings.

News alerts for held tickers (optional).

Quest completion and level-up notifications.

AI cooling-off reminders.

## PART 9: SECURITY, PRIVACY, AND LEGAL
PIN or biometric lock (Keychain / Keystore on mobile).

Local-first storage; optional encrypted cloud sync.

AES-256 encryption at rest; SQLCipher for local database; keys stored in Keychain/Keystore.

No bank credentials required.

Export and delete all data.

Privacy policy and terms of service.

"Not financial advice" disclaimer (prominent).

Market data delay disclaimer.

AI recommendation disclaimer.

News data disclaimer.

No real-money trading or gambling.

## PART 10: TECHNOLOGY STACK

| Layer | Recommendation |
| --- | --- |
| Web Frontend | React + TypeScript (or Vue/Svelte), Tailwind CSS, Vite |
| Charts | Recharts, Chart.js, or D3 |
| State/Data | TanStack Query + Zustand or Redux Toolkit |
| Local Storage (Web) | IndexedDB + Web Crypto API |
| Local Storage (Mobile) | Capacitor SQLite + SQLCipher |
| Mobile Packaging | Capacitor (iOS + Android) |
| PWA | Workbox service worker, web manifest, offline caching |
| Backend | Serverless functions on Vercel / Netlify / Firebase / Supabase |
| Market Data | Licensed API preferred; Yahoo Finance only for personal prototypes |
| News Data | Backend proxy to Yahoo Finance search endpoint (low volume) or licensed provider |
| AI | LLM API with strict financial safety guardrails and prompt templates |
| Notifications | Web Push (PWA) and Capacitor Local Notifications (mobile) |
| Auth (optional) | Supabase Auth, Firebase Auth, or Clerk |
| Analytics (optional) | Privacy-respecting analytics (Plausible, Umami) |

Why a backend is required: browsers block direct Yahoo calls (CORS), API keys must stay server-side, rate limits need caching, and Yahoo's terms restrict automated access. The backend acts as a secure proxy and cache.

## PART 11: MVP VS ADVANCED
MVP:

Salary, expenses, subscriptions, limits, warnings.

Salary freeze.

Manual stock/ETF holdings, pie chart, dividend tracking.

"Should I Buy It?" with basic AI analysis.

News headlines per ticker.

XP, levels, streaks, quests, badges.

Onboarding and help center.

Responsive web app + PWA.

Capacitor iOS/Android build.

Advanced:

Bank sync.

Debt tracking and payoff planner.

Multiple accounts.

Dividend reinvestment automation.

AI debate mode with memory.

Social leaderboards.

Widgets, watch app.

Cloud sync across devices.

## PART 12: MASTER PROMPT
Build a web-first, mobile-ready, gamified personal finance application called [App Name]. It is a single-player serious game / financial simulation with AI-assisted decision-making.

Platform strategy: Build it first as a responsive web app using React + TypeScript, Tailwind CSS, and Vite, with a serverless backend (Vercel, Netlify, Firebase, or Supabase) acting as a secure proxy for market data, news, and AI. Then package the same codebase as iOS and Android apps using Capacitor. Include PWA support with a manifest, service worker, offline caching, and web push. Use Capacitor SQLite + SQLCipher for encrypted local storage on mobile, and IndexedDB + Web Crypto API on web. Store encryption keys in Keychain/Keystore on mobile. Include PIN and biometric lock.

Core features: Users track daily, weekly, monthly, and yearly expenses; add monthly salary and savings; manage subscriptions; set spending limits with warnings at 80%, 100%, and 120%; and freeze salary for a selected period by entering the lost amount. Subscriptions and expenses still apply during a freeze.

Investments: Users manually add stocks and ETFs (ticker, name, type, shares, cost basis, purchase date, currency), and the app tracks market value using a licensed market data API (Yahoo Finance acceptable only for personal prototypes), showing a portfolio pie chart by holding and asset type, plus total invested, current value, profit/loss, daily change, and best/worst performers.

Dividends: Track dividend per share, frequency, ex-dividend date, payment date, currency, and tax. Calculate expected dividend income, allow users to confirm payouts and record them as cash or reinvest, and provide a dividend dashboard with totals by month/quarter/year, projected annual income, yield per holding and portfolio-wide, a dividend calendar, a growth chart, top payers, and a dividend streak. Send reminders before ex-date, on payment date, on dividend changes, and at income milestones.

News: Fetch recent Yahoo Finance news headlines for held tickers via the backend proxy, caching for about one hour. Store only headline, source, URL, and timestamp — never full article bodies. Display per-holding and in a portfolio news tab. Include the disclaimer: "News data is for informational purposes only. Not financial advice."

"Should I Buy It?" AI Assistant: Users enter an item name, optional product link, price, quantity, category, description of usefulness, urgency (need vs want), and planned payment method. The AI analyzes current monthly and weekly spending, remaining budget and limit status, upcoming subscriptions and bills, salary freeze status, savings and emergency fund level, debt and financial goals, dividend and investment income, and past similar purchases. It returns a recommendation — Buy, Wait, Buy a cheaper alternative, or Do not buy — with a confidence score, short reasoning, pros and cons, impact on monthly budget and limits, impact on savings goals, alternatives, and a cooling-off suggestion. Include an AI Debate Mode where the user can argue back and the AI updates its reasoning. The AI must never give licensed financial advice, never encourage debt or risky spending, always show a "not financial advice" disclaimer, and must be transparent and non-manipulative.

Game systems: RPG-style XP and levels (Bronze Saver → Silver Budgeter → Gold Planner → Platinum Investor → Diamond Master), daily/weekly/monthly quests, streaks (logging, no-overspend, weekly check-in, dividend logging), badges (First Expense Logged, Subscription Slayer, Limit Keeper, First ETF, Portfolio Pro, Freeze Master, First Dividend, Dividend Collector, Passive Income Pro, Smart Shopper, Impulse Controller, Budget Defender), and virtual coins earned through quests and streaks that are used only for cosmetic rewards and are never exchangeable for real money. Include challenges like No-Spend Weekend, Subscription Audit, 30-Day Budget Streak, Emergency Fund Sprint, and Portfolio Check-Up.

Calculation rules (must appear in the Help section with examples): Expense = money spent and not recovered. Subscription = recurring expense deducted from available balance. Stock purchase = reduces cash, increases investments, not an expense unless the user selects it. Dividend = income added to savings or passive income bucket; can be reinvested. Spending limit = applies to expenses and subscriptions by default. Salary freeze = reduces expected income; does not stop bills. Net worth = cash + savings + investments − debts. Available balance = cash + savings − upcoming subscriptions − reserved limits.

Screens: Onboarding, Dashboard, Add Expense, Budget & Limits, Subscriptions, Salary Freeze, Investments, Dividends, Should I Buy It?, News, Goals, Quests & Achievements, Profile & Settings, Help Center.

Instructions and onboarding: Include a step-by-step setup wizard, interactive tutorial with sample data, tooltips on every major screen, a glossary (net worth, cost basis, limit, freeze, ETF, dividend yield, ex-dividend date), calculation examples, "How it works" pages for salary freeze, dividends, and the AI assistant, an FAQ, legal disclaimers, and a demo mode with fake money before entering real data.

Data model: User, Income, Expense, Subscription, BudgetLimit, SalaryFreeze, Holding, Dividend, Transaction, Goal, Debt, Achievement, Quest, Streak, BuyDecision, NewsItem.

Notifications: Daily expense logging reminder, limit warnings at 80%/100%/120%, subscription renewals, salary freeze start/end, dividend ex-date and payment reminders, dividend milestone alerts, weekly and monthly review reminders, market movement alerts, optional news alerts, quest completion and level-up notifications, and AI cooling-off reminders.

Security and legal: PIN/biometric lock, local-first storage with optional encrypted cloud sync, AES-256 at rest, SQLCipher on mobile, keys in Keychain/Keystore, no bank credentials required, data export and deletion, privacy policy, terms of service, and prominent "not financial advice," market data delay, AI recommendation, and news data disclaimers. No real-money trading or gambling.

Design: Playful, clean, motivating, and trustworthy. Mobile-first responsive layout, accessible color contrast, dark mode, smooth micro-animations for XP gains and level-ups, and a dashboard that surfaces the most important numbers at a glance.

Deliver MVP first: Dashboard, Add Expense, Budget & Limits, Subscriptions, Salary Freeze, Investments, Dividends, Should I Buy It?, News, Goals, Quests, Profile, Help — as a responsive web app with PWA support, then package with Capacitor for iOS and Android.
