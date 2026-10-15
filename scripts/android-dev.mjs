// Live reload on a USB-connected Android phone: `npm run android:dev`.
//
// Keep `npm run dev` running in another terminal. This script points the phone's localhost:5173 at
// the computer's (adb reverse), then installs and launches the app with the Vite dev server as its
// page. Over adb reverse, http://localhost is a secure context, so WebCrypto works without a
// certificate. See docs/android.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 5173;
const DEV_URL = `http://localhost:${PORT}`;
const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';

function findAdb() {
  const { ANDROID_HOME, LOCALAPPDATA } = process.env;
  const candidates = [
    ANDROID_HOME && join(ANDROID_HOME, 'platform-tools', adbName),
    LOCALAPPDATA && join(LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ];
  return candidates.find((path) => path && existsSync(path));
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

const adb = findAdb();
if (!adb) fail('adb not found — install Android Studio (see docs/android.md)');

const reverse = spawnSync(adb, ['reverse', `tcp:${PORT}`, `tcp:${PORT}`], { stdio: 'inherit' });
if (reverse.status !== 0) {
  fail(
    'adb reverse failed. Is the phone plugged in with USB debugging on? Check `adb devices` (see docs/android.md).',
    reverse.status ?? 1,
  );
}

// One constant command string, so the shell (needed to run npx on Windows) gets no arguments.
const run = spawnSync('npx cap run android', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FUNANCIAL_DEV_URL: DEV_URL },
});
if (run.status === 0) {
  console.log(
    'Live reload is on. Keep `npm run dev` running. Run `npm run android:run` before using the app away from this computer.',
  );
}
process.exit(run.status ?? 1);
