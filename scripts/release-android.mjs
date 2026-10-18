// `npm run release:android -- --notes "<text>" [--channel test]`: builds the signed release APK
// and writes the latest.json the installed apps check for updates. Nothing is deployed. See
// docs/release.md.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { fail, gradleCommand, requireJava } from './android.mjs';

/** The permanent address the page and every release APK's update check live at. */
const ORIGIN = 'https://funcial.vercel.app';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ANDROID_DIR = join(ROOT, 'android');

/** What the owner is told when `android/keystore.properties` is missing: no password in it. */
export const KEYSTORE_HELP = `android/keystore.properties is missing, so there is no release key to sign with.
Create the key once, outside the repo. In PowerShell (JAVA_HOME is the Java 21 from docs/android.md),
keytool asks you for a password, so type one there:

  & "$env:JAVA_HOME\\bin\\keytool" -genkeypair -v -keystore "$env:USERPROFILE\\funancial-release.jks" -alias funancial -keyalg RSA -keysize 4096 -validity 36500

Then save these four lines as android/keystore.properties, with Notepad as UTF-8 (not PowerShell's >).
Use forward slashes in storeFile, and the same password twice:

  storeFile=C:/Users/<you>/funancial-release.jks
  storePassword=<the password you typed>
  keyAlias=funancial
  keyPassword=<the password you typed>

Back up the key file and the password: without them friends cannot update (see docs/release.md).`;

/**
 * @typedef {{ versionCode: number, versionName: string, notes: string, apkUrl: string,
 *   sha256: string, size: number }} Latest
 */

/**
 * The version in the app's build.gradle.
 * @param {string} gradleText
 * @returns {{ code: number, name: string }}
 */
export function readVersion(gradleText) {
  const code = /^\s*versionCode\s*=?\s*(\d+)\s*$/m.exec(gradleText)?.[1];
  if (!code) throw new Error('Could not find versionCode in android/app/build.gradle.');
  const name = /^\s*versionName\s*=?\s*"([^"]+)"\s*$/m.exec(gradleText)?.[1];
  if (!name) throw new Error('Could not find versionName in android/app/build.gradle.');
  return { code: Number(code), name };
}

/**
 * Where a channel's APK and latest.json go, from the repo root.
 * @param {'live' | 'test'} channel
 */
export const releaseDir = (channel) =>
  channel === 'test' ? 'site/public/get/test' : 'site/public/get';

/**
 * Throws unless these are values latest.json may hold. The name ends up in a file name and a URL.
 * @param {{ code: number, name: string, notes: string }} meta
 * @returns {string} the trimmed notes
 */
function checkMeta({ code, name, notes }) {
  if (!Number.isInteger(code) || code < 1) {
    throw new Error(`versionCode must be a whole number above 0, not ${code}.`);
  }
  if (!/^[A-Za-z0-9._+-]{1,20}$/.test(name)) {
    throw new Error(`versionName must be 1 to 20 letters, digits or . _ + -, not "${name}".`);
  }
  const text = notes.trim();
  if (!text) throw new Error('Say what is new: pass --notes "<text>".');
  if (text.length > 500)
    throw new Error(`The notes are ${text.length} characters; 500 is the most.`);
  return text;
}

/**
 * The latest.json a release publishes.
 * @param {{ code: number, name: string, notes: string, origin: string, channel: 'live' | 'test',
 *   apkFile: string, sha256: string, size: number }} input
 * @returns {Latest}
 */
export function buildLatest({ code, name, notes, origin, channel, apkFile, sha256, size }) {
  const text = checkMeta({ code, name, notes });
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('sha256 must be 64 lower-case hex digits.');
  if (!Number.isInteger(size) || size < 1) throw new Error(`size must be above 0, not ${size}.`);
  const folder = channel === 'test' ? 'get/test' : 'get';
  return {
    versionCode: code,
    versionName: name,
    notes: text,
    apkUrl: `${origin}/${folder}/${apkFile}`,
    sha256,
    size,
  };
}

/**
 * Throws if `existing`, the latest.json already published, is not older than `code`.
 * @param {Latest | null} existing
 * @param {number} code
 * @param {string} [name] the new versionName, which must differ too: the banner says "Version {name}"
 */
export function refuseUnlessNewer(existing, code, name) {
  if (existing && existing.versionCode >= code) {
    throw new Error(`Version ${code} is not newer than the published ${existing.versionCode}.`);
  }
  if (existing && name !== undefined && existing.versionName === name) {
    throw new Error(`Version name ${name} is already published; raise versionName too.`);
  }
}

/**
 * The environment for a web build: with `updateUrl` a release build that checks for updates there,
 * without it a debug-safe build that never does, whatever the shell had set.
 * @param {Record<string, string | undefined>} base
 * @param {string} [updateUrl]
 */
export function webBuildEnv(base, updateUrl) {
  const { VITE_RELEASE: _release, VITE_UPDATE_URL: _url, ...rest } = base;
  return updateUrl ? { ...rest, VITE_RELEASE: '1', VITE_UPDATE_URL: updateUrl } : rest;
}

