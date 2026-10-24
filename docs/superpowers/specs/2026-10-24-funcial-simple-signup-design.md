# Funcial — a shorter sign-up (project 2 of 5) — design

Date: 2026-10-24. This document records the owner's feedback on 0.12 and the mockup they approved
for it. It ships as **0.14** (versionCode 14), on branch `feat/simple-signup` from `main` at
`b05d275`.

The approved mockup is `design/next/p2-signup.html`. On 2026-10-24 the owner said "yes go ahead"
to starting from it as drawn.

## Why

The owner's words, after using 0.12:

> "i dont get the credit card logic in when user start the app to sign up i think should get rid
> of that idea, just let them be able to put a card inside a subscription instead of making it
> seperate. maybe. also when signing up user isnt require to add their blanace right away, dont
> need so many uneccessary feature since this should be a minimal app still, maybe add more
> security question before making an account instead."

Today setup has six steps:
1. the account
2. currency and name
3. what you have now (cash and savings)
4. salary
5. credit cards
6. the lock

Three of those ask for money details before the person has even seen the app.

**Success:** a new person gets from the welcome screen to Home in four short steps. Nothing about
their money is asked up front. The email address on the account is proven to be theirs, so
"forgot password" can always reach them.

## Goals

1. **Setup has four steps:**
   - **Account:** username, email, password. The fields are unchanged. The password gets a
     strength bar, and very common passwords are refused.
   - **Email code (new):**
     - a 6-digit code is sent to the email
     - the account is made only once the code is typed
     - "Send a new code" is offered, and Back fixes a wrong address
   - **Currency and name:** unchanged.
   - **Lock (PIN or fingerprint):** unchanged.

   The cash and savings, salary and credit-card steps are removed.
2. **"Skip for now" is kept:** offline, or when the service isn't answering, the person can skip
   the account and the code, as today. Making an account later from Settings asks for the code
   too.
3. **After setup, Home starts at zero and asks softly:**
   - a quiet card asks for the starting balance
   - a second card says subscriptions can be added, with their card picked right there
   - each card goes away once it has been done or dismissed
4. **Cards inside a subscription:** the subscription form's "Paid with" offers "+ New card". It
   opens the new card's few fields right in the form (see "My calls"). Saving the subscription
   makes the card, which then shows on the Cards tab like any other.
5. **The screens project 1 left out get the 0.12/0.13 glass look:**
   - the welcome, log-in, forgot-password, lock and setup screens
   - the Create-account dialog in Settings
   - the Erase ("Delete all data") dialog

   This covers ledger rulings R4 and R9 from 0.13.
6. **Two leftovers from 0.13's last review,** carried here because 0.13 is already on `main`:
   - In Recent and History, the amounts on expense rows sit 20px to the right of the amounts on
     rows with a delete button. They should line up.
   - With "Afl." amounts and a long card name, Recent's sub-line still clips on a 360px-wide
     phone. The card name and `·· last4` must show in full.

## Non-goals

- Security questions such as "your first pet's name". The mockup explains why the email code is
  used instead, and the owner went with the mockup.
- Changing log-in, forgot-password or the account copy's encryption. The account's keys are made
  exactly as today, only later in the flow.
- Asking existing accounts to verify their email.
- Evolving badges, automatic logging and the currency switcher: projects 3–5.

## Anti-goals

- **A sign-up that can make an account without the code** from this version of the app on.
- **A code that can be guessed or brute-forced:**
  - tries are limited
  - codes expire
  - codes are stored only as a hash
- **A flood of emails** from someone hammering "Send a new code". Gmail has a daily sending cap,
  and "forgot password" shares it.
- **Losing the person's typed details** when they go back from the code step to fix the email.
- **Text that fails contrast** (the 0.12/0.13 rules) on the restyled screens.

## Constraints

- **Server:**
  - The code is a new account route next to `signup`, under `api/_account/`.
  - Sending reuses the Gmail mailer (`api/_lib/mailer.ts`) and the existing rate limiter
    (`api/_lib/rateLimit.ts`).
  - The daily email cap is shared with "forgot password" (`forgot:global`).
- **Deploying the server change needs the owner's OK first.** Until it is deployed, the app's
  sign-up can't work against the live service. So the app must not be installed on the owner's
  phone, or released, before the deploy, unless the "Skip for now" path is what's tested.
- **Money and data:**
  - Money stays in integer minor units.
  - No schema version bump is needed: setup still writes the profile, accounts and settings in
    one write, and no stored field is added. `SettingsSchema` is strict: a new required field
    would reject every existing snapshot and account copy.
  - The subscription's new card is written in the same write as the subscription.
- **Sign-up must stay safe to retry:**
  - Today a sign-up whose reply is lost is retried, and the retry learns the account is already
    there and logs in (`accountActions.ts` ~460-491, `accounts.ts` ~496-499).
  - The server therefore checks the name and that retry match before it checks the code. A retry
    of a sign-up that already succeeded must not fail with "wrong code".
- **UI:** build on 0.13's controls:
  - `PageHeader`, the `row` fields, `MoneyField size="hero"`, `RadioGroup variant="pills"`
  - `Sheet`/`Dialog` with frost on the inner box
  - glass pills
- **Accessibility:** tap targets ≥ 44px; lucide icons only; reduced motion gives fades only.
- Version 0.14 / versionCode 14.
- Never push, PR, merge or deploy without asking the owner.

## Decided by the owner

- the four steps, in the mockup's order
- the email code as the "more security"
- no card, balance or salary steps
- cards made inside a subscription with "+ New card"
- Home asking softly afterwards

## My calls, not yet challenged

