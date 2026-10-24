/**
 * The colour maths the app needs at run time, which tests/unit/tokens.test.ts also does in its own
 * helpers: WCAG contrast and OKLab distance. They agree to the digits the tests pin, and a test holds
 * them to its values on pairs. Colours are the `#rgb`, `#rrggbb` and `rgb()` the tokens are written in;
 * anything else (a `var()` that has not resolved, a named colour) is unreadable, which is null.
 */

/** A colour's red, green and blue, 0-255. */
export type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/i;

/** The channels of a `#rgb`, `#rrggbb` or `rgb(r g b)` / `rgb(r, g, b)` colour, or null if it is none of these. */
export function parseColor(css: string): Rgb | null {
  const text = css.trim();
  const hex = HEX.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
  }
  const fn = RGB.exec(text);
  if (fn) {
    const channels = [fn[1], fn[2], fn[3]].map(Number);
    if (channels.every((c) => c >= 0 && c <= 255)) return channels as unknown as Rgb;
  }
  return null;
}

/** The colour as `#rrggbb`. */
export const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** One channel in linear light. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of two readable colours, 1 to 21. */
export function contrastOf(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour in OKLab, [L, a, b]. */
function oklab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)] as const;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** The distance of two readable colours in OKLab, times 100: how far apart the eye finds them. */
export function deltaEOf(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** WCAG contrast of two colours written as CSS, or null if either is unreadable. */
export function contrastRatio(a: string, b: string): number | null {
  const [x, y] = [parseColor(a), parseColor(b)];
  return x && y ? contrastOf(x, y) : null;
}

/** OKLab distance times 100 of two colours written as CSS, or null if either is unreadable. */
export function deltaE(a: string, b: string): number | null {
  const [x, y] = [parseColor(a), parseColor(b)];
  return x && y ? deltaEOf(x, y) : null;
}

/** The page's ink, for text on a light fill. It is the light theme's `--color-text`. */
const INK = '#0b0b12';
const WHITE = '#ffffff';
const BLACK = '#000000';

/**
 * The colour of text on `fill`, one that holds 4.5:1 on it: white, else the ink, else black. White
 * holds up to a luminance of about 0.183 and the ink from about 0.191, so a fill between them (a
 * mid grey) has neither; black holds on all of those (and the sweep in the test holds on every fill).
 * Null if the fill is unreadable.
 */
export function readableInk(fill: string): string | null {
  const rgb = parseColor(fill);
  if (!rgb) return null;
  return [WHITE, INK].find((ink) => contrastOf(parseColor(ink)!, rgb) >= 4.5) ?? BLACK;
}
