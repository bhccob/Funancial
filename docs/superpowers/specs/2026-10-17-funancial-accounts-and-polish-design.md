# Funancial: accounts for moving phones, a premium welcome and setup, and a bigger Invest pie (design)

Status: draft for the owner's approval (2026-10-17).

This work goes into the first release to friends. That release (0.8, built but not published) waits until this is done (the owner: "wait until all of it is done"). After this, M8's Task 5 rebuilds and publishes the release.

## Intent

Three things the owner wants before friends get the app:

1. **A better first impression.** The first screen on the phone, and the setup steps after it, should feel premium.
2. **An account.** A friend makes an account with a username and password, so that on a new phone they can log in and get everything back "without having to go through a difficult process". Today that means a backup file, moving it across, and restoring it. A familiar **email "forgot password"** must work, and it must keep their data.
3. **Invest.** A bigger pie, with each company's logo next to its percentage, outside the ring.

## What the owner decided (in their words or choices)

- **The release waits.** It goes out only when all of this is done.
- **The account trade-off.**
  - A locked copy of each friend's data is kept on the owner's Vercel service.
  - The email reset keeps the data. That means the service can unlock it, so the service (and anyone who gets into the owner's Vercel account) could in principle read friends' money data.
  - The owner accepted this over a recovery code: "a familiar email reset would be good".
- **Email is sent from the owner's Gmail**, using a Gmail app password the owner creates ("gmail is fine").
- **Welcome screen: direction A, "Calm and simple".**
  - The name in large letters over soft drifting colour shapes, like the download page.
  - A short line under it.
  - Three choices at the bottom, within thumb reach: **Create an account** (primary), **I have an account**, and **Try with demo money** (a quieter text button).
- **Setup steps slide "from below".** The approved feel is the clickable prototype `.superpowers/brainstorm/17180-1792238596/content/setup-slides-v2.html` in "New step from below" mode:
  - the new step rises in from below while the old one moves up and fades;
  - the step's lines appear one after another, about 80 ms apart;
  - the progress bar glides;
  - the soft background colours drift and shift a little with each step.
- **Invest pie: option B with the logos outside the ring** (sketch: `.superpowers/brainstorm/17180-1792238596/content/invest-pie-v2.html`; the owner said "yes exactly").
  - The ring grows from 180 to 220.
  - Each slice gets its company logo and percentage just outside its edge, with a short leader line.
  - The list under the pie starts each row with the logo.
  - Labels that would overlap on small slices are left to the list, which always shows every logo.

## Goals

- **Moving phones.** A friend can move to a new phone with only their username and password.
- **Forgot password.** They can reset a forgotten password from an email and keep their data.
- **First impression.** The welcome screen and setup feel premium, matching the approved prototypes.
- **Invest.** The pie is bigger, and each holding's logo shows outside the ring and in the list.

## Non-goals

- Syncing two phones at the same time. One phone is "active" for an account.
- Accounts for anything other than moving phones: no web login, no sharing, no social features.
- Changing how the app is unlocked day to day. The PIN and fingerprint stay exactly as they are; the account password is only for logging in on a new phone and for resets.
- Uploading demo money. Nothing in the demo namespace is ever uploaded.

## Anti-goals (a failure even if it technically works)

- A friend loses data after a password reset.
- A login is slow, confusing, or asks for things it doesn't need.
- Someone can guess passwords against the service without being slowed down, or can learn whether a username exists.
- Help or the download page still promise "no account" or "your money never leaves your phone" after this ships.
- Any password, app password or master key appears in logs, the repo, or chat.
- A logo request tells a third party which stocks someone holds.

## Constraints

- **Accounts that only the owner can create.** The owner sets these up themselves and pastes their keys into Vercel's environment settings. Claude never handles their passwords or keys, and gives step-by-step instructions instead.
  1. **A Gmail app password**, from the owner's Google account security settings (2-step verification required).
  2. **A free database** added from the Vercel dashboard's Storage tab (Claude's call: Upstash Redis).
  3. **A long random server master key.** It's generated on the owner's computer by a command Claude gives, and pasted into Vercel by the owner.
- **Encryption.**
  - Each friend's data is compressed and encrypted on the phone before upload, with a random data key.
  - That data key is stored twice, each copy locked a different way:
    - **(a)** with a key derived from the friend's password. This is used for normal logins.
    - **(b)** with the server's master key, which lives only in Vercel's environment settings, separate from the database. This is used only for an email reset.
  - The database alone can't unlock anything.
- **The password never leaves the phone as typed.** The phone derives a separate login key from it, and the service stores only a slow hash of that login key.
- **Rate limits.** Login, sign-up and forgot-password attempts are rate-limited per username and per IP. "Forgot password" always answers the same way, whether or not the account exists.
- **Reset link.** It works once, for 30 minutes. It opens a small page on the owner's site (`/reset`, unlisted and noindex, like `/get`), where the friend chooses a new password. That page re-locks their data key with the new password.
- **Privacy wording updates:**
  - the download page's "safe and simple" section;
  - Help → Privacy, FAQ and Terms;
  - the welcome screen's footer.

  They all say a locked copy is kept on the owner's service so friends can move phones, that email is used only for "forgot password", and who could technically read it.
- **Locked copies stay out of the existing backup flow.** The encrypted backup file (`.funbak`) keeps working as it does today.
- **Global rules carry on:** line fields, 44px touch targets, motion only under `motion-safe:` (reduced motion gets a plain fade), money only through the money formatter, and no new dependency in the app bundle beyond what this design names.

## How it behaves

