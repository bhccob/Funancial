# Releasing Funcial to friends

A release is a signed Android APK plus a small `latest.json` that tells installed apps a newer
version exists. `npm run release:android` builds both on this computer. Nothing goes online until
you deploy (step 5), and deploying always waits for the owner's OK.

You need the computer set up for Android builds first (Java 21 and `JAVA_HOME`, see
[docs/android.md](android.md)).

## 1. Create the release key (once, by the owner)

Claude never handles the password. You create the key and choose its password yourself. In
PowerShell:

```powershell
& "$env:JAVA_HOME\bin\keytool" -genkeypair -v -keystore "$env:USERPROFILE\funancial-release.jks" -alias funancial -keyalg RSA -keysize 4096 -validity 36500
```

`JAVA_HOME` is the Java 21 JDK you set up in [docs/android.md](android.md); `keytool` is in its `bin`
folder. It asks for a password and for some details about you; type a long password and keep it in
your password manager. The key file lands in your user folder
(`C:\Users\<you>\funancial-release.jks`), outside the repo.

Then create `android\keystore.properties` with these four lines (the file is git-ignored). Save it
with Notepad as UTF-8, not with PowerShell's `>` or `Out-File`, which can write a format Gradle
cannot read:

```properties
storeFile=C:/Users/<you>/funancial-release.jks
storePassword=<the password you typed>
keyAlias=funancial
keyPassword=<the password you typed>
```

- Write `storeFile` with forward slashes. In a `.properties` file a backslash is an escape, so
  `C:\Users\...` is read wrongly.
- If the password contains a backslash, write each `\` as `\\` in this file, or pick a password
  without one.
- `keyPassword` is the same password as `storePassword`.
- If this file is missing or wrong, only release builds fail, with a message that names it. Your own
  debug builds (`npm run android:run`) never fail because of it.
- `*.jks`, `*.keystore` and `keystore.properties` are git-ignored in any case.

## 2. Back up the key (the same day)

Copy `funancial-release.jks` somewhere off this computer (a USB stick, a cloud drive you trust), and
keep the password in your password manager.

**Why:** Android installs an update over an app only when it is signed with the same key as the
installed one. If the key file or its password is lost, there is no way to sign an update that
installs over the old app. Friends would have to uninstall Funcial and install the new one, which
wipes their data (a Funcial backup file restores it). Nobody, including Claude, can recover a lost
key.

## 3. Raise the version

In `android/app/build.gradle`, raise `versionCode` (a whole number, higher than the last release)
and set `versionName` (the number friends see, for example `"0.9"`):

```groovy
versionCode 9
versionName "0.9"
```

Android refuses an install whose `versionCode` is lower than the installed one. The release script
refuses a `versionCode` that is not higher than the published one, and a `versionName` that is the
same, because friends would be told "Version 0.8 is ready" while already on 0.8.

"Published" here means the `site/public/get/latest.json` on this computer (`site/public/get/test/` for
the test channel), not the live site:

- To rebuild a version you built but never deployed, delete that `latest.json` or raise the version.
- On a new computer that file is not there, so the guard cannot see what friends have. Fetch it from
  the live site first:

  ```powershell
  New-Item -ItemType Directory -Force site\public\get
  curl.exe --fail -o site\public\get\latest.json https://funcial.vercel.app/get/latest.json
  ```

  (There is nothing to fetch before the first release.)

  Don't deploy from that computer until you've made a release on it: its `latest.json` would name an
  APK that isn't there, and a new friend's Download would fail.

## 4. Build the release

```powershell
npm run release:android -- --notes "What is new, in a sentence or two."
```

The notes are shown to friends in the update banner (1 to 500 characters). The script:

1. checks that `android\keystore.properties` exists (if not, it prints the `keytool` command and the
   four lines above, and stops);
2. reads the version from `android/app/build.gradle`;
3. stops if the published `latest.json` already has this `versionCode` or a higher one, or this
   `versionName`;
4. runs `npm run build` as a release build (it still reads `.env.local`, so the app has its price
   service key), then `npx cap sync android`, then Gradle `assembleRelease` (after deleting the last
   `app-release.apk`, so an old one can never be mistaken for the new one);
5. copies the APK to `site/public/get/funcial-<versionName>.apk`;
6. writes `site/public/get/latest.json` with the APK's address, SHA-256 and size;
7. runs a plain `npm run build` and `npx cap sync android` again, without the release settings (see
   "Your own phone").

`--channel test` does the same into `site/public/get/test/` and bakes the test address
(`https://funcial.vercel.app/get/test/latest.json`) into the app. It is for trying an update on an
emulator before the real release. When the test is over, delete the `site/public/get/test/` folder,
so it does not ship with the live deploys.

The update address is permanent: every release app checks
`https://funcial.vercel.app/get/latest.json`, so never remove that address from the Vercel project.
The Vercel project is still called `funancial`, and so is its own address,
`https://funancial.vercel.app`; `funcial.vercel.app` is a second domain on the same project (add it
under the project's Settings, Domains). Never rename or delete the project: both addresses live on
it. The release key's file name and alias (`funancial-release.jks`, `funancial`) are internal labels
and keep their names too.

The QR code on the download page (`site/get/qr.svg`) is an image of `https://funcial.vercel.app/get`, so if the address changes it must be regenerated (`npx qrcode@1.5.4 -t svg -e M -q 2 -d "#0d0d0f" -l "#ffffff" -o site/get/qr.svg "<address>/get"`); `tests/unit/qrCode.test.ts` reads the address back out of the file and fails when it is stale.

## 5. Deploy (only after the owner's OK)

```powershell
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

The APK and `latest.json` are git-ignored local files that a build on Vercel would not see, so the
site is built here and uploaded as it is. Older `funcial-*.apk` files (and any `funancial-*.apk`
from before the rename) stay in `site/public/get` and are uploaded again each time; delete the ones
nobody needs before you build.

> **Keep the Vercel project unconnected from GitHub.** The APK and `latest.json` are git-ignored, so a
> build that Git triggers on Vercel would not have them, and the live download page would lose its
> file and its update notice. The project is not connected today: every deploy so far came from the
> command line, as above. Do not add a Git integration to it.

## Your own phone

Your own phone stays on `npm run android:run` debug builds. A debug build is signed with a different
key, so installing a release over it (or the other way round) fails, and uninstalling to get past
that wipes the app's data. Release builds are for friends; a debug build never checks for updates.

The release build puts the update check into `dist/` and the Android project's assets. So the
release script finishes by building the web app again without it and copying that into the Android
project, and an install from Android Studio on your phone is then a plain build too. If that last
step fails, run `npm run android:sync` before installing on your phone.

## Before 2027: Google's developer verification

Since 30 September 2026, certified Android phones in Brazil, Indonesia, Singapore and Thailand only
install apps from developers registered with Google. The Netherlands and Aruba, where the friends
live, are not in that first wave, so the usual "allow installs from this browser" flow works today.
Google plans to extend this to every country in 2027. After that, an unregistered app needs Android's
"advanced" install flow, which has a 24-hour wait.

Before 2027, either register as a developer (there is a limited-distribution route) or have the page
explain the advanced flow. Sources: the
[Android Developers Blog, June 2026](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)
and [Android developer verification](https://developer.android.com/developer-verification).
