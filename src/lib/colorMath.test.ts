import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE, parseColor, readableInk, toHex } from './colorMath';

describe('parseColor', () => {
  it('reads #rgb, #rrggbb and rgb() in both spellings, in any case', () => {
    expect(parseColor('#7c5cff')).toEqual([124, 92, 255]);
    expect(parseColor('#7C5CFF')).toEqual([124, 92, 255]);
    expect(parseColor('#fa0')).toEqual([255, 170, 0]);
    expect(parseColor(' rgb(11, 11, 18) ')).toEqual([11, 11, 18]);
    expect(parseColor('rgb(11 11 18)')).toEqual([11, 11, 18]);
    expect(parseColor('rgba(11 11 18)')).toEqual([11, 11, 18]);
  });

  it('is null for what it cannot read, so a caller can tell an unresolved colour', () => {
    for (const bad of ['', 'var(--color-chart-1)', 'red', '#12', '#1234567', 'rgb(300 0 0)']) {
      expect(parseColor(bad), bad).toBeNull();
    }
  });

  it('writes a colour back as #rrggbb', () => {
    expect(toHex([124, 92, 255])).toBe('#7c5cff');
    expect(toHex([0, 5, 10])).toBe('#00050a');
  });
});

describe('contrastRatio', () => {
  it('is WCAG 2 contrast: 21 for black on white, and the same either way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 10);
  });

  it("agrees with tokens.test.ts's helper on pairs", () => {
    // The values tokens.test.ts's `contrast` gives for the same pairs.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.5422, 3);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.4781, 3);
    expect(contrastRatio('#ffd400', '#eeeef0')).toBeCloseTo(1.2355, 3);
    expect(contrastRatio('#7c5cff', '#eeeef0')).toBeCloseTo(3.7508, 3);
  });

  it('is null when a colour cannot be read', () => {
    expect(contrastRatio('var(--color-bg)', '#ffffff')).toBeNull();
    expect(contrastRatio('#ffffff', '')).toBeNull();
  });
});

describe('deltaE', () => {
  it("is the OKLab distance times 100, as tokens.test.ts's helper measures it", () => {
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 4);
    expect(deltaE('#7c5cff', '#22c55e')).toBeCloseTo(41.1367, 3);
    expect(deltaE('#7c5cff', '#3b82f6')).toBeCloseTo(10.6517, 3);
    expect(deltaE('#e41e2b', '#c8102e')).toBeCloseTo(6.1675, 3);
  });

  it('is 0 for a colour and itself, the same either way round, and null for what it cannot read', () => {
    expect(deltaE('#3b82f6', '#3b82f6')).toBe(0);
    expect(deltaE('#3b82f6', '#14b8a6')).toBeCloseTo(deltaE('#14b8a6', '#3b82f6') ?? NaN, 10);
    expect(deltaE('var(--x)', '#3b82f6')).toBeNull();
  });
});

describe('readableInk', () => {
  /** What the ink and its fill hold, as the WCAG ratio. */
  const held = (fill: string) => contrastRatio(readableInk(fill)!, fill)!;

  it('is white on a navy fill and ink on a yellow one, each at 4.5:1 or better', () => {
    expect(readableInk('#0b1f4d')).toBe('#ffffff');
    expect(readableInk('#ffd400')).toBe('#0b0b12');
    expect(held('#0b1f4d')).toBeGreaterThanOrEqual(4.5);
    expect(held('#ffd400')).toBeGreaterThanOrEqual(4.5);
  });

  it('holds 4.5:1 on every grey and on a sweep of colours, even where white and the ink both fall short', () => {
    // White and the ink (#0b0b12) both give under 4.5:1 for a fill whose luminance is about 0.184 to
    // 0.19 (this grey is 4.42:1 and 4.44:1), so there it is black.
    const band = '#787878';
    expect(contrastRatio('#ffffff', band)!).toBeLessThan(4.5);
    expect(contrastRatio('#0b0b12', band)!).toBeLessThan(4.5);
    expect(readableInk(band)).toBe('#000000');
    for (let v = 0; v <= 255; v += 5) {
      expect(held(toHex([v, v, v])), `grey ${v}`).toBeGreaterThanOrEqual(4.5);
    }
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          expect(held(toHex([r, g, b])), `${r} ${g} ${b}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('is null for a fill it cannot read', () => {
    expect(readableInk('var(--color-chart-1)')).toBeNull();
  });
});
