# M9 Accounts and polish: decisions and deferred items

## What happened

- **Branch.** `feat/m9-accounts` is stacked on `feat/m8-download`. M8's version-test fix d2d44e5 is merged in.
- **Spec and plan.** The spec is `docs/superpowers/specs/2026-10-17-funancial-accounts-and-polish-design.md`. The plan is `docs/superpowers/plans/2026-10-17-funancial-m9-accounts.md`. The approved prototypes are welcome A, setup "from below", and the Invest pie "like B, logos outside".
- **Built.** Tasks 1 to 7 were built one at a time, and each was reviewed until clean:
  1. the account keys and the locked copy;
  2. the service's accounts;
  3. "forgot password" and the reset page;
  4. the app's account layer;
  5. the welcome screen, setup that rises from below, and log in;
  6. the bigger Invest pie with logos;
  7. the privacy wording and your setup guide, `docs/accounts.md`.
- **Final review (Opus).** It found no Critical issues and three Important ones, all fixed in one wave (dd4015a..98d498f). The scoped re-review came back clean. The gate passes: typecheck, lint, 3052 unit tests, the site e2e and every touched e2e spec.
- **Still to do (Task 8, with you).**
  1. You add the three secrets.
  2. Claude deploys with your OK, service first.
  3. Live checks, including one real reset email.
  4. Emulator: make an account, reinstall, log in, then forgot password.
  5. You make your own account.
  6. Rebuild and publish the release.

## Please read

These are words I wrote that speak for you. Change any of them.

- **Where a friend agrees to an account** (setup and Settings): "A locked copy of your data is kept so you can move to a new phone. The app's owner runs the service and could unlock it, which is how "forgot password" brings your data back."
- **Download page, "Safe and simple":** "Your money lives on your phone, encrypted. An account keeps a locked copy so you can move phones. The app's owner could unlock it, which is how "forgot password" brings your data back. No ads."
- **Help → Privacy** also says that anyone who got into your Vercel account could unlock a copy. It also says "Delete all data" erases only the phone, and that a friend removes their copy with **Turn off and delete my copy**, or by asking you.

## The calls I made

### Accounts and keys

- **Passwords.** The password and username are normalised (NFKC) before the keys are made. The same password typed on two keyboards always opens the account.
- **The reset page.** The page can hand the service the new key so it can re-lock the data key. This is the "service can unlock" trade you accepted.
- **The database alone can't unlock anything.** At first, someone who could write to the database could have unlocked copies. The final review found a cheap fix, which went in before any account exists:
  - reset links carry a tag only the master key can make, bound to the email they were sent to;
  - the service's lock on each data key is bound to the username, email and creation time.

  Your guide's table says what a leaked database password can and can't do.
- **Two different "not allowed" answers.** "This phone's pass no longer counts" (moved) is told apart from "the app's shared key is wrong". A changed shared key never tells every friend their account moved.
- **A log-in whose copy won't open.** It links nothing, restores nothing and changes nothing on the phone, and it says so.
- **Every save and every account change is compare-and-set.** A lost reply, or two phones at once, can't put an older copy over a newer one. A log-in can't undo a reset.

### Forgot password

- "Forgot password" answers at once, the same way whether or not the account exists, and sends the email in the background.
- At most 300 emails a day go out, and at most 3 accounts per address get mail, so your Gmail can't be drained.
- The email doesn't name the username, and a link dies after a reset or a password change.

### Setup and welcome

- **"Skip for now" on the account step.** It shows when the phone is offline or the service is failing (down, not set up, or too busy). It doesn't show for a taken name or bad input. You chose "only when offline"; I widened it because the reason was that a friend must never be stuck. Settings and a Home reminder offer the account later.
- **Back on step 1.** A friend who tapped "Create an account" can go back to the welcome screen and try the demo. This erases only the empty start that tap made.
- **Blobs.** The soft colour shapes drift, but only when the phone allows motion.

### Invest pie

- **Letter discs.** A company without a logo gets its first letter on a neutral disc with a ring in its pie colour. The letter stays readable on every colour in light and dark.
- **Logo size.** Logos are 18px, as in the spec.
- **Google's globe.** Unknown companies may get Google's default globe instead of a letter. That can only be checked live, in Task 8.

### Wording

- "No account" and "stays on your phone" are gone wherever they became untrue: Help, FAQ, About you, Buy it?, and the download page's hero and permission line.
- **A moved phone.** It now says so on Home: "This phone isn't saving its copy any more, because your account was opened on another phone." Deleting a copy from that old phone says nothing was deleted, and to do it from the phone the friend uses.

## Deferred (none loses data)

- **Sign-up.**
  - Signing up again with an existing username and its exact password, when the first reply is lost, moves the account and then says "taken". Logging in fixes it.
  - Next can still be tapped while step 1's Back is erasing. That can make an account the phone never linked; logging in recovers it.
- **What's left out of a copy.** A copy leaves out records the phone itself couldn't read. They stay on the phone.
- **Abuse.** Someone with the APK's shared key could fill the free database. Sign-ups are limited per IP, and setup now offers "Skip for now" when the service fails.
- **Messages.**
  - Without Gmail set up, Forgot says the service "isn't answering".
  - A 429 no longer says how long to wait.
- **Accessibility.**
  - The change-password dialog has three "Show password" buttons with the same name.
  - The Android back gesture minimises the app from Log in, Forgot and setup.
- **Logos.**
  - A symbol the price source doesn't know is asked about again on each visit.
  - An empty logo image would be kept for a week.
- **Your guide.**
  - It describes Vercel's, Upstash's and Google's screens from general knowledge, so labels may differ.
  - The manual copy-removal search can also show an email entry.
- **Multi-tab use of the web app.**
- **Large files.** `accounts.ts` and `accountActions.ts` are large files that weren't split.
