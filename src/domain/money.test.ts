import { describe, expect, it } from 'vitest';
import { formatMoney, isAmbiguousDecimal, minorDigits, parseDecimal, parseMoney } from './money';

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

describe('parseDecimal', () => {
  it.each([
    ['1000', 1000],
    ['2.5', 2.5],
    ['0,25', 0.25],
    ['.5', 0.5],
    [' 12 ', 12],
    ['1,234.5', 1234.5],
    ['1.234,5', 1234.5],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],
    ['1,234.567', 1234.567],
    ['0.125', 0.125],
    ['1234.567', 1234.567],
    ['1.0000', 1],
    ['0.00012345', 0.00012345],
  ])('parses %s → %d', (input, value) => {
    expect(parseDecimal(input)).toBe(value);
  });

  it.each(['1,000', '1.000', '12.345', '999,999', '100.000'])(
    'refuses %s: a thousand or a fraction, it could be 1000 times out',
    (input) => {
      expect(isAmbiguousDecimal(input)).toBe(true);
      expect(parseDecimal(input)).toBeNull();
    },
  );

  it.each([
    '',
    ' ',
    'abc',
    '-5',
    '1e3',
    '12.',
    ',',
    '1,23,4',
    '1.2.3,4',
    '1,2.3,4',
    '9'.repeat(400),
  ])('refuses %j', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });

  it('does not call a clear number ambiguous', () => {
    for (const input of ['0.125', '1,234.5', '2.5', '1234.567', '12,5', '1,2345']) {
      expect(isAmbiguousDecimal(input), input).toBe(false);
    }
  });
});

describe('formatMoney', () => {
  it('formats minor units for the currency', () => {
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56');
    expect(formatMoney(1234, 'JPY', 'en-US')).toBe('¥1,234');
    expect(formatMoney(-500, 'USD', 'en-US', { signDisplay: 'always' })).toBe('-$5.00');
    expect(formatMoney(500, 'USD', 'en-US', { signDisplay: 'always' })).toBe('+$5.00');
  });

  it('formats whole units', () => {
    expect(formatMoney(188436, 'USD', 'en-US', { whole: true })).toBe('$1,884');
    expect(formatMoney(-188436, 'USD', 'en-US', { whole: true })).toBe('-$1,884');
    expect(formatMoney(-500, 'USD', 'en-US', { whole: true, signDisplay: 'always' })).toBe('-$5');
    expect(formatMoney(1234, 'JPY', 'en-US', { whole: true })).toBe('¥1,234');
  });
});
