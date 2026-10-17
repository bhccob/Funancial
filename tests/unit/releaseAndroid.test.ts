import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLatest,
  KEYSTORE_HELP,
  readLatest,
  readVersion,
  refuseUnlessNewer,
  releaseDir,
  runThenRestore,
  webBuildEnv,
} from '../../scripts/release-android.mjs';
import { LatestSchema } from '../../src/domain/update';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const SHA = 'a'.repeat(63) + '0';
const input = {
  code: 8,
  name: '0.8',
  notes: 'First release for friends.',
  origin: 'https://funancial.vercel.app',
  channel: 'live' as const,
  apkFile: 'funancial-0.8.apk',
  sha256: SHA,
  size: 12_345_678,
};

describe('readVersion', () => {
  it('reads the version code and name from build.gradle', () => {
    const gradle = '    defaultConfig {\n        versionCode 8\n        versionName "0.8"\n    }';
    expect(readVersion(gradle)).toEqual({ code: 8, name: '0.8' });
  });

  it('reads the real build.gradle', () => {
    const { code, name } = readVersion(read('android/app/build.gradle'));
    expect(code).toBeGreaterThan(0);
    expect(name).not.toBe('');
  });

  it('throws on text with neither, or with only one', () => {
    expect(() => readVersion('apply plugin: "com.android.application"')).toThrow(/versionCode/);
    expect(() => readVersion('versionCode 8')).toThrow(/versionName/);
    expect(() => readVersion('versionName "0.8"')).toThrow(/versionCode/);
  });
});

describe('releaseDir', () => {
  it('is the live folder, or its test folder', () => {
    expect(releaseDir('live')).toBe('site/public/get');
    expect(releaseDir('test')).toBe('site/public/get/test');
  });
});

describe('buildLatest', () => {
  it('points live releases at /get and test releases at /get/test', () => {
    expect(buildLatest(input).apkUrl).toBe('https://funancial.vercel.app/get/funancial-0.8.apk');
    expect(buildLatest({ ...input, channel: 'test' }).apkUrl).toBe(
      'https://funancial.vercel.app/get/test/funancial-0.8.apk',
    );
  });

  it('has the fields latest.json promises, and no others', () => {
    const latest = buildLatest(input);
    expect(Object.keys(latest).sort()).toEqual(
      ['apkUrl', 'notes', 'sha256', 'size', 'versionCode', 'versionName'].sort(),
    );
    expect(latest).toMatchObject({
      versionCode: 8,
      versionName: '0.8',
      notes: 'First release for friends.',
      size: 12_345_678,
    });
    // Exactly what the app's own schema accepts, for both channels.
    expect(LatestSchema.parse(latest)).toEqual(latest);
    const test = buildLatest({ ...input, channel: 'test' });
    expect(LatestSchema.parse(test)).toEqual(test);
  });

  it('refuses empty notes, notes over 500 characters and a name over 20', () => {
    expect(() => buildLatest({ ...input, notes: '' })).toThrow(/notes/);
    expect(() => buildLatest({ ...input, notes: '  \n ' })).toThrow(/notes/);
    expect(() => buildLatest({ ...input, notes: 'x'.repeat(501) })).toThrow(/notes/);
    expect(buildLatest({ ...input, notes: 'x'.repeat(500) }).notes).toHaveLength(500);
    expect(() => buildLatest({ ...input, name: 'v'.repeat(21) })).toThrow(/versionName/);
    expect(buildLatest({ ...input, name: 'v'.repeat(20) }).versionName).toHaveLength(20);
  });

  it('refuses a version, hash or size the app could not use', () => {
    expect(() => buildLatest({ ...input, code: 0 })).toThrow(/versionCode/);
    expect(() => buildLatest({ ...input, sha256: SHA.toUpperCase() })).toThrow(/sha256/);
    expect(() => buildLatest({ ...input, size: 0 })).toThrow(/size/);
  });
});

