import type { CapacitorConfig } from '@capacitor/cli';
import { describe, expect, it } from 'vitest';
import appConfig from '../../capacitor.config';

const config: CapacitorConfig = appConfig;

describe('capacitor.config', () => {
  it('keeps the native bridge from logging plugin calls and results, even in a debug build', () => {
    // With logging on, the bridge writes every plugin call and result to the WebView console and
    // logcat, and those include the biometric copy of the data key.
    expect(config.loggingBehavior).toBe('none');
    // A platform setting would override the global one.
    expect(config.android?.loggingBehavior ?? 'none').toBe('none');
  });
});
