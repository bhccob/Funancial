import { describe, expect, it } from 'vitest';
import { currencyOptions, defaultCurrency } from './currencies';

describe('defaultCurrency', () => {
  it('reads the time zone first: Amsterdam is EUR even on an English (US) phone', () => {
    expect(defaultCurrency('Europe/Amsterdam', 'en-US')).toBe('EUR');
  });

  it('knows London, and every Australian zone', () => {
    expect(defaultCurrency('Europe/London', 'en-US')).toBe('GBP');
    expect(defaultCurrency('Australia/Perth', 'en-US')).toBe('AUD');
    expect(defaultCurrency('Australia/Lord_Howe', undefined)).toBe('AUD');
  });

  it('knows the other zones in the list', () => {
    expect(defaultCurrency('Asia/Nicosia', undefined)).toBe('EUR');
    expect(defaultCurrency('Europe/Zurich', undefined)).toBe('CHF');
    expect(defaultCurrency('Asia/Kolkata', undefined)).toBe('INR');
    expect(defaultCurrency('America/Vancouver', undefined)).toBe('CAD');
    expect(defaultCurrency('Pacific/Honolulu', undefined)).toBe('USD');
  });

  it('falls back to the language region when the zone is unknown', () => {
    expect(defaultCurrency('Mars/Olympus', 'nl-NL')).toBe('EUR');
    expect(defaultCurrency(undefined, 'en-GB')).toBe('GBP');
    // A bare language is widened to its likeliest region first.
    expect(defaultCurrency(undefined, 'nl')).toBe('EUR');
  });

  it('is USD for an unknown zone with en-US, and when both are unknown', () => {
    expect(defaultCurrency('Mars/Olympus', 'en-US')).toBe('USD');
    expect(defaultCurrency('Mars/Olympus', 'xx-YY')).toBe('USD');
    expect(defaultCurrency(undefined, undefined)).toBe('USD');
  });

  it('survives a locale it cannot parse', () => {
    expect(defaultCurrency(undefined, 'not a locale')).toBe('USD');
    expect(defaultCurrency('', '')).toBe('USD');
  });

  it('always names a currency the picker offers', () => {
    const offered = currencyOptions().map((o) => o.value);
    for (const zone of ['Europe/Amsterdam', 'Europe/Stockholm', 'Asia/Singapore', 'Mars/Olympus']) {
      expect(offered).toContain(defaultCurrency(zone, undefined));
    }
  });
});
