# Funancial on an Android phone

This puts the app on your own phone over a USB cable, and lets the phone reload as you edit. It is a
debug build for personal use. Signed release builds come later.

You need: a Windows computer with Node 24, an Android phone, and a USB cable that carries data.

## 1. Set up the computer (once)

1. Install [Android Studio](https://developer.android.com/studio) and open it once, so it downloads
   the Android SDK. Android Studio bundles JDK 21, so you do not need to install Java yourself.
2. Tell your tools where they are. In PowerShell:

   ```powershell
   setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"
   setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
   ```

   (That is `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr` and `ANDROID_HOME` =
   `%LOCALAPPDATA%\Android\Sdk`. You can also set them in "Edit environment variables for your
   account".) Open a new terminal afterwards, so it sees them.

The app builds with Android API 36 and runs on Android 7 (API 24) and newer. If the first build says
a platform is missing, install "Android API 36" in Android Studio's SDK Manager.

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

This builds the web app, copies it into the Android project, and installs and starts the app on the
phone. The first run is slow, because Gradle downloads what it needs. Run it again whenever you want
the phone to have your latest changes.

Related scripts:

- `npm run android:sync` builds the web app and copies it into the Android project, without
  installing.
- `npm run android:open` opens the Android project in Android Studio.

## 4. Live reload while you work

Use two terminals:

1. `npm run dev` (keep it running).
2. `npm run android:dev`.

The second command links the phone's `localhost:5173` to your computer's (`adb reverse`), then
installs an app that loads its pages from the dev server at `http://localhost:5173`. Edits show on
the phone as soon as you save. Over `adb reverse`, `http://localhost` counts as a secure address, so
encryption works with no HTTPS certificate.

**Before you use the app away from the computer, run `npm run android:run` again.** Until you do,
the installed app still points at the dev server, and shows an error when the computer is not
there.

If live reload shows a blank page, check that `npm run dev` says it is on port 5173. Another program
using that port makes Vite pick a different one.

## 5. Move your data from the browser

1. On the computer, in the browser version, open Settings and choose Create encrypted backup. Pick a
   passphrase you will remember, and save the `.funbak` file.
2. Send the file to the phone, for example through Google Drive or Files.
3. On the phone, open Settings, pick the backup file under Restore from backup, type its passphrase,
   and tap Restore. This replaces what is on the phone.

## Good to know

- **Backups.** Android's own cloud backup is turned off for the app on purpose: a restored database
  could not be decrypted on another phone. The encrypted backup file is how you back up.
- **Seeing the app's console.** Capacitor's native logging is off, because it would log sensitive
  plugin results. To see the console, connect the phone, open `chrome://inspect` in Chrome on the
  computer, and choose Inspect under Funancial.
