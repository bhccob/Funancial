import { describe, expect, it } from 'vitest';
import {
  convertMinor,
  formatDecimal,
  formatMoney,
  isAmbiguousDecimal,
  minorDigits,
  parseDecimal,
  parseMoney,
} from './money';

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

describe('formatDecimal', () => {
  it.each([1.125, 12.345, 1.234, 0.0000001, 1000, 4.567, 0.5, 15, 0.1 + 0.2, 1234.567, 100])(
    'gives text that parseDecimal reads back as %d',
    (n) => {
      expect(parseDecimal(formatDecimal(n))).toBe(n);
    },
  );

  it('writes plain digits, with a zero where three decimals would be ambiguous', () => {
    expect(formatDecimal(1.125)).toBe('1.1250');
    expect(formatDecimal(12.345)).toBe('12.3450');
    expect(formatDecimal(1.234)).toBe('1.2340');
    // No exponent, no grouping, and nothing added where the text is already clear.
    expect(formatDecimal(0.0000001)).toBe('0.0000001');
    expect(formatDecimal(1000)).toBe('1000');
    expect(formatDecimal(1234.567)).toBe('1234.567');
    expect(formatDecimal(0.125)).toBe('0.125');
    expect(formatDecimal(15)).toBe('15');
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

describe('convertMinor', () => {
  it('converts euro cents to dollar cents at the rate', () => {
    expect(convertMinor(100_00, 'EUR', 'USD', 1.1)).toBe(110_00);
    expect(convertMinor(1, 'EUR', 'USD', 1.1)).toBe(1);
    expect(convertMinor(0, 'EUR', 'USD', 1.1)).toBe(0);
  });

  it('follows the decimals of both currencies', () => {
    // EUR 12.34 at 160 yen is 1974.4 yen, and yen have no minor units.
    expect(convertMinor(12_34, 'EUR', 'JPY', 160)).toBe(1974);
    // 1,000 yen at 0.00625 is EUR 6.25.
    expect(convertMinor(1000, 'JPY', 'EUR', 0.00625)).toBe(6_25);
    expect(convertMinor(5_00, 'EUR', 'USD', 1)).toBe(5_00);
    expect(convertMinor(5_00, 'USD', 'JPY', 1)).toBe(5);
  });

  it('rounds once, at the end', () => {
    // 0.01 euro at 150 yen is 1.5 yen: rounding the cent first or the yen first would give 0 or 1.
    expect(convertMinor(1, 'EUR', 'JPY', 150)).toBe(2);
    // 33.33 x 1.105 is 36.82965, so 36.83.
    expect(convertMinor(33_33, 'EUR', 'USD', 1.105)).toBe(36_83);
    // An exact half goes up.
    expect(convertMinor(15, 'EUR', 'USD', 1.5)).toBe(23);
    // A fractional amount, as a chart passes it, is rounded once too.
    expect(convertMinor(10_00.4, 'EUR', 'USD', 1.1)).toBe(11_00);
  });

  it('converts a loss like a gain, and never to -0', () => {
    expect(convertMinor(-100_00, 'EUR', 'USD', 1.1)).toBe(-110_00);
    expect(convertMinor(-12_34, 'EUR', 'JPY', 160)).toBe(-1974);
    expect(Object.is(convertMinor(-1, 'EUR', 'JPY', 0.1), 0)).toBe(true);
  });

  it('rounds an exact half the way Math.round does, for a loss too, and the same with no conversion', () => {
    // The money rule is Math.round: a half goes up, so -22.5 is -22 where 22.5 is 23.
    expect(convertMinor(15, 'EUR', 'USD', 1.5)).toBe(Math.round(22.5));
    expect(convertMinor(-15, 'EUR', 'USD', 1.5)).toBe(Math.round(-22.5));
    expect(convertMinor(-15, 'EUR', 'USD', 1.5)).toBe(-22);
    // Rate 1 between one currency and itself is the rounding alone.
    expect(convertMinor(-2.5, 'EUR', 'EUR', 1)).toBe(Math.round(-2.5));
    expect(convertMinor(2.5, 'EUR', 'EUR', 1)).toBe(3);
  });
});