/**
 * The latest.json in `dir`, or null when there is none. A broken one stops the release: it would
 * hide what is published.
 * @param {string} dir
 * @returns {Latest | null}
 */
export function readLatest(dir) {
  const file = join(dir, 'latest.json');
  if (!existsSync(file)) return null;
  let latest;
  try {
    latest = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON. Fix or delete it.`);
  }
  if (!Number.isInteger(latest?.versionCode)) {
    throw new Error(`${file} has no versionCode. Fix or delete it.`);
  }
  return latest;
}

/**
 * Runs a command to the end with its output shown, or throws saying `what` failed. It throws rather
 * than exits so that `runThenRestore` still gets to run after a failed step.
 */
function run(what, command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw Object.assign(
      new Error(
        `${what} failed${result.error ? `: ${result.error.message}` : ''}. See the output above.`,
      ),
      { exitCode: result.status ?? 1 },
    );
  }
}

/**
 * Runs `steps`, then `restore` whether or not they threw. When `steps` threw, that failure is the
 * one reported: a `restore` that fails too only prints its message, so the step that went wrong
 * first is still the one named. When `steps` went well, a failing `restore` is reported.
 * @param {() => void} steps
 * @param {() => void} restore
 */
export function runThenRestore(steps, restore) {
  let done = false;
  try {
    steps();
    done = true;
  } finally {
    try {
      restore();
    } catch (error) {
      if (done) throw error;
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

function release() {
  const { values } = parseArgs({
    options: {
      notes: { type: 'string', default: '' },
      channel: { type: 'string', default: 'live' },
    },
  });
  const channel = values.channel;
  if (channel !== 'live' && channel !== 'test') fail('--channel must be "live" or "test".');

  if (!existsSync(join(ANDROID_DIR, 'keystore.properties'))) fail(KEYSTORE_HELP);
  const { code, name } = readVersion(
    readFileSync(join(ANDROID_DIR, 'app', 'build.gradle'), 'utf8'),
  );
  const notes = checkMeta({ code, name, notes: values.notes });
  const dir = join(ROOT, releaseDir(channel));
  refuseUnlessNewer(readLatest(dir), code, name);
  requireJava();

  const updateUrl = `${ORIGIN}/${channel === 'test' ? 'get/test' : 'get'}/latest.json`;
  const apkFile = `funcial-${name}.apk`;
  const done = `Built ${apkFile} (versionCode ${code}) for the ${channel} channel in ${releaseDir(channel)}.`;
  let sha256 = '';
  // From the first release-flagged build on, dist/ and the Android assets carry the release flags.
  // Whatever happens after that, they are rebuilt without them, so an install from Android Studio
  // on the owner's phone cannot carry the update check.
  runThenRestore(
    () => {
      // The shell runs npm (a .cmd file on Windows); .env.local still feeds the build its keys.
      const env = webBuildEnv(process.env, updateUrl);
      run('The web build', 'npm run build', [], { cwd: ROOT, shell: true, env });
      run('Copying the web build into the Android project', 'npx cap sync android', [], {
        cwd: ROOT,
        shell: true,
      });
      // Gradle writes to the same place every time. Without this, a build that fails to sign could
      // leave the last release's APK there to be picked up as this one.
      const built = join(
        ANDROID_DIR,
        'app',
        'build',
        'outputs',
        'apk',
        'release',
        'app-release.apk',
      );
      rmSync(built, { force: true });
      const gradle = gradleCommand(process.platform);
      run('The Gradle release build', gradle.command, [...gradle.args, 'assembleRelease'], {
        cwd: ANDROID_DIR,
      });

      if (!existsSync(built)) {
        throw new Error(
          `Gradle finished but ${built} is missing. Is the release build signed (keystore.properties)?`,
        );
      }
      mkdirSync(dir, { recursive: true });
      copyFileSync(built, join(dir, apkFile));
      const apk = readFileSync(join(dir, apkFile));
      sha256 = createHash('sha256').update(apk).digest('hex');
      // latest.json goes last, so it never names an APK that is not there yet.
      const latest = buildLatest({
        code,
        name,
        notes,
        origin: ORIGIN,
        channel,
        apkFile,
        sha256,
        size: apk.length,
      });
      writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
    },
    () => {
      const plain = webBuildEnv(process.env);
      run(
        `The plain web rebuild after the release build (run \`npm run android:sync\` before installing on your own phone)`,
        'npm run build',
        [],
        { cwd: ROOT, shell: true, env: plain },
      );
      run('Copying that plain web build into the Android project', 'npx cap sync android', [], {
        cwd: ROOT,
        shell: true,
      });
    },
  );

  console.log(
    `${done}\nsha256 ${sha256}\n` +
      'The web build and the Android assets were rebuilt without the release flags, so installs on your own phone never check for updates.\n' +
      "Nothing is deployed: see docs/release.md for that, after the owner's OK.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    release();
  } catch (error) {
    fail(
      error instanceof Error ? error.message : String(error),
      error instanceof Error && 'exitCode' in error ? Number(error.exitCode) : 1,
    );
  }
}
