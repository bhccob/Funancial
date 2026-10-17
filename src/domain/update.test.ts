import { describe, expect, it } from 'vitest';
import { LatestSchema, updateOffer, type Latest } from './update';

const latest: Latest = {
  versionCode: 9,
  versionName: '0.9',
  notes: 'A new look for the budget screen.',
  apkUrl: 'https://funancial.vercel.app/get/funancial-0.9.apk',
  sha256: 'a'.repeat(63) + '0',
  size: 12_345_678,
};

describe('updateOffer', () => {
  it('offers a newer version, and nothing for the same or an older one', () => {
    expect(updateOffer(latest, 8, null)).toBe(latest);
    expect(updateOffer(latest, 9, null)).toBeNull();
    expect(updateOffer(latest, 10, null)).toBeNull();
  });

  it('stays quiet about a version the person hid', () => {
    expect(updateOffer(latest, 8, 9)).toBeNull();
  });

  it('offers a newer version than the one the person hid', () => {
    expect(updateOffer(latest, 8, 7)).toBe(latest);
    expect(updateOffer({ ...latest, versionCode: 10 }, 8, 9)).toMatchObject({ versionCode: 10 });
  });
});

describe('LatestSchema', () => {
  it('accepts what the release script writes, for both channels', () => {
    expect(LatestSchema.parse(latest)).toEqual(latest);
    const test = { ...latest, apkUrl: 'https://funancial.vercel.app/get/test/funancial-0.9.apk' };
    expect(LatestSchema.parse(test)).toEqual(test);
  });

  it('drops unknown fields instead of failing, so a later release can add one', () => {
    expect(LatestSchema.parse({ ...latest, channel: 'live' })).toEqual(latest);
  });

  it.each([
    ['text', 'latest'],
    ['null', null],
    ['an array', [latest]],
  ])('rejects %s in place of the object', (_, body) => {
    expect(LatestSchema.safeParse(body).success).toBe(false);
  });

  it.each(['versionCode', 'versionName', 'notes', 'apkUrl', 'sha256', 'size'] as const)(
    'rejects a missing %s',
    (field) => {
      const missing: Partial<Latest> = { ...latest };
      delete missing[field];
      expect(LatestSchema.safeParse(missing).success).toBe(false);
    },
  );

  it.each([
    ['a string versionCode', { versionCode: '9' }],
    ['a zero versionCode', { versionCode: 0 }],
    ['a negative versionCode', { versionCode: -1 }],
    ['a fractional versionCode', { versionCode: 9.5 }],
    ['an infinite versionCode', { versionCode: Infinity }],
    ['a null versionCode', { versionCode: null }],
    ['a numeric versionName', { versionName: 9 }],
    ['an empty versionName', { versionName: '' }],
    ['a versionName over 20 characters', { versionName: 'v'.repeat(21) }],
    ['a versionName with markup', { versionName: '<b>9</b>' }],
    ['empty notes', { notes: '' }],
    ['blank notes', { notes: '  \n ' }],
    ['notes over 500 characters', { notes: 'x'.repeat(501) }],
    ['notes that are not text', { notes: ['new'] }],
    ['an apkUrl that is not a URL', { apkUrl: 'funancial-0.9.apk' }],
    ['a javascript: apkUrl', { apkUrl: 'javascript:alert(1)' }],
    ['a file: apkUrl', { apkUrl: 'file:///sdcard/funancial.apk' }],
    ['a sha256 in capitals', { sha256: 'A'.repeat(64) }],
    ['a sha256 that is too short', { sha256: 'a'.repeat(63) }],
    ['a zero size', { size: 0 }],
    ['a string size', { size: '12' }],
  ])('rejects %s', (_, bad) => {
    expect(LatestSchema.safeParse({ ...latest, ...bad }).success).toBe(false);
  });

  it('accepts the longest notes and name the release script allows', () => {
    const limits = { notes: 'x'.repeat(500), versionName: 'v'.repeat(20) };
    expect(LatestSchema.safeParse({ ...latest, ...limits }).success).toBe(true);
  });
});
