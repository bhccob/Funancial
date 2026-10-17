# Setting up accounts (for the owner)

Accounts let a friend move to a new phone and keep everything. Their data is kept as a locked copy
on the Funancial service, which is the `funancial` project on your Vercel. For that to work the
service needs three things from you: a database, a Gmail address that sends "forgot password" emails,
and a master key. This page walks you through them, click by click.

You type every secret yourself, straight into Vercel. **Claude never needs to see any of them.**
Don't paste one into the chat, into a file in this project, or into a commit.

You need: your Vercel account, a Gmail account, and your password manager.

Accepting Upstash's terms (step 1) and Google's (step 2) is your click. Claude can't do it for you.

## 1. Add the database (Upstash Redis)

1. Open [vercel.com](https://vercel.com) and sign in.
2. Open the **funancial** project, then click the **Storage** tab.
3. Click **Create Database** (or **Browse Marketplace**), choose **Upstash**, then **Upstash for
   Redis**, and click **Continue**.
4. Pick the **Free** plan, choose the region closest to you, and give it any name (for example
   `funancial-accounts`).
5. Read Upstash's terms and, if you agree, accept them and click **Create**.
6. When it asks which project to connect to, pick **funancial** and keep **Production** ticked.

That is all. Vercel adds the database's address and password to the project by itself (you will see
`KV_REST_API_URL` and `KV_REST_API_TOKEN` appear under Environment Variables, in the project's left sidebar). **Don't add
anything by hand for the database.** Vercel's screens change now and then, so if a button is named a
little differently, pick the closest one. If the variables Vercel added aren't named
`KV_REST_API_URL` and `KV_REST_API_TOKEN` (for example, a prefix was added), tell Claude. Keep those
two to yourself like the master key: a leak of the database password is serious too (step 5).

## 2. Set up the Gmail that sends "forgot password" emails

This is only for the "forgot password" emails. If you skip it, everything else about accounts still
works; only "forgot password" is unavailable.

A Gmail app password lets the service send mail as that address, so use a Gmail you are happy to
dedicate to this (a fresh one is ideal).

1. Open [myaccount.google.com](https://myaccount.google.com) signed in to that Gmail.
2. Click **Security**, then under "How you sign in to Google" click **2-Step Verification** and turn
   it on. Google asks for your phone to confirm. (Google only offers app passwords once 2-Step
   Verification is on.)
3. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). (Or search
   "App passwords" in the box at the top of your Google account page.)
4. Type a name, for example `Funancial`, and click **Create**.
5. Google shows a password of 16 letters, in four groups. **It is shown once.** Copy it, and save it
   in your password manager right away.
6. In Vercel, open the **funancial** project, then click **Environment Variables** in the left sidebar.
7. Add two variables, one at a time. For each: type the **Key**, paste the **Value**, make sure
   **Production** is ticked, and click **Save**.
   - Key `GMAIL_USER`, value: the Gmail address, for example `someone@gmail.com`.
   - Key `GMAIL_APP_PASSWORD`, value: the 16 letters **without the spaces**. If you see a
     **Sensitive** switch, turn it on.

If you ever want to switch it off, delete the app password in your Google account. Only "forgot
password" stops working.

## 3. Make the master key

The master key is what lets the service unlock a copy when someone uses "forgot password". You make
it on this computer. Nobody else ever sees it.

1. Open the Start menu, type `PowerShell`, and press Enter.
2. Type this one line and press Enter:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

3. It prints one line of 44 letters, numbers and symbols, ending in `=`. Select that line with the
   mouse and press Ctrl+C to copy it.
4. **First**, save it in your password manager, named for example `Funancial SERVER_MASTER_KEY`. Do
   this before anything else.
5. In Vercel, open the **funancial** project, then click **Environment Variables** in the left sidebar.
6. Click to add one. Key `SERVER_MASTER_KEY`, value: paste the line. Make sure **Production** is
   ticked. If you see a **Sensitive** switch, turn it on. Click **Save**.
7. Close PowerShell. (If you ran the command again by mistake, use only the line you saved in step 4.)

**Set it once and never change it.** If the master key is lost or replaced, "forgot password"
stops working for every account made before, so their data can't be restored by email. That is why
the password manager copy matters.

## 4. Redeploy

Vercel gives new secrets only to deploys made after you add them, so the service has to be deployed
again. **You don't run anything.** Once you tell Claude steps 1 to 3 are done and say it's OK to
deploy, Claude builds and deploys the service, then checks it live: that a bad sign-up is turned
away, and that the reset page shows its "expired" message for a made-up link.

## 5. What each secret protects

| Name | What it is | What it protects | If it's lost or leaks |
| --- | --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | The database's address and password. Vercel adds them. | The locked copies and the account records. | **Serious.** Someone with it could read every copy, but the copies stay locked: they can't unlock one without the master key. They could still delete the copies, or block them. Tell Claude at once: the token has to be replaced in Upstash and in Vercel. |
| `SERVER_MASTER_KEY` | The master key you made in step 3. | Lets the service unlock a copy for "forgot password". With it and a stolen database, someone could open every copy. | **Lost:** email resets can't restore old data. **Leaked:** tell Claude. Replacing it has a cost (see step 3), so don't do it on your own. |
| `GMAIL_USER` | The Gmail address that sends the emails. | Not a secret by itself. It's the "from" address. | Nothing to protect. |
| `GMAIL_APP_PASSWORD` | A Google app password for that address. | Lets the service send "forgot password" emails from your Gmail. | Someone could send email as that Gmail. Delete the app password in your Google account and make a new one. |
| `FUNANCIAL_ACCESS_TOKEN` | Already set from earlier. | It keeps strangers' requests out. | **Leave them alone.** |

Claude only ever checks that the names are listed (`npx vercel env ls` prints names, not values). It
never pulls, prints or asks for the values.

## If a friend asks you to remove their copy

Not part of setup: skip this until someone asks. Removing a copy is permanent, so be sure the
request really comes from the friend.

**The easy way: they do it themselves.** On the phone, they open Settings, then Account, and tap
**Turn off and delete my copy**. That removes their account and its locked copy from the service. If
the phone is lost, they can log in on another one first (with **Forgot password?** if they have
forgotten the password) and do the same there.

**By hand, when they can't.** You delete a few entries in Upstash. Each is named after the friend's
username in lower case (usernames are letters, numbers, dots, dashes and underscores, so lower case
is the only change). Below, `<username>` stands for it.

1. In Vercel, open the **funancial** project, then **Storage**, click the database, and click **Open
   in Upstash**. In Upstash, open the database and click the **Data Browser** tab. (Labels may differ
   a little.)
2. Search for `acct:u:<username>` and open that entry. It is the account record, written as text.
   Don't copy it anywhere: it holds the account's locked keys. Write down only two values from it:
   `email` and `deviceTokenHash` (64 letters and numbers). If there is no such entry, the account
   is already gone. A search also lists longer names that start the same (`sam` shows `samuel`), so
   check the name matches exactly before you delete anything.
3. Delete `acct:u:<username>` first. From then on the service turns their phone away, so nothing can
   be saved back after you delete the copy.
4. Delete `acct:c:<username>`. This is the locked copy. (There is none if they never saved one.)
5. Delete `acct:t:<deviceTokenHash>`, using the value you wrote down. It is their phone's pass.
6. Open `acct:e:<email>`, using the email you wrote down. It lists the usernames that use that email.
   Remove `<username>` from it. If it was the only one, the entry disappears.
7. Search for `acct:*<username>*` to check steps 3 and 4 worked. It should show only `acct:cl:`
   entries, which vanish within a minute. It can't see `acct:t:`, `acct:e:` or `acct:r:`, because
   those are named after a hash, the email or a reset code, not the username. It also matches other
   people's names that contain the text (a search for `sam` finds `samuel`): leave those alone.

**If you skip one, the service still works, but two leftovers stay the friend's personal data.**
This is what each leftover does:

- `acct:t:<deviceTokenHash>`: it points at a username with no account, so the service answers as if
  their phone had moved, and reads nothing. Harmless clutter.
- The username in `acct:e:<email>`: "forgot password" skips a name with no account. If someone later
  makes an account with that username and another email, it is skipped for that email too. But the
  entry's name is the friend's email address, so it keeps their email address in the database. That
  is personal data, not just clutter, so don't skip step 6.
- `acct:c:<username>`: no one can reach it, since it is only handed out to a log-in on the account,
  and a new account with the same username ignores it. But it is still the friend's data, so delete
  it.
- Reset links, saves in flight and counters (`acct:r:`, `acct:ru:`, `acct:cl:`, `rl:`) clear
  themselves within a day, mostly within minutes. A reset link emailed in the last 30 minutes stops
  working as soon as the account is gone.

## When you're done

Before you tell Claude, check in Vercel → Environment Variables (left sidebar) that you can see
`SERVER_MASTER_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and the two `KV_REST_API_` names, and that
the master key is in your password manager.

Then tell Claude it's done.
