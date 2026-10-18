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

## The night of 2026-10-17: what you asked for before sleeping

Before you went to sleep you asked for seven more things. Each was built and reviewed one at a time, then the whole night's work had one final review on the most careful model. It runs from 09d04c0 to fe4840c. Except for the "hide numbers" and card screens, which you approved as wireframes, there was no fresh wireframe: everything uses styles you had already approved. Phone-size screenshots of each are in `.superpowers/overnight/screens/`.

1. **Hide amounts.** An eye button on the "Available to spend" row turns every amount in the app into `••••`, as you chose (dots, not blur). The month bar goes grey. Your choice is remembered on that phone and is not part of your data or copy.
2. **The card.**
   - In "Coming up" the card row reads "<card> card payment" with a DUE date, and you can tap it. It opens a panel with what you owe, the due date, what you pay, how much of the limit is used, **Pay card** and **Edit card**.
   - The bills page is now "Bills & cards".
   - **Pay card** suggests the minimum for a card you don't pay in full.
   - Once you've paid the minimum, the card no longer shows as due, so Available to spend doesn't count it twice.
3. **Tap Home's numbers.** Tapping **Available to spend** or **Net worth** shows what the number is made of. Each balance has **Correct** (type what your bank shows) and each debt has **Edit**.
4. **Goals and Debts** are two pages, each in the Menu.
5. **Income.** A new page with this month against your average, the last 12 months stacked by salary, extra and dividends, this year's split, and the biggest sources. It's in the Menu, with a link from Home.
6. **Security, against your SECURITY.md.** No secret was ever committed. The fixes:
   - **Passwords.** Keys now come from Argon2id at 64 MiB with 3 passes, the bar your rules set.
   - **Log-in limits.** At most 10 a minute per address. A name waits after 5 failures, up to 10 minutes, even under a burst of tries sent at once.
   - **Requests.** The service refuses fields it doesn't expect.
   - **The reset link.** Its code sits in the part of the address (`#…`) that never reaches a server.
   - **Libraries.** nodemailer is updated, and `npm audit` reports no high-severity problem.
   - **Browser rules.** Security headers and a content policy are now set for the site.
   - **`.gitignore`.** It now covers every kind of secret file.
   - **Secret checks.** A check now runs before every commit, and a GitHub workflow scans for secrets and vulnerable libraries.
7. **The name is Funcial.** Everything a person sees is renamed, at the new address `https://funcial.vercel.app`, and the QR code was regenerated. The hidden internal names (the app ID, storage names and the words used to make keys) are unchanged, so your data, account and backups keep working.

### The calls I made overnight

- **Where the eye sits.** It is on the "Available to spend" row, as in the wireframe, not in the top line, where it cut the date into "Oc…" on 412px phones.
- **The average on Income.** It starts from your first month with income, not a flat 12 months, so a new user's average isn't far below a normal month.
- **Bar targets on Income.** Twelve bars at phone width are 28px wide each, taller than they are wide. That is under the app's usual 44px, but above the accessibility minimum.
- **The key change for your test account.** No friend has an account yet, so the key change needed no migration. Your test account's old password stops working on the new build. Use "Forgot password?" once, which keeps the data, or delete it and make it again.
- **What I left for you.**
  - Making the GitHub repo private.
  - Vercel's firewall: deny or rate-limit, not "challenge", on `/api/*`. A phone can't pass a challenge.
  - A narrower Upstash token.
  - A separate shared key for dev builds.
- **Not fixed yet.** A mistyped email at sign-up can still receive that account's reset link. Confirming the email is its own feature for later.

### Deferred from the night (none loses data)

- **Login speed.** Argon2id runs on the main thread, about 0.5–1.5 s on a phone, with the busy label shown first. It still needs measuring on the emulator.
- **Screen readers.** They read `••••` as "bullet bullet bullet bullet".
- **Rounding.** Fixed 2026-10-18: Income's year shares always add up to 100%.
- **Reminders.** Fixed 2026-10-18: later months remind of the whole minimum, even after this month's minimum is paid.
- **Gitleaks.** Run locally on 2026-10-18 (8.28.0, every branch): only the four allowlisted test files, which 8.28 does not apply the allowlist to. CI runs 8.30.1.
- **Smaller items.** The full list, with each review, is in the night's review files.
