# Releasing Funancial to friends

A release is a signed Android APK plus a small `latest.json` that tells installed apps a newer
version exists. `npm run release:android` builds both on this computer. Nothing goes online until
you deploy (step 5), and deploying always waits for the owner's OK.

You need the computer set up for Android builds first (Java 21 and `JAVA_HOME`, see
[docs/android.md](android.md)).

## 1. Create the release key (once, by the owner)

Claude never handles the password. You create the key and choose its password yourself. In
PowerShell, with your Windows user name in place of `<you>`:

```powershell
keytool -genkeypair -v -keystore C:\Users\<you>\funancial-release.jks -alias funancial -keyalg RSA -keysize 4096 -validity 36500
```

`keytool` comes with Java 21 (`%JAVA_HOME%\bin\keytool`). It asks for a password and for some
details about you; type a long password and keep it in your password manager.

Then create `android\keystore.properties` with these four lines (the file is git-ignored):

```properties
storeFile=C:/Users/<you>/funancial-release.jks
storePassword=<the password you typed>
keyAlias=funancial
keyPassword=<the password you typed>
```

- Write `storeFile` with forward slashes. In a `.properties` file a backslash is an escape, so
  `C:\Users\...` is read wrongly.
- `keyPassword` is the same password as `storePassword`.
- The `.jks` file lives outside the repo, and `*.jks`, `*.keystore` and `keystore.properties` are
  git-ignored in any case.

## 2. Back up the key (the same day)

Copy `funancial-release.jks` somewhere off this computer (a USB stick, a cloud drive you trust), and
keep the password in your password manager.

**Why:** Android installs an update over an app only when it is signed with the same key as the
installed one. If the key file or its password is lost, there is no way to sign an update that
installs over the old app. Friends would have to uninstall Funancial and install the new one, which
wipes their data (a Funancial backup file restores it). Nobody, including Claude, can recover a lost
key.

## 3. Raise the version

In `android/app/build.gradle`, raise `versionCode` (a whole number, higher than the last release)
and set `versionName` (the number friends see, for example `"0.9"`):

```groovy
versionCode 9
versionName "0.9"
```

Android refuses an install whose `versionCode` is lower than the installed one, and the release script
refuses a `versionCode` that is not higher than the one in the published `latest.json`.

## 4. Build the release

```powershell
npm run release:android -- --notes "What is new, in a sentence or two."
```

The notes are shown to friends in the update banner (1 to 500 characters). The script:

1. checks that `android\keystore.properties` exists (if not, it prints the `keytool` command and the
   four lines above, and stops);
2. reads the version from `android/app/build.gradle`;
3. stops if the published `latest.json` already has this `versionCode` or a higher one;
4. runs `npm run build` as a release build (it still reads `.env.local`, so the app has its price
   service key), then `npx cap sync android`, then Gradle `assembleRelease`;
5. copies the APK to `site/public/get/funancial-<versionName>.apk`;
6. writes `site/public/get/latest.json` with the APK's address, SHA-256 and size.

`--channel test` does the same into `site/public/get/test/` and bakes the test address
(`https://funancial.vercel.app/get/test/latest.json`) into the app. It is for trying an update on an
emulator before the real release.

The update address is permanent: every release app checks
`https://funancial.vercel.app/get/latest.json`, so never rename or delete the Vercel project.

## 5. Deploy (only after the owner's OK)

```powershell
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

The APK and `latest.json` are git-ignored local files that a build on Vercel would not see, so the site is built
here and uploaded as it is. Older `funancial-*.apk` files stay in `site/public/get` and are uploaded
again each time; delete the ones nobody needs before you build.

## Your own phone

Your own phone stays on `npm run android:run` debug builds. A debug build is signed with a different
key, so installing a release over it (or the other way round) fails, and uninstalling to get past
that wipes the app's data. Release builds are for friends; a debug build never checks for updates.

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
