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
`KV_REST_API_URL` and `KV_REST_API_TOKEN` appear under Settings → Environment Variables). **Don't add
anything by hand for the database.** Vercel's screens change now and then, so if a button is named a
little differently, pick the closest one.

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
6. In Vercel, open the **funancial** project, then **Settings**, then **Environment Variables**.
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
5. In Vercel, open the **funancial** project, then **Settings**, then **Environment Variables**.
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
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | The database's address and password. Vercel adds them. | The locked copies and the account records. | Someone could read or delete the locked copies. They are still locked, so they can't open them without the key. Rotate it in Upstash. |
| `SERVER_MASTER_KEY` | The master key you made in step 3. | Lets the service unlock a copy for "forgot password". With it and a stolen database, someone could open every copy. | **Lost:** email resets can't restore old data. **Leaked:** tell Claude. Replacing it has a cost (see step 3), so don't do it on your own. |
| `GMAIL_USER` | The Gmail address that sends the emails. | Not a secret by itself. It's the "from" address. | Nothing to protect. |
| `GMAIL_APP_PASSWORD` | A Google app password for that address. | Lets the service send "forgot password" emails from your Gmail. | Someone could send email as that Gmail. Delete the app password in your Google account and make a new one. |
| `FUNANCIAL_ACCESS_TOKEN`, `FUNANCIAL_APP_ORIGIN` | Already set from earlier. | They keep strangers' requests out. | **Leave them alone.** |

Claude only ever checks that the names are listed (`npx vercel env ls` prints names, not values). It
never pulls, prints or asks for the values.

Before you tell Claude, check in Vercel → Settings → Environment Variables that you can see
`SERVER_MASTER_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and the two `KV_REST_API_` names, and that
the master key is in your password manager.

Then tell Claude it's done.
