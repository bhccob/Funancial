# Funancial on an Android phone

This puts the app on your own phone over a USB cable, and lets the phone reload as you edit. It is a
debug build for personal use. Signed release builds come later.

You need: a Windows computer with Node 24, an Android phone, and a USB cable that carries data.

## 1. Set up the computer (once)

1. Install [Android Studio](https://developer.android.com/studio) and open it once, so it downloads
   the Android SDK.
2. Get Java 21. The build needs exactly Java 21: the Capacitor plugins ask for a Java 21 toolchain,
   and the Java that comes inside Android Studio (Java 25 in current versions) is too new for them.
   In Android Studio, open this project's `android` folder (or run `npm run android:open`). Then go
   to File → Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK, choose
   Download JDK…, and pick Version 21, Vendor Eclipse Temurin. It installs to
   `%USERPROFILE%\.jdks\temurin-21…` (the folder name ends in the exact version, for example
   `temurin-21.0.12.1`), and Android Studio builds with it from then on.
3. Tell the command-line tools where Java 21 and the SDK are, so `npm run android:run` and
   `npm run android:dev` work too. In PowerShell, using your folder name from step 2:

   ```powershell
   setx JAVA_HOME "$env:USERPROFILE\.jdks\temurin-21.0.12.1"
   setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
   ```

   (That is `JAVA_HOME` = `%USERPROFILE%\.jdks\temurin-21…` and `ANDROID_HOME` =
   `%LOCALAPPDATA%\Android\Sdk`. You can also set them in "Edit environment variables for your
   account".) Do not point `JAVA_HOME` at Android Studio's own `jbr` folder: that is Java 25, and the
   build stops with "Unsupported class file major version 69". Open a new terminal afterwards, so it
   sees them. `& "$env:JAVA_HOME\bin\java" -version` should then say 21.

The app builds with Android API 36 and runs on Android 7 (API 24) and newer. The first build
installs Android API 36 by itself if it is missing. If it says it cannot, install "Android API 36" in
Android Studio's SDK Manager.

## 2. Connect the phone (once per phone)

1. On the phone, open Settings, then About phone, and tap Build number 7 times. That turns on
   Developer options.
2. Open Settings, then Developer options, and turn on USB debugging.
3. Plug the phone into the computer. When the phone asks "Allow USB debugging?" (it shows the
   computer's RSA key), tap Allow.
4. Check the computer sees it. In PowerShell:

   ```powershell
   & "$env:ANDROID_HOME\platform-tools\adb" devices
   ```

   (Or add that `platform-tools` folder to your Path and type `adb devices`.) Your phone should be
   listed as `device`. If it says `unauthorized`, unlock the phone and accept the prompt. If the
   list is empty, try another cable or USB port.

## 3. Install the app

```powershell
npm run android:run
```

This builds the web app, copies it into the Android project, installs the app on the phone with the
project's Gradle wrapper, and starts it. The first run is slow, because Gradle downloads what it
needs. Run it again whenever you want the phone to have your latest changes. If it stops with
"JAVA_HOME is not set", go back to step 3 of "Set up the computer".

It installs on the one device that is connected and ready. If there is more than one (an emulator
from Android Studio is running too, say), it lists them and stops. Then set `ANDROID_SERIAL` to the
one to use, as `adb devices` names it, and run it again. In PowerShell:

```powershell
$env:ANDROID_SERIAL = "R58M12ABCDE"
npm run android:run
```

The setting lasts until you close that terminal.

Related scripts:

- `npm run android:sync` builds the web app and copies it into the Android project, without
  installing.
- `npm run android:open` opens the Android project in Android Studio.

## 4. Live reload while you work

Use two terminals:

1. `npm run dev` (keep it running).
2. `npm run android:dev`.

The second command links the phone's `localhost:5173` to your computer's (`adb reverse`), then
builds, installs and starts an app that loads its pages from the dev server at
`http://localhost:5173`. Edits show on the phone as soon as you save. Over `adb reverse`,
`http://localhost` counts as a secure address, so encryption works with no HTTPS certificate. It
picks the phone the same way `npm run android:run` does, `ANDROID_SERIAL` included.

**Before you use the app away from the computer, run `npm run android:run` again.** Until you do,
the installed app still points at the dev server, and shows an error when the computer is not
there.

If live reload shows a blank page, check that `npm run dev` says it is on port 5173. Another program
using that port makes Vite pick a different one.

## 5. Move your data from the browser

1. On the computer, in the browser version, open Settings and choose Create encrypted backup. Pick a
   passphrase you will remember, and save the `.funbak` file.
2. Send the file to the phone, for example through Google Drive or Files.
3. If the app on the phone is new, open it, tap Start with my real data, and finish the setup.
   Settings, where the restore is, only opens after that. The restore replaces your setup answers,
   so quick ones will do. The lock you choose here is the one the phone keeps.
4. On the phone, open More, then Settings. Under Restore from backup, tap Backup file and pick the
   `.funbak` file (the phone lists every file, so pick the right one), then type its passphrase and
   tap Restore. The app asks you to confirm, because this replaces all data on the phone. Tap
   Restore again.

## Good to know

- **Backups.** Android's own cloud backup is turned off for the app on purpose: a restored database
  could not be decrypted on another phone. The encrypted backup file is how you back up.
- **Seeing the app's console.** Capacitor's native logging is off, because it would log sensitive
  plugin results. To see the console, connect the phone, open `chrome://inspect` in Chrome on the
  computer, and choose Inspect under Funancial.
