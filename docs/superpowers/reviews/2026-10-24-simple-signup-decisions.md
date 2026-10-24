# Funcial 0.14 (a shorter sign-up): decisions

- **Branch:** `feat/simple-signup`, from local `main` at `b05d275`.
- **Spec:** `docs/superpowers/specs/2026-10-24-funcial-simple-signup-design.md`
- **Mockup:** `design/next/p2-signup.html`
- **Plan:** `docs/superpowers/plans/2026-10-24-funcial-simple-signup.md`

The owner approved the design ("yes go ahead") and the plan ("yes"). Ten tasks were built, each with a fresh implementer and a fresh reviewer. The security-sensitive server task (the email code) had two extra review rounds on the most capable model. A whole-branch review and a fix wave followed, then a re-review and one small follow-up.

Final results at `6cb781e`:
- typecheck 0, lint clean
- 187 test files / 5563 tests pass
- e2e 431 passed / 246 skipped (each spec's own per-project skips) / 0 failed

## What changed

- **Setup in four steps:**
  - **Account:** username, email, and a password with a strength bar.
  - **Email code:** a 6-digit code, after which the account is made.
  - **Currency and name.**
  - **Lock.**

  Setup asks no money questions, makes only "Main account" (at 0) and makes no Savings.
- **The email code (server):**
  - A new `code` route. `signup` takes the code.
  - Codes are stored as an HMAC keyed from the master key and spent once.
  - Limits:
    - 5 wrong tries per code
    - 5 codes an hour per address and per IP
    - 30 seconds between codes
    - 150 code emails a day, inside the 300 a day shared with "forgot password"
  - Nothing private is logged.
  - Sign-ups without a code (release 0.8) still work and are marked `emailVerified: false`.
- **Passwords:** one set of rules everywhere a password is chosen: setup, Create account, Change password and the reset page.
  - They refuse about 1,000 common passwords of 10 or more characters, a password that is your username or email, and one character repeated.
  - A three-step strength bar agrees with the refusal.
- **Settings → Create account** has the same two steps, in a sheet.
- **The code step survives a trip to your email app.** If the app locks or reloads, the username and email you typed come back for 10 minutes; the password and the code never do. A code sent seconds ago isn't sent again. "Delete all data" forgets it.
- **Welcome, log-in, forgot password, lock and the Erase dialog** are in the glass look. Welcome and lock use the dark block.
- **Home's first-time cards:** "What's in your Main account?" and "Got subscriptions?". They show only while nothing has been logged, so someone upgrading from 0.13 doesn't get them.
- **Move money with one account** explains that you need a second account.
- **"+ New card" inside a subscription:** a name, the last 4 digits, and Debit or Credit (Debit by default).
- **Recent and History:** amounts line up, and long card names wrap instead of being cut off.
- **Contrast scans** cover the new screens. Version 0.14 (versionCode 14).

## Calls made along the way (the owner can overrule any)

| # | Call | Why |
| --- | --- | --- |
| Spec | "Main account" is still made at 0. The first Home card asks "What's in your Main account?" | About ten forms need an account to pick |
| Spec | "Paid with" stays a dropdown, with "+ New card" at its end | Pills wrap badly with several cards |
| R3 | Recent keeps its 44px icons. Long names wrap to a third line on narrow phones | Matches the Cards tab's rows |
| R5b, R7 | The code is an HMAC, spent atomically. A failed resend keeps the earlier code | From the security review |
| R8 | The app always sends the code; the server still accepts none from old apps | Release 0.8 friends |
| R10 | The account step's label is "Email", with the hint 'For "forgot password".' | The long label left no room |
| R11 | The Privacy page says the email is used for the sign-up code and "forgot password" | It was no longer true |
| R12 | The Create-account sheet can't be closed while a request runs | A late answer would land on a closed sheet |
| R15 | Delete all data brings the first-time cards back, and a 0 starting balance counts as an answer | |
| R17 | The code step survives a lock or reload. A retried sign-up that hears "expired" checks whether it made the account | From the whole-branch review |
| R19 | Only a fresh code skips ahead (a distinct "too soon" answer from the server) | So another limit isn't mistaken for "a code was just sent" |

## Deploying

The code route and the `signup` change need a Vercel deploy. The owner is asked first. The steps:

1. Deploy from the main checkout, which has the git-ignored `site/public/get` (the APK and `latest.json`), after merging. Never deploy from a worktree.
2. Check that the environment has `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SERVER_MASTER_KEY` and the Upstash variables, by name only.
3. Run `npx vercel build --prod`, then `npx vercel deploy --prebuilt --prod`.
4. Then check:
   - `/get` still downloads, and `/get/latest.json` is unchanged.
   - The reset page refuses `qwertyuiop`.
   - Forgot-password still emails.
   - A sign-up with a real address gets its code. Check the spam folder.
5. Install 0.14 on the phone only after the deploy. An app running against the old server can't sign up; it says "You're offline" and offers "Skip for now".

## Left for later

- Older weak class pins: about 27 `not.toHaveClass(a, b)` in tests that predate this branch.
- The server's compare-and-set re-arms the code's lifetime as a second step. It fails closed.
- The lock and welcome screens always use the Black & White block, since the theme lives in the locked data.
- Moving the other quiet text buttons to `TextButton`, and removing the lock's duplicated classes.
- The phone checks:
  - the code step with Gmail
  - Android's double back gesture during a long Verify
  - the lock's bottom corners
