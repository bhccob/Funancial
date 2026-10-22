# Redesign Phase 1 (data foundation) — decisions

Branch `feat/redesign-p1-data`, stacked on `fix/card-and-data-delete` (0.9). Version 0.10
(versionCode 10). Plan: `docs/superpowers/plans/2026-10-21-funcial-redesign-p1-data-foundation.md`.
Built task by task with a fresh implementer and a fresh reviewer per task. A final whole-branch
review found no data-loss or wrong-money bug; its one Important finding and six Minor ones were
fixed in `24316e0`.

At the end:
- typecheck 0
- lint clean
- 160 test files / 3292 tests pass
- e2e 167 pass / 17 layout skips / 0 fail

## What changed

**Accounts replace buckets and card debts (schema v10):**
- The cash bucket becomes **Main account** (debit). Savings becomes **Savings**. Passive becomes
  **Passive income**, made only if anything used it.
- Each credit card becomes a credit account with the same id.
- Every expense, income, subscription, transaction, dividend and sale names an account.
- Debts are loans only.

**One upgrade path.** `migrateTables` runs the v10 table step for stored rows (`loadAll`) and for
the account copy (`migrateSnapshot`), and both produce identical tables.
- Loads take turns.
- The write is atomic and checks the version.
- A row that can't be read is never removed.

**Removed:** "Should I buy it?", About you, Salary freeze, their data and reminders, three badges
(their XP stays), and `/api/extract`. The live service keeps that route until the next deploy,
which needs the owner's OK.

## Balances: what moves and what doesn't

Checked to the cent against v9 code (captured at `3f636e2`) on the demo and an edge fixture:
- Main account = old Cash
- Savings = old Savings
- Passive income = old Passive
- each card owes the same, and loans are the same
- net worth is the same

**Available to spend changes, as approved (P2):** new Available = old Available − old Savings +
any card subscription still to come this month (v9 took that off twice).

| | v9 Available | v10 Available |
| --- | --- | --- |
| demo | 11,868.10 | 4,698.10 |
| edge | 9,503.92 | 4,883.92 |
| edge with an October card subscription (12.99) | 9,490.93 | 4,883.92 |

## Rulings

Each is the call made, why, and what it costs if wrong.

1. **R1.** Phase 1 is stacked on the 0.9 fix branch instead of waiting for it to merge, because
   v10 builds on its `Debt.archivedOn`/`freshStart`. If wrong: a rebase if 0.9 changes.
2. **R2.** The work ran in the main checkout on its own branch. If wrong: the checkout sat on this
   branch meanwhile.
3. **R3.** The test builders moved into Task 4 with the schema change. If wrong: a bigger Task 4.
4. **R4.** The demo pays dividends to passive, so it has Passive income too. If wrong: none.
5. **R5.** Passive income opens on the profile's opening date, as v9 counted it. If wrong:
   pinned by the fixture.
6. **R6.** All three Buy-it badges go and their XP stays. If wrong: 9 badges, not 12, until
   Phase 9.
7. **R7.** The download page keeps its Buy it? / Freeze Master copy until P11. If wrong: it
   oversells to friends until then.
8. **R8.** Home's round actions are 3 until Phase 3 replaces the row. If wrong: one release with
   3 buttons.
9. **R9.** An expected salary lowered by an old freeze is not repriced. If wrong: one
   expected salary shows less until confirmed (editable there).
10. **R10.** Card order is set by (createdAt, id), not storage order. If wrong: cards in another
    order.
11. **R11.** The upgrade isn't refused if the profile row alone can't be decrypted (corruption
    v9 couldn't show either). If wrong: rows point at a missing Main account on corrupt data.
12. **R12 / R13.** Instead of making the v10 step idempotent, loads are serialized, the write
    checks the version, and biometric waits while a PIN is checked. If wrong: a theoretical
    cross-process race on SQLite, which Android doesn't have.
13. **R14.** A credit account never adds to Available or Cash in pocket. If wrong: none.
14. **R15.** Every card's next payment comes off Available, even one due next month (v9
    behaviour; spec §8 reworded). If wrong: Available lower by a next-month card payment.
15. **R16.** An account with history can't switch between credit and non-credit. If wrong: add
    a new account instead.
16. **R17.** Money only lands on an existing, in-use account. Income can't go onto a card. If
    wrong: none.
17. **R18.** Deleting an account moves its still-expected incomes to the new default. If wrong:
    none.
18. **R19.** "Pick a credit card to pay." is kept as copy. If wrong: copy.
19. **R20.** The account checks live once in `src/domain/accounts.ts`. If wrong: none.
20. **R21.** Money arriving on a card is refused with the income wording. If wrong: copy.
21. **R22.** Help's Available text and its worked example follow the v10 rule. If wrong: none.
22. **R23.** With no usable account, forms say "Pick an account.". If wrong: copy.
23. **R24.** Editing a subscription checks its account only when it changes. If wrong: none.
24. **R25.** "Confirm salary" lets you pick the account. If wrong: one extra field.
25. **R26.** One shared `accountName` helper. If wrong: none.
26. **R27.** The final fix wave left out one Minor: a log-in test with a v9 copy end to end
    (each piece is tested). If wrong: a copy-path slip would show only at a fresh-phone log-in.
27. **R28.** Help prose still in the bucket model (Dividends page, Net worth page, glossary
    "Cash") waits for the Phase 2/3 copy pass. If wrong: Help reads a little dated in 0.10.

## Deferred (final review: can wait)

- **Dead code:** the `safeFetch()` HTML reader and `migrateRecord` have no production caller.
  Remove them in a later cleanup.
- **Test-precision gaps:**
  - a non-card subscription → Main mapped by value
  - card stamps that differ from the profile's
  - R25's start-on-the-row's-account case
  - saving a card correction from the dialog
  - carousel order vs insertion order
  - archiving a card that has subscriptions on a real store
- **0.9 behaviour kept:** a card with no due day saves as day 1.
- **Copy for the owner to glance at:**
  - Home legend "Bank & cash"
  - History "Card payment" and "owed more/less"
  - picker label "Account"
  - setup "paid from your bank account later"

## Phone check (owner)

**Pending.**

Before installing 0.10, note on 0.9:
- Home → Available to spend, and its sheet's Cash and Savings
- the Net worth total
- what each card owes

After installing, check:
- Main account = old Cash
- Savings = old Savings
- each card the same
- Net worth the same
- Available = old Available − old Savings (+ this month's card subscriptions)
- Buy it, About you and Salary freeze are gone
- adding an expense on a card and paying the card work

0.10 can't be undone: once it upgrades the phone, 0.9 won't open the data, and the next upload
replaces the account copy on the server.
