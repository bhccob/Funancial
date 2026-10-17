import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = read('site/get/index.html');
const manifest = read('android/app/src/main/AndroidManifest.xml');

describe('the page copy', () => {
  it.each([
    'A budget app that stays on your phone.',
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
    'Your money stays on your phone, encrypted. No account, no ads.',
    'Not financial advice.',
    'Tap Download, then open the file.',
    'If Android asks, allow your browser to install apps.',
    'Tap Install, open Funancial, and try demo money first.',
  ])('says %s', (text) => {
    expect(page).toContain(text);
  });

  it('keeps itself out of search engines', () => {
    expect(page).toMatch(/<meta name="robots" content="noindex/);
  });
});

describe('what the app asks for', () => {
  const declared = [...manifest.matchAll(/<uses-permission\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => !tag.includes('tools:node="remove"'))
    .map((tag) => /android\.permission\.(\w+)/.exec(tag)?.[1]);

  it('has an entry on the page for each permission in AndroidManifest.xml, and no other', () => {
    const listed = [...page.matchAll(/data-permission="(\w+)"/g)].map(([, name]) => name);
    expect(declared.length).toBeGreaterThan(0);
    expect(listed.toSorted()).toEqual(declared.toSorted());
  });
});
