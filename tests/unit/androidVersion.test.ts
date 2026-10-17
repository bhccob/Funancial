import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');

describe('the Android app version', () => {
  it('is 7 for M7, so Android refuses any older Funancial APK over this one', () => {
    // An older build installed over newer data would drop settings it does not know on its next
    // write. Android only refuses an install whose versionCode is lower, so each milestone raises it.
    expect(gradle).toMatch(/^\s*versionCode 7$/m);
    expect(gradle).toMatch(/^\s*versionName "0\.7"$/m);
  });
});
