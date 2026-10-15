// Live reload on a USB-connected Android phone: `npm run android:dev`.
//
// Keep `npm run dev` running in another terminal. This script points the phone's localhost:5173 at
// the computer's (adb reverse), then builds, installs and starts the app with the Vite dev server
// as its page. Over adb reverse, http://localhost is a secure context, so WebCrypto works without
// a certificate. See docs/android.md.
import { spawnSync } from 'node:child_process';
import { fail, installAndLaunch, requireAdb, requireDevice, requireJava } from './android.mjs';

const PORT = 5173;
const DEV_URL = `http://localhost:${PORT}`;

requireJava();
const adb = requireAdb();
const serial = requireDevice(adb);

const reverse = spawnSync(adb, ['-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`], {
  stdio: 'inherit',
});
if (reverse.status !== 0) {
  fail(
    'adb reverse failed. Is the phone plugged in with USB debugging on? Check `adb devices` (see docs/android.md).',
    reverse.status ?? 1,
  );
}

// The copied capacitor.config.json carries the dev server's address. One constant command string,
// so the shell (needed to run npm on Windows) gets no arguments.
const sync = spawnSync('npm run android:sync', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FUNANCIAL_DEV_URL: DEV_URL },
});
if (sync.status !== 0) fail('The build failed. See the output above.', sync.status ?? 1);

installAndLaunch(adb, serial);
console.log(
  'Live reload is on. Keep `npm run dev` running. Run `npm run android:run` before using the app away from this computer.',
);