describe('refuseUnlessNewer', () => {
  const published = buildLatest(input);

  it('lets the first release, and a higher version, through', () => {
    expect(() => refuseUnlessNewer(null, 8)).not.toThrow();
    expect(() => refuseUnlessNewer(published, 9)).not.toThrow();
  });

  it('refuses the same version and an older one', () => {
    const message = 'Version 8 is not newer than the published 8.';
    expect(() => refuseUnlessNewer(published, 8)).toThrow(message);
    expect(() => refuseUnlessNewer({ ...published, versionCode: 9 }, 8)).toThrow(
      'Version 8 is not newer than the published 9.',
    );
  });

  it('refuses a new version code that reuses the published version name', () => {
    // Friends would see "Version 0.8 is ready" while on 0.8.
    expect(() => refuseUnlessNewer(published, 9, '0.8')).toThrow(
      'Version name 0.8 is already published; raise versionName too.',
    );
    expect(() => refuseUnlessNewer(published, 9, '0.9')).not.toThrow();
    expect(() => refuseUnlessNewer(null, 9, '0.8')).not.toThrow();
    // The version code is checked first.
    expect(() => refuseUnlessNewer(published, 8, '0.8')).toThrow(/not newer than the published 8/);
  });
});

describe('webBuildEnv', () => {
  const base = { PATH: 'p', VITE_RELEASE: 'stray', VITE_UPDATE_URL: 'https://stray.example' };

  it('marks a release build and keeps the rest of the environment', () => {
    expect(webBuildEnv(base, 'https://funancial.vercel.app/get/latest.json')).toEqual({
      PATH: 'p',
      VITE_RELEASE: '1',
      VITE_UPDATE_URL: 'https://funancial.vercel.app/get/latest.json',
    });
  });

  it('leaves both flags out of the debug-safe build, even if the shell had them', () => {
    expect(webBuildEnv(base)).toEqual({ PATH: 'p' });
  });
});

describe('runThenRestore', () => {
  it('restores after the steps succeed', () => {
    const calls: string[] = [];
    runThenRestore(
      () => calls.push('steps'),
      () => calls.push('restore'),
    );
    expect(calls).toEqual(['steps', 'restore']);
  });

  it('restores when a step fails, and the failure of the step is the one reported', () => {
    const calls: string[] = [];
    const restore = () => calls.push('restore');
    expect(() =>
      runThenRestore(() => {
        calls.push('steps');
        throw new Error('The Gradle release build failed. See the output above.');
      }, restore),
    ).toThrow('The Gradle release build failed. See the output above.');
    expect(calls).toEqual(['steps', 'restore']);
  });

  it('does not let a restore that fails too hide the step that failed first', () => {
    const shown = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      runThenRestore(
        () => {
          throw new Error('The web build failed.');
        },
        () => {
          throw new Error('The plain web rebuild failed.');
        },
      ),
    ).toThrow('The web build failed.');
    expect(shown).toHaveBeenCalledWith('The plain web rebuild failed.');
    shown.mockRestore();
  });

  it('reports a restore that fails after the steps went well', () => {
    expect(() =>
      runThenRestore(
        () => {},
        () => {
          throw new Error('The plain web rebuild failed.');
        },
      ),
    ).toThrow('The plain web rebuild failed.');
  });
});

describe('the release flow', () => {
  // release() builds, spawns Gradle and exits the process, so its order is pinned from its source.
  const source = read('scripts/release-android.mjs');
  const flow = source.slice(source.indexOf('function release()'));
  const at = (text: string, from = 0) => {
    const index = flow.indexOf(text, from);
    expect(index, text).toBeGreaterThan(-1);
    return index;
  };

  it('puts every step that follows the release-flagged web build inside runThenRestore', () => {
    const wrapped = at('runThenRestore(');
    const web = at("run('The web build'");
    const gradle = at('assembleRelease');
    const latest = at("'latest.json'", gradle);
    const plain = at('webBuildEnv(process.env)', latest);
    expect(wrapped).toBeLessThan(web);
    expect(web).toBeLessThan(gradle);
    // The plain rebuild is the restore argument: after the steps, in the same call.
    expect(plain).toBeGreaterThan(latest);
    expect(flow.slice(plain)).toContain("'npx cap sync android'");
    // Nothing flagged runs before the wrapper starts.
    expect(flow.slice(0, wrapped)).not.toContain('The web build');
  });

  it('stops a step by throwing, since an exit would skip the restore', () => {
    const steps = flow.slice(at('runThenRestore('), at('webBuildEnv(process.env)'));
    expect(steps).not.toMatch(/\bfail\(/);
    const run = source.slice(
      source.indexOf('function run('),
      source.indexOf('export function runThenRestore'),
    );
    expect(run).toContain('throw');
    expect(run).not.toMatch(/\bfail\(/);
  });
});

describe('readLatest', () => {
  const dirs: string[] = [];
  const folder = (latest?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'funancial-latest-'));
    dirs.push(dir);
    if (latest !== undefined) writeFileSync(join(dir, 'latest.json'), latest);
    return dir;
  };
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true })));

  it('reads the published latest.json, or finds none', () => {
    expect(readLatest(folder())).toBeNull();
    expect(readLatest(folder(JSON.stringify(buildLatest(input))))).toEqual(buildLatest(input));
  });

  it('stops on one it cannot trust rather than letting a release overwrite it', () => {
    expect(() => readLatest(folder('{not json'))).toThrow(/not valid JSON/);
    expect(() => readLatest(folder('{"versionCode":"8"}'))).toThrow(/versionCode/);
  });
});

