import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedLogoColor, logoColor, pickRingColors, pickSliceColor } from './logoColor';

type Pixel = readonly [number, number, number, number];

const SIDE = 24;

/** The RGBA bytes of a canvas that is `pixels` first and then `rest` (default transparent) to the end. */
function bytes(pixels: Pixel[], rest: Pixel = [0, 0, 0, 0]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let i = 0; i < SIDE * SIDE; i++) data.set(pixels[i] ?? rest, i * 4);
  return data;
}

/** `count` copies of `pixel`. */
const many = (count: number, pixel: Pixel): Pixel[] => Array.from({ length: count }, () => pixel);

/**
 * A `document` whose canvases read `read`: the bytes the drawn logo gives back, or an error that
 * reading throws (a tainted canvas), or no 2d context at all (null). Node has no DOM, so this is all
 * the sampling asks of one.
 */
function canvasGives(read: Uint8ClampedArray | Error | null) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => {
      if (read instanceof Error) throw read;
      return { data: read };
    }),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => (read === null ? null : context)) };
  const createElement = vi.fn(() => canvas);
  vi.stubGlobal('document', { createElement });
  return { context, canvas, createElement };
}

/** A logo that has loaded, as `<img>` shows it. */
const loaded = (src: string, naturalWidth = 64) =>
  ({ src, currentSrc: src, naturalWidth }) as unknown as HTMLImageElement;

afterEach(() => vi.unstubAllGlobals());

describe('logoColor', () => {
  it('is the colour most of the logo is, as #rrggbb, drawn on a small canvas', () => {
    const { context, canvas } = canvasGives(
      bytes([
        // Two shades of one red, the bulk of the logo: they average.
        ...many(200, [200, 30, 40, 255]),
        ...many(100, [202, 28, 42, 255]),
        ...many(120, [20, 40, 200, 255]),
        // Nor white, black or clear count.
        ...many(80, [255, 255, 255, 255]),
        ...many(40, [0, 0, 0, 255]),
      ]),
    );
    expect(logoColor(loaded('blob:red'))).toBe('#c91d29');
    expect(canvas.width).toBe(SIDE);
    expect(canvas.height).toBe(SIDE);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, SIDE, SIDE);
  });

  it('ignores near-white, near-black and transparent pixels, however many there are', () => {
    canvasGives(
      bytes([
        ...many(300, [250, 250, 250, 255]),
        ...many(100, [12, 10, 14, 255]),
        // Opaque in colour but see-through: a soft edge, not the logo.
        ...many(50, [10, 200, 10, 40]),
        ...many(10, [30, 120, 220, 255]),
      ]),
    );
    expect(logoColor(loaded('blob:rare'))).toBe('#1e78dc');
  });

  it('is null for a logo that is all white, black or clear', () => {
    canvasGives(bytes([...many(300, [255, 255, 255, 255]), ...many(100, [0, 0, 0, 255])]));
    expect(logoColor(loaded('blob:plain'))).toBeNull();
  });

  it('is null, not a throw, when the canvas is tainted by a logo from another origin', () => {
    canvasGives(new DOMException('The canvas has been tainted', 'SecurityError'));
    expect(logoColor(loaded('https://api.example/logo?symbol=KO'))).toBeNull();
  });

  it('is null when there is no 2d context to draw on', () => {
    canvasGives(null);
    expect(logoColor(loaded('blob:no-context'))).toBeNull();
  });

  it('is null, and tries again next time, for a logo that has not decoded', () => {
    const { createElement } = canvasGives(bytes(many(100, [20, 160, 60, 255])));
    expect(logoColor(loaded('blob:late', 0))).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
    expect(cachedLogoColor('blob:late')).toBeUndefined();
    expect(logoColor(loaded('blob:late'))).toBe('#14a03c');
  });

  it('samples a logo once: the same key answers from memory, whichever picture asks', () => {
    const { createElement } = canvasGives(bytes(many(100, [20, 160, 60, 255])));
    expect(cachedLogoColor('KO-once')).toBeUndefined();
    expect(logoColor(loaded('blob:one'), 'KO-once')).toBe('#14a03c');
    // A second picture of the same logo (another object URL) is not drawn again.
    expect(logoColor(loaded('blob:two'), 'KO-once')).toBe('#14a03c');
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(cachedLogoColor('KO-once')).toBe('#14a03c');
  });

  it('keeps a failure too: a logo that gave nothing is not drawn again', () => {
    const { createElement } = canvasGives(new DOMException('tainted', 'SecurityError'));
    expect(logoColor(loaded('blob:a'), 'taint-once')).toBeNull();
    expect(logoColor(loaded('blob:b'), 'taint-once')).toBeNull();
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(cachedLogoColor('taint-once')).toBeNull();
  });

  it('keys by the picture address when no key is given', () => {
    canvasGives(bytes(many(100, [20, 160, 60, 255])));
    logoColor(loaded('blob:by-address'));
    expect(cachedLogoColor('blob:by-address')).toBe('#14a03c');
  });
});

