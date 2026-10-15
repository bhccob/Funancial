import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync(
  new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);

/** The `<uses-permission>` element that names `permission`, or undefined. */
const declaration = (permission: string) =>
  manifest.match(new RegExp(`<uses-permission[^>]*android.permission.${permission}"[^>]*>`))?.[0];

describe('AndroidManifest', () => {
  it('asks for no exact-alarm permission, though the notifications plugin declares one', () => {
    // Reminders are inexact alarms. Removing the plugin's declaration keeps the permission out
    // of the merged manifest, so the app never has to justify it or send anyone to its screen.
    expect(declaration('SCHEDULE_EXACT_ALARM')).toContain('tools:node="remove"');
    expect(declaration('USE_EXACT_ALARM')).toBeUndefined();
  });

  it('can show reminders, and put them back after a restart', () => {
    expect(declaration('POST_NOTIFICATIONS')).toBeDefined();
    expect(declaration('RECEIVE_BOOT_COMPLETED')).toBeDefined();
  });
});