- **The code:**
  - 6 digits, valid for 10 minutes, at most 5 wrong tries, after which a new code is needed
  - "Send a new code" is available after 30 seconds
  - at most 5 codes an hour per email address and per IP
  - only a hash of the code is kept, keyed by the email address
  - the email reads plainly: "Your Funcial code is 481 529. It works for 10 minutes. If you didn't
    ask for it, ignore this email."
  - **Email budget:**
    - Code emails get their own daily cap of 150, inside the 300-a-day cap they share with
      "forgot password", so a flood of code requests can never use up "forgot password".
    - Wrong codes are counted in their own bucket (20 an hour per IP), checked before any key
      work. A fumbled code doesn't use up sign-up's 5-an-hour limit.
- **A linked account skips the code step:** after Delete all data (the account stays) or a
  log-in over setup, there is nothing to verify, so setup goes from the account step straight to
  Currency and name.
- **When the username is checked:** asking for a code also checks the username is free. A taken
  name is caught on the account step, not after the code. The code route answers "taken" just as
  sign-up does today, so it reveals nothing new.
- **When the account is made:** the keys are made as today, after the code is accepted. Sign-up
  sends the email, the code and the keys, and the server makes the account and consumes the code
  in one step. A wrong or expired code makes no account.
- **Old app versions:** release 0.8, which friends installed from `/get`, signs up without a
  code. The server keeps accepting sign-ups without a code and marks those accounts
  `emailVerified: false`. Sign-ups with a valid code are `emailVerified: true`.
  - This app version always sends the code.
  - Requiring the code for everyone becomes a one-line change once a newer release is on `/get`.
  - Existing accounts stay as they are, unmarked.
- **The password:**
  - The strength bar has three steps: weak, okay, strong. It counts length and the mix of
    letters, digits and symbols. The mockup draws four segments; three is the call.
  - At least 10 characters stays the rule.
  - The password is refused if it is:
    - on a bundled list of about 1,000 common passwords that are 10 characters or longer,
      compared ignoring case, taken from an MIT-licensed source (SecLists)
    - all one character
    - the username or the email's name part
  - The refusal says why in plain words.
  - The rules apply wherever a password is chosen: setup, the Create-account sheet, Change
    password, and the reset page (`site/reset`). Otherwise "forgot password" would let someone
    pick "password123". The server only ever sees a derived key, so the check lives in the app
    and on the reset page.
- **The first accounts (this differs from the mockup):**
  - The mockup's first Home card reads "Add your first account … Add an account", as if setup
    made no account. Instead, setup still creates "Main account" (debit), opening at 0, as the
    default account.
  - This is because about ten forms (Pay, Expense, Income, subscriptions, …) need an account to
    pick. With none, they would all dead-end.
  - The first Home card therefore asks "What's in your Main account?" instead.
  - "Savings" is no longer made at setup. People add it from the Cards tab if they want it.
- **Move money with one account:** with only Main account, Home's ⋯ → Move money (and a goal's
  Add money "from" picker) has nowhere to move to. It shows a short hint, "Add another account on
  the Cards tab to move money between them", instead of a bare "Pick an account".
- **Home's first-time cards:**
  - **"What's in your Main account?"**
    - It opens a small form to set Main account's starting balance (its opening balance), using
      the hero amount.
    - It shows only while Main account's opening balance is 0 and nothing has been logged
      (no expense, income or transfer).
    - It goes away once the balance is set, something is logged, or it is dismissed. Someone
      whose balance really is 0 dismisses it.
  - **"Got subscriptions?"** It opens the new-subscription form. It shows only while there are
    no subscriptions, and goes away when one is added or it is dismissed.
  - **People upgrading from 0.13:** both cards are tied to "nothing yet", so someone already
    using the app doesn't suddenly get them.
  - **Dismissals:** kept on the phone (`safeStorage`), the way Home's existing account reminder
    keeps its own (`AccountReminder.tsx`). There is no new stored field and no schema change, and
    after Delete all data, starting over brings them back.
- **"+ New card" in a subscription:**
  - "Paid with" stays the shared account picker. In the subscription form only, its list ends
    with "+ New card". Picking it opens the new card's fields right under the picker:
    - Name
    - Last 4 (optional)
    - Kind, as two pills: Debit (the default) or Credit
  - The mockup draws "Paid with" as pills. A row of pills wraps badly once someone has several
    accounts, and the picker is shared by about ten forms, so the call is the picker plus
    "+ New card".
  - Debit is the default because a credit card with no due day shows its whole balance as a
    bill due today in Coming up. A credit card made here works exactly like one added on the Cards
    tab with no due day. Its Settings asks for the due day and limit later.
  - The new card gets its kind's default look (skin). If the subscription isn't saved, no card is
    made.
- **The restyle of the welcome, log-in, lock and setup screens:**
  - Welcome and lock get the 0.12 head block (`bg-head` with its glow shapes) for their hero
    areas, as Home and Profile have.
  - Setup, log-in and forgot-password use the 0.13 inner-screen look: a light page with its soft
    shapes, a round glass Back, a `text-page` title, and `row` fields. Setup's moving `Blobs` give
    way to the page's still shapes, as the mockup draws.
  - The copy stays, except where the removed steps are named. For example, the Delete-all-data
    text currently says "Setup then asks for your cash, savings, salary and cards again".
  - The mockup draws only the four setup steps, Home's first-time cards and the subscription
    form, so the other screens follow these rules without a drawing.
- **The Create-account dialog** (Settings, for those who skipped) becomes the same two steps,
  account then code, in a sheet.

## Left to the builder

- the route's name and request shapes, and the store keys for codes
- how the code field is built: one field with 6 boxes or 6 inputs, as long as paste, autofill
  ("one-time code") and screen readers work
- where the common-password list lives and how it is loaded
- how Home's first-time cards are placed among the Coming up bubbles and Overview
- the order the work is split into tasks