describe('pickSliceColor', () => {
  const FALLBACK = 'var(--color-chart-2)';
  const LIGHT_PAGE = '#eeeef0';
  const DARK_PAGE = '#0b0b10';

  it('takes the logo colour when it holds 3:1 on the page and stands apart from its neighbours', () => {
    expect(pickSliceColor('#0f3e99', FALLBACK, LIGHT_PAGE, ['#7c5cff', '#3b82f6'])).toBe('#0f3e99');
    expect(pickSliceColor('#ffd400', FALLBACK, DARK_PAGE, ['#7c5cff'])).toBe('#ffd400');
  });

  it('rejects a colour too light for the page, in the mode the page is in', () => {
    // Yellow is 1.2:1 on the light page and 13.7:1 on the dark one; navy is the other way round.
    expect(pickSliceColor('#ffd400', FALLBACK, LIGHT_PAGE, [])).toBe(FALLBACK);
    expect(pickSliceColor('#76b900', FALLBACK, LIGHT_PAGE, [])).toBe(FALLBACK);
    expect(pickSliceColor('#0f3e99', FALLBACK, DARK_PAGE, [])).toBe(FALLBACK);
  });

  it('rejects a colour closer than ΔE 15 (OKLab × 100) to a neighbour, and takes one that is 15 or more away', () => {
    // #e41e2b and #ec4899 are 13.7 apart; #c8102e and #ec4899 are 16.2.
    expect(pickSliceColor('#e41e2b', FALLBACK, LIGHT_PAGE, ['#7c5cff', '#ec4899'])).toBe(FALLBACK);
    expect(pickSliceColor('#c8102e', FALLBACK, LIGHT_PAGE, ['#7c5cff', '#ec4899'])).toBe('#c8102e');
    // One close neighbour is enough, whichever it is in the list.
    expect(pickSliceColor('#c8102e', FALLBACK, LIGHT_PAGE, ['#e41e2b', '#22c55e'])).toBe(FALLBACK);
  });

  it('keeps the chart colour when there is no logo colour (a logo that failed), or the page is unknown', () => {
    expect(pickSliceColor(null, FALLBACK, LIGHT_PAGE, [])).toBe(FALLBACK);
    expect(pickSliceColor('#0f3e99', FALLBACK, '', [])).toBe(FALLBACK);
    expect(pickSliceColor('#0f3e99', FALLBACK, 'var(--color-bg)', [])).toBe(FALLBACK);
  });

  it('keeps the logo colour against a neighbour it cannot read, which it cannot say is close', () => {
    expect(pickSliceColor('#0f3e99', FALLBACK, LIGHT_PAGE, ['var(--color-chart-1)'])).toBe(
      '#0f3e99',
    );
  });

  it('is exact at the edge: 3:1 passes and just under does not', () => {
    // #959595 is 2.995:1 on white and #949494 3.033:1.
    expect(pickSliceColor('#959595', FALLBACK, '#ffffff', [])).toBe(FALLBACK);
    expect(pickSliceColor('#949494', FALLBACK, '#ffffff', [])).toBe('#949494');
  });
});

describe('pickRingColors', () => {
  const CHART = ['#7c5cff', '#22c55e', '#3b82f6', '#ec4899'];
  const PAGE = '#eeeef0';

  it('gives every slice its chart colour when no logo gave a colour (logos that fail keep chart colours)', () => {
    expect(pickRingColors([null, null, null, null], CHART, PAGE)).toEqual(CHART);
    expect(pickRingColors([], [], PAGE)).toEqual([]);
  });

  it('mixes the two: a slice that passes takes its logo colour, one that does not keeps its chart colour', () => {
    // Navy passes; the light green of #76b900 (2.1:1) does not.
    expect(pickRingColors([null, '#76b900', '#0f3e99', null], CHART, PAGE)).toEqual([
      '#7c5cff',
      '#22c55e',
      '#0f3e99',
      '#ec4899',
    ]);
  });

  it("holds each slice apart from the neighbours' final colours, and from the next one's chart colour", () => {
    // #e41e2b is 13.7 from the pink chart colour of the slice before it (the ring wraps), so the
    // first keeps its chart colour; #c8102e after it is far enough from that, so the second takes its own.
    const picked = pickRingColors(['#e41e2b', '#c8102e', null, null], CHART, PAGE);
    expect(picked[0]).toBe('#7c5cff');
    expect(picked[1]).toBe('#c8102e');
    // The same two with the last chart colour changed to green: the first now takes #e41e2b, and the
    // second, 6.2 from a neighbour that took its logo colour, keeps its chart colour.
    const apart = pickRingColors(
      ['#e41e2b', '#c8102e', null, null],
      ['#7c5cff', '#22c55e', '#3b82f6', '#22c55e'],
      PAGE,
    );
    expect(apart[0]).toBe('#e41e2b');
    expect(apart[1]).toBe('#22c55e');
  });

  it('wraps: the last slice is held apart from the first', () => {
    const picked = pickRingColors(
      [null, null, null, '#c8102e'],
      ['#e41e2b', '#22c55e', '#3b82f6', '#ec4899'],
      PAGE,
    );
    // The first slice keeps its red chart colour, 6.2 from #c8102e.
    expect(picked).toEqual(['#e41e2b', '#22c55e', '#3b82f6', '#ec4899']);
  });

  it('has nothing to be close to with one slice, and two slices are each other’s neighbour', () => {
    expect(pickRingColors(['#0f3e99'], ['#7c5cff'], PAGE)).toEqual(['#0f3e99']);
    expect(pickRingColors(['#0f3e99', '#0f3e99'], ['#7c5cff', '#22c55e'], PAGE)).toEqual([
      '#0f3e99',
      '#22c55e',
    ]);
  });
});
