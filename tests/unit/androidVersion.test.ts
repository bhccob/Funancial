import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');

describe('the Android app version', () => {
  it('is at least 7 (M7), so Android refuses any older Funcial APK over this one', () => {
    // An older build installed over newer data would drop settings it does not know on its next
    // write. Android only refuses an install whose versionCode is lower, so releases only raise it.
    const code = Number(/^\s*versionCode (\d+)$/m.exec(gradle)?.[1]);
    const name = /^\s*versionName "(\d+)\.(\d+)"$/m.exec(gradle);
    expect(code).toBeGreaterThanOrEqual(7);
    expect(name, 'versionName is "major.minor"').not.toBeNull();
    // The name follows the code: versionCode 8 is "0.8".
    expect(`${name?.[1]}.${name?.[2]}`).toBe(`0.${code}`);
  });
});