**Welcome screen (A).**
- **Create an account** starts setup at the account step.
- **I have an account** opens Log in.
- **Try with demo money** works as today.
- The old setup step 1, "Before we start" with its "I understand" checkbox, moves here as a line above the choices: "Funancial helps you track and plan your money. It isn't financial advice." Continuing counts as understanding.

**Setup steps**, in the "from below" style:
1. **Create your account:** username, email (labelled "for 'forgot password'"), password with a Show toggle.
   - A small line: "A locked copy of your data is kept so you can move to a new phone."
   - It needs internet. **Skip for now is offered only when offline** (the owner's answer).
   - Offline, the step says so and shows Skip for now. Settings → Account and a one-time reminder on Home offer the account later.
   - Online, there is no skip.
2. **What should we call you?** Name and currency.
3. **What you have now.**
4. **Your salary.**
5. **Any credit cards?**
6. **Lock Funancial:** PIN and fingerprint, as today.
7. **"You're all set, {name}"**, then Home.

Back reverses the motion: the step returns from above.

**Log in (I have an account).**
- Username and password, plus a **Forgot password?** link.
- On success, the locked copy downloads, unlocks on the phone, and replaces the empty new install. If the phone already holds data, the app asks before replacing it.
- Then the app asks for a PIN for this phone.
- This phone becomes the active one: the old phone's uploads are refused, and it shows "Your account moved to another phone".

**Forgot password.**
- The friend types a username or email and gets an email from the owner's Gmail: "tap the link to choose a new password. It works for 30 minutes."
- The link opens `/reset`, where they choose a new password, then log in on the phone as usual.

**Keeping the copy fresh.** On a phone with an account, the app uploads a new locked copy about 30 seconds after changes stop, when it goes to the background, and when it comes back online. A copy only uploads when something has changed.

**Settings → Account**, with sign-up and log-in available for existing installs such as the owner's phone:
- Create account or Log in.
- Change password: old password and new password.
- Turn off and delete my copy: removes everything from the service and stops uploads.
- Shows "Last copy saved {time}".

**Invest pie.**
- The ring is 220.
- Labels sit outside each slice's mid-angle with a leader line. Each label is the logo (18 px circle) plus the percentage.
- Labels that collide are dropped smallest-slice-first, and those holdings appear only in the list.
- The legend rows start with the logo.
- **Logos come through the owner's price service:** `GET /api/logo?symbol=…`, behind the existing token.
  - The service finds the company's website from its profile, then fetches that site's icon.
  - It answers with a small image and caches it for a week.
- **Fallback.** A holding with no website, which covers most ETFs, gets its first letter on a circle in its slice colour.

## Decided by Claude (the owner can overrule)

- **Storage is Upstash Redis**, free tier, added from Vercel's Storage tab. Snapshots are compressed before encryption to stay well inside its limits.
- **Account rules.**
  - Usernames: 3–30 characters of `a–z 0–9 . _ -`, unique regardless of upper or lower case.
  - Passwords: at least 10 characters.
  - The email must look valid, but it is not verified at sign-up. A mistyped email simply means no reset email arrives. The account screen shows the email so it can be corrected.
- **Logging in where data already exists (no data loss in any path).**
  - **The phone already holds data:** the app asks "Replace this phone's data with your account's copy?". Declining cancels the login and changes nothing: no account is linked and nothing uploads.
  - **An email reset leaves the active phone alone.** The active phone keeps its link and keeps uploading, because it already holds the data key. Only the password-locked copy of the key changes, and the new password is needed only for logging in on another phone.
  - **The server keeps a version number with each copy.** An upload names the version it was based on, and the server refuses it when a newer copy exists. A stale phone can never overwrite a newer copy.
  - **An old phone after a takeover keeps working locally with uploads off.** Settings → Account says "Your account moved to another phone" and offers **Log in again**, which warns that it replaces this phone's data with the account's copy, or **Keep using without an account**.
- **Invest keeps today's "five biggest plus Other" slices.**
  - `allocation()` in `src/domain/portfolio.ts` is unchanged.
  - The Other slice's outside label is a grey circle with "+N" (the number of holdings folded in) and its percentage.
  - The legend rows (five plus Other) and the holdings list under the pie both start each holding with its logo, so every holding's logo is visible somewhere.
- **One active phone per account.** Logging in elsewhere takes over, and the old phone is told.
- **The reset page** is a second small entry in the existing `site/` build, unlisted and noindex.
- **ETFs and companies without a website** get letter circles. There is no hand-made logo list.
- **Logo label sizes.** On the pie, a logo is 18 px and the percentage 12 px bold. On a slice too small to fit a label, the label is skipped.

## Left to the builder

- The exact key derivation (a slow, standard, WebCrypto-available method), the encryption mode and the hash parameters. They are chosen for a phone WebView and must hold up to review.
- How the server endpoints are named and shaped.
- The upload's retry and backoff.
- The exact motion curves, within the prototype's feel.
- Test approach. Expected:
  - unit tests of the crypto round-trip and the reset re-lock;
  - API tests with a fake store and a fake mailer: rate limits, same-answer forgot password, one-use 30-minute links, old-phone takeover;
  - e2e of setup with the account step, log in, and forgot password through the reset page;
  - a check that demo data never uploads;
  - a check that the bigger pie's labels never overlap.

## Done means

- A friend creates an account during setup. On a second phone (the emulator) they log in and see the same data.
- They reset the password from the email, log in with the new password, and the data is intact.
- The owner's phone can create an account from Settings.
- The welcome screen and setup match the approved prototypes on the phone, including reduced motion.
- The Invest pie is 220 with logos outside the ring and in the list, with no overlapping labels.
- The privacy wording everywhere matches what now happens.
- After this, M8's Task 5 rebuilds and publishes the release.
