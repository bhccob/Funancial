import { contrastOf, deltaEOf, parseColor, toHex } from './colorMath';

/** The side of the canvas a logo is drawn on to be sampled: a few hundred pixels are plenty. */
const SIDE = 24;
/** A pixel with every channel at or over this is near-white: a logo's backing, not its colour. */
const NEAR_WHITE = 235;
/** A pixel with every channel at or under this is near-black: its outline or lettering. */
const NEAR_BLACK = 25;
/** A pixel less opaque than this (of 255) is the soft edge of a shape, not the shape. */
const MIN_ALPHA = 128;

/** What a slice takes from a logo must hold this much contrast against the page (a UI mark, WCAG 1.4.11). */
const MIN_CONTRAST = 3;
/** And be at least this far (OKLab × 100, as tests/unit/tokens.test.ts measures the chart series) from each neighbour. */
const MIN_APART = 15;

/** Each logo's colour, by key: null where it has none. A logo is drawn once per session. */
const sampled = new Map<string, string | null>();

/** What `logoColor` found for `key` (null: nothing usable), or undefined if it has not been asked. */
export const cachedLogoColor = (key: string): string | null | undefined => sampled.get(key);

/** The colour most of these RGBA bytes are, as #rrggbb, not counting white, black or clear pixels. */
function dominant(data: Uint8ClampedArray): string | null {
  // Pixels fall into buckets of 16 levels a channel, so a shade and its anti-aliasing vote together;
  // the winning bucket is the average of the pixels in it.
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < MIN_ALPHA) continue;
    if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) continue;
    if (r <= NEAR_BLACK && g <= NEAR_BLACK && b <= NEAR_BLACK) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const bucket of buckets.values()) if (!best || bucket.count > best.count) best = bucket;
  return best ? toHex([best.r / best.count, best.g / best.count, best.b / best.count]) : null;
}

/** Draws the logo small and reads its dominant colour, or null on anything that goes wrong. */
function sample(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = SIDE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(img, 0, 0, SIDE, SIDE);
    // A picture from another origin that did not ask for CORS taints the canvas, and this throws a
    // SecurityError. The app's logos are blob URLs of its own origin (see CompanyLogo), so they do not.
    return dominant(context.getImageData(0, 0, SIDE, SIDE).data);
  } catch {
    return null;
  }
}

/**
 * The logo's dominant colour as #rrggbb: sampled on a small canvas, leaving out near-white,
 * near-black and transparent pixels. Null if there is none, or if it cannot be read (a tainted
 * canvas). The answer, null included, is kept under `key` (the logo's symbol, else the picture's
 * address), so a logo is drawn once however many pictures show it. A picture that has not decoded
 * yet answers null and is not kept, so asking again once it has works.
 */
export function logoColor(img: HTMLImageElement, key = img.currentSrc || img.src): string | null {
  const known = sampled.get(key);
  if (known !== undefined) return known;
  if (!img.naturalWidth) return null;
  const color = sample(img);
  sampled.set(key, color);
  return color;
}

/**
 * The colour of a slice that wants `sampled` (a logo's colour): it, if it holds 3:1 against `page`
 * and is at least ΔE 15 from each of `neighbours`; else `fallback`, its chart colour. Colours are
 * written as #rrggbb or rgb(). A `page` that is unreadable, or no `sampled`, gives `fallback`; a
 * neighbour that is unreadable cannot be said to be close and is skipped.
 */
export function pickSliceColor(
  sampled: string | null,
  fallback: string,
  page: string,
  neighbours: readonly string[],
): string {
  const color = sampled === null ? null : parseColor(sampled);
  const ground = parseColor(page);
  if (!color || !ground || contrastOf(color, ground) < MIN_CONTRAST) return fallback;
  for (const neighbour of neighbours) {
    const other = parseColor(neighbour);
    if (other && deltaEOf(color, other) < MIN_APART) return fallback;
  }
  return sampled!;
}

/**
 * The colour of every slice of a ring, in order: each slice's `sampled` colour where
 * `pickSliceColor` takes it, else its chart colour from `fallbacks`. Each slice is held apart from
 * the one before it and the one after it, the last from the first. A neighbour already settled
 * counts as the colour it took; one still to come counts as its chart colour, so a slice that falls
 * back never lands close to a logo colour beside it.
 */
export function pickRingColors(
  sampled: ReadonlyArray<string | null | undefined>,
  fallbacks: readonly string[],
  page: string,
): string[] {
  const count = fallbacks.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const colorOf = (j: number) => (j < i ? picked[j]! : fallbacks[j]!);
    const neighbours =
      count > 1 ? [colorOf((i + count - 1) % count), colorOf((i + 1) % count)] : [];
    picked.push(pickSliceColor(sampled[i] ?? null, fallbacks[i]!, page, neighbours));
  }
  return picked;
}
