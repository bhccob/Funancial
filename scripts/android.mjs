// What `npm run android:run` and `npm run android:dev` share: find the phone, install the debug
// build on it with the Gradle wrapper, and start the app. See docs/android.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ACTIVITY = 'io.github.bhccob.funancial/.MainActivity';
const ANDROID_DIR = fileURLToPath(new URL('../android', import.meta.url));
const GUIDE = 'see docs/android.md';

/** Prints `message` and stops. */
export function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

/**
 * Every device `adb devices` lists, with its state: `device` when ready, else `unauthorized`,
 * `offline` and so on. Lines from adb starting its server are skipped.
 * @param {string} output
 * @returns {{ serial: string, state: string }[]}
 */
export function parseAdbDevices(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = /^(\S+)\t(\S+)$/.exec(line.trim());
    return match ? [{ serial: match[1], state: match[2] }] : [];
  });
}

/** @param {{ serial: string, state: string }[]} devices */
const listed = (devices) => devices.map((d) => `  ${d.serial}  ${d.state}`).join('\n');

/**
 * The device to install on: the one `ANDROID_SERIAL` names, else the one device that is ready.
 * @param {{ serial: string, state: string }[]} devices
 * @param {string | undefined} wanted `ANDROID_SERIAL`
 * @returns {{ serial: string } | { error: string }}
 */
export function chooseDevice(devices, wanted) {
  if (wanted) {
    const device = devices.find((d) => d.serial === wanted);
    if (device?.state === 'device') return { serial: wanted };
    const state = device ? `is ${device.state}` : 'is not connected';
    return {
      error: `ANDROID_SERIAL names ${wanted}, which ${state}. adb lists:\n${listed(devices)}`,
    };
  }
  const ready = devices.filter((d) => d.state === 'device');
  if (ready.length === 1) return { serial: ready[0].serial };
  if (ready.length > 1) {
    return {
      error: `More than one device is connected. Set ANDROID_SERIAL to the one to use (${GUIDE}):\n${listed(ready)}`,
    };
  }
  if (devices.length === 0) {
    return {
      error: `No phone found. Plug it in with USB debugging on, then check \`adb devices\` (${GUIDE}).`,
    };
  }
  return {
    error: `No phone is ready:\n${listed(devices)}\nUnlock the phone and tap Allow on "Allow USB debugging?" (${GUIDE}).`,
  };
}

/**
 * How to run the Gradle wrapper on `platform`, from the android folder. Node will not start a
 * .bat file by itself, so cmd does. The path is spelled out: with NoDefaultCurrentDirectoryInExePath
 * set, as some shells set it, cmd looks for a bare `gradlew.bat` on the Path only.
 * @param {NodeJS.Platform} platform
 */
export function gradleCommand(platform) {
  return platform === 'win32'
    ? { command: 'cmd', args: ['/c', '.\\gradlew.bat'] }
    : { command: './gradlew', args: [] };
}

/**
 * What is wrong with the Java setup for the build, or null.
 * @param {Record<string, string | undefined>} env
 */
export function javaProblem(env) {
  return env.JAVA_HOME
    ? null
    : `JAVA_HOME is not set. The build needs Java 21: set JAVA_HOME as "Set up the computer" in docs/android.md says, then open a new terminal.`;
}

/** Stops with a plain message unless Java is set up for the build. */
export function requireJava() {
  const problem = javaProblem(process.env);
  if (problem) fail(problem);
}

/** The path to adb, or stops. */
export function requireAdb() {
  const name = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const { ANDROID_HOME, LOCALAPPDATA } = process.env;
  const adb = [
    ANDROID_HOME && join(ANDROID_HOME, 'platform-tools', name),
    LOCALAPPDATA && join(LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ].find((path) => path && existsSync(path));
  if (!adb) fail(`adb not found. Install Android Studio and set ANDROID_HOME (${GUIDE}).`);
  return adb;
}

/** The serial of the device to install on, or stops with what to do. */
export function requireDevice(adb) {
  const list = spawnSync(adb, ['devices'], { encoding: 'utf8' });
  if (list.status !== 0) fail(`\`adb devices\` failed (${GUIDE}).\n${list.stderr ?? ''}`);
  const choice = chooseDevice(parseAdbDevices(list.stdout), process.env.ANDROID_SERIAL);
  if ('error' in choice) fail(choice.error);
  return choice.serial;
}

/** Installs the debug build on `serial` and starts the app, or stops. */
export function installAndLaunch(adb, serial) {
  const gradle = gradleCommand(process.platform);
  // The Android Gradle plugin installs only on the device ANDROID_SERIAL names.
  const install = spawnSync(gradle.command, [...gradle.args, 'installDebug'], {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    env: { ...process.env, ANDROID_SERIAL: serial },
  });
  if (install.status !== 0) {
    fail(
      `The install failed${install.error ? `: ${install.error.message}` : ''}.`,
      install.status ?? 1,
    );
  }
  const start = spawnSync(adb, ['-s', serial, 'shell', 'am', 'start', '-n', APP_ACTIVITY], {
    stdio: 'inherit',
  });
  if (start.status !== 0) {
    fail('The app is installed but did not start. Open Funcial on the phone.', start.status ?? 1);
  }
}
