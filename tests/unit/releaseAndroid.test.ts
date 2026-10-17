import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLatest,
  KEYSTORE_HELP,
  readLatest,
  readVersion,
  refuseUnlessNewer,
  releaseDir,
} from '../../scripts/release-android.mjs';

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
    expect(latest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(latest.size).toBeGreaterThan(0);
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
      String.raw`keytool -genkeypair -v -keystore C:\Users\<you>\funancial-release.jks -alias funancial -keyalg RSA -keysize 4096 -validity 36500`,
    );
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

  it('signs the release build type with it', () => {
    expect(gradle).toMatch(
      /buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.release/,
    );
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