describe('the missing-key help', () => {
  it('gives the keytool command and the four properties, and asks for no password', () => {
    expect(KEYSTORE_HELP).toContain(
      String.raw`& "$env:JAVA_HOME\bin\keytool" -genkeypair -v -keystore "$env:USERPROFILE\funancial-release.jks" -alias funancial -keyalg RSA -keysize 4096 -validity 36500`,
    );
    expect(KEYSTORE_HELP).toContain('docs/android.md');
    for (const key of ['storeFile=', 'storePassword=<', 'keyAlias=funancial', 'keyPassword=<']) {
      expect(KEYSTORE_HELP).toContain(key);
    }
  });
});

describe('release signing', () => {
  const gradle = read('android/app/build.gradle');

  it('loads the release key from the git-ignored keystore.properties', () => {
    expect(gradle).toMatch(/signingConfigs\s*\{\s*release\s*\{/);
    expect(gradle).toContain('keystore.properties');
    for (const key of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
      expect(gradle).toContain(key);
    }
  });

  it('signs the release build type with it, only when the key file is complete', () => {
    expect(gradle).toMatch(
      /buildTypes\s*\{[\s\S]*release\s*\{\s*if \(keystoreProblem == null\) signingConfig signingConfigs\.release/,
    );
    expect(gradle).toMatch(
      /signingConfigs\s*\{\s*release\s*\{\s*if \(keystoreProblem == null\) \{\s*storeFile file\(/,
    );
  });

  it('works out why the key file cannot sign, instead of failing on it', () => {
    // A missing, unreadable (PowerShell UTF-16) or incomplete file must not stop a debug build.
    expect(gradle).toMatch(/def keystoreProblem = null/);
    expect(gradle).toMatch(/catch \(Exception e\)/);
    for (const key of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
      expect(gradle).toContain(`'${key}'`);
    }
  });

  it('fails only a release task, naming the file and the guide', () => {
    expect(gradle).toMatch(
      /gradle\.taskGraph\.whenReady[\s\S]*keystoreProblem != null[\s\S]*contains\('Release'\)[\s\S]*throw new GradleException/,
    );
    const message = /GradleException\("([^"]*)"/.exec(gradle)?.[1] ?? '';
    expect(message).toContain('android/keystore.properties');
    expect(message).toContain('docs/release.md');
  });

  it('never carries a password in the file', () => {
    expect(gradle).not.toMatch(/^\s*(storePassword|keyPassword)\s*=?\s*['"]/m);
  });
});

describe('.gitignore', () => {
  const lines = read('.gitignore')
    .split(/\r?\n/)
    .map((line) => line.trim());

  it.each([
    '*.jks',
    '*.keystore',
    'android/keystore.properties',
    'site-dist/',
    'site/public/get/*.apk',
    'site/public/get/**/latest.json',
  ])('keeps %s out of git', (pattern) => {
    expect(lines).toContain(pattern);
  });

  it('also keeps the test channel APKs out of git', () => {
    // site/public/get/*.apk stops at the folder, so the test channel needs its own line.
    expect(lines).toContain('site/public/get/**/*.apk');
  });
});
