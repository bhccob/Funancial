import { describe, expect, it } from 'vitest';
import { formatMoney, minorDigits, parseMoney } from './money';

describe('minorDigits', () => {
  it('knows how many decimals a currency uses', () => {
    expect(minorDigits('USD')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
  });
});

describe('parseMoney', () => {
  it.each([
    ['12.50', 'USD', 1250],
    ['12,5', 'USD', 1250],
    ['1,234.56', 'USD', 123456],
    ['1.234,56', 'EUR', 123456],
    ['1,234', 'USD', 123400],
    ['1.234.567', 'EUR', 123456700],
    [' $ 12 ', 'USD', 1200],
    ['0.99', 'USD', 99],
    ['.5', 'USD', 50],
    ['¥1,234', 'JPY', 1234],
    ['1234', 'JPY', 1234],
  ])('parses %s %s → %d', (input, currency, minor) => {
    expect(parseMoney(input, currency)).toBe(minor);
  });

  it.each([
    ['', 'USD'],
    ['abc', 'USD'],
    ['-5', 'USD'],
    ['12.345', 'USD'],
    ['1,23,4', 'USD'],
    ['1e3', 'USD'],
    ['12.5', 'JPY'],
    ['1.2.3,4', 'EUR'],
    ['99999999999999', 'USD'],
  ])('rejects %s %s', (input, currency) => {
    expect(parseMoney(input, currency)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats minor units for the currency', () => {
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56');
    expect(formatMoney(1234, 'JPY', 'en-US')).toBe('¥1,234');
    expect(formatMoney(-500, 'USD', 'en-US', { signDisplay: 'always' })).toBe('-$5.00');
    expect(formatMoney(500, 'USD', 'en-US', { signDisplay: 'always' })).toBe('+$5.00');
  });
});
