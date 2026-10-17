import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = read('site/get/index.html');
// The same text however prettier broke the lines.
const text = page.replace(/\s+/g, ' ');
const manifest = read('android/app/src/main/AndroidManifest.xml');

describe('the page copy', () => {
  it.each([
    'A budget app that lives on your phone.',
    '01 · Home',
    'See what you can still spend.',
    'One number that already counts your bills, cards and limits.',
    '02 · Budget',
    'Limits that tap you on the shoulder.',
    'Warnings at 80%, 100% and 120%, before it gets out of hand.',
    '03 · Buy it?',
    'Ask before you buy.',
    'A meter weighs the purchase against your own numbers.',
    '04 · Levels',
    'Level up as you go.',
    'Badges, coins and quests for staying on track.',
    'Get it on your phone.',
    'Download for Android',
    'Scan with your Android phone',
    'Funancial is Android-only for now.',
    'Safe and simple',
    'Your money lives on your phone, encrypted. An account keeps a locked copy so you can move phones. The app\'s owner could unlock it, which is how "forgot password" brings your data back. No ads.',
    'Not financial advice.',
    'Tap Download, then open the file.',
    'If Android asks, allow your browser to install apps.',
    'Tap Install, open Funancial, and try demo money first.',
    'Turn on JavaScript to see the download button.',
    "Android asks before installing apps that don't come from the Play Store, and that's normal for an app shared between friends.",
    'to look up prices, to keep your locked copy if you have an account, and to check for a new version.',
    'It may wake the phone for a moment to show one.',
    'Older phones list this as a fingerprint permission.',
  ])('says %s', (line) => {
    expect(text).toContain(line);
  });

  it('no longer says the app stays on the phone, in the hero or the description', () => {
    expect(text).not.toMatch(/stays on your phone/i);
    expect(page).toContain(
      '<meta name="description" content="Funancial, a budget app that lives on your phone." />',
    );
  });

  it('keeps itself out of search engines', () => {
    expect(page).toMatch(/<meta name="robots" content="noindex/);
  });
});

describe('what the page says the app asks for', () => {
  // Added when Gradle merges the plugins' manifests into the app's (see
  // android/app/build/intermediates/merged_manifests), so they are not in our own file. The page
  // words them inside the reminders and unlock lines.
  const FROM_PLUGINS = ['WAKE_LOCK', 'USE_FINGERPRINT'];

  const declared = [...manifest.matchAll(/<uses-permission\s[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => !tag.includes('tools:node="remove"'))
    .map((tag) => /android\.permission\.(\w+)/.exec(tag)?.[1]);

  it('covers the permissions in the source AndroidManifest.xml and the two plugins add, and no other', () => {
    const listed = [...page.matchAll(/data-permission="([\w ]+)"/g)].flatMap(([, names]) =>
      names!.split(' '),
    );
    expect(declared.length).toBeGreaterThan(0);
    expect(listed.toSorted()).toEqual([...declared, ...FROM_PLUGINS].toSorted());
  });

  it('has the two plugin permissions where the plugins say so', () => {
    // The notifications plugin's own manifest declares the wake lock.
    expect(
      read('node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml'),
    ).toContain('android.permission.WAKE_LOCK');
    // The biometric plugin uses androidx.biometric, whose manifest declares USE_FINGERPRINT.
    expect(read('node_modules/@capgo/capacitor-native-biometric/android/build.gradle')).toContain(
      'androidx.biometric:biometric',
    );
  });
});
